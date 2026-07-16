// Unlockable COLLECTIBLES — crisp vector game-icons (via react-icons/gi, CC BY 3.0) you earn by leveling.
// Shown as an inventory grid; the seed of the real gear system (these same items gain stats/abilities
// later). Rendered as icons in a grid, NOT worn on the avatar — so no flat-overlay jank. Keep ids STABLE.
import {
    GiAncientSword, GiAngelWings, GiBattleAxe, GiBowArrow, GiCoins, GiCrown, GiCrownedSkull, GiCrystalCluster,
    GiDragonBreath, GiDragonHead, GiDragonShield, GiDragonSpiral, GiFangs, GiFireGem, GiGauntlet,
    GiHealthPotion, GiPawPrint, GiSpellBook, GiTrophy, GiWolfHead, GiWolfHowl,
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
    { id: "dragon_breath", name: "Dragon's Breath", Icon: GiDragonBreath, color: "#ff5a7a", level: 50, rarity: "legendary", hint: "Apex" },
];

export function isCollectibleUnlocked(item, level, { unlockAll = false } = {}) {
    return unlockAll || Math.max(1, Math.floor(Number(level) || 1)) >= item.level;
}

export function collectiblesForLevel(level, { unlockAll = false } = {}) {
    return COLLECTIBLES.map((c) => ({ ...c, unlocked: isCollectibleUnlocked(c, level, { unlockAll }) }));
}
