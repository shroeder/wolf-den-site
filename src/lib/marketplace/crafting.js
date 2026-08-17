import "server-only";

import { db } from "@/lib/db";
import { itemById, STAT_META, describeStats, AFFIX_POOL, affixCeiling } from "@/lib/marketplace/items.js";
import { PART_TIERS } from "@/lib/marketplace/forge-parts.js";
import { itemsOfSet, setOfItem } from "@/lib/marketplace/sets.js";
import { getEquippedIds, grantItem } from "@/lib/marketplace/inventory.js";
import { pieceById } from "@/lib/marketplace/collection-pieces.js";
import { getOwnedPieceIds, grantPiece } from "@/lib/marketplace/collection-owned.js";
import { itemSpriteMap } from "@/lib/marketplace/item-sprites.js";
import { awardXp } from "@/lib/marketplace/xp.js";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { logCoin } from "@/lib/marketplace/coins.js";
import { grantEventBadge, getBadgeForge } from "@/lib/marketplace/badges.js";
import { MAX_FORGE_LEVEL } from "@/lib/marketplace/forge-rank.js";
import { collectibleById, petForgePassive, petPassiveLevelMult, FORGE_ODDS_KEYS } from "@/lib/marketplace/collectibles.js";
import { petLevelForXp } from "@/lib/marketplace/pet-level.js";
import { rollUtil, parseUtil, describeUtil, getEquippedUtilTotals, UTIL_BASE_CHANCE } from "@/lib/marketplace/item-affix.js";
import { getElementOverrides, describeItemElements, reforgeCost, DUAL_ELEMENT_CHANCE } from "@/lib/marketplace/item-element.js";
import { ELEMENTS } from "@/lib/marketplace/boss-weakness.js";
import { equippedPowers, oneIn, claimPowerUse } from "@/lib/marketplace/ascension-powers.js";

// ── The Forge (owner-gated blacksmith): salvage → tiered parts → combine → enhance equipped gear via a timing
// mini-game. Phase 1 core loop. All actions are owner-gated at the API layer.

// The AI-painted blacksmith-hearth backdrop for the whole experience (generated once, hardcoded like FARM_BG).
export const HEARTH_BG = "https://zqwkiqdxm2nnwwst.public.blob.vercel-storage.com/marketplace/forge/hearth-1785047633350.png";

// The parts catalog moved to forge-parts.js — a PURE module, so client screens (the mining smelt reveal)
// can draw the real sprites instead of re-typing the names. Re-exported here for existing callers.
export { PART_TIERS } from "@/lib/marketplace/forge-parts.js";

const MAX_TIER = 5;
const COMBINE_COST = 5; // 5 of tier N → 1 of tier N+1
// A forged stat tops out at +40% of its BASE value (min +1). Keeps a fully-forged item a MODEST upgrade — never
// the old runaway doubling. Past the cap the item still LEVELS (prestige border) but gains no more raw stats.
const ENHANCE_CAP_FRAC = 0.5;

// Salvaging a piece of gear → which tier + how many parts, by rarity.
const SALVAGE = {
    common: { tier: 1, min: 1, max: 2 },
    rare: { tier: 2, min: 1, max: 3 },
    epic: { tier: 3, min: 2, max: 3 },
    legendary: { tier: 4, min: 2, max: 4 },
    mythic: { tier: 5, min: 3, max: 5 },
    ascendant: { tier: 5, min: 4, max: 6 },
    eternal: { tier: 5, min: 5, max: 7 },
};
const rarityTier = (r) => SALVAGE[r]?.tier || 1;
const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const GRADE_RANK = { good: 1, great: 2, perfect: 3, pixel: 4 };

// Move an item's Forge ENHANCEMENT (level + stat bonus + best grade) to a new owner when the item changes
// hands via trade or the auction house — so an enhanced piece stays enhanced for whoever holds it. No-op if the
// item was never enhanced. Deletes the old owner's row and upserts the new owner's.
export async function transferItemEnhancement(fromId, toId, itemId) {
    if (!fromId || !toId || !itemId || fromId === toId) return;
    const row = await db.queryOne(`DELETE FROM mkt_item_enhance WHERE buyer_id = $1 AND item_id = $2 RETURNING level, stat_bonus, best_grade, util`, [fromId, itemId]).catch(() => null);
    if (!row) return;
    const statBonus = typeof row.stat_bonus === "string" ? row.stat_bonus : JSON.stringify(row.stat_bonus || {});
    const util = row.util == null ? null : (typeof row.util === "string" ? row.util : JSON.stringify(row.util));
    await db.query(
        `INSERT INTO mkt_item_enhance (buyer_id, item_id, level, stat_bonus, best_grade, util, updated_at)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6::jsonb, NOW())
         ON CONFLICT (buyer_id, item_id) DO UPDATE SET level = EXCLUDED.level, stat_bonus = EXCLUDED.stat_bonus, best_grade = EXCLUDED.best_grade, util = EXCLUDED.util, updated_at = NOW()`,
        [toId, itemId, row.level, statBonus, row.best_grade, util]
    ).catch(() => {});
}

// A member's enhancement levels keyed by item_id (for showing "⚒️ +N" on tradeable/listed gear).
export async function enhanceLevelsFor(buyerId, itemIds = []) {
    if (!buyerId || !itemIds.length) return {};
    const rows = await db.query(`SELECT item_id, level FROM mkt_item_enhance WHERE buyer_id = $1 AND item_id = ANY($2) AND level > 0`, [buyerId, itemIds]).catch(() => []);
    return Object.fromEntries(rows.map((r) => [r.item_id, Number(r.level) || 0]));
}

// Full enhancement details keyed by item_id: { level, bonus: {stat→+amount} } — so a card can show the exact
// forge bonus and the effective (base + forge) totals.
export async function enhanceDetailsFor(buyerId, itemIds = []) {
    if (!buyerId || !itemIds.length) return {};
    const rows = await db.query(`SELECT item_id, level, stat_bonus, util FROM mkt_item_enhance WHERE buyer_id = $1 AND item_id = ANY($2) AND level > 0`, [buyerId, itemIds]).catch(() => []);
    const out = {};
    for (const r of rows) out[r.item_id] = { level: Number(r.level) || 0, bonus: (typeof r.stat_bonus === "string" ? (() => { try { return JSON.parse(r.stat_bonus); } catch { return {}; } })() : (r.stat_bonus || {})), util: describeUtil(r.util) };
    return out;
}

// Blacksmith's Regalia — the "salvaging set". Pieces drop rarely from salvaging, and FINDING them is what pays:
// it is a COLLECTION now (sets.js `regalia`), so the bonus is permanent on ownership and the pieces are never
// worn, sold, salvaged or traded. It was the last non-combat set that still made you keep a forging kit and a
// fighting kit and swap between them — on five epic pieces whose combat stats you gave up to salvage well.
// The ids come from sets.js so this file never keeps a second copy of the list.
const REGALIA_IDS = itemsOfSet("regalia");
const REGALIA_DROP = 0.001; // per-salvage chance to receive an unowned Regalia piece (0.1% — a rare treasure)
// The affix pool a slot may take. Never extra_strike (a boss-only convenience), and never a stat the piece
// has no business carrying — a sword does not grant health, a helm does not sharpen your edge.
// ── ONE POOL, THE SAME ONE THE ITEMS USE ─────────────────────────────────────────────────────────────────────
// This was slot-gated — weapons rolled offence, armour rolled staying-power — and that stopped being true the
// moment items.js dropped its own slot gates on Luke's call: "there's no affixes that can only spawn on
// certain pieces." Leaving it here would have meant a helm that CAN carry Pierce could never be forged toward
// it, which is the two halves of one system disagreeing about the rules.
//
// Imported rather than restated, so there is exactly one list and the forge can never fall behind the
// catalogue when a stat is added.
const addablePoolFor = () => AFFIX_POOL.filter((k) => k !== "extra_strike");

function regaliaBonus(ownedCount) {
    if (ownedCount >= 5) return { tier: 2, doubleBonus: 0.15, flatParts: 1, label: "Full set: +15% double-parts & +1 part per salvage" };
    if (ownedCount >= 3) return { tier: 1, doubleBonus: 0.1, flatParts: 0, label: "3 pieces: +10% double-parts chance" };
    return { tier: 0, doubleBonus: 0, flatParts: 0, label: "Find 3 pieces for a salvage bonus" };
}

// Owner-buyable forge upgrades. `per` = effect per level; `steady_hand` levels are combo-saves + band-widening
// applied client-side in the mini-game. Cost is gold, climbing per level.
export const FORGE_UPGRADES = {
    efficient: { name: "Efficient Salvage", desc: "Chance for DOUBLE parts when you salvage.", max: 5, per: 0.0233, base: 250, unit: "%" },
    keen_eye: { name: "Keen Eye", desc: "Chance for a BONUS higher-tier part on salvage.", max: 5, per: 0.0167, base: 300, unit: "%" },
    masters_touch: { name: "Master's Touch", desc: "Chance an enhancement rolls TWICE the gains.", max: 5, per: 0.015, base: 400, unit: "%" },
    steady_hand: { name: "Steady Hand", desc: "Chance a slip won't break your combo when you enhance.", max: 5, per: 0.05, base: 350, unit: "%" },
    transmute: { name: "Transmuter's Boon", desc: "Chance a combine yields TWO parts instead of one (+1% per level).", max: 5, per: 0.01, base: 300, unit: "%" },
    attune: { name: "Attunement", desc: "Chance an enhancement ATTUNES the piece — rolling a rare bonus stat for a spin-off feature (farm, pet XP, raids, sailing or the forge). +1% per level.", max: 5, per: 0.01, base: 500, unit: "%" },
};
// Themed icon + short effect label per perk, so the Perks list renders with the shared upgrade UI (like ship/dig/farm).
const UPG_EMOJI = { efficient: "🛠️", keen_eye: "👁️", masters_touch: "✨", steady_hand: "🖐️", transmute: "⚗️", attune: "🔮" };
const UPG_EFF_LABEL = { efficient: "Double-part chance", keen_eye: "Bonus-part chance", masters_touch: "Double-gain chance", steady_hand: "Combo-save chance", transmute: "Double-combine chance", attune: "Attune chance" };
// Gold cost of the NEXT level: affordable base, doubling each level — mirrors the sailing/dig upgrade curves.
const upgCost = (u, level) => Math.round(u.base * Math.pow(2, level));
async function upgradeLevels(buyerId) {
    const rows = await db.query(`SELECT key, level FROM mkt_forge_upgrade WHERE buyer_id = $1`, [buyerId]).catch(() => []);
    const m = {};
    for (const r of rows) m[r.key] = r.level;
    return m;
}
// Perk odds = bought upgrade levels + forge bonus (badge + pet contributions; both in percentage POINTS).
const chance = (upg, key, bf) => (FORGE_UPGRADES[key].per * (upg[key] || 0)) + ((bf && bf[key]) || 0) / 100;

// Forge odds granted by every OWNED forge pet (efficient / keen_eye / masters_touch / steady_hand), summed and
// level-scaled like the pets page — in percentage POINTS, same units as getBadgeForge so they merge cleanly.
async function petForgeBonus(buyerId) {
    const [ownedRows, xpRows] = await Promise.all([
        db.query(`SELECT ref FROM mkt_cosmetic_unlock WHERE buyer_id = $1 AND category = 'pet'`, [buyerId]).catch(() => []),
        db.query(`SELECT pet_id, xp FROM mkt_pet_level WHERE buyer_id = $1`, [buyerId]).catch(() => []),
    ]);
    const xpMap = Object.fromEntries(xpRows.map((r) => [r.pet_id, r.xp]));
    const out = {};
    for (const row of ownedRows) {
        const fp = petForgePassive(collectibleById(row.ref));
        if (!fp) continue;
        const scaled = fp.value * petPassiveLevelMult(petLevelForXp(xpMap[row.ref] || 0, collectibleById(row.ref)?.rarity));
        if (fp.stat === "forgemaster") {
            // Forgeheart Wyrm's unique passive: a slice of its power boosts EVERY forge odd, not just one.
            const each = scaled * 0.5;
            for (const k of FORGE_ODDS_KEYS) out[k] = (out[k] || 0) + each;
        } else {
            out[fp.stat] = (out[fp.stat] || 0) + scaled;
        }
    }
    return out;
}
// Combined forge bonus (earned badges + owned forge pets) — the single object the odds math reads.
async function getForgeBonus(buyerId) {
    const [badge, pet] = await Promise.all([getBadgeForge(buyerId).catch(() => ({})), petForgeBonus(buyerId).catch(() => ({}))]);
    const out = { ...(badge || {}) };
    for (const [k, v] of Object.entries(pet || {})) out[k] = (out[k] || 0) + v;
    return out;
}

// Buy the next level of a forge upgrade (gold sink).
export async function buyForgeUpgrade(buyerId, key) {
    const u = FORGE_UPGRADES[key];
    if (!buyerId || !u) return { ok: false, error: "bad_upgrade" };
    const cur = (await upgradeLevels(buyerId))[key] || 0;
    if (cur >= u.max) return { ok: false, error: "maxed" };
    const cost = upgCost(u, cur);
    const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`, [buyerId, cost]).catch(() => null);
    if (!paid) return { ok: false, error: "no_gold", ...(await getForgeState(buyerId)) };
    await logCoin(buyerId, -cost, "forge_upgrade", { balanceAfter: paid.gold, meta: { key, level: cur + 1 } }).catch(() => {});
    await db.query(`INSERT INTO mkt_forge_upgrade (buyer_id, key, level) VALUES ($1,$2,1) ON CONFLICT (buyer_id, key) DO UPDATE SET level = mkt_forge_upgrade.level + 1`, [buyerId, key]).catch(() => {});
    await logCraft(buyerId, "upgrade", { meta: { key, level: cur + 1 } });
    // Mastery badges: maxing THIS perk earns Artisan; maxing every perk earns Grandmaster.
    if (cur + 1 >= u.max) {
        grantEventBadge(buyerId, "forge_artisan").catch(() => {});
        const after = await upgradeLevels(buyerId);
        if (Object.keys(FORGE_UPGRADES).every((k) => (after[k] || 0) >= FORGE_UPGRADES[k].max)) grantEventBadge(buyerId, "forge_grandmaster").catch(() => {});
    }
    return { ok: true, key, level: cur + 1, ...(await getForgeState(buyerId)) };
}

// Enhance cost: parts of the item's rarity tier, quantity RAMPS UP each time you re-forge the same piece.
// Base 6, then increments of +4, +6, +8 and capped at +8/level → 6, 10, 16, 24, 32, 40, 48 … so deeper
// forges on an already-enhanced item cost progressively more. (level = the piece's current enhance level.)
function enhanceCost(item, level) {
    let qty = 6;
    for (let k = 0; k < level; k += 1) qty += Math.min(8, 4 + 2 * k);
    return { tier: rarityTier(item.rarity), qty };
}

async function logCraft(buyerId, action, { itemId = null, tier = null, score = null, grade = null, meta = null } = {}) {
    await db
        .query(`INSERT INTO mkt_craft_event (buyer_id, action, item_id, tier, score, grade, meta) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`, [buyerId, action, itemId, tier, score, grade, meta ? JSON.stringify(meta) : null])
        .catch(() => {});
}
export async function addParts(buyerId, tier, n) {
    if (n <= 0) return;
    await db
        .query(`INSERT INTO mkt_salvage_part (buyer_id, tier, count) VALUES ($1,$2,$3) ON CONFLICT (buyer_id, tier) DO UPDATE SET count = mkt_salvage_part.count + $3`, [buyerId, tier, n])
        .catch(() => {});
}
async function partCounts(buyerId) {
    const rows = await db.query(`SELECT tier, count FROM mkt_salvage_part WHERE buyer_id = $1`, [buyerId]).catch(() => []);
    const m = {};
    for (const r of rows) m[r.tier] = r.count;
    return m;
}
const parseBonus = (raw) => (typeof raw === "string" ? (() => { try { return JSON.parse(raw); } catch { return {}; } })() : raw || {});
// The `claimed` JSONB is an ARRAY — coerce to a real array (parseBonus defaults to {}, which isn't iterable).
const parseClaimed = (raw) => { const p = parseBonus(raw); return Array.isArray(p) ? p : []; };

// Log a forge open (for the admin adoption/abandonment funnel). Best-effort.
export async function logForgeOpen(buyerId) {
    if (buyerId) await logCraft(buyerId, "open_forge", {});
}

// ── Daily forge quests (owner-only, lives in the forge) ──
const DAY = "(NOW() AT TIME ZONE 'America/Chicago')::date";
const DAILY_FIELDS = new Set(["salvages", "enhances", "combines", "best_grade"]);
const DAILIES = [
    { key: "salvage3", label: "Salvage 3 pieces of gear", field: "salvages", need: 3, reward: { gold: 150 }, rewardLabel: "+150 🪙" },
    { key: "enhance1", label: "Enhance a piece of gear", field: "enhances", need: 1, reward: { partTier: 2, partN: 2 }, rewardLabel: "+2 Iron Filings" },
    { key: "perfect", label: "Land a Perfect+ strike", field: "best_grade", need: 3, reward: { gold: 250 }, rewardLabel: "+250 🪙" },
];
async function bumpDaily(buyerId, field, amount = 1) {
    if (!DAILY_FIELDS.has(field)) return;
    await db.query(`INSERT INTO mkt_forge_daily (buyer_id, day) VALUES ($1, ${DAY}) ON CONFLICT (buyer_id, day) DO NOTHING`, [buyerId]).catch(() => {});
    if (field === "best_grade") await db.query(`UPDATE mkt_forge_daily SET best_grade = GREATEST(best_grade, $2) WHERE buyer_id = $1 AND day = ${DAY}`, [buyerId, amount]).catch(() => {});
    else await db.query(`UPDATE mkt_forge_daily SET ${field} = ${field} + $2 WHERE buyer_id = $1 AND day = ${DAY}`, [buyerId, amount]).catch(() => {});
}
export async function claimForgeDaily(buyerId, key) {
    const q = DAILIES.find((x) => x.key === key);
    if (!buyerId || !q) return { ok: false, error: "bad" };
    const row = await db.queryOne(`SELECT salvages, enhances, combines, best_grade, claimed FROM mkt_forge_daily WHERE buyer_id = $1 AND day = ${DAY}`, [buyerId]).catch(() => null);
    const prog = Number(row?.[q.field] || 0);
    const claimed = new Set(parseClaimed(row?.claimed));
    if (prog < q.need) return { ok: false, error: "not_done", ...(await getForgeState(buyerId)) };
    if (claimed.has(key)) return { ok: false, error: "claimed", ...(await getForgeState(buyerId)) };
    claimed.add(key);
    await db.query(`UPDATE mkt_forge_daily SET claimed = $2::jsonb WHERE buyer_id = $1 AND day = ${DAY}`, [buyerId, JSON.stringify([...claimed])]).catch(() => {});
    if (q.reward.gold) { const p = await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`, [buyerId, q.reward.gold]).catch(() => null); await logCoin(buyerId, q.reward.gold, "forge_daily", { balanceAfter: p?.gold, meta: { key } }).catch(() => {}); }
    if (q.reward.partTier) await addParts(buyerId, q.reward.partTier, q.reward.partN || 1);
    await awardXp(buyerId, "forge_daily", { points: 20, gold: 0 }).catch(() => {});
    await logCraft(buyerId, "daily", { meta: { key } });
    return { ok: true, key, ...(await getForgeState(buyerId)) };
}

// Count of forge daily tasks that are DONE but unclaimed — for the Forge nav attention badge.
export async function forgeDailyClaimable(buyerId) {
    if (!buyerId) return 0;
    const row = await db.queryOne(`SELECT salvages, enhances, combines, best_grade, claimed FROM mkt_forge_daily WHERE buyer_id = $1 AND day = ${DAY}`, [buyerId]).catch(() => null);
    if (!row) return 0;
    const claimed = new Set(parseClaimed(row.claimed));
    return DAILIES.filter((q) => Number(row[q.field] || 0) >= q.need && !claimed.has(q.key)).length;
}

// ── Salvage an unequipped owned item into parts ──
export async function salvageItem(buyerId, itemId) {
    const item = itemById(itemId);
    if (!buyerId || !item) return { ok: false, error: "bad_item" };
    const equippedSet = new Set(Object.values(await getEquippedIds(buyerId)));
    if (equippedSet.has(itemId)) return { ok: false, error: "equipped" };
    // A collection piece is a permanent bonus wearing an item's clothes. Melting one down for 40% of its parts
    // would quietly delete that bonus, and nobody makes that trade knowingly.
    const del = await db.queryOne(`DELETE FROM mkt_user_item WHERE buyer_id = $1 AND item_id = $2 RETURNING item_id`, [buyerId, itemId]).catch(() => null);
    if (!del) return { ok: false, error: "not_owned" };
    // The jewel is yours, not the item's — it comes back to the bag rather than leaving with the piece.
    try { const { reclaimGems } = await import("@/lib/marketplace/jeweller.js"); await reclaimGems(buyerId, itemId, "salvage"); } catch { /* no bench, no gems */ }
    // Mark it SOLD (same as selling) so an auto-granted LEVEL item is never re-granted — otherwise you could
    // salvage it, have syncLevelItems hand it back on the next gear load, and salvage it again for infinite parts.
    await db.query(`INSERT INTO mkt_sold_item (buyer_id, item_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [buyerId, itemId]).catch(() => {});
    // Read the item's enhancement BEFORE dropping it — salvaging an upgraded item melts down and recovers part
    // of the parts you forged into it (~40%), on top of the base salvage.
    const enhRow = await db.queryOne(`SELECT level FROM mkt_item_enhance WHERE buyer_id = $1 AND item_id = $2`, [buyerId, itemId]).catch(() => null);
    const enhLevel = enhRow?.level || 0;
    await db.query(`DELETE FROM mkt_item_enhance WHERE buyer_id = $1 AND item_id = $2`, [buyerId, itemId]).catch(() => {}); // the item is gone — drop its enhancement
    const cfg = SALVAGE[item.rarity] || SALVAGE.common;
    const upg = await upgradeLevels(buyerId);
    const bf = await getForgeBonus(buyerId); // earned forge badges + owned forge pets boost salvage odds
    // Blacksmith's Regalia salvage bonus — OWNED, not worn (it is a collection). The same read feeds the drop
    // roll at the bottom of this function, so the set is queried once.
    // Regalia lives in mkt_user_collection now, not the item bag. Narrowed to the regalia ids on purpose —
    // getOwnedPieceIds returns EVERY trophy you hold, and counting a Delver's lamp toward the salvage bonus
    // would hand out the full-set perk to anyone with five pieces of anything.
    const ownedReg = new Set((await getOwnedPieceIds(buyerId).catch(() => [])).filter((id) => REGALIA_IDS.includes(id)));
    const rb = regaliaBonus(ownedReg.size);
    let n = randInt(cfg.min, cfg.max);
    let doubled = false;
    // A forge companion's salvage perk stacks with Efficient Salvage and the Regalia set.
    let forgePet = { salvage: 0, spark: 0 };
    try {
        const { getPetSystemPerk } = await import("@/lib/marketplace/pet-combat.js");
        const [sv, sp] = await Promise.all([
            getPetSystemPerk(buyerId, "forge_salvage"),
            getPetSystemPerk(buyerId, "forge_spark"),
        ]);
        forgePet = { salvage: sv, spark: sp };
    } catch { /* no companion, no bonus */ }
    // Twice-Struck is a flat one-in-three double on top of Efficient Salvage, the Regalia and the companion.
    const salvagePowers = await equippedPowers(buyerId);
    if (Math.random() < chance(upg, "efficient", bf) + rb.doubleBonus + forgePet.salvage / 100
        || (salvagePowers.has("twice_struck") && oneIn(3))) { n *= 2; doubled = true; }
    n += rb.flatParts;
    // Melt-down recovery: ~40% of the parts forged into this item (same tier as its salvage parts).
    let enhanceBonus = 0;
    if (enhLevel > 0) {
        let invested = 0;
        for (let l = 0; l < enhLevel; l += 1) invested += enhanceCost(item, l).qty;
        enhanceBonus = Math.max(1, Math.round(invested * 0.4));
        n += enhanceBonus;
    }
    await addParts(buyerId, cfg.tier, n);
    let bonusTier = null;
    if (cfg.tier < MAX_TIER && Math.random() < chance(upg, "keen_eye", bf)) { await addParts(buyerId, cfg.tier + 1, 1); bonusTier = cfg.tier + 1; } // Keen Eye
    // Rare Regalia piece drop (the "salvaging set" loop) — only pieces you don't own yet.
    let regaliaDrop = null;
    const unowned = REGALIA_IDS.filter((r) => !ownedReg.has(r));
    if (unowned.length && Math.random() < REGALIA_DROP) { const pick = unowned[Math.floor(Math.random() * unowned.length)]; await grantPiece(buyerId, pick, "forge").catch(() => {}); regaliaDrop = pieceById(pick)?.name || pick; }
    // Salvaging is done in bulk — 585 times a week — so this reads small per action and lands as 5% of all XP.
    const xp = 4 + cfg.tier * 3;
    await awardXp(buyerId, "craft_salvage", { points: xp, gold: 0 }).catch(() => {});
    await trackActivity(buyerId, "craft_salvage", { itemId, rarity: item.rarity, tier: cfg.tier, parts: n, doubled, bonusTier, enhanceBonus, enhLevel, regaliaDrop }).catch(() => {});

    await logCraft(buyerId, "salvage", { itemId, tier: cfg.tier, meta: { rarity: item.rarity, parts: n, doubled, bonusTier, enhanceBonus, enhLevel, regaliaDrop } });
    await bumpDaily(buyerId, "salvages", 1);
    grantEventBadge(buyerId, "forge_first").catch(() => {});
    return { ok: true, gained: { tier: cfg.tier, n }, doubled, bonusTier, enhanceBonus, enhLevel, regaliaDrop, xp, ...(await getForgeState(buyerId)) };
}

// ── Combine 5 of a tier → 1 of the next ──
export async function combineParts(buyerId, tier) {
    const t = Number(tier);
    if (!buyerId || !(t >= 1 && t < MAX_TIER)) return { ok: false, error: "bad_tier" };
    const paid = await db.queryOne(`UPDATE mkt_salvage_part SET count = count - $3 WHERE buyer_id = $1 AND tier = $2 AND count >= $3 RETURNING count`, [buyerId, t, COMBINE_COST]).catch(() => null);
    if (!paid) return { ok: false, error: "not_enough", ...(await getForgeState(buyerId)) };
    // Transmuter's Boon: 1% per level chance the combine yields TWO of the next tier — plus any Forge Yield
    // attunement on your equipped gear stacks on top.
    const upg = await upgradeLevels(buyerId).catch(() => ({}));
    const util = await getEquippedUtilTotals(buyerId).catch(() => ({ forgeYield: 0 }));
    const made = 1 + (Math.random() < chance(upg, "transmute", null) + (util.forgeYield || 0) / 100 ? 1 : 0);
    await addParts(buyerId, t + 1, made);
    await awardXp(buyerId, "craft_combine", { points: 8, gold: 0 }).catch(() => {});
    await logCraft(buyerId, "combine", { tier: t, meta: { to: t + 1, made } });
    await bumpDaily(buyerId, "combines", 1);
    if (t + 1 >= MAX_TIER) grantEventBadge(buyerId, "forge_emberheart").catch(() => {});
    return { ok: true, made: t + 1, madeCount: made, doubled: made > 1, ...(await getForgeState(buyerId)) };
}

// ── BULK: melt every spare piece of one rarity ───────────────────────────────────────────────────────────────
// Clearing a bag one tap at a time is the actual cost of playing the Forge — forty commons is forty confirms.
//
// What it deliberately WON'T touch, because bulk is where an accident is expensive and irreversible:
//   • anything EQUIPPED (salvageItem refuses these anyway)
//   • anything ENHANCED — you spent parts putting them in; a bulk button should never be the thing that
//     decides a +7 was junk
//   • anything CHARGED — those are in-store perks with real-world value attached
// Each piece still goes through salvageItem(), so every roll, bonus, daily and Regalia drop behaves exactly as
// it does one at a time. This is a loop, not a second implementation of salvaging.
export async function salvageAllOfRarity(buyerId, rarity) {
    if (!buyerId || !SALVAGE[rarity]) return { ok: false, error: "bad_rarity" };
    const [ownedRows, equipped, enhRows] = await Promise.all([
        db.query(`SELECT item_id FROM mkt_user_item WHERE buyer_id = $1`, [buyerId]).catch(() => []),
        getEquippedIds(buyerId).catch(() => ({})),
        db.query(`SELECT item_id FROM mkt_item_enhance WHERE buyer_id = $1 AND level > 0`, [buyerId]).catch(() => []),
    ]);
    const equippedSet = new Set(Object.values(equipped || {}));
    const enhanced = new Set((enhRows || []).map((r) => r.item_id));
    const targets = (ownedRows || [])
        .map((r) => r.item_id)
        .filter((id) => {
            const it = itemById(id);
            return it && it.rarity === rarity && !equippedSet.has(id) && !enhanced.has(id) && !it.charged;
        });
    if (!targets.length) return { ok: false, error: "nothing_to_salvage", ...(await getForgeState(buyerId)) };

    const parts = {};
    const names = [];
    const drops = [];
    let doubled = 0;
    for (const id of targets) {
        const r = await salvageItem(buyerId, id).catch(() => null);
        if (!r?.ok) continue;                       // already gone, or refused — skip it, never abort the batch
        names.push(itemById(id)?.name || id);
        // salvageItem returns `gained` as ONE {tier, n} and reports a Keen Eye bonus part separately as a
        // bare tier number. Both have to be tallied or the recap under-reports what actually landed.
        if (r.gained) parts[r.gained.tier] = (parts[r.gained.tier] || 0) + (r.gained.n || 0);
        if (r.bonusTier) parts[r.bonusTier] = (parts[r.bonusTier] || 0) + 1;
        if (r.doubled) doubled += 1;
        if (r.regaliaDrop) drops.push(r.regaliaDrop);
    }
    return {
        ok: true, count: names.length, names, rarity, doubled,
        // `tally`, NOT `parts`: getForgeState spreads last and carries its own `parts` (the tier catalog), so a
        // key called `parts` here is silently overwritten and the recap loses everything it just counted.
        tally: Object.entries(parts).map(([tier, n]) => ({ tier: Number(tier), n })).sort((a, b) => a.tier - b.tier),
        regaliaDrops: drops,
        ...(await getForgeState(buyerId)),
    };
}

// ── BULK: combine every set of five at one tier ──────────────────────────────────────────────────────────────
// Same reasoning as above — a stack of 60 Iron Filings is twelve identical taps. Loops the real combineParts so
// Transmuter's Boon and the Forge Yield attunement still roll per combine rather than being averaged away.
export async function combineAllAtTier(buyerId, tier) {
    const t = Number(tier);
    if (!buyerId || !(t >= 1 && t < MAX_TIER)) return { ok: false, error: "bad_tier" };
    const have = await db.queryOne(`SELECT count FROM mkt_salvage_part WHERE buyer_id = $1 AND tier = $2`, [buyerId, t]).catch(() => null);
    const runs = Math.floor((have?.count || 0) / COMBINE_COST);
    if (runs < 1) return { ok: false, error: "not_enough", ...(await getForgeState(buyerId)) };
    let made = 0, doubled = 0;
    for (let i = 0; i < runs; i += 1) {
        const r = await combineParts(buyerId, t).catch(() => null);
        if (!r?.ok) break;                          // ran out mid-loop (shouldn't happen) — stop cleanly
        made += r.madeCount || 1;
        if (r.doubled) doubled += 1;
    }
    return { ok: true, runs, made, doubled, from: t, to: t + 1, ...(await getForgeState(buyerId)) };
}

// ── Enhance an equipped item — the mini-game's execution drives the roll ──
// quality: 0..1 execution perfection · grade: headline grade (good|great|perfect|pixel) · combo: best combo run.
// ── REROLL WHAT THE FORGE GAVE YOU ───────────────────────────────────────────────────────────────────────────
// Luke: "I actually love the idea of re rolling." A forged roll is permanent and 244 items already carry one,
// so a bad spread was a thing you were stuck with on gear you had earned — the punishing shape we do not ship.
//
// IT CANNOT COST YOU VALUE. The reroll keeps the item's TOTAL forged points exactly and redistributes them
// across a fresh draw from that slot's pool. You are re-rolling the SHAPE, never the amount, so the worst
// outcome is a spread you like no more than the one you had — never a weaker item. That is what makes it
// something to chase rather than something to fear.
//
// The level, the best grade and any attunement are untouched: those are the things you actually earned by
// striking well, and a spread is not one of them.
export async function rerollEnhance(buyerId, itemId) {
    const item = itemById(itemId);
    if (!item) return { ok: false, error: "unknown_item" };
    const cur = await db.queryOne(
        `SELECT level, stat_bonus FROM mkt_item_enhance WHERE buyer_id = $1 AND item_id = $2`, [buyerId, itemId]
    ).catch(() => null);
    if (!cur) return { ok: false, error: "not_enhanced" };

    const before = parseBonus(cur.stat_bonus);
    const points = Object.values(before).reduce((n, v) => n + (Number(v) || 0), 0);
    if (points <= 0) return { ok: false, error: "nothing_to_reroll" };

    // Guarded spend FIRST — the neon HTTP driver has no transactions, so a reroll that rolled before it
    // charged would be free every time the charge failed.
    const cost = rerollCost(points);
    const paid = await db.queryOne(
        `UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`, [buyerId, cost]
    ).catch(() => null);
    if (!paid) return { ok: false, error: "not_enough_gold", cost };
    await logCoin(buyerId, -cost, "forge_reroll", { meta: { itemId, points }, balanceAfter: paid.gold }).catch(() => {});

    // Same pool and the same per-stat cap the enhance itself uses — a reroll must not be able to reach a
    // shape an enhance could never have produced.
    const existing = Object.keys(item.stats || {}).filter((k) => STAT_META[k] && k !== "extra_strike");
    const pool = [...new Set([...existing, ...addablePoolFor()])];
    const capOf = (k) => Math.max(3, Math.ceil((item.stats?.[k] || 0) * ENHANCE_CAP_FRAC));
    const next = {};
    let left = points;
    let guard = points * 8; // every point must land somewhere; this only stops a pathological spin
    while (left > 0 && guard-- > 0) {
        const k = pool[Math.floor(Math.random() * pool.length)];
        if ((next[k] || 0) >= capOf(k)) continue;
        next[k] = (next[k] || 0) + 1;
        left -= 1;
    }
    // If the caps could not absorb every point (a tiny pool on a low-stat item), the remainder goes back onto
    // whatever the item already had rather than evaporating.
    if (left > 0) for (const k of (existing.length ? existing : ["might"])) { next[k] = (next[k] || 0) + left; break; }

    await db.query(
        `UPDATE mkt_item_enhance SET stat_bonus = $3::jsonb, updated_at = NOW() WHERE buyer_id = $1 AND item_id = $2`,
        [buyerId, itemId, JSON.stringify(next)]
    ).catch(() => {});
    return { ok: true, cost, points, before, after: next };
}

// ── REROLL ONE STAT, NOT THE WHOLE HAND ──────────────────────────────────────────────────────────────────────
// Luke: "you can enhance or reroll a stat to a different one specifically." The whole-spread reroll is a
// gamble; this is a decision. You point at the line you do not want, its points move to a different stat, and
// everything else on the piece stays exactly where it is.
//
// The points are CONSERVED, same as the full reroll — a targeted swap cannot shrink the item either. What you
// are buying is direction, so it is priced per point rather than per item.
export async function rerollStat(buyerId, itemId, stat) {
    const item = itemById(itemId);
    if (!item) return { ok: false, error: "unknown_item" };
    const cur = await db.queryOne(
        `SELECT stat_bonus FROM mkt_item_enhance WHERE buyer_id = $1 AND item_id = $2`, [buyerId, itemId]
    ).catch(() => null);
    if (!cur) return { ok: false, error: "not_enhanced" };

    const before = parseBonus(cur.stat_bonus);
    const key = String(stat || "");
    const points = Number(before[key]) || 0;
    if (points <= 0) return { ok: false, error: "no_such_stat" };

    // Guarded spend first — no transactions on this driver, so a swap that rolled before it charged would be
    // free every time the charge failed.
    const cost = rerollStatCost(points);
    const paid = await db.queryOne(
        `UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`, [buyerId, cost]
    ).catch(() => null);
    if (!paid) return { ok: false, error: "not_enough_gold", cost };
    await logCoin(buyerId, -cost, "forge_reroll_stat", { meta: { itemId, stat: key, points }, balanceAfter: paid.gold }).catch(() => {});

    // Somewhere it is not already — neither in the item's own stats nor anywhere else in the forged spread,
    // so a swap always produces a line the piece did not have.
    const taken = new Set([...Object.keys(item.stats || {}), ...Object.keys(before)]);
    const options = addablePoolFor().filter((k) => !taken.has(k));
    const next = { ...before };
    delete next[key];
    if (options.length) {
        const to = options[Math.floor(Math.random() * options.length)];
        const capOf = (k) => Math.max(3, Math.ceil((item.stats?.[k] || 0) * ENHANCE_CAP_FRAC));
        next[to] = Math.min(capOf(to), points);
        // Anything the cap would not take goes back to the stat it came from rather than evaporating.
        const spare = points - next[to];
        if (spare > 0) next[key] = spare;
        await db.query(
            `UPDATE mkt_item_enhance SET stat_bonus = $3::jsonb, updated_at = NOW() WHERE buyer_id = $1 AND item_id = $2`,
            [buyerId, itemId, JSON.stringify(next)]
        ).catch(() => {});
        return { ok: true, cost, from: key, to, points: next[to] };
    }
    // Nothing left to swap into — the piece already carries everything. Refund rather than take the gold for
    // a swap that cannot happen.
    await db.query(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1`, [buyerId, cost]).catch(() => {});
    return { ok: false, error: "nothing_to_swap_to" };
}

// Cheaper than rerolling the whole hand, because it moves one line rather than redrawing all of them.
export const rerollStatCost = (points = 0) => 150 + Math.max(0, Math.round(points)) * 120;

// Priced off how much is actually being rerolled, so a lightly-forged item is cheap to experiment with and a
// fully-forged one is a real decision.
export const rerollCost = (points = 0) => 250 + Math.max(0, Math.round(points)) * 150;

export async function enhanceItem(buyerId, itemId, { quality = 0, grade = "good", combo = 0, useScroll = false } = {}) {
    const item = itemById(itemId);
    if (!buyerId || !item) return { ok: false, error: "bad_item" };
    if (!new Set(Object.values(await getEquippedIds(buyerId))).has(itemId)) return { ok: false, error: "not_equipped" };
    const cur = await db.queryOne(`SELECT level, stat_bonus, best_grade, util FROM mkt_item_enhance WHERE buyer_id = $1 AND item_id = $2`, [buyerId, itemId]).catch(() => null);
    const level = cur?.level || 0;
    const enhancePowers = await equippedPowers(buyerId);
    if (level >= MAX_FORGE_LEVEL) return { ok: false, error: "maxed", ...(await getForgeState(buyerId)) }; // peak enchantment reached
    const { tier, qty } = enhanceCost(item, level);
    // A POWER SCROLL is a free enhance — consume one instead of salvaged parts.
    let usedScroll = false;
    if (useScroll) {
        const sc = await db.queryOne(`UPDATE mkt_user_consumable SET count = count - 1 WHERE buyer_id = $1 AND consumable_id = 'forge_power_scroll' AND count > 0 RETURNING count`, [buyerId]).catch(() => null);
        if (!sc) return { ok: false, error: "no_scroll", ...(await getForgeState(buyerId)) };
        usedScroll = true;
    } else {
        // A forge companion's spark perk can spare the parts entirely — the pet card states the exact chance.
        let sparked = false;
        try {
            const { getPetSystemPerk } = await import("@/lib/marketplace/pet-combat.js");
            const spark = await getPetSystemPerk(buyerId, "forge_spark");
            sparked = spark > 0 && Math.random() < spark / 100;
            // The Cold Hammer spares the parts outright on every third enhance. Counted off the item's own
            // level rather than rolled, so "every third" means every third.
            if (!sparked && enhancePowers.has("cold_hammer") && (level + 1) % 3 === 0) sparked = true;
        } catch { /* no companion, no bonus */ }
        if (!sparked) {
            const paid = await db.queryOne(`UPDATE mkt_salvage_part SET count = count - $3 WHERE buyer_id = $1 AND tier = $2 AND count >= $3 RETURNING count`, [buyerId, tier, qty]).catch(() => null);
            if (!paid) return { ok: false, error: "not_enough", need: { tier, qty }, ...(await getForgeState(buyerId)) };
        }
    }
    const q = Math.max(0, Math.min(1, Number(quality) || 0));
    // SKILL TIERS — the mini-game score decides how many stat points you forge AND how they SPREAD. Higher tiers
    // add BREADTH (more stats); a flawless run can add brand-new stats to the item (up to four total):
    //   T1 (score ≥25%): +1 to ONE stat.
    //   T2 (≥50%): +1 to TWO stats — or +2 to the one, if the item has only a single stat.
    //   T3 (≥75%): +1 to THREE stats — adding a NEW stat if the item only had two (all three if it has three).
    //   T4 (≥92%, "perfection"): +1 to FOUR stats — adding new stats up to four total (all four if it has four).
    // Below 25% the forge WHIFFS: no stat gain (it still levels + grants XP). Each stat is capped so it can't run
    // away. Master's Touch bumps you up one tier.
    let scenario = q >= 0.92 ? 4 : q >= 0.75 ? 3 : q >= 0.5 ? 2 : q >= 0.25 ? 1 : 0;
    // ── ASCENSION POWERS ON AN ENHANCE ───────────────────────────────────────────────────────────────────
    // The Whetstone guarantees ONE critical success a day — the top scenario, which is what a critical is here.
    // The Smith's Certainty stops a whiff being a wasted swing: below the threshold it lifts you to the first
    // real band rather than nothing, which is the "costs you nothing and may be tried again" on the card.
    if (await claimPowerUse(buyerId, "whetstone")) scenario = 4;
    if (enhancePowers.has("smith_s_certainty") && scenario === 0) scenario = 1;
    const upg = await upgradeLevels(buyerId);
    const bf = await getForgeBonus(buyerId); // earned forge badges + owned forge pets boost double-gain odds
    let doubled = false;
    if (scenario > 0 && Math.random() < chance(upg, "masters_touch", bf)) { scenario = Math.min(4, scenario + 1); doubled = true; }
    // The Master's Mark: one enhance in three advances TWO levels instead of one.
    const doubleLevel = enhancePowers.has("master_s_mark") && oneIn(3);

    const existing = Object.keys(item.stats || {}).filter((k) => STAT_META[k] && k !== "extra_strike");
    // ── WHAT A FORGE MAY ADD, BY SLOT ────────────────────────────────────────────────────────────────────
    // This was five stats for every item, which predates Vitality/Tenacity/Precision/Pierce — so the forge
    // could not roll any of the new gear stats at all, and every item's addable pool was identical.
    //
    // SLOT-GATED ON PURPOSE, and it is the load-bearing rule: if a weapon can roll Vitality and a helm can
    // roll Pierce, then after enough forging every slot does everything and slots stop meaning anything. The
    // variance work is only preserved if the pool respects what the piece IS.
    const ADDABLE = addablePoolFor();
    // ── THE FORGE FILLS EMPTY SOCKETS, IT DOES NOT DRILL NEW ONES ────────────────────────────────────────
    // A piece is born with affixesBornWith(rarity) stats and can hold affixCeiling(rarity) — the gap is the
    // sockets the Forge may fill, and once they are full it can only make what is there BIGGER. Without this
    // a common item could be forged until it carried every stat in the game, which erases the rarity ladder
    // from the other end.
    const forgedNew = Object.keys(parseBonus(cur?.stat_bonus)).filter((k) => !existing.includes(k)).length;
    const socketsLeft = Math.max(0, affixCeiling(item.rarity) - existing.length - forgedNew);
    const newPool = socketsLeft > 0 ? ADDABLE.filter((k) => !existing.includes(k)) : [];
    const nextBonus = { ...parseBonus(cur?.stat_bonus) };
    const capOf = (k) => Math.max(3, Math.ceil((item.stats?.[k] || 0) * ENHANCE_CAP_FRAC)); // per-stat forge cap (added stats: +3)
    const gained = {};
    const apply = (k) => { if ((nextBonus[k] || 0) < capOf(k)) { nextBonus[k] = (nextBonus[k] || 0) + 1; gained[k] = (gained[k] || 0) + 1; } };
    if (scenario > 0) {
        // Reach `scenario` DISTINCT stats: existing first, then (T3+) add brand-new stats to fill the count.
        const targets = existing.slice(0, scenario);
        if (scenario >= 3) { const pool = [...newPool]; while (targets.length < scenario && pool.length) targets.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]); }
        const stack = targets.length ? targets : (existing.length ? existing : ["might"]);
        targets.forEach(apply);
        for (let i = 0, extra = scenario - targets.length; i < extra; i += 1) apply(stack[i % stack.length]); // leftover points double up (e.g. a 1-stat item at T2)
    }
    const forgedKeys = Object.keys(nextBonus).filter((k) => (nextBonus[k] || 0) > 0);
    const allMaxed = forgedKeys.length >= Math.min(4, existing.length + newPool.length) && forgedKeys.every((k) => (nextBonus[k] || 0) >= capOf(k));
    const bestGrade = (GRADE_RANK[grade] || 0) > (GRADE_RANK[cur?.best_grade] || 0) ? grade : cur?.best_grade || grade;
    // RARE ATTUNEMENT ROLL — a lucky enhance can add (or level up) a bonus utility affix that helps a spin-off
    // feature. Base chance + a bonus for a flawless strike + the Attunement forge upgrade. One affix per item.
    // Grade bonuses cut to 0.4x with the rest of the attunement rate — see UTIL_BASE_CHANCE.
    const utilChance = UTIL_BASE_CHANCE + (grade === "pixel" ? 0.024 : grade === "perfect" ? 0.012 : 0) + chance(upg, "attune", bf);
    const { next: nextUtil, result: utilRoll } = rollUtil(parseUtil(cur?.util), utilChance);
    const utilJson = nextUtil ? JSON.stringify(nextUtil) : null;
    await db
        .query(
            `INSERT INTO mkt_item_enhance (buyer_id, item_id, level, stat_bonus, best_grade, util, updated_at) VALUES ($1,$2,$3,$4::jsonb,$5,$6::jsonb,NOW())
             ON CONFLICT (buyer_id, item_id) DO UPDATE SET level = $3, stat_bonus = $4::jsonb, best_grade = $5, util = $6::jsonb, updated_at = NOW()`,
            // The Master's Mark advances two levels instead of one, still bounded by MAX_FORGE_LEVEL.
            [buyerId, itemId, Math.min(MAX_FORGE_LEVEL, level + (doubleLevel ? 2 : 1)), JSON.stringify(nextBonus), bestGrade, utilJson]
        )
        .catch(() => {});
    await db.query(`UPDATE mkt_buyer SET equipment_updated_at = NOW() WHERE id = $1`, [buyerId]).catch(() => {}); // nudge the hero-sprite redraw
    const xp = 12 + Math.round(q * 48) + (grade === "pixel" ? 15 : grade === "perfect" ? 8 : 0);
    await awardXp(buyerId, "craft_enhance", { points: xp, gold: 0 }).catch(() => {});
    await trackActivity(buyerId, "craft_enhance", { itemId, level: level + 1, grade, quality: q, combo }).catch(() => {});

    await logCraft(buyerId, "enhance", { itemId, tier, score: Math.round(q * 1000), grade, meta: { level: level + 1, gained, combo, doubled } });
    await bumpDaily(buyerId, "enhances", 1);
    await bumpDaily(buyerId, "best_grade", GRADE_RANK[grade] || 1);
    grantEventBadge(buyerId, "forge_first").catch(() => {});
    if (grade === "pixel") grantEventBadge(buyerId, "forge_pixel").catch(() => {});
    if (level + 1 >= 10) grantEventBadge(buyerId, "forge_plus10").catch(() => {});
    const ec = await db.queryOne(`SELECT COUNT(*)::int AS n FROM mkt_craft_event WHERE buyer_id = $1 AND action = 'enhance'`, [buyerId]).catch(() => null);
    if ((ec?.n || 0) >= 10) grantEventBadge(buyerId, "forge_smith").catch(() => {});
    if ((ec?.n || 0) >= 50) grantEventBadge(buyerId, "forge_master").catch(() => {});
    // statLines let the reveal show the additive math plainly (base + forge = total) for every stat — INCLUDING
    // stats this forge just ADDED (base 0), flagged isNew so the reveal can call them out.
    const statKeys = Array.from(new Set([...existing, ...forgedKeys]));
    const statLines = statKeys.map((k) => ({ key: k, label: STAT_META[k]?.label || k, icon: STAT_META[k]?.icon || "", suffix: STAT_META[k]?.suffix || "", base: item.stats?.[k] || 0, forge: nextBonus[k] || 0, gained: gained[k] || 0, isNew: !existing.includes(k) }));
    // The attunement outcome for the reveal: what (if anything) got rolled, plus the item's resulting affix.
    const attune = utilRoll ? { ...describeUtil(nextUtil), isNew: Boolean(utilRoll.isNew), upgraded: Boolean(utilRoll.upgraded) } : null;
    if (attune) grantEventBadge(buyerId, "forge_attuned").catch(() => {});
    return { ok: true, itemId, level: level + 1, gained: describeStats(gained), statLines, attune, util: describeUtil(nextUtil), allMaxed, scenario, doubled, usedScroll, xp, grade, ...(await getForgeState(buyerId)) };
}

// ── Full forge state for the UI ──
export async function getForgeState(buyerId) {
    if (!buyerId) return null;
    const [bySlot, parts, ownedRows, enhRows, spriteMap, upg, bf, goldRow] = await Promise.all([
        getEquippedIds(buyerId),
        partCounts(buyerId),
        db.query(`SELECT item_id FROM mkt_user_item WHERE buyer_id = $1`, [buyerId]).catch(() => []),
        db.query(`SELECT item_id, level, stat_bonus, best_grade, util FROM mkt_item_enhance WHERE buyer_id = $1`, [buyerId]).catch(() => []),
        itemSpriteMap().catch(() => ({})),
        upgradeLevels(buyerId),
        getForgeBonus(buyerId).catch(() => ({})), // earned forge badges + owned forge pets boost displayed + real odds
        db.queryOne(`SELECT COALESCE(gold,0) AS gold FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null),
    ]);
    const dRow = await db.queryOne(`SELECT salvages, enhances, combines, best_grade, claimed FROM mkt_forge_daily WHERE buyer_id = $1 AND day = ${DAY}`, [buyerId]).catch(() => null);
    const claimedSet = new Set(parseClaimed(dRow?.claimed));
    const dailies = DAILIES.map((q) => { const prog = Number(dRow?.[q.field] || 0); return { key: q.key, label: q.label, need: q.need, progress: Math.min(prog, q.need), done: prog >= q.need, claimed: claimedSet.has(q.key), rewardLabel: q.rewardLabel }; });
    const equippedIds = new Set(Object.values(bySlot));
    // Everything in the bag, for counting how much of a set a piece belongs to you already hold.
    const ownedIds = new Set((ownedRows || []).map((r) => r.item_id));
    const enhById = new Map();
    for (const r of enhRows) enhById.set(r.item_id, { level: r.level, bonus: parseBonus(r.stat_bonus), bestGrade: r.best_grade, util: r.util });
    // Effective totals = the item's base stats plus whatever the forge added. Local rather than imported: this is
    // three lines and auction.js keeps its own copy for the same reason.
    const mergeStats = (base = {}, bonus = {}) => {
        const out = { ...(base || {}) };
        for (const [k, v] of Object.entries(bonus || {})) out[k] = (out[k] || 0) + Number(v || 0);
        return out;
    };
    // Fetched HERE rather than down by the Attune tab that used to be its only consumer: `dress` builds the
    // Enhance and Salvage lists too, and both of those now carry the element so the marker can ride the corner
    // of a forge card. Reading it after `dress` had already run would have shipped those two tabs the base
    // element and quietly told a member their reforged piece was still fire.
    const elemOver = await getElementOverrides(buyerId).catch(() => ({}));
    const dress = (id) => {
        const it = itemById(id);
        if (!it) return null;
        const enh = enhById.get(id);
        return {
            id, name: it.name, slot: it.slot, rarity: it.rarity, icon: it.icon, flavor: it.flavor || null, sprite: spriteMap[id] || null,
            elements: describeItemElements(id, elemOver[id]),
            stats: describeStats(it.stats), salvageTier: rarityTier(it.rarity),
            // RAW effective totals (base + any forge bonus), keyed by stat, so the client can diff this piece
            // against whatever is in the same slot. The `stats` string above is already rendered and can't be
            // subtracted from anything — deciding whether to melt a piece down means seeing the actual delta.
            statMap: mergeStats(it.stats || {}, enh?.bonus || {}),
            level: enh?.level || 0, bonus: enh?.bonus ? describeStats(enh.bonus) : null, bestGrade: enh?.bestGrade || null,
            // What a reroll of THIS item would cost, from the same function that charges for it — a card that
            // prints one price and a server that takes another is the oldest bug in this codebase.
            // The forged lines themselves, so the modal can offer them one at a time rather than only
            // all-or-nothing. Each carries its own price from the same function that charges for it.
            forged: enh?.bonus
                ? Object.entries(enh.bonus).filter(([, v]) => (Number(v) || 0) > 0)
                    .map(([k, v]) => ({ stat: k, label: STAT_META[k]?.label || k, n: Number(v), cost: rerollStatCost(Number(v)) }))
                : [],
            rerollPoints: enh?.bonus ? Object.values(enh.bonus).reduce((n, v) => n + (Number(v) || 0), 0) : 0,
            rerollCost: enh?.bonus ? rerollCost(Object.values(enh.bonus).reduce((n, v) => n + (Number(v) || 0), 0)) : 0,
            util: describeUtil(enh?.util),
            // ── IS THIS PART OF A SET? ────────────────────────────────────────────────────────────────────
            // The Forge is the one screen in the game where being wrong is irreversible, and it was the one
            // screen that would not tell you. `have` counts what you own of that set INCLUDING this piece, so
            // the card can say "you would be down to 3 of 5" rather than making anybody do the arithmetic.
            set: (() => {
                const st = setOfItem(id);
                if (!st) return null;
                const items = st.items || [];
                return {
                    name: st.name,
                    total: items.length,
                    have: items.filter((x) => ownedIds.has(x)).length,
                    collection: Boolean(st.collection),
                };
            })(),
        };
    };
    // No trophy filter: mkt_user_item holds gear only now, so a Forgeplate cannot appear in this list at all.
    const salvage = (ownedRows || []).map((r) => r.item_id)
        .filter((id) => !equippedIds.has(id))
        .map(dress).filter(Boolean)
        .map((d) => { const cfg = SALVAGE[d.rarity] || SALVAGE.common; return { ...d, salvageMin: cfg.min, salvageMax: cfg.max }; })
        .sort((a, b) => b.salvageTier - a.salvageTier || a.name.localeCompare(b.name));
    const enhance = Object.values(bySlot).map((id) => { const d = dress(id); if (!d) return null; const c = enhanceCost(itemById(id), d.level); const maxed = d.level >= MAX_FORGE_LEVEL; return { ...d, cost: c, have: parts[c.tier] || 0, affordable: (parts[c.tier] || 0) >= c.qty, maxed }; }).filter(Boolean).sort((a, b) => b.level - a.level || a.slot.localeCompare(b.slot));
    const partList = PART_TIERS.map((p) => ({ ...p, count: parts[p.tier] || 0, canCombine: (parts[p.tier] || 0) >= COMBINE_COST && p.tier < MAX_TIER }));
    // Blacksmith's Regalia collection (the salvaging set).
    //
    // READ THE COLLECTION TABLE, not the gear table. This asked mkt_user_item whether you owned a Forgeplate —
    // and pieces moved OUT of mkt_user_item into mkt_user_collection, which is exactly what the comment on the
    // salvage list nine lines above says. That list got fixed in the migration and this did not, so the panel
    // reported 0/5 to everybody who owned pieces (3 members do; Luke holds the Forgeplate and the Cinderstride
    // Boots, both `source: migrated`, so the migration itself carried them over correctly).
    //
    // It was NOT only cosmetic: regFound also feeds the salvageOdds preview below, so the double-part odds the
    // Forge quoted you were the odds for owning nothing. The salvage itself was always right — salvageItem
    // reads getOwnedPieceIds — so members with pieces were being paid the bonus while being told they had none.
    //
    // itemById is null for these ids now too (they are pieces, not items), which is why name/slot/icon came
    // back as the raw id. pieceById is the registry that still knows them.
    const ownedPieceSet = new Set(await getOwnedPieceIds(buyerId).catch(() => []));
    const regaliaPieces = REGALIA_IDS.map((id) => { const p = pieceById(id); return { id, name: p?.name || id, rarity: p?.rarity || null, icon: p?.icon || null, flavor: p?.flavor || null, sprite: spriteMap[id] || null, owned: ownedPieceSet.has(id) }; });
    const regFound = regaliaPieces.filter((r) => r.owned).length;
    const regaliaTiers = [
        { need: 3, effect: "+10% double-parts chance on salvage", active: regFound >= 3 },
        { need: 5, effect: "+15% double-parts & +1 part every salvage", active: regFound >= 5 },
    ];
    const regalia = { pieces: regaliaPieces, owned: regFound, total: REGALIA_IDS.length, bonus: regaliaBonus(regFound), tiers: regaliaTiers, dropRate: REGALIA_DROP };
    // Odds shown in the salvage preview modal (so the reward feels earned, not random).
    const rbNow = regaliaBonus(regFound);
    const salvageOdds = {
        doublePct: Math.round((chance(upg, "efficient", bf) + rbNow.doubleBonus) * 100),
        bonusPartPct: Math.round(chance(upg, "keen_eye", bf) * 100),
        regaliaFlat: rbNow.flatParts,
        regaliaDropPct: regaliaPieces.some((p) => !p.owned) ? +(REGALIA_DROP * 100).toFixed(1) : 0,
    };
    const upgrades = Object.entries(FORGE_UPGRADES).map(([key, u]) => {
        const level = upg[key] || 0;
        const pct = (lv) => `${Math.round(u.per * lv * 100)}%`;
        const saves = (lv) => `${lv} save${lv === 1 ? "" : "s"}`;
        const eff = u.unit === "%"
            ? { label: UPG_EFF_LABEL[key], now: level ? pct(level) : "—", next: pct(level + 1) }
            : { label: UPG_EFF_LABEL[key], now: level ? saves(level) : "—", next: saves(level + 1) };
        return { key, name: u.name, emoji: UPG_EMOJI[key], desc: u.desc, level, max: u.max, unit: u.unit, cost: level >= u.max ? null : upgCost(u, level), effect: u.unit === "%" ? pct(level) : `${level}`, eff };
    });
    // ── Attune (elemental reforge) — every OWNED piece + its current element(s) + the gold cost to reforge it. ──
    const reforgeItems = (ownedRows || []).map((r) => r.item_id).map((id) => {
        const it = itemById(id);
        if (!it) return null;
        return { id, name: it.name, slot: it.slot, rarity: it.rarity, icon: it.icon, sprite: spriteMap[id] || null, elements: describeItemElements(id, elemOver[id]), cost: reforgeCost(it.rarity), equipped: equippedIds.has(id) };
    }).filter(Boolean).sort((a, b) => rarityTier(b.rarity) - rarityTier(a.rarity) || a.name.localeCompare(b.name));
    // Forge scrolls held (Power = free enhance, Enchant = add an affinity).
    const scrollRows = await db.query(`SELECT consumable_id, count FROM mkt_user_consumable WHERE buyer_id = $1 AND consumable_id IN ('forge_power_scroll','forge_enchant_scroll') AND count > 0`, [buyerId]).catch(() => []);
    const scrollCount = (cid) => Number(scrollRows.find((r) => r.consumable_id === cid)?.count || 0);
    const reforge = { items: reforgeItems, elements: Object.values(ELEMENTS).map((e) => ({ key: e.key, label: e.label, emoji: e.emoji, color: e.color })), dualChance: Math.round(DUAL_ELEMENT_CHANCE * 100), enchantScrolls: scrollCount("forge_enchant_scroll") };
    return { parts: partList, salvage, enhance, reforge, upgrades, dailies, regalia, salvageOdds, steadyHandChance: chance(upg, "steady_hand", bf), gold: goldRow?.gold || 0, powerScrolls: scrollCount("forge_power_scroll"), enchantScrolls: scrollCount("forge_enchant_scroll"), combineCost: COMBINE_COST, maxTier: MAX_TIER, hearthBg: HEARTH_BG };
}
