import "server-only";

import { db } from "@/lib/db";
import { levelForXp } from "@/lib/marketplace/xp.js";
import { COLLECTIBLES, collectibleById, isCollectibleUnlocked, petPassive, petPrice } from "@/lib/marketplace/collectibles.js";
import { getPetXpMap, petLevelInfo, accrueEquippedPetTrickle, startPetTrickleClock } from "@/lib/marketplace/pet-level.js";
import { getPetSpriteData, getPetSpriteLevelData, pickPetSpriteForLevel } from "@/lib/marketplace/pet-sprite.js";
import { getMemberMetrics } from "@/lib/marketplace/badges.js";
import { bumpQuestProgress } from "@/lib/marketplace/quests.js";
import { memberPetPerks } from "@/lib/marketplace/pet-redemption.js";
import { trackActivity } from "@/lib/marketplace/activity.js";

const nameOf = (r) => r?.display_name || r?.alias || "Member";

// Achievement pets → the metric rule that grants them (checked lazily when the pet state loads).
const ACHIEVEMENT_PET_RULES = {
    ladybug: (m) => m.wishlist >= 1,
    bee: (m) => m.claimedQuests >= 10,
    sloth: (m) => m.activeDays >= 14,
    beaver: (m) => m.bountiesPosted >= 5,
    raccoon: (m) => m.tradeCount >= 5,
    flamingo: (m) => m.friends >= 10,
    toucan: (m) => m.bountiesWon >= 3,
    // Pet-LEVELING achievement pets.
    spirit_fox: (m) => (m.petLevelsTotal || 0) >= 10,
    runebound_drake: (m) => (m.petsMaxed || 0) >= 5,
    radiant_phoenix: (m) => Boolean(m.maxedLegendaryPlus),
};

// Grant any achievement pets the member has newly qualified for. Best-effort; returns newly-granted ids.
export async function syncPetAchievements(buyerId) {
    if (!buyerId) return [];
    const [metrics, questRow, ownedRows] = await Promise.all([
        getMemberMetrics(buyerId).catch(() => null),
        db.queryOne(`SELECT COUNT(*)::int AS n FROM mkt_daily_quest WHERE buyer_id = $1 AND claimed_at IS NOT NULL`, [buyerId]).catch(() => null),
        db.query(`SELECT ref FROM mkt_cosmetic_unlock WHERE buyer_id = $1 AND category = 'pet'`, [buyerId]).catch(() => []),
    ]);
    if (!metrics) return [];
    const m = { ...metrics, claimedQuests: questRow?.n || 0 };
    const owned = new Set(ownedRows.map((r) => r.ref));
    const granted = [];
    for (const [petId, rule] of Object.entries(ACHIEVEMENT_PET_RULES)) {
        if (owned.has(petId)) continue;
        let ok = false;
        try { ok = rule(m); } catch { ok = false; }
        if (!ok) continue;
        const ins = await db.query(`INSERT INTO mkt_cosmetic_unlock (buyer_id, category, ref) VALUES ($1, 'pet', $2) ON CONFLICT DO NOTHING RETURNING ref`, [buyerId, petId]).catch(() => []);
        if (ins.length) granted.push(petId);
    }
    return granted;
}

// The member's full pet state. With { sync: true } it first grants any due achievement pets (used on page
// load); action paths skip the sync to stay cheap.
export async function petsState(buyerId, { sync = false } = {}) {
    if (!buyerId) return { ownedIds: [], tradeableIds: [], featured: null, level: 1, gold: 0, passiveTotal: 0, signedIn: false, incoming: [], petLevels: {} };
    if (sync) {
        await syncPetAchievements(buyerId).catch(() => {});
        // Settle the equipped pet's time-trickle so the level shown on the page is current (lazy, no cron).
        await accrueEquippedPetTrickle(buyerId).catch(() => {});
    }
    const [buyer, rows, incoming, realWorld, petXp] = await Promise.all([
        db.queryOne(`SELECT COALESCE(xp,0) AS xp, COALESCE(gold,0) AS gold, featured_collectible FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null),
        db.query(`SELECT ref, tradeable FROM mkt_cosmetic_unlock WHERE buyer_id = $1 AND category = 'pet'`, [buyerId]).catch(() => []),
        incomingShares(buyerId).catch(() => []),
        memberPetPerks(buyerId).catch(() => []),
        getPetXpMap(buyerId).catch(() => ({})),
    ]);
    const level = levelForXp(buyer?.xp || 0).level;
    const granted = new Set(rows.map((r) => r.ref));
    const lockedRefs = new Set(rows.filter((r) => r.tradeable === false).map((r) => r.ref));
    const ownedIds = [];
    const tradeableIds = [];
    const passiveTotals = {}; // stat -> summed passive across all owned pets (each scaled by its pet level)
    const petLevels = {}; // pet_id -> { level, xp, into, span, next, maxed, stat, base, value } for owned pets
    for (const pet of COLLECTIBLES) {
        if (!isCollectibleUnlocked(pet, level, { owned: granted })) continue;
        ownedIds.push(pet.id);
        const p = petPassive(pet);
        const info = petLevelInfo(petXp[pet.id] || 0);
        // Passive scales with the pet's level (Lv1 ×1 … Lv5 ×5).
        passiveTotals[p.stat] = (passiveTotals[p.stat] || 0) + p.value * info.level;
        petLevels[pet.id] = { level: info.level, xp: info.xp, into: info.into, span: info.span, next: info.next, maxed: info.maxed, stat: p.stat, base: p.value, value: p.value * info.level };
        // Tradeable unless an explicit unlock row has locked it (level pets with no row are still tradeable).
        if (!lockedRefs.has(pet.id)) tradeableIds.push(pet.id);
    }
    // Real-world perk redemption state, keyed by pet id, for owned marquee pets.
    const realWorldByPet = Object.fromEntries((realWorld || []).map((r) => [r.petId, { reward: r.reward, available: r.available, cooldownUntil: r.cooldownUntil }]));
    // The battle-sprite art for each owned pet at each level 1–5 (resolved: highest evolved sprite ≤ level,
    // else base). Powers the pets-page sprite display + the level-up "evolution" reveal. Only on page loads.
    const petSprites = {};
    if (sync) {
        const [base, levelArt] = await Promise.all([getPetSpriteData().catch(() => ({})), getPetSpriteLevelData().catch(() => ({}))]);
        for (const petId of ownedIds) {
            const perLevel = {};
            for (let n = 1; n <= 5; n += 1) {
                const a = pickPetSpriteForLevel(base[petId], levelArt[petId], n);
                perLevel[n] = a?.url ? { url: a.url, flip: a.flip === true } : null;
            }
            petSprites[petId] = perLevel;
        }
    }
    return { ownedIds, tradeableIds, featured: buyer?.featured_collectible || null, level, gold: buyer?.gold || 0, passiveTotals, signedIn: true, incoming, realWorld: realWorldByPet, petLevels, petSprites };
}

export async function equipPet(buyerId, petId) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const pet = collectibleById(petId);
    if (!pet) return { ok: false, error: "not_found" };
    const state = await petsState(buyerId);
    if (!state.ownedIds.includes(petId)) return { ok: false, error: "not_owned" };
    // Settle the currently-equipped pet's trickle before swapping, then start the new pet's clock.
    await accrueEquippedPetTrickle(buyerId).catch(() => {});
    await db.query(`UPDATE mkt_buyer SET featured_collectible = $2, updated_at = NOW() WHERE id = $1`, [buyerId, petId]).catch(() => {});
    await startPetTrickleClock(buyerId, petId).catch(() => {});
    await bumpQuestProgress(buyerId, "equip", 1).catch(() => {});
    await trackActivity(buyerId, "equip_pet", { petId });
    return { ok: true };
}

export async function unequipPet(buyerId) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    // Settle the equipped pet's trickle before it stops accruing.
    await accrueEquippedPetTrickle(buyerId).catch(() => {});
    await db.query(`UPDATE mkt_buyer SET featured_collectible = NULL, updated_at = NOW() WHERE id = $1`, [buyerId]).catch(() => {});
    return { ok: true };
}

export async function buyPet(buyerId, petId) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const pet = collectibleById(petId);
    if (!pet || pet.source !== "shop") return { ok: false, error: "not_for_sale" };
    const already = await db.queryOne(`SELECT 1 FROM mkt_cosmetic_unlock WHERE buyer_id = $1 AND category = 'pet' AND ref = $2`, [buyerId, petId]).catch(() => null);
    if (already) return { ok: false, error: "already_owned" };
    const price = petPrice(pet);
    const deducted = await db.queryOne(`UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`, [buyerId, price]).catch(() => null);
    if (!deducted) return { ok: false, error: "not_enough_gold" };
    await db.query(`INSERT INTO mkt_cosmetic_unlock (buyer_id, category, ref) VALUES ($1, 'pet', $2) ON CONFLICT DO NOTHING`, [buyerId, petId]).catch(() => {});
    await trackActivity(buyerId, "buy_pet", { petId, price });
    return { ok: true, gold: deducted.gold };
}

// ── Trading (share a copy, lock both) ──────────────────────────────────────────────────────────────

async function resolveByAlias(alias) {
    const clean = String(alias || "").trim().replace(/^@/, "");
    if (!clean) return null;
    return db.queryOne(`SELECT id, display_name, alias FROM mkt_buyer WHERE LOWER(alias) = LOWER($1)`, [clean]).catch(() => null);
}

// Offer a copy of one of your (tradeable) pets to a member by @handle. They must accept to receive it.
export async function sharePet(fromId, petId, toAlias) {
    if (!fromId) return { ok: false, error: "not_signed_in" };
    const pet = collectibleById(petId);
    if (!pet) return { ok: false, error: "not_found" };
    const state = await petsState(fromId);
    if (!state.ownedIds.includes(petId)) return { ok: false, error: "not_owned" };
    if (!state.tradeableIds.includes(petId)) return { ok: false, error: "not_tradeable" };
    const to = await resolveByAlias(toAlias);
    if (!to) return { ok: false, error: "recipient_not_found" };
    if (to.id === fromId) return { ok: false, error: "cannot_share_self" };
    const dupe = await db.queryOne(`SELECT 1 FROM mkt_pet_share WHERE pet_id = $1 AND from_buyer_id = $2 AND to_buyer_id = $3 AND status = 'pending'`, [petId, fromId, to.id]).catch(() => null);
    if (dupe) return { ok: false, error: "already_pending" };
    await db.query(`INSERT INTO mkt_pet_share (pet_id, from_buyer_id, to_buyer_id) VALUES ($1, $2, $3)`, [petId, fromId, to.id]).catch(() => {});
    await trackActivity(fromId, "pet_share_offer", { petId, to: to.id });
    return { ok: true, to: nameOf(to) };
}

// Pending pet gifts waiting for this member to accept.
export async function incomingShares(buyerId) {
    if (!buyerId) return [];
    const rows = await db
        .query(
            `SELECT s.id, s.pet_id, s.created_at, b.display_name, b.alias
               FROM mkt_pet_share s JOIN mkt_buyer b ON b.id = s.from_buyer_id
              WHERE s.to_buyer_id = $1 AND s.status = 'pending' ORDER BY s.created_at DESC`,
            [buyerId]
        )
        .catch(() => []);
    return rows.map((r) => {
        const pet = collectibleById(r.pet_id);
        return { id: r.id, petId: r.pet_id, petName: pet?.name || r.pet_id, from: nameOf(r), fromAlias: r.alias || null, at: r.created_at ? new Date(r.created_at).toISOString() : null };
    });
}

// Accept a pet gift: grant the recipient a NON-tradeable copy and lock the giver's original too. Guarded
// status flip so it can only happen once.
export async function acceptShare(shareId, toId) {
    if (!toId) return { ok: false, error: "not_signed_in" };
    const flipped = await db
        .queryOne(`UPDATE mkt_pet_share SET status = 'accepted', resolved_at = NOW() WHERE id = $1 AND to_buyer_id = $2 AND status = 'pending' RETURNING pet_id, from_buyer_id`, [shareId, toId])
        .catch(() => null);
    if (!flipped) return { ok: false, error: "not_pending" };
    const petId = flipped.pet_id;
    const fromId = flipped.from_buyer_id;
    // Lock the giver's original (materialize a row for level pets), and grant the recipient a locked copy.
    await db.query(
        `INSERT INTO mkt_cosmetic_unlock (buyer_id, category, ref, tradeable) VALUES ($1, 'pet', $2, FALSE)
         ON CONFLICT (buyer_id, category, ref) DO UPDATE SET tradeable = FALSE`,
        [fromId, petId]
    ).catch(() => {});
    await db.query(
        `INSERT INTO mkt_cosmetic_unlock (buyer_id, category, ref, tradeable) VALUES ($1, 'pet', $2, FALSE)
         ON CONFLICT (buyer_id, category, ref) DO UPDATE SET tradeable = FALSE`,
        [toId, petId]
    ).catch(() => {});
    await trackActivity(toId, "pet_share_accept", { petId, from: fromId });
    return { ok: true, petId };
}

export async function declineShare(shareId, toId) {
    if (!toId) return { ok: false, error: "not_signed_in" };
    await db.query(`UPDATE mkt_pet_share SET status = 'declined', resolved_at = NOW() WHERE id = $1 AND to_buyer_id = $2 AND status = 'pending'`, [shareId, toId]).catch(() => {});
    return { ok: true };
}
