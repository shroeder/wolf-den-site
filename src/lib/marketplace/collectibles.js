// Unlockable PETS — companions you earn by leveling. Shown as an inventory grid (crisp vector game-icons,
// react-icons/gi, CC BY 3.0); the member sets one ACTIVE pet that rides along on their profile/hero cards
// and, once its sprite is generated, fights beside them in the boss battle. Keep ids STABLE.
// (Export names stay `collectible*` for back-compat with existing importers — conceptually these are pets.)
import {
    GiRabbit, GiFrog, GiChicken, GiCat, GiFox, GiWolfHead, GiOwl, GiBearFace, GiRaven, GiSnake, GiDeer,
    GiBat, GiScorpion, GiTigerHead, GiSeahorse, GiEagleEmblem, GiLion, GiGorilla, GiCrocJaws, GiHydra,
    GiGriffinSymbol, GiUnicorn, GiSpikedDragonHead, GiPegasus, GiDinosaurRex, GiWhaleTail, GiChameleonGlyph,
    GiDragonHead,
} from "react-icons/gi";

// spritePrompt = the creature descriptor fed to the AI when generating each pet's battle sprite.
export const COLLECTIBLES = [
    { id: "bunny", name: "Bunny", Icon: GiRabbit, color: "#e2e8f0", level: 2, rarity: "common", hint: "Small, quick, loyal", spritePrompt: "a cute fluffy white bunny rabbit" },
    { id: "frog", name: "Frog", Icon: GiFrog, color: "#6ad07a", level: 3, rarity: "common", hint: "Ribbit", spritePrompt: "a cheerful little green frog" },
    { id: "chick", name: "Chick", Icon: GiChicken, color: "#ffd75e", level: 4, rarity: "common", hint: "Peep peep", spritePrompt: "a tiny fluffy yellow baby chick" },
    { id: "kitten", name: "Kitten", Icon: GiCat, color: "#e2b07a", level: 5, rarity: "common", hint: "Mischief incarnate", spritePrompt: "a playful little kitten" },
    { id: "fox_kit", name: "Fox Kit", Icon: GiFox, color: "#ff8c42", level: 7, rarity: "common", hint: "Sly and swift", spritePrompt: "a small orange fox kit with a bushy tail" },
    { id: "wolf_pup", name: "Wolf Pup", Icon: GiWolfHead, color: "#9aa7b5", level: 9, rarity: "common", hint: "Born of the pack", spritePrompt: "a fluffy grey wolf pup" },
    { id: "owl", name: "Owl", Icon: GiOwl, color: "#c9a36a", level: 11, rarity: "common", hint: "Wise night flyer", spritePrompt: "a round little brown owl" },
    { id: "bear_cub", name: "Bear Cub", Icon: GiBearFace, color: "#b07a4a", level: 13, rarity: "rare", hint: "Chubby and strong", spritePrompt: "a chubby brown bear cub" },
    { id: "raven", name: "Raven", Icon: GiRaven, color: "#8794a3", level: 15, rarity: "rare", hint: "Keeper of secrets", spritePrompt: "a glossy black raven" },
    { id: "serpent", name: "Serpent", Icon: GiSnake, color: "#6ad0c8", level: 17, rarity: "rare", hint: "Coiled and patient", spritePrompt: "a small green coiled serpent" },
    { id: "fawn", name: "Fawn", Icon: GiDeer, color: "#d9a86a", level: 19, rarity: "rare", hint: "Gentle of the glade", spritePrompt: "a spotted baby deer fawn" },
    { id: "bat", name: "Bat", Icon: GiBat, color: "#9a7ad0", level: 21, rarity: "rare", hint: "Little night wing", spritePrompt: "a tiny purple bat" },
    { id: "scorpion", name: "Scorpion", Icon: GiScorpion, color: "#e0a03a", level: 24, rarity: "rare", hint: "Sting in the sand", spritePrompt: "a small desert scorpion" },
    { id: "tiger_cub", name: "Tiger Cub", Icon: GiTigerHead, color: "#ff9e42", level: 27, rarity: "rare", hint: "Stripes and spirit", spritePrompt: "a striped orange tiger cub" },
    { id: "seahorse", name: "Seahorse", Icon: GiSeahorse, color: "#5ad0d0", level: 30, rarity: "epic", hint: "Drifts on the tide", spritePrompt: "a delicate glowing seahorse" },
    { id: "eagle", name: "Eagle", Icon: GiEagleEmblem, color: "#d0a85a", level: 34, rarity: "epic", hint: "Master of the sky", spritePrompt: "a proud majestic eagle" },
    { id: "lion_cub", name: "Lion Cub", Icon: GiLion, color: "#ffb14a", level: 38, rarity: "epic", hint: "A little king", spritePrompt: "a fuzzy golden lion cub" },
    { id: "gorilla", name: "Gorilla", Icon: GiGorilla, color: "#8a8f9a", level: 42, rarity: "epic", hint: "Silverback strength", spritePrompt: "a mighty silverback gorilla" },
    { id: "croc", name: "Croc", Icon: GiCrocJaws, color: "#6aa84a", level: 46, rarity: "epic", hint: "All teeth", spritePrompt: "a snappy little green crocodile" },
    { id: "hydra", name: "Hydra Hatchling", Icon: GiHydra, color: "#6ad0c8", level: 50, rarity: "legendary", hint: "Cut one, two grow back", spritePrompt: "a small three-headed hydra hatchling" },
    { id: "griffin", name: "Griffin", Icon: GiGriffinSymbol, color: "#d9b25e", level: 55, rarity: "legendary", hint: "Eagle and lion", spritePrompt: "a noble griffin cub with feathered wings" },
    { id: "unicorn", name: "Unicorn", Icon: GiUnicorn, color: "#ffc7ec", level: 60, rarity: "legendary", hint: "Purest magic", spritePrompt: "a white unicorn foal with a glowing horn" },
    { id: "dragon_whelp", name: "Dragon Whelp", Icon: GiSpikedDragonHead, color: "#ff5a5a", level: 66, rarity: "legendary", hint: "Small, but a dragon", spritePrompt: "a cute baby dragon whelp with tiny wings" },
    { id: "pegasus", name: "Pegasus", Icon: GiPegasus, color: "#bfe0ff", level: 72, rarity: "legendary", hint: "Winged and free", spritePrompt: "a white winged pegasus foal" },
    { id: "baby_rex", name: "Baby Rex", Icon: GiDinosaurRex, color: "#6aa84a", level: 78, rarity: "legendary", hint: "Tiny apex predator", spritePrompt: "a baby tyrannosaurus rex" },
    { id: "sky_whale", name: "Sky Whale", Icon: GiWhaleTail, color: "#5a9bff", level: 84, rarity: "mythic", hint: "Swims the clouds", spritePrompt: "a majestic floating sky whale with cloud wisps" },
    { id: "chameleon", name: "Prismatic Chameleon", Icon: GiChameleonGlyph, color: "#b45aff", level: 90, rarity: "mythic", hint: "Every color at once", spritePrompt: "a colour-shifting rainbow prismatic chameleon" },
    { id: "elder_dragon", name: "Elder Dragon", Icon: GiDragonHead, color: "#ff5a7a", level: 100, rarity: "mythic", hint: "The apex companion", spritePrompt: "a legendary majestic elder dragon" },
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
