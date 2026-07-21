import "server-only";

import { db } from "@/lib/db";

// Pet leveling (equipped pet only). Tuning locked 2026-07-19: BALANCED pace, BIG (5×) max passive.
//  - The equipped pet earns PET_XP_SHARE of every XP the member gains, plus PET_TRICKLE_PER_DAY over time.
//  - 5 levels; each level multiplies the pet's base passive by the level number (Lv1 ×1 … Lv5 ×5).
export const PET_MAX_LEVEL = 5;
// Re-tuned 2026-07-21 — leveling was far too fast (a Lv3 pet off ~1.4k lifetime XP). Cut the member-XP
// share and (especially) the free daily trickle so a maxed pet is a real, earned milestone. Thresholds are
// unchanged so nobody loses a level they already have; only the pace slows going forward.
export const PET_XP_SHARE = 0.12; // 12% of member XP flows to the equipped pet (was 25%)
export const PET_TRICKLE_PER_DAY = 5; // passive XP/day while equipped — the big "free maxing" lever (was 20)

// Cumulative pet-XP needed to REACH each level (index 0 = Lv1). Lv5 caps at 1500.
export const PET_LEVEL_THRESHOLDS = [0, 100, 300, 700, 1500];
export const PET_MAX_XP = PET_LEVEL_THRESHOLDS[PET_MAX_LEVEL - 1];

const DAY_MS = 86400000;

// Level (1..5) for a given pet-XP total.
export function petLevelForXp(xp) {
    const n = Math.max(0, Number(xp) || 0);
    let lvl = 1;
    for (let i = 1; i < PET_LEVEL_THRESHOLDS.length; i += 1) {
        if (n >= PET_LEVEL_THRESHOLDS[i]) lvl = i + 1;
    }
    return Math.min(PET_MAX_LEVEL, lvl);
}

// A displayable progress snapshot for a pet-XP total: level, the multiplier it grants, and progress toward
// the next level (null once maxed).
export function petLevelInfo(xp) {
    const n = Math.max(0, Number(xp) || 0);
    const level = petLevelForXp(n);
    const mult = level; // Lv1 ×1 … Lv5 ×5
    if (level >= PET_MAX_LEVEL) return { xp: n, level, mult, maxed: true, into: 0, span: 0, next: null };
    const floor = PET_LEVEL_THRESHOLDS[level - 1];
    const next = PET_LEVEL_THRESHOLDS[level];
    return { xp: n, level, mult, maxed: false, into: n - floor, span: next - floor, next };
}

// Map pet_id -> xp for one member (rows that exist; missing pets are implicitly Lv1 / 0 xp).
export async function getPetXpMap(buyerId) {
    if (!buyerId) return {};
    const rows = await db.query(`SELECT pet_id, xp FROM mkt_pet_level WHERE buyer_id = $1`, [buyerId]).catch(() => []);
    return Object.fromEntries(rows.map((r) => [r.pet_id, Number(r.xp) || 0]));
}

// Map buyer_id -> { pet_id: xp } for the whole pack (one query), for boss sizing.
export async function getPetXpForBuyers() {
    const rows = await db.query(`SELECT buyer_id, pet_id, xp FROM mkt_pet_level`).catch(() => []);
    const out = new Map();
    for (const r of rows) {
        if (!out.has(r.buyer_id)) out.set(r.buyer_id, {});
        out.get(r.buyer_id)[r.pet_id] = Number(r.xp) || 0;
    }
    return out;
}

// Level map (pet_id -> level) from an xp map — what combinePetBonuses wants for passive scaling.
export function levelsFromXpMap(xpMap = {}) {
    const out = {};
    for (const [petId, xp] of Object.entries(xpMap)) out[petId] = petLevelForXp(xp);
    return out;
}

// Add a FLAT amount of XP to the member's equipped pet (capped). Returns { ok, petId, xp, level, leveled }
// or { ok: false }. Used by pet-feed consumables (full amount) and, via creditEquippedPetXp, the XP share.
export async function addEquippedPetXp(buyerId, amount) {
    const add = Math.round(Number(amount) || 0);
    if (!buyerId || add <= 0) return { ok: false };
    const buyer = await db.queryOne(`SELECT featured_collectible FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    const petId = buyer?.featured_collectible;
    if (!petId) return { ok: false, error: "no_pet_equipped" };
    const before = await db.queryOne(`SELECT xp FROM mkt_pet_level WHERE buyer_id = $1 AND pet_id = $2`, [buyerId, petId]).catch(() => null);
    const prevLevel = petLevelForXp(before?.xp || 0);
    const row = await db
        .queryOne(
            `INSERT INTO mkt_pet_level (buyer_id, pet_id, xp, last_tick_at, updated_at)
             VALUES ($1, $2, LEAST($3, ${PET_MAX_XP}), NOW(), NOW())
             ON CONFLICT (buyer_id, pet_id)
             DO UPDATE SET xp = LEAST(mkt_pet_level.xp + $3, ${PET_MAX_XP}), updated_at = NOW()
             RETURNING xp`,
            [buyerId, petId, add]
        )
        .catch(() => null);
    const xp = row?.xp ?? (before?.xp || 0) + add;
    const level = petLevelForXp(xp);
    return { ok: true, petId, xp, level, leveled: level > prevLevel };
}

// Instantly bump the equipped pet to the start of its next level (for a rare "instant level" consumable).
export async function levelUpEquippedPet(buyerId) {
    if (!buyerId) return { ok: false };
    const buyer = await db.queryOne(`SELECT featured_collectible FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    const petId = buyer?.featured_collectible;
    if (!petId) return { ok: false, error: "no_pet_equipped" };
    const row = await db.queryOne(`SELECT xp FROM mkt_pet_level WHERE buyer_id = $1 AND pet_id = $2`, [buyerId, petId]).catch(() => null);
    const level = petLevelForXp(row?.xp || 0);
    if (level >= PET_MAX_LEVEL) return { ok: false, error: "already_max", petId, level };
    const targetXp = PET_LEVEL_THRESHOLDS[level]; // xp needed to reach the next level
    await db
        .query(
            `INSERT INTO mkt_pet_level (buyer_id, pet_id, xp, last_tick_at, updated_at) VALUES ($1, $2, $3, NOW(), NOW())
             ON CONFLICT (buyer_id, pet_id) DO UPDATE SET xp = GREATEST(mkt_pet_level.xp, $3), updated_at = NOW()`,
            [buyerId, petId, targetXp]
        )
        .catch(() => {});
    return { ok: true, petId, level: level + 1, leveled: true };
}

// Credit the member's EQUIPPED pet its share (25%) of an XP award. Best-effort. Called from awardXp so every
// XP the member earns trickles into their active pet.
export async function creditEquippedPetXp(buyerId, memberXp) {
    const share = Math.round((Number(memberXp) || 0) * PET_XP_SHARE);
    if (share <= 0) return;
    await addEquippedPetXp(buyerId, share).catch(() => {});
}

// Lazy time-trickle for the equipped pet: add PET_TRICKLE_PER_DAY worth of XP for the time elapsed since the
// clock last advanced, carrying the sub-XP remainder so frequent reads don't lose progress. No cron — this
// runs on pet-state reads and on equip/unequip. Only the featured pet accrues.
export async function accrueEquippedPetTrickle(buyerId) {
    if (!buyerId) return;
    const buyer = await db.queryOne(`SELECT featured_collectible FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    const petId = buyer?.featured_collectible;
    if (!petId) return;
    const row = await db.queryOne(`SELECT xp, last_tick_at FROM mkt_pet_level WHERE buyer_id = $1 AND pet_id = $2`, [buyerId, petId]).catch(() => null);
    if (!row) {
        // First time we see this equipped pet — start its clock, no XP yet.
        await db
            .query(`INSERT INTO mkt_pet_level (buyer_id, pet_id, xp, last_tick_at, updated_at) VALUES ($1, $2, 0, NOW(), NOW()) ON CONFLICT (buyer_id, pet_id) DO UPDATE SET last_tick_at = COALESCE(mkt_pet_level.last_tick_at, NOW())`, [buyerId, petId])
            .catch(() => {});
        return;
    }
    if ((Number(row.xp) || 0) >= PET_MAX_XP) return; // capped — stop trickling
    if (!row.last_tick_at) {
        await db.query(`UPDATE mkt_pet_level SET last_tick_at = NOW() WHERE buyer_id = $1 AND pet_id = $2`, [buyerId, petId]).catch(() => {});
        return;
    }
    const lastTick = new Date(row.last_tick_at).getTime();
    const elapsedMs = Date.now() - lastTick;
    if (elapsedMs <= 0) return;
    const gained = Math.floor((elapsedMs / DAY_MS) * PET_TRICKLE_PER_DAY);
    if (gained <= 0) return; // not enough time for a whole XP yet — leave the clock so the remainder carries
    const newXp = Math.min(PET_MAX_XP, (Number(row.xp) || 0) + gained);
    // Advance the clock by only the consumed time so the leftover fraction keeps accumulating.
    const consumedMs = (gained / PET_TRICKLE_PER_DAY) * DAY_MS;
    const newTick = new Date(lastTick + consumedMs);
    await db
        .query(`UPDATE mkt_pet_level SET xp = $3, last_tick_at = $4, updated_at = NOW() WHERE buyer_id = $1 AND pet_id = $2`, [buyerId, petId, newXp, newTick])
        .catch(() => {});
}

// Start/restart the trickle clock for a newly-equipped pet (called from equipPet).
export async function startPetTrickleClock(buyerId, petId) {
    if (!buyerId || !petId) return;
    await db
        .query(
            `INSERT INTO mkt_pet_level (buyer_id, pet_id, xp, last_tick_at, updated_at) VALUES ($1, $2, 0, NOW(), NOW())
             ON CONFLICT (buyer_id, pet_id) DO UPDATE SET last_tick_at = NOW(), updated_at = NOW()`,
            [buyerId, petId]
        )
        .catch(() => {});
}
