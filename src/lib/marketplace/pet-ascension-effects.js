// ── WHAT EACH STONE DOES TO EACH PET ─────────────────────────────────────────────────────────────────────────
// Pure and client-safe: the pets page draws these and combinePetBonuses applies them from the same table.
//
// ── WHAT THIS REPLACES, AND WHY ──────────────────────────────────────────────────────────────────────────────
// The first cut gave every pet in the game the SAME two stones: Light was +12% to a pack-wide aura, Dark was
// x1.5 on whatever ability the pet already had. Ninety-eight pets, thirty-eight distinct abilities, and one
// question asked identically every time — so the pet you were enshrining never changed the decision, which
// means there was no decision. It was a table with two columns.
//
// It was also wrong on the numbers. Measured against the biggest real collection in the Den (thirteen pets), a
// Lightstone moved Might by half a point: the aura multiplied a pack passive total so small that it rounded
// away, and only became meaningful past twenty-five pets, which nobody is anywhere near. Dark beat it in every
// realistic case — and on five ability keys Dark did nothing whatsoever, because x1.5 landed above a cap and
// was discarded silently. A three-week item that pays zero.
//
// So the aura is gone and the choice is per pet, themed to the animal, with no fixed relationship between the
// two stones. Some pets are sharpest when you double what they already do. Some are more interesting when they
// pick up a second trade. A few are a real toss-up. That is the point.
//
// ── HOW AN EFFECT IS ALLOWED TO WORK ─────────────────────────────────────────────────────────────────────────
// Two kinds, and only two, because the Den's most common bug by a distance is an effect printed on a card that
// no code consumes ("declared but never read"). Both of these route through the SAME applyPerk() the equipped
// ability already uses, so an authored effect is live the moment it is written — it cannot be a paragraph.
//
//   AMPLIFY  the pet's own ability, at `mult`. What Dark used to be, except the number is chosen per pet
//            against that ability's own ceiling rather than being 1.5 across the board.
//   GRAFT    a SECOND ability, `key`, at `scale` of its natural value for that pet's rarity. This is where the
//            character comes from: a fox that learns to raid chests, an owl that keeps watch after closing, a
//            crocodile that learns to finish. Grafted abilities are rarity-scaled and capped exactly like a
//            native one, so a common's second trade is a common's second trade.
//
// Enshrining ALWAYS keeps the ability permanently — that is what the word means and it is true of both stones.
// The stone decides what happens on top.
//
// `note` is flavour and may be empty. The mechanical sentence is GENERATED from the effect (see
// ascensionEffectLine) rather than typed here, so a card can never advertise a number the game does not pay.

/** @typedef {{name: string, kind: "amplify"|"graft", mult?: number, key?: string, scale?: number, note?: string}} StoneEffect */

// AMPLIFY multipliers are chosen against the ability's headroom, not by feel: an ability that caps early (proc
// chances, forge_spark at 20) gets a bigger number because most of it is going to be shaved off anyway, while an
// uncapped stat perk gets a smaller one. GRAFT scales sit at 0.6–1.0 — a second trade learned late is rarely as
// good as the one it was born with, and the handful at 1.0 are pets whose whole character is the second thing.
export const ASCENSION_EFFECTS = {
    // ── THE CASINO'S FIVE AND SABLE'S THREE ───────────────────────────────────────────────────────────────
    // All eight were falling through to FALLBACK_EFFECT — the deliberately dull pair — and check:ascension
    // was already failing on every one of them. Two were worse than dull: the Ferret and the Magpie both
    // carry chest_luck, which is CAPPED at 20, so an amplify Darkstone would have been arithmetically
    // identical to the Lightstone. The gate caught that too ("both stones do exactly the same thing — that is
    // not a choice"), and it is right: a choice between two identical outcomes is a prompt, not a decision.
    //
    // So the capped pair get a GRAFT on both stones — widen rather than deepen, the same answer the Beach
    // Crab already uses — and the six with headroom keep the usual shape: Lightstone teaches a second trade,
    // Darkstone doubles down on the one it was born with.

    // Bought at the Counter. Each already makes the FLOOR kinder; the stones are about everything else.
    copper_paw: {
        light: { name: "Pays Its Own Way", kind: "graft", key: "fortune", scale: 0.8, note: "It has been sleeping on the change tray for years. Some of it stuck." },
        dark: { name: "Heavier Than It Looks", kind: "amplify", mult: 2 },
    },
    tallyman: {
        light: { name: "Knows What You Are Owed", kind: "graft", key: "town_haggle", scale: 0.9, note: "Nobody argues with the man holding the book." },
        dark: { name: "Counts Twice", kind: "amplify", mult: 2 },
    },
    gilded_magpie: {
        // chest_luck caps at 20, so amplifying it is a no-op past Lv3. Both stones widen instead.
        light: { name: "Everything That Shines", kind: "graft", key: "gold_find", scale: 1, note: "It never learned the difference between yours and its own." },
        dark: { name: "The Whole Nest", kind: "graft", key: "beachcomber", scale: 0.9, note: "Chest luck is capped where it stands, so the Darkstone sends it further afield instead of deeper." },
    },
    croupiers_cat: {
        light: { name: "Sits Where the Cards Land", kind: "graft", key: "first_hit", scale: 0.8, note: "It has watched every deal this room has ever made." },
        dark: { name: "The House Cat Always Wins", kind: "amplify", mult: 1.8 },
    },
    night_auditor: {
        light: { name: "Reconciled", kind: "graft", key: "xp_gain", scale: 0.9, note: "It works the hours nobody watches, and it learns in them." },
        dark: { name: "The Books Are Never Wrong", kind: "amplify", mult: 2 },
    },

    // Sable's three, behind the rope. No casinoPerk — what a stone does to these is the whole of what they do.
    house_ferret: {
        // Same cap as the Magpie, same answer: two grafts, so the choice is a real one.
        light: { name: "Under Every Floorboard", kind: "graft", key: "truffle_hog", scale: 0.8, note: "Whatever rolled under there, it knows." },
        dark: { name: "The Whole Room", kind: "graft", key: "gold_find", scale: 0.9, note: "Chest luck is capped where it stands, so the Darkstone widens the hunt rather than deepening it." },
    },
    velvet_lynx: {
        light: { name: "Everyone Knows the Lynx", kind: "graft", key: "fortune", scale: 0.9, note: "It has never once been asked to leave, and it has never once paid." },
        dark: { name: "Never Asked to Leave", kind: "amplify", mult: 2 },
    },
    midnight_crane: {
        light: { name: "Misses Nothing At All", kind: "graft", key: "crit_chance", scale: 0.8, note: "It stands at the end of the bar and it is always facing the room." },
        dark: { name: "The Long Watch", kind: "amplify", mult: 2.2 },
    },

    // ── THE LEVELLING PETS ───────────────────────────────────────────────────────────────────────────────────
    bunny: {
        light: { name: "Warren Cache", kind: "graft", key: "farm_seed", scale: 0.9, note: "Everything a rabbit digs, it digs twice." },
        dark: { name: "Bottomless Burrow", kind: "amplify", mult: 2, note: "There is more down there than anyone put in." },
    },
    frog: {
        light: { name: "Fly Catcher", kind: "graft", key: "angler_bite", scale: 0.8, note: "It has been watching the water this whole time." },
        dark: { name: "Tongue Like a Whip", kind: "amplify", mult: 2.2 },
    },
    chick: {
        light: { name: "Scratched Earth", kind: "graft", key: "farm_speed", scale: 0.8, note: "Turned soil warms faster." },
        dark: { name: "Every Grain", kind: "amplify", mult: 2.2 },
    },
    kitten: {
        light: { name: "Landed Right", kind: "graft", key: "fortune", scale: 1, note: "Nine times out of nine." },
        dark: { name: "Claws Out", kind: "amplify", mult: 2 },
    },
    fox_kit: {
        light: { name: "Raided the Henhouse", kind: "graft", key: "chest_luck", scale: 0.9, note: "It was never only about the hens." },
        dark: { name: "Throat Bite", kind: "amplify", mult: 2 },
    },
    wolf_pup: {
        light: { name: "The Pack Runs Together", kind: "graft", key: "town_rally", scale: 0.8 },
        dark: { name: "Full Grown", kind: "amplify", mult: 2, note: "It is not a pup any more." },
    },
    owl: {
        light: { name: "Night Watch", kind: "graft", key: "night_angler", scale: 1, note: "It keeps the shop's hours in reverse." },
        dark: { name: "Every Lesson", kind: "amplify", mult: 2.2 },
    },
    bear_cub: {
        light: { name: "Turned the Log", kind: "graft", key: "truffle_hog", scale: 0.7, note: "Whatever was under it is yours." },
        dark: { name: "Full Weight", kind: "amplify", mult: 2 },
    },
    raven: {
        light: { name: "Shiny Things", kind: "graft", key: "gold_find", scale: 1 },
        dark: { name: "The Hoard Grows", kind: "amplify", mult: 2.2, note: "It has been counting." },
    },
    serpent: {
        light: { name: "Venom Takes", kind: "graft", key: "erupt", scale: 0.8, note: "Slow at first, and then all at once." },
        dark: { name: "Deeper Fangs", kind: "amplify", mult: 2 },
    },
    fawn: {
        light: { name: "Gentle Tread", kind: "graft", key: "green_thumb", scale: 0.9, note: "It walks other people's fields without breaking a stem." },
        dark: { name: "Grown Overnight", kind: "amplify", mult: 2 },
    },
    bat: {
        light: { name: "Reads the Dark", kind: "graft", key: "night_angler", scale: 0.9 },
        dark: { name: "Perfect Return", kind: "amplify", mult: 2, note: "The sound comes back and it already knows." },
    },
    scorpion: {
        light: { name: "Struck First", kind: "graft", key: "first_blood", scale: 0.9 },
        dark: { name: "Barbed", kind: "amplify", mult: 2 },
    },
    tiger_cub: {
        light: { name: "The Second Paw", kind: "graft", key: "chain_strike", scale: 0.8, note: "One is a warning." },
        dark: { name: "Learned the Kill", kind: "graft", key: "crit_power", scale: 0.9, note: "The pounce was always there. Now it lands somewhere that matters." },
    },
    seahorse: {
        light: { name: "Combs the Shallows", kind: "graft", key: "sea_dredge", scale: 0.8 },
        dark: { name: "Knows Every Reef", kind: "amplify", mult: 2.2, note: "It has not left this stretch of water in its life." },
    },
    eagle: {
        light: { name: "Talons Down", kind: "graft", key: "angler_size", scale: 0.9, note: "It fishes, and it does not miss." },
        dark: { name: "Nothing Hides", kind: "amplify", mult: 2 },
    },
    lion_cub: {
        light: { name: "The Pride Follows", kind: "graft", key: "town_rally", scale: 0.9 },
        dark: { name: "Holds the Rock", kind: "graft", key: "might", scale: 0.9, note: "It stopped being the smallest thing on it." },
    },
    gorilla: {
        light: { name: "Beats the Chest", kind: "graft", key: "might", scale: 1 },
        dark: { name: "Silverback", kind: "amplify", mult: 1.9, note: "The plaza gets quiet." },
    },
    croc: {
        light: { name: "Death Roll", kind: "graft", key: "execute", scale: 0.9, note: "It does not let go and it does not hurry." },
        dark: { name: "The River Toll", kind: "amplify", mult: 1.9 },
    },
    hydra: {
        light: { name: "Another Head", kind: "graft", key: "extra_strike", scale: 1, note: "Cut one off." },
        dark: { name: "Two More Heads", kind: "graft", key: "crit_chance", scale: 0.9, note: "Cut one off and count again." },
    },
    griffin: {
        light: { name: "Out of the Sun", kind: "graft", key: "first_hit", scale: 0.9 },
        dark: { name: "Above the Field", kind: "graft", key: "first_blood", scale: 0.85, note: "It sees the fight start before anyone in it does." },
    },
    unicorn: {
        light: { name: "Wishes Twice", kind: "graft", key: "chest_luck", scale: 0.9 },
        dark: { name: "Granted", kind: "amplify", mult: 2.2, note: "You did not have to ask again." },
    },
    dragon_whelp: {
        light: { name: "Ember in the Forge", kind: "graft", key: "forge_spark", scale: 0.9, note: "The smiths keep it in a bucket by the anvil." },
        dark: { name: "Full Breath", kind: "amplify", mult: 2 },
    },
    pegasus: {
        light: { name: "Tailwind", kind: "graft", key: "following_sea", scale: 1, note: "Everything you send out comes home early." },
        dark: { name: "Never Lands", kind: "amplify", mult: 2.2 },
    },
    baby_rex: {
        light: { name: "Grown Teeth", kind: "graft", key: "might", scale: 1 },
        dark: { name: "Grown Into It", kind: "graft", key: "ferocity", scale: 1, note: "There is no longer anything baby about it." },
    },
    sky_whale: {
        light: { name: "Sounds the Deep", kind: "graft", key: "sea_dredge", scale: 0.9, note: "It goes down further than the dredge does." },
        dark: { name: "The Long Migration", kind: "graft", key: "following_sea", scale: 0.9, note: "It has crossed water that is not on any chart." },
    },
    chameleon: {
        light: { name: "Every Colour", kind: "graft", key: "crit_chance", scale: 1 },
        dark: { name: "Hexed Through", kind: "amplify", mult: 2 },
    },
    elder_dragon: {
        light: { name: "The Cataclysm Opens", kind: "graft", key: "onslaught", scale: 0.9, note: "It does not wait for the boss to be weak." },
        dark: { name: "Old and Patient", kind: "graft", key: "fortune", scale: 0.9, note: "It has outlived everyone who counted its hoard." },
    },

    // ── THE SHOP PETS ────────────────────────────────────────────────────────────────────────────────────────
    penguin: {
        light: { name: "Under the Ice", kind: "graft", key: "angler_bite", scale: 0.9 },
        dark: { name: "Colder Than That", kind: "amplify", mult: 2.2 },
    },
    hedgehog: {
        light: { name: "Kept the Change", kind: "graft", key: "gold_find", scale: 0.9 },
        dark: { name: "A Sharper Bargain", kind: "amplify", mult: 2, note: "Nobody enjoys haggling with it twice." },
    },
    sheep: {
        light: { name: "Golden Fleece", kind: "graft", key: "xp_gain", scale: 1 },
        dark: { name: "Shorn Twice", kind: "amplify", mult: 2 },
    },
    crab: {
        light: { name: "Sideways Search", kind: "graft", key: "beachcomber", scale: 1, note: "It covers ground nobody thinks to walk." },
        dark: { name: "Sifts It All", kind: "amplify", mult: 2.2 },
    },
    turtle: {
        light: { name: "Never Tires", kind: "graft", key: "second_wind", scale: 1 },
        dark: { name: "Hauls Deeper", kind: "amplify", mult: 2.2 },
    },
    parrot: {
        light: { name: "Repeats the Steps", kind: "graft", key: "kitchen_prep", scale: 0.9 },
        dark: { name: "Word for Word", kind: "amplify", mult: 1.9, note: "It has heard the recipe once. That was enough." },
    },
    dolphin: {
        light: { name: "Rides the Bow", kind: "graft", key: "following_sea", scale: 0.9 },
        dark: { name: "The Pod Knows", kind: "amplify", mult: 2.2 },
    },
    monkey: {
        light: { name: "Quick Hands", kind: "graft", key: "kitchen_prep", scale: 1 },
        dark: { name: "Fire Handled", kind: "amplify", mult: 2 },
    },
    panda: {
        light: { name: "Eats and Grows", kind: "graft", key: "farm_speed", scale: 0.9 },
        dark: { name: "Glut", kind: "amplify", mult: 2 },
    },
    kangaroo: {
        light: { name: "Opens with the Kick", kind: "graft", key: "first_hit", scale: 0.9 },
        dark: { name: "Both Feet", kind: "amplify", mult: 1.9 },
    },

    // ── THE ACHIEVEMENT PETS ─────────────────────────────────────────────────────────────────────────────────
    ladybug: {
        light: { name: "Clean Leaves", kind: "graft", key: "farm_yield", scale: 0.8, note: "Nothing else got to eat first." },
        dark: { name: "Patrolled", kind: "amplify", mult: 2 },
    },
    bee: {
        light: { name: "The Second Flowering", kind: "graft", key: "green_thumb", scale: 0.85, note: "It went back over everything the first pass missed." },
        dark: { name: "The Whole Meadow", kind: "amplify", mult: 2 },
    },
    sloth: {
        light: { name: "Slow Hands", kind: "graft", key: "green_thumb", scale: 0.9, note: "It gets there. It always gets there." },
        dark: { name: "Ripened Whole", kind: "amplify", mult: 2.2 },
    },
    beaver: {
        light: { name: "Flooded the Field", kind: "graft", key: "farm_yield", scale: 0.9 },
        dark: { name: "Dammed the Creek", kind: "amplify", mult: 2 },
    },
    raccoon: {
        light: { name: "Went Through the Bins", kind: "graft", key: "chest_luck", scale: 0.9 },
        dark: { name: "Went Back for Seconds", kind: "graft", key: "kitchen_portion", scale: 0.9, note: "It has worked out where the bins are kept." },
    },
    flamingo: {
        light: { name: "Stands in the Shallows", kind: "graft", key: "angler_bite", scale: 0.9, note: "One leg, all day, and it never misses." },
        dark: { name: "Struts Harder", kind: "amplify", mult: 2 },
    },
    toucan: {
        light: { name: "Sweet Tooth", kind: "graft", key: "kitchen_portion", scale: 0.8 },
        dark: { name: "Smells It Coming", kind: "amplify", mult: 1.9 },
    },
    spirit_fox: {
        light: { name: "The Favour Spreads", kind: "graft", key: "xp_gain", scale: 1 },
        dark: { name: "The Fox's Due", kind: "amplify", mult: 2.2 },
    },
    runebound_drake: {
        light: { name: "Runes on the Scrap", kind: "graft", key: "forge_salvage", scale: 0.9 },
        dark: { name: "The Runes Take", kind: "graft", key: "crit_power", scale: 0.9, note: "The bindings are not decoration. They are load-bearing." },
    },
    radiant_phoenix: {
        light: { name: "Radiance", kind: "graft", key: "fortune", scale: 1 },
        dark: { name: "Rises Richer", kind: "graft", key: "town_haggle", scale: 0.9, note: "It has come back often enough to know what things cost." },
    },

    // ── THE FORGE PETS ───────────────────────────────────────────────────────────────────────────────────────
    ember_whelp: {
        light: { name: "The Ember Catches", kind: "graft", key: "erupt", scale: 0.8 },
        dark: { name: "Bellows", kind: "amplify", mult: 2.4, note: "A spark is only a spark until somebody feeds it air." },
    },
    cinder_hound: {
        light: { name: "A Nose for Scrap", kind: "graft", key: "chest_luck", scale: 0.8 },
        dark: { name: "Strips It Bare", kind: "amplify", mult: 2 },
    },
    anvil_golem: {
        light: { name: "Takes the Blow", kind: "graft", key: "forge_spark", scale: 0.9, note: "Everything that misses the work hits the golem instead." },
        dark: { name: "Takes the Blow", kind: "amplify", mult: 2.3, note: "Everything that misses the work hits the golem instead." },
    },
    molten_salamander: {
        light: { name: "Runs Hot", kind: "graft", key: "kitchen_heat", scale: 0.9, note: "The kitchen borrows it on cold mornings." },
        dark: { name: "Swims the Crucible", kind: "graft", key: "forge_salvage", scale: 0.9, note: "It has never once been burned." },
    },
    forgeheart_wyrm: {
        light: { name: "Forgefire", kind: "graft", key: "might", scale: 1 },
        dark: { name: "White Heat", kind: "graft", key: "crit_power", scale: 0.9, note: "Struck while it is still glowing." },
    },

    // ── THE CHEST PETS ───────────────────────────────────────────────────────────────────────────────────────
    tropical_fish: {
        light: { name: "Knows the Reef", kind: "graft", key: "angler_size", scale: 0.85, note: "Small, and entirely aware of where the big ones sleep." },
        dark: { name: "Calls Them All In", kind: "amplify", mult: 2.2 },
    },
    axolotl: {
        light: { name: "Grows It Back", kind: "graft", key: "second_wind", scale: 1, note: "It has lost more than most things have had." },
        dark: { name: "Grows It Back Twice", kind: "amplify", mult: 2.5, note: "Whatever you take off it, it has already started replacing." },
    },
    butterfly: {
        light: { name: "Somewhere Warmer", kind: "graft", key: "farm_speed", scale: 0.9, note: "It has been to the end of the season and back." },
        dark: { name: "Second Season", kind: "amplify", mult: 2.3, note: "It came back, which is not what anybody expected." },
    },
    squid: {
        light: { name: "Ink and Away", kind: "graft", key: "first_hit", scale: 0.9 },
        dark: { name: "The Ambush Holds", kind: "amplify", mult: 2 },
    },
    jellyfish: {
        light: { name: "The Bloom", kind: "graft", key: "chain_strike", scale: 0.8, note: "There is never only one." },
        dark: { name: "Sting Surge", kind: "amplify", mult: 2 },
    },
    octopus: {
        light: { name: "Opens Anything", kind: "graft", key: "chest_luck", scale: 1, note: "Jars, chests, doors that were locked." },
        dark: { name: "All Eight at Once", kind: "graft", key: "crit_chance", scale: 0.9, note: "It has never needed to choose which arm." },
    },
    corsair_parrot: {
        light: { name: "The Crew's Share", kind: "graft", key: "gold_find", scale: 1 },
        dark: { name: "The Captain's Share", kind: "amplify", mult: 2 },
    },
    marlin: {
        light: { name: "The Run", kind: "graft", key: "following_sea", scale: 0.8 },
        dark: { name: "Runs the Line Out", kind: "graft", key: "angler_bite", scale: 0.9, note: "You do not land it. You survive it." },
    },
    anglerfish: {
        light: { name: "The Light Draws Deeper", kind: "graft", key: "sea_dredge", scale: 0.9 },
        dark: { name: "Luring Light", kind: "amplify", mult: 2.2 },
    },
    sea_wyrm: {
        light: { name: "The Trench Gives Up Its Gold", kind: "graft", key: "sea_plunder", scale: 0.9 },
        dark: { name: "Coils Through the Wreck", kind: "graft", key: "beachcomber", scale: 0.9, note: "It knows which hulls still have something in them." },
    },

    // ── THE BOSS PETS ────────────────────────────────────────────────────────────────────────────────────────
    vulture: {
        light: { name: "Waits It Out", kind: "graft", key: "execute", scale: 0.9, note: "It was always going to be there at the end." },
        dark: { name: "Circling Death", kind: "amplify", mult: 2 },
    },
    minotaur: {
        light: { name: "Through the Wall", kind: "graft", key: "might", scale: 1 },
        dark: { name: "The Charge", kind: "amplify", mult: 2 },
    },
    centaur: {
        light: { name: "Nocks a Second", kind: "graft", key: "chain_strike", scale: 0.8 },
        dark: { name: "The Second Volley", kind: "graft", key: "execute", scale: 0.85, note: "It nocks the next one before the first has landed." },
    },
    imp: {
        light: { name: "Sets the Kitchen Alight", kind: "graft", key: "kitchen_heat", scale: 0.9, note: "Nobody asked it to." },
        dark: { name: "Hellfire", kind: "amplify", mult: 2 },
    },
    polar_bear: {
        light: { name: "Through the Ice", kind: "graft", key: "angler_size", scale: 0.9 },
        dark: { name: "Under the Ice", kind: "graft", key: "first_blood", scale: 0.85, note: "You do not hear it coming across snow." },
    },
    mammoth: {
        light: { name: "The Herd Moves", kind: "graft", key: "town_rally", scale: 0.9 },
        dark: { name: "The Whole Herd", kind: "graft", key: "might", scale: 1, note: "Ten tonnes, and it has decided." },
    },
    wyvern: {
        light: { name: "Folded Wings", kind: "graft", key: "crit_power", scale: 0.9, note: "It stops flying and starts falling, on purpose." },
        dark: { name: "Out of the Sun", kind: "graft", key: "execute", scale: 0.85, note: "It only ever dives once." },
    },
    sea_serpent: {
        light: { name: "The Tide Comes In", kind: "graft", key: "sea_plunder", scale: 0.9 },
        dark: { name: "Coil and Coil", kind: "graft", key: "onslaught", scale: 0.85, note: "It is longer than the ship." },
    },
    fairy: {
        light: { name: "A Blessing on the Field", kind: "graft", key: "green_thumb", scale: 1 },
        dark: { name: "Never Where You Looked", kind: "graft", key: "crit_chance", scale: 0.85, note: "Small, quick, and unreasonably pleased about it." },
    },
    kraken: {
        light: { name: "Takes the Ship Down With It", kind: "graft", key: "sea_plunder", scale: 1 },
        dark: { name: "Down With It", kind: "graft", key: "execute", scale: 0.9, note: "Nothing it has taken hold of has come back up." },
    },

    // ── THE ELITE PETS ───────────────────────────────────────────────────────────────────────────────────────
    molten_phoenix: {
        light: { name: "Rises Again", kind: "graft", key: "execute", scale: 0.9, note: "The opener and the closer, from the same bird." },
        dark: { name: "Burns On the Way Down", kind: "graft", key: "first_hit", scale: 0.85, note: "It does not need to survive the dive." },
    },
    eternal_wolf: {
        light: { name: "The Pack Endures", kind: "graft", key: "ferocity", scale: 1 },
        dark: { name: "The Pack Remembers", kind: "graft", key: "might", scale: 1, note: "It has been running this ground longer than the ground has had a name." },
    },
    bounty_hound: {
        light: { name: "Runs the Scent Down", kind: "graft", key: "gold_find", scale: 1 },
        dark: { name: "Paid on Delivery", kind: "graft", key: "gold_find", scale: 0.9, note: "It has never once lost a scent, or a fee." },
    },

    // ── THE PASTORAL PETS ────────────────────────────────────────────────────────────────────────────────────
    honeybee: {
        light: { name: "Works the Whole Row", kind: "graft", key: "green_thumb", scale: 0.9, note: "It does not care whose field it is." },
        dark: { name: "The Whole Hive", kind: "graft", key: "farm_yield", scale: 0.85, note: "It does not work alone and it never did." },
    },
    barn_cat: {
        light: { name: "Keeps the Barn", kind: "graft", key: "kitchen_larder", scale: 0.9, note: "Nothing gets into the stores while it is awake." },
        dark: { name: "Night Prowler", kind: "amplify", mult: 2 },
    },
    piglet: {
        light: { name: "Roots It Out", kind: "graft", key: "farm_seed", scale: 0.9 },
        dark: { name: "Truffle Snout", kind: "amplify", mult: 1.6, note: "It already comes back most days. Now it comes back." },
    },
    hen: {
        light: { name: "Scratches It Up", kind: "graft", key: "farm_seed", scale: 0.9, note: "Whatever was buried there is on the surface now." },
        dark: { name: "Broody", kind: "amplify", mult: 2.4, note: "It has been sitting on that patch for a week and it is not moving." },
    },
    spring_lamb: {
        light: { name: "First of the Season", kind: "graft", key: "farm_speed", scale: 0.9, note: "Everything comes early where it has been standing." },
        dark: { name: "Spring Lamb", kind: "amplify", mult: 1.8 },
    },
    scarecrow_crow: {
        light: { name: "Reads the Sky", kind: "graft", key: "angler_bite", scale: 0.9 },
        dark: { name: "Reads the Sky", kind: "graft", key: "following_sea", scale: 0.9, note: "It has known the weather was turning since this morning." },
    },
    field_mouse: {
        light: { name: "Knows Every Hole", kind: "graft", key: "beachcomber", scale: 0.9, note: "Second Wind is binary — the Darkstone has nothing to double, so this one only grafts." },
        dark: { name: "Quick Whiskers", kind: "graft", key: "angler_bite", scale: 1 },
    },
    golden_goose: {
        light: { name: "Lays", kind: "graft", key: "gold_find", scale: 1 },
        dark: { name: "Walks the Whole Beach", kind: "graft", key: "sea_dredge", scale: 1, note: "Beachcomber is capped where it stands, so the Darkstone widens the search instead of deepening it." },
    },
    elephant_spear: {
        light: { name: "Knows Every Trader", kind: "graft", key: "town_haggle", scale: 1 },
        dark: { name: "The Merchant's Nose", kind: "amplify", mult: 2 },
    },

    // ── THE TOWN-RAID PETS ───────────────────────────────────────────────────────────────────────────────────
    warbanner_wolf: {
        light: { name: "The Banner Carries", kind: "graft", key: "might", scale: 1 },
        dark: { name: "Takes the Field", kind: "graft", key: "chest_luck", scale: 0.9, note: "Whatever the raid leaves, it is standing on." },
    },
    bandit_shade: {
        light: { name: "Lifts the Purse Too", kind: "graft", key: "gold_find", scale: 1 },
        dark: { name: "Knows Every Price", kind: "graft", key: "town_haggle", scale: 1, note: "It set most of them." },
    },
    goblin_warchief: {
        light: { name: "The Warband Answers", kind: "graft", key: "first_blood", scale: 0.9 },
        dark: { name: "First Through the Gate", kind: "graft", key: "chest_luck", scale: 0.85, note: "It picks the room before anyone else is in it." },
    },
    golem_heart: {
        light: { name: "The Heart Still Beats", kind: "graft", key: "forge_spark", scale: 1 },
        dark: { name: "Struck From the Same Vein", kind: "graft", key: "might", scale: 1, note: "It remembers being ore, and being struck." },
    },

    // ── THE FISHING PETS ─────────────────────────────────────────────────────────────────────────────────────
    reef_seahorse: {
        light: { name: "Holds the Current", kind: "graft", key: "angler_size", scale: 0.9, note: "It weighs nothing and it does not move." },
        dark: { name: "Reef Sense", kind: "amplify", mult: 2.2 },
    },
    lantern_jelly: {
        light: { name: "Lights the Whole Bay", kind: "graft", key: "night_angler", scale: 1, note: "It is brightest when the shop is shut." },
        dark: { name: "Drifts the Shallows", kind: "graft", key: "beachcomber", scale: 0.85, note: "Whatever the tide left, it is already glowing over it." },
    },
    deep_angler: {
        light: { name: "Down Where It Is Black", kind: "graft", key: "sea_dredge", scale: 0.9 },
        dark: { name: "Lures Them Closer", kind: "graft", key: "angler_bite", scale: 0.95, note: "The light is not for seeing by." },
    },
    tidecaller: {
        light: { name: "Calls It In Early", kind: "graft", key: "following_sea", scale: 1 },
        dark: { name: "Turns the Whole Sea", kind: "graft", key: "storm_sense", scale: 0.9, note: "It does not wait for weather. It sends for it." },
    },

    // ── THE KITCHEN PETS ─────────────────────────────────────────────────────────────────────────────────────
    pantry_mouse: {
        light: { name: "A Second Pantry", kind: "graft", key: "kitchen_prep", scale: 0.9 },
        dark: { name: "A Second Pantry", kind: "graft", key: "kitchen_heat", scale: 0.85, note: "Nobody has ever found the first one." },
    },
    copper_kettle: {
        light: { name: "Always On the Boil", kind: "graft", key: "kitchen_heat", scale: 0.9, note: "It has not been cold in years." },
        dark: { name: "Never Off the Heat", kind: "amplify", mult: 2.3, note: "It has not been cold in years." },
    },
    hearth_cat: {
        light: { name: "Sleeps on the Stores", kind: "graft", key: "kitchen_larder", scale: 1 },
        dark: { name: "Banked Embers", kind: "amplify", mult: 2.2 },
    },
    spice_moth: {
        light: { name: "Found the Recipe", kind: "graft", key: "recipe_nose", scale: 1, note: "Portion is capped where it stands — the Darkstone takes a different road." },
        dark: { name: "Three Helpings", kind: "graft", key: "kitchen_heat", scale: 1 },
    },
    gourmand_dragon: {
        light: { name: "Eats the Cookbook", kind: "graft", key: "kitchen_portion", scale: 1 },
        dark: { name: "Eats the Whole Board", kind: "graft", key: "kitchen_larder", scale: 0.9, note: "It has opinions, and it has finished." },
    },

    // ── THE MINE'S FIVE AND THE SHIP'S FIVE ──────────────────────────────────────────────────────────────────
    // These ten were never written, so every one fell through to FALLBACK_EFFECT: Light amplify x1 — the
    // identity, i.e. nothing — against Dark amplify x1.5. GrayKitsune, in global chat: "Ironback (tortoise
    // thing) - lightstone/darkstone do the same thing but one is weaker then the other." That is the fallback,
    // described exactly, and it was true of all ten: two options, same kind, one strictly worse. Not a choice.
    // A three-week stone spent on a coin with the same face twice.
    //
    // The guard built to stop precisely this could not see them: check-ascension.mjs walked
    // COLLECTIBLES.filter(PET_PERKS[id]), and these ten had no perk entry — so the check's own definition of
    // "every pet" excluded the only pets that were broken. Both halves are fixed: they have named abilities now
    // (pet-perks.js) and the guard walks everything that can actually be enshrined.
    // ── THE MINE ─────────────────────────────────────────────────────────────────────────────────────────────
    tunnel_worm: {
        light: { name: "Straight Through", kind: "graft", key: "forge_salvage", scale: 0.85, note: "It does not go around anything." },
        dark: { name: "Deeper Still", kind: "amplify", mult: 2, note: "There is always more seam." },
    },
    pit_beetle: {
        // `second_wind` pays a free recharge — so the card is named for getting another go, not for the shell.
        // A name that describes armour over a mechanic that hands back a use is the small dishonesty this
        // whole table exists to avoid.
        light: { name: "Digs Itself Out", kind: "graft", key: "second_wind", scale: 0.8, note: "Bred where the roof comes down, and it has been under one before." },
        dark: { name: "Pit-Fury", kind: "amplify", mult: 2.2 },
    },
    cinder_scarab: {
        light: { name: "Rolls the Coals", kind: "graft", key: "kitchen_heat", scale: 0.85, note: "It has been pushing embers around since before the forge was lit." },
        dark: { name: "Burns Hotter", kind: "amplify", mult: 2 },
    },
    geode_sprite: {
        light: { name: "Splits the Stone", kind: "graft", key: "forge_spark", scale: 0.9, note: "It knows exactly where the seam is." },
        dark: { name: "Split Clean", kind: "graft", key: "chest_luck", scale: 0.9, note: "It knows which stones are worth opening." },
    },
    deep_golem: {
        light: { name: "Bedrock Patience", kind: "graft", key: "xp_gain", scale: 0.8, note: "It has been down there long enough to have learned something." },
        dark: { name: "The Deep Itself", kind: "amplify", mult: 1.8, note: "Ascendant weight, doubled down on." },
    },
    // ── THE SHIP ─────────────────────────────────────────────────────────────────────────────────────────────
    powder_monkey: {
        light: { name: "Runs the Powder", kind: "graft", key: "sea_plunder", scale: 0.8, note: "Up the ladder, down the ladder, arms full both ways." },
        dark: { name: "Quicker Hands", kind: "amplify", mult: 2.2 },
    },
    ironback: {
        light: { name: "Shrugs It Off", kind: "graft", key: "second_wind", scale: 0.9, note: "It rides the waterline so the planks do not have to — and the first one off the shell never counted." },
        dark: { name: "Riveted Deeper", kind: "amplify", mult: 2, note: "More plate, more shell, same unbothered turtle." },
    },
    stormcrow: {
        light: { name: "Reads the Weather", kind: "graft", key: "following_sea", scale: 0.9, note: "It leaves before the sky says why." },
        dark: { name: "Picks the Wreck Clean", kind: "amplify", mult: 2 },
    },
    chain_shrike: {
        light: { name: "Shreds the Rigging", kind: "graft", key: "chain_strike", scale: 0.9, note: "A shrike leaves what it catches on the wire." },
        dark: { name: "Both Barrels", kind: "amplify", mult: 1.9 },
    },
    bosun_shade: {
        light: { name: "All Hands", kind: "graft", key: "town_rally", scale: 0.9, note: "The whistle still carries, whoever is left to hear it." },
        dark: { name: "The Bosun's Due", kind: "amplify", mult: 1.8, note: "Ascendant, and it collects." },
    },
};

/** The two stone effects for a pet, or null if it has none authored. */
export const ascensionEffects = (petId) => ASCENSION_EFFECTS[String(petId || "")] || null;

/** One stone's effect on one pet. */
export const ascensionEffect = (petId, stone) => ascensionEffects(petId)?.[String(stone || "")] || null;

/**
 * A FALLBACK, and one that is deliberately dull.
 *
 * A pet added to the game without an authored pair should still be enshrineable rather than throwing or
 * quietly doing nothing — but it should be visibly plainer than every hand-authored pet, so the gap shows up as
 * "this one has not been written yet" rather than passing as a design choice. check-ascension.mjs fails the
 * build when any pet falls through to this, so it should never be seen.
 */
export const FALLBACK_EFFECT = {
    light: { name: "Kept", kind: "amplify", mult: 1 },
    dark: { name: "Sharpened", kind: "amplify", mult: 1.5 },
};

export const effectFor = (petId, stone) =>
    ascensionEffect(petId, stone) || FALLBACK_EFFECT[String(stone || "")] || FALLBACK_EFFECT.light;
