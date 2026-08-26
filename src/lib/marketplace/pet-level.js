import "server-only";

import { db } from "@/lib/db";
import { collectibleById } from "@/lib/marketplace/collectibles.js";
import { getEquippedUtilTotals } from "@/lib/marketplace/item-affix.js";
import { hasPower } from "@/lib/marketplace/ascension-powers.js";
import { trackActivity } from "@/lib/marketplace/activity.js";

// Pet leveling (equipped pet only). Re-tuned 2026-07-21:
//  - The equipped pet earns PET_XP_SHARE of every XP the member gains, plus PET_TRICKLE_PER_DAY over time.
//  - Cut the share + (especially) the free daily trickle so a maxed pet is a real, earned milestone.
//  - The required XP per level is a QUADRATIC ramp SCALED BY RARITY — a rarer pet is a much longer haul.
// ── SIX, NOT FIVE (2026-08-10) ────────────────────────────────────────────────────────────────────────────
// Level 6 exists so a pet can be ENSHRINED — see pet-ascension.js. The whole point is to answer the way people
// were actually playing: swapping pets all day to borrow each one's active ability for the one thing it was
// good at. A pet you take to 6 and enshrine keeps its active FOREVER, equipped or not, so you can stop.
//
// NOTHING IS REVOKED. Every reward that counts a "maxed" pet tests `>= 5` (badges' pets_maxed, the Runebound
// Drake's 25 maxed pets, the Radiant Phoenix's legendary-at-max) and a level-6 pet still satisfies `>= 5`.
// Raising the ceiling cannot take a badge back off anybody, and that was checked rather than assumed.
export const PET_MAX_LEVEL = 6;
export const PET_XP_SHARE = 0.12; // 12% of member XP flows to the equipped pet (was 25%)
export const PET_TRICKLE_PER_DAY = 5; // passive XP/day while equipped — the big "free maxing" lever (was 20)

// Base quadratic ramp: reach Lv L ≈ 750·(L-1)² XP. Multiplied per rarity below.
//
// RAISED 5x ON 2026-08-07, because the ramp was nowhere near the intent. A mythic pet was meant to be about a
// month of consistent play; the first member to max a legendary did it in SEVEN AND A HALF DAYS, averaging 710
// pet XP a day, and walked away with the Radiant Phoenix — a mythic that exists to mark exactly that
// achievement. At that pace the old ramp put a common pet at three days and an eternal at fifteen.
//
// At 5x and the same measured pace: common 17 days, epic 29, legendary 37, mythic 47. The chase is a chase.
//
// NOBODY WAS DE-LEVELLED. Because the new thresholds are exactly 5x the old ones at every level, multiplying
// each pet's stored XP by 5 preserves both the level AND the fraction of progress toward the next one:
// xp >= T is equivalent to 5xp >= 5T, and (xp−T[L])/(T[L+1]−T[L]) is unchanged when both parts are scaled.
// Migration 341 does exactly that, once. Anyone mid-bar stayed mid-bar at the same percentage.
// Levels 1-5 are the old quadratic, untouched. LEVEL SIX IS NOT ON THAT CURVE: quadratic would have put it at
// 18,750, a mere 1.6x the level-5 total, which is a weekend rather than a commitment. It is 2.5x the level-5
// threshold instead, and because the whole ramp is multiplied by rarity, a rarer pet is a proportionally
// longer haul exactly as it already was — the thing Luke asked for and the thing the curve already did.
//
// At the measured pace of a dedicated player (~710 pet XP a day, and ONLY the equipped pet earns):
//   common  30,000  ~42 days      legendary  66,000  ~93 days
//   epic    51,000  ~72 days      mythic     84,000  ~118 days
// That is the price of never having to swap that pet in again, and it is meant to read as a decision about
// which ONE pet you are marrying rather than a box to tick on all of them.
const PET_BASE_THRESHOLDS = [0, 750, 3000, 6750, 12000, 30000];
export const PET_XP_RARITY_MULT = { common: 1, rare: 1.3, epic: 1.7, legendary: 2.2, mythic: 2.8, ascendant: 3.6, eternal: 4.6, celestial: 5.8, primordial: 7 };
export function petRarityMult(rarity) { return PET_XP_RARITY_MULT[rarity] || 1; }
function rarityOf(petId) { return collectibleById(petId)?.rarity; }

// Cumulative pet-XP to REACH each level for a rarity (index 0 = Lv1).
export function petThresholds(rarity) {
    const m = petRarityMult(rarity);
    return PET_BASE_THRESHOLDS.map((t) => Math.round(t * m));
}
export function petMaxXp(rarity) { return petThresholds(rarity)[PET_MAX_LEVEL - 1]; }
// The level-5 total, which is what every "maxed pet" reward in the game has always meant and still means.
export const PET_ASCEND_LEVEL = 6;
export function petFullyGrownXp(rarity) { return petThresholds(rarity)[4]; }

// The level-scaling mults live in collectibles.js (pure, client-safe); re-exported here for server callers.
export { petActiveLevelMult, petPassiveLevelMult } from "@/lib/marketplace/collectibles.js";

const DAY_MS = 86400000;

// Level (1..6) for a pet-XP total. Pass the pet's RARITY (or its id) so the right rarity curve is used.
export function petLevelForXp(xp, rarity = "common") {
    const th = petThresholds(rarity);
    const n = Math.max(0, Number(xp) || 0);
    let lvl = 1;
    for (let i = 1; i < th.length; i += 1) {
        if (n >= th[i]) lvl = i + 1;
    }
    return Math.min(PET_MAX_LEVEL, lvl);
}

// A displayable progress snapshot for a pet-XP total (rarity-aware): level + progress toward the next level.
export function petLevelInfo(xp, rarity = "common") {
    const th = petThresholds(rarity);
    const n = Math.max(0, Number(xp) || 0);
    const level = petLevelForXp(n, rarity);
    const mult = level;
    if (level >= PET_MAX_LEVEL) return { xp: n, level, mult, maxed: true, into: 0, span: 0, next: null };
    const floor = th[level - 1];
    const next = th[level];
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
    for (const [petId, xp] of Object.entries(xpMap)) out[petId] = petLevelForXp(xp, rarityOf(petId));
    return out;
}

// Add a FLAT amount of XP to the member's equipped pet (capped). Returns { ok, petId, xp, level, leveled }
// or { ok: false }. Used by pet-feed consumables (full amount) and, via creditEquippedPetXp, the XP share.
/**
 * ── WHICH PETS EARN ──────────────────────────────────────────────────────────────────────────────────────
 * Your featured pet, plus the three on the Petting Stand. ONE definition, because there were three: the
 * character-XP share looped the stand, the passive trickle looped the stand, and this — the path the FARM and
 * the boss pay through — credited the featured pet alone. So a stand pet earned from levelling up and from
 * sitting still, and earned nothing at all from the farm, which is the Den's single biggest pet-XP engine.
 *
 * Luke: "all 3 should get every source of exp on the equipped pet, farming, character exp, and the passive
 * trickle." Every source now means every source, because every source asks the same function.
 *
 * The featured pet is FIRST in the list on purpose — callers that report one result report that one.
 */
export async function earningPetIds(buyerId) {
    if (!buyerId) return [];
    const buyer = await db.queryOne(`SELECT featured_collectible FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    const featured = buyer?.featured_collectible || null;
    // Returns [] when no stand is placed, so this costs one indexed lookup for the members who own none.
    const { standPetIds } = await import("@/lib/marketplace/petting-stand.js");
    const stand = await standPetIds(buyerId).catch(() => []);
    // A pet can be BOTH featured and seated. Paying it twice would make the stand a duplication glitch.
    return [...new Set([featured, ...stand].filter(Boolean))];
}

export async function addEquippedPetXp(buyerId, amount) {
    if (!buyerId) return { ok: false };
    const ids = await earningPetIds(buyerId);
    if (!ids.length) return { ok: false, error: "no_pet_equipped" };
    // The featured pet's result is what comes back, so the farm's "your pet grew" line still names the animal
    // the member thinks of as theirs. The stand pets are credited on the same call, silently.
    let first = null;
    for (const petId of ids) {
        const r = await addPetXpById(buyerId, petId, amount).catch(() => null);
        if (!first) first = r;
    }
    return first || { ok: false };
}

// The same grant against a NAMED pet rather than whichever is equipped. Extracted so the Petting Stand can
// credit the three animals standing on it through the identical path — the cap, the Pet Bond attunement and
// the level-up detection are the parts that must not be reimplemented, because a second copy of them is how a
// stand pet would quietly level on different rules from an equipped one.
export async function addPetXpById(buyerId, petId, amount) {
    let add = Math.round(Number(amount) || 0);
    if (!buyerId || !petId || add <= 0) return { ok: false };
    // Pet Bond forge attunement on equipped gear boosts ALL pet XP gains.
    const petBond = (await getEquippedUtilTotals(buyerId).catch(() => ({ petXp: 0 }))).petXp || 0;
    if (petBond > 0) add = Math.round(add * (1 + petBond / 100));
    const rarity = rarityOf(petId);
    const maxXp = petMaxXp(rarity);
    const before = await db.queryOne(`SELECT xp FROM mkt_pet_level WHERE buyer_id = $1 AND pet_id = $2`, [buyerId, petId]).catch(() => null);
    const prevLevel = petLevelForXp(before?.xp || 0, rarity);
    const row = await db
        .queryOne(
            // The ::int casts are REQUIRED. LEAST($3, $4) with two JS-number params gives Postgres nothing to
            // infer from, so it types them TEXT and the insert dies on the integer xp column with 42804 —
            // "column xp is of type integer but expression is of type text". farm.js already carries the casts;
            // this copy never got them, so every pet-XP grant that came through here failed.
            //
            // The failure was invisible because the .catch below falls back to a COMPUTED xp, so the caller was
            // told ok:true with a plausible new level while nothing was written. Pets appeared to gain XP and
            // silently reset on the next read.
            `INSERT INTO mkt_pet_level (buyer_id, pet_id, xp, last_tick_at, updated_at)
             VALUES ($1, $2, LEAST($3::int, $4::int), NOW(), NOW())
             ON CONFLICT (buyer_id, pet_id)
             DO UPDATE SET xp = LEAST(mkt_pet_level.xp + $3::int, $4::int), updated_at = NOW()
             RETURNING xp`,
            [buyerId, petId, add, maxXp]
        )
        .catch(() => null);
    const xp = row?.xp ?? Math.min(maxXp, (before?.xp || 0) + add);
    const level = petLevelForXp(xp, rarity);
    return { ok: true, petId, xp, level, leveled: level > prevLevel };
}

// Instantly bump the equipped pet to the start of its next level (for a rare "instant level" consumable).
export async function levelUpEquippedPet(buyerId) {
    if (!buyerId) return { ok: false };
    const buyer = await db.queryOne(`SELECT featured_collectible FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    const petId = buyer?.featured_collectible;
    if (!petId) return { ok: false, error: "no_pet_equipped" };
    const rarity = rarityOf(petId);
    const row = await db.queryOne(`SELECT xp FROM mkt_pet_level WHERE buyer_id = $1 AND pet_id = $2`, [buyerId, petId]).catch(() => null);
    const level = petLevelForXp(row?.xp || 0, rarity);
    if (level >= PET_MAX_LEVEL) return { ok: false, error: "already_max", petId, level };
    const targetXp = petThresholds(rarity)[level]; // xp needed to reach the next level
    await db
        .query(
            `INSERT INTO mkt_pet_level (buyer_id, pet_id, xp, last_tick_at, updated_at) VALUES ($1, $2, $3, NOW(), NOW())
             ON CONFLICT (buyer_id, pet_id) DO UPDATE SET xp = GREATEST(mkt_pet_level.xp, $3), updated_at = NOW()`,
            [buyerId, petId, targetXp]
        )
        .catch(() => {});
    await trackActivity(buyerId, "pet_level_up", { petId, level: level + 1, rarity, equipped: true }).catch(() => {});
    return { ok: true, petId, level: level + 1, leveled: true };
}

// Add pet-XP to a SPECIFIC pet (not necessarily equipped) — used by treats fed to a chosen pet on the farm.
// Caller is responsible for verifying ownership. (buyer_id is TEXT; params cast ::int to avoid text coercion.)
export async function addPetXp(buyerId, petId, amount) {
    const add = Math.round(Number(amount) || 0);
    if (!buyerId || !petId || add <= 0) return { ok: false };
    const rarity = rarityOf(petId);
    const maxXp = petMaxXp(rarity);
    const before = await db.queryOne(`SELECT xp FROM mkt_pet_level WHERE buyer_id = $1::text AND pet_id = $2`, [buyerId, petId]).catch(() => null);
    const prevLevel = petLevelForXp(before?.xp || 0, rarity);
    const row = await db
        .queryOne(
            `INSERT INTO mkt_pet_level (buyer_id, pet_id, xp, last_tick_at, updated_at)
             VALUES ($1::text, $2, LEAST($3::int, $4::int), NOW(), NOW())
             ON CONFLICT (buyer_id, pet_id)
             DO UPDATE SET xp = LEAST(mkt_pet_level.xp + $3::int, $4::int), updated_at = NOW()
             RETURNING xp`,
            [buyerId, petId, add, maxXp]
        )
        .catch(() => null);
    const xp = row?.xp ?? Math.min(maxXp, (before?.xp || 0) + add);
    const level = petLevelForXp(xp, rarity);
    return { ok: true, petId, xp, level, leveled: level > prevLevel };
}

// Instantly bump a SPECIFIC pet to the start of its next level (for the "instant level" treat).
export async function levelUpPet(buyerId, petId) {
    if (!buyerId || !petId) return { ok: false };
    const rarity = rarityOf(petId);
    const row = await db.queryOne(`SELECT xp FROM mkt_pet_level WHERE buyer_id = $1::text AND pet_id = $2`, [buyerId, petId]).catch(() => null);
    const level = petLevelForXp(row?.xp || 0, rarity);
    if (level >= PET_MAX_LEVEL) return { ok: false, error: "already_max", petId, level };
    const targetXp = petThresholds(rarity)[level];
    await db
        .query(
            `INSERT INTO mkt_pet_level (buyer_id, pet_id, xp, last_tick_at, updated_at) VALUES ($1::text, $2, $3::int, NOW(), NOW())
             ON CONFLICT (buyer_id, pet_id) DO UPDATE SET xp = GREATEST(mkt_pet_level.xp, $3::int), updated_at = NOW()`,
            [buyerId, petId, targetXp]
        )
        .catch(() => {});
    await trackActivity(buyerId, "pet_level_up", { petId, level: level + 1, rarity, equipped: false }).catch(() => {});
    return { ok: true, petId, level: level + 1, leveled: true };
}

// Credit the member's EQUIPPED pet its share (25%) of an XP award. Best-effort. Called from awardXp so every
// XP the member earns trickles into their active pet.
export async function creditEquippedPetXp(buyerId, memberXp) {
    // The Long Vigil triples the share. Applied to the SHARE rather than to the pet's XP after the fact, so a
    // level-up fires on the same call that earned it instead of on the next read.
    const vigil = await hasPower(buyerId, "long_vigil");
    const share = Math.round((Number(memberXp) || 0) * PET_XP_SHARE * (vigil ? 3 : 1));
    if (share <= 0) return;
    // Every earning pet takes the SAME share, not a fraction — the package promises "passive XP just like
    // your equipped pet" and a discount here would make that a half-truth. addEquippedPetXp walks them all.
    await addEquippedPetXp(buyerId, share).catch(() => {});
}

// Lazy time-trickle for the equipped pet: add PET_TRICKLE_PER_DAY worth of XP for the time elapsed since the
// clock last advanced, carrying the sub-XP remainder so frequent reads don't lose progress. No cron — this
// runs on pet-state reads and on equip/unequip. Only the featured pet accrues.
export async function accrueEquippedPetTrickle(buyerId) {
    if (!buyerId) return;
    // Each earning pet runs its own clock off its own mkt_pet_level.last_tick_at, which is why the stand
    // needed no timestamp of its own. Reseating one restarts only that pet's clock.
    for (const id of await earningPetIds(buyerId)) await accruePetTrickle(buyerId, id).catch(() => {});
}

async function accruePetTrickle(buyerId, petId) {
    if (!buyerId || !petId) return;
    const maxXp = petMaxXp(rarityOf(petId));
    const row = await db.queryOne(`SELECT xp, last_tick_at FROM mkt_pet_level WHERE buyer_id = $1 AND pet_id = $2`, [buyerId, petId]).catch(() => null);
    if (!row) {
        // First time we see this equipped pet — start its clock, no XP yet.
        await db
            .query(`INSERT INTO mkt_pet_level (buyer_id, pet_id, xp, last_tick_at, updated_at) VALUES ($1, $2, 0, NOW(), NOW()) ON CONFLICT (buyer_id, pet_id) DO UPDATE SET last_tick_at = COALESCE(mkt_pet_level.last_tick_at, NOW())`, [buyerId, petId])
            .catch(() => {});
        return;
    }
    if ((Number(row.xp) || 0) >= maxXp) return; // capped — stop trickling
    if (!row.last_tick_at) {
        await db.query(`UPDATE mkt_pet_level SET last_tick_at = NOW() WHERE buyer_id = $1 AND pet_id = $2`, [buyerId, petId]).catch(() => {});
        return;
    }
    const lastTick = new Date(row.last_tick_at).getTime();
    const elapsedMs = Date.now() - lastTick;
    if (elapsedMs <= 0) return;
    const gained = Math.floor((elapsedMs / DAY_MS) * PET_TRICKLE_PER_DAY);
    if (gained <= 0) return; // not enough time for a whole XP yet — leave the clock so the remainder carries
    const newXp = Math.min(maxXp, (Number(row.xp) || 0) + gained);
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
