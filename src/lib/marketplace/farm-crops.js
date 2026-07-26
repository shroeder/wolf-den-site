import "server-only";

import { db } from "@/lib/db";
import { awardXp } from "@/lib/marketplace/xp.js";
import { logCoin } from "@/lib/marketplace/coins.js";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { bumpQuestProgress } from "@/lib/marketplace/quests.js";
import { syncEarnedBadges } from "@/lib/marketplace/badges.js";
import { sendWebPush } from "@/lib/push/web-push.js";
import { grantConsumable } from "@/lib/marketplace/consumables.js";
import { farmBonuses } from "@/lib/marketplace/farm-bonus.js";
import { getEquippedIds } from "@/lib/marketplace/inventory.js";
import { SEED_PACK_IDS, seedPackById } from "@/lib/marketplace/seed-packs.js";
import { setFarmGrowBonus, setFarmDoubleHarvest } from "@/lib/marketplace/sets.js";
import { collectibleById } from "@/lib/marketplace/collectibles.js";

// ===== Farming =====
// Plant a seed in a plot → it grows over real time → harvest it to SELL for gold (+ a small chance at a loot
// chest). Rain (reported by the client on load) and bought fertilizer cut the remaining grow time; upgrades
// add plots, speed growth, boost seed-finding, raise the petting cap, and improve harvest-chest luck. Seeds
// are found by working the farm itself (harvesting crops + tending pets) AND across the other games (see
// SEED_SOURCES / dropSeedFrom) — you don't buy them, and the farm now sustains its own supply.

// Crop catalog. growMin = minutes to grow at base speed; sell = base gold on harvest; xp = player XP. On TOP of
// that, EVERY harvest rolls one random reward from the shared HARVEST_POOL — and rarer crops shift those odds
// toward the better loot tiers (that's what "rarity does"). Rarer crops also take longer + sell for more.
export const SEEDS = {
    // Gold values sit against the coin scale ($10 = 2,000 coins, so 1g ≈ ½¢). Farming stays a supplement.
    // Common — quick, cheap, found from everyday actions (the daily grind).
    wheat: { name: "Wheat", emoji: "🌾", sprout: "🌱", growMin: 90, sell: 56, xp: 6, rarity: "common" },
    carrot: { name: "Carrot", emoji: "🥕", sprout: "🌱", growMin: 180, sell: 112, xp: 10, rarity: "common" },
    potato: { name: "Potato", emoji: "🥔", sprout: "🌱", growMin: 240, sell: 168, xp: 14, rarity: "common" },
    // Rare — a few hours; from digs, raids, iron chests.
    strawberry: { name: "Strawberries", emoji: "🍓", sprout: "🌱", growMin: 300, sell: 280, xp: 20, rarity: "rare" },
    corn: { name: "Corn", emoji: "🌽", sprout: "🌱", growMin: 420, sell: 420, xp: 26, rarity: "rare" },
    // Epic — half a day; from raids, gold chests, boss kills.
    grape: { name: "Grapes", emoji: "🍇", sprout: "🌿", growMin: 600, sell: 460, xp: 40, rarity: "epic" },
    pumpkin: { name: "Pumpkin", emoji: "🎃", sprout: "🌿", growMin: 900, sell: 720, xp: 62, rarity: "epic" },
    // Legendary — overnight; from gold chests + boss kills only.
    goldenapple: { name: "Golden Apple", emoji: "🍎", sprout: "✨", growMin: 1440, sell: 1150, xp: 130, rarity: "legendary" },
    // Mythic — a day and a half; the jackpot, only from the very best sources.
    starfruit: { name: "Star Fruit", emoji: "⭐", sprout: "✨", growMin: 2160, sell: 2400, xp: 300, rarity: "mythic" },
};
// How good the shared-pool loot odds are for a crop's rarity (shown in the seed picker).
export const LOOT_LABEL = { common: "Basic loot", rare: "Better loot", epic: "Good loot", legendary: "Great loot", mythic: "Best loot" };

// Base chance a harvest yields a BONUS reward on top of the guaranteed gold + XP (~5%). Harvest-luck sources
// nudge it up from here; kept low so the bonus feels special instead of firing every harvest.
const HARVEST_BONUS_CHANCE = 0.05;

export const seedById = (id) => SEEDS[id] || null;
const seedsOfRarity = (r) => Object.keys(SEEDS).filter((id) => SEEDS[id].rarity === r);

// Where seeds are FOUND. Each game action rolls dropSeedFrom(buyerId, source): `chance` (before the Forager
// boost) that a seed drops at all, then a weighted pick of which RARITY, then a random seed of that rarity.
// Everyday actions give common seeds; big/rare events are the only way to find legendary/mythic seeds.
const SEED_SOURCES = {
    boss_strike: { chance: 0.18, rarities: { common: 80, rare: 19, epic: 1 } },
    boss_kill: { chance: 0.65, rarities: { common: 26, rare: 40, epic: 24, legendary: 9, mythic: 1 } },
    sail_dig: { chance: 0.22, rarities: { common: 62, rare: 30, epic: 8 } },
    sail_raid: { chance: 0.28, rarities: { common: 38, rare: 42, epic: 18, legendary: 2 } },
    spin: { chance: 0.12, rarities: { common: 54, rare: 33, epic: 11, legendary: 2 } },
    chest_wooden: { chance: 0.5, rarities: { common: 84, rare: 16 } },
    chest_iron: { chance: 0.6, rarities: { common: 44, rare: 42, epic: 14 } },
    chest_gold: { chance: 0.8, rarities: { common: 14, rare: 38, epic: 33, legendary: 14, mythic: 1 } },
    // Farm-native drops so the loop feeds itself — mostly common, with a slim rare/epic tail. Working the farm
    // (harvesting crops + tending pets) now finds its own seeds, not just the other games.
    harvest_crop: { chance: 0.15, rarities: { common: 78, rare: 18, epic: 4 } },
    pet_farm: { chance: 0.1, rarities: { common: 85, rare: 14, epic: 1 } },
};

// Upgrade tracks — each 5 levels. Effects applied in the helpers below.
export const FARM_UPGRADES = {
    plots: { name: "Extra Plot", emoji: "🟫", max: 5, base: 150, desc: "+1 planting plot" },
    grow: { name: "Green Thumb", emoji: "🌱", max: 5, base: 220, desc: "−8% grow time per level" },
    seedluck: { name: "Forager", emoji: "🍀", max: 5, base: 160, desc: "×0.25 more seeds found per level (a multiplier on the find rate — never a guaranteed drop) from harvests, petting & the other games" },
    petcap: { name: "Pet Whisperer", emoji: "🐾", max: 5, base: 240, desc: "+1 free petting every day" },
    chest: { name: "Lucky Harvest", emoji: "🎁", max: 5, base: 300, desc: "+1% chance per level to bump a harvest reward up a loot tier" },
    seedsaver: { name: "Seed Saver", emoji: "🌰", max: 5, base: 200, desc: "+1% to keep the seed when you harvest" },
};
// Cost curve mirrors Sailing's boat/dig upgrades: quadratic in the NEXT level (base × (level+1)²), not doubling —
// so a full track totals a few thousand gold instead of tens of thousands. base is the level 0→1 price.
export const upgradeCost = (key, level) => Math.round((FARM_UPGRADES[key]?.base || 150) * (level + 1) ** 2);

export const BASE_PLOTS = 3;

// The concrete current→next effect of a track — powers the "now → next" line on each upgrade card.
export function upgradeEffect(key, level) {
    const at = (l) => {
        switch (key) {
            case "plots": return `${BASE_PLOTS + l} plots`;
            case "grow": return `−${8 * l}%`;
            case "seedluck": return `×${(1 + 0.25 * l).toFixed(2)}`;
            case "petcap": return `+${l}/day`;
            case "chest": return `+${1 * l}%`;
            case "seedsaver": return `${l}%`;
            default: return `Lv ${l}`;
        }
    };
    const labels = { plots: "Plots", grow: "Grow time", seedluck: "Seed find", petcap: "Free pettings", chest: "Loot boost", seedsaver: "Seed saved" };
    const max = FARM_UPGRADES[key]?.max || 0;
    return { label: labels[key] || FARM_UPGRADES[key]?.name || key, now: at(Math.min(max, level)), next: at(Math.min(max, level + 1)) };
}
const FERTILIZER_PRICE = 350; // gold per fertilizer
const FERTILIZER_CUT = 0.4; // fertilizer removes 40% of the REMAINING grow time
const RAIN_CUT = 0.3; // logging in during rain removes 30% of remaining time (once per plot per 6h)
const RAIN_GUARD_HOURS = 6;
// ── Shared harvest loot pool ──
// Every crop, on harvest, rolls ONE reward from this shared pool (in addition to its base gold + XP). Rarer
// seeds shift the odds toward the higher TIERS (see RARITY_TIER_WEIGHTS) — that's the payoff for the longer
// grow + rarer seed. The Lucky Harvest upgrade can bump the rolled tier up a level.
const HARVEST_POOL = [
    { tier: 1, type: "gold", amount: 42, label: "+42 🪙" },
    { tier: 1, type: "treat", id: "treat_bone", label: "🦴 a Pet Treat" },
    { tier: 1, type: "xp", amount: 15, label: "✨ +15 XP" },
    { tier: 2, type: "gold", amount: 126, label: "+126 🪙" },
    { tier: 2, type: "treat", id: "treat_snack", label: "🍖 a Hearty Snack" },
    { tier: 2, type: "spin", n: 1, label: "🎡 +1 wheel spin" },
    { tier: 3, type: "chest", chestTier: "wooden", label: "🧰 a Wooden chest" },
    { tier: 3, type: "treat", id: "treat_toy", label: "🧸 a Chew Toy" },
    { tier: 3, type: "seed", band: ["common", "rare"], label: "🌱 a bonus seed" },
    { tier: 4, type: "chest", chestTier: "iron", label: "🧰 an Iron chest" },
    { tier: 4, type: "gold", amount: 385, label: "+385 🪙" },
    { tier: 4, type: "treat", id: "treat_feast", label: "🍲 a Pet Feast" },
    { tier: 4, type: "seed", band: ["rare", "epic"], label: "🌱 a rare seed" },
    { tier: 5, type: "chest", chestTier: "gold", label: "💰 a Gold chest" },
    { tier: 5, type: "gold", amount: 910, label: "+910 🪙" },
    { tier: 5, type: "seed", band: ["epic", "legendary"], label: "🌱 an epic seed" },
    { tier: 5, type: "spin", n: 3, label: "🎡 +3 wheel spins" },
];
const POOL_BY_TIER = HARVEST_POOL.reduce((m, e) => { (m[e.tier] ||= []).push(e); return m; }, {});
// Per-rarity odds over the 5 loot tiers. Common ≈ mostly tier 1-2; mythic ≈ tier 4-5.
const RARITY_TIER_WEIGHTS = {
    common: { 1: 72, 2: 24, 3: 4 },
    rare: { 1: 42, 2: 34, 3: 19, 4: 5 },
    epic: { 1: 18, 2: 30, 3: 34, 4: 16, 5: 2 },
    legendary: { 1: 5, 2: 16, 3: 32, 4: 34, 5: 13 },
    mythic: { 2: 8, 3: 22, 4: 40, 5: 30 },
};

const lvl = (up, key) => Math.max(0, Math.min(FARM_UPGRADES[key]?.max || 0, Number(up?.[key]) || 0));
const growMultiplier = (up) => Math.max(0.4, 1 - 0.08 * lvl(up, "grow")); // Green Thumb
export const plotCount = (up) => BASE_PLOTS + lvl(up, "plots");
export const farmPetCapBonus = (up) => lvl(up, "petcap");
export const seedLuckMult = (up) => 1 + 0.25 * lvl(up, "seedluck");
const luckyHarvestLevel = (up) => lvl(up, "chest"); // Lucky Harvest: bumps the loot tier (see rollHarvestReward)
const seedSaverChance = (up) => 0.01 * lvl(up, "seedsaver"); // Seed Saver: 1% per level to recover the planted seed

// Roll ONE reward from the shared loot pool, weighted by the crop's rarity; Lucky Harvest + placed-decoration
// harvest-luck can promote the tier.
async function rollHarvestReward(buyerId, rarity, luckyLevel = 0, bonusPromote = 0) {
    let tier = Number(weightedPick(RARITY_TIER_WEIGHTS[rarity] || RARITY_TIER_WEIGHTS.common));
    // Lucky Harvest (1%/level) + placed-deco harvest-luck, but the COMBINED promote chance is capped at
    // 35% (was uncapped and could hit ~70% with maxed decos — far too strong).
    if (Math.random() < Math.min(0.35, 0.01 * luckyLevel + bonusPromote)) tier = Math.min(5, tier + 1);
    const pool = POOL_BY_TIER[tier] || POOL_BY_TIER[1];
    const pick = pool[Math.floor(Math.random() * pool.length)];
    let label = pick.label;
    try {
        if (pick.type === "gold") { await db.query(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1`, [buyerId, pick.amount]); await logCoin(buyerId, pick.amount, "harvest_loot"); }
        else if (pick.type === "xp") await awardXp(buyerId, "harvest", { points: pick.amount, gold: 0 });
        else if (pick.type === "treat") await grantConsumable(buyerId, pick.id, 1);
        else if (pick.type === "spin") await db.query(`UPDATE mkt_buyer SET spin_tokens = COALESCE(spin_tokens, 0) + $2 WHERE id = $1`, [buyerId, pick.n]);
        else if (pick.type === "chest") await db.query(`INSERT INTO mkt_user_chest (buyer_id, tier, count) VALUES ($1, $2, 1) ON CONFLICT (buyer_id, tier) DO UPDATE SET count = mkt_user_chest.count + 1`, [buyerId, pick.chestTier]);
        else if (pick.type === "seed") {
            const band = pick.band || ["common"];
            const p = seedsOfRarity(band[Math.floor(Math.random() * band.length)]);
            const sid = p.length ? p[Math.floor(Math.random() * p.length)] : "wheat";
            await grantSeed(buyerId, sid);
            label = `🌱 a ${SEEDS[sid].name} seed`;
        }
    } catch { /* best-effort */ }
    return { label, tier, chest: pick.type === "chest" ? pick.chestTier : null };
}

function weightedPick(weights) {
    const total = Object.values(weights).reduce((s, w) => s + w, 0);
    let r = Math.random() * total;
    for (const [k, w] of Object.entries(weights)) { if ((r -= w) < 0) return k; }
    return Object.keys(weights)[0];
}

async function loadFarmBuyer(buyerId) {
    return db.queryOne(`SELECT COALESCE(gold,0) AS gold, COALESCE(farm_upgrades,'{}'::jsonb) AS farm_upgrades, COALESCE(farm_fertilizer,0) AS farm_fertilizer, COALESCE(farm_harvest_luck,0) AS farm_harvest_luck, COALESCE(farm_plot_pos,'{}'::jsonb) AS farm_plot_pos FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
}

// Default tidy-cluster position for a plot when the buyer hasn't dragged it somewhere custom. Mirrors the
// layout ScenePlots used before plots became movable, so nothing shifts until the player rearranges.
function defaultPlotPos(i, n) {
    const span = Math.min(6 * (n - 1), 20);
    return { x: n === 1 ? 18 : 15 + (i / (n - 1)) * span, y: 84 + (i % 2) * 6 };
}

// Full garden state for the client: every plot (empty or growing/ready), the seed bag, upgrades + costs,
// fertilizer stock, and how many crops are ready right now (for the alert badge).
export async function getGarden(buyerId) {
    if (!buyerId) return null;
    const [buyer, plots, seeds, packRows] = await Promise.all([
        loadFarmBuyer(buyerId),
        db.query(`SELECT slot, seed_id, planted_at, ready_at, fertilized FROM mkt_farm_plot WHERE buyer_id = $1 ORDER BY slot`, [buyerId]).catch(() => []),
        db.query(`SELECT seed_id, count FROM mkt_farm_seed WHERE buyer_id = $1 AND count > 0`, [buyerId]).catch(() => []),
        db.query(`SELECT consumable_id, count FROM mkt_user_consumable WHERE buyer_id = $1 AND count > 0 AND consumable_id = ANY($2)`, [buyerId, SEED_PACK_IDS]).catch(() => []),
    ]);
    const up = buyer?.farm_upgrades || {};
    const n = plotCount(up);
    const posMap = buyer?.farm_plot_pos || {};
    const byslot = new Map((plots || []).map((p) => [p.slot, p]));
    const now = Date.now();
    const gardenPlots = [];
    let readyCount = 0;
    const posFor = (i) => { const c = posMap[i] || posMap[String(i)]; const d = defaultPlotPos(i, n); return { x: Number.isFinite(c?.x) ? c.x : d.x, y: Number.isFinite(c?.y) ? c.y : d.y }; };
    for (let i = 0; i < n; i += 1) {
        const pos = posFor(i);
        const p = byslot.get(i);
        if (!p) { gardenPlots.push({ slot: i, empty: true, x: pos.x, y: pos.y }); continue; }
        const def = seedById(p.seed_id);
        const readyMs = new Date(p.ready_at).getTime();
        const ready = readyMs <= now;
        if (ready) readyCount += 1;
        gardenPlots.push({
            x: pos.x, y: pos.y,
            slot: i, empty: false, seedId: p.seed_id, name: def?.name || p.seed_id, emoji: def?.emoji || "🌱",
            sprout: def?.sprout || "🌱", sell: def?.sell || 0, xp: def?.xp || 0, loot: LOOT_LABEL[def?.rarity] || null, rarity: def?.rarity || "common",
            plantedAt: new Date(p.planted_at).toISOString(), readyAt: new Date(p.ready_at).toISOString(),
            ready, secondsLeft: Math.max(0, Math.round((readyMs - now) / 1000)), fertilized: p.fertilized,
        });
    }
    const seedBag = (seeds || []).map((s) => { const d = seedById(s.seed_id); return { id: s.seed_id, count: s.count, ...(d || { name: s.seed_id, emoji: "🌱" }), loot: LOOT_LABEL[d?.rarity] || null }; })
        .filter((s) => SEEDS[s.id]);
    const upgrades = Object.entries(FARM_UPGRADES).map(([key, def]) => {
        const level = lvl(up, key);
        return { key, name: def.name, emoji: def.emoji, desc: def.desc, level, max: def.max, cost: level >= def.max ? null : upgradeCost(key, level), eff: upgradeEffect(key, level) };
    });
    // Seed packs the member owns → openable right on the farm (order matches the tier ladder). Seeds ONLY come
    // from packs now (buy them in the shop, open them here).
    const seedPacks = SEED_PACK_IDS
        .map((id) => { const owned = (packRows || []).find((r) => r.consumable_id === id); const def = seedPackById(id); return owned && def ? { id, count: owned.count, name: def.name, emoji: def.emoji, tier: def.tier, desc: def.desc } : null; })
        .filter(Boolean);
    return {
        plots: gardenPlots,
        plotCount: n,
        seedBag,
        seedPacks,
        upgrades,
        fertilizer: buyer?.farm_fertilizer || 0,
        fertilizerPrice: FERTILIZER_PRICE,
        gold: buyer?.gold || 0,
        readyCount,
    };
}

// Plant a seed you hold into an empty plot. Grow time is scaled by the Green Thumb upgrade.
export async function plantSeed(buyerId, slot, seedId) {
    if (!buyerId || !SEEDS[seedId]) return { ok: false, error: "bad_request" };
    const buyer = await loadFarmBuyer(buyerId);
    const up = buyer?.farm_upgrades || {};
    if (slot < 0 || slot >= plotCount(up)) return { ok: false, error: "bad_slot" };
    // Consume one seed atomically.
    const dec = await db.queryOne(`UPDATE mkt_farm_seed SET count = count - 1 WHERE buyer_id = $1 AND seed_id = $2 AND count > 0 RETURNING count`, [buyerId, seedId]).catch(() => null);
    if (!dec) return { ok: false, error: "no_seed" };
    // Farm grow-speed buff (decorations + equipped gear farm affix + equipped pet) stacks on top of the Green
    // Thumb upgrade (both cut grow time).
    const buffs = await farmBonuses(buyerId).catch(() => null);
    const decoGrow = Math.max(0.5, 1 - (buffs?.growSpeed || 0) / 100);
    // Forager's Kit full-set capstone: crops grow 15% faster (a flat multiplier on top of every other speedup).
    const equipped = await getEquippedIds(buyerId).catch(() => ({}));
    const capGrow = Math.max(0.5, 1 - setFarmGrowBonus(equipped));
    const growMs = Math.round(SEEDS[seedId].growMin * 60000 * growMultiplier(up) * decoGrow * capGrow);
    const row = await db.queryOne(
        `INSERT INTO mkt_farm_plot (buyer_id, slot, seed_id, planted_at, ready_at)
         VALUES ($1, $2, $3, NOW(), NOW() + ($4 || ' milliseconds')::interval)
         ON CONFLICT (buyer_id, slot) DO NOTHING RETURNING id`,
        [buyerId, slot, seedId, growMs]
    ).catch(() => null);
    if (!row) {
        // Plot was occupied — refund the seed.
        await db.query(`UPDATE mkt_farm_seed SET count = count + 1 WHERE buyer_id = $1 AND seed_id = $2`, [buyerId, seedId]).catch(() => {});
        return { ok: false, error: "occupied" };
    }
    await trackActivity(buyerId, "plant_seed", { seedId }).catch(() => {});
    await bumpQuestProgress(buyerId, "plant_seed", 1).catch(() => {});
    return { ok: true, garden: await getGarden(buyerId) };
}

// Harvest a READY plot: sell it for gold + XP, small weighted chance at a loot chest, then clear the plot.
export async function harvestPlot(buyerId, slot) {
    if (!buyerId) return { ok: false, error: "bad_request" };
    // Atomically claim the plot only if it's actually ready (guards against double-harvest).
    const claimed = await db.queryOne(`DELETE FROM mkt_farm_plot WHERE buyer_id = $1 AND slot = $2 AND ready_at <= NOW() RETURNING seed_id`, [buyerId, slot]).catch(() => null);
    if (!claimed) return { ok: false, error: "not_ready" };
    const def = seedById(claimed.seed_id);
    // Farm buffs (decorations + equipped gear farm affix + equipped pet): more harvest gold, better loot odds,
    // better seed-save luck.
    const buffs = await farmBonuses(buyerId).catch(() => null);
    const xp = def?.xp || 0;
    let gold = Math.round((def?.sell || 0) * (1 + (buffs?.goldHarvest || 0) / 100));
    // Harvester's Garb full-set capstone: a chance the whole harvest yields DOUBLE gold.
    const equipped = await getEquippedIds(buyerId).catch(() => ({}));
    let doubled = false;
    const dblChance = setFarmDoubleHarvest(equipped);
    if (dblChance > 0 && Math.random() < dblChance) { gold *= 2; doubled = true; }
    const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2, updated_at = NOW() WHERE id = $1 RETURNING gold`, [buyerId, gold]).catch(() => null);
    await logCoin(buyerId, gold, "harvest", { balanceAfter: paid?.gold, meta: { seedId: claimed.seed_id } }).catch(() => {});
    if (xp > 0) await awardXp(buyerId, "harvest", { points: xp, gold: 0 }).catch(() => {});
    const buyer = await loadFarmBuyer(buyerId);
    const rarity = def?.rarity || "common";
    // Harvest Charm consumable: a banked charge adds a flat +20% loot-tier promote chance for THIS harvest, then
    // burns one charge (atomic guard so a charge is spent at most once).
    let charmActive = false;
    if ((buyer?.farm_harvest_luck || 0) > 0) {
        const used = await db.queryOne(`UPDATE mkt_buyer SET farm_harvest_luck = farm_harvest_luck - 1 WHERE id = $1 AND farm_harvest_luck > 0 RETURNING farm_harvest_luck`, [buyerId]).catch(() => null);
        charmActive = Boolean(used);
    }
    // Bonus loot: MOST harvests are just the guaranteed gold + XP. Only ~5% of the time do you ALSO pull an
    // extra reward from the shared pool (chest / bonus seed / treat / spin / bonus gold). Harvest-luck sources
    // (Lucky Harvest deco/gear + an active Harvest Charm) raise both the odds a little AND the tier when it fires.
    let loot = { label: null, chest: null, tier: 0 };
    const bonusChance = HARVEST_BONUS_CHANCE + (buffs?.harvestLuck || 0) / 400 + (charmActive ? 0.05 : 0);
    if (Math.random() < bonusChance) {
        loot = await rollHarvestReward(buyerId, rarity, luckyHarvestLevel(buyer?.farm_upgrades || {}), charmActive ? 0.2 : 0);
    }
    const bonus = loot.label;
    const chest = loot.chest;
    // Seed Saver upgrade (+ deco seed-luck) — chance to recover the seed you planted (rare crops stay sustainable).
    let savedSeed = false;
    if (Math.random() < seedSaverChance(buyer?.farm_upgrades || {}) + (buffs?.seedLuck || 0) / 200) {
        await grantSeed(buyerId, claimed.seed_id).catch(() => {});
        savedSeed = true;
    }
    await trackActivity(buyerId, "harvest_crop", { seedId: claimed.seed_id, rarity, gold, loot: loot.label, tier: loot.tier }).catch(() => {});
    await bumpQuestProgress(buyerId, "harvest_crop", 1).catch(() => {});
    // Earned cosmetic: the "Harvest Crown" border at 20 lifetime harvests. Reuses the harvest_crop activity
    // count (just logged above), so it needs no new counter. Idempotent grant into mkt_cosmetic_unlock.
    const harvested = await db.queryOne(`SELECT COUNT(*)::int AS n FROM mkt_activity_event WHERE buyer_id = $1 AND event = 'harvest_crop'`, [buyerId]).catch(() => null);
    if ((harvested?.n || 0) >= 20) await db.query(`INSERT INTO mkt_cosmetic_unlock (buyer_id, category, ref) VALUES ($1, 'border', 'harvest_crown') ON CONFLICT DO NOTHING`, [buyerId]).catch(() => {});
    // FARM-ONLY pet: the Field Mouse is earned at 50 lifetime harvests (a farm-exclusive companion, never sold
    // or dropped elsewhere). Idempotent grant; flagged as new only when the row is actually inserted.
    let newPet = null;
    if ((harvested?.n || 0) >= 50) {
        const ins = await db.query(`INSERT INTO mkt_cosmetic_unlock (buyer_id, category, ref) VALUES ($1, 'pet', 'field_mouse') ON CONFLICT DO NOTHING RETURNING ref`, [buyerId]).catch(() => []);
        if (ins.length) { const p = collectibleById("field_mouse"); newPet = { id: "field_mouse", name: p?.name || "Field Mouse", rarity: p?.rarity || "rare" }; }
    }
    // Epic-or-better harvest also credits the "harvest a rare crop" quest.
    if (rarity === "epic" || rarity === "legendary" || rarity === "mythic") await bumpQuestProgress(buyerId, "harvest_rare", 1).catch(() => {});
    // Seeds now come from packs, not from every harvest — the old always-on seed drop is gone (it's part of why
    // harvests "rewarded too often"). A bonus seed can still come from the ~5% loot roll above, and the Seed
    // Saver upgrade still recovers the planted seed. Kept null so the client toast simply omits it.
    const foundSeed = null;
    await syncEarnedBadges(buyerId).catch(() => {}); // grant any farming badges just earned
    const freshGold = await db.queryOne(`SELECT gold FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    return { ok: true, slot, name: def?.name || claimed.seed_id, emoji: def?.emoji || "🌾", gold, doubled, xp, chest, bonus, savedSeed, savedEmoji: savedSeed ? def?.emoji : null, foundSeed, newPet, goldAfter: freshGold?.gold ?? paid?.gold ?? null, garden: await getGarden(buyerId) };
}

// Buy a fertilizer (gold sink). Fertilizer is applied to a specific growing crop to cut its remaining time.
export async function buyFertilizer(buyerId) {
    if (!buyerId) return { ok: false, error: "bad_request" };
    const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`, [buyerId, FERTILIZER_PRICE]).catch(() => null);
    if (!paid) return { ok: false, error: "insufficient" };
    await db.query(`UPDATE mkt_buyer SET farm_fertilizer = COALESCE(farm_fertilizer,0) + 1 WHERE id = $1`, [buyerId]).catch(() => {});
    await logCoin(buyerId, -FERTILIZER_PRICE, "farm_fertilizer", { balanceAfter: paid.gold }).catch(() => {});
    return { ok: true, garden: await getGarden(buyerId) };
}

// Apply one fertilizer to a growing crop: removes 40% of its remaining time (once per crop).
export async function applyFertilizer(buyerId, slot) {
    if (!buyerId) return { ok: false, error: "bad_request" };
    const plot = await db.queryOne(`SELECT ready_at, fertilized FROM mkt_farm_plot WHERE buyer_id = $1 AND slot = $2`, [buyerId, slot]).catch(() => null);
    if (!plot) return { ok: false, error: "empty" };
    if (plot.fertilized) return { ok: false, error: "already_fertilized" };
    if (new Date(plot.ready_at).getTime() <= Date.now()) return { ok: false, error: "already_ready" };
    const dec = await db.queryOne(`UPDATE mkt_buyer SET farm_fertilizer = farm_fertilizer - 1 WHERE id = $1 AND farm_fertilizer > 0 RETURNING farm_fertilizer`, [buyerId]).catch(() => null);
    if (!dec) return { ok: false, error: "no_fertilizer" };
    // Farm fertilizer-power buff (decorations + equipped gear farm affix + equipped pet) deepens the cut
    // (base 40%, capped at 85%).
    const buffs = await farmBonuses(buyerId).catch(() => null);
    const cut = Math.min(0.85, FERTILIZER_CUT * (1 + (buffs?.fertPower || 0) / 100));
    // remaining = ready_at - now; new ready_at = now + remaining*(1-CUT)
    await db.query(
        `UPDATE mkt_farm_plot SET fertilized = TRUE,
                ready_at = NOW() + (GREATEST(0, EXTRACT(EPOCH FROM (ready_at - NOW())) * $3) || ' seconds')::interval
          WHERE buyer_id = $1 AND slot = $2`,
        [buyerId, slot, 1 - cut]
    ).catch(() => {});
    await trackActivity(buyerId, "fertilize_crop", { slot }).catch(() => {});
    await bumpQuestProgress(buyerId, "fertilize_crop", 1).catch(() => {});
    await syncEarnedBadges(buyerId).catch(() => {}); // Fertilizer Baron
    return { ok: true, garden: await getGarden(buyerId) };
}

// Rain check: when the client reports it's raining on load, cut 30% off every growing crop's remaining time,
// guarded so it can only help each plot once every RAIN_GUARD_HOURS.
export async function applyRainBoost(buyerId) {
    if (!buyerId) return { ok: false };
    const res = await db.query(
        `UPDATE mkt_farm_plot
            SET ready_at = NOW() + (GREATEST(0, EXTRACT(EPOCH FROM (ready_at - NOW())) * $2) || ' seconds')::interval,
                rain_at = NOW()
          WHERE buyer_id = $1 AND ready_at > NOW()
            AND (rain_at IS NULL OR rain_at < NOW() - ($3 || ' hours')::interval)
          RETURNING slot`,
        [buyerId, 1 - RAIN_CUT, RAIN_GUARD_HOURS]
    ).catch(() => []);
    const boosted = (res?.rows || res || []).length;
    return { ok: true, boosted, garden: boosted ? await getGarden(buyerId) : null };
}

// Drag a plot to a custom spot on the farm (owner arranging their own garden). Stores {x,y} percent for the
// slot in farm_plot_pos; clamped to stay on-field. Returns the fresh garden so the scene + panel stay in sync.
export async function movePlot(buyerId, slot, x, y) {
    if (!buyerId) return { ok: false, error: "bad_request" };
    const s = Number(slot);
    const buyer = await loadFarmBuyer(buyerId);
    const n = plotCount(buyer?.farm_upgrades || {});
    if (!Number.isInteger(s) || s < 0 || s >= n) return { ok: false, error: "bad_slot" };
    const clamp = (v, lo, hi) => { const num = Number(v); return Math.max(lo, Math.min(hi, Number.isFinite(num) ? num : lo)); };
    const pos = { x: clamp(x, 3, 97), y: clamp(y, 20, 96) };
    await db.query(`UPDATE mkt_buyer SET farm_plot_pos = jsonb_set(COALESCE(farm_plot_pos,'{}'::jsonb), $2, $3::jsonb, true) WHERE id = $1`, [buyerId, `{${s}}`, JSON.stringify(pos)]).catch(() => {});
    return { ok: true, garden: await getGarden(buyerId) };
}

// Buy the next level of an upgrade track (gold sink).
export async function buyUpgrade(buyerId, key) {
    if (!buyerId || !FARM_UPGRADES[key]) return { ok: false, error: "bad_request" };
    const buyer = await loadFarmBuyer(buyerId);
    const up = buyer?.farm_upgrades || {};
    const level = lvl(up, key);
    if (level >= FARM_UPGRADES[key].max) return { ok: false, error: "maxed" };
    const cost = upgradeCost(key, level);
    const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`, [buyerId, cost]).catch(() => null);
    if (!paid) return { ok: false, error: "insufficient" };
    await db.query(`UPDATE mkt_buyer SET farm_upgrades = jsonb_set(COALESCE(farm_upgrades,'{}'::jsonb), $2, to_jsonb($3::int), true) WHERE id = $1`, [buyerId, `{${key}}`, level + 1]).catch(() => {});
    await logCoin(buyerId, -cost, "farm_upgrade", { balanceAfter: paid.gold, meta: { key, level: level + 1 } }).catch(() => {});
    return { ok: true, garden: await getGarden(buyerId) };
}

// Grant a seed (or a random weighted one) to a member. Called by other game systems when they "find" a seed;
// the drop chance passed in is scaled by the member's Forager upgrade.
export async function grantSeed(buyerId, seedId) {
    if (!buyerId || !SEEDS[seedId]) return;
    await db.query(
        `INSERT INTO mkt_farm_seed (buyer_id, seed_id, count) VALUES ($1, $2, 1)
         ON CONFLICT (buyer_id, seed_id) DO UPDATE SET count = mkt_farm_seed.count + 1`,
        [buyerId, seedId]
    ).catch(() => {});
}

// Starter bag every member gets exactly once (at signup, backfilled for existing members via migration 234):
// 3 each of the three low-level seeds (wheat/carrot/potato), so the farm loop is obvious from the first visit
// instead of an empty plot.
export async function grantStarterSeeds(buyerId) {
    if (!buyerId) return;
    // Atomic claim: flip the once-only flag first so any join path can call this without ever double-granting.
    const won = await db
        .queryOne(`UPDATE mkt_buyer SET starter_seeds_granted = true WHERE id = $1 AND starter_seeds_granted = false RETURNING id`, [buyerId])
        .catch(() => null);
    if (!won) return;
    await db
        .query(
            `INSERT INTO mkt_farm_seed (buyer_id, seed_id, count)
             VALUES ($1,'wheat',3), ($1,'carrot',3), ($1,'potato',3)
             ON CONFLICT (buyer_id, seed_id) DO UPDATE SET count = mkt_farm_seed.count + EXCLUDED.count`,
            [buyerId]
        )
        .catch(() => {});
}

// Grant a harvested crop's signature yield; returns a short human string for the harvest toast (or null).
// Roll to drop a seed from another game system (source keys in SEED_SOURCES). Returns { seedId, name, emoji,
// rarity } or null. Best-effort — never throws into the caller. The drop chance is scaled by the Forager
// upgrade; the RARITY is weighted per source so rare crops only come from big events.
export async function dropSeedFrom(buyerId, source) {
    try {
        const cfg = SEED_SOURCES[source];
        if (!buyerId || !cfg) return null;
        const buyer = await loadFarmBuyer(buyerId);
        const chance = Math.min(0.95, cfg.chance * seedLuckMult(buyer?.farm_upgrades || {}));
        if (Math.random() >= chance) return null;
        const rarity = weightedPick(cfg.rarities);
        const pool = seedsOfRarity(rarity);
        const seedId = pool.length ? pool[Math.floor(Math.random() * pool.length)] : "wheat";
        await grantSeed(buyerId, seedId);
        const def = SEEDS[seedId];
        return { seedId, name: def.name, emoji: def.emoji, rarity: def.rarity };
    } catch {
        return null;
    }
}

// Crops-ready push: web-push each member whose crop(s) just finished and haven't been announced yet (guarded
// by notified_at so it fires once per crop). Called by the crops-ready cron.
export async function runCropsReadyNudge() {
    const rows = await db
        .query(
            `SELECT p.buyer_id, p.seed_id FROM mkt_farm_plot p
              WHERE p.ready_at <= NOW() AND p.notified_at IS NULL
                AND EXISTS (SELECT 1 FROM mkt_web_push w WHERE w.buyer_id = p.buyer_id)
              ORDER BY p.buyer_id`
        )
        .catch(() => []);
    const byBuyer = new Map();
    for (const r of rows) { if (!byBuyer.has(r.buyer_id)) byBuyer.set(r.buyer_id, []); byBuyer.get(r.buyer_id).push(r); }
    let sent = 0;
    for (const [buyerId, plots] of byBuyer) {
        const first = seedById(plots[0].seed_id);
        const body = plots.length === 1
            ? `Your ${first?.name || "crop"} is ready — harvest it before the plot sits idle.`
            : `${plots.length} crops are ready to harvest on your farm!`;
        await sendWebPush(buyerId, { title: "🌾 Harvest time!", body, url: "/marketplace/farm", tag: "crops-ready" }).catch(() => {});
        sent += 1;
    }
    // Mark every ready-but-unannounced plot as notified so we never re-push it (even for members with no sub).
    await db.query(`UPDATE mkt_farm_plot SET notified_at = NOW() WHERE ready_at <= NOW() AND notified_at IS NULL`).catch(() => {});
    return { sent, plots: rows.length };
}
