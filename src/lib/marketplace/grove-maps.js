// ── THE TWELVE MAPS, AND THE MATERIALS EACH ONE IS MADE OF ───────────────────────────────────────────────────
// Map one is hand-authored in grove-catalog.js: sixteen parts, twelve zones, twelve bosses, and twelve tool
// recipes written one at a time. That is the right way to build the first of anything and the wrong way to
// build the next eleven — 132 recipes typed by hand is 132 chances to misprice one, and no way to see the
// shape of the ladder while doing it.
//
// So maps two to twelve are declared as MATERIALS WITH ROLES, and the recipes fall out of that.
//
// ── A ROLE IS WHAT A MATERIAL DOES, NOT WHAT IT IS ───────────────────────────────────────────────────────────
// Every place in the world has something you cut with, something you grip, something you lash it together
// with. A forest's binding is moss and sinew; a drowned city's is bronze wire; the rim's is a thread of comet
// ice. Same job, different world. Give every map a material for each role and a tool recipe is the same
// sentence spoken in that map's vocabulary:
//
//     a pickaxe is an EDGE, a HAFT and a HIDE to wrap the grip
//     a lantern is a GLOW, an EMBER to light it and a BIND to carry it
//
// That is why the recipes below are generated rather than typed: the design lives in TOOL_ROLES, which is
// twelve lines, and a new map is twelve materials. Map thirteen is an afternoon instead of a fortnight.
//
// ⚠️ MAP ONE IS NOT GENERATED AND MUST NOT BE. Its recipes were written against its own parts before this
// existed, they are balanced, members have crafted them, and regenerating them would silently reprice the
// only tier anyone owns. It stays literal; this file starts at two.

/** The eight jobs a material can do. Every map names one material for each. */
export const ROLES = ["edge", "haft", "bind", "hide", "ember", "glow", "stone", "charm"];

// ── WHAT EACH TOOL IS, IN ROLES ──────────────────────────────────────────────────────────────────────────────
// Three roles per tool, no two tools alike, and every one of them readable as an object: a horn is an ember's
// heat, a stone's weight and a hide strap. The first role listed is the one the tool is mostly made of and
// takes the largest count.
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

// ── WHAT A TIER COSTS ────────────────────────────────────────────────────────────────────────────────────────
// Six of the main material, five of the second, four of the third, climbing 10% a map. Tier XII asks for 13,
// 11 and 9 of things that only drop at the bottom of the world, which is the grind the last rung should be.
//
// ⚠️ THE COST CLIMBS AND THE BONUS DOES NOT. Every tier is +3%, flat, because the ladder's job is to keep
// being worth climbing rather than to accelerate — a curve that paid more per rung as it cost more per rung
// would make the first six tiers pointless and the last six mandatory.
const BASE_COUNTS = [6, 5, 4];
export const tierCount = (slot, i, mapN) =>
    Math.round(BASE_COUNTS[i] * (1 + (Math.max(1, mapN) - 1) * 0.1));

// ── THE MAPS ─────────────────────────────────────────────────────────────────────────────────────────────────
// `parts` is twelve materials per map: one for each of the eight roles, plus four more that double up on the
// common ones, so a map has spares to drop and a zone is not a vending machine for one item.
//
// `tier` here is rarity WITHIN the map — 1 is what everything drops, 6 is the thing you chase. Depth across
// the world is the MAP number, which is what scales difficulty (see GROVE_SCALE in grove-catalog.js); a tier
// 1 part on map eleven is still a late-game material.
const P = (id, name, role, tier, blurb) => ({ id, name, role, tier, blurb });

export const GROVE_MAPS = [
    // Map one lives in grove-catalog.js. It is listed here for its name and nothing else.
    { n: 1, id: "grove", short: "Rootwood", name: "The Grove", blurb: "Where the trees start, and the first thing that hits back.", parts: null },

    { n: 2, id: "undercave", short: "Undercave", name: "The Undercave", blurb: "Down past the roots, where the light is something that grows.", parts: [
        P("flint_shard", "Flint Shard", "edge", 1, "Knapped by nothing. It came off the wall like that."),
        P("mushroom_stalk", "Mushroom Stalk", "haft", 1, "Dense as wood and lighter than it looks."),
        P("cave_sinew", "Cave Sinew", "bind", 2, "Pulled from something that never needed eyes."),
        P("batskin", "Batskin", "hide", 2, "Thin, tough, and still faintly warm."),
        P("coal_nub", "Coal Nub", "ember", 3, "A seam of it runs under the whole second zone."),
        P("glowspore", "Glowspore", "glow", 4, "Shake the cap and the dark goes green for a minute."),
        P("drip_stone", "Dripstone", "stone", 3, "Ten thousand years of one slow drop."),
        P("blind_eye", "The Blind Eye", "charm", 6, "Milk white, and it tracks you across the room."),
        P("shale_flake", "Shale Flake", "edge", 1, "Splits along a line you can see before you break it."),
        P("root_tendril", "Root Tendril", "bind", 2, "A tree up there is reaching further than it should."),
        P("moleskin", "Moleskin", "hide", 2, "Nap in every direction, so it never catches."),
        P("lumen_cap", "Lumen Cap", "glow", 4, "Picked in the dark by the light of itself."),
    ] },

    { n: 3, id: "fen", short: "Fen", name: "The Sunken Fen", blurb: "Wet to the knee and quiet, which is the part that should worry you.", parts: [
        P("reed_blade", "Reed Blade", "edge", 1, "Sharp enough to open a hand on the way past."),
        P("bog_oak", "Bog Oak", "haft", 1, "Black as iron, and about as forgiving."),
        P("weed_cord", "Weed Cord", "bind", 2, "Dries tighter than it was tied."),
        P("toadskin", "Toadskin", "hide", 2, "Waterproof, and it never stops feeling damp."),
        P("marsh_gas", "Marsh Gas", "ember", 3, "Bottled badly. Handle it like it is still thinking about it."),
        P("willow_light", "Willow Light", "glow", 4, "The pale fire that walks the water at night."),
        P("peat_stone", "Peat Stone", "stone", 3, "Cut, stacked and dried. Burns for a day."),
        P("drowned_charm", "The Drowned Charm", "charm", 6, "Somebody wore this before the water came."),
        P("shell_chip", "Shell Chip", "edge", 1, "Nacre on one side, a razor on the other."),
        P("vine_rope", "Vine Rope", "bind", 2, "Already the right length. That is the unsettling part."),
        P("heron_down", "Heron Down", "hide", 2, "Warm out of all proportion to its weight."),
        P("fen_wisp", "Fen Wisp", "glow", 4, "Caught in a jar and still trying to lead you off the path."),
    ] },

    { n: 4, id: "reach", short: "Ashen", name: "The Ashen Reach", blurb: "It burned a long time ago and the ground has not finished.", parts: [
        P("obsidian_flake", "Obsidian Flake", "edge", 1, "The sharpest edge there is, for about four swings."),
        P("scorched_bone", "Scorched Bone", "haft", 1, "Fire-hardened by accident, kept on purpose."),
        P("wire_root", "Wire Root", "bind", 2, "What is left of a tree that would not let go."),
        P("cinder_hide", "Cinder Hide", "hide", 2, "Will not take a spark. Nothing here does, twice."),
        P("live_ember", "Live Ember", "ember", 3, "Still going. It has been going since before the map."),
        P("fire_opal", "Fire Opal", "glow", 4, "Holds a flame it was never shown."),
        P("basalt_core", "Basalt Core", "stone", 3, "The shape a bubble leaves when the rock sets around it."),
        P("salamander_eye", "Salamander Eye", "charm", 6, "Cold to the touch, in all of this."),
        P("ash_glass", "Ash Glass", "edge", 1, "Lightning hit the ash. This is what it left."),
        P("slag_cord", "Slag Cord", "bind", 2, "Drawn out of the runoff while it was still soft."),
        P("soot_pelt", "Soot Pelt", "hide", 2, "Black to the root. It was not always."),
        P("forge_light", "Forge Light", "glow", 4, "The glow a smith works by, prised out of the coal."),
    ] },

    { n: 5, id: "saltwrack", short: "Saltwrack", name: "The Saltwrack Coast", blurb: "Everything the sea did not want, arranged in a line.", parts: [
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
    ] },

    { n: 6, id: "frostmere", short: "Frostmere", name: "The Frostmere", blurb: "Flat, white, and further across than it looks.", parts: [
        P("ice_splinter", "Ice Splinter", "edge", 1, "Keeps its edge as long as you keep it cold."),
        P("frozen_branch", "Frozen Branch", "haft", 1, "Rings like a bar when you knock it."),
        P("frost_sinew", "Frost Sinew", "bind", 2, "Thaws in the hand and sets where you put it."),
        P("wolf_pelt", "Wolf Pelt", "hide", 2, "Two coats, and the under one is the warm one."),
        P("hearth_coal", "Hearth Coal", "ember", 3, "Carried from the last fire. Everybody carries one."),
        P("aurora_dust", "Aurora Dust", "glow", 4, "Swept off the snow where the sky touched it."),
        P("hoarstone", "Hoarstone", "stone", 3, "Grey, furred with frost, and it does not warm up."),
        P("frost_rune", "The Frost Rune", "charm", 6, "Cut into a stone by somebody who meant to come back for it."),
        P("bone_sliver", "Bone Sliver", "edge", 1, "The mere gives these up every thaw."),
        P("gut_lash", "Gut Lash", "bind", 2, "Stronger wet than dry, which is a useful way round."),
        P("elk_hide", "Elk Hide", "hide", 2, "Thick enough to stand a shoulder behind."),
        P("winter_light", "Winter Light", "glow", 4, "Four hours of it a day, kept in a jar."),
    ] },

    { n: 7, id: "drowned", short: "Drowned", name: "The Drowned Ruins", blurb: "Somebody built this. The water took it anyway.", parts: [
        P("shard_tile", "Shard Tile", "edge", 1, "Glazed on one face, murderous on the break."),
        P("temple_rod", "Temple Rod", "haft", 1, "Part of something that held a roof up."),
        P("rotted_rope", "Rotted Rope", "bind", 2, "Still holding, which is the only reason it is here."),
        P("eelskin", "Eelskin", "hide", 2, "Wet-looking even after a week in the sun."),
        P("altar_ember", "Altar Ember", "ember", 3, "A fire somebody fed for a century, found still warm."),
        P("lantern_pearl", "Lantern Pearl", "glow", 4, "Hung in the flooded halls to mark the way out."),
        P("carved_block", "Carved Block", "stone", 3, "The carving says something. Nobody here reads it."),
        P("sunken_sigil", "The Sunken Sigil", "charm", 6, "The mark of whoever decided to build below the line."),
        P("mosaic_chip", "Mosaic Chip", "edge", 1, "One tile out of a picture of something enormous."),
        P("bronze_wire", "Bronze Wire", "bind", 2, "Green with age and stronger than it has any right to be."),
        P("rayskin", "Rayskin", "hide", 2, "Pebbled. Grips wet, which is the whole point down here."),
        P("deep_glow", "Deep Glow", "glow", 4, "What the things down there use instead of eyes."),
    ] },

    { n: 8, id: "gilded", short: "Gilded", name: "The Gilded Waste", blurb: "Gold-coloured sand, and nothing in it is gold.", parts: [
        P("glass_knap", "Glass Knap", "edge", 1, "Sand struck by something hot enough to mean it."),
        P("cactus_rib", "Cactus Rib", "haft", 1, "The skeleton inside, when the rest has gone."),
        P("camel_sinew", "Camel Sinew", "bind", 2, "Dries like wire and stays like wire."),
        P("lizard_hide", "Lizard Hide", "hide", 2, "Scales small enough to sew, tough enough not to."),
        P("sun_ember", "Sun Ember", "ember", 3, "A stone that held noon and has not let it go."),
        P("mirage_light", "Mirage Light", "glow", 4, "Bottled off the horizon. It shows you the wrong thing."),
        P("sandstone_core", "Sandstone Core", "stone", 3, "Hard-packed centre of a dune that stopped moving."),
        P("scarab_seal", "The Scarab Seal", "charm", 6, "Pressed into a door somebody wanted kept shut."),
        P("chert_flake", "Chert Flake", "edge", 1, "Older than the waste. Someone else knapped it first."),
        P("hair_cord", "Hair Cord", "bind", 2, "Braided from the mane of something that outran the sun."),
        P("jackal_pelt", "Jackal Pelt", "hide", 2, "Dust-coloured, which is the only colour that works here."),
        P("dune_shimmer", "Dune Shimmer", "glow", 4, "The heat-haze itself, if you are quick with a jar."),
    ] },

    { n: 9, id: "steppe", short: "Thunder", name: "The Thunder Steppe", blurb: "Grass to the edge of the world, and the sky doing the talking.", parts: [
        P("horn_edge", "Horn Edge", "edge", 1, "Split lengthways and ground down on a stone."),
        P("lance_shaft", "Lance Shaft", "haft", 1, "Straight, light, and longer than you need."),
        P("horsehair", "Horsehair", "bind", 2, "Plaited by somebody who had all day on a horse."),
        P("bison_hide", "Bison Hide", "hide", 2, "One hide, one tent, one winter."),
        P("strike_fulgur", "Fulgurite", "ember", 3, "Lightning went into the ground and this came out."),
        P("storm_light", "Storm Light", "glow", 4, "The flash held between the flash and the thunder."),
        P("thunderstone", "Thunderstone", "stone", 3, "Found where the strike was. Warm for days."),
        P("sky_token", "The Sky Token", "charm", 6, "The steppe people hang these facing up."),
        P("flint_tooth", "Flint Tooth", "edge", 1, "Set in a jaw of wood, the old way."),
        P("gut_cord", "Gut Cord", "bind", 2, "Sings when the wind gets into it."),
        P("hawk_down", "Hawk Down", "hide", 2, "From under the wing, where the bird keeps the warm."),
        P("cloud_glow", "Cloud Glow", "glow", 4, "The underside of a storm, lit from inside."),
    ] },

    { n: 10, id: "glasspeaks", short: "Glass", name: "The Glass Peaks", blurb: "Mountains that ring when the wind crosses them.", parts: [
        P("prism_edge", "Prism Edge", "edge", 1, "Cuts, and throws a rainbow on the wall while it does."),
        P("quartz_rod", "Quartz Rod", "haft", 1, "Grown straight, as if it were told to."),
        P("silver_thread", "Silver Thread", "bind", 2, "Drawn fine enough to be lost in a sleeve."),
        P("rime_hide", "Rime Hide", "hide", 2, "Frozen stiff and then worked soft again."),
        P("core_ember", "Core Ember", "ember", 3, "From under the glass, where the mountain is still liquid."),
        P("facet_light", "Facet Light", "glow", 4, "One ray split eight ways and kept."),
        P("glass_core", "Glass Core", "stone", 3, "The heart of a peak, clear the whole way through."),
        P("peak_crystal", "The Peak Crystal", "charm", 6, "Only the summits grow these, and only sometimes."),
        P("shard_knife", "Shard Knife", "edge", 1, "Already shaped. Nobody admits to shaping it."),
        P("wire_silk", "Wire Silk", "bind", 2, "Spun by something that lives in the cold and the clear."),
        P("goat_hide", "Goat Hide", "hide", 2, "Off the only animal that can stand up here."),
        P("spectrum_glow", "Spectrum Glow", "glow", 4, "White light, taken apart and carried in pieces."),
    ] },

    { n: 11, id: "rotgarden", short: "Rotgarden", name: "The Rotgarden", blurb: "Somebody planted all of this. It got out.", parts: [
        P("thorn_lance", "Thorn Lance", "edge", 1, "Arm's length, and it was growing yesterday."),
        P("blight_stem", "Blight Stem", "haft", 1, "Hollow, light, and it will not rot further."),
        P("creeper_cord", "Creeper Cord", "bind", 2, "Cut it and it tightens. Nobody knows why."),
        P("husk_hide", "Husk Hide", "hide", 2, "What the thing left when it finished being it."),
        P("fever_ember", "Fever Ember", "ember", 3, "Warm the way a sick room is warm."),
        P("spore_light", "Spore Light", "glow", 4, "The garden lights its own paths after dark."),
        P("canker_stone", "Canker Stone", "stone", 3, "Grown inside a trunk like a pearl in a shell."),
        P("seed_heart", "The Seed Heart", "charm", 6, "Still viable. That is the problem with it."),
        P("bone_thorn", "Bone Thorn", "edge", 1, "The garden grows these out of what it eats."),
        P("fungal_thread", "Fungal Thread", "bind", 2, "Miles of it under every step you take."),
        P("moth_pelt", "Moth Pelt", "hide", 2, "Dust comes off it for a week."),
        P("rot_glow", "Rot Glow", "glow", 4, "Decay bright enough to read by."),
    ] },

    { n: 12, id: "starfall", short: "Starfall", name: "The Starfall Rim", blurb: "The edge of the map, where things land that were never up there.", parts: [
        P("star_edge", "Star Edge", "edge", 1, "Fell sharp. Has stayed sharp."),
        P("void_rod", "Void Rod", "haft", 1, "Weighs nothing in one hand and a great deal in two."),
        P("comet_thread", "Comet Thread", "bind", 2, "A tail, cooled and wound on a spool."),
        P("night_hide", "Night Hide", "hide", 2, "Takes no light back out."),
        P("sun_fragment", "Sun Fragment", "ember", 3, "A piece of a star, and it has not noticed it landed."),
        P("astral_light", "Astral Light", "glow", 4, "Older than the ground it is lying on."),
        P("meteor_core", "Meteor Core", "stone", 3, "Iron that has never been in the earth."),
        P("rim_sigil", "The Rim Sigil", "charm", 6, "Found facing up, every time, wherever it falls."),
        P("sky_glass", "Sky Glass", "edge", 1, "The ground went to glass where it hit."),
        P("gravity_cord", "Gravity Cord", "bind", 2, "Hangs straight down whichever way you hold it."),
        P("umbra_pelt", "Umbra Pelt", "hide", 2, "Off something that came down with the rest of it."),
        P("nebula_glow", "Nebula Glow", "glow", 4, "A handful of the thing stars are made out of."),
    ] },
];

export const groveMap = (n) => GROVE_MAPS.find((m) => m.n === Number(n)) || null;

// ── HOW MANY MAPS ACTUALLY EXIST TO WALK ─────────────────────────────────────────────────────────────────────
// The materials and the recipes for all twelve are declared above. The ZONES, the creatures that drop them and
// the art are map one only. Those are different jobs and this is the line between them: a recipe on map seven
// is designed, priced and gated, and there is nowhere to go and get its parts yet.
//
// ⚠️ EVERYTHING PLAYER-FACING READS THIS, NOT GROVE_MAPS.length. A workbench listing 144 recipes of which 132
// ask for materials that cannot be obtained is not a roadmap, it is a wall of grey text with the twelve real
// ones lost in it. Raise this number the day a map's zones land, and the bench, the gate and the tablet all
// move together.
export const MAPS_BUILT = 1;
export const mapIsBuilt = (n) => Number(n) <= MAPS_BUILT;

/** Every part of every generated map, flat, keyed by id — merged into GROVE_PARTS by the catalogue. */
export const MAP_PARTS = Object.fromEntries(
    GROVE_MAPS.filter((m) => m.parts).flatMap((m) =>
        m.parts.map((p) => [p.id, { name: p.name, tier: p.tier, blurb: p.blurb, map: m.n, role: p.role }])),
);

/**
 * The twelve tool recipes for one generated map, in the shape grove-recipes.js uses.
 *
 * ⚠️ A ROLE THAT A MAP HAS NO MATERIAL FOR IS A RECIPE THAT CANNOT BE WRITTEN, so this throws rather than
 * quietly producing a two-part tool. check-grove.mjs calls it for every map, which means a map missing a
 * material fails the gate instead of shipping a tool that costs less than its neighbours.
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
