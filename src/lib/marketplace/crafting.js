import "server-only";

import { db } from "@/lib/db";
import { itemById, STAT_META, describeStats } from "@/lib/marketplace/items.js";
import { getEquippedIds } from "@/lib/marketplace/inventory.js";
import { itemSpriteMap } from "@/lib/marketplace/item-sprites.js";
import { awardXp } from "@/lib/marketplace/xp.js";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { logCoin } from "@/lib/marketplace/coins.js";
import { grantEventBadge } from "@/lib/marketplace/badges.js";

// ── The Forge (owner-gated blacksmith): salvage → tiered parts → combine → enhance equipped gear via a timing
// mini-game. Phase 1 core loop. All actions are owner-gated at the API layer.

// The AI-painted blacksmith-hearth backdrop for the whole experience (generated once, hardcoded like FARM_BG).
export const HEARTH_BG = "https://zqwkiqdxm2nnwwst.public.blob.vercel-storage.com/marketplace/forge/hearth-1785047633350.png";

// Tiered forge parts (1..5) — themed to a smithy, with rarity-ladder colors + a react-icons glyph fallback.
export const PART_TIERS = [
    { tier: 1, name: "Cinder Scrap", color: "#c39b6a", glyph: "GiMetalBar" },
    { tier: 2, name: "Iron Filings", color: "#cfd6dd", glyph: "GiStakeHammer" },
    { tier: 3, name: "Tempered Steel", color: "#6fb0e6", glyph: "GiIngot" },
    { tier: 4, name: "Mythril Dust", color: "#b98cff", glyph: "GiCrystalize" },
    { tier: 5, name: "Emberheart Shard", color: "#ffb020", glyph: "GiCrystalCluster" },
];
const MAX_TIER = 5;
const COMBINE_COST = 5; // 5 of tier N → 1 of tier N+1

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

// Owner-buyable forge upgrades. `per` = effect per level; `steady_hand` levels are combo-saves + band-widening
// applied client-side in the mini-game. Cost is gold, climbing per level.
export const FORGE_UPGRADES = {
    efficient: { name: "Efficient Salvage", desc: "Chance for DOUBLE parts when you salvage.", max: 5, per: 0.07, base: 1500, unit: "%" },
    keen_eye: { name: "Keen Eye", desc: "Chance for a BONUS higher-tier part on salvage.", max: 5, per: 0.05, base: 2500, unit: "%" },
    masters_touch: { name: "Master's Touch", desc: "Chance an enhancement rolls TWICE the gains.", max: 5, per: 0.045, base: 3500, unit: "%" },
    steady_hand: { name: "Steady Hand", desc: "A slip won't break your combo (per forge) + wider timing windows.", max: 3, per: 1, base: 4000, unit: "save" },
};
const upgCost = (u, level) => Math.round(u.base * Math.pow(1.9, level));
async function upgradeLevels(buyerId) {
    const rows = await db.query(`SELECT key, level FROM mkt_forge_upgrade WHERE buyer_id = $1`, [buyerId]).catch(() => []);
    const m = {};
    for (const r of rows) m[r.key] = r.level;
    return m;
}
const chance = (upg, key) => (FORGE_UPGRADES[key].per * (upg[key] || 0));

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
    return { ok: true, key, level: cur + 1, ...(await getForgeState(buyerId)) };
}

// Enhance cost: parts of the item's rarity tier, quantity grows LOGARITHMICALLY with the item's enhance level.
function enhanceCost(item, level) {
    return { tier: rarityTier(item.rarity), qty: Math.max(2, Math.round(2 + 1.8 * Math.log2(level + 2))) };
}

async function logCraft(buyerId, action, { itemId = null, tier = null, score = null, grade = null, meta = null } = {}) {
    await db
        .query(`INSERT INTO mkt_craft_event (buyer_id, action, item_id, tier, score, grade, meta) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`, [buyerId, action, itemId, tier, score, grade, meta ? JSON.stringify(meta) : null])
        .catch(() => {});
}
async function addParts(buyerId, tier, n) {
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

// Log a forge open (for the admin adoption/abandonment funnel). Best-effort.
export async function logForgeOpen(buyerId) {
    if (buyerId) await logCraft(buyerId, "open_forge", {});
}

// ── Daily forge quests (owner-only, lives in the forge) ──
const DAY = "(NOW() AT TIME ZONE 'America/Chicago')::date";
const DAILY_FIELDS = new Set(["salvages", "enhances", "combines", "best_grade"]);
const DAILIES = [
    { key: "salvage3", label: "Salvage 3 pieces of gear", field: "salvages", need: 3, reward: { gold: 300 }, rewardLabel: "+300 🪙" },
    { key: "enhance1", label: "Enhance a piece of gear", field: "enhances", need: 1, reward: { partTier: 2, partN: 2 }, rewardLabel: "+2 Iron Filings" },
    { key: "perfect", label: "Land a Perfect+ strike", field: "best_grade", need: 3, reward: { gold: 500 }, rewardLabel: "+500 🪙" },
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
    const claimed = new Set(parseBonus(row?.claimed) || []);
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

// ── Salvage an unequipped owned item into parts ──
export async function salvageItem(buyerId, itemId) {
    const item = itemById(itemId);
    if (!buyerId || !item) return { ok: false, error: "bad_item" };
    if (new Set(Object.values(await getEquippedIds(buyerId))).has(itemId)) return { ok: false, error: "equipped" };
    const del = await db.queryOne(`DELETE FROM mkt_user_item WHERE buyer_id = $1 AND item_id = $2 RETURNING item_id`, [buyerId, itemId]).catch(() => null);
    if (!del) return { ok: false, error: "not_owned" };
    await db.query(`DELETE FROM mkt_item_enhance WHERE buyer_id = $1 AND item_id = $2`, [buyerId, itemId]).catch(() => {}); // the item is gone — drop its enhancement
    const cfg = SALVAGE[item.rarity] || SALVAGE.common;
    const upg = await upgradeLevels(buyerId);
    let n = randInt(cfg.min, cfg.max);
    let doubled = false;
    if (Math.random() < chance(upg, "efficient")) { n *= 2; doubled = true; } // Efficient Salvage
    await addParts(buyerId, cfg.tier, n);
    let bonusTier = null;
    if (cfg.tier < MAX_TIER && Math.random() < chance(upg, "keen_eye")) { await addParts(buyerId, cfg.tier + 1, 1); bonusTier = cfg.tier + 1; } // Keen Eye
    const xp = 6 + cfg.tier * 4;
    await awardXp(buyerId, "craft_salvage", { points: xp, gold: 0 }).catch(() => {});
    await trackActivity(buyerId, "craft_salvage", { itemId, rarity: item.rarity, tier: cfg.tier, parts: n, doubled, bonusTier }).catch(() => {});
    await logCraft(buyerId, "salvage", { itemId, tier: cfg.tier, meta: { rarity: item.rarity, parts: n, doubled, bonusTier } });
    await bumpDaily(buyerId, "salvages", 1);
    grantEventBadge(buyerId, "forge_first").catch(() => {});
    return { ok: true, gained: { tier: cfg.tier, n }, doubled, bonusTier, xp, ...(await getForgeState(buyerId)) };
}

// ── Combine 5 of a tier → 1 of the next ──
export async function combineParts(buyerId, tier) {
    const t = Number(tier);
    if (!buyerId || !(t >= 1 && t < MAX_TIER)) return { ok: false, error: "bad_tier" };
    const paid = await db.queryOne(`UPDATE mkt_salvage_part SET count = count - $3 WHERE buyer_id = $1 AND tier = $2 AND count >= $3 RETURNING count`, [buyerId, t, COMBINE_COST]).catch(() => null);
    if (!paid) return { ok: false, error: "not_enough", ...(await getForgeState(buyerId)) };
    await addParts(buyerId, t + 1, 1);
    await awardXp(buyerId, "craft_combine", { points: 8, gold: 0 }).catch(() => {});
    await logCraft(buyerId, "combine", { tier: t, meta: { to: t + 1 } });
    await bumpDaily(buyerId, "combines", 1);
    if (t + 1 >= MAX_TIER) grantEventBadge(buyerId, "forge_emberheart").catch(() => {});
    return { ok: true, made: t + 1, ...(await getForgeState(buyerId)) };
}

// ── Enhance an equipped item — the mini-game's execution drives the roll ──
// quality: 0..1 execution perfection · grade: headline grade (good|great|perfect|pixel) · combo: best combo run.
export async function enhanceItem(buyerId, itemId, { quality = 0, grade = "good", combo = 0 } = {}) {
    const item = itemById(itemId);
    if (!buyerId || !item) return { ok: false, error: "bad_item" };
    if (!new Set(Object.values(await getEquippedIds(buyerId))).has(itemId)) return { ok: false, error: "not_equipped" };
    const cur = await db.queryOne(`SELECT level, stat_bonus, best_grade FROM mkt_item_enhance WHERE buyer_id = $1 AND item_id = $2`, [buyerId, itemId]).catch(() => null);
    const level = cur?.level || 0;
    const { tier, qty } = enhanceCost(item, level);
    const paid = await db.queryOne(`UPDATE mkt_salvage_part SET count = count - $3 WHERE buyer_id = $1 AND tier = $2 AND count >= $3 RETURNING count`, [buyerId, tier, qty]).catch(() => null);
    if (!paid) return { ok: false, error: "not_enough", need: { tier, qty }, ...(await getForgeState(buyerId)) };
    const q = Math.max(0, Math.min(1, Number(quality) || 0));
    // Enhancement deepens the item's OWN identity: it rolls onto the stats the item already carries.
    const pool = Object.keys(item.stats || {}).filter((k) => STAT_META[k]);
    const keys = pool.length ? pool : ["might"];
    let points = Math.max(1, 1 + Math.round(q * 3) + (grade === "pixel" ? 1 : 0)); // execution → magnitude of the roll
    const upg = await upgradeLevels(buyerId);
    let doubled = false;
    if (Math.random() < chance(upg, "masters_touch")) { points *= 2; doubled = true; } // Master's Touch
    const gained = {};
    for (let i = 0; i < points; i += 1) { const k = keys[Math.floor(Math.random() * keys.length)]; gained[k] = (gained[k] || 0) + 1; }
    const nextBonus = { ...parseBonus(cur?.stat_bonus) };
    for (const [k, v] of Object.entries(gained)) nextBonus[k] = (nextBonus[k] || 0) + v;
    const bestGrade = (GRADE_RANK[grade] || 0) > (GRADE_RANK[cur?.best_grade] || 0) ? grade : cur?.best_grade || grade;
    await db
        .query(
            `INSERT INTO mkt_item_enhance (buyer_id, item_id, level, stat_bonus, best_grade, updated_at) VALUES ($1,$2,$3,$4::jsonb,$5,NOW())
             ON CONFLICT (buyer_id, item_id) DO UPDATE SET level = $3, stat_bonus = $4::jsonb, best_grade = $5, updated_at = NOW()`,
            [buyerId, itemId, level + 1, JSON.stringify(nextBonus), bestGrade]
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
    return { ok: true, itemId, level: level + 1, gained: describeStats(gained), doubled, xp, grade, ...(await getForgeState(buyerId)) };
}

// ── Full forge state for the UI ──
export async function getForgeState(buyerId) {
    if (!buyerId) return null;
    const [bySlot, parts, ownedRows, enhRows, spriteMap, upg, goldRow] = await Promise.all([
        getEquippedIds(buyerId),
        partCounts(buyerId),
        db.query(`SELECT item_id FROM mkt_user_item WHERE buyer_id = $1`, [buyerId]).catch(() => []),
        db.query(`SELECT item_id, level, stat_bonus, best_grade FROM mkt_item_enhance WHERE buyer_id = $1`, [buyerId]).catch(() => []),
        itemSpriteMap().catch(() => ({})),
        upgradeLevels(buyerId),
        db.queryOne(`SELECT COALESCE(gold,0) AS gold FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null),
    ]);
    const dRow = await db.queryOne(`SELECT salvages, enhances, combines, best_grade, claimed FROM mkt_forge_daily WHERE buyer_id = $1 AND day = ${DAY}`, [buyerId]).catch(() => null);
    const claimedSet = new Set(parseBonus(dRow?.claimed) || []);
    const dailies = DAILIES.map((q) => { const prog = Number(dRow?.[q.field] || 0); return { key: q.key, label: q.label, need: q.need, progress: Math.min(prog, q.need), done: prog >= q.need, claimed: claimedSet.has(q.key), rewardLabel: q.rewardLabel }; });
    const equippedIds = new Set(Object.values(bySlot));
    const enhById = new Map();
    for (const r of enhRows) enhById.set(r.item_id, { level: r.level, bonus: parseBonus(r.stat_bonus), bestGrade: r.best_grade });
    const dress = (id) => {
        const it = itemById(id);
        if (!it) return null;
        const enh = enhById.get(id);
        return {
            id, name: it.name, slot: it.slot, rarity: it.rarity, icon: it.icon, flavor: it.flavor || null, sprite: spriteMap[id] || null,
            stats: describeStats(it.stats), salvageTier: rarityTier(it.rarity),
            level: enh?.level || 0, bonus: enh?.bonus ? describeStats(enh.bonus) : null, bestGrade: enh?.bestGrade || null,
        };
    };
    const salvage = (ownedRows || []).map((r) => r.item_id).filter((id) => !equippedIds.has(id)).map(dress).filter(Boolean).sort((a, b) => b.salvageTier - a.salvageTier || a.name.localeCompare(b.name));
    const enhance = Object.values(bySlot).map((id) => { const d = dress(id); if (!d) return null; return { ...d, cost: enhanceCost(itemById(id), d.level) }; }).filter(Boolean).sort((a, b) => b.level - a.level || a.slot.localeCompare(b.slot));
    const partList = PART_TIERS.map((p) => ({ ...p, count: parts[p.tier] || 0, canCombine: (parts[p.tier] || 0) >= COMBINE_COST && p.tier < MAX_TIER }));
    const upgrades = Object.entries(FORGE_UPGRADES).map(([key, u]) => {
        const level = upg[key] || 0;
        return { key, name: u.name, desc: u.desc, level, max: u.max, unit: u.unit, cost: level >= u.max ? null : upgCost(u, level), effect: u.unit === "%" ? `${Math.round(u.per * level * 100)}%` : `${level}` };
    });
    return { parts: partList, salvage, enhance, upgrades, dailies, steadyHand: upg.steady_hand || 0, gold: goldRow?.gold || 0, combineCost: COMBINE_COST, maxTier: MAX_TIER, hearthBg: HEARTH_BG };
}
