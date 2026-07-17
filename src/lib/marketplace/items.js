// Digital ITEMS / equipment (Diablo-style), hand-authored like pets. Equipped gear gives passive
// boss-fight STATS; some items also carry limited-use "charged" perks redeemable in-store. Definitions
// live here (source of truth); the DB only tracks ownership/equipped/charges. Keep ids STABLE.
import {
    GiBroadsword, GiBattleAxe, GiWarhammer, GiCrossbow, GiWizardStaff, GiFireBowl, GiDragonShield,
    GiRoundShield, GiChestArmor, GiBreastplate, GiLeatherArmor, GiOverlordHelm, GiHornedHelm, GiCrown,
    GiBoots, GiBelt, GiNecklace, GiEmeraldNecklace, GiRing, GiDiamondRing, GiRuneStone,
} from "react-icons/gi";

// The nine equip slots (rings occupy ring1/ring2). `accepts` = which item.slot fits.
export const EQUIP_SLOTS = [
    { slot: "main_hand", label: "Main Hand", accepts: "main_hand" },
    { slot: "off_hand", label: "Off Hand", accepts: "off_hand" },
    { slot: "helmet", label: "Helmet", accepts: "helmet" },
    { slot: "chest", label: "Chest", accepts: "chest" },
    { slot: "belt", label: "Belt", accepts: "belt" },
    { slot: "boots", label: "Boots", accepts: "boots" },
    { slot: "amulet", label: "Amulet", accepts: "amulet" },
    { slot: "ring1", label: "Ring", accepts: "ring" },
    { slot: "ring2", label: "Ring", accepts: "ring" },
];

// Stat keys → how they read + how they apply in combat. Percent stats are additive % bonuses.
export const STAT_META = {
    might: { label: "Might", desc: "manual strike damage", suffix: "%" },
    crit_chance: { label: "Crit Chance", desc: "chance to crit", suffix: "%" },
    crit_power: { label: "Crit Power", desc: "crit damage", suffix: "%" },
    ferocity: { label: "Ferocity", desc: "passive auto-DPS", suffix: "%" },
    fortune: { label: "Fortune", desc: "raffle tickets earned", suffix: "%" },
    extra_strike: { label: "Extra Strike", desc: "extra daily strikes", suffix: "" },
};

// Charged-perk reward keys → the real-world thing you hand over in-store.
export const REWARDS = {
    free_pack_10: "Free Pokémon booster pack (up to $10)",
    discount_10_over_100: "10% off a purchase over $100",
    free_single_5: "Free single card (up to $5)",
};

const ICONS = {
    GiBroadsword, GiBattleAxe, GiWarhammer, GiCrossbow, GiWizardStaff, GiFireBowl, GiDragonShield,
    GiRoundShield, GiChestArmor, GiBreastplate, GiLeatherArmor, GiOverlordHelm, GiHornedHelm, GiCrown,
    GiBoots, GiBelt, GiNecklace, GiEmeraldNecklace, GiRing, GiDiamondRing, GiRuneStone,
};
export const itemIcon = (name) => ICONS[name] || GiRing;

export const ITEMS = [
    // --- Main hand (weapons) ---
    { id: "rusty_sword", name: "Rusty Sword", slot: "main_hand", rarity: "common", icon: "GiBroadsword", flavor: "It's seen better days.", stats: { might: 8 }, reqLevel: 2, source: "level", sort: 10 },
    { id: "hunters_bow", name: "Hunter's Bow", slot: "main_hand", rarity: "rare", icon: "GiCrossbow", flavor: "Strike from afar.", stats: { might: 12, crit_chance: 5 }, reqLevel: 10, source: "level", sort: 12 },
    { id: "warhammer", name: "Warhammer", slot: "main_hand", rarity: "epic", icon: "GiWarhammer", flavor: "Subtlety not included.", stats: { might: 24 }, reqLevel: 20, source: "boss_drop", sort: 14 },
    { id: "dragonfang_blade", name: "Dragonfang Blade", slot: "main_hand", rarity: "legendary", icon: "GiBattleAxe", flavor: "Forged from a wyrm's tooth.", stats: { might: 30, crit_power: 25 }, reqLevel: 40, reqBadge: "boss_legend", source: "boss_drop", sort: 16 },
    { id: "arcane_staff", name: "Arcane Staff", slot: "main_hand", rarity: "epic", icon: "GiWizardStaff", flavor: "Crackling with power.", stats: { might: 14, fortune: 12 }, reqLevel: 26, source: "xp_shop", xpCost: 2500, sort: 15 },

    // --- Off hand ---
    { id: "wooden_shield", name: "Wooden Shield", slot: "off_hand", rarity: "common", icon: "GiRoundShield", flavor: "Better than nothing.", stats: { ferocity: 5 }, reqLevel: 3, source: "level", sort: 20 },
    { id: "dragon_shield", name: "Dragon Shield", slot: "off_hand", rarity: "epic", icon: "GiDragonShield", flavor: "Scaled defense.", stats: { might: 8, ferocity: 12 }, reqLevel: 22, source: "boss_drop", sort: 22 },
    { id: "tome_of_fury", name: "Tome of Fury", slot: "off_hand", rarity: "rare", icon: "GiFireBowl", flavor: "Reads back.", stats: { ferocity: 10, fortune: 8 }, reqLevel: 16, source: "xp_shop", xpCost: 1500, sort: 21 },

    // --- Helmet ---
    { id: "leather_cap", name: "Leather Cap", slot: "helmet", rarity: "common", icon: "GiLeatherArmor", flavor: "Keeps the rain off.", stats: { ferocity: 4 }, reqLevel: 2, source: "level", sort: 30 },
    { id: "horned_helm", name: "Horned Helm", slot: "helmet", rarity: "rare", icon: "GiHornedHelm", flavor: "Intimidation, mostly.", stats: { might: 8, crit_chance: 4 }, reqLevel: 14, source: "level", sort: 32 },
    { id: "overlord_helm", name: "Overlord Helm", slot: "helmet", rarity: "legendary", icon: "GiOverlordHelm", flavor: "Rule with iron.", stats: { crit_chance: 10, crit_power: 15 }, reqLevel: 46, source: "boss_drop", sort: 34 },
    { id: "golden_crown", name: "Golden Crown", slot: "helmet", rarity: "mythic", icon: "GiCrown", flavor: "Wear your status.", stats: { might: 12, fortune: 25 }, reqLevel: 60, reqBadge: "boss_champion", source: "admin", sort: 36 },

    // --- Chest ---
    { id: "leather_armor", name: "Leather Armor", slot: "chest", rarity: "common", icon: "GiLeatherArmor", flavor: "Broken in.", stats: { ferocity: 5 }, reqLevel: 2, source: "level", sort: 40 },
    { id: "breastplate", name: "Breastplate", slot: "chest", rarity: "rare", icon: "GiBreastplate", flavor: "Solid steel.", stats: { might: 6, ferocity: 10 }, reqLevel: 16, source: "level", sort: 42 },
    { id: "dragonplate", name: "Dragonplate Armor", slot: "chest", rarity: "legendary", icon: "GiChestArmor", flavor: "Forged from a wyrm.", stats: { might: 12, ferocity: 25 }, reqLevel: 52, source: "boss_drop", sort: 44 },

    // --- Belt ---
    { id: "leather_belt", name: "Leather Belt", slot: "belt", rarity: "common", icon: "GiBelt", flavor: "Holds your pants up.", stats: { fortune: 5 }, reqLevel: 4, source: "level", sort: 50 },
    { id: "champions_belt", name: "Champion's Belt", slot: "belt", rarity: "epic", icon: "GiBelt", flavor: "Proof you showed up.", stats: { might: 8, fortune: 12 }, reqLevel: 30, source: "xp_shop", xpCost: 3000, sort: 52 },

    // --- Boots ---
    { id: "worn_boots", name: "Worn Boots", slot: "boots", rarity: "common", icon: "GiBoots", flavor: "Comfy.", stats: { ferocity: 4 }, reqLevel: 3, source: "level", sort: 60 },
    { id: "swift_boots", name: "Swift Boots", slot: "boots", rarity: "rare", icon: "GiBoots", flavor: "Gotta go fast.", stats: { ferocity: 14 }, reqLevel: 18, source: "level", sort: 62 },

    // --- Amulet ---
    { id: "fortune_pendant", name: "Fortune Pendant", slot: "amulet", rarity: "rare", icon: "GiNecklace", flavor: "Lady luck's favor.", stats: { fortune: 12 }, reqLevel: 15, source: "level", sort: 70 },
    { id: "amulet_of_fury", name: "Amulet of Fury", slot: "amulet", rarity: "epic", icon: "GiEmeraldNecklace", flavor: "Rage, distilled.", stats: { crit_chance: 8, crit_power: 12 }, reqLevel: 34, source: "boss_drop", sort: 72 },
    { id: "warlords_amulet", name: "Warlord's Amulet", slot: "amulet", rarity: "legendary", icon: "GiEmeraldNecklace", flavor: "One more swing.", stats: { might: 10, extra_strike: 1 }, reqLevel: 50, reqBadge: "boss_warlord", source: "boss_drop", sort: 74 },

    // --- Rings (some charged with real-world perks) ---
    { id: "ring_of_might", name: "Ring of Might", slot: "ring", rarity: "common", icon: "GiRing", flavor: "A small edge.", stats: { might: 6 }, reqLevel: 8, source: "level", sort: 80 },
    { id: "ring_of_fortune", name: "Ring of Fortune", slot: "ring", rarity: "rare", icon: "GiRing", flavor: "Luck on your finger.", stats: { fortune: 8 }, reqLevel: 20, source: "level", sort: 82 },
    { id: "collectors_signet", name: "Collector's Signet", slot: "ring", rarity: "legendary", icon: "GiRuneStone", flavor: "The store remembers its own.", stats: { might: 5, fortune: 8 }, reqLevel: 25, source: "admin", charged: true, charges: 3, cooldownDays: 30, chargeReward: "free_pack_10", chargeRewardLabel: REWARDS.free_pack_10, sort: 84 },
    { id: "merchants_band", name: "Merchant's Band", slot: "ring", rarity: "epic", icon: "GiDiamondRing", flavor: "A friend of the house.", stats: { fortune: 10 }, reqLevel: 30, source: "admin", charged: true, charges: 1, cooldownDays: 30, chargeReward: "discount_10_over_100", chargeRewardLabel: REWARDS.discount_10_over_100, sort: 86 },
];

export function itemById(id) {
    return ITEMS.find((i) => i.id === id) || null;
}

// Does an item fit a given equip slot? (rings fit ring1/ring2)
export function itemFitsSlot(item, slot) {
    if (!item) return false;
    const def = EQUIP_SLOTS.find((s) => s.slot === slot);
    return Boolean(def && def.accepts === item.slot);
}

// Sum stats across a list of item ids (equipped loadout) → { might, crit_chance, ... }.
export function sumItemStats(itemIds = []) {
    const total = {};
    for (const id of itemIds) {
        const it = itemById(id);
        if (!it?.stats) continue;
        for (const [k, v] of Object.entries(it.stats)) total[k] = (total[k] || 0) + (Number(v) || 0);
    }
    return total;
}

// A short human summary of an item's stats, e.g. "+12% Might · +5% Crit Chance".
export function describeStats(stats = {}) {
    return Object.entries(stats)
        .map(([k, v]) => {
            const m = STAT_META[k];
            return m ? `+${v}${m.suffix} ${m.label}` : `+${v} ${k}`;
        })
        .join(" · ");
}
