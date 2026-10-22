// ── THE GROVE — MAP 1 OF THE NODE MAP ────────────────────────────────────────────────────────────────────────
// The forest. Twelve zones, owner-gated, and the first of twenty maps. See docs/node-map-design.md for the
// whole vision; this file is the CONTENT of map one and nothing else.
//
// ⚠️ PURE. No db, no server-only. The scene draws enemies, parts and loot from here and the server re-reads
// the same tables, so the server never trusts what the client claims it killed. Same rule as monster-parts.js
// and ship-zones.js.
//
// ── WHAT A ZONE IS ───────────────────────────────────────────────────────────────────────────────────────────
// A node on the map with its own backdrop, its own 15-30 wandering enemies, and a boss at the end of it. The
// zone is cleared by killing `toUnlock` enemies, which opens the next node.
//
// ── WHAT AN ENEMY IS ─────────────────────────────────────────────────────────────────────────────────────────
// Its own loot table, its own parts, its own emblem, and its own behaviour. "Each enemy has its own parts and
// loot tables" is the whole design — a single global drop table would make the route across the map
// meaningless, because you would just fight whatever was closest.
//
// ⚠️ NO GOLD ON ANY ORDINARY ENEMY. Gold has fourteen live faucets already and a kill loop is the one faucet
// shape in this game with no natural daily cap. The ONLY thing here that pays gold is the crystal rare spawn.
//
// ── ART ──────────────────────────────────────────────────────────────────────────────────────────────────────
// Reused wherever a sprite already fits the forest — rootrat, grub, thornling, badger, barrowhound,
// warren-mother, gourdling, voidmoth, ashwraith from the delve catalogue, and the goblin/husk factions from
// town raids. `art: null` marks the handful that genuinely need drawing; nothing is generated that already
// exists somewhere. See check-existing-sprites-first.

import {
    MAP_PARTS, MAP_ENEMIES, MAP_BOSSES, MAP_ZONES, MAP_EMBLEMS, MAP_FOODS, MAP_CHARMS, mapIsBuilt,
    RARE_CHANCE,
} from "@/lib/marketplace/grove-maps.js";

// ── PARTS ────────────────────────────────────────────────────────────────────────────────────────────────────
// ⚠️ EVERY PART HERE IS USED BY AT LEAST ONE RECIPE. Luke: "Each part you can get from an enemy has uses in at
// least one recipe." check-grove.mjs fails the build if one is ever orphaned — a part that drops and does
// nothing is litter in a 16-slot backpack.
//
// `tier` tracks the depth it comes from and is what recipes price against.
// ⚠️ MAP ONE'S SIXTEEN. Maps two to twelve declare their materials in grove-maps.js and are merged into this
// object below — one lookup for every part in the world, whichever map it belongs to, because every reader of
// GROVE_PARTS (the bag, the bench, the tablet, the gate) would otherwise need to know which file to ask.
const MAP_ONE_PARTS = {
    // ── shallow (zones 1-4) ──────────────────────────────────────────────────────────────────────────
    gnawed_root: { name: "Gnawed Root", tier: 1, blurb: "Chewed through and spat out. Still springy." },
    damp_moss: { name: "Damp Moss", tier: 1, blurb: "Holds water for days. The hollow is carpeted in it." },
    grub_fat: { name: "Grub Fat", tier: 1, blurb: "Renders down to a clean, slow-burning oil." },
    thorn_barb: { name: "Thorn Barb", tier: 2, blurb: "Comes out of the wood easier than out of you." },
    bristle_hide: { name: "Bristle Hide", tier: 2, blurb: "Coarse enough to sand a plank. Tough enough to wear." },
    split_antler: { name: "Split Antler", tier: 2, blurb: "Shed, cracked, and better for the crack." },
    // ── middle (zones 5-8) ───────────────────────────────────────────────────────────────────────────
    gourd_rind: { name: "Gourd Rind", tier: 3, blurb: "Dries into a shell you could drink out of." },
    bound_straw: { name: "Bound Straw", tier: 3, blurb: "Twine and field-stubble, still holding its shape." },
    barrow_tooth: { name: "Barrow Tooth", tier: 3, blurb: "Long, yellowed, and set in nothing any more." },
    warren_silk: { name: "Warren Silk", tier: 4, blurb: "Spun underground where nothing should be spinning." },
    rotwood_knot: { name: "Rotwood Knot", tier: 4, blurb: "The one part of a dead tree that outlasts the tree." },
    // ── deep (zones 9-12) ────────────────────────────────────────────────────────────────────────────
    mothlight_dust: { name: "Mothlight Dust", tier: 5, blurb: "Comes off the wings and keeps glowing in your palm." },
    ash_ember: { name: "Ash Ember", tier: 5, blurb: "Cold to look at. Not cold." },
    goblin_rivet: { name: "Goblin Rivet", tier: 5, blurb: "Hammered flat by somebody in a hurry." },
    elder_heartwood: { name: "Elder Heartwood", tier: 6, blurb: "Cut from the middle of something very old." },
    crystal_shard: { name: "Crystal Shard", tier: 6, blurb: "Only ever off the crystal-touched. Hums faintly.", rare: true },
};

// Map one's parts carry their map number here rather than in every literal above it.
for (const p of Object.values(MAP_ONE_PARTS)) p.map = 1;

/** Every part in the world: map one's sixteen, plus the twelve each generated map declares. */
export const GROVE_PARTS = { ...MAP_ONE_PARTS, ...MAP_PARTS };

// ── FOOD AND POTIONS ─────────────────────────────────────────────────────────────────────────────────────────
// Luke: "We need a way to equip food or potions that auto heal you if you get below 60 percent hp."
//
// ⚠️ NOTHING IN THIS GAME HEALS HP TODAY. The consumables shelf is XP, daily strikes, damage multipliers and
// forge scrolls; the delves have potions but they are RUN-SCOPED charges, not items you own. So rather than
// bolt a healing stat onto an existing consumable — which would make it heal in the arena and the boss fight
// too, places nobody asked for — the Grove grows its own, crafted from its own parts.
//
// That also gives the parts another sink, and makes the belt a real decision: food takes a BAG SLOT, and
// slots are the scarcest thing a player has.
export const HEAL_AT = 0.60;   // Luke's number: it fires below 60% of max HP

const MAP_ONE_FOODS = {
    food_poultice: { name: "Moss Poultice", heals: 0.25, tier: 1,
        blurb: "Chewed moss and grub fat, packed into a leaf. It works, which is the only nice thing about it." },
    food_flask: { name: "Gourd Flask", heals: 0.40, tier: 3,
        blurb: "A dried gourd of something cloudy. Tastes of the field it came out of." },
    food_tonic: { name: "Mothlight Tonic", heals: 0.60, tier: 5,
        blurb: "Faintly luminous. Drinking it feels like standing up too fast, and then being fine." },
    food_draught: { name: "Heartwood Draught", heals: 1.00, tier: 6,
        blurb: "Pressed from the middle of a very old tree. There is not much of it in the world." },
};

/** Every food in the world: map one's four, plus the four each built map presses out of its spare drops. */
export const GROVE_FOODS = {
    ...MAP_ONE_FOODS,
    ...Object.fromEntries(Object.entries(MAP_FOODS).filter(([, f]) => mapIsBuilt(f.map))),
};

export const groveFood = (id) => GROVE_FOODS[id] || null;

// ── CHARMS ───────────────────────────────────────────────────────────────────────────────────────────────────
// One per map, consumed at the mouth of a zone, good for that run. The first kind of object the bench has
// made since map one that is neither a ladder rung nor a mouthful of food — see charmForMap in grove-maps.js
// for why the Grove needed one and why these pay into the drop roll and nothing else.
//
// ⚠️ MAP ONE'S IS HAND-AUTHORED HERE because map one is hand-authored here: GROVE_MAPS carries `parts: null`
// for it and everything about the forest lives in this file. Same shape, same three stats, so the consumer
// cannot tell which of the two wrote it.
//
// ⚠️ TAUGHT BY THE HEARTWOOD ELDER, the last boss of the forest. A player holding map one's charm has
// finished map one — that is what it says about them, and it is why the recipe is not on the bench until
// then. The Rootwood Seeking is also the ONLY charm a player will meet for a long while, which is the point:
// the first one should arrive as a surprise from a boss fight rather than as row twenty-eight of a list.
const MAP_ONE_CHARMS = {
    charm_grove: {
        id: "charm_grove", name: "Rootwood Seeking", stat: "rarityFind", per: 9, map: 1,
        parts: { gnawed_root: 6, warren_silk: 4 },
        blurb: "Bound at the Heartwood and carried back out. What it finds is rarer.",
        taughtBy: "heartwood_elder",
    },
};

/** Every charm in the world: the forest's, plus one per built map. */
export const GROVE_CHARMS = {
    ...MAP_ONE_CHARMS,
    ...Object.fromEntries(Object.entries(MAP_CHARMS).filter(([, c]) => mapIsBuilt(c.map))),
};

export const groveCharm = (id) => GROVE_CHARMS[id] || null;

// ── ⚠️ EVERY RECIPE HAS A PICTURE, AND NONE OF THEM IS A GLYPH ──────────────────────────────────────────────
// Luke: "Never show glyphs only ever sprites fix this also."
//
// Tools and food have had painted sprites since the Grove shipped; backpacks, vaults, plots, decorations
// and charms had none and fell through to a react-icons outline — so a bench row showed a painted poultice
// sitting directly above a flat yellow pictogram of a rucksack, in the same list, at the same size. Two of
// the five needed nothing drawn: ui-bag and ui-vault already existed and are the same hand.
//
// ⚠️ ONE CHARM PICTURE PER FLAVOUR, NOT PER MAP. Twelve charms would be twelve drawings to say what the
// name and the bonus already say; the three KINDS are what a player chooses between at the door. Same call
// the foods made when every map's poultice borrowed map one's picture.
export function recipeArt(recipe) {
    if (!recipe) return null;
    switch (recipe.kind) {
        case "food": return `/images/grove/food-${recipe.id}.webp`;
        case "pack": return "/images/grove/ui-bag.webp";
        case "bank": return "/images/grove/ui-vault.webp";
        case "plot": return "/images/grove/item-plot.webp";
        case "deco": return `/images/grove/item-${recipe.id}.webp`;
        case "charm": return `/images/grove/charm-${GROVE_CHARMS[recipe.id]?.stat || "rarityFind"}.webp`;
        default: return null;   // tools resolve through toolArt, which knows the tier
    }
}
// ⚠️ WHAT A CHARM IS WORTH lives in grove-forge.js beside the band table, not here. This file is imported BY
// grove-forge, so reaching the other way for qualityBand would close a cycle.

// ── EMBLEMS ──────────────────────────────────────────────────────────────────────────────────────────────────
// ⚠️ ALL EMBLEM BONUSES ARE PASSIVE AND ALL OF THEM ARE BREAKPOINTED. An emblem is not a stat stick you equip
// once — it levels on HOW MANY of it you have collected, from 1 star to 6, and each rung takes far longer than
// the last. Three may be equipped; three more slots exist and stay locked.
//
// ⚠️ crit_rate AND crit_damage FEED GLOBALLY. Luke: "Crit rate and damage feed globally to everything." That
// makes this feature able to inflate every other system in the game, so those two carry the smallest numbers
// here by a wide margin and the ceiling is an open question in the design doc, flagged before it ships.
// ⚠️ THE DROP RATE AND THIS LADDER ARE ONE NUMBER, NOT TWO. Luke: "Emblems are rare." They were ~1.2% a
// kill, which at a few hundred kills a session is two or three an hour — uncommon, not rare. They are about
// a fifth of that now, and the ladder had to come down with them or six stars would have needed a hundred
// thousand kills. Changing either of these alone silently breaks the other; check-grove.mjs prints the
// resulting timeline in sessions so the cost is visible rather than inferred.
export const EMBLEM_STARS = [
    { star: 1, at: 3, color: "#cfd6dd", label: "Worn" },
    { star: 2, at: 9, color: "#7ed57e", label: "Marked" },
    { star: 3, at: 22, color: "#5aa6ff", label: "Etched" },
    { star: 4, at: 50, color: "#a982ff", label: "Sealed" },
    { star: 5, at: 110, color: "#ffd75e", label: "Crowned" },
    { star: 6, at: 250, color: "#ff78b4", label: "Ascendant" },
];

/**
 * How many stars a count is worth. ⚠️ FAILS UPWARD — a count past the last rung keeps the last rung rather
 * than falling off the end to zero. Two of this game's worst bugs were ladders that failed downward.
 */
export function emblemStars(count) {
    const n = Number(count) || 0;
    let out = EMBLEM_STARS[0];
    let stars = 0;
    for (const rung of EMBLEM_STARS) {
        if (n >= rung.at) { out = rung; stars = rung.star; }
    }
    return { stars, rung: stars ? out : null, next: EMBLEM_STARS.find((r) => r.at > n) || null };
}

// What an emblem gives, per star. The value is PER STAR — a 3-star emblem gives three times the row below.
const MAP_ONE_EMBLEMS = {
    em_rootrat: { name: "The Gnawed Root", stat: "might", per: 2, kind: "flat" },
    em_grub: { name: "The Pale Grub", stat: "vitality", per: 3, kind: "flat" },
    em_thornling: { name: "The Thornling", stat: "attack_speed", per: 0.6, kind: "pct" },
    em_badger: { name: "The Bristleback", stat: "armour", per: 2, kind: "flat" },
    em_gourdling: { name: "The Gourdling", stat: "life_steal", per: 0.4, kind: "pct" },
    em_husk: { name: "The Straw Man", stat: "move_speed", per: 1.0, kind: "pct" },
    em_ashwraith: { name: "The Ash Wraith", stat: "crit_damage", per: 0.8, kind: "pct", global: true },
    em_barrowhound: { name: "The Barrow Hound", stat: "crit_rate", per: 0.25, kind: "pct", global: true },
    em_warren: { name: "The Warren Mother", stat: "emblem_find", per: 1.5, kind: "pct" },
    em_voidmoth: { name: "The Mothlight", stat: "rarity_find", per: 1.2, kind: "pct" },
    em_goblin: { name: "The Palisade", stat: "ferocity", per: 2, kind: "flat" },
    em_elder: { name: "The Elder Root", stat: "tenacity", per: 2, kind: "flat" },
    em_crystal: { name: "The Crystal-Touched", stat: "rare_spawn", per: 0.8, kind: "pct", rare: true },
};

// One emblem per generated map rather than one per creature: 132 new passive stat stacks is a second stat
// system arriving by the back door, and stat ceilings are still an open question in the design doc.
export const GROVE_EMBLEMS = {
    ...MAP_ONE_EMBLEMS,
    ...Object.fromEntries(Object.entries(MAP_EMBLEMS).filter(([, e]) => mapIsBuilt(e.map))),
};

// ── ⚠️ THE CURVE IS ANCHORED TO TWO REAL MEMBERS, AND THE HIGH ANCHOR IS MAP 12 ──────────────────────────
// Luke: "Lets make it so eric would have a tough time with map 12 first zone. I say that to give you the
// linear growth line. And consider that this is the grove, multiple enemies, different levels of aggression.
// Along with the fact I am certainly going to add things that make heros more powerful, like skills classes
// and pet attacks and stuff."
//
// ⚠️ MAP 12 ZONE 1 — NOT MAP 1 ZONE 12. The first cut of this table read it the second way and compressed
// eleven maps of climb into the twelve zones of the only map that exists. It was a plausible misreading and
// it got everything else right, which is why it is worth naming: Luke asked how many maps existed TWICE
// before saying it, and said why he was naming an unbuilt one — "to give you the linear growth line". A line
// needs a far point. What that misreading produced:
//
//   · Eric sat at the ceiling of all existing content, with nineteen maps still to come and nothing left
//     above him to anchor them to — while he is about to get skills, classes and pet attacks.
//   · Littlewolf, the member who is actually testing it, met a FORTY-THREE MINUTE boss at zone 12 and
//     needed 97 swings per wanderer. The first map in the game was unfinishable for a newcomer.
//
// Read correctly it falls out clean, and the arithmetic says so: the x1.372 power step the first cut applied
// PER ZONE is exactly the right step PER MAP. Same number, wrong granularity.
//
//   Littlewolf   1,687 dps   1,784 effective HP     <- a newcomer, map 1 zone 1   (depth 1)
//   Eric D      54,670 dps  10,204 effective HP     <- the top of the Den, map 12 zone 1 (depth 133)
//
// x32 of power and x5.7 of durability spread over 132 zones: +2.67% and +1.33% a zone, compounding (see
// GROVE_SCALE — additive cannot reach x32 and quietly lands at x4.5). Per map that is x1.372 and x1.172.
//
//   WANDERER   three swings for whoever belongs at that depth. Trash stays trash: there are 15-30 of them
//              in a zone, and a crowd of sponges is not difficulty, it is a queue.
//   BOSS       35 seconds at the start of a map rising to 80 at the end of it, so "tough" is a place you
//              arrive at. The ramp restarts each map because a boss is the end of ITS map.
//   DAMAGE     a hit costs about 5.5% of the body that depth expects. That is what makes a CROWD dangerous
//              without any single hit being a surprise — which is the shape this mode needs, because the
//              threat here is three things closing at once, not one big number.
//
// ⚠️ THE VALUES BELOW ARE BASELINES AT DEPTH 1, NOT FINAL. scaledFoe multiplies them by GROVE_SCALE for the
// depth the creature is standing at — so each base is its PRIMARY zone's target times that creature's own
// share, divided back out by that zone's climb.
//
// ⚠️ AND MAP 1 IS DELIBERATELY FLAT: 960 to 1,300 across twelve zones. It is the opening forest, one twelfth
// of the way to Eric's wall, and it is owner-gated. Which means that inside a map the difference between two
// bodies is the ROSTER, not the depth — so the shares are authored to match GROVE_SIZE rather than left to
// fall out of a climb: the rootrat is ankle-high at 0.80 of its zone's target and the elderling towers at
// 1.50, about two and a half times the swings. Aggression and telegraph carry the rest (passive early,
// retaliating later, 0ms to 880ms of tell).
//
// Where it lands:
//   Littlewolf  map 1 zone 1   3.0 swings/trash   35s boss   dies in 18 trash hits
//   Littlewolf  map 1 zone 12  4.1 swings/trash  107s boss   dies in 16   <- he can finish the forest
//   Eric        map 1 zone 12  0.3 swings/trash    3s boss   dies in 88   <- he strolls it, as he should
//   Eric        map 12 zone 1  6.4 swings/trash   35s boss   dies in 19   <- a tough time, as asked
//
// ⚠️ HEADROOM IS DELIBERATE AND THIS TABLE IS MEANT TO BE RE-DERIVED. Maps 13-20 sit ABOVE Eric, which is
// where the skills, classes and pet attacks land — that is the point of anchoring to a member rather than to
// a constant. `npm run grove:curve` re-reads both ends off production and prints a fresh table; run it after
// anything that changes what a hero can do, instead of nudging these by feel.
// See [[balance-real-bouts-not-sims]] — this is a model, and the first real runs outrank it.

// ── ENEMIES ──────────────────────────────────────────────────────────────────────────────────────────────────
// `passive` is the behaviour Luke described: early enemies ignore you entirely, later ones hit back once
// struck. `telegraph` is how long the wind-up reads on screen before the hit lands — every attack in this
// feature announces itself.
//
// `loot` weights are relative within the enemy. `n` is how many drop when that row wins.
const E = (id, name, art, o) => ({ id, name, art, ...o });

// ⚠️ MAP ONE'S TWELVE. Maps two to twelve declare their residents in grove-maps.js and are merged below,
// filtered to maps that are actually BUILT — a creature with no art is a broken-image glyph wandering a zone
// nobody can reach, and the design is not helped by shipping it early.
// ⚠️ IMPORTED, NOT RE-DECLARED. Map one's twelve creatures are hand-authored here and maps two to seven are
// generated in grove-maps.js; a rare-drop rate that differed between them is a difference no player could
// explain and no designer intended. One number, one home. See [[balance-constants-never-copied]].

// Each creature's rare drop is a part from DEEPER in the forest than it lives, so it reads as a glimpse of
// what is coming rather than more of what you already have. See the rare row in grove-roll.js.
const MAP_ONE_ENEMIES = {
    rootrat: E("rootrat", "Rootrat", "/images/delves/foe-rootrat.webp", {
        passive: true, hp: 770, dmg: [62, 96], telegraph: 0,
        emblem: "em_rootrat", emblemChance: 0.0026,
        rareChance: RARE_CHANCE, rareLoot: { part: "thorn_barb", n: [1, 2] },
        loot: [{ part: "gnawed_root", n: [1, 2], w: 70 }, { part: "damp_moss", n: [1, 1], w: 30 }],
    }),
    grub: E("grub", "Pale Grub", "/images/delves/foe-grub.webp", {
        passive: true, hp: 810, dmg: [67, 101], telegraph: 0,
        emblem: "em_grub", emblemChance: 0.0026,
        rareChance: RARE_CHANCE, rareLoot: { part: "bristle_hide", n: [1, 2] },
        loot: [{ part: "grub_fat", n: [1, 2], w: 75 }, { part: "damp_moss", n: [1, 2], w: 25 }],
    }),
    thornling: E("thornling", "Thornling", "/images/delves/foe-thornling.webp", {
        passive: false, hp: 900, dmg: [75, 111], telegraph: 650,
        emblem: "em_thornling", emblemChance: 0.0024,
        rareChance: RARE_CHANCE, rareLoot: { part: "bound_straw", n: [1, 2] },
        loot: [{ part: "thorn_barb", n: [1, 3], w: 65 }, { part: "gnawed_root", n: [1, 2], w: 35 }],
    }),
    badger: E("badger", "Bristleback", "/images/delves/foe-badger.webp", {
        passive: false, hp: 920, dmg: [79, 115], telegraph: 700,
        emblem: "em_badger", emblemChance: 0.0022,
        rareChance: RARE_CHANCE, rareLoot: { part: "barrow_tooth", n: [1, 2] },
        loot: [{ part: "bristle_hide", n: [1, 2], w: 60 }, { part: "split_antler", n: [1, 1], w: 40 }],
    }),
    gourdling: E("gourdling", "Gourdling", "/images/delves/foe-gourdling.webp", {
        passive: false, hp: 1040, dmg: [83, 120], telegraph: 620,
        emblem: "em_gourdling", emblemChance: 0.0022,
        rareChance: RARE_CHANCE, rareLoot: { part: "warren_silk", n: [1, 2] },
        loot: [{ part: "gourd_rind", n: [1, 2], w: 70 }, { part: "thorn_barb", n: [1, 2], w: 30 }],
    }),
    husk: E("husk", "Straw Walker", "/images/grove/foe-husk.webp", {
        passive: false, hp: 1060, dmg: [86, 134], telegraph: 750,
        emblem: "em_husk", emblemChance: 0.002,
        rareChance: RARE_CHANCE, rareLoot: { part: "mothlight_dust", n: [1, 2] },
        loot: [{ part: "bound_straw", n: [1, 3], w: 70 }, { part: "gourd_rind", n: [1, 1], w: 30 }],
    }),
    barrowhound: E("barrowhound", "Barrow Hound", "/images/delves/foe-barrowhound.webp", {
        passive: false, hp: 1080, dmg: [90, 138], telegraph: 520,
        emblem: "em_barrowhound", emblemChance: 0.002,
        rareChance: RARE_CHANCE, rareLoot: { part: "rotwood_knot", n: [1, 2] },
        loot: [{ part: "barrow_tooth", n: [1, 2], w: 65 }, { part: "bristle_hide", n: [1, 2], w: 35 }],
    }),
    warren_mother: E("warren_mother", "Warren Mother", "/images/delves/foe-warren-mother.webp", {
        passive: false, hp: 1200, dmg: [94, 142], telegraph: 820,
        emblem: "em_warren", emblemChance: 0.0018,
        rareChance: RARE_CHANCE, rareLoot: { part: "ash_ember", n: [1, 2] },
        loot: [{ part: "warren_silk", n: [1, 2], w: 70 }, { part: "barrow_tooth", n: [1, 2], w: 30 }],
    }),
    voidmoth: E("voidmoth", "Mothlight", "/images/delves/foe-voidmoth.webp", {
        passive: false, hp: 1210, dmg: [98, 146], telegraph: 600,
        emblem: "em_voidmoth", emblemChance: 0.0018,
        rareChance: RARE_CHANCE, rareLoot: { part: "goblin_rivet", n: [1, 2] },
        loot: [{ part: "mothlight_dust", n: [1, 2], w: 72 }, { part: "warren_silk", n: [1, 1], w: 28 }],
    }),
    ashwraith: E("ashwraith", "Ash Wraith", "/images/delves/foe-ashwraith.webp", {
        passive: false, hp: 1230, dmg: [102, 150], telegraph: 700,
        emblem: "em_ashwraith", emblemChance: 0.0016,
        rareChance: RARE_CHANCE, rareLoot: { part: "elder_heartwood", n: [1, 2] },
        loot: [{ part: "ash_ember", n: [1, 2], w: 68 }, { part: "rotwood_knot", n: [1, 2], w: 32 }],
    }),
    goblin: E("goblin", "Palisade Goblin", "/images/grove/foe-goblin.webp", {
        passive: false, hp: 1290, dmg: [110, 159], telegraph: 560,
        emblem: "em_goblin", emblemChance: 0.0016,
        rareChance: RARE_CHANCE, rareLoot: { part: "elder_heartwood", n: [1, 2] },
        loot: [{ part: "goblin_rivet", n: [1, 3], w: 70 }, { part: "ash_ember", n: [1, 1], w: 30 }],
    }),
    elderling: E("elderling", "Elderling", "/images/grove/foe-elderling.webp", {
        passive: false, hp: 1460, dmg: [118, 182], telegraph: 880,
        emblem: "em_elder", emblemChance: 0.0014,
        rareChance: RARE_CHANCE, rareLoot: { part: "crystal_shard", n: [1, 1] },
        loot: [{ part: "elder_heartwood", n: [1, 2], w: 60 }, { part: "rotwood_knot", n: [1, 2], w: 40 }],
    }),
};

/** Every creature in the world: map one's twelve, plus the twelve of each map whose art has landed. */
export const GROVE_ENEMIES = {
    ...MAP_ONE_ENEMIES,
    ...Object.fromEntries(Object.entries(MAP_ENEMIES).filter(([, e]) => mapIsBuilt(e.map))),
};

// ── THE RARE SPAWN ───────────────────────────────────────────────────────────────────────────────────────────
// Luke: "There would also be rare spawns for each map. It would be a crystal enemy that fits the theme of the
// map ... Its chance to spawn would be pretty rare."
//
// ⚠️ THE ONLY THING IN THIS FEATURE THAT PAYS GOLD, and the only one that can drop a chest. The chest is
// granted through addChests rather than by touching the chest ROLL — the roll is a chain where the first match
// wins, so reaching into it steals from gear. See chest-chain-compounds.
// ── SILHOUETTE: HOW TALL EACH CREATURE IS ────────────────────────────────────────────────────────────────────
// ⚠️ EVERY BODY IN THE GROVE USED TO BE THE SAME SIZE, AND THAT SIZE WAS BIGGER THAN THE HERO. The
// stylesheet gave .gv-foe a width of 8 units with aspect-ratio: 1, so every creature rendered in an 8x8 box
// against a 7-unit hero — and the sprites are square images drawn nearly edge to edge (measured: the rootrat
// fills 416x385 of a 448x448 plate), so a rootrat stood a head TALLER than the knight. A rat, a scarecrow and
// an Elderling were all exactly one size, and that one size won.
//
// Nothing about tuning the animation could have fixed that. Scale is read before motion is: a zone where
// every animal is the same height as every other animal and all of them match the player reads as programmer
// art no matter how well it moves.
//
// ⚠️ SO THE NUMBER HERE IS A HEIGHT IN WORLD UNITS, AGAINST A 7-UNIT HERO (see HERO_UNITS in grove-view.js),
// and the box is sized from it rather than from a width. Vermin come to the knee, the mid-forest stands
// shoulder to shoulder with him, and the deep forest looms. That spread is what makes walking deeper
// LOOK like walking deeper, which is the whole promise of a twelve-zone map.
//
// `foot` is how much dead transparent space the sprite carries under the creature's feet, as a share of its
// own height — measured with scripts/grove-sprite-bounds.mjs, not guessed. The scene nudges the drawing down
// by it so the feet, not the padding, land on the floor. Most are 0; the reused delve sprites are the ones
// that were drawn with air underneath.
export const GROVE_SIZE = {
    //              h     foot   why
    rootrat:      { h: 2.8, foot: 0.08 },   // knee-high vermin. The first thing you ever see, and it must read as beneath you.
    grub:         { h: 2.3, foot: 0.01 },   // lower than the rat, wider than it. A thing on the ground.
    thornling:    { h: 4.2, foot: 0.02 },   // waist-high and spiky — the first one that hits back should be the first one you look up at.
    badger:       { h: 3.6, foot: 0.05 },
    gourdling:    { h: 5.0, foot: 0.03 },
    husk:         { h: 7.8, foot: 0 },      // a scarecrow. Taller than you by design: the Stubble Field is where the forest stops being small.
    barrowhound:  { h: 4.6, foot: 0.06 },
    warren_mother:{ h: 6.6, foot: 0.04 },
    voidmoth:     { h: 5.6, foot: 0.04 },
    ashwraith:    { h: 8.2, foot: 0 },
    goblin:       { h: 6.2, foot: 0.02 },
    elderling:    { h: 9.6, foot: 0 },      // the deepest wanderer, and it should tower.
    crystal_stag: { h: 9.0, foot: 0 },      // the rare spawn reads as rare partly by being the biggest thing that is not a boss.
};

// A boss is the biggest body in its zone and gets bigger as the map goes down. ⚠️ A LADDER, AND IT FAILS
// UPWARD — an unknown boss gets the deepest size rather than falling through to nothing and rendering in a
// zero-height box. See ladder-lookups-must-fail-upward.
export const BOSS_SIZE = {
    glutmaw: { h: 13, foot: 0 },
    mossmother: { h: 13.5, foot: 0.05 },
    thistlecrown: { h: 14, foot: 0 },
    grandfather_bristle: { h: 14.5, foot: 0.02 },
    rattlerind: { h: 15, foot: 0 },
    harvestman: { h: 16, foot: 0 },
    barrow_warden: { h: 16.5, foot: 0.02 },
    great_weaver: { h: 17, foot: 0.01 },
    lanternwing: { h: 17.5, foot: 0.05 },
    everburning: { h: 18, foot: 0 },
    stakelord: { h: 19, foot: 0 },
    heartwood_elder: { h: 21, foot: 0 },
};

/** The drawn height and foot padding for any body in the Grove. Never returns null — a body with no size is a body in a 0px box. */
export function groveSize(id, { boss = false } = {}) {
    if (boss) return BOSS_SIZE[id] || { h: 21, foot: 0 };
    return GROVE_SIZE[id] || { h: 5, foot: 0 };
}

export const GROVE_RARE = {
    id: "crystal_stag",
    name: "The Crystal Stag",
    art: "/images/grove/foe-crystal_stag.webp",
    hp: 9000,
    dmg: [240, 360],
    telegraph: 900,
    // Per enemy spawned, before the rare_spawn emblem bonus is applied.
    spawnChance: 0.004,
    emblem: "em_crystal",
    emblemChance: 0.5,
    gold: [400, 900],
    chestChance: 0.25,
    chestTier: "iron",
    loot: [
        { part: "crystal_shard", n: [2, 4], w: 55 },
        { part: "elder_heartwood", n: [1, 3], w: 25 },
        { part: "mothlight_dust", n: [2, 4], w: 20 },
    ],
};

// ── THE TWELVE BOSSES ────────────────────────────────────────────────────────────────────────────────────────
// Luke: "Each zone would end with a boss. Big health bar. Telegraphed attacks."
//
// ⚠️ A BOSS IS ITS OWN CREATURE, NOT THE ZONE'S WANDERER WITH MORE HP. Every zone's `boss` field used to name
// the same enemy that already roamed it, so "the boss" was a rootrat you had already killed two hundred times
// — no silhouette of its own, no reason to walk to the end of the zone. Each is kin to what lives there, which
// is why the zone reads as building up to something, but each is a distinct body with its own art and its own
// way of hitting you.
//
// ⚠️ AND A BOSS IS NOT A GATE. `toUnlock` on the zone is a kill count and opens the next area on its own; the
// boss is the thing that ENDS a zone, which is a different job. You clear the zone to earn the right to fight
// it, and the area beyond was already open. Luke was explicit about this and the two keep wanting to merge.
//
// `attacks` is what makes the fight read: a wanderer has one wind-up, a boss cycles through several with
// different shapes and different tells.
//
//   slam    one point, hard, short tell          — punishes standing still
//   sweep   a wide band, weaker, long tell       — punishes being anywhere near it
//   volley  three points at once, medium tell    — punishes having nowhere to stand
//
// Every one of them announces itself before it lands. Nothing in this feature hits you without a tell.
// ⚠️ EVERY REACH HERE IS SET AGAINST ITS OWN TELL, BECAUSE NONE OF THEM USED TO BE. The hero covers
// 15.6 units a second, so an attack is dodgeable only if reach < 0.0156 * telegraph. The old numbers were
// 13 against 620ms (you can cover 9.7) and 34 against 1050ms (16.4) — so a boss fight was a wind-up, a
// light show, and then damage you were never able to avoid, which is a slow hit wearing a telegraph's
// clothes. The damage multipliers are untouched: a slam still hits for 1.45x, it is just now possible to
// not be there. See reachOf() in grove-world.js for the same correction on the wanderers.
//
// ⚠️ RE-REACHED AGAINST THE SLOWER WALK AND THE SMALLER WORLD. The hero covers 13.2 units a second now
// (0.22 a frame), and every one of these also has to FIT on an eighteen-unit frame — a fourteen-unit sweep
// is a band twenty-eight units wide, which is the whole screen and then some, so even a dodgeable one would
// have looked like an unavoidable one.
//
//   slam    5  vs 8.2 covered in 620ms   — tight. The one that punishes standing still.
//   sweep   10 vs 13.9 covered in 1050ms — wide and slow. You commit to leaving, you do not sidestep.
//   volley  4 each, 13 apart             — bands at [-17,-9] [-4,4] [9,17], gaps at 4-9 units out against
//                                          10.8 covered. Always somewhere to stand, and you have to move.
const A = {
    slam: { kind: "slam", reach: 5, telegraph: 620, mult: 1.45 },
    sweep: { kind: "sweep", reach: 10, telegraph: 1050, mult: 0.85 },
    volley: { kind: "volley", reach: 4, telegraph: 820, mult: 0.75, shots: 3, spread: 13 },
};

// ⚠️ `hp` IS NOT SCALED BY scaledFoe. A boss is authored at the depth it stands at — the climb that turns a
// zone-1 Thornling into a zone-5 Thornling would compound on a number that was already written for zone 5.
// ⚠️ `art` IS OVERRIDABLE, AND THAT IS HOW A REDRAWN BOSS REACHES ANYBODY. A boss's picture is derived
// from its id, which is right — until one of them is repainted. Same path plus new bytes means every
// player who has been in that zone keeps the OLD picture for as long as their cache holds it, and there is
// no ?v= anywhere in the Grove to turn. So a repainted boss ships under a new FILENAME and says so here.
// See redrawn-art-must-be-versioned.
const B = (id, name, o) => ({ id, name, art: `/images/grove/boss-${id}.webp`, boss: true, ...o });

const MAP_ONE_BOSSES = {
    glutmaw: B("glutmaw", "Glutmaw, the Burrow King", {
        hp: 59000, dmg: [190, 260], emblem: "em_rootrat", emblemChance: 0.09,
        attacks: [A.slam, A.sweep],
        loot: [{ part: "gnawed_root", n: [4, 7] }, { part: "damp_moss", n: [3, 5] }],
    }),
    mossmother: B("mossmother", "The Mossmother", {
        hp: 67700, dmg: [190, 270], emblem: "em_grub", emblemChance: 0.09,
        attacks: [A.slam, A.volley],
        loot: [{ part: "grub_fat", n: [4, 7] }, { part: "damp_moss", n: [3, 6] }],
    }),
    thistlecrown: B("thistlecrown", "Thistlecrown", {
        hp: 76800, dmg: [190, 270], emblem: "em_thornling", emblemChance: 0.10,
        attacks: [A.sweep, A.slam, A.volley],
        loot: [{ part: "thorn_barb", n: [4, 8] }, { part: "gnawed_root", n: [3, 6] }],
    }),
    grandfather_bristle: B("grandfather_bristle", "Grandfather Bristle", {
        hp: 86300, dmg: [190, 280], emblem: "em_badger", emblemChance: 0.10,
        attacks: [A.slam, A.sweep],
        loot: [{ part: "bristle_hide", n: [4, 7] }, { part: "split_antler", n: [2, 4] }],
    }),
    rattlerind: B("rattlerind", "Rattlerind", {
        hp: 96300, dmg: [200, 280], emblem: "em_gourdling", emblemChance: 0.10,
        attacks: [A.volley, A.slam, A.sweep],
        loot: [{ part: "gourd_rind", n: [4, 8] }, { part: "thorn_barb", n: [3, 6] }],
    }),
    harvestman: B("harvestman", "The Harvestman", {
        hp: 107000, dmg: [200, 280], emblem: "em_husk", emblemChance: 0.11,
        attacks: [A.sweep, A.slam],
        loot: [{ part: "bound_straw", n: [5, 9] }, { part: "gourd_rind", n: [3, 6] }],
    }),
    barrow_warden: B("barrow_warden", "The Barrow Warden", {
        hp: 118000, dmg: [200, 290], emblem: "em_barrowhound", emblemChance: 0.11,
        attacks: [A.slam, A.volley, A.sweep],
        loot: [{ part: "barrow_tooth", n: [5, 9] }, { part: "bristle_hide", n: [3, 6] }],
    }),
    great_weaver: B("great_weaver", "The Great Weaver", {
        hp: 129000, dmg: [200, 290], emblem: "em_warren", emblemChance: 0.11,
        attacks: [A.volley, A.sweep],
        loot: [{ part: "warren_silk", n: [5, 9] }, { part: "barrow_tooth", n: [3, 6] }],
    }),
    lanternwing: B("lanternwing", "The Lanternwing", {
        hp: 141000, dmg: [210, 290], emblem: "em_voidmoth", emblemChance: 0.12,
        attacks: [A.volley, A.slam, A.sweep],
        loot: [{ part: "mothlight_dust", n: [5, 9] }, { part: "warren_silk", n: [3, 6] }],
    }),
    everburning: B("everburning", "The Everburning", {
        hp: 154000, dmg: [210, 300], emblem: "em_ashwraith", emblemChance: 0.12,
        attacks: [A.sweep, A.volley, A.slam],
        loot: [{ part: "ash_ember", n: [5, 10] }, { part: "rotwood_knot", n: [3, 6] }],
    }),
    stakelord: B("stakelord", "Gorrak the Stakelord", {
        hp: 167000, dmg: [210, 300], emblem: "em_goblin", emblemChance: 0.12,
        attacks: [A.slam, A.volley, A.sweep],
        loot: [{ part: "goblin_rivet", n: [6, 10] }, { part: "ash_ember", n: [3, 6] }],
    }),
    heartwood_elder: B("heartwood_elder", "The Heartwood Elder", {
        hp: 180000, dmg: [220, 310], emblem: "em_elder", emblemChance: 0.14,
        attacks: [A.sweep, A.slam, A.volley],
        loot: [{ part: "elder_heartwood", n: [4, 8] }, { part: "rotwood_knot", n: [4, 7] }],
    }),
};

/** Every boss in the world, built maps only — same rule as the creatures above. */
export const GROVE_BOSSES = {
    ...MAP_ONE_BOSSES,
    ...Object.fromEntries(Object.entries(MAP_BOSSES).filter(([, b]) => mapIsBuilt(b.map))),
};

// How long a boss stays dead. ⚠️ THE ONLY THROTTLE ON THE HYPER-RARE FAUCET, so it is wall-clock and per
// zone — twelve zones means something is always available to somebody who has cleared the map, which is the
// point, but no single boss can be farmed in a loop.
export const BOSS_COOLDOWN_MS = 30 * 60 * 1000;

// ── HYPER-RARE DROPS ─────────────────────────────────────────────────────────────────────────────────────────
// Luke: "I think there could be hyper rare drops from pet food to upgrade stones/free enchant/free upgrade/free
// plot or sail upgrade."
//
// ⚠️ EVERY ONE OF THESE IS AN EXISTING REWARD, NOT A NEW CURRENCY. A "free enchant" is already an Enchantment
// Scroll, a "free upgrade" is already a Power Scroll, pet food is already a treat — and all three of those
// treats are price: null, meaning the shop has never sold them, which is exactly the shape a hyper-rare wants.
// Inventing a parallel token for any of it would have built a second, worse version of a counter that works.
//
// The free PLOT is deliberately absent: it is a recipe (plot_i / plot_ii), not a drop. Luke listed both in one
// breath and only one of them should be luck.
//
// `minZone` is what keeps the ladder honest — ⚠️ AND IT FAILS UPWARD. A reward's floor is the shallowest boss
// that may pay it, so a deep boss is eligible for everything below it. See rarity-tables-stop-at-eternal: a
// table that only matches its own rung hands the deepest kill the thinnest prize.
export const GROVE_HYPER = [
    { id: "treat_wild", kind: "consumable", ref: "treat_wild", name: "Wild Rations", minZone: 1, w: 30 },
    { id: "forge_enchant_scroll", kind: "consumable", ref: "forge_enchant_scroll", name: "Enchantment Scroll", minZone: 3, w: 16 },
    { id: "treat_marrow", kind: "consumable", ref: "treat_marrow", name: "Ancient Marrow", minZone: 4, w: 22 },
    { id: "forge_power_scroll", kind: "consumable", ref: "forge_power_scroll", name: "Power Scroll", minZone: 5, w: 14 },
    { id: "ship_upgrade", kind: "ship_upgrade", ref: null, name: "A free ship upgrade", minZone: 6, w: 10 },
    { id: "treat_mythic", kind: "consumable", ref: "treat_mythic", name: "Mythic Morsel", minZone: 8, w: 7 },
    { id: "pet_stone", kind: "stone", ref: null, name: "An enshrinement stone", minZone: 10, w: 4 },
];

// Per boss kill, before the emblem's rarity bonus. Climbs with depth so the deep bosses — the ones that are
// actually hard — are where this lives, rather than whichever one is cheapest to kill on repeat.
export const bossHyperChance = (zoneN) => 0.006 + 0.0015 * Math.max(0, (Number(zoneN) || 1) - 1);

// ── ⚠️ AND A SLIVER OF IT ON ORDINARY KILLS ─────────────────────────────────────────────────────────────────
// Kept next to the boss rate so the two are read together and nobody tunes one without seeing the other.
//
// Luke: "am I suprised by rare events drops". The hyper table was the only genuinely surprising thing in the
// feature and it was locked entirely behind bosses -- which, measured on the live database, nobody had ever
// fought. So the best content in the Grove had been seen by no one.
//
// About one kill in two thousand at the surface, one in eight hundred at depth. At the observed pace that is
// a few times across a whole campaign, which is the correct rate for a thing worth telling somebody about --
// and the depth scaling puts it where the fights are actually hard rather than on whichever creature is
// cheapest to farm. It is roughly a two-hundredth of the boss rate, on purpose: the boss stays the reliable
// route and this stays the lightning strike.
export const wandererHyperChance = (zoneN) => 0.0005 + 0.00008 * Math.max(0, (Number(zoneN) || 1) - 1);

// ── WHAT A LEDGE IS MADE OF, AND WHAT GROWS ON IT ────────────────────────────────────────────────────────────
// Luke: "Lets make the platforms more detailed. And add sprite decorations like vines hanging from platforms
// where biome permits, the platforms are just way too plain."
//
// ⚠️ "WHERE BIOME PERMITS" IS THE WHOLE TABLE. A hanging vine in the Rotwood — a forest that burned and never
// cooled — is not a decoration, it is a continuity error, and the same is true of a fern in the Stubble Field
// or a flowering creeper in a burrow. So a biome does not get "vines on/off": it names the handful of things
// that are allowed to grow there, and a zone can only ever be dressed out of its own list.
//
// `slab` is the painted ledge itself (three-sliced — see grove-css.js). `hang` is what trails off the
// underside, `sit` is what rests on top. `density` is hangs per 10 units of ledge; `sitDensity` likewise.
//
// ⚠️ A BIOME IS NOT A ZONE. Seven slabs dress twelve zones, because the Thicket, the Fernway and the Old Stand
// genuinely are the same mossy forest floor at different depths — and a zone that reuses a slab still gets its
// own growth list, which is what keeps Mothlight from looking like Thicket Edge with the lights off.
export const GROVE_BIOMES = {
    wood: { slab: "wood", density: 1.5, sitDensity: 1.1,
        hang: ["vine_leafy", "vine_flower", "moss_beard"], sit: ["fern_tuft", "grass_tuft", "mushroom_cluster"] },
    moss: { slab: "moss", density: 2.0, sitDensity: 1.2,
        hang: ["moss_beard", "vine_leafy"], sit: ["mushroom_cluster", "fern_tuft"] },
    bramble: { slab: "bramble", density: 1.6, sitDensity: 0.7,
        hang: ["thorn_cane", "vine_leafy"], sit: ["grass_tuft"] },
    // Cut stubble to the horizon. Nothing climbs out here, so the only thing that hangs is the crop itself.
    field: { slab: "field", density: 1.1, sitDensity: 0.9,
        hang: ["straw_fringe"], sit: ["grass_tuft"] },
    stone: { slab: "stone", density: 1.3, sitDensity: 0.7,
        hang: ["root_pale", "moss_beard"], sit: ["grass_tuft", "mushroom_cluster"] },
    // Underground. No grass, no flowers, no sun — roots through the roof and what spins in the dark.
    burrow: { slab: "earth", density: 2.1, sitDensity: 0.5,
        hang: ["root_pale", "cobweb"], sit: ["mushroom_cluster"] },
    // ⚠️ THE ONE THAT PROVES THE TABLE IS DOING SOMETHING. Burnt forest gets dead twigs and nothing else —
    // no vine, no moss, no fern, nothing that is alive.
    char: { slab: "char", density: 1.0, sitDensity: 0.3,
        hang: ["char_twig"], sit: [] },
    plank: { slab: "plank", density: 1.2, sitDensity: 0.4,
        hang: ["rope_coil", "cobweb"], sit: ["grass_tuft"] },
    // Lit from the air. The glow is the zone's whole identity, so it is the thing that hangs.
    glow: { slab: "wood", density: 1.7, sitDensity: 1.0,
        hang: ["glow_strand", "moss_beard", "vine_leafy"], sit: ["fern_tuft", "mushroom_cluster"] },
    // The oldest thing in the forest, and the most overgrown.
    heart: { slab: "wood", density: 2.2, sitDensity: 1.4,
        hang: ["vine_flower", "vine_leafy", "moss_beard"], sit: ["fern_tuft", "mushroom_cluster", "grass_tuft"] },
};

// ── ⚠️ WHERE EACH SLAB'S STANDING SURFACE IS, AS A SHARE OF ITS HEIGHT ───────────────────────────────────────
// Luke: "the enemies and player and pet are floating, maybe we can fix that for all platforms?"
//
// A body's feet go at the ledge element's TOP EDGE, and until this the top edge was the top ROW OF THE
// PAINTING — which on a mossy slab is the tip of the tallest tuft, not the surface. Standing a knight on the
// apex of the cushion is precisely what reads as hovering, and the shaggier the slab the worse it got: the
// bramble's top edge wanders over 13% of its own height, the char's over 1.6%. Which is also why it looked
// like one bug with one cause and was actually a different amount of wrong on every platform in the game.
//
// MEASURED, NOT AUTHORED, exactly like the `foot` column in GROVE_SIZE: for each column across the slab's
// middle, the first opaque row; the MEDIAN of those is the line the eye reads as the surface, because half
// the tufts stand above it and half below. Regenerate with scripts/grove-decor-clean.mjs after any art pass
// that touches a slab — a redrawn slab with a different cushion silently moves this line.
export const SLAB_SURFACE = {
    bramble: 0.131,   // top edge median row 42 of 320
    char: 0.016,      // 5 of 320
    earth: 0.013,     // 4 of 320
    field: 0.059,     // 19 of 320
    moss: 0.053,      // 17 of 320
    plank: 0.078,     // 25 of 320
    stone: 0.053,     // 17 of 320
    wood: 0.016,      // 5 of 320
};

export const groveBiome = (id) => GROVE_BIOMES[id] || GROVE_BIOMES.wood;
export const slabSurface = (biomeId) => SLAB_SURFACE[groveBiome(biomeId).slab] ?? 0;
export const slabArt = (biomeId) => `/images/grove/slab-${groveBiome(biomeId).slab}.webp`;
export const hangArt = (id) => `/images/grove/hang-${id}.webp`;
export const sitArt = (id) => `/images/grove/sit-${id}.webp`;

// ── THE TWELVE ZONES ─────────────────────────────────────────────────────────────────────────────────────────
// ⚠️ `toUnlock` IS A KILL COUNT, NOT A BOSS. The area opens on kills, exactly as Luke described it; the boss
// is what ENDS the zone, not what gates the next one. Two different jobs.
//
// `enemies` is the mix that wanders the zone — some zones carry two types, which is what stops the middle of
// the map feeling like one long corridor.
//
// `biome` is what the ledges in it are made of and what is allowed to grow on them. It is a required argument
// rather than an option with a default, because a default here is a zone quietly dressed as the wrong place —
// check-grove.mjs asserts every one of them names a biome that exists.
const Z = (n, id, name, enemies, boss, toUnlock, biome, o = {}) =>
    ({ n, id, name, enemies, boss, toUnlock, biome, bg: `/images/grove/zone-${id}.webp`, ...o });

const MAP_ONE_ZONES = [
    Z(1, "thicket", "Thicket Edge", ["rootrat"], "glutmaw", 20, "wood", { blurb: "Where the trees start. Nothing here has noticed you yet." }),
    Z(2, "hollow", "Mossy Hollow", ["grub"], "mossmother", 25, "moss", { blurb: "Wet underfoot and quiet. Something is eating the deadfall." }),
    Z(3, "fernway", "The Fernway", ["rootrat", "thornling"], "thistlecrown", 30, "wood", { blurb: "Head-high ferns, and the first thing that hits back." }),
    Z(4, "oldstand", "The Old Stand", ["badger"], "grandfather_bristle", 35, "wood", { blurb: "Big trunks, old roots, and something that lives under them." }),
    Z(5, "bramble", "Bramblewall", ["thornling", "gourdling"], "rattlerind", 40, "bramble", { blurb: "A wall of thorn somebody planted on purpose." }),
    Z(6, "stubble", "The Stubble Field", ["husk"], "harvestman", 45, "field", { blurb: "Cut stalks to the horizon. Some of them walk." }),
    Z(7, "barrows", "The Barrows", ["barrowhound", "husk"], "barrow_warden", 50, "stone", { blurb: "Mounds in rows. The rows are deliberate." }),
    Z(8, "warren", "The Warren", ["warren_mother", "barrowhound"], "great_weaver", 55, "burrow", { blurb: "Down, and then further down. Something spins in the dark." }),
    Z(9, "mothlight", "Mothlight", ["voidmoth"], "lanternwing", 60, "glow", { blurb: "A clearing lit from the air by wings." }),
    Z(10, "rotwood", "Rotwood", ["ashwraith", "voidmoth"], "everburning", 65, "char", { blurb: "The trees burned a long time ago and never went out." }),
    Z(11, "palisade", "The Palisade", ["goblin", "ashwraith"], "stakelord", 70, "plank", { blurb: "Sharpened stakes, facing outward. Somebody is keeping something in." }),
    Z(12, "heartwood", "Heartwood", ["elderling", "goblin"], "heartwood_elder", 80, "heart", { blurb: "The middle of the forest, and the oldest thing in it." }),
];

// Map one's zones carry their map number here rather than in twelve literals.
for (const z of MAP_ONE_ZONES) { z.map = 1; z.mapName = "The Grove"; }

/**
 * Every zone a member can walk into, in depth order.
 *
 * ⚠️ BUILT MAPS ONLY, AND THE DESIGN IS NOT THE GAME. grove-maps.js declares 132 more zones — named, themed,
 * populated and priced — because the shape of the climb had to be decided before anything was drawn. A zone
 * with no backdrop is a black screen, so a map joins this list when its art lands and not before. Raise
 * MAPS_BUILT and the whole map arrives at once: zones, residents, bosses, materials and its emblem.
 */
export const GROVE_ZONES = [
    ...MAP_ONE_ZONES,
    ...MAP_ZONES.filter((z) => mapIsBuilt(z.map)),
];

// ── DIFFICULTY ───────────────────────────────────────────────────────────────────────────────────────────────
// Luke: "Enemies grow in difficulty as you progress each node and map. They grow in damage and health."
//
// ⚠️ THE CLIMB IS PER ZONE OF *GLOBAL DEPTH*, AND IT COMPOUNDS. Both halves of that were wrong before and
// both were invisible inside one map:
//
//   · DEPTH, NOT ZONE-WITHIN-MAP. This read `zone.n`, which restarts at 1 on every map — so map 2 zone 1
//     would have been exactly as hard as map 1 zone 1, and twenty maps would have been the same forest
//     twenty times. `groveDepth()` is the only thing that should ever reach this function.
//   · COMPOUNDING, NOT ADDITIVE. `1 + rate * z` and `(1 + rate) ** z` agree closely over eleven steps and
//     disagree by a factor of SEVEN over a hundred and thirty-two. Luke's "linear growth line" is the
//     anchored endpoint, not arithmetic growth: reaching x40 is only possible compounding.
//
// The per-enemy hp/dmg above are that creature's baseline at depth 1; this is the climb applied on top, so a
// Thornling in the Fernway and a Thornling at Bramblewall are the same animal at different depths.
//
// ── ⚠️ THE HIGH ANCHOR IS MAP 8 ZONE 1 — DEPTH 85, NOT 133 ───────────────────────────────────────────────────
// Luke: "I meant he should start to struggle around map 8... Not node 8 on map 1, but map 8 node 1."
//
// The number these rates come from is the gap between the two ends of the real Den, measured off production
// by `npm run grove:curve`: Littlewolf at 1716 dps / 1823 effective HP, Eric D at 68058 / 9541. That is x40
// of power, and the only question the curve answers is HOW MANY ZONES it is spread over. Spread it over 132
// and the top of the Den strolls two thirds of a twenty-map game; spread it over 84 and the wall lands where
// Luke wants it.
//
// ⚠️ IT IS A SPAN, AND SHORTENING IT MAKES EVERY BUILT ZONE HARDER — including the only one that exists.
// Map 1 zone 12's wanderers go 1300 hp -> 1600 and its boss 187k -> 222k, and Littlewolf's boss fight there
// goes from 109 seconds to 129. That is not a side effect of this change, it IS this change: the whole
// curve pivots about depth 1, so pulling the far end in lifts everything between. Flagged to Luke.
//
// ⚠️ grove-curve.mjs's DEFAULT MUST MATCH THIS. The tool prints a recommended GROVE_SCALE for whatever anchor
// it is asked about, and a default that disagrees with the shipped constant means the next person to run it
// reads a table describing a game that is not this one.
export const GROVE_SCALE = { hpPerZone: 0.0448, dmgPerZone: 0.0199, zonesPerMap: 12 };

/**
 * How deep in the whole Grove a zone is, counting across maps — the ONE number difficulty scales against.
 *
 * Map 1 zone 1 is depth 1 and map 12 zone 1 is depth 133, which is where the rates above come from. Map 1's
 * zone numbers happen to equal their depth, which is exactly why passing a bare zone number worked and would
 * have kept working right up until map 2 shipped reading as a second tutorial.
 */
export const groveDepth = (mapN, zoneN) =>
    (Math.max(1, Number(mapN) || 1) - 1) * GROVE_SCALE.zonesPerMap + Math.max(1, Number(zoneN) || 1);

const depthMult = (rate, depth) => Math.pow(1 + rate, Math.max(0, (Number(depth) || 1) - 1));

export function scaledFoe(enemyId, depth) {
    const base = GROVE_ENEMIES[enemyId];
    if (!base) return null;
    const hpMult = depthMult(GROVE_SCALE.hpPerZone, depth);
    const dmgMult = depthMult(GROVE_SCALE.dmgPerZone, depth);
    return {
        ...base,
        hp: Math.round(base.hp * hpMult),
        dmg: [Math.round(base.dmg[0] * dmgMult), Math.round(base.dmg[1] * dmgMult)],
    };
}

/**
 * The rare spawn, at the depth it was found.
 *
 * ⚠️ IT USED TO BE A CONSTANT, which made it the only body in the Grove that did not climb — a wall at
 * depth 1 (twenty-eight swings for a newcomer) and a pushover by map 12, where the ordinary wanderers
 * standing next to it have thirty times its health. Same failure as any stale ceiling: it stops meaning
 * anything the moment the ladder grows past it. Its reward scales with nothing, so only the body does.
 */
export function scaledRare(depth) {
    const hpMult = depthMult(GROVE_SCALE.hpPerZone, depth);
    const dmgMult = depthMult(GROVE_SCALE.dmgPerZone, depth);
    return {
        ...GROVE_RARE,
        hp: Math.round(GROVE_RARE.hp * hpMult),
        dmg: [Math.round(GROVE_RARE.dmg[0] * dmgMult), Math.round(GROVE_RARE.dmg[1] * dmgMult)],
    };
}

// ── POPULATION ───────────────────────────────────────────────────────────────────────────────────────────────
// Luke: "15 to 30 enemies, fully replenishing every 45 seconds."
//
// ── ⚠️ respawnMs IS A REFILL RATE, NOT A TIMER, AND READING IT AS A TIMER WAS THE BUG ────────────────────────
// Luke, looking at a zone on 20 of 50 kills with two creatures on the whole screen: "This level needs faster
// respawns."
//
// It was literally a timer: every 45 seconds the scene topped the zone back up to a freshly rolled target, and
// did nothing at all in between. Three things came out of that one shape, and only the first is obvious.
//
//   · a zone you are clearing well goes EMPTY and stays empty. Kill the eight bodies near you at second 5 and
//     the forest is a backdrop until second 45. That is the complaint.
//   · the target is re-rolled on every refill, so a window that rolls 16 against a standing population of 19
//     spawns NOTHING. Perfectly possible to clear half a zone, wait the full 45 seconds, and get nobody.
//   · thirty bodies arrive on the same frame, which is the one frame in the window that can least afford it.
//
// So the number is now what it always read as -- a FULL ZONE'S WORTH PER respawnMs -- delivered one creature
// at a time, every respawnMs/max. Same roof on kills per minute, same killCeiling arithmetic server-side
// (which divides elapsed by respawnMs and multiplies by max, and is correct for a drip for exactly the same
// reason it was correct for a burst), and no window in which the zone is empty.
//
// ⚠️ THE TARGET IS ROLLED ONCE PER ZONE, NOT PER REFILL. 15-to-30 was always meant to be the difference
// between one zone and another, not a number that moves under you every 45 seconds. See the second bullet.
export const GROVE_POP = { min: 15, max: 30, respawnMs: 45_000 };

// How long between two individual arrivals. A full zone's worth per respawnMs: 1.5s at today's numbers.
export const spawnGapMs = () => GROVE_POP.respawnMs / GROVE_POP.max;

// ── ⚠️ WHERE A PART COMES FROM, DERIVED FROM THE LOOT TABLES THAT PAY IT ────────────────────────────────────
// Luke: "You should be able to tap ingredients to add to wish list and see on the map where to find and above
// enemies which items they have that you wish for."
//
// The bench has always been able to say a recipe needs six Thornhusk and the player has one. It has never
// been able to say WHERE the other five are, and that is the actual question — the Grove is seven maps of
// eighty-four zones and the answer was "go and find out". Not a new table: the loot rows already say which
// creature pays which part, and the zone list already says which creature lives where. This is the join.
//
// ⚠️ BUILT ONCE AT IMPORT, NOT PER CALL. A bench row asks about three parts and a map asks about every zone;
// walking every creature's loot table for each question is the getFarm mistake in miniature. One pass.
//
// ⚠️ AND IT INCLUDES THE RARE ROW. A creature's rare drop is a part from DEEPER in the forest, so it is the
// one source a player could never guess by looking at where they are standing — which makes it the most
// worth printing, not the least.
const PART_SOURCE = (() => {
    const byPart = new Map();
    const note = (part, enemyId) => {
        if (!part) return;
        if (!byPart.has(part)) byPart.set(part, { enemies: new Set(), zones: new Set() });
        byPart.get(part).enemies.add(enemyId);
    };
    for (const e of Object.values(GROVE_ENEMIES)) {
        for (const row of e.loot || []) note(row.part, e.id);
        note(e.rareLoot?.part, e.id);
    }
    for (const row of GROVE_RARE.loot || []) note(row.part, GROVE_RARE.id);
    note(GROVE_RARE.rareLoot?.part, GROVE_RARE.id);
    // ⚠️ ZONES COME FROM GROVE_ZONES, so an unbuilt map never appears as somewhere to go. A wishlist that
    // points at a zone nobody can walk into is worse than one that says nothing.
    for (const z of GROVE_ZONES) {
        for (const id of z.enemies || []) {
            for (const [, v] of byPart) if (v.enemies.has(id)) v.zones.add(z.id);
        }
    }
    return byPart;
})();

/** Which creatures drop this part, and which walkable zones they live in. Never null. */
export function partSources(partId) {
    const v = PART_SOURCE.get(partId);
    return { enemies: [...(v?.enemies || [])], zones: [...(v?.zones || [])] };
}

/** Does this creature drop any of these parts? The in-zone marker asks this per body, per frame. */
export function dropsAnyOf(enemyId, parts) {
    if (!parts?.length) return false;
    for (const p of parts) if (PART_SOURCE.get(p)?.enemies.has(enemyId)) return true;
    return false;
}

/** Which of these parts can be found in this zone — what the map pin counts. */
export function zoneHasParts(zone, parts) {
    if (!zone || !parts?.length) return [];
    return parts.filter((p) => PART_SOURCE.get(p)?.zones.has(zone.id));
}

export const groveZone = (id) => GROVE_ZONES.find((z) => z.id === id) || null;
export const groveBoss = (id) => GROVE_BOSSES[id] || null;
export const grovePart = (id) => GROVE_PARTS[id] || null;
export const groveEmblem = (id) => GROVE_EMBLEMS[id] || null;

// ── WHAT A LOOSE ITEM LOOKS LIKE ─────────────────────────────────────────────────────────────────────────────
// ⚠️ DERIVED, NOT AUTHORED. Thirty-three literal paths spread across three tables is thirty-three chances for
// one of them to disagree with the file on disk, and a path that points at nothing is not a build error — it
// is a broken-image glyph in the player's zone (img-onerror-fires-before-hydration). gen-grove-art.mjs names
// every file by family and id, so the id IS the path; check-grove.mjs then asserts each one exists, which is
// the half that makes deriving it safe rather than merely shorter.
export const groveArt = (id) => {
    if (GROVE_PARTS[id]) return `/images/grove/part-${id}.webp`;
    if (GROVE_EMBLEMS[id]) return `/images/grove/emblem-${id}.webp`;
    // A generated map's food borrows map one's picture for its heal tier, so the path is on the food.
    if (GROVE_FOODS[id]) return GROVE_FOODS[id].art || `/images/grove/food-${id}.webp`;
    return null;
};

// ── A TOOL'S PICTURE, BY SLOT AND RUNG ───────────────────────────────────────────────────────────────────────
// It used to be one sprite per slot, on the reasoning that a ladder changes the number beside the picture
// rather than the picture. That was wrong, and the recipes are why: tier VII is not a better rod, it is a rod
// made out of a DIFFERENT PLACE — comet thread and void rod have nothing in common with root and moss except
// what they are for. Every rung is drawn from its own map's three materials.
//
// `tool-<slot>-t<n>.webp` is the real name. The bare `tool-<slot>.webp` is kept as the fallback for any
// caller that does not know a tier (and is byte-identical to -t1), so an old reference cannot 404.
export const toolArt = (slot, tier = 0) => {
    if (!slot) return null;
    const n = Math.max(0, Math.floor(Number(tier) || 0));
    return n >= 1 ? `/images/grove/tool-${slot}-t${n}.webp` : `/images/grove/tool-${slot}.webp`;
};
