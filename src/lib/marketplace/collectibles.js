// Unlockable PETS — companions collected from many sources (leveling, the shop, achievements, rare chests,
// boss drops). Every pet OWNED adds a small passive account bonus (they stack); the one you EQUIP (feature)
// gives a stronger themed active buff. Crisp vector game-icons (react-icons/gi, CC BY 3.0). Keep ids STABLE.
// (Export names stay `collectible*` for back-compat with existing importers — conceptually these are pets.)
import {
    GiRabbit, GiFrog, GiChicken, GiCat, GiFox, GiWolfHead, GiOwl, GiBearFace, GiRaven, GiSnake, GiDeer,
    GiBat, GiScorpion, GiTigerHead, GiSeahorse, GiEagleEmblem, GiLion, GiGorilla, GiCrocJaws, GiHydra,
    GiGriffinSymbol, GiUnicorn, GiSpikedDragonHead, GiPegasus, GiDinosaurRex, GiWhaleTail, GiChameleonGlyph,
    GiDragonHead, GiDragonSpiral, GiSpectre,
    // Expanded roster
    GiPenguin, GiHedgehog, GiTurtle, GiParrotHead, GiMonkey, GiPanda, GiDolphin, GiCrab, GiSheep, GiKangaroo,
    GiFlamingo, GiBee, GiSloth, GiRaccoonHead, GiBeaver, GiToucan, GiLadybug, GiButterfly, GiJellyfish,
    GiOctopus, GiSquid, GiAxolotl, GiTropicalFish, GiSeaSerpent, GiKrakenTentacle, GiWyvern, GiMinotaur,
    GiCentaur, GiMammoth, GiPolarBear, GiVulture, GiFairy, GiImp, GiElephant,
    GiAnglerFish, GiSeaDragon, GiFishMonster,
} from "react-icons/gi";

// Passive bonus each OWNED pet contributes to your account (all owned pets stack), by rarity.
export const PET_PASSIVE_BY_RARITY = { common: 1, rare: 2, epic: 4, legendary: 6, mythic: 9, ascendant: 13, eternal: 18 };

// Each pet's PASSIVE stat is its own (distinct from its active) so every pet feels unique — collecting a
// varied menagerie shapes a varied account bonus rather than a stack of the same stat.
export const PET_PASSIVE_STAT = {
    // Level
    bunny: "gold_find", frog: "fortune", chick: "xp_gain", kitten: "fortune", fox_kit: "gold_find",
    wolf_pup: "ferocity", owl: "fortune", bear_cub: "crit_power", raven: "crit_chance", serpent: "crit_power",
    fawn: "xp_gain", bat: "ferocity", scorpion: "might", tiger_cub: "crit_chance", seahorse: "gold_find",
    eagle: "might", lion_cub: "ferocity", gorilla: "crit_power", croc: "ferocity", hydra: "crit_power",
    griffin: "crit_chance", unicorn: "xp_gain", dragon_whelp: "might", pegasus: "fortune", baby_rex: "might",
    sky_whale: "xp_gain", chameleon: "fortune", elder_dragon: "crit_power",
    // Shop
    penguin: "fortune", hedgehog: "gold_find", sheep: "xp_gain", crab: "might", turtle: "might",
    parrot: "fortune", dolphin: "xp_gain", monkey: "gold_find", panda: "fortune", kangaroo: "crit_power",
    // Achievement
    ladybug: "gold_find", bee: "xp_gain", sloth: "fortune", beaver: "gold_find", raccoon: "gold_find",
    flamingo: "xp_gain", toucan: "gold_find",
    // Chest
    tropical_fish: "gold_find", axolotl: "fortune", butterfly: "xp_gain", squid: "crit_power", jellyfish: "ferocity", octopus: "crit_chance",
    corsair_parrot: "crit_chance", marlin: "might", anglerfish: "fortune", sea_wyrm: "crit_power",
    // Boss
    vulture: "might", minotaur: "ferocity", centaur: "might", imp: "crit_chance", polar_bear: "ferocity",
    mammoth: "might", wyvern: "crit_power", sea_serpent: "crit_chance", fairy: "xp_gain", kraken: "ferocity",
    // Elite
    molten_phoenix: "crit_power", eternal_wolf: "ferocity", bounty_hound: "gold_find",
    // Merchant (sailing-exclusive)
    elephant_spear: "gold_find",
};
// Active buff strength when a pet is EQUIPPED/featured, by rarity (percent).
export const PET_ACTIVE_BY_RARITY = { common: 3, rare: 5, epic: 8, legendary: 12, mythic: 16, ascendant: 22, eternal: 30 };
// Default shop price by rarity (a shop pet may override with its own `price`).
export const SHOP_PRICE_BY_RARITY = { common: 600, rare: 1400, epic: 3000, legendary: 6000, mythic: 12000 };

// Buff stats a pet can grant (combat + economy). Passive is always Fortune (a menagerie brings luck).
export const PET_STAT_META = {
    might: { label: "Might", icon: "⚔️" },
    crit_chance: { label: "Crit Chance", icon: "🎯" },
    crit_power: { label: "Crit Power", icon: "💥" },
    ferocity: { label: "Ferocity", icon: "🔥" },
    fortune: { label: "Fortune", icon: "🍀" },
    xp_gain: { label: "XP Gain", icon: "✨" },
    gold_find: { label: "Gold Find", icon: "💰" },
};

const CHEST_LABEL = { wooden: "Wooden", iron: "Iron", gold: "Gold", mythic: "Mythic", ascendant: "Ascendant", eternal: "Eternal", celestial: "Celestial", primordial: "Primordial" };

// spritePrompt = the creature descriptor fed to the AI when generating each pet's battle sprite.
export const COLLECTIBLES = [
    // ── Level rewards (unlocked by reaching the level) ─────────────────────────────────────────────
    { id: "bunny", name: "Bunny", Icon: GiRabbit, color: "#e2e8f0", rarity: "common", source: "level", level: 2, activeStat: "fortune", hint: "Small, quick, loyal", spritePrompt: "a cute fluffy white bunny rabbit" },
    { id: "frog", name: "Frog", Icon: GiFrog, color: "#6ad07a", rarity: "common", source: "level", level: 3, activeStat: "gold_find", hint: "Ribbit", spritePrompt: "a cheerful little green frog" },
    { id: "chick", name: "Chick", Icon: GiChicken, color: "#ffd75e", rarity: "common", source: "level", level: 4, activeStat: "gold_find", hint: "Peep peep", spritePrompt: "a tiny fluffy yellow baby chick" },
    { id: "kitten", name: "Kitten", Icon: GiCat, color: "#e2b07a", rarity: "common", source: "level", level: 5, activeStat: "crit_chance", hint: "Mischief incarnate", spritePrompt: "a playful little kitten" },
    { id: "fox_kit", name: "Fox Kit", Icon: GiFox, color: "#ff8c42", rarity: "common", source: "level", level: 7, activeStat: "crit_chance", hint: "Sly and swift", spritePrompt: "a small orange fox kit with a bushy tail" },
    { id: "wolf_pup", name: "Wolf Pup", Icon: GiWolfHead, color: "#9aa7b5", rarity: "common", source: "level", level: 9, activeStat: "might", hint: "Born of the pack", spritePrompt: "a fluffy grey wolf pup" },
    { id: "owl", name: "Owl", Icon: GiOwl, color: "#c9a36a", rarity: "common", source: "level", level: 11, activeStat: "xp_gain", hint: "Wise night flyer", spritePrompt: "a round little brown owl" },
    { id: "bear_cub", name: "Bear Cub", Icon: GiBearFace, color: "#b07a4a", rarity: "rare", source: "level", level: 13, activeStat: "might", hint: "Chubby and strong", spritePrompt: "a chubby brown bear cub" },
    { id: "raven", name: "Raven", Icon: GiRaven, color: "#8794a3", rarity: "rare", source: "level", level: 15, activeStat: "xp_gain", hint: "Keeper of secrets", spritePrompt: "a glossy black raven" },
    { id: "serpent", name: "Serpent", Icon: GiSnake, color: "#6ad0c8", rarity: "rare", source: "level", level: 17, activeStat: "crit_chance", hint: "Coiled and patient", spritePrompt: "a small green coiled serpent" },
    { id: "fawn", name: "Fawn", Icon: GiDeer, color: "#d9a86a", rarity: "rare", source: "level", level: 19, activeStat: "fortune", hint: "Gentle of the glade", spritePrompt: "a spotted baby deer fawn" },
    { id: "bat", name: "Bat", Icon: GiBat, color: "#9a7ad0", rarity: "rare", source: "level", level: 21, activeStat: "crit_chance", hint: "Little night wing", spritePrompt: "a tiny purple bat" },
    { id: "scorpion", name: "Scorpion", Icon: GiScorpion, color: "#e0a03a", rarity: "rare", source: "level", level: 24, activeStat: "crit_power", hint: "Sting in the sand", spritePrompt: "a small desert scorpion" },
    { id: "tiger_cub", name: "Tiger Cub", Icon: GiTigerHead, color: "#ff9e42", rarity: "rare", source: "level", level: 27, activeStat: "might", hint: "Stripes and spirit", spritePrompt: "a striped orange tiger cub" },
    { id: "seahorse", name: "Seahorse", Icon: GiSeahorse, color: "#5ad0d0", rarity: "epic", source: "level", level: 30, activeStat: "fortune", hint: "Drifts on the tide", spritePrompt: "a delicate glowing seahorse" },
    { id: "eagle", name: "Eagle", Icon: GiEagleEmblem, color: "#d0a85a", rarity: "epic", source: "level", level: 34, activeStat: "crit_chance", hint: "Master of the sky", spritePrompt: "a proud majestic eagle" },
    { id: "lion_cub", name: "Lion Cub", Icon: GiLion, color: "#ffb14a", rarity: "epic", source: "level", level: 38, activeStat: "might", hint: "A little king", spritePrompt: "a fuzzy golden lion cub" },
    { id: "gorilla", name: "Gorilla", Icon: GiGorilla, color: "#8a8f9a", rarity: "epic", source: "level", level: 42, activeStat: "might", hint: "Silverback strength", spritePrompt: "a mighty silverback gorilla" },
    { id: "croc", name: "Croc", Icon: GiCrocJaws, color: "#6aa84a", rarity: "epic", source: "level", level: 46, activeStat: "crit_power", hint: "All teeth", spritePrompt: "a snappy little green crocodile" },
    { id: "hydra", name: "Hydra Hatchling", Icon: GiHydra, color: "#6ad0c8", rarity: "legendary", source: "level", level: 50, activeStat: "ferocity", hint: "Cut one, two grow back", spritePrompt: "a small three-headed hydra hatchling" },
    { id: "griffin", name: "Griffin", Icon: GiGriffinSymbol, color: "#d9b25e", rarity: "legendary", source: "level", level: 55, activeStat: "might", hint: "Eagle and lion", spritePrompt: "a noble griffin cub with feathered wings" },
    { id: "unicorn", name: "Unicorn", Icon: GiUnicorn, color: "#ffc7ec", rarity: "legendary", source: "level", level: 60, activeStat: "fortune", hint: "Purest magic", spritePrompt: "a white unicorn foal with a glowing horn" },
    { id: "dragon_whelp", name: "Dragon Whelp", Icon: GiSpikedDragonHead, color: "#ff5a5a", rarity: "legendary", source: "level", level: 66, activeStat: "ferocity", hint: "Small, but a dragon", spritePrompt: "a cute baby dragon whelp with tiny wings" },
    { id: "pegasus", name: "Pegasus", Icon: GiPegasus, color: "#bfe0ff", rarity: "legendary", source: "level", level: 72, activeStat: "xp_gain", hint: "Winged and free", spritePrompt: "a white winged pegasus foal" },
    { id: "baby_rex", name: "Baby Rex", Icon: GiDinosaurRex, color: "#6aa84a", rarity: "legendary", source: "level", level: 78, activeStat: "crit_power", hint: "Tiny apex predator", spritePrompt: "a baby tyrannosaurus rex" },
    { id: "sky_whale", name: "Sky Whale", Icon: GiWhaleTail, color: "#5a9bff", rarity: "mythic", source: "level", level: 84, activeStat: "fortune", hint: "Swims the clouds", spritePrompt: "a majestic floating sky whale with cloud wisps" },
    { id: "chameleon", name: "Prismatic Chameleon", Icon: GiChameleonGlyph, color: "#b45aff", rarity: "mythic", source: "level", level: 90, activeStat: "crit_chance", hint: "Every color at once", spritePrompt: "a colour-shifting rainbow prismatic chameleon" },
    { id: "elder_dragon", name: "Elder Dragon", Icon: GiDragonHead, color: "#ff5a7a", rarity: "mythic", source: "level", level: 100, activeStat: "ferocity", hint: "The apex companion", spritePrompt: "a legendary majestic elder dragon" },

    // ── Shop (buy with gold) ───────────────────────────────────────────────────────────────────────
    { id: "penguin", name: "Penguin", Icon: GiPenguin, color: "#bfe0ff", rarity: "common", source: "shop", activeStat: "gold_find", hint: "Dressed to impress", spritePrompt: "a dapper little penguin" },
    { id: "hedgehog", name: "Hedgehog", Icon: GiHedgehog, color: "#c9a36a", rarity: "common", source: "shop", activeStat: "fortune", hint: "Prickly good luck", spritePrompt: "a tiny round hedgehog" },
    { id: "sheep", name: "Sheep", Icon: GiSheep, color: "#e2e8f0", rarity: "common", source: "shop", activeStat: "gold_find", hint: "Counts your gold", spritePrompt: "a fluffy white sheep" },
    { id: "crab", name: "Crab", Icon: GiCrab, color: "#ff7a4d", rarity: "common", source: "shop", activeStat: "crit_power", sea: { dredge: 4 }, hint: "Pinchy — digs up more at sea", spritePrompt: "a little red crab" },
    { id: "turtle", name: "Turtle", Icon: GiTurtle, color: "#6ad07a", rarity: "rare", source: "shop", activeStat: "ferocity", sea: { ironclad: 5 }, hint: "Slow, steady, hard to sink", spritePrompt: "a small green turtle" },
    { id: "parrot", name: "Parrot", Icon: GiParrotHead, color: "#6bf0ff", rarity: "rare", source: "shop", activeStat: "xp_gain", hint: "Repeats your wisdom", spritePrompt: "a colorful tropical parrot" },
    { id: "dolphin", name: "Dolphin", Icon: GiDolphin, color: "#5ad0d0", rarity: "rare", source: "shop", activeStat: "fortune", sea: { tailwind: 5 }, hint: "Rides your luck — and the wind", spritePrompt: "a leaping dolphin" },
    { id: "monkey", name: "Monkey", Icon: GiMonkey, color: "#b07a4a", rarity: "epic", source: "shop", activeStat: "crit_chance", hint: "Cheeky and quick", spritePrompt: "a playful monkey" },
    { id: "panda", name: "Panda", Icon: GiPanda, color: "#e2e8f0", rarity: "epic", source: "shop", activeStat: "might", hint: "Gentle giant", spritePrompt: "a cute panda cub" },
    { id: "kangaroo", name: "Kangaroo", Icon: GiKangaroo, color: "#d9a86a", rarity: "epic", source: "shop", activeStat: "might", hint: "Packs a punch", spritePrompt: "a bounding kangaroo" },

    // ── Achievement (earned by a milestone) ────────────────────────────────────────────────────────
    { id: "ladybug", name: "Ladybug", Icon: GiLadybug, color: "#e23b4e", rarity: "common", source: "achievement", activeStat: "fortune", achievement: "Add your first card to your Looking For list", spritePrompt: "a cute red ladybug with black spots" },
    { id: "bee", name: "Bumblebee", Icon: GiBee, color: "#ffd75e", rarity: "rare", source: "achievement", activeStat: "gold_find", achievement: "Complete 10 daily quests", spritePrompt: "a fuzzy yellow-and-black bumblebee" },
    { id: "sloth", name: "Sloth", Icon: GiSloth, color: "#b07a4a", rarity: "rare", source: "achievement", activeStat: "xp_gain", achievement: "Open the app 14 different days", spritePrompt: "a sleepy smiling sloth" },
    { id: "beaver", name: "Beaver", Icon: GiBeaver, color: "#a97a4a", rarity: "rare", source: "achievement", activeStat: "might", achievement: "Post 5 bounties on the board", spritePrompt: "an industrious beaver with a log" },
    { id: "raccoon", name: "Raccoon", Icon: GiRaccoonHead, color: "#8794a3", rarity: "epic", source: "achievement", activeStat: "crit_chance", achievement: "Complete 5 trades", spritePrompt: "a clever masked raccoon" },
    { id: "flamingo", name: "Flamingo", Icon: GiFlamingo, color: "#ff5fa2", rarity: "epic", source: "achievement", activeStat: "fortune", achievement: "Make 10 friends", spritePrompt: "an elegant pink flamingo" },
    { id: "toucan", name: "Toucan", Icon: GiToucan, color: "#ff8c42", rarity: "epic", source: "achievement", activeStat: "fortune", achievement: "Fulfill 3 community bounties", spritePrompt: "a bright big-billed toucan" },
    // Pet-LEVELING achievement pets — earned by leveling your companions (see ACHIEVEMENT_PET_RULES).
    { id: "spirit_fox", name: "Spirit Fox", Icon: GiSpectre, color: "#8fd3ff", rarity: "legendary", source: "achievement", activeStat: "xp_gain", achievement: "Gain 10 total pet levels", spritePrompt: "a glowing ethereal nine-tailed spirit fox wreathed in soft blue flame" },
    { id: "runebound_drake", name: "Runebound Drake", Icon: GiDragonHead, color: "#7a9bff", rarity: "mythic", source: "achievement", activeStat: "ferocity", achievement: "Max 5 pets to Lv 5", spritePrompt: "a majestic rune-etched drake crackling with arcane blue energy" },
    { id: "radiant_phoenix", name: "Radiant Phoenix", Icon: GiDragonSpiral, color: "#ffd75e", rarity: "mythic", source: "achievement", activeStat: "ferocity", achievement: "Max a Legendary-or-higher pet to Lv 5", spritePrompt: "a radiant golden phoenix reborn in brilliant blazing light" },

    // ── Rare-chest drops ───────────────────────────────────────────────────────────────────────────
    { id: "tropical_fish", name: "Reef Fish", Icon: GiTropicalFish, color: "#5ad0d0", rarity: "common", source: "chest", chestTier: "wooden", activeStat: "fortune", hint: "A flash of color", spritePrompt: "a bright tropical reef fish" },
    { id: "axolotl", name: "Axolotl", Icon: GiAxolotl, color: "#ff9ec7", rarity: "rare", source: "chest", chestTier: "iron", activeStat: "xp_gain", hint: "Forever smiling", spritePrompt: "a pink smiling axolotl" },
    { id: "butterfly", name: "Butterfly", Icon: GiButterfly, color: "#b45aff", rarity: "rare", source: "chest", chestTier: "gold", activeStat: "fortune", hint: "Fragile magic", spritePrompt: "a shimmering iridescent butterfly" },
    { id: "squid", name: "Squid", Icon: GiSquid, color: "#5a9bff", rarity: "epic", source: "chest", chestTier: "gold", activeStat: "crit_chance", hint: "Ink and speed", spritePrompt: "a bioluminescent glowing squid" },
    { id: "jellyfish", name: "Jellyfish", Icon: GiJellyfish, color: "#b45aff", rarity: "epic", source: "chest", chestTier: "mythic", activeStat: "crit_power", hint: "Drifting current", spritePrompt: "a glowing translucent jellyfish" },
    { id: "octopus", name: "Octopus", Icon: GiOctopus, color: "#ff5a7a", rarity: "legendary", source: "chest", chestTier: "ascendant", activeStat: "ferocity", sea: { plunder: 6 }, hint: "Eight arms, eight grabs of plunder", spritePrompt: "a clever deep-sea octopus" },
    // ── Sailing pets — dug up from forged chests; each carries a strong SEA affinity for raids/digging/voyages ──
    { id: "corsair_parrot", name: "Corsair Parrot", Icon: GiParrotHead, color: "#ff5a4d", rarity: "rare", source: "chest", chestTier: "iron", activeStat: "crit_chance", sea: { plunder: 4 }, hint: "Spots the loot before you do", spritePrompt: "a colorful pirate's parrot perched with a tiny gold hoop and a red feather" },
    { id: "marlin", name: "Marlin", Icon: GiFishMonster, color: "#3a9bd8", rarity: "epic", source: "chest", chestTier: "gold", activeStat: "crit_power", sea: { broadside: 6 }, hint: "A living cannonball", spritePrompt: "a sleek blue marlin with a long spear-like bill, mid-leap" },
    { id: "anglerfish", name: "Anglerfish", Icon: GiAnglerFish, color: "#5ad0c0", rarity: "epic", source: "chest", chestTier: "mythic", activeStat: "fortune", sea: { trove: 6 }, hint: "Its lure finds buried treasure", spritePrompt: "a deep-sea anglerfish with a glowing lure" },
    { id: "sea_wyrm", name: "Sea Wyrm", Icon: GiSeaDragon, color: "#35d07f", rarity: "ascendant", source: "chest", chestTier: "ascendant", activeStat: "ferocity", sea: { plunder: 5, broadside: 5 }, hint: "A leviathan in miniature — master of the raid", spritePrompt: "a majestic coiling sea dragon wyrm wreathed in glowing water, awe-inspiring" },

    // ── Boss-battle-only drops ─────────────────────────────────────────────────────────────────────
    { id: "vulture", name: "Vulture", Icon: GiVulture, color: "#8794a3", rarity: "rare", source: "boss", activeStat: "crit_chance", hint: "Circles the fallen", spritePrompt: "a circling bald vulture" },
    { id: "minotaur", name: "Minotaur", Icon: GiMinotaur, color: "#b07a4a", rarity: "epic", source: "boss", activeStat: "might", hint: "Lord of the maze", spritePrompt: "a hulking horned minotaur" },
    { id: "centaur", name: "Centaur", Icon: GiCentaur, color: "#d9a86a", rarity: "epic", source: "boss", activeStat: "crit_chance", hint: "Archer of the plains", spritePrompt: "a proud centaur archer" },
    { id: "imp", name: "Imp", Icon: GiImp, color: "#ff5a5a", rarity: "epic", source: "boss", activeStat: "crit_power", hint: "Little troublemaker", spritePrompt: "a mischievous little red imp" },
    { id: "polar_bear", name: "Polar Bear", Icon: GiPolarBear, color: "#e2f0ff", rarity: "legendary", source: "boss", activeStat: "might", hint: "Cold-blooded power", spritePrompt: "a huge white polar bear" },
    { id: "mammoth", name: "Mammoth", Icon: GiMammoth, color: "#9aa7b5", rarity: "legendary", source: "boss", activeStat: "ferocity", hint: "Ancient and immense", spritePrompt: "a woolly mammoth with great tusks" },
    { id: "wyvern", name: "Wyvern", Icon: GiWyvern, color: "#ff5a5a", rarity: "legendary", source: "boss", activeStat: "might", hint: "Wings and venom", spritePrompt: "a fierce winged wyvern" },
    { id: "sea_serpent", name: "Sea Serpent", Icon: GiSeaSerpent, color: "#2fae72", rarity: "legendary", source: "boss", activeStat: "ferocity", hint: "Terror of the deep", spritePrompt: "a coiling green sea serpent" },
    { id: "fairy", name: "Fairy", Icon: GiFairy, color: "#ffc7ec", rarity: "mythic", source: "boss", activeStat: "fortune", hint: "A wish with wings", spritePrompt: "a tiny glowing winged fairy sprinkling sparkles" },
    { id: "kraken", name: "Kraken", Icon: GiKrakenTentacle, color: "#6a4fe0", rarity: "mythic", source: "boss", activeStat: "crit_power", hint: "Release the kraken", spritePrompt: "a monstrous kraken with huge tentacles" },

    // ── Elite (NOT level-unlocked) — special triggers ──────────────────────────────────────────────
    { id: "molten_phoenix", name: "Molten Phoenix", Icon: GiDragonSpiral, color: "#ff7a3c", rarity: "ascendant", source: "elite", eliteOnly: true, unlockRarity: "ascendant", unlockText: "Own an Ascendant+ item & win 3 boss raffles", activeStat: "ferocity", hint: "Reborn from Ascendant fire", spritePrompt: "a blazing molten phoenix wreathed in orange-gold fire and embers, radiating heat" },
    { id: "eternal_wolf", name: "Eternal Wolf Spirit", Icon: GiSpectre, color: "#ff5cc8", rarity: "eternal", source: "elite", eliteOnly: true, unlockRarity: "eternal", unlockText: "Own an Eternal item & win 5 boss raffles", activeStat: "might", hint: "Bound to an Eternal relic", spritePrompt: "a majestic ghostly wolf spirit glowing with impossible prismatic rainbow light, ethereal and translucent" },
    { id: "bounty_hound", name: "Bounty Hound", Icon: GiWolfHead, color: "#ffd75e", rarity: "legendary", source: "achievement", eliteOnly: true, activeStat: "fortune", achievement: "Fulfill 10 community bounties", spritePrompt: "a loyal rugged hound wearing a bounty hunter's bandana, alert and ready for the hunt" },

    // ── Merchant (sailing-exclusive) — only ever gifted by the Gold Merchant island event ──────────────
    { id: "elephant_spear", name: "Merchant's Guard", Icon: GiElephant, color: "#c9a24a", rarity: "legendary", source: "merchant", eliteOnly: true, activeStat: "gold_find", hint: "Boosts your chance to find the Gold Merchant at sea (+1% → +5% by level)", spritePrompt: "a standing cartoon elephant warrior holding a spear" },
];

const BY_ID = Object.fromEntries(COLLECTIBLES.map((c) => [c.id, c]));

// The elite pet unlocked by obtaining an item of a given top rarity (or null).
export function elitePetForRarity(rarity) {
    return COLLECTIBLES.find((c) => c.eliteOnly && c.unlockRarity === rarity) || null;
}

export function collectibleById(id) {
    return BY_ID[id] || null;
}

// Passive bonus this pet adds just by being OWNED (all owned pets stack) — its own themed stat.
export function petPassive(pet) {
    return { stat: PET_PASSIVE_STAT[pet.id] || pet.activeStat || "fortune", value: PET_PASSIVE_BY_RARITY[pet.rarity] || 1 };
}

// Active buff this pet grants when EQUIPPED/featured — its themed stat, scaled by rarity.
export function petActive(pet) {
    return { stat: pet.activeStat || "fortune", value: PET_ACTIVE_BY_RARITY[pet.rarity] || 3 };
}

// Level scaling (pure, client-safe): leveling boosts the EQUIPPED pet's ACTIVE (Lv5 ×3), while the always-on
// per-owned-pet PASSIVE scales only gently (Lv5 ×2). So "collect pets" (passive) and "invest in one" (active)
// stay distinct and the active clearly wins on your equipped companion.
export function petActiveLevelMult(level) { return 1 + (Math.max(1, Number(level) || 1) - 1) * 0.5; }
export function petPassiveLevelMult(level) { return 1 + (Math.max(1, Number(level) || 1) - 1) * 0.25; }

// Special passive MECHANIC for top-rarity pets (beyond a bigger number):
//  - DUAL AFFINITY (legendary+): the pet also grants a SECOND passive stat (its active's theme).
//  - MENAGERIE AURA (mythic+): it amplifies ALL your owned pets' passive stats (the single best aura applies).
// Scales up by rarity. Pure + client-safe.
const PET_SPECIAL_TIER = {
    legendary: { secondFrac: 0.5, aura: 0 },
    mythic: { secondFrac: 0.6, aura: 0.08 },
    ascendant: { secondFrac: 0.7, aura: 0.14 },
    eternal: { secondFrac: 0.8, aura: 0.22 },
    celestial: { secondFrac: 0.9, aura: 0.3 },
    primordial: { secondFrac: 1, aura: 0.4 },
};
export function petSpecialPassive(pet) {
    const t = pet && PET_SPECIAL_TIER[pet.rarity];
    if (!t) return null;
    const passiveStat = PET_PASSIVE_STAT[pet.id] || pet.activeStat || "fortune";
    const second = pet.activeStat && pet.activeStat !== passiveStat ? pet.activeStat : null; // dual affinity
    const base = PET_PASSIVE_BY_RARITY[pet.rarity] || 1;
    return { secondStat: second, secondValue: second ? Math.max(1, Math.round(base * t.secondFrac)) : 0, aura: t.aura };
}

export function petPrice(pet) {
    return pet.price || SHOP_PRICE_BY_RARITY[pet.rarity] || 0;
}

// Human-readable "how to unlock" for a pet.
export function petUnlockText(pet) {
    switch (pet.source) {
        case "level": return `Reach Level ${pet.level}`;
        case "shop": return `Buy for ${petPrice(pet).toLocaleString()} gold`;
        case "chest": return `Found in ${CHEST_LABEL[pet.chestTier] || "rare"}+ chests`;
        case "boss": return "Rare boss-battle drop";
        case "achievement": return pet.achievement || "Earn via an achievement";
        case "elite": return pet.unlockText || (pet.unlockRarity ? `Own any ${pet.unlockRarity}-tier item` : (pet.hint || "Special unlock"));
        default: return pet.hint || "";
    }
}

// Owned if explicitly granted (owned set), or — for level pets — the member has reached the level.
export function isCollectibleUnlocked(item, level, { unlockAll = false, owned = null } = {}) {
    if (unlockAll) return true;
    if (owned && owned.has(item.id)) return true;
    if (item.source === "level") return Math.max(1, Math.floor(Number(level) || 1)) >= item.level;
    return false;
}

export function collectiblesForLevel(level, { unlockAll = false, owned = null } = {}) {
    return COLLECTIBLES.map((c) => ({ ...c, unlocked: isCollectibleUnlocked(c, level, { unlockAll, owned }) }));
}
