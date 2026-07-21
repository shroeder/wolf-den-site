// Each pet's EQUIPPED signature perk — a unique, flavor-named ability (not just a stat). Perks map to real
// mechanics that feed the boss fight (see pet-combat.js + boss.js). Client-safe (no server-only / db) so the
// pets page can render them and the server can compute combat bonuses from the same source.
import { petPassive, petSpecialPassive, petActiveLevelMult, petPassiveLevelMult } from "@/lib/marketplace/collectibles.js";

export const PET_ACTIVE_BY_RARITY = { common: 3, rare: 5, epic: 8, legendary: 12, mythic: 16, ascendant: 22, eternal: 30 };
const EXTRA_STRIKE_BY_RARITY = { common: 1, rare: 1, epic: 1, legendary: 1, mythic: 2, ascendant: 2, eternal: 3 };
const FIRST_HIT_BY_RARITY = { common: 1.3, rare: 1.5, epic: 1.8, legendary: 2.2, mythic: 2.6, ascendant: 3.0, eternal: 3.5 };
const ERUPT_BY_RARITY = {
    common: { chance: 0.08, mult: 1.5 }, rare: { chance: 0.1, mult: 1.6 }, epic: { chance: 0.12, mult: 1.8 },
    legendary: { chance: 0.15, mult: 2.0 }, mythic: { chance: 0.18, mult: 2.3 }, ascendant: { chance: 0.2, mult: 2.6 }, eternal: { chance: 0.25, mult: 3.0 },
};
// Cool mechanics (not stat sticks): chance to strike twice; big damage on a low-HP boss; bonus for hitting early.
const CHAIN_BY_RARITY = { common: 0.08, rare: 0.1, epic: 0.15, legendary: 0.2, mythic: 0.28, ascendant: 0.35, eternal: 0.45 };
const EXECUTE_BY_RARITY = { common: 0.15, rare: 0.2, epic: 0.3, legendary: 0.45, mythic: 0.65, ascendant: 0.85, eternal: 1.1 };
const FIRSTBLOOD_BY_RARITY = { common: 0.15, rare: 0.2, epic: 0.35, legendary: 0.5, mythic: 0.7, ascendant: 0.9, eternal: 1.2 };

// Perk mechanic → how it reads. STAT/econ perks add to the buff totals; proc perks fire on your strike.
export const PERK_META = {
    might: { icon: "⚔️", kind: "stat" },
    crit_chance: { icon: "🎯", kind: "stat" },
    crit_power: { icon: "💥", kind: "stat" },
    ferocity: { icon: "🔥", kind: "stat" },
    fortune: { icon: "🍀", kind: "stat" },
    extra_strike: { icon: "⚡", kind: "strike" },
    first_hit: { icon: "🗡️", kind: "proc" },
    erupt: { icon: "🌋", kind: "proc" },
    chain_strike: { icon: "🌀", kind: "proc" },
    execute: { icon: "☠️", kind: "proc" },
    first_blood: { icon: "🩸", kind: "proc" },
    xp_gain: { icon: "✨", kind: "econ" },
    gold_find: { icon: "💰", kind: "econ" },
};

// petId → { name, key }. The NAME is the flavor; the KEY is the mechanic. (Passive stat lives in
// collectibles.js PET_PASSIVE_STAT — every pet is a unique passive+active pairing.)
export const PET_PERKS = {
    // Level
    bunny: { name: "Rabbit's Foot", key: "fortune" }, frog: { name: "Fortune Hop", key: "gold_find" }, chick: { name: "Golden Yolk", key: "gold_find" },
    kitten: { name: "Nine Lives", key: "crit_chance" }, fox_kit: { name: "Sly Strike", key: "crit_chance" }, wolf_pup: { name: "Pack Instinct", key: "might" },
    owl: { name: "Night Study", key: "xp_gain" }, bear_cub: { name: "Bear Hug", key: "might" }, raven: { name: "Ill Omen", key: "xp_gain" },
    serpent: { name: "Venom Fang", key: "crit_power" }, fawn: { name: "Gentle Grace", key: "fortune" }, bat: { name: "Echolocate", key: "crit_chance" },
    scorpion: { name: "Stinger", key: "crit_power" }, tiger_cub: { name: "Ambush", key: "first_hit" }, seahorse: { name: "Tidal Charm", key: "fortune" },
    eagle: { name: "Keen Eye", key: "crit_chance" }, lion_cub: { name: "Lion's Roar", key: "might" }, gorilla: { name: "Ground Pound", key: "ferocity" },
    croc: { name: "Death Roll", key: "crit_power" }, hydra: { name: "Hydra Heads", key: "chain_strike" }, griffin: { name: "Sky Dive", key: "first_hit" },
    unicorn: { name: "Wish Granted", key: "fortune" }, dragon_whelp: { name: "Ember Burst", key: "erupt" }, pegasus: { name: "Tailwind", key: "xp_gain" },
    baby_rex: { name: "Apex Bite", key: "execute" }, sky_whale: { name: "Cloud Blessing", key: "fortune" }, chameleon: { name: "Prismatic Shift", key: "crit_chance" },
    elder_dragon: { name: "Cataclysm", key: "execute" },
    // Shop
    penguin: { name: "Cold Cash", key: "gold_find" }, hedgehog: { name: "Spiny Luck", key: "fortune" }, sheep: { name: "Golden Fleece", key: "gold_find" },
    crab: { name: "Pincer", key: "crit_power" }, turtle: { name: "Shell Slam", key: "ferocity" }, parrot: { name: "Mimic", key: "xp_gain" },
    dolphin: { name: "Lucky Leap", key: "fortune" }, monkey: { name: "Trickster", key: "crit_chance" }, panda: { name: "Bamboo Might", key: "might" },
    kangaroo: { name: "Kick Combo", key: "extra_strike" },
    // Achievement
    ladybug: { name: "Lucky Spots", key: "fortune" }, bee: { name: "Honey Haul", key: "gold_find" }, sloth: { name: "Slow Study", key: "xp_gain" },
    beaver: { name: "Hard Worker", key: "might" }, raccoon: { name: "Bandit's Cut", key: "gold_find" }, flamingo: { name: "Flock Fortune", key: "fortune" },
    toucan: { name: "Bright Beak", key: "fortune" },
    // Chest
    tropical_fish: { name: "Reef Shine", key: "fortune" }, axolotl: { name: "Regenerate", key: "xp_gain" }, butterfly: { name: "Lucky Flutter", key: "fortune" },
    squid: { name: "Ink Ambush", key: "crit_chance" }, jellyfish: { name: "Sting Surge", key: "crit_power" }, octopus: { name: "Eight Arms", key: "extra_strike" },
    // Boss
    vulture: { name: "Circling Death", key: "crit_chance" }, minotaur: { name: "Charge", key: "first_blood" }, centaur: { name: "Volley", key: "crit_chance" },
    imp: { name: "Hellfire", key: "erupt" }, polar_bear: { name: "Frozen Might", key: "might" }, mammoth: { name: "Trample", key: "execute" },
    wyvern: { name: "Dive Bomb", key: "first_hit" }, sea_serpent: { name: "Tidal Wrath", key: "chain_strike" }, fairy: { name: "Fairy Dust", key: "fortune" },
    kraken: { name: "Tentacle Flurry", key: "chain_strike" },
    // Elite
    molten_phoenix: { name: "Rebirth Flame", key: "execute" }, eternal_wolf: { name: "Spirit Howl", key: "chain_strike" }, bounty_hound: { name: "On the Hunt", key: "fortune" },
};

// The scaled value for a perk mechanic at a rarity. Proc perks return an object.
export function petPerkValue(rarity, key) {
    if (key === "extra_strike") return EXTRA_STRIKE_BY_RARITY[rarity] || 1;
    if (key === "first_hit") return FIRST_HIT_BY_RARITY[rarity] || 1.5;
    if (key === "erupt") return ERUPT_BY_RARITY[rarity] || ERUPT_BY_RARITY.epic;
    if (key === "chain_strike") return CHAIN_BY_RARITY[rarity] || 0.1;
    if (key === "execute") return EXECUTE_BY_RARITY[rarity] || 0.3;
    if (key === "first_blood") return FIRSTBLOOD_BY_RARITY[rarity] || 0.3;
    return PET_ACTIVE_BY_RARITY[rarity] || 3;
}

function perkDesc(key, v) {
    switch (key) {
        case "might": return `+${v}% boss attack damage`;
        case "crit_chance": return `+${v}% crit chance`;
        case "crit_power": return `+${v}% crit damage`;
        case "ferocity": return `+${v}% ferocious strike damage`;
        case "fortune": return `+${v} raffle luck`;
        case "extra_strike": return `+${v} boss attack${v > 1 ? "s" : ""} per day`;
        case "first_hit": return `Your first strike each day deals ×${v} damage`;
        case "erupt": return `${Math.round(v.chance * 100)}% chance your strike erupts for ×${v.mult}`;
        case "chain_strike": return `${Math.round(v * 100)}% chance your strike lands TWICE`;
        case "execute": return `+${Math.round(v * 100)}% damage when the boss is below 30% HP`;
        case "first_blood": return `+${Math.round(v * 100)}% damage if you're among the first 3 to hit the boss today`;
        case "xp_gain": return `+${v}% XP gained`;
        case "gold_find": return `+${v}% gold found`;
        default: return "";
    }
}

// The full equipped perk for a pet: name + mechanic + scaled value + human description.
export function petPerk(pet) {
    const def = PET_PERKS[pet.id] || { name: "Companion", key: pet.activeStat || "fortune" };
    const value = petPerkValue(pet.rarity, def.key);
    const meta = PERK_META[def.key] || { icon: "🐾" };
    return { name: def.name, key: def.key, icon: meta.icon, value, desc: perkDesc(def.key, value) };
}

// A handful of marquee pets carry a REAL-WORLD store perk (honor/staff-honored, like the charged-item
// rewards). Placeholder benefits — confirm the exact reward + policy with the owner before promoting.
export const PET_REAL_WORLD = {
    eternal_wolf: "Founder's Companion — show this pet in-store for 10% off one single purchase each month.",
    molten_phoenix: "Phoenix Patron — claim one free common booster pack each month, in-store.",
    bounty_hound: "On the Hunt — priority (front-of-line) on trade-in appraisals.",
};
export const petRealWorld = (pet) => PET_REAL_WORLD[pet?.id] || null;

// Combine a member's whole menagerie into combat/economy bonuses. PURE — feed it owned pet objects + the
// equipped pet. Passives (all owned) stack, each SCALED by that pet's level (levelByPet[id], default 1 →
// Lv1 ×1 … Lv5 ×5); the equipped pet adds its signature perk on top (procs are NOT level-scaled).
export function combinePetBonuses(ownedPets = [], equippedPet = null, levelByPet = {}) {
    const stats = { might: 0, crit_chance: 0, crit_power: 0, ferocity: 0, fortune: 0, extra_strike: 0 };
    const economy = { xp_gain: 0, gold_find: 0 };
    const proc = {};
    const add = (k, v) => {
        if (k in economy) economy[k] += v;
        else if (k in stats) stats[k] += v;
    };
    // PASSIVE: every owned pet's small themed bonus, scaled only GENTLY by level (Lv5 ×2) — a broad menagerie
    // bonus, not the main driver. Top-rarity pets add a SECOND passive stat (dual affinity) and the best
    // MENAGERIE AURA among them amplifies the whole passive total.
    let aura = 0;
    for (const pet of ownedPets) {
        const p = petPassive(pet);
        const lm = petPassiveLevelMult(Math.max(1, Number(levelByPet[pet.id]) || 1));
        add(p.stat, p.value * lm);
        const sp = petSpecialPassive(pet);
        if (sp) {
            if (sp.secondStat) add(sp.secondStat, sp.secondValue * lm);
            if (sp.aura > aura) aura = sp.aura;
        }
    }
    // Menagerie aura amplifies the accumulated PASSIVE totals (applied before the equipped active is layered on).
    if (aura > 0) {
        for (const k of Object.keys(stats)) stats[k] = Math.round(stats[k] * (1 + aura));
        for (const k of Object.keys(economy)) economy[k] = Math.round(economy[k] * (1 + aura));
    }
    // ACTIVE: the equipped pet's signature perk, scaled by ITS level (Lv5 ×3) — the payoff for leveling one
    // pet. Proc magnitudes scale too (chances capped so they stay sane).
    if (equippedPet) {
        const def = PET_PERKS[equippedPet.id] || { key: equippedPet.activeStat || "fortune" };
        const v = petPerkValue(equippedPet.rarity, def.key);
        const aMult = petActiveLevelMult(Math.max(1, Number(levelByPet[equippedPet.id]) || 1));
        const cap = (x, hi) => Math.min(hi, x);
        if (def.key === "first_hit") proc.firstHitMult = 1 + (v - 1) * aMult; // scale the bonus above ×1
        else if (def.key === "erupt") { proc.eruptChance = cap(v.chance * aMult, 0.6); proc.eruptMult = v.mult; }
        else if (def.key === "chain_strike") proc.chainChance = cap(v * aMult, 0.6);
        else if (def.key === "execute") proc.executePct = cap(v * aMult, 1.2);
        else if (def.key === "first_blood") proc.firstBloodPct = cap(v * aMult, 1.2);
        else add(def.key, v * aMult);
    }
    return { stats, economy, proc };
}
