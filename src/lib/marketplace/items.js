// Digital ITEMS / equipment (Diablo-style), hand-authored like pets. Equipped gear gives passive
// boss-fight STATS; some items also carry limited-use "charged" perks redeemable in-store. Definitions
// live here (source of truth); the DB only tracks ownership/equipped/charges. Keep ids STABLE.
import {
    GiAncientSword, GiBattleAxe, GiBelt, GiBeltArmor, GiBigDiamondRing, GiBlackBelt, GiBlackKnightHelm, GiBookCover, GiBoots, GiBowArrow, GiBreastplate, GiBroadsword, GiBrutalHelm, GiChainMail, GiCharm, GiCheckedShield, GiCrenelCrown, GiCrescentStaff, GiCrestedHelmet, GiCrossShield, GiCrossbow, GiCrown, GiCrystalBall, GiCrystalWand, GiDiamondRing, GiDragonShield, GiEdgedShield, GiEmeraldNecklace, GiEnergySword, GiEngagementRing, GiExecutionerHood, GiFeatherNecklace, GiFireRing, GiFlangedMace, GiFrozenRing, GiFurBoot, GiGemNecklace, GiGemPendant, GiGreaves, GiHeartNecklace, GiHornedHelm, GiIntricateNecklace, GiLayeredArmor, GiLeatherArmor, GiLeatherBoot, GiMetalBoot, GiMetalPlate, GiOverlordHelm, GiPowerRing, GiQueenCrown, GiRing, GiRobe, GiRoundShield, GiRuneSword, GiScaleMail, GiSickle, GiSkullRing, GiSkullSignet, GiSpellBook, GiSpikedArmor, GiSteeltoeBoots, GiSwirlRing, GiTribalPendant, GiWalkingBoot, GiWarhammer, GiWingedSword, GiWizardStaff,
    GiPlainDagger, GiDaggers, GiWarPick, GiFireAxe, GiKatana, GiScythe, GiTrident, GiWoodFrame, GiShieldBash, GiCrystalCluster, GiSurroundedShield, GiVibratingShield, GiBarbute, GiVisoredHelm, GiCenturionHelmet, GiLaurelCrown, GiWizardFace, GiChestArmor, GiAbdominalArmor, GiKimono, GiHoodedFigure, GiRunningShoe, GiBootStomp, GiLegArmor, GiFangs, GiPearlNecklace, GiMoon, GiLibra, GiEagleEmblem, GiHolySymbol, GiWolfHead, GiStarFormation, GiDragonHead, GiPrayerBeads, GiRingedBeam,
    GiHatchet, GiBoomerang, GiCleaver, GiChakram, GiWarAxe, GiWaveStrike, GiFlatHammer, GiEyeShield, GiHeraldicSun, GiConcentrationOrb, GiSpikedShield, GiVortex, GiSpartanHelmet, GiDwarfHelmet, GiWarBonnet, GiCowled, GiArmorVest, GiCape, GiSpikedShoulderArmor, GiCapeArmor, GiBootKick, GiWingfoot, GiEmerald, GiGems, GiCutDiamond, GiAnkh, GiPentacle, GiRaven, GiBearFace, GiSnakeTotem, GiGalaxy, GiSunbeams, GiFireGem, GiBeamsAura,
    GiBoneMace, GiRelicBlade, GiIceBolt, GiWingedScepter, GiFireSilhouette, GiMeteorImpact, GiFireShield, GiIceGolem, GiFloatingCrystal, GiWorld, GiHood, GiHelmetHeadShot, GiHeavyHelm, GiCultist, GiDeadEye, GiPirateCoat, GiRaggedWound, GiHeartInside, GiSpring, GiSnowflake2, GiCometSpark, GiOwl, GiFox, GiTigerHead, GiLotus, GiElephant, GiSpectre, GiOakLeaf, GiWaterDrop, GiFangedSkull, GiDropletSplash,
    GiAngelWings, GiBatwingEmblem, GiCurlyWing, GiFeatheredWing, GiCondorEmblem, GiFalconMoon, GiFeather, GiWingCloak, GiFluffyWing, GiShoulderArmor,
    // Farm gear-set pieces
    GiFarmer, GiRolledCloth, GiAmberMosquito, GiBasket, GiClover, GiSwapBag, GiThreeLeaves,
} from "react-icons/gi";
import { DECO_STATS } from "@/lib/marketplace/decorations.js";

// The nine equip slots (rings occupy ring1/ring2). `accepts` = which item.slot fits.
export const EQUIP_SLOTS = [
    { slot: "main_hand", label: "Main Hand", accepts: "main_hand" },
    { slot: "off_hand", label: "Off Hand", accepts: "off_hand" },
    { slot: "helmet", label: "Helmet", accepts: "helmet" },
    { slot: "chest", label: "Chest", accepts: "chest" },
    { slot: "belt", label: "Belt", accepts: "belt" },
    { slot: "boots", label: "Boots", accepts: "boots" },
    { slot: "back", label: "Back", accepts: "back" },
    { slot: "amulet", label: "Amulet", accepts: "amulet" },
    { slot: "ring1", label: "Ring", accepts: "ring" },
    { slot: "ring2", label: "Ring", accepts: "ring" },
];

// Ascendant tier and above are BOUND to their owner — they can't be traded or auctioned (the top-tier chase
// gear stays personally earned, never bought or laundered through the market).
export const TRADE_LOCKED_RARITIES = new Set(["ascendant", "eternal", "celestial", "primordial"]);

// ── Items that cost REAL MONEY when they're redeemed ──────────────────────────────────────────────────────
// `admin` and `elite` gear carries charges that cash out at the counter: $50 store credit, a free $25 pack,
// 25% off an order over $300, free grading, a box-break slot. They are meant to be AWARDED — an elite reward,
// an owner grant — never handed out by a random roll.
//
// They were reachable by one. Fishing, the farm harvest and the sailing dig all built their pool with a bare
// `ITEMS.filter(i => i.rarity === rarity)`, which has no idea what an item is worth outside the game, so a
// lucky cast could pay out a real pack. Boss drops and chests already guarded against this
// (`i.source !== "admin"`, or scoping to `source === "chest"`), so the rule existed — it just wasn't shared.
export const isRealMoneyItem = (i) => i?.source === "admin" || i?.source === "elite" || Boolean(i?.chargeReward);

// Content for a feature that hasn't launched yet. An ownerOnly item must never appear in a drop pool, a shop,
// a set browser or anyone's collection — the whole point of an owner-gated feature is that members can't tell
// it exists. Flipping the feature live is then one flag per item, not an audit of every random-reward path.
export const isOwnerOnlyItem = (i) => Boolean(i?.ownerOnly);

/** Every item a RANDOM reward is allowed to hand out. Use this instead of filtering ITEMS directly. */
export const randomDropPool = (predicate) =>
    ITEMS.filter((i) => !isRealMoneyItem(i) && !isOwnerOnlyItem(i) && (typeof predicate === "function" ? predicate(i) : true));
export const isTradeLocked = (rarity) => TRADE_LOCKED_RARITIES.has(rarity);

// Stat keys → how they read + how they apply in combat. Percent stats are additive % bonuses.
// Each stat carries a plain-English `desc` (what it does for a player, no jargon) + an icon, so the gear
// screen can teach what every stat means instead of just showing a number.
export const STAT_META = {
    might: { label: "Might", icon: "⚔️", desc: "How hard you hit — powers BOTH your 24/7 passive auto-damage and your manual daily strike.", suffix: "%" },
    crit_chance: { label: "Crit Chance", icon: "🎯", desc: "How often you land a critical — on both your passive auto-damage and your manual strike.", suffix: "%" },
    crit_power: { label: "Crit Power", icon: "💥", desc: "How much extra your critical hits deal — on both passive auto-damage and your manual strike.", suffix: "%" },
    ferocity: { label: "Ferocity", icon: "🔥", desc: "PASSIVE only: auto-damage your hero deals 24/7 on its own (doesn't affect your manual strike).", suffix: "%" },
    fortune: { label: "Fortune", icon: "🍀", desc: "More raffle tickets toward the weekly boss prize.", suffix: "%" },
    extra_strike: { label: "Extra Strike", icon: "⚡", desc: "Gives you extra manual daily strikes on the boss.", suffix: "" },
};

// Charged-perk reward keys → the real-world thing you hand over in-store. Redeemed via the admin app
// (Items & Gear), each use burns a charge and starts the item's cooldown. Keep keys STABLE (redemptions
// are logged by key).
export const REWARDS = {
    // Small freebies (fixed, low value)
    free_snack: "Free snack from the counter",
    free_drink: "Free drink from the cooler",
    free_dice: "Free set of dice",
    free_sleeves: "Free pack of card sleeves",
    free_deckbox: "Free deck box",
    free_promo: "Free promo card",
    free_playmat: "Free playmat",
    free_playmat_premium: "Free premium playmat (up to $30)",
    free_event_entry: "Free entry to a Friday event",
    tournament_seat: "Free tournament entry (up to $15)",
    free_grab_bag: "Free mystery grab bag",
    free_bundle_30: "Free themed bundle (up to $30)",
    // Packs & singles (all value-capped)
    free_single_5: "Free single card (up to $5)",
    free_pack_5: "Free booster pack (up to $5)",
    free_pack_10: "Free booster pack (up to $10)",
    free_pack_25: "Free premium pack (up to $25)",
    // Store credit (fixed amounts)
    store_credit_5: "$5 store credit",
    store_credit_10: "$10 store credit",
    store_credit_25: "$25 store credit",
    // Discounts — CAPPED so a big purchase can't blow the perk open
    discount_5_any: "5% off any purchase (up to $10 off)",
    discount_10_over_100: "10% off $100+ (up to $25 off)",
    discount_15_over_150: "15% off $150+ (up to $40 off)",
    discount_20_over_200: "20% off $200+ (up to $60 off)",
    // Trade & BOGO — CAPPED
    trade_bonus_10: "+10% trade-in bonus (up to $10 extra)",
    buy2get1_singles: "Buy 2 get 1 free on singles (free card up to $10, equal or lesser value)",
    // More freebies + accessories (capped)
    free_toploaders: "Free 25-pack of toploaders",
    free_storage_box: "Free cardboard storage box",
    free_binder: "Free 9-pocket binder (up to $15)",
    free_premium_sleeves: "Free premium sleeves (up to $12)",
    birthday_pack: "Birthday free pack (up to $10)",
    free_pack_15: "Free booster pack (up to $15)",
    box_break_slot: "A free slot in a box break (up to $20)",
    free_grading: "$15 off a card grading submission",
    store_credit_50: "$50 store credit",
    discount_25_over_300: "25% off $300+ (up to $90 off)",
    // Non-monetary prestige perks (zero cost — great to earn)
    skip_line: "Skip the line at your next event",
    first_restock_pick: "First pick at the next restock",
    reserved_seat: "A reserved seat at any event this month",
    wall_of_champions: "Your name on the Wall of Champions for a month",
    // ELITE rewards — reserved for Ascendant/Eternal gear. Gated behind the rarest drops in the game and
    // long (up to 1-year) cooldowns, so they can be genuinely big while still value-capped.
    elite_credit_100: "$100 store credit",
    elite_box_120: "Free sealed booster box (up to $120)",
    elite_grail: "One 'grail' card of your choice (up to $150), on the house",
};

const ICONS = {
    GiAncientSword, GiBattleAxe, GiBelt, GiBeltArmor, GiBigDiamondRing, GiBlackBelt, GiBlackKnightHelm, GiBookCover, GiBoots, GiBowArrow, GiBreastplate, GiBroadsword, GiBrutalHelm, GiChainMail, GiCharm, GiCheckedShield, GiCrenelCrown, GiCrescentStaff, GiCrestedHelmet, GiCrossShield, GiCrossbow, GiCrown, GiCrystalBall, GiCrystalWand, GiDiamondRing, GiDragonShield, GiEdgedShield, GiEmeraldNecklace, GiEnergySword, GiEngagementRing, GiExecutionerHood, GiFeatherNecklace, GiFireRing, GiFlangedMace, GiFrozenRing, GiFurBoot, GiGemNecklace, GiGemPendant, GiGreaves, GiHeartNecklace, GiHornedHelm, GiIntricateNecklace, GiLayeredArmor, GiLeatherArmor, GiLeatherBoot, GiMetalBoot, GiMetalPlate, GiOverlordHelm, GiPowerRing, GiQueenCrown, GiRing, GiRobe, GiRoundShield, GiRuneSword, GiScaleMail, GiSickle, GiSkullRing, GiSkullSignet, GiSpellBook, GiSpikedArmor, GiSteeltoeBoots, GiSwirlRing, GiTribalPendant, GiWalkingBoot, GiWarhammer, GiWingedSword, GiWizardStaff,
    GiPlainDagger, GiDaggers, GiWarPick, GiFireAxe, GiKatana, GiScythe, GiTrident, GiWoodFrame, GiShieldBash, GiCrystalCluster, GiSurroundedShield, GiVibratingShield, GiBarbute, GiVisoredHelm, GiCenturionHelmet, GiLaurelCrown, GiWizardFace, GiChestArmor, GiAbdominalArmor, GiKimono, GiHoodedFigure, GiRunningShoe, GiBootStomp, GiLegArmor, GiFangs, GiPearlNecklace, GiMoon, GiLibra, GiEagleEmblem, GiHolySymbol, GiWolfHead, GiStarFormation, GiDragonHead, GiPrayerBeads, GiRingedBeam,
    GiHatchet, GiBoomerang, GiCleaver, GiChakram, GiWarAxe, GiWaveStrike, GiFlatHammer, GiEyeShield, GiHeraldicSun, GiConcentrationOrb, GiSpikedShield, GiVortex, GiSpartanHelmet, GiDwarfHelmet, GiWarBonnet, GiCowled, GiArmorVest, GiCape, GiSpikedShoulderArmor, GiCapeArmor, GiBootKick, GiWingfoot, GiEmerald, GiGems, GiCutDiamond, GiAnkh, GiPentacle, GiRaven, GiBearFace, GiSnakeTotem, GiGalaxy, GiSunbeams, GiFireGem, GiBeamsAura,
    GiBoneMace, GiRelicBlade, GiIceBolt, GiWingedScepter, GiFireSilhouette, GiMeteorImpact, GiFireShield, GiIceGolem, GiFloatingCrystal, GiWorld, GiHood, GiHelmetHeadShot, GiHeavyHelm, GiCultist, GiDeadEye, GiPirateCoat, GiRaggedWound, GiHeartInside, GiSpring, GiSnowflake2, GiCometSpark, GiOwl, GiFox, GiTigerHead, GiLotus, GiElephant, GiSpectre, GiOakLeaf, GiWaterDrop, GiFangedSkull, GiDropletSplash,
    GiAngelWings, GiBatwingEmblem, GiCurlyWing, GiFeatheredWing, GiCondorEmblem, GiFalconMoon, GiFeather, GiWingCloak, GiFluffyWing, GiShoulderArmor,
    GiFarmer, GiRolledCloth, GiAmberMosquito, GiBasket, GiClover, GiSwapBag, GiThreeLeaves,
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
    { id: "leather_belt", name: "Leather Belt", slot: "belt", rarity: "common", icon: "GiBelt", flavor: "Holds your pants up — and your seed pouch.", stats: { fortune: 6, ferocity: 4 }, farm: { growSpeed: 3 }, reqLevel: 4, source: "level", sort: 50 },
    { id: "champions_belt", name: "Champion's Belt", slot: "belt", rarity: "epic", icon: "GiBlackBelt", flavor: "Proof you showed up.", stats: { might: 9, fortune: 13 }, reqLevel: 30, source: "xp_shop", xpCost: 3000, sort: 52 },

    // --- Boots ---
    { id: "worn_boots", name: "Worn Boots", slot: "boots", rarity: "common", icon: "GiLeatherBoot", flavor: "Comfy.", stats: { ferocity: 10 }, reqLevel: 3, source: "level", sort: 60 },
    { id: "swift_boots", name: "Swift Boots", slot: "boots", rarity: "rare", icon: "GiWalkingBoot", flavor: "Gotta go fast.", stats: { ferocity: 16 }, reqLevel: 18, source: "level", sort: 62 },

    // --- Amulet ---
    { id: "fortune_pendant", name: "Fortune Pendant", slot: "amulet", rarity: "rare", icon: "GiGemPendant", flavor: "Lady luck's favor.", stats: { fortune: 16 }, reqLevel: 15, source: "level", sort: 70 },
    { id: "amulet_of_fury", name: "Amulet of Fury", slot: "amulet", rarity: "epic", icon: "GiIntricateNecklace", flavor: "Rage, distilled.", stats: { crit_chance: 9, crit_power: 13 }, reqLevel: 34, source: "boss_drop", sort: 72 },
    { id: "warlords_amulet", name: "Warlord's Amulet", slot: "amulet", rarity: "legendary", icon: "GiTribalPendant", flavor: "One more swing.", stats: { might: 18, extra_strike: 1 }, reqLevel: 50, reqBadge: "boss_warlord", source: "boss_drop", sort: 74 },

    // --- Rings (some charged with real-world perks) ---
    { id: "ring_of_might", name: "Ring of Might", slot: "ring", rarity: "common", icon: "GiPowerRing", flavor: "A small edge.", stats: { might: 7, crit_chance: 4 }, reqLevel: 8, source: "level", sort: 80 },
    { id: "ring_of_fortune", name: "Ring of Fortune", slot: "ring", rarity: "rare", icon: "GiRing", flavor: "Luck on your finger.", stats: { fortune: 16 }, sea: { bounty: 3 }, reqLevel: 20, source: "level", sort: 82 },
    { id: "collectors_signet", name: "Collector's Signet", slot: "ring", rarity: "legendary", icon: "GiSkullSignet", flavor: "The store remembers its own.", stats: { might: 5, fortune: 8 }, reqLevel: 25, source: "admin", charged: true, charges: 3, cooldownDays: 30, chargeReward: "free_pack_10", chargeRewardLabel: REWARDS.free_pack_10, sort: 84 },
    { id: "merchants_band", name: "Merchant's Band", slot: "ring", rarity: "epic", icon: "GiDiamondRing", flavor: "A friend of the house.", stats: { fortune: 10 }, reqLevel: 30, source: "admin", charged: true, charges: 1, cooldownDays: 30, chargeReward: "discount_10_over_100", chargeRewardLabel: REWARDS.discount_10_over_100, sort: 86 },

    // ===== CHEST LOOT (source: "chest") — only obtained by opening loot chests. Wide spread across every
    // rarity + the whole level range so chests always have something to give. =====
    // -- Main hand --
    { id: "short_bow", name: "Short Bow", slot: "main_hand", rarity: "common", icon: "GiBowArrow", flavor: "Point and loose.", stats: { might: 7, crit_chance: 4 }, reqLevel: 5, source: "chest", sort: 110 },
    { id: "iron_sword", name: "Iron Sword", slot: "main_hand", rarity: "common", icon: "GiAncientSword", flavor: "Reliable steel.", stats: { might: 8, ferocity: 3 }, reqLevel: 6, source: "chest", sort: 111 },
    { id: "battle_staff", name: "Battle Staff", slot: "main_hand", rarity: "rare", icon: "GiWizardStaff", flavor: "Bonk and blast.", stats: { might: 12, fortune: 4 }, reqLevel: 22, source: "chest", sort: 112 },
    { id: "flanged_mace", name: "Flanged Mace", slot: "main_hand", rarity: "epic", icon: "GiFlangedMace", flavor: "No finesse required.", stats: { might: 22 }, reqLevel: 30, source: "chest", sort: 113 },
    { id: "rune_blade", name: "Rune Blade", slot: "main_hand", rarity: "epic", icon: "GiRuneSword", flavor: "Etched to bite deeper.", stats: { might: 16, crit_chance: 6 }, reqLevel: 44, source: "chest", sort: 114 },
    { id: "soulreaver", name: "Soulreaver", slot: "main_hand", rarity: "legendary", icon: "GiSickle", flavor: "It hungers.", stats: { might: 19, crit_power: 11 }, reqLevel: 62, source: "chest", sort: 115 },
    { id: "stormcaller", name: "Stormcaller", slot: "main_hand", rarity: "legendary", icon: "GiCrescentStaff", flavor: "Lightning on tap.", stats: { might: 21, crit_chance: 9 }, reqLevel: 70, source: "chest", sort: 116 },
    { id: "worldender", name: "Worldender", slot: "main_hand", rarity: "mythic", icon: "GiEnergySword", flavor: "The last weapon you'll need.", stats: { might: 24, crit_power: 16 }, reqLevel: 90, source: "chest", sort: 117 },
    { id: "godsplitter", name: "Godsplitter", slot: "main_hand", rarity: "mythic", icon: "GiBattleAxe", flavor: "Cleaves the heavens.", stats: { might: 21, crit_chance: 8, crit_power: 11 }, reqLevel: 100, source: "chest", sort: 118 },
    // -- Off hand --
    { id: "buckler", name: "Buckler", slot: "off_hand", rarity: "common", icon: "GiRoundShield", flavor: "Small but scrappy.", stats: { ferocity: 7, might: 4 }, reqLevel: 6, source: "chest", sort: 120 },
    { id: "kite_shield", name: "Kite Shield", slot: "off_hand", rarity: "rare", icon: "GiEdgedShield", flavor: "Head to toe cover.", stats: { might: 5, ferocity: 11 }, reqLevel: 24, source: "chest", sort: 121 },
    { id: "grimoire", name: "Grimoire", slot: "off_hand", rarity: "epic", icon: "GiSpellBook", flavor: "Forbidden pages.", stats: { ferocity: 8, fortune: 14 }, reqLevel: 32, source: "chest", sort: 122 },
    { id: "aegis", name: "Aegis", slot: "off_hand", rarity: "legendary", icon: "GiCrossShield", flavor: "Nothing gets through.", stats: { might: 9, ferocity: 21 }, reqLevel: 58, source: "chest", sort: 123 },
    { id: "void_orb", name: "Void Orb", slot: "off_hand", rarity: "mythic", icon: "GiCrystalBall", flavor: "Stares back.", stats: { ferocity: 20, fortune: 20 }, reqLevel: 88, source: "chest", sort: 124 },
    // -- Helmet --
    { id: "iron_helm", name: "Iron Helm", slot: "helmet", rarity: "common", icon: "GiBrutalHelm", flavor: "Dents, doesn't break.", stats: { ferocity: 8, might: 3 }, reqLevel: 6, source: "chest", sort: 130 },
    { id: "rangers_hood", name: "Ranger's Hood", slot: "helmet", rarity: "rare", icon: "GiExecutionerHood", flavor: "Eyes sharp.", stats: { crit_chance: 8, ferocity: 8 }, reqLevel: 20, source: "chest", sort: 131 },
    { id: "warplate_helm", name: "Warplate Helm", slot: "helmet", rarity: "epic", icon: "GiBlackKnightHelm", flavor: "Built for the front line.", stats: { might: 15, crit_chance: 7 }, reqLevel: 36, source: "chest", sort: 132 },
    { id: "crown_of_kings", name: "Crown of Kings", slot: "helmet", rarity: "legendary", icon: "GiQueenCrown", flavor: "Heavy is the head.", stats: { might: 12, fortune: 18 }, reqLevel: 64, source: "chest", sort: 133 },
    { id: "ancient_halo", name: "Halo of the Ancients", slot: "helmet", rarity: "mythic", icon: "GiCrenelCrown", flavor: "Blessed by the old ones.", stats: { crit_chance: 16, crit_power: 24 }, reqLevel: 92, source: "chest", sort: 134 },
    // -- Chest --
    { id: "chainmail", name: "Chainmail", slot: "chest", rarity: "common", icon: "GiChainMail", flavor: "Jingles when you walk.", stats: { ferocity: 7, fortune: 4 }, reqLevel: 6, source: "chest", sort: 140 },
    { id: "scale_mail", name: "Scale Mail", slot: "chest", rarity: "rare", icon: "GiScaleMail", flavor: "Layered like a dragon.", stats: { might: 6, ferocity: 10 }, reqLevel: 24, source: "chest", sort: 141 },
    { id: "plate_armor", name: "Plate Armor", slot: "chest", rarity: "epic", icon: "GiMetalPlate", flavor: "A walking fortress.", stats: { might: 9, ferocity: 13 }, reqLevel: 38, source: "chest", sort: 142 },
    { id: "aegis_plate", name: "Aegis Plate", slot: "chest", rarity: "legendary", icon: "GiLayeredArmor", flavor: "Immovable.", stats: { might: 10, ferocity: 20 }, reqLevel: 66, source: "chest", sort: 143 },
    { id: "celestial_robe", name: "Celestial Robe", slot: "chest", rarity: "mythic", icon: "GiRobe", flavor: "Woven from starlight.", stats: { ferocity: 24, fortune: 16 }, reqLevel: 94, source: "chest", sort: 144 },
    // -- Belt --
    { id: "sturdy_belt", name: "Sturdy Belt", slot: "belt", rarity: "common", icon: "GiBeltArmor", flavor: "Cinch it tight — pockets full of feed.", stats: { ferocity: 6, might: 5 }, farm: { fertPower: 5 }, reqLevel: 8, source: "chest", sort: 150 },
    { id: "focus_sash", name: "Sash of Focus", slot: "belt", rarity: "rare", icon: "GiBlackBelt", flavor: "Steady the aim.", stats: { crit_chance: 16 }, reqLevel: 22, source: "chest", sort: 151 },
    { id: "warlords_girdle", name: "Warlord's Girdle", slot: "belt", rarity: "epic", icon: "GiBelt", flavor: "Command respect.", stats: { might: 11, ferocity: 11 }, reqLevel: 40, source: "chest", sort: 152 },
    { id: "giants_belt", name: "Belt of Giants", slot: "belt", rarity: "legendary", icon: "GiBeltArmor", flavor: "Strength of ten.", stats: { might: 30 }, reqLevel: 60, source: "chest", sort: 153 },
    { id: "cosmic_sash", name: "Cosmic Sash", slot: "belt", rarity: "mythic", icon: "GiBlackBelt", flavor: "Luck of the void.", stats: { fortune: 40 }, reqLevel: 90, source: "chest", sort: 154 },
    // -- Boots --
    { id: "sturdy_boots", name: "Sturdy Boots", slot: "boots", rarity: "common", icon: "GiSteeltoeBoots", flavor: "Miles in them.", stats: { ferocity: 8, might: 3 }, reqLevel: 6, source: "chest", sort: 160 },
    { id: "trailblazers", name: "Trailblazers", slot: "boots", rarity: "rare", icon: "GiBoots", flavor: "First to the fight.", stats: { ferocity: 16 }, reqLevel: 24, source: "chest", sort: 161 },
    { id: "haste_boots", name: "Boots of Haste", slot: "boots", rarity: "epic", icon: "GiFurBoot", flavor: "Blink and miss them.", stats: { crit_chance: 4, ferocity: 18 }, reqLevel: 36, source: "chest", sort: 162 },
    { id: "windwalkers", name: "Windwalkers", slot: "boots", rarity: "legendary", icon: "GiGreaves", flavor: "One more swing in you.", stats: { ferocity: 18, extra_strike: 1 }, reqLevel: 62, source: "chest", sort: 163 },
    { id: "featherfall", name: "Featherfall Greaves", slot: "boots", rarity: "mythic", icon: "GiMetalBoot", flavor: "Never touch the ground.", stats: { ferocity: 27, fortune: 13 }, reqLevel: 92, source: "chest", sort: 164 },
    // -- Amulet --
    { id: "copper_charm", name: "Copper Charm", slot: "amulet", rarity: "common", icon: "GiCharm", flavor: "A little luck in the furrows.", stats: { fortune: 7, might: 4 }, farm: { seedLuck: 4 }, reqLevel: 8, source: "chest", sort: 170 },
    { id: "talisman", name: "Talisman", slot: "amulet", rarity: "rare", icon: "GiFeatherNecklace", flavor: "Old protection.", stats: { might: 7, fortune: 9 }, reqLevel: 22, source: "chest", sort: 171 },
    { id: "wrath_pendant", name: "Pendant of Wrath", slot: "amulet", rarity: "epic", icon: "GiEmeraldNecklace", flavor: "Anger, focused.", stats: { crit_chance: 11, crit_power: 11 }, reqLevel: 38, source: "chest", sort: 172 },
    { id: "wolf_heart", name: "Heart of the Wolf", slot: "amulet", rarity: "legendary", icon: "GiHeartNecklace", flavor: "The pack beats within.", stats: { might: 13, crit_power: 17 }, reqLevel: 60, source: "chest", sort: 173 },
    { id: "eye_eternity", name: "Eye of Eternity", slot: "amulet", rarity: "mythic", icon: "GiGemNecklace", flavor: "Sees every weakness.", stats: { crit_chance: 15, crit_power: 25 }, reqLevel: 95, source: "chest", sort: 174 },
    // -- Rings --
    { id: "copper_ring", name: "Copper Ring", slot: "ring", rarity: "common", icon: "GiSwirlRing", flavor: "Barely magic, but the crops don't mind.", stats: { might: 6, fortune: 5 }, farm: { growSpeed: 4 }, reqLevel: 5, source: "chest", sort: 180 },
    { id: "silver_ring", name: "Silver Ring", slot: "ring", rarity: "common", icon: "GiFrozenRing", flavor: "Shiny — the sower's favorite.", stats: { fortune: 7, crit_chance: 4 }, farm: { seedLuck: 5 }, reqLevel: 10, source: "chest", sort: 181 },
    { id: "focus_band", name: "Band of Focus", slot: "ring", rarity: "rare", icon: "GiFireRing", flavor: "Aim true.", stats: { crit_chance: 16 }, reqLevel: 22, source: "chest", sort: 182 },
    { id: "power_signet", name: "Signet of Power", slot: "ring", rarity: "epic", icon: "GiSkullRing", flavor: "Raw force.", stats: { might: 22 }, reqLevel: 36, source: "chest", sort: 183 },
    { id: "kings_ring", name: "Ring of Kings", slot: "ring", rarity: "legendary", icon: "GiBigDiamondRing", flavor: "Worn by rulers.", stats: { might: 14, fortune: 16 }, reqLevel: 64, source: "chest", sort: 184 },
    { id: "infinity_loop", name: "Loop of Infinity", slot: "ring", rarity: "mythic", icon: "GiEngagementRing", flavor: "No end, no limit.", stats: { might: 16, crit_chance: 8, fortune: 16 }, reqLevel: 98, source: "chest", sort: 185 },

    // ===== EXPANSION LOOT (source: "chest") — more collection variety, every slot + rarity. Flat per-rarity
    // stat budgets (common 10 · rare 16 · epic 22 · legendary 30 · mythic 40), so these add depth, not power. =====
    // -- Main hand --
    { id: "steel_dagger", name: "Steel Dagger", slot: "main_hand", rarity: "common", icon: "GiPlainDagger", flavor: "Quick and quiet.", stats: { crit_chance: 7, might: 4 }, reqLevel: 4, source: "chest", sort: 200 },
    { id: "twin_fangs", name: "Twin Fangs", slot: "main_hand", rarity: "rare", icon: "GiDaggers", flavor: "Two edges, twice the trouble.", stats: { might: 6, crit_chance: 10 }, reqLevel: 16, source: "chest", sort: 201 },
    { id: "war_pick", name: "War Pick", slot: "main_hand", rarity: "epic", icon: "GiWarPick", flavor: "Finds the gap in any armor.", stats: { might: 15, crit_chance: 7 }, reqLevel: 30, source: "chest", sort: 202 },
    { id: "cinder_axe", name: "Cinder Axe", slot: "main_hand", rarity: "epic", icon: "GiFireAxe", flavor: "Still warm from the forge.", stats: { might: 22 }, sea: { broadside: 5 }, reqLevel: 34, source: "chest", sort: 203 },
    { id: "storm_katana", name: "Stormedge Katana", slot: "main_hand", rarity: "legendary", icon: "GiKatana", flavor: "Lightning follows the blade.", stats: { might: 16, crit_power: 14 }, sea: { broadside: 6 }, reqLevel: 60, source: "chest", sort: 204 },
    { id: "reapers_scythe", name: "Reaper's Scythe", slot: "main_hand", rarity: "legendary", icon: "GiScythe", flavor: "It only asks once.", stats: { crit_chance: 12, crit_power: 18 }, reqLevel: 66, source: "chest", sort: 205 },
    { id: "heavens_trident", name: "Heaven's Trident", slot: "main_hand", rarity: "mythic", icon: "GiTrident", flavor: "Forged for a god of storms.", stats: { might: 24, crit_power: 16 }, sea: { plunder: 8 }, reqLevel: 92, source: "chest", sort: 206 },
    // -- Off hand --
    { id: "oak_buckler", name: "Oak Buckler", slot: "off_hand", rarity: "common", icon: "GiWoodFrame", flavor: "Humble oak — doubles as a harvest tray.", stats: { ferocity: 7, fortune: 4 }, farm: { harvestLuck: 4 }, reqLevel: 5, source: "chest", sort: 210 },
    { id: "spiked_shield", name: "Spiked Shield", slot: "off_hand", rarity: "rare", icon: "GiShieldBash", flavor: "Defense that bites back.", stats: { might: 5, ferocity: 11 }, reqLevel: 20, source: "chest", sort: 211 },
    { id: "warding_orb", name: "Warding Orb", slot: "off_hand", rarity: "epic", icon: "GiCrystalCluster", flavor: "Hums with old magic.", stats: { ferocity: 8, fortune: 14 }, reqLevel: 32, source: "chest", sort: 212 },
    { id: "bastion_shield", name: "Bastion Shield", slot: "off_hand", rarity: "legendary", icon: "GiSurroundedShield", flavor: "The wall the pack hides behind.", stats: { might: 10, ferocity: 20 }, reqLevel: 58, source: "chest", sort: 213 },
    { id: "eternal_aegis", name: "Eternal Aegis", slot: "off_hand", rarity: "mythic", icon: "GiVibratingShield", flavor: "Nothing has ever broken it.", stats: { ferocity: 24, fortune: 16 }, reqLevel: 90, source: "chest", sort: 214 },
    // -- Helmet --
    { id: "iron_barbute", name: "Iron Barbute", slot: "helmet", rarity: "common", icon: "GiBarbute", flavor: "Cold to the touch.", stats: { ferocity: 8, crit_chance: 3 }, reqLevel: 4, source: "chest", sort: 220 },
    { id: "ranger_visor", name: "Ranger's Visor", slot: "helmet", rarity: "rare", icon: "GiVisoredHelm", flavor: "Eyes on the prize.", stats: { crit_chance: 8, ferocity: 8 }, reqLevel: 18, source: "chest", sort: 221 },
    { id: "centurion_helm", name: "Centurion Helm", slot: "helmet", rarity: "epic", icon: "GiCenturionHelmet", flavor: "Lead from the front.", stats: { might: 15, crit_chance: 7 }, reqLevel: 34, source: "chest", sort: 222 },
    { id: "wolf_crown", name: "Crown of the Wolf", slot: "helmet", rarity: "legendary", icon: "GiLaurelCrown", flavor: "Worn by the alpha.", stats: { might: 12, fortune: 18 }, reqLevel: 62, source: "chest", sort: 223 },
    { id: "archmage_visage", name: "Archmage's Visage", slot: "helmet", rarity: "mythic", icon: "GiWizardFace", flavor: "Sees every weakness.", stats: { crit_chance: 16, crit_power: 24 }, reqLevel: 92, source: "chest", sort: 224 },
    // -- Chest --
    { id: "padded_vest", name: "Padded Vest", slot: "chest", rarity: "common", icon: "GiChestArmor", flavor: "Better than a T-shirt.", stats: { ferocity: 7, might: 4 }, reqLevel: 4, source: "chest", sort: 230 },
    { id: "scaled_cuirass", name: "Scaled Cuirass", slot: "chest", rarity: "rare", icon: "GiAbdominalArmor", flavor: "Layered like a serpent.", stats: { might: 6, ferocity: 10 }, reqLevel: 22, source: "chest", sort: 231 },
    { id: "warlord_plate", name: "Warlord's Plate", slot: "chest", rarity: "epic", icon: "GiMetalPlate", flavor: "A fortress you can wear.", stats: { might: 9, ferocity: 13 }, reqLevel: 38, source: "chest", sort: 232 },
    { id: "ronin_kimono", name: "Ronin's Kimono", slot: "chest", rarity: "legendary", icon: "GiKimono", flavor: "Grace and steel.", stats: { might: 10, ferocity: 20 }, reqLevel: 60, source: "chest", sort: 233 },
    { id: "eternal_shroud", name: "Eternal Shroud", slot: "chest", rarity: "mythic", icon: "GiHoodedFigure", flavor: "Woven from twilight.", stats: { ferocity: 24, fortune: 16 }, reqLevel: 94, source: "chest", sort: 234 },
    // -- Boots --
    { id: "traveler_boots", name: "Traveler's Boots", slot: "boots", rarity: "common", icon: "GiRunningShoe", flavor: "Made for the long road.", stats: { ferocity: 6, fortune: 5 }, reqLevel: 5, source: "chest", sort: 240 },
    { id: "stomping_boots", name: "Stomping Boots", slot: "boots", rarity: "rare", icon: "GiBootStomp", flavor: "Feel the ground shake.", stats: { ferocity: 16 }, reqLevel: 22, source: "chest", sort: 241 },
    { id: "greaves_valor", name: "Greaves of Valor", slot: "boots", rarity: "epic", icon: "GiLegArmor", flavor: "Stand your ground.", stats: { crit_chance: 4, ferocity: 18 }, reqLevel: 36, source: "chest", sort: 242 },
    { id: "thunderstride", name: "Thunderstride Boots", slot: "boots", rarity: "legendary", icon: "GiMetalBoot", flavor: "Thunder in every step.", stats: { might: 12, ferocity: 18 }, reqLevel: 64, source: "chest", sort: 243 },
    { id: "voidwalkers", name: "Voidwalkers", slot: "boots", rarity: "mythic", icon: "GiSteeltoeBoots", flavor: "Step between worlds.", stats: { ferocity: 27, fortune: 13 }, reqLevel: 90, source: "chest", sort: 244 },
    // -- Amulet --
    { id: "bone_charm", name: "Bone Charm", slot: "amulet", rarity: "common", icon: "GiFangs", flavor: "Rattles up a good harvest.", stats: { fortune: 6, crit_chance: 5 }, farm: { harvestLuck: 4 }, reqLevel: 6, source: "chest", sort: 250 },
    { id: "pearl_strand", name: "Pearl Strand", slot: "amulet", rarity: "common", icon: "GiPearlNecklace", flavor: "Sea-born shimmer, worth its weight at market.", stats: { fortune: 8, ferocity: 3 }, farm: { goldHarvest: 5 }, reqLevel: 8, source: "chest", sort: 251 },
    { id: "moonstone_pendant", name: "Moonstone Pendant", slot: "amulet", rarity: "rare", icon: "GiMoon", flavor: "Glows at midnight.", stats: { might: 7, fortune: 9 }, reqLevel: 22, source: "chest", sort: 252 },
    { id: "balance_amulet", name: "Amulet of Balance", slot: "amulet", rarity: "rare", icon: "GiLibra", flavor: "Weigh every strike.", stats: { crit_chance: 8, crit_power: 8 }, reqLevel: 20, source: "chest", sort: 253 },
    { id: "eagle_sigil", name: "Eagle Sigil", slot: "amulet", rarity: "epic", icon: "GiEagleEmblem", flavor: "Strike from the sky.", stats: { crit_chance: 11, crit_power: 11 }, reqLevel: 38, source: "chest", sort: 254 },
    { id: "blessed_pendant", name: "Blessed Pendant", slot: "amulet", rarity: "epic", icon: "GiHolySymbol", flavor: "A quiet blessing.", stats: { ferocity: 8, fortune: 14 }, reqLevel: 34, source: "chest", sort: 255 },
    { id: "wolf_totem", name: "Wolf Totem", slot: "amulet", rarity: "legendary", icon: "GiWolfHead", flavor: "The pack runs with you.", stats: { might: 13, crit_power: 17 }, reqLevel: 60, source: "chest", sort: 256 },
    { id: "star_amulet", name: "Amulet of Stars", slot: "amulet", rarity: "legendary", icon: "GiStarFormation", flavor: "Fortune written in the sky.", stats: { crit_chance: 14, fortune: 16 }, reqLevel: 68, source: "chest", sort: 257 },
    { id: "dragonheart_sigil", name: "Dragonheart Sigil", slot: "amulet", rarity: "mythic", icon: "GiDragonHead", flavor: "A wyrm's fury, bottled.", stats: { crit_chance: 15, crit_power: 25 }, reqLevel: 95, source: "chest", sort: 258 },
    // -- Belt --
    { id: "woven_belt", name: "Woven Belt", slot: "belt", rarity: "common", icon: "GiBeltArmor", flavor: "Simple and sturdy.", stats: { fortune: 6, crit_chance: 5 }, reqLevel: 6, source: "chest", sort: 260 },
    { id: "monk_sash", name: "Monk's Sash", slot: "belt", rarity: "rare", icon: "GiPrayerBeads", flavor: "Focus in every knot.", stats: { crit_chance: 16 }, reqLevel: 22, source: "chest", sort: 261 },
    { id: "war_girdle", name: "War Girdle", slot: "belt", rarity: "epic", icon: "GiBelt", flavor: "Tighten for battle.", stats: { might: 11, crit_chance: 11 }, reqLevel: 40, source: "chest", sort: 262 },
    { id: "bear_girdle", name: "Girdle of the Bear", slot: "belt", rarity: "legendary", icon: "GiBlackBelt", flavor: "Endless endurance.", stats: { ferocity: 30 }, reqLevel: 62, source: "chest", sort: 263 },
    { id: "colossus_belt", name: "Belt of the Colossus", slot: "belt", rarity: "mythic", icon: "GiBeltArmor", flavor: "Raw, unstoppable force.", stats: { might: 40 }, reqLevel: 90, source: "chest", sort: 264 },
    // -- Rings --
    { id: "band_valor", name: "Band of Valor", slot: "ring", rarity: "common", icon: "GiRing", flavor: "A soldier's first ring — later, a farmer's.", stats: { might: 7, ferocity: 4 }, farm: { fertPower: 4 }, reqLevel: 6, source: "chest", sort: 270 },
    { id: "ring_embers", name: "Ring of Embers", slot: "ring", rarity: "rare", icon: "GiFireRing", flavor: "Warm to the touch.", stats: { might: 11, crit_chance: 5 }, reqLevel: 24, source: "chest", sort: 271 },
    { id: "fortune_signet", name: "Signet of Fortune", slot: "ring", rarity: "epic", icon: "GiRingedBeam", flavor: "The house always wins.", stats: { fortune: 22 }, sea: { bounty: 6 }, reqLevel: 36, source: "chest", sort: 272 },
    { id: "ring_titans", name: "Ring of Titans", slot: "ring", rarity: "legendary", icon: "GiPowerRing", flavor: "Power beyond measure.", stats: { might: 16, crit_power: 14 }, reqLevel: 66, source: "chest", sort: 273 },
    { id: "kings_eternal", name: "Eternal King's Ring", slot: "ring", rarity: "mythic", icon: "GiBigDiamondRing", flavor: "Worn by every ruler who mattered.", stats: { might: 13, fortune: 27 }, reqLevel: 98, source: "chest", sort: 274 },

    // ===== EXPANSION LOOT WAVE 2 (source: "chest") — more variety, same flat per-rarity budgets. =====
    // -- Main hand --
    { id: "bronze_hatchet", name: "Bronze Hatchet", slot: "main_hand", rarity: "common", icon: "GiHatchet", flavor: "Chops more than wood.", stats: { might: 10 }, reqLevel: 3, source: "chest", sort: 300 },
    { id: "war_boomerang", name: "War Boomerang", slot: "main_hand", rarity: "rare", icon: "GiBoomerang", flavor: "It always comes back.", stats: { might: 11, crit_chance: 5 }, reqLevel: 14, source: "chest", sort: 301 },
    { id: "heavy_cleaver", name: "Heavy Cleaver", slot: "main_hand", rarity: "epic", icon: "GiCleaver", flavor: "One swing, one problem solved.", stats: { might: 22 }, reqLevel: 28, source: "chest", sort: 302 },
    { id: "chakram", name: "Whirling Chakram", slot: "main_hand", rarity: "epic", icon: "GiChakram", flavor: "Round and merciless.", stats: { crit_chance: 11, crit_power: 11 }, reqLevel: 32, source: "chest", sort: 303 },
    { id: "executioner_axe", name: "Executioner's Axe", slot: "main_hand", rarity: "legendary", icon: "GiWarAxe", flavor: "No second swing needed.", stats: { might: 16, crit_power: 14 }, reqLevel: 58, source: "chest", sort: 304 },
    { id: "tidebreaker", name: "Tidebreaker", slot: "main_hand", rarity: "legendary", icon: "GiWaveStrike", flavor: "It parts the sea.", stats: { might: 20, crit_chance: 10 }, sea: { plunder: 6 }, reqLevel: 64, source: "chest", sort: 305 },
    { id: "worldflame_maul", name: "Worldflame Maul", slot: "main_hand", rarity: "mythic", icon: "GiFlatHammer", flavor: "The mountains remember it.", stats: { might: 40 }, reqLevel: 94, source: "chest", sort: 306 },
    // -- Off hand --
    { id: "eye_shield", name: "Eye Shield", slot: "off_hand", rarity: "common", icon: "GiEyeShield", flavor: "It watches back.", stats: { ferocity: 7, crit_chance: 4 }, reqLevel: 5, source: "chest", sort: 310 },
    { id: "suns_ward", name: "Sun's Ward", slot: "off_hand", rarity: "rare", icon: "GiHeraldicSun", flavor: "Blinding to your foes.", stats: { might: 5, ferocity: 11 }, reqLevel: 18, source: "chest", sort: 311 },
    { id: "concentration_orb", name: "Orb of Focus", slot: "off_hand", rarity: "epic", icon: "GiConcentrationOrb", flavor: "Steady the mind.", stats: { crit_chance: 8, ferocity: 14 }, reqLevel: 34, source: "chest", sort: 312 },
    { id: "spiked_wall", name: "Spiked Wall", slot: "off_hand", rarity: "legendary", icon: "GiSpikedShield", flavor: "Approach and regret it.", stats: { might: 10, ferocity: 20 }, reqLevel: 60, source: "chest", sort: 313 },
    { id: "void_maelstrom", name: "Void Maelstrom", slot: "off_hand", rarity: "mythic", icon: "GiVortex", flavor: "It devours all it touches.", stats: { ferocity: 20, fortune: 20 }, sea: { dredge: 8 }, reqLevel: 92, source: "chest", sort: 314 },
    // -- Helmet --
    { id: "spartan_helm", name: "Spartan Helm", slot: "helmet", rarity: "common", icon: "GiSpartanHelmet", flavor: "Hold the line.", stats: { ferocity: 7, might: 4 }, reqLevel: 4, source: "chest", sort: 320 },
    { id: "dwarf_helm", name: "Dwarven Helm", slot: "helmet", rarity: "rare", icon: "GiDwarfHelmet", flavor: "Forged deep under the mountain.", stats: { might: 6, ferocity: 10 }, reqLevel: 20, source: "chest", sort: 321 },
    { id: "warbonnet", name: "War Bonnet", slot: "helmet", rarity: "epic", icon: "GiWarBonnet", flavor: "Every feather, a victory.", stats: { might: 9, fortune: 13 }, reqLevel: 36, source: "chest", sort: 322 },
    { id: "shadow_cowl", name: "Shadow Cowl", slot: "helmet", rarity: "legendary", icon: "GiCowled", flavor: "They never see you coming.", stats: { crit_chance: 12, crit_power: 18 }, reqLevel: 64, source: "chest", sort: 323 },
    { id: "oracle_diadem", name: "Oracle's Diadem", slot: "helmet", rarity: "mythic", icon: "GiCrenelCrown", flavor: "It knows where you'll strike.", stats: { crit_chance: 20, crit_power: 20 }, reqLevel: 94, source: "chest", sort: 324 },
    // -- Chest --
    { id: "studded_vest", name: "Studded Vest", slot: "chest", rarity: "common", icon: "GiArmorVest", flavor: "Riveted and ready.", stats: { ferocity: 8, crit_chance: 3 }, reqLevel: 4, source: "chest", sort: 330 },
    { id: "war_cape", name: "War Cape", slot: "chest", rarity: "rare", icon: "GiCape", flavor: "Flair with function.", stats: { ferocity: 9, fortune: 7 }, reqLevel: 22, source: "chest", sort: 331 },
    { id: "pauldron_plate", name: "Pauldron Plate", slot: "chest", rarity: "epic", icon: "GiSpikedShoulderArmor", flavor: "Shoulders like a fortress.", stats: { might: 9, ferocity: 13 }, reqLevel: 38, source: "chest", sort: 332 },
    { id: "dragoncape", name: "Dragoncape", slot: "chest", rarity: "legendary", icon: "GiCapeArmor", flavor: "Scaled and unburnt.", stats: { might: 10, ferocity: 20 }, reqLevel: 60, source: "chest", sort: 333 },
    { id: "starforged_mail", name: "Starforged Mail", slot: "chest", rarity: "mythic", icon: "GiLayeredArmor", flavor: "Hammered from a fallen star.", stats: { ferocity: 27, fortune: 13 }, reqLevel: 94, source: "chest", sort: 334 },
    // -- Boots --
    { id: "kickers", name: "Steel Kickers", slot: "boots", rarity: "common", icon: "GiBootKick", flavor: "Put some weight behind it.", stats: { ferocity: 6, might: 5 }, reqLevel: 5, source: "chest", sort: 340 },
    { id: "windfoot", name: "Windfoot Sandals", slot: "boots", rarity: "rare", icon: "GiWingfoot", flavor: "Barely touch the ground.", stats: { ferocity: 16 }, reqLevel: 22, source: "chest", sort: 341 },
    { id: "valor_treads", name: "Treads of Valor", slot: "boots", rarity: "epic", icon: "GiBoots", flavor: "Never take a step back.", stats: { might: 9, ferocity: 13 }, reqLevel: 36, source: "chest", sort: 342 },
    { id: "titan_stompers", name: "Titan Stompers", slot: "boots", rarity: "legendary", icon: "GiGreaves", flavor: "The earth minds its manners.", stats: { ferocity: 30 }, reqLevel: 64, source: "chest", sort: 343 },
    // -- Amulet --
    { id: "emerald_charm", name: "Emerald Charm", slot: "amulet", rarity: "common", icon: "GiEmerald", flavor: "Green for a growing thing.", stats: { fortune: 8, crit_chance: 3 }, farm: { goldHarvest: 6 }, reqLevel: 6, source: "chest", sort: 350 },
    { id: "ruby_bead", name: "Ruby Bead", slot: "amulet", rarity: "common", icon: "GiGems", flavor: "A drop of luck.", stats: { fortune: 6, might: 5 }, reqLevel: 8, source: "chest", sort: 351 },
    { id: "diamond_droplet", name: "Diamond Droplet", slot: "amulet", rarity: "rare", icon: "GiCutDiamond", flavor: "Flawless and cold.", stats: { might: 7, fortune: 9 }, reqLevel: 22, source: "chest", sort: 352 },
    { id: "ankh_pendant", name: "Ankh Pendant", slot: "amulet", rarity: "rare", icon: "GiAnkh", flavor: "Old life, old power.", stats: { crit_chance: 8, crit_power: 8 }, reqLevel: 20, source: "chest", sort: 353 },
    { id: "pentagram_charm", name: "Pentagram Charm", slot: "amulet", rarity: "epic", icon: "GiPentacle", flavor: "Five points of fury.", stats: { crit_chance: 11, crit_power: 11 }, reqLevel: 38, source: "chest", sort: 354 },
    { id: "raven_feather", name: "Raven Feather", slot: "amulet", rarity: "epic", icon: "GiRaven", flavor: "An omen in obsidian.", stats: { ferocity: 8, fortune: 14 }, reqLevel: 34, source: "chest", sort: 355 },
    { id: "bear_fang", name: "Bear Fang Amulet", slot: "amulet", rarity: "legendary", icon: "GiBearFace", flavor: "Strength of the wild.", stats: { might: 13, crit_power: 17 }, reqLevel: 60, source: "chest", sort: 356 },
    { id: "serpent_coil", name: "Serpent Coil", slot: "amulet", rarity: "legendary", icon: "GiSnakeTotem", flavor: "Patient, then lethal.", stats: { crit_chance: 14, fortune: 16 }, reqLevel: 68, source: "chest", sort: 357 },
    { id: "galaxy_pendant", name: "Galaxy Pendant", slot: "amulet", rarity: "mythic", icon: "GiGalaxy", flavor: "A universe on a string.", stats: { crit_chance: 16, crit_power: 24 }, reqLevel: 95, source: "chest", sort: 358 },
    { id: "suncrest", name: "Suncrest Amulet", slot: "amulet", rarity: "mythic", icon: "GiSunbeams", flavor: "Dawn made wearable.", stats: { might: 13, fortune: 27 }, reqLevel: 96, source: "chest", sort: 359 },
    // -- Belt --
    { id: "chain_belt", name: "Chain Belt", slot: "belt", rarity: "common", icon: "GiBelt", flavor: "Links that hold.", stats: { might: 5, ferocity: 6 }, reqLevel: 6, source: "chest", sort: 360 },
    { id: "runners_sash", name: "Runner's Sash", slot: "belt", rarity: "rare", icon: "GiBlackBelt", flavor: "Light on the waist.", stats: { ferocity: 16 }, reqLevel: 20, source: "chest", sort: 361 },
    { id: "girded_plate", name: "Girded Plate", slot: "belt", rarity: "epic", icon: "GiBeltArmor", flavor: "Cinch the armor down.", stats: { might: 22 }, sea: { trove: 5 }, reqLevel: 40, source: "chest", sort: 362 },
    { id: "kings_sash", name: "King's Sash", slot: "belt", rarity: "legendary", icon: "GiBelt", flavor: "Gilded and grand.", stats: { might: 14, fortune: 16 }, reqLevel: 62, source: "chest", sort: 363 },
    { id: "world_girdle", name: "Girdle of the World", slot: "belt", rarity: "mythic", icon: "GiBlackBelt", flavor: "It holds up more than your pants.", stats: { ferocity: 40 }, reqLevel: 92, source: "chest", sort: 364 },
    // -- Rings --
    { id: "iron_band", name: "Iron Band", slot: "ring", rarity: "common", icon: "GiFrozenRing", flavor: "Plain, but it holds.", stats: { ferocity: 6, might: 5 }, reqLevel: 5, source: "chest", sort: 370 },
    { id: "gem_ring", name: "Gemmed Ring", slot: "ring", rarity: "rare", icon: "GiFireGem", flavor: "Catches every eye.", stats: { fortune: 16 }, reqLevel: 20, source: "chest", sort: 371 },
    { id: "aura_ring", name: "Ring of Aura", slot: "ring", rarity: "epic", icon: "GiBeamsAura", flavor: "It hums with power.", stats: { crit_chance: 11, crit_power: 11 }, reqLevel: 36, source: "chest", sort: 372 },
    { id: "warlord_ring", name: "Warlord's Ring", slot: "ring", rarity: "legendary", icon: "GiDiamondRing", flavor: "Command in a circle.", stats: { might: 16, crit_power: 14 }, reqLevel: 64, source: "chest", sort: 373 },
    { id: "eternity_band", name: "Band of Eternity", slot: "ring", rarity: "mythic", icon: "GiPowerRing", flavor: "Without beginning or end.", stats: { ferocity: 20, fortune: 20 }, reqLevel: 98, source: "chest", sort: 374 },

    // ===== EXPANSION LOOT WAVE 3 (source: "chest") — frost / bone / beast / elemental themes. =====
    // -- Main hand --
    { id: "bone_mace", name: "Bone Mace", slot: "main_hand", rarity: "common", icon: "GiBoneMace", flavor: "Grim, but it works.", stats: { might: 7, ferocity: 4 }, reqLevel: 4, source: "chest", sort: 400 },
    { id: "relic_blade", name: "Relic Blade", slot: "main_hand", rarity: "rare", icon: "GiRelicBlade", flavor: "Older than the store.", stats: { might: 11, crit_chance: 5 }, reqLevel: 16, source: "chest", sort: 401 },
    { id: "frost_brand", name: "Frostbrand", slot: "main_hand", rarity: "epic", icon: "GiIceBolt", flavor: "It bites cold and deep.", stats: { crit_chance: 11, crit_power: 11 }, reqLevel: 30, source: "chest", sort: 402 },
    { id: "winged_scepter", name: "Winged Scepter", slot: "main_hand", rarity: "epic", icon: "GiWingedScepter", flavor: "Rule with a light touch.", stats: { might: 12, fortune: 10 }, reqLevel: 34, source: "chest", sort: 403 },
    { id: "soulflame_sword", name: "Soulflame Sword", slot: "main_hand", rarity: "legendary", icon: "GiFireSilhouette", flavor: "It burns from within.", stats: { might: 16, crit_power: 14 }, reqLevel: 60, source: "chest", sort: 404 },
    { id: "meteor_hammer", name: "Meteor Hammer", slot: "main_hand", rarity: "mythic", icon: "GiMeteorImpact", flavor: "Called down from the sky.", stats: { might: 24, crit_power: 16 }, reqLevel: 94, source: "chest", sort: 405 },
    // -- Off hand --
    { id: "fire_ward", name: "Fire Ward", slot: "off_hand", rarity: "common", icon: "GiFireShield", flavor: "Warm to hold.", stats: { ferocity: 7, crit_power: 4 }, reqLevel: 5, source: "chest", sort: 410 },
    { id: "frost_barrier", name: "Frost Barrier", slot: "off_hand", rarity: "rare", icon: "GiIceGolem", flavor: "A wall of ice.", stats: { might: 5, ferocity: 11 }, sea: { ironclad: 5 }, reqLevel: 20, source: "chest", sort: 411 },
    { id: "orb_of_tides", name: "Orb of Tides", slot: "off_hand", rarity: "epic", icon: "GiFloatingCrystal", flavor: "The sea answers it.", stats: { ferocity: 8, fortune: 14 }, sea: { dredge: 5 }, reqLevel: 34, source: "chest", sort: 412 },
    { id: "worldshield", name: "Worldshield", slot: "off_hand", rarity: "mythic", icon: "GiWorld", flavor: "It carries the sky.", stats: { ferocity: 20, fortune: 20 }, reqLevel: 92, source: "chest", sort: 413 },
    // -- Helmet --
    { id: "iron_hood", name: "Iron Hood", slot: "helmet", rarity: "common", icon: "GiHood", flavor: "Keeps your head down.", stats: { ferocity: 7, fortune: 4 }, reqLevel: 4, source: "chest", sort: 420 },
    { id: "raiders_helm", name: "Raider's Helm", slot: "helmet", rarity: "rare", icon: "GiHelmetHeadShot", flavor: "Take what you can.", stats: { crit_chance: 8, ferocity: 8 }, reqLevel: 18, source: "chest", sort: 421 },
    { id: "heavy_warhelm", name: "Heavy Warhelm", slot: "helmet", rarity: "epic", icon: "GiHeavyHelm", flavor: "Built to take a hit.", stats: { might: 15, crit_chance: 7 }, reqLevel: 34, source: "chest", sort: 422 },
    { id: "cultist_hood", name: "Cultist's Hood", slot: "helmet", rarity: "legendary", icon: "GiCultist", flavor: "Whispers of the deep.", stats: { crit_chance: 12, crit_power: 18 }, reqLevel: 64, source: "chest", sort: 423 },
    { id: "deadeye_mask", name: "Deadeye Mask", slot: "helmet", rarity: "mythic", icon: "GiDeadEye", flavor: "It never blinks.", stats: { crit_chance: 16, crit_power: 24 }, reqLevel: 92, source: "chest", sort: 424 },
    // -- Chest --
    { id: "padded_coat", name: "Padded Coat", slot: "chest", rarity: "common", icon: "GiPirateCoat", flavor: "Roughspun and warm.", stats: { ferocity: 6, fortune: 5 }, reqLevel: 4, source: "chest", sort: 430 },
    { id: "ragged_mail", name: "Ragged Mail", slot: "chest", rarity: "rare", icon: "GiRaggedWound", flavor: "Seen a battle or two.", stats: { might: 6, ferocity: 10 }, reqLevel: 22, source: "chest", sort: 431 },
    { id: "heartguard_plate", name: "Heartguard Plate", slot: "chest", rarity: "epic", icon: "GiHeartInside", flavor: "Protects what matters.", stats: { might: 9, ferocity: 13 }, reqLevel: 38, source: "chest", sort: 432 },
    { id: "runeweave_robe", name: "Runeweave Robe", slot: "chest", rarity: "legendary", icon: "GiRobe", flavor: "Stitched with old words.", stats: { might: 10, ferocity: 20 }, reqLevel: 60, source: "chest", sort: 433 },
    // -- Boots --
    { id: "springstep", name: "Springstep Boots", slot: "boots", rarity: "common", icon: "GiSpring", flavor: "Bounce in your step.", stats: { ferocity: 6, crit_chance: 5 }, reqLevel: 5, source: "chest", sort: 440 },
    { id: "frost_treads", name: "Frost Treads", slot: "boots", rarity: "rare", icon: "GiSnowflake2", flavor: "Never slip on ice.", stats: { ferocity: 16 }, reqLevel: 22, source: "chest", sort: 441 },
    { id: "comet_greaves", name: "Comet Greaves", slot: "boots", rarity: "epic", icon: "GiCometSpark", flavor: "Leave a trail of light.", stats: { crit_chance: 4, ferocity: 18 }, reqLevel: 36, source: "chest", sort: 442 },
    // -- Amulet --
    { id: "owl_charm", name: "Owl Charm", slot: "amulet", rarity: "common", icon: "GiOwl", flavor: "Watches over the barn at night.", stats: { fortune: 7, crit_chance: 4 }, farm: { petXp: 6 }, reqLevel: 6, source: "chest", sort: 450 },
    { id: "fox_charm", name: "Fox Charm", slot: "amulet", rarity: "rare", icon: "GiFox", flavor: "Cunning on a chain.", stats: { might: 7, fortune: 9 }, reqLevel: 22, source: "chest", sort: 451 },
    { id: "tiger_fang", name: "Tiger Fang", slot: "amulet", rarity: "epic", icon: "GiTigerHead", flavor: "Fierce and fast.", stats: { crit_chance: 11, crit_power: 11 }, reqLevel: 38, source: "chest", sort: 452 },
    { id: "lotus_pendant", name: "Lotus Pendant", slot: "amulet", rarity: "epic", icon: "GiLotus", flavor: "Calm in the storm.", stats: { ferocity: 8, fortune: 14 }, reqLevel: 34, source: "chest", sort: 453 },
    { id: "elephant_totem", name: "Elephant Totem", slot: "amulet", rarity: "legendary", icon: "GiElephant", flavor: "Never forgets, never falls.", stats: { might: 13, crit_power: 17 }, reqLevel: 60, source: "chest", sort: 454 },
    { id: "spectre_locket", name: "Spectre Locket", slot: "amulet", rarity: "mythic", icon: "GiSpectre", flavor: "A soul kept close.", stats: { crit_chance: 16, crit_power: 24 }, reqLevel: 95, source: "chest", sort: 455 },
    // -- Belt --
    { id: "leaf_sash", name: "Leaf Sash", slot: "belt", rarity: "common", icon: "GiOakLeaf", flavor: "Green and simple.", stats: { fortune: 7, ferocity: 4 }, reqLevel: 6, source: "chest", sort: 460 },
    { id: "waterflow_belt", name: "Waterflow Belt", slot: "belt", rarity: "rare", icon: "GiWaterDrop", flavor: "Move like the river.", stats: { crit_chance: 16 }, sea: { dredge: 4 }, reqLevel: 20, source: "chest", sort: 461 },
    // -- Rings --
    { id: "bone_ring", name: "Bone Ring", slot: "ring", rarity: "common", icon: "GiFangedSkull", flavor: "A grim little band.", stats: { might: 6, crit_chance: 5 }, reqLevel: 5, source: "chest", sort: 470 },
    { id: "droplet_ring", name: "Droplet Ring", slot: "ring", rarity: "rare", icon: "GiDropletSplash", flavor: "A bead of pure luck.", stats: { fortune: 16 }, sea: { plunder: 3 }, reqLevel: 20, source: "chest", sort: 471 },

    // ===== REAL-WORLD PERK ITEMS (source: "admin", charged) — the owner hands these out; they never drop
    // from loot. Redeemed in-store via the admin app (burns a charge + starts the cooldown). Modest stats:
    // the perk is the prize. Reuse existing icons to stay build-safe. =====
    { id: "coppers_token", name: "Copper Patron Token", slot: "amulet", rarity: "common", icon: "GiCharm", flavor: "Good for a cold one.", stats: { fortune: 6, ferocity: 3 }, reqLevel: 5, source: "admin", charged: true, charges: 3, cooldownDays: 14, earnable: true, chargeReward: "free_drink", chargeRewardLabel: REWARDS.free_drink, sort: 500 },
    { id: "sleeve_charm", name: "Sleeve Charm", slot: "amulet", rarity: "common", icon: "GiGemPendant", flavor: "Protect your cards.", stats: { ferocity: 6, fortune: 3 }, reqLevel: 5, source: "admin", charged: true, charges: 2, cooldownDays: 30, earnable: true, chargeReward: "free_sleeves", chargeRewardLabel: REWARDS.free_sleeves, sort: 501 },
    { id: "singles_signet", name: "Singles Signet", slot: "ring", rarity: "rare", icon: "GiSwirlRing", flavor: "One for the collection.", stats: { might: 6, fortune: 6 }, reqLevel: 10, source: "admin", charged: true, charges: 3, cooldownDays: 30, earnable: true, chargeReward: "free_single_5", chargeRewardLabel: REWARDS.free_single_5, sort: 502 },
    { id: "deckbox_charm", name: "Deckbox Charm", slot: "amulet", rarity: "rare", icon: "GiFeatherNecklace", flavor: "A home for your deck.", stats: { ferocity: 12 }, reqLevel: 12, source: "admin", charged: true, charges: 1, cooldownDays: 30, chargeReward: "free_deckbox", chargeRewardLabel: REWARDS.free_deckbox, sort: 503 },
    { id: "event_pass", name: "Friday Night Pass", slot: "amulet", rarity: "rare", icon: "GiPrayerBeads", flavor: "See you at the table.", stats: { fortune: 12 }, reqLevel: 12, source: "admin", charged: true, charges: 2, cooldownDays: 30, earnable: true, chargeReward: "free_event_entry", chargeRewardLabel: REWARDS.free_event_entry, sort: 504 },
    { id: "patrons_band", name: "Patron's Band", slot: "ring", rarity: "epic", icon: "GiPowerRing", flavor: "A friend of the house.", stats: { might: 6, fortune: 8 }, reqLevel: 15, source: "admin", charged: true, charges: 2, cooldownDays: 30, chargeReward: "free_pack_10", chargeRewardLabel: REWARDS.free_pack_10, sort: 505 },
    { id: "bargainers_signet", name: "Bargainer's Signet", slot: "ring", rarity: "epic", icon: "GiDiamondRing", flavor: "Every little bit helps.", stats: { fortune: 14 }, reqLevel: 18, source: "admin", charged: true, charges: 3, cooldownDays: 30, chargeReward: "discount_5_any", chargeRewardLabel: REWARDS.discount_5_any, sort: 506 },
    { id: "grabbag_charm", name: "Lucky Grab Charm", slot: "amulet", rarity: "epic", icon: "GiEmeraldNecklace", flavor: "You never know.", stats: { fortune: 14 }, reqLevel: 20, source: "admin", charged: true, charges: 1, cooldownDays: 45, chargeReward: "free_grab_bag", chargeRewardLabel: REWARDS.free_grab_bag, sort: 507 },
    { id: "traders_charm", name: "Trader's Charm", slot: "amulet", rarity: "epic", icon: "GiIntricateNecklace", flavor: "Deal from strength.", stats: { fortune: 14 }, reqLevel: 22, source: "admin", charged: true, charges: 3, cooldownDays: 30, chargeReward: "trade_bonus_10", chargeRewardLabel: REWARDS.trade_bonus_10, sort: 508 },
    { id: "highroller_ring", name: "High Roller's Ring", slot: "ring", rarity: "legendary", icon: "GiBigDiamondRing", flavor: "Spend big, save big.", stats: { fortune: 16 }, reqLevel: 30, source: "admin", charged: true, charges: 1, cooldownDays: 45, chargeReward: "discount_10_over_100", chargeRewardLabel: REWARDS.discount_10_over_100, sort: 509 },
    { id: "playmat_medallion", name: "Playmat Medallion", slot: "amulet", rarity: "legendary", icon: "GiTribalPendant", flavor: "Play in style.", stats: { ferocity: 16 }, reqLevel: 30, source: "admin", charged: true, charges: 1, cooldownDays: 60, chargeReward: "free_playmat", chargeRewardLabel: REWARDS.free_playmat, sort: 510 },
    { id: "premium_signet", name: "Premium Signet", slot: "ring", rarity: "legendary", icon: "GiFireRing", flavor: "For the discerning collector.", stats: { might: 8, fortune: 8 }, reqLevel: 35, source: "admin", charged: true, charges: 1, cooldownDays: 60, chargeReward: "free_pack_25", chargeRewardLabel: REWARDS.free_pack_25, sort: 511 },
    { id: "patrons_crown", name: "Patron's Crown", slot: "helmet", rarity: "mythic", icon: "GiQueenCrown", flavor: "The house bows to you.", stats: { might: 8, fortune: 8 }, reqLevel: 40, source: "admin", charged: true, charges: 1, cooldownDays: 90, chargeReward: "discount_15_over_150", chargeRewardLabel: REWARDS.discount_15_over_150, sort: 512 },
    { id: "founders_ring", name: "Founder's Ring", slot: "ring", rarity: "mythic", icon: "GiEngagementRing", flavor: "First among the pack.", stats: { might: 8, crit_chance: 8 }, reqLevel: 40, source: "admin", charged: true, charges: 2, cooldownDays: 60, chargeReward: "buy2get1_singles", chargeRewardLabel: REWARDS.buy2get1_singles, sort: 513 },

    // ===== REAL-WORLD PERKS — WAVE 2 (source: "admin", charged, all value-capped). =====
    { id: "snack_token", name: "Snack Token", slot: "amulet", rarity: "common", icon: "GiCharm", flavor: "Fuel for the grind.", stats: { ferocity: 5, might: 4 }, reqLevel: 5, source: "admin", charged: true, charges: 3, cooldownDays: 14, earnable: true, chargeReward: "free_snack", chargeRewardLabel: REWARDS.free_snack, sort: 520 },
    { id: "dice_charm", name: "Dice Charm", slot: "amulet", rarity: "common", icon: "GiGemPendant", flavor: "Roll high.", stats: { fortune: 6, crit_chance: 3 }, reqLevel: 5, source: "admin", charged: true, charges: 2, cooldownDays: 30, earnable: true, chargeReward: "free_dice", chargeRewardLabel: REWARDS.free_dice, sort: 521 },
    { id: "promo_signet", name: "Promo Signet", slot: "ring", rarity: "rare", icon: "GiSkullRing", flavor: "A little something extra.", stats: { might: 6, fortune: 6 }, reqLevel: 10, source: "admin", charged: true, charges: 2, cooldownDays: 30, earnable: true, chargeReward: "free_promo", chargeRewardLabel: REWARDS.free_promo, sort: 522 },
    { id: "starter_pack_charm", name: "Starter Pack Charm", slot: "amulet", rarity: "rare", icon: "GiFeatherNecklace", flavor: "Everyone starts somewhere.", stats: { fortune: 12 }, reqLevel: 10, source: "admin", charged: true, charges: 2, cooldownDays: 30, earnable: true, chargeReward: "free_pack_10", chargeRewardLabel: REWARDS.free_pack_10, sort: 523 },
    { id: "credit5_token", name: "Credit Token", slot: "amulet", rarity: "rare", icon: "GiGems", flavor: "Money in the bank.", stats: { fortune: 12 }, reqLevel: 12, source: "admin", charged: true, charges: 2, cooldownDays: 30, chargeReward: "store_credit_5", chargeRewardLabel: REWARDS.store_credit_5, sort: 524 },
    { id: "tournament_pass", name: "Tournament Pass", slot: "amulet", rarity: "epic", icon: "GiPrayerBeads", flavor: "See you in the top cut.", stats: { crit_chance: 14 }, reqLevel: 15, source: "admin", charged: true, charges: 1, cooldownDays: 45, chargeReward: "tournament_seat", chargeRewardLabel: REWARDS.tournament_seat, sort: 525 },
    { id: "credit10_signet", name: "Credit Signet", slot: "ring", rarity: "epic", icon: "GiDiamondRing", flavor: "Spend it well.", stats: { fortune: 14 }, reqLevel: 18, source: "admin", charged: true, charges: 2, cooldownDays: 30, chargeReward: "store_credit_10", chargeRewardLabel: REWARDS.store_credit_10, sort: 526 },
    { id: "bundle_charm", name: "Bundle Charm", slot: "amulet", rarity: "epic", icon: "GiEmeraldNecklace", flavor: "The whole kit.", stats: { fortune: 14 }, reqLevel: 20, source: "admin", charged: true, charges: 1, cooldownDays: 45, chargeReward: "free_bundle_30", chargeRewardLabel: REWARDS.free_bundle_30, sort: 527 },
    { id: "premium_playmat_medallion", name: "Premium Playmat Medallion", slot: "amulet", rarity: "legendary", icon: "GiIntricateNecklace", flavor: "Play in real style.", stats: { ferocity: 16 }, reqLevel: 30, source: "admin", charged: true, charges: 1, cooldownDays: 60, chargeReward: "free_playmat_premium", chargeRewardLabel: REWARDS.free_playmat_premium, sort: 528 },
    { id: "credit25_ring", name: "Credit Ring", slot: "ring", rarity: "legendary", icon: "GiFireRing", flavor: "A tidy sum.", stats: { might: 8, fortune: 8 }, reqLevel: 35, source: "admin", charged: true, charges: 1, cooldownDays: 60, chargeReward: "store_credit_25", chargeRewardLabel: REWARDS.store_credit_25, sort: 529 },
    { id: "bigspender_crown", name: "Big Spender's Crown", slot: "helmet", rarity: "mythic", icon: "GiCrown", flavor: "Go big.", stats: { might: 8, fortune: 8 }, reqLevel: 40, source: "admin", charged: true, charges: 1, cooldownDays: 90, chargeReward: "discount_20_over_200", chargeRewardLabel: REWARDS.discount_20_over_200, sort: 530 },

    // ===== REAL-WORLD PERKS — WAVE 3 (source: "admin", charged). Non-monetary prestige perks are earnable. =====
    { id: "toploader_charm", name: "Toploader Charm", slot: "amulet", rarity: "common", icon: "GiCharm", flavor: "Keep 'em mint.", stats: { ferocity: 6, crit_chance: 3 }, reqLevel: 5, source: "admin", charged: true, charges: 3, cooldownDays: 14, earnable: true, chargeReward: "free_toploaders", chargeRewardLabel: REWARDS.free_toploaders, sort: 531 },
    { id: "linecutter_token", name: "Line-Cutter Token", slot: "ring", rarity: "common", icon: "GiSwirlRing", flavor: "Straight to the front.", stats: { might: 6, crit_chance: 4 }, reqLevel: 5, source: "admin", charged: true, charges: 3, cooldownDays: 14, earnable: true, chargeReward: "skip_line", chargeRewardLabel: REWARDS.skip_line, sort: 532 },
    { id: "box_charm", name: "Storage Charm", slot: "amulet", rarity: "common", icon: "GiBeltArmor", flavor: "A home for the collection.", stats: { ferocity: 5, fortune: 4 }, reqLevel: 5, source: "admin", charged: true, charges: 2, cooldownDays: 30, earnable: true, chargeReward: "free_storage_box", chargeRewardLabel: REWARDS.free_storage_box, sort: 533 },
    { id: "restock_signet", name: "Restock Signet", slot: "ring", rarity: "rare", icon: "GiSkullSignet", flavor: "First in line for the good stuff.", stats: { might: 6, fortune: 6 }, reqLevel: 10, source: "admin", charged: true, charges: 2, cooldownDays: 30, earnable: true, chargeReward: "first_restock_pick", chargeRewardLabel: REWARDS.first_restock_pick, sort: 534 },
    { id: "reserved_seat_charm", name: "Reserved Seat Charm", slot: "amulet", rarity: "rare", icon: "GiPrayerBeads", flavor: "Your spot's saved.", stats: { fortune: 12 }, reqLevel: 12, source: "admin", charged: true, charges: 2, cooldownDays: 30, earnable: true, chargeReward: "reserved_seat", chargeRewardLabel: REWARDS.reserved_seat, sort: 535 },
    { id: "binder_charm", name: "Binder Charm", slot: "amulet", rarity: "rare", icon: "GiGemPendant", flavor: "Show off the collection.", stats: { fortune: 12 }, reqLevel: 12, source: "admin", charged: true, charges: 1, cooldownDays: 30, chargeReward: "free_binder", chargeRewardLabel: REWARDS.free_binder, sort: 536 },
    { id: "premium_sleeve_charm", name: "Premium Sleeve Charm", slot: "amulet", rarity: "rare", icon: "GiIntricateNecklace", flavor: "Protect in style.", stats: { ferocity: 12 }, reqLevel: 12, source: "admin", charged: true, charges: 2, cooldownDays: 30, chargeReward: "free_premium_sleeves", chargeRewardLabel: REWARDS.free_premium_sleeves, sort: 537 },
    { id: "birthday_charm", name: "Birthday Charm", slot: "amulet", rarity: "rare", icon: "GiHeartNecklace", flavor: "Happy birthday from the Den.", stats: { fortune: 12 }, reqLevel: 10, source: "admin", charged: true, charges: 1, cooldownDays: 365, chargeReward: "birthday_pack", chargeRewardLabel: REWARDS.birthday_pack, sort: 538 },
    { id: "champions_plaque", name: "Champion's Plaque", slot: "helmet", rarity: "epic", icon: "GiCrown", flavor: "Immortalized on the wall.", stats: { might: 8, fortune: 6 }, reqLevel: 20, source: "admin", charged: true, charges: 1, cooldownDays: 90, earnable: true, chargeReward: "wall_of_champions", chargeRewardLabel: REWARDS.wall_of_champions, sort: 539 },
    { id: "pack15_charm", name: "Big Pack Charm", slot: "amulet", rarity: "epic", icon: "GiEmeraldNecklace", flavor: "Go for the chase.", stats: { crit_chance: 11, crit_power: 11 }, reqLevel: 20, source: "admin", charged: true, charges: 1, cooldownDays: 45, chargeReward: "free_pack_15", chargeRewardLabel: REWARDS.free_pack_15, sort: 540 },
    { id: "boxbreak_charm", name: "Box Break Charm", slot: "amulet", rarity: "epic", icon: "GiGems", flavor: "In on the action.", stats: { fortune: 14 }, reqLevel: 22, source: "admin", charged: true, charges: 1, cooldownDays: 45, chargeReward: "box_break_slot", chargeRewardLabel: REWARDS.box_break_slot, sort: 541 },
    { id: "grading_charm", name: "Grading Charm", slot: "amulet", rarity: "epic", icon: "GiTribalPendant", flavor: "Slab the gem mints.", stats: { ferocity: 14 }, reqLevel: 22, source: "admin", charged: true, charges: 1, cooldownDays: 60, chargeReward: "free_grading", chargeRewardLabel: REWARDS.free_grading, sort: 542 },
    { id: "credit50_ring", name: "Grand Credit Ring", slot: "ring", rarity: "legendary", icon: "GiBigDiamondRing", flavor: "A serious sum.", stats: { might: 8, fortune: 8 }, reqLevel: 40, source: "admin", charged: true, charges: 1, cooldownDays: 90, chargeReward: "store_credit_50", chargeRewardLabel: REWARDS.store_credit_50, sort: 543 },
    { id: "whale_crown", name: "Whale's Crown", slot: "helmet", rarity: "mythic", icon: "GiQueenCrown", flavor: "Spend like a legend.", stats: { might: 8, fortune: 8 }, reqLevel: 45, source: "admin", charged: true, charges: 1, cooldownDays: 120, chargeReward: "discount_25_over_300", chargeRewardLabel: REWARDS.discount_25_over_300, sort: 544 },

    // ===== GOLD SHOP GEAR (source: "xp_shop") — buyable with gold across the full price ladder, a real
    // gold sink. Budget-neutral stats (no power creep); the top tier carries a signature for prestige. =====
    // -- Low end (250–800 gold) --
    { id: "gs_bronze_buckler", name: "Bronze Buckler", slot: "off_hand", rarity: "common", icon: "GiRoundShield", flavor: "A first line of defense.", stats: { ferocity: 8, might: 3 }, reqLevel: 4, source: "xp_shop", xpCost: 250, sort: 600 },
    { id: "gs_swift_ring", name: "Swift Ring", slot: "ring", rarity: "common", icon: "GiSwirlRing", flavor: "A quick little band.", stats: { crit_chance: 6, might: 5 }, reqLevel: 5, source: "xp_shop", xpCost: 350, sort: 601 },
    { id: "gs_traveler_cloak", name: "Traveler's Cloak", slot: "chest", rarity: "common", icon: "GiCape", flavor: "Road-worn and warm.", stats: { ferocity: 6, crit_chance: 5 }, reqLevel: 5, source: "xp_shop", xpCost: 400, sort: 602 },
    { id: "gs_apprentice_wand", name: "Apprentice Wand", slot: "main_hand", rarity: "rare", icon: "GiCrystalWand", flavor: "Every mage starts here.", stats: { might: 11, crit_chance: 5 }, reqLevel: 8, source: "xp_shop", xpCost: 550, sort: 603 },
    { id: "gs_lucky_coin", name: "Lucky Coin Amulet", slot: "amulet", rarity: "rare", icon: "GiGems", flavor: "Heads, you win.", stats: { fortune: 16 }, reqLevel: 10, source: "xp_shop", xpCost: 800, sort: 604 },
    // -- Medium (1,500–4,000 gold) --
    { id: "gs_battlemage_staff", name: "Battlemage Staff", slot: "main_hand", rarity: "epic", icon: "GiWizardStaff", flavor: "Bonk and blast.", stats: { might: 12, fortune: 10 }, reqLevel: 20, source: "xp_shop", xpCost: 2800, sort: 610 },
    { id: "gs_guardian_shield", name: "Guardian Shield", slot: "off_hand", rarity: "epic", icon: "GiCrossShield", flavor: "Hold fast.", stats: { might: 9, ferocity: 13 }, reqLevel: 22, source: "xp_shop", xpCost: 2400, sort: 611 },
    { id: "gs_valor_crown", name: "Crown of Valor", slot: "helmet", rarity: "epic", icon: "GiCrestedHelmet", flavor: "Lead by example.", stats: { might: 15, crit_chance: 7 }, reqLevel: 24, source: "xp_shop", xpCost: 3000, sort: 612 },
    { id: "gs_battle_plate", name: "Battle Plate", slot: "chest", rarity: "epic", icon: "GiMetalPlate", flavor: "A wall you can wear.", stats: { might: 9, ferocity: 13 }, reqLevel: 26, source: "xp_shop", xpCost: 3200, sort: 613 },
    { id: "gs_fortune_amulet", name: "Fortune's Amulet", slot: "amulet", rarity: "epic", icon: "GiEmeraldNecklace", flavor: "Luck, worn proudly.", stats: { ferocity: 8, fortune: 14 }, reqLevel: 22, source: "xp_shop", xpCost: 2600, sort: 614 },
    { id: "gs_power_band", name: "Power Band", slot: "ring", rarity: "epic", icon: "GiSkullRing", flavor: "Raw force on your finger.", stats: { might: 22 }, reqLevel: 28, source: "xp_shop", xpCost: 3500, sort: 615 },
    // -- High (10,000–18,000 gold) --
    { id: "gs_runeblade", name: "Runeblade", slot: "main_hand", rarity: "legendary", icon: "GiRuneSword", flavor: "Etched to bite deeper.", stats: { might: 16, crit_power: 14 }, reqLevel: 40, source: "xp_shop", xpCost: 12000, sort: 620 },
    { id: "gs_aegis", name: "Aegis of the Pack", slot: "off_hand", rarity: "legendary", icon: "GiCrossShield", flavor: "Nothing gets through.", stats: { might: 9, ferocity: 21 }, reqLevel: 42, source: "xp_shop", xpCost: 11000, sort: 621 },
    { id: "gs_warlord_crown", name: "Warlord's Crown", slot: "helmet", rarity: "legendary", icon: "GiCrown", flavor: "Rule the arena.", stats: { might: 12, fortune: 18 }, reqLevel: 46, source: "xp_shop", xpCost: 14000, sort: 622 },
    { id: "gs_dragonhide", name: "Dragonhide Armor", slot: "chest", rarity: "legendary", icon: "GiSpikedArmor", flavor: "Scaled and unburnt.", stats: { might: 10, ferocity: 20 }, reqLevel: 50, source: "xp_shop", xpCost: 15000, sort: 623 },
    { id: "gs_champion_amulet", name: "Champion's Amulet", slot: "amulet", rarity: "legendary", icon: "GiTribalPendant", flavor: "Proof you showed up.", stats: { might: 13, crit_power: 17 }, reqLevel: 48, source: "xp_shop", xpCost: 13000, sort: 624 },
    { id: "gs_royal_signet", name: "Royal Signet", slot: "ring", rarity: "legendary", icon: "GiBigDiamondRing", flavor: "Worn by rulers.", stats: { might: 14, fortune: 16 }, reqLevel: 50, source: "xp_shop", xpCost: 16000, sort: 625 },
    // -- Super high (60,000–90,000 gold) --
    { id: "gs_worldedge", name: "Worldedge Blade", slot: "main_hand", rarity: "mythic", icon: "GiEnergySword", flavor: "The horizon splits before it.", stats: { might: 24, crit_power: 16 }, reqLevel: 70, source: "xp_shop", xpCost: 80000, sort: 630 },
    { id: "gs_titan_aegis", name: "Titan's Aegis", slot: "off_hand", rarity: "mythic", icon: "GiCrossShield", flavor: "Immovable.", stats: { ferocity: 20, fortune: 20 }, reqLevel: 68, source: "xp_shop", xpCost: 60000, sort: 631 },
    { id: "gs_god_helm", name: "Godforged Helm", slot: "helmet", rarity: "mythic", icon: "GiOverlordHelm", flavor: "Rule with iron.", stats: { crit_chance: 16, crit_power: 24 }, reqLevel: 70, source: "xp_shop", xpCost: 75000, sort: 632 },
    { id: "gs_celestial_plate", name: "Celestial Plate", slot: "chest", rarity: "mythic", icon: "GiLayeredArmor", flavor: "Woven from starlight.", stats: { ferocity: 24, fortune: 16 }, reqLevel: 72, source: "xp_shop", xpCost: 70000, sort: 633 },
    { id: "gs_eternity_amulet", name: "Amulet of Eternity", slot: "amulet", rarity: "mythic", icon: "GiGemNecklace", flavor: "Sees every weakness.", stats: { crit_chance: 16, crit_power: 24 }, reqLevel: 74, source: "xp_shop", xpCost: 85000, sort: 634 },
    // -- Super super high (250,000–600,000 gold) — signature prestige gear --
    { id: "gs_excalibur", name: "Excalibur", slot: "main_hand", rarity: "mythic", icon: "GiEnergySword", flavor: "The sword that names a king.", stats: { might: 24, crit_power: 16 }, reqLevel: 90, source: "xp_shop", xpCost: 250000, sort: 640 },
    { id: "gs_worldbreaker", name: "Worldbreaker", slot: "main_hand", rarity: "mythic", icon: "GiBattleAxe", flavor: "Cleaves the heavens.", stats: { might: 21, crit_chance: 8, crit_power: 11 }, reqLevel: 100, source: "xp_shop", xpCost: 400000, sort: 641 },
    { id: "gs_sovereign_crown", name: "Sovereign Crown", slot: "helmet", rarity: "mythic", icon: "GiQueenCrown", flavor: "The whole pack bows.", stats: { might: 13, fortune: 27 }, reqLevel: 90, source: "xp_shop", xpCost: 300000, sort: 642 },
    { id: "gs_omnipotence_ring", name: "Ring of Omnipotence", slot: "ring", rarity: "mythic", icon: "GiEngagementRing", flavor: "All power, one finger.", stats: { might: 16, crit_chance: 8, fortune: 16 }, reqLevel: 100, source: "xp_shop", xpCost: 600000, sort: 643 },

    // ===== GOLD SHOP GEAR — WAVE 2 (source: "xp_shop") — more to buy across every tier. =====
    // -- Low (400–900 gold) --
    { id: "gs2_short_sword", name: "Short Sword", slot: "main_hand", rarity: "common", icon: "GiBroadsword", flavor: "Reliable steel.", stats: { might: 8, crit_chance: 3 }, reqLevel: 4, source: "xp_shop", xpCost: 400, sort: 700 },
    { id: "gs2_wood_shield", name: "Wooden Shield", slot: "off_hand", rarity: "common", icon: "GiCheckedShield", flavor: "Better than nothing.", stats: { ferocity: 8, fortune: 3 }, reqLevel: 4, source: "xp_shop", xpCost: 450, sort: 701 },
    { id: "gs2_leather_helm", name: "Leather Helm", slot: "helmet", rarity: "common", icon: "GiCrestedHelmet", flavor: "Keeps the rain off.", stats: { ferocity: 6, fortune: 5 }, reqLevel: 4, source: "xp_shop", xpCost: 400, sort: 702 },
    { id: "gs2_cloth_robe", name: "Cloth Robe", slot: "chest", rarity: "common", icon: "GiRobe", flavor: "Light and airy.", stats: { ferocity: 5, fortune: 6 }, reqLevel: 4, source: "xp_shop", xpCost: 450, sort: 703 },
    { id: "gs2_worn_ring", name: "Worn Ring", slot: "ring", rarity: "common", icon: "GiSwirlRing", flavor: "A humble band.", stats: { might: 5, fortune: 6 }, reqLevel: 5, source: "xp_shop", xpCost: 500, sort: 704 },
    { id: "gs2_hunters_charm", name: "Hunter's Charm", slot: "amulet", rarity: "rare", icon: "GiFeatherNecklace", flavor: "Lady luck's favor.", stats: { fortune: 16 }, reqLevel: 10, source: "xp_shop", xpCost: 900, sort: 705 },
    // -- Medium (2,400–3,600 gold) --
    { id: "gs2_flame_sword", name: "Flame Sword", slot: "main_hand", rarity: "epic", icon: "GiFireSilhouette", flavor: "Burns as it bites.", stats: { might: 22 }, reqLevel: 20, source: "xp_shop", xpCost: 2600, sort: 710 },
    { id: "gs2_ward_orb", name: "Ward Orb", slot: "off_hand", rarity: "epic", icon: "GiCrystalBall", flavor: "A steady shield of magic.", stats: { ferocity: 8, fortune: 14 }, reqLevel: 22, source: "xp_shop", xpCost: 2400, sort: 711 },
    { id: "gs2_knight_helm", name: "Knight's Helm", slot: "helmet", rarity: "epic", icon: "GiBlackKnightHelm", flavor: "Built for the front line.", stats: { might: 15, crit_chance: 7 }, reqLevel: 24, source: "xp_shop", xpCost: 3000, sort: 712 },
    { id: "gs2_scale_cuirass", name: "Scale Cuirass", slot: "chest", rarity: "epic", icon: "GiScaleMail", flavor: "Layered like a dragon.", stats: { might: 9, ferocity: 13 }, reqLevel: 26, source: "xp_shop", xpCost: 3200, sort: 713 },
    { id: "gs2_war_belt", name: "War Belt", slot: "belt", rarity: "epic", icon: "GiBeltArmor", flavor: "Cinch it for battle.", stats: { might: 11, crit_chance: 11 }, reqLevel: 28, source: "xp_shop", xpCost: 2800, sort: 714 },
    { id: "gs2_swift_greaves", name: "Swift Greaves", slot: "boots", rarity: "epic", icon: "GiGreaves", flavor: "Blink and miss them.", stats: { crit_chance: 4, ferocity: 18 }, reqLevel: 26, source: "xp_shop", xpCost: 2600, sort: 715 },
    { id: "gs2_gem_amulet", name: "Gemmed Amulet", slot: "amulet", rarity: "epic", icon: "GiGemPendant", flavor: "Anger, focused.", stats: { crit_chance: 11, crit_power: 11 }, reqLevel: 28, source: "xp_shop", xpCost: 3400, sort: 716 },
    { id: "gs2_might_ring", name: "Ring of Might", slot: "ring", rarity: "epic", icon: "GiPowerRing", flavor: "Raw force.", stats: { might: 22 }, reqLevel: 28, source: "xp_shop", xpCost: 3600, sort: 717 },
    // -- High (11,000–16,000 gold) --
    { id: "gs2_rune_greatsword", name: "Rune Greatsword", slot: "main_hand", rarity: "legendary", icon: "GiRuneSword", flavor: "Etched to bite deeper.", stats: { might: 16, crit_power: 14 }, reqLevel: 40, source: "xp_shop", xpCost: 12000, sort: 720 },
    { id: "gs2_dragon_ward", name: "Dragon Ward", slot: "off_hand", rarity: "legendary", icon: "GiDragonShield", flavor: "Scaled defense.", stats: { might: 9, ferocity: 21 }, reqLevel: 42, source: "xp_shop", xpCost: 11000, sort: 721 },
    { id: "gs2_horned_crown", name: "Horned Crown", slot: "helmet", rarity: "legendary", icon: "GiHornedHelm", flavor: "Intimidation, mostly.", stats: { crit_chance: 12, crit_power: 18 }, reqLevel: 46, source: "xp_shop", xpCost: 14000, sort: 722 },
    { id: "gs2_plate_of_kings", name: "Plate of Kings", slot: "chest", rarity: "legendary", icon: "GiLayeredArmor", flavor: "Immovable.", stats: { might: 10, ferocity: 20 }, reqLevel: 50, source: "xp_shop", xpCost: 15000, sort: 723 },
    { id: "gs2_titan_belt", name: "Titan Belt", slot: "belt", rarity: "legendary", icon: "GiBlackBelt", flavor: "Strength of ten.", stats: { ferocity: 30 }, reqLevel: 48, source: "xp_shop", xpCost: 13000, sort: 724 },
    { id: "gs2_swift_striders", name: "Swift Striders", slot: "boots", rarity: "legendary", icon: "GiMetalBoot", flavor: "Thunder in every step.", stats: { might: 12, ferocity: 18 }, reqLevel: 50, source: "xp_shop", xpCost: 13500, sort: 725 },
    { id: "gs2_heart_amulet", name: "Heart Amulet", slot: "amulet", rarity: "legendary", icon: "GiHeartNecklace", flavor: "The pack beats within.", stats: { might: 13, crit_power: 17 }, reqLevel: 48, source: "xp_shop", xpCost: 14000, sort: 726 },
    { id: "gs2_kings_band", name: "King's Band", slot: "ring", rarity: "legendary", icon: "GiBigDiamondRing", flavor: "Worn by rulers.", stats: { might: 14, fortune: 16 }, reqLevel: 50, source: "xp_shop", xpCost: 16000, sort: 727 },
    // -- Super (60,000–85,000 gold) --
    { id: "gs2_energy_blade", name: "Energy Blade", slot: "main_hand", rarity: "mythic", icon: "GiEnergySword", flavor: "Crackling with power.", stats: { might: 24, crit_power: 16 }, reqLevel: 70, source: "xp_shop", xpCost: 80000, sort: 730 },
    { id: "gs2_void_ward", name: "Void Ward", slot: "off_hand", rarity: "mythic", icon: "GiVortex", flavor: "It devours all it touches.", stats: { ferocity: 20, fortune: 20 }, reqLevel: 68, source: "xp_shop", xpCost: 60000, sort: 731 },
    { id: "gs2_crown_supreme", name: "Crown Supreme", slot: "helmet", rarity: "mythic", icon: "GiCrenelCrown", flavor: "Blessed by the old ones.", stats: { crit_chance: 16, crit_power: 24 }, reqLevel: 70, source: "xp_shop", xpCost: 75000, sort: 732 },
    { id: "gs2_star_plate", name: "Star Plate", slot: "chest", rarity: "mythic", icon: "GiLayeredArmor", flavor: "Hammered from a fallen star.", stats: { ferocity: 24, fortune: 16 }, reqLevel: 72, source: "xp_shop", xpCost: 70000, sort: 733 },
    { id: "gs2_cosmic_amulet", name: "Cosmic Amulet", slot: "amulet", rarity: "mythic", icon: "GiGalaxy", flavor: "A universe on a string.", stats: { crit_chance: 16, crit_power: 24 }, reqLevel: 74, source: "xp_shop", xpCost: 85000, sort: 734 },
    // -- Super super (280,000–700,000 gold) — signature prestige --
    { id: "gs2_dragon_god", name: "Blade of the Dragon God", slot: "main_hand", rarity: "mythic", icon: "GiWingedSword", flavor: "Forged in a wyrm's heart.", stats: { might: 24, crit_power: 16 }, reqLevel: 90, source: "xp_shop", xpCost: 280000, sort: 740 },
    { id: "gs2_apex_crown", name: "Apex Crown", slot: "helmet", rarity: "mythic", icon: "GiQueenCrown", flavor: "Wear your status.", stats: { might: 13, fortune: 27 }, reqLevel: 95, source: "xp_shop", xpCost: 350000, sort: 741 },
    { id: "gs2_infinity_ring", name: "Ring of Infinity", slot: "ring", rarity: "mythic", icon: "GiEngagementRing", flavor: "No end, no limit.", stats: { might: 16, crit_chance: 8, fortune: 16 }, reqLevel: 100, source: "xp_shop", xpCost: 700000, sort: 742 },

    // ===== BACK slot (capes, cloaks, mantles, wings) — earned the same ways as the rest of the wardrobe:
    // level unlocks, loot-chest & boss drops, and the gold shop. Several carry signatures or a lopsided
    // "identity" stat line so they play differently, not just bigger. =====
    // -- Level unlocks --
    { id: "wanderers_cloak", name: "Wanderer's Cloak", slot: "back", rarity: "common", icon: "GiCape", flavor: "Patched for the long road — and long seasons.", stats: { fortune: 10 }, farm: { growSpeed: 4 }, reqLevel: 3, source: "level", sort: 800 },
    { id: "scouts_mantle", name: "Scout's Mantle", slot: "back", rarity: "common", icon: "GiCowled", flavor: "Knows where the good soil is.", stats: { crit_chance: 6, ferocity: 4 }, farm: { seedLuck: 5 }, reqLevel: 6, source: "level", sort: 801 },
    { id: "hunters_cloak", name: "Hunter's Cloak", slot: "back", rarity: "rare", icon: "GiFeatheredWing", flavor: "Silent on the approach.", stats: { crit_chance: 8, ferocity: 8 }, reqLevel: 14, source: "level", sort: 802 },
    { id: "guardian_mantle", name: "Guardian's Mantle", slot: "back", rarity: "rare", icon: "GiShoulderArmor", flavor: "Shoulders that carry the pack.", stats: { might: 10, fortune: 6 }, reqLevel: 18, source: "level", sort: 803 },
    // -- Loot-chest & boss drops --
    { id: "raven_cloak", name: "Raven Cloak", slot: "back", rarity: "rare", icon: "GiRaven", flavor: "Feathered in shadow.", stats: { ferocity: 10, crit_chance: 6 }, reqLevel: 16, source: "chest", sort: 810 },
    { id: "warbanner_cape", name: "Warbanner Cape", slot: "back", rarity: "epic", icon: "GiCapeArmor", flavor: "Rally to it.", stats: { might: 22 }, reqLevel: 24, source: "boss_drop", sort: 811 },
    { id: "shadow_shroud", name: "Shadow Shroud", slot: "back", rarity: "epic", icon: "GiHood", flavor: "The dark moves with you.", stats: { crit_chance: 8, crit_power: 14 }, reqLevel: 26, source: "chest", sort: 812 },
    { id: "berserkers_hide", name: "Berserker's Hide", slot: "back", rarity: "epic", icon: "GiRaggedWound", flavor: "All fury, no finesse.", stats: { might: 22 }, reqLevel: 28, source: "chest", sort: 813 },
    { id: "phoenix_mantle", name: "Phoenix Mantle", slot: "back", rarity: "legendary", icon: "GiFluffyWing", flavor: "Ash today, fire tomorrow.", stats: { ferocity: 18, might: 12 }, reqLevel: 44, source: "boss_drop", sort: 814 },
    { id: "wings_of_dawn", name: "Wings of Dawn", slot: "back", rarity: "legendary", icon: "GiAngelWings", flavor: "First light, given form.", stats: { fortune: 15, crit_chance: 15 }, reqLevel: 48, source: "chest", sort: 815 },
    { id: "oblivion_wings", name: "Wings of Oblivion", slot: "back", rarity: "mythic", icon: "GiBatwingEmblem", flavor: "They blot out the sun.", stats: { ferocity: 25, crit_power: 15 }, reqLevel: 92, source: "chest", sort: 816 },
    // -- Gold shop --
    { id: "merchants_cape", name: "Merchant's Cape", slot: "back", rarity: "rare", icon: "GiWingCloak", flavor: "Lined with lucky coin.", stats: { fortune: 16 }, sea: { tailwind: 4 }, reqLevel: 10, source: "xp_shop", xpCost: 1400, sort: 820 },
    { id: "gilded_mantle", name: "Gilded Mantle", slot: "back", rarity: "epic", icon: "GiCondorEmblem", flavor: "Wealth worn well.", stats: { might: 12, fortune: 10 }, reqLevel: 26, source: "xp_shop", xpCost: 3200, sort: 821 },
    { id: "celestial_cloak", name: "Celestial Cloak", slot: "back", rarity: "legendary", icon: "GiCurlyWing", flavor: "Cut from the night sky.", stats: { crit_chance: 12, crit_power: 18 }, reqLevel: 46, source: "xp_shop", xpCost: 14000, sort: 822 },
    { id: "void_shroud", name: "Void Shroud", slot: "back", rarity: "mythic", icon: "GiFalconMoon", flavor: "It drinks the light.", stats: { ferocity: 20, fortune: 20 }, reqLevel: 90, source: "xp_shop", xpCost: 90000, sort: 823 },

    // ===== ELITE TIERS (source: "elite") — the two rarities ABOVE mythic. Extremely harsh to earn (only
    // from Ascendant/Eternal loot chests, awarded for elite boss performance or by the owner). Each is a
    // top-end stat block AND a signature AND a charged REAL-WORLD reward with a long cooldown. =====
    // -- Ascendant --
    { id: "ascendant_crown", name: "Ascendant Crown", slot: "helmet", rarity: "ascendant", icon: "GiCrenelCrown", flavor: "Worn by those who rose past legend.", stats: { might: 20, crit_chance: 15, crit_power: 20 }, reqLevel: 80, source: "elite", charged: true, charges: 2, cooldownDays: 180, chargeReward: "elite_credit_100", chargeRewardLabel: REWARDS.elite_credit_100, sort: 900 },
    { id: "ascendant_blade", name: "Ascendant Blade", slot: "main_hand", rarity: "ascendant", icon: "GiEnergySword", flavor: "It hums with a light that shouldn't exist.", stats: { might: 35, crit_power: 20 }, reqLevel: 82, source: "elite", charged: true, charges: 2, cooldownDays: 180, chargeReward: "free_bundle_30", chargeRewardLabel: REWARDS.free_bundle_30, sort: 901 },
    { id: "ascendant_aegis", name: "Ascendant Aegis", slot: "off_hand", rarity: "ascendant", icon: "GiCheckedShield", flavor: "Nothing has ever broken it.", stats: { ferocity: 35, fortune: 20 }, reqLevel: 84, source: "elite", charged: true, charges: 3, cooldownDays: 120, chargeReward: "free_pack_25", chargeRewardLabel: REWARDS.free_pack_25, sort: 902 },
    // -- Eternal (the pinnacle — 1-year cooldowns) --
    { id: "eternal_wolf_crown", name: "Eternal Wolf Crown", slot: "helmet", rarity: "eternal", icon: "GiWolfHead", flavor: "The Den remembers only a handful who wore it.", stats: { might: 25, crit_chance: 20, crit_power: 30 }, reqLevel: 95, source: "elite", charged: true, charges: 1, cooldownDays: 365, chargeReward: "elite_box_120", chargeRewardLabel: REWARDS.elite_box_120, sort: 910 },
    { id: "eternal_infinity", name: "Band of Eternity", slot: "ring", rarity: "eternal", icon: "GiEngagementRing", flavor: "No beginning. No end. No equal.", stats: { might: 25, crit_chance: 15, crit_power: 25, fortune: 10 }, reqLevel: 100, source: "elite", charged: true, charges: 1, cooldownDays: 365, chargeReward: "elite_grail", chargeRewardLabel: REWARDS.elite_grail, sort: 911 },
    // -- Bounty Board reward (granted for fulfilling 3 community bounties — see bounty-rewards.js) --
    { id: "bounty_hunters_mark", name: "Bounty Hunter's Mark", slot: "amulet", rarity: "legendary", icon: "GiWolfHead", flavor: "Proof you show up for the pack.", stats: { fortune: 15, might: 8 }, reqLevel: 1, source: "bounty_reward", sort: 920 },

    // -- FARM GEAR SETS -- utility pieces with FARM affixes (weak in combat, strong in the garden). Bought with
    // gold in the gear shop. Full-set capstones apply in farm-crops.js. See ITEM_SETS in sets.js.
    // Harvester's Garb — reaping & harvest gold; full set = a chance each harvest yields DOUBLE.
    { id: "harvesters_hat", name: "Harvester's Sun Hat", slot: "helmet", rarity: "rare", icon: "GiFarmer", flavor: "Wide brim, wider yield — the sun works for you now.", stats: { fortune: 6, ferocity: 4 }, farm: { growSpeed: 4 }, reqLevel: 8, source: "xp_shop", xpCost: 700, sort: 930 },
    { id: "reapers_girdle", name: "Reaper's Girdle", slot: "belt", rarity: "rare", icon: "GiRolledCloth", flavor: "A sheaf-binder's belt, hung with twine and a whetstone.", stats: { fortune: 5, might: 5 }, farm: { goldHarvest: 6 }, reqLevel: 8, source: "xp_shop", xpCost: 800, sort: 931 },
    { id: "sheafbound_cloak", name: "Sheafbound Cloak", slot: "back", rarity: "epic", icon: "GiCape", flavor: "Woven from the last golden stalks of autumn.", stats: { fortune: 8, crit_chance: 4 }, farm: { harvestLuck: 5 }, reqLevel: 14, source: "xp_shop", xpCost: 2200, sort: 932 },
    { id: "amber_grain_pendant", name: "Amber Grain Pendant", slot: "amulet", rarity: "epic", icon: "GiAmberMosquito", flavor: "A single wheat-berry, sealed in honey-gold amber.", stats: { fortune: 9, ferocity: 3 }, farm: { goldHarvest: 7 }, reqLevel: 14, source: "xp_shop", xpCost: 2400, sort: 933 },
    // Forager's Kit — finding & nurturing seeds; full set = crops grow 15% faster.
    { id: "foragers_basket", name: "Forager's Basket", slot: "off_hand", rarity: "rare", icon: "GiBasket", flavor: "Never comes home empty — there's always one more seed.", stats: { ferocity: 6, fortune: 4 }, farm: { seedLuck: 5 }, reqLevel: 8, source: "xp_shop", xpCost: 750, sort: 934 },
    { id: "clover_signet", name: "Clover Signet", slot: "ring", rarity: "rare", icon: "GiClover", flavor: "A pressed four-leaf clover set under glass.", stats: { fortune: 7, crit_chance: 3 }, farm: { seedLuck: 5 }, reqLevel: 8, source: "xp_shop", xpCost: 850, sort: 935 },
    { id: "deep_seed_pouch", name: "Deep Seed Pouch", slot: "belt", rarity: "epic", icon: "GiSwapBag", flavor: "Bottomless — the good soil's secrets travel with you.", stats: { fortune: 6, might: 4 }, farm: { growSpeed: 5 }, reqLevel: 14, source: "xp_shop", xpCost: 2100, sort: 936 },
    { id: "foxglove_charm", name: "Foxglove Charm", slot: "amulet", rarity: "epic", icon: "GiThreeLeaves", flavor: "Wildflower magic, carried close to the heart.", stats: { fortune: 8, crit_chance: 3 }, farm: { harvestLuck: 5 }, reqLevel: 14, source: "xp_shop", xpCost: 2300, sort: 937 },

    // ===== BLACKSMITH'S REGALIA (source: "forge") — the "salvaging set". Pieces drop rarely from salvaging at
    // the Forge (owner-only); wearing 3/5 boosts your salvage output. Not sold, not level-granted.
    { id: "regalia_visor", name: "Smith's Visor", slot: "helmet", rarity: "epic", icon: "GiVisoredHelm", flavor: "Soot-blackened, its slit glows with hearthlight.", stats: { crit_chance: 8, ferocity: 10 }, forgeSet: true, source: "forge", sort: 950 },
    { id: "regalia_plate", name: "Forgeplate", slot: "chest", rarity: "epic", icon: "GiBreastplate", flavor: "Hammered from a hundred salvaged blades.", stats: { might: 8, ferocity: 14 }, forgeSet: true, source: "forge", sort: 951 },
    { id: "regalia_girdle", name: "Ember Girdle", slot: "belt", rarity: "epic", icon: "GiBelt", flavor: "Warm to the touch, always.", stats: { might: 10, fortune: 8 }, forgeSet: true, source: "forge", sort: 952 },
    { id: "regalia_boots", name: "Cinderstride Boots", slot: "boots", rarity: "epic", icon: "GiLeatherBoot", flavor: "Leave faintly glowing footprints on cold stone.", stats: { ferocity: 18 }, forgeSet: true, source: "forge", sort: 953 },
    { id: "regalia_cloak", name: "Bellows Cloak", slot: "back", rarity: "epic", icon: "GiCape", flavor: "Billows like a forge fire catching air.", stats: { fortune: 12, crit_power: 8 }, forgeSet: true, source: "forge", sort: 954 },

    // ── Wheel-exclusive gear — only from the Prize Wheel's match-3 BONUS GAME (source "wheel_bonus"). RARE
    // (blue) on purpose — a fun pull, not the strong purple/epic gear we don't normally hand out. AI sprites in
    // mkt_item_sprite (mig250/251). Not in any other drop table. ──
    { id: "wg_helm", name: "Dire Wolf Helm", slot: "helmet", rarity: "rare", icon: "GiWolfHead", flavor: "Won from the wheel — the pack marches with you.", stats: { might: 6, crit_chance: 5 }, reqLevel: 5, source: "wheel_bonus", sort: 970 },
    { id: "wg_blade", name: "Fanged Saber", slot: "main_hand", rarity: "rare", icon: "GiSaber", flavor: "A lucky pull with a keen edge.", stats: { might: 12, crit_power: 5 }, reqLevel: 5, source: "wheel_bonus", sort: 971 },
    { id: "wg_shield", name: "Wolfcrest Aegis", slot: "off_hand", rarity: "rare", icon: "GiShield", flavor: "Fortune favors the guarded.", stats: { ferocity: 9, might: 5 }, reqLevel: 5, source: "wheel_bonus", sort: 972 },
    { id: "wg_cloak", name: "Nightprowler Cloak", slot: "back", rarity: "rare", icon: "GiCape", flavor: "Slips through the dark like a rumor.", stats: { might: 6, fortune: 5 }, reqLevel: 5, source: "wheel_bonus", sort: 973 },
    { id: "wg_amulet", name: "Wolf-Fang Amulet", slot: "amulet", rarity: "rare", icon: "GiFangs", flavor: "Still warm from the wheel's glow.", stats: { crit_power: 9, fortune: 5 }, reqLevel: 5, source: "wheel_bonus", sort: 974 },
    { id: "wg_ring", name: "Ironclaw Band", slot: "ring", rarity: "rare", icon: "GiClaws", flavor: "A clawed circlet, wheel-forged.", stats: { might: 6, crit_chance: 4 }, reqLevel: 5, source: "wheel_bonus", sort: 975 },
    { id: "wg_chest", name: "Wolfhide Cuirass", slot: "chest", rarity: "rare", icon: "GiChestArmor", flavor: "Supple hide, steel where it counts.", stats: { ferocity: 11, might: 5 }, reqLevel: 5, source: "wheel_bonus", sort: 976 },
    { id: "wg_belt", name: "Fangbite Belt", slot: "belt", rarity: "rare", icon: "GiBelt", flavor: "Buckled with a snarling wolf.", stats: { might: 7, fortune: 5 }, reqLevel: 5, source: "wheel_bonus", sort: 977 },
    { id: "wg_boots", name: "Prowler Boots", slot: "boots", rarity: "rare", icon: "GiLeatherBoot", flavor: "Quiet on any trail.", stats: { ferocity: 11 }, reqLevel: 5, source: "wheel_bonus", sort: 978 },
    { id: "wg_axe", name: "Moonhowl Axe", slot: "main_hand", rarity: "rare", icon: "GiBattleAxe", flavor: "It hums under a full moon.", stats: { might: 13, crit_chance: 4 }, reqLevel: 5, source: "wheel_bonus", sort: 979 },
];

// ── De-clone stat blocks ──────────────────────────────────────────────────────────────────────────────────
// The flat per-rarity stat budgets left dozens of items with byte-identical stat blocks (e.g. nine different
// epics all "might 22"). This one-time pass makes every same-rarity stat block UNIQUE by deterministically
// shuffling 1–3 points among an item's stats — NO new perks, and each item's TOTAL point budget is preserved,
// so power and boss-HP sizing are unchanged (it's purely cosmetic redistribution). Keyed by cluster index so
// it's stable across loads. Signature/farm/sea affixes are untouched — only the `stats` block is nudged.
const DEDUP_STAT_KEYS = ["might", "ferocity", "crit_chance", "crit_power", "fortune"];
const statSig = (stats = {}) => DEDUP_STAT_KEYS.map((k) => `${k}:${stats[k] || 0}`).join("|");
(function dedupeStatBlocks() {
    // Global per RARITY: the first item to claim a stat block keeps it; any later item with a colliding block
    // (same cluster OR a block another item already nudged into) gets shuffled to the nearest FREE block, so
    // no two same-rarity items are ever identical. Each candidate move is point-neutral (primary → secondary).
    const byRarity = new Map();
    for (const it of ITEMS) {
        if (!it.stats || !Object.keys(it.stats).length) continue; // skip stat-less charms (farm/sea/charged only)
        if (!byRarity.has(it.rarity)) byRarity.set(it.rarity, []);
        byRarity.get(it.rarity).push(it);
    }
    for (const list of byRarity.values()) {
        list.sort((a, b) => (a.id < b.id ? -1 : 1)); // deterministic order → stable across loads
        const used = new Set();
        for (const it of list) {
            const base = { ...it.stats };
            const keys = Object.keys(base);
            const primary = keys.reduce((a, b) => (base[b] > base[a] ? b : a), keys[0]); // biggest stat
            const pIdx = DEDUP_STAT_KEYS.indexOf(primary);
            let chosen = base;
            if (used.has(statSig(base)) && pIdx >= 0) {
                for (let t = 1; t <= 24; t++) {
                    const secOffset = ((t - 1) % (DEDUP_STAT_KEYS.length - 1)) + 1;
                    const sec = DEDUP_STAT_KEYS[(pIdx + secOffset) % DEDUP_STAT_KEYS.length];
                    const move = Math.min(1 + Math.floor((t - 1) / (DEDUP_STAT_KEYS.length - 1)), (base[primary] || 0) - 1);
                    if (move <= 0 || sec === primary) continue;
                    const cand = { ...base, [primary]: base[primary] - move, [sec]: (base[sec] || 0) + move };
                    if (!used.has(statSig(cand))) { chosen = cand; break; }
                }
            }
            it.stats = chosen;
            used.add(statSig(chosen));
        }
    }
})();

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
    return Object.entries(stats || {})
        .map(([k, v]) => {
            const m = STAT_META[k];
            return m ? `+${v}${m.suffix} ${m.label}` : `+${v} ${k}`;
        })
        .join(" · ");
}

// ── SEA AFFINITY ── a separate effect layer that ONLY the Sailing systems read (raids/digging/voyages) — kept
// OUT of `stats` so it never touches boss combat or inflates boss power. Gear + pets carry these small integer
// "points"; sailing.js converts points → real effect. See seaEffects() there.
export const SEA_META = {
    broadside: { label: "Broadside", icon: "🗡️", desc: "Your ship's cannons hit harder in a raid." },
    ironclad: { label: "Ironclad", icon: "🛡️", desc: "Your hull takes less damage from enemy volleys in a raid." },
    plunder: { label: "Plunder", icon: "⚓", desc: "Better odds to copy a foe's item when you win a raid." },
    bounty: { label: "Bounty", icon: "💰", desc: "More gold from raid wins and the Gold Merchant." },
    dredge: { label: "Dredge", icon: "⛏️", desc: "Higher chance your dig tools proc while excavating." },
    trove: { label: "Trove", icon: "🔱", desc: "Dig up more treasure fragments per excavation." },
    tailwind: { label: "Tailwind", icon: "🌬️", desc: "Faster voyages, and more sailors to greet each day." },
    angling: { label: "Angling", icon: "🎣", desc: "More casts a day, and rarer fish on the line." },
};
export function sumItemSea(itemIds = []) {
    const total = {};
    for (const id of itemIds) {
        const it = itemById(id);
        if (!it?.sea) continue;
        for (const [k, v] of Object.entries(it.sea)) total[k] = (total[k] || 0) + (Number(v) || 0);
    }
    return total;
}
export function describeSea(sea = {}) {
    return Object.entries(sea).filter(([, v]) => v)
        .map(([k, v]) => { const m = SEA_META[k]; return m ? `${m.icon} +${v} ${m.label}` : `+${v} ${k}`; })
        .join(" · ");
}

// ── FARM AFFIX ── a SECOND quarantined effect layer (mirrors sea affinity): kept OUT of `stats`, so
// sumItemStats/combat never see it. Utility gear that is weak in the boss fight carries a small FARM bonus
// instead, making it desirable to farmers. Read only by the farm-bonus aggregator (farm-bonus.js). Keys are
// the farm stats from decorations.js DECO_STATS { growSpeed, seedLuck, harvestLuck, petXp, fertPower, goldHarvest }.
export function sumItemFarm(itemIds = []) {
    const total = {};
    for (const id of itemIds) {
        const it = itemById(id);
        if (!it?.farm) continue;
        for (const [k, v] of Object.entries(it.farm)) total[k] = (total[k] || 0) + (Number(v) || 0);
    }
    return total;
}
export function describeFarm(farm = {}) {
    return Object.entries(farm).filter(([, v]) => v)
        .map(([k, v]) => { const m = DECO_STATS[k]; return m ? `${m.icon} +${v} ${m.label}` : `+${v} ${k}`; })
        .join(" · ");
}
