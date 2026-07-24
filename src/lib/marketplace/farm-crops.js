import "server-only";

import { db } from "@/lib/db";
import { awardXp } from "@/lib/marketplace/xp.js";
import { logCoin } from "@/lib/marketplace/coins.js";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { bumpQuestProgress } from "@/lib/marketplace/quests.js";
import { syncEarnedBadges } from "@/lib/marketplace/badges.js";
import { sendWebPush } from "@/lib/push/web-push.js";
import { isOwner } from "@/lib/marketplace/owner.js";
import { grantConsumable, CONSUMABLES } from "@/lib/marketplace/consumables.js";

// ===== Farming =====
// Plant a seed in a plot → it grows over real time → harvest it to SELL for gold (+ a small chance at a loot
// chest). Rain (reported by the client on load) and bought fertilizer cut the remaining grow time; upgrades
// add plots, speed growth, boost seed-finding, raise the petting cap, and improve harvest-chest luck. Seeds
// are found across the other games (see maybeDropSeed) — you don't buy them.

// Crop catalog. growMin = minutes to grow at base speed; sell = gold on harvest; xp = player XP on harvest.
// Rarity drives BOTH the sell value/grow-time curve AND the harvest-chest odds (see harvestPlot): rarer crops
// take longer but are worth far more and roll better loot chests.
export const SEEDS = {
    // Each crop sells for gold + player XP; its `yield` is a SIGNATURE bonus that feeds a different system, so
    // what you plant depends on what you need — cash, pet treats, XP, wheel spins, chests, or more seeds.
    // Common — quick, cheap, found from everyday actions (the daily grind).
    wheat: { name: "Wheat", emoji: "🌾", sprout: "🌱", growMin: 90, sell: 140, xp: 12, rarity: "common", role: "Fast cash" },
    carrot: { name: "Carrot", emoji: "🥕", sprout: "🌱", growMin: 180, sell: 300, xp: 20, rarity: "common", role: "Cash + a pet treat", yield: { type: "treat", id: "treat_bone", n: 1 } },
    potato: { name: "Potato", emoji: "🥔", sprout: "🌱", growMin: 240, sell: 440, xp: 28, rarity: "common", role: "Bulk cash" },
    // Rare — a few hours; from digs, raids, iron chests.
    strawberry: { name: "Strawberries", emoji: "🍓", sprout: "🌱", growMin: 300, sell: 640, xp: 40, rarity: "rare", role: "Pet treats", yield: { type: "treat", id: "treat_snack", n: 2 } },
    corn: { name: "Corn", emoji: "🌽", sprout: "🌱", growMin: 420, sell: 940, xp: 56, rarity: "rare", role: "Player XP", yield: { type: "xp", amount: 220 } },
    // Epic — half a day; from raids, gold chests, boss kills.
    grape: { name: "Grapes", emoji: "🍇", sprout: "🌿", growMin: 600, sell: 1600, xp: 82, rarity: "epic", role: "Wheel spins", yield: { type: "spin", n: 2 } },
    pumpkin: { name: "Pumpkin", emoji: "🎃", sprout: "🌿", growMin: 900, sell: 2600, xp: 130, rarity: "epic", role: "Guaranteed chest", yield: { type: "chest", tier: "iron" } },
    // Legendary — overnight; from gold chests + boss kills only.
    goldenapple: { name: "Golden Apple", emoji: "🍎", sprout: "✨", growMin: 1440, sell: 5200, xp: 270, rarity: "legendary", role: "Premium cash + top chest odds" },
    // Mythic — a day and a half; the jackpot, only from the very best sources.
    starfruit: { name: "Star Fruit", emoji: "⭐", sprout: "✨", growMin: 2160, sell: 12000, xp: 640, rarity: "mythic", role: "Jackpot: bonus seeds", yield: { type: "seed", n: 2 } },
};
// Short human line for a crop's signature yield (seed picker + harvest toast).
export function yieldText(seed) {
    const y = seed?.yield;
    if (!y) return null;
    if (y.type === "treat") { const t = seed.yieldTreatName || y.id; return `🦴 +${y.n} pet treat${y.n === 1 ? "" : "s"}`; }
    if (y.type === "xp") return `✨ +${y.amount} bonus XP`;
    if (y.type === "spin") return `🎡 +${y.n} wheel spin${y.n === 1 ? "" : "s"}`;
    if (y.type === "chest") return `🧰 a guaranteed ${y.tier} chest`;
    if (y.type === "seed") return `🌱 +${y.n} bonus seed${y.n === 1 ? "" : "s"}`;
    return null;
}
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
};

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
// Rarer crops roll a chest FAR more often and at a better tier — the payoff for the longer grow + rarer seed.
const RARITY_CHEST_MULT = { common: 1, rare: 2, epic: 4, legendary: 8, mythic: 20 };
const RARITY_CHEST_TIERS = {
    common: { wooden: 88, iron: 12 },
    rare: { wooden: 68, iron: 28, gold: 4 },
    epic: { wooden: 44, iron: 43, gold: 13 },
    legendary: { wooden: 20, iron: 50, gold: 30 },
    mythic: { iron: 38, gold: 62 },
};

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
    const gold = def?.sell || 0;
    const xp = def?.xp || 0;
    const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2, updated_at = NOW() WHERE id = $1 RETURNING gold`, [buyerId, gold]).catch(() => null);
    await logCoin(buyerId, gold, "harvest", { balanceAfter: paid?.gold, meta: { seedId: claimed.seed_id } }).catch(() => {});
    if (xp > 0) await awardXp(buyerId, "harvest", { points: xp, gold: 0 }).catch(() => {});
    // Rare loot chest — chance + tier both scale up with the crop's rarity.
    const buyer = await loadFarmBuyer(buyerId);
    const rarity = def?.rarity || "common";
    let chest = null;
    const chance = Math.min(1, chestChance(buyer?.farm_upgrades || {}) * (RARITY_CHEST_MULT[rarity] || 1));
    if (Math.random() < chance) {
        const tier = weightedPick(RARITY_CHEST_TIERS[rarity] || RARITY_CHEST_TIERS.common);
        // Grant one chest of `tier` (inlined to avoid a chests.js ↔ farm-crops.js import cycle).
        await db.query(
            `INSERT INTO mkt_user_chest (buyer_id, tier, count) VALUES ($1, $2, 1)
             ON CONFLICT (buyer_id, tier) DO UPDATE SET count = mkt_user_chest.count + 1`,
            [buyerId, tier]
        ).catch(() => {});
        chest = tier;
    }
    // Signature yield — each crop grants a distinct bonus that feeds a different system.
    const bonus = await grantYield(buyerId, def?.yield);
    await trackActivity(buyerId, "harvest_crop", { seedId: claimed.seed_id, rarity, gold, chest, yield: def?.yield?.type || null }).catch(() => {});
    await bumpQuestProgress(buyerId, "harvest_crop", 1).catch(() => {});
    await syncEarnedBadges(buyerId).catch(() => {}); // grant any farming badges just earned
    const freshGold = await db.queryOne(`SELECT gold FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    return { ok: true, slot, name: def?.name || claimed.seed_id, emoji: def?.emoji || "🌾", gold, xp, chest, bonus, goldAfter: freshGold?.gold ?? paid?.gold ?? null, garden: await getGarden(buyerId) };
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

// Grant a harvested crop's signature yield; returns a short human string for the harvest toast (or null).
async function grantYield(buyerId, y) {
    if (!buyerId || !y) return null;
    try {
        if (y.type === "treat") {
            await grantConsumable(buyerId, y.id, y.n);
            return `🦴 +${y.n} ${CONSUMABLES[y.id]?.name || "Pet Treat"}`;
        }
        if (y.type === "xp") {
            await awardXp(buyerId, "harvest", { points: y.amount, gold: 0 });
            return `✨ +${y.amount} bonus XP`;
        }
        if (y.type === "spin") {
            await db.query(`UPDATE mkt_buyer SET spin_tokens = COALESCE(spin_tokens, 0) + $2 WHERE id = $1`, [buyerId, y.n]);
            return `🎡 +${y.n} wheel spin${y.n === 1 ? "" : "s"}`;
        }
        if (y.type === "chest") {
            await db.query(`INSERT INTO mkt_user_chest (buyer_id, tier, count) VALUES ($1, $2, 1) ON CONFLICT (buyer_id, tier) DO UPDATE SET count = mkt_user_chest.count + 1`, [buyerId, y.tier]);
            return `🧰 a ${y.tier} chest`;
        }
        if (y.type === "seed") {
            const got = [];
            for (let i = 0; i < y.n; i += 1) {
                const r = weightedPick({ common: 30, rare: 30, epic: 25, legendary: 12, mythic: 3 });
                const pool = seedsOfRarity(r);
                const sid = pool.length ? pool[Math.floor(Math.random() * pool.length)] : "wheat";
                await grantSeed(buyerId, sid);
                got.push(SEEDS[sid].emoji);
            }
            return `🌱 +${y.n} bonus seed${y.n === 1 ? "" : "s"} ${got.join("")}`;
        }
    } catch { /* best-effort */ }
    return null;
}

// Roll to drop a seed from another game system (source keys in SEED_SOURCES). Returns { seedId, name, emoji,
// rarity } or null. Best-effort — never throws into the caller. The drop chance is scaled by the Forager
// upgrade; the RARITY is weighted per source so rare crops only come from big events.
export async function dropSeedFrom(buyerId, source) {
    try {
        // ⚠️ FARM PREVIEW: seeds only drop for the owner while farming is owner-gated, so it's fully inert for
        // everyone else. REMOVE this line when farming launches publicly (see the launch checklist).
        if (!isOwner(buyerId)) return null;
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
