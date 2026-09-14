// ── THE TWENTY-FIVE ISLANDS ──────────────────────────────────────────────────────────────────────────────────
// Luke: "the chart you get is something you open and solve, and it would only take 30 seconds to get there,
// and have unique fights on the way. Along with the idea of our boat landing ashore and being able to walk on
// unique islands."
//
// So a chart is no longer a coupon for a longer voyage. It is a PLACE — one of twenty-five, each with its own
// water, its own thing guarding it, its own ground underfoot and one thing you cannot get anywhere else.
//
// ⚠️ THE ISLAND IS FINITE AND THAT IS THE POINT. Five biomes, five islands each. You land on it, you walk it
// out in about two minutes, and walking it out is what ends the expedition. That is deliberately NOT the
// Forest next door — the wood is endless because its limiter is regrowth, and an island whose limiter is its
// own far shore is a different feeling: a thing you spend rather than a thing you visit. See [[the-forest]].
//
// PURE ON PURPOSE, like captains.js and ship-battle.js beside it: no database, no imports with side effects, so
// the whole archipelago can be walked in a simulator before a single pixel is drawn. island-world.js lays the
// ground out, chart-plot.js decides which island a chart names and how well you read it, and expedition.js is
// the only half that touches a row.

// ── THE FIVE WATERS ──────────────────────────────────────────────────────────────────────────────────────────
// A biome is the unit of ART, not just of flavour: every island in one shares its node sprites and its palette,
// which is the whole reason twenty-five islands cost five sets of props instead of twenty-five. Each island
// still gets its own backdrop and its own warden, so no two landfalls look alike — see scripts/gen-islands.mjs.
export const BIOMES = {
    coral: {
        id: "coral", name: "the Shallows",
        // What the sea looks like on the way in, and what the ground is once you are off the boat.
        water: "pale turquoise over white sand, so clear the anchor chain throws a shadow on the bottom",
        ground: "bone-white coral sand and dead brain-coral heads",
        tint: "#7fd6c8",
        // Landmarks the captains take their bearings off. Three are drawn per island — see landmarksFor.
        marks: ["the Drowned Bell", "Gallows Reef", "the Widow's Light", "Pilot's Cross",
            "the Hundred Teeth", "Anchor Rock", "the Green Channel", "the Bonebank"],
    },
    ash: {
        id: "ash", name: "the Cinders",
        water: "flat grey water carrying a skin of floating pumice, warm to the hand",
        ground: "black volcanic grit and cooled lava in broken slabs",
        tint: "#d4703f",
        marks: ["the Smoking Sister", "Cinder Point", "the Iron Stack", "Ember Reach",
            "the Furnace Door", "Slag Spit", "the Black Fume", "Ashfall Bar"],
    },
    drowned: {
        id: "drowned", name: "the Sunken Coast",
        water: "brown-green and slow, with rooftops and chimney pots standing out of it",
        ground: "silted flagstones and the tops of walls, ankle-deep at low water",
        tint: "#6f8fa8",
        marks: ["the Sunken Assize", "Bellmouth", "the Quiet Street", "Corwick Steeple",
            "the Standing Arch", "Low Harbour Wall", "the Counting House", "Drowned Mile"],
    },
    frost: {
        id: "frost", name: "the Long Cold",
        water: "black water with brash ice grinding along the hull the whole way in",
        ground: "blue shore-ice over grey shingle, and it moves under you",
        tint: "#8fb8d6",
        marks: ["the Blue Mouth", "Gullwinter Head", "the Rime Shoal", "Widow's Ice",
            "the Grinding Sound", "Frost Cairn", "the White Lead", "Cold Anchorage"],
    },
    green: {
        id: "green", name: "the Fever Coast",
        water: "still green water under overhanging canopy, and nothing on it moves",
        ground: "rotted leaf-mould, root buttresses and standing water",
        tint: "#6fa85f",
        marks: ["the Overgrown Charter", "Mother's Thicket", "the Fever Coast", "Greenrot Head",
            "the Strangler Fig", "Rot Creek", "the Last Green Thing", "Canopy Gap"],
    },
};
export const BIOME_IDS = Object.keys(BIOMES);

// ── WHAT IS ON THE GROUND ────────────────────────────────────────────────────────────────────────────────────
// One vocabulary across all twenty-five, biome-flavoured by art rather than by rules. A node kind is a VERB —
// what you do when you walk up to it — and there are deliberately few of them: an island where every third step
// is a different interaction is a menu, not a walk.
//
// ⚠️ `dig` IS THE OLD MINIGAME, KEPT. The excavation board is good and it is already built; what was wrong was
// that it WAS the island. Here it is one thing you find on the island, which is what Luke meant by "eventually
// we replace the voyage stuff with this" — the dig survives the succession, the 16-hour wait does not.
export const NODE_KINDS = {
    empty:  { id: "empty",  name: "", walk: true },
    dig:    { id: "dig",    name: "A dig site",       blurb: "Ground that has been disturbed, and not by weather." },
    wreck:  { id: "wreck",  name: "A wreck",          blurb: "Somebody else's expedition, further along than yours." },
    cache:  { id: "cache",  name: "A cache",          blurb: "Buried shallow and in a hurry." },
    forage: { id: "forage", name: "Growth",           blurb: "Something worth the carrying grows here." },
    shrine: { id: "shrine", name: "A shrine",         blurb: "Older than anyone who ever charted this." },
    warden: { id: "warden", name: "Something ashore", blurb: "It was here before you and it has noticed." },
    fix:    { id: "fix",    name: "The mark",         blurb: "This is the place he named." },
};
export const NODE_IDS = Object.keys(NODE_KINDS);

// ── THE ISLANDS ──────────────────────────────────────────────────────────────────────────────────────────────
// `rung` is the only difficulty number and it orders the whole archipelago 1..25. It decides nothing on its own
// — chart-plot.js uses it to pick which island a grade of chart can name, and the warden reads it for tier — so
// a new island slots in by rung and nothing else has to be told about it.
//
// `span` is how many nodes wide the island is. Two minutes of walking is roughly forty nodes at the pace the
// Forest settled on, and the bigger ones are bigger because there is more on them, never because they are
// longer walks between the same things.
//
// `prize` is THE ONE THING YOU CANNOT GET ANYWHERE ELSE. It sits on the `fix` node — the X — and it is the
// entire reason to sail to this island rather than the one beside it. Twenty-five islands with the same chest
// on all of them is one island with twenty-five backdrops.
const I = (rung, id, name, biome, span, blurb, prize) => ({ rung, id, name, biome, span, blurb, prize });

export const ISLANDS = [
    // ── THE SHALLOWS ── warm, shallow, and the cheapest place a captain can send you.
    I(1,  "tallow_key",       "Tallow Key",            "coral", 34, "A sandbar with three palms and the remains of somebody's very bad idea.", "candle_coral"),
    I(2,  "hundred_shallows", "The Hundred Shallows",  "coral", 36, "Not one island. Ninety-odd, and the tide decides how many there are today.", "tide_pearl"),
    I(3,  "pilots_mistake",   "Pilot's Mistake",       "coral", 38, "Named for the man who put four ships on it before anyone thought to write it down.", "pilot_glass"),
    I(4,  "sugarbone",        "Sugarbone",             "coral", 40, "White the whole way across, and none of it is sand.", "sugarbone_scrim"),
    I(5,  "lending_reef",     "The Lending Reef",      "coral", 42, "It gives things back. Rarely the things you lost.", "lent_thing"),

    // ── THE CINDERS ── still warm underfoot. Everything here is either burnt or about to be.
    I(6,  "cinderfall",       "Cinderfall",            "ash",   36, "Black grit to the waterline and a haze that never quite lifts.", "cinder_glass"),
    I(7,  "smoking_sister",   "The Smoking Sister",    "ash",   38, "One of two. The other one stopped smoking a long time ago.", "sister_ash"),
    I(8,  "blacksand_bar",    "Blacksand Bar",         "ash",   40, "A mile of beach that will take the soles off your boots.", "slag_ingot"),
    I(9,  "ember_hold",       "Ember Hold",            "ash",   43, "Somebody built here on purpose, which says more about them than it does about the island.", "hold_key"),
    I(10, "furnace_door",     "The Furnace Door",      "ash",   45, "A cleft in the rock that breathes out, warm, on a steady count.", "furnace_heart"),

    // ── THE SUNKEN COAST ── a town under the water, and you walk on its rooftops.
    I(11, "low_harbour",      "Low Harbour",           "drowned", 38, "The harbour wall still stands. It is holding back nothing at all now.", "harbour_seal"),
    I(12, "sunken_assize",    "The Sunken Assize",     "drowned", 41, "Court was in session. The records are still down there, in order.", "assize_writ"),
    I(13, "bellmouth",        "Bellmouth",             "drowned", 43, "At the turn of the tide you can hear it, and nobody is ringing it.", "drowned_bell"),
    I(14, "drowned_corwick",  "Drowned Corwick",       "drowned", 45, "Eleven hundred people. The chart still lists it as a port of call.", "corwick_ledger"),
    I(15, "quiet_street",     "The Quiet Street",      "drowned", 47, "Doors, windows, a cobbled run of it, and six feet of green water.", "street_lamp"),

    // ── THE LONG COLD ── the ice moves while you are standing on it.
    I(16, "gullwinter",       "Gullwinter",            "frost", 41, "The birds leave in the autumn. Nothing replaces them.", "winter_gull"),
    I(17, "blue_mouth",       "The Blue Mouth",        "frost", 44, "A cave in the ice shelf, and the blue goes down further than the light does.", "blue_core"),
    I(18, "rime_shoal",       "Rime Shoal",            "frost", 46, "Shallow, frozen, and the shape of it is different every season.", "rime_shard"),
    I(19, "long_cold",        "The Long Cold",         "frost", 48, "Four months of dark a year, and the charts only cover the other eight.", "cold_iron"),
    I(20, "widows_ice",       "Widow's Ice",           "frost", 50, "Named by the ones who waited. Not by anyone who came back.", "widows_tear"),

    // ── THE FEVER COAST ── green, wet, and growing over the last people who tried this.
    I(21, "greenrot",         "Greenrot",              "green", 44, "Everything that has ever been left here is still here, under the leaf mould.", "rot_bloom"),
    I(22, "overgrown_charter","The Overgrown Charter", "green", 47, "Chartered, surveyed, laid out in streets. You can see two of them.", "charter_stone"),
    I(23, "mothers_thicket",  "Mother's Thicket",      "green", 49, "The thicket is one plant. It has been one plant for a very long time.", "mother_root"),
    I(24, "fever_coast",      "The Fever Coast",       "green", 51, "The whole crew agreed not to drink the water. Four of them did anyway.", "fever_resin"),
    I(25, "last_green_thing", "The Last Green Thing",  "green", 54, "Past it there is open water to the edge of every chart we have.", "green_heart"),
];

export const ISLAND_IDS = ISLANDS.map((i) => i.id);
export const islandById = (id) => ISLANDS.find((i) => i.id === String(id)) || null;
export const islandByRung = (rung) => ISLANDS.find((i) => i.rung === Number(rung)) || ISLANDS[0];
export const MAX_RUNG = ISLANDS.length;
export const biomeOf = (island) => BIOMES[island?.biome] || BIOMES.coral;

/** The island's backdrop. One per island — this is the thing that makes a landfall feel like a new place. */
export const islandArt = (id) => `/images/islands/${id}.webp`;
/** A node's prop. Shared across a biome, which is what keeps twenty-five islands affordable to draw. */
export const nodeArt = (biome, kind) => `/images/islands/props/${biome}-${kind}.png`;
/** The signature thing that only this island holds, sitting on the X. */
export const prizeArt = (id) => `/images/islands/prize/${id}.png`;

// ── WHAT LIES WHERE ──────────────────────────────────────────────────────────────────────────────────────────
// Node weights per biome. The shape is the same everywhere — most of an island is ground you walk over — and
// what changes is WHICH of the four worthwhile things is common here. That is the difference between the
// Shallows (you dig) and the Sunken Coast (you salvage), and it is a stronger identity than a palette swap.
//
// ⚠️ `empty` IS LOAD-BEARING AND MUST STAY HIGH. An island with something on every node is a corridor of
// buttons; the walk only reads as a walk if there is ground between the things. Same lesson as EMPTY_SHARE in
// forest-world.js, which sits at 0.12 for a wood you are moving through fast — an island you are searching
// wants more air than that, not less.
// ⚠️⚠️ `dig` IS DECLARED IN NODE_KINDS AND WEIGHTED AT ZERO EVERYWHERE, ON PURPOSE — DO NOT JUST TURN IT ON.
// The intent is that an island dig site opens the REAL excavation board, which is the thing that makes the dig
// survive the succession instead of being replaced by it. But that board is welded to the voyage lifecycle:
// beginDig refuses unless status is "arrived", it writes mkt_sailing.dig_state, and finishDig CLEARS THE
// VOYAGE and pays off the voyage's own quality. Opening it from an island needs finishDig to learn a second
// way to end, and that is surgery on the single most-played path in the game.
//
// So it is a seam, marked and left cold, rather than a half-wired node that pays the wrong thing. The island
// has five other verbs and does not need this one to be good. Wiring it is its own pass:
//   1. an `island` flag on the board object newBoard() returns
//   2. a branch at the top of finishDig that pays through expedition.js and leaves the voyage alone
//   3. beginDig split into "build a board" and "start a voyage dig"
// Until all three exist, these stay 0.
export const NODE_WEIGHTS = {
    coral:   { empty: 52, dig: 0, wreck: 16, cache: 17, forage: 10, shrine: 3, warden: 2 },
    ash:     { empty: 52, dig: 0, wreck: 13, cache: 15, forage: 15, shrine: 3, warden: 2 },
    drowned: { empty: 51, dig: 0, wreck: 29, cache: 13, forage: 3,  shrine: 2, warden: 2 },
    frost:   { empty: 53, dig: 0, wreck: 19, cache: 14, forage: 8,  shrine: 4, warden: 2 },
    green:   { empty: 50, dig: 0, wreck: 14, cache: 15, forage: 16, shrine: 3, warden: 2 },
};

// ── AND HOW RICH ITS WATER IS ────────────────────────────────────────────────────────────────────────────────
// ⚠️ BIOME IS FLAVOUR; RUNG IS MONEY. The weights above are an identity — the Sunken Coast is where you salvage
// and the Fever Coast is where you forage — and an identity must not smuggle in a pay rise. It did: wrecks are
// the richest node, drowned has a quarter of them, and the simulator showed rung 13 Bellmouth out-earning rung
// 17 The Blue Mouth by a comfortable margin. An archipelago that pays MORE four rungs down makes the captain's
// star rating, which is the whole of Luke's original captains idea, decoration.
//
// So each biome carries the multiplier that flattens its own mix back onto the same per-node curve. On a coast
// made of wrecks an individual wreck is less of an event, which is also just true.
export const RICHNESS = { coral: 1, ash: 0.95, drowned: 0.6, frost: 0.85, green: 0.88 };
export const richnessOf = (island) => RICHNESS[island?.biome] ?? 1;

// ── THE SIGNATURE PRIZES ─────────────────────────────────────────────────────────────────────────────────────
// One per island, sitting on the X and nowhere else in the game. `kind` says what it pays through — the
// existing systems, every one of them, because a new currency for a new feature is a new thing to balance.
//   stone      → a pet ascension stone, declared in STONE_SOURCES (see [[pet-enshrinement-stones]])
//   part       → forge parts at a tier
//   chest      → a chest of a tier, through addChests like everything else
//   consumable → an existing consumable id
// How MUCH is decided by rung in expedition.js; what is authored here is WHAT, never how much.
export const PRIZES = {
    candle_coral:    { name: "Candle Coral",       kind: "chest",      tier: "iron",   blurb: "It burns underwater. Nobody has a use for that yet." },
    tide_pearl:      { name: "A Tide Pearl",       kind: "part",       tier: 3,        blurb: "Grown around a splinter of somebody's hull." },
    pilot_glass:     { name: "Pilot's Glass",      kind: "consumable", id: "spin_lucky_coin", blurb: "Cracked across, and it still finds the channel." },
    sugarbone_scrim: { name: "Sugarbone Scrim",    kind: "chest",      tier: "gold",   blurb: "Scratched all over with a coastline that is not this one." },
    lent_thing:      { name: "The Lent Thing",     kind: "stone",      blurb: "It was somebody's. The reef is done with it." },
    cinder_glass:    { name: "Cinder Glass",       kind: "part",       tier: 3,        blurb: "Lightning struck the black sand and left this standing in it." },
    sister_ash:      { name: "Sister Ash",         kind: "chest",      tier: "gold",   blurb: "Grey, fine, and warm days after you bag it." },
    slag_ingot:      { name: "A Slag Ingot",       kind: "part",       tier: 4,        blurb: "Poured by no one, into a mould that was a footprint." },
    hold_key:        { name: "The Hold Key",       kind: "chest",      tier: "mythic", blurb: "It fits something. Not anything on this island." },
    furnace_heart:   { name: "A Furnace Heart",    kind: "stone",      blurb: "The cleft breathes on a count, and this is what is counting." },
    harbour_seal:    { name: "The Harbour Seal",   kind: "part",       tier: 4,        blurb: "Brass, and still legible. The port it authorises is underwater." },
    assize_writ:     { name: "An Assize Writ",     kind: "chest",      tier: "gold",   blurb: "A judgement nobody ever got to hear read out." },
    drowned_bell:    { name: "The Drowned Bell",   kind: "stone",      blurb: "It is not in the tower any more and it is still ringing." },
    corwick_ledger:  { name: "Corwick's Ledger",   kind: "chest",      tier: "mythic", blurb: "Eleven hundred names, and a column for what each one was owed." },
    street_lamp:     { name: "The Street Lamp",    kind: "consumable", id: "stone_storm", blurb: "Lit. Six feet down, in green water, lit." },
    winter_gull:     { name: "A Winter Gull",      kind: "part",       tier: 4,        blurb: "The one that stayed. It is not a gull any more." },
    blue_core:       { name: "The Blue Core",      kind: "stone",      blurb: "Cut out of the deepest part of the cave and it has not melted." },
    rime_shard:      { name: "A Rime Shard",       kind: "chest",      tier: "mythic", blurb: "Frozen around a moment that has not finished happening." },
    cold_iron:       { name: "Cold Iron",          kind: "part",       tier: 5,        blurb: "Four months of dark went into this and you can feel all of them." },
    widows_tear:     { name: "A Widow's Tear",     kind: "stone",      blurb: "The ice is full of them. They are all the same size." },
    rot_bloom:       { name: "A Rot Bloom",        kind: "consumable", id: "treat_bone", blurb: "It only flowers on top of something that was buried badly." },
    charter_stone:   { name: "The Charter Stone",  kind: "chest",      tier: "mythic", blurb: "The boundary marker of a town that got two streets in." },
    mother_root:     { name: "Mother Root",        kind: "stone",      blurb: "Cut it and the whole island flinches." },
    fever_resin:     { name: "Fever Resin",        kind: "part",       tier: 5,        blurb: "The four who drank the water were right about one thing." },
    green_heart:     { name: "The Green Heart",    kind: "stone",      blurb: "Past this there is open water to the edge of every chart we have." },
};
export const prizeFor = (island) => ({ id: island?.prize, ...(PRIZES[island?.prize] || {}) });

// ── WHICH LANDMARKS THIS ISLAND IS FIXED BY ──────────────────────────────────────────────────────────────────
// Three, drawn from its own biome's pool, so the bearings on a chart to Bellmouth are taken off drowned things
// and never off a reef. Deterministic on the island's own rung alone — the same island is always fixed by the
// same three marks, because a landmark that moves between charts is not a landmark.
// ⚠️ THE STRIDE MUST BE COPRIME WITH THE POOL. The first cut of this stepped by `k * 3 + k` — 0, 4, 8 — against
// an eight-long pool, and 8 mod 8 is 0, so the third mark was always the first mark again. Every one-star chart
// in the simulator was fixed by two landmarks and a repeat of one of them, which is not a fix at all: two rings
// round the same point never cross twice. Caught by scripts/island-sim.mjs printing a real chart's words out.
// Stride 3 against 8 is coprime, so the three marks are always distinct.
//
// ⚠️ AND AN ISLAND IS NEVER ITS OWN LANDMARK. Several sea-marks in a biome pool ARE islands in that biome —
// Bellmouth is a place you sail to and a thing you take a bearing off — so the draw has to exclude the island
// being fixed, or a chart reads "nineteen leagues from the Overgrown Charter" about the Overgrown Charter. The
// sim printed exactly that on a five-star chart. A ring of radius zero round the answer is not a clue, it is
// the answer, and it would make the best charts in the game the only trivial ones.
const bareName = (s) => String(s || "").toLowerCase().replace(/^the\s+/, "").trim();

export function landmarksFor(island) {
    const self = bareName(island?.name);
    const pool = biomeOf(island).marks.filter((m) => bareName(m) !== self);
    const base = (island?.rung || 1) * 3;
    // Stride 3 is coprime with both 7 and 8, which are the only lengths this pool can now be.
    return [0, 1, 2].map((k) => pool[(base + k * 3) % pool.length]);
}

/** Everything a screen needs to draw an island without reaching for four tables. */
export function islandCard(id) {
    const isle = islandById(id);
    if (!isle) return null;
    const biome = biomeOf(isle);
    return {
        id: isle.id, name: isle.name, rung: isle.rung, span: isle.span, blurb: isle.blurb,
        biome: biome.id, biomeName: biome.name, water: biome.water, ground: biome.ground, tint: biome.tint,
        art: islandArt(isle.id), marks: landmarksFor(isle),
        prize: { ...prizeFor(isle), art: prizeArt(isle.id) },
    };
}
