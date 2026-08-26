import "server-only";

import { db } from "@/lib/db";
import { awardXp } from "@/lib/marketplace/xp.js";
import { logCoin } from "@/lib/marketplace/coins.js";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { bumpQuestProgress } from "@/lib/marketplace/quests.js";
import { syncEarnedBadges, grantEventBadge } from "@/lib/marketplace/badges.js";
import { sendWebPush } from "@/lib/push/web-push.js";
import { grantConsumable } from "@/lib/marketplace/consumables.js";
import { addChests } from "@/lib/marketplace/chests.js";
import { farmBonuses } from "@/lib/marketplace/farm-bonus.js";
import { getOwnedSetIds } from "@/lib/marketplace/collection-owned.js";
import { SEED_PACK_IDS, seedPackById } from "@/lib/marketplace/seed-packs.js";
import { setFarmGrowBonus, setFarmDoubleHarvest } from "@/lib/marketplace/sets.js";
import { collectibleById } from "@/lib/marketplace/collectibles.js";
import { addEquippedPetXp } from "@/lib/marketplace/pet-level.js";
import { getPlotUpgrades, plotEffects, plotTracksFor } from "@/lib/marketplace/farm-plot-upgrades.js";
import { maybeStartEncounter } from "@/lib/marketplace/farm-encounters.js";
import { getTownBonuses } from "@/lib/marketplace/town-projects.js";
import { hasPower, oneIn, equippedPowers, claimPowerUse, powerRoll } from "@/lib/marketplace/ascension-powers.js";
import { mint } from "@/lib/marketplace/gold-rate.js";

// How often working the field turns up a recipe card. Low — recipes should feel like a find, and the farm is
// only one of several sources (chests, digs, raids, the merchant).
const HARVEST_RECIPE_CHANCE = 0.04;

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
    // SELL VALUES HALVED (2026-08-09), on top of the ~35% cut of 2026-08-06.
    //
    // THE FIRST CUT WORKED PER HARVEST AND WAS SWALLOWED WHOLE BY VOLUME. Gold per harvest did fall — 145 down
    // to 101 — but harvests per day went 141 → 370 over the same fortnight as members bought plots, so the
    // faucet went UP: 20k gold a day before the cut, 38k after it, still 15.8% of every coin minted and still
    // the biggest single source in the game.
    //
    // And it is the BASE PRICES doing it, not the buffs: corn's 160 was paying an average of 184, wheat's 22
    // was paying 25. The deco/Greenhouse/capstone stack only adds about 15% in practice, so capping multipliers
    // would have moved nothing. These nine numbers are the whole lever, which is why they are the whole change.
    // Gold values sit against the coin scale ($10 = 2,000 coins, so 1g ≈ ½¢). Farming stays a supplement.
    // Common — quick, cheap, found from everyday actions (the daily grind). (Grow times +20% 2026-07-28.)
    wheat: { name: "Wheat", emoji: "🌾", sprout: "🌱", growMin: 108, sell: 11, xp: 6, rarity: "common" },
    carrot: { name: "Carrot", emoji: "🥕", sprout: "🌱", growMin: 216, sell: 22, xp: 10, rarity: "common" },
    potato: { name: "Potato", emoji: "🥔", sprout: "🌱", growMin: 288, sell: 33, xp: 14, rarity: "common" },
    // Rare — a few hours; from digs, raids, iron chests.
    strawberry: { name: "Strawberries", emoji: "🍓", sprout: "🌱", growMin: 360, sell: 55, xp: 20, rarity: "rare" },
    corn: { name: "Corn", emoji: "🌽", sprout: "🌱", growMin: 504, sell: 80, xp: 26, rarity: "rare" },
    // Epic — half a day; from raids, gold chests, boss kills.
    grape: { name: "Grapes", emoji: "🍇", sprout: "🌿", growMin: 720, sell: 90, xp: 40, rarity: "epic" },
    pumpkin: { name: "Pumpkin", emoji: "🎃", sprout: "🌿", growMin: 1080, sell: 140, xp: 62, rarity: "epic" },
    // Legendary — overnight; from gold chests + boss kills only.
    goldenapple: { name: "Golden Apple", emoji: "🍎", sprout: "✨", growMin: 1728, sell: 225, xp: 130, rarity: "legendary" },
    // Mythic — a day and a half; the jackpot, only from the very best sources.
    starfruit: { name: "Star Fruit", emoji: "⭐", sprout: "✨", growMin: 2592, sell: 470, xp: 300, rarity: "mythic" },
};
// How good the shared-pool loot odds are for a crop's rarity (shown in the seed picker).
export const LOOT_LABEL = { common: "Basic loot", rare: "Better loot", epic: "Good loot", legendary: "Great loot", mythic: "Best loot" };

// Base chance a harvest yields a BONUS reward on top of the guaranteed gold + XP (~5%). Harvest-luck sources
// nudge it up from here; kept low so the bonus feels special instead of firing every harvest.
const HARVEST_BONUS_CHANCE = 0.05;

export const seedById = (id) => SEEDS[id] || null;
const seedsOfRarity = (r) => Object.keys(SEEDS).filter((id) => SEEDS[id].rarity === r);

// A SEED IS THE FARM'S. It used to be showered from six other systems as a bolt-on — a chest you opened, a fish you landed, a boss you struck, a wheel you spun — each one a grant fired after that system had already paid you. Seeds come from the farm loop and from tables that LIST them now.
// Where seeds are FOUND. Each game action rolls dropSeedFrom(buyerId, source): `chance` (before the Forager
// boost) that a seed drops at all, then a weighted pick of which RARITY, then a random seed of that rarity.
// Everyday actions give common seeds; big/rare events are the only way to find legendary/mythic seeds.
// ── WHERE SEEDS COME FROM, AND THE TWO DIFFERENT ANSWERS ─────────────────────────────────────────────────────
// This used to be one table of { chance, rarities } consulted by every caller, which made a seed a coin flip
// bolted to the side of somebody else's feature — the same parallel lottery the recipe economy was rebuilt to
// remove ("it wasn't the chest's loot table, it wasn't the wheel, it was a lottery nobody could see").
//
// It is two things now, because there are honestly two cases:
//
//   A TABLE DROP.  The feature already has a reward table — the wheel's wedges, a haul, a seam, a ship's
//                  hold. The TABLE decides whether you get a seed, exactly as it decides gold or parts, and
//                  it is drawn and shown like any other prize. All that lives here is the BAND: which
//                  rarities that source is allowed to give. Use grantSeedFromBand().
//
//   A TRICKLE.     Harvesting, petting, rating a farm, hitting the boss. There is no table to put a row in —
//                  the reward IS the action — so these keep a chance on the action itself. They are the
//                  farm's own supply feeding itself, and they stay small and mostly common.
//
// TRIMMED AT THE TOP, ONCE THE RATES WERE MEASURED. The first cut of these bands put a member on 1.67
// legendary seeds a week — two Golden Apples, against a catalog that calls legendary "from gold chests + boss
// kills only". The legendary and mythic weights came down across the six sources that were paying most of it
// and went into rare and epic, which is where the supply is supposed to sit. Mid tier did not move.
// scripts/audit-seed-rates.mjs measures this against real seven-day volumes; re-run it after any change here.
//
// MID TIER IS THE POINT. Luke: "mid to high level seeds... high high high should still be rare, but mid tier
// seeds should be a little more common." So rare and epic carry the weight in every band below, legendary is
// a tail, and mythic only appears where the source is genuinely a hard thing to have done.
export const SEED_BANDS = {
    // The wheel. A visible wedge now, not a hidden 12% rolled behind whatever you actually landed on.
    spin: { common: 22, rare: 44, epic: 28, legendary: 6 },
    // The bonus round reaches highest — the only wheel wedge that can turn up a Star Fruit.
    spin_mini: { rare: 30, epic: 51, legendary: 16, mythic: 3 },
    // A cast. The haul table decides; this decides which.
    fishing: { common: 26, rare: 44, epic: 24, legendary: 6 },
    // A won ship battle is not farming, so it reaches past what a cast can.
    ship_battle: { rare: 40, epic: 46, legendary: 12, mythic: 2 },
    // The mine, by depth. The deep card is one of only two places a Star Fruit can come from.
    seam: { common: 34, rare: 44, epic: 22 },
    seam_deep: { rare: 36, epic: 48, legendary: 14, mythic: 2 },
    // Chests, by tier. A wooden one is the farm's floor; a gold one is a real chance at something worth
    // clearing a plot for.
    chest_wooden: { common: 66, rare: 32, epic: 2 },
    chest_iron: { common: 34, rare: 44, epic: 21, legendary: 1 },
    chest_gold: { common: 12, rare: 38, epic: 41, legendary: 8, mythic: 1 },
    // The Armoury crate. Bought with laurels off won bouts, so it sits with the ship rather than the farm.
    arena_win: { rare: 42, epic: 44, legendary: 12, mythic: 2 },
    // A dug-up chest, by board depth. The sea's own supply line into the farm.
    sail_dig: { common: 32, rare: 44, epic: 22, legendary: 2 },
    sail_dig_deep: { rare: 38, epic: 48, legendary: 12, mythic: 2 },
    // The boss: weekly, shared, and the top of the ladder.
    boss_kill: { common: 16, rare: 34, epic: 32, legendary: 15, mythic: 3 },
};

// ── NOT DECLARED HERE UNTIL SOMETHING CALLS THEM ─────────────────────────────────────────────────────────────
// The table this replaced listed ten sources — the wheel, the boss, all three chest tiers, digs, raids,
// harvests — with tuned chances and rarity weights, and NINE of them had no caller anywhere in the codebase.
// Every one of those was a promise the game had no way of keeping, and it is most of why seeds felt
// impossible: the real supply was petting a pet and buying packets.
//
// So a band goes in here when the feature's table has a row that calls it, and not before. Still owed a row,
// with the tables to hang them on already in place: the mine (CARD_TABLE in mining.js — a seed card belongs
// beside "Loose ore"), the Arena (the Armoury's crate table), chests by tier, the boss, and the sea's digs
// and raids.

// ── THE TRICKLE ──────────────────────────────────────────────────────────────────────────────────────────────
// Chance on the action, because these have no table of their own. Mostly common with a thin tail: this is the
// farm feeding itself, not a route to Star Fruit.
const SEED_TRICKLE = {
    harvest_crop: { chance: 0.15, band: { common: 74, rare: 22, epic: 4 } },
    pet_farm: { chance: 0.10, band: { common: 82, rare: 16, epic: 2 } },
    // Rating somebody's farm. It asked for a source that was never declared, so it has paid NOTHING since it
    // shipped — see the note on grantSeedFromBand.
    green_thumb: { chance: 0.12, band: { common: 76, rare: 21, epic: 3 } },
    // A companion with the seed perk, dropping one on top of a harvest. The perk card promises exactly this
    // and the source was never declared either — the roll happened, the grant returned null, the card lied.
    // Better than the farm's own trickle, because it cost a pet slot: mid-weighted with an epic tail.
    pet_companion: { chance: 1, band: { common: 46, rare: 38, epic: 14, legendary: 2 } },
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
// Player banks a fraction of a crop's XP; the FULL value still feeds the pet, so the farm stays a pet-XP
// engine. Trimmed 0.4 -> 0.28: 954 harvests a week made this the fourth-biggest XP source in the game, and
// the farm is meant to level your companion, not you.
const HARVEST_PLAYER_XP_MULT = 0.28;
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
// Second Sowing buys two more plots. `powers` is optional so every existing synchronous caller keeps working
// and simply sees the base count — the plots only appear for the reader that knows who is asking.
export const plotCount = (up, powers = null) =>
    BASE_PLOTS + lvl(up, "plots") + (powers?.has?.("second_sowing") ? 2 : 0);
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
    // NOT written back onto `pick` - it is a row of the shared POOL_BY_TIER table, and assigning to it
    // would halve the pool itself, again on every roll, for the life of the process.
    const lootGold = pick.type === "gold" ? mint(pick.amount, "harvest_loot") : 0;
    // The pool's label bakes the amount in, so it has to be rebuilt rather than reused.
    let label = pick.type === "gold" ? `+${lootGold.toLocaleString()} \u{1FA99}` : pick.label;
    try {
        if (pick.type === "gold") { await db.query(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1`, [buyerId, lootGold]); await logCoin(buyerId, lootGold, "harvest_loot"); }
        else if (pick.type === "xp") await awardXp(buyerId, "harvest", { points: pick.amount, gold: 0 });
        else if (pick.type === "treat") await grantConsumable(buyerId, pick.id, 1);
        else if (pick.type === "spin") await db.query(`UPDATE mkt_buyer SET spin_tokens = COALESCE(spin_tokens, 0) + $2 WHERE id = $1`, [buyerId, pick.n]);
        else if (pick.type === "chest") await addChests(buyerId, { [pick.chestTier]: 1 }, { source: "harvest" }).catch(() => {});
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

// ── WHERE THE PLOTS GO ───────────────────────────────────────────────────────────────────────────────────────
// Fixed, server-set. Plots are NOT draggable any more.
//
// They used to default into a cluster spanning x 15→35 — the left fifth of the field — with all eight stacked
// in two short rows, and the only way out was to drag each one somewhere better. That made a mess by default,
// put the work of laying out a farm on the player, and the drag itself couldn't reach the right-hand side of
// the field, so people were stuck with the pile they started with.
//
// Eight slots, laid out as two staggered rows across the field. Front row fills first, so three plots read as
// a tidy row rather than a scattering, and the back row is inset half a step for depth. Decorations stay
// free-placed — those are what make a farm yours; the crop beds want to look like a farm.
// Spacing alone could never fix the overlap: the bed sprite was a FIXED 112px, so four of them across a phone
// need 448px of a ~390px field no matter where the slots sit. The client now scales the bed to the field width
// (see ScenePlot) so a row of four always fits — these are the positions that row sits at.
//
// `s` is a perspective scale. The back row is drawn smaller because it's further away, which reads as depth AND
// buys the room to keep it inside the field: a half-step stagger would put the fourth back bed at x 97 and hang
// it off the right edge. Smaller beds up there sit at 91 and still clear the fence.
// Spread across a field that is now ~1.9x the viewport wide (see FarmClient: the Garden scrolls horizontally
// like Outside/Inside instead of being squeezed onto one screen). 24 points apart on a 190% field is roughly
// 45% of a phone screen between beds — they read as a laid-out plot rather than a row of crates.
const PLOT_SLOTS = [
    { x: 10, y: 89, s: 1 }, { x: 34, y: 89, s: 1 }, { x: 58, y: 89, s: 1 }, { x: 82, y: 89, s: 1 }, // front row
    { x: 22, y: 69, s: 0.8 }, { x: 46, y: 69, s: 0.8 }, { x: 70, y: 69, s: 0.8 }, { x: 92, y: 69, s: 0.8 }, // back row, inset + smaller
];
function defaultPlotPos(i) {
    return PLOT_SLOTS[i] || PLOT_SLOTS[PLOT_SLOTS.length - 1];
}

// Full garden state for the client: every plot (empty or growing/ready), the seed bag, upgrades + costs,
// fertilizer stock, and how many crops are ready right now (for the alert badge).
export async function getGarden(buyerId) {
    if (!buyerId) return null;
    const [buyer, plots, seeds, packRows, plotUp, bedRows, cropRows] = await Promise.all([
        loadFarmBuyer(buyerId),
        db.query(`SELECT slot, seed_id, planted_at, ready_at, fertilized FROM mkt_farm_plot WHERE buyer_id = $1 ORDER BY slot`, [buyerId]).catch(() => []),
        db.query(`SELECT seed_id, count FROM mkt_farm_seed WHERE buyer_id = $1 AND count > 0`, [buyerId]).catch(() => []),
        db.query(`SELECT consumable_id, count FROM mkt_user_consumable WHERE buyer_id = $1 AND count > 0 AND consumable_id = ANY($2)`, [buyerId, SEED_PACK_IDS]).catch(() => []),
        getPlotUpgrades(buyerId).catch(() => ({})),
        db.query(`SELECT art_key, url FROM mkt_town_art WHERE art_key = 'farm_bed' OR art_key LIKE 'farm_bed_t%'`).catch(() => []),
        db.query(`SELECT art_key, url FROM mkt_town_art WHERE art_key LIKE 'crop_%'`).catch(() => []),
    ]);
    const cropSprites = {};
    for (const r of (cropRows || [])) if (r.url) cropSprites[r.art_key] = r.url; // { crop_sprout, crop_<id>_grow, crop_<id>_ripe }
    // Per-tier bed art: farm_bed = tier 0, farm_bed_t1..t5 = the upgraded beds every 5 plot levels.
    const bedTiers = {};
    for (const r of (bedRows || [])) if (r.url) { const t = r.art_key === "farm_bed" ? 0 : Number(r.art_key.replace("farm_bed_t", "")); if (Number.isFinite(t)) bedTiers[t] = r.url; }
    const up = buyer?.farm_upgrades || {};
    const n = plotCount(up);
    const byslot = new Map((plots || []).map((p) => [p.slot, p]));
    const now = Date.now();
    const gardenPlots = [];
    let readyCount = 0;
    // Server-set only — saved drag positions are deliberately ignored (see PLOT_SLOTS). Anyone who had
    // dragged plots into a pile gets the tidy layout back on their next load.
    const posFor = (i) => defaultPlotPos(i);
    for (let i = 0; i < n; i += 1) {
        const pos = posFor(i);
        const tracks = plotTracksFor(plotUp[i] || {}); // this plot's specialization tracks (levels + costs)
        const specLevel = tracks.reduce((s, t) => s + t.level, 0); // total invested (for the plot badge)
        const p = byslot.get(i);
        if (!p) { gardenPlots.push({ slot: i, empty: true, x: pos.x, y: pos.y, s: pos.s, tracks, specLevel }); continue; }
        const def = seedById(p.seed_id);
        const readyMs = new Date(p.ready_at).getTime();
        const ready = readyMs <= now;
        if (ready) readyCount += 1;
        gardenPlots.push({
            x: pos.x, y: pos.y, s: pos.s, tracks, specLevel,
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
        bedUrl: bedTiers[0] || null,
        bedTiers, // { 0: base, 1..5: upgraded beds } — the plot picks its tier by specialization level
        cropSprites,
    };
}

// Plant a seed you hold into an empty plot. Grow time is scaled by the Green Thumb upgrade.
export async function plantSeed(buyerId, slot, seedId) {
    if (!buyerId || !SEEDS[seedId]) return { ok: false, error: "bad_request" };
    const buyer = await loadFarmBuyer(buyerId);
    const up = buyer?.farm_upgrades || {};
    if (slot < 0 || slot >= plotCount(up, await equippedPowers(buyerId))) return { ok: false, error: "bad_slot" };
    // Consume one seed atomically.
    const dec = await db.queryOne(`UPDATE mkt_farm_seed SET count = count - 1 WHERE buyer_id = $1 AND seed_id = $2 AND count > 0 RETURNING count`, [buyerId, seedId]).catch(() => null);
    if (!dec) return { ok: false, error: "no_seed" };
    // Nightsoil: the plot goes in already fertilized, and the bag is never touched.
    const freeFert = await hasPower(buyerId, "nightsoil");
    // Farm grow-speed buff (decorations + equipped gear farm affix + equipped pet) stacks on top of the Green
    // Thumb upgrade (both cut grow time).
    const buffs = await farmBonuses(buyerId).catch(() => null);
    const decoGrow = Math.max(0.5, 1 - (buffs?.growSpeed || 0) / 100);
    // Forager's Kit capstone: crops grow 15% faster. A COLLECTION set — completing it is the achievement, so
    // it reads what you OWN rather than asking you to wear a basket while you plant.
    const capGrow = Math.max(0.5, 1 - setFarmGrowBonus(await getOwnedSetIds(buyerId).catch(() => [])));
    // Per-plot Fertile Soil specialization cuts THIS plot's grow time on top of everything else.
    const plotUp = await getPlotUpgrades(buyerId).catch(() => ({}));
    const plotGrow = plotEffects(plotUp[slot] || {}).growMult;
    // Town Greenhouse (community project) speeds growth for EVERY member's farm, on top of all personal buffs.
    const townB = await getTownBonuses(Date.now()).catch(() => ({}));
    const townGrow = Math.max(0.4, 1 - (townB?.farmGrowPct || 0) / 100);
    // A farm companion's speed perk shortens the grow time — applied at PLANT, because ready_at is fixed when
    // the seed goes in. Swapping pets mid-crop therefore doesn't retroactively change a growing plant, which is
    // both easier to reason about and what the pet card implies ("your crops finish sooner").
    let petGrow = 1;
    try {
        const { getPetSystemPerk } = await import("@/lib/marketplace/pet-combat.js");
        const sp = await getPetSystemPerk(buyerId, "farm_speed");
        if (sp > 0) petGrow = 1 - Math.min(0.25, sp / 100);
    } catch { /* no companion, no speed-up */ }
    // ── ASCENSION POWERS ON A PLANTING ───────────────────────────────────────────────────────────
    // Hothouse Glass puts the crop a third of the way in; The Cold Frame skips the wait entirely one time in
    // three; The Long Furrow caps anything at eight hours. Read here because this is the ONE line that decides
    // how long a crop takes, so a power that changes that has nowhere else to be.
    let growMs = Math.round(SEEDS[seedId].growMin * 60000 * growMultiplier(up) * decoGrow * capGrow * plotGrow * townGrow * petGrow);
    if (await hasPower(buyerId, "hothouse_glass")) growMs = Math.round(growMs * (2 / 3));
    if (await hasPower(buyerId, "long_furrow")) growMs = Math.min(growMs, 8 * 3600000);
    if (await hasPower(buyerId, "cold_frame") && oneIn(3)) growMs = 0;
    const row = await db.queryOne(
        `INSERT INTO mkt_farm_plot (buyer_id, slot, seed_id, planted_at, ready_at, fertilized)
         VALUES ($1, $2, $3, NOW(), NOW() + ($4 || ' milliseconds')::interval, $5)
         ON CONFLICT (buyer_id, slot) DO NOTHING RETURNING id`,
        [buyerId, slot, seedId, freeFert ? Math.round(growMs * (1 - FERTILIZER_CUT)) : growMs, freeFert]
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
    const claimed = await db.queryOne(
        `DELETE FROM mkt_farm_plot WHERE buyer_id = $1 AND slot = $2 AND ready_at <= NOW()
         RETURNING seed_id, (planted_at > ready_at - INTERVAL '1 day') AS quick`, [buyerId, slot]).catch(() => null);
    if (!claimed) return { ok: false, error: "not_ready" };
    const def = seedById(claimed.seed_id);
    // A plot that rested: the crop took its full time rather than being rushed straight back in.
    const plantedAfterRest = claimed.quick === false;
    // This plot's own specialization (Rich Loam / Nurturing Bed / Greenhouse / Warding Totem).
    const pEff = plotEffects((await getPlotUpgrades(buyerId).catch(() => ({})))[slot] || {});
    // Farm buffs (decorations + equipped gear farm affix + equipped pet): more harvest gold, better loot odds,
    // better seed-save luck.
    const buffs = await farmBonuses(buyerId).catch(() => null);
    const xp = def?.xp || 0;
    // Town Greenhouse (community project) fattens the harvest for EVERY member, on top of personal gold-harvest buffs.
    const townB = await getTownBonuses(Date.now()).catch(() => ({}));
    let gold = mint(Math.round((def?.sell || 0) * (1 + (buffs?.goldHarvest || 0) / 100) * (1 + (townB?.farmYieldPct || 0) / 100)), "harvest");
    // Harvester's Garb full-set capstone: a chance the whole harvest yields DOUBLE gold. (Read below, off the
    // owned list — the equipped loadout has nothing to do with a collection set any more.)
    let doubled = false;
    // A farm companion's yield perk stacks with the Harvester's Garb capstone. Both are stated as a plain
    // double-harvest chance, so a member can read the two numbers and add them up themselves.
    let petFarm = { yield: 0, seed: 0 };
    try {
        const { getPetSystemPerk } = await import("@/lib/marketplace/pet-combat.js");
        const [y, sd] = await Promise.all([
            getPetSystemPerk(buyerId, "farm_yield"),
            getPetSystemPerk(buyerId, "farm_seed"),
        ]);
        petFarm = { yield: y, seed: sd };
    } catch { /* no companion, no bonus */ }
    // Harvester's Garb capstone — same rule: owned, not worn.
    const dblChance = setFarmDoubleHarvest(await getOwnedSetIds(buyerId).catch(() => [])) + petFarm.yield / 100;
    if (dblChance > 0 && Math.random() < dblChance) { gold *= 2; doubled = true; }
    // ── ASCENSION POWERS ON A HARVEST ────────────────────────────────────────────────────────────────────
    // Bumper Season doubles the FIRST harvest of the day, so it is checked before the roll above can make the
    // same claim twice. Perennial Root and The Seed Drill both put a seed back in the bag — different odds and
    // different reasons, so they roll separately rather than sharing one branch.
    const powers = await equippedPowers(buyerId);
    // Bumper Season doubles ONE harvest a day. Claimed off the shared ledger — the coin-event check it used
    // before answered "yes, you have harvested today" the moment you took any harvest, so the power could only
    // ever have fired on a day's very first one and never after a single ordinary pick.
    if (!doubled && await claimPowerUse(buyerId, "bumper_season")) { gold *= 2; doubled = true; }
    // The Fallow Deed pays double on a plot that sat empty overnight. `planted_at` is the only trace of when
    // the plot was last used, so "left fallow" is read as a gap of a day between clearing and re-planting.
    if (!doubled && powers.has("fallow_deed") && plantedAfterRest) { gold *= 2; doubled = true; }
    // Windfall Orchard drops a chest on the day's first harvest.
    if (await claimPowerUse(buyerId, "windfall_orchard")) {
        await addChests(buyerId, { wooden: 1 }, { source: "windfall_orchard" }).catch(() => {});
    }
    if (powers.has("perennial_root") && oneIn(3)) {
        await db.query(`UPDATE mkt_farm_seed SET count = count + 1 WHERE buyer_id = $1 AND seed_id = $2`, [buyerId, claimed.seed_id]).catch(() => {});
    }
    if (powers.has("seed_drill") && oneIn(4)) {
        await db.query(`UPDATE mkt_farm_seed SET count = count + 1 WHERE buyer_id = $1 AND seed_id = $2`, [buyerId, claimed.seed_id]).catch(() => {});
    }
    const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2, updated_at = NOW() WHERE id = $1 RETURNING gold`, [buyerId, gold]).catch(() => null);
    await logCoin(buyerId, gold, "harvest", { balanceAfter: paid?.gold, meta: { seedId: claimed.seed_id } }).catch(() => {});
    // YOU ALSO KEEP THE CROP. The gold above still reads as selling the surplus and the farm economy is
    // balanced on it — but the produce itself now goes to the pantry, where the Kitchen can cook with it. A
    // doubled harvest doubles the produce too, since it doubled everything else.
    // IMPORTED LAZILY, and it has to stay that way. cooking.js imports SEEDS and grantSeed from THIS file, so a
    // static import back the other way is a cycle — and under ESM a cycle resolves to `undefined` at call time
    // rather than failing at import, which is how it took down the Kitchen page and the town's Kitchen door
    // instead of failing the build. Same trap as stockade-penalty.js; the fix there was a leaf module, here a
    // deferred import is the smaller change.
    const { addToPantry } = await import("@/lib/marketplace/cooking.js");
    // The Cellar Key puts a second copy on the shelf one harvest in three. It stacks with a doubled harvest
    // rather than replacing it — the two are different things (the harvest itself vs what reaches the pantry).
    const cellarKey = await powerRoll(buyerId, "cellar_key", 3);
    await addToPantry(buyerId, "crop", claimed.seed_id, (doubled ? 2 : 1) + (cellarKey ? 1 : 0)).catch(() => {});
    // Harvest is a huge XP minter, so the PLAYER only banks a fraction of the crop's XP (tuned down). The full
    // crop XP still feeds the PET below — the farm stays a pet-XP engine, it just doesn't flood player levels.
    const harvestPlayerXp = Math.round(xp * HARVEST_PLAYER_XP_MULT);
    if (harvestPlayerXp > 0) await awardXp(buyerId, "harvest", { points: harvestPlayerXp, gold: 0 }).catch(() => {});
    // The farm IS a pet-XP engine: every harvest also feeds your equipped pet XP equal to the crop's value, so
    // tending crops visibly levels your companion (rarer/slower crops feed it much more). Gated by real grow
    // time, so it's steady progress, not a free maxing lever. Capped at the pet's max XP inside addEquippedPetXp.
    let petFed = null;
    const petXpGain = Math.round(xp * pEff.petXpMult); // Nurturing Bed feeds extra pet XP
    if (petXpGain > 0) {
        const pr = await addEquippedPetXp(buyerId, petXpGain).catch(() => null);
        if (pr?.ok) { const pdef = collectibleById(pr.petId); petFed = { petId: pr.petId, name: pdef?.name || "your pet", emoji: pdef?.emoji || "🐾", xp: petXpGain, level: pr.level, leveled: pr.leveled }; }
    }
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
    const bonusChance = HARVEST_BONUS_CHANCE + (buffs?.harvestLuck || 0) / 400 + (charmActive ? 0.05 : 0) + pEff.lootPromote / 2;
    if (Math.random() < bonusChance) {
        loot = await rollHarvestReward(buyerId, rarity, luckyHarvestLevel(buyer?.farm_upgrades || {}), (charmActive ? 0.2 : 0) + pEff.lootPromote);
    }
    const bonus = loot.label;
    const chest = loot.chest;
    // Seed Saver upgrade (+ deco seed-luck) — chance to recover the seed you planted (rare crops stay sustainable).
    let savedSeed = false;
    if (Math.random() < seedSaverChance(buyer?.farm_upgrades || {}) + (buffs?.seedLuck || 0) / 200 + pEff.seedSave) {
        await grantSeed(buyerId, claimed.seed_id).catch(() => {});
        savedSeed = true;
    }
    // ── THE FARM'S OWN TRICKLE, WHICH HAS NEVER ONCE FIRED ───────────────────────────────────────────────
    // `harvest_crop` has been in the seed table since it was written, with its own chance and rarity weights,
    // under a comment promising "working the farm now finds its own seeds, not just the other games". Nothing
    // ever called it. Nine of the ten sources that table declared had no caller at all — the wheel, the boss,
    // every chest tier, digs, raids — so the entire seed economy was petting a pet and buying packets.
    const harvestSeed = await dropSeedFrom(buyerId, "harvest_crop").catch(() => null);
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
    // A companion with the seed perk drops one on top of the harvest — the perk card promises exactly this.
    let foundSeed = null;
    if (petFarm.seed > 0 && Math.random() < petFarm.seed / 100) {
        foundSeed = await dropSeedFrom(buyerId, "pet_companion").catch(() => null);
    }
    // The farm's own find, if the companion did not already produce one — one seed per harvest, never two
    // toasts for the same event.
    if (!foundSeed) foundSeed = harvestSeed;
    await syncEarnedBadges(buyerId).catch(() => {}); // grant any farming badges just earned
    // A creature might RAID this harvest (chance raised by the plot's Warding Totem + rarer crops) — the client
    // fights it with a timing meter, then calls encounter_resolve for bonus loot. Server parks the pending fight.
    const encounter = await maybeStartEncounter(buyerId, { rarity, wardChance: pEff.raidChance, seedId: claimed.seed_id }).catch(() => null);
    const freshGold = await db.queryOne(`SELECT gold FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    return { ok: true, slot, name: def?.name || claimed.seed_id, emoji: def?.emoji || "🌾", gold, doubled, xp, petFed, chest, bonus, savedSeed, savedEmoji: savedSeed ? def?.emoji : null, foundSeed, newPet, encounter, goldAfter: freshGold?.gold ?? paid?.gold ?? null, garden: await getGarden(buyerId) };
}

// Buy a fertilizer (gold sink). Fertilizer is applied to a specific growing crop to cut its remaining time.
export async function buyFertilizer(buyerId) {
    if (!buyerId) return { ok: false, error: "bad_request" };
    const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`, [buyerId, FERTILIZER_PRICE]).catch(() => null);
    if (!paid) return { ok: false, error: "insufficient" };
    await db.query(`UPDATE mkt_buyer SET farm_fertilizer = COALESCE(farm_fertilizer,0) + 1 WHERE id = $1`, [buyerId]).catch(() => {});
    await logCoin(buyerId, -FERTILIZER_PRICE, "farm_fertilizer", { balanceAfter: paid.gold }).catch(() => {});
    // The balance rides back so the client purse follows the spend (see gardenAct) — this returned the garden
    // and nothing else, so buying fertiliser left the gold on screen at whatever it was on page load.
    return { ok: true, goldAfter: Number(paid.gold), garden: await getGarden(buyerId) };
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
    // THE RAIN BARREL: it is always raining on your farm. Two things follow — the client's weather report stops
    // mattering (the caller applies it unconditionally, see the farm poll) and the once-every-six-hours guard
    // comes off, which is the half of it a member actually feels.
    const barrel = await hasPower(buyerId, "rain_barrel");
    const res = await db.query(
        `UPDATE mkt_farm_plot
            SET ready_at = NOW() + (GREATEST(0, EXTRACT(EPOCH FROM (ready_at - NOW())) * $2) || ' seconds')::interval,
                rain_at = NOW()
          WHERE buyer_id = $1 AND ready_at > NOW()
            AND ($4 OR rain_at IS NULL OR rain_at < NOW() - ($3 || ' hours')::interval)
          RETURNING slot`,
        [buyerId, 1 - RAIN_CUT, RAIN_GUARD_HOURS, barrel]
    ).catch(() => []);
    const boosted = (res?.rows || res || []).length;
    return { ok: true, boosted, garden: boosted ? await getGarden(buyerId) : null };
}

// Drag a plot to a custom spot on the farm (owner arranging their own garden). Stores {x,y} percent for the
// Plots are laid out by the server now (PLOT_SLOTS) and cannot be moved. Kept as a no-op rather than deleted
// so an older client still holding the drag handler gets a clean refusal instead of a 400 — and so the reason
// is written down at the place someone would look to re-add dragging.
export async function movePlot(buyerId) {
    if (!buyerId) return { ok: false, error: "bad_request" };
    return { ok: false, error: "plots_are_fixed", garden: await getGarden(buyerId) };
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
    // Mastery badges: maxing THIS upgrade earns Cultivator; maxing every farm upgrade earns Steward.
    if (level + 1 >= FARM_UPGRADES[key].max) {
        await grantEventBadge(buyerId, "farm_cultivator").catch(() => {});
        const allMaxed = Object.keys(FARM_UPGRADES).every((k) => (k === key ? level + 1 : lvl(up, k)) >= FARM_UPGRADES[k].max);
        if (allMaxed) await grantEventBadge(buyerId, "farm_steward").catch(() => {});
    }
    return { ok: true, goldAfter: Number(paid.gold), garden: await getGarden(buyerId) };
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
/**
 * A TABLE ALREADY SAID YES. This only decides WHICH seed.
 *
 * It cannot return null for a source it knows: the caller's own reward table has already rolled "seed" and
 * shown it, so a second hidden roll here would be the bolt-on all over again — and worse, an outcome the
 * player watched land that quietly paid nothing.
 *
 * Which is exactly what was happening. `fishing`, `ship_battle` and `green_thumb` all asked the old table for
 * a source it never declared, got undefined, and returned null EVERY TIME. Three features advertised a seed
 * drop and none of them could pay one, which is most of "seeds are really hard to get".
 */
export async function grantSeedFromBand(buyerId, band) {
    try {
        const weights = typeof band === "string" ? SEED_BANDS[band] : band;
        if (!buyerId || !weights) return null;
        const rarity = weightedPick(weights);
        const pool = seedsOfRarity(rarity);
        const seedId = pool.length ? pool[Math.floor(Math.random() * pool.length)] : "wheat";
        await grantSeed(buyerId, seedId);
        const def = SEEDS[seedId];
        return { seedId, name: def.name, emoji: def.emoji, rarity: def.rarity };
    } catch {
        return null;
    }
}

/**
 * THE TRICKLE. A chance on the action, for the handful of sources that have no reward table to carry a row —
 * you harvested, you petted, you rated a farm, you hit the boss. Forager scales the chance, never the band.
 */
export async function dropSeedFrom(buyerId, source) {
    try {
        const cfg = SEED_TRICKLE[source];
        if (!buyerId || !cfg) return null;
        const buyer = await loadFarmBuyer(buyerId);
        const chance = Math.min(0.95, cfg.chance * seedLuckMult(buyer?.farm_upgrades || {}));
        if (Math.random() >= chance) return null;
        return grantSeedFromBand(buyerId, cfg.band);
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
        await sendWebPush(buyerId, { kind: "crops", title: "🌾 Harvest time!", body, url: "/marketplace/farm", tag: "crops-ready" }).catch(() => {});
        sent += 1;
    }
    // Mark every ready-but-unannounced plot as notified so we never re-push it (even for members with no sub).
    await db.query(`UPDATE mkt_farm_plot SET notified_at = NOW() WHERE ready_at <= NOW() AND notified_at IS NULL`).catch(() => {});
    return { sent, plots: rows.length };
}
