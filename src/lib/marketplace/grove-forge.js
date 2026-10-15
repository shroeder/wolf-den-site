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

import { GROVE_ZONES } from "@/lib/marketplace/grove-catalog.js";
import { toolBonusPct } from "@/lib/marketplace/grove-recipes.js";

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
export const CRAFT_XP_KIND = { tool: 2.2, pack: 1.8, bank: 1.8, plot: 2.5, food: 0.5, decor: 1.4 };

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
export const QUALITY_BANDS = [
    { at: 90, id: "pristine", name: "Pristine", mult: 1.60 },
    { at: 72, id: "fine", name: "Fine", mult: 1.35 },
    { at: 45, id: "sound", name: "Sound", mult: 1.15 },
    { at: 0, id: "rough", name: "Rough", mult: 1.00 },
];

export const qualityBand = (q) => QUALITY_BANDS.find((b) => (Number(q) || 0) >= b.at) || QUALITY_BANDS[QUALITY_BANDS.length - 1];

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

export function rollQuality(level, rand) {
    const lv = Math.max(1, Math.min(CRAFT_LEVEL_CAP, Number(level) || 1));
    const p = 1 / (1 + lv * QUALITY_BIAS);
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
export function qualityOdds(level) {
    const lv = Math.max(1, Math.min(CRAFT_LEVEL_CAP, Number(level) || 1));
    const p = 1 / (1 + lv * QUALITY_BIAS);
    const atLeast = (at) => (at <= 0 ? 1 : 1 - (at / 100) ** (1 / p));
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
export const GROVE_CHESTS = {
    mossbound: {
        id: "mossbound", name: "Mossbound Cache", zones: [1, 3], merits: [2, 4],
        parts: [
            { part: "damp_moss", n: [4, 8], chance: 1 },
            { part: "gnawed_root", n: [4, 8], chance: 1 },
            { part: "grub_fat", n: [2, 5], chance: 0.7 },
        ],
    },
    barrowed: {
        id: "barrowed", name: "Barrowed Casket", zones: [4, 6], merits: [4, 8],
        parts: [
            { part: "bristle_hide", n: [4, 8], chance: 1 },
            { part: "thorn_barb", n: [4, 8], chance: 1 },
            { part: "gourd_rind", n: [3, 6], chance: 0.7 },
            { part: "split_antler", n: [2, 5], chance: 0.5 },
        ],
    },
    warrenspun: {
        id: "warrenspun", name: "Warrenspun Coffer", zones: [7, 9], merits: [8, 14],
        parts: [
            { part: "barrow_tooth", n: [4, 9], chance: 1 },
            { part: "warren_silk", n: [4, 9], chance: 1 },
            { part: "bound_straw", n: [3, 7], chance: 0.7 },
            { part: "mothlight_dust", n: [2, 5], chance: 0.5 },
        ],
    },
    heartwrought: {
        id: "heartwrought", name: "Heartwrought Reliquary", zones: [10, 12], merits: [14, 24],
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
