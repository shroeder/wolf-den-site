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
import { addChests, CHEST_TIERS } from "@/lib/marketplace/chests.js";
import { getChestArt } from "@/lib/marketplace/chest-art.js";
import { PART_TIERS } from "@/lib/marketplace/crafting.js";
import { addParts } from "@/lib/marketplace/crafting.js";
import { grantSeed } from "@/lib/marketplace/farm-crops.js";
import { grantCustomCredit } from "@/lib/marketplace/custom-deco.js";
import { logCoin } from "@/lib/marketplace/coins.js";
import { bumpQuestProgress } from "@/lib/marketplace/quests.js";
import { equippedPowers, oneIn, claimPowerUse } from "@/lib/marketplace/ascension-powers.js";

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

// OPEN TO EVERYONE. Any signed-in member can cook. The recipe economy lives in each feature's own reward table
// now — RECIPE_BANDS below says only which TIERS a source may teach; the odds belong to the chest, the wheel,
// the seam and the ladder that pay them out.
export const COOK_UNLOCKED = (buyerId) => Boolean(buyerId);

export const MAX_TRACK = 5;

// ── NO DAILY CAP ─────────────────────────────────────────────────────────────────────────────────────────────
// Cooking used to be five a day (plus whatever Big Pot bought). That cap is gone for everyone: cook as much as
// you have ingredients for. The real limit was always the pantry — you have to farm, fish and prep your way to
// a dish — and stacking an arbitrary counter on top of a resource cost just meant logging in to spend five
// taps and leaving. The ingredient chain is the pacing.
//
// Big Pot was the "extra cooks each day" track, which the removal made meaningless. Rather than refund it or
// leave a dead upgrade on the screen, it keeps its column and its levels and now does what its NAME always
// suggested: a bigger pot makes more food. Anyone who bought it keeps every level they paid for.
//
// The four tracks now split cleanly, one per axis, with no overlap:
//   Heat      — a better TIER of dish
//   Seasoning — a second WHOLE dish
//   Big Pot   — MORE of whatever the dish makes
//   Larder    — the dish costs you NOTHING
export const COOK_TRACKS = {
    heat:   { max: MAX_TRACK, per: 0.06, cap: 0.30, kind: "pct", name: "Heat",      icon: "/images/cooking/track-heat.png",   desc: "Chance the dish comes out one tier better than the recipe." },
    season: { max: MAX_TRACK, per: 0.08, cap: 0.40, kind: "pct", name: "Seasoning", icon: "/images/cooking/track-season.png", desc: "Chance the dish pays out TWICE — double whatever it makes." },
    // "boost", not "pct": the other three are ROLLS the card labels "Chance", and Big Pot is not a roll —
    // every level is felt on every cook. Labelling it "Chance 30%" would have read as a 30%% shot at nothing.
    // BIG POT FEEDS THE HALL. Finding an axis for this took two goes, both wrong for the same reason:
    //   · as +% QUANTITY it was Seasoning — nearly every reward here is quantity ONE, so "+24% of 1" resolved
    //     through probabilistic rounding into "a 24% chance of 2", which is Seasoning's effect at Seasoning's
    //     odds for nearly double the gold
    //   · as a lift to the reward RUNG it was Heat, which already sells "one tier better than the recipe" —
    //     tier versus rung is a distinction only this file can see, and a player reads both as "better stuff"
    //
    // Quantity belongs to Seasoning, quality to Heat, and ingredients to Larder. The axis nothing touches is
    // what COOKING ITSELF is worth: a bigger pot feeds more people, so the cook learns more. It is the only
    // track that pays out even on a dish whose reward you did not want, which is a real reason to buy it.
    batch:  { max: MAX_TRACK, per: 0.10, cap: 0.50, kind: "boost", name: "Big Pot",   icon: "/images/cooking/track-pot.png",    desc: "A bigger pot feeds the whole hall — more cooking XP from every dish." },
    larder: { max: MAX_TRACK, per: 0.035, cap: 0.175, kind: "pct", name: "Larder",    icon: "/images/cooking/track-larder.png", desc: "Chance a cook doesn't use up its ingredients at all." },
};
export const TRACK_COL = { heat: "heat_level", season: "season_level", batch: "batch_level", larder: "larder_level" };
export const trackValue = (t, lvl) => Math.min(COOK_TRACKS[t].cap, Math.max(0, Number(lvl) || 0) * COOK_TRACKS[t].per);
export const trackCost = (lvl) => 400 * (Number(lvl) + 1) * (Number(lvl) + 1);

// ── WHAT A DISH IS WORTH ─────────────────────────────────────────────────────────────────────────────────────
// EXECUTION PICKS THE RUNG. Each tier is an ordered LADDER of rewards, worst at the bottom, best at the top,
// and how well you cook decides how high up it you land. Cook badly and you get the bottom rung; cook flawlessly
// and you get the top one.
//
// The first version was a weighted lottery — the same list, but which entry you got was random and your timing
// only bought a small chance at the NEXT TIER's table. Displayed as a sorted list it read exactly like a ladder,
// so it taught players a rule the code didn't implement: you'd cook a perfect run, get the cheapest thing on the
// list, and have no way to understand why. A lottery you can't influence also makes the minigame pointless.
//
// So: the ladder is the reward, timing is the climb, and the tier bump on a flawless run moves you to the NEXT
// ladder entirely. Order matters in these arrays — index 0 is the consolation, the last entry is the prize.
export const TIERS = [
    {
        tier: 1, name: "Simple", color: "#cfd8e3",
        rewards: [
            { kind: "seed", pool: ["wheat", "carrot", "potato"], min: 2, max: 3 },
            { kind: "gold", min: 90, max: 160 },
            { kind: "parts", partTier: 1, min: 2, max: 4 },
            { kind: "consumable", id: "farm_pet_whistle" },
            { kind: "consumable", id: "treat_bone" },
            { kind: "consumable", id: "farm_growth_tonic" },
            { kind: "chest", chestTier: "wooden" },
        ],
    },
    {
        tier: 2, name: "Hearty", color: "#7ec8ff",
        rewards: [
            { kind: "seed", pool: ["strawberry", "corn", "grape"], min: 2, max: 3 },
            { kind: "gold", min: 220, max: 380 },
            { kind: "parts", partTier: 2, min: 2, max: 4 },
            { kind: "recipe", band: "cook" },
            { kind: "consumable", id: "scroll_wisdom" },
            { kind: "consumable", id: "treat_snack" },
            { kind: "consumable", id: "sail_tailwind_charm" },
            { kind: "chest", chestTier: "iron" },
        ],
    },
    {
        tier: 3, name: "Fine", color: "#c9a2ff",
        rewards: [
            { kind: "seed", pool: ["pumpkin", "goldenapple"], min: 1, max: 2 },
            { kind: "gold", min: 240, max: 400 },
            { kind: "parts", partTier: 3, min: 2, max: 4 },
            { kind: "recipe", band: "cook" },
            { kind: "consumable", id: "treat_toy" },
            { kind: "consumable", id: "farm_harvest_charm" },
            { kind: "spin", n: 2 },
            { kind: "chest", chestTier: "gold" },
        ],
    },
    {
        tier: 4, name: "Exquisite", color: "#ffd75e",
        rewards: [
            // ONE, and only as the consolation rung. Seeds sit at index 0 of every ladder, so this is what a BAD
            // cook pays out — handing over 2-3 mythic seeds for a fumbled run undercut the farm's whole
            // rarity curve, which is the one place starfruit is supposed to be hard to come by.
            { kind: "seed", pool: ["starfruit"], min: 1, max: 1 },
            { kind: "gold", min: 420, max: 680 },
            { kind: "parts", partTier: 4, min: 2, max: 3 },
            { kind: "consumable", id: "treat_feast" },
            { kind: "consumable", id: "farm_fertilizer_crate" },
            { kind: "consumable", id: "sail_treasure_map" },
            { kind: "spin", n: 5 },
            { kind: "chest", chestTier: "mythic" },
        ],
    },
    {
        // The top ladder. Its last two rungs are the reason to build a legendary ingredient chain at all.
        tier: 5, name: "Legendary", color: "#ff9ec4",
        rewards: [
            { kind: "gold", min: 700, max: 1100 },
            { kind: "parts", partTier: 5, min: 2, max: 4 },
            { kind: "consumable", id: "farm_fertilizer_haul" },
            { kind: "consumable", id: "treat_golden" },
            { kind: "spin", n: 8 },
            { kind: "chest", chestTier: "mythic" },
            { kind: "creation", n: 1 },
            { kind: "chest", chestTier: "ascendant" },
        ],
    },
];
export const tierMeta = (t) => TIERS[Math.max(0, Math.min(TIERS.length - 1, (Number(t) || 1) - 1))];

const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

// Neither forge parts nor chests carry a `rarity` of their own — parts have a tier number and chests a name —
// but the reward list colours every entry by rarity, so the ladder reads at a glance. These map each onto the
// shared rarity scale.
const PART_RARITY = ["common", "common", "rare", "epic", "legendary"];
const CHEST_RARITY = {
    wooden: "common", iron: "rare", gold: "epic", mythic: "legendary",
    ascendant: "mythic", eternal: "ascendant", celestial: "eternal", primordial: "eternal",
};

/**
 * One rung of a reward ladder, described for display: name, blurb, rarity colour, and a sprite where one exists.
 *
 * Used both to render the whole ladder on a recipe card and to describe the single rung a finished cook landed
 * on, so the promise and the payoff are worded by the same code and can't drift apart.
 *
 * `art` carries the sprite maps (consumables/parts/chests/crops), passed in rather than looked up here because
 * the caller already builds them once per request instead of once per reward.
 */
// Where a reward kind falls back to when its real sprite is missing. These used to be emoji — the OS's
// artwork, different on every device, sitting in the middle of hand-painted game art. Every one is a real
// sprite now, and `ui/` holds the ones no single feature owns.
export const KIND_FALLBACK = {
    gold: "/images/ui/coin.png",
    parts: "/images/ui/parts.png",
    chest: "/images/ui/chest.png",
    seed: "/images/ui/seed.png",
    spin: "/images/nav/spin.png",
    creation: "/images/nav/creations.png",
    consumable: "/images/ui/potion.png",
    prep: "/images/cooking/prep.png",
    dish: "/images/cooking/dish.png",
    crop: "/images/nav/farm.png",
};

export function rewardLabel(r, art = {}) {
    const { consumables = {}, parts = {}, chests = {}, crops = {} } = art;
    switch (r.kind) {
        case "gold":
            return { name: `${r.min.toLocaleString()}–${r.max.toLocaleString()} gold`, desc: "Straight into your purse.", rarity: "common", fallback: KIND_FALLBACK.gold };
        case "parts": {
            const m = PART_TIERS.find((p) => p.tier === r.partTier) || PART_TIERS[0];
            return { name: `${m.name} ×${r.min}–${r.max}`, desc: "Forge parts — salvage fodder for enhancing your gear.", rarity: PART_RARITY[m.tier - 1] || "common", sprite: parts[r.partTier] || null, fallback: KIND_FALLBACK.parts };
        }
        case "chest": {
            const m = CHEST_TIERS[r.chestTier] || {};
            return { name: m.label || "Chest", desc: "Opens for gear at that chest's rarity odds.", rarity: CHEST_RARITY[r.chestTier] || "common", sprite: chests[r.chestTier] || null, fallback: KIND_FALLBACK.chest };
        }
        case "seed": {
            const first = r.pool[0];
            return { name: `Seeds ×${r.min}–${r.max}`, desc: `Farm seeds: ${r.pool.map((x) => SEEDS[x]?.name || x).join(", ")}.`, rarity: SEEDS[first]?.rarity || "common", sprite: crops[`crop:${first}`] || null, fallback: KIND_FALLBACK.seed };
        }
        case "spin":
            return { name: `${r.n} wheel spin${r.n === 1 ? "" : "s"}`, desc: "Spend them on the Daily Spin.", rarity: r.n >= 5 ? "epic" : "rare", fallback: KIND_FALLBACK.spin };
        case "recipe":
            return { name: "A new recipe", desc: "A page for the book — something new you can cook.", rarity: "epic", fallback: KIND_FALLBACK.dish };
        case "creation":
            return { name: "A Creation token", desc: "Design your own decoration with custom AI art — the only reward here that otherwise costs real money.", rarity: "mythic", fallback: KIND_FALLBACK.creation };
        case "consumable": {
            const c = CONSUMABLES[r.id] || {};
            return { name: c.name || r.id, desc: c.desc || "", rarity: "rare", sprite: consumables[r.id] || null, fallback: KIND_FALLBACK.consumable };
        }
        default:
            return { name: "Something", desc: "", rarity: "common" };
    }
}

/**
 * Which rung a run lands on, 0..n-1.
 *
 * Mostly deterministic — a 70% run reliably lands around 70% up the ladder, which is what makes the list
 * readable as a promise. `lift` (the Heat track + the Hearth Cat) nudges it up, and there's a single-rung
 * wobble so two identical runs aren't identical, but a good cook is never dumped on the bottom rung by luck.
 */
export function rungFor(quality, n, lift = 0) {
    const q = Math.max(0, Math.min(1, Number(quality) || 0));
    const base = q * (n - 1) + lift * (n - 1);
    const wobble = Math.random() < 0.25 ? (Math.random() < 0.5 ? -1 : 1) : 0;
    return Math.max(0, Math.min(n - 1, Math.round(base) + wobble));
}
// ── PREPPED INGREDIENTS ───────────────────────────────────────────────────────────────────────────
// The depth layer. Raw crops and fish go INTO these, and these go into the real dishes — so a legendary plate
// isn't "own three rare things", it's a chain you had to build. They live in the same pantry as everything else
// (kind 'prep'), which means one inventory, one screen and one set of rules rather than a parallel system.
export const PREPS = {
    p_flour:     { name: "Stoneground Flour", rarity: "common" },
    p_dough:     { name: "Risen Dough",       rarity: "common" },
    p_butter:    { name: "Churned Butter",    rarity: "common" },
    p_stock:     { name: "Fish Stock",        rarity: "common" },
    p_brine:     { name: "Brined Cockles",    rarity: "common" },
    p_jam:       { name: "Berry Jam",         rarity: "rare" },
    p_syrup:     { name: "Golden Syrup",      rarity: "rare" },
    p_puree:     { name: "Pumpkin Puree",     rarity: "rare" },
    p_wine:      { name: "Dark Wine",         rarity: "rare" },
    p_smoked:    { name: "Smoked Fillet",     rarity: "epic" },
    p_roe:       { name: "Cured Roe",         rarity: "epic" },
    p_chilli:    { name: "Urchin Fire Oil",   rarity: "epic" },
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
    P("k_brine",   "Brine the Cockles",  1, { fish_cockle: 4 },                  "p_brine",     "Two days in salt water and they open themselves."),
    P("k_chilli",  "Draw the Fire Oil",  3, { fish_urchin: 2, corn: 2 },         "p_chilli",    "Handle the spines first. Everyone forgets once."),
    P("k_essence", "Distil the Star",    4, { starfruit: 3 },                    "p_essence",   "It hums faintly against the glass."),
    P("k_marrow",  "Render the Marrow",  4, { fish_whale: 1, fish_kraken: 1 },   "p_leviathan", "Nobody agrees on how it should be done."),

    // ═══ TIER 1 · Simple ═══
    R("r_porridge",    "Morning Porridge",   1, { wheat: 4 },                     "What the pack eats before a long day."),
    R("r_mash",        "Buttered Mash",      1, { potato: 3, p_butter: 1 },       "Comfort, in a bowl."),
    R("r_flatbread",   "Camp Flatbread",     1, { p_dough: 1 },                   "Cooked on a stone by the fire."),
    R("r_roast_roots", "Roasted Roots",      1, { carrot: 2, potato: 2 },         "Sweet, charred at the edges."),
    R("r_carrot_soup", "Carrot Soup",        1, { carrot: 3, p_stock: 1 },        "Orange enough to feel medicinal."),
    R("r_corn_bread",  "Skillet Cornbread",  1, { corn: 2, p_flour: 1 },          "Crisp bottom, soft middle."),
    R("r_boiled_crab", "Boiled Rock Crab",   1, { fish_crab: 2 },                 "Ten minutes, no ceremony."),
    R("r_sardines",    "Salt Sardines",      1, { fish_sardine: 3 },              "Eaten standing up, off the dock."),
    R("r_potato_cake", "Potato Cakes",       1, { potato: 2, p_flour: 1 },        "Fried in whatever's left in the pan."),
    R("r_perch_fry",   "Pan-Fried Perch",    1, { fish_perch: 2, p_butter: 1 },   "Salt, fire, nothing else."),
    // ── added when the survey asked for more fish; most of these are what to DO with the new species ──
    R("r_smelt_fry",   "Whitebait Fry",      1, { fish_smelt: 4 },                "Eaten whole, by the handful."),
    R("r_cockle_broth","Cockle Broth",       1, { p_brine: 1, carrot: 2 },        "Thin, clean, and better than it sounds."),
    R("r_herring_roll","Pickled Herring Roll",1, { fish_herring: 2, p_dough: 1 }, "The dockhands' lunch, and they were right."),

    // ═══ TIER 2 · Hearty ═══
    R("r_fish_stew",   "Fisherman's Stew",   2, { p_stock: 1, potato: 2, fish_mackerel: 1 }, "Everything that didn't sell, in one pot."),
    R("r_berry_tart",  "Berry Tart",         2, { p_jam: 1, p_dough: 1 },         "Worth burning your mouth for."),
    R("r_eel_skewer",  "Glazed Eel Skewers", 2, { fish_eel: 1, p_syrup: 2 },      "Sweet, sticky, gone in a minute."),
    R("r_bass_bake",   "Kelp Bass Bake",     2, { fish_seabass: 1, potato: 2, p_butter: 1 }, "Wrapped in the weed it was pulled from."),
    R("r_corn_chowder","Corn Chowder",       2, { corn: 3, potato: 2, p_stock: 1 }, "Thick enough to stand a spoon in."),
    R("r_squid_ink",   "Squid Ink Supper",   2, { fish_squid: 2, p_dough: 1 },    "Black as a moonless tide."),
    R("r_shrimp_pot",  "Prawn Pot",          2, { fish_shrimp: 3, p_butter: 1 },  "Gone in about four minutes."),
    R("r_puffer",      "Careful Pufferfish", 2, { fish_pufferfish: 2, carrot: 4 }, "Prepared by someone who knows. Hopefully."),
    R("r_snapper_bake","Baked Snapper",      2, { fish_snapper: 2, p_butter: 2 }, "Whole, with the skin left crisp."),
    R("r_harvest_hash","Harvest Hash",       2, { potato: 2, corn: 2, carrot: 2 }, "Whatever came out of the ground that day."),
    R("r_jam_roll",    "Jam Roly-Poly",      2, { p_jam: 1, p_flour: 2 },         "Heavy, sweet, and entirely unreasonable."),
    R("r_moon_broth",  "Moonfish Broth",     2, { fish_moonfish: 1, p_stock: 2 }, "Pale, and faintly luminous."),
    R("r_pumpkin_soup","Pumpkin Soup",       2, { p_puree: 1, p_butter: 1 },      "The bowl everyone comes back for."),
    R("r_octo_grill",  "Grilled Octopus",    2, { fish_octopus: 1, p_wine: 1 },   "Charred tentacle, lemon, done."),

    // ═══ TIER 3 · Fine ═══
    R("r_harvest_pie", "Harvest Pie",        3, { p_puree: 1, p_dough: 1, carrot: 2 }, "The whole field, baked."),
    R("r_crab_boil",   "Crab Boil",          3, { fish_crab: 4, corn: 3, potato: 2 }, "Eaten with your hands, at a long table."),
    R("r_fire_stew",   "Ember Urchin Stew",  3, { p_chilli: 1, p_stock: 1, potato: 2 }, "It bites back. That is the point."),
    R("r_lionfish",    "Lionfish En Papillote", 3, { fish_lionfish: 1, p_butter: 2, carrot: 2 }, "All those spines, for this."),
    R("r_cockle_pasta","Cockle Linguine",    3, { p_brine: 1, p_flour: 2, p_wine: 1 }, "The sauce is mostly the sea."),
    R("r_grape_glaze", "Glazed Roast",       3, { p_wine: 2, potato: 3 },         "Sticky, dark and slightly boozy."),
    R("r_lobster_roll","Lobster Roll",       3, { fish_lobster: 1, p_dough: 1, p_butter: 1 }, "Cold claw, warm bun, too much butter."),
    R("r_smoked_plate","Smokehouse Plate",   3, { p_smoked: 1, p_dough: 1 },      "Best eaten leaning against something."),
    R("r_stormpike",   "Storm Pike Skewers", 3, { fish_stormpike: 2, corn: 4 },   "It sparks when the fat hits the fire."),
    R("r_angler_stew", "Anglerfish Stew",    3, { fish_anglerfish: 1, p_stock: 2, potato: 2 }, "Ugly thing. Extraordinary broth."),
    R("r_sword_steak", "Swordfish Steak",    3, { fish_swordfish: 1, p_butter: 3, carrot: 1 }, "Cut thick, cooked pink."),
    R("r_wine_braise", "Wine-Braised Roots", 3, { p_wine: 1, carrot: 3, potato: 2 }, "Four hours, barely any attention."),
    R("r_syrup_cake",  "Golden Syrup Cake",  3, { p_syrup: 1, p_flour: 2, p_butter: 1 }, "Sticks to the roof of your mouth."),
    R("r_tuna_loin",   "Seared Bluefin",     3, { fish_tuna: 1, p_roe: 2 },       "Thirty seconds a side and not a moment more."),
    R("r_manta_wing",  "Manta Wing",         3, { fish_manta: 1, p_butter: 3 },   "Enormous, and gone by morning."),

    // ═══ TIER 4 · Exquisite ═══
    R("r_lobster",     "Buttered Lobster",   4, { fish_lobster: 2, p_butter: 2, p_wine: 1 }, "The reason people row out in bad weather."),
    R("r_gold_pie",    "Golden Apple Pie",   4, { goldenapple: 2, p_dough: 2, p_syrup: 1 },  "They say it's good for the heart."),
    R("r_sunfish",     "Sunfish Grand Plate", 4, { fish_sunfish: 1, p_puree: 2, p_butter: 2 }, "One fish. The entire table."),
    R("r_narwhal",     "Frost Narwhal Loin",  4, { fish_narwhal: 1, p_smoked: 1, p_wine: 2 },  "Served cold enough to ache."),
    R("r_surf_turf",   "Surf and Turf",      4, { fish_octopus: 1, p_puree: 3, corn: 3 },    "Two whole days of work on one plate."),
    R("r_caviar",      "Cured Roe Service",  4, { p_roe: 2, p_dough: 1 },                    "Served on ice, in silence."),
    R("r_shark_steak", "Great White Steak",  4, { fish_shark: 1, p_wine: 2, p_butter: 1 },   "You are, briefly, top of the food chain."),
    R("r_dolphin",     "Ghost Dolphin Feast",4, { fish_dolphin: 1, p_syrup: 3, corn: 2 },    "Nobody's quite sure it was really there."),
    R("r_marlin_grill","Black Marlin Grill", 4, { fish_marlin: 1, p_smoked: 3, potato: 3 },  "It fought for an hour. It lost."),
    R("r_coelacanth",  "Coelacanth Confit",  4, { fish_coelacanth: 2, p_butter: 3 },         "Older than the town. Cooked anyway."),
    R("r_royal_roast", "Royal Roast",        4, { p_wine: 2, p_puree: 1, goldenapple: 1 },   "For nights that deserve it."),
    R("r_long_board",  "The Long Board",     4, { p_smoked: 2, p_jam: 1, p_dough: 2 },       "Put it in the middle and let people at it."),

    // ═══ TIER 5 · Legendary ═══
    R("r_starfruit",   "Starfruit Ambrosia", 5, { p_essence: 3, goldenapple: 2, p_syrup: 2 }, "Sweet enough that pets forget themselves."),
    R("r_leviathan",   "Leviathan Roast",    5, { p_leviathan: 1, p_puree: 2, p_wine: 2 },    "It took four of you to carry it in."),
    R("r_stormpot",    "Storm Pot",          5, { fish_stormpike: 2, fish_swordfish: 2, p_stock: 3 }, "It crackles. Nobody is sure why."),
    R("r_kraken",      "Kraken Feast",       5, { fish_kraken: 1, p_wine: 2, p_butter: 2 },   "Served to the whole table, or not at all."),
    R("r_whale",       "Sunlit Whale Course",5, { fish_whale: 1, p_essence: 3, p_smoked: 2 }, "A dish people will still mention next winter."),
    R("r_fallen_star", "Fallen Star Plate",  5, { fish_starfish: 2, p_essence: 3 },           "It is still warm. It should not be."),
    R("r_tidewyrm",    "Tidewyrm Ascendant", 5, { fish_tidewyrm: 1, p_essence: 1, p_chilli: 3 }, "It was still curling when it went in."),
    R("r_deep_table",  "The Deep Table",     5, { fish_sunfish: 1, fish_narwhal: 1, p_roe: 2, p_brine: 2 }, "Everything the cold water gave up this year."),
    R("r_grand_feast", "The Grand Feast",    5, { p_leviathan: 1, p_essence: 1, p_roe: 1, p_wine: 2 }, "Everything you have, all at once."),
    R("r_wolfs_table", "The Wolf's Table",   5, { p_smoked: 2, p_roe: 1, p_syrup: 1, goldenapple: 2 }, "The one the whole den turns up for."),
];

export const recipeById = (id) => RECIPES.find((r) => r.id === id) || null;

// Where a recipe can drop from. Weighted by tier so the good ones stay rare.
//
// Nudged toward the bottom and middle of the book: 40/28/18/10/4 -> 46/32/20/9/3. This changes the MIX, not
// the volume — the audited ~1.9 recipes per member per week is untouched, so nothing about how often a recipe
// appears has moved. What shifts is which one you get. It matters most inside the upper bands, where a source
// that can teach tiers 3-5 now lands on tier 3 about 63% of the time instead of 56%.
const DROP_WEIGHT = { 1: 46, 2: 32, 3: 20, 4: 9, 5: 3 };

// ── WHERE RECIPES COME FROM ──────────────────────────────────────────────────────────────────────────────────
//
// They used to come from exactly ONE place: a 4% roll on a farm harvest. Everything else in the game — chests,
// digs, the boss, raids, the sea, the forge — dropped nothing, which made the whole recipe book a farming
// reward and left the top tiers reachable by grinding one screen.
//
// Each source now declares the BAND it can drop from. A wooden chest can't cough up a Legendary recipe no
// matter how many you open; the top tiers only come out of things you can't farm on demand — a boss kill, an
// ascendant chest, a deep dig, a raid win. That's what makes owning one mean something.
// Measured against real 7-day volumes (scripts/audit-recipe-rates.mjs), not guessed. The first pass ran at
// 194.8 recipes/wk across 55 active members = 3.54 each, a full 64-recipe book in 18 weeks — and chests plus
// harvest were 53% of every drop, so "spread it across all the systems" had in practice become "farm and open
// chests". These rates land ~1.9/member/wk (a book in ~33 weeks) with chests+harvest down to 42%.
//
// The high-VOLUME actions are cut hardest: harvest, chests, spin, pet bonding and salvage fire hundreds of
// times a week each, so a rate that looks small there swamps everything else. The low-volume, deliberate ones
// (digging, the forge, a rare deal) are RAISED — they were contributing single digits, which is exactly the
// problem, because those are the moments worth remembering.
//
// Re-run the audit after any change here; the tier BANDS below are separate and stay as they are — a wooden
// chest still cannot yield a Legendary, so the top tiers remain gated by band regardless of rate.
// WHERE A RECIPE CAN COME FROM — the tier BAND only. The odds are not here any more.
//
// This used to be a table of {min, max, chance}, and every feature called tryRecipeDrop() at the end of its
// handler: harvest a crop, roll a hidden 1.5%; open a chest, roll a hidden 2.5% ALONGSIDE whatever the chest
// actually contained. So a recipe was never something a system gave you — it was a coin flip bolted to the
// side of eighteen different handlers, which is exactly why finding one felt arbitrary. It wasn't the chest's
// loot table. It wasn't the wheel. It was a parallel lottery nobody could see.
//
// Now a recipe is an OUTCOME inside each feature's own reward table, drawn like any other prize, and the
// feature decides its own odds the same way it decides everything else it pays out. All that lives here is
// which tiers a given source is allowed to teach — a wooden chest still cannot cough up a Legendary recipe
// however many you open.
export const RECIPE_BANDS = {
    chest_wooden: { min: 1, max: 2 },
    chest_iron:   { min: 2, max: 3 },
    chest_gold:   { min: 2, max: 3 },
    chest_high:   { min: 3, max: 5 },   // mythic and above
    seam:         { min: 1, max: 3 },   // the mine's bag — a page pressed in the rock
    seam_deep:    { min: 3, max: 4 },   // a rich seam
    dig:          { min: 2, max: 3 },
    dig_deep:     { min: 3, max: 4 },
    fish:         { min: 1, max: 3 },   // a sealed bottle
    spin:         { min: 1, max: 3 },
    cook:         { min: 1, max: 3 },   // cooking teaches you the next thing to cook
    raid_win:     { min: 3, max: 4 },
    town_raid:    { min: 3, max: 4 },
    boss_kill:    { min: 4, max: 5 },   // weekly, shared, and the route to the top tiers
    // BOUGHT, with doubloons at the Quartermaster or laurels at the Armoury. The whole book is in range on
    // purpose — DROP_WEIGHT already leans hard on the bottom (46/32/20/9/3), so what you pay for is reliably a
    // tier 1 or 2 and just occasionally something you would never otherwise see. Narrowing the band to the
    // low tiers would have made every purchase identical and killed the only interesting thing about it.
    shop:         { min: 1, max: 5 },
};

// What a random recipe costs. The two prices hold the same ratio the pet stones already set (4,000 doubloons
// against 7,500 laurels), so neither counter is the obviously correct one to use — and the laurel price lands
// exactly on the Armoury's middle crate, which is the tier a permanent unlock belongs beside.
export const RECIPE_PRICE_DOUBLOONS = 400;
export const RECIPE_PRICE_LAURELS = 750;

/**
 * Teach a recipe from a source's band. Call this WHEN THE FEATURE'S OWN TABLE HAS ALREADY DECIDED to pay one
 * out — there is no chance roll in here, on purpose. The odds belong to the chest, the wheel, the seam.
 *
 * Returns the recipe when it was new to them, else null (they already know everything in that band), so the
 * caller can fall back to another prize rather than paying out nothing.
 */
export async function grantRecipeReward(buyerId, band) {
    const def = RECIPE_BANDS[band];
    if (!buyerId || !def) return null;
    return learnRecipe(buyerId, null, { min: def.min, max: def.max });
}

/**
 * Is there anything left to sell this member? Read BEFORE any currency is taken.
 *
 * A shop that charges for a book somebody has already finished is a shop that steals, and the alternative —
 * charge, roll, refund — leaves a hole where a crash between the two halves keeps the money. neon() has no
 * transactions (see the note in buyLocker), so the check has to come first and the grant has to be the very
 * next thing.
 */
/**
 * How much of the book they have, by tier.
 *
 * The shelf used to sell "a recipe" against no context at all: a heading, a sentence and a price. Sixty-four
 * pages exist and a member had no way to know that, no way to see how many they held, and therefore no reason
 * to want another one — the purchase was a coin toss with a price on it rather than a gap being filled.
 *
 * One query, counted in JS against the authored list, so the tier split cannot drift from RECIPES.
 */
export async function recipeProgress(buyerId) {
    const total = RECIPES.length;
    const tiers = TIERS.map((t) => ({
        tier: t.tier, name: t.name, color: t.color,
        total: RECIPES.filter((r) => r.tier === t.tier).length, known: 0,
    }));
    if (!buyerId) return { known: 0, total, tiers };
    const rows = await db.query(`SELECT recipe_id FROM mkt_recipe_known WHERE buyer_id = $1`, [buyerId]).catch(() => []);
    const have = new Set(rows.map((r) => r.recipe_id));
    for (const r of RECIPES) {
        if (!have.has(r.id)) continue;
        const t = tiers.find((x) => x.tier === r.tier);
        if (t) t.known += 1;
    }
    return { known: tiers.reduce((n, t) => n + t.known, 0), total, tiers };
}

export async function hasUnknownRecipe(buyerId) {
    if (!buyerId) return false;
    const known = await db.query(`SELECT recipe_id FROM mkt_recipe_known WHERE buyer_id = $1`, [buyerId]).catch(() => []);
    return known.length < RECIPES.length;
}

/**
 * Hand over a bought recipe. Returns the recipe, or null if they somehow knew them all by the time it ran.
 *
 * The REVEAL is not this function's business and is deliberately not returned to the caller to display: a
 * found recipe is pending state (see the note above pendingRecipeReveals), and the site-wide watcher pays it
 * out wherever the member happens to be standing. Buying one at the Quartermaster therefore gets exactly the
 * same card as finding one in a bottle, for free, and there is only ever one celebration to maintain.
 */
export async function grantBoughtRecipe(buyerId) {
    return grantRecipeReward(buyerId, "shop");
}

/**
 * A companion with the recipe_nose perk makes a feature's recipe outcome likelier. Features multiply their own
 * weight/chance by this rather than each re-reading the perk.
 */
export async function recipeLuck(buyerId) {
    try {
        const { getPetSystemPerk } = await import("@/lib/marketplace/pet-combat.js");
        const nose = await getPetSystemPerk(buyerId, "recipe_nose");
        return nose > 0 ? 1 + nose / 100 : 1;
    } catch { return 1; }
}


/**
 * Roll a recipe the member doesn't know yet, optionally restricted to a tier band.
 *
 * Falls back to the full pool when the band is exhausted — once you know every Legendary recipe a boss kill
 * should still give you something rather than silently nothing.
 */
export function rollRecipe(known = [], { min = 1, max = 5 } = {}) {
    const have = new Set(known);
    const all = RECIPES.filter((r) => !have.has(r.id));
    if (!all.length) return null;
    const banded = all.filter((r) => r.tier >= min && r.tier <= max);
    const pool = banded.length ? banded : all;
    const total = pool.reduce((s, r) => s + (DROP_WEIGHT[r.tier] || 1), 0);
    let n = Math.random() * total;
    for (const r of pool) { n -= DROP_WEIGHT[r.tier] || 1; if (n <= 0) return r; }
    return pool[pool.length - 1];
}

// ── INGREDIENTS ──────────────────────────────────────────────────────────────────────────────────────────────
// Everything resolves to a SPRITE, never an emoji. Raw ingredients reuse art the game already owns — crops from
// mkt_town_art (`crop_<id>_ripe`), fish from the PNGs on disk — and only the prepped ingredients and the dishes
// needed drawing. `fallback` is a sprite path too: if a sprite row is ever missing the answer is still a piece
// of our own art, not whatever glyph the player's phone happens to ship.
const cropMeta = (ref) => SEEDS[ref] || null;
const fishMeta = (ref) => FISH.find((f) => f.id === ref) || null;
export function ingredientMeta(ref, sprites = {}) {
    const pr = PREPS[ref];
    if (pr) return { ref, kind: "prep", name: pr.name, fallback: KIND_FALLBACK.prep, rarity: pr.rarity, sprite: sprites[ref] || null };
    const c = cropMeta(ref);
    if (c) return { ref, kind: "crop", name: c.name, fallback: KIND_FALLBACK.crop, rarity: c.rarity, sprite: sprites[`crop:${ref}`] || null };
    const f = fishMeta(ref);
    if (f) return { ref, kind: "fish", name: f.name, fallback: `/images/fish/${f.id}.png`, rarity: f.rarity, sprite: `/images/fish/${f.id}.png` };
    return { ref, kind: "crop", name: ref, fallback: KIND_FALLBACK.crop, rarity: "common", sprite: null };
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

// ── SUBSTITUTING OFF THE SHELF ───────────────────────────────────────────────────────────────────────────────
// Two ascension powers let a recipe be satisfied with something other than what it asked for. Both need the
// same thing: pull `qty` units out of the pantry from whatever is actually on it.
//
// Biggest stack first, so a substitution eats the thing you have too much of rather than the last of something
// rare. Refs the recipe itself asked for are SKIPPED — otherwise a dish short on one line would quietly eat the
// ingredients it had already set aside for the others.
//
// All-or-nothing: if the shelf can't cover it, everything taken goes straight back. Returns the taken list in
// the same shape the caller's refund loop expects, or null.
const STANDING_RECIPE_PER_DAY = 2;
const SUBSTITUTION_PER_DAY = 3;
// The Tasting Menu's ceiling. A pantry-heavy feast can cover a lot of small recipes at once, and a menu that
// paid twenty rungs off one cook would out-earn every other power on the list by an order of magnitude.
const TASTING_MENU_MAX = 4;

async function takeAnyFromPantry(buyerId, qty, skip = {}) {
    const rows = await db.query(
        `SELECT ref, qty FROM mkt_pantry WHERE buyer_id = $1 AND qty > 0 ORDER BY qty DESC`,
        [buyerId]
    ).catch(() => []);
    const taken = [];
    let need = Math.max(0, Math.round(Number(qty) || 0));
    for (const r of rows) {
        if (need <= 0) break;
        if (skip[r.ref] != null) continue;
        const n = Math.min(need, Number(r.qty) || 0);
        if (n <= 0) continue;
        const got = await db.queryOne(
            `UPDATE mkt_pantry SET qty = qty - $3 WHERE buyer_id = $1 AND ref = $2 AND qty >= $3 RETURNING qty`,
            [buyerId, r.ref, n]
        ).catch(() => null);
        if (!got) continue;
        taken.push({ kind: ingredientMeta(r.ref).kind, ref: r.ref, qty: n });
        need -= n;
    }
    if (need > 0) {
        for (const t of taken) await addToPantry(buyerId, t.kind, t.ref, t.qty);
        return null;
    }
    return taken;
}

// ── THE REVEAL ───────────────────────────────────────────────────────────────────────────────────────────────
// Finding a recipe is PENDING STATE, not a return value.
//
// learnRecipe has always returned the recipe "so callers can announce it", and of the ~18 drop points most
// discarded it — boss kills, the forge, salvage, daily deals, pet bonds, raid wins and cooking itself all
// called it bare. The three that did keep it put it in an API response no client component read. The book just
// grew in silence.
//
// So the announcement stops being each caller's job. A row with celebrated_at IS NULL is a debt; the
// site-wide RecipeFoundWatcher pays it wherever the member happens to be, then acknowledges. A new drop point
// gets the celebration for free by doing nothing.

/** Recipes this member has found but never been shown, oldest first, with everything the modal needs. */
export async function pendingRecipeReveals(buyerId) {
    if (!buyerId) return [];
    const rows = await db.query(
        `SELECT recipe_id FROM mkt_recipe_known
          WHERE buyer_id = $1 AND celebrated_at IS NULL
          ORDER BY learned_at ASC LIMIT 5`,
        [buyerId]
    ).catch(() => []);
    if (!rows.length) return [];

    const sprites = await cookingSprites().catch(() => ({}));
    // ── AND WHERE IT LEAVES THE BOOK ────────────────────────────────────────────────────────────────────
    // The reveal used to be an island: a card with a dish on it, and nothing connecting it to the sixty-three
    // other pages. The single best thing about finding one is watching the count move, so the card is handed
    // the collection and counts UP to it on screen. `book.known` already includes everything in this batch —
    // the rows exist the moment they were learned — so each card in a queue subtracts its own position to
    // show the number as it stood when that page turned up.
    const book = await recipeProgress(buyerId).catch(() => null);
    return rows.map((r, i) => {
        const rec = recipeById(r.recipe_id);
        if (!rec) return null;
        const t = tierMeta(rec.tier);
        return {
            id: rec.id,
            name: rec.name,
            kind: rec.kind,
            flavor: rec.flavor,
            tier: rec.tier,
            tierName: t.name,
            tierColor: t.color,
            // "18 → 19 of 64", counted from where this specific page landed in the batch.
            book: book ? { total: book.total, before: Math.max(0, book.known - (rows.length - i)) } : null,
            sprite: sprites[rec.id] || null,
            fallback: rec.kind === "prep" ? KIND_FALLBACK.prep : KIND_FALLBACK.dish,
            // What it asks for, so the modal answers "can I cook this now?" instead of only "you found a thing".
            needs: Object.entries(rec.need).map(([ref, qty]) => {
                const m = ingredientMeta(ref, sprites);
                return { ref, qty, name: m.name, sprite: m.sprite, fallback: m.fallback };
            }),
            // A prep says what it produces; a dish pays from its tier's ladder.
            makes: rec.kind === "prep"
                ? { name: PREPS[rec.out]?.name || rec.out, sprite: sprites[rec.out] || null, fallback: KIND_FALLBACK.prep }
                : null,
        };
    }).filter(Boolean);
}

/** Mark reveals as shown. Called the moment the modal opens, so it fires exactly once even if the tab dies. */
export async function ackRecipeReveals(buyerId, ids = []) {
    if (!buyerId) return { ok: false };
    const list = (Array.isArray(ids) ? ids : []).filter((x) => typeof x === "string").slice(0, 20);
    if (!list.length) return { ok: true, acked: 0 };
    await db.query(
        `UPDATE mkt_recipe_known SET celebrated_at = NOW()
          WHERE buyer_id = $1 AND celebrated_at IS NULL AND recipe_id = ANY($2)`,
        [buyerId, list]
    ).catch(() => {});
    return { ok: true, acked: list.length };
}

/** Teach a recipe. Returns the recipe when it was NEW to them, else null — so callers can announce it. */
export async function learnRecipe(buyerId, recipeId = null, band = undefined) {
    if (!buyerId) return null;
    const knownRows = await db.query(`SELECT recipe_id FROM mkt_recipe_known WHERE buyer_id = $1`, [buyerId]).catch(() => []);
    const known = knownRows.map((r) => r.recipe_id);
    const rec = recipeId ? recipeById(recipeId) : rollRecipe(known, band);
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
    // THRESHOLDS. A badge is a milestone, not a participation token — the first pass handed out three of these
    // inside an afternoon. At five cooks a day these are roughly: a fortnight, a couple of months, half a year,
    // and a capstone you have to actually keep playing for.
    if (row.cooks >= 1) await g("cook_first");            // day one, deliberately — the "you found it" badge
    if (row.cooks >= 100) await g("cook_apprentice");     // ~3 weeks
    if (row.cooks >= 500) await g("cook_chef");           // ~3 months
    if (row.cooks >= 1000) await g("cook_thousand");      // ~6 months
    if (row.cooks >= 2500) await g("cook_master");        // the long one
    if (row.recipes >= 25) await g("cook_collector");
    if (row.recipes >= RECIPES.length) await g("cook_librarian");
    if (row.best >= 5) await g("cook_legendary");
    if (row.stock >= 500) await g("cook_forager");
    if (row.preps >= 200) await g("cook_prep");
    // 0b11111 = one dish cooked at every tier.
    if ((row.tiers & 31) === 31) await g("cook_every_tier");
    if (Number(row.bestq) >= 0.92) await g("cook_perfect");
    // FIVE, not ten. The minigame is five steps, so ten was unreachable — the badge could never be earned by
    // anyone. Five means every step of a cook graded Great or better: a genuinely clean run.
    if (row.bestchain >= 5) await g("cook_chain");
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
    const [row, pantryRows, knownRows, goldRow, sprites, art, conRows, chestArt, seedRows] = await Promise.all([
        kitchenRow(buyerId),
        db.query(`SELECT kind, ref, qty FROM mkt_pantry WHERE buyer_id = $1 AND qty > 0`, [buyerId]).catch(() => []),
        db.query(`SELECT recipe_id, times_cooked FROM mkt_recipe_known WHERE buyer_id = $1`, [buyerId]).catch(() => []),
        db.queryOne(`SELECT COALESCE(gold,0) AS gold FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null),
        cookingSprites(),
        db.queryOne(`SELECT url FROM mkt_town_art WHERE art_key = 'kitchen'`).catch(() => null),
        db.query(`SELECT consumable_id, url FROM mkt_consumable_sprite`).catch(() => []),
        getChestArt().catch(() => ({})),
        // The SEED BAG. A crop you're short of is a very different situation depending on whether you already
        // hold its seed, and the farm's bag chips read "Carrot ×7" — the crop's name for what is actually a
        // seed. So "I need a carrot but the farm says I have 7" is the obvious reading, and the Kitchen was
        // silent about it. It can now say "plant one" instead of the generic "grow it on the farm".
        db.query(`SELECT seed_id, count FROM mkt_farm_seed WHERE buyer_id = $1 AND count > 0`, [buyerId]).catch(() => []),
    ]);
    // One bundle of art for every reward kind, built once per request rather than per recipe row.
    const rewardArt = {
        consumables: Object.fromEntries(conRows.map((r) => [r.consumable_id, r.url])),
        parts: Object.fromEntries(PART_TIERS.map((t) => [t.tier, t.sprite])),
        chests: Object.fromEntries(Object.entries(chestArt || {}).map(([k, v]) => [k, typeof v === "string" ? v : v?.url || null])),
        crops: sprites,
    };
    const have = new Map(pantryRows.map((r) => [r.ref, Number(r.qty)]));
    const seedBag = new Map(seedRows.map((r) => [r.seed_id, Number(r.count) || 0]));
    const cookedMap = new Map(knownRows.map((r) => [r.recipe_id, Number(r.times_cooked) || 0]));
    const usedToday = row?.cooked_today ? Number(row.cooks_today) || 0 : 0;

    const recipes = RECIPES.map((r) => {
        const known = cookedMap.has(r.id);
        const need = Object.entries(r.need).map(([ref, qty]) => {
            const m = ingredientMeta(ref, sprites);
            const held = have.get(ref) || 0;
            // A prepped ingredient you're short of is not a dead end — say WHICH recipe makes it so the card
            // can link straight there. Raw ingredients get the place you go to gather them instead.
            const maker = m.kind === "prep" ? RECIPES.find((x) => x.out === ref) : null;
            // Seeds you hold for this crop. A recipe wants the HARVESTED produce, so holding the seed isn't
            // the same as having the ingredient — but it does change the advice from "go find one" to
            // "plant one", and it explains the mismatch on the spot.
            const seeds = m.kind === "crop" ? (seedBag.get(ref) || 0) : 0;
            return {
                ...m, qty, held, enough: held >= qty, seeds,
                madeBy: maker ? { id: maker.id, name: maker.name } : null,
                gather: m.kind === "crop"
                    ? { href: "/marketplace/farm", label: seeds > 0 ? `You have ${seeds} ${m.name} seed${seeds === 1 ? "" : "s"} — plant one and harvest it` : `Grow ${m.name} on the farm` }
                    : m.kind === "fish" ? { href: "/marketplace/fishing", label: "Catch it out at sea" } : null,
            };
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
            // What a dish can actually pay, with the gold floor stated separately — the roll is a bonus ON TOP
            // of a guaranteed purse, and hiding that made cooking look like a lottery with a lot of blanks.
            payout: r.kind === "dish" ? {
                // In LADDER order — bottom rung first. Sorting by anything else would go straight back to
                // implying a lottery.
                pool: tierMeta(r.tier).rewards.map((x, i) => ({ ...rewardLabel(x, rewardArt), rung: i + 1 })),
            } : null,
            need,   // shown whether known or not — what a recipe wants is the useful half of the hint
            canCook: known && need.every((n) => n.enough),
        };
    }).sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));

    return {
        unlocked: true,
        art: art?.url || null,
        // THE KETTLE. Its stage is your TOTAL upgrade levels across all four tracks (0-20), so every purchase
        // moves you toward a visibly better pot instead of only a number in a list. Five stages, back-loaded so
        // the last one is genuinely earned.
        kettle: (() => {
            const total = Object.values(TRACK_COL).reduce((n, col) => n + (Number(row?.[col]) || 0), 0);
            const stage = total >= 16 ? 5 : total >= 11 ? 4 : total >= 6 ? 3 : total >= 2 ? 2 : 1;
            const next = [2, 6, 11, 16][stage - 1] ?? null;
            return { stage, total, max: 20, sprite: sprites[`kettle_${stage}`] || null, nextAt: stage < 5 ? next : null };
        })(),
        gold: Number(goldRow?.gold) || 0,
        level: Math.floor(Math.sqrt((Number(row?.cook_xp) || 0) / 40)) + 1,
        cookXp: Number(row?.cook_xp) || 0,
        cooksTotal: Number(row?.cooks_total) || 0,
        bestTier: Number(row?.best_dish_tier) || 0,
        bestQuality: Number(row?.best_quality) || 0,
        bestChain: Number(row?.best_chain) || 0,
        prepsTotal: Number(row?.preps_total) || 0,
        // Kept as a count of what you've done today, NOT an allowance. There is no cap; `left` is gone rather
        // than set to Infinity, so anything still reading it fails loudly instead of quietly gating a button.
        cooks: { today: usedToday },
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
        // The tier rule, surfaced so it never has to be guessed at from play.
        bump: {
            chance: Math.min(0.95, trackValue("heat", row?.heat_level) + 0.18),
            flawlessAt: 92,
        },
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
    const day = await today();
    // Count the cook. This used to be a CLAIM — the same statement with `AND cooks_today < $3`, which is what
    // enforced the daily cap. With the cap gone it is pure telemetry: it still rolls over at midnight CT so
    // "cooked today" means what it says, and it can no longer refuse anybody a cook.
    await db.query(
        `UPDATE mkt_kitchen
            SET cooks_today = CASE WHEN cook_day IS DISTINCT FROM $2::date THEN 1 ELSE cooks_today + 1 END,
                cook_day = $2::date, updated_at = NOW()
          WHERE buyer_id = $1`,
        [buyerId, day]
    ).catch(() => {});

    // The Larder can spare the ingredients entirely — rolled once for the whole dish, not per line, so a cook
    // either costs you everything it should or nothing at all.
    // Read once, up here, because the Larder roll below needs it too — and `a < b + c || 0` parses as
    // `(a < b + c) || 0`, so writing it inline both double-queried and silently discarded the pet's help.
    const petBonus = await petCookBonus(buyerId).catch(() => ({}));
    // MUST be resolved here, above the Larder roll. This block used to sit ~40 lines further down, next to the
    // heat/portion rolls that also read it — but the Larder roll on the very next line reads .larder, and `let`
    // hoists WITHOUT initialising, so every cook died on "Cannot access 'equippedKitchen' before initialization"
    // before it could return anything. The route 500'd, the client saw no `ok`, and no result card was ever
    // shown. Keep this above the first read: the four kitchen perks are one fact and belong together, up front.
    let equippedKitchen = { heat: 0, larder: 0, portion: 0, prep: 0 };
    try {
        const { getPetSystemPerk } = await import("@/lib/marketplace/pet-combat.js");
        const [h, l, po, pr] = await Promise.all([
            getPetSystemPerk(buyerId, "kitchen_heat"),
            getPetSystemPerk(buyerId, "kitchen_larder"),
            getPetSystemPerk(buyerId, "kitchen_portion"),
            getPetSystemPerk(buyerId, "kitchen_prep"),
        ]);
        equippedKitchen = { heat: h, larder: l, portion: po, prep: pr };
    } catch { /* no companion, no bonus */ }
    // ── ASCENSION POWERS ON A COOK ───────────────────────────────────────────────────────────────────────
    // The Banked Fire makes every third cook free. Counted off the member's own cook tally rather than a die,
    // so "every third" is literally every third — a roll would have made it a 1-in-3 chance, which is a
    // different promise and a worse one.
    const cookPowers = await equippedPowers(buyerId);
    const bankedFire = cookPowers.has("banked_fire") && ((Number(row?.cooks_total) || 0) + 1) % 3 === 0;
    const freeCook = bankedFire
        || Math.random() < trackValue("larder", row?.larder_level) + (petBonus.thrifty || 0) + equippedKitchen.larder / 100;
    if (!freeCook) {
        const taken = [];
        // The Standing Recipe (twice a day, the whole dish) and The Substitution (three times a day, ONE
        // line) both cover a short ingredient out of whatever else is on the shelf. Claimed LAZILY — only
        // once a line actually comes up short — so a day's uses are never spent on a cook that had the
        // ingredients all along.
        let standing = null;   // null = not asked yet, so the claim happens at most once per cook
        let subUsed = false;
        for (const [ref, qty] of Object.entries(rec.need)) {
            const meta = ingredientMeta(ref);
            const got = await db.queryOne(
                `UPDATE mkt_pantry SET qty = qty - $3 WHERE buyer_id = $1 AND ref = $2 AND qty >= $3 RETURNING qty`,
                [buyerId, ref, qty]
            ).catch(() => null);
            if (got) { taken.push({ kind: meta.kind, ref, qty }); continue; }

            if (standing === null && cookPowers.has("standing_recipe")) {
                standing = await claimPowerUse(buyerId, "standing_recipe", STANDING_RECIPE_PER_DAY);
            }
            let subbed = standing ? await takeAnyFromPantry(buyerId, qty, rec.need) : null;
            if (!subbed && !subUsed && cookPowers.has("substitution")
                && (await claimPowerUse(buyerId, "substitution", SUBSTITUTION_PER_DAY))) {
                subUsed = true;
                subbed = await takeAnyFromPantry(buyerId, qty, rec.need);
            }
            if (subbed) { taken.push(...subbed); continue; }

            // Put back whatever we already took — a half-consumed cook is worse than a failed one.
            for (const t of taken) await addToPantry(buyerId, t.kind, t.ref, t.qty);
            await db.query(`UPDATE mkt_kitchen SET cooks_today = GREATEST(0, cooks_today - 1) WHERE buyer_id = $1`, [buyerId]).catch(() => {});
            return { ok: false, error: "missing_ingredients", missing: meta.name };
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
    // Chef's Pick: one dish a day is cooked to perfect timing without playing the minigame. Claimed atomically
    // so it is genuinely once — a rationed power resolved by a plain read would double on a double-tap.
    const chefsPick = await claimPowerUse(buyerId, "chef_s_pick");
    const q = chefsPick ? 1 : (quality == null ? 0.5 : Math.max(0, Math.min(1, Number(quality) || 0)));
    const chainN = Math.max(0, Math.min(50, Math.floor(Number(chain) || 0)));

    // HOW YOU REACH A HIGHER TIER — the rule, in one place, because it wasn't obvious from playing:
    //
    //   · The RECIPE sets the floor. A tier-2 recipe pays from the tier-2 table no matter how well you cook it.
    //   · A good run buys a CHANCE at one tier higher, stacked with the Heat track and the Hearth Cat.
    //   · A FLAWLESS run (92%+) guarantees it.
    //
    // So the ceiling is the recipe you have the ingredients for, +1 — never "five taps for the best table". The
    // guarantee at the top is the point of the minigame having a skill ceiling at all: without it a perfect run
    // was a coin flip, which makes practising feel pointless.
    const FLAWLESS = 0.92;
    const bumpChance = trackValue("heat", row?.heat_level) + Math.max(0, q - 0.5) * 0.36 + (petBonus.hot_hands || 0) + equippedKitchen.heat / 100;
    // The Hot Stone is a flat one-in-three tier bump on top of whatever Heat and the Hearth Cat already buy.
    const bumped = q >= FLAWLESS || Math.random() < bumpChance || (cookPowers.has("hot_stone") && oneIn(3));
    const tier = Math.min(TIERS.length, rec.tier + (bumped ? 1 : 0));

    let made = null;
    let goldPaid = 0;
    const alsoMade = [];   // The Tasting Menu's ride-along dishes, so the result card can name them
    let portions = 1 + (Math.random() < trackValue("season", row?.season_level) + Math.max(0, q - 0.7) * 0.3 + (petBonus.generous || 0) + equippedKitchen.portion / 100 ? 1 : 0);
    // The Copper Pot is a second helping one cook in four; The Big Pot makes the helping itself bigger one in
    // three. Two different levers on purpose — portions is "how many", potLift is "how much of each".
    if (cookPowers.has("copper_pot") && oneIn(4)) portions += 1;

    // THE BIG POT. Seasoning gives you a second DISH; the pot makes the dish you cooked BIGGER. It multiplies
    // the serving rather than rolling for one, so every level is felt on every cook instead of being a coin
    // flip you mostly lose.
    //
    // serve() folds the second helping and the pot size into one number, and rounds PROBABILISTICALLY: at +30%
    // a two-part reward is 2.6, which pays 3 about sixty percent of the time instead of always truncating to 2.
    // Flat rounding would have thrown away the entire upgrade on every reward small enough to matter.
    // Big Pot no longer touches quantity — see the note on the track table. It rides on cooking XP now, so
    // `serve` is portions only and potLift is applied where the XP is worked out.
    const potLift = trackValue("batch", row?.batch_level) + (cookPowers.has("big_pot") && oneIn(3) ? 1 : 0);
    const potMult = 1;
    const serve = (n) => {
        const exact = Math.max(0, Number(n) || 0) * portions * potMult;
        const whole = Math.floor(exact);
        return Math.max(1, whole + (Math.random() < exact - whole ? 1 : 0));
    };

    const spriteMap = await cookingSprites();
    if (rec.kind === "prep") {
        // A prep hands back an INGREDIENT, not a consumable — a good run just makes more of it.
        // Prep Cook (Copper Kettle) is its own roll on top of the portion roll — prepping is the grind, so the
        // pet that helps with it should be felt on the prep chain specifically.
        const prepBonus = (Math.random() < ((petBonus.prep_cook || 0) + equippedKitchen.prep / 100) ? 1 : 0)
            + (cookPowers.has("prep_bench") && oneIn(3) ? 1 : 0);
        portions += prepBonus;
        await addToPantry(buyerId, "prep", rec.out, serve(1));
        const m = PREPS[rec.out];
        made = { kind: "prep", id: rec.out, name: m?.name || rec.out, desc: "A prepped ingredient other recipes call for.", sprite: spriteMap[rec.out] || null };
    } else {
        // ONE roll from the tier's table, which spans the Forge, chests, the farm, sailing, the wheel and
        // Creations rather than only the consumables that happened to exist first. Gold is one of the entries,
        // not a guaranteed purse on top — cooking shouldn't mint money on a timer.
        const ladder = tierMeta(tier).rewards;
        let rung = rungFor(q, ladder.length, petBonus.hot_hands || 0);
        // The Head Chef takes the consolation rung off your ladder entirely — a floor, never a jackpot.
        if (cookPowers.has("head_chef") && ladder.length > 1) rung = Math.max(1, rung);
        const r = ladder[rung];
        const lbl = rewardLabel(r, {
            consumables: conSprites,
            parts: Object.fromEntries(PART_TIERS.map((t) => [t.tier, t.sprite])),
            chests: await getChestArt().then((a) => Object.fromEntries(Object.entries(a || {}).map(([k, v]) => [k, typeof v === "string" ? v : v?.url || null]))).catch(() => ({})),
            crops: spriteMap,
        });
        // ONE RUNG, PAID. Extracted from the branch it used to be written inline in, because The Tasting Menu
        // pays several rungs in a row — the alternative was a second copy of this switch, which would have
        // drifted from the first the next time a reward kind was added to a ladder.
        const payRung = async (rw, forRecipe, tierN) => {
        switch (rw.kind) {
            case "gold": {
                const bonusN = serve(rint(rw.min, rw.max));
                const p2 = await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`, [buyerId, bonusN]).catch(() => null);
                await logCoin(buyerId, bonusN, "cooking", { balanceAfter: p2?.gold, meta: { recipe: forRecipe.id, tier: tierN } }).catch(() => {});
                goldPaid += bonusN;
                break;
            }
            // `portions` is the Seasoning track's second helping. It used to be applied ONLY to gold, so
            // "the same dish, twice" quietly meant "the same dish once" for six of the seven reward kinds —
            // the track read as broken to anyone who bought it and then won a chest.
            case "parts": await addParts(buyerId, rw.partTier, serve(rint(rw.min, rw.max))).catch(() => {}); break;
            case "chest": await addChests(buyerId, { [rw.chestTier]: serve(1) }, { source: "cooking", meta: { recipe: forRecipe.id } }).catch(() => {}); break;
            case "seed": {
                const id = rw.pool[Math.floor(Math.random() * rw.pool.length)];
                for (let i = 0, n = serve(rint(rw.min, rw.max)); i < n; i += 1) await grantSeed(buyerId, id).catch(() => {});
                break;
            }
            // Cooking teaching you the next thing to cook is the one recipe source that was always thematically
            // right — it just wasn't ON the ladder, it was a 4.5% roll after the fact. Now it is a rung.
            case "recipe": {
                const learned = await grantRecipeReward(buyerId, rw.band).catch(() => null);
                if (!learned) { // knows them all in this band — pay the rung below rather than nothing
                    const g = 240 + tierN * 60;
                    const p3 = await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`, [buyerId, g]).catch(() => null);
                    await logCoin(buyerId, g, "cooking", { balanceAfter: p3?.gold, meta: { recipe: forRecipe.id, fallback: true } }).catch(() => {});
                    goldPaid += g;
                }
                break;
            }
            case "spin": await db.query(`UPDATE mkt_buyer SET spin_tokens = COALESCE(spin_tokens,0) + $2 WHERE id = $1`, [buyerId, serve(rw.n)]).catch(() => {}); break;
            case "creation": await grantCustomCredit(buyerId, serve(rw.n), { source: "cooking", meta: { recipe: forRecipe.id, tier: tierN } }).catch(() => {}); break;
            case "consumable": await grantConsumable(buyerId, rw.id, serve(1)).catch(() => {}); break;
            default: break;
        }
        };
        await payRung(r, rec, tier);

        // ── THE TASTING MENU ─────────────────────────────────────────────────────────────────────────────
        // Once a day, the ingredients this dish used also make every OTHER dish you know they could have
        // made — every known recipe whose whole shopping list is covered by this one's. Each pays a rung off
        // its OWN tier's ladder, so a humble side dish riding along with a feast still pays like a side dish.
        //
        // Preps are excluded: they hand back an ingredient rather than a reward, and a menu that quietly
        // refilled the pantry with the thing you just spent would be a loop, not a bonus.
        if (cookPowers.has("tasting_menu") && (await claimPowerUse(buyerId, "tasting_menu"))) {
            const knownIds = new Set((await db.query(`SELECT recipe_id FROM mkt_recipe_known WHERE buyer_id = $1`, [buyerId]).catch(() => [])).map((k) => k.recipe_id));
            const covered = RECIPES.filter((other) => other.id !== rec.id && other.kind !== "prep" && knownIds.has(other.id)
                && Object.entries(other.need).every(([ref, n]) => (rec.need[ref] || 0) >= n));
            for (const other of covered.slice(0, TASTING_MENU_MAX)) {
                const oLadder = tierMeta(other.tier).rewards;
                await payRung(oLadder[rungFor(q, oLadder.length, petBonus.hot_hands || 0)], other, other.tier);
                alsoMade.push({ id: other.id, name: other.name, tier: other.tier, sprite: spriteMap[other.id] || null });
            }
        }
        made = { kind: "dish", id: rec.id, name: rec.name, desc: lbl.desc, reward: { ...lbl, kind: r.kind, rung: rung + 1, rungs: ladder.length }, sprite: spriteMap[rec.id] || null };
    }

    // Big Pot rides here — the one axis Seasoning, Heat and Larder all leave alone.
    const xp = Math.round(8 * tier * (0.7 + q * 0.6) * (1 + potLift));
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
    // Daily bounties. A prep counts for the prep task, a dish for the dish task, and a run graded "perfect" or
    // better counts for the skill one — so the three tasks can't all be cleared by the same three taps.
    await bumpQuestProgress(buyerId, rec.kind === "prep" ? "cook_prep" : "cook_dish", 1).catch(() => {});
    if (q >= 0.72) await bumpQuestProgress(buyerId, "cook_clean", 1).catch(() => {});

    return {
        ok: true,
        made: { ...made, tier, tierName: tierMeta(tier).name, tierColor: tierMeta(tier).color },
        portions, bumped, freeCook, xp, quality: q, chain: chainN, goldPaid, alsoMade,
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

/**
 * Another member's recipe book, for their public profile.
 *
 * Shows the same shape the Kitchen shows you about yourself: what they've found, what they haven't, and how far
 * along they are. Browsing someone with a fuller book is the point — it's the thing that makes you want to go
 * looking for the one you're missing.
 *
 * GATED ON THE VIEWER, not the owner. The Kitchen is still owner-only, so this returns null for anyone who
 * can't cook yet — otherwise a profile page would advertise an unreleased feature to everybody.
 *
 * Names only for recipes they DON'T have: it says what exists to chase without handing over the tier's reward
 * ladder, which is what the Kitchen is for.
 */
export async function getMemberRecipeBook(viewerId, ownerId) {
    if (!COOK_UNLOCKED(viewerId) || !ownerId) return null;
    const rows = await db.query(`SELECT recipe_id, times_cooked FROM mkt_recipe_known WHERE buyer_id = $1`, [ownerId]).catch(() => []);
    const known = new Map(rows.map((r) => [r.recipe_id, Number(r.times_cooked) || 0]));
    const sprites = await cookingSprites().catch(() => ({}));
    const byTier = new Map();
    for (const r of RECIPES) {
        const t = Number(r.tier) || 1;
        if (!byTier.has(t)) byTier.set(t, { tier: t, name: tierMeta(t).name, color: tierMeta(t).color, have: 0, total: 0, recipes: [] });
        const g = byTier.get(t);
        g.total += 1;
        const has = known.has(r.id);
        if (has) g.have += 1;
        g.recipes.push({ id: r.id, name: r.name, kind: r.kind, has, timesCooked: has ? known.get(r.id) : 0, sprite: has ? sprites[r.id] || null : null });
    }
    const tiers = [...byTier.values()].sort((a, b) => a.tier - b.tier);
    return { known: known.size, total: RECIPES.length, cooked: [...known.values()].reduce((n, v) => n + v, 0), tiers };
}
