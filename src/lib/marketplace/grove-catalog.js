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
    husk: E("husk", "Straw Walker", null, {
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
    goblin: E("goblin", "Palisade Goblin", null, {
        passive: false, hp: 455, dmg: [26, 39], telegraph: 560,
        emblem: "em_goblin", emblemChance: 0.0016,
        loot: [{ part: "goblin_rivet", n: [1, 3], w: 70 }, { part: "ash_ember", n: [1, 1], w: 30 }],
    }),
    elderling: E("elderling", "Elderling", null, {
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
export const GROVE_RARE = {
    id: "crystal_stag",
    name: "The Crystal Stag",
    art: null, // needs drawing — nothing in the catalogue is a crystal forest beast
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

// ── THE TWELVE ZONES ─────────────────────────────────────────────────────────────────────────────────────────
// ⚠️ `toUnlock` IS A KILL COUNT, NOT A BOSS. The area opens on kills, exactly as Luke described it; the boss
// is what ENDS the zone, not what gates the next one. Two different jobs.
//
// `enemies` is the mix that wanders the zone — some zones carry two types, which is what stops the middle of
// the map feeling like one long corridor.
const Z = (n, id, name, enemies, boss, toUnlock, o = {}) =>
    ({ n, id, name, enemies, boss, toUnlock, bg: `/images/grove/zone-${id}.webp`, ...o });

export const GROVE_ZONES = [
    Z(1, "thicket", "Thicket Edge", ["rootrat"], "rootrat", 20, { blurb: "Where the trees start. Nothing here has noticed you yet." }),
    Z(2, "hollow", "Mossy Hollow", ["grub"], "grub", 25, { blurb: "Wet underfoot and quiet. Something is eating the deadfall." }),
    Z(3, "fernway", "The Fernway", ["rootrat", "thornling"], "thornling", 30, { blurb: "Head-high ferns, and the first thing that hits back." }),
    Z(4, "oldstand", "The Old Stand", ["badger"], "badger", 35, { blurb: "Big trunks, old roots, and something that lives under them." }),
    Z(5, "bramble", "Bramblewall", ["thornling", "gourdling"], "gourdling", 40, { blurb: "A wall of thorn somebody planted on purpose." }),
    Z(6, "stubble", "The Stubble Field", ["husk"], "husk", 45, { blurb: "Cut stalks to the horizon. Some of them walk." }),
    Z(7, "barrows", "The Barrows", ["barrowhound", "husk"], "barrowhound", 50, { blurb: "Mounds in rows. The rows are deliberate." }),
    Z(8, "warren", "The Warren", ["warren_mother", "barrowhound"], "warren_mother", 55, { blurb: "Down, and then further down. Something spins in the dark." }),
    Z(9, "mothlight", "Mothlight", ["voidmoth"], "voidmoth", 60, { blurb: "A clearing lit from the air by wings." }),
    Z(10, "rotwood", "Rotwood", ["ashwraith", "voidmoth"], "ashwraith", 65, { blurb: "The trees burned a long time ago and never went out." }),
    Z(11, "palisade", "The Palisade", ["goblin", "ashwraith"], "goblin", 70, { blurb: "Sharpened stakes, facing outward. Somebody is keeping something in." }),
    Z(12, "heartwood", "Heartwood", ["elderling", "goblin"], "elderling", 80, { blurb: "The middle of the forest, and the oldest thing in it." }),
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
export const grovePart = (id) => GROVE_PARTS[id] || null;
