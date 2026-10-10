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

// ── PARTS ────────────────────────────────────────────────────────────────────────────────────────────────────
// ⚠️ EVERY PART HERE IS USED BY AT LEAST ONE RECIPE. Luke: "Each part you can get from an enemy has uses in at
// least one recipe." check-grove.mjs fails the build if one is ever orphaned — a part that drops and does
// nothing is litter in a 16-slot backpack.
//
// `tier` tracks the depth it comes from and is what recipes price against.
export const GROVE_PARTS = {
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

export const GROVE_FOODS = {
    food_poultice: { name: "Moss Poultice", heals: 0.25, tier: 1,
        blurb: "Chewed moss and grub fat, packed into a leaf. It works, which is the only nice thing about it." },
    food_flask: { name: "Gourd Flask", heals: 0.40, tier: 3,
        blurb: "A dried gourd of something cloudy. Tastes of the field it came out of." },
    food_tonic: { name: "Mothlight Tonic", heals: 0.60, tier: 5,
        blurb: "Faintly luminous. Drinking it feels like standing up too fast, and then being fine." },
    food_draught: { name: "Heartwood Draught", heals: 1.00, tier: 6,
        blurb: "Pressed from the middle of a very old tree. There is not much of it in the world." },
};

export const groveFood = (id) => GROVE_FOODS[id] || null;

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
export const GROVE_EMBLEMS = {
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

// ── ENEMIES ──────────────────────────────────────────────────────────────────────────────────────────────────
// `passive` is the behaviour Luke described: early enemies ignore you entirely, later ones hit back once
// struck. `telegraph` is how long the wind-up reads on screen before the hit lands — every attack in this
// feature announces itself.
//
// `loot` weights are relative within the enemy. `n` is how many drop when that row wins.
const E = (id, name, art, o) => ({ id, name, art, ...o });

export const GROVE_ENEMIES = {
    rootrat: E("rootrat", "Rootrat", "/images/delves/foe-rootrat.webp", {
        passive: true, hp: 18, dmg: [1, 2], telegraph: 0,
        emblem: "em_rootrat", emblemChance: 0.0026,
        loot: [{ part: "gnawed_root", n: [1, 2], w: 70 }, { part: "damp_moss", n: [1, 1], w: 30 }],
    }),
    grub: E("grub", "Pale Grub", "/images/delves/foe-grub.webp", {
        passive: true, hp: 26, dmg: [1, 3], telegraph: 0,
        emblem: "em_grub", emblemChance: 0.0026,
        loot: [{ part: "grub_fat", n: [1, 2], w: 75 }, { part: "damp_moss", n: [1, 2], w: 25 }],
    }),
    thornling: E("thornling", "Thornling", "/images/delves/foe-thornling.webp", {
        passive: false, hp: 44, dmg: [3, 6], telegraph: 650,
        emblem: "em_thornling", emblemChance: 0.0024,
        loot: [{ part: "thorn_barb", n: [1, 3], w: 65 }, { part: "gnawed_root", n: [1, 2], w: 35 }],
    }),
    badger: E("badger", "Bristleback", "/images/delves/foe-badger.webp", {
        passive: false, hp: 70, dmg: [5, 9], telegraph: 700,
        emblem: "em_badger", emblemChance: 0.0022,
        loot: [{ part: "bristle_hide", n: [1, 2], w: 60 }, { part: "split_antler", n: [1, 1], w: 40 }],
    }),
    gourdling: E("gourdling", "Gourdling", "/images/delves/foe-gourdling.webp", {
        passive: false, hp: 105, dmg: [7, 12], telegraph: 620,
        emblem: "em_gourdling", emblemChance: 0.0022,
        loot: [{ part: "gourd_rind", n: [1, 2], w: 70 }, { part: "thorn_barb", n: [1, 2], w: 30 }],
    }),
    husk: E("husk", "Straw Walker", "/images/grove/foe-husk.webp", {
        passive: false, hp: 145, dmg: [9, 15], telegraph: 750,
        emblem: "em_husk", emblemChance: 0.002,
        loot: [{ part: "bound_straw", n: [1, 3], w: 70 }, { part: "gourd_rind", n: [1, 1], w: 30 }],
    }),
    barrowhound: E("barrowhound", "Barrow Hound", "/images/delves/foe-barrowhound.webp", {
        passive: false, hp: 190, dmg: [12, 19], telegraph: 520,
        emblem: "em_barrowhound", emblemChance: 0.002,
        loot: [{ part: "barrow_tooth", n: [1, 2], w: 65 }, { part: "bristle_hide", n: [1, 2], w: 35 }],
    }),
    warren_mother: E("warren_mother", "Warren Mother", "/images/delves/foe-warren-mother.webp", {
        passive: false, hp: 250, dmg: [15, 23], telegraph: 820,
        emblem: "em_warren", emblemChance: 0.0018,
        loot: [{ part: "warren_silk", n: [1, 2], w: 70 }, { part: "barrow_tooth", n: [1, 2], w: 30 }],
    }),
    voidmoth: E("voidmoth", "Mothlight", "/images/delves/foe-voidmoth.webp", {
        passive: false, hp: 310, dmg: [18, 28], telegraph: 600,
        emblem: "em_voidmoth", emblemChance: 0.0018,
        loot: [{ part: "mothlight_dust", n: [1, 2], w: 72 }, { part: "warren_silk", n: [1, 1], w: 28 }],
    }),
    ashwraith: E("ashwraith", "Ash Wraith", "/images/delves/foe-ashwraith.webp", {
        passive: false, hp: 380, dmg: [22, 33], telegraph: 700,
        emblem: "em_ashwraith", emblemChance: 0.0016,
        loot: [{ part: "ash_ember", n: [1, 2], w: 68 }, { part: "rotwood_knot", n: [1, 2], w: 32 }],
    }),
    goblin: E("goblin", "Palisade Goblin", "/images/grove/foe-goblin.webp", {
        passive: false, hp: 455, dmg: [26, 39], telegraph: 560,
        emblem: "em_goblin", emblemChance: 0.0016,
        loot: [{ part: "goblin_rivet", n: [1, 3], w: 70 }, { part: "ash_ember", n: [1, 1], w: 30 }],
    }),
    elderling: E("elderling", "Elderling", "/images/grove/foe-elderling.webp", {
        passive: false, hp: 560, dmg: [31, 47], telegraph: 880,
        emblem: "em_elder", emblemChance: 0.0014,
        loot: [{ part: "elder_heartwood", n: [1, 2], w: 60 }, { part: "rotwood_knot", n: [1, 2], w: 40 }],
    }),
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
    hp: 900,
    dmg: [30, 44],
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
const B = (id, name, o) => ({ id, name, art: `/images/grove/boss-${id}.webp`, boss: true, ...o });

export const GROVE_BOSSES = {
    glutmaw: B("glutmaw", "Glutmaw, the Burrow King", {
        hp: 420, dmg: [6, 10], emblem: "em_rootrat", emblemChance: 0.09,
        attacks: [A.slam, A.sweep],
        loot: [{ part: "gnawed_root", n: [4, 7] }, { part: "damp_moss", n: [3, 5] }],
    }),
    mossmother: B("mossmother", "The Mossmother", {
        hp: 640, dmg: [8, 13], emblem: "em_grub", emblemChance: 0.09,
        attacks: [A.slam, A.volley],
        loot: [{ part: "grub_fat", n: [4, 7] }, { part: "damp_moss", n: [3, 6] }],
    }),
    thistlecrown: B("thistlecrown", "Thistlecrown", {
        hp: 900, dmg: [11, 17], emblem: "em_thornling", emblemChance: 0.10,
        attacks: [A.sweep, A.slam, A.volley],
        loot: [{ part: "thorn_barb", n: [4, 8] }, { part: "gnawed_root", n: [3, 6] }],
    }),
    grandfather_bristle: B("grandfather_bristle", "Grandfather Bristle", {
        hp: 1250, dmg: [14, 21], emblem: "em_badger", emblemChance: 0.10,
        attacks: [A.slam, A.sweep],
        loot: [{ part: "bristle_hide", n: [4, 7] }, { part: "split_antler", n: [2, 4] }],
    }),
    rattlerind: B("rattlerind", "Rattlerind", {
        hp: 1650, dmg: [17, 25], emblem: "em_gourdling", emblemChance: 0.10,
        attacks: [A.volley, A.slam, A.sweep],
        loot: [{ part: "gourd_rind", n: [4, 8] }, { part: "thorn_barb", n: [3, 6] }],
    }),
    harvestman: B("harvestman", "The Harvestman", {
        hp: 2100, dmg: [20, 30], emblem: "em_husk", emblemChance: 0.11,
        attacks: [A.sweep, A.slam],
        loot: [{ part: "bound_straw", n: [5, 9] }, { part: "gourd_rind", n: [3, 6] }],
    }),
    barrow_warden: B("barrow_warden", "The Barrow Warden", {
        hp: 2650, dmg: [24, 35], emblem: "em_barrowhound", emblemChance: 0.11,
        attacks: [A.slam, A.volley, A.sweep],
        loot: [{ part: "barrow_tooth", n: [5, 9] }, { part: "bristle_hide", n: [3, 6] }],
    }),
    great_weaver: B("great_weaver", "The Great Weaver", {
        hp: 3300, dmg: [28, 40], emblem: "em_warren", emblemChance: 0.11,
        attacks: [A.volley, A.sweep],
        loot: [{ part: "warren_silk", n: [5, 9] }, { part: "barrow_tooth", n: [3, 6] }],
    }),
    lanternwing: B("lanternwing", "The Lanternwing", {
        hp: 4000, dmg: [32, 46], emblem: "em_voidmoth", emblemChance: 0.12,
        attacks: [A.volley, A.slam, A.sweep],
        loot: [{ part: "mothlight_dust", n: [5, 9] }, { part: "warren_silk", n: [3, 6] }],
    }),
    everburning: B("everburning", "The Everburning", {
        hp: 4800, dmg: [37, 53], emblem: "em_ashwraith", emblemChance: 0.12,
        attacks: [A.sweep, A.volley, A.slam],
        loot: [{ part: "ash_ember", n: [5, 10] }, { part: "rotwood_knot", n: [3, 6] }],
    }),
    stakelord: B("stakelord", "Gorrak the Stakelord", {
        hp: 5700, dmg: [42, 60], emblem: "em_goblin", emblemChance: 0.12,
        attacks: [A.slam, A.volley, A.sweep],
        loot: [{ part: "goblin_rivet", n: [6, 10] }, { part: "ash_ember", n: [3, 6] }],
    }),
    heartwood_elder: B("heartwood_elder", "The Heartwood Elder", {
        hp: 7200, dmg: [48, 68], emblem: "em_elder", emblemChance: 0.14,
        attacks: [A.sweep, A.slam, A.volley],
        loot: [{ part: "elder_heartwood", n: [4, 8] }, { part: "rotwood_knot", n: [4, 7] }],
    }),
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

// ── THE TWELVE ZONES ─────────────────────────────────────────────────────────────────────────────────────────
// ⚠️ `toUnlock` IS A KILL COUNT, NOT A BOSS. The area opens on kills, exactly as Luke described it; the boss
// is what ENDS the zone, not what gates the next one. Two different jobs.
//
// `enemies` is the mix that wanders the zone — some zones carry two types, which is what stops the middle of
// the map feeling like one long corridor.
const Z = (n, id, name, enemies, boss, toUnlock, o = {}) =>
    ({ n, id, name, enemies, boss, toUnlock, bg: `/images/grove/zone-${id}.webp`, ...o });

export const GROVE_ZONES = [
    Z(1, "thicket", "Thicket Edge", ["rootrat"], "glutmaw", 20, { blurb: "Where the trees start. Nothing here has noticed you yet." }),
    Z(2, "hollow", "Mossy Hollow", ["grub"], "mossmother", 25, { blurb: "Wet underfoot and quiet. Something is eating the deadfall." }),
    Z(3, "fernway", "The Fernway", ["rootrat", "thornling"], "thistlecrown", 30, { blurb: "Head-high ferns, and the first thing that hits back." }),
    Z(4, "oldstand", "The Old Stand", ["badger"], "grandfather_bristle", 35, { blurb: "Big trunks, old roots, and something that lives under them." }),
    Z(5, "bramble", "Bramblewall", ["thornling", "gourdling"], "rattlerind", 40, { blurb: "A wall of thorn somebody planted on purpose." }),
    Z(6, "stubble", "The Stubble Field", ["husk"], "harvestman", 45, { blurb: "Cut stalks to the horizon. Some of them walk." }),
    Z(7, "barrows", "The Barrows", ["barrowhound", "husk"], "barrow_warden", 50, { blurb: "Mounds in rows. The rows are deliberate." }),
    Z(8, "warren", "The Warren", ["warren_mother", "barrowhound"], "great_weaver", 55, { blurb: "Down, and then further down. Something spins in the dark." }),
    Z(9, "mothlight", "Mothlight", ["voidmoth"], "lanternwing", 60, { blurb: "A clearing lit from the air by wings." }),
    Z(10, "rotwood", "Rotwood", ["ashwraith", "voidmoth"], "everburning", 65, { blurb: "The trees burned a long time ago and never went out." }),
    Z(11, "palisade", "The Palisade", ["goblin", "ashwraith"], "stakelord", 70, { blurb: "Sharpened stakes, facing outward. Somebody is keeping something in." }),
    Z(12, "heartwood", "Heartwood", ["elderling", "goblin"], "heartwood_elder", 80, { blurb: "The middle of the forest, and the oldest thing in it." }),
];

// ── DIFFICULTY ───────────────────────────────────────────────────────────────────────────────────────────────
// Luke: "Enemies grow in difficulty as you progress each node and map. They grow in damage and health."
//
// The per-enemy hp/dmg above are the zone-1 baseline for that creature; this is the climb applied on top, so a
// Thornling in the Fernway and a Thornling at Bramblewall are the same animal at different depths.
export const GROVE_SCALE = { hpPerZone: 0.11, dmgPerZone: 0.08 };

export function scaledFoe(enemyId, zoneN) {
    const base = GROVE_ENEMIES[enemyId];
    if (!base) return null;
    const z = Math.max(0, (Number(zoneN) || 1) - 1);
    const hpMult = 1 + GROVE_SCALE.hpPerZone * z;
    const dmgMult = 1 + GROVE_SCALE.dmgPerZone * z;
    return {
        ...base,
        hp: Math.round(base.hp * hpMult),
        dmg: [Math.round(base.dmg[0] * dmgMult), Math.round(base.dmg[1] * dmgMult)],
    };
}

// ── POPULATION ───────────────────────────────────────────────────────────────────────────────────────────────
// Luke: "15 to 30 enemies, fully replenishing every 45 seconds."
export const GROVE_POP = { min: 15, max: 30, respawnMs: 45_000 };

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
    if (GROVE_FOODS[id]) return `/images/grove/food-${id}.webp`;
    return null;
};
