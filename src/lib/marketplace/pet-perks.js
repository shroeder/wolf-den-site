// Each pet's EQUIPPED signature perk — a unique, flavor-named ability (not just a stat). Perks map to real
// mechanics that feed the boss fight (see pet-combat.js + boss.js). Client-safe (no server-only / db) so the
// pets page can render them and the server can compute combat bonuses from the same source.
import { effectFor } from "@/lib/marketplace/pet-ascension-effects.js";
import { petPassive, petSpecialPassive, petActiveLevelMult, petPassiveLevelMult } from "@/lib/marketplace/collectibles.js";

export const PET_ACTIVE_BY_RARITY = { common: 3, rare: 5, epic: 8, legendary: 12, mythic: 16, ascendant: 22, eternal: 30 };
// Passive gold income rate: each gold_find point → this many gold/hour. Single source of truth shared by the
// income settler (pet-income.js) and the perk/owned-bonus display. Nerfed to 1/5 of the original 2.
export const GOLD_PER_POINT = 0.4;
// Fortune → boss-raffle tickets: each fortune point banks this many tickets PER DAY the boss is alive (shared
// by the display here + the draw math in boss.js, so they never drift). Nerfed 3→1 (2026-07-28): at 3/day the
// guaranteed fortune haul (fortune×3×days = up to ~84/week) swamped the damage-earned tickets — too strong.
export const TICKETS_PER_FORTUNE_PER_DAY = 1;
const FIRST_HIT_BY_RARITY = { common: 1.3, rare: 1.5, epic: 1.8, legendary: 2.2, mythic: 2.6, ascendant: 3.0, eternal: 3.5 };
const ERUPT_BY_RARITY = {
    common: { chance: 0.08, mult: 1.5 }, rare: { chance: 0.1, mult: 1.6 }, epic: { chance: 0.12, mult: 1.8 },
    legendary: { chance: 0.15, mult: 2.0 }, mythic: { chance: 0.18, mult: 2.3 }, ascendant: { chance: 0.2, mult: 2.6 }, eternal: { chance: 0.25, mult: 3.0 },
};
// Cool mechanics (not stat sticks): chance to strike twice; big damage on a low-HP boss; bonus for hitting early.
const CHAIN_BY_RARITY = { common: 0.08, rare: 0.1, epic: 0.15, legendary: 0.2, mythic: 0.28, ascendant: 0.35, eternal: 0.45 };
const EXECUTE_BY_RARITY = { common: 0.15, rare: 0.2, epic: 0.3, legendary: 0.45, mythic: 0.65, ascendant: 0.85, eternal: 1.1 };
const FIRSTBLOOD_BY_RARITY = { common: 0.15, rare: 0.2, epic: 0.35, legendary: 0.5, mythic: 0.7, ascendant: 0.9, eternal: 1.2 };
// Onslaught (opener) — bonus while the boss is FRESH (above 75% HP). The mirror of execute; a distinct proc so
// elite openers (the Phoenix) don't clone a low-HP finisher.
const ONSLAUGHT_BY_RARITY = { common: 0.15, rare: 0.2, epic: 0.3, legendary: 0.45, mythic: 0.65, ascendant: 0.85, eternal: 1.1 };

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
    onslaught: { icon: "🌅", kind: "proc" },
    first_blood: { icon: "🩸", kind: "proc" },
    xp_gain: { icon: "✨", kind: "econ" },
    gold_find: { icon: "💰", kind: "econ" },
    // ── SYSTEM PERKS ─────────────────────────────────────────────────────────────────────────────────────
    // Every active perk above points at the boss fight. 98 pets, 14 keys, all combat — so a farmer, a sailor
    // and an angler all chose their companion off the same list of damage modifiers, and the newer half of the
    // game had no pet that cared about it. These do.
    farm_yield:   { icon: "🌾", kind: "farm" },
    farm_speed:   { icon: "⏱️", kind: "farm" },
    farm_seed:    { icon: "🌱", kind: "farm" },
    angler_bite:  { icon: "🎣", kind: "sea" },
    angler_size:  { icon: "📏", kind: "sea" },
    sea_dredge:   { icon: "⚓", kind: "sea" },
    sea_plunder:  { icon: "🏴", kind: "sea" },
    kitchen_heat: { icon: "🔥", kind: "kitchen" },
    kitchen_larder:{ icon: "🧺", kind: "kitchen" },
    kitchen_portion:{ icon: "🍲", kind: "kitchen" },
    kitchen_prep:  { icon: "🔪", kind: "kitchen" },
    forge_spark:  { icon: "🔨", kind: "forge" },
    forge_salvage:{ icon: "♦", kind: "forge" },
    town_haggle:  { icon: "🧳", kind: "town" },
    town_rally:   { icon: "🏘️", kind: "town" },
    chest_luck:   { icon: "🧰", kind: "econ" },
    // ── The eight designed in review ─────────────────────────────────────────────────────────────────────
    green_thumb:  { icon: "🌿", kind: "farm" },
    pack_visit:   { icon: "🐕", kind: "farm" },
    truffle_hog:  { icon: "🐖", kind: "farm" },
    night_angler: { icon: "🌙", kind: "sea" },
    second_wind:  { icon: "💨", kind: "sea" },
    storm_sense:  { icon: "⛈️", kind: "sea" },
    following_sea:{ icon: "🌊", kind: "sea" },
    beachcomber:  { icon: "🏖️", kind: "sea" },
    recipe_nose:  { icon: "📜", kind: "kitchen" },
    // ── THE PASSIVE STATS, AS GRAFT TARGETS ──────────────────────────────────────────────────────────────
    // These are normally carried by every owned pet rather than granted by an ability, so they were never in
    // this table — nothing looked one up. A Lightstone that teaches a seahorse to hold a line grafts
    // `reelStrength`, and without an entry here the card rendered with no icon and, worse, no sentence at all.
    seedLuck:     { icon: "🌱", kind: "farm" },
    growSpeed:    { icon: "⏱️", kind: "farm" },
    petXp:        { icon: "🐾", kind: "farm" },
    angling:      { icon: "🎣", kind: "sea" },
    reelStrength: { icon: "🪢", kind: "sea" },
    seafaring:    { icon: "🧭", kind: "sea" },
};

// petId → { name, key }. The NAME is the flavor; the KEY is the mechanic. (Passive stat lives in
// collectibles.js PET_PASSIVE_STAT — every pet is a unique passive+active pairing.)
// An enshrined pet's active is worth what a level-6 pet's active is worth, because it IS one.
const PET_ENSHRINED_LEVEL = 6;

export const PET_PERKS = {
    // ── The twenty that fell through ──────────────────────────────────────────────────────────────────────
    // These had NO entry here, so petPerk() fell back to { name: "Companion", key: activeStat || "fortune" }.
    // A mythic fishing pet whose signature ability was called "Companion". Worse for the kitchen five: their
    // activeStat is a cooking key, which perkDesc has no case for (blank description) and which add() drops
    // (no effect) — so the rarest pets in the game displayed an empty perk that did nothing.
    //
    // Each one now points at the system it was earned in.
    // Kitchen
    pantry_mouse: { name: "Squirreled Away", key: "kitchen_larder" },
    copper_kettle: { name: "Second Boil", key: "kitchen_prep" },
    hearth_cat: { name: "Banked Embers", key: "kitchen_heat" },
    spice_moth: { name: "Second Helping", key: "kitchen_portion" },
    gourmand_dragon: { name: "Gourmand's Palate", key: "recipe_nose" },
    // Fishing
    reef_seahorse: { name: "Reef Sense", key: "angler_bite" },
    lantern_jelly: { name: "Lantern Glow", key: "sea_dredge" },
    deep_angler: { name: "Deepwater Pull", key: "angler_size" },
    tidecaller: { name: "Call the Tide", key: "sea_plunder" },
    // Town raids
    warbanner_wolf: { name: "Warbanner", key: "town_rally" },
    goblin_warchief: { name: "Warchief's Roar", key: "town_rally" },
    bandit_shade: { name: "Cutpurse", key: "chest_luck" },
    golem_heart: { name: "Forgeheart", key: "forge_salvage" },
    // Chest-found sea creatures
    corsair_parrot: { name: "Corsair's Share", key: "sea_plunder" },
    marlin: { name: "Billfish Run", key: "angler_size" },
    anglerfish: { name: "Luring Light", key: "angler_bite" },
    sea_wyrm: { name: "Wyrm's Trench", key: "sea_dredge" },
    // ── THE TEN THAT STILL FELL THROUGH ───────────────────────────────────────────────────────────────────
    // The mine's five and the ship's five were never added here, so petPerk() still handed them the same
    // `{ name: "Companion", key: activeStat }` the twenty above were rescued from — an epic sea turtle whose
    // signature ability was called "Companion". Found by GrayKitsune noticing the downstream half of it: with
    // no authored ability there was nothing for a Lightstone to be about, so both of its stones came out of
    // the dull fallback and one was strictly weaker than the other.
    //
    // Each points at the system it was earned in, exactly as the twenty do.
    // The mine
    tunnel_worm: { name: "Follows the Seam", key: "xp_gain" },
    pit_beetle: { name: "Pit-Bred", key: "ferocity" },
    cinder_scarab: { name: "Cinder Shell", key: "crit_power" },
    geode_sprite: { name: "Geode Sense", key: "fortune" },
    deep_golem: { name: "Weight of the Deep", key: "might" },
    // The ship
    powder_monkey: { name: "Powder Runner", key: "crit_chance" },
    ironback: { name: "Ironclad Hide", key: "might" },
    stormcrow: { name: "Storm-Picked", key: "gold_find" },
    chain_shrike: { name: "Chainshot", key: "crit_power" },
    bosun_shade: { name: "The Bosun's Call", key: "ferocity" },
    // Prestige achievement pets
    spirit_fox: { name: "Spirit's Favour", key: "fortune" },
    runebound_drake: { name: "Runebound", key: "forge_spark" },
    radiant_phoenix: { name: "Radiant Fortune", key: "chest_luck" },
    // Level
    bunny: { name: "Burrow Bounty", key: "farm_yield" }, frog: { name: "Tongue Lash", key: "first_hit" }, chick: { name: "Scratch & Peck", key: "farm_seed" },
    kitten: { name: "Nine Lives", key: "crit_chance" }, fox_kit: { name: "Sly Strike", key: "crit_chance" }, wolf_pup: { name: "Pack Instinct", key: "might" },
    owl: { name: "Night Study", key: "xp_gain" }, bear_cub: { name: "Bear Hug", key: "might" }, raven: { name: "Hoard Sense", key: "chest_luck" },
    serpent: { name: "Venom Fang", key: "crit_power" }, fawn: { name: "Gentle Graze", key: "farm_speed" }, bat: { name: "Echolocate", key: "crit_chance" },
    scorpion: { name: "Stinger", key: "crit_power" }, tiger_cub: { name: "Ambush", key: "first_hit" }, seahorse: { name: "Shallows Sense", key: "angler_bite" },
    eagle: { name: "Keen Eye", key: "crit_chance" }, lion_cub: { name: "Pouncing Roar", key: "first_hit" }, gorilla: { name: "Plaza Bruiser", key: "town_rally" },
    croc: { name: "River Plunder", key: "sea_plunder" }, hydra: { name: "Hydra Heads", key: "chain_strike" }, griffin: { name: "Sky Dive", key: "execute" },
    unicorn: { name: "Wish Granted", key: "fortune" }, dragon_whelp: { name: "Ember Burst", key: "erupt" }, pegasus: { name: "Tailwind", key: "xp_gain" },
    baby_rex: { name: "Apex Bite", key: "execute" }, sky_whale: { name: "Leviathan Wake", key: "angler_size" }, chameleon: { name: "Prismatic Hex", key: "crit_power" },
    elder_dragon: { name: "Cataclysm", key: "execute" },
    // Shop
    penguin: { name: "Cold Diver", key: "sea_dredge" }, hedgehog: { name: "Sharp Bargain", key: "town_haggle" }, sheep: { name: "Golden Fleece", key: "farm_yield" },
    crab: { name: "Seabed Sifter", key: "sea_dredge" }, turtle: { name: "Deep Hauler", key: "angler_size" }, parrot: { name: "Recipe Mimic", key: "recipe_nose" },
    dolphin: { name: "Pod Scout", key: "angler_bite" }, monkey: { name: "Quick Hands", key: "kitchen_heat" }, panda: { name: "Bamboo Glut", key: "farm_yield" },
    kangaroo: { name: "Plaza Kick", key: "town_rally" },
    // Achievement
    ladybug: { name: "Aphid Patrol", key: "farm_speed" }, bee: { name: "Pollinator", key: "farm_yield" }, sloth: { name: "Slow Ripening", key: "farm_seed" },
    beaver: { name: "Irrigator", key: "farm_speed" }, raccoon: { name: "Pantry Raider", key: "kitchen_larder" }, flamingo: { name: "Struts the Plaza", key: "town_haggle" },
    toucan: { name: "Sweet Tooth", key: "recipe_nose" },
    // Forge (earned at The Forge)
    ember_whelp: { name: "Ember Spark", key: "forge_spark" }, cinder_hound: { name: "Scrap Nose", key: "forge_salvage" },
    anvil_golem: { name: "Hammerfall", key: "forge_salvage" }, molten_salamander: { name: "Magma Temper", key: "forge_spark" },
    forgeheart_wyrm: { name: "Forgefire", key: "onslaught" },
    // Chest
    tropical_fish: { name: "Reef Caller", key: "angler_bite" }, axolotl: { name: "Silt Sifter", key: "sea_dredge" }, butterfly: { name: "Lucky Flutter", key: "chest_luck" },
    squid: { name: "Ink Ambush", key: "crit_chance" }, jellyfish: { name: "Sting Surge", key: "erupt" }, octopus: { name: "Eight Arms", key: "extra_strike" },
    // Boss
    vulture: { name: "Circling Death", key: "first_blood" }, minotaur: { name: "Charge", key: "first_blood" }, centaur: { name: "Opening Volley", key: "first_hit" },
    imp: { name: "Hellfire", key: "erupt" }, polar_bear: { name: "Frozen Crush", key: "execute" }, mammoth: { name: "Trample", key: "extra_strike" },
    wyvern: { name: "Dive Bomb", key: "first_hit" }, sea_serpent: { name: "Tidal Wrath", key: "chain_strike" }, fairy: { name: "Pixie Ambush", key: "first_blood" },
    kraken: { name: "Tentacle Flurry", key: "chain_strike" },
    // Elite
    molten_phoenix: { name: "Rebirth Flame", key: "onslaught" }, eternal_wolf: { name: "Spirit Frenzy", key: "extra_strike" }, bounty_hound: { name: "On the Hunt", key: "first_blood" },
    // Merchant (its signature ability — boosting Gold-Merchant find chance — is applied in sailing.js, not combat)
    elephant_spear: { name: "Merchant's Nose", key: "gold_find", note: "Unique: while equipped, boosts your chance to find the Gold Merchant at sea (+1% per pet level, up to +5%)." },
    // Farm/pastoral pets — a farm passive (in collectibles PET_PASSIVE_STAT) PLUS a combat active so they still
    // fight. Actives are ordinary combat keys (nothing farm-specific here).
    honeybee: { name: "Following Wind", key: "following_sea" }, barn_cat: { name: "Night Prowler", key: "night_angler" },
    piglet: { name: "Truffle Snout", key: "truffle_hog" }, hen: { name: "Broody Hen", key: "green_thumb" },
    spring_lamb: { name: "Spring Lamb", key: "pack_visit" }, scarecrow_crow: { name: "Storm Caller", key: "storm_sense" },
    field_mouse: { name: "Quick Whiskers", key: "second_wind" }, golden_goose: { name: "Beachcomber", key: "beachcomber" },
};

// The scaled value for a perk mechanic at a rarity. Proc perks return an object.
// ── CAPS ──────────────────────────────────────────────────────────────────────────────────────────────────
// PET_ACTIVE_BY_RARITY runs 3 (common) to 30 (eternal), and the Lv5 active multiplier is x3 — so an eternal
// pet at Lv5 lands on NINETY before any consumer sees it. Uncapped that reads as "90% chance an enhance costs
// no parts", "90% chance a cook consumes nothing", "90% of chests promote a rarity". Each of those breaks the
// system it points at.
//
// Two of the fifteen happened to be capped because a Math.min got written at the call site. That's not a
// policy, it's luck, and it's the wrong place for it — a cap belongs where the value is produced, once, where
// you can read them all together and see the shape.
//
// Numbers chosen so a maxed top-rarity companion is clearly the best in its niche without removing the system:
// a 30% double-harvest is a great pet, a 90% one means you stop noticing harvests.
export const SYSTEM_PERK_CAP = {
    farm_yield: 30,     // double-harvest chance
    farm_speed: 25,     // crop grow-time reduction
    farm_seed: 25,      // bonus seed on harvest
    angler_bite: 25,    // tilt toward rarer fish
    angler_size: 20,    // measured length
    sea_dredge: 20,     // treasure instead of a fish
    sea_plunder: 35,    // raid + sea-merchant gold
    kitchen_heat: 25,   // tier bump
    kitchen_larder: 12, // free ingredients — halved with the Larder track; the two stack into one roll
    kitchen_portion: 30, // second helping — doubles the whole reward, so it stays under a third
    kitchen_prep: 35,    // an extra prepped ingredient; cheapest of the kitchen perks, so the loosest
    recipe_nose: 40,    // multiplies drop odds that are already small
    forge_spark: 20,    // free enhance — the most abusable, so the tightest
    forge_salvage: 30,  // double parts
    town_haggle: 30,    // merchant discount
    town_rally: 40,     // town-raid damage
    chest_luck: 20,     // rarity promotion
    green_thumb: 40,    // a seed from rating; rating is already daily-capped
    pack_visit: 50,     // share of the XP, never more than half
    truffle_hog: 100,   // +100% = the 2x ceiling agreed in review
    night_angler: 30,   // only applies outside store hours
    second_wind: 1,     // binary — one free recharge, not a scaling percentage
    storm_sense: 25,    // only applies in real rain
    following_sea: 25,  // agreed cap: a 4h voyage lands at 3h, not 2h26
    beachcomber: 20,    // /10 in the description -> +2 finds at cap
};

// ── THE PROC CEILINGS, IN ONE PLACE ──────────────────────────────────────────────────────────────────────────
// These were written inline at the point of use — `cap(v * aMult, 1.2)` — which was fine while the only thing
// that read them was the engine. The enshrining panel has to show what a stone WOULD do before an irreversible
// choice, and it was computing that number without the ceilings: the Molten Phoenix's Darkstone advertised
// "+170% damage" against an onslaught cap of 120%. A card that overstates by fifty points on a permanent
// decision is worse than no card. One table, read by both.
export const PROC_CAP = {
    erupt: 0.6,          // the chance, not the multiplier
    chain_strike: 0.6,
    execute: 1.2,
    onslaught: 1.2,
    first_blood: 1.2,
};

export function petPerkValue(rarity, key) {
    if (key === "extra_strike") return 1; // a pet grants EXACTLY one extra daily strike — never rarity/level-scaled
    if (key === "first_hit") return FIRST_HIT_BY_RARITY[rarity] || 1.5;
    if (key === "erupt") return ERUPT_BY_RARITY[rarity] || ERUPT_BY_RARITY.epic;
    if (key === "chain_strike") return CHAIN_BY_RARITY[rarity] || 0.1;
    if (key === "execute") return EXECUTE_BY_RARITY[rarity] || 0.3;
    if (key === "onslaught") return ONSLAUGHT_BY_RARITY[rarity] || 0.3;
    if (key === "first_blood") return FIRSTBLOOD_BY_RARITY[rarity] || 0.3;
    return PET_ACTIVE_BY_RARITY[rarity] || 3;
}

/**
 * The value a consumer should actually use — capped, and after the pet's level multiplier.
 *
 * Consumers must go through combinePetBonuses/getPetSystemPerk rather than reading raw values, so the cap can
 * never be skipped by a call site that forgot about it.
 */
export function capSystemPerk(key, value) {
    const cap = SYSTEM_PERK_CAP[key];
    return cap == null ? value : Math.min(cap, value);
}

function perkDesc(key, v, level = 1) {
    switch (key) {
        case "might": return `+${v}% damage — passive auto-damage AND your daily strike`;
        case "crit_chance": return `+${v}% crit chance — passive and your daily strike`;
        case "crit_power": return `+${v}% crit damage — passive and your daily strike`;
        case "ferocity": return `+${v}% PASSIVE auto-damage only (24/7)`;
        case "fortune": return `+${v * TICKETS_PER_FORTUNE_PER_DAY} boss-raffle tickets per day (banked all week)`;
        case "extra_strike": { const c = Math.min(100, 20 + 20 * (Math.max(1, level) - 1)); return `${c}% chance for an extra daily strike${c < 100 ? " — rises to 100% by Lv 5" : " (maxed — every day!)"}`; }
        case "first_hit": return `Your first MANUAL strike each day (your daily boss tap) deals ×${v} damage — passive auto-damage isn't affected`;
        case "erupt": return `${Math.round(v.chance * 100)}% chance your strike erupts for ×${v.mult}`;
        case "chain_strike": return `${Math.round(v * 100)}% chance your strike lands TWICE`;
        case "execute": return `+${Math.round(v * 100)}% damage when the boss is below 30% HP`;
        case "onslaught": return `+${Math.round(v * 100)}% damage while the boss is above 75% HP`;
        case "first_blood": return `+${Math.round(v * 100)}% damage if you're among the first 3 to hit the boss today`;
        // Earner stats generate passive income over time (see pet-income.js: 1 xp-pt→1 XP/hr, 1 gold-pt→2 gold/hr
        // at the equipped rate, and more as the pet levels), paid out when you next check in.
        case "xp_gain": return `Earns you passive XP — about +${v}/hr while equipped (more as it levels), paid when you check in`;
        case "gold_find": return `Earns you passive gold — about +${Math.max(1, Math.round(v * GOLD_PER_POINT))}/hr while equipped (more as it levels), paid when you check in`;
        // FARM passives (pastoral pets) — help the farm, not the boss. Shown when the pet is equipped as a farm companion.
        case "seedLuck": return `+${v}% seed luck on your farm while equipped — more seeds found and kept`;
        case "growSpeed": return `−${v}% crop grow time on your farm while equipped`;
        case "petXp": return `+${v}% pet XP from tending your farm while equipped`;
        case "angling": return `+${v} angling — your casts hook better fish`;
        case "reelStrength": return `+${v} reel strength — big fish are far less likely to break the line`;
        case "seafaring": return `+${v} dig stamina on every voyage — that many more holes before you are done`;
        // ── SYSTEM PERKS ─────────────────────────────────────────────────────────────────────────────────
        // Every one states the exact number and exactly what it changes. "+2 seed luck" tells a member nothing;
        // "1 harvest in 12 comes up double" tells them whether they want it.
        case "farm_yield": return `About 1 harvest in ${Math.max(2, Math.round(100 / v))} comes up DOUBLE while equipped (+${v}% double-harvest chance)`;
        case "farm_speed": return `Your crops finish ${v}% sooner while equipped — a 12h crop lands about ${Math.round(12 * v / 100 * 60)} min early`;
        case "farm_seed": return `+${v}% chance a harvest also drops a SEED while equipped`;
        case "angler_bite": return `+${v}% chance a cast hooks a rarer fish than it should have`;
        case "angler_size": return `Every fish you land measures +${v}% longer — counts for records and the log`;
        case "sea_dredge": return `+${v}% chance a dig turns up treasure instead of dirt`;
        case "sea_plunder": return `+${v}% gold from raids and the sea merchant`;
        case "kitchen_heat": return `+${v}% chance a cooked dish comes out one whole TIER better`;
        case "kitchen_larder": return `+${v}% chance a cook uses up NO ingredients at all`;
        case "kitchen_portion": return `+${v}% chance a cook makes a SECOND helping — the same dish twice`;
        case "kitchen_prep": return `+${v}% chance prepping an ingredient yields an extra one`;
        case "forge_spark": return `+${v}% chance an enhance at the Forge doesn't consume its parts`;
        case "forge_salvage": return `+${v}% parts from every salvage`;
        case "town_haggle": return `${v}% off everything the travelling merchant and the gold shop sell`;
        case "town_rally": return `+${v}% damage on town raids — the plaza skirmishes, not the weekly boss`;
        case "chest_luck": return `+${v}% chance any chest you open rolls on the NEXT rarity up`;
        case "recipe_nose": return `+${v}% chance anything that can drop a recipe does`;
        // ── The eight designed in review. Each states the number AND what it buys you. ────────────────────
        case "green_thumb": return `${v}% chance rating a friend's farm drops you a seed too`;
        case "pack_visit": return `Petting or feeding on someone else's farm also gives YOUR equipped pet ${v}% of that XP`;
        // The pig is a ONCE-PER-DAY claim, not a spawn timer — so "1.5x as often" would be meaningless. At
        // 100 (the cap) it comes back every day; below that it's a chance. That IS the agreed 2x.
        case "truffle_hog": return v >= 100
            ? `The Loot Pig comes back for a SECOND visit every day`
            : `${v}% chance the Loot Pig comes back for a second visit the same day`;
        case "night_angler": return `+${v}% gold and XP from any cast made while the shop is closed`;
        case "second_wind": return `Your first cast recharge each day is FREE (normally ${100} gold)`;
        case "storm_sense": return `While it's actually raining over the shop, fish run +${v}% bigger and rarer`;
        case "following_sea": return `Your voyages finish ${v}% sooner — a 4h trip lands about ${Math.round(4 * v / 100 * 60)} min early`;
        case "beachcomber": { const n = Math.max(1, Math.round(v / 10)); return `+${n} extra buried find${n === 1 ? "" : "s"} scattered through every dig`; }
        default: return "";
    }
}

// The full equipped perk for a pet: name + mechanic + scaled value + human description.
export function petPerk(pet) {
    const def = PET_PERKS[pet.id] || { name: "Companion", key: pet.activeStat || "fortune" };
    // Capped here as well as in combinePetBonuses: a card that advertises 90% while the game pays 30% is a
    // worse bug than the uncapped value, because it looks deliberate.
    const value = capSystemPerk(def.key, petPerkValue(pet.rarity, def.key));
    const meta = PERK_META[def.key] || { icon: "🐾" };
    const desc = perkDesc(def.key, value, pet.level || 1) + (def.note ? `. ${def.note}` : "");
    return { name: def.name, key: def.key, icon: meta.icon, value, desc, note: def.note || null };
}

// ── WHAT A STONE WOULD DO TO THIS PET, IN WORDS ──────────────────────────────────────────────────────────────
// Generated, never typed. The enshrining panel has to show BOTH stones at their real numbers before an
// irreversible choice is made, and a hand-written line is a line that goes stale the first time a multiplier
// moves. So the sentence comes out of the same perkDesc() the pet's own card uses, fed the value the engine
// will actually apply.
export function ascensionEffectView(pet, stone) {
    if (!pet) return null;
    const eff = effectFor(pet.id, stone);
    const ownKey = (PET_PERKS[pet.id] || {}).key || pet.activeStat || "fortune";
    const key = eff.kind === "graft" ? eff.key : ownKey;
    const factor = eff.kind === "graft" ? (Number(eff.scale) || 1) : (Number(eff.mult) || 1);
    const raw = petPerkValue(pet.rarity, key);
    // Erupt is the one perk whose value is an object. Scaling it means scaling the CHANCE — multiplying the
    // damage multiplier as well would compound two numbers that were balanced separately.
    // Capped the way the ENGINE caps, not the way the old card did. A system perk goes through capSystemPerk, a
    // proc through PROC_CAP; anything left is an uncapped stat. Rounded to a tenth because an amplify of 2.2 on
    // a whole number produces things like "+6.6000000000000005/hr", which is a number nobody wrote.
    const round1 = (x) => Math.round(x * 10) / 10;
    const procCap = PROC_CAP[key];
    const scaled = raw && typeof raw === "object"
        ? { ...raw, chance: round1(Math.min(procCap ?? 1, raw.chance * factor) * 100) / 100 }
        : round1(procCap != null ? Math.min(procCap, raw * factor) : capSystemPerk(key, raw * factor));
    const meta = PERK_META[key] || { icon: "🐾" };
    return {
        stone,
        name: eff.name,
        kind: eff.kind,
        key,
        icon: meta.icon,
        // A grafted ability is a SECOND thing the pet learns; an amplified one is the thing it already did,
        // harder. Worth saying which, because it changes whether the pet's own card still tells the whole story.
        adds: eff.kind === "graft",
        value: scaled,
        desc: perkDesc(key, scaled, PET_ENSHRINED_LEVEL),
        note: eff.note || null,
    };
}

/** Both stones for a pet, for the side-by-side panel. */
export const ascensionChoice = (pet) => ({ light: ascensionEffectView(pet, "light"), dark: ascensionEffectView(pet, "dark") });

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
// The perk keys that belong to a SYSTEM rather than the boss fight. Kept as a set so combinePetBonuses can
// route them without a second list to forget to update.
// ── SYSTEM PASSIVES ───────────────────────────────────────────────────────────────────────────────────────
// Stats that belong to a system rather than the boss, carried by EVERY OWNED pet rather than the equipped one.
//
// These already existed in PET_PASSIVE_STAT, but combinePetBonuses' add() only writes combat/econ keys and
// silently dropped them — so the only place a pastoral pet's seedLuck was ever read was farmBonuses, which
// looks at featured_collectible alone. Sixteen pastoral pets in your collection did nothing; the one you had
// out did. That is an equipped bonus wearing the word "passive".
//
// Routed into the `system` bucket now, summed across the whole menagerie, so collecting actually pays.
export const SYSTEM_PASSIVE_STATS = new Set([
    "seedLuck", "growSpeed", "petXp",   // farm
    "angling", "reelStrength",          // fishing
    "seafaring",                        // sailing — dig stamina, a capped resource so stacking converges
]);
// Ceilings on the OWNED total. A full collection at Lv5 with an aura lands near 29 on the farm stats today, so
// 30 keeps a complete menagerie at roughly its current best while stopping a future pet from pushing past it.
export const SYSTEM_PASSIVE_CAP = {
    seedLuck: 30, growSpeed: 30, petXp: 30, angling: 25, reelStrength: 25,
    // Stamina is DIGS, not a percentage — a whole collection adds at most four extra digs a trip.
    seafaring: 4,
};

export const SYSTEM_PERK_KEYS = new Set([
    "farm_yield", "farm_speed", "farm_seed",
    "angler_bite", "angler_size", "sea_dredge", "sea_plunder",
    "kitchen_heat", "kitchen_larder", "kitchen_portion", "kitchen_prep", "recipe_nose",
    "forge_spark", "forge_salvage",
    "town_haggle", "town_rally", "chest_luck",
    "green_thumb", "pack_visit", "truffle_hog",
    "night_angler", "second_wind", "storm_sense", "following_sea", "beachcomber",
]);

/**
 * `powers` is the member's ascension power set. Three of them change what a menagerie is worth, and this is
 * the one place that answer is computed:
 *   THE SECOND BOWL      the EQUIPPED pet's passive counts twice
 *   THE SHEPHERD'S CROOK an ENSHRINED pet's passive counts twice
 *   THE LONG TABLE       the menagerie ceiling is half again as high
 * All three are conditional — take the gear off and the pack is ordinary again.
 */
export function combinePetBonuses(ownedPets = [], equippedPet = null, levelByPet = {}, enshrined = [], powers = null, lingeringPet = null) {
    const stats = { might: 0, crit_chance: 0, crit_power: 0, ferocity: 0, fortune: 0, extra_strike: 0 };
    const economy = { xp_gain: 0, gold_find: 0 };
    const proc = {};
    // System perks land here rather than in stats/economy, which only know about combat. `add()` silently
    // drops anything it doesn't recognise, so without this bucket every farm/sea/kitchen/forge/town perk
    // would read beautifully on the pet card and do absolutely nothing.
    const system = {};
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
        // The Second Bowl and The Shepherd's Crook each double ONE pet's passive — the one you carry, and the
        // ones you have enshrined. A pet that is both counts twice, not four times: they are the same promise
        // about the same pet, so the larger of the two applies rather than the product.
        const isEquipped = equippedPet && pet.id === equippedPet.id;
        const isEnshrined = enshrined.some((e) => e?.petId === pet.id);
        const twice = (powers?.has?.("second_bowl") && isEquipped) || (powers?.has?.("shepherd_s_crook") && isEnshrined);
        const lm = petPassiveLevelMult(Math.max(1, Number(levelByPet[pet.id]) || 1)) * (twice ? 2 : 1);
        // System stats go to the `system` bucket; add() would drop them. Everything else is combat/econ.
        if (SYSTEM_PASSIVE_STATS.has(p.stat)) system[p.stat] = (system[p.stat] || 0) + p.value * lm;
        else add(p.stat, p.value * lm);
        const sp = petSpecialPassive(pet);
        if (sp) {
            if (sp.secondStat) add(sp.secondStat, sp.secondValue * lm);
            if (sp.aura > aura) aura = sp.aura;
        }
    }
    // ── THE LIGHTSTONE'S PACK AURA IS GONE ───────────────────────────────────────────────────────────────
    // It used to add √n × 12% here, capped at 50%. Measured against the biggest real collection in the Den
    // (thirteen pets) one Lightstone moved Might by half a point — it multiplied a passive total small enough
    // to round away, and only bit past twenty-five pets, which nobody owns. Invisible now and ungovernable
    // later. What a stone does is per pet and authored (pet-ascension-effects.js); the aura below is the
    // mythic menagerie aura only, which is what it always should have been.
    aura = Math.min(0.9, aura);
    // Menagerie aura amplifies the accumulated PASSIVE totals (applied before the equipped active is layered on).
    if (aura > 0) {
        for (const k of Object.keys(stats)) stats[k] = Math.round(stats[k] * (1 + aura));
        for (const k of Object.keys(economy)) economy[k] = Math.round(economy[k] * (1 + aura));
    }
    // ACTIVE: the equipped pet's signature perk, scaled by ITS level (Lv5 ×3) — the payoff for leveling one
    // pet. Proc magnitudes scale too (chances capped so they stay sane).
    // ── THE ACTIVE PERK ─────────────────────────────────────────────────────────────────────────────────
    // One function, applied to the equipped pet AND to every enshrined one, because an enshrined ability is
    // not a copy of the active — it IS the active, still running with the pet back in the box. Writing it
    // twice would have been the surest way to end up with two subtly different abilities under one name.
    //
    // `boost` is the stone's multiplier: 1 for the pet in your hands and for a Lightstone, 1.5 for a
    // Darkstone. Proc CHANCES stay capped after the boost — a 150% of a 60% cap is still a coin you can lose.
    // ── ONE ACTIVE PER PERK KEY, THE BEST ONE ────────────────────────────────────────────────────────────
    // The `best()` guard below only ever covered the PROC map, and stat perks went through add(), which sums.
    // So an enshrined pet that was also equipped paid its stat active TWICE — the exact double the promise
    // rules out, and invisible unless you measure it (scripts/check-enshrined-merge.mjs, which did).
    //
    // Actives are collected here first, keyed by perk, taking the highest, and applied once at the end. Two
    // different enshrined pets with the SAME perk also collapse to the better of the two, which is the same
    // rule and the one that stops a stack of enshrinements from multiplying.
    const activeBest = {};
    // ── ONE APPLIER, ANY ABILITY ─────────────────────────────────────────────────────────────────────────
    // This used to read the pet's own perk key off PET_PERKS and could apply nothing else. A Lightstone that
    // GRAFTS a second ability onto a pet (see pet-ascension-effects.js) needs to run an arbitrary key at that
    // pet's rarity — and it has to run down this exact path, not a parallel one, or a grafted ability would
    // skip the caps and the best-of merge and become the one effect in the game nobody had tested.
    const applyPerk = (key, rarity, level, boost = 1) => {
        const def = { key };
        const v = petPerkValue(rarity, def.key);
        const aMult = petActiveLevelMult(Math.max(1, Number(level) || 1)) * boost;
        const cap = (x, hi) => Math.min(hi, x);
        const best = (k, x) => { proc[k] = Math.max(proc[k] || 0, x); };
        if (def.key === "first_hit") best("firstHitMult", 1 + (v - 1) * aMult);
        else if (def.key === "erupt") { best("eruptChance", cap(v.chance * aMult, PROC_CAP.erupt)); proc.eruptMult = Math.max(proc.eruptMult || 0, v.mult); }
        else if (def.key === "chain_strike") best("chainChance", cap(v * aMult, PROC_CAP.chain_strike));
        else if (def.key === "execute") best("executePct", cap(v * aMult, PROC_CAP.execute));
        else if (def.key === "onslaught") best("onslaughtPct", cap(v * aMult, PROC_CAP.onslaught));
        else if (def.key === "first_blood") best("firstBloodPct", cap(v * aMult, PROC_CAP.first_blood));
        else if (def.key === "extra_strike") {
            // Extra strike is a CHANCE (rolled once/day), not a flat count — so leveling the pet always feels
            // like an upgrade: 20% at Lv1 → 100% at Lv5 (an extra strike every day). boss.js does the roll.
            const eqLevel = Math.max(1, Number(level) || 1);
            best("extraStrikeChance", Math.min(1, (0.2 + 0.2 * (eqLevel - 1)) * boost));
        } else if (SYSTEM_PERK_KEYS.has(def.key)) {
            system[def.key] = Math.max(system[def.key] || 0, capSystemPerk(def.key, v * aMult));
        } else if (SYSTEM_PASSIVE_STATS.has(def.key)) {
            // A GRAFTED passive stat. These are normally carried by every owned pet rather than granted by an
            // ability, so they never came down this path — and without this branch they would fall through to
            // activeBest and be silently dropped by add(), which only knows combat and economy keys. That is
            // the whole "declared but never read" failure in one line, so it is handled rather than avoided.
            system[def.key] = (system[def.key] || 0) + v * aMult;
        } else {
            activeBest[def.key] = Math.max(activeBest[def.key] || 0, v * aMult);
        }
    };
    const applyActive = (pet, level, boost = 1) =>
        applyPerk((PET_PERKS[pet.id] || {}).key || pet.activeStat || "fortune", pet.rarity, level, boost);

    // ACTIVE: the equipped pet's signature perk, scaled by ITS level (Lv5 ×3) — the payoff for leveling one
    // pet. Proc magnitudes scale too (chances capped so they stay sane).
    // ── THREE ASCENSION POWERS ON THE ONE PET YOU CARRY ──────────────────────────────────────────────────
    // The Beast's Share runs the ability at the strength of the level above — read straight off the level,
    // because petActiveLevelMult is the only thing that turns a level into a magnitude.
    //
    // The Second Sitting says the ability fires twice one time in three. An ability here is a STANDING VALUE,
    // not an event — this function is pure, and it drives the pet card and the boss sizing as well as the
    // damage — so a die rolled inside it would make the card flicker between reloads and make the nightly boss
    // maths unreproducible. "Twice, one time in three" is therefore spent where it is felt: a third again on
    // the magnitude, which is the same thing over any run of days and is stable to look at.
    if (equippedPet) {
        const lv = (levelByPet[equippedPet.id] || 1) + (powers?.has?.("beast_s_share") ? 1 : 0);
        applyActive(equippedPet, lv, powers?.has?.("second_sitting") ? 4 / 3 : 1);
    }
    // THE WHISTLE — the pet swapped out today, still working. Run at its own level and with no boost: it is
    // the same ability it had in the slot, not a better one, and best() collapses it against the current pet
    // if they happen to share a perk.
    if (lingeringPet) applyActive(lingeringPet, levelByPet[lingeringPet.id] || 1);

    // ── ENSHRINED ── the whole point of level 6. These run whether the pet is in your hands or in the box,
    // which is what stops the swapping. An enshrined pet that ALSO happens to be equipped is applied once,
    // not twice: `best()` takes the higher of the two rather than adding them, so carrying your own enshrined
    // pet around is neither a bonus nor a penalty — it simply stops mattering, which is the promise.
    //
    // ── AND THE STONE IS PER PET NOW ─────────────────────────────────────────────────────────────────────
    // Both stones KEEP the ability — that is what enshrining means, and it is true whichever rock you spend.
    // What differs is what happens on top, and it differs per pet: AMPLIFY runs the pet's own ability at a
    // multiplier chosen against that ability's own ceiling, GRAFT gives it a second one. A grafted ability is
    // applied through applyPerk at the pet's own rarity, so it is capped and merged like any other.
    for (const e of enshrined) {
        const pet = e?.pet;
        if (!pet) continue;
        const eff = effectFor(pet.id, e.stone);
        applyActive(pet, PET_ENSHRINED_LEVEL, eff?.kind === "amplify" ? (Number(eff.mult) || 1) : 1);
        if (eff?.kind === "graft" && eff.key) {
            applyPerk(eff.key, pet.rarity, PET_ENSHRINED_LEVEL, Number(eff.scale) || 1);
        }
    }
    // Applied ONCE, after every active has had its say. This is the line that makes "enshrined and equipped"
    // and "enshrined" the same number.
    for (const [k, v] of Object.entries(activeBest)) add(k, v);
    // Cap the OWNED totals. The aura above amplifies stats/economy but deliberately not these — a menagerie
    // aura multiplying a farm bonus that already stacks over sixteen pets compounds twice.
    // The Long Table raises the menagerie ceiling by half. The cap still exists — it is the thing being bought,
    // and removing it outright was cut in an earlier pass for exactly that reason.
    const capMult = powers?.has?.("long_table") ? 1.5 : 1;
    for (const k of Object.keys(system)) {
        if (SYSTEM_PASSIVE_CAP[k] != null) system[k] = Math.min(SYSTEM_PASSIVE_CAP[k] * capMult, system[k]);
    }
    return { stats, economy, proc, system };
}
