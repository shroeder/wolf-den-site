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
    GiSextant, GiSpearHook, GiRingingBell, GiScrollUnfurled, GiPowderBag, GiPirateFlag,
} from "react-icons/gi";
import { DECO_STATS } from "@/lib/marketplace/decorations.js";
import { textIcon } from "@/lib/coin-icon.js";
import { FORTUNE_DESC } from "@/lib/marketplace/fortune.js";

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
//
// That is the top FOUR rarities of the nine, and has been since celestial and primordial were reserved here:
// ascendant, eternal, celestial, primordial. Checked 2026-08-11 against a belief that it was only the top two.
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

/**
 * A feature's OWN unlaunched gear, for that feature's own reward code — and nothing else.
 *
 * The ownerOnly flag keeps unlaunched content out of every public drop pool, which is right. But it also meant
 * the Mine could not drop the three Depths sets that exist FOR the mine: twelve pieces with art, affinity and
 * set bonuses that literally nothing in the game could ever grant, to anyone, including the owner who can
 * actually play the feature.
 *
 * This is the narrow escape hatch. Callers must have already checked their own unlock gate (mining.js checks
 * MINING_UNLOCKED before it ever gets here), and it only ever returns items whose `source` is that feature —
 * so it can never widen into "ownerOnly items leak into chests".
 */
export const featurePool = (source, predicate) =>
    ITEMS.filter((i) => !isRealMoneyItem(i) && i.source === source && (typeof predicate === "function" ? predicate(i) : true));
export const isTradeLocked = (rarity) => TRADE_LOCKED_RARITIES.has(rarity);

// Stat keys → how they read + how they apply in combat. Percent stats are additive % bonuses.
// Each stat carries a plain-English `desc` (what it does for a player, no jargon) + an icon, so the gear
// screen can teach what every stat means instead of just showing a number.
export const STAT_META = {
    // ── WHAT THE PIECE ITSELF IS ─────────────────────────────────────────────────────────────────────────
    // These three are not affixes — they are the item. A weapon's damage and speed and a piece of armour's
    // armour rating are what the thing IS before a single stat is rolled on it, and they were missing from
    // this table entirely, which meant nothing anywhere in the game printed them.
    base_damage: { label: "Damage", icon: "⚔️", desc: "The weapon's own damage. Might multiplies it — this is the number every swing starts from.", suffix: "" },
    // ⚠️ The second clause here promised the BAR REFUND — "anything above bare-handed also buys a chance your
    // swing only half-empties the bar" — which was removed with the rest of the go-again branch. Left behind,
    // it sold a weapon on a mechanic that no longer exists. See the tombstone in arena-kit.js.
    speed: { label: "Attack Speed", icon: "⏱️", desc: "How fast your turn bar fills, before Ferocity is added to it.", suffix: "/s" },
    armor: { label: "Armour", icon: "🛡️", desc: "Comes off every blow, flat, before anything else. Tenacity multiplies it.", suffix: "" },
    block_chance: { label: "Block Chance", icon: "🛡️", desc: "How often this shield blocks — a block takes 35% off the blow.", suffix: "%" },

    // ── THE FOUR YOU BUILD ───────────────────────────────────────────────────────────────────────────────
    might: { label: "Might", icon: "⚔️", desc: "Multiplies your weapon's damage. The whole of what you hit for.", suffix: "" },
    vitality: { label: "Vitality", icon: "❤️", desc: "How much punishment you can take. Your health in the Arena.", suffix: "" },
    // ⚠️ WRONG TWICE, IN OPPOSITE DIRECTIONS, AND THIS IS THE THIRD WORDING.
    // It said "Chance to take another turn immediately. 1% for every 5 points" — both halves false once the
    // timer landed. The correction read the wrong divisor: it took the rate off speedOf's /500, which fed the
    // go-again chance rather than the bar, and wrote "1% quicker for every 100 points". The bar has always
    // run on tempoOf's /100, where a point is 0.01 of tempo and a bare-handed bar starts at 1.0 — so one
    // point is about 1% and the card was UNDERSTATING Ferocity by a hundred times.
    //
    // AND THE "hit more accurately" HALF WAS ALSO STALE. Accuracy is deleted — every swing lands (see the
    // note in kitFor). Ferocity buys the bar and nothing else.
    //
    // Stated against the bare-handed bar because that is the only fixed reference: fill time is
    // BASE_FILL_MS / tempo, so what a point is worth shrinks both as your tempo grows AND as your Ferocity
    // does, now that it runs on the same 0.75 curve as Might and Armour.
    ferocity: { label: "Ferocity", icon: "🔥", desc: "Your turn bar fills faster. 200 points doubles a bare-handed bar, and each point past that is worth a little less.", suffix: "" },
    tenacity: { label: "Tenacity", icon: "🛡️", desc: "Multiplies the armour you are wearing. 500 tenacity doubles it.", suffix: "" },

    // ── THE CRITS ────────────────────────────────────────────────────────────────────────────────────────
    crit_chance: { label: "Crit Chance", icon: "🎯", desc: "How often you land a critical. Past 100% every swing crits and the surplus doubles it.", suffix: "" },
    crit_power: { label: "Crit Power", icon: "💥", desc: "How much extra a critical deals. Each point is +1%.", suffix: "" },

    // ── THE RARE ONES ────────────────────────────────────────────────────────────────────────────────────
    pierce: { label: "Pierce", icon: "🗡️", desc: "Thins their armour. Each point ignores 0.5% of it.", suffix: "" },
    lifesteal: { label: "Lifedrink", icon: "🩸", desc: "A share of the damage you land comes back as health. Each point is 0.25%.", suffix: "" },
    counter: { label: "Riposte", icon: "⚔️", desc: "Chance to strike back the moment their blow lands. Each point is 0.25%.", suffix: "" },
    // The affix KEEPS ITS KEY so every piece already rolled with it keeps its value — it now buys the bar
    // refund instead of a second blow, at the same 0.5% a point. The label had to change with it: an affix
    // that says "lands twice" while granting something else is the kind of lie the info cards were full of.
    stun: { label: "Chance to Stun", icon: "💫", desc: "Chance a blow stops their turn bar dead for a second. Each point is 0.5%.", suffix: "" },
    haste: { label: "Chance to Haste", icon: "🌀", desc: "Chance a swing sends your turn bar to double speed for 6 seconds. Each point is 0.5%.", suffix: "" },

    // ── OUTSIDE THE RING ─────────────────────────────────────────────────────────────────────────────────
    // The one description not written here. Fortune reaches nine screens and its old copy was wrong on every
    // one of them for as long as the stat existed — a card cannot go stale if it has no copy of its own.
    fortune: { label: "Fortune", icon: "🍀", desc: FORTUNE_DESC, suffix: "" },
    extra_strike: { label: "Extra Strike", icon: "⚡", desc: "Gives you extra manual daily strikes on the boss.", suffix: "" },
};

// Charged-perk reward keys → the real-world thing you hand over in-store. Redeemed via the admin app
// (Items & Gear), each use burns a charge and starts the item's cooldown. Keep keys STABLE (redemptions
// are logged by key).
// ── WHERE A PIECE ACTUALLY COMES FROM ────────────────────────────────────────────────────────────────────────
// David B, in the plaza: "anyone else missing a lot of the pendents in the compendium?" He was not missing
// them — he had 22 of 76, and the compendium showed the other 54 as identical blank tiles with nothing on them
// but "Not yet collected". Twenty-three of those pendants are counter items handed over in the shop, eleven are
// elite-tier, thirty come out of chests, and the screen said none of that even though `source` was already on
// every row it drew.
//
// A completion screen that will not say how a thing is obtained turns every gap into the same question, and
// the answer to most of them is "keep opening chests" while the answer to a quarter of them is "you cannot,
// this one is handed to you at the counter".
export const ITEM_SOURCE_LABEL = {
    level: "Earned by reaching its level",
    chest: "Found in chests",
    xp_shop: "Bought in the Armoury with XP",
    boss_drop: "Dropped by the weekly boss",
    elite: "The elite tiers — chests from Ascendant up",
    bounty_reward: "Paid out by a bounty",
    admin: "Handed over the counter in the shop",
};

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
    store_credit_30: "$30 store credit",
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
    store_credit_100: "$100 store credit",
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
    // The Gunner's Commission — glyph fallbacks only; these six are drawn (see scripts/gen-piece-sprites.mjs).
    GiSextant, GiSpearHook, GiRingingBell, GiScrollUnfurled, GiPowderBag, GiPirateFlag,
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
    { id: "ring_of_fortune", name: "Ring of Fortune", slot: "ring", rarity: "rare", icon: "GiRing", flavor: "Luck on your finger.", stats: { fortune: 16 }, sea: { bounty: 3 }, depth: { prospect: 3 }, reqLevel: 20, source: "level", sort: 82 },
    { id: "collectors_signet", name: "Collector's Signet", slot: "ring", rarity: "legendary", icon: "GiSkullSignet", flavor: "The store remembers its own.", stats: { might: 5, fortune: 8 }, reqLevel: 25, source: "admin", sort: 84 },
    { id: "merchants_band", name: "Merchant's Band", slot: "ring", rarity: "epic", icon: "GiDiamondRing", flavor: "A friend of the house.", stats: { fortune: 10 }, reqLevel: 30, source: "admin", sort: 86 },

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
    { id: "cinder_axe", name: "Cinder Axe", slot: "main_hand", rarity: "epic", icon: "GiFireAxe", flavor: "Still warm from the forge.", stats: { might: 22 }, sea: { broadside: 5 }, depth: { hew: 4 }, reqLevel: 34, source: "chest", sort: 203 },
    { id: "storm_katana", name: "Stormedge Katana", slot: "main_hand", rarity: "legendary", icon: "GiKatana", flavor: "Lightning follows the blade.", stats: { might: 16, crit_power: 14 }, sea: { broadside: 6 }, depth: { hew: 5 }, reqLevel: 60, source: "chest", sort: 204 },
    { id: "reapers_scythe", name: "Reaper's Scythe", slot: "main_hand", rarity: "legendary", icon: "GiScythe", flavor: "It only asks once.", stats: { crit_chance: 12, crit_power: 18 }, reqLevel: 66, source: "chest", sort: 205 },
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
    { id: "void_maelstrom", name: "Void Maelstrom", slot: "off_hand", rarity: "mythic", icon: "GiVortex", flavor: "It devours all it touches.", stats: { ferocity: 20, fortune: 20 }, sea: { dredge: 8 }, depth: { prospect: 5 }, reqLevel: 92, source: "chest", sort: 314 },
    // -- Helmet --
    { id: "spartan_helm", name: "Spartan Helm", slot: "helmet", rarity: "common", icon: "GiSpartanHelmet", flavor: "Hold the line.", stats: { ferocity: 7, might: 4 }, reqLevel: 4, source: "chest", sort: 320 },
    { id: "dwarf_helm", name: "Dwarven Helm", slot: "helmet", rarity: "rare", icon: "GiDwarfHelmet", flavor: "Forged deep under the mountain.", stats: { might: 6, ferocity: 10 }, reqLevel: 20, source: "chest", sort: 321 },
    { id: "warbonnet", name: "War Bonnet", slot: "helmet", rarity: "epic", icon: "GiWarBonnet", flavor: "Every feather, a victory.", stats: { might: 9, fortune: 13 }, reqLevel: 36, source: "chest", sort: 322 },
    { id: "shadow_cowl", name: "Shadow Cowl", slot: "helmet", rarity: "legendary", icon: "GiCowled", flavor: "They never see you coming.", stats: { crit_chance: 12, crit_power: 18 }, reqLevel: 64, source: "chest", sort: 323 },
    { id: "oracle_diadem", name: "Oracle's Diadem", slot: "helmet", rarity: "mythic", icon: "GiCrenelCrown", flavor: "It knows where you'll strike.", stats: { crit_chance: 20, crit_power: 20 }, reqLevel: 94, source: "chest", sort: 324 },
    // -- Chest --
    { id: "studded_vest", name: "Studded Vest", slot: "chest", rarity: "common", icon: "GiArmorVest", flavor: "Riveted and ready.", stats: { ferocity: 8, crit_chance: 3 }, reqLevel: 4, source: "chest", sort: 330 },
    // A CAPE ON THE CHEST SLOT, like the Dragoncape was. Neither of these is in a set so nothing was made
    // unreachable, but "War Cape" competing with breastplates is still the catalog contradicting itself.
    { id: "war_cape", name: "War Cape", slot: "back", rarity: "rare", icon: "GiCape", flavor: "Flair with function.", stats: { ferocity: 9, fortune: 7 }, reqLevel: 22, source: "chest", sort: 331 },
    { id: "pauldron_plate", name: "Pauldron Plate", slot: "chest", rarity: "epic", icon: "GiSpikedShoulderArmor", flavor: "Shoulders like a fortress.", stats: { might: 9, ferocity: 13 }, reqLevel: 38, source: "chest", sort: 332 },
    // SLOT WAS "chest" AND IT BROKE ITS OWN SET. Dragonlord's Aspect is five pieces, and with the cape on chest
    // it held TWO chest pieces — so at most four could ever be worn and the five-piece capstone was unreachable
    // by anybody, forever. (ValkyrieSylve, in global chat: "it has 2 chest pieces of the 5 pieces. How are we
    // able to equip all 5?") It is a cape, its stats are a byte-for-byte clone of dragonplate's, and every other
    // cape, cloak and mantle in the catalog is `back` — it was cloned off the plate and the slot never changed.
    { id: "dragoncape", name: "Dragoncape", slot: "back", rarity: "legendary", icon: "GiCapeArmor", flavor: "Scaled and unburnt.", stats: { might: 10, ferocity: 20 }, reqLevel: 60, source: "chest", sort: 333 },
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
    { id: "coppers_token", name: "Copper Patron Token", slot: "amulet", rarity: "common", icon: "GiCharm", flavor: "Good for a cold one.", stats: { fortune: 6, ferocity: 3 }, reqLevel: 5, source: "admin", earnable: true, sort: 500 },
    { id: "sleeve_charm", name: "Sleeve Charm", slot: "amulet", rarity: "common", icon: "GiGemPendant", flavor: "Protect your cards.", stats: { ferocity: 6, fortune: 3 }, reqLevel: 5, source: "admin", earnable: true, sort: 501 },
    { id: "singles_signet", name: "Singles Signet", slot: "ring", rarity: "rare", icon: "GiSwirlRing", flavor: "One for the collection.", stats: { might: 6, fortune: 6 }, reqLevel: 10, source: "admin", earnable: true, sort: 502 },
    { id: "deckbox_charm", name: "Deckbox Charm", slot: "amulet", rarity: "rare", icon: "GiFeatherNecklace", flavor: "A home for your deck.", stats: { ferocity: 12 }, reqLevel: 12, source: "admin", sort: 503 },
    { id: "event_pass", name: "Friday Night Pass", slot: "amulet", rarity: "rare", icon: "GiPrayerBeads", flavor: "See you at the table.", stats: { fortune: 12 }, reqLevel: 12, source: "admin", earnable: true, sort: 504 },
    { id: "patrons_band", name: "Patron's Band", slot: "ring", rarity: "epic", icon: "GiPowerRing", flavor: "A friend of the house.", stats: { might: 6, fortune: 8 }, reqLevel: 15, source: "admin", sort: 505 },
    { id: "bargainers_signet", name: "Bargainer's Signet", slot: "ring", rarity: "epic", icon: "GiDiamondRing", flavor: "Every little bit helps.", stats: { fortune: 14 }, reqLevel: 18, source: "admin", sort: 506 },
    { id: "grabbag_charm", name: "Lucky Grab Charm", slot: "amulet", rarity: "epic", icon: "GiEmeraldNecklace", flavor: "You never know.", stats: { fortune: 14 }, reqLevel: 20, source: "admin", sort: 507 },
    { id: "traders_charm", name: "Trader's Charm", slot: "amulet", rarity: "epic", icon: "GiIntricateNecklace", flavor: "Deal from strength.", stats: { fortune: 14 }, reqLevel: 22, source: "admin", sort: 508 },
    { id: "highroller_ring", name: "High Roller's Ring", slot: "ring", rarity: "legendary", icon: "GiBigDiamondRing", flavor: "Spend big, save big.", stats: { fortune: 16 }, reqLevel: 30, source: "admin", sort: 509 },
    { id: "playmat_medallion", name: "Playmat Medallion", slot: "amulet", rarity: "legendary", icon: "GiTribalPendant", flavor: "Play in style.", stats: { ferocity: 16 }, reqLevel: 30, source: "admin", sort: 510 },
    { id: "premium_signet", name: "Premium Signet", slot: "ring", rarity: "legendary", icon: "GiFireRing", flavor: "For the discerning collector.", stats: { might: 8, fortune: 8 }, reqLevel: 35, source: "admin", sort: 511 },
    { id: "patrons_crown", name: "Patron's Crown", slot: "helmet", rarity: "mythic", icon: "GiQueenCrown", flavor: "The house bows to you.", stats: { might: 8, fortune: 8 }, reqLevel: 40, source: "admin", sort: 512 },
    { id: "founders_ring", name: "Founder's Ring", slot: "ring", rarity: "mythic", icon: "GiEngagementRing", flavor: "First among the pack.", stats: { might: 8, crit_chance: 8 }, reqLevel: 40, source: "admin", sort: 513 },

    // ===== REAL-WORLD PERKS — WAVE 2 (source: "admin", charged, all value-capped). =====
    { id: "snack_token", name: "Snack Token", slot: "amulet", rarity: "common", icon: "GiCharm", flavor: "Fuel for the grind.", stats: { ferocity: 5, might: 4 }, reqLevel: 5, source: "admin", earnable: true, sort: 520 },
    { id: "dice_charm", name: "Dice Charm", slot: "amulet", rarity: "common", icon: "GiGemPendant", flavor: "Roll high.", stats: { fortune: 6, crit_chance: 3 }, reqLevel: 5, source: "admin", earnable: true, sort: 521 },
    { id: "promo_signet", name: "Promo Signet", slot: "ring", rarity: "rare", icon: "GiSkullRing", flavor: "A little something extra.", stats: { might: 6, fortune: 6 }, reqLevel: 10, source: "admin", earnable: true, sort: 522 },
    { id: "starter_pack_charm", name: "Starter Pack Charm", slot: "amulet", rarity: "rare", icon: "GiFeatherNecklace", flavor: "Everyone starts somewhere.", stats: { fortune: 12 }, reqLevel: 10, source: "admin", charged: true, charges: 2, cooldownDays: 30, earnable: true, chargeReward: "store_credit_10", chargeRewardLabel: REWARDS.store_credit_10, sort: 523 },
    { id: "credit5_token", name: "Credit Token", slot: "amulet", rarity: "rare", icon: "GiGems", flavor: "Money in the bank.", stats: { fortune: 12 }, reqLevel: 12, source: "admin", sort: 524 },
    { id: "tournament_pass", name: "Tournament Pass", slot: "amulet", rarity: "epic", icon: "GiPrayerBeads", flavor: "See you in the top cut.", stats: { crit_chance: 14 }, reqLevel: 15, source: "admin", sort: 525 },
    { id: "credit10_signet", name: "Credit Signet", slot: "ring", rarity: "epic", icon: "GiDiamondRing", flavor: "Spend it well.", stats: { fortune: 14 }, reqLevel: 18, source: "admin", sort: 526 },
    { id: "bundle_charm", name: "Bundle Charm", slot: "amulet", rarity: "epic", icon: "GiEmeraldNecklace", flavor: "The whole kit.", stats: { fortune: 14 }, reqLevel: 20, source: "admin", sort: 527 },
    { id: "premium_playmat_medallion", name: "Premium Playmat Medallion", slot: "amulet", rarity: "legendary", icon: "GiIntricateNecklace", flavor: "Play in real style.", stats: { ferocity: 16 }, reqLevel: 30, source: "admin", sort: 528 },
    { id: "credit25_ring", name: "Credit Ring", slot: "ring", rarity: "legendary", icon: "GiFireRing", flavor: "A tidy sum.", stats: { might: 8, fortune: 8 }, reqLevel: 35, source: "admin", sort: 529 },
    { id: "bigspender_crown", name: "Big Spender's Crown", slot: "helmet", rarity: "mythic", icon: "GiCrown", flavor: "Go big.", stats: { might: 8, fortune: 8 }, reqLevel: 40, source: "admin", sort: 530 },

    // ===== REAL-WORLD PERKS — WAVE 3 (source: "admin", charged). Non-monetary prestige perks are earnable. =====
    { id: "toploader_charm", name: "Toploader Charm", slot: "amulet", rarity: "common", icon: "GiCharm", flavor: "Keep 'em mint.", stats: { ferocity: 6, crit_chance: 3 }, reqLevel: 5, source: "admin", earnable: true, sort: 531 },
    { id: "linecutter_token", name: "Line-Cutter Token", slot: "ring", rarity: "common", icon: "GiSwirlRing", flavor: "Straight to the front.", stats: { might: 6, crit_chance: 4 }, reqLevel: 5, source: "admin", charged: true, charges: 3, cooldownDays: 14, earnable: true, chargeReward: "store_credit_5", chargeRewardLabel: REWARDS.store_credit_5, sort: 532 },
    { id: "box_charm", name: "Storage Charm", slot: "amulet", rarity: "common", icon: "GiBeltArmor", flavor: "A home for the collection.", stats: { ferocity: 5, fortune: 4 }, reqLevel: 5, source: "admin", earnable: true, sort: 533 },
    { id: "restock_signet", name: "Restock Signet", slot: "ring", rarity: "rare", icon: "GiSkullSignet", flavor: "First in line for the good stuff.", stats: { might: 6, fortune: 6 }, reqLevel: 10, source: "admin", earnable: true, sort: 534 },
    { id: "reserved_seat_charm", name: "Reserved Seat Charm", slot: "amulet", rarity: "rare", icon: "GiPrayerBeads", flavor: "Your spot's saved.", stats: { fortune: 12 }, reqLevel: 12, source: "admin", earnable: true, sort: 535 },
    { id: "binder_charm", name: "Binder Charm", slot: "amulet", rarity: "rare", icon: "GiGemPendant", flavor: "Show off the collection.", stats: { fortune: 12 }, reqLevel: 12, source: "admin", sort: 536 },
    { id: "premium_sleeve_charm", name: "Premium Sleeve Charm", slot: "amulet", rarity: "rare", icon: "GiIntricateNecklace", flavor: "Protect in style.", stats: { ferocity: 12 }, reqLevel: 12, source: "admin", charged: true, charges: 2, cooldownDays: 30, chargeReward: "store_credit_10", chargeRewardLabel: REWARDS.store_credit_10, sort: 537 },
    { id: "birthday_charm", name: "Birthday Charm", slot: "amulet", rarity: "rare", icon: "GiHeartNecklace", flavor: "Happy birthday from the Den.", stats: { fortune: 12 }, reqLevel: 10, source: "admin", sort: 538 },
    { id: "champions_plaque", name: "Champion's Plaque", slot: "helmet", rarity: "epic", icon: "GiCrown", flavor: "Immortalized on the wall.", stats: { might: 8, fortune: 6 }, reqLevel: 20, source: "admin", earnable: true, sort: 539 },
    { id: "pack15_charm", name: "Big Pack Charm", slot: "amulet", rarity: "epic", icon: "GiEmeraldNecklace", flavor: "Go for the chase.", stats: { crit_chance: 11, crit_power: 11 }, reqLevel: 20, source: "admin", sort: 540 },
    { id: "boxbreak_charm", name: "Box Break Charm", slot: "amulet", rarity: "epic", icon: "GiGems", flavor: "In on the action.", stats: { fortune: 14 }, reqLevel: 22, source: "admin", sort: 541 },
    { id: "grading_charm", name: "Grading Charm", slot: "amulet", rarity: "epic", icon: "GiTribalPendant", flavor: "Slab the gem mints.", stats: { ferocity: 14 }, reqLevel: 22, source: "admin", sort: 542 },
    { id: "credit50_ring", name: "Grand Credit Ring", slot: "ring", rarity: "legendary", icon: "GiBigDiamondRing", flavor: "A serious sum.", stats: { might: 8, fortune: 8 }, reqLevel: 40, source: "admin", sort: 543 },
    { id: "whale_crown", name: "Whale's Crown", slot: "helmet", rarity: "mythic", icon: "GiQueenCrown", flavor: "Spend like a legend.", stats: { might: 8, fortune: 8 }, reqLevel: 45, source: "admin", sort: 544 },

    // ===== GOLD SHOP GEAR (source: "xp_shop") — buyable with gold across the full price ladder, a real
    // gold sink. Budget-neutral stats (no power creep); the top tier carries a signature for prestige. =====
    // -- Low end (250–800 gold) --
    { id: "gs_bronze_buckler", name: "Bronze Buckler", slot: "off_hand", rarity: "common", icon: "GiRoundShield", flavor: "A first line of defense.", stats: { ferocity: 8, might: 3 }, reqLevel: 4, source: "xp_shop", xpCost: 250, sort: 600 },
    { id: "gs_swift_ring", name: "Swift Ring", slot: "ring", rarity: "common", icon: "GiSwirlRing", flavor: "A quick little band.", stats: { crit_chance: 6, might: 5 }, reqLevel: 5, source: "xp_shop", xpCost: 350, sort: 601 },
    { id: "gs_traveler_cloak", name: "Traveler's Cloak", slot: "back", rarity: "common", icon: "GiCape", flavor: "Road-worn and warm.", stats: { ferocity: 6, crit_chance: 5 }, reqLevel: 5, source: "xp_shop", xpCost: 400, sort: 602 },
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
    { id: "gilded_mantle", name: "Gilded Mantle", slot: "back", rarity: "epic", icon: "GiCondorEmblem", flavor: "Wealth worn well.", stats: { might: 12, fortune: 10 }, reqLevel: 26, source: "xp_shop", xpCost: 3200, sort: 821 },
    { id: "celestial_cloak", name: "Celestial Cloak", slot: "back", rarity: "legendary", icon: "GiCurlyWing", flavor: "Cut from the night sky.", stats: { crit_chance: 12, crit_power: 18 }, reqLevel: 46, source: "xp_shop", xpCost: 14000, sort: 822 },
    { id: "void_shroud", name: "Void Shroud", slot: "back", rarity: "mythic", icon: "GiFalconMoon", flavor: "It drinks the light.", stats: { ferocity: 20, fortune: 20 }, reqLevel: 90, source: "xp_shop", xpCost: 90000, sort: 823 },

    // ===== ELITE TIERS (source: "elite") — the two rarities ABOVE mythic. Extremely harsh to earn (only
    // from Ascendant/Eternal loot chests, awarded for elite boss performance or by the owner). Each is a
    // top-end stat block AND a signature AND a charged REAL-WORLD reward with a long cooldown. =====
    // -- Ascendant --
    { id: "ascendant_crown", name: "Ascendant Crown", slot: "helmet", rarity: "ascendant", icon: "GiCrenelCrown", flavor: "Worn by those who rose past legend.", stats: { might: 20, crit_chance: 15, crit_power: 20 }, reqLevel: 80, source: "elite", charged: true, charges: 2, cooldownDays: 180, chargeReward: "store_credit_100", chargeRewardLabel: REWARDS.store_credit_100, sort: 900 },
    { id: "ascendant_blade", name: "Ascendant Blade", slot: "main_hand", rarity: "ascendant", icon: "GiEnergySword", flavor: "It hums with a light that shouldn't exist.", stats: { might: 35, crit_power: 20 }, reqLevel: 82, source: "elite", charged: true, charges: 2, cooldownDays: 180, chargeReward: "store_credit_30", chargeRewardLabel: REWARDS.store_credit_30, sort: 901 },
    { id: "ascendant_aegis", name: "Ascendant Aegis", slot: "off_hand", rarity: "ascendant", icon: "GiCheckedShield", flavor: "Nothing has ever broken it.", stats: { ferocity: 35, fortune: 20 }, reqLevel: 84, source: "elite", sort: 902 },
    // -- Eternal (the pinnacle — 1-year cooldowns) --
    { id: "eternal_wolf_crown", name: "Eternal Wolf Crown", slot: "helmet", rarity: "eternal", icon: "GiWolfHead", flavor: "The Den remembers only a handful who wore it.", stats: { might: 25, crit_chance: 20, crit_power: 30 }, reqLevel: 95, source: "elite", sort: 910 },
    { id: "eternal_infinity", name: "Band of Eternity", slot: "ring", rarity: "eternal", icon: "GiEngagementRing", flavor: "No beginning. No end. No equal.", stats: { might: 25, crit_chance: 15, crit_power: 25, fortune: 10 }, reqLevel: 100, source: "elite", sort: 911 },
    // -- Bounty Board reward (granted for fulfilling 3 community bounties — see bounty-rewards.js) --
    { id: "bounty_hunters_mark", name: "Bounty Hunter's Mark", slot: "amulet", rarity: "legendary", icon: "GiWolfHead", flavor: "Proof you show up for the pack.", stats: { fortune: 15, might: 8 }, reqLevel: 1, source: "bounty_reward", sort: 920 },

    // -- FARM GEAR SETS -- utility pieces with FARM affixes (weak in combat, strong in the garden). Bought with
    // gold in the gear shop. Full-set capstones apply in farm-crops.js. See ITEM_SETS in sets.js.
    // Harvester's Garb — reaping & harvest gold; full set = a chance each harvest yields DOUBLE.
    // Forager's Kit — finding & nurturing seeds; full set = crops grow 15% faster.

    // ===== BLACKSMITH'S REGALIA (source: "forge") — the "salvaging set". Pieces drop rarely from salvaging at
    // the Forge (owner-only); wearing 3/5 boosts your salvage output. Not sold, not level-granted.

    // ── Wheel-exclusive gear — only from the Prize Wheel's match-3 BONUS GAME (source "wheel_bonus"). RARE
    // (blue) on purpose — a fun pull, not the strong purple/epic gear we don't normally hand out. AI sprites in
    // mkt_item_sprite (mig250/251). Not in any other drop table. ──

    // ── THE DEPTHS SETS ── three sets, one per verb the Mine actually asks of you, carrying DEPTH affinity
    // (see DEPTH_META). They were ownerOnly until the mine launched; now they drop like any other gear, with
    // the mine's own pool (featurePool) still the richest place to find them.
    //
    // Combat stats are deliberately MODEST — these are utility pieces. Wearing the full Delver's Kit should
    // make you better at the tunnel, not better at the boss, or the mine becomes the only way to gear up.

    // DELVING — the push-your-luck descent. Nerve keeps the roof up, Lodesense finds the good rock.

    // MINING — the seam at the rock face. Hew is yield, Prospecting is what else the rock was hiding.

    // SMELTING — the furnace. Bellows is extra parts, Crucible is what survives the slag.

    // ── THE TOP OF THE LADDER ────────────────────────────────────────────────────────────────────────────────
    // 117 items across the four bound tiers, carrying the 120 non-combat signature powers (see
    // docs/signature-powers-120.md). Three more of those powers go on the top-tier items that already existed
    // and are unowned: ascendant_aegis, eternal_wolf_crown and eternal_infinity.
    //
    // SOURCE IS "elite" ON EVERY ONE, deliberately. isRealMoneyItem() treats elite as off-limits to every
    // random reward path, so none of this can fall out of a chest, a cast, a harvest or a dig until acquisition
    // is designed on purpose. Chase gear that leaks into a loot table stops being chase gear.
    //
    // Stats continue the curve the existing tiers set — ascendant totals ~55 points, eternal ~75 — so celestial
    // takes 100 and primordial 130. Level gates continue the same way.
    { id: "ascendant_risen_blade", name: "Risen Blade", slot: "main_hand", rarity: "ascendant", icon: "GiAncientSword", flavor: "It was carried up, and it did not come back down.", stats: { might: 30, crit_power: 25 }, reqLevel: 80, source: "elite", sort: 1001 },
    { id: "ascendant_risen_bulwark", name: "Risen Bulwark", slot: "off_hand", rarity: "ascendant", icon: "GiBookCover", flavor: "Made for the moment after the climb.", stats: { ferocity: 33, fortune: 22 }, reqLevel: 80, source: "elite", sort: 1002 },
    { id: "ascendant_risen_diadem", name: "Risen Diadem", slot: "helmet", rarity: "ascendant", icon: "GiBlackKnightHelm", flavor: "The light on it is not reflected from anywhere.", stats: { crit_chance: 28, might: 28 }, reqLevel: 80, source: "elite", sort: 1003 },
    { id: "ascendant_risen_shroud", name: "Risen Shroud", slot: "chest", rarity: "ascendant", icon: "GiBeltArmor", flavor: "Only worn by those who had nothing left to prove.", stats: { ferocity: 36, might: 19 }, reqLevel: 81, source: "elite", sort: 1004 },
    { id: "ascendant_risen_binding", name: "Risen Binding", slot: "belt", rarity: "ascendant", icon: "GiBelt", flavor: "It was carried up, and it did not come back down.", stats: { might: 33, ferocity: 22 }, reqLevel: 81, source: "elite", sort: 1005 },
    { id: "ascendant_risen_walkers", name: "Risen Walkers", slot: "boots", rarity: "ascendant", icon: "GiBoots", flavor: "Made for the moment after the climb.", stats: { crit_chance: 33, ferocity: 22 }, reqLevel: 81, source: "elite", sort: 1006 },
    { id: "ascendant_risen_pinions", name: "Risen Pinions", slot: "back", rarity: "ascendant", icon: "GiFeatherNecklace", flavor: "The light on it is not reflected from anywhere.", stats: { fortune: 30, crit_chance: 25 }, reqLevel: 82, source: "elite", sort: 1007 },
    { id: "ascendant_risen_medallion", name: "Risen Medallion", slot: "amulet", rarity: "ascendant", icon: "GiBigDiamondRing", flavor: "Only worn by those who had nothing left to prove.", stats: { crit_power: 25, fortune: 17, crit_chance: 14 }, reqLevel: 82, source: "elite", sort: 1008 },
    { id: "ascendant_risen_bond", name: "Risen Bond", slot: "ring", rarity: "ascendant", icon: "GiBigDiamondRing", flavor: "It was carried up, and it did not come back down.", stats: { might: 19, crit_chance: 19, fortune: 17 }, reqLevel: 82, source: "elite", sort: 1009 },
    { id: "ascendant_exalted_sabre", name: "Exalted Sabre", slot: "main_hand", rarity: "ascendant", icon: "GiBattleAxe", flavor: "Made for the moment after the climb.", stats: { might: 30, crit_power: 25 }, reqLevel: 83, source: "elite", sort: 1010 },
    { id: "ascendant_exalted_wall", name: "Exalted Wall", slot: "off_hand", rarity: "ascendant", icon: "GiCheckedShield", flavor: "The light on it is not reflected from anywhere.", stats: { ferocity: 33, fortune: 22 }, reqLevel: 83, source: "elite", sort: 1011 },
    { id: "ascendant_exalted_veil", name: "Exalted Veil", slot: "helmet", rarity: "ascendant", icon: "GiBrutalHelm", flavor: "Only worn by those who had nothing left to prove.", stats: { crit_chance: 28, might: 28 }, reqLevel: 83, source: "elite", sort: 1012 },
    { id: "ascendant_exalted_plate", name: "Exalted Plate", slot: "chest", rarity: "ascendant", icon: "GiBreastplate", flavor: "It was carried up, and it did not come back down.", stats: { ferocity: 36, might: 19 }, reqLevel: 84, source: "elite", sort: 1013 },
    { id: "ascendant_exalted_sash", name: "Exalted Sash", slot: "belt", rarity: "ascendant", icon: "GiBeltArmor", flavor: "Made for the moment after the climb.", stats: { might: 33, ferocity: 22 }, reqLevel: 84, source: "elite", sort: 1014 },
    { id: "ascendant_exalted_greaves", name: "Exalted Greaves", slot: "boots", rarity: "ascendant", icon: "GiFurBoot", flavor: "The light on it is not reflected from anywhere.", stats: { crit_chance: 33, ferocity: 22 }, reqLevel: 84, source: "elite", sort: 1015 },
    { id: "ascendant_exalted_cape", name: "Exalted Cape", slot: "back", rarity: "ascendant", icon: "GiWingedSword", flavor: "Only worn by those who had nothing left to prove.", stats: { fortune: 30, crit_chance: 25 }, reqLevel: 85, source: "elite", sort: 1016 },
    { id: "ascendant_exalted_charm", name: "Exalted Charm", slot: "amulet", rarity: "ascendant", icon: "GiCharm", flavor: "It was carried up, and it did not come back down.", stats: { crit_power: 25, fortune: 17, crit_chance: 14 }, reqLevel: 85, source: "elite", sort: 1017 },
    { id: "ascendant_exalted_coil", name: "Exalted Coil", slot: "ring", rarity: "ascendant", icon: "GiDiamondRing", flavor: "Made for the moment after the climb.", stats: { might: 19, crit_chance: 19, fortune: 17 }, reqLevel: 85, source: "elite", sort: 1018 },
    { id: "ascendant_ascendant_cleaver", name: "Ascendant Cleaver", slot: "main_hand", rarity: "ascendant", icon: "GiBowArrow", flavor: "The light on it is not reflected from anywhere.", stats: { might: 30, crit_power: 25 }, reqLevel: 86, source: "elite", sort: 1019 },
    { id: "ascendant_ascendant_orb", name: "Ascendant Orb", slot: "off_hand", rarity: "ascendant", icon: "GiCrossShield", flavor: "Only worn by those who had nothing left to prove.", stats: { ferocity: 33, fortune: 22 }, reqLevel: 86, source: "elite", sort: 1020 },
    { id: "ascendant_ascendant_hood", name: "Ascendant Hood", slot: "helmet", rarity: "ascendant", icon: "GiCrenelCrown", flavor: "It was carried up, and it did not come back down.", stats: { crit_chance: 28, might: 28 }, reqLevel: 86, source: "elite", sort: 1021 },
    { id: "ascendant_ascendant_scale", name: "Ascendant Scale", slot: "chest", rarity: "ascendant", icon: "GiChainMail", flavor: "Made for the moment after the climb.", stats: { ferocity: 36, might: 19 }, reqLevel: 87, source: "elite", sort: 1022 },
    { id: "ascendant_ascendant_waistguard", name: "Ascendant Waistguard", slot: "belt", rarity: "ascendant", icon: "GiBlackBelt", flavor: "The light on it is not reflected from anywhere.", stats: { might: 33, ferocity: 22 }, reqLevel: 87, source: "elite", sort: 1023 },
    { id: "ascendant_ascendant_tracks", name: "Ascendant Tracks", slot: "boots", rarity: "ascendant", icon: "GiGreaves", flavor: "Only worn by those who had nothing left to prove.", stats: { crit_chance: 33, ferocity: 22 }, reqLevel: 87, source: "elite", sort: 1024 },
    { id: "ascendant_ascendant_cloak", name: "Ascendant Cloak", slot: "back", rarity: "ascendant", icon: "GiEagleEmblem", flavor: "It was carried up, and it did not come back down.", stats: { fortune: 30, crit_chance: 25 }, reqLevel: 88, source: "elite", sort: 1025 },
    { id: "ascendant_ascendant_amulet", name: "Ascendant Amulet", slot: "amulet", rarity: "ascendant", icon: "GiDiamondRing", flavor: "Made for the moment after the climb.", stats: { crit_power: 25, fortune: 17, crit_chance: 14 }, reqLevel: 88, source: "elite", sort: 1026 },
    { id: "ascendant_ascendant_signet", name: "Ascendant Signet", slot: "ring", rarity: "ascendant", icon: "GiEngagementRing", flavor: "The light on it is not reflected from anywhere.", stats: { might: 19, crit_chance: 19, fortune: 17 }, reqLevel: 88, source: "elite", sort: 1027 },
    { id: "ascendant_uplifted_scythe", name: "Uplifted Scythe", slot: "main_hand", rarity: "ascendant", icon: "GiBroadsword", flavor: "Only worn by those who had nothing left to prove.", stats: { might: 30, crit_power: 25 }, reqLevel: 89, source: "elite", sort: 1028 },
    { id: "ascendant_uplifted_rampart", name: "Uplifted Rampart", slot: "off_hand", rarity: "ascendant", icon: "GiCrystalBall", flavor: "It was carried up, and it did not come back down.", stats: { ferocity: 33, fortune: 22 }, reqLevel: 89, source: "elite", sort: 1029 },
    { id: "ascendant_uplifted_coronet", name: "Uplifted Coronet", slot: "helmet", rarity: "ascendant", icon: "GiCrestedHelmet", flavor: "Made for the moment after the climb.", stats: { crit_chance: 28, might: 28 }, reqLevel: 89, source: "elite", sort: 1030 },
    { id: "ascendant_uplifted_vestment", name: "Uplifted Vestment", slot: "chest", rarity: "ascendant", icon: "GiLayeredArmor", flavor: "The light on it is not reflected from anywhere.", stats: { ferocity: 36, might: 19 }, reqLevel: 90, source: "elite", sort: 1031 },
    { id: "ascendant_uplifted_clasp", name: "Uplifted Clasp", slot: "belt", rarity: "ascendant", icon: "GiPowderBag", flavor: "Only worn by those who had nothing left to prove.", stats: { might: 33, ferocity: 22 }, reqLevel: 90, source: "elite", sort: 1032 },
    { id: "ascendant_uplifted_soles", name: "Uplifted Soles", slot: "boots", rarity: "ascendant", icon: "GiLeatherBoot", flavor: "It was carried up, and it did not come back down.", stats: { crit_chance: 33, ferocity: 22 }, reqLevel: 90, source: "elite", sort: 1033 },
    { id: "ascendant_uplifted_veil", name: "Uplifted Veil", slot: "back", rarity: "ascendant", icon: "GiCape", flavor: "Made for the moment after the climb.", stats: { fortune: 30, crit_chance: 25 }, reqLevel: 91, source: "elite", sort: 1034 },
    { id: "eternal_eternal_blade", name: "Eternal Blade", slot: "main_hand", rarity: "eternal", icon: "GiCrescentStaff", flavor: "It has outlasted every hand that held it.", stats: { might: 41, crit_power: 34 }, reqLevel: 95, source: "elite", sort: 1035 },
    { id: "eternal_eternal_bulwark", name: "Eternal Bulwark", slot: "off_hand", rarity: "eternal", icon: "GiCrystalWand", flavor: "Nothing on it has worn away.", stats: { ferocity: 45, fortune: 30 }, reqLevel: 95, source: "elite", sort: 1036 },
    { id: "eternal_eternal_diadem", name: "Eternal Diadem", slot: "helmet", rarity: "eternal", icon: "GiCrown", flavor: "It was old before the Den had a name.", stats: { crit_chance: 38, might: 38 }, reqLevel: 95, source: "elite", sort: 1037 },
    { id: "eternal_eternal_shroud", name: "Eternal Shroud", slot: "chest", rarity: "eternal", icon: "GiLeatherArmor", flavor: "It will still be here.", stats: { ferocity: 49, might: 26 }, reqLevel: 96, source: "elite", sort: 1038 },
    { id: "eternal_eternal_binding", name: "Eternal Binding", slot: "belt", rarity: "eternal", icon: "GiBelt", flavor: "It has outlasted every hand that held it.", stats: { might: 45, ferocity: 30 }, reqLevel: 96, source: "elite", sort: 1039 },
    { id: "eternal_eternal_walkers", name: "Eternal Walkers", slot: "boots", rarity: "eternal", icon: "GiMetalBoot", flavor: "Nothing on it has worn away.", stats: { crit_chance: 45, ferocity: 30 }, reqLevel: 96, source: "elite", sort: 1040 },
    { id: "eternal_eternal_pinions", name: "Eternal Pinions", slot: "back", rarity: "eternal", icon: "GiSpikedShoulderArmor", flavor: "It was old before the Den had a name.", stats: { fortune: 41, crit_chance: 34 }, reqLevel: 97, source: "elite", sort: 1041 },
    { id: "eternal_eternal_medallion", name: "Eternal Medallion", slot: "amulet", rarity: "eternal", icon: "GiEmeraldNecklace", flavor: "It will still be here.", stats: { crit_power: 34, fortune: 23, crit_chance: 19 }, reqLevel: 97, source: "elite", sort: 1042 },
    { id: "eternal_eternal_bond", name: "Eternal Bond", slot: "ring", rarity: "eternal", icon: "GiFireRing", flavor: "It has outlasted every hand that held it.", stats: { might: 26, crit_chance: 26, fortune: 23 }, reqLevel: 97, source: "elite", sort: 1043 },
    { id: "eternal_undying_sabre", name: "Undying Sabre", slot: "main_hand", rarity: "eternal", icon: "GiCrossbow", flavor: "Nothing on it has worn away.", stats: { might: 41, crit_power: 34 }, reqLevel: 98, source: "elite", sort: 1044 },
    { id: "eternal_undying_wall", name: "Undying Wall", slot: "off_hand", rarity: "eternal", icon: "GiDragonShield", flavor: "It was old before the Den had a name.", stats: { ferocity: 45, fortune: 30 }, reqLevel: 98, source: "elite", sort: 1045 },
    { id: "eternal_undying_veil", name: "Undying Veil", slot: "helmet", rarity: "eternal", icon: "GiExecutionerHood", flavor: "It will still be here.", stats: { crit_chance: 38, might: 38 }, reqLevel: 98, source: "elite", sort: 1046 },
    { id: "eternal_undying_plate", name: "Undying Plate", slot: "chest", rarity: "eternal", icon: "GiMetalPlate", flavor: "It has outlasted every hand that held it.", stats: { ferocity: 49, might: 26 }, reqLevel: 99, source: "elite", sort: 1047 },
    { id: "eternal_undying_sash", name: "Undying Sash", slot: "belt", rarity: "eternal", icon: "GiBeltArmor", flavor: "Nothing on it has worn away.", stats: { might: 45, ferocity: 30 }, reqLevel: 99, source: "elite", sort: 1048 },
    { id: "eternal_undying_greaves", name: "Undying Greaves", slot: "boots", rarity: "eternal", icon: "GiSteeltoeBoots", flavor: "It was old before the Den had a name.", stats: { crit_chance: 45, ferocity: 30 }, reqLevel: 99, source: "elite", sort: 1049 },
    { id: "eternal_undying_cape", name: "Undying Cape", slot: "back", rarity: "eternal", icon: "GiCapeArmor", flavor: "It will still be here.", stats: { fortune: 41, crit_chance: 34 }, reqLevel: 100, source: "elite", sort: 1050 },
    { id: "eternal_undying_charm", name: "Undying Charm", slot: "amulet", rarity: "eternal", icon: "GiFeatherNecklace", flavor: "It has outlasted every hand that held it.", stats: { crit_power: 34, fortune: 23, crit_chance: 19 }, reqLevel: 100, source: "elite", sort: 1051 },
    { id: "eternal_undying_coil", name: "Undying Coil", slot: "ring", rarity: "eternal", icon: "GiFrozenRing", flavor: "Nothing on it has worn away.", stats: { might: 26, crit_chance: 26, fortune: 23 }, reqLevel: 100, source: "elite", sort: 1052 },
    { id: "eternal_timeless_cleaver", name: "Timeless Cleaver", slot: "main_hand", rarity: "eternal", icon: "GiCrystalWand", flavor: "It was old before the Den had a name.", stats: { might: 41, crit_power: 34 }, reqLevel: 101, source: "elite", sort: 1053 },
    { id: "eternal_timeless_orb", name: "Timeless Orb", slot: "off_hand", rarity: "eternal", icon: "GiEdgedShield", flavor: "It will still be here.", stats: { ferocity: 45, fortune: 30 }, reqLevel: 101, source: "elite", sort: 1054 },
    { id: "eternal_timeless_hood", name: "Timeless Hood", slot: "helmet", rarity: "eternal", icon: "GiHornedHelm", flavor: "It has outlasted every hand that held it.", stats: { crit_chance: 38, might: 38 }, reqLevel: 101, source: "elite", sort: 1055 },
    { id: "eternal_timeless_scale", name: "Timeless Scale", slot: "chest", rarity: "eternal", icon: "GiRobe", flavor: "Nothing on it has worn away.", stats: { ferocity: 49, might: 26 }, reqLevel: 102, source: "elite", sort: 1056 },
    { id: "eternal_timeless_waistguard", name: "Timeless Waistguard", slot: "belt", rarity: "eternal", icon: "GiBlackBelt", flavor: "It was old before the Den had a name.", stats: { might: 45, ferocity: 30 }, reqLevel: 102, source: "elite", sort: 1057 },
    { id: "eternal_timeless_tracks", name: "Timeless Tracks", slot: "boots", rarity: "eternal", icon: "GiWalkingBoot", flavor: "It will still be here.", stats: { crit_chance: 45, ferocity: 30 }, reqLevel: 102, source: "elite", sort: 1058 },
    { id: "eternal_timeless_cloak", name: "Timeless Cloak", slot: "back", rarity: "eternal", icon: "GiWingfoot", flavor: "It has outlasted every hand that held it.", stats: { fortune: 41, crit_chance: 34 }, reqLevel: 103, source: "elite", sort: 1059 },
    { id: "eternal_timeless_amulet", name: "Timeless Amulet", slot: "amulet", rarity: "eternal", icon: "GiGemNecklace", flavor: "Nothing on it has worn away.", stats: { crit_power: 34, fortune: 23, crit_chance: 19 }, reqLevel: 103, source: "elite", sort: 1060 },
    { id: "eternal_timeless_signet", name: "Timeless Signet", slot: "ring", rarity: "eternal", icon: "GiPowerRing", flavor: "It was old before the Den had a name.", stats: { might: 26, crit_chance: 26, fortune: 23 }, reqLevel: 103, source: "elite", sort: 1061 },
    { id: "eternal_unending_scythe", name: "Unending Scythe", slot: "main_hand", rarity: "eternal", icon: "GiEnergySword", flavor: "It will still be here.", stats: { might: 41, crit_power: 34 }, reqLevel: 104, source: "elite", sort: 1062 },
    { id: "celestial_celestial_blade", name: "Celestial Blade", slot: "main_hand", rarity: "celestial", icon: "GiFlangedMace", flavor: "Cut from something that was falling.", stats: { might: 55, crit_power: 45 }, reqLevel: 105, source: "elite", sort: 1063 },
    { id: "celestial_celestial_bulwark", name: "Celestial Bulwark", slot: "off_hand", rarity: "celestial", icon: "GiRoundShield", flavor: "It keeps the cold of very high places.", stats: { ferocity: 60, fortune: 40 }, reqLevel: 105, source: "elite", sort: 1064 },
    { id: "celestial_celestial_diadem", name: "Celestial Diadem", slot: "helmet", rarity: "celestial", icon: "GiOverlordHelm", flavor: "There is a sky inside it.", stats: { crit_chance: 50, might: 50 }, reqLevel: 105, source: "elite", sort: 1065 },
    { id: "celestial_celestial_shroud", name: "Celestial Shroud", slot: "chest", rarity: "celestial", icon: "GiScaleMail", flavor: "It answers to a longer year than ours.", stats: { ferocity: 65, might: 35 }, reqLevel: 106, source: "elite", sort: 1066 },
    { id: "celestial_celestial_binding", name: "Celestial Binding", slot: "belt", rarity: "celestial", icon: "GiPowderBag", flavor: "Cut from something that was falling.", stats: { might: 60, ferocity: 40 }, reqLevel: 106, source: "elite", sort: 1067 },
    { id: "celestial_celestial_walkers", name: "Celestial Walkers", slot: "boots", rarity: "celestial", icon: "GiRunningShoe", flavor: "It keeps the cold of very high places.", stats: { crit_chance: 60, ferocity: 40 }, reqLevel: 106, source: "elite", sort: 1068 },
    { id: "celestial_celestial_pinions", name: "Celestial Pinions", slot: "back", rarity: "celestial", icon: "GiWingedScepter", flavor: "There is a sky inside it.", stats: { fortune: 55, crit_chance: 45 }, reqLevel: 107, source: "elite", sort: 1069 },
    { id: "celestial_celestial_medallion", name: "Celestial Medallion", slot: "amulet", rarity: "celestial", icon: "GiGemPendant", flavor: "It answers to a longer year than ours.", stats: { crit_power: 45, fortune: 30, crit_chance: 25 }, reqLevel: 107, source: "elite", sort: 1070 },
    { id: "celestial_celestial_bond", name: "Celestial Bond", slot: "ring", rarity: "celestial", icon: "GiRing", flavor: "Cut from something that was falling.", stats: { might: 35, crit_chance: 35, fortune: 30 }, reqLevel: 107, source: "elite", sort: 1071 },
    { id: "celestial_starbound_sabre", name: "Starbound Sabre", slot: "main_hand", rarity: "celestial", icon: "GiRuneSword", flavor: "It keeps the cold of very high places.", stats: { might: 55, crit_power: 45 }, reqLevel: 108, source: "elite", sort: 1072 },
    { id: "celestial_starbound_wall", name: "Starbound Wall", slot: "off_hand", rarity: "celestial", icon: "GiSpellBook", flavor: "There is a sky inside it.", stats: { ferocity: 60, fortune: 40 }, reqLevel: 108, source: "elite", sort: 1073 },
    { id: "celestial_starbound_veil", name: "Starbound Veil", slot: "helmet", rarity: "celestial", icon: "GiQueenCrown", flavor: "It answers to a longer year than ours.", stats: { crit_chance: 50, might: 50 }, reqLevel: 108, source: "elite", sort: 1074 },
    { id: "celestial_starbound_plate", name: "Starbound Plate", slot: "chest", rarity: "celestial", icon: "GiSpikedArmor", flavor: "Cut from something that was falling.", stats: { ferocity: 65, might: 35 }, reqLevel: 109, source: "elite", sort: 1075 },
    { id: "celestial_starbound_sash", name: "Starbound Sash", slot: "belt", rarity: "celestial", icon: "GiBelt", flavor: "It keeps the cold of very high places.", stats: { might: 60, ferocity: 40 }, reqLevel: 109, source: "elite", sort: 1076 },
    { id: "celestial_starbound_greaves", name: "Starbound Greaves", slot: "boots", rarity: "celestial", icon: "GiBootStomp", flavor: "There is a sky inside it.", stats: { crit_chance: 60, ferocity: 40 }, reqLevel: 109, source: "elite", sort: 1077 },
    { id: "celestial_starbound_cape", name: "Starbound Cape", slot: "back", rarity: "celestial", icon: "GiAngelWings", flavor: "It answers to a longer year than ours.", stats: { fortune: 55, crit_chance: 45 }, reqLevel: 110, source: "elite", sort: 1078 },
    { id: "celestial_starbound_charm", name: "Starbound Charm", slot: "amulet", rarity: "celestial", icon: "GiHeartNecklace", flavor: "Cut from something that was falling.", stats: { crit_power: 45, fortune: 30, crit_chance: 25 }, reqLevel: 110, source: "elite", sort: 1079 },
    { id: "celestial_starbound_coil", name: "Starbound Coil", slot: "ring", rarity: "celestial", icon: "GiSkullRing", flavor: "It keeps the cold of very high places.", stats: { might: 35, crit_chance: 35, fortune: 30 }, reqLevel: 110, source: "elite", sort: 1080 },
    { id: "celestial_astral_cleaver", name: "Astral Cleaver", slot: "main_hand", rarity: "celestial", icon: "GiSickle", flavor: "There is a sky inside it.", stats: { might: 55, crit_power: 45 }, reqLevel: 111, source: "elite", sort: 1081 },
    { id: "celestial_astral_orb", name: "Astral Orb", slot: "off_hand", rarity: "celestial", icon: "GiShieldBash", flavor: "It answers to a longer year than ours.", stats: { ferocity: 60, fortune: 40 }, reqLevel: 111, source: "elite", sort: 1082 },
    { id: "celestial_astral_hood", name: "Astral Hood", slot: "helmet", rarity: "celestial", icon: "GiBarbute", flavor: "Cut from something that was falling.", stats: { crit_chance: 50, might: 50 }, reqLevel: 111, source: "elite", sort: 1083 },
    { id: "celestial_astral_scale", name: "Astral Scale", slot: "chest", rarity: "celestial", icon: "GiChestArmor", flavor: "It keeps the cold of very high places.", stats: { ferocity: 65, might: 35 }, reqLevel: 112, source: "elite", sort: 1084 },
    { id: "celestial_astral_waistguard", name: "Astral Waistguard", slot: "belt", rarity: "celestial", icon: "GiBeltArmor", flavor: "There is a sky inside it.", stats: { might: 60, ferocity: 40 }, reqLevel: 112, source: "elite", sort: 1085 },
    { id: "celestial_astral_tracks", name: "Astral Tracks", slot: "boots", rarity: "celestial", icon: "GiLegArmor", flavor: "It answers to a longer year than ours.", stats: { crit_chance: 60, ferocity: 40 }, reqLevel: 112, source: "elite", sort: 1086 },
    { id: "celestial_astral_cloak", name: "Astral Cloak", slot: "back", rarity: "celestial", icon: "GiBatwingEmblem", flavor: "Cut from something that was falling.", stats: { fortune: 55, crit_chance: 45 }, reqLevel: 113, source: "elite", sort: 1087 },
    { id: "celestial_astral_amulet", name: "Astral Amulet", slot: "amulet", rarity: "celestial", icon: "GiIntricateNecklace", flavor: "It keeps the cold of very high places.", stats: { crit_power: 45, fortune: 30, crit_chance: 25 }, reqLevel: 113, source: "elite", sort: 1088 },
    { id: "celestial_astral_signet", name: "Astral Signet", slot: "ring", rarity: "celestial", icon: "GiSkullSignet", flavor: "There is a sky inside it.", stats: { might: 35, crit_chance: 35, fortune: 30 }, reqLevel: 113, source: "elite", sort: 1089 },
    { id: "celestial_empyrean_scythe", name: "Empyrean Scythe", slot: "main_hand", rarity: "celestial", icon: "GiWarhammer", flavor: "It answers to a longer year than ours.", stats: { might: 55, crit_power: 45 }, reqLevel: 114, source: "elite", sort: 1090 },
    { id: "celestial_empyrean_rampart", name: "Empyrean Rampart", slot: "off_hand", rarity: "celestial", icon: "GiCrystalCluster", flavor: "Cut from something that was falling.", stats: { ferocity: 60, fortune: 40 }, reqLevel: 114, source: "elite", sort: 1091 },
    { id: "celestial_empyrean_coronet", name: "Empyrean Coronet", slot: "helmet", rarity: "celestial", icon: "GiVisoredHelm", flavor: "It keeps the cold of very high places.", stats: { crit_chance: 50, might: 50 }, reqLevel: 114, source: "elite", sort: 1092 },
    { id: "primordial_primordial_blade", name: "Primordial Blade", slot: "main_hand", rarity: "primordial", icon: "GiWingedSword", flavor: "From before there was a word for it.", stats: { might: 72, crit_power: 59 }, reqLevel: 120, source: "elite", sort: 1093 },
    { id: "primordial_primordial_bulwark", name: "Primordial Bulwark", slot: "off_hand", rarity: "primordial", icon: "GiSurroundedShield", flavor: "The first of its kind, and still the last.", stats: { ferocity: 78, fortune: 52 }, reqLevel: 120, source: "elite", sort: 1094 },
    { id: "primordial_primordial_diadem", name: "Primordial Diadem", slot: "helmet", rarity: "primordial", icon: "GiCenturionHelmet", flavor: "It remembers the shape of the world underneath.", stats: { crit_chance: 65, might: 65 }, reqLevel: 120, source: "elite", sort: 1095 },
    { id: "primordial_primordial_shroud", name: "Primordial Shroud", slot: "chest", rarity: "primordial", icon: "GiAbdominalArmor", flavor: "Older than the stone it was found in.", stats: { ferocity: 85, might: 46 }, reqLevel: 121, source: "elite", sort: 1096 },
    { id: "primordial_primordial_binding", name: "Primordial Binding", slot: "belt", rarity: "primordial", icon: "GiBlackBelt", flavor: "From before there was a word for it.", stats: { might: 78, ferocity: 52 }, reqLevel: 121, source: "elite", sort: 1097 },
    { id: "primordial_primordial_walkers", name: "Primordial Walkers", slot: "boots", rarity: "primordial", icon: "GiBootKick", flavor: "The first of its kind, and still the last.", stats: { crit_chance: 78, ferocity: 52 }, reqLevel: 121, source: "elite", sort: 1098 },
    { id: "primordial_primordial_pinions", name: "Primordial Pinions", slot: "back", rarity: "primordial", icon: "GiCurlyWing", flavor: "It remembers the shape of the world underneath.", stats: { fortune: 72, crit_chance: 59 }, reqLevel: 122, source: "elite", sort: 1099 },
    { id: "primordial_primordial_medallion", name: "Primordial Medallion", slot: "amulet", rarity: "primordial", icon: "GiTribalPendant", flavor: "Older than the stone it was found in.", stats: { crit_power: 59, fortune: 39, crit_chance: 33 }, reqLevel: 122, source: "elite", sort: 1100 },
    { id: "primordial_primordial_bond", name: "Primordial Bond", slot: "ring", rarity: "primordial", icon: "GiSwirlRing", flavor: "From before there was a word for it.", stats: { might: 46, crit_chance: 46, fortune: 39 }, reqLevel: 122, source: "elite", sort: 1101 },
    { id: "primordial_firstborn_sabre", name: "Firstborn Sabre", slot: "main_hand", rarity: "primordial", icon: "GiWizardStaff", flavor: "The first of its kind, and still the last.", stats: { might: 72, crit_power: 59 }, reqLevel: 123, source: "elite", sort: 1102 },
    { id: "primordial_firstborn_wall", name: "Firstborn Wall", slot: "off_hand", rarity: "primordial", icon: "GiVibratingShield", flavor: "It remembers the shape of the world underneath.", stats: { ferocity: 78, fortune: 52 }, reqLevel: 123, source: "elite", sort: 1103 },
    { id: "primordial_firstborn_veil", name: "Firstborn Veil", slot: "helmet", rarity: "primordial", icon: "GiLaurelCrown", flavor: "Older than the stone it was found in.", stats: { crit_chance: 65, might: 65 }, reqLevel: 123, source: "elite", sort: 1104 },
    { id: "primordial_firstborn_plate", name: "Firstborn Plate", slot: "chest", rarity: "primordial", icon: "GiKimono", flavor: "From before there was a word for it.", stats: { ferocity: 85, might: 46 }, reqLevel: 124, source: "elite", sort: 1105 },
    { id: "primordial_firstborn_sash", name: "Firstborn Sash", slot: "belt", rarity: "primordial", icon: "GiPowderBag", flavor: "The first of its kind, and still the last.", stats: { might: 78, ferocity: 52 }, reqLevel: 124, source: "elite", sort: 1106 },
    { id: "primordial_firstborn_greaves", name: "Firstborn Greaves", slot: "boots", rarity: "primordial", icon: "GiWingfoot", flavor: "It remembers the shape of the world underneath.", stats: { crit_chance: 78, ferocity: 52 }, reqLevel: 124, source: "elite", sort: 1107 },
    { id: "primordial_firstborn_cape", name: "Firstborn Cape", slot: "back", rarity: "primordial", icon: "GiFeatheredWing", flavor: "Older than the stone it was found in.", stats: { fortune: 72, crit_chance: 59 }, reqLevel: 125, source: "elite", sort: 1108 },
    { id: "primordial_firstborn_charm", name: "Firstborn Charm", slot: "amulet", rarity: "primordial", icon: "GiPearlNecklace", flavor: "From before there was a word for it.", stats: { crit_power: 59, fortune: 39, crit_chance: 33 }, reqLevel: 125, source: "elite", sort: 1109 },
    { id: "primordial_firstborn_coil", name: "Firstborn Coil", slot: "ring", rarity: "primordial", icon: "GiRingedBeam", flavor: "The first of its kind, and still the last.", stats: { might: 46, crit_chance: 46, fortune: 39 }, reqLevel: 125, source: "elite", sort: 1110 },
    { id: "primordial_elder_cleaver", name: "Elder Cleaver", slot: "main_hand", rarity: "primordial", icon: "GiPlainDagger", flavor: "It remembers the shape of the world underneath.", stats: { might: 72, crit_power: 59 }, reqLevel: 126, source: "elite", sort: 1111 },
    { id: "primordial_elder_orb", name: "Elder Orb", slot: "off_hand", rarity: "primordial", icon: "GiEyeShield", flavor: "Older than the stone it was found in.", stats: { ferocity: 78, fortune: 52 }, reqLevel: 126, source: "elite", sort: 1112 },
    { id: "primordial_elder_hood", name: "Elder Hood", slot: "helmet", rarity: "primordial", icon: "GiWizardFace", flavor: "From before there was a word for it.", stats: { crit_chance: 65, might: 65 }, reqLevel: 126, source: "elite", sort: 1113 },
    { id: "primordial_elder_scale", name: "Elder Scale", slot: "chest", rarity: "primordial", icon: "GiLegArmor", flavor: "The first of its kind, and still the last.", stats: { ferocity: 85, might: 46 }, reqLevel: 127, source: "elite", sort: 1114 },
    { id: "primordial_elder_waistguard", name: "Elder Waistguard", slot: "belt", rarity: "primordial", icon: "GiBelt", flavor: "It remembers the shape of the world underneath.", stats: { might: 78, ferocity: 52 }, reqLevel: 127, source: "elite", sort: 1115 },
    { id: "primordial_elder_tracks", name: "Elder Tracks", slot: "boots", rarity: "primordial", icon: "GiBoots", flavor: "Older than the stone it was found in.", stats: { crit_chance: 78, ferocity: 52 }, reqLevel: 127, source: "elite", sort: 1116 },
    { id: "primordial_elder_cloak", name: "Elder Cloak", slot: "back", rarity: "primordial", icon: "GiCondorEmblem", flavor: "From before there was a word for it.", stats: { fortune: 72, crit_chance: 59 }, reqLevel: 128, source: "elite", sort: 1117 },
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

// ── VITALITY RIDES WITH FEROCITY ─────────────────────────────────────────────────────────────────────────────
// Vitality was on 79 of 423 items (19%) against ferocity's 262 (62%), so most builds carried none of it at all
// — the owner's ten equipped pieces totalled ONE point, which is why his health was a class constant and why
// normalising health against a ceiling would have left him on nothing.
//
// Ferocity is the right place to take it from. On gear it buys exactly one thing — the tempo of your bar,
// via tempoOf — while accuracy moved to Precision and health only ever read Vitality. So this trades a slice
// of turn order for survivability, which is the better use of the points, and it lands vitality on every item
// that carries ferocity, matching its coverage exactly.
//
// Done here rather than by editing 262 stat lines: one number to turn, nothing hand-authored, and the item
// catalogue above stays readable as the thing a designer edits.
const VITALITY_SHARE_OF_FEROCITY = 0.6;
(() => {
    for (const it of ITEMS) {
        const f = Number(it.stats?.ferocity) || 0;
        if (f <= 0) continue;
        const move = Math.max(1, Math.round(f * VITALITY_SHARE_OF_FEROCITY));
        const kept = f - move;
        it.stats = { ...it.stats, vitality: (Number(it.stats.vitality) || 0) + move };
        if (kept > 0) it.stats.ferocity = kept; else delete it.stats.ferocity;
    }
})();

// ── WHAT A WEAPON, A PIECE OF ARMOUR AND A SHIELD ARE, BEFORE ANY AFFIX ──────────────────────────────────────
// Four things every item of its kind carries, keyed off the rarity ladder so a top-tier piece is better than a
// bottom-tier one before a single affix is rolled — and VARIED per item, because a tier where every sword is
// the same sword is a tier with one sword in it.
//
//   base_damage    main hand only. Common ~10 up to primordial ~100.
//   speed          main hand only. Every weapon has one. It is the bar's fill rate — see tempoOf.
//   armor          every worn piece that is not a weapon, ring or amulet. A plain integer. A common chest is
//                  ~40 and a primordial chest ~850; the other slots are a share of the chest by coverage.
//   block_chance   shields only. Ranges to 0.75 on the best shield in the game, with most sitting near 0.30.
//
// THE VARIETY IS DETERMINISTIC. A hash of the item id gives each piece a spread of +/-25% around the flat
// number below, so the catalogue has texture but a given item is the same every time the server starts and
// nothing drifts between two processes reading the same item. It hashes the ID, never the rarity.
const vary = (id, salt) => {
    let h = 2166136261;
    for (const ch of `${id}:${salt}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    return 0.75 + ((h >>> 0) % 1000) / 1000 * 0.5;   // 0.75 .. 1.25
};
// RARITY_LADDER and lerpGeo lived here and are gone with the tier scaling they existed to compute — see the
// note below. Nothing in this file reads an item's rarity to work out a number any more.
const ARMOR_SLOT_WEIGHT = { chest: 1.0, off_hand: 0.8, helmet: 0.7, back: 0.6, boots: 0.5, belt: 0.4 };
const isShield = (it) => /shield|bulwark|aegis|barrier|wall|rampart|targe/i.test(`${it.name || ""} ${it.icon || ""}`);

// ── RARITY IS NOT AN INPUT ANY MORE ──────────────────────────────────────────────────────────────────────────
// Luke: "nothing should scale with rarity... I mean for calculations."
//
// Every intrinsic below used to be `lerpGeo(lo, hi, tier)` — a geometric ladder keyed off the rarity index, so
// a primordial weapon carried 96 base damage against a common's 9. That was rarity paid FOUR TIMES over on the
// same item, because the catalogue's authored stats already climb with it: a primordial main hand carries 39.3
// Might to a common's 3.7, plus 21 pierce to 0, plus nearly twice the swings. The generated ladder multiplied
// all of that again, which is most of why the gear ceiling sits where nobody can see it.
//
// So the intrinsics are FLAT. What an item is worth is now the stats a designer typed on it, and rarity is
// what it says on the tin: how hard the thing was to find.
//
// ── THE FLAT VALUES ARE THE CURRENT MEANS, ON PURPOSE ────────────────────────────────────────────────────────
// Each one is the average of what the catalogue already carried, so the change removes the SLOPE without
// moving the game's overall power level: a mid-tier member's damage, armour and bout length are where they
// were this morning. Anchoring at the top instead would have tripled everyone's damage against health that
// did not move, and turned every bout in the game into three swings.
//
//   base_damage  31.8 mean -> 32     armor (chest, weight 1.0)  219 mean -> 220
//   speed         1.03 mean -> 1.0   block_chance              0.312 mean -> 0.31
//   pierce        7.0 mean -> 7      haste                       6.7 mean -> 7
//
// vary() STAYS. It hashes the item's ID, not its rarity, so two swords still differ from each other — the
// texture the catalogue was given is untouched. Only the tier slope is gone.
const BASE_DAMAGE_FLAT = 32;
const WEAPON_SPEED_FLAT = 1.0;
const PIERCE_FLAT = 7;
const HASTE_FLAT = 7;
const ARMOR_FLAT = 220;          // at slot weight 1.0 (chest); the other slots are a share by coverage
const BLOCK_CHANCE_FLAT = 0.31;

(() => {
    for (const it of ITEMS) {
        const stats = { ...(it.stats || {}) };
        // Precision bought accuracy and accuracy no longer exists, so the affix is stripped rather than
        // left on 24 items as a number that does nothing.
        delete stats.precision;
        // ── HASTE, ON A HANDFUL OF PIECES ────────────────────────────────────────────────────────────
        // It sat on 11 items and the reason it was worth having is that it is NOT on everything. That is
        // kept; what changed is who decides. It used to be "mythic through eternal", which is rarity picking
        // the winners — it is the item's own hash now, so the same handful of pieces carry it and none of
        // them carry it because of what tier they are.
        if (vary(it.id, "haste") > 1.205 && vary(it.id, "hasteroll") > 1.10) {
            stats.haste = Math.max(1, Math.round(HASTE_FLAT * vary(it.id, "hasteval")));
        }
        // ── NO STAT IS SECRETLY ANOTHER STAT ─────────────────────────────────────────────────────────
        // 45% of every item's authored Might used to be moved into Vitality here, and 40% of an armour
        // piece's Ferocity into Tenacity. Both were balance patches done as a transfer rather than by
        // editing the catalogue — "one number to turn" — and both meant an item's card and an item's
        // definition disagreed: you typed 12 Might and the game handed out 7 Might and 5 Vitality.
        //
        // Luke: "might should not translate to vitality, no stat should map to another stat." So an item
        // now grants exactly the stats written on it, and a stat that ought to be more common is made more
        // common by authoring it, which is a thing a designer can see.
        // ── PIERCE ───────────────────────────────────────────────────────────────────────────────────
        // Going through armour is what a weapon is FOR, so every main hand carries it — that used to start
        // at rare and it starts at all of them now. A minority of non-weapons still roll it, decided by the
        // item's hash rather than by its tier, so it stays a thing you notice on a chest piece.
        if (it.slot === "main_hand") {
            stats.pierce = Math.max(1, Math.round(PIERCE_FLAT * vary(it.id, "prc")));
        } else if (vary(it.id, "prcroll") > 1.175) {
            stats.pierce = Math.max(1, Math.round(PIERCE_FLAT * vary(it.id, "prc")));
        }
        if (it.slot === "main_hand") {
            stats.base_damage = Math.max(1, Math.round(BASE_DAMAGE_FLAT * vary(it.id, "dmg")));
            stats.speed = Math.round(WEAPON_SPEED_FLAT * vary(it.id, "spd") * 100) / 100;
        }
        if (ARMOR_SLOT_WEIGHT[it.slot]) {
            // Slot weight is COVERAGE, not rarity — a breastplate covers more of you than a belt, and that
            // is true of a common one and a primordial one alike. It stays.
            stats.armor = Math.max(1, Math.round(ARMOR_FLAT * ARMOR_SLOT_WEIGHT[it.slot] * vary(it.id, "arm")));
            if (it.slot === "off_hand" && isShield(it)) {
                stats.block_chance = Math.min(0.75, Math.round(BLOCK_CHANCE_FLAT * vary(it.id, "blk") * 100) / 100);
            }
        }
        it.stats = stats;
    }
})();

export function itemById(id) {
    return ITEMS.find((i) => i.id === id) || null;
}

// Does an item fit a given equip slot? (rings fit ring1/ring2)
// ── A TROPHY IS NOT A SLOT ────────────────────────────────────────────────────────────────────────────────────
// Collection pieces (the farm / mine / wheel / sailing sets) stopped being worn when their bonuses became
// permanent on OWNERSHIP — so they must stop occupying a gear slot too, or they are a trap: a slot spent on a
// piece whose bonus you already had, and combat stats worse than the thing you took off to make room.
//
// They are also not SELLABLE or SALVAGEABLE. The bonus follows the piece, so parting with one silently removes
// a permanent upgrade, and there is no version of that trade a player would knowingly take for 40 parts.
//
// COLLECTION PIECES USED TO LIVE HERE. They were ITEMS with a registry of ids that equip / sell / salvage /
// auction / trade / drop-pools each had to check against, and the rule only held while every author remembered
// it. They are their own table now — see collection-pieces.js — so a trophy id does not resolve as an item and
// there is nothing left to guard against.

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
// ── HOW A STAT READS ─────────────────────────────────────────────────────────────────────────────────────────
// Three kinds, and treating them all as "+N" is why a sword's own damage read as "+19 Damage" like an affix,
// and a shield's block chance read as "+0.2% Block Chance".
//
//   INTRINSIC   base damage, armour, attack speed. What the piece IS, not a bonus on top of it, so no plus.
//   FRACTION    block chance is stored 0..1 and shown as a percentage.
//   AFFIX       everything else — a bonus, and it gets its plus.
const INTRINSIC = new Set(["base_damage", "armor", "speed"]);
const FRACTION = new Set(["block_chance"]);

// ── WHAT THE PIECE IS, AND SO WHAT IT CANNOT STOP BEING ──────────────────────────────────────────────────────
// The same three above plus block chance, which FRACTION describes as a FORMAT and this describes as a KIND:
// a shield's block is as intrinsic to it as a sword's damage is, they are simply printed differently.
//
// Exported because the Forge needs it. A reforge picks a forged line and rolls it into something else, and
// enhancing raises these lines too — so the swap list happily offered to turn a sword's own Damage into
// Fortune, or a breastplate's Armour into Chance to Stun, leaving a piece of armour that is not armour.
// Luke: "you cant reroll armor on armor, weapon damage on weapons, and block chance on shields."
export const isIntrinsicStat = (k) => INTRINSIC.has(String(k)) || FRACTION.has(String(k));

// ── SHORT LABELS, FROM ONE PLACE ─────────────────────────────────────────────────────────────────────────────
// Five components each kept their own hand-written {might, crit_chance, crit_power, ferocity, fortune} map, so
// every stat added since — vitality, tenacity, pierce, lifedrink, riposte, double strike, stun, haste, armour,
// damage, attack speed — rendered as a raw key or as nothing at all in the chest reveal, the compendium, the
// fishing haul, the jeweller and the mine. Derived from STAT_META now, so adding a stat there is enough.
export const STAT_SHORT = Object.fromEntries(
    Object.entries(STAT_META).map(([k, m]) => [k, m.short || m.label])
);

export function statValue(k, v) {
    const n = Number(v) || 0;
    if (FRACTION.has(k)) return `${Math.round(n * 100)}%`;
    if (k === "speed") return `${n.toFixed(2)}`;
    return String(Math.round(n * 100) / 100);
}

// ── ONE RENDERER FOR ONE STAT ────────────────────────────────────────────────────────────────────────────────
// Seven surfaces each built the same string by hand — `+${v} ${label}${suffix}` — which was right for the eleven
// affixes that existed when they were written and wrong for every stat added since. A weapon's own damage came
// out as "+24" as though it were a bonus somebody granted you, and a shield's block chance came out as "+0.2%"
// because it is stored as a fraction. So the pieces of a stat line are cut in ONE place and every surface asks
// for them: icon, label, the value already formatted, and whether it takes a plus.
// `bonus: true` says this number is something ADDED to a piece rather than part of it — a forge gain, a set
// tier, a gem. Damage and armour are the piece itself in one context and a bonus in the other, and only the
// caller knows which, so "+4 Damage" off the forge and "23 Damage" on the weapon both come out right.
export function statParts(k, v, { bonus = false } = {}) {
    const m = STAT_META[k] || {};
    const own = (INTRINSIC.has(k) || FRACTION.has(k)) && !bonus;
    // block_chance's percent already comes off statValue; anything else wears its own suffix.
    const suffix = FRACTION.has(k) ? "" : (m.suffix || "");
    return {
        key: k,
        icon: m.icon || "•",
        label: m.label || k,
        desc: m.desc || "",
        value: `${own ? "" : "+"}${statValue(k, v)}${suffix}`,
        intrinsic: own,   // the piece itself, not a bonus on top of it
    };
}

export function describeStat(k, v, opts) {
    const p = statParts(k, v, opts);
    return `${p.value} ${p.label}`;
}

// A piece's base numbers plus whatever the forge added, as one set of totals — what the item IS right now,
// which is the only version of it a member cares about. Lived as three identical private copies.
export function mergeStats(base = {}, bonus = {}) {
    const m = { ...(base || {}) };
    for (const [k, v] of Object.entries(bonus || {})) m[k] = (m[k] || 0) + (Number(v) || 0);
    return m;
}

// The piece's own numbers lead, because they are the thing you are looking at; the affixes follow. Exported
// because the two totals PANELS lay their stats out in a grid rather than a sentence and were printing them in
// whatever order the server happened to build the object — damage and attack speed landing below crit chance,
// which is the last place you look for the number every swing starts from.
export function sortStatKeys(keys = []) {
    const rank = (k) => (INTRINSIC.has(k) ? 0 : FRACTION.has(k) ? 1 : 2);
    return [...keys].sort((a, z) => rank(a) - rank(z));
}

export function describeStats(stats = {}, opts) {
    const keys = sortStatKeys(Object.keys(stats || {}));
    return keys.filter((k) => Number(stats[k])).map((k) => describeStat(k, stats[k], opts)).join(" · ");
}

// ── SEA AFFINITY ── a separate effect layer that ONLY the Sailing systems read (raids/digging/voyages) — kept
// OUT of `stats` so it never touches boss combat or inflates boss power. Gear + pets carry these small integer
// "points"; sailing.js converts points → real effect. See seaEffects() there.
export const SEA_META = {
    broadside: { label: "Broadside", icon: "🗡️", desc: "Your ship's cannons hit harder in a raid." },
    ironclad: { label: "Ironclad", icon: "🛡️", desc: "Your hull takes less damage from enemy volleys in a raid." },
    plunder: { label: "Plunder", icon: "⚓", desc: "A fatter purse from every raid you win — up to +50%." },
    bounty: { label: "Bounty", icon: "💰", desc: "More gold from raid wins and the Gold Merchant." },
    dredge: { label: "Dredge", icon: "⛏️", desc: "Higher chance your dig tools proc while excavating." },
    trove: { label: "Trove", icon: "🔱", desc: "A chest you run out of light on pays more doubloons." },
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
        .map(([k, v]) => { const m = DECO_STATS[k]; return m ? `${textIcon(m.icon)}+${v} ${m.label}` : `+${v} ${k}`; })
        .join(" · ");
}

// ── DEPTHS AFFINITY ── a THIRD quarantined effect layer, exactly like sea and farm, for the Mine. The mine
// shipped reading NOTHING off your gear or your pets: you could be wearing a full mythic loadout and the roof
// still came in at the same rate, the seam still paid the same ore, the furnace still threw the same extras.
// Every other feature in the game rewards the loadout you built; the mine was the one that ignored it.
//
// Six points, two per verb, so a piece can be good at delving without being good at everything:
//   DELVING  — nerve (the roof holds) + lodesense (richer seams down the tunnel)
//   MINING   — hew (more ore per seam) + prospect (better odds of a find at the face)
//   SMELTING — bellows (extra parts out of the furnace) + crucible (better odds out of the slag)
//
// Kept OUT of `stats` so it never touches boss power, and small integer POINTS rather than percentages —
// mining.js owns the points→effect curve and every stacker there is capped. See depthEffects().
export const DEPTH_META = {
    nerve: { label: "Nerve", icon: "🪨", desc: "The roof holds longer — a lower chance the tunnel collapses on you." },
    lodesense: { label: "Lodesense", icon: "🧭", desc: "Richer seams turn up as you descend." },
    hew: { label: "Hew", icon: "⛏️", desc: "More ore out of every seam you crack open." },
    prospect: { label: "Prospecting", icon: "🔦", desc: "Better odds of a bonus find at the rock face." },
    bellows: { label: "Bellows", icon: "🌬️", desc: "A chance the furnace throws in an extra part." },
    crucible: { label: "Crucible", icon: "⚗️", desc: "Better odds of something worth keeping out of the slag." },
};
export function sumItemDepth(itemIds = []) {
    const total = {};
    for (const id of itemIds) {
        const it = itemById(id);
        if (!it?.depth) continue;
        for (const [k, v] of Object.entries(it.depth)) total[k] = (total[k] || 0) + (Number(v) || 0);
    }
    return total;
}
export function describeDepth(depth = {}) {
    return Object.entries(depth).filter(([, v]) => v)
        .map(([k, v]) => { const m = DEPTH_META[k]; return m ? `${m.icon} +${v} ${m.label}` : `+${v} ${k}`; })
        .join(" · ");
}

// ── EVERY PIECE GETS ITS OWN HAND OF AFFIXES ─────────────────────────────────────────────────────────────────
// Luke: "there's no affixes that can only spawn on certain pieces, and there's no pieces that always spawn
// with certain affixes." So the slot gates are gone — any affix can land on any piece — and what makes two
// helmets different is WHICH affixes they drew, not merely how much of each.
//
// Our items are STATIC, not rolled per drop, so "random" here has to mean "varied but fixed": the draw is
// seeded from the item's own id. Same item, same hand, forever, on every server. A Math.random() at module
// load would give the same sword different stats on different serverless instances — a bug that surfaces as
// players arguing about what their own gear says.
//
// The AUTHORED stats stay and count toward the hand. That is the piece's character, hand-written, and it is
// why a Warhammer reads as a Warhammer. Rarity decides how many lines it ends up with; the rest are drawn.
// ── THE DRAW ORDER IS FROZEN, INCLUDING A STAT NOTHING CAN BE GRANTED ANY MORE ───────────────────────────────
// `doublestrike` is retired (see RETIRED_AFFIX) but it stays in THIS list, because the seeded draw below reads
// each affix's INDEX into it: `w` is `hash(id:key) ^ (seed + i)`. Take one entry out and every affix after it
// shifts its i, its weight, and therefore where it lands in the sort — so removing the retired stat from the
// ordering would silently redraw stun and haste across the whole catalogue and change gear members are already
// wearing. The retirement is applied to what is GRANTED, not to what is drawn.
const AFFIX_DRAW_ORDER = ["might", "crit_chance", "crit_power", "ferocity", "fortune",
    "vitality", "tenacity", "pierce", "lifesteal", "counter", "doublestrike", "stun", "haste"];

// ── AND WHAT A RETIRED AFFIX BECOMES ─────────────────────────────────────────────────────────────────────────
// Luke: "I feel like we should try to get rid of double strike entirely even under the hood. That way the
// calculation gets a little bit simpler. And wherever we hand out double strike, we would just convert that to
// ferocity as a stat."
//
// `doublestrike` was named for a mechanic that no longer exists — nothing swings twice. What the points bought
// was TEMPO, through a second conversion in kitFor, which is what Ferocity buys through a shorter one. So the
// stat is not removed from a piece, it is RELABELLED: the same points, on the stat that already does the job.
//
// One for one. The tempo-equivalent rate is 0.225 ferocity per point, which rounds most holdings to nothing —
// and the stat was inverted against its own rarity anyway, drawing as a PRIZE (weight 7, level with Riposte)
// while paying about a ninth of what ordinary Ferocity pays. 1:1 corrects that rather than granting anything.
//
// Keyed on the ORIGINAL stat when the value is rolled, so a retired affix keeps its own point-style size
// rather than inheriting Ferocity's larger BIG_STATS roll. Same points, different name.
const RETIRED_AFFIX = { doublestrike: "ferocity" };

// What can still be GRANTED — by the seeded draw, and by the Forge, which draws from this same list.
export const AFFIX_POOL = AFFIX_DRAW_ORDER.filter((k) => !RETIRED_AFFIX[k]);

// The ladder that makes rarity mean more than bigger numbers: a legendary is not a stronger epic, it does
// more things at once.
const AFFIX_COUNT = { common: 2, rare: 2, epic: 3, legendary: 3, mythic: 4, ascendant: 4, eternal: 5, celestial: 5, primordial: 6 };
// ── AND HOW MANY IT CAN EVER HOLD ────────────────────────────────────────────────────────────────────────────
// AFFIX_COUNT is what a piece is BORN with. This is its ceiling — the difference between the two is the empty
// sockets only the Forge can fill, which is the ARPG shape Luke described: some stats guaranteed, some earned.
//
// Two forge slots on everything, so the shape of the promise is the same at every rarity and it is the BASE
// that makes a primordial special (6 innate + 2 forged = 8) rather than a bigger allowance. It also means a
// common piece is worth forging at all, which it would not be if the slots scaled with rarity too.
const FORGE_SLOTS = 2;
export const affixesBornWith = (rarity) => AFFIX_COUNT[rarity] || 2;
export const affixCeiling = (rarity) => affixesBornWith(rarity) + FORGE_SLOTS;
// How scarce each affix is in the draw. 1 = ordinary, higher = rarer. Lifedrink and Riposte are the two that
// change how a fight FEELS rather than how big a number is, so they are the prizes; Pierce sits between,
// because it is the counter to a whole archetype and should not be on every third item either.
// Luke's order, hardest first: counter and doublestrike are the two prizes and sit level with each other,
// lifesteal is next, then pierce. Everything above them is ordinary. Higher = scarcer.
const AFFIX_RARITY = {
    might: 1, crit_chance: 1, crit_power: 1, ferocity: 1, fortune: 1, vitality: 1,
    tenacity: 1.5, pierce: 3, lifesteal: 5, counter: 7, doublestrike: 7,
    // The two effect affixes sit level with the rarest of the rest.
    stun: 7, haste: 7,
};

// ── AND THE SAME SCARCITY WHEN YOU REFORGE ───────────────────────────────────────────────────────────────────
// The draw order above only governs what a piece is BORN with. Reforging picked uniformly at random from
// whatever the piece did not already have, so every swap was an even chance at Doublestrike — the rarest
// affix in the game was the easiest thing to reforge into, which is the opposite of the ladder.
//
// Weight is 1/rarity, so an ordinary stat comes up seven times as often as a prize.
export function pickWeightedAffix(pool, rand = Math.random) {
    if (!pool || !pool.length) return null;
    const weights = pool.map((k) => 1 / (AFFIX_RARITY[k] || 1));
    const total = weights.reduce((a, b) => a + b, 0);
    let r = rand() * total;
    for (let i = 0; i < pool.length; i += 1) { r -= weights[i]; if (r <= 0) return pool[i]; }
    return pool[pool.length - 1];
}
const AFFIX_TIER = { common: 1, rare: 2, epic: 3, legendary: 4, mythic: 5, ascendant: 6, eternal: 7, celestial: 8, primordial: 9 };
// Percent-style stats carry bigger numbers than the point-style ones.
const BIG_STATS = new Set(["might", "crit_chance", "crit_power", "ferocity", "fortune", "vitality"]);

// A small stable hash — deterministic across processes and deploys, which Math.random() is not.
const affixSeed = (str) => {
    let h = 2166136261;
    for (let i = 0; i < str.length; i += 1) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
};

// What the DESIGNER wrote, captured before the draw adds a thing. The coverage pass below needs to tell
// authored lines from drawn ones, and after the loop has run there is no way to tell them apart.
const AUTHORED_STATS = new Map(ITEMS.map((it) => [it.id, new Set(Object.keys(it.stats || {}))]));

for (const it of ITEMS) {
    if (!it.stats) continue;
    const counted = () => Object.keys(it.stats).filter((k) => k !== "extra_strike").length;
    const authored = Object.keys(it.stats).filter((k) => k !== "extra_strike");
    const want = AFFIX_COUNT[it.rarity] || 2;
    if (counted() >= want) continue;   // already richer than its rarity asks; leave the author's work alone

    // ── SOME AFFIXES ARE RARER THAN OTHERS ───────────────────────────────────────────────────────────────
    // Luke: "lifesteal would be a pretty rare affix." An even draw made Lifedrink as common as Might, which
    // is the opposite of what makes an affix worth finding. WEIGHT pushes a stat down the draw order — the
    // higher the weight the further it sinks, so it only surfaces on pieces rich enough to reach that deep.
    // Nothing is barred from any slot; the scarce ones are simply scarce.
    const seed = affixSeed(it.id);
    // AFFIX_DRAW_ORDER, not AFFIX_POOL — see the note on it. The draw is unchanged by a retirement; only the
    // name the points land under is.
    const order = AFFIX_DRAW_ORDER
        .map((k, i) => ({ k, w: (affixSeed(`${it.id}:${k}`) ^ (seed + i)) / (AFFIX_RARITY[k] || 1) }))
        .sort((a, b) => b.w - a.w)
        .map((x) => x.k)
        // ⚠️ NOT ALSO FILTERED ON WHAT A RETIRED AFFIX CONVERTS TO. Doing that dropped the retired draw
        // entirely on any piece whose author had already written the destination stat by hand, and the loop
        // handed out the NEXT affix in the order instead: primordial_elder_waistguard came back with a
        // Riposte it had never had and 21 Ferocity where it should carry 28. A retirement relabels points,
        // it does not forfeit a draw — so it stays in the order and MERGES.
        .filter((k) => !authored.includes(k));

    const tier = AFFIX_TIER[it.rarity] || 1;
    // ⚠️ COUNTED SEPARATELY, not re-read off the key count. A retired affix MERGES into the stat it converts
    // to, so an item that drew it onto a piece already carrying ferocity would come back with the same number
    // of keys — and a loop testing `counted() >= want` would read that as "still short" and grant an extra
    // line the piece was never meant to have.
    let filled = counted();
    for (const k of order) {
        if (filled >= want) break;
        // Varies per item as well as per rarity, so two pieces that drew the same affix rarely carry the
        // same amount of it.
        const jitter = (affixSeed(`${it.id}#${k}`) % 3) - 1;
        const value = BIG_STATS.has(k) ? Math.max(2, tier * 2 + jitter * 2) : Math.max(1, Math.round(tier * 0.8) + jitter);
        const grant = RETIRED_AFFIX[k] || k;
        it.stats[grant] = (it.stats[grant] || 0) + value;
        filled += 1;
    }
}

// ── EVERY SLOT OFFERS EVERY PROC ─────────────────────────────────────────────────────────────────────────────
// Luke: "I think every slot should offer these stats, and allow rerolling to them."
//
// Nothing barred them — the slot gates went long ago and any affix can land on any piece. But the draw is
// weighted by scarcity (counter and stun and haste at 7, lifedrink at 5) and seeded per item, so with only
// thirty pieces in a slot the scarce ones simply never came up. Counted: counter appeared in 2 slots of 9,
// lifedrink in 3, stun in 3. A member who wanted a riposte build could not shop for one — there was no belt,
// no chest, no weapon, no ring that had ever rolled it.
//
// So coverage is guaranteed rather than hoped for: every slot carries at least PROC_PER_SLOT pieces of each.
//
// ⚠️ IT SWAPS, IT DOES NOT ADD. Handing an item another line would raise its affix count past what its rarity
// is allowed (AFFIX_COUNT) and quietly make every piece stronger. The lowest-value DRAWN affix is replaced
// instead — never an authored one, because that is the designer's statement about what the piece is — so the
// hand stays the same size and the piece keeps its character.
//
// Deterministic off the item id like every other draw here, so a piece never changes on somebody.
const PROC_STATS = ["pierce", "lifesteal", "counter", "stun", "haste"];
const PROC_PER_SLOT = 3;
{
    // ⚠️ AUTHORED_STATS IS SNAPSHOTTED BEFORE THE DRAW, and it has to be. My first pass built this map here,
    // after the loop above had run, so it held the designer's lines AND the drawn ones — every stat looked
    // authored, `swappable` came back empty on every item, and the whole pass silently did nothing. The
    // coverage table came out byte-identical, which is exactly what a no-op looks like from the outside.
    const authoredOf = AUTHORED_STATS;

    const slots = [...new Set(ITEMS.map((i) => i.slot))].filter(Boolean).sort();
    for (const slot of slots) {
        const pool = ITEMS.filter((i) => i.slot === slot && i.stats);
        for (const proc of PROC_STATS) {
            const has = pool.filter((i) => (i.stats[proc] || 0) > 0);
            let need = PROC_PER_SLOT - has.length;
            if (need <= 0) continue;
            // Candidates: pieces that do not already carry it, ordered by the item's own hash so the choice is
            // stable and spread across rarities rather than always landing on the same few.
            const cands = pool
                .filter((i) => !(i.stats[proc] > 0))
                .sort((a, b) => (affixSeed(`${a.id}~${proc}`) % 100000) - (affixSeed(`${b.id}~${proc}`) % 100000));
            for (const it of cands) {
                if (need <= 0) break;
                // The cheapest DRAWN line on the piece. Authored stats and intrinsics are never taken.
                const cheapest = (keys) => keys.sort((a, b) => (it.stats[a] || 0) - (it.stats[b] || 0))[0];
                const notProc = Object.keys(it.stats).filter((k) => !isIntrinsicStat(k) && !PROC_STATS.includes(k));
                // A drawn line first — the piece's own character is the designer's and is not ours to spend.
                let from = cheapest(notProc.filter((k) => !authoredOf.get(it.id).has(k)));
                // ── AND A LAST RESORT, BECAUSE SOME PIECES ARE ENTIRELY HAND-WRITTEN ──────────────────
                // Six slot/proc pairs stayed empty on the first run: every main_hand is authored down to the
                // last line, so there was never a drawn affix to give up and the pass skipped all sixty. The
                // smallest authored line goes instead — one or two points on a piece that has four or five —
                // which costs the design less than a slot that can never roll a riposte at all.
                if (!from) from = cheapest(notProc);
                if (!from) continue;
                const tier = AFFIX_TIER[it.rarity] || 1;
                const jitter = (affixSeed(`${it.id}#${proc}`) % 3) - 1;
                delete it.stats[from];
                // Point-style, exactly as the draw values a proc — never the BIG_STATS size, which is what a
                // Might or Vitality line gets.
                it.stats[proc] = Math.max(1, Math.round(tier * 0.8) + jitter);
                need -= 1;
            }
        }
    }
}

// ── AND NO TWO PIECES END UP IDENTICAL ───────────────────────────────────────────────────────────────────────
// The affix rule above took same-slot, same-rarity duplicates from 303 items to 36 — but it SKIPS anything
// already at its affix count, and a rare piece gets two affixes and was usually authored with exactly two. So
// four rare main-hands still read {might 11, crit_chance 5} to the letter.
//
// This nudges the VALUES on the duplicates rather than adding or swapping stats: the author said this sword is
// a might-and-crit sword and it stays one, it just is not the same might-and-crit sword as the three beside
// it. Deterministic off the id like everything else, so a piece never changes on you.
//
// Only the second and later members of a duplicate group move. The first keeps the authored numbers exactly,
// so the "canonical" version of a stat block is still the one that was written by hand.
{
    const seen = new Map();
    for (const it of ITEMS) {
        if (!it.stats) continue;
        const keys = Object.keys(it.stats).filter((k) => k !== "extra_strike").sort();
        if (!keys.length) continue;
        const sig = `${it.slot}/${it.rarity}|${keys.map((k) => `${k}:${it.stats[k]}`).join(",")}`;
        const n = seen.get(sig) || 0;
        seen.set(sig, n + 1);
        if (n === 0) continue;                       // first of its kind keeps the authored numbers
        for (const k of keys) {
            // +/-1 or 2, never below 1, and never more than ~20% off what was authored.
            const step = ((affixSeed(`${it.id}~${k}`) % 5) - 2);
            if (!step) continue;
            const base = Number(it.stats[k]) || 0;
            const bound = Math.max(1, Math.round(base * 0.2));
            it.stats[k] = Math.max(1, base + Math.max(-bound, Math.min(bound, step)));
        }
    }
}

// ── WHAT THE FORGE DOES TO A PIECE, IN ONE PLACE ─────────────────────────────────────────────────────────────
// These were private to crafting.js, which is server-only — so anything else that needed to know what a forged
// piece looks like had to write the numbers out again, and a copied balance number is a second, quietly
// different game. arena-npc.js needs them because a rung high on the ladder should look like somebody who has
// actually WORKED their gear: enhanced every piece, and rerolled the affixes they did not want into the ones
// they did. That is what a real player at that height has done, so it is what they should be facing.
export const FORGE = {
    // ── THERE IS NO PER-STAT CAP ANY MORE ────────────────────────────────────────────────────────────────
    // This used to be CAP_FRAC: an affix could be forged up by half its printed value again and no further.
    // Luke, 2026-08-22: "no caps." A forged line now grows for as long as you keep feeding it parts.
    //
    // What is left below is NOT that cap wearing a new name. NPC_LIFT is the Long Road's own model of how
    // much a forged set is worth, and it happened to be written in terms of the cap because, while the cap
    // existed, the cap WAS the answer. Deleting the cap and leaving that expression alone would have
    // silently re-tuned the entire ladder, so the number the Road was actually built against is kept here,
    // under its own name, decoupled.
    //
    // It is now a FLOOR on what the Road assumes rather than a ceiling on what you can reach: players can
    // forge past it. Retuning it is a telemetry job, not a guess — run scripts/arena-report.mjs against real
    // fights first.
    NPC_LIFT: 0.5,
    // What an enhance adds to the piece ITSELF, per level, as a share of its own base.
    WEAPON_PER_LEVEL: [0.03, 0.05],
    ARMOUR_PER_LEVEL: [0.05, 0.08],
    // The peak — three prismatic stars. Mirrors MAX_FORGE_LEVEL in forge-rank.js.
    MAX_LEVEL: 21,
};
// The midpoints, for anything reconstructing an average forged piece rather than rolling one.
export const forgeWeaponRate = (FORGE.WEAPON_PER_LEVEL[0] + FORGE.WEAPON_PER_LEVEL[1]) / 2;
export const forgeArmourRate = (FORGE.ARMOUR_PER_LEVEL[0] + FORGE.ARMOUR_PER_LEVEL[1]) / 2;
