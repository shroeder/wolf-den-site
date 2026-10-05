// ── Farm Decorations catalog ─────────────────────────────────────────────────────────────────────────────
// 100 placeable farm decorations. Members unlock them from the level track, the spin wheel, the special shop
// (premium gold), and the regular shop (gold). They're placed anywhere in your pasture EXCEPT near the plots,
// and are NEVER tradeable (there's no decoration trade path — like consumables). Higher tiers carry a small
// PASSIVE FARMING BUFF (grow speed, seed luck, harvest loot, pet XP, fertilizer power, or harvest gold); commons
// and most rares are purely cosmetic. Each has a die-cut AI-art sprite (see decoration-sprites.js); `emoji` is
// the placeholder/fallback so the whole system works before/without art.
//
// Buff stats (all additive across every decoration you've PLACED — placing is the equip):
//   growSpeed   → −X% crop grow time
//   seedLuck    → +X% seeds found across the games
//   harvestLuck → +X% chance to bump a harvest's loot tier
//   petXp       → +X% pet XP from petting on your own farm
//   fertPower   → fertilizer cuts +X% more of the remaining grow time
//   goldHarvest → +X% gold from every harvest
import { SEASON_HIDDEN } from "@/lib/marketplace/arena-season.js";
import { HALLOWEEN_HIDDEN } from "@/lib/marketplace/halloween.js";
import { housePrompt } from "@/lib/marketplace/art-style.js";
import { COIN_ICON } from "@/lib/coin-icon";
import { textIcon } from "@/lib/coin-icon.js";

export const DECO_STATS = {
    growSpeed: { label: "Grow speed", icon: "🌱", suffix: "% faster crops" },
    seedLuck: { label: "Seed luck", icon: "🍀", suffix: "% more seeds" },
    harvestLuck: { label: "Harvest luck", icon: "🎁", suffix: "% better harvest loot" },
    petXp: { label: "Pet bond", icon: "🐾", suffix: "% more pet XP" },
    fertPower: { label: "Fertilizer", icon: "💧", suffix: "% stronger fertilizer" },
    goldHarvest: { label: "Harvest gold", icon: COIN_ICON, suffix: "% more harvest gold" },
};

export const DECO_RARITY = {
    common: { label: "Common", color: "#9aa0a6", rank: 0 },
    rare: { label: "Rare", color: "#4aa3d4", rank: 1 },
    epic: { label: "Epic", color: "#a855f7", rank: 2 },
    legendary: { label: "Legendary", color: "#f59e0b", rank: 3 },
    mythic: { label: "Mythic", color: "#ff5cc8", rank: 4 },
};

// Every decoration sprite uses the shared HOUSE style so it sits beside items, pets and chests as one set.
// It used to ask for "painterly cartoon, NO outline", which is why decorations drifted soft and outline-free
// while gear came out with bold ink contours — see art-style.js for the ink-contour vs sticker-rim distinction.
const prompt = (subject) => housePrompt(`A ${subject}.`);

// Helper to declare a decoration compactly. buff is null for cosmetic pieces.
// `level` belongs to source:"level" decorations and to nothing else. It was missing entirely, which is how
// fifteen of these ended up advertised as level unlocks with no level to unlock at and no code granting them —
// GrayKitsune, in the plaza: "There are some that mention unlocking under rewards, but none are listed on
// level up rewards." See syncLevelDecorations in farm-decorations.js for the half that hands them over.
function deco(id, name, emoji, rarity, source, price, buff, subject, level = null) {
    return { id, name, emoji, rarity, source, price: price || null, buff: buff || null, level, prompt: prompt(subject) };
}

// source: "shop" (gold, regular store) · "special" (premium gold, special shop) · "spin" (wheel) · "level" (track)
export const DECORATIONS = [
    // ── COMMON · cosmetic · mostly regular shop + spin (40) ───────────────────────────────────────────────
    deco("deco_flower_row", "Wildflower Row", "🌼", "common", "shop", 300, null, "row of cheerful mixed wildflowers"),
    deco("deco_tulip_bed", "Tulip Bed", "🌷", "common", "shop", 300, null, "tidy bed of red and yellow tulips"),
    deco("deco_sunflower", "Lone Sunflower", "🌻", "common", "shop", 300, null, "single tall sunflower"),
    deco("deco_rose_bush", "Rose Bush", "🌹", "common", "shop", 350, null, "flowering red rose bush"),
    deco("deco_daisy_patch", "Daisy Patch", "🌸", "common", "shop", 300, null, "patch of white daisies"),
    deco("deco_potted_plant", "Potted Fern", "🪴", "common", "shop", 250, null, "leafy green fern in a terracotta pot"),
    deco("deco_shrub", "Round Shrub", "🌳", "common", "shop", 250, null, "small rounded green shrub"),
    deco("deco_hay_bale", "Hay Bale", "🌾", "common", "shop", 300, null, "round golden hay bale"),
    deco("deco_wheelbarrow", "Wheelbarrow", "🛒", "common", "shop", 350, null, "old wooden garden wheelbarrow"),
    deco("deco_watering_can", "Watering Can", "🪣", "common", "shop", 300, null, "metal watering can"),
    deco("deco_picket_sign", "Welcome Sign", "🪧", "common", "shop", 300, null, "little wooden welcome signpost"),
    deco("deco_stone_path", "Stone Steps", "🪨", "common", "shop", 250, null, "few flat stepping stones"),
    deco("deco_pebble_pile", "Pebble Cairn", "⚪", "common", "shop", 200, null, "stacked smooth pebble cairn"),
    deco("deco_mushroom_red", "Toadstool", "🍄", "common", "shop", 300, null, "red-capped spotted toadstool"),
    deco("deco_clover", "Clover Tuft", "☘️", "common", "shop", 250, null, "tuft of green clover"),
    deco("deco_cattail", "Cattails", "🌿", "common", "shop", 250, null, "cluster of marsh cattails"),
    deco("deco_bird_bath", "Bird Bath", "🕊️", "common", "shop", 400, null, "stone bird bath with a little bird"),
    deco("deco_gnome", "Garden Gnome", "🧙", "common", "shop", 400, null, "classic red-hatted garden gnome"),
    deco("deco_duck", "Garden Duck", "🦆", "common", "shop", 350, null, "cheerful white garden duck ornament"),
    deco("deco_frog", "Frog Statue", "🐸", "common", "shop", 350, null, "smiling little stone frog statue"),
    deco("deco_ladybug", "Ladybug Rock", "🐞", "common", "shop", 250, null, "painted ladybug on a small rock"),
    deco("deco_snail", "Garden Snail", "🐌", "common", "shop", 250, null, "friendly cartoon garden snail"),
    deco("deco_butterfly", "Butterfly Stake", "🦋", "common", "shop", 300, null, "decorative butterfly on a garden stake"),
    deco("deco_pinwheel", "Pinwheel", "🌀", "common", "shop", 300, null, "colorful spinning garden pinwheel"),
    deco("deco_lantern", "Paper Lantern", "🏮", "common", "shop", 350, null, "hanging red paper lantern"),
    deco("deco_torch", "Tiki Torch", "🔥", "common", "shop", 300, null, "bamboo tiki torch with a small flame"),
    deco("deco_stump", "Tree Stump", "🪵", "common", "shop", 250, null, "mossy cut tree stump"),
    deco("deco_log_bench", "Log Bench", "🪑", "common", "shop", 400, null, "rustic split-log bench"),
    deco("deco_crate", "Produce Crate", "📦", "common", "shop", 250, null, "wooden crate of fresh vegetables"),
    deco("deco_basket", "Fruit Basket", "🧺", "common", "shop", 300, null, "wicker basket of harvest fruit"),
    deco("deco_carrot_sign", "Carrot Marker", "🥕", "common", "spin", null, null, "carrot-shaped garden row marker"),
    deco("deco_corn_stalk", "Corn Stalk", "🌽", "common", "spin", null, null, "tall leafy corn stalk"),
    deco("deco_pumpkin_small", "Little Pumpkin", "🎃", "common", "spin", null, null, "small orange pumpkin"),
    deco("deco_beehive", "Bee Skep", "🐝", "common", "spin", null, null, "woven straw bee skep with bees"),
    deco("deco_birdhouse", "Birdhouse", "🏠", "common", "spin", null, null, "little painted birdhouse on a post"),
    deco("deco_kite", "Stuck Kite", "🪁", "common", "spin", null, null, "colorful kite tangled on a pole"),
    deco("deco_balloon", "Balloon Bunch", "🎈", "common", "spin", null, null, "bunch of festive balloons tied to a stake"),
    deco("deco_flag_bunting", "Bunting Flags", "🎏", "common", "spin", null, null, "string of colorful triangle bunting flags"),
    deco("deco_lawn_flamingo", "Lawn Flamingo", "🦩", "common", "shop", 400, null, "classic pink plastic lawn flamingo"),
    deco("deco_garden_cat", "Sleepy Cat", "🐈", "common", "spin", null, null, "sleeping cat statue curled up"),

    // ── RARE · mostly cosmetic, a couple entry buffs · shop/spin/level (28) ────────────────────────────────
    deco("deco_fountain_small", "Stone Fountain", "⛲", "rare", "shop", 900, null, "small bubbling stone garden fountain"),
    deco("deco_well", "Wishing Well", "🪣", "rare", "shop", 1000, null, "quaint stone wishing well with a roof"),
    deco("deco_scarecrow", "Scarecrow", "🌾", "rare", "shop", 900, null, "friendly patchwork scarecrow"),
    deco("deco_windmill_toy", "Toy Windmill", "🌬️", "rare", "shop", 950, null, "small wooden decorative windmill"),
    deco("deco_arch_roses", "Rose Arch", "🌹", "rare", "shop", 1100, null, "garden arch covered in climbing roses"),
    deco("deco_topiary_spiral", "Spiral Topiary", "🌲", "rare", "shop", 1000, null, "spiral-trimmed topiary in a pot"),
    deco("deco_topiary_animal", "Animal Topiary", "🦌", "rare", "shop", 1100, null, "deer-shaped garden topiary"),
    deco("deco_pond", "Koi Pond", "🐟", "rare", "shop", 1200, null, "small koi pond with lily pads"),
    deco("deco_bridge", "Garden Bridge", "🌉", "rare", "shop", 1100, null, "little red arched garden footbridge"),
    deco("deco_bench_iron", "Iron Bench", "🪑", "rare", "shop", 900, null, "ornate wrought-iron garden bench"),
    deco("deco_sundial", "Sundial", "🕰️", "rare", "shop", 900, null, "bronze garden sundial on a pedestal"),
    deco("deco_gazing_ball", "Gazing Ball", "🔮", "rare", "shop", 900, null, "shiny blue gazing ball on a stand"),
    deco("deco_hammock", "Hammock", "🛏️", "rare", "shop", 1000, null, "striped hammock between two posts"),
    deco("deco_fairy_ring", "Fairy Ring", "🍄", "rare", "spin", null, { stat: "seedLuck", value: 3 }, "ring of glowing fairy mushrooms"),
    deco("deco_lucky_horseshoe", "Lucky Horseshoe", "🧲", "rare", "spin", null, { stat: "harvestLuck", value: 3 }, "golden horseshoe mounted on a post"),
    deco("deco_greenhouse_mini", "Mini Greenhouse", "🏡", "rare", "shop", 1300, { stat: "growSpeed", value: 3 }, "tiny glass greenhouse with plants inside"),
    deco("deco_compost", "Compost Bin", "♨️", "rare", "shop", 1200, { stat: "fertPower", value: 5 }, "wooden compost bin with rich soil"),
    deco("deco_flower_cart", "Flower Cart", "🛒", "rare", "shop", 1000, null, "wooden cart overflowing with flowers"),
    deco("deco_totem", "Garden Totem", "🗿", "rare", "spin", null, null, "carved wooden garden totem pole"),
    deco("deco_wind_chimes", "Wind Chimes", "🎐", "rare", "spin", null, null, "hanging glass wind chimes"),
    deco("deco_lamp_post", "Lamp Post", "🪔", "rare", "shop", 900, null, "old-fashioned iron lamp post"),
    deco("deco_swing", "Tree Swing", "🌳", "rare", "shop", 1000, null, "rope swing hanging from a branch"),
    deco("deco_owl", "Wise Owl", "🦉", "rare", "spin", null, null, "carved owl perched on a stump"),
    deco("deco_deer", "Garden Deer", "🦌", "rare", "level", null, null, "graceful standing garden deer statue", 5),
    deco("deco_fox", "Sly Fox", "🦊", "rare", "level", null, null, "small orange fox statue mid-trot", 10),
    deco("deco_rabbit_topiary", "Rabbit Topiary", "🐇", "rare", "level", null, null, "rabbit-shaped hedge topiary", 15),
    deco("deco_flower_tower", "Flower Tower", "🌺", "rare", "level", null, null, "tall tiered tower of cascading flowers", 20),
    deco("deco_lantern_string", "String Lights", "✨", "rare", "level", null, null, "strand of warm glowing garden string lights", 25),

    // ── EPIC · all carry a buff · special shop + level + spin (18) ─────────────────────────────────────────
    deco("deco_grand_fountain", "Grand Fountain", "⛲", "epic", "special", 3200, { stat: "growSpeed", value: 5 }, "tiered marble fountain with flowing water"),
    deco("deco_windmill", "Working Windmill", "🌬️", "epic", "special", 3400, { stat: "seedLuck", value: 6 }, "tall wooden windmill with turning sails"),
    deco("deco_glass_greenhouse", "Glass Greenhouse", "🏡", "epic", "special", 3600, { stat: "growSpeed", value: 7 }, "elegant victorian glass greenhouse"),
    deco("deco_golden_scarecrow", "Golden Scarecrow", "🌟", "epic", "special", 3200, { stat: "harvestLuck", value: 6 }, "scarecrow dressed in shining gold"),
    deco("deco_beehive_grand", "Grand Apiary", "🐝", "epic", "special", 3000, { stat: "goldHarvest", value: 6 }, "grand tiered beehive tower buzzing with bees"),
    deco("deco_crystal_pond", "Crystal Pond", "💠", "epic", "special", 3400, { stat: "harvestLuck", value: 7 }, "pond of glowing crystal-clear water with gems"),
    deco("deco_zen_garden", "Zen Garden", "🎋", "epic", "special", 3000, { stat: "petXp", value: 8 }, "raked sand zen garden with bamboo"),
    deco("deco_pergola", "Grape Pergola", "🍇", "epic", "special", 3200, { stat: "goldHarvest", value: 7 }, "wooden pergola heavy with grape vines"),
    deco("deco_sun_statue", "Sun Idol", "☀️", "epic", "level", null, { stat: "growSpeed", value: 6 }, "golden radiant sun-face garden idol", 30),
    deco("deco_moon_statue", "Moon Idol", "🌙", "epic", "level", null, { stat: "seedLuck", value: 7 }, "silver crescent-moon garden idol", 35),
    deco("deco_rune_stone", "Rune Stone", "🪨", "epic", "level", null, { stat: "harvestLuck", value: 6 }, "standing stone carved with glowing runes", 40),
    deco("deco_greenhouse_lush", "Lush Conservatory", "🌴", "epic", "level", null, { stat: "growSpeed", value: 7 }, "domed conservatory bursting with tropical plants", 45),
    deco("deco_fountain_koi", "Koi Fountain", "🐠", "epic", "level", null, { stat: "petXp", value: 8 }, "ornate fountain with leaping koi fish", 50),
    deco("deco_lucky_cat_grand", "Fortune Cat", "🐱", "epic", "spin", null, { stat: "goldHarvest", value: 8 }, "large golden waving fortune cat statue"),
    deco("deco_clover_grand", "Four-Leaf Shrine", "🍀", "epic", "spin", null, { stat: "seedLuck", value: 8 }, "shrine built around a giant glowing four-leaf clover"),
    deco("deco_gilded_arch", "Gilded Arch", "🏛️", "epic", "special", 3400, { stat: "goldHarvest", value: 7 }, "golden ornamental garden archway"),
    deco("deco_mushroom_grove", "Glowshroom Grove", "🍄", "epic", "special", 3000, { stat: "fertPower", value: 8 }, "cluster of tall glowing bioluminescent mushrooms"),
    deco("deco_flower_carousel", "Flower Carousel", "🎠", "epic", "special", 3600, { stat: "petXp", value: 8 }, "whimsical flower-covered garden carousel"),

    // ── LEGENDARY · bigger buffs · special shop + level + spin (10) ────────────────────────────────────────
    deco("deco_world_tree_young", "Sapling of Plenty", "🌳", "legendary", "special", 6500, { stat: "growSpeed", value: 10 }, "young glowing world-tree sapling with golden leaves"),
    deco("deco_crystal_obelisk", "Crystal Obelisk", "🔷", "legendary", "special", 6500, { stat: "seedLuck", value: 10 }, "towering faceted crystal obelisk radiating light"),
    deco("deco_golden_idol", "Golden Idol", "🗿", "legendary", "special", 7000, { stat: "goldHarvest", value: 12 }, "gleaming solid-gold ancient garden idol"),
    deco("deco_rainbow_fountain", "Rainbow Fountain", "🌈", "legendary", "special", 6800, { stat: "harvestLuck", value: 10 }, "fountain spraying shimmering rainbow water"),
    deco("deco_phoenix_perch", "Phoenix Perch", "🔥", "legendary", "level", null, { stat: "growSpeed", value: 11 }, "ornate perch with a small glowing phoenix", 60),
    deco("deco_moon_pool", "Moonlit Pool", "🌕", "legendary", "level", null, { stat: "petXp", value: 12 }, "still reflecting pool glowing with moonlight", 70),
    deco("deco_grand_greenhouse", "Emerald Greenhouse", "💚", "legendary", "level", null, { stat: "growSpeed", value: 12 }, "grand emerald-glass greenhouse glowing from within", 80),
    deco("deco_fortune_shrine", "Fortune Shrine", "⛩️", "legendary", "spin", null, { stat: "goldHarvest", value: 12 }, "red torii shrine wreathed in golden coins"),
    deco("deco_clover_fountain", "Clover Fountain", "🍀", "legendary", "spin", null, { stat: "seedLuck", value: 12 }, "fountain shaped like a giant four-leaf clover"),
    deco("deco_star_sundial", "Astral Sundial", "⭐", "legendary", "special", 6800, { stat: "harvestLuck", value: 11 }, "celestial sundial ringed with floating stars"),

    // ── MYTHIC · top buffs · level track + special shop only (4) ───────────────────────────────────────────
    deco("deco_world_tree", "The World Tree", "🌲", "mythic", "level", null, { stat: "growSpeed", value: 15 }, "colossal luminous world tree with golden glowing canopy", 90),
    deco("deco_cornucopia", "Eternal Cornucopia", "🌽", "mythic", "level", null, { stat: "goldHarvest", value: 18 }, "overflowing golden cornucopia spilling endless harvest", 100),
    deco("deco_celestial_garden", "Celestial Orrery", "🪐", "mythic", "special", 12000, { stat: "harvestLuck", value: 15 }, "floating celestial orrery of orbiting planets and stars"),
    deco("deco_gaia_shrine", "Shrine of Gaia", "🌍", "mythic", "special", 12000, { stat: "seedLuck", value: 16 }, "verdant living shrine overflowing with glowing greenery and blossoms"),

    // ── GLINT · SOURCE-EXCLUSIVE (source "glint", price null → un-buyable) ──────────────────────────────────
    // The ONLY way to own these is to spot & claim the rare hidden glimmer in Town (first tap wins it — see
    // town-shiny.js). A true "were you paying attention?" trophy set.
    //
    // TUNING: these are deliberately EPIC-tier, at the LOW end of that band (4-6). They first shipped at 11-13,
    // which put a one-tap freebie level with premium mythics costing 12,000 gold or a level unlock — strictly
    // better than anything you could work toward, which is backwards. The reward here is scarcity and the story
    // of having spotted it, NOT raw power; keep these numbers under the cheapest thing a member can buy, or the
    // glimmer quietly becomes the best farm gear in the game again.
    deco("deco_glint_meteorite", "Fallen Meteorite", "☄️", "epic", "glint", null, { stat: "harvestLuck", value: 6 }, "glowing fallen meteorite fragment cratered in the earth, veined with molten light"),
    deco("deco_glint_wishing_star", "Caught Wishing Star", "🌟", "epic", "glint", null, { stat: "seedLuck", value: 5 }, "a captured five-point wishing star cradled in a little stand, softly radiating"),
    deco("deco_glint_fae_lantern", "Faerie Lantern", "🏮", "epic", "glint", null, { stat: "growSpeed", value: 4 }, "an ornate hovering faerie lantern glowing with warm enchanted light and drifting sparkles"),
    deco("deco_glint_crystal_geode", "Starlit Geode", "💎", "epic", "glint", null, { stat: "goldHarvest", value: 6 }, "a split crystal geode lined with glittering violet gemstone points catching starlight"),
    deco("deco_glint_moonpetal", "Moonpetal Bloom", "🌙", "epic", "glint", null, { stat: "petXp", value: 4 }, "a luminous silver-blue moonpetal flower in bloom, petals glowing faintly at night"),
    deco("deco_glint_gilded_acorn", "Gilded Acorn", "🌰", "epic", "glint", null, { stat: "fertPower", value: 5 }, "a polished golden acorn on a tiny pedestal, gleaming like treasure"),
    deco("deco_glint_starforge", "Starforge Relic", "⭐", "epic", "glint", null, { stat: "growSpeed", value: 6 }, "a small floating anvil-shaped relic forged from a star, ringed with orbiting sparks of light"),
    deco("deco_glint_aurora_orb", "Aurora Orb", "🔮", "epic", "glint", null, { stat: "harvestLuck", value: 5 }, "a crystal orb swirling with shifting aurora-borealis light, greens and purples"),
    // ── HALLOWEEN · won only while the flag is up ────────────────────────────────────────────────────────
    // Luke: "unlockable seasonal farm decorations, only unlockable during the halloween phase. Maybe from the
    // wheel. And other places like chests or wherever else we give out decorations."
    //
    // `source: "halloween"` is a source no EXISTING hand-out path can reach — the same lock the Petting Stand
    // uses, and for the same reason. Every path filters by source, so a new source is invisible to all of them
    // until one is taught about it deliberately:
    //
    //   the wheel      DECORATIONS.filter(d => d.source === "spin")     -> now also "halloween", event only
    //   the glint      GLINT_DECOS, i.e. source === "glint"             -> now also "halloween", event only
    //   both shops     price && ["shop","special"].includes(source)     -> price is null, so never
    //   the level track d.source === "level"                            -> never
    //   a Halloween chest                                               -> a new rung, event only by definition
    //
    // ⚠️ `unreleased: HALLOWEEN_HIDDEN` KEEPS THEM OUT OF THE CATALOGUE DRAWER while the event is down, but
    // PUBLIC_DECORATIONS makes an exception for anything you already own — so a member who won one last
    // October still sees it, can still place it, and keeps the buff. A seasonal exclusive is a thing you kept,
    // not a thing that is taken back.
    //
    // Buffs follow the house curve: rares cosmetic or tiny, epics a real 5-6, the one mythic a little more.
    // Nothing here is stronger than its year-round equivalent — a costume must not be the best farm build.
    deco("deco_hw_jack_o_lantern", "Grinning Jack", "🎃", "rare", "halloween", null, { stat: "goldHarvest", value: 4 },
        "a carved jack-o'-lantern with a wide grin and a candle burning inside, sitting on a little pile of straw", null),
    deco("deco_hw_scarecrow", "The Night Watchman", "🌾", "rare", "halloween", null, { stat: "seedLuck", value: 4 },
        "a lopsided scarecrow on a post in a tattered coat and a burlap hood, a crow perched on one shoulder", null),
    deco("deco_hw_gravestone", "Leaning Headstone", "🪦", "rare", "halloween", null, null,
        // ⚠️ NEVER SAY "LETTERS" TO AN IMAGE MODEL. "moss in its carved letters" came back with the word MOSS
        // chiselled across the stone — it read the description of the surface as the text to write on it. The
        // house style already forbids text; naming letters at all invites one through anyway.
        "a weathered blank stone grave marker leaning in the earth, its face smooth and completely empty with no writing, no words and no carved symbols of any kind, patches of moss on the stone, a few dead leaves at its foot", null),
    deco("deco_hw_cauldron", "Bubbling Cauldron", "🫕", "epic", "halloween", null, { stat: "fertPower", value: 6 },
        "a black iron cauldron on three legs over a low fire, bubbling with glowing green brew and curling vapour", null),
    deco("deco_hw_candle_ring", "Ring of Nine Candles", "🕯️", "epic", "halloween", null, { stat: "harvestLuck", value: 5 },
        "nine tall dripping candles standing in a ring on the ground, eight lit with warm flame and one unlit", null),
    deco("deco_hw_web_corner", "Old Cobweb", "🕸️", "epic", "halloween", null, { stat: "petXp", value: 5 },
        "a big silver cobweb strung between two crooked fence posts, dew on the strands, one fat patient spider", null),
    deco("deco_hw_ghost_lamp", "Wisp Lamp", "👻", "epic", "halloween", null, { stat: "growSpeed", value: 5 },
        "an old iron lamp post with no flame in it, a pale blue-white wisp of a ghost drifting inside the glass instead", null),
    // The one to chase. A little bigger, a little better, and the only mythic in the set.
    deco("deco_hw_pumpkin_king", "The Pumpkin King", "👑", "mythic", "halloween", null, { stat: "goldHarvest", value: 8 },
        "an enormous crowned pumpkin sitting on a throne of twisted vines and corn stalks, its carved face lit from within with warm orange fire, smaller pumpkins bowing at its base", null),

    // ── THE GOURDFATHER'S STALL · bought with candy, from him, and nowhere else ──────────────────────────
    // Luke: "an npc in town for the halloween event where u can exchange candy for unique rewards like gift
    // boxes, a few new pets, and maybe like a halloween themed set of items, and aome farm decorations. All
    // on top of the stuff we already added so like the pets and items are all new that this guy would offer
    // you."
    //
    // ⚠️ source: "gourdfather", NOT "halloween". The eight above are source "halloween" and the wheel, the
    // glint and the Hallowe'en chests all reach them. These four must be reachable ONLY across his counter,
    // and a NEW source is exclusive by construction rather than by everyone remembering a rule — every pool
    // in the game filters by an explicit source, so none of them can see a source they have never heard of.
    // Same move the Petting Stand makes directly below, and the same reason.
    deco("deco_gf_candy_cauldron", "The Candy Cauldron", "\u{1F36C}", "epic", "gourdfather", null, { stat: "goldHarvest", value: 6 },
        "a big black iron cauldron tipped on its side in the grass, spilling a bright heap of wrapped sweets and candy corn across the ground"),
    deco("deco_gf_lantern_arch", "The Lantern Arch", "\u{1FA94}", "epic", "gourdfather", null, { stat: "growSpeed", value: 6 },
        "a tall arch of twisted bare branches wound with dozens of small lit paper lanterns, wide enough to walk under"),
    deco("deco_gf_black_cat", "The Black Cat", "\u{1F408}", "rare", "gourdfather", null, { stat: "harvestLuck", value: 5 },
        "a sleek black cat sitting upright and composed on a weathered stone post, tail curled around its feet, eyes bright amber"),
    // The big one. Priced like it and sized like it.
    deco("deco_gf_gourd_throne", "The Gourdfather's Throne", "\u{1F451}", "mythic", "gourdfather", null, { stat: "seedLuck", value: 9 },
        "an enormous ornate throne built entirely from stacked carved pumpkins and twisted corn stalks, every gourd lit from within, a scatter of fallen leaves at its base"),

    // ── THE PETTING STAND ── the one decoration you cannot win, find, or be given ─────────────────────────
    // Sold ONLY inside the $5 Petting Stand package (store credit + coins + this), so it needs a source no
    // existing hand-out path can reach. Every one of them filters by source and this matches none:
    //
    //   the wheel      DECORATIONS.filter(d => d.source === "spin")        (spin.js)
    //   the glint      GLINT_DECOS, i.e. source === "glint"                (town-shiny.js)
    //   both shops     ["shop","special"].includes(source) && price        (buyDecoration)
    //   the boss       grants one hard-coded id                            (boss-trophy.js)
    //   a creation     only ever touches custom:<id> rows                  (creation-share.js)
    //
    // `price: null` is a second lock on the shop path, and `unique: true` caps it at one PLACED copy. It is
    // also `unreleased` until the package goes live — see PUBLIC_DECORATIONS below, which is what the catalog
    // drawer must read so an unlaunched item does not advertise itself to everyone who opens the farm.
    {
        id: "deco_petting_stand", name: "The Petting Stand", emoji: "🐾", rarity: "mythic",
        source: "package", price: null, buff: null, unique: true, unreleased: true, pets: 3,
        // Twice the 66px every other prop renders at. Three pets have to sit ON this and stay recognisable —
        // at 66 each companion would be about 25 CSS pixels, which is a smudge.
        size: 132,
        // ── WHERE THE PETS SIT, AND HOW BIG ──────────────────────────────────────────────────────────────
        // `y` is the TOP SURFACE of each cushion, measured off the finished sprite: scanning it for crimson
        // finds three bands at 10.5-20.5%, 33.6-49.6% and 60-72.5% of the height. A pet is anchored by its feet
        // (translate -100%) a couple of points into the pillow, so it reads as sitting rather than hovering.
        //
        // `s` is its size as a share of the sprite box, and it is derived from the TIER SPACING — not, as the
        // first cut had it, from the cushion's width. The cushions are 34-57% wide but only ~26% apart, so
        // sizing off width produced animals half the height of the whole pedestal: each one buried the tier
        // below it and the stand itself vanished under a pile of pets. Sized off the gap, every companion has
        // clear air above it and the pedestal still reads as a pedestal.
        tiers: [
            { x: 49, y: 14, s: 22 },
            { x: 49, y: 37, s: 25 },
            { x: 49, y: 63.5, s: 28 },
        ],
        // No leading article — `prompt()` prepends "A ", exactly as it does for every other entry above.
        prompt: prompt("ornate three-tiered carved stone display pedestal, each tier topped with a plush velvet cushion, garlanded with trailing flowers and gold filigree, built for small animals to sit and be admired"),
    },

    // ── SEASON EXCLUSIVES · THE LONG ROAD ─────────────────────────────────────────────────────────────────
    // Won at a rung and nowhere else. `source: "season"` matches none of the six hand-out paths listed above
    // the Petting Stand (the wheel, the glint, both shops, the boss, a creation), so the source alone is the
    // lock — and `price: null` is the second one, because the shop path also needs a price.
    //
    // They carry a real buff, deliberately. A prestige piece that only looks nice is a trophy, and eight
    // trophies is not a season — the climb has to hand you something you would have wanted anyway. Pitched at
    // the legendary band because that is what a farm can already reach; a season is a source of exclusives,
    // not a source of power creep.
    //
    // `unreleased` while the Road is behind the owner gate, so the catalog drawer does not put two mythics
    // nobody can obtain in front of the whole Den — see SEASON_PUBLIC, the one switch both halves read.
    { ...deco("deco_s1_milestone", "Milestone Stone", "🪨", "legendary", "season", null, { stat: "harvestLuck", value: 11 },
        "weathered roadside milestone of pale stone, its carved face worn smooth and unreadable, thick moss in the old chisel grooves, a chipped domed top, leaning very slightly"),
      unreleased: SEASON_HIDDEN, season: 1 },
    { ...deco("deco_s1_signpost", "The Turned Signpost", "🪧", "mythic", "season", null, { stat: "goldHarvest", value: 14 },
        "tall wooden crossroads signpost whose every arm has been turned to point back the same way, iron-bound, hand-painted lettering worn to ghosts"),
      unreleased: SEASON_HIDDEN, season: 1 },
];

// The pool a claimed shiny glint draws its reward from (source-exclusive — see town-shiny.js).
export const GLINT_DECOS = DECORATIONS.filter((d) => d.source === "glint").map((d) => d.id);

// ── WHAT A MEMBER MAY SEE ────────────────────────────────────────────────────────────────────────────────────
// The catalog drawer shows EVERY decoration, owned or not, because seeing what you have not got yet is the
// point of it. That is exactly wrong for something that is not released: it would put an unbuyable mythic in
// front of everybody with no way to get it and no explanation.
//
// So the drawer reads THIS, not DECORATIONS. Anything `unreleased` is filtered out unless the member already
// owns it — which keeps the owner (and any early tester granted one) able to see and place theirs while it is
// invisible to everyone else. Grant paths are guarded separately by `source`; this is the display half, and the
// two must both hold. See the memory note on ownerOnly content being simultaneously leaky and unobtainable.
// ⚠️ APPLIED AFTER THE LIST, because deco() has no `unreleased` argument and giving it one would mean
// touching all hundred declarations to add a default. A seasonal decoration is hidden from the catalogue
// drawer while the flag is down and visible again when it is up — and always visible to somebody who owns it,
// which PUBLIC_DECORATIONS already handles.
for (const d of DECORATIONS) if (d.source === "halloween") d.unreleased = HALLOWEEN_HIDDEN;

/** Every decoration the Halloween event can hand out, in any of its three ways. */
export const HALLOWEEN_DECOS = DECORATIONS.filter((d) => d.source === "halloween").map((d) => d.id);

// The Gourdfather's four. Hidden from the catalogue drawer the same way, and for the same reason — a member
// who bought one last October keeps seeing it (PUBLIC_DECORATIONS makes an exception for what you own), while
// nobody browsing in July is shown four things they cannot buy.
for (const d of DECORATIONS) if (d.source === "gourdfather") d.unreleased = HALLOWEEN_HIDDEN;
// ── THE GACHAPON EXCLUSIVES ──────────────────────────────────────────────────────────────────────────────
// Three, and the machine is the only place any of them comes from. `source: "gachapon"` keeps them out of
// PUBLIC_DECORATIONS the same way the Gourdfather's are kept out — a decoration with a price is a decoration
// the shop will sell, so all three have `price: null` and that is load-bearing, not tidiness.
//
// They carry real buffs rather than being ornaments. A prize you win from a machine that eats a rare ticket
// should do something on the farm you put it on; the three cosmetic-only Hallowe'en pieces already cover
// "purely for looking at".
export const GACHAPON_DECOS_LIST = [
    deco("deco_gx_capsule_tree", "The Capsule Tree", "🌳", "legendary", "gachapon", null, { stat: "harvestLuck", value: 7 },
        "bare autumn tree hung all over with glowing coloured gachapon capsules like fruit, a few fallen open among its roots"),
    deco("deco_gx_lucky_lantern", "The Lucky Lantern", "🏮", "epic", "gachapon", null, { stat: "seedLuck", value: 5 },
        "tall black iron lamp post whose glass globe has been replaced with an enormous glowing orange gachapon capsule"),
    deco("deco_gx_prize_pumpkin", "The Prize Pumpkin", "🎃", "mythic", "gachapon", null, { stat: "goldHarvest", value: 9 },
        "enormous carved pumpkin split open down the middle with a huge glowing prize capsule nested inside it like a seed"),
];
DECORATIONS.push(...GACHAPON_DECOS_LIST);
// ⚠️ AND HIDDEN FROM THE DRAWER, EXACTLY LIKE THE GOURDFATHER'S FOUR. Pushing them onto DECORATIONS happens
// AFTER the `source === "halloween"` and `source === "gourdfather"` sweeps above have already run, so they
// are not caught by either and shipped visible to the whole Den — three mythic-and-legendary pieces nobody
// could obtain, advertised in the catalogue in July. PUBLIC_DECORATIONS still makes its exception for what
// you already own, so a member who wins one keeps seeing it forever.
for (const d of GACHAPON_DECOS_LIST) d.unreleased = HALLOWEEN_HIDDEN;
export const GACHAPON_DECOS = GACHAPON_DECOS_LIST.map((d) => d.id);

export const GOURDFATHER_DECOS = DECORATIONS.filter((d) => d.source === "gourdfather").map((d) => d.id);

export const PUBLIC_DECORATIONS = (ownedIds = null) => {
    const own = ownedIds instanceof Set ? ownedIds : new Set(ownedIds || []);
    return DECORATIONS.filter((d) => !d.unreleased || own.has(d.id));
};
// One PLACED copy per farm, however many you somehow come to own.
export const UNIQUE_DECOS = new Set(DECORATIONS.filter((d) => d.unique).map((d) => d.id));

const BY_ID = new Map(DECORATIONS.map((d) => [d.id, d]));
export const decorationById = (id) => BY_ID.get(id) || null;
export const isDecoration = (id) => BY_ID.has(id);

// Aggregate the passive buffs from PLACED decoration ids (placing = equipping). Each UNIQUE decoration's buff
// Decorations that CAST LIGHT — they glow at dawn/dusk/night (not day). rgb = light color, r = radius in px
// at 1× scale, flicker = a live flame/magic shimmer. The scene renders a soft radial glow behind the sprite.
export const DECO_LIGHT = {
    deco_torch: { rgb: "255,150,54", r: 96, flicker: true }, deco_lantern: { rgb: "255,196,104", r: 78 },
    deco_lamp_post: { rgb: "255,224,150", r: 120 }, deco_lantern_string: { rgb: "255,210,130", r: 100 },
    deco_pumpkin_small: { rgb: "255,150,40", r: 66, flicker: true },
    deco_fairy_ring: { rgb: "150,255,180", r: 82, flicker: true }, deco_mushroom_grove: { rgb: "130,240,200", r: 90, flicker: true },
    deco_crystal_pond: { rgb: "120,220,255", r: 96 }, deco_crystal_obelisk: { rgb: "150,200,255", r: 116 },
    deco_moon_statue: { rgb: "175,200,255", r: 92 }, deco_moon_pool: { rgb: "160,195,255", r: 100 },
    deco_rune_stone: { rgb: "180,150,255", r: 84, flicker: true }, deco_rainbow_fountain: { rgb: "190,160,255", r: 96 },
    deco_star_sundial: { rgb: "200,215,255", r: 92 }, deco_celestial_garden: { rgb: "190,175,255", r: 130, flicker: true },
    deco_clover_fountain: { rgb: "150,240,170", r: 92 },
};
export const decoLight = (id) => DECO_LIGHT[id] || null;

// counts ONCE — placing multiple copies of the same piece does NOT stack its bonus (dedupe by id). Different
// buffed decorations still add together, capped per stat. Returns { growSpeed, seedLuck, ... } %.
// Per-stat cap on the COMBINED farm bonus (decorations + gear farm affixes + equipped-pet farm passive — see
// farm-bonus.js). Exported so the unified aggregator caps the same totals decorations already respect.
export const BUFF_CAP = { growSpeed: 40, seedLuck: 50, harvestLuck: 40, petXp: 50, fertPower: 40, goldHarvest: 60 };
// A fresh zeroed farm-bonus object (the canonical shape every farm bonus source contributes to).
export const emptyFarmBuffs = () => ({ growSpeed: 0, seedLuck: 0, harvestLuck: 0, petXp: 0, fertPower: 0, goldHarvest: 0 });
// `allRarities` is The Garden Path: commons and most rares carry `buff: null` on purpose, so the power gives
// them the buff their rarity band would have had. Everything epic and up already has one and is untouched.
const FALLBACK_BUFF = { common: { stat: "growSpeed", value: 2 }, rare: { stat: "harvestLuck", value: 3 } };
export function decorationBuffs(placedIds, allRarities = false) {
    const out = emptyFarmBuffs();
    for (const id of new Set(placedIds || [])) { // dedupe → one bonus per decoration type, no dup stacking
        const d = BY_ID.get(id);
        const buff = d?.buff || (allRarities ? FALLBACK_BUFF[d?.rarity] : null);
        if (buff?.stat && out[buff.stat] != null) out[buff.stat] += buff.value;
    }
    for (const k of Object.keys(out)) out[k] = Math.min(BUFF_CAP[k], out[k]);
    return out;
}

// Catalog rows for a shop/source, annotated with rarity meta + buff text (for the UI). source filter optional.
export function decorationCatalog({ source = null } = {}) {
    return DECORATIONS
        .filter((d) => !source || d.source === source)
        .map((d) => ({
            ...d,
            rarityMeta: DECO_RARITY[d.rarity],
            buffText: d.buff ? buffText(d.buff) : null,
        }));
}

export function buffText(buff) {
    if (!buff) return null;
    const m = DECO_STATS[buff.stat];
    if (!m) return null;
    return `${textIcon(m.icon)}+${buff.value}${m.suffix}`;
}
