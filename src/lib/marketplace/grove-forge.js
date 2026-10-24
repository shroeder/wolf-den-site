// ── THE GROVE'S FORGE: CHESTS, MERITS, AND A CRAFTING LEVEL ─────────────────────────────────────────────────
// Luke: "the boss table has a loot table its got good shot like random chests and stuff, the chests are a
// parallel chest that have rare crafting goods for the grove. And you can make boss armor that is a set in
// game. Depending on the boss difficulty determines the rarity of the set. Also, as you craft gear you gain
// levels in crafting each crafting level helps your rolls on crafting improving quality of the in game things
// you craft for example a fishing rod, whatever that does, it could be more effective depending on your
// crafting level."
//
// ⚠️ PURE. No db, no server-only -- the workbench screen reads this and so does the server, exactly like
// grove-recipes.js. Two copies of a quality curve would be two different games.
//
// ⚠️ AND "PARALLEL" IS LOAD-BEARING. The game already has a chest line in chests.js: eight tiers, paying
// gear and gold and coins into the main economy through a roll that is a CHAIN whose first match wins. A
// Grove chest must never be granted through addChests, because raising any tier of that chain silently
// steals from the tiers under it -- see [[chest-rolls-are-a-chain]] and [[reward-tables-are-shared-objects]].
// A Grove chest pays Grove parts and nothing else, out of its own table, through its own roll.

import { GROVE_ZONES, GROVE_CHARMS } from "@/lib/marketplace/grove-catalog.js";
import { toolBonusPct } from "@/lib/marketplace/grove-recipes.js";
import { GEAR_RARITY_COLOR } from "@/lib/marketplace/rarity.js";

// ── THE CRAFTING LEVEL ──────────────────────────────────────────────────────────────────────────────────────
// ⚠️ THE LEVEL IS DERIVED FROM XP, NEVER STORED. The same rule the tool ladder already follows: a stored
// level is a number that must be migrated the first time the curve moves, and a curve like this one will
// move. craft_xp is the only thing on the row.
//
// The curve is deliberately shallow at the start and long in the tail. A player who crafts their first five
// things should feel the level move; a player at level 20 should not be one poultice from 21.
export const CRAFT_LEVEL_CAP = 25;
const CRAFT_BASE = 60;      // xp for level 2
const CRAFT_GROWTH = 1.34;  // each level costs this much more than the last

/** Total xp needed to have REACHED a level. Level 1 is free. */
export function craftXpForLevel(level) {
    const n = Math.max(1, Math.min(CRAFT_LEVEL_CAP, Math.floor(level)));
    let total = 0;
    for (let i = 2; i <= n; i += 1) total += Math.round(CRAFT_BASE * CRAFT_GROWTH ** (i - 2));
    return total;
}

/** Level, and how far into the next one, from a raw xp total. */
export function craftLevel(xp) {
    const have = Math.max(0, Number(xp) || 0);
    let level = 1;
    while (level < CRAFT_LEVEL_CAP && have >= craftXpForLevel(level + 1)) level += 1;
    const floorXp = craftXpForLevel(level);
    const nextXp = level >= CRAFT_LEVEL_CAP ? null : craftXpForLevel(level + 1);
    return {
        level,
        xp: have,
        intoLevel: have - floorXp,
        needForNext: nextXp == null ? null : nextXp - floorXp,
        progress: nextXp == null ? 1 : Math.min(1, (have - floorXp) / Math.max(1, nextXp - floorXp)),
        capped: level >= CRAFT_LEVEL_CAP,
    };
}

// ── WHAT A CRAFT IS WORTH TO THE LEVEL ──────────────────────────────────────────────────────────────────────
// ⚠️ PRICED OFF THE RECIPE'S OWN COST, NOT A FLAT NUMBER PER CRAFT. A flat award makes the cheapest recipe
// the fastest way to level, which turns a crafting ladder into a poultice-spamming chore -- the same shape as
// any faucet with no cap. Paying for the PARTS consumed means the ladder advances at the rate the player
// actually gathers, which is the thing the level is supposed to measure.
export const CRAFT_XP_PER_PART = 2;
// ⚠️ A CHARM IS PRICED LIKE FOOD, NOT LIKE A TOOL, AND FOR THE SAME REASON. Everything else on this list
// is a one-time climb: a tier is made once, a vault built once, so paying them well cannot be farmed. Food
// and charms are the two kinds that are CONSUMED, which makes them repeatable for as long as the parts
// last, on a kill loop with no daily cap. At the default multiplier of 1 a charm paid 20 xp a craft and
// became the fastest route up the ladder by a wide margin — the exact shape of the poultice spam the food
// multiplier already exists to prevent. Slightly above food because a charm costs more and is not made
// five at a time.
export const CRAFT_XP_KIND = { tool: 2.2, pack: 1.8, bank: 1.8, plot: 2.5, food: 0.5, charm: 0.7, decor: 1.4 };

export function craftXpFor(recipe) {
    if (!recipe) return 0;
    const parts = Object.values(recipe.parts || {}).reduce((a, n) => a + (Number(n) || 0), 0);
    const mult = CRAFT_XP_KIND[recipe.kind] ?? 1;
    // ⚠️ FOOD IS DELIBERATELY THE WORST. It is the one recipe kind that makes a STACK and is meant to be
    // crafted constantly, so paying it at the same rate as a tool would make it the only thing worth making.
    return Math.max(1, Math.round(parts * CRAFT_XP_PER_PART * mult));
}

// ── QUALITY ─────────────────────────────────────────────────────────────────────────────────────────────────
// Luke: "each crafting level helps your rolls on crafting improving quality of the in game things you craft
// for example a fishing rod, whatever that does, it could be more effective depending on your crafting level."
//
// A roll from 0 to 100, biased upward by the crafting level. ⚠️ IT IS A ROLL AND NOT A FORMULA, deliberately:
// a level that simply SET the quality would make every craft at a level identical, and the thing that makes a
// crafting ladder worth climbing is that a high level makes a good outcome LIKELY rather than certain. A
// level-1 crafter can still luck into a fine rod; a level-20 one almost never makes a poor one.
//
// ⚠️ AND THE BONUS IS NOT STORED. What gets written down is the ROLL -- a fact about history that no curve
// change can invalidate. What the roll is worth is computed at read time, so retuning never needs a backfill.
// Same rule as TOOL_PCT_PER_TIER. See the migration note.
// ── ⚠️ MASTERWORK SITS ABOVE PRISTINE AND TAKES NOTHING FROM IT ─────────────────────────────────────────────
// Luke, on whether crafting lacks surprise: it did, and this is the arithmetic reason. The best thing that
// could happen at the bench was a word the player had already seen, because Pristine covered 90-100 and the
// curve lifts the FLOOR rather than the ceiling -- so a level-25 crafter hit the top band often enough that
// it stopped being an event, and had nothing left above it to want.
//
// A fifth band at 98 is rare at EVERY level by construction: about 2.1% at level 1 and still only about 5.0%
// at the cap. That is the shape a top band should have -- a thing that happens to you a few times a season
// rather than a thing you grind to make routine.
//
// ⚠️ IT COSTS NOBODY ANYTHING. Pristine keeps x1.60 and simply ends at 97; every tool already made keeps the
// exact band and multiplier it had. The highest quality on the live database is 78, so nothing in existence
// even reaches the new boundary.
//
// ⚠️ AND IT REOPENS REWORK AT THE TOP. groveRework refuses at QUALITY_BANDS[0] so nobody spends parts on a
// change they cannot see -- which, with four bands, meant a Pristine tool was finished for ever and the
// player's best tool was the one the bench had least use for. Because that guard names the array's first
// entry rather than the word "pristine", it followed the new band on its own.
// ── ⚠️ AND THE BANDS CARRY THEIR OWN COLOUR — THE SITE LADDER, NOT A NEW ONE ───────────────────────────────
// This is the third palette and the first one that is not invented. The two that failed are worth keeping,
// because they failed in opposite directions and both were my own taste rather than the product.
//
//   1  The generic rarity palette: a washed lavender Pristine. Luke: "I hate the colors so much on that
//      pink thing, its terrible." Fair — a desaturated mauve a finger wide in a feature made of wood and
//      brass looks like it wandered in from somewhere else.
//   2  A muted forge temper scale: iron, steel, copper, brass. Luke: "Your colors you selected are muted
//      and terrible. We use colors across the whole website for all sorts of mini games and everything."
//      Also fair, and worse — I over-corrected from too-loud into drab, and drab is not a reward.
//
// So the colours stop being chosen. GEAR_RARITY_COLOR in rarity.js is the ladder this game already speaks:
// grey, blue, purple, amber, hot pink, carried by chests, items, pets, decorations and every drop screen in
// the Den. A crafting band is a reward tier like any other and now reads in exactly the same language — a
// player who knows what a legendary looks like already knows what a Pristine tool looks like.
//
// ⚠️ MASTERWORK IS MYTHIC MINT, NOT A RAINBOW. The prismatic treatment was one more invention on top
// of a palette that had already been rejected twice; mint is what the top of this ladder looks like
// everywhere else in the Den, it is the brightest thing on the rack, and it is unmistakable against
// amber, violet, blue and grey without needing to animate.
//
// ⚠️ IMPORTED, NEVER RESTATED. Copying five hexes out of the table would be a sixth palette that drifts
// the first time the site is retinted — the same defect as a copied balance number, just quieter.
// See [[balance-constants-never-copied]].
export const QUALITY_BANDS = [
    { at: 98, id: "masterwork", name: "Masterwork", mult: 1.90, tint: GEAR_RARITY_COLOR.mythic, ink: "#032a20" },
    { at: 90, id: "pristine", name: "Pristine", mult: 1.60, tint: GEAR_RARITY_COLOR.legendary, ink: "#2a1b05" },
    { at: 72, id: "fine", name: "Fine", mult: 1.35, tint: GEAR_RARITY_COLOR.epic, ink: "#1b0632" },
    { at: 45, id: "sound", name: "Sound", mult: 1.15, tint: GEAR_RARITY_COLOR.rare, ink: "#04202f" },
    { at: 0, id: "rough", name: "Rough", mult: 1.00, tint: GEAR_RARITY_COLOR.common, ink: "#13181d" },
];

/** A band colour, by id. The one accessor; nothing else may name a band colour. */
export const bandTint = (id) => QUALITY_BANDS.find((b) => b.id === id)?.tint || GEAR_RARITY_COLOR.common;
export const bandInk = (id) => QUALITY_BANDS.find((b) => b.id === id)?.ink || "#f2f4ee";

export const qualityBand = (q) => QUALITY_BANDS.find((b) => (Number(q) || 0) >= b.at) || QUALITY_BANDS[QUALITY_BANDS.length - 1];

/** How many bands above Rough a roll landed. 0 for Rough, 4 for Masterwork — what every non-tool payoff
 *  below is priced in, so adding a band moves them all at once instead of none of them. */
export const qualityStep = (q) => (QUALITY_BANDS.length - 1) - QUALITY_BANDS.findIndex((b) => b.id === qualityBand(q).id);

/**
 * Roll a quality, biased by the crafting level.
 *
 * ⚠️ A CONTINUOUS BIAS, NOT A THRESHOLD, AND THE FIRST VERSION OF THIS WAS WRONG. It took two draws and
 * kept the better one once past level 8. Simulated at 20,000 rolls a level that produced a DEAD LADDER:
 * levels 1 to 5 were identical to three significant figures, there was one jump at 8, and levels 8 through
 * 25 were identical again. A player climbing seventeen levels would have seen nothing change -- which is
 * the exact opposite of "each crafting level helps your rolls".
 *
 * A power curve moves the whole distribution every single level instead. q = 100 * u^p with p shrinking as
 * the level rises: the expected roll climbs smoothly from about 51 at level 1 to about 71 at the cap, and
 * every band share moves with it.
 *
 * It still lifts the FLOOR rather than the ceiling -- 100 stays reachable at level 1 and never becomes
 * certain at level 25 -- which is what keeps Pristine something to be pleased about at every level.
 */
export const QUALITY_BIAS = 0.062;   // how hard a level bends the curve

// ── ⚠️ TEMPERING: THE ONLY DECISION THE CRAFT ITSELF HAS EVER OFFERED ───────────────────────────────────────
// Pressing Craft took no input. The parts were fixed, the roll was the game's, and the player's entire
// contribution was choosing a row -- which is why a crafting screen built around a random outcome still felt
// like a vending machine. Tempering is the choice: pay a share of the recipe again and the roll bends.
//
// ⚠️ IT BENDS THE SAME CURVE THE LEVEL DOES, rather than being a second mechanism bolted beside it. A flat
// "+10 quality" would collide with the band edges in ways no screen could explain, and a separate roll would
// need its own odds table living next to a live formula -- two numbers that disagree the first time either is
// tuned. This is one extra term in one exponent, so qualityOdds shows the tempered chances by passing the
// same flag, and the player is rolled against exactly the odds they were shown.
//
// Worth about eight crafting levels at the bottom of the ladder and rather less at the top, which is the
// right shape: it is most useful to the player who has least, and it never becomes a formality.
export const TEMPER_BONUS = 0.5;

// ⚠️ `extra` IS A THIRD TERM, NOT A FOURTH CURVE. The craft act (grove-craft-act.js) needs to bend the same
// exponent that the level and the temper bend, and the first attempt expressed it as extra LEVELS -- which
// silently did nothing at level 25, because the level is clamped to the cap. A capped crafter would have
// played the beats perfectly and watched the board not move, which is the dead-ladder bug this curve was
// rewritten once already to remove. A term outside the clamp cannot have that problem.
export function rollQuality(level, rand, temper = false, extra = 0) {
    const lv = Math.max(1, Math.min(CRAFT_LEVEL_CAP, Number(level) || 1));
    const p = 1 / (1 + lv * QUALITY_BIAS + (temper ? TEMPER_BONUS : 0) + Math.max(0, Number(extra) || 0));
    const u = Math.min(0.999999, Math.max(1e-9, rand()));
    return Math.max(0, Math.min(100, Math.round(100 * u ** p)));
}

/**
 * The exact band shares at a given crafting level.
 *
 * ⚠️ DERIVED FROM THE CURVE, NEVER TABULATED. The screen is going to SHOW these as the player's odds, and
 * a hand-written table beside a live formula is two numbers that disagree the moment either is tuned --
 * the player would be shown one set of chances and rolled against another, which is the worst possible
 * version of "transparency". Closed form: P(q >= at) = 1 - (at/100)^(1/p).
 */
export function qualityOdds(level, temper = false, extra = 0) {
    const lv = Math.max(1, Math.min(CRAFT_LEVEL_CAP, Number(level) || 1));
    const p = 1 / (1 + lv * QUALITY_BIAS + (temper ? TEMPER_BONUS : 0) + Math.max(0, Number(extra) || 0));
    // ── ⚠️ THE BAND EDGE IS HALF A POINT LOWER THAN IT LOOKS, BECAUSE THE ROLL ROUNDS ───────────────
    // rollQuality returns Math.round(100 * u ** p), so a score of 98 is produced by anything from 97.5
    // up. Integrating to a flat 98 therefore computes the odds of a roll the game does not make.
    //
    // It was invisible while there were four bands: every share except the top one is the DIFFERENCE of
    // two cumulatives, and the half-point offsets very nearly cancel. The top band has nothing above it
    // to cancel against — its share IS the tail — so the whole error lands there, and it lands there in
    // the player's favour, which is the kind of discrepancy nobody reports. Measured against 120,000
    // rolls through the server's own seeding, Masterwork came out 2.66% against a printed 2.12%: a
    // quarter more often than the screen promised, at every level.
    //
    // ⚠️ THE SCREEN IS WHAT MOVES, NOT THE ROLL. The roll was never wrong — a band is "98 and up" and it
    // rounds like a score should. It is the odds that were describing a slightly different game, and the
    // whole point of sending them is that the player can check them against what they get.
    const atLeast = (at) => (at <= 0 ? 1 : 1 - (Math.max(0, at - 0.5) / 100) ** (1 / p));
    const out = [];
    for (let i = 0; i < QUALITY_BANDS.length; i += 1) {
        const band = QUALITY_BANDS[i];
        const above = i === 0 ? 0 : atLeast(QUALITY_BANDS[i - 1].at);
        out.push({ id: band.id, name: band.name, mult: band.mult, share: Math.max(0, atLeast(band.at) - above) });
    }
    return out;
}

/**
 * What a tool is ACTUALLY worth: its tier, multiplied by how well it came out.
 *
 * ⚠️ IT IMPORTS toolBonusPct RATHER THAN RESTATING THE PER-TIER NUMBER. A copied constant is a second,
 * wrong game -- the ladder would be retuned in one file and not the other, and nothing would ever throw.
 * See [[balance-constants-never-copied]] and [[reuse-the-rule-never-restate-it]].
 *
 * ⚠️ A NULL QUALITY IS THE FLOOR, NOT A CRASH. Every tool crafted before quality existed has none, and
 * inventing a value for those would be making up history; they read as Rough, which is exactly what they
 * were worth when they were made.
 */
export function toolBonusFor(tier, quality) {
    return Math.round(toolBonusPct(tier) * qualityBand(quality).mult * 10) / 10;
}

// ── ⚠️ EVERY KIND ROLLS NOW, NOT JUST TOOLS ─────────────────────────────────────────────────────────────────
// Luke, on crafting: "does it lack variety, excitement, engagement, suprise, wonder, fun, progression,
// meaningfulness".
//
// It lacked surprise for a reason that was one line of code: `recipe.kind === "tool" ? rollQuality(...) : null`.
// Tools rolled; food, backpacks, vaults, plots and decorations did not. In map one that is fifteen of the
// twenty-seven authored recipes where crafting was arithmetic -- known parts in, known thing out, every time
// for ever. A crafting level that improves your rolls is worth very little on a bench where three crafts in
// four have no roll to improve.
//
// So the roll is universal and the BAND is read differently per kind. One roll, one ladder, one set of odds
// on screen; what changes is what the band buys.
//
//   food        more of them. A batch is the natural unit and a good cook gets a bigger batch.
//   pack/bank   a bonus slot or two. Slots are the scarcest thing a player has, and these are one-time
//               crafts -- a roll is the only way the same recipe can ever be worth making well.
//   plot/deco   merits, because a plot is capped at two and a decoration is one object: there is no "more"
//               to give, so the band pays in the Grove's own currency instead of inventing a second plot.
//   tool        nothing here -- toolBonusFor already multiplies the tier by the band, and paying a tool
//               twice for one roll would be the only kind worth crafting.
//
// ⚠️ ROUGH IS EXACTLY WHAT THE RECIPE ALREADY SAID. Every number below is an ADDITION to the authored value,
// so no craft in the game got worse the day this shipped and no recipe's printed payoff became a lie.
const EXTRA_SLOTS = [0, 0, 1, 2, 3];      // by band step: rough, sound, fine, pristine, masterwork
const MERITS_PER_STEP = 12;
const FOOD_EXTRA_SHARE = 0.18;            // of the authored batch, per band step

/**
 * What the roll bought, on top of what the recipe promised. Returns zeroes at Rough rather than null, so a
 * caller never has to branch on "did this kind roll" — they all do.
 *
 * ⚠️ RETURNS THE EXTRA, NOT THE TOTAL. The authored `makes`/`adds` stays the source of truth for what the
 * recipe is; this says what the bench added to it. A function that returned the total would be a second
 * place that knows how big a batch of poultices is.
 */
export function craftBonusFor(recipe, quality) {
    const step = qualityStep(quality);
    const out = { step, band: qualityBand(quality).id, extra: 0, slots: 0, merits: 0 };
    if (!recipe || !step) return out;
    if (recipe.kind === "food") {
        out.extra = Math.round((Number(recipe.makes) || 1) * FOOD_EXTRA_SHARE * step);
    } else if (recipe.kind === "pack" || recipe.kind === "bank") {
        out.slots = EXTRA_SLOTS[Math.min(step, EXTRA_SLOTS.length - 1)];
    } else if (recipe.kind === "plot" || recipe.kind === "deco") {
        out.merits = step * MERITS_PER_STEP;
    }
    return out;
}

// ── ⚠️ WHAT A CHARM IS WORTH IS ITS BASE TIMES ITS BAND, EXACTLY LIKE A TOOL ────────────────────────────────
// Not stored, computed. The same rule as TOOL_PCT_PER_TIER and toolBonusFor: what gets written down is the
// ROLL, and what the roll is worth is read back from the curve, so retuning never needs a backfill. A charm
// rolled Masterwork is worth 1.9x the one rolled Rough out of the same two piles of parts — which is the
// whole reason to make another one, and the reason a charm is the first thing on this bench worth making
// twice.
/** The three things a charm can bend, in the player's words rather than the drop roll's. One place, because
 *  the bench, the door and the result card all have to call the same bonus the same thing. */
export const CHARM_STAT_LABEL = {
    rarityFind: "Rarity find",
    emblemFind: "Emblem find",
    rareSpawn: "Rare spawn",
};

export function charmValue(charmId, bandId) {
    const c = GROVE_CHARMS[charmId];
    if (!c) return 0;
    const mult = QUALITY_BANDS.find((b) => b.id === bandId)?.mult ?? 1;
    return Math.round(Number(c.per) * mult * 10) / 10;
}

/** The same thing from a raw 0-100 roll, for the one caller that has just rolled one. */
export const charmValueOf = (charmId, quality) => charmValue(charmId, qualityBand(quality).id);

/** The one line the result card and the recipe row both print for what a band bought. Null when it bought
 *  nothing, so a Rough craft says nothing rather than saying "+0". */
export function craftBonusLabel(recipe, quality) {
    const b = craftBonusFor(recipe, quality);
    // A charm's band is not an extra on top of the thing — it IS the thing, so it reads as the value.
    if (recipe?.kind === "charm") {
        const c = GROVE_CHARMS[recipe.id];
        return c ? `${CHARM_STAT_LABEL[c.stat] || c.stat} +${charmValueOf(recipe.id, quality)}%` : null;
    }
    if (b.extra) return `+${b.extra} extra`;
    if (b.slots) return `+${b.slots} bonus ${recipe.kind === "bank" ? "vault" : "pack"} slot${b.slots > 1 ? "s" : ""}`;
    if (b.merits) return `+${b.merits} merits`;
    return null;
}

// ── THE GROVE'S CHESTS ──────────────────────────────────────────────────────────────────────────────────────
// Luke: "the chests are a parallel chest that have rare crafting goods for the grove."
//
// ⚠️ FOUR TIERS AGAINST TWELVE ZONES, NOT TWELVE. A tier per boss would mean twelve tables nobody can hold
// in their head and eleven of them dead the moment the twelfth is reachable. Four bands, each covering three
// zones, keeps every tier meaningful for a stretch of the map and keeps the whole economy readable on one
// screen.
//
// `parts` rows are rolled INDEPENDENTLY, not as a weighted chain. A chest should feel like opening a chest --
// several things at once -- and an independent roll per row cannot be "stolen from" by raising a sibling,
// which is the exact failure mode the main chest line has.
// ── ⚠️ hyperChance IS THE REASON TO OPEN ONE ────────────────────────────────────────────────────────────────
// The parts below are bulk, and bulk is what the player already has too much of; measured live, a chest's
// whole payload was 4-8 of a part somebody was holding 71 of. What makes a chest worth the tap is that it is
// the one reliable place to meet the hyper table -- a scroll, a ship upgrade, pet food, a stone -- which
// otherwise only a boss can pay, and nobody had ever fought a boss.
//
// Climbing by tier, and hyperFloor keeps a shallow chest paying shallow rewards: pickHyper's floor fails
// upward, so a Mossbound Cache from zone two can never hand over an enshrinement stone.
//
// ⚠️ THIS IS NOT THE EIGHT-TIER CHEST CHAIN IN chests.js, where the first match wins and raising one tier
// silently steals from the ones beneath. A Grove chest rolls every row independently, so adding this took
// nothing away from anything. See [[chest-rolls-are-a-chain]].
export const GROVE_CHESTS = {
    mossbound: {
        id: "mossbound", hyperChance: 0.10, hyperFloor: 1, name: "Mossbound Cache", zones: [1, 3], merits: [2, 4],
        parts: [
            { part: "damp_moss", n: [4, 8], chance: 1 },
            { part: "gnawed_root", n: [4, 8], chance: 1 },
            { part: "grub_fat", n: [2, 5], chance: 0.7 },
        ],
    },
    barrowed: {
        id: "barrowed", hyperChance: 0.16, hyperFloor: 4, name: "Barrowed Casket", zones: [4, 6], merits: [4, 8],
        parts: [
            { part: "bristle_hide", n: [4, 8], chance: 1 },
            { part: "thorn_barb", n: [4, 8], chance: 1 },
            { part: "gourd_rind", n: [3, 6], chance: 0.7 },
            { part: "split_antler", n: [2, 5], chance: 0.5 },
        ],
    },
    warrenspun: {
        id: "warrenspun", hyperChance: 0.24, hyperFloor: 7, name: "Warrenspun Coffer", zones: [7, 9], merits: [8, 14],
        parts: [
            { part: "barrow_tooth", n: [4, 9], chance: 1 },
            { part: "warren_silk", n: [4, 9], chance: 1 },
            { part: "bound_straw", n: [3, 7], chance: 0.7 },
            { part: "mothlight_dust", n: [2, 5], chance: 0.5 },
        ],
    },
    heartwrought: {
        id: "heartwrought", hyperChance: 0.34, hyperFloor: 10, name: "Heartwrought Reliquary", zones: [10, 12], merits: [14, 24],
        parts: [
            { part: "ash_ember", n: [5, 10], chance: 1 },
            { part: "rotwood_knot", n: [4, 9], chance: 1 },
            { part: "goblin_rivet", n: [4, 8], chance: 0.8 },
            { part: "elder_heartwood", n: [2, 5], chance: 0.6 },
            { part: "crystal_shard", n: [1, 2], chance: 0.25 },
        ],
    },
};

export const GROVE_CHEST_ORDER = ["mossbound", "barrowed", "warrenspun", "heartwrought"];

/**
 * Which chest a zone's boss carries.
 *
 * ⚠️ IT FAILS UPWARD. A zone past the last band gets the DEEPEST chest, never undefined and never the
 * shallowest. This repo has paid for a downward-falling rarity lookup twice -- celestial gear forged at a
 * 625th of its price, and a Master dish feeding a pet ten xp -- and both were a table that stopped one rung
 * short of the content. See [[rarity-tables-stop-at-eternal]] and [[ladder-lookups-must-fail-upward]].
 */
export function chestForZone(n) {
    const z = Math.max(1, Number(n) || 1);
    for (const id of GROVE_CHEST_ORDER) {
        const c = GROVE_CHESTS[id];
        if (z >= c.zones[0] && z <= c.zones[1]) return c;
    }
    return GROVE_CHESTS[GROVE_CHEST_ORDER[GROVE_CHEST_ORDER.length - 1]];
}

// How often a boss drops one at all. Climbs with depth so the deep bosses are worth the walk, but never to
// certainty -- a guaranteed chest is a wage, not a reward.
export const BOSS_CHEST_CHANCE = { base: 0.45, perZone: 0.025, max: 0.8 };
export const bossChestChance = (n) =>
    Math.min(BOSS_CHEST_CHANCE.max, BOSS_CHEST_CHANCE.base + (Math.max(1, n) - 1) * BOSS_CHEST_CHANCE.perZone);

// ── MERITS ──────────────────────────────────────────────────────────────────────────────────────────────────
// The Grove's own standing, paid by bosses and spent on the boss sets. ⚠️ ONE FAUCET AND ONE SINK, WHICH IS
// THE WHOLE POINT. A currency with several faucets and no sink is the thing every economy note in this repo
// is about; merits come from bosses only, and the only thing they buy is the armour those bosses imply.
export const BOSS_MERITS = { base: 6, perZone: 2.5 };
export const bossMerits = (n) => Math.max(1, Math.round(BOSS_MERITS.base + (Math.max(1, n) - 1) * BOSS_MERITS.perZone));

// ── THE BOSS SETS ───────────────────────────────────────────────────────────────────────────────────────────
// Luke: "you can make boss armor that is a set in game. Depending on the boss difficulty determines the
// rarity of the set."
//
// ⚠️ RARITY IS READ FROM THE ZONE, NOT AUTHORED PER SET. Authoring it twice is how a set ends up claiming to
// be legendary in one table and epic in another, and the depth IS the difficulty -- that is what Luke's rule
// says. One lookup, failing upward like every other ladder here.
export const SET_RARITY = [
    { upTo: 3, id: "common", name: "Common" },
    { upTo: 6, id: "uncommon", name: "Uncommon" },
    { upTo: 9, id: "rare", name: "Rare" },
    { upTo: 11, id: "epic", name: "Epic" },
    { upTo: Infinity, id: "legendary", name: "Legendary" },
];
export const setRarityForZone = (n) => SET_RARITY.find((r) => (Number(n) || 1) <= r.upTo) || SET_RARITY[SET_RARITY.length - 1];

/**
 * The five sets, one per rarity band.
 *
 * ⚠️ THIS IS THE ONLY SINK MERITS HAVE. They have had one faucet since the day they were built -- every boss
 * pays them -- and nothing at all to spend them on, which is the shape every economy note in this repo warns
 * about. prove-grove-forge.mjs has been printing "THE SETS ARE THE ONLY SINK AND THEY MUST BE PRICED AGAINST
 * THIS" at the bottom of its run since before they existed. So the prices below are set against LIFETIME
 * merit income on a repeatable boss, not against one clear.
 *
 * ⚠️ THREE DISTINCT SLOTS, NOT THREE COPIES OF ONE. A set whose pieces share a slot can never be completed,
 * so its set bonus is unreachable and nothing says so on screen. See [[worn-sets-need-distinct-slots]] --
 * that gate is gone and this is the hand-check it asked for.
 *
 * The stats are STAT POINTS in the same vocabulary the emblems use, because grove-kit folds both into the
 * Arena's own pool. A point of Might here is worth exactly what a point of Might on a sword is worth, through
 * the same curve, which is the whole reason that file calls combatStats instead of adding numbers up.
 */
export const ARMOUR_SLOTS = [
    { slot: "head", noun: "Crown" },
    { slot: "body", noun: "Mantle" },
    { slot: "feet", noun: "Treads" },
];

// What each slot is FOR, before rarity scales it. Three different answers so a half-finished set still
// pulls in a direction, rather than three pieces of the same bonus in different sizes.
// ⚠️ SIZED AGAINST THE OTHER FOUR STAT SOURCES, NOT AGAINST NOTHING. The first pass of these numbers gave
// a FULL LEGENDARY SET 17 Might -- against about 202 for a best-in-slot wardrobe and about 356 for a full
// badge set. The deepest grind in the Grove would have been worth less than one badge, which is the kind of
// reward that teaches a player the content is not worth doing. See [[combat-stat-sources-four]].
const SLOT_PROFILE = {
    head: { crit_rate: 1.05, rarity_find: 2.4 },
    body: { armour: 6, vitality: 7.2 },
    feet: { attack_speed: 1.2, move_speed: 2.4 },
};

// ⚠️ ONE CURVE, NOT A HAND-WRITTEN NUMBER PER PIECE. Fifteen pieces authored by hand is fifteen chances to
// make the epic Treads quietly better than the legendary ones. Rarity scales the profile; nothing else does.
const RARITY_SCALE = { common: 1, uncommon: 1.9, rare: 3.2, epic: 5, legendary: 7.2 };

// ⚠️ PRICED AGAINST THE REPEAT. Clearing every boss once pays 240 merits and the cooldown is 30 minutes PER
// ZONE, so a determined player can earn several hundred an hour -- the first pass of these prices put the
// ENTIRE wardrobe at 1.2x a single full clear, which is about thirty-five minutes for everything the system
// has. These put the Heartwrought set at roughly ten days of steady play and the whole wardrobe at 8x a
// full clear. See [[economy-nerf-measure-daily-total]].
export const GROVE_SETS = {
    common: { id: "common", name: "Rootbound", zones: [1, 3], merits: 60 },
    uncommon: { id: "uncommon", name: "Barrowplate", zones: [4, 6], merits: 141 },
    rare: { id: "rare", name: "Warrenweave", zones: [7, 9], merits: 300 },
    epic: { id: "epic", name: "Rotwood", zones: [10, 11], merits: 519 },
    legendary: { id: "legendary", name: "Heartwrought", zones: [12, 12], merits: 900 },
};
export const GROVE_SET_ORDER = ["common", "uncommon", "rare", "epic", "legendary"];

/** Every forgeable piece, built from the three tables above rather than listed. */
export const ARMOUR_PIECES = GROVE_SET_ORDER.flatMap((rid) => {
    const set = GROVE_SETS[rid];
    const scale = RARITY_SCALE[rid];
    return ARMOUR_SLOTS.map((s) => ({
        id: `${rid}_${s.slot}`,
        setId: rid,
        slot: s.slot,
        // ⚠️ DERIVED, LIKE EVERY OTHER PATH IN THIS FEATURE. gen-grove-art.mjs names the file by family
        // and id — armour-common_head.webp — so the id IS the path, and fifteen literals would be fifteen
        // chances to disagree with the file on disk. Same rule and reason as groveArt and toolArt.
        // Drawn 2026-10-23: five sets of three, one material per set, so the ladder reads at a glance.
        art: `/images/grove/armour-${rid}_${s.slot}.webp`,
        name: `${set.name} ${s.noun}`,
        rarity: rid,
        rarityName: SET_RARITY.find((r) => r.id === rid)?.name || rid,
        // Rounded to two places: these are added to a pool that is itself rounded at the swing, and a
        // fourteen-decimal stat point in a tooltip reads as a bug.
        stats: Object.fromEntries(
            Object.entries(SLOT_PROFILE[s.slot]).map(([k, v]) => [k, Math.round(v * scale * 100) / 100]),
        ),
        // The toll. Merits are the gate; the parts are the grind, and they come from the chest the boss of
        // that band actually drops, so the set is paid for with the band it belongs to.
        merits: Math.round(set.merits / 3),
        parts: chestForZone(set.zones[1]).parts.slice(0, 2).map((r) => ({
            part: r.part,
            n: Math.round(r.n[1] * (1 + GROVE_SET_ORDER.indexOf(rid) * 0.45)),
        })),
    }));
});

export const pieceById = (id) => ARMOUR_PIECES.find((p) => p.id === id) || null;

/**
 * What wearing the whole set is worth on top of its pieces.
 *
 * ⚠️ A SET BONUS THAT IS JUST MORE OF THE SAME STATS IS NOT A SET BONUS. It has to be a reason to finish the
 * set rather than to wear the best three pieces you happen to own, so it pays stats NONE of the three slots
 * pay on their own -- finishing a set is the only way to get these at all.
 */
export const setBonusFor = (rarityId) => {
    const scale = RARITY_SCALE[rarityId] || 1;
    return {
        might: Math.round(9.6 * scale * 100) / 100,
        crit_damage: Math.round(3.6 * scale * 100) / 100,
        life_steal: Math.round(1.4 * scale * 100) / 100,
    };
};

/** Which set a zone's boss wears, so the kill card and the armoury agree on one answer. */
export const setForZone = (n) => GROVE_SETS[setRarityForZone(n).id] || GROVE_SETS.common;

/** The zone a boss stands at, so a set can price itself off the thing that drops its parts. */
export const zoneOfBoss = (bossId) => GROVE_ZONES.find((z) => z.boss === bossId)?.n || 1;
