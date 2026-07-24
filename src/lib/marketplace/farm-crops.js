import "server-only";

import { db } from "@/lib/db";
import { awardXp } from "@/lib/marketplace/xp.js";
import { logCoin } from "@/lib/marketplace/coins.js";
import { addChests } from "@/lib/marketplace/chests.js";

// ===== Farming =====
// Plant a seed in a plot → it grows over real time → harvest it to SELL for gold (+ a small chance at a loot
// chest). Rain (reported by the client on load) and bought fertilizer cut the remaining grow time; upgrades
// add plots, speed growth, boost seed-finding, raise the petting cap, and improve harvest-chest luck. Seeds
// are found across the other games (see maybeDropSeed) — you don't buy them.

// Crop catalog. growMin = minutes to grow at base speed; sell = gold on harvest; xp = player XP on harvest.
export const SEEDS = {
    wheat: { name: "Wheat", emoji: "🌾", sprout: "🌱", growMin: 90, sell: 140, xp: 12, rarity: "common" },
    carrot: { name: "Carrot", emoji: "🥕", sprout: "🌱", growMin: 180, sell: 300, xp: 20, rarity: "common" },
    strawberry: { name: "Strawberries", emoji: "🍓", sprout: "🌱", growMin: 300, sell: 560, xp: 34, rarity: "rare" },
    corn: { name: "Corn", emoji: "🌽", sprout: "🌱", growMin: 420, sell: 820, xp: 48, rarity: "rare" },
    grape: { name: "Grapes", emoji: "🍇", sprout: "🌿", growMin: 600, sell: 1250, xp: 70, rarity: "epic" },
    pumpkin: { name: "Pumpkin", emoji: "🎃", sprout: "🌿", growMin: 900, sell: 2100, xp: 110, rarity: "epic" },
    goldenapple: { name: "Golden Apple", emoji: "🍎", sprout: "✨", growMin: 1440, sell: 4500, xp: 240, rarity: "legendary" },
};
export const seedById = (id) => SEEDS[id] || null;

// Weighted seed drop table (rarer crops are rarer finds).
const SEED_DROP_WEIGHTS = { wheat: 40, carrot: 26, strawberry: 15, corn: 10, grape: 5, pumpkin: 3, goldenapple: 1 };

// Upgrade tracks — each 5 levels, cost doubles per level. Effects applied in the helpers below.
export const FARM_UPGRADES = {
    plots: { name: "Extra Plot", emoji: "🟫", max: 5, base: 800, desc: "+1 planting plot" },
    grow: { name: "Green Thumb", emoji: "🌱", max: 5, base: 1200, desc: "−8% grow time per level" },
    seedluck: { name: "Forager", emoji: "🍀", max: 5, base: 1000, desc: "+25% seeds found across the games" },
    petcap: { name: "Pet Whisperer", emoji: "🐾", max: 5, base: 1500, desc: "+1 free petting every day" },
    chest: { name: "Lucky Harvest", emoji: "🎁", max: 5, base: 2500, desc: "+0.25% chest-on-harvest chance" },
};
export const upgradeCost = (key, level) => Math.round((FARM_UPGRADES[key]?.base || 1000) * 2 ** level);

export const BASE_PLOTS = 3;
const FERTILIZER_PRICE = 350; // gold per fertilizer
const FERTILIZER_CUT = 0.4; // fertilizer removes 40% of the REMAINING grow time
const RAIN_CUT = 0.3; // logging in during rain removes 30% of remaining time (once per plot per 6h)
const RAIN_GUARD_HOURS = 6;
const CHEST_BASE = 0.0025; // 0.25% base chest-on-harvest, +0.25% per "chest" upgrade level
const CHEST_PER_LEVEL = 0.0025;
const HARVEST_CHEST_WEIGHTS = { wooden: 80, iron: 16, gold: 4 }; // weighted toward the worst tier

const lvl = (up, key) => Math.max(0, Math.min(FARM_UPGRADES[key]?.max || 0, Number(up?.[key]) || 0));
const growMultiplier = (up) => Math.max(0.4, 1 - 0.08 * lvl(up, "grow")); // Green Thumb
export const plotCount = (up) => BASE_PLOTS + lvl(up, "plots");
export const farmPetCapBonus = (up) => lvl(up, "petcap");
export const seedLuckMult = (up) => 1 + 0.25 * lvl(up, "seedluck");
const chestChance = (up) => CHEST_BASE + CHEST_PER_LEVEL * lvl(up, "chest");

function weightedPick(weights) {
    const total = Object.values(weights).reduce((s, w) => s + w, 0);
    let r = Math.random() * total;
    for (const [k, w] of Object.entries(weights)) { if ((r -= w) < 0) return k; }
    return Object.keys(weights)[0];
}

async function loadFarmBuyer(buyerId) {
    return db.queryOne(`SELECT COALESCE(gold,0) AS gold, COALESCE(farm_upgrades,'{}'::jsonb) AS farm_upgrades, COALESCE(farm_fertilizer,0) AS farm_fertilizer FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
}

// Full garden state for the client: every plot (empty or growing/ready), the seed bag, upgrades + costs,
// fertilizer stock, and how many crops are ready right now (for the alert badge).
export async function getGarden(buyerId) {
    if (!buyerId) return null;
    const [buyer, plots, seeds] = await Promise.all([
        loadFarmBuyer(buyerId),
        db.query(`SELECT slot, seed_id, planted_at, ready_at, fertilized FROM mkt_farm_plot WHERE buyer_id = $1 ORDER BY slot`, [buyerId]).catch(() => []),
        db.query(`SELECT seed_id, count FROM mkt_farm_seed WHERE buyer_id = $1 AND count > 0`, [buyerId]).catch(() => []),
    ]);
    const up = buyer?.farm_upgrades || {};
    const n = plotCount(up);
    const byslot = new Map((plots || []).map((p) => [p.slot, p]));
    const now = Date.now();
    const gardenPlots = [];
    let readyCount = 0;
    for (let i = 0; i < n; i += 1) {
        const p = byslot.get(i);
        if (!p) { gardenPlots.push({ slot: i, empty: true }); continue; }
        const def = seedById(p.seed_id);
        const readyMs = new Date(p.ready_at).getTime();
        const ready = readyMs <= now;
        if (ready) readyCount += 1;
        gardenPlots.push({
            slot: i, empty: false, seedId: p.seed_id, name: def?.name || p.seed_id, emoji: def?.emoji || "🌱",
            sprout: def?.sprout || "🌱", sell: def?.sell || 0, rarity: def?.rarity || "common",
            plantedAt: new Date(p.planted_at).toISOString(), readyAt: new Date(p.ready_at).toISOString(),
            ready, secondsLeft: Math.max(0, Math.round((readyMs - now) / 1000)), fertilized: p.fertilized,
        });
    }
    const seedBag = (seeds || []).map((s) => ({ id: s.seed_id, count: s.count, ...(seedById(s.seed_id) || { name: s.seed_id, emoji: "🌱" }) }))
        .filter((s) => SEEDS[s.id]);
    const upgrades = Object.entries(FARM_UPGRADES).map(([key, def]) => {
        const level = lvl(up, key);
        return { key, name: def.name, emoji: def.emoji, desc: def.desc, level, max: def.max, cost: level >= def.max ? null : upgradeCost(key, level) };
    });
    return {
        plots: gardenPlots,
        plotCount: n,
        seedBag,
        upgrades,
        fertilizer: buyer?.farm_fertilizer || 0,
        fertilizerPrice: FERTILIZER_PRICE,
        gold: buyer?.gold || 0,
        readyCount,
        chestPct: Math.round(chestChance(up) * 10000) / 100,
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
    const growMs = Math.round(SEEDS[seedId].growMin * 60000 * growMultiplier(up));
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
    return { ok: true, garden: await getGarden(buyerId) };
}

// Harvest a READY plot: sell it for gold + XP, small weighted chance at a loot chest, then clear the plot.
export async function harvestPlot(buyerId, slot) {
    if (!buyerId) return { ok: false, error: "bad_request" };
    // Atomically claim the plot only if it's actually ready (guards against double-harvest).
    const claimed = await db.queryOne(`DELETE FROM mkt_farm_plot WHERE buyer_id = $1 AND slot = $2 AND ready_at <= NOW() RETURNING seed_id`, [buyerId, slot]).catch(() => null);
    if (!claimed) return { ok: false, error: "not_ready" };
    const def = seedById(claimed.seed_id);
    const gold = def?.sell || 0;
    const xp = def?.xp || 0;
    const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2, updated_at = NOW() WHERE id = $1 RETURNING gold`, [buyerId, gold]).catch(() => null);
    await logCoin(buyerId, gold, "harvest", { balanceAfter: paid?.gold, meta: { seedId: claimed.seed_id } }).catch(() => {});
    if (xp > 0) await awardXp(buyerId, "harvest", { points: xp, gold: 0 }).catch(() => {});
    // Rare loot chest, weighted toward the worst tier.
    const buyer = await loadFarmBuyer(buyerId);
    let chest = null;
    if (Math.random() < chestChance(buyer?.farm_upgrades || {})) {
        const tier = weightedPick(HARVEST_CHEST_WEIGHTS);
        await addChests(buyerId, { [tier]: 1 }).catch(() => {});
        chest = tier;
    }
    return { ok: true, slot, name: def?.name || claimed.seed_id, emoji: def?.emoji || "🌾", gold, xp, chest, goldAfter: paid?.gold ?? null, garden: await getGarden(buyerId) };
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
    // remaining = ready_at - now; new ready_at = now + remaining*(1-CUT)
    await db.query(
        `UPDATE mkt_farm_plot SET fertilized = TRUE,
                ready_at = NOW() + (GREATEST(0, EXTRACT(EPOCH FROM (ready_at - NOW())) * $3) || ' seconds')::interval
          WHERE buyer_id = $1 AND slot = $2`,
        [buyerId, slot, 1 - FERTILIZER_CUT]
    ).catch(() => {});
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

// Roll to drop a seed from another game system. baseChance is the per-event chance BEFORE the Forager boost.
// Returns the granted seed id (or null). Best-effort — never throws into the caller.
export async function maybeDropSeed(buyerId, baseChance = 0.15) {
    try {
        if (!buyerId) return null;
        const buyer = await loadFarmBuyer(buyerId);
        const chance = Math.min(0.9, baseChance * seedLuckMult(buyer?.farm_upgrades || {}));
        if (Math.random() >= chance) return null;
        const seedId = weightedPick(SEED_DROP_WEIGHTS);
        await grantSeed(buyerId, seedId);
        return seedId;
    } catch {
        return null;
    }
}

// ── Owner-only debug (gated by the farm route) ──
export async function debugGrantAllSeeds(buyerId) {
    for (const id of Object.keys(SEEDS)) await grantSeed(buyerId, id).then(() => grantSeed(buyerId, id)).catch(() => {});
    return { ok: true, garden: await getGarden(buyerId) };
}
export async function debugGrowAll(buyerId) {
    await db.query(`UPDATE mkt_farm_plot SET ready_at = NOW() WHERE buyer_id = $1`, [buyerId]).catch(() => {});
    return { ok: true, garden: await getGarden(buyerId) };
}
export async function debugGrantFertilizer(buyerId) {
    await db.query(`UPDATE mkt_buyer SET farm_fertilizer = COALESCE(farm_fertilizer,0) + 5 WHERE id = $1`, [buyerId]).catch(() => {});
    return { ok: true, garden: await getGarden(buyerId) };
}
