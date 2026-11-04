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
// contribution was choosing a row -- which is why a crafting screen built around a random outcome still felt// ⚠️ TEMPERING IS GONE, AND THE CURVE KEEPS ITS SHAPE. Luke, 2026-10-30: "Spending more parts to roll
// better, remove that." It was one extra term in this exponent — pay 40% of the recipe again before the
// roll and the roll bends — so removing it is removing the term, not unpicking a second mechanism.
//
// ⚠️ `extra` IS NOT THE SAME THING AND IT STAYS. That is the crafting act's bias: the player earns it
// by playing the three minigames, it costs no parts, and it is the whole reason the act exists. The
// resemblance is only that both bend this one exponent.

// ⚠️ `extra` IS A THIRD TERM, NOT A FOURTH CURVE. The craft act (grove-craft-act.js) needs to bend the same
// exponent that the level and the temper bend, and the first attempt expressed it as extra LEVELS -- which
// silently did nothing at level 25, because the level is clamped to the cap. A capped crafter would have
// played the beats perfectly and watched the board not move, which is the dead-ladder bug this curve was
// rewritten once already to remove. A term outside the clamp cannot have that problem.
export function rollQuality(level, rand, extra = 0) {
    const lv = Math.max(1, Math.min(CRAFT_LEVEL_CAP, Number(level) || 1));
    const p = 1 / (1 + lv * QUALITY_BIAS + Math.max(0, Number(extra) || 0));
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
export function qualityOdds(level, extra = 0) {
    const lv = Math.max(1, Math.min(CRAFT_LEVEL_CAP, Number(level) || 1));
    const p = 1 / (1 + lv * QUALITY_BIAS + Math.max(0, Number(extra) || 0));
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
    const out = { step, band: qualityBand(quality).id, extra: 0, slots: 0 };
    if (!recipe || !step) return out;
    if (recipe.kind === "food") {
        out.extra = Math.round((Number(recipe.makes) || 1) * FOOD_EXTRA_SHARE * step);
    } else if (recipe.kind === "pack" || recipe.kind === "bank") {
        out.slots = EXTRA_SLOTS[Math.min(step, EXTRA_SLOTS.length - 1)];
    }
    // ⚠️ A GOOD ROLL ON A PLOT OR A DECORATION USED TO PAY MERITS, because those two kinds have no
    // "more" to give -- a plot is capped at two and a decoration is one object. Merits are gone and
    // nothing replaced it, so quality currently does nothing on those two kinds.
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
    return null;
}


// ── CHESTS, MERITS AND THE BOSS SETS LIVED HERE ─────────────────────────────────
// Luke: "Lets remove merits chests and boss sets now."
//
// Removed 2026-11-03, with the knock-ons he chose: the five boss sets go WITH the merits rather than
// being repriced (merits had exactly one sink and it goes with them), and the celestial/primordial tail
// is DROPPED rather than paid out another way -- the Grove's item ladder now ends at mythic, full stop.
//
// ⚠️ THE TABLES ARE NOT DROPPED. mkt_grove_chest, mkt_grove_armour and mkt_grove_player.merits still
// exist and still hold what four players had (3,704 merits, 16 unopened chests, 10 forged pieces). A
// migration is spent the moment it runs, and deleting the rows buys nothing: nothing reads them now.
// See [[verify-build-and-migrations]].
