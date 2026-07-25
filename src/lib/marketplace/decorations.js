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
export const DECO_STATS = {
    growSpeed: { label: "Grow speed", icon: "🌱", suffix: "% faster crops" },
    seedLuck: { label: "Seed luck", icon: "🍀", suffix: "% more seeds" },
    harvestLuck: { label: "Harvest luck", icon: "🎁", suffix: "% better harvest loot" },
    petXp: { label: "Pet bond", icon: "🐾", suffix: "% more pet XP" },
    fertPower: { label: "Fertilizer", icon: "💧", suffix: "% stronger fertilizer" },
    goldHarvest: { label: "Harvest gold", icon: "🪙", suffix: "% more harvest gold" },
};

export const DECO_RARITY = {
    common: { label: "Common", color: "#9aa0a6", rank: 0 },
    rare: { label: "Rare", color: "#4aa3d4", rank: 1 },
    epic: { label: "Epic", color: "#a855f7", rank: 2 },
    legendary: { label: "Legendary", color: "#f59e0b", rank: 3 },
    mythic: { label: "Mythic", color: "#ff5cc8", rank: 4 },
};

// A compact art-prompt builder so every sprite reads as one cohesive set (die-cut, transparent, painterly).
const artStyle = "cute polished 2D game decoration sprite, painterly cartoon style, warm storybook lighting, bold clean outline, die-cut with transparent background, centered, no ground shadow, no text";
const prompt = (subject) => `A ${subject}. ${artStyle}.`;

// Helper to declare a decoration compactly. buff is null for cosmetic pieces.
function deco(id, name, emoji, rarity, source, price, buff, subject) {
    return { id, name, emoji, rarity, source, price: price || null, buff: buff || null, prompt: prompt(subject) };
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
    deco("deco_deer", "Garden Deer", "🦌", "rare", "level", null, null, "graceful standing garden deer statue"),
    deco("deco_fox", "Sly Fox", "🦊", "rare", "level", null, null, "small orange fox statue mid-trot"),
    deco("deco_rabbit_topiary", "Rabbit Topiary", "🐇", "rare", "level", null, null, "rabbit-shaped hedge topiary"),
    deco("deco_flower_tower", "Flower Tower", "🌺", "rare", "level", null, null, "tall tiered tower of cascading flowers"),
    deco("deco_lantern_string", "String Lights", "✨", "rare", "level", null, null, "strand of warm glowing garden string lights"),

    // ── EPIC · all carry a buff · special shop + level + spin (18) ─────────────────────────────────────────
    deco("deco_grand_fountain", "Grand Fountain", "⛲", "epic", "special", 3200, { stat: "growSpeed", value: 5 }, "tiered marble fountain with flowing water"),
    deco("deco_windmill", "Working Windmill", "🌬️", "epic", "special", 3400, { stat: "seedLuck", value: 6 }, "tall wooden windmill with turning sails"),
    deco("deco_glass_greenhouse", "Glass Greenhouse", "🏡", "epic", "special", 3600, { stat: "growSpeed", value: 7 }, "elegant victorian glass greenhouse"),
    deco("deco_golden_scarecrow", "Golden Scarecrow", "🌟", "epic", "special", 3200, { stat: "harvestLuck", value: 6 }, "scarecrow dressed in shining gold"),
    deco("deco_beehive_grand", "Grand Apiary", "🐝", "epic", "special", 3000, { stat: "goldHarvest", value: 6 }, "grand tiered beehive tower buzzing with bees"),
    deco("deco_crystal_pond", "Crystal Pond", "💠", "epic", "special", 3400, { stat: "harvestLuck", value: 7 }, "pond of glowing crystal-clear water with gems"),
    deco("deco_zen_garden", "Zen Garden", "🎋", "epic", "special", 3000, { stat: "petXp", value: 8 }, "raked sand zen garden with bamboo"),
    deco("deco_pergola", "Grape Pergola", "🍇", "epic", "special", 3200, { stat: "goldHarvest", value: 7 }, "wooden pergola heavy with grape vines"),
    deco("deco_sun_statue", "Sun Idol", "☀️", "epic", "level", null, { stat: "growSpeed", value: 6 }, "golden radiant sun-face garden idol"),
    deco("deco_moon_statue", "Moon Idol", "🌙", "epic", "level", null, { stat: "seedLuck", value: 7 }, "silver crescent-moon garden idol"),
    deco("deco_rune_stone", "Rune Stone", "🪨", "epic", "level", null, { stat: "harvestLuck", value: 6 }, "standing stone carved with glowing runes"),
    deco("deco_greenhouse_lush", "Lush Conservatory", "🌴", "epic", "level", null, { stat: "growSpeed", value: 7 }, "domed conservatory bursting with tropical plants"),
    deco("deco_fountain_koi", "Koi Fountain", "🐠", "epic", "level", null, { stat: "petXp", value: 8 }, "ornate fountain with leaping koi fish"),
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
    deco("deco_phoenix_perch", "Phoenix Perch", "🔥", "legendary", "level", null, { stat: "growSpeed", value: 11 }, "ornate perch with a small glowing phoenix"),
    deco("deco_moon_pool", "Moonlit Pool", "🌕", "legendary", "level", null, { stat: "petXp", value: 12 }, "still reflecting pool glowing with moonlight"),
    deco("deco_grand_greenhouse", "Emerald Greenhouse", "💚", "legendary", "level", null, { stat: "growSpeed", value: 12 }, "grand emerald-glass greenhouse glowing from within"),
    deco("deco_fortune_shrine", "Fortune Shrine", "⛩️", "legendary", "spin", null, { stat: "goldHarvest", value: 12 }, "red torii shrine wreathed in golden coins"),
    deco("deco_clover_fountain", "Clover Fountain", "🍀", "legendary", "spin", null, { stat: "seedLuck", value: 12 }, "fountain shaped like a giant four-leaf clover"),
    deco("deco_star_sundial", "Astral Sundial", "⭐", "legendary", "special", 6800, { stat: "harvestLuck", value: 11 }, "celestial sundial ringed with floating stars"),

    // ── MYTHIC · top buffs · level track + special shop only (4) ───────────────────────────────────────────
    deco("deco_world_tree", "The World Tree", "🌲", "mythic", "level", null, { stat: "growSpeed", value: 15 }, "colossal luminous world tree with golden glowing canopy"),
    deco("deco_cornucopia", "Eternal Cornucopia", "🌽", "mythic", "level", null, { stat: "goldHarvest", value: 18 }, "overflowing golden cornucopia spilling endless harvest"),
    deco("deco_celestial_garden", "Celestial Orrery", "🪐", "mythic", "special", 12000, { stat: "harvestLuck", value: 15 }, "floating celestial orrery of orbiting planets and stars"),
    deco("deco_gaia_shrine", "Shrine of Gaia", "🌍", "mythic", "special", 12000, { stat: "seedLuck", value: 16 }, "verdant living shrine overflowing with glowing greenery and blossoms"),
];

const BY_ID = new Map(DECORATIONS.map((d) => [d.id, d]));
export const decorationById = (id) => BY_ID.get(id) || null;
export const isDecoration = (id) => BY_ID.has(id);

// Aggregate the passive buffs from PLACED decoration ids (placing = equipping). Each UNIQUE decoration's buff
// counts ONCE — placing multiple copies of the same piece does NOT stack its bonus (dedupe by id). Different
// buffed decorations still add together, capped per stat. Returns { growSpeed, seedLuck, ... } %.
const BUFF_CAP = { growSpeed: 40, seedLuck: 50, harvestLuck: 40, petXp: 50, fertPower: 40, goldHarvest: 60 };
export function decorationBuffs(placedIds) {
    const out = { growSpeed: 0, seedLuck: 0, harvestLuck: 0, petXp: 0, fertPower: 0, goldHarvest: 0 };
    for (const id of new Set(placedIds || [])) { // dedupe → one bonus per decoration type, no dup stacking
        const d = BY_ID.get(id);
        if (d?.buff?.stat && out[d.buff.stat] != null) out[d.buff.stat] += d.buff.value;
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
    return `${m.icon} +${buff.value}${m.suffix}`;
}
