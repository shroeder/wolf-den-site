import "server-only";

import { db } from "@/lib/db";
import { awardXp } from "@/lib/marketplace/xp.js";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { grantConsumable, CONSUMABLES } from "@/lib/marketplace/consumables.js";
import { grantEventBadge } from "@/lib/marketplace/badges.js";
import { isOwner } from "@/lib/marketplace/owner.js";
import { SEEDS } from "@/lib/marketplace/farm-crops.js";
import { FISH } from "@/lib/marketplace/fishing.js";
import { COOK_ODDS_KEYS, collectibleById, petCookPassive, petPassiveLevelMult } from "@/lib/marketplace/collectibles.js";
import { petLevelForXp } from "@/lib/marketplace/pet-level.js";

// What the member's OWNED kitchen pets add, as flat percentage points on each odds key. Owned, not equipped —
// same rule the Forge set uses, so collecting them is the reward rather than juggling which one is out.
async function petCookBonus(buyerId) {
    const [owned, xpRows] = await Promise.all([
        db.query(`SELECT ref FROM mkt_cosmetic_unlock WHERE buyer_id = $1 AND category = 'pet'`, [buyerId]).catch(() => []),
        db.query(`SELECT pet_id, xp FROM mkt_pet_level WHERE buyer_id = $1`, [buyerId]).catch(() => []),
    ]);
    const xp = Object.fromEntries(xpRows.map((r) => [r.pet_id, r.xp]));
    const out = {};
    for (const row of owned) {
        const pet = collectibleById(row.ref);
        const cp = petCookPassive(pet);
        if (!cp) continue;
        const scaled = cp.value * petPassiveLevelMult(petLevelForXp(xp[row.ref] || 0, pet?.rarity));
        if (cp.stat === "kitchen_master") {
            // The Gourmand Dragon lifts every key at once, at half weight each.
            for (const k of COOK_ODDS_KEYS) out[k] = (out[k] || 0) + scaled * 0.5;
        } else out[cp.stat] = (out[cp.stat] || 0) + scaled;
    }
    // Stored as points; the cook maths wants fractions.
    for (const k of Object.keys(out)) out[k] = out[k] / 100;
    return out;
}

// ═══ THE KITCHEN ═════════════════════════════════════════════════════════════════════════════════════════════
//
// Farming and fishing already pay you — that stays, it reads as selling the surplus and the economy is balanced
// on it. What's new is that you also KEEP the crop and the catch, and those are the ingredients here.
//
// A recipe is LEARNED, never listed. They turn up wherever anything else turns up: chests, digs, raids, the
// merchant, the odd harvest. A recipe has a TIER, and the tier picks which pool the dish is rolled from — so a
// recipe you already know is still worth cooking, because you don't know what you're getting.
//
// The upgrade tracks are the same shape as the boat and the rail: four of them, five levels each, priced on a
// square curve, each doing one legible thing.

export const COOK_UNLOCKED = (buyerId) => Boolean(buyerId) && isOwner(buyerId);

export const MAX_TRACK = 5;
export const COOKS_PER_DAY = 5;

export const COOK_TRACKS = {
    heat:   { max: MAX_TRACK, per: 0.06, cap: 0.30, kind: "pct",   name: "Heat",      icon: "🔥", desc: "Chance the dish comes out one tier better than the recipe." },
    season: { max: MAX_TRACK, per: 0.08, cap: 0.40, kind: "pct",   name: "Seasoning", icon: "🧂", desc: "Chance of a second helping — the same dish, twice." },
    batch:  { max: MAX_TRACK, per: 1,    cap: 5,    kind: "count", name: "Big Pot",   icon: "🍲", desc: "Extra cooks each day." },
    larder: { max: MAX_TRACK, per: 0.07, cap: 0.35, kind: "pct",   name: "Larder",    icon: "🧺", desc: "Chance a cook doesn't use up its ingredients at all." },
};
export const TRACK_COL = { heat: "heat_level", season: "season_level", batch: "batch_level", larder: "larder_level" };
export const trackValue = (t, lvl) => Math.min(COOK_TRACKS[t].cap, Math.max(0, Number(lvl) || 0) * COOK_TRACKS[t].per);
export const trackCost = (lvl) => 400 * (Number(lvl) + 1) * (Number(lvl) + 1);

// ── DISH TIERS ───────────────────────────────────────────────────────────────────────────────────────────────
// Each tier is a POOL of existing consumables. Cooking rolls one at random. Reusing the consumable catalogue
// rather than inventing a parallel one means every dish already works everywhere — the stash, the use flow,
// the pet-feeding, the boss buffs — on day one.
export const TIERS = [
    { tier: 1, name: "Simple",    color: "#cfd8e3", pool: ["treat_bone", "farm_pet_whistle", "farm_kindness_token", "scroll_wisdom", "farm_growth_tonic"] },
    { tier: 2, name: "Hearty",    color: "#7ec8ff", pool: ["treat_snack", "pot_adrenaline", "stone_storm", "sail_tailwind_charm", "sail_prospectors_charm"] },
    { tier: 3, name: "Fine",      color: "#c9a2ff", pool: ["treat_toy", "pot_secondwind", "stone_ember", "farm_harvest_charm", "sail_raiding_horn", "spin_lucky_coin"] },
    { tier: 4, name: "Exquisite", color: "#ffd75e", pool: ["treat_feast", "pot_berserker", "scroll_ancient", "farm_fertilizer_crate", "sail_treasure_map", "spin_golden_ticket"] },
    { tier: 5, name: "Legendary", color: "#ff9ec4", pool: ["treat_golden", "treat_kibble", "pot_fury", "treat_ambrosia", "sail_kraken_bait", "farm_fertilizer_haul"] },
];
export const tierMeta = (t) => TIERS[Math.max(0, Math.min(TIERS.length - 1, (Number(t) || 1) - 1))];

// ── PREPPED INGREDIENTS ───────────────────────────────────────────────────────────────────────────
// The depth layer. Raw crops and fish go INTO these, and these go into the real dishes — so a legendary plate
// isn't "own three rare things", it's a chain you had to build. They live in the same pantry as everything else
// (kind 'prep'), which means one inventory, one screen and one set of rules rather than a parallel system.
export const PREPS = {
    p_flour:     { name: "Stoneground Flour", rarity: "common" },
    p_dough:     { name: "Risen Dough",       rarity: "common" },
    p_butter:    { name: "Churned Butter",    rarity: "common" },
    p_stock:     { name: "Fish Stock",        rarity: "common" },
    p_jam:       { name: "Berry Jam",         rarity: "rare" },
    p_syrup:     { name: "Golden Syrup",      rarity: "rare" },
    p_puree:     { name: "Pumpkin Puree",     rarity: "rare" },
    p_wine:      { name: "Dark Wine",         rarity: "rare" },
    p_smoked:    { name: "Smoked Fillet",     rarity: "epic" },
    p_roe:       { name: "Cured Roe",         rarity: "epic" },
    p_essence:   { name: "Star Essence",      rarity: "legendary" },
    p_leviathan: { name: "Leviathan Marrow",  rarity: "legendary" },
};
export const prepMeta = (id) => PREPS[id] || null;

// ── RECIPES ──────────────────────────────────────────────────────────────────────────────────────────────
// `need` is { ref → qty } over crops, fish and preps alike. A recipe is either a PREP (output goes back to the
// pantry as an ingredient) or a DISH (output is a consumable rolled from the tier's pool).
const R = (id, name, tier, need, flavor) => ({ id, name, tier, need, flavor, kind: "dish" });
const P = (id, name, tier, need, out, flavor) => ({ id, name, tier, need, out, flavor, kind: "prep" });

export const RECIPES = [
    // ═══ PREP · turn raw stuff into cooking ingredients ═══
    P("k_flour",   "Mill the Wheat",     1, { wheat: 3 },                        "p_flour",     "Slow work, and the whole room smells of it."),
    P("k_dough",   "Prove the Dough",    1, { p_flour: 2 },                      "p_dough",     "Leave it by the fire and wait."),
    P("k_butter",  "Churn the Butter",   1, { corn: 2, wheat: 1 },               "p_butter",    "Your arm aches long before it turns."),
    P("k_stock",   "Simmer a Stock",     1, { fish_sardine: 2, carrot: 1 },      "p_stock",     "The bones give up everything eventually."),
    P("k_jam",     "Set the Jam",        2, { strawberry: 4 },                   "p_jam",       "Skim the foam or it goes cloudy."),
    P("k_syrup",   "Reduce the Syrup",   2, { goldenapple: 2, corn: 1 },         "p_syrup",     "Thick, amber, and dangerously hot."),
    P("k_puree",   "Roast the Pumpkin",  2, { pumpkin: 3 },                      "p_puree",     "Blackened skin, sweet middle."),
    P("k_wine",    "Press the Grapes",   2, { grape: 5 },                        "p_wine",      "Six months in the dark, and worth it."),
    P("k_smoked",  "Smoke the Fillet",   3, { fish_tuna: 1, wheat: 2 },          "p_smoked",    "Two days over green wood."),
    P("k_roe",     "Cure the Roe",       3, { fish_snapper: 2, fish_perch: 2 },  "p_roe",       "Salt, patience, a cold cellar."),
    P("k_essence", "Distil the Star",    4, { starfruit: 3 },                    "p_essence",   "It hums faintly against the glass."),
    P("k_marrow",  "Render the Marrow",  4, { fish_whale: 1, fish_kraken: 1 },   "p_leviathan", "Nobody agrees on how it should be done."),

    // ═══ TIER 1 · Simple ═══
    R("r_porridge",    "Morning Porridge",   1, { wheat: 2 },                     "What the pack eats before a long day."),
    R("r_mash",        "Buttered Mash",      1, { potato: 3, p_butter: 1 },       "Comfort, in a bowl."),
    R("r_flatbread",   "Camp Flatbread",     1, { p_dough: 1 },                   "Cooked on a stone by the fire."),
    R("r_roast_roots", "Roasted Roots",      1, { carrot: 2, potato: 1 },         "Sweet, charred at the edges."),
    R("r_carrot_soup", "Carrot Soup",        1, { carrot: 3, p_stock: 1 },        "Orange enough to feel medicinal."),
    R("r_corn_bread",  "Skillet Cornbread",  1, { corn: 2, p_flour: 1 },          "Crisp bottom, soft middle."),
    R("r_boiled_crab", "Boiled Rock Crab",   1, { fish_crab: 2 },                 "Ten minutes, no ceremony."),
    R("r_sardines",    "Salt Sardines",      1, { fish_sardine: 3 },              "Eaten standing up, off the dock."),
    R("r_potato_cake", "Potato Cakes",       1, { potato: 2, p_flour: 1 },        "Fried in whatever's left in the pan."),
    R("r_perch_fry",   "Pan-Fried Perch",    1, { fish_perch: 2, p_butter: 1 },   "Salt, fire, nothing else."),

    // ═══ TIER 2 · Hearty ═══
    R("r_fish_stew",   "Fisherman's Stew",   2, { p_stock: 1, potato: 2, fish_mackerel: 1 }, "Everything that didn't sell, in one pot."),
    R("r_berry_tart",  "Berry Tart",         2, { p_jam: 1, p_dough: 1 },         "Worth burning your mouth for."),
    R("r_corn_chowder","Corn Chowder",       2, { corn: 3, potato: 2, p_stock: 1 }, "Thick enough to stand a spoon in."),
    R("r_squid_ink",   "Squid Ink Supper",   2, { fish_squid: 2, p_dough: 1 },    "Black as a moonless tide."),
    R("r_shrimp_pot",  "Prawn Pot",          2, { fish_shrimp: 3, p_butter: 1 },  "Gone in about four minutes."),
    R("r_puffer",      "Careful Pufferfish", 2, { fish_pufferfish: 2, carrot: 1 }, "Prepared by someone who knows. Hopefully."),
    R("r_snapper_bake","Baked Snapper",      2, { fish_snapper: 2, p_butter: 1 }, "Whole, with the skin left crisp."),
    R("r_harvest_hash","Harvest Hash",       2, { potato: 2, corn: 2, carrot: 2 }, "Whatever came out of the ground that day."),
    R("r_jam_roll",    "Jam Roly-Poly",      2, { p_jam: 1, p_flour: 2 },         "Heavy, sweet, and entirely unreasonable."),
    R("r_moon_broth",  "Moonfish Broth",     2, { fish_moonfish: 1, p_stock: 1 }, "Pale, and faintly luminous."),
    R("r_pumpkin_soup","Pumpkin Soup",       2, { p_puree: 1, p_butter: 1 },      "The bowl everyone comes back for."),
    R("r_octo_grill",  "Grilled Octopus",    2, { fish_octopus: 1, p_wine: 1 },   "Charred tentacle, lemon, done."),

    // ═══ TIER 3 · Fine ═══
    R("r_harvest_pie", "Harvest Pie",        3, { p_puree: 1, p_dough: 1, carrot: 2 }, "The whole field, baked."),
    R("r_crab_boil",   "Crab Boil",          3, { fish_crab: 4, corn: 2, potato: 2 }, "Eaten with your hands, at a long table."),
    R("r_grape_glaze", "Glazed Roast",       3, { p_wine: 1, potato: 3 },         "Sticky, dark and slightly boozy."),
    R("r_lobster_roll","Lobster Roll",       3, { fish_lobster: 1, p_dough: 1, p_butter: 1 }, "Cold claw, warm bun, too much butter."),
    R("r_smoked_plate","Smokehouse Plate",   3, { p_smoked: 1, p_dough: 1 },      "Best eaten leaning against something."),
    R("r_stormpike",   "Storm Pike Skewers", 3, { fish_stormpike: 1, corn: 2 },   "It sparks when the fat hits the fire."),
    R("r_angler_stew", "Anglerfish Stew",    3, { fish_anglerfish: 1, p_stock: 1, potato: 2 }, "Ugly thing. Extraordinary broth."),
    R("r_sword_steak", "Swordfish Steak",    3, { fish_swordfish: 1, p_butter: 1, carrot: 1 }, "Cut thick, cooked pink."),
    R("r_wine_braise", "Wine-Braised Roots", 3, { p_wine: 1, carrot: 3, potato: 2 }, "Four hours, barely any attention."),
    R("r_syrup_cake",  "Golden Syrup Cake",  3, { p_syrup: 1, p_flour: 2, p_butter: 1 }, "Sticks to the roof of your mouth."),
    R("r_tuna_loin",   "Seared Bluefin",     3, { fish_tuna: 1, p_roe: 1 },       "Thirty seconds a side and not a moment more."),
    R("r_manta_wing",  "Manta Wing",         3, { fish_manta: 1, p_butter: 1 },   "Enormous, and gone by morning."),

    // ═══ TIER 4 · Exquisite ═══
    R("r_lobster",     "Buttered Lobster",   4, { fish_lobster: 2, p_butter: 2, p_wine: 1 }, "The reason people row out in bad weather."),
    R("r_gold_pie",    "Golden Apple Pie",   4, { goldenapple: 2, p_dough: 1, p_syrup: 1 },  "They say it's good for the heart."),
    R("r_surf_turf",   "Surf and Turf",      4, { fish_octopus: 1, p_puree: 1, corn: 3 },    "Two whole days of work on one plate."),
    R("r_caviar",      "Cured Roe Service",  4, { p_roe: 2, p_dough: 1 },                    "Served on ice, in silence."),
    R("r_shark_steak", "Great White Steak",  4, { fish_shark: 1, p_wine: 1, p_butter: 1 },   "You are, briefly, top of the food chain."),
    R("r_dolphin",     "Ghost Dolphin Feast",4, { fish_dolphin: 1, p_syrup: 1, corn: 2 },    "Nobody's quite sure it was really there."),
    R("r_marlin_grill","Black Marlin Grill", 4, { fish_marlin: 1, p_smoked: 1, potato: 3 },  "It fought for an hour. It lost."),
    R("r_coelacanth",  "Coelacanth Confit",  4, { fish_coelacanth: 1, p_butter: 2 },         "Older than the town. Cooked anyway."),
    R("r_royal_roast", "Royal Roast",        4, { p_wine: 2, p_puree: 1, goldenapple: 1 },   "For nights that deserve it."),
    R("r_long_board",  "The Long Board",     4, { p_smoked: 2, p_jam: 1, p_dough: 2 },       "Put it in the middle and let people at it."),

    // ═══ TIER 5 · Legendary ═══
    R("r_starfruit",   "Starfruit Ambrosia", 5, { p_essence: 1, goldenapple: 2, p_syrup: 1 }, "Sweet enough that pets forget themselves."),
    R("r_leviathan",   "Leviathan Roast",    5, { p_leviathan: 1, p_puree: 2, p_wine: 1 },    "It took four of you to carry it in."),
    R("r_stormpot",    "Storm Pot",          5, { fish_stormpike: 2, fish_swordfish: 1, p_stock: 2 }, "It crackles. Nobody is sure why."),
    R("r_kraken",      "Kraken Feast",       5, { fish_kraken: 1, p_wine: 2, p_butter: 2 },   "Served to the whole table, or not at all."),
    R("r_whale",       "Sunlit Whale Course",5, { fish_whale: 1, p_essence: 1, p_smoked: 1 }, "A dish people will still mention next winter."),
    R("r_fallen_star", "Fallen Star Plate",  5, { fish_starfish: 1, p_essence: 2 },           "It is still warm. It should not be."),
    R("r_grand_feast", "The Grand Feast",    5, { p_leviathan: 1, p_essence: 1, p_roe: 1, p_wine: 2 }, "Everything you have, all at once."),
    R("r_wolfs_table", "The Wolf's Table",   5, { p_smoked: 2, p_roe: 1, p_syrup: 1, goldenapple: 2 }, "The one the whole den turns up for."),
];

export const recipeById = (id) => RECIPES.find((r) => r.id === id) || null;

// Where a recipe can drop from. Weighted by tier so the good ones stay rare.
const DROP_WEIGHT = { 1: 40, 2: 28, 3: 18, 4: 10, 5: 4 };

/** Roll a recipe the member doesn't know yet. Returns the recipe, or null when they know them all. */
export function rollRecipe(known = []) {
    const have = new Set(known);
    const pool = RECIPES.filter((r) => !have.has(r.id));
    if (!pool.length) return null;
    const total = pool.reduce((s, r) => s + (DROP_WEIGHT[r.tier] || 1), 0);
    let n = Math.random() * total;
    for (const r of pool) { n -= DROP_WEIGHT[r.tier] || 1; if (n <= 0) return r; }
    return pool[pool.length - 1];
}

// ── INGREDIENTS ──────────────────────────────────────────────────────────────────────────────────────────────
// Everything resolves to a SPRITE, never an emoji. Raw ingredients reuse art the game already owns — crops from
// mkt_town_art (`crop_<id>_ripe`), fish from the PNGs on disk — and only the prepped ingredients and the dishes
// needed drawing. The emoji is carried purely as a last-resort fallback if a sprite row is ever missing.
const cropMeta = (ref) => SEEDS[ref] || null;
const fishMeta = (ref) => FISH.find((f) => f.id === ref) || null;
export function ingredientMeta(ref, sprites = {}) {
    const pr = PREPS[ref];
    if (pr) return { ref, kind: "prep", name: pr.name, emoji: "🧂", rarity: pr.rarity, sprite: sprites[ref] || null };
    const c = cropMeta(ref);
    if (c) return { ref, kind: "crop", name: c.name, emoji: c.emoji, rarity: c.rarity, sprite: sprites[`crop:${ref}`] || null };
    const f = fishMeta(ref);
    if (f) return { ref, kind: "fish", name: f.name, emoji: f.emoji, rarity: f.rarity, sprite: `/images/fish/${f.id}.png` };
    return { ref, kind: "crop", name: ref, emoji: "\u2753", rarity: "common", sprite: null };
}

/** Every sprite the Kitchen needs, in one read: cooking art keyed by ref, plus the crop art from the town. */
async function cookingSprites() {
    const [own, crops] = await Promise.all([
        db.query(`SELECT ref, url FROM mkt_cooking_sprite`).catch(() => []),
        db.query(`SELECT art_key, url FROM mkt_town_art WHERE art_key LIKE 'crop_%_ripe'`).catch(() => []),
    ]);
    const map = Object.fromEntries(own.map((r) => [r.ref, r.url]));
    for (const c of crops) {
        const id = String(c.art_key).replace(/^crop_/, "").replace(/_ripe$/, "");
        map[`crop:${id}`] = c.url;
    }
    return map;
}

/** Add to the pantry. Called by the farm on harvest and by fishing on a landing. Best-effort, never throws. */
export async function addToPantry(buyerId, kind, ref, qty = 1) {
    if (!buyerId || !ref || qty <= 0) return;
    await db.query(
        `INSERT INTO mkt_pantry (buyer_id, kind, ref, qty) VALUES ($1, $2, $3, $4)
         ON CONFLICT (buyer_id, kind, ref) DO UPDATE SET qty = mkt_pantry.qty + EXCLUDED.qty`,
        [buyerId, kind, ref, Math.round(qty)]
    ).catch(() => {});
}

/** Teach a recipe. Returns the recipe when it was NEW to them, else null — so callers can announce it. */
export async function learnRecipe(buyerId, recipeId = null) {
    if (!buyerId) return null;
    const knownRows = await db.query(`SELECT recipe_id FROM mkt_recipe_known WHERE buyer_id = $1`, [buyerId]).catch(() => []);
    const known = knownRows.map((r) => r.recipe_id);
    const rec = recipeId ? recipeById(recipeId) : rollRecipe(known);
    if (!rec || known.includes(rec.id)) return null;
    const ins = await db.queryOne(
        `INSERT INTO mkt_recipe_known (buyer_id, recipe_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING recipe_id`,
        [buyerId, rec.id]
    ).catch(() => null);
    if (!ins) return null;
    await trackActivity(buyerId, "recipe_learned", { recipe: rec.id, tier: rec.tier }).catch(() => {});
    await cookingBadges(buyerId).catch(() => {});
    return rec;
}

// Cooking badges are granted at the moment they're earned rather than through the auto-rule sweep, which is
// how fishing does it: the counters live on mkt_kitchen and mkt_recipe_known, not in getMemberMetrics, and
// duplicating them there just to drive a rule would be two sources of truth for the same number.
async function cookingBadges(buyerId, ctx = {}) {
    const row = await db.queryOne(
        `SELECT (SELECT COALESCE(cooks_total,0) FROM mkt_kitchen WHERE buyer_id = $1)::int AS cooks,
                (SELECT COALESCE(best_dish_tier,0) FROM mkt_kitchen WHERE buyer_id = $1)::int AS best,
                (SELECT COUNT(*) FROM mkt_recipe_known WHERE buyer_id = $1)::int AS recipes,
                (SELECT COALESCE(SUM(qty),0) FROM mkt_pantry WHERE buyer_id = $1)::int AS stock,
                (SELECT COALESCE(preps_total,0) FROM mkt_kitchen WHERE buyer_id = $1)::int AS preps,
                (SELECT COALESCE(tiers_cooked,0) FROM mkt_kitchen WHERE buyer_id = $1)::int AS tiers,
                (SELECT COALESCE(best_quality,0) FROM mkt_kitchen WHERE buyer_id = $1) AS bestq,
                (SELECT COALESCE(best_chain,0) FROM mkt_kitchen WHERE buyer_id = $1)::int AS bestchain`,
        [buyerId]
    ).catch(() => null);
    if (!row) return;
    const g = (slug) => grantEventBadge(buyerId, slug).catch(() => {});
    if (row.cooks >= 1) await g("cook_first");
    if (row.cooks >= 25) await g("cook_apprentice");
    if (row.cooks >= 100) await g("cook_chef");
    if (row.cooks >= 400) await g("cook_master");
    if (row.recipes >= 10) await g("cook_collector");
    if (row.recipes >= RECIPES.length) await g("cook_librarian");
    if (row.best >= 5) await g("cook_legendary");
    if (row.stock >= 100) await g("cook_forager");
    if (row.cooks >= 1000) await g("cook_thousand");
    if (row.preps >= 50) await g("cook_prep");
    // 0b11111 = one dish cooked at every tier.
    if ((row.tiers & 31) === 31) await g("cook_every_tier");
    if (Number(row.bestq) >= 0.92) await g("cook_perfect");
    if (row.bestchain >= 10) await g("cook_chain");
    if (ctx.recipeId === "r_grand_feast") await g("cook_grand");
    if (ctx.recipeId === "r_wolfs_table") await g("cook_wolfs");
}

// The three you start with. An empty recipe book is a dead screen — you can't cook, so you can't learn what
// cooking IS, so there's no reason to come back. These are all wheat/root basics you'll have ingredients for.
export const STARTER_RECIPES = ["k_flour", "r_porridge", "r_roast_roots"];

// WHERE a recipe is found. Derived rather than hand-tagged so it can't drift from the ingredients: a dish built
// out of fish is found at sea, a dish built out of crops is found in the field, and the top tiers come out of
// the same chests everything else rare does. Shown on the locked card so "undiscovered" is a lead, not a wall.
export function recipeSource(rec) {
    if (!rec) return { key: "farm", label: "Found while working the farm" };
    const refs = Object.keys(rec.need || {});
    const fishy = refs.some((r) => r.startsWith("fish_"));
    if (rec.tier >= 5) return { key: "chest", label: "Gold & mythic chests, and the Gold Merchant" };
    if (rec.tier === 4) return { key: "chest", label: "Iron & gold chests, island digs and raids" };
    if (fishy) return { key: "sea", label: "Found while fishing and on voyages" };
    return { key: "farm", label: "Found while working the farm" };
}

const today = () => db.queryOne(`SELECT (NOW() AT TIME ZONE 'America/Chicago')::date::text AS d`).then((r) => r?.d);

async function kitchenRow(buyerId) {
    const created = await db.queryOne(
        `INSERT INTO mkt_kitchen (buyer_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING buyer_id`, [buyerId]
    ).catch(() => null);
    // First time through, hand over the basics. Done here rather than in a migration so it also covers anyone
    // who reaches the Kitchen later, and ON CONFLICT DO NOTHING means it can never re-grant.
    if (created) {
        for (const id of STARTER_RECIPES) {
            await db.query(`INSERT INTO mkt_recipe_known (buyer_id, recipe_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [buyerId, id]).catch(() => {});
        }
    }
    return db.queryOne(
        `SELECT *, (cook_day = (NOW() AT TIME ZONE 'America/Chicago')::date) AS cooked_today FROM mkt_kitchen WHERE buyer_id = $1`,
        [buyerId]
    ).catch(() => null);
}

/** Everything the Kitchen screen needs, in one call. */
export async function getKitchenState(buyerId) {
    if (!COOK_UNLOCKED(buyerId)) return { unlocked: false };
    const [row, pantryRows, knownRows, goldRow, sprites, art] = await Promise.all([
        kitchenRow(buyerId),
        db.query(`SELECT kind, ref, qty FROM mkt_pantry WHERE buyer_id = $1 AND qty > 0`, [buyerId]).catch(() => []),
        db.query(`SELECT recipe_id, times_cooked FROM mkt_recipe_known WHERE buyer_id = $1`, [buyerId]).catch(() => []),
        db.queryOne(`SELECT COALESCE(gold,0) AS gold FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null),
        cookingSprites(),
        db.queryOne(`SELECT url FROM mkt_town_art WHERE art_key = 'kitchen'`).catch(() => null),
    ]);
    const have = new Map(pantryRows.map((r) => [r.ref, Number(r.qty)]));
    const cookedMap = new Map(knownRows.map((r) => [r.recipe_id, Number(r.times_cooked) || 0]));
    const usedToday = row?.cooked_today ? Number(row.cooks_today) || 0 : 0;
    const maxCooks = COOKS_PER_DAY + trackValue("batch", row?.batch_level);

    const recipes = RECIPES.map((r) => {
        const known = cookedMap.has(r.id);
        const need = Object.entries(r.need).map(([ref, qty]) => {
            const m = ingredientMeta(ref, sprites);
            const held = have.get(ref) || 0;
            return { ...m, qty, held, enough: held >= qty };
        });
        const outMeta = r.kind === "prep" ? ingredientMeta(r.out, sprites) : null;
        return {
            id: r.id, name: r.name, tier: r.tier, flavor: r.flavor, kind: r.kind,
            sprite: sprites[r.id] || null,
            tierName: tierMeta(r.tier).name, tierColor: tierMeta(r.tier).color,
            known, timesCooked: cookedMap.get(r.id) || 0,
            // Shown on a LOCKED card too: what it is, what it's for, and where to go looking.
            source: recipeSource(r),
            // A prep says exactly what it makes; a dish says which pool it rolls from. Either way there is no
            // guessing about what pressing the button gets you.
            makes: outMeta ? { ref: outMeta.ref, name: outMeta.name, sprite: outMeta.sprite } : null,
            pool: r.kind === "dish" ? tierMeta(r.tier).pool.map((id) => ({
                id, name: CONSUMABLES[id]?.name || id, desc: CONSUMABLES[id]?.desc || "",
            })) : null,
            need,   // shown whether known or not — what a recipe wants is the useful half of the hint
            canCook: known && need.every((n) => n.enough),
        };
    }).sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));

    return {
        unlocked: true,
        art: art?.url || null,
        gold: Number(goldRow?.gold) || 0,
        level: Math.floor(Math.sqrt((Number(row?.cook_xp) || 0) / 40)) + 1,
        cookXp: Number(row?.cook_xp) || 0,
        cooksTotal: Number(row?.cooks_total) || 0,
        bestTier: Number(row?.best_dish_tier) || 0,
        bestQuality: Number(row?.best_quality) || 0,
        bestChain: Number(row?.best_chain) || 0,
        prepsTotal: Number(row?.preps_total) || 0,
        cooks: { used: usedToday, max: maxCooks, left: Math.max(0, maxCooks - usedToday) },
        pantry: pantryRows
            .map((r) => ({ ...ingredientMeta(r.ref, sprites), qty: Number(r.qty) }))
            .sort((a, b) => a.kind.localeCompare(b.kind) || b.qty - a.qty),
        pantryTotal: pantryRows.reduce((s, r) => s + Number(r.qty), 0),
        recipes,
        known: knownRows.length,
        recipeTotal: RECIPES.length,
        tracks: Object.entries(COOK_TRACKS).map(([id, def]) => {
            const level = Number(row?.[TRACK_COL[id]]) || 0;
            return {
                id, name: def.name, icon: def.icon, desc: def.desc, kind: def.kind,
                level, max: def.max, maxed: level >= def.max, cost: trackCost(level),
                valueNow: trackValue(id, level), valueNext: trackValue(id, level + 1), cap: def.cap,
            };
        }),
        isOwner: isOwner(buyerId),
    };
}

/**
 * Cook a dish.
 *
 * Ingredients are taken with a CONDITIONAL update per line — `qty = qty - n WHERE qty >= n` — so a double-tap
 * can't cook twice off one set of ingredients. The daily counter is claimed the same way, before anything is
 * granted, for the same reason.
 */
export async function cookRecipe(buyerId, recipeId, { quality = null, chain = 0 } = {}) {
    if (!COOK_UNLOCKED(buyerId)) return { ok: false, error: "locked" };
    const rec = recipeById(recipeId);
    if (!rec) return { ok: false, error: "unknown_recipe" };

    const knownRow = await db.queryOne(`SELECT recipe_id FROM mkt_recipe_known WHERE buyer_id = $1 AND recipe_id = $2`, [buyerId, recipeId]).catch(() => null);
    if (!knownRow) return { ok: false, error: "not_learned" };

    const row = await kitchenRow(buyerId);
    const maxCooks = COOKS_PER_DAY + trackValue("batch", row?.batch_level);
    const day = await today();
    // Claim the day's slot atomically: reset the counter when the day rolls, otherwise increment under the cap.
    const claimed = await db.queryOne(
        `UPDATE mkt_kitchen
            SET cooks_today = CASE WHEN cook_day IS DISTINCT FROM $2::date THEN 1 ELSE cooks_today + 1 END,
                cook_day = $2::date, updated_at = NOW()
          WHERE buyer_id = $1
            AND (cook_day IS DISTINCT FROM $2::date OR cooks_today < $3)
          RETURNING cooks_today`,
        [buyerId, day, maxCooks]
    ).catch(() => null);
    if (!claimed) return { ok: false, error: "out_of_cooks" };

    // The Larder can spare the ingredients entirely — rolled once for the whole dish, not per line, so a cook
    // either costs you everything it should or nothing at all.
    // Read once, up here, because the Larder roll below needs it too — and `a < b + c || 0` parses as
    // `(a < b + c) || 0`, so writing it inline both double-queried and silently discarded the pet's help.
    const petBonus = await petCookBonus(buyerId).catch(() => ({}));
    const freeCook = Math.random() < trackValue("larder", row?.larder_level) + (petBonus.thrifty || 0);
    if (!freeCook) {
        const taken = [];
        for (const [ref, qty] of Object.entries(rec.need)) {
            const meta = ingredientMeta(ref);
            const got = await db.queryOne(
                `UPDATE mkt_pantry SET qty = qty - $3 WHERE buyer_id = $1 AND ref = $2 AND qty >= $3 RETURNING qty`,
                [buyerId, ref, qty]
            ).catch(() => null);
            if (!got) {
                // Put back whatever we already took — a half-consumed cook is worse than a failed one.
                for (const t of taken) await addToPantry(buyerId, t.kind, t.ref, t.qty);
                await db.query(`UPDATE mkt_kitchen SET cooks_today = GREATEST(0, cooks_today - 1) WHERE buyer_id = $1`, [buyerId]).catch(() => {});
                return { ok: false, error: "missing_ingredients", missing: meta.name };
            }
            taken.push({ kind: meta.kind, ref, qty });
        }
    }

    // ── OUTCOME ──────────────────────────────────────────────────────────────────────────────────────────
    // `quality` is the timing run, 0..1, exactly like the forge's temper. It is clamped and treated as
    // UNTRUSTED — it arrives from the client, so it can only ever improve the odds within fixed bounds, never
    // hand out a tier directly. A cook with no minigame result (an old client, a scripted call) is treated as
    // an average run rather than a failure.
    const conSprites = Object.fromEntries(
        (await db.query(`SELECT consumable_id, url FROM mkt_consumable_sprite`).catch(() => [])).map((r) => [r.consumable_id, r.url])
    );
    const q = quality == null ? 0.5 : Math.max(0, Math.min(1, Number(quality) || 0));
    const chainN = Math.max(0, Math.min(50, Math.floor(Number(chain) || 0)));

    // Heat is the upgrade track; a strong run adds to it. A perfect run is worth about as much as three levels.
    const bumpChance = trackValue("heat", row?.heat_level) + Math.max(0, q - 0.5) * 0.36 + (petBonus.hot_hands || 0);
    const bumped = Math.random() < bumpChance;
    const tier = Math.min(TIERS.length, rec.tier + (bumped ? 1 : 0));

    let made = null;
    let portions = 1 + (Math.random() < trackValue("season", row?.season_level) + Math.max(0, q - 0.7) * 0.3 + (petBonus.generous || 0) ? 1 : 0);

    const spriteMap = await cookingSprites();
    if (rec.kind === "prep") {
        // A prep hands back an INGREDIENT, not a consumable — a good run just makes more of it.
        // Prep Cook (Copper Kettle) is its own roll on top of the portion roll — prepping is the grind, so the
        // pet that helps with it should be felt on the prep chain specifically.
        const prepBonus = Math.random() < (petBonus.prep_cook || 0) ? 1 : 0;
        portions += prepBonus;
        await addToPantry(buyerId, "prep", rec.out, portions);
        const m = PREPS[rec.out];
        made = { kind: "prep", id: rec.out, name: m?.name || rec.out, desc: "A prepped ingredient other recipes call for.", sprite: spriteMap[rec.out] || null };
    } else {
        const pool = tierMeta(tier).pool;
        const pick = pool[Math.floor(Math.random() * pool.length)];
        await grantConsumable(buyerId, pick, portions).catch(() => {});
        const c = CONSUMABLES[pick] || {};
        // A cooked dish IS a consumable, so it shows the consumable's own sprite — the same picture the stash
        // will show it with, rather than a second drawing of the same thing.
        made = { kind: "dish", id: pick, name: c.name || pick, desc: c.desc || "", sprite: conSprites[pick] || spriteMap[rec.id] || null };
    }

    const xp = Math.round(8 * tier * (0.7 + q * 0.6));
    await db.query(
        `UPDATE mkt_kitchen
            SET cook_xp = cook_xp + $2,
                cooks_total = cooks_total + 1,
                preps_total = preps_total + $5,
                best_dish_tier = GREATEST(best_dish_tier, $3),
                best_quality = GREATEST(best_quality, $4),
                best_chain = GREATEST(best_chain, $6),
                tiers_cooked = tiers_cooked | $7,
                updated_at = NOW()
          WHERE buyer_id = $1`,
        [buyerId, xp, tier, q, rec.kind === "prep" ? 1 : 0, chainN, 1 << (tier - 1)]
    ).catch(() => {});
    await db.query(`UPDATE mkt_recipe_known SET times_cooked = times_cooked + 1 WHERE buyer_id = $1 AND recipe_id = $2`, [buyerId, recipeId]).catch(() => {});
    await awardXp(buyerId, "cooking", { points: xp, gold: 0, meta: { recipe: rec.id, tier } }).catch(() => {});
    await trackActivity(buyerId, "cooked", { recipe: rec.id, tier, made: made.id, portions, bumped, freeCook, quality: q, chain: chainN }).catch(() => {});
    await cookingBadges(buyerId, { recipeId, quality: q, chain: chainN }).catch(() => {});

    return {
        ok: true,
        made: { ...made, tier, tierName: tierMeta(tier).name, tierColor: tierMeta(tier).color },
        portions, bumped, freeCook, xp, quality: q, chain: chainN,
        grade: q >= 0.92 ? "flawless" : q >= 0.72 ? "perfect" : q >= 0.45 ? "good" : "rough",
        ...(await getKitchenState(buyerId)),
    };
}

/** Buy a level on an upgrade track. Gold is taken conditionally, so it can never go negative. */
export async function upgradeKitchen(buyerId, track) {
    if (!COOK_UNLOCKED(buyerId)) return { ok: false, error: "locked" };
    const def = COOK_TRACKS[track];
    if (!def) return { ok: false, error: "bad_track" };
    const row = await kitchenRow(buyerId);
    const col = TRACK_COL[track];
    const level = Number(row?.[col]) || 0;
    if (level >= def.max) return { ok: false, error: "maxed" };
    const cost = trackCost(level);
    const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`, [buyerId, cost]).catch(() => null);
    if (!paid) return { ok: false, error: "not_enough_gold" };
    await db.query(`UPDATE mkt_kitchen SET ${col} = ${col} + 1, updated_at = NOW() WHERE buyer_id = $1`, [buyerId]).catch(() => {});
    await trackActivity(buyerId, "kitchen_upgrade", { track, to: level + 1, cost }).catch(() => {});
    return { ok: true, track, level: level + 1, ...(await getKitchenState(buyerId)) };
}

// ── OWNER TEST TOOLS ─────────────────────────────────────────────────────────────────────────────────────────
// The feature can't be judged from an empty pantry with no recipes, and waiting real days for crops to grow to
// find that out is not a test. Owner-only, and gated on the same isOwner the whole feature is.
export async function devStock(buyerId, what = "all") {
    if (!isOwner(buyerId)) return { ok: false, error: "forbidden" };
    if (what === "recipes" || what === "all") {
        for (const r of RECIPES) {
            await db.query(`INSERT INTO mkt_recipe_known (buyer_id, recipe_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [buyerId, r.id]).catch(() => {});
        }
    }
    if (what === "ingredients" || what === "all") {
        // Enough of everything to cook every recipe several times over.
        for (const ref of Object.keys(SEEDS)) await addToPantry(buyerId, "crop", ref, 25);
        for (const f of FISH) await addToPantry(buyerId, "fish", f.id, 15);
    }
    return { ok: true, ...(await getKitchenState(buyerId)) };
}

/** Wipe the owner's kitchen back to nothing, so the empty state and the unlock flow can be checked too. */
export async function devReset(buyerId) {
    if (!isOwner(buyerId)) return { ok: false, error: "forbidden" };
    await db.query(`DELETE FROM mkt_pantry WHERE buyer_id = $1`, [buyerId]).catch(() => {});
    await db.query(`DELETE FROM mkt_recipe_known WHERE buyer_id = $1`, [buyerId]).catch(() => {});
    await db.query(`DELETE FROM mkt_kitchen WHERE buyer_id = $1`, [buyerId]).catch(() => {});
    return { ok: true, ...(await getKitchenState(buyerId)) };
}
