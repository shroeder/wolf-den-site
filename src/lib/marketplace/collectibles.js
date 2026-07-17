// Unlockable COLLECTIBLES — crisp vector game-icons (via react-icons/gi, CC BY 3.0) you earn by leveling.
// Shown as an inventory grid; the seed of the real gear system (these same items gain stats/abilities
// later). Rendered as icons in a grid, NOT worn on the avatar — so no flat-overlay jank. Keep ids STABLE.
import {
    GiAncientSword, GiAngelWings, GiBattleAxe, GiBlackHoleBolas, GiBowArrow, GiChestArmor, GiCoins, GiCosmicEgg,
    GiCrown, GiCrownedSkull, GiCrystalCluster, GiDeathStar, GiDiabloSkull, GiDragonBreath, GiDragonHead,
    GiDragonShield, GiDragonSpiral, GiFangs, GiFireGem, GiGalaxy, GiGauntlet, GiGrimReaper, GiHealthPotion,
    GiHolyGrail, GiHydra, GiOverlordHelm, GiPawPrint, GiPortal, GiRingedPlanet, GiRuneStone, GiSpellBook,
    GiStarSwirl, GiThorHammer, GiTrophy, GiWolfHead, GiWolfHowl,
} from "react-icons/gi";

export const COLLECTIBLES = [
    { id: "wolf_head", name: "Wolf Head", Icon: GiWolfHead, color: "#cbd5e1", level: 3, rarity: "common", hint: "Mark of the pack" },
    { id: "paw", name: "Wolf Paw", Icon: GiPawPrint, color: "#cbd5e1", level: 4, rarity: "common", hint: "You were here" },
    { id: "potion", name: "Health Potion", Icon: GiHealthPotion, color: "#ff6b6b", level: 5, rarity: "common", hint: "A curious brew" },
    { id: "coin", name: "Gold Coin", Icon: GiCoins, color: "#ffd75e", level: 6, rarity: "common", hint: "Shiny" },
    { id: "bow", name: "Hunter's Bow", Icon: GiBowArrow, color: "#b58143", level: 8, rarity: "common", hint: "Keep your distance" },
    { id: "spellbook", name: "Spellbook", Icon: GiSpellBook, color: "#7aa2ff", level: 10, rarity: "common", hint: "Arcane knowledge" },
    { id: "fang", name: "Beast Fang", Icon: GiFangs, color: "#e2e8f0", level: 12, rarity: "rare", hint: "Torn from something big" },
    { id: "sword", name: "Ancient Sword", Icon: GiAncientSword, color: "#9fb3c8", level: 14, rarity: "rare", hint: "Old steel, still sharp" },
    { id: "axe", name: "Battle Axe", Icon: GiBattleAxe, color: "#c0a15a", level: 16, rarity: "rare", hint: "Heavy and mean" },
    { id: "shield", name: "Dragon Shield", Icon: GiDragonShield, color: "#6ad0c8", level: 18, rarity: "rare", hint: "Scaled defense" },
    { id: "firegem", name: "Fire Gem", Icon: GiFireGem, color: "#ff7a45", level: 20, rarity: "rare", hint: "Warm to the touch" },
    { id: "trophy", name: "Champion's Trophy", Icon: GiTrophy, color: "#ffd75e", level: 22, rarity: "rare", hint: "Proof you showed up" },
    { id: "crystal", name: "Crystal Cluster", Icon: GiCrystalCluster, color: "#a855f7", level: 24, rarity: "rare", hint: "Humming with power" },
    { id: "crown", name: "Golden Crown", Icon: GiCrown, color: "#ffd75e", level: 26, rarity: "epic", hint: "Wear your status" },
    { id: "howl", name: "Howling Wolf", Icon: GiWolfHowl, color: "#9aa7b5", level: 30, rarity: "epic", hint: "Heard for miles" },
    { id: "wings", name: "Angel Wings", Icon: GiAngelWings, color: "#ffe27a", level: 34, rarity: "epic", hint: "Ascend" },
    { id: "dragon_head", name: "Dragon Head", Icon: GiDragonHead, color: "#ff5a5a", level: 38, rarity: "epic", hint: "Slain, or tamed?" },
    { id: "gauntlet", name: "Iron Gauntlet", Icon: GiGauntlet, color: "#9fb3c8", level: 42, rarity: "epic", hint: "A crushing grip" },
    { id: "crowned_skull", name: "Crowned Skull", Icon: GiCrownedSkull, color: "#c084fc", level: 46, rarity: "legendary", hint: "Ruler of ruin" },
    { id: "dragon_spiral", name: "Dragon Spiral", Icon: GiDragonSpiral, color: "#ff8c42", level: 48, rarity: "legendary", hint: "The great wyrm" },
    { id: "dragon_breath", name: "Dragon's Breath", Icon: GiDragonBreath, color: "#ff5a7a", level: 50, rarity: "legendary", hint: "Breathe fire" },
    // --- The long game (52–100): increasingly epic loot so the back half never goes stale ---
    { id: "dragonplate", name: "Dragonplate Armor", Icon: GiChestArmor, color: "#9fb3c8", level: 52, rarity: "epic", hint: "Forged from a wyrm" },
    { id: "runestone", name: "Rune Stone", Icon: GiRuneStone, color: "#7aa2ff", level: 55, rarity: "epic", hint: "Words of power" },
    { id: "grail", name: "Holy Grail", Icon: GiHolyGrail, color: "#ffd75e", level: 58, rarity: "epic", hint: "Sought by many" },
    { id: "hydra", name: "Hydra", Icon: GiHydra, color: "#6ad0c8", level: 62, rarity: "legendary", hint: "Cut one, two grow back" },
    { id: "storm_hammer", name: "Storm Hammer", Icon: GiThorHammer, color: "#7aa2ff", level: 66, rarity: "legendary", hint: "Thunder in your grip" },
    { id: "reaper", name: "Grim Reaper", Icon: GiGrimReaper, color: "#c084fc", level: 70, rarity: "legendary", hint: "Time's up" },
    { id: "overlord", name: "Overlord Helm", Icon: GiOverlordHelm, color: "#ff5a5a", level: 74, rarity: "legendary", hint: "Rule with iron" },
    { id: "ringed_world", name: "Ringed World", Icon: GiRingedPlanet, color: "#ffb14a", level: 78, rarity: "legendary", hint: "A world of your own" },
    { id: "diablo_skull", name: "Diablo Skull", Icon: GiDiabloSkull, color: "#ff5a5a", level: 82, rarity: "legendary", hint: "Terror incarnate" },
    { id: "cosmic_egg", name: "Cosmic Egg", Icon: GiCosmicEgg, color: "#a855f7", level: 86, rarity: "mythic", hint: "Something is hatching" },
    { id: "rift_portal", name: "Rift Portal", Icon: GiPortal, color: "#5affaf", level: 90, rarity: "mythic", hint: "A door between worlds" },
    { id: "galaxy_core", name: "Galaxy Core", Icon: GiGalaxy, color: "#b45aff", level: 93, rarity: "mythic", hint: "Hold a galaxy" },
    { id: "dead_star", name: "Dead Star", Icon: GiDeathStar, color: "#ffd75e", level: 96, rarity: "mythic", hint: "A collapsed sun" },
    { id: "star_swirl", name: "Star Swirl", Icon: GiStarSwirl, color: "#5a9bff", level: 98, rarity: "mythic", hint: "Bend the heavens" },
    { id: "singularity", name: "The Singularity", Icon: GiBlackHoleBolas, color: "#ff5a7a", level: 100, rarity: "mythic", hint: "The end of everything" },
];

export function collectibleById(id) {
    return COLLECTIBLES.find((c) => c.id === id) || null;
}

export function isCollectibleUnlocked(item, level, { unlockAll = false } = {}) {
    return unlockAll || Math.max(1, Math.floor(Number(level) || 1)) >= item.level;
}

export function collectiblesForLevel(level, { unlockAll = false } = {}) {
    return COLLECTIBLES.map((c) => ({ ...c, unlocked: isCollectibleUnlocked(c, level, { unlockAll }) }));
}
