// ── THE RECIPE BOOK, AS PURE DATA ────────────────────────────────────────────────────────────────────────────
// Lifted out of cooking.js unchanged. cooking.js is `server-only` and pulls in the database, the XP engine and
// half the marketplace; consumables.js needs the recipe list to build the DISH consumables (every dish you cook
// is now a thing you own and can feed to a pet), and cooking.js already imports consumables.js — so reading the
// book from there would have been an import cycle.
//
// So the book lives here, with no imports at all, and cooking.js re-exports it. There is exactly one list of
// recipes in the game and this is it; nothing below is duplicated anywhere.

// ── RECIPES ──────────────────────────────────────────────────────────────────────────────────────────────
// `need` is { ref → qty } over crops, fish and preps alike. A recipe is either a PREP (output goes back to the
// pantry as an ingredient) or a DISH (output is a consumable rolled from the tier's pool).
// ── WHAT A TIER COSTS ────────────────────────────────────────────────────────────────────────────────────────
// Luke: "we also need to make it require more ingredients as the tiers go up as they are way too easy to make
// a pile of."
//
// Measured before touching it, resolving every prep back to raw crops and fish — because a tier-5 plate that
// LISTS "2 starfruit + 1 essence" really costs the essence's own three as well, and the listed number hides
// most of the curve:
//
//     tier   listed   really
//       1      3.2      4.9
//       5      5.7     16.0
//
// So the chain already climbs 3.3x and the shelf still fills up, which says the multiplier is the lever rather
// than the base. Applied HERE, in the three builders, so one table decides it for all 98 recipes and the card
// a player reads is the same number the pantry is debited — a scale applied at spend time would have made the
// recipe card lie.
//
// TIER 1 IS UNTOUCHED, deliberately. It is where somebody learns the minigame, and the complaint is about
// piles of legendary dishes, not about flour. The compounding through preps does the rest: a tier-5 dish made
// of tier-4 preps pays the multiplier twice.
const TIER_COST = { 1: 1, 2: 1.25, 3: 1.5, 4: 1.75, 5: 2 };
const cost = (tier, need) => Object.fromEntries(
    Object.entries(need || {}).map(([k, v]) => [k, Math.max(1, Math.round(v * (TIER_COST[tier] || 1)))]),
);

const R = (id, name, tier, need, flavor) => ({ id, name, tier, need: cost(tier, need), flavor, kind: "dish" });
// A BAIT recipe. Shaped exactly like a prep — it has an `out` that lands in the pantry — because that is what
// it is: something you cook in order to spend it somewhere else. Fishing is the only thing that spends it.
const B = (id, name, tier, need, out, flavor) => ({ id, name, tier, need: cost(tier, need), out, flavor, kind: "bait" });
const P = (id, name, tier, need, out, flavor) => ({ id, name, tier, need: cost(tier, need), out, flavor, kind: "prep" });

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

    // ═══ BAIT · cooked for the water, spent on a cast ═══
    B("kb_dough_ball",  "Roll a Dough Ball",     1, { p_dough: 1 },                        "b_dough_ball",   "The first thing anybody learns to throw."),
    B("kb_worms",       "Pot the Worms",         1, { carrot: 2, potato: 1 },              "b_worm_pot",     "The bed was full of them anyway."),
    B("kb_crust",       "Bait the Crust",        1, { p_flour: 2, wheat: 2 },              "b_bread_crust",  "Stale bread, salt, and a little patience."),
    B("kb_kernels",     "Sweeten the Kernels",   1, { corn: 3, p_butter: 1 },              "b_corn_kernel",  "Butter, heat, and they split open."),
    B("kb_paste",       "Work the Berry Paste",  2, { p_jam: 1, strawberry: 3 },           "b_jam_paste",    "Thin it with water or it just sits there."),
    B("kb_cockle",      "Mash the Cockles",      2, { p_brine: 2, fish_sardine: 2 },       "b_cockle_mash",  "Hold your breath and keep stirring."),
    B("kb_pellets",     "Press the Pellets",     2, { p_syrup: 1, p_flour: 2 },            "b_syrup_pellet", "Rolled small so they sink slowly."),
    B("kb_chum",        "Chum the Pumpkin",      2, { p_puree: 1, pumpkin: 2 },            "b_pumpkin_chum", "A whole one, over the side, and wait."),
    B("kb_strips",      "Cut the Smoked Strips", 3, { p_smoked: 1, fish_mackerel: 2 },     "b_smoked_strip", "Thin enough to move in the current."),
    B("kb_roe",         "Bind the Roe",          3, { p_roe: 1, fish_perch: 2 },           "b_roe_cluster",  "Netting, twine, and a steady hand."),
    B("kb_wine_bait",   "Soak it in Wine",       3, { p_wine: 1, fish_herring: 3 },        "b_wine_soaked",  "A waste of good wine. It works."),
    B("kb_fire_oil",    "Drizzle the Fire Oil",  3, { p_chilli: 1, fish_urchin: 2 },       "b_fire_oil",     "Gloves. Every time. Ask anyone."),
    B("kb_minnow",      "Carve a Glass Minnow",  4, { p_essence: 1, fish_smelt: 3 },       "b_glass_minnow", "Carved from the inside out."),
    B("kb_deep_lure",   "Weight a Deep Lure",    4, { p_smoked: 2, fish_lionfish: 2 },     "b_deep_lure",    "Heavy enough to reach the cold layer."),
    B("kb_marrow",      "Render the Marrow",     4, { p_leviathan: 1, fish_squid: 2 },     "b_marrow_paste", "Rendered slow. Do not do it indoors."),
    B("kb_storm_chum",  "Mix the Storm Chum",    4, { p_roe: 2, fish_stormpike: 1 },       "b_storm_chum",   "Made to be thrown into weather."),
    B("kb_star_bait",   "Cut the Star Bait",     5, { starfruit: 2, p_essence: 1 },        "b_star_bait",    "On the cross, so every point catches the light."),
    B("kb_kraken_ink",  "Draw the Kraken Ink",   5, { fish_kraken: 1, p_brine: 2 },        "b_kraken_ink",   "It stains everything it touches, permanently."),
    B("kb_tidewyrm",    "Portion the Tidewyrm",  5, { fish_tidewyrm: 1, p_chilli: 1 },     "b_tidewyrm_cut", "One monster, cut down for another."),
    B("kb_leviathan",   "Fill the Chum Bucket",  5, { fish_leviathan: 1, p_leviathan: 1 }, "b_leviathan_ch", "The whole bucket. Stand back."),

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

// ── THE MASTER'S BOOK · TIER 6 ─────────────────────────────────────────────────────
// Eight pages that do not exist for anybody who has not bought the book (25,000 chips, at the Counter).
//
// SEPARATE FROM `RECIPES`, for the same reason the deep fish are separate from `FISH`: that list is the
// denominator. It drives "you know 41 of 68", the per-tier split on the kitchen screen and the shop's
// "nothing left to teach" check. Eight pages nobody can reach would sit in everybody's book as a permanent
// gap with no way to fill it.
//
// AND NOTHING TEACHES THEM. Every source that hands out a recipe is bounded by RECIPE_BANDS, and the widest
// band tops out at tier 5 — so there is no chest, seam, dig, cast, wheel, raid or boss that can produce one
// of these by accident. Buying the book IS how you learn them, all eight at once. That is deliberate: at
// 25,000 chips a drip-feed would be a second grind on top of the one already paid for.
//
// INGREDIENTS ARE ALL REACHABLE WITHOUT THE OTHER UNLOCKS. Tempting as it was to build these on the Deep
// Water species, a member can own this book and not the charts, and a recipe you can never cook is worse
// than no recipe at all.
export const MASTER_RECIPES = [
    P("k_ash",      "Bank the Ember Ash",   6, { p_chilli: 2, p_essence: 1 },                    "p_emberash",  "It has to go grey before it is any use."),
    P("k_gilding",  "Beat the Gold Leaf",   6, { goldenapple: 4, p_syrup: 1 },                   "p_goldleaf",  "Thin enough to read through."),
    R("r_ash_course",  "Ember Ash Course",     6, { p_emberash: 1, p_leviathan: 1, p_roe: 2 },       "Served on the coals it was cooked in."),
    R("r_gilded_wolf", "The Gilded Wolf",      6, { p_goldleaf: 2, p_smoked: 3, p_wine: 2 },         "Nobody eats the first bite. They look at it."),
    R("r_nine_seas",   "Nine Seas Service",    6, { fish_kraken: 1, fish_whale: 1, fish_narwhal: 1, p_brine: 3 }, "One course for every water anyone has charted."),
    R("r_last_harvest","The Last Harvest",     6, { starfruit: 3, p_essence: 2, p_puree: 2, p_jam: 2 }, "Everything the year gave, on one board."),
    R("r_masters_own", "The Master's Own",     6, { p_emberash: 1, p_goldleaf: 1, p_essence: 2, p_leviathan: 1 }, "The dish the book is named for."),
    R("r_long_night",  "Feast of the Long Night", 6, { p_goldleaf: 1, p_wine: 3, p_syrup: 2, pumpkin: 4 }, "It is meant to take all night. That is the point."),
];

const BOOK = [...RECIPES, ...MASTER_RECIPES];
// Resolves BOTH books. A member who owns a master page has it in mkt_recipe_known and needs it to render,
// and a page nobody can cook is not protected by refusing to name it.
export const recipeById = (id) => BOOK.find((r) => r.id === id) || null;

/** The book this member can read. Owners see tier 6; nobody else can tell it exists. */
export const recipeBookFor = (master) => (master ? BOOK : RECIPES);
