// ── THE TWELVE MAPS: PLACES FIRST, THEN WHAT LIVES THERE, THEN WHAT IT DROPS ─────────────────────────────────
// Luke: "Seems odd we designed recipes and items for unknown zones and unknown creatures. First start with the
// zones, thematically they should all make sense and progress. The further along you get the more intense and
// challenging the biome. And the creatures should fit these biomes. Then we can figure out thematically what
// ingredients should drop for each of these. Then we can make the lineage to the tools."
//
// He is right, and the first version of this file was built in exactly the wrong order: materials invented to
// fill eight roles, for places that did not exist, dropped by nothing. A Comet Thread with no comet.
//
// So the order here is the order of the world:
//
//   1. THE MAP      a place, and where it sits in a climb from a wood you can walk into to the edge of the sky
//   2. ITS ZONES    twelve of them, each a specific spot in that place, with its own ground underfoot
//   3. ITS CREATURES what lives there — and it must be able to live THERE, not merely be scaled to it
//   4. ITS PARTS    what comes off those creatures, which is the only honest way a material gets into a bag
//   5. ITS TOOLS    the twelve rungs, built from those parts by role (see TOOL_ROLES)
//
// ⚠️ MAP ONE IS NOT IN HERE. The Grove is hand-authored in grove-catalog.js — zones, creatures, bosses, parts
// and recipes, written one at a time and balanced against real members. This file is maps two to twelve, and
// it generates what map one states, which is why the two never disagree: the catalogue merges them.
//
// ── THE CLIMB ────────────────────────────────────────────────────────────────────────────────────────────────
// Each map is harder than the last and the reason is the PLACE, not a multiplier. The forest is close and
// cluttered; the cave is dark and narrow; the fen takes your footing; the coast throws weather at you; the
// ruins take the ground away entirely. By the Rim the environment itself is the fight.
//
//   1  The Grove            a wood at the edge of the shop's world       (built in grove-catalog.js)
//   2  The Undercave        under the roots, where light is a fungus
//   3  The Sunken Fen       standing water, rot, and things that wait
//   4  The Saltwrack Coast  a shore of wrecks, and weather off the sea
//   5  The Drowned Ruins    a city that lost its argument with the water
//   6  The Gilded Waste     heat, distance, and nothing to drink
//   7  The Ashen Reach      the ground still burning under the crust
//   8  The Thunder Steppe   open grass with the sky hunting across it
//   9  The Frostmere        cold that is itself the enemy
//  10  The Glass Peaks      thin air, hard light, a long way down
//  11  The Rotgarden        something cultivated that got out
//  12  The Starfall Rim     the edge, where things land that were never up there

/** The eight jobs a material can do. Every map names one material for each. */
export const ROLES = ["edge", "haft", "bind", "hide", "ember", "glow", "stone", "charm"];

// ── WHAT EACH TOOL IS, IN ROLES ──────────────────────────────────────────────────────────────────────────────
// Three roles per tool, no two alike, each readable as an object: a horn is an ember's heat, a stone's weight
// and a hide strap. The first role is what it is mostly made of and takes the largest count.
export const TOOL_ROLES = {
    rod: ["haft", "bind", "charm"],
    pick: ["edge", "haft", "hide"],
    shovel: ["edge", "stone", "bind"],
    hammer: ["stone", "ember", "haft"],
    hoe: ["edge", "bind", "hide"],
    sextant: ["glow", "charm", "stone"],
    knife: ["edge", "haft", "bind"],
    collar: ["bind", "hide", "charm"],
    lantern: ["glow", "ember", "bind"],
    loupe: ["stone", "glow", "edge"],
    banner: ["haft", "hide", "ember"],
    horn: ["ember", "stone", "hide"],
};

// Six of the main material, five of the second, four of the third, climbing 10% a map. The BONUS stays flat at
// +3% a tier: a curve that paid more per rung as it cost more per rung makes the first six pointless and the
// last six mandatory.
const BASE_COUNTS = [6, 5, 4];
export const tierCount = (slot, i, mapN) => Math.round(BASE_COUNTS[i] * (1 + (Math.max(1, mapN) - 1) * 0.1));

// ── CREATURE ARCHETYPES ──────────────────────────────────────────────────────────────────────────────────────
// ⚠️ THESE ARE BASELINES AT DEPTH 1, exactly like map one's. scaledFoe multiplies them by GROVE_SCALE for the
// depth the creature actually stands at, so a Fen Leech's numbers here look like a Rootrat's and fight like
// the twenty-seventh zone of the world. Writing "big numbers for a deep map" here would double-count the
// climb — the mistake the curve note in grove-catalog.js exists to prevent.
//
// The archetype is how it FIGHTS, which is the half a biome should decide: a cave swarms, a steppe charges,
// a frozen mere waits for you to come to it.
const ARCH = {
    //                       passive  hp    dmg          telegraph
    swarm: { passive: true, hp: 760, dmg: [60, 94], telegraph: 0 },
    grazer: { passive: true, hp: 980, dmg: [66, 100], telegraph: 0 },
    striker: { passive: false, hp: 880, dmg: [78, 116], telegraph: 620 },
    stalker: { passive: false, hp: 940, dmg: [84, 124], telegraph: 700 },
    brute: { passive: false, hp: 1320, dmg: [96, 142], telegraph: 900 },
    caster: { passive: false, hp: 820, dmg: [88, 130], telegraph: 820 },
};

const P = (id, name, role, tier, blurb) => ({ id, name, role, tier, blurb });
const C = (id, name, arch, blurb) => ({ id, name, arch, blurb });
const Z = (id, name, biome, foes, bossId, bossName, blurb) => ({ id, name, biome, foes, bossId, bossName, blurb });

// ── THE MAPS ─────────────────────────────────────────────────────────────────────────────────────────────────
// `parts` is twelve materials, one per role plus four doubling up, so a zone has something of its own to drop.
// `creatures` is twelve, one per zone as its resident, several of which wander into their neighbours.
// `zones` is twelve spots in that place, in the order you walk them, each naming its residents and its boss.
export const GROVE_MAPS = [
    { n: 1, id: "grove", short: "Rootwood", name: "The Grove", blurb: "Where the trees start. Nothing here has noticed you yet.", parts: null },

    {
        n: 2, id: "undercave", short: "Undercave", name: "The Undercave",
        blurb: "Under the roots, where the light is something that grows.",
        emblem: { id: "em_undercave", name: "The Blind Mark", stat: "armour", per: 2, kind: "flat" },
        parts: [
            P("flint_shard", "Flint Shard", "edge", 1, "Came off the wall already sharp."),
            P("mushroom_stalk", "Mushroom Stalk", "haft", 1, "Dense as wood and lighter than it looks."),
            P("cave_sinew", "Cave Sinew", "bind", 2, "Pulled from something that never needed eyes."),
            P("batskin", "Batskin", "hide", 2, "Thin, tough, still faintly warm."),
            P("coal_nub", "Coal Nub", "ember", 3, "A seam of it runs under the whole cave."),
            P("glowspore", "Glowspore", "glow", 4, "Shake the cap and the dark goes green."),
            P("drip_stone", "Dripstone", "stone", 3, "Ten thousand years of one slow drop."),
            P("blind_eye", "The Blind Eye", "charm", 6, "Milk white, and it tracks you across the room."),
            P("shale_flake", "Shale Flake", "edge", 1, "Splits along a line you can see first."),
            P("root_tendril", "Root Tendril", "bind", 2, "A tree up there is reaching further than it should."),
            P("moleskin", "Moleskin", "hide", 2, "Nap in every direction, so it never catches."),
            P("lumen_cap", "Lumen Cap", "glow", 4, "Picked in the dark by the light of itself."),
        ],
        creatures: [
            C("cave_crawler", "Cave Crawler", "swarm", "Flat, pale, and there are always more."),
            C("stalk_hopper", "Stalk Hopper", "swarm", "Lives in the mushroom stands and leaves when you do."),
            C("sinew_spider", "Sinew Spider", "striker", "Strings the narrow places and waits at the edge."),
            C("roostbat", "Roostbat", "striker", "Comes off the ceiling in a group and goes back up."),
            C("coalback", "Coalback", "brute", "Eats the seam. Glows faintly along the spine."),
            C("sporemoth", "Sporemoth", "caster", "Puffs a cloud and lets the cloud do it."),
            C("dripstone_lurker", "Dripstone Lurker", "stalker", "Looks like the floor until the floor moves."),
            C("blind_warden", "Blind Warden", "stalker", "No eyes. Has not needed them down here for a long time."),
            C("shale_biter", "Shale Biter", "swarm", "Chews rock and spits the sharp half at you."),
            C("tendril_creeper", "Tendril Creeper", "grazer", "Root that learned to pull itself along."),
            C("molewarden", "Molewarden", "brute", "Comes up under you, which is the whole trick."),
            C("lumen_drifter", "Lumen Drifter", "caster", "Drifts, lights the hall, and burns what comes close."),
        ],
        zones: [
            Z("rootfall", "Rootfall", "burrow", [0], "gulletmaw", "Gulletmaw", "Where the forest floor gives way and the roots hang through."),
            Z("stalkfield", "The Stalk Field", "burrow", [1, 0], "capmother", "The Cap Mother", "Mushrooms taller than you, in rows nobody planted."),
            Z("narrows", "The Narrows", "stone", [2], "silkthroat", "Silkthroat", "Shoulder width for sixty feet. Something lives in the gap."),
            Z("roost", "The Roost", "stone", [3, 2], "nightroost", "The Nightroost", "The ceiling moves when your light does."),
            Z("coalseam", "The Coal Seam", "stone", [4], "cinderback", "Cinderback", "Black walls, warm to the hand, and the air tastes of it."),
            Z("sporehall", "The Spore Hall", "glow", [5, 1], "sporecrown", "The Spore Crown", "Lit green from below. Breathing is a decision here."),
            Z("dripworks", "The Dripworks", "stone", [6], "stonejaw", "Stonejaw", "Columns grown from the floor up to meet the ones coming down."),
            Z("blindgallery", "The Blind Gallery", "burrow", [7, 6], "the_unseeing", "The Unseeing", "No glow at all for a hundred paces. Nothing here uses light."),
            Z("shalestep", "Shalestep", "stone", [8], "flintmother", "The Flint Mother", "Every step breaks and every break is an edge."),
            Z("tendrilway", "The Tendril Way", "burrow", [9, 8], "the_reacher", "The Reacher", "The forest's roots, this far down, and still going."),
            Z("molewarrens", "The Mole Warrens", "burrow", [10, 9], "diggerking", "The Digger King", "Tunnels crossing tunnels, all of them fresh."),
            Z("lumenvault", "The Lumen Vault", "glow", [11, 7], "the_lantern_below", "The Lantern Below", "The deepest hall, and the brightest, which nobody can explain."),
        ],
    },

    {
        n: 3, id: "fen", short: "Fen", name: "The Sunken Fen",
        blurb: "Wet to the knee and quiet, which is the part that should worry you.",
        emblem: { id: "em_fen", name: "The Drowned Mark", stat: "vitality", per: 3, kind: "flat" },
        parts: [
            P("reed_blade", "Reed Blade", "edge", 1, "Sharp enough to open a hand on the way past."),
            P("bog_oak", "Bog Oak", "haft", 1, "Black as iron and about as forgiving."),
            P("weed_cord", "Weed Cord", "bind", 2, "Dries tighter than it was tied."),
            P("toadskin", "Toadskin", "hide", 2, "Waterproof, and never stops feeling damp."),
            P("marsh_gas", "Marsh Gas", "ember", 3, "Bottled badly. Treat it as undecided."),
            P("willow_light", "Willow Light", "glow", 4, "The pale fire that walks the water at night."),
            P("peat_stone", "Peat Stone", "stone", 3, "Cut, stacked, dried. Burns for a day."),
            P("drowned_charm", "The Drowned Charm", "charm", 6, "Somebody wore this before the water came."),
            P("shell_chip", "Shell Chip", "edge", 1, "Nacre on one side, a razor on the other."),
            P("vine_rope", "Vine Rope", "bind", 2, "Already the right length, which is the unsettling part."),
            P("heron_down", "Heron Down", "hide", 2, "Warm out of all proportion to its weight."),
            P("fen_wisp", "Fen Wisp", "glow", 4, "Jarred, and still trying to lead you off the path."),
        ],
        creatures: [
            C("reed_slicer", "Reed Slicer", "swarm", "Moves through the reeds without parting them."),
            C("bog_walker", "Bog Walker", "brute", "Waterlogged wood that stands up when you pass."),
            C("weedcoil", "Weedcoil", "stalker", "Takes the ankle first. Everything after that is downhill."),
            C("marsh_toad", "Marsh Toad", "grazer", "Enormous, placid, and it does not miss."),
            C("gasbloom", "Gasbloom", "caster", "Swells, drifts closer, and lets go."),
            C("willow_wisp", "Willow Wisp", "caster", "Leads. It has led a lot of people."),
            C("peat_hulk", "Peat Hulk", "brute", "A century of compressed bog, walking."),
            C("drowned_thing", "The Drowned", "stalker", "Still wearing what it went in wearing."),
            C("shellback", "Shellback", "grazer", "Armoured, slow, and worth the trouble."),
            C("vine_lasher", "Vine Lasher", "striker", "Whips from three body-lengths away."),
            C("fen_heron", "Fen Heron", "striker", "One step, one strike, no warning in between."),
            C("wisp_mother", "Wisp Mother", "caster", "Where the lights come from, and they all go back."),
        ],
        zones: [
            Z("reedline", "The Reed Line", "field", [0], "the_cutter", "The Cutter", "Where the ground stops being ground."),
            Z("blackwater", "Blackwater", "moss", [1, 0], "oakdrowner", "The Oak Drowner", "Still, black, and deeper than the pole you brought."),
            Z("coilbed", "The Coil Bed", "moss", [2], "greatcoil", "The Great Coil", "Weed thick enough to walk on, once."),
            Z("toadmire", "Toadmire", "moss", [3, 2], "bellowmaw", "Bellowmaw", "You hear this zone a mile before you reach it."),
            Z("gasflats", "The Gas Flats", "field", [4], "the_bloom", "The Bloom", "Bubbles the whole way across. Do not bring a torch."),
            Z("wisplight", "Wisplight", "glow", [5], "lanternmire", "Lanternmire", "Lit beautifully, by things that want you further in."),
            Z("peatcuts", "The Peat Cuts", "burrow", [6, 1], "the_stack", "The Stack", "Somebody worked here. The cuts are still square."),
            Z("sunkenrow", "Sunken Row", "moss", [7], "the_tenant", "The Tenant", "Rooflines under the water, in a line, like a street."),
            Z("shellbank", "The Shell Bank", "stone", [8], "greatshell", "Greatshell", "A bank of them, waist high, going back for ever."),
            Z("lashing", "The Lashing", "bramble", [9, 2], "the_whip", "The Whip", "Nothing grows straight here and all of it reaches."),
            Z("heronwade", "The Heron Wade", "field", [10, 9], "longstride", "Longstride", "Knee-deep water, and a hundred things standing perfectly still."),
            Z("mothermire", "Mothermire", "glow", [11, 5], "the_wisp_mother", "The Wisp Mother", "The middle of the fen, where the lights are born."),
        ],
    },

    {
        n: 4, id: "saltwrack", short: "Saltwrack", name: "The Saltwrack Coast",
        blurb: "Everything the sea did not want, arranged in a line.",
        emblem: { id: "em_saltwrack", name: "The Wrack Mark", stat: "move_speed", per: 1.0, kind: "pct" },
        parts: [
            P("oyster_edge", "Oyster Edge", "edge", 1, "Opens a hand as easily as it opens itself."),
            P("driftwood", "Driftwood", "haft", 1, "Smoothed by a thousand miles of going nowhere."),
            P("kelp_cord", "Kelp Cord", "bind", 2, "Plaited wet so it grips when it dries."),
            P("sealhide", "Sealhide", "hide", 2, "The warmest thing on the beach."),
            P("storm_salt", "Storm Salt", "ember", 3, "Thrown on a fire it goes green and keeps going."),
            P("pearl_light", "Pearl Light", "glow", 4, "A pearl that was never in a shell."),
            P("tide_stone", "Tide Stone", "stone", 3, "Holed straight through by patience."),
            P("sailor_knot", "The Sailor's Knot", "charm", 6, "Tied by somebody who did not come back."),
            P("urchin_spine", "Urchin Spine", "edge", 1, "Barbed the wrong way, as everything here is."),
            P("net_twine", "Net Twine", "bind", 2, "Salvaged off a wreck and still smelling of it."),
            P("gullskin", "Gullskin", "hide", 2, "Oiled by the bird. Nothing wets it."),
            P("foam_glow", "Foam Glow", "glow", 4, "The light in the surf on a black night, scooped up."),
        ],
        creatures: [
            C("shellpicker", "Shellpicker", "swarm", "Works the tideline and resents company."),
            C("driftlurk", "Driftlurk", "stalker", "Is a log until it is not a log."),
            C("kelp_hauler", "Kelp Hauler", "brute", "Drags half the bay behind it."),
            C("rock_seal", "Rock Seal", "grazer", "Enormous and entirely uninterested until it is."),
            C("salt_wraith", "Salt Wraith", "caster", "Dry spray that goes for the eyes."),
            C("pearl_diver", "Pearl Diver", "striker", "Comes out of the water at your knees."),
            C("tidewarden", "Tidewarden", "brute", "Stands where the water does and does not move."),
            C("wreck_hand", "Wreck Hand", "stalker", "Still working the rigging of a ship that is gone."),
            C("urchin_roller", "Urchin Roller", "swarm", "Rolls downhill at you and means it."),
            C("net_caster", "Net Caster", "caster", "Throws. Rarely misses. Pulls."),
            C("storm_gull", "Storm Gull", "striker", "Comes in on the wind with the wind behind it."),
            C("foamborn", "Foamborn", "caster", "Made of the surf line, briefly, repeatedly."),
        ],
        zones: [
            Z("tideline", "The Tideline", "field", [0], "the_picker", "The Great Picker", "Wet sand, broken shell, and the sea going out."),
            Z("driftbank", "The Drift Bank", "plank", [1, 0], "oldtimber", "Old Timber", "A century of wood the sea gave back."),
            Z("kelpforest", "The Kelp Forest", "moss", [2], "the_hauler", "The Hauler", "Green columns, moving, and the light going out above."),
            Z("sealrocks", "The Seal Rocks", "stone", [3], "rockmother", "The Rock Mother", "Black rock, loud with them, and slick the whole way."),
            Z("saltflats", "The Salt Flats", "field", [4, 0], "the_white", "The White", "Flat, blinding, and nothing drinks here."),
            Z("pearlshallows", "The Pearl Shallows", "glow", [5], "the_diver", "The Diver", "Clear water over white sand, lit from underneath."),
            Z("tidewall", "The Tide Wall", "stone", [6, 3], "the_warden", "The Tidewarden", "Where the sea hits the rock and has been losing for ever."),
            Z("wreckyard", "The Wreck Yard", "plank", [7, 1], "the_bosun", "The Bosun", "Ribs of ships, upright, in rows, for a mile."),
            Z("urchinshelf", "The Urchin Shelf", "stone", [8], "the_roller", "The Great Roller", "A shelf of spines, and the tide pushing you onto it."),
            Z("netting", "The Netting", "plank", [9, 7], "the_caster", "The Caster", "Somebody's nets, still set, still catching."),
            Z("stormhead", "Stormhead", "stone", [10, 4], "the_gale", "The Gale", "The headland, the weather, and nothing between them."),
            Z("foamline", "The Foam Line", "glow", [11, 10], "the_foamborn", "The Foamborn", "Where the breakers come in lit, every night, for ever."),
        ],
    },

    {
        n: 5, id: "drowned", short: "Drowned", name: "The Drowned Ruins",
        blurb: "Somebody built this. The water took it anyway.",
        emblem: { id: "em_drowned", name: "The Sunken Mark", stat: "might", per: 2, kind: "flat" },
        parts: [
            P("shard_tile", "Shard Tile", "edge", 1, "Glazed on one face, murderous on the break."),
            P("temple_rod", "Temple Rod", "haft", 1, "Part of something that held a roof up."),
            P("rotted_rope", "Rotted Rope", "bind", 2, "Still holding, which is the only reason it is here."),
            P("eelskin", "Eelskin", "hide", 2, "Wet-looking after a week in the sun."),
            P("altar_ember", "Altar Ember", "ember", 3, "A fire somebody fed for a century, found warm."),
            P("lantern_pearl", "Lantern Pearl", "glow", 4, "Hung in the flooded halls to mark the way out."),
            P("carved_block", "Carved Block", "stone", 3, "The carving says something. Nobody here reads it."),
            P("sunken_sigil", "The Sunken Sigil", "charm", 6, "The mark of whoever built below the line."),
            P("mosaic_chip", "Mosaic Chip", "edge", 1, "One tile out of a picture of something enormous."),
            P("bronze_wire", "Bronze Wire", "bind", 2, "Green with age and stronger than it should be."),
            P("rayskin", "Rayskin", "hide", 2, "Pebbled. Grips wet, which is the point down here."),
            P("deep_glow", "Deep Glow", "glow", 4, "What the things down there use instead of eyes."),
        ],
        creatures: [
            C("tile_scuttler", "Tile Scuttler", "swarm", "Lives in the mosaic and takes a piece with it."),
            C("pillar_lurk", "Pillar Lurk", "stalker", "Column-shaped, column-still, until you pass it."),
            C("rope_hauler", "Rope Hauler", "brute", "Drags itself up by what the builders left."),
            C("moray", "Grand Moray", "striker", "Out of a window, back into a window."),
            C("ember_acolyte", "Ember Acolyte", "caster", "Still tending a fire for a city that drowned."),
            C("pearl_warden", "Pearl Warden", "caster", "Guards a light nobody lit."),
            C("blockfist", "Blockfist", "brute", "Masonry that learned to make a fist."),
            C("sigil_bearer", "Sigil Bearer", "stalker", "Carries the mark and knows what it means."),
            C("mosaic_swarm", "Mosaic Swarm", "swarm", "A picture that comes apart and comes at you."),
            C("wirecoil", "Wirecoil", "striker", "Bronze, fast, and it has been down here a long time."),
            C("rayglider", "Rayglider", "grazer", "Enormous, silent, mostly harmless, occasionally not."),
            C("deeplight", "The Deeplight", "caster", "The thing the lanterns were hung to keep out."),
        ],
        zones: [
            Z("stepsdown", "The Steps Down", "stone", [0], "the_threshold", "The Threshold", "A staircase into water, still swept."),
            Z("colonnade", "The Colonnade", "stone", [1, 0], "the_eleventh_pillar", "The Eleventh Pillar", "Ten columns standing, one walking."),
            Z("hauling_hall", "The Hauling Hall", "plank", [2], "the_hauler_below", "The Hauler Below", "Pulleys, rope, and whatever they were lifting."),
            Z("eelworks", "The Eel Works", "moss", [3, 2], "the_grand_moray", "The Grand Moray", "Channels cut for water, now full of what lives in it."),
            Z("fire_vault", "The Fire Vault", "char", [4], "the_keeper", "The Keeper", "A flame in a flooded room, which should not be possible."),
            Z("lantern_walk", "The Lantern Walk", "glow", [5, 4], "the_lamplighter", "The Lamplighter", "Pearls on chains, lit, the whole length of it."),
            Z("block_yard", "The Block Yard", "stone", [6], "the_mason", "The Mason", "Cut stone stacked for a wall that was never finished."),
            Z("sigil_road", "The Sigil Road", "stone", [7, 1], "the_marked", "The Marked", "The same sign, every twenty paces, facing in."),
            Z("mosaic_floor", "The Mosaic Floor", "stone", [8], "the_picture", "The Picture", "An acre of it, and it shows something with too many arms."),
            Z("wirehouse", "The Wire House", "plank", [9, 6], "the_coil", "The Coil", "Bronze strung wall to wall, humming."),
            Z("ray_shallows", "The Ray Shallows", "moss", [10, 3], "the_glider", "The Glider", "Open water over a plaza, and shadows crossing it."),
            Z("deeproom", "The Deep Room", "glow", [11, 7], "the_deeplight", "The Deeplight", "The bottom of the city, lit by the thing they feared."),
        ],
    },

    {
        n: 6, id: "gilded", short: "Gilded", name: "The Gilded Waste",
        blurb: "Gold-coloured sand, and nothing in it is gold.",
        emblem: { id: "em_gilded", name: "The Sun Mark", stat: "crit_rate", per: 0.25, kind: "pct", global: true },
        parts: [
            P("glass_knap", "Glass Knap", "edge", 1, "Sand struck by something hot enough to mean it."),
            P("cactus_rib", "Cactus Rib", "haft", 1, "The skeleton inside, when the rest has gone."),
            P("camel_sinew", "Camel Sinew", "bind", 2, "Dries like wire and stays like wire."),
            P("lizard_hide", "Lizard Hide", "hide", 2, "Scales small enough to sew, tough enough not to."),
            P("sun_ember", "Sun Ember", "ember", 3, "A stone that held noon and has not let go."),
            P("mirage_light", "Mirage Light", "glow", 4, "Bottled off the horizon. It shows the wrong thing."),
            P("sandstone_core", "Sandstone Core", "stone", 3, "Hard-packed centre of a dune that stopped."),
            P("scarab_seal", "The Scarab Seal", "charm", 6, "Pressed into a door somebody wanted kept shut."),
            P("chert_flake", "Chert Flake", "edge", 1, "Older than the waste. Someone else knapped it first."),
            P("hair_cord", "Hair Cord", "bind", 2, "Braided from the mane of something that outran the sun."),
            P("jackal_pelt", "Jackal Pelt", "hide", 2, "Dust-coloured, the only colour that works here."),
            P("dune_shimmer", "Dune Shimmer", "glow", 4, "The heat-haze itself, if you are quick with a jar."),
        ],
        creatures: [
            C("glass_skitter", "Glass Skitter", "swarm", "Runs on the fused crust and cuts what it runs over."),
            C("ribwalker", "Ribwalker", "grazer", "A cactus that got up. Slowly, but it did."),
            C("sinew_hound", "Sinew Hound", "striker", "All tendon. Runs further than you can."),
            C("scale_basker", "Scale Basker", "brute", "Spends the day warming and the evening collecting."),
            C("ember_asp", "Ember Asp", "striker", "Comes out of the sand already striking."),
            C("mirage_walker", "Mirage Walker", "caster", "You see it twice and only one of them is there."),
            C("dune_hulk", "Dune Hulk", "brute", "A dune that holds its shape when it moves."),
            C("scarab_swarm", "Scarab Swarm", "swarm", "Gold-backed, countless, and they strip a thing in a minute."),
            C("chert_thrower", "Chert Thrower", "caster", "Knaps as it walks and throws what it makes."),
            C("cord_slinger", "Cord Slinger", "striker", "Lassoes, then drags. The drag is the problem."),
            C("jackal", "Waste Jackal", "stalker", "Follows for a day before it decides."),
            C("shimmer", "The Shimmer", "caster", "Heat with intent. You are drinking before you notice."),
        ],
        zones: [
            Z("glass_crust", "The Glass Crust", "stone", [0], "the_skitter_king", "The Skitter King", "Where the sand went to glass and stayed."),
            Z("rib_stand", "The Rib Stand", "field", [1, 0], "the_elder_rib", "The Elder Rib", "Dead cactus, upright, for miles, like a crowd."),
            Z("hound_run", "The Hound Run", "field", [2], "the_lead_hound", "The Lead Hound", "Flat, open, and you are the slowest thing on it."),
            Z("baskers_rock", "Basker's Rock", "stone", [3, 2], "the_great_basker", "The Great Basker", "One rock, enormous, covered in them."),
            Z("asp_dunes", "The Asp Dunes", "field", [4], "the_coiled", "The Coiled", "Smooth sand, no tracks, which means nothing is on top of it."),
            Z("mirage_flat", "The Mirage Flat", "field", [5, 4], "the_double", "The Double", "Water, a mile ahead, for ever."),
            Z("walking_dunes", "The Walking Dunes", "field", [6], "the_mountain", "The Mountain That Walks", "They move. You can hear them move."),
            Z("scarab_field", "The Scarab Field", "stone", [7], "the_gilded_queen", "The Gilded Queen", "The ground is gold and the gold is moving."),
            Z("knapper_ridge", "Knapper's Ridge", "stone", [8, 0], "the_knapper", "The Knapper", "Somebody worked this ridge. A long time before anybody."),
            Z("slingers_pass", "Slinger's Pass", "stone", [9, 2], "the_slinger", "The Slinger", "Narrow, overlooked, and they are above you."),
            Z("jackal_wake", "The Jackal Wake", "field", [10, 9], "the_pack_mother", "The Pack Mother", "They have been behind you since the ridge."),
            Z("sunstare", "Sunstare", "field", [11, 5], "the_shimmer", "The Shimmer", "The middle of it. No shade, no wind, no horizon."),
        ],
    },

    {
        n: 7, id: "reach", short: "Ashen", name: "The Ashen Reach",
        blurb: "It burned a long time ago and the ground has not finished.",
        emblem: { id: "em_reach", name: "The Ember Mark", stat: "crit_damage", per: 0.8, kind: "pct", global: true },
        parts: [
            P("obsidian_flake", "Obsidian Flake", "edge", 1, "The sharpest edge there is, for about four swings."),
            P("scorched_bone", "Scorched Bone", "haft", 1, "Fire-hardened by accident, kept on purpose."),
            P("wire_root", "Wire Root", "bind", 2, "What is left of a tree that would not let go."),
            P("cinder_hide", "Cinder Hide", "hide", 2, "Will not take a spark. Nothing here does twice."),
            P("live_ember", "Live Ember", "ember", 3, "Still going, and has been since before the map."),
            P("fire_opal", "Fire Opal", "glow", 4, "Holds a flame it was never shown."),
            P("basalt_core", "Basalt Core", "stone", 3, "The shape a bubble leaves when rock sets around it."),
            P("salamander_eye", "Salamander Eye", "charm", 6, "Cold to the touch, in all of this."),
            P("ash_glass", "Ash Glass", "edge", 1, "Lightning hit the ash. This is what it left."),
            P("slag_cord", "Slag Cord", "bind", 2, "Drawn out of the runoff while it was still soft."),
            P("soot_pelt", "Soot Pelt", "hide", 2, "Black to the root. It was not always."),
            P("forge_light", "Forge Light", "glow", 4, "The glow a smith works by, prised out of the coal."),
        ],
        creatures: [
            C("glass_crawler", "Glass Crawler", "swarm", "Sheds obsidian as it moves, and the shed bits cut."),
            C("bone_kiln", "Bone Kiln", "brute", "Hollow, hot, and something is burning inside it."),
            C("wirewood", "Wirewood", "stalker", "A stump until it is a reach."),
            C("cinder_boar", "Cinder Boar", "brute", "Charges through fire because fire is not its problem."),
            C("ember_wisp", "Ember Wisp", "caster", "Drifts, lands, and the landing is the attack."),
            C("opal_moth", "Opal Moth", "caster", "Beautiful. Sets things alight by resting on them."),
            C("basalt_golem", "Basalt Golem", "brute", "Cooled on the outside only."),
            C("salamander", "Reach Salamander", "striker", "Lives in the vent and comes out when it cools."),
            C("ashglass_shrike", "Ashglass Shrike", "striker", "Dives, and it is made of broken glass."),
            C("slag_crawler", "Slag Crawler", "grazer", "Eats the runoff. Leaves a trail you can follow."),
            C("sootback", "Sootback", "stalker", "Invisible against every surface in this map."),
            C("forge_wraith", "Forge Wraith", "caster", "What is left of somebody who worked the fire too long."),
        ],
        zones: [
            Z("glass_barrens", "The Glass Barrens", "char", [0], "the_shard_king", "The Shard King", "Black glass underfoot for as far as it goes."),
            Z("bone_kilns", "The Bone Kilns", "char", [1, 0], "the_great_kiln", "The Great Kiln", "Shapes like ovens, standing, warm, and occupied."),
            Z("wirewood_stand", "The Wirewood Stand", "char", [2], "the_old_reach", "The Old Reach", "A forest that burned standing up and never fell."),
            Z("boar_run", "The Boar Run", "char", [3, 2], "the_tusked", "The Tusked", "Trampled ash, in a path, going somewhere fast."),
            Z("ember_drift", "The Ember Drift", "char", [4], "the_drifting_fire", "The Drifting Fire", "It snows up here, and the snow is lit."),
            Z("opal_hollow", "Opal Hollow", "glow", [5, 4], "the_opal_queen", "The Opal Queen", "A pocket of colour in the black. It is not friendly."),
            Z("basalt_steps", "The Basalt Steps", "stone", [6], "the_column", "The Column", "Hexagons, perfect, going up like a stair built for something else."),
            Z("vent_fields", "The Vent Fields", "stone", [7, 6], "the_firstborn", "The Firstborn", "Holes in the ground, and the holes breathe."),
            Z("shrike_cliffs", "The Shrike Cliffs", "stone", [8], "the_glass_shrike", "The Glass Shrike", "They nest in the cliff and the nests are sharp."),
            Z("slag_run", "The Slag Run", "char", [9, 6], "the_slagmother", "The Slagmother", "A river of it, cooling, and still moving under the crust."),
            Z("sootfall", "Sootfall", "char", [10, 3], "the_black", "The Black", "Ash falling like weather. Nothing here can be seen."),
            Z("forgeheart", "Forgeheart", "glow", [11, 7], "the_forge_wraith", "The Forge Wraith", "The hottest part, and somebody is still working."),
        ],
    },

    {
        n: 8, id: "steppe", short: "Thunder", name: "The Thunder Steppe",
        blurb: "Grass to the edge of the world, and the sky doing the talking.",
        emblem: { id: "em_steppe", name: "The Storm Mark", stat: "attack_speed", per: 0.6, kind: "pct" },
        parts: [
            P("horn_edge", "Horn Edge", "edge", 1, "Split lengthways and ground down on a stone."),
            P("lance_shaft", "Lance Shaft", "haft", 1, "Straight, light, and longer than you need."),
            P("horsehair", "Horsehair", "bind", 2, "Plaited by somebody who had all day on a horse."),
            P("bison_hide", "Bison Hide", "hide", 2, "One hide, one tent, one winter."),
            P("fulgurite", "Fulgurite", "ember", 3, "Lightning went into the ground and this came out."),
            P("storm_light", "Storm Light", "glow", 4, "The flash, held between the flash and the thunder."),
            P("thunderstone", "Thunderstone", "stone", 3, "Found where the strike was. Warm for days."),
            P("sky_token", "The Sky Token", "charm", 6, "The steppe people hang these facing up."),
            P("flint_tooth", "Flint Tooth", "edge", 1, "Set in a jaw of wood, the old way."),
            P("gut_cord", "Gut Cord", "bind", 2, "Sings when the wind gets into it."),
            P("hawk_down", "Hawk Down", "hide", 2, "From under the wing, where the bird keeps the warm."),
            P("cloud_glow", "Cloud Glow", "glow", 4, "The underside of a storm, lit from inside."),
        ],
        creatures: [
            C("horned_runner", "Horned Runner", "grazer", "Grazes in hundreds and turns as one."),
            C("lancer", "Steppe Lancer", "striker", "Rides something. Nobody has got close enough to say what."),
            C("hair_weaver", "Hair Weaver", "caster", "Strings the grass and waits for the herd."),
            C("great_bison", "Great Bison", "brute", "Does not charge so much as arrive."),
            C("fulgur_hound", "Fulgur Hound", "striker", "Runs ahead of the storm and brings some with it."),
            C("storm_caller", "Storm Caller", "caster", "Stands in the open and points."),
            C("thunder_ox", "Thunder Ox", "brute", "You feel this one through the ground first."),
            C("skywatcher", "Skywatcher", "stalker", "Stands still on the flat and is never where you looked."),
            C("flint_jaw", "Flint Jaw", "swarm", "Low, fast, and they hunt the edges of the herd."),
            C("cord_singer", "Cord Singer", "caster", "The humming is it. The humming is not weather."),
            C("steppe_hawk", "Steppe Hawk", "striker", "Comes out of the sun, which here is everywhere."),
            C("cloudborn", "Cloudborn", "caster", "Drops out of the storm and goes back up into it."),
        ],
        zones: [
            Z("longgrass", "The Long Grass", "field", [0], "the_great_runner", "The Great Runner", "Head high, moving, and you cannot see your feet."),
            Z("lancer_road", "The Lancer Road", "field", [1, 0], "the_first_lance", "The First Lance", "A track worn by riders, and they still use it."),
            Z("weaver_flats", "The Weaver Flats", "field", [2], "the_grass_weaver", "The Grass Weaver", "The grass is tied. Not blown, tied."),
            Z("bison_ground", "Bison Ground", "field", [3, 0], "the_herd_father", "The Herd Father", "Flattened for a mile, and still warm."),
            Z("strike_plain", "The Strike Plain", "field", [4], "the_first_hound", "The First Hound", "Glass trees where the lightning went in."),
            Z("caller_rise", "Caller Rise", "stone", [5, 4], "the_caller", "The Caller", "The only high ground, and somebody is standing on it."),
            Z("ox_wallow", "The Ox Wallow", "field", [6], "the_thunder_ox", "The Thunder Ox", "Mud, enormous prints, and no sound at all."),
            Z("the_watch", "The Watch", "field", [7, 5], "the_watcher", "The Watcher", "Figures on the horizon that never get closer or further."),
            Z("jawline", "The Jawline", "field", [8], "the_pack_jaw", "The Pack Jaw", "Bones in a line, picked clean, pointing somewhere."),
            Z("singing_draw", "The Singing Draw", "stone", [9, 8], "the_singer", "The Singer", "A cut in the land that hums when the wind is right."),
            Z("hawk_reach", "Hawk Reach", "stone", [10, 1], "the_stooping", "The Stooping", "Nothing above you for a thousand feet, and then something."),
            Z("stormhead_steppe", "The Storm Head", "glow", [11, 6], "the_cloudborn", "The Cloudborn", "The storm parks here. It has parked here for years."),
        ],
    },

    {
        n: 9, id: "frostmere", short: "Frostmere", name: "The Frostmere",
        blurb: "Flat, white, and much further across than it looks.",
        emblem: { id: "em_frostmere", name: "The Hoar Mark", stat: "armour", per: 3, kind: "flat" },
        parts: [
            P("ice_splinter", "Ice Splinter", "edge", 1, "Keeps its edge as long as you keep it cold."),
            P("frozen_branch", "Frozen Branch", "haft", 1, "Rings like a bar when you knock it."),
            P("frost_sinew", "Frost Sinew", "bind", 2, "Thaws in the hand and sets where you put it."),
            P("wolf_pelt", "Wolf Pelt", "hide", 2, "Two coats, and the under one is the warm one."),
            P("hearth_coal", "Hearth Coal", "ember", 3, "Carried from the last fire. Everybody carries one."),
            P("aurora_dust", "Aurora Dust", "glow", 4, "Swept off the snow where the sky touched it."),
            P("hoarstone", "Hoarstone", "stone", 3, "Grey, furred with frost, and it does not warm up."),
            P("frost_rune", "The Frost Rune", "charm", 6, "Cut by somebody who meant to come back for it."),
            P("bone_sliver", "Bone Sliver", "edge", 1, "The mere gives these up every thaw."),
            P("gut_lash", "Gut Lash", "bind", 2, "Stronger wet than dry, which is a useful way round."),
            P("elk_hide", "Elk Hide", "hide", 2, "Thick enough to stand a shoulder behind."),
            P("winter_light", "Winter Light", "glow", 4, "Four hours of it a day, kept in a jar."),
        ],
        creatures: [
            C("ice_crawler", "Ice Crawler", "swarm", "Comes up through the crust where it is thin."),
            C("branch_walker", "Branch Walker", "stalker", "A frozen tree with somewhere to be."),
            C("sinew_stalker", "Sinew Stalker", "stalker", "Does not run. Simply keeps arriving."),
            C("white_wolf", "White Wolf", "striker", "You will hear the pack before the pack is a problem."),
            C("hearth_thief", "Hearth Thief", "swarm", "Takes fire. Specifically fire."),
            C("aurora_drift", "Aurora Drift", "caster", "Beautiful, silent, and it freezes what it crosses."),
            C("hoar_golem", "Hoar Golem", "brute", "Mere ice over mere stone, standing up."),
            C("rune_keeper", "Rune Keeper", "caster", "Guards cuts in stone it did not make."),
            C("bone_picker", "Bone Picker", "swarm", "Works the thaw line for what the mere gives back."),
            C("lash_hunter", "Lash Hunter", "striker", "Throws a line and hauls. On ice, that is the whole fight."),
            C("great_elk", "Great Elk", "brute", "Antlers wider than the path you are on."),
            C("winter_wraith", "Winter Wraith", "caster", "The cold itself, with a direction."),
        ],
        zones: [
            Z("thin_crust", "The Thin Crust", "stone", [0], "the_crust_breaker", "The Crust Breaker", "It holds. Mostly. Listen as you cross."),
            Z("frozen_stand", "The Frozen Stand", "char", [1, 0], "the_standing", "The Standing", "A wood that froze upright mid-season."),
            Z("stalkers_white", "The Stalker White", "field", [2], "the_patient", "The Patient", "Nothing on the horizon, and footprints behind you."),
            Z("wolf_run", "The Wolf Run", "field", [3, 2], "the_white_mother", "The White Mother", "Packed snow, running both ways, in a channel."),
            Z("hearth_camp", "The Hearth Camp", "plank", [4], "the_fire_thief", "The Fire Thief", "Somebody camped here a long time. Nobody left."),
            Z("aurora_flats", "The Aurora Flats", "glow", [5, 4], "the_drifting_light", "The Drifting Light", "The sky comes down to the snow here and touches it."),
            Z("hoar_field", "The Hoar Field", "stone", [6], "the_grey", "The Grey", "Boulders furred white, in rows, like a crowd facing away."),
            Z("rune_stones", "The Rune Stones", "stone", [7, 6], "the_keeper_of_cuts", "The Keeper of Cuts", "Someone carved these and expected to be understood."),
            Z("thaw_line", "The Thaw Line", "moss", [8], "the_picker_king", "The Picker King", "Where the mere gives back what it took, once a year."),
            Z("lash_ice", "Lash Ice", "stone", [9, 3], "the_hauler_white", "The White Hauler", "Smooth, blue, and nothing has grip but them."),
            Z("elk_crossing", "The Elk Crossing", "field", [10, 1], "the_great_elk", "The Great Elk", "A path worn by something very large, going somewhere every year."),
            Z("mereheart", "Mereheart", "glow", [11, 5], "the_winter_wraith", "The Winter Wraith", "The middle of the mere. It is colder here for no reason."),
        ],
    },

    {
        n: 10, id: "glasspeaks", short: "Glass", name: "The Glass Peaks",
        blurb: "Mountains that ring when the wind crosses them.",
        emblem: { id: "em_glasspeaks", name: "The Facet Mark", stat: "rarity_find", per: 1.2, kind: "pct" },
        parts: [
            P("prism_edge", "Prism Edge", "edge", 1, "Cuts, and throws a rainbow on the wall while it does."),
            P("quartz_rod", "Quartz Rod", "haft", 1, "Grown straight, as if it were told to."),
            P("silver_thread", "Silver Thread", "bind", 2, "Drawn fine enough to be lost in a sleeve."),
            P("rime_hide", "Rime Hide", "hide", 2, "Frozen stiff and then worked soft again."),
            P("core_ember", "Core Ember", "ember", 3, "From under the glass, where the mountain is liquid."),
            P("facet_light", "Facet Light", "glow", 4, "One ray split eight ways and kept."),
            P("glass_core", "Glass Core", "stone", 3, "The heart of a peak, clear the whole way through."),
            P("peak_crystal", "The Peak Crystal", "charm", 6, "Only the summits grow these, and only sometimes."),
            P("shard_knife", "Shard Knife", "edge", 1, "Already shaped. Nobody admits to shaping it."),
            P("wire_silk", "Wire Silk", "bind", 2, "Spun by something that lives in the cold and the clear."),
            P("goat_hide", "Goat Hide", "hide", 2, "Off the only animal that can stand up here."),
            P("spectrum_glow", "Spectrum Glow", "glow", 4, "White light, taken apart and carried in pieces."),
        ],
        creatures: [
            C("prism_skitter", "Prism Skitter", "swarm", "Scatters light and cuts ankles."),
            C("quartz_strider", "Quartz Strider", "stalker", "Long-legged, transparent, and you see the peak through it."),
            C("thread_spinner", "Thread Spinner", "caster", "Strings the gaps between peaks. You will find out where."),
            C("rime_ram", "Rime Ram", "brute", "Butts. On a ledge, once is enough."),
            C("core_tender", "Core Tender", "caster", "Carries heat up from under and does not share."),
            C("facet_moth", "Facet Moth", "caster", "Wings like cut glass, and the light off them burns."),
            C("glass_sentinel", "Glass Sentinel", "brute", "Clear, enormous, and you can watch it decide."),
            C("crystal_warden", "Crystal Warden", "stalker", "Guards the summits. Has always guarded the summits."),
            C("shard_hawk", "Shard Hawk", "striker", "Dives with something in its feet."),
            C("silk_lurker", "Silk Lurker", "stalker", "Lives in the web it did not spin."),
            C("peak_goat", "Peak Goat", "grazer", "Stands on nothing. Resents being watched doing it."),
            C("spectral", "The Spectral", "caster", "Light that got into a shape and stayed."),
        ],
        zones: [
            Z("first_shelf", "The First Shelf", "stone", [0], "the_scatterer", "The Scatterer", "The lowest ledge, and already a long way down."),
            Z("strider_gap", "Strider Gap", "stone", [1, 0], "the_longlegs", "Longlegs", "A gap you cannot jump and something that can."),
            Z("thread_span", "The Thread Span", "stone", [2], "the_spinner", "The Spinner", "Silver lines between the peaks, load-bearing, occupied."),
            Z("ram_ledge", "Ram Ledge", "stone", [3, 1], "the_white_ram", "The White Ram", "Wide enough for one of you. There are several of them."),
            Z("core_vent", "The Core Vent", "char", [4], "the_tender", "The Tender", "A hole in the glass with heat coming up it."),
            Z("moth_hollow", "Moth Hollow", "glow", [5, 4], "the_facet_queen", "The Facet Queen", "Thousands of them, and the hollow is a lamp."),
            Z("sentinel_stair", "The Sentinel Stair", "stone", [6], "the_tall_glass", "The Tall Glass", "Steps cut for something with a longer stride."),
            Z("warden_summit", "Warden Summit", "stone", [7, 6], "the_first_warden", "The First Warden", "The top of one peak, and it is not unoccupied."),
            Z("hawk_face", "The Hawk Face", "stone", [8], "the_shard_hawk", "The Shard Hawk", "Sheer, and the nests are above you the whole climb."),
            Z("silk_crevasse", "Silk Crevasse", "stone", [9, 2], "the_lurker", "The Lurker", "A crack in the range, strung the whole way down."),
            Z("goat_path", "The Goat Path", "stone", [10, 3], "the_elder_goat", "The Elder Goat", "Six inches wide, a mile long, and in use."),
            Z("spectrum_summit", "Spectrum Summit", "glow", [11, 7], "the_spectral", "The Spectral", "The highest peak. The light here does not behave."),
        ],
    },

    {
        n: 11, id: "rotgarden", short: "Rotgarden", name: "The Rotgarden",
        blurb: "Somebody planted all of this. It got out.",
        emblem: { id: "em_rotgarden", name: "The Blight Mark", stat: "life_steal", per: 0.4, kind: "pct" },
        parts: [
            P("thorn_lance", "Thorn Lance", "edge", 1, "Arm length, and it was growing yesterday."),
            P("blight_stem", "Blight Stem", "haft", 1, "Hollow, light, and it will not rot further."),
            P("creeper_cord", "Creeper Cord", "bind", 2, "Cut it and it tightens. Nobody knows why."),
            P("husk_hide", "Husk Hide", "hide", 2, "What the thing left when it finished being it."),
            P("fever_ember", "Fever Ember", "ember", 3, "Warm the way a sick room is warm."),
            P("spore_light", "Spore Light", "glow", 4, "The garden lights its own paths after dark."),
            P("canker_stone", "Canker Stone", "stone", 3, "Grown inside a trunk like a pearl in a shell."),
            P("seed_heart", "The Seed Heart", "charm", 6, "Still viable, which is the problem with it."),
            P("bone_thorn", "Bone Thorn", "edge", 1, "The garden grows these out of what it eats."),
            P("fungal_thread", "Fungal Thread", "bind", 2, "Miles of it under every step you take."),
            P("moth_pelt", "Moth Pelt", "hide", 2, "Dust comes off it for a week."),
            P("rot_glow", "Rot Glow", "glow", 4, "Decay bright enough to read by."),
        ],
        creatures: [
            C("thorn_elder", "Thorn Elder", "striker", "The garden oldest hedge, and it has opinions."),
            C("stem_walker", "Stem Walker", "grazer", "Tall, hollow, and it leans to look at you."),
            C("creeper", "The Creeper", "stalker", "Arrives by having already been there."),
            C("husk", "Husk", "swarm", "Whatever wore this is finished. The husk is not."),
            C("fever_bloom", "Fever Bloom", "caster", "Opens, and the air goes wrong."),
            C("spore_lantern", "Spore Lantern", "caster", "Lights the path. The path goes inward."),
            C("canker_brute", "Canker Brute", "brute", "A trunk with a growth, and the growth is driving."),
            C("seed_warden", "Seed Warden", "stalker", "Protects the middle. Nothing it protects should get out."),
            C("bone_bramble", "Bone Bramble", "swarm", "Grows through what it catches."),
            C("thread_crawler", "Thread Crawler", "swarm", "Comes up through the mat, in numbers."),
            C("blight_moth", "Blight Moth", "striker", "Dusts you on the way past and comes back later."),
            C("the_gardener_foe", "The Gardener", "caster", "Still tending. That is the worst part."),
        ],
        zones: [
            Z("hedge_gate", "The Hedge Gate", "bramble", [0], "the_first_hedge", "The First Hedge", "A garden gate, open, and the hedge has eaten the wall."),
            Z("stem_rows", "The Stem Rows", "bramble", [1, 0], "the_tall_stem", "The Tall Stem", "Planted in rows. Still in rows. Much taller now."),
            Z("creeper_walk", "Creeper Walk", "moss", [2], "the_long_creeper", "The Long Creeper", "A path that is being closed behind you."),
            Z("husk_beds", "The Husk Beds", "field", [3, 2], "the_husk_king", "The Husk King", "Beds of them, arranged, by something with a system."),
            Z("fever_house", "The Fever House", "glow", [4], "the_bloom_mother", "The Bloom Mother", "A glasshouse. The glass is still in it. So is the heat."),
            Z("lantern_rows", "The Lantern Rows", "glow", [5, 4], "the_spore_crown", "The Spore Crown", "Lit all the way down, both sides, perfectly even."),
            Z("canker_orchard", "The Canker Orchard", "char", [6], "the_cankered", "The Cankered", "Fruit trees. The fruit is wrong and the trees know."),
            Z("seed_vault", "The Seed Vault", "stone", [7, 6], "the_seed_warden", "The Seed Warden", "Somebody built this to keep seeds safe. It worked."),
            Z("bramble_maze", "The Bramble Maze", "bramble", [8], "the_maze_heart", "The Maze Heart", "Hedges, corners, and it has been rearranged since the map."),
            Z("thread_floor", "The Thread Floor", "burrow", [9, 8], "the_mat", "The Mat", "The whole floor is one organism and you are standing on it."),
            Z("moth_arbour", "The Moth Arbour", "heart", [10, 1], "the_blight_moth", "The Blight Moth", "Shade, silence, and the air full of dust."),
            Z("gardeners_plot", "The Gardener Plot", "heart", [11, 7], "the_gardener", "The Gardener", "Neat beds, weeded this morning, in the middle of all this."),
        ],
    },

    {
        n: 12, id: "starfall", short: "Starfall", name: "The Starfall Rim",
        blurb: "The edge of the map, where things land that were never up there.",
        emblem: { id: "em_starfall", name: "The Rim Mark", stat: "emblem_find", per: 1.5, kind: "pct" },
        parts: [
            P("star_edge", "Star Edge", "edge", 1, "Fell sharp. Has stayed sharp."),
            P("void_rod", "Void Rod", "haft", 1, "Weighs nothing in one hand and a great deal in two."),
            P("comet_thread", "Comet Thread", "bind", 2, "A tail, cooled and wound on a spool."),
            P("night_hide", "Night Hide", "hide", 2, "Takes no light back out."),
            P("sun_fragment", "Sun Fragment", "ember", 3, "A piece of a star that has not noticed it landed."),
            P("astral_light", "Astral Light", "glow", 4, "Older than the ground it is lying on."),
            P("meteor_core", "Meteor Core", "stone", 3, "Iron that has never been in the earth."),
            P("rim_sigil", "The Rim Sigil", "charm", 6, "Found facing up, every time, wherever it falls."),
            P("sky_glass", "Sky Glass", "edge", 1, "The ground went to glass where it hit."),
            P("gravity_cord", "Gravity Cord", "bind", 2, "Hangs straight down whichever way you hold it."),
            P("umbra_pelt", "Umbra Pelt", "hide", 2, "Off something that came down with the rest of it."),
            P("nebula_glow", "Nebula Glow", "glow", 4, "A handful of the thing stars are made out of."),
        ],
        creatures: [
            C("star_skitter", "Star Skitter", "swarm", "Landed recently. Still hot. Still moving."),
            C("void_walker", "Void Walker", "stalker", "Steps, and is not where the step should have put it."),
            C("comet_lash", "Comet Lash", "striker", "Trails fire and uses the trail."),
            C("night_hound", "Night Hound", "striker", "Black on black, and the pack hunts the dark side."),
            C("sun_cinder", "Sun Cinder", "brute", "A fragment with ambitions."),
            C("astral_drift", "Astral Drift", "caster", "Very old light, moving with purpose."),
            C("meteor_hulk", "Meteor Hulk", "brute", "Iron that landed standing up."),
            C("rim_warden_foe", "Rim Warden", "stalker", "Was here before the falls started."),
            C("glass_rain", "Glass Rain", "swarm", "Not one thing. Many, falling, with a direction."),
            C("cord_hanger", "Cord Hanger", "caster", "Hangs from nothing and pulls what it likes toward it."),
            C("umbra_stalker", "Umbra Stalker", "stalker", "Casts no shadow because it is one."),
            C("the_fallen_foe", "The Fallen", "caster", "Came down with something, and the something is still in it."),
        ],
        zones: [
            Z("first_fall", "First Fall", "char", [0], "the_first_stone", "The First Stone", "The nearest crater, and the newest."),
            Z("void_steps", "The Void Steps", "stone", [1, 0], "the_walker", "The Walker", "Stone slabs, floating, in an order that changes."),
            Z("comet_run", "Comet Run", "char", [2], "the_long_tail", "The Long Tail", "A scar across the rim, miles long, still warm."),
            Z("nightside", "Nightside", "burrow", [3, 2], "the_pack_of_night", "The Pack of Night", "The rim dark face. The sun does not reach here."),
            Z("cinder_fall", "Cinder Fall", "char", [4], "the_sun_cinder", "The Sun Cinder", "Pieces of a star, cooling, in a field of them."),
            Z("drift_reach", "Drift Reach", "glow", [5, 4], "the_ancient_light", "The Ancient Light", "Light arriving from somewhere that is no longer there."),
            Z("iron_fall", "Iron Fall", "stone", [6], "the_iron_hulk", "The Iron Hulk", "Enough iron to build a city, standing in the ground."),
            Z("warden_rim", "The Warden Rim", "stone", [7, 6], "the_rim_warden", "The Rim Warden", "The actual edge. Something has been watching it."),
            Z("glass_rainfall", "The Glass Rainfall", "stone", [8], "the_shower", "The Shower", "It falls here constantly, and all of it is sharp."),
            Z("hanging_cords", "The Hanging Cords", "glow", [9, 5], "the_hanger", "The Hanger", "Lines from the sky to the ground, taut, humming."),
            Z("umbra_waste", "The Umbra Waste", "burrow", [10, 3], "the_shadowless", "The Shadowless", "Nothing here casts one, including you."),
            Z("the_landing", "The Landing", "glow", [11, 7], "the_fallen", "The Fallen", "The biggest crater on the rim, and something is in it."),
        ],
    },
];

export const groveMap = (n) => GROVE_MAPS.find((m) => m.n === Number(n)) || null;

// ── HOW MANY MAPS ACTUALLY EXIST TO WALK ─────────────────────────────────────────────────────────────────────
// Everything above is designed: places, residents, drops and recipes. What a map still needs before a member
// can stand in it is ART — a backdrop a zone, a sprite a creature, a sprite a part — and that is the number
// this gates. Raise it as a map's art lands and the bench, the gate and the tablet all move together.
export const MAPS_BUILT = 1;
export const mapIsBuilt = (n) => Number(n) <= MAPS_BUILT;

// ── WHAT COMES OFF WHAT ──────────────────────────────────────────────────────────────────────────────────────
// Generated, and the rule is the honest one: a creature drops ITS OWN material first and its neighbour's
// second. Creature i is the resident of zone i, part i is what that zone is made of, so a part is found where
// the thing it comes off actually lives — which is what makes "where do I get Dripstone" answerable by looking
// at the map rather than at a table.
//
// ⚠️ EVERY PART MUST BE SOMEBODY'S PRIMARY. Twelve creatures, twelve parts, index for index: that is what
// guarantees no material is unreachable, and check-grove.mjs asserts it rather than trusting this comment.
const SECOND_OFFSET = 3;
export const creatureLoot = (map, i) => ([
    { part: map.parts[i].id, n: [1, 2], w: 70 },
    { part: map.parts[(i + SECOND_OFFSET) % map.parts.length].id, n: [1, 2], w: 30 },
]);

/** A boss pays its zone's residents' materials, in bulk — the same shape map one's bosses use. */
export const bossLoot = (map, zone) => zone.foes.slice(0, 2).map((idx, k) => ({
    part: map.parts[idx].id, n: k === 0 ? [4, 7] : [3, 5],
}));

/** Global depth: map one is zones 1-12, map two is 13-24, and the curve reads this and nothing else. */
export const zoneDepth = (mapN, i) => (Number(mapN) - 1) * 12 + i + 1;

/** Kills to open the next zone, climbing with depth the way map one's 20 -> 80 does. */
export const zoneUnlock = (depth) => 20 + (depth - 1) * 5;

/** Every part of every generated map, flat, keyed by id — merged into GROVE_PARTS by the catalogue. */
export const MAP_PARTS = Object.fromEntries(
    GROVE_MAPS.filter((m) => m.parts).flatMap((m) =>
        m.parts.map((p) => [p.id, { name: p.name, tier: p.tier, blurb: p.blurb, map: m.n, role: p.role }])),
);

/** Every creature of every generated map, in GROVE_ENEMIES shape. */
export const MAP_ENEMIES = Object.fromEntries(
    GROVE_MAPS.filter((m) => m.creatures).flatMap((m) =>
        m.creatures.map((c, i) => [c.id, {
            id: c.id, name: c.name, art: `/images/grove/foe-${c.id}.webp`, blurb: c.blurb,
            ...ARCH[c.arch], map: m.n,
            // One emblem per map rather than one per creature: 132 new passive stat stacks is a second stat
            // system arriving by the back door, and §11 of the design doc still has stat ceilings open.
            emblem: m.emblem?.id || null, emblemChance: 0.0024,
            loot: creatureLoot(m, i),
        }])),
);

/** Every boss of every generated map, in GROVE_BOSSES shape. */
export const MAP_BOSSES = Object.fromEntries(
    GROVE_MAPS.filter((m) => m.zones).flatMap((m) =>
        m.zones.map((z) => [z.bossId, {
            id: z.bossId, name: z.bossName, art: `/images/grove/boss-${z.bossId}.webp`, boss: true,
            // Bosses are priced off their zone's depth by scaledFoe like everything else; these are the
            // depth-1 baselines map one's bosses use, so the two sets sit on one curve.
            hp: 59000, dmg: [190, 260], map: m.n,
            emblem: m.emblem?.id || null, emblemChance: 0.09,
            loot: bossLoot(m, z),
        }])),
);

/** Every zone of every generated map, in GROVE_ZONES shape. */
export const MAP_ZONES = GROVE_MAPS.filter((m) => m.zones).flatMap((m) =>
    m.zones.map((z, i) => {
        const depth = zoneDepth(m.n, i);
        return {
            n: depth, id: z.id, name: z.name, map: m.n, mapName: m.name,
            enemies: z.foes.map((idx) => m.creatures[idx].id),
            boss: z.bossId, toUnlock: zoneUnlock(depth), biome: z.biome,
            bg: `/images/grove/zone-${z.id}.webp`, blurb: z.blurb,
        };
    }));

/** One emblem per generated map, in GROVE_EMBLEMS shape. */
export const MAP_EMBLEMS = Object.fromEntries(
    GROVE_MAPS.filter((m) => m.emblem).map((m) => [m.emblem.id, {
        name: m.emblem.name, stat: m.emblem.stat, per: m.emblem.per, kind: m.emblem.kind || "flat",
        ...(m.emblem.global ? { global: true } : {}), map: m.n,
    }]));

/**
 * The twelve tool recipes for one generated map.
 *
 * ⚠️ A ROLE THE MAP HAS NO MATERIAL FOR IS A RECIPE THAT CANNOT BE WRITTEN, so this throws rather than
 * quietly producing a two-part tool. check-grove.mjs calls it for every map.
 */
export function toolRecipesForMap(n) {
    const map = groveMap(n);
    if (!map?.parts) return [];
    const byRole = {};
    for (const p of map.parts) if (!byRole[p.role]) byRole[p.role] = p;
    return Object.entries(TOOL_ROLES).map(([slot, roles]) => {
        const parts = {};
        roles.forEach((role, i) => {
            const part = byRole[role];
            if (!part) throw new Error(`map ${n} (${map.id}) has no "${role}" material — ${slot} cannot be built`);
            parts[part.id] = tierCount(slot, i, n);
        });
        return { slot, tier: n, parts, mapId: map.id, mapName: map.name, short: map.short };
    });
}
