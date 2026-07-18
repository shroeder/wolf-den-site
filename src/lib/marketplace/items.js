// Digital ITEMS / equipment (Diablo-style), hand-authored like pets. Equipped gear gives passive
// boss-fight STATS; some items also carry limited-use "charged" perks redeemable in-store. Definitions
// live here (source of truth); the DB only tracks ownership/equipped/charges. Keep ids STABLE.
import {
    GiAncientSword, GiBattleAxe, GiBelt, GiBeltArmor, GiBigDiamondRing, GiBlackBelt, GiBlackKnightHelm, GiBookCover, GiBoots, GiBowArrow, GiBreastplate, GiBroadsword, GiBrutalHelm, GiChainMail, GiCharm, GiCheckedShield, GiCrenelCrown, GiCrescentStaff, GiCrestedHelmet, GiCrossShield, GiCrossbow, GiCrown, GiCrystalBall, GiCrystalWand, GiDiamondRing, GiDragonShield, GiEdgedShield, GiEmeraldNecklace, GiEnergySword, GiEngagementRing, GiExecutionerHood, GiFeatherNecklace, GiFireRing, GiFlangedMace, GiFrozenRing, GiFurBoot, GiGemNecklace, GiGemPendant, GiGreaves, GiHeartNecklace, GiHornedHelm, GiIntricateNecklace, GiLayeredArmor, GiLeatherArmor, GiLeatherBoot, GiMetalBoot, GiMetalPlate, GiOverlordHelm, GiPowerRing, GiQueenCrown, GiRing, GiRobe, GiRoundShield, GiRuneSword, GiScaleMail, GiSickle, GiSkullRing, GiSkullSignet, GiSpellBook, GiSpikedArmor, GiSteeltoeBoots, GiSwirlRing, GiTribalPendant, GiWalkingBoot, GiWarhammer, GiWingedSword, GiWizardStaff,
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
// Each stat carries a plain-English `desc` (what it does for a player, no jargon) + an icon, so the gear
// screen can teach what every stat means instead of just showing a number.
export const STAT_META = {
    might: { label: "Might", icon: "⚔️", desc: "How hard your big daily attack hits the boss.", suffix: "%" },
    crit_chance: { label: "Crit Chance", icon: "🎯", desc: "How often your attack lands a huge critical hit.", suffix: "%" },
    crit_power: { label: "Crit Power", icon: "💥", desc: "How much extra damage your critical hits deal.", suffix: "%" },
    ferocity: { label: "Ferocity", icon: "🔥", desc: "Damage your hero deals to the boss automatically, 24/7.", suffix: "%" },
    fortune: { label: "Fortune", icon: "🍀", desc: "More raffle tickets toward the weekly boss prize.", suffix: "%" },
    extra_strike: { label: "Extra Strike", icon: "⚡", desc: "Gives you extra daily attacks on the boss.", suffix: "" },
};

// Charged-perk reward keys → the real-world thing you hand over in-store.
export const REWARDS = {
    free_pack_10: "Free Pokémon booster pack (up to $10)",
    discount_10_over_100: "10% off a purchase over $100",
    free_single_5: "Free single card (up to $5)",
};

const ICONS = {
    GiAncientSword, GiBattleAxe, GiBelt, GiBeltArmor, GiBigDiamondRing, GiBlackBelt, GiBlackKnightHelm, GiBookCover, GiBoots, GiBowArrow, GiBreastplate, GiBroadsword, GiBrutalHelm, GiChainMail, GiCharm, GiCheckedShield, GiCrenelCrown, GiCrescentStaff, GiCrestedHelmet, GiCrossShield, GiCrossbow, GiCrown, GiCrystalBall, GiCrystalWand, GiDiamondRing, GiDragonShield, GiEdgedShield, GiEmeraldNecklace, GiEnergySword, GiEngagementRing, GiExecutionerHood, GiFeatherNecklace, GiFireRing, GiFlangedMace, GiFrozenRing, GiFurBoot, GiGemNecklace, GiGemPendant, GiGreaves, GiHeartNecklace, GiHornedHelm, GiIntricateNecklace, GiLayeredArmor, GiLeatherArmor, GiLeatherBoot, GiMetalBoot, GiMetalPlate, GiOverlordHelm, GiPowerRing, GiQueenCrown, GiRing, GiRobe, GiRoundShield, GiRuneSword, GiScaleMail, GiSickle, GiSkullRing, GiSkullSignet, GiSpellBook, GiSpikedArmor, GiSteeltoeBoots, GiSwirlRing, GiTribalPendant, GiWalkingBoot, GiWarhammer, GiWingedSword, GiWizardStaff,
};
export const itemIcon = (name) => ICONS[name] || GiRing;

export const ITEMS = [
    // --- Main hand (weapons) ---
    { id: "rusty_sword", name: "Rusty Sword", slot: "main_hand", rarity: "common", icon: "GiBroadsword", flavor: "It's seen better days.", stats: { might: 10 }, reqLevel: 2, source: "level", sort: 10 },
    { id: "hunters_bow", name: "Hunter's Bow", slot: "main_hand", rarity: "rare", icon: "GiCrossbow", flavor: "Strike from afar.", stats: { might: 11, crit_chance: 5 }, reqLevel: 10, source: "level", sort: 12 },
    { id: "warhammer", name: "Warhammer", slot: "main_hand", rarity: "epic", icon: "GiWarhammer", flavor: "Subtlety not included.", stats: { might: 22 }, reqLevel: 20, source: "boss_drop", sort: 14 },
    { id: "dragonfang_blade", name: "Dragonfang Blade", slot: "main_hand", rarity: "legendary", icon: "GiWingedSword", flavor: "Forged from a wyrm's tooth.", stats: { might: 16, crit_power: 14 }, reqLevel: 40, reqBadge: "boss_legend", source: "boss_drop", sort: 16 },
    { id: "arcane_staff", name: "Arcane Staff", slot: "main_hand", rarity: "epic", icon: "GiCrystalWand", flavor: "Crackling with power.", stats: { might: 12, fortune: 10 }, reqLevel: 26, source: "xp_shop", xpCost: 2500, sort: 15 },

    // --- Off hand ---
    { id: "wooden_shield", name: "Wooden Shield", slot: "off_hand", rarity: "common", icon: "GiCheckedShield", flavor: "Better than nothing.", stats: { ferocity: 10 }, reqLevel: 3, source: "level", sort: 20 },
    { id: "dragon_shield", name: "Dragon Shield", slot: "off_hand", rarity: "epic", icon: "GiDragonShield", flavor: "Scaled defense.", stats: { might: 9, ferocity: 13 }, reqLevel: 22, source: "boss_drop", sort: 22 },
    { id: "tome_of_fury", name: "Tome of Fury", slot: "off_hand", rarity: "rare", icon: "GiBookCover", flavor: "Reads back.", stats: { ferocity: 9, fortune: 7 }, reqLevel: 16, source: "xp_shop", xpCost: 1500, sort: 21 },

    // --- Helmet ---
    { id: "leather_cap", name: "Leather Cap", slot: "helmet", rarity: "common", icon: "GiCrestedHelmet", flavor: "Keeps the rain off.", stats: { ferocity: 10 }, reqLevel: 2, source: "level", sort: 30 },
    { id: "horned_helm", name: "Horned Helm", slot: "helmet", rarity: "rare", icon: "GiHornedHelm", flavor: "Intimidation, mostly.", stats: { might: 11, crit_chance: 5 }, reqLevel: 14, source: "level", sort: 32 },
    { id: "overlord_helm", name: "Overlord Helm", slot: "helmet", rarity: "legendary", icon: "GiOverlordHelm", flavor: "Rule with iron.", stats: { crit_chance: 12, crit_power: 18 }, reqLevel: 46, source: "boss_drop", sort: 34 },
    { id: "golden_crown", name: "Golden Crown", slot: "helmet", rarity: "mythic", icon: "GiCrown", flavor: "Wear your status.", stats: { might: 13, fortune: 27 }, reqLevel: 60, reqBadge: "boss_champion", source: "admin", sort: 36 },

    // --- Chest ---
    { id: "leather_armor", name: "Leather Armor", slot: "chest", rarity: "common", icon: "GiLeatherArmor", flavor: "Broken in.", stats: { ferocity: 10 }, reqLevel: 2, source: "level", sort: 40 },
    { id: "breastplate", name: "Breastplate", slot: "chest", rarity: "rare", icon: "GiBreastplate", flavor: "Solid steel.", stats: { might: 6, ferocity: 10 }, reqLevel: 16, source: "level", sort: 42 },
    { id: "dragonplate", name: "Dragonplate Armor", slot: "chest", rarity: "legendary", icon: "GiSpikedArmor", flavor: "Forged from a wyrm.", stats: { might: 10, ferocity: 20 }, reqLevel: 52, source: "boss_drop", sort: 44 },

    // --- Belt ---
    { id: "leather_belt", name: "Leather Belt", slot: "belt", rarity: "common", icon: "GiBelt", flavor: "Holds your pants up.", stats: { fortune: 10 }, reqLevel: 4, source: "level", sort: 50 },
    { id: "champions_belt", name: "Champion's Belt", slot: "belt", rarity: "epic", icon: "GiBlackBelt", flavor: "Proof you showed up.", stats: { might: 9, fortune: 13 }, reqLevel: 30, source: "xp_shop", xpCost: 3000, sort: 52 },

    // --- Boots ---
    { id: "worn_boots", name: "Worn Boots", slot: "boots", rarity: "common", icon: "GiLeatherBoot", flavor: "Comfy.", stats: { ferocity: 10 }, reqLevel: 3, source: "level", sort: 60 },
    { id: "swift_boots", name: "Swift Boots", slot: "boots", rarity: "rare", icon: "GiWalkingBoot", flavor: "Gotta go fast.", stats: { ferocity: 16 }, reqLevel: 18, source: "level", sort: 62 },

    // --- Amulet ---
    { id: "fortune_pendant", name: "Fortune Pendant", slot: "amulet", rarity: "rare", icon: "GiGemPendant", flavor: "Lady luck's favor.", stats: { fortune: 16 }, reqLevel: 15, source: "level", sort: 70 },
    { id: "amulet_of_fury", name: "Amulet of Fury", slot: "amulet", rarity: "epic", icon: "GiIntricateNecklace", flavor: "Rage, distilled.", stats: { crit_chance: 9, crit_power: 13 }, reqLevel: 34, source: "boss_drop", sort: 72 },
    { id: "warlords_amulet", name: "Warlord's Amulet", slot: "amulet", rarity: "legendary", icon: "GiTribalPendant", flavor: "One more swing.", stats: { might: 18, extra_strike: 1 }, reqLevel: 50, reqBadge: "boss_warlord", source: "boss_drop", sort: 74 },

    // --- Rings (some charged with real-world perks) ---
    { id: "ring_of_might", name: "Ring of Might", slot: "ring", rarity: "common", icon: "GiPowerRing", flavor: "A small edge.", stats: { might: 10 }, reqLevel: 8, source: "level", sort: 80 },
    { id: "ring_of_fortune", name: "Ring of Fortune", slot: "ring", rarity: "rare", icon: "GiRing", flavor: "Luck on your finger.", stats: { fortune: 16 }, reqLevel: 20, source: "level", sort: 82 },
    { id: "collectors_signet", name: "Collector's Signet", slot: "ring", rarity: "legendary", icon: "GiSkullSignet", flavor: "The store remembers its own.", stats: { might: 5, fortune: 8 }, reqLevel: 25, source: "admin", charged: true, charges: 3, cooldownDays: 30, chargeReward: "free_pack_10", chargeRewardLabel: REWARDS.free_pack_10, sort: 84 },
    { id: "merchants_band", name: "Merchant's Band", slot: "ring", rarity: "epic", icon: "GiDiamondRing", flavor: "A friend of the house.", stats: { fortune: 10 }, reqLevel: 30, source: "admin", charged: true, charges: 1, cooldownDays: 30, chargeReward: "discount_10_over_100", chargeRewardLabel: REWARDS.discount_10_over_100, sort: 86 },

    // ===== CHEST LOOT (source: "chest") — only obtained by opening loot chests. Wide spread across every
    // rarity + the whole level range so chests always have something to give. =====
    // -- Main hand --
    { id: "short_bow", name: "Short Bow", slot: "main_hand", rarity: "common", icon: "GiBowArrow", flavor: "Point and loose.", stats: { might: 10 }, reqLevel: 5, source: "chest", sort: 110 },
    { id: "iron_sword", name: "Iron Sword", slot: "main_hand", rarity: "common", icon: "GiAncientSword", flavor: "Reliable steel.", stats: { might: 10 }, reqLevel: 6, source: "chest", sort: 111 },
    { id: "battle_staff", name: "Battle Staff", slot: "main_hand", rarity: "rare", icon: "GiWizardStaff", flavor: "Bonk and blast.", stats: { might: 12, fortune: 4 }, reqLevel: 22, source: "chest", sort: 112 },
    { id: "flanged_mace", name: "Flanged Mace", slot: "main_hand", rarity: "epic", icon: "GiFlangedMace", flavor: "No finesse required.", stats: { might: 22 }, reqLevel: 30, source: "chest", sort: 113 },
    { id: "rune_blade", name: "Rune Blade", slot: "main_hand", rarity: "epic", icon: "GiRuneSword", flavor: "Etched to bite deeper.", stats: { might: 16, crit_chance: 6 }, reqLevel: 44, source: "chest", sort: 114 },
    { id: "soulreaver", name: "Soulreaver", slot: "main_hand", rarity: "legendary", icon: "GiSickle", flavor: "It hungers.", stats: { might: 19, crit_power: 11 }, reqLevel: 62, source: "chest", sort: 115 },
    { id: "stormcaller", name: "Stormcaller", slot: "main_hand", rarity: "legendary", icon: "GiCrescentStaff", flavor: "Lightning on tap.", stats: { might: 21, crit_chance: 9 }, reqLevel: 70, source: "chest", sort: 116 },
    { id: "worldender", name: "Worldender", slot: "main_hand", rarity: "mythic", icon: "GiEnergySword", flavor: "The last weapon you'll need.", stats: { might: 24, crit_power: 16 }, reqLevel: 90, source: "chest", sort: 117 },
    { id: "godsplitter", name: "Godsplitter", slot: "main_hand", rarity: "mythic", icon: "GiBattleAxe", flavor: "Cleaves the heavens.", stats: { might: 21, crit_chance: 8, crit_power: 11 }, reqLevel: 100, source: "chest", sort: 118 },
    // -- Off hand --
    { id: "buckler", name: "Buckler", slot: "off_hand", rarity: "common", icon: "GiRoundShield", flavor: "Small but scrappy.", stats: { ferocity: 10 }, reqLevel: 6, source: "chest", sort: 120 },
    { id: "kite_shield", name: "Kite Shield", slot: "off_hand", rarity: "rare", icon: "GiEdgedShield", flavor: "Head to toe cover.", stats: { might: 5, ferocity: 11 }, reqLevel: 24, source: "chest", sort: 121 },
    { id: "grimoire", name: "Grimoire", slot: "off_hand", rarity: "epic", icon: "GiSpellBook", flavor: "Forbidden pages.", stats: { ferocity: 8, fortune: 14 }, reqLevel: 32, source: "chest", sort: 122 },
    { id: "aegis", name: "Aegis", slot: "off_hand", rarity: "legendary", icon: "GiCrossShield", flavor: "Nothing gets through.", stats: { might: 9, ferocity: 21 }, reqLevel: 58, source: "chest", sort: 123 },
    { id: "void_orb", name: "Void Orb", slot: "off_hand", rarity: "mythic", icon: "GiCrystalBall", flavor: "Stares back.", stats: { ferocity: 20, fortune: 20 }, reqLevel: 88, source: "chest", sort: 124 },
    // -- Helmet --
    { id: "iron_helm", name: "Iron Helm", slot: "helmet", rarity: "common", icon: "GiBrutalHelm", flavor: "Dents, doesn't break.", stats: { ferocity: 10 }, reqLevel: 6, source: "chest", sort: 130 },
    { id: "rangers_hood", name: "Ranger's Hood", slot: "helmet", rarity: "rare", icon: "GiExecutionerHood", flavor: "Eyes sharp.", stats: { crit_chance: 8, ferocity: 8 }, reqLevel: 20, source: "chest", sort: 131 },
    { id: "warplate_helm", name: "Warplate Helm", slot: "helmet", rarity: "epic", icon: "GiBlackKnightHelm", flavor: "Built for the front line.", stats: { might: 15, crit_chance: 7 }, reqLevel: 36, source: "chest", sort: 132 },
    { id: "crown_of_kings", name: "Crown of Kings", slot: "helmet", rarity: "legendary", icon: "GiQueenCrown", flavor: "Heavy is the head.", stats: { might: 12, fortune: 18 }, reqLevel: 64, source: "chest", sort: 133 },
    { id: "ancient_halo", name: "Halo of the Ancients", slot: "helmet", rarity: "mythic", icon: "GiCrenelCrown", flavor: "Blessed by the old ones.", stats: { crit_chance: 16, crit_power: 24 }, reqLevel: 92, source: "chest", sort: 134 },
    // -- Chest --
    { id: "chainmail", name: "Chainmail", slot: "chest", rarity: "common", icon: "GiChainMail", flavor: "Jingles when you walk.", stats: { ferocity: 10 }, reqLevel: 6, source: "chest", sort: 140 },
    { id: "scale_mail", name: "Scale Mail", slot: "chest", rarity: "rare", icon: "GiScaleMail", flavor: "Layered like a dragon.", stats: { might: 6, ferocity: 10 }, reqLevel: 24, source: "chest", sort: 141 },
    { id: "plate_armor", name: "Plate Armor", slot: "chest", rarity: "epic", icon: "GiMetalPlate", flavor: "A walking fortress.", stats: { might: 9, ferocity: 13 }, reqLevel: 38, source: "chest", sort: 142 },
    { id: "aegis_plate", name: "Aegis Plate", slot: "chest", rarity: "legendary", icon: "GiLayeredArmor", flavor: "Immovable.", stats: { might: 10, ferocity: 20 }, reqLevel: 66, source: "chest", sort: 143 },
    { id: "celestial_robe", name: "Celestial Robe", slot: "chest", rarity: "mythic", icon: "GiRobe", flavor: "Woven from starlight.", stats: { ferocity: 24, fortune: 16 }, reqLevel: 94, source: "chest", sort: 144 },
    // -- Belt --
    { id: "sturdy_belt", name: "Sturdy Belt", slot: "belt", rarity: "common", icon: "GiBeltArmor", flavor: "Cinch it tight.", stats: { ferocity: 4, fortune: 6 }, reqLevel: 8, source: "chest", sort: 150 },
    { id: "focus_sash", name: "Sash of Focus", slot: "belt", rarity: "rare", icon: "GiBlackBelt", flavor: "Steady the aim.", stats: { crit_chance: 16 }, reqLevel: 22, source: "chest", sort: 151 },
    { id: "warlords_girdle", name: "Warlord's Girdle", slot: "belt", rarity: "epic", icon: "GiBelt", flavor: "Command respect.", stats: { might: 11, ferocity: 11 }, reqLevel: 40, source: "chest", sort: 152 },
    { id: "giants_belt", name: "Belt of Giants", slot: "belt", rarity: "legendary", icon: "GiBeltArmor", flavor: "Strength of ten.", stats: { might: 30 }, reqLevel: 60, source: "chest", sort: 153 },
    { id: "cosmic_sash", name: "Cosmic Sash", slot: "belt", rarity: "mythic", icon: "GiBlackBelt", flavor: "Luck of the void.", stats: { fortune: 40 }, reqLevel: 90, source: "chest", sort: 154 },
    // -- Boots --
    { id: "sturdy_boots", name: "Sturdy Boots", slot: "boots", rarity: "common", icon: "GiSteeltoeBoots", flavor: "Miles in them.", stats: { ferocity: 10 }, reqLevel: 6, source: "chest", sort: 160 },
    { id: "trailblazers", name: "Trailblazers", slot: "boots", rarity: "rare", icon: "GiBoots", flavor: "First to the fight.", stats: { ferocity: 16 }, reqLevel: 24, source: "chest", sort: 161 },
    { id: "haste_boots", name: "Boots of Haste", slot: "boots", rarity: "epic", icon: "GiFurBoot", flavor: "Blink and miss them.", stats: { crit_chance: 4, ferocity: 18 }, reqLevel: 36, source: "chest", sort: 162 },
    { id: "windwalkers", name: "Windwalkers", slot: "boots", rarity: "legendary", icon: "GiGreaves", flavor: "One more swing in you.", stats: { ferocity: 18, extra_strike: 1 }, reqLevel: 62, source: "chest", sort: 163 },
    { id: "featherfall", name: "Featherfall Greaves", slot: "boots", rarity: "mythic", icon: "GiMetalBoot", flavor: "Never touch the ground.", stats: { ferocity: 27, fortune: 13 }, reqLevel: 92, source: "chest", sort: 164 },
    // -- Amulet --
    { id: "copper_charm", name: "Copper Charm", slot: "amulet", rarity: "common", icon: "GiCharm", flavor: "A little luck.", stats: { fortune: 10 }, reqLevel: 8, source: "chest", sort: 170 },
    { id: "talisman", name: "Talisman", slot: "amulet", rarity: "rare", icon: "GiFeatherNecklace", flavor: "Old protection.", stats: { might: 7, fortune: 9 }, reqLevel: 22, source: "chest", sort: 171 },
    { id: "wrath_pendant", name: "Pendant of Wrath", slot: "amulet", rarity: "epic", icon: "GiEmeraldNecklace", flavor: "Anger, focused.", stats: { crit_chance: 11, crit_power: 11 }, reqLevel: 38, source: "chest", sort: 172 },
    { id: "wolf_heart", name: "Heart of the Wolf", slot: "amulet", rarity: "legendary", icon: "GiHeartNecklace", flavor: "The pack beats within.", stats: { might: 13, crit_power: 17 }, reqLevel: 60, source: "chest", sort: 173 },
    { id: "eye_eternity", name: "Eye of Eternity", slot: "amulet", rarity: "mythic", icon: "GiGemNecklace", flavor: "Sees every weakness.", stats: { crit_chance: 15, crit_power: 25 }, reqLevel: 95, source: "chest", sort: 174 },
    // -- Rings --
    { id: "copper_ring", name: "Copper Ring", slot: "ring", rarity: "common", icon: "GiSwirlRing", flavor: "Barely magic.", stats: { might: 10 }, reqLevel: 5, source: "chest", sort: 180 },
    { id: "silver_ring", name: "Silver Ring", slot: "ring", rarity: "common", icon: "GiFrozenRing", flavor: "Shiny.", stats: { fortune: 10 }, reqLevel: 10, source: "chest", sort: 181 },
    { id: "focus_band", name: "Band of Focus", slot: "ring", rarity: "rare", icon: "GiFireRing", flavor: "Aim true.", stats: { crit_chance: 16 }, reqLevel: 22, source: "chest", sort: 182 },
    { id: "power_signet", name: "Signet of Power", slot: "ring", rarity: "epic", icon: "GiSkullRing", flavor: "Raw force.", stats: { might: 22 }, reqLevel: 36, source: "chest", sort: 183 },
    { id: "kings_ring", name: "Ring of Kings", slot: "ring", rarity: "legendary", icon: "GiBigDiamondRing", flavor: "Worn by rulers.", stats: { might: 14, fortune: 16 }, reqLevel: 64, source: "chest", sort: 184 },
    { id: "infinity_loop", name: "Loop of Infinity", slot: "ring", rarity: "mythic", icon: "GiEngagementRing", flavor: "No end, no limit.", stats: { might: 16, crit_chance: 8, fortune: 16 }, reqLevel: 98, source: "chest", sort: 185 },
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
