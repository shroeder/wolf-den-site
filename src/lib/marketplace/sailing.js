import "server-only";

import { db } from "@/lib/db";
import { addChests, CHEST_TIERS, CHEST_ORDER } from "@/lib/marketplace/chests.js";
import { getChestArt } from "@/lib/marketplace/chest-art.js";
import { getPetSpriteData, getPetSpriteLevelData, pickPetSpriteForLevel } from "@/lib/marketplace/pet-sprite.js";
import { awardXp, levelForXp } from "@/lib/marketplace/xp.js";
import { grantConsumable, CONSUMABLES } from "@/lib/marketplace/consumables.js";
import { grantItem, getEquippedStats, getEquippedIds } from "@/lib/marketplace/inventory.js";
import { itemById, ITEMS, STAT_META, sumItemSea, isTradeLocked, randomDropPool } from "@/lib/marketplace/items.js";
import { sumPieceSea } from "@/lib/marketplace/collection-pieces.js";
import { getOwnedPieceIds, getOwnedSetIds } from "@/lib/marketplace/collection-owned.js";
import { collectibleById } from "@/lib/marketplace/collectibles.js";
import { avatarImageUrl } from "@/lib/marketplace/avatar-cosmetics.js";
import { isOwner } from "@/lib/marketplace/owner.js";
import { AMMO, AMMO_LIST, ammoById, COMBAT_TRACKS, shipProfile, foeProfile, simulateShipBattle,
         gunsFor, accuracyFor, hullFor, armorFor, ORDER_LIST, initBattleState, resolveRound,
         MAX_ROUNDS, matchupOdds } from "@/lib/marketplace/ship-battle.js";
import { FLEET, MAX_FLEET_RANK, fleetShip, fleetReward, fleetView, fleetArt, fleetCaptain, fleetRankForShip, fleetDeckOf } from "@/lib/marketplace/fleet.js";
import { boatDeck } from "@/lib/marketplace/deck-lines.js";
import { fleetGunPorts, boatGunPorts } from "@/lib/marketplace/gun-ports.js";
import { DEFAULT_AVATAR_URL } from "@/lib/marketplace/avatar-options.js";
import { setSeaBonus, setRaidBonus, setDoublesRaidGold } from "@/lib/marketplace/sets.js";
import { itemSpriteFor } from "@/lib/marketplace/item-sprites.js";
import { petLevelForXp } from "@/lib/marketplace/pet-level.js";
import { grantEventBadge, getBadgeSea } from "@/lib/marketplace/badges.js";
import { getEquippedUtilTotals } from "@/lib/marketplace/item-affix.js";
import { bumpQuestProgress } from "@/lib/marketplace/quests.js";
import { dropSeedFrom } from "@/lib/marketplace/farm-crops.js";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { sendWebPush } from "@/lib/push/web-push.js";
import { logCoin } from "@/lib/marketplace/coins.js";
// Fishing lives in its own module (species table + the cast/bite/reel rules); it reads back into sailing.js only
// via a dynamic import for grantFragment, so this static import can't cycle.
import { fishingView, castLine, landFish, denFishRecords, denTopCatches, FISH_TRACKS, FISH_TRACK_COL } from "@/lib/marketplace/fishing.js";

// Fragments you dig up on the island fuse into a loot chest — now TIERED, one shard type per chest tier.
// 10 shards of a tier forge THAT tier's chest. Each shard resembles its chest (art: fragment-<tier>.png).
const FRAGMENTS_PER_CHEST = 10;
// A dug shard's tier is rolled from the chosen voyage DURATION (longer = better), never above the cap for now.
// wooden = common · iron = pretty rare · gold (the cap) = very rare. Higher tiers exist but don't drop yet.
const FRAGMENT_TIER_CAP = "mythic"; // long trips reach one step past gold; short/standard stay lower
const fragmentArt = (tier) => `/images/sailing/fragment-${tier}.png`;

// Three embark durations: trip time = your (Speed-shortened) base voyage × mult; longer trips roll better
// shards. `frag` = tier weights (each option's own ceiling). Plain consts (no env) so they're easy to tune.
export const VOYAGE_OPTIONS = [
    { id: "short", label: "Short haul", mult: 1, frag: { wooden: 88, iron: 12 } },                 // ~4h
    { id: "standard", label: "Standard run", mult: 3, frag: { wooden: 70, iron: 24, gold: 6 } },   // ~12h
    { id: "long", label: "Long expedition", mult: 6, frag: { wooden: 54, iron: 28, gold: 15, mythic: 3 } }, // ~24h
];

// SAILING — dispatch your boat on a ONE-WAY voyage to a mysterious island; when it lands you play an
// excavation dig minigame (ESO-style: a grid of dirt, a limited stamina budget, an Augur "hot/cold" locator)
// trying to unearth a treasure-chest FRAGMENT before you run out. Win or fail, you return to port and can set
// sail again. Speed shortens the voyage; Luck adds dig stamina. Owner-gated while in development.

// Base voyage = 4 hours (the SHORT option). Standard = 12h, Long = 24h (see VOYAGE_OPTIONS mults).
export const BASE_VOYAGE_MS = 4 * 60 * 60 * 1000; // 4h base (SHORT option); standard/long multiply this
const SPEED_OFF_MS_PER_LEVEL = 2 * 60 * 1000;  // Speed shaves a FLAT 2 minutes off each voyage, per level
const SPEED_MIN_PER_LEVEL = 2;                 // ^ shown on the card
const MIN_VOYAGE_MS = 30 * 60 * 1000;          // a voyage never dips below 30 minutes
// FIVE boat upgrade tracks — all travel/loot/raid, NO dig count (that's a separate system). Each maxes at 20
// → 100 upgrade levels → the boat changes FORM every 10 levels across BOAT_TIERS (11) distinct arts, and each
// form unlocks a permanent perk (see MILESTONES). Fortune lives in the legacy luck_level column; Luck (now a
// WAVES stat) in find_level; Raiding (raid-dodge) in raid_level.
export const MAX_SPEED_LEVEL = 20;
export const MAX_FORTUNE_LEVEL = 20;
export const MAX_RARITY_LEVEL = 20;
export const MAX_LUCK_LEVEL = 20;
export const MAX_RAID_LEVEL = 20;
const LEVELS_PER_FORM = 10;
const BOAT_TIERS = 11;

// ── RAIDS ── once/day you can raid a passing ship: a full-screen auto-battle. Win → gold (+ a rare item copy);
// lose → shed some gold. The "Raiding" upgrade track gives a small chance the daily raid isn't consumed.
// The old raid reward design (flat win gold, a gold penalty on defeat, a 0.5% chance to copy one of their
// items) is gone — a raid pays out of the FLEET table now, matched to the rank the rival's ship resembles.
// One reward design, so there is one thing to balance rather than two pulling against each other.
// ── RAIDING IS UNDER CONSTRUCTION ────────────────────────────────────────────────────────────────────────────
// Raids are being rebuilt as SHIP battles — cannons, hull, ammunition, a raiding currency and a board — and the
// old player-vs-player version is live while that happens. Rather than rip it out (and lose the working sim,
// the scene and the daily economy in the meantime), the whole surface is gated to the dev allow-list: the
// owner can still raid, to build and test against real data, and nobody else sees the feature at all.
//
// EVERY door has to be locked, not just the button: the CTA, the target list, the buy-another-raid, the
// upgrade track, the incoming-raid reports and the quest/daily tasks that would otherwise ask a member to do
// something they cannot reach. `raidsEnabled` is the one predicate they all read.
export const raidsEnabled = (buyerId) => isOwner(buyerId);

const RAID_DODGE_BASE = 0.005, RAID_DODGE_PER = 0.0025; // 0.5% + 0.25%/level to NOT use up the daily raid
const raidDodgeChance = (lvl = 0) => RAID_DODGE_BASE + Math.max(0, lvl) * RAID_DODGE_PER;
const raidDodgePct = (lvl = 0) => Math.round(raidDodgeChance(lvl) * 1000) / 10; // one-decimal % for the card
// Daily raid allowance: BASE + ship perks (Celestial Sovereign +1) + set bonus. Count-based so >1/day works.
// Base raised 1 → 3: one raid a day made the whole raiding system a single tap you could miss entirely, and the
// upgrade track + Dread Corsair bonus had almost nothing to sit on top of.
const BASE_RAIDS_PER_DAY = 5; // covers fleet AND member raids since they share one pool (was 3 + a separate 3)
const raidsPerDay = (level = 1, setBonus = 0) => BASE_RAIDS_PER_DAY + boatPerks(level).bonusRaids + Math.max(0, setBonus);
const raidsUsedToday = (row) => (row?.raid_used_today ? (row?.raid_count || 0) : 0); // count only counts if it's TODAY's
// Full-set raid extras (Dread Corsair capstone): +1 raid/day and double raid-win gold. A COLLECTION set —
// assembling it is the achievement, so it counts what you own rather than what is in your slots.
async function equippedRaidExtras(buyerId) {
    const owned = await getOwnedSetIds(buyerId).catch(() => []);
    return { bonusRaids: setRaidBonus(owned), doubleGold: setDoublesRaidGold(owned) };
}
// Spent your daily raid? Buy another. Cost DOUBLES with each reset that day. FREE while testing — flip
// RAID_RESET_PAID true (+ tune base) before release.
const RAID_RESET_PAID = true;       // resets cost gold now (testing freebies concluded)
const RAID_RESET_BASE = 300;        // first same-day reset costs this, then doubles each time
const RAID_RESET_MULT = 2;
const raidResetCost = (resetsToday = 0) => (RAID_RESET_PAID ? Math.round(RAID_RESET_BASE * Math.pow(RAID_RESET_MULT, Math.max(0, resetsToday))) : 0);
// Sailing achievement badge thresholds — kept HIGH on purpose (these are meant to be a grind / rare feats).
const BADGE_RAID_MARAUDER = 25, BADGE_RAID_SCOURGE = 100, BADGE_DIG_EXCAVATOR = 50, BADGE_VOYAGER = 100;
// Raid DEFENSE: when an attacker loses, the defender earns this cut of what the attacker lost, plus a small
// chance at gear (rarity weighted toward the bottom, up to epic). Badges are hard — you must be raided + win.
// The defender's cut was a share of the raider's gold penalty. There is no penalty any more — losing costs
// the battle and nothing else, as it does against the fleet — so there is nothing to take a share OF. The
// defender still gets the report and the badges for driving somebody off.
const BADGE_RAID_DEFENDER = 10, BADGE_RAID_BASTION = 50;
// Milestone thresholds for the newer sailing badges (waving, marine encounters, early voyages).
const BADGE_WAVE_FRIENDLY = 25, BADGE_WAVE_AMBASSADOR = 100, BADGE_WAVE_BELOVED = 500;
const BADGE_ENC_TESTED = 10, BADGE_ENC_VETERAN = 50, BADGE_FIRST_VOYAGE = 1, BADGE_SAIL_REGULAR = 25;
// Activity-earned COSMETICS (granted into mkt_cosmetic_unlock, idempotent). Kept modest — the owner dislikes
// grind — so they land well before the hard achievement badges. Art (CSS) is added in a later pass by id.
const COSMETIC_SAILOR_VOYAGES = 10;  // "Seasoned Sailor" border
const COSMETIC_WARBORN_WINS = 10;    // "Warborn" border
const COSMETIC_HOARD_FORGES = 10;    // "Buried Hoard" background

// After the free once-a-day tailwind is spent, extra tailwinds can be bought with gold — and the price DOUBLES
// for each extra one caught this voyage (wind_recharges), so spamming tailwinds gets expensive fast.
export const WIND_RECHARGE_COST = 500; // base cost of the FIRST extra tailwind
const windRechargeCost = (n = 0) => WIND_RECHARGE_COST * Math.pow(2, Math.max(0, n));

// ── Waves ── greet a passing member a few times a day for a little XP/coins + a small travel cut.
const WAVES_PER_DAY = 3;               // base daily waves; LUCK adds more (see wavesPerDay)
const WAVE_LUCK_PER = 4;               // Luck: +1 wave every this many Luck levels (max Luck 20 → +5 waves)
// Waving at a passing sailor is a courtesy, not an accomplishment — 261 waves a week at 25 XP was quietly a
// top-eight XP source for an action with no cost and no risk.
const WAVE_XP = 12;
const WAVE_COINS = 10;
const WAVE_SHAVE_MS = 2 * 60 * 1000; // 2 minutes off the remaining voyage
// Luck (find_level) is now a WAVES stat: more greetings per day, not a digging aid.
const wavesPerDay = (luckLevel = 0) => WAVES_PER_DAY + Math.floor(Math.max(0, luckLevel) / WAVE_LUCK_PER);

// ── Marine encounters ── FORTUNE now drives the chance a voyage rolls an encounter at its halfway mark
// (repurposed from "+buried fragments"). No push / no travel pause — it resolves lazily on the member's next
// check-in and shows a one-off recap modal.
const ENCOUNTER_BASE = 0.20;          // base chance to roll a marine encounter at the voyage midpoint
const ENCOUNTER_PER_FORTUNE = 0.015;  // +1.5% per Fortune level → +30% at max (20)
const ENCOUNTER_CHANCE_CAP = 0.65;    // Fortune can raise the encounter chance up to this cap
function encounterChance(fortuneLevel = 0) {
    return Math.min(ENCOUNTER_CHANCE_CAP, ENCOUNTER_BASE + Math.max(0, fortuneLevel) * ENCOUNTER_PER_FORTUNE);
}
// Reusable low-power loot items (nothing here swings the boss fight). `d(w, item)` = a weighted drop.
const NONE = { kind: "none" };
const FRAG1 = { kind: "fragment", n: 1, label: "a Wooden chest fragment", emoji: "🟫", image: fragmentArt("wooden") };
const FRAG2 = { kind: "fragment", n: 2, label: "2 Wooden chest fragments", emoji: "🟫", image: fragmentArt("wooden") };
const TREAT_BONE = { kind: "consumable", id: "treat_bone", label: "a Pet Treat", emoji: "🦴" };
const TREAT_SNACK = { kind: "consumable", id: "treat_snack", label: "a Hearty Snack", emoji: "🍖" };
const CHEST_WOOD = { kind: "chest", tier: "wooden", label: "a Wooden chest", emoji: "📦" };
const CHEST_IRON = { kind: "chest", tier: "iron", label: "an Iron chest", emoji: "⚙️" };
const SPIN = { kind: "consumable", id: "spin_lucky_coin", label: "a Lucky Coin (+2 spins)", emoji: "🎟️" };
const STONE = { kind: "consumable", id: "stone_storm", label: "a Storm Crystal (+3 strikes)", emoji: "🔷" };
const d = (w, item) => ({ w, ...item });

// Foes you can meet at sea. Each has its OWN sprite (enc-<id>.png) + a themed `drops` table so the loot
// matches the story — pirates hoard chests, the kraken sheds hide (pet treats), the ghost drops spectral luck.
const ENCOUNTERS = [
    { id: "pirates",   foe: "roaming pirates",   emoji: "🏴‍☠️", loot: "looted their hold",
      drops: [d(38, NONE), d(25, CHEST_WOOD), d(10, CHEST_IRON), d(15, FRAG1), d(5, FRAG2), d(7, SPIN)] },
    { id: "kraken",    foe: "a lurking kraken",  emoji: "🐙", loot: "salvaged its hide",
      drops: [d(38, NONE), d(26, TREAT_BONE), d(14, TREAT_SNACK), d(12, FRAG1), d(10, STONE)] },
    { id: "clam",      foe: "a giant clam",      emoji: "🦪", loot: "prised a pearl from its shell",
      drops: [d(35, NONE), d(22, FRAG1), d(10, FRAG2), d(13, CHEST_WOOD), d(12, SPIN), d(8, TREAT_SNACK)] },
    { id: "ghost",     foe: "a ghost galleon",   emoji: "👻", loot: "plundered its spectral hold",
      drops: [d(38, NONE), d(22, FRAG1), d(8, FRAG2), d(16, SPIN), d(10, STONE), d(6, CHEST_IRON)] },
    { id: "serpent",   foe: "a sea serpent",     emoji: "🐍", loot: "harvested its glittering scales",
      drops: [d(38, NONE), d(22, TREAT_BONE), d(12, TREAT_SNACK), d(14, STONE), d(14, FRAG1)] },
    { id: "leviathan", foe: "a rogue leviathan", emoji: "🐋", loot: "carved a trove from the deep",
      drops: [d(32, NONE), d(24, CHEST_WOOD), d(12, CHEST_IRON), d(16, FRAG2), d(8, FRAG1), d(8, TREAT_SNACK)] },
    { id: "smuggler",  foe: "a smuggler's sloop", emoji: "⛵", loot: "seized their contraband",
      drops: [d(38, NONE), d(18, SPIN), d(15, CHEST_WOOD), d(12, TREAT_SNACK), d(10, STONE), d(7, FRAG1)] },
    { id: "drake",     foe: "a reef drake",      emoji: "🐉", loot: "raided its sunken nest",
      drops: [d(38, NONE), d(22, FRAG1), d(10, FRAG2), d(14, TREAT_BONE), d(8, STONE), d(8, CHEST_WOOD)] },
];
function pickWeighted(list) {
    const total = list.reduce((s, x) => s + x.w, 0) || 1;
    let r = Math.random() * total;
    for (const x of list) { r -= x.w; if (r <= 0) return x; }
    return list[list.length - 1];
}

// ── Gold Merchant island event ── a rare gold-clad showman who greets you when you LAND (before the dig):
// a coin-catch minigame for gold, a discounted exclusive shop, and a rare shot at his exclusive elephant pet.
const MERCHANT_BASE_CHANCE = 0.05;   // base chance the Gold Merchant appears on a landing
const MERCHANT_GOLD_FLOOR = 10;      // minimum coin-minigame payout (just for playing)
const MERCHANT_GOLD_CEIL = 200;      // safety cap only — the game's scoring is tuned to land ~150 on a great run
const MERCHANT_PET_ENCOUNTERS = 10;  // the elephant pet unlocks on your 10th meeting with the Gold Merchant
const MERCHANT_PET_ID = "elephant_spear";
const MERCHANT_PET_RARITY = "legendary";
// Elephant find bonus by EQUIPPED pet level (1..5): +1% → +5%.
const MERCHANT_PET_FIND = [0, 0.01, 0.02, 0.03, 0.04, 0.05];
// ── HIS STOCK, AND WHY IT IS CHEAP ───────────────────────────────────────────────────────────────────────────
// A 5%-per-landing showman you meet a handful of times a month has to be WORTH stopping for, and at 25-35% off
// he was not: the Tome of Wisdom came to 975 against 1,500 in a shop you can open any time you like, for a
// saving of about one coin-toss. Every price was roughly twice what it should have been for a once-in-a-blue-
// moon event, so this is a flat two-thirds off instead — the Tome lands at 495, and meeting him actually means
// something.
//
// ONE discount for the whole cart, rather than a per-item number, because there is nothing to tune per item:
// the interesting thing about a ware is what it does, not whether the showman feels 25% or 35% generous today.
const MERCHANT_DISCOUNT = 0.67;
// Where a ware is buyable in the ordinary shop, its base IS the shop price — read from CONSUMABLES rather than
// copied here, so the discount can never quietly drift into a markup when a shop price moves. The drop-only
// ones have no shop price to read, so they carry a notional value: what the piece would sell for if it were
// stocked, which is what the percentage is honestly a discount FROM.
const MERCHANT_STOCK = [
    { id: "treat_wild", base: 1600 },        // drop-only
    { id: "treat_marrow", base: 3200 },      // drop-only
    { id: "spin_golden_ticket", base: 2400 },// drop-only
    { id: "scroll_wisdom" },                 // 1,500 in the shop
    { id: "pot_secondwind" },                // 3,200 in the shop
    { id: "stone_ember" },                   // 3,500 in the shop
];
const wareBase = (s) => s.base ?? CONSUMABLES[s.id]?.price ?? 1000;
// Rounded to the nearest 5 — a showman shouts "495", not "494.7". Priced by a FUNCTION, not by whatever number
// happened to be written into merchant_json when the offer was rolled: an offer sits in that column until the
// next voyage, so a price change that only touched the roll would leave every merchant already on a beach
// selling at yesterday's prices, and there is no reason for the player to care which side of a deploy they
// landed on. Read, display and charge all call this.
const warePrice = (id) => {
    const s = MERCHANT_STOCK.find((w) => w.id === id);
    return s ? Math.max(1, Math.round((wareBase(s) * (1 - MERCHANT_DISCOUNT)) / 5) * 5) : null;
};

// ── LEVEL-CORRECT PET ART FOR A SET OF MEMBERS ───────────────────────────────────────────────────────────────
// Everywhere a pet appears on a boat -- the captain's, the fleet on the horizon, both sides of a raid, the
// defence log -- it used getPetSpriteData() alone, which only holds the Lv1 BASE sprite. So a fully evolved pet
// still sailed in its starter form for every member on screen. The farm and the boss scene already show the
// sprite for the pet's CURRENT level; this brings sailing in line.
//
// Takes [{ buyerId, petId }] and returns buyerId -> { url, flip }, with one query for all the levels rather
// than one per member.
async function petArtByBuyer(pairs) {
    const wanted = (pairs || []).filter((p) => p?.buyerId && p?.petId);
    if (!wanted.length) return {};
    const [base, levels, xpRows] = await Promise.all([
        getPetSpriteData().catch(() => ({})),
        getPetSpriteLevelData().catch(() => ({})),
        // Two plain arrays rather than a record[] of interpolated pairs -- the pair form would have to build
        // SQL literals out of ids. This over-fetches a little (any listed member x any listed pet) and the
        // exact pair is matched in JS below.
        db.query(
            `SELECT buyer_id, pet_id, xp FROM mkt_pet_level
              WHERE buyer_id = ANY($1::text[]) AND pet_id = ANY($2::text[])`,
            [[...new Set(wanted.map((w) => String(w.buyerId)))], [...new Set(wanted.map((w) => String(w.petId)))]]
        ).catch(() => []),
    ]);
    const xpFor = new Map((xpRows || []).map((r) => [`${r.buyer_id}|${r.pet_id}`, Number(r.xp) || 0]));
    const out = {};
    for (const w of wanted) {
        const lvl = petLevelForXp(xpFor.get(`${w.buyerId}|${w.petId}`) || 0, collectibleById(w.petId)?.rarity);
        const art = pickPetSpriteForLevel(base[w.petId], levels[w.petId], lvl);
        if (art?.url) out[w.buyerId] = { url: art.url, flip: art.flip === true };
    }
    return out;
}

// The equipped elephant pet's merchant-find bonus (0 if it isn't equipped).
async function merchantFindBonus(buyerId) {
    const b = await db.queryOne(`SELECT featured_collectible FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    if (b?.featured_collectible !== MERCHANT_PET_ID) return 0;
    const xpRow = await db.queryOne(`SELECT xp FROM mkt_pet_level WHERE buyer_id = $1 AND pet_id = $2`, [buyerId, MERCHANT_PET_ID]).catch(() => null);
    const lvl = petLevelForXp(xpRow?.xp || 0, MERCHANT_PET_RARITY);
    return MERCHANT_PET_FIND[Math.max(1, Math.min(5, lvl))] || 0;
}

// ── SEA AFFINITY ── equipped GEAR + PET grant sailing-only effect POINTS (broadside/ironclad/plunder/bounty/dredge/trove/tailwind).
// Aggregated here and converted to real effects by seaEffects(). Never touches boss power. Pet points scale by
// the equipped pet's level (1..5 → ~0.36x..1.0x), mirroring the elephant's merchant-find bonus.
export async function equippedSeaAffinity(buyerId) {
    // Must list EVERY real SEA_META effect key — the merges below use `for (k in sea)`, so any key missing here
    // is silently dropped. (This previously seeded only plunder/dredge/bulwark/tailwind, so broadside, ironclad,
    // bounty and trove were always 0 for BOTH gear and pets — Turtle/Marlin/Anglerfish etc. did nothing. The
    // old `bulwark` key wasn't a real effect and is removed.)
    const sea = { broadside: 0, ironclad: 0, plunder: 0, bounty: 0, dredge: 0, trove: 0, tailwind: 0, angling: 0 };
    if (!buyerId) return sea;
    const [bySlot, me, ownedIds] = await Promise.all([
        getEquippedIds(buyerId).catch(() => ({})),
        db.queryOne(`SELECT featured_collectible FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null),
        getOwnedSetIds(buyerId).catch(() => []),
    ]);
    // Worn gear's sea affixes, PLUS the affix on every Corsair piece you own. Trophies cannot be equipped at
    // all, so the loadout alone would drop them and the collection panel's "+4 Tailwind" would be a lie. They
    // come from their own table now, so the two are summed separately rather than through one id list.
    const ownedPieces = await getOwnedPieceIds(buyerId).catch(() => []);
    const gear = sumItemSea(Object.values(bySlot || {}));
    const trophySea = sumPieceSea(ownedPieces);
    for (const k in sea) sea[k] += (gear[k] || 0) + (trophySea[k] || 0);
    const setSea = setSeaBonus(ownedPieces);
    for (const k in sea) sea[k] += setSea[k] || 0;
    const petId = me?.featured_collectible;
    const pet = petId ? collectibleById(petId) : null;
    if (pet?.sea) {
        const xpRow = await db.queryOne(`SELECT xp FROM mkt_pet_level WHERE buyer_id = $1 AND pet_id = $2`, [buyerId, petId]).catch(() => null);
        const lvl = Math.max(1, Math.min(5, petLevelForXp(xpRow?.xp || 0, pet.rarity)));
        for (const k in sea) sea[k] += Math.round((pet.sea[k] || 0) * (0.2 + 0.16 * lvl));
    }
    // Earned SAILING/raiding/digging BADGES add sea affinity too (their thematic bonus).
    const badgeSea = await getBadgeSea(buyerId).catch(() => ({}));
    for (const k in sea) sea[k] += badgeSea[k] || 0;
    // Rare Forge "attunement" sea affixes (Dredge / Trove / Tailwind) on equipped gear add points too.
    const utilSea = (await getEquippedUtilTotals(buyerId).catch(() => ({ sea: {} }))).sea || {};
    for (const k in sea) sea[k] += utilSea[k] || 0;
    return sea;
}
// Sea-affinity POINTS → real effects. Plain tunable numbers (no env). Stackers are CAPPED so the rare gear that
// carries them stays special and can't trivialise a system.
function seaEffects(sea = {}) {
    return {
        // Raiding
        raidDmgMult: 1 + Math.min(0.4, (sea.broadside || 0) * 0.02),     // Broadside: +2% raid volley damage/pt (cap +40%)
        raidDmgReduction: Math.min(0.45, (sea.ironclad || 0) * 0.015),   // Ironclad: −1.5% incoming raid damage/pt (cap −45%)
        // Plunder used to raise the odds of copying a beaten crew's gear. That reward is gone, so rather than
        // leave the stat dead — and the Dread Corsair set advertising a bonus that does nothing — it now
        // fattens what a raid actually pays: +2% per point on the purse, capped at +50%.
        plunderBonus: Math.min(0.5, (sea.plunder || 0) * 0.02),
        goldBonus: Math.min(0.6, (sea.bounty || 0) * 0.03),             // Bounty: +3% raid/merchant gold/pt (cap +60%)
        // Digging
        digProcBonus: Math.min(0.18, (sea.dredge || 0) * 0.01),         // Dredge: +1% dig-tool proc/pt (cap +18%)
        fragBonus: Math.min(0.6, (sea.trove || 0) * 0.03),             // Trove: +3% dig fragment yield/pt (cap +60%)
        // Voyages
        voyageSpeed: Math.min(0.15, (sea.tailwind || 0) * 0.01),        // Tailwind: −1% voyage time/pt (cap −15%)
        bonusWaves: Math.floor((sea.tailwind || 0) / 4),                // Tailwind: +1 daily wave per 4 points
        // Fishing — Angling buys casts and tilts the species roll. The curve itself lives in fishing.js
        // (anglingEffects) since both effects are consumed there; this just passes the raw points through.
        angling: sea.angling || 0,
    };
}

// Roll the merchant ONCE per voyage, lazily, at the "arrived" interstitial (landed, no dig yet, not rolled).
// merchant_json: NULL = not rolled; {none:true} = rolled/no merchant; an object = the merchant is here.
async function rollMerchant(buyerId) {
    const row = await readRow(buyerId);
    if (!row || row.dig_state || row.merchant_json != null) return;
    const arrived = row.departed_at && row.returns_at && Date.now() >= new Date(row.returns_at).getTime();
    if (!arrived) return;
    const forced = row.force_merchant === true; // Treasure Map guarantees the merchant this landing
    if (forced) await db.query(`UPDATE mkt_sailing SET force_merchant = FALSE WHERE buyer_id = $1`, [buyerId]).catch(() => {});
    const chance = forced ? 1 : MERCHANT_BASE_CHANCE + await merchantFindBonus(buyerId);
    let offer = { none: true };
    if (Math.random() < chance) {
        const stock = [...MERCHANT_STOCK].sort(() => Math.random() - 0.5).slice(0, 3).map((s) => {
            const c = CONSUMABLES[s.id] || {};
            return { id: s.id, name: c.name || s.id, emoji: c.emoji || "🧪", desc: c.desc || "", price: warePrice(s.id), off: Math.round(MERCHANT_DISCOUNT * 100) };
        });
        // The pet is earned by MEETING the merchant MERCHANT_PET_ENCOUNTERS times (set below), not by the minigame.
        offer = { shop: stock, minigamePlayed: false, goldWon: 0, perfect: false, petGranted: null };
    }
    // Guard on merchant_json IS NULL so concurrent reads roll it exactly once.
    const rolled = await db.queryOne(`UPDATE mkt_sailing SET merchant_json = $2::jsonb, updated_at = NOW() WHERE buyer_id = $1 AND merchant_json IS NULL RETURNING buyer_id`, [buyerId, JSON.stringify(offer)]).catch(() => null);
    if (rolled && !offer.none) {
        await grantEventBadge(buyerId, "merchant_met").catch(() => {}); // "Gold Rush" — met the merchant
        // Count the encounter; the exclusive elephant pet unlocks on the MERCHANT_PET_ENCOUNTERS-th meeting.
        const cnt = await db.queryOne(`UPDATE mkt_sailing SET merchant_encounters = merchant_encounters + 1 WHERE buyer_id = $1 RETURNING merchant_encounters`, [buyerId]).catch(() => null);
        if ((cnt?.merchant_encounters || 0) === MERCHANT_PET_ENCOUNTERS) {
            await db.query(`INSERT INTO mkt_cosmetic_unlock (buyer_id, category, ref) VALUES ($1, 'pet', $2) ON CONFLICT DO NOTHING`, [buyerId, MERCHANT_PET_ID]).catch(() => {});
            // Flag it on this offer so the merchant screen celebrates the unlock right now.
            await db.query(`UPDATE mkt_sailing SET merchant_json = merchant_json || jsonb_build_object('petGranted', $2::text, 'petMilestone', TRUE) WHERE buyer_id = $1`, [buyerId, MERCHANT_PET_ID]).catch(() => {});
        }
    }
}

// Dig board.
const DIG_COLS = 4;
const DIG_ROWS = 4;
const DIG_MAX_DEPTH = 3;      // layers of dirt over every tile — you chip straight down through them
const BASE_STAMINA = 12;      // digs per voyage (flat; extend mid-dig with "buy more digs")
const FRAGMENTS_BURIED = 3;   // base fragments scattered through the dirt; Fortune adds +1 buried per level
const MAX_BURIED = 12;        // cap on buried fragments (of a 16-tile board)
const RARITY_UPGRADE_PER_LEVEL = 0.005; // Rarity: +0.5%/level chance that a forged chest is bumped up a tier
const DIG_REFILL = 5;         // extra digs you can buy mid-excavation
const DIG_REFILL_COST = 300;  // base cost of the FIRST refill; DOUBLES per refill bought this dig (board.refills)
const digRefillCost = (n = 0) => DIG_REFILL_COST * Math.pow(2, Math.max(0, n));

// ── DIGGING UPGRADES (separate from the boat) ── five gold-leveled tracks. Each track's PER-LEVEL value ×
// its MAX level = the cap Luke asked for.
const DIG_TRACKS = {
    stamina:   { max: 10, per: 1,    cap: 10,   kind: "count" }, // +1 dig per trip / level
    pierce:    { max: 5,  per: 0.03, cap: 0.15, kind: "pct" },   // dig clears ALL layers of a tile — 15% max
    strike:    { max: 5,  per: 0.006, cap: 0.03, kind: "pct" },  // a dig strikes a lucky bonus fragment — 3% max (was 10%, far too rich)
    efficient: { max: 5,  per: 0.04, cap: 0.20, kind: "pct" },   // a tool doesn't spend its stamina charge — 20% max
    detonator: { max: 5,  per: 0.01, cap: 0.05, kind: "pct" },   // a dig spawns a free explosion — 5% max
};
const digTrackValue = (t, lvl) => Math.min(DIG_TRACKS[t].cap, Math.max(0, lvl) * DIG_TRACKS[t].per);

// Area-clear TOOLS — no longer selected/charged. They fire as RANDOM PROCS on a dig, each clearing a cols×rows
// patch `layers` deep. Unlocked by CHEST-POINTS (chests you've forged, weighted by tier: 1/2/3/4). You can
// INVEST gold to raise a tool's proc chance up to TOOL_MAX_LEVEL (each level costs exponentially more).
// Tools unlock off DIG UPGRADE LEVELS — the total you've put into the five excavation tracks (30 available:
// stamina 10, pierce/strike/efficient/detonator 5 each).
//
// They used to unlock off "chest points": chests you'd forged, weighted 1-4 by tier, needing 12 / 30 / 100 /
// 400. That number lived nowhere the player could watch it climb, came from a different system entirely, and
// 400 weighted chests is a number nobody could relate to a goal. Now it's the thing directly above the tools
// on the same screen — invest in digging, and digging tools open up. You can see exactly how close you are.
const DIG_TOOLS = [
    { id: "wide",      name: "Wide Dig",   emoji: "🪓", sprite: "/images/sailing/tool-wide.webp",      unlockPoints: 3,  cols: 2, rows: 2, layers: 1 },
    { id: "deep",      name: "Deep Blast", emoji: "💥", sprite: "/images/sailing/tool-deep.webp",      unlockPoints: 8,  cols: 2, rows: 2, layers: 2 },
    { id: "quake",     name: "Quake",      emoji: "🌋", sprite: "/images/sailing/tool-quake.webp",     unlockPoints: 15, cols: 3, rows: 3, layers: 1 },
    { id: "cataclysm", name: "Cataclysm",  emoji: "☄️", sprite: "/images/sailing/tool-cataclysm.webp", unlockPoints: 24, cols: 3, rows: 3, layers: 2 },
];
// Total levels invested across the five excavation tracks — the tools' unlock currency.
const digUpgradeLevels = (row) => Object.values(DIG_TRACK_COL).reduce((n, col) => n + (Number(row?.[col]) || 0), 0);
const DIG_LEVELS_TOTAL = 30;
const TOOL_PROC_BASE = 0.015;      // 1.5% per unlocked tool at level 0 …
const TOOL_PROC_PER_LEVEL = 0.007; // … +0.7%/level → 5% when maxed
const TOOL_MAX_LEVEL = 5;
const toolProcChance = (lvl = 0) => TOOL_PROC_BASE + Math.min(TOOL_MAX_LEVEL, Math.max(0, lvl)) * TOOL_PROC_PER_LEVEL;
const toolUpgradeCost = (lvl = 0) => Math.round(250 * Math.pow(2.2, Math.max(0, lvl))); // 250 → 550 → 1210 → 2662 → 5856
const CHEST_POINT_WEIGHT = (tierKey) => Math.min(4, Math.max(1, CHEST_ORDER.indexOf(tierKey) + 1)); // tier 1–4 → 1–4 pts
const unlockedTools = (points = 0) => DIG_TOOLS.filter((t) => points >= t.unlockPoints);
const DIG_TRACK_COL = { stamina: "dig_stamina_level", pierce: "dig_pierce_level", strike: "dig_strike_level", efficient: "dig_efficient_level", detonator: "dig_detonator_level" };
function digTrackView(row, t) {
    const lvl = row?.[DIG_TRACK_COL[t]] || 0;
    const def = DIG_TRACKS[t];
    return { level: lvl, max: def.max, cost: upgradeCost(lvl), maxed: lvl >= def.max, kind: def.kind, cap: def.cap, valueNow: digTrackValue(t, lvl), valueNext: digTrackValue(t, lvl + 1) };
}
function digUpgradesView(row) {
    const stamLvl = row?.dig_stamina_level || 0;
    return {
        stamina: { ...digTrackView(row, "stamina"), digsNow: digStamina(stamLvl), digsNext: digStamina(stamLvl + 1) },
        pierce: digTrackView(row, "pierce"),
        strike: digTrackView(row, "strike"),
        efficient: digTrackView(row, "efficient"),
        detonator: digTrackView(row, "detonator"),
    };
}
// Tool INVEST view — each tool's unlock state (by chest-points), current proc %, and next invest level/cost.
function toolsView(row) {
    const points = digUpgradeLevels(row);
    const levels = (row && typeof row.dig_tool_levels === "object" && row.dig_tool_levels) || {};
    const tools = DIG_TOOLS.map((t) => {
        const lvl = Number(levels[t.id]) || 0;
        const unlocked = points >= t.unlockPoints;
        return {
            id: t.id, name: t.name, emoji: t.emoji, sprite: t.sprite, area: `${t.cols}×${t.rows}`, layers: t.layers,
            tiles: t.cols * t.rows * t.layers,
            unlocked, unlockPoints: t.unlockPoints,
            // How close you are, so the lock isn't a mystery.
            toUnlock: Math.max(0, t.unlockPoints - points),
            level: lvl, max: TOOL_MAX_LEVEL, maxed: lvl >= TOOL_MAX_LEVEL,
            procNow: toolProcChance(lvl), procNext: toolProcChance(lvl + 1), cost: toolUpgradeCost(lvl),
        };
    });
    return { points, pointsTotal: DIG_LEVELS_TOTAL, tools, nextUnlock: tools.find((t) => !t.unlocked) || null };
}

// The 8 boat FORMS. Reaching each level unlocks a new hull art (BOAT_ART[tier]) + a permanent perk applied by
// boatPerks(). Perks are cumulative and reuse the existing engine knobs so they're cheap + safe.
const MILESTONES = [
    { level: 10, tier: 2, name: "Swift Cutter", perk: "+1 fragment buried on every island", buried: 1 },
    { level: 20, tier: 3, name: "Trade Brig", perk: "Voyages are 10% faster", voyage: 0.9 },
    { level: 30, tier: 4, name: "Trade-Wind Schooner", perk: "+12% chance a forged chest is upgraded a tier", chest: 0.12 },
    { level: 40, tier: 5, name: "Gilded Galleon", perk: "15% chance a tailwind isn't used up", windSave: 0.15 },
    { level: 50, tier: 6, name: "Iron Man-o'-War", perk: "Your first dig each trip always strikes a fragment", surface: true },
    { level: 60, tier: 7, name: "Arcane Frigate", perk: "Voyages are another 10% faster", voyage: 0.9 },
    { level: 70, tier: 8, name: "Dragon Ship", perk: "+1 fragment buried + 12% chest-upgrade chance", buried: 1, chest: 0.12 },
    { level: 80, tier: 9, name: "Ghost Ship", perk: "Forge chests with 8 fragments instead of 10", forge: 8 },
    { level: 90, tier: 10, name: "Leviathan Dreadnought", perk: "Maw of the Deep — voyages haul back +2 bonus fragments; 5% chance a dig doesn't use a charge", voyageFrags: 2, digSave: 0.05 },
    { level: 100, tier: 11, name: "Celestial Warship", perk: "Celestial Sovereign — +1 raid per day, a guaranteed opening critical, and a stun each fight", bonusRaids: 1, openingCrit: true, raidStun: true },
];

const BOAT_ART = {
    1: "/images/sailing/boat-tier1-wood.png",
    2: "/images/sailing/boat-tier2-cutter.png",
    3: "/images/sailing/boat-tier3-brig.png",
    4: "/images/sailing/boat-tier4-schooner.png",
    5: "/images/sailing/boat-tier5-galleon.png",
    6: "/images/sailing/boat-tier6-manowar.png",
    7: "/images/sailing/boat-tier7-arcane.png",
    8: "/images/sailing/boat-tier8-dragon.png",
    9: "/images/sailing/boat-tier9-ghost.png",
    10: "/images/sailing/boat-tier10-leviathan.png",
    11: "/images/sailing/boat-tier11-celestial.png",
};
export const OCEAN_BG = "/images/sailing/ocean-bg.png";
export const DIG_BG = "/images/sailing/dig-bg.png";
export const ISLAND_ART = "/images/sailing/island.png";
// Ten scrolling sky/seascapes — the client randomly picks one per app open, so the horizon varies (sunset,
// night, storm, fog…) each session and scrolls behind the boat while sailing.
const SKY_BGS = ["sunset", "sunrise", "night", "storm", "fog", "clearday", "goldenhour", "dusk", "overcast", "aurora"]
    .map((t) => `/images/sailing/sky-${t}.png`);
// Dig-pit backdrop hints at the RARITY of the duration you chose (short→plain, standard→gold, long→mythic).
const DIG_BGS = { short: "/images/sailing/dig-short.png", standard: "/images/sailing/dig-standard.png", long: "/images/sailing/dig-long.png" };

// --- pure curves ---------------------------------------------------------------------------------------
// A new boat form every LEVELS_PER_FORM levels, capped at BOAT_TIERS distinct arts (level 80 → tier 9).
export function boatTier(level) { return Math.min(BOAT_TIERS, Math.floor(Math.max(1, level) / LEVELS_PER_FORM) + 1); }
export function boatArt(level) {
    // Show the highest boat art at/below this tier (so un-minted higher tiers fall back to the last real one).
    for (let t = boatTier(level); t >= 1; t--) if (BOAT_ART[t]) return BOAT_ART[t];
    return BOAT_ART[1];
}
// The boat's current FORM name (the highest milestone reached); the tier-1 starter has no milestone.
export function boatName(level) {
    let name = "Wooden Dinghy";
    for (const m of MILESTONES) if (level >= m.level) name = m.name;
    return name;
}
// A member's SHIP summary for their public profile (name, level, form, hull art). null if they've never
// sailed (no mkt_sailing row) — so it only shows for members who actually have a boat.
export async function getPublicShip(buyerId) {
    if (!buyerId) return null;
    const row = await db
        .queryOne(
            `SELECT COALESCE(speed_level,0) AS speed_level, COALESCE(luck_level,0) AS luck_level,
                    COALESCE(rarity_level,0) AS rarity_level, COALESCE(find_level,0) AS find_level,
                    COALESCE(raid_level,0) AS raid_level, COALESCE(voyages_completed,0) AS voyages_completed
               FROM mkt_sailing WHERE buyer_id = $1`,
            [buyerId]
        )
        .catch(() => null);
    if (!row) return null;
    const level = boatLevelFromUpgrades(row.speed_level, row.luck_level, row.rarity_level, row.find_level, row.raid_level);
    return {
        name: boatName(level),
        level,
        tier: boatTier(level),
        forms: BOAT_TIERS,
        art: boatArt(level),
        voyages: row.voyages_completed,
    };
}
// Cumulative milestone perks unlocked at this boat level.
function boatPerks(level) {
    const p = { buried: 0, voyageMult: 1, chestBonus: 0, surface: false, forgeCost: FRAGMENTS_PER_CHEST, windSave: 0,
        digSave: 0, raidStun: false, voyageFrags: 0, openingCrit: false, bonusRaids: 0 };
    for (const m of MILESTONES) {
        if (level < m.level) break;
        if (m.buried) p.buried += m.buried;
        if (m.voyage) p.voyageMult *= m.voyage;
        if (m.chest) p.chestBonus += m.chest;
        if (m.surface) p.surface = true;
        if (m.forge) p.forgeCost = m.forge;
        if (m.windSave) p.windSave = Math.max(p.windSave, m.windSave);
        if (m.digSave) p.digSave = Math.max(p.digSave, m.digSave);
        if (m.raidStun) p.raidStun = true;
        if (m.voyageFrags) p.voyageFrags += m.voyageFrags;
        if (m.openingCrit) p.openingCrit = true;
        if (m.bonusRaids) p.bonusRaids += m.bonusRaids;
    }
    return p;
}
// The 8 boat forms for the UI: each milestone with its unlock level, perk, and unlocked/current state.
function boatFormsView(level) {
    return MILESTONES.map((m) => ({
        level: m.level, tier: m.tier, name: m.name, perk: m.perk,
        art: BOAT_ART[m.tier] || BOAT_ART[1],
        unlocked: level >= m.level,
        current: level >= m.level && (m.level === 80 || level < m.level + LEVELS_PER_FORM), // the freshest unlocked form
    }));
}
function rawVoyageMs(speedLevel = 0) {
    return Math.max(MIN_VOYAGE_MS, BASE_VOYAGE_MS - Math.max(0, speedLevel) * SPEED_OFF_MS_PER_LEVEL);
}
// Voyage time including the boat's speed-perk milestones.
export function voyageDurationMs(speedLevel = 0, level = 1) {
    return Math.max(MIN_VOYAGE_MS, Math.round(rawVoyageMs(speedLevel) * boatPerks(level).voyageMult));
}
// Progressive cost — each level costs quadratically more than the last.
function upgradeCost(nextLevel) { return 100 * (nextLevel + 1) * (nextLevel + 1); }
// Dig count is a DIGGING upgrade (not a boat lever): base budget + the Stamina track.
function digStamina(staminaLevel = 0) { return BASE_STAMINA + Math.round(digTrackValue("stamina", staminaLevel)); }
// Buried fragments per island — base + boat-FORM milestone bonuses. (Fortune no longer feeds this; it now
// drives marine-encounter chance instead — see encounterChance.)
function fragmentsBuried(level = 1) {
    return Math.min(MAX_BURIED, FRAGMENTS_BURIED + boatPerks(level).buried);
}
// The boat's level is EARNED BY UPGRADING, not by digging: one level per upgrade level bought across 5 tracks.
function boatLevelFromUpgrades(s = 0, f = 0, r = 0, l = 0, rd = 0) {
    return 1 + Math.max(0, s) + Math.max(0, f) + Math.max(0, r) + Math.max(0, l) + Math.max(0, rd);
}

// ── THE BOARDS ───────────────────────────────────────────────────────────────────────────────────────────────
// Two leaderboards, asked for by a member in the survey: whose boat is the biggest, and who has dug the most
// out of the sand. Everything they need is already on mkt_sailing, so this is one query per board and no new
// state to keep in step.
//
// The FLEET board ranks BOAT LEVEL — the sum of the five upgrade tracks — because that is what the boat you can
// see on screen actually is. Voyages break ties, so between two identical hulls the one that has been out more
// places higher.
//
// The DIG board ranks CHEST POINTS, not chests forged. Points are tier-weighted (a mythic chest is worth four
// times a wooden one), so ranking on the raw count would make a hundred wooden chests beat twenty-five mythic
// ones — a board that rewards grinding the shallowest possible dig, which is the opposite of what digging is
// for. Forged count still shows, as the human-readable number next to it.
//
// Both boards exclude members who have never done the thing: a wall of zeroes is not a leaderboard.
const BOARD_LIMIT = 25;
export async function sailingBoards(viewerId = null) {
    const [fleet, dig] = await Promise.all([
        db.query(
            `SELECT s.buyer_id,
                    COALESCE(NULLIF(b.display_name, ''), b.alias) AS who, b.alias,
                    b.avatar_url, b.avatar_config, b.avatar_cosmetics,
                    (1 + GREATEST(s.speed_level,0) + GREATEST(s.luck_level,0) + GREATEST(s.rarity_level,0)
                       + GREATEST(s.find_level,0) + GREATEST(s.raid_level,0))::int AS level,
                    COALESCE(s.voyages_completed, 0)::int AS voyages,
                    COALESCE(s.raids_won, 0)::int AS raids
               FROM mkt_sailing s JOIN mkt_buyer b ON b.id = s.buyer_id
              WHERE COALESCE(s.voyages_completed, 0) > 0
                 OR COALESCE(s.speed_level,0) + COALESCE(s.luck_level,0) + COALESCE(s.rarity_level,0)
                  + COALESCE(s.find_level,0) + COALESCE(s.raid_level,0) > 0
              ORDER BY level DESC, voyages DESC
              LIMIT $1`, [BOARD_LIMIT]
        ).catch(() => []),
        db.query(
            `SELECT s.buyer_id,
                    COALESCE(NULLIF(b.display_name, ''), b.alias) AS who, b.alias,
                    b.avatar_url, b.avatar_config, b.avatar_cosmetics,
                    COALESCE(s.chest_points, 0)::int AS points,
                    COALESCE(s.chests_forged, 0)::int AS forged
               FROM mkt_sailing s JOIN mkt_buyer b ON b.id = s.buyer_id
              WHERE COALESCE(s.chest_points, 0) > 0
              ORDER BY points DESC, forged DESC
              LIMIT $1`, [BOARD_LIMIT]
        ).catch(() => []),
    ]);
    const mark = (rows, extra) => rows.map((r, i) => ({
        place: i + 1,
        who: r.who || "Member",
        alias: r.alias || null,
        // A board of names is a spreadsheet; a board of FACES is people you know you can catch.
        avatar: avatarImageUrl(r.avatar_config, r.avatar_cosmetics) || r.avatar_url || DEFAULT_AVATAR_URL,
        you: viewerId ? String(r.buyer_id) === String(viewerId) : false,
        ...extra(r),
    }));
    // WHO HAS FOUGHT DEEPEST. Depth first, then wins: two captains stuck on the same rung are separated by how
    // much they have actually fought, not by who arrived first.
    const battles = await db.query(
        `SELECT s.buyer_id,
                COALESCE(NULLIF(b.display_name, ''), b.alias) AS who, b.alias,
                b.avatar_url, b.avatar_config, b.avatar_cosmetics,
                COALESCE(s.fleet_best, 0)::int AS depth,
                COALESCE(s.fleet_wins, 0)::int AS wins
           FROM mkt_sailing s JOIN mkt_buyer b ON b.id = s.buyer_id
          WHERE COALESCE(s.fleet_best, 0) > 0
          ORDER BY depth DESC, wins DESC
          LIMIT $1`, [BOARD_LIMIT]
    ).catch(() => []);

    const boards = {
        fleet: mark(fleet, (r) => ({ level: r.level, voyages: r.voyages, raids: r.raids, art: boatArt(r.level), form: boatName(r.level) })),
        dig: mark(dig, (r) => ({ points: r.points, forged: r.forged })),
        battle: mark(battles, (r) => ({ depth: r.depth, wins: r.wins, ship: fleetShip(r.depth)?.name || null })),
    };

    // WHERE YOU PLACED, if you didn't make the visible top. A board that can't tell you your own position is a
    // wall of other people's names — and "you're 41st" is the number that makes someone want to climb.
    const me = { fleet: null, dig: null, battle: null };
    if (viewerId && !boards.fleet.some((r) => r.you)) me.fleet = await placeOf(viewerId, "fleet");
    if (viewerId && !boards.dig.some((r) => r.you)) me.dig = await placeOf(viewerId, "dig");
    if (viewerId && !boards.battle.some((r) => r.you)) me.battle = await placeOf(viewerId, "battle");

    // HOW MANY PEOPLE ARE ON EACH BOARD. "4th" is a number; "4th of 63 captains" is a standing.
    const counts = await db.queryOne(
        `SELECT COUNT(*) FILTER (WHERE COALESCE(voyages_completed,0) > 0
                                    OR COALESCE(speed_level,0) + COALESCE(luck_level,0) + COALESCE(rarity_level,0)
                                     + COALESCE(find_level,0) + COALESCE(raid_level,0) > 0)::int AS fleet,
                COUNT(*) FILTER (WHERE COALESCE(chest_points,0) > 0)::int AS dig,
                COUNT(*) FILTER (WHERE COALESCE(fleet_best,0) > 0)::int AS battle
           FROM mkt_sailing`
    ).catch(() => null);
    return { ...boards, me, totals: {
        fleet: Number(counts?.fleet || boards.fleet.length),
        dig: Number(counts?.dig || boards.dig.length),
        battle: Number(counts?.battle || boards.battle.length),
    } };
}

// One member's standing on a board. RANK() over the same ordering the board uses, so the number it reports can
// never disagree with the list above it.
async function placeOf(viewerId, board) {
    const lvl = `(1 + GREATEST(s.speed_level,0) + GREATEST(s.luck_level,0) + GREATEST(s.rarity_level,0)
                   + GREATEST(s.find_level,0) + GREATEST(s.raid_level,0))`;
    if (board === "battle") {
        const row = await db.queryOne(
            `WITH r AS (
                 SELECT buyer_id, COALESCE(fleet_best,0)::int AS depth, COALESCE(fleet_wins,0)::int AS wins,
                        RANK() OVER (ORDER BY COALESCE(fleet_best,0) DESC, COALESCE(fleet_wins,0) DESC) AS place
                   FROM mkt_sailing WHERE COALESCE(fleet_best,0) > 0)
             SELECT place::int, depth, wins FROM r WHERE buyer_id = $1`, [viewerId]
        ).catch(() => null);
        if (!row) return null;
        const who = await db.queryOne(`SELECT COALESCE(NULLIF(display_name, ''), alias) AS who, avatar_url, avatar_config, avatar_cosmetics FROM mkt_buyer WHERE id = $1`, [viewerId]).catch(() => null);
        return {
            place: Number(row.place), who: who?.who || "You", you: true,
            avatar: avatarImageUrl(who?.avatar_config, who?.avatar_cosmetics) || who?.avatar_url || DEFAULT_AVATAR_URL,
            depth: row.depth, wins: row.wins, ship: fleetShip(row.depth)?.name || null,
        };
    }
    const sql = board === "fleet"
        ? `WITH r AS (
               SELECT s.buyer_id, ${lvl}::int AS level, COALESCE(s.voyages_completed,0)::int AS voyages,
                      RANK() OVER (ORDER BY ${lvl} DESC, COALESCE(s.voyages_completed,0) DESC) AS place
                 FROM mkt_sailing s
                WHERE COALESCE(s.voyages_completed,0) > 0 OR ${lvl} > 1)
           SELECT place::int, level, voyages FROM r WHERE buyer_id = $1`
        : `WITH r AS (
               SELECT s.buyer_id, COALESCE(s.chest_points,0)::int AS points, COALESCE(s.chests_forged,0)::int AS forged,
                      RANK() OVER (ORDER BY COALESCE(s.chest_points,0) DESC, COALESCE(s.chests_forged,0) DESC) AS place
                 FROM mkt_sailing s
                WHERE COALESCE(s.chest_points,0) > 0)
           SELECT place::int, points, forged FROM r WHERE buyer_id = $1`;
    const row = await db.queryOne(sql, [viewerId]).catch(() => null);
    if (!row) return null;
    const who = await db.queryOne(`SELECT COALESCE(NULLIF(display_name, ''), alias) AS who, avatar_url, avatar_config, avatar_cosmetics FROM mkt_buyer WHERE id = $1`, [viewerId]).catch(() => null);
    const base = {
        place: Number(row.place), who: who?.who || "You", you: true,
        avatar: avatarImageUrl(who?.avatar_config, who?.avatar_cosmetics) || who?.avatar_url || DEFAULT_AVATAR_URL,
    };
    return board === "fleet"
        ? { ...base, level: row.level, voyages: row.voyages, art: boatArt(row.level), form: boatName(row.level) }
        : { ...base, points: row.points, forged: row.forged };
}

// --- dig board -----------------------------------------------------------------------------------------
function randInt(n) { return Math.floor(Math.random() * n); }
function weightedPickW(weights) {
    const total = Object.values(weights).reduce((s, w) => s + w, 0);
    let r = Math.random() * total;
    for (const [k, w] of Object.entries(weights)) { if ((r -= w) < 0) return k; }
    return Object.keys(weights)[0];
}

// The shallowest a fragment can sit (in dirt layers). Luck no longer touches digging — this is a flat cap.
function fragMaxDepth() { return DIG_MAX_DEPTH; }

// ── DIG DIFFICULTY — a "steady & matched" ramp: the board, treasure count, dirt depth all grow with your
// Excavation level (voyages completed), and your Sense budget grows too, so it stays a fair-but-hard hunt
// rather than trivialising as you unlock. All knobs are plain consts — tune freely, no env vars. ──
const DIG_MAX_SIZE = 8;                 // biggest square board (mobile-friendly)
const DIG_TIER_EVERY = 8;              // +1 difficulty tier per this many voyages
const DIG_MAX_TIER = 6;
function digTier(voyages = 0) { return Math.min(DIG_MAX_TIER, 1 + Math.floor(Math.max(0, voyages) / DIG_TIER_EVERY)); }
// Grid = big enough to hide the fixed 3-wide chest with room; bigger at higher tiers = the same chest hides
// better = harder. (Kept modest so tiles stay tappable on mobile.)
// The board kept growing only to tier 3 (capped at 7) while DIG_MAX_SIZE said 8 — so tiers 4-6 were the same
// board as tier 3. Let it reach 8.
function digSize(tier) { return Math.min(DIG_MAX_SIZE, 4 + tier); } // t1=5 … t4+=8
function digDepthMax(tier) { return tier >= 5 ? 5 : tier >= 3 ? 4 : 3; } // deeper dirt as you go
// Scan charges (the detector) — deliberately FEW ("a couple"), so a scan is a precious "feel it out" moment,
// not a solve-the-grid tool. Scales with board difficulty (tier), NOT Luck. Tune freely.
function digSenseBudget(tier) {
    // Scans used to INCREASE with tier (3 → 4 → 5), which inverted the whole curve: the board stopped growing
    // at tier 3 while the detector kept getting better, so tiles-per-scan fell from 12.3 to 9.8 and the dig got
    // EASIER the further you progressed. Difficulty is meant to climb. Fewer scans on bigger boards.
    return Math.max(2, 4 - Math.floor(Math.max(0, tier - 1) / 2)); // t1-2: 4, t3-4: 3, t5-6: 2
}
// A scan's HEAT for a tile: how CLOSE the nearest treasure is (Chebyshev distance) → 3 hot / 2 warm / 1 cool
// / 0 cold. Feeling-based, not a neighbour-count — "am I close?" reads instantly.
function senseHeat(board, r, c) {
    let best = Infinity;
    for (const [fr, fc] of board.frag) { const d = Math.max(Math.abs(fr - r), Math.abs(fc - c)); if (d < best) best = d; }
    return best <= 1 ? 3 : best === 2 ? 2 : best === 3 ? 1 : 0;
}

// ── THE CHEST — a literal buried treasure chest (a 2×N rectangle) is what you're uncovering. Hot/cold homes in
// on it; digging its cells reveals the chest piece-by-piece (corners, iron bands, the lock). Fragments are an
// ABSTRACTED reward (a few per chest, by tier + how much you exposed) — NOT one-per-cell. ──
// The chest footprint is FIXED at 2×2 so the real chest SPRITE (dig-chest.png, square) slices cleanly across
// the four tiles and assembles into a recognizable chest as you uncover it.
const CHEST_ROWS = 2, CHEST_COLS = 2;
function placeChest(rows, cols) {
    const H = CHEST_ROWS, W = CHEST_COLS;
    const r0 = randInt(Math.max(1, rows - H + 1));
    const c0 = randInt(Math.max(1, cols - W + 1));
    const cells = [];
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) cells.push([r0 + r, c0 + c]);
    return { cells, H, W, r0, c0 };
}
// REAL consumables scattered as 1×1 buried finds — the chest is the goal, but you grab whatever you dig up on
// the way. Mid/low-value buyables + a few drop-only treats (kept modest so it's a nice bonus, not a firehose).
const DIG_ITEM_POOL = [
    "pot_adrenaline", "stone_storm", "scroll_wisdom", "treat_bone", "treat_snack", "treat_toy",
    "spin_lucky_coin", "treat_wild", "pot_secondwind", "treat_feast",
];
const digItemCount = (tier, bonus = 0) => Math.min(5 + bonus, 2 + Math.floor(tier / 2) + bonus); // 2 (t1) … 5 (t6), +Beachcomber
// One-shot SAILING RELICS that can drop (rarely) at the end of a dig — the map/drum/lure/etc.
const SAIL_RELIC_DROPS = ["sail_war_drum", "sail_treasure_map", "sail_lucky_lure", "sail_storm_bottle", "sail_kraken_bait"];

function newBoard(row, petStamina = 0, petFinds = 0) {
    const fortuneLevel = row?.luck_level || 0;
    const luckLevel = row?.find_level || 0;
    const level = boatLevelFromUpgrades(row?.speed_level || 0, fortuneLevel, row?.rarity_level || 0, luckLevel, row?.raid_level || 0);
    // The hunt scales with Excavation level (voyages): bigger board, more treasure, deeper dirt at higher tiers.
    const tier = digTier(row?.voyages_completed || 0);
    const size = digSize(tier);
    const rows = size, cols = size;
    const maxDepth = digDepthMax(tier);
    // Every tile is a stack of 1–maxDepth dirt layers you chip through. A literal CHEST (a 2×N rectangle) is
    // buried; a SCAN reads how close it is (hot→cold), and digging its cells uncovers the chest piece-by-piece.
    const depth = Array.from({ length: rows }, () => Array.from({ length: cols }, () => 1 + randInt(maxDepth)));
    const perks = boatPerks(level);
    const chest = placeChest(rows, cols);
    const frag = chest.cells;             // the chest's tiles (kept named `frag` so downstream unearth logic holds)
    const chestBox = { H: chest.H, W: chest.W, r0: chest.r0, c0: chest.c0 };
    const shape = "chest";
    // The chest is ONE tier (rolled from the voyage duration + Rarity); the fragment REWARD is abstracted from
    // this tier + how much of the chest you expose (see finishDig) — not one fragment per cell.
    const quality = row?.voyage_quality || "standard";
    const artifactTier = rollFragmentTier(quality, row?.rarity_level || 0, level);
    const fragTiers = frag.map(() => artifactTier);
    // A flat cap on how deep a chest tile can be; the "first strike guaranteed" perk forces one cell to the surface.
    const cap = Math.min(fragMaxDepth(), maxDepth);
    frag.forEach(([fr, fc], i) => { depth[fr][fc] = perks.surface && i === 0 ? 1 : (1 + randInt(cap)); });
    // Scatter real consumable ITEMS (1×1) on random non-chest tiles — bonus finds you dig up along the way.
    const chestSet = new Set(frag.map(([fr, fc]) => `${fr},${fc}`));
    const free = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (!chestSet.has(`${r},${c}`)) free.push([r, c]);
    for (let i = free.length - 1; i > 0; i--) { const j = randInt(i + 1); [free[i], free[j]] = [free[j], free[i]]; }
    const items = free.slice(0, digItemCount(tier, petFinds)).map(([r, c]) => ({ r, c, id: DIG_ITEM_POOL[randInt(DIG_ITEM_POOL.length)] }));
    const dug = Array.from({ length: rows }, () => Array.from({ length: cols }, () => false));
    const sensed = Array.from({ length: rows }, () => Array.from({ length: cols }, () => -1)); // -1 = un-scanned; else the heat
    // petStamina comes from the caller: every owned seafaring pet adds a dig, capped at +4 across the whole
    // menagerie. A count rather than a percentage, so stacking converges instead of compounding. Passed in
    // because newBoard is synchronous and the lookup is a query.
    const stamina = digStamina(row?.dig_stamina_level || 0) + (tier - 1) * 2 + petStamina; // a few more digs on the bigger boards
    const maxSenses = digSenseBudget(tier);
    // Bake the digging-upgrade proc chances + unlocked tools onto the board so every dig can apply them.
    const up = {
        pierce: digTrackValue("pierce", row?.dig_pierce_level || 0),
        strike: digTrackValue("strike", row?.dig_strike_level || 0),
        efficient: digTrackValue("efficient", row?.dig_efficient_level || 0),
        detonator: digTrackValue("detonator", row?.dig_detonator_level || 0),
        digSave: boatPerks(level).digSave, // Leviathan (tier 10) perk: chance a dig doesn't cost a charge
    };
    // Unlocked tools (by chest-points) baked onto the board with each one's PROC chance, so every dig can roll them.
    const toolLevels = (row && typeof row.dig_tool_levels === "object" && row.dig_tool_levels) || {};
    const tools = unlockedTools(digUpgradeLevels(row)).map((t) => ({ id: t.id, name: t.name, emoji: t.emoji, cols: t.cols, rows: t.rows, layers: t.layers, proc: toolProcChance(Number(toolLevels[t.id]) || 0) }));
    return { v: 2, tier, cols, rows, depth, maxDepth, frag, fragTiers, shape, artifactTier, chestBox, items, dug, sensed, stamina, maxStamina: stamina, senses: maxSenses, maxSenses, status: "active", up, tools, bonus: 0 };
}

// Resolve the board's status after a mutation. Finding the chest NO LONGER ends the dig on its own — you keep
// digging for the scattered buried items until you're out of stamina, everything's uncovered, or you tap Finish.
// Win = you unearthed at least one thing (chest cell, lucky Strike bonus, or a buried item).
function resolveBoard(board) {
    const found = board.frag.filter(([fr, fc]) => board.depth[fr][fc] === 0).length;
    const chestDone = found >= board.frag.length;
    const itemsLeft = (board.items || []).filter((it) => (board.depth[it.r]?.[it.c] ?? 0) > 0).length;
    const gotItem = (board.items || []).some((it) => (board.depth[it.r]?.[it.c] ?? 1) === 0);
    board.chestDone = chestDone;
    board.itemsLeft = itemsLeft;
    if (board.stamina <= 0) {
        board.status = (found + (board.bonus || 0)) >= 1 || gotItem ? "won" : "lost";
    } else if (chestDone && itemsLeft === 0) {
        board.status = "won"; // chest fully uncovered AND nothing else is buried — there's nothing left to dig
    }
    // else: stay ACTIVE — the chest may be done, but buried items remain to find (or nothing's found yet).
    return found;
}
// Finish the dig early (the player taps "Finish"): resolve as a win if anything was unearthed, else a loss.
function forceResolve(board) {
    const found = board.frag.filter(([fr, fc]) => board.depth[fr][fc] === 0).length;
    const gotItem = (board.items || []).some((it) => (board.depth[it.r]?.[it.c] ?? 1) === 0);
    board.status = (found + (board.bonus || 0)) >= 1 || gotItem ? "won" : "lost";
    return board;
}

// Server-authoritative dig — chips one layer off a tile, plus the digging-upgrade procs (pierce / strike /
// detonator). Returns the mutated board.
function applyDig(board, r, c) {
    if (board.status !== "active" || board.stamina <= 0) return board;
    if (r < 0 || c < 0 || r >= board.rows || c >= board.cols) return board;
    if (board.depth[r][c] <= 0) return board; // already chipped to the bottom — never wastes a dig
    board.stamina -= 1;
    const up = board.up || {};
    board.chargeSaved = !!(up.digSave && Math.random() < up.digSave); // Leviathan perk: refund this dig's charge
    if (board.chargeSaved) board.stamina += 1;
    board.dug[r][c] = true;
    // Pierce: this dig breaks through EVERY remaining layer of the tile at once (else just one).
    if (up.pierce && Math.random() < up.pierce) board.depth[r][c] = 0;
    else board.depth[r][c] -= 1;
    // Strike: a lucky bonus fragment (no location tell — it's just extra loot on this swing).
    if (up.strike && Math.random() < up.strike) board.bonus = (board.bonus || 0) + 1;
    // Detonator: a free explosion clears the 3×3 around the dig by one layer.
    if (up.detonator && Math.random() < up.detonator) {
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < board.rows && nc >= 0 && nc < board.cols && board.depth[nr][nc] > 0) { board.depth[nr][nc] -= 1; board.dug[nr][nc] = true; }
        }
    }
    // TOOLS now fire as random PROCS on the dig — each unlocked tool rolls its chance and, if it hits, clears
    // its patch for free (no selecting, no charge). Record the last one that fired for a client flourish.
    board.toolProc = null;
    for (const tool of board.tools || []) {
        if (tool.proc && Math.random() < tool.proc + (up.efficient || 0)) { clearPatch(board, tool, r, c); board.toolProc = tool.id; } // Efficient adds to every tool's proc chance
    }
    resolveBoard(board);
    return board;
}

// Clear a tool's cols×rows patch anchored at (r,c), `layers` deep. Shared by the dig procs.
function clearPatch(board, tool, r, c) {
    for (let dr = 0; dr < tool.rows; dr++) for (let dc = 0; dc < tool.cols; dc++) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < board.rows && nc >= 0 && nc < board.cols) {
            board.dug[nr][nc] = true;
            board.depth[nr][nc] = Math.max(0, board.depth[nr][nc] - tool.layers);
        }
    }
}

// SENSE (the detector): spend one probe to reveal a tile's clue = how many treasures sit in its 8 neighbours
// (Minesweeper-style). Doesn't dig, doesn't end the game — just information. Re-probing a tile is a free no-op.
function applySense(board, r, c) {
    if (board.status !== "active") return board;
    if (r < 0 || c < 0 || r >= board.rows || c >= board.cols) return board;
    if (!board.sensed) board.sensed = Array.from({ length: board.rows }, () => Array.from({ length: board.cols }, () => -1));
    if (board.sensed[r][c] >= 0) return board;           // already scanned
    if ((board.senses || 0) <= 0) return board;          // out of scans
    board.senses -= 1;
    board.sensed[r][c] = senseHeat(board, r, c);         // 3 hot / 2 warm / 1 cool / 0 cold
    return board;
}

// The client-safe view of a board. Reveals each tile's remaining rock depth (so the layers can be drawn) and
// nothing about where the fragments are — a tile only flags `found` once it's been chipped to the bottom AND it
// hid a fragment. No pointer, no shimmer: the board never tells you where to dig next.
function boardView(board) {
    const maxDepth = board.maxDepth || DIG_MAX_DEPTH;
    const fragSet = new Set(board.frag.map(([r, c]) => `${r},${c}`));
    const itemAt = new Map((board.items || []).map((it) => [`${it.r},${it.c}`, it.id]));
    const tiles = [];
    for (let r = 0; r < board.rows; r++) {
        const row = [];
        for (let c = 0; c < board.cols; c++) {
            const isFound = fragSet.has(`${r},${c}`) && board.depth[r][c] === 0;
            // A found chest cell's position WITHIN the chest (rr/rc + dims) → the client draws that piece
            // (corner bracket / iron band / lock). Only sent for uncovered cells, so it's not a spoiler.
            const cb = board.chestBox;
            const chestPos = isFound && cb ? { rr: r - cb.r0, rc: c - cb.c0, H: cb.H, W: cb.W } : null;
            // A dug 1×1 item tile reveals the real consumable's emoji/name (a bonus find on the way to the chest).
            const itemId = board.depth[r][c] === 0 ? itemAt.get(`${r},${c}`) : null;
            const item = itemId ? { id: itemId, emoji: CONSUMABLES[itemId]?.emoji || "🎁", name: CONSUMABLES[itemId]?.name || "Item" } : null;
            row.push({
                depth: board.depth[r][c],   // rock layers still on top (drives the stacked-slab drawing)
                maxDepth,
                dug: board.dug[r][c],
                found: isFound,             // a chest cell uncovered at the bottom
                chestPos,                   // where in the chest this cell sits (for the drawing), or null
                item,                       // a real consumable uncovered here (emoji/name), or null
                sense: board.sensed && board.sensed[r][c] >= 0 ? board.sensed[r][c] : null, // scan HEAT (0–3), or null
            });
        }
        tiles.push(row);
    }
    const found = board.frag.filter(([r, c]) => board.depth[r][c] === 0).length;
    const chestDone = found >= board.frag.length;
    const itemsLeft = (board.items || []).filter((it) => (board.depth[it.r]?.[it.c] ?? 0) > 0).length;
    return { cols: board.cols, rows: board.rows, maxDepth, tier: board.tier || 1, shape: board.shape || null, stamina: board.stamina, maxStamina: board.maxStamina, senses: board.senses ?? 0, maxSenses: board.maxSenses ?? 0, status: board.status, tiles, buried: board.frag.length, found, bonus: board.bonus || 0, toolProc: board.toolProc || null, chestDone, itemsLeft };
}

// --- state ---------------------------------------------------------------------------------------------
// `buyerId` is passed explicitly rather than read off `row`: a member who has never opened Sailing has NO
// mkt_sailing row, so `row` is null and `row?.buyer_id` is undefined — which used to fail the fishing gate and
// erase the entire feature for them. Callers that only want `.status`/`.level` can still omit it.
function decorate(row, chestArt = {}, bonusWaves = 0, raidSetBonus = 0, angling = 0, sky = null, buyerId = null, collections = []) {
    const speedLevel = row?.speed_level || 0;
    const fortuneLevel = row?.luck_level || 0; // Fortune is stored in the legacy luck_level column
    const rarityLevel = row?.rarity_level || 0;
    const luckLevel = row?.find_level || 0;    // "Luck" = Waves stat (find_level column)
    const raidLevel = row?.raid_level || 0;    // "Raiding" = raid-dodge track (raid_level column)
    const level = boatLevelFromUpgrades(speedLevel, fortuneLevel, rarityLevel, luckLevel, raidLevel); // earned by upgrading, never digging

    const departedAt = row?.departed_at ? new Date(row.departed_at).getTime() : null;
    const arrivesAt = row?.returns_at ? new Date(row.returns_at).getTime() : null; // returns_at = island arrival
    const dig = row?.dig_state || null;
    const now = Date.now();

    let status = "idle";
    if (dig && dig.status === "active") status = "digging";
    else if (departedAt && arrivesAt) status = now >= arrivesAt ? "arrived" : "sailing";

    // Progress is REMAINING-based (how close to arrival vs. the ORIGINAL planned trip) so a tailwind — which
    // shortens the remaining time — visibly jumps the boat forward. Elapsed-based math left it pinned at 0
    // until the trip collapsed. Fall back to the current span for legacy voyages with no stored voyage_ms.
    const voyageTotalMs = Number(row?.voyage_ms) || (departedAt && arrivesAt ? Math.max(1, arrivesAt - departedAt) : 0);
    let progress = 0;
    if (status === "sailing" && arrivesAt && voyageTotalMs > 0) progress = Math.min(0.999, Math.max(0, 1 - (arrivesAt - now) / voyageTotalMs));
    else if (status === "arrived" || status === "digging") progress = 1;

    const rarityPct = (lvl) => Math.min(90, Math.round((Math.max(0, lvl) * RARITY_UPGRADE_PER_LEVEL + boatPerks(level).chestBonus) * 100));
    return {
        level, maxLevel: boatLevelFromUpgrades(MAX_SPEED_LEVEL, MAX_FORTUNE_LEVEL, MAX_RARITY_LEVEL, MAX_LUCK_LEVEL, MAX_RAID_LEVEL),
        tier: boatTier(level), boatTiers: BOAT_TIERS, boatArt: boatArt(level),
        forms: boatFormsView(level),
        oceanBg: OCEAN_BG, digBg: DIG_BGS[row?.voyage_quality] || DIG_BG, islandArt: ISLAND_ART,
        skies: SKY_BGS, // the client picks one at random per app open + scrolls it while sailing
        voyageTotalMs, // original planned trip length, for the remaining-based progress bar
        voyagesCompleted: row?.voyages_completed || 0,
        fragments: totalFragments(row),
        fragmentsPerChest: boatPerks(level).forgeCost,
        fragmentTiers: fragmentsView(row, level, chestArt),
        // Embark duration choices — trip time + which shards each favours — for the "set sail" picker.
        voyageOptions: VOYAGE_OPTIONS.map((o) => ({
            id: o.id, label: o.label,
            ms: Math.round(voyageDurationMs(speedLevel, level) * o.mult),
            topTier: Object.keys(o.frag)[Object.keys(o.frag).length - 1],
        })),
        digRefill: { amount: DIG_REFILL, cost: digRefillCost(row?.dig_state?.refills || 0) },
        // The boat's FOUR travel/loot levers — all boat-exclusive. Each carries its per-level effect + current/next value.
        speed: {
            level: speedLevel, max: MAX_SPEED_LEVEL, cost: upgradeCost(speedLevel), maxed: speedLevel >= MAX_SPEED_LEVEL,
            minPerLevel: SPEED_MIN_PER_LEVEL, voyageNow: voyageDurationMs(speedLevel, level), voyageNext: voyageDurationMs(speedLevel + 1, level),
        },
        fortune: {
            level: fortuneLevel, max: MAX_FORTUNE_LEVEL, cost: upgradeCost(fortuneLevel), maxed: fortuneLevel >= MAX_FORTUNE_LEVEL,
            encounterNow: Math.round(encounterChance(fortuneLevel) * 100), encounterNext: Math.round(encounterChance(fortuneLevel + 1) * 100),
        },
        rarity: {
            level: rarityLevel, max: MAX_RARITY_LEVEL, cost: upgradeCost(rarityLevel), maxed: rarityLevel >= MAX_RARITY_LEVEL,
            pctNow: rarityPct(rarityLevel), pctNext: rarityPct(rarityLevel + 1),
        },
        luck: {
            level: luckLevel, max: MAX_LUCK_LEVEL, cost: upgradeCost(luckLevel), maxed: luckLevel >= MAX_LUCK_LEVEL,
            wavesNow: wavesPerDay(luckLevel), wavesNext: wavesPerDay(luckLevel + 1),
        },
        raiding: {
            level: raidLevel, max: MAX_RAID_LEVEL, cost: upgradeCost(raidLevel), maxed: raidLevel >= MAX_RAID_LEVEL,
            pctNow: raidDodgePct(raidLevel), pctNext: raidDodgePct(raidLevel + 1),
        },
        // Daily raids (count-based so the Celestial Sovereign / set perks can grant more than one).
        raid: (() => {
            const cap = raidsPerDay(level, raidSetBonus);
            const used = raidsUsedToday(row);
            const enabled = raidsEnabled(buyerId);
            return {
                // `enabled` false hides the entire raid surface client-side; `available` is kept false too so
                // any older client that only checks that one still cannot open the picker.
                enabled, underConstruction: !enabled,
                usedToday: used >= cap, available: enabled && used < cap, used, cap,
                dodgePct: raidDodgePct(raidLevel),
                canStun: boatPerks(level).raidStun,
                // Raids pay out of the fleet table now — the client reads the reward off the target row
                // rather than being told a flat range that no longer exists.
                // Buy-another-raid: cost escalates with each reset that day (free while testing).
                reset: { cost: raidResetCost(row?.raid_reset_is_today ? (row?.raid_resets || 0) : 0), free: !RAID_RESET_PAID },
            };
        })(),
        // SHIP BATTLES — the gun deck, the racks, the fleet ladder and the purse. Gated with raiding while the
        // rework is under construction; a member outside the allow-list gets null and renders nothing.
        combat: raidsEnabled(buyerId) ? combatView(row, level) : null,
        voyageMs: voyageDurationMs(speedLevel, level),
        // Digging upgrade system (separate from the boat).
        digUpgrades: digUpgradesView(row),
        digTools: toolsView(row), // chest-point-unlocked proc tools + invest state
        // The Dread Corsair chase, shown on the screen its bonuses pay out on (see CollectionPanel). Passed
        // IN rather than fetched here — decorate() is synchronous, and reaching for the database from inside
        // a view builder is how a render turns into a query cascade.
        collections,
        status, progress, departedAt, arrivesAt,
        // Waves — greet a passing sailor a few times a day (only meaningful mid-voyage).
        waves: {
            max: wavesPerDay(luckLevel) + bonusWaves, // Tailwind sea-affinity adds bonus daily waves
            left: Math.max(0, wavesPerDay(luckLevel) + bonusWaves - (row?.wave_is_today ? (row?.wave_count || 0) : 0)),
            xp: WAVE_XP, coins: WAVE_COINS, minutes: WAVE_SHAVE_MS / 60000,
        },
        // A resolved-but-unacknowledged marine encounter, if any — the client shows it as a one-off recap modal.
        encounter: (row && row.encounter_result) || null,
        // The Gold Merchant offer, if he showed up this landing (shown at "arrived", before the dig). Prices are
        // re-read from the table on the way out rather than served from the stored offer — see warePrice.
        merchant: (row && row.merchant_json && !row.merchant_json.none)
            ? {
                ...row.merchant_json,
                // `bought` rides along per ware so the button can say "bought today" instead of failing on tap.
                shop: (row.merchant_json.shop || []).map((s) => ({
                    ...s,
                    price: warePrice(s.id) ?? s.price,
                    off: Math.round(MERCHANT_DISCOUNT * 100),
                    bought: merchantBoughtSet(row).has(s.id),
                })),
            }
            : null,
        merchantGold: { floor: MERCHANT_GOLD_FLOOR, ceil: MERCHANT_GOLD_CEIL },
        // Once-a-day "favorable winds" boost (shaves an hour off the trip) — only offered mid-voyage.
        windAvailable: status === "sailing" && !row?.wind_used_today,
        // After the free one is spent, extra tailwinds can be bought for this much gold (0 while testing).
        windRecharge: { cost: windRechargeCost(row?.wind_recharges || 0) },
        dig: status === "digging" ? boardView(dig) : null,
        // Fishing — offered at sea AND docked. fishingView is PURE off this same row, so the log, the daily
        // cast count and anything currently on the line all come along for free with no extra query.
        // A null here removes the whole surface: SailingClient guards every fishing affordance on
        // `state.fishing`, so members see no rail button, no scene, no trace of it — which is exactly what
        // happened to the 36 members who had no sailing row when this read `row?.buyer_id`.
        fishing: fishingUnlocked(buyerId || row?.buyer_id) ? fishingView(row, angling, status) : null,
    };
}

// The single gate for the fishing minigame. LIVE for every signed-in member as of launch — it was owner-only
// while the design settled. Kept as a function rather than deleted: the API actions, the /marketplace/fishing
// page, the nav entry, the daily quest and the profile log all route through it, so if fishing ever needs
// pulling back it's one return value rather than a hunt through six files.
export function fishingUnlocked(buyerId) {
    return Boolean(buyerId);
}

async function readRow(buyerId) {
    // Compute "did they already use today's favorable-winds boost" in SQL (store-local day) to sidestep the
    // JS-Date-from-a-DATE-column timezone trap.
    return db.queryOne(
        `SELECT *, (wind_day = (NOW() AT TIME ZONE 'America/Chicago')::date) AS wind_used_today,
                (wave_day = (NOW() AT TIME ZONE 'America/Chicago')::date) AS wave_is_today,
                (raid_day = (NOW() AT TIME ZONE 'America/Chicago')::date) AS raid_used_today,
                (raid_reset_day = (NOW() AT TIME ZONE 'America/Chicago')::date) AS raid_reset_is_today,
                (fleet_day = (NOW() AT TIME ZONE 'America/Chicago')::date) AS fleet_is_today,
                -- fish_is_today was MISSING, and castsUsed() reads it: without it every view reported zero
                -- casts spent, so the screen said "13/13 casts left today" while the server — which reads the
                -- row through readFishRow, where the flag IS computed — refused with out_of_casts.
                (fish_day = (NOW() AT TIME ZONE 'America/Chicago')::date) AS fish_is_today,
                -- Same reason, same trap: compared in SQL so today means the STORE's today, not the server's.
                (merchant_buy_day = (NOW() AT TIME ZONE 'America/Chicago')::date) AS merchant_buys_are_today
           FROM mkt_sailing WHERE buyer_id = $1`,
        [buyerId]
    ).catch(() => null);
}

// Resolve a DUE, unresolved encounter exactly once: roll the outcome, atomically CLAIM it (so only the first
// concurrent caller writes the result), then apply the grants. A no-op when nothing is pending/due.
async function resolveDueEncounter(buyerId) {
    const row = await readRow(buyerId);
    if (!row || !row.encounter_at || row.encounter_result) return; // encounter_at non-null = one is pending this voyage
    if (row.dig_state) return; // already ashore digging — don't pop a mid-voyage encounter over the dig
    // Fire at the voyage's PROGRESS midpoint, not a fixed wall-clock time — so a tailwind (which jumps the boat
    // forward by cutting the remaining time) still triggers it. Progress ≥ 50% ⟺ remaining ≤ half the trip.
    const arrivesAt = row.returns_at ? new Date(row.returns_at).getTime() : 0;
    const total = Number(row.voyage_ms) || 0;
    if (!arrivesAt || total <= 0) return;
    if (Date.now() < arrivesAt - total / 2) return; // not past the midpoint yet
    const enc = ENCOUNTERS[randInt(ENCOUNTERS.length)];
    const xp = 40 + randInt(81);     // modest: 40–120 (was 150–360 — too rich for a ~1-in-5 event)
    const coins = 10 + randInt(21);  // small: 10–30
    const loot = pickWeighted(enc.drops); // foe-themed loot
    const result = {
        foe: enc.foe, emoji: enc.emoji, art: `/images/sailing/enc-${enc.id}.png`, loot: enc.loot, xp, coins,
        bonus: loot.kind === "none" ? null : { label: loot.label, emoji: loot.emoji, image: loot.image || null },
    };
    // Claim atomically — the WHERE guarantees a single winner, so the grants below run exactly once.
    const claimed = await db.queryOne(
        `UPDATE mkt_sailing SET encounter_result = $2::jsonb, encounters_total = COALESCE(encounters_total, 0) + 1, updated_at = NOW()
          WHERE buyer_id = $1 AND encounter_at IS NOT NULL AND encounter_result IS NULL AND dig_state IS NULL
          RETURNING encounters_total`,
        [buyerId, JSON.stringify(result)]
    ).catch(() => null);
    if (!claimed) return;
    await awardXp(buyerId, "sail_encounter", { points: xp, gold: coins }).catch(() => {});
    // Milestone badges for weathering the open sea (cumulative encounters).
    const et = claimed.encounters_total || 0;
    if (et >= BADGE_ENC_TESTED) await grantEventBadge(buyerId, "sea_tested").catch(() => {});
    if (et >= BADGE_ENC_VETERAN) await grantEventBadge(buyerId, "sea_veteran").catch(() => {});
    if (loot.kind === "fragment") await grantFragment(buyerId, loot.n || 1).catch(() => {});
    else if (loot.kind === "chest") await addChests(buyerId, { [loot.tier]: 1 }, { source: "sailing" }).catch(() => {});
    else if (loot.kind === "consumable") await grantConsumable(buyerId, loot.id, 1).catch(() => {});
    await trackActivity(buyerId, "sail_encounter", { type: enc.id, outcome: loot.kind, gold: coins }).catch(() => {});
}

// `skyKey` is the ambiance sky the CLIENT says it's rendering. It is accepted for call-site compatibility and
// then ignored for anything that matters: the fishing weather gate now resolves server-side from the sky over
// the shop (fishing.js denSkies), because gating on the member's own weather needed a location grant most
// members never gave, which silently made nine of the twenty-four species uncatchable for them.
export async function getSailingState(buyerId, skyKey = null) {
    void skyKey;
    await resolveDueEncounter(buyerId).catch(() => {}); // apply a due encounter (once) so "checking back" surfaces it
    await rollMerchant(buyerId).catch(() => {}); // roll the Gold Merchant once at the arrival interstitial
    const [row, goldRow, others, chestArt, sea, raidExtras] = await Promise.all([
        readRow(buyerId),
        db.queryOne(`SELECT COALESCE(gold, 0) AS gold FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null),
        // Everyone else sails the horizon behind you — a REAL member riding their REAL ship + pet. Every member
        // has at least the starter hull; if they've bought boat upgrades we show that form. Ordered by recent
        // activity so you see LIVE players, not always the same top-XP account.
        db.query(
            `SELECT b.id, b.alias, b.avatar_sprite_url, b.avatar_sprite_flip, b.avatar_url, b.featured_collectible,
                    COALESCE(s.speed_level, 0) AS speed_level, COALESCE(s.luck_level, 0) AS luck_level,
                    COALESCE(s.rarity_level, 0) AS rarity_level, COALESCE(s.find_level, 0) AS find_level,
                    COALESCE(s.raid_level, 0) AS raid_level
               FROM mkt_buyer b
               LEFT JOIN mkt_sailing s ON s.buyer_id = b.id
              WHERE b.id <> $1 AND b.alias IS NOT NULL
                AND (b.avatar_sprite_url IS NOT NULL OR b.avatar_url IS NOT NULL)
              ORDER BY b.last_seen_at DESC NULLS LAST, COALESCE(b.xp, 0) DESC
              LIMIT 24`,
            [buyerId]
        ).catch(() => []),
        getChestArt().catch(() => ({})),
        equippedSeaAffinity(buyerId),
        equippedRaidExtras(buyerId),
    ]);
    const seaEff = seaEffects(sea);
    const fleetPetArt = await petArtByBuyer((others || []).map((o) => ({ buyerId: o.id, petId: o.featured_collectible })));
    const fleet = (others || []).map((o) => {
        const pet = fleetPetArt[o.id] || null;
        return {
            art: boatArt(boatLevelFromUpgrades(o.speed_level, o.luck_level, o.rarity_level, o.find_level, o.raid_level)),
            name: o.alias,
            rider: o.avatar_sprite_url || o.avatar_url || null,
            // Only the AI sprite needs the face-right mirror; the built avatar already faces forward.
            riderFlip: o.avatar_sprite_url ? o.avatar_sprite_flip === true : false,
            pet: pet?.url || null,
            petFlip: pet?.flip === true,
        };
    });
    // Only pad if literally nobody else has a hero yet, so the horizon isn't dead empty in early testing.
    for (const t of [1, 2, 1]) if (fleet.length < 3) fleet.push({ art: BOAT_ART[t] || BOAT_ART[1], name: null, rider: null, riderFlip: false, pet: null, petFlip: false });
    // Pick the random horizon backdrop HERE (server-side) so it's baked into the first paint — the client no
    // longer flips from a default to the chosen one on load.
    const sky = SKY_BGS[Math.floor(Math.random() * SKY_BGS.length)];
    // The Corsair collection, fetched here where awaiting is allowed, then handed to the view builder.
    const collections = await (async () => {
        const [{ collectionsForFeature }, { getOwnedPieceIds: ownedPieces }] = await Promise.all([
            import("@/lib/marketplace/sets.js"),
            import("@/lib/marketplace/collection-owned.js"),
        ]);
        // Collections count TROPHIES, which live in mkt_user_collection — reading the item bag here would
        // report every set as 0 collected.
        return collectionsForFeature("sea", await ownedPieces(buyerId).catch(() => []));
    })().catch(() => []);
    return { ...decorate(row, chestArt, seaEff.bonusWaves, raidExtras.bonusRaids, seaEff.angling, null, buyerId, collections), gold: goldRow?.gold || 0, fleet, sky, sea };
}

export async function startVoyage(buyerId, optionId = "standard") {
    const row = await readRow(buyerId);
    const state = decorate(row);
    if (state.status !== "idle") return { ok: false, error: "busy", ...(await getSailingState(buyerId)) };
    const opt = VOYAGE_OPTIONS.find((o) => o.id === optionId) || VOYAGE_OPTIONS[1];
    let voyageSpeed = seaEffects(await equippedSeaAffinity(buyerId)).voyageSpeed; // Tailwind shortens the trip
    // Following Sea: a companion shortens it further, capped at 25% so a 4h voyage lands at 3h. Added to
    // Tailwind rather than multiplied — MIN_VOYAGE_MS below is the real floor either way.
    try {
        const { getPetSystemPerk } = await import("@/lib/marketplace/pet-combat.js");
        voyageSpeed += (await getPetSystemPerk(buyerId, "following_sea")) / 100;
    } catch { /* no companion, no speed-up */ }
    const ms = Math.max(MIN_VOYAGE_MS, Math.round(voyageDurationMs(state.speed.level, state.level) * opt.mult * (1 - voyageSpeed)));
    // Fortune-scaled roll for a marine encounter at the ORIGINAL halfway mark (Kraken Bait guarantees one).
    const forcedEnc = row?.force_encounter === true;
    const encMs = (forcedEnc || Math.random() < encounterChance(state.fortune.level)) ? String(Math.round(ms / 2)) : null;
    await db.query(
        `INSERT INTO mkt_sailing (buyer_id, departed_at, returns_at, dig_state, voyage_quality, voyage_ms, encounter_at, encounter_result, wind_recharges, updated_at)
         VALUES ($1, NOW(), NOW() + ($2 || ' milliseconds')::interval, NULL, $3, $4,
                 CASE WHEN $5::bigint IS NULL THEN NULL ELSE NOW() + ($5 || ' milliseconds')::interval END, NULL, 0, NOW())
         ON CONFLICT (buyer_id) DO UPDATE SET departed_at = NOW(), returns_at = NOW() + ($2 || ' milliseconds')::interval,
                 dig_state = NULL, voyage_quality = $3, voyage_ms = $4,
                 encounter_at = CASE WHEN $5::bigint IS NULL THEN NULL ELSE NOW() + ($5 || ' milliseconds')::interval END,
                 encounter_result = NULL, merchant_json = NULL, wind_recharges = 0, force_encounter = FALSE, arrival_notified = FALSE, idle_notified_at = NULL, updated_at = NOW()`,
        [buyerId, String(ms), opt.id, ms, encMs]
    ).catch(() => {});
    await bumpQuestProgress(buyerId, "voyage_start", 1).catch(() => {}); // "Set sail" daily quest
    await trackActivity(buyerId, "sail_voyage", { option: opt.id, hours: Math.round(ms / 3600000) }).catch(() => {});
    return { ok: true, ...(await getSailingState(buyerId)) };
}

// Does sailing need the player's attention? (Landed & waiting to dig, or an unacknowledged encounter.) Drives
// the red-alert dot on the Sailing nav pill + hub tile.
export async function sailingNeedsAttention(buyerId) {
    if (!buyerId) return false;
    const row = await db.queryOne(
        `SELECT (departed_at IS NOT NULL AND returns_at IS NOT NULL AND returns_at <= NOW() AND dig_state IS NULL) AS landed,
                (encounter_result IS NOT NULL) AS enc,
                -- UNUSED CASTS. Fishing's whole problem is that it happens during a voyage nobody is watching:
                -- you set sail, close the tab, and the ten free casts quietly expire. This lights the Sailing
                -- pill while the boat is out (or moored) and you still have a line to throw, which is the only
                -- moment the nudge is actionable.
                (departed_at IS NOT NULL AND dig_state IS NULL
                 AND COALESCE(CASE WHEN fish_day = (NOW() AT TIME ZONE 'America/Chicago')::date
                                   THEN fish_casts ELSE 0 END, 0) < 10) AS castsleft
           FROM mkt_sailing WHERE buyer_id = $1`,
        [buyerId],
    ).catch(() => null);
    return Boolean(row && (row.landed || row.enc || row.castsleft));
}

// Chests you could forge RIGHT NOW out of the shards already in the hold, for the nav badge. Shards don't
// expire and the hold is two screens deep, so a fully-paid-for chest could sit there for days with nothing
// anywhere saying so — the one piece of sailing progress that was invisible from outside sailing.
export async function forgeableChests(buyerId) {
    if (!buyerId) return 0;
    const row = await readRow(buyerId).catch(() => null);
    if (!row) return 0;
    const cost = boatPerks(decorate(row).level).forgeCost;
    if (!(cost > 0)) return 0;
    const counts = (typeof row.fragments_json === "object" && row.fragments_json) || {};
    return Object.entries(counts).reduce(
        (n, [tier, held]) => n + (CHEST_TIERS[tier] ? Math.floor((Number(held) || 0) / cost) : 0),
        0,
    );
}

// Casts still unthrown today, for the nav nudge. Deliberately separate from the boolean above so the pill can
// say "3 casts" rather than just glowing — a number people can act on beats a dot they learn to ignore.
export async function unusedCasts(buyerId) {
    if (!buyerId) return 0;
    const row = await db.queryOne(
        `SELECT departed_at, dig_state, fish_line_level, fish_lure_level, fish_net_level, fish_gaff_level,
                COALESCE(fish_casts, 0) AS fish_casts, COALESCE(fish_recharges, 0) AS fish_recharges,
                (fish_day = (NOW() AT TIME ZONE 'America/Chicago')::date) AS fish_is_today,
                -- Same reason, same trap: compared in SQL so today means the STORE's today, not the server's.
                (merchant_buy_day = (NOW() AT TIME ZONE 'America/Chicago')::date) AS merchant_buys_are_today
           FROM mkt_sailing WHERE buyer_id = $1`,
        [buyerId],
    ).catch(() => null);
    if (!row?.departed_at || row.dig_state) return 0;   // only while there's actually a rail to fish from
    const sea = await equippedSeaAffinity(buyerId).catch(() => ({}));
    const { castsFor } = await import("@/lib/marketplace/fishing.js");
    // Through castsFor like everything else. This did its own castsPerDay() sum and left out bought recharges,
    // so the nav pill under-counted for anyone who had paid for an extra cast.
    return castsFor(row, seaEffects(sea).angling).left;
}

// CRON: push members whose voyage just LANDED (once each) so they come back to dig. Voyages resolve lazily on
// read, so this is the only place that can nudge a player whose app is closed. Atomic claim per row = no dupes.
export async function runSailingArrivals() {
    const due = await db.query(
        `SELECT buyer_id FROM mkt_sailing
          WHERE departed_at IS NOT NULL AND returns_at IS NOT NULL AND returns_at <= NOW()
            AND dig_state IS NULL AND arrival_notified = FALSE
          LIMIT 500`,
    ).catch(() => []);
    let pushed = 0;
    let delivered = 0;
    for (const r of due) {
        const claimed = await db.queryOne(
            `UPDATE mkt_sailing SET arrival_notified = TRUE
              WHERE buyer_id = $1 AND arrival_notified = FALSE AND returns_at <= NOW() AND dig_state IS NULL
              RETURNING buyer_id`,
            [r.buyer_id],
        ).catch(() => null);
        if (!claimed) continue;
        // Record what the push actually did. `pushed` counts rows we claimed; `delivered` counts browsers that
        // really got it — when those two diverge, the channel is broken and the job says so instead of
        // reporting a cheerful success while reaching nobody.
        const res = await sendWebPush(r.buyer_id, {
            kind: "sailing",
            title: "🏝️ Land ho!",
            body: "Your boat reached the island — head ashore and dig for buried treasure.",
            url: "/marketplace/sailing", tag: "sail-arrival", data: { type: "sail_arrival" },
        }).catch(() => ({ sent: 0, error: true }));
        pushed += 1;
        delivered += Number(res?.sent) || 0;
    }
    return { checked: due.length, pushed, delivered };
}

// How long the boat can sit unattended before we nudge, and how often a nudge may repeat while it stays that
// way (so it's a reminder, not a nag). `idle_notified_at` is the shared "last nudge" stamp for BOTH reminders
// below, which is why a single repeat window governs them.
const SAIL_IDLE_AFTER_HOURS = 3;
const SAIL_IDLE_REPEAT_HOURS = 20;

// Nudge anyone whose boat is waiting on them. Two dead-ends, one cadence:
//
//   1. LANDED, TREASURE UNDUG — runSailingArrivals() fires exactly ONCE per voyage (arrival_notified latches
//      TRUE and only clears on the next departure). A player who landed and didn't dig then fell into a hole:
//      the arrival latch was spent, and reminder 2 below could never see them because a landed boat still
//      carries departed_at. They got no nudge again, ever. That hole is why idle_notified_at had never been
//      stamped once in production, with 14 players stranded in it — the oldest for a week.
//   2. DOCKED, NOT SAILING — dig finished, boat home, player hasn't sent it back out.
//
// Both claim atomically (stamp only if still due) so overlapping cron ticks can't double-send, and neither
// touches updated_at — that column is reminder 2's idle clock, and re-stamping it would defer it forever.
export async function runSailingIdleReminders() {
    const after = String(SAIL_IDLE_AFTER_HOURS);
    const repeat = String(SAIL_IDLE_REPEAT_HOURS);
    let pushed = 0;
    let delivered = 0;

    // sendWebPush never throws and reports {sent}. Count REAL deliveries, not loop iterations — discarding that
    // result is exactly how a dead push channel keeps reporting success while reaching nobody.
    const nudge = async (buyerId, push) => {
        const res = await sendWebPush(buyerId, push).catch(() => ({ sent: 0, error: true }));
        pushed += 1;
        delivered += Number(res?.sent) || 0;
    };

    // ── 1. Landed, but the treasure is still in the ground ──────────────────────────────────────────────────
    // No voyages_completed gate here: that counter only increments once a dig FINISHES, so requiring it would
    // skip everyone stranded on their very first voyage — the players most worth bringing back.
    const stranded = await db.query(
        `SELECT buyer_id FROM mkt_sailing
          WHERE departed_at IS NOT NULL AND returns_at IS NOT NULL AND dig_state IS NULL
            AND returns_at < NOW() - ($1 || ' hours')::interval
            AND (idle_notified_at IS NULL OR idle_notified_at < NOW() - ($2 || ' hours')::interval)
          LIMIT 500`,
        [after, repeat],
    ).catch(() => []);
    for (const r of stranded) {
        const claimed = await db.queryOne(
            `UPDATE mkt_sailing SET idle_notified_at = NOW()
              WHERE buyer_id = $1 AND departed_at IS NOT NULL AND dig_state IS NULL AND returns_at <= NOW()
                AND (idle_notified_at IS NULL OR idle_notified_at < NOW() - ($2 || ' hours')::interval)
              RETURNING buyer_id`,
            [r.buyer_id, repeat],
        ).catch(() => null);
        if (!claimed) continue;
        await nudge(r.buyer_id, {
            kind: "sailing",
            title: "🏝️ Your treasure is still buried",
            body: "Your crew landed but never dug. Grab a shovel — the loot is waiting.",
            url: "/marketplace/sailing", tag: "sail-dig", data: { type: "sail_dig" },
        });
    }

    // ── 2. Docked and idle — "you forgot to sail" ───────────────────────────────────────────────────────────
    // voyages_completed > 0 here so a never-sailed account isn't pestered. Cleared when a new voyage departs.
    const idle = await db.query(
        `SELECT buyer_id FROM mkt_sailing
          WHERE departed_at IS NULL AND dig_state IS NULL AND voyages_completed > 0
            AND updated_at < NOW() - ($1 || ' hours')::interval
            AND (idle_notified_at IS NULL OR idle_notified_at < NOW() - ($2 || ' hours')::interval)
          LIMIT 500`,
        [after, repeat],
    ).catch(() => []);
    for (const r of idle) {
        // Atomic claim — stamp idle_notified_at only if it's still due, so overlapping cron ticks can't double-send.
        const claimed = await db.queryOne(
            `UPDATE mkt_sailing SET idle_notified_at = NOW()
              WHERE buyer_id = $1 AND departed_at IS NULL AND dig_state IS NULL
                AND (idle_notified_at IS NULL OR idle_notified_at < NOW() - ($2 || ' hours')::interval)
              RETURNING buyer_id`,
            [r.buyer_id, repeat],
        ).catch(() => null);
        if (!claimed) continue;
        await nudge(r.buyer_id, {
            kind: "sailing",
            title: "⛵ Your boat is docked",
            body: "It's ready to set sail — send it on a voyage to haul back treasure.",
            url: "/marketplace/sailing", tag: "sail-idle", data: { type: "sail_idle" },
        });
    }

    return { strandedChecked: stranded.length, idleChecked: idle.length, idlePushed: pushed, idleDelivered: delivered };
}

// Wave to a passing sailor — up to WAVES_PER_DAY/day, each a little XP + coins + a small travel-time cut.
// Atomic: the WHERE enforces mid-voyage + the daily cap so rapid taps can't overspend.
export async function waveAtSailor(buyerId) {
    const row = await readRow(buyerId);
    const state = decorate(row);
    if (state.status !== "sailing") return { ok: false, error: "not_sailing", ...(await getSailingState(buyerId)) };
    const cap = wavesPerDay(row?.find_level || 0) + seaEffects(await equippedSeaAffinity(buyerId)).bonusWaves; // Luck + Tailwind raise the daily wave cap
    const waved = await db.queryOne(
        `UPDATE mkt_sailing
            SET wave_count = CASE WHEN wave_day = (NOW() AT TIME ZONE 'America/Chicago')::date THEN wave_count + 1 ELSE 1 END,
                wave_day = (NOW() AT TIME ZONE 'America/Chicago')::date,
                waves_total = COALESCE(waves_total, 0) + 1,
                returns_at = GREATEST(NOW(), returns_at - ($2 || ' milliseconds')::interval),
                updated_at = NOW()
          WHERE buyer_id = $1 AND dig_state IS NULL AND returns_at IS NOT NULL AND returns_at > NOW()
            AND (wave_day IS DISTINCT FROM (NOW() AT TIME ZONE 'America/Chicago')::date OR wave_count < $3)
          RETURNING wave_count, waves_total`,
        [buyerId, String(WAVE_SHAVE_MS), cap]
    ).catch(() => null);
    if (!waved) return { ok: false, error: "no_waves", ...(await getSailingState(buyerId)) };
    await awardXp(buyerId, "sail_wave", { points: WAVE_XP, gold: WAVE_COINS }).catch(() => {});
    await bumpQuestProgress(buyerId, "wave", 1).catch(() => {}); // "Greet a passing sailor" daily quest
    await trackActivity(buyerId, "sail_wave", {}).catch(() => {});
    // Milestone badges for friendliness (cumulative waves).
    const wt = waved.waves_total || 0;
    if (wt >= BADGE_WAVE_FRIENDLY) await grantEventBadge(buyerId, "wave_friendly").catch(() => {});
    if (wt >= BADGE_WAVE_AMBASSADOR) await grantEventBadge(buyerId, "wave_ambassador").catch(() => {});
    if (wt >= BADGE_WAVE_BELOVED) await grantEventBadge(buyerId, "wave_beloved").catch(() => {});
    return { ok: true, waved: { xp: WAVE_XP, coins: WAVE_COINS, minutes: WAVE_SHAVE_MS / 60000 }, ...(await getSailingState(buyerId)) };
}

// ── FISHING ────────────────────────────────────────────────────────────────────────────────────────────
// Thin wrappers so the fishing actions return the full sailing state like every other mutator, and so the ANGLING
// points and the voyage status are resolved here (fishing.js stays free of the sea-affinity plumbing).
export async function fishCast(buyerId, { sky = null } = {}) {
    if (!fishingUnlocked(buyerId)) return { ok: false, error: "not_available" };
    void sky; // the weather gate is resolved server-side now — see getSailingState's note
    const [row, sea] = await Promise.all([readRow(buyerId), equippedSeaAffinity(buyerId)]);
    const status = decorate(row).status;
    const res = await castLine(buyerId, { status, angling: seaEffects(sea).angling });
    return { ...res, ...(await getSailingState(buyerId)) };
}

export async function fishLand(buyerId, { quality = 0, missed = false, sky = null } = {}) {
    if (!fishingUnlocked(buyerId)) return { ok: false, error: "not_available" };
    const res = await landFish(buyerId, { quality, missed });
    if (res.ok && res.landed) {
        // A landed fish is a sailing daily too — same metric pump the rest of the feature uses.
        await bumpQuestProgress(buyerId, "fish", 1).catch(() => {});
    }
    // ORDER MATTERS AND IT BITES. The sailing state is spread LAST because the screen needs its fresh values
    // (gold balance, casts, status) to win — but that means every key the catch shares with it gets
    // overwritten, and both have `gold`. The catch's `gold` is the payout; the state's is the member's whole
    // balance. Anything rendering res.gold shows a wallet where a reward should be.
    // `catchResult` is the untouched result and is what the UI must read. Do not "simplify" it away.
    return { ...res, catchResult: res.landed ? res : null, ...(await getSailingState(buyerId, sky)) };
}

// The Den-wide boards. Re-exported so the route has one import surface, and gated too — they'd otherwise
// advertise an unreleased feature (and its whole species list) to anyone who asks.
//   records → biggest ever landed, per species
//   top     → the leaderboard: best catches in the Den, scored against each species' own maximum
/** Buy one more cast for today. Thin pass-through so the route keeps a single fishing entry point. */
export const fishRecharge = async (buyerId) => {
    const { buyRecharge } = await import("@/lib/marketplace/fishing.js");
    return buyRecharge(buyerId);
};

export const fishRecords = async (buyerId) => {
    if (!fishingUnlocked(buyerId)) return { records: [], top: [] };
    const [records, top] = await Promise.all([denFishRecords(), denTopCatches(25)]);
    return { records, top };
};

// Acknowledge (dismiss) a resolved encounter's recap — clears it so it never shows again.
export async function ackEncounter(buyerId) {
    await db.query(`UPDATE mkt_sailing SET encounter_result = NULL, encounter_at = NULL, updated_at = NOW() WHERE buyer_id = $1`, [buyerId]).catch(() => {});
    return { ok: true, ...(await getSailingState(buyerId)) };
}

// ── RAIDS ──────────────────────────────────────────────────────────────────────────────────────────────
const RAID_TARGET_COLS = `b.id, b.alias, b.display_name, b.avatar_sprite_url, b.avatar_sprite_flip, b.avatar_url, b.featured_collectible,
                COALESCE(s.speed_level,0) AS speed_level, COALESCE(s.luck_level,0) AS luck_level,
                COALESCE(s.rarity_level,0) AS rarity_level, COALESCE(s.find_level,0) AS find_level,
                COALESCE(s.raid_level,0) AS raid_level,
                COALESCE(s.gun_level,0) AS gun_level, COALESCE(s.gunnery_level,0) AS gunnery_level,
                COALESCE(s.hull_level,0) AS hull_level, COALESCE(s.loadout,'round') AS loadout`;
const RAID_RARITY_RANK = { common: 0, rare: 1, epic: 2, legendary: 3, mythic: 4, ascendant: 5, eternal: 6 };

// Pick a random passing player to raid — a real member with a hero. They're a target only; they lose nothing.
async function pickRaidTarget(buyerId) {
    return db.queryOne(
        `SELECT ${RAID_TARGET_COLS}
           FROM mkt_buyer b LEFT JOIN mkt_sailing s ON s.buyer_id = b.id
          WHERE b.id <> $1 AND b.alias IS NOT NULL AND (b.avatar_sprite_url IS NOT NULL OR b.avatar_url IS NOT NULL)
          ORDER BY random() LIMIT 1`,
        [buyerId]
    ).catch(() => null);
}
// Fetch a SPECIFIC target the player chose (validated: a real, other member).
async function raidTargetById(buyerId, targetId) {
    if (!targetId) return null;
    return db.queryOne(
        `SELECT ${RAID_TARGET_COLS}
           FROM mkt_buyer b LEFT JOIN mkt_sailing s ON s.buyer_id = b.id
          WHERE b.id = $2 AND b.id <> $1 AND b.alias IS NOT NULL`,
        [buyerId, targetId]
    ).catch(() => null);
}

// The selectable-target list for the raid picker: real passing members, the SHIP you would be fighting (guns
// and hull, from their gun deck) and a hint of the hold you would be plundering (item count + best rarity).
// Sorted by the loot, because that is what you are choosing between — but the guns are shown, because that is
// what decides whether you get it.
export async function getRaidTargets(buyerId, limit = 12) {
    if (!raidsEnabled(buyerId)) return { targets: [], me: null }; // under construction — see raidsEnabled
    const rows = await db.query(
        `SELECT ${RAID_TARGET_COLS}
           FROM mkt_buyer b LEFT JOIN mkt_sailing s ON s.buyer_id = b.id
          WHERE b.id <> $1 AND b.alias IS NOT NULL AND (b.avatar_sprite_url IS NOT NULL OR b.avatar_url IS NOT NULL)
          ORDER BY b.last_seen_at DESC NULLS LAST LIMIT 40`,
        [buyerId]
    ).catch(() => []);
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const items = await db.query(`SELECT buyer_id, item_id FROM mkt_user_item WHERE buyer_id = ANY($1)`, [ids]).catch(() => []);
    const gear = new Map();
    for (const it of items) {
        const def = itemById(it.item_id);
        if (!def) continue;
        const cur = gear.get(it.buyer_id) || { count: 0, topRank: -1, topRarity: null };
        cur.count += 1;
        const rank = RAID_RARITY_RANK[def.rarity] ?? -1;
        if (rank > cur.topRank) { cur.topRank = rank; cur.topRarity = def.rarity; }
        gear.set(it.buyer_id, cur);
    }
    const list = rows.map((r) => {
        const level = boatLevelFromUpgrades(r.speed_level, r.luck_level, r.rarity_level, r.find_level, r.raid_level);
        const g = gear.get(r.id) || { count: 0, topRank: -1, topRarity: null };
        return {
            id: r.id, name: r.display_name || r.alias, handle: r.alias, level, boat: boatArt(level),
            rider: r.avatar_sprite_url || r.avatar_url || null,
            riderFlip: r.avatar_sprite_url ? r.avatar_sprite_flip === true : false,
            items: g.count, topRarity: g.topRarity, gearRank: g.topRank,
            // Their SHIP, in the same two numbers your own gun deck reports — plus the fleet rank it fights
            // like, which is also exactly what beating it pays.
            guns: gunsFor(r.gun_level || 0), hull: hullFor(r.hull_level || 0, level),
            ammo: r.loadout || "round",
            rank: fleetRankForShip({ guns: gunsFor(r.gun_level || 0), hp: hullFor(r.hull_level || 0, level) }),
        };
    });
    // What YOU are bringing — needed before the sort, because the sort depends on it.
    const mine = await readRow(buyerId);
    const myLevel = boatLevelFromUpgrades(mine?.speed_level || 0, mine?.luck_level || 0, mine?.rarity_level || 0, mine?.find_level || 0, mine?.raid_level || 0);
    const myGuns = gunsFor(mine?.gun_level || 0), myHull = hullFor(mine?.hull_level || 0, myLevel);

    // WORTH IT × WINNABLE, not just worth it. Sorting on loot alone put the heaviest ship in the Den at the
    // top of a brand-new captain's list, which is the one raid a day they have to spend. `odds` is a rough
    // read of the matchup (their broadside and hull against yours) and it scales the loot score, so the top of
    // the list is the best prize you can actually take rather than the best prize that exists.
    const scored = list.map((t) => {
        // Shared with the row on screen (ship-battle.js) so the fleet and rivals rank on ONE scale.
        const odds = matchupOdds({ myGuns, myHull, guns: t.guns, hull: t.hull });
        const loot = (t.gearRank + 1) * 10 + t.items;
        return { ...t, odds: Math.round(odds * 100), outgunned: t.guns > myGuns && t.hull > myHull, score: loot * odds };
    });
    scored.sort((a, z) => z.score - a.score || z.gearRank - a.gearRank || z.items - a.items);

    return {
        targets: scored.slice(0, limit),
        me: { guns: myGuns, hull: myHull, ammo: mine?.loadout || "round", level: myLevel },
    };
}

// A fighter's non-zero equipped stats, in display order, for the battle card.
// Run the once-a-day raid: a SHIP battle against another member's boat and gun deck. Win → gold (+ a chance to
// copy one random item of theirs; they keep it). Lose → 10–100 gold, and the defender takes a cut for repelling
// you. The raid-dodge track (raid_level) gives a small chance the daily raid isn't consumed.
export async function doRaid(buyerId, targetId = null) {
    if (!raidsEnabled(buyerId)) return { ok: false, error: "under_construction", ...(await getSailingState(buyerId)) };
    const row = await readRow(buyerId);
    // Same as the fleet: an open fight resumes rather than silently refusing. See doFleetBattle.
    const openNow = readBattle(row);
    if (openNow) {
        return { ok: true, resumed: true,
            battle: { ...battleView(openNow.state, openNow.meta), events: [], over: false },
            ...(await getSailingState(buyerId)) };
    }
    const myLevel = boatLevelFromUpgrades(row?.speed_level || 0, row?.luck_level || 0, row?.rarity_level || 0, row?.find_level || 0, row?.raid_level || 0);
    const raidExtras = await equippedRaidExtras(buyerId); // Dread Corsair: +1 raid/day, double win gold
    if (raidsUsedToday(row) >= raidsPerDay(myLevel, raidExtras.bonusRaids)) return { ok: false, error: "no_raid", ...(await getSailingState(buyerId)) };
    const target = (await raidTargetById(buyerId, targetId)) || (targetId ? null : await pickRaidTarget(buyerId));
    if (!target) return { ok: false, error: "no_target", ...(await getSailingState(buyerId)) };

    const foeLevel = boatLevelFromUpgrades(target.speed_level, target.luck_level, target.rarity_level, target.find_level, target.raid_level);
    const [me, mySea] = await Promise.all([
        db.queryOne(`SELECT alias, display_name, avatar_sprite_url, avatar_sprite_flip, avatar_url, featured_collectible FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null),
        equippedSeaAffinity(buyerId),
    ]);
    const fired = await consumeAmmo(buyerId, row);
    const mine = await myShipProfile(buyerId, { ...row, loadout: fired }, me?.display_name || me?.alias || "Your ship");
    const theirs = shipProfile({
        name: target.display_name || target.alias || "Rival ship", boatLevel: foeLevel,
        gunLevel: target.gun_level || 0, gunneryLevel: target.gunnery_level || 0, hullLevel: target.hull_level || 0,
        ammo: target.loadout || "round", art: boatArt(foeLevel),
    });

    // The raid is spent at the OPENING (unless cunning saves it), so a losing fight cannot be abandoned and
    // re-rolled by closing the tab.
    const dodged = Math.random() < raidDodgeChance(row?.raid_level || 0);
    await db.query(`INSERT INTO mkt_sailing (buyer_id) VALUES ($1) ON CONFLICT (buyer_id) DO NOTHING`, [buyerId]).catch(() => {});
    if (!dodged) await db.query(
        `UPDATE mkt_sailing
            SET raid_count = CASE WHEN raid_day = (NOW() AT TIME ZONE 'America/Chicago')::date THEN raid_count + 1 ELSE 1 END,
                raid_day = (NOW() AT TIME ZONE 'America/Chicago')::date, updated_at = NOW()
          WHERE buyer_id = $1`, [buyerId]).catch(() => {});
    await bumpQuestProgress(buyerId, "raid_do", 1).catch(() => {});

    const crew = await petArtByBuyer([
        { buyerId, petId: me?.featured_collectible },
        { buyerId: target.id, petId: target.featured_collectible },
    ]);
    const meta = {
        kind: "raid", targetId: target.id, dodged,
        targetName: target.display_name || target.alias,
        meProfile: { name: mine.name, boatLevel: myLevel, gunLevel: row?.gun_level || 0,
            gunneryLevel: row?.gunnery_level || 0, hullLevel: row?.hull_level || 0, ammo: fired, art: mine.art, sea: mySea },
        foeProfile: { name: theirs.name, boatLevel: foeLevel, gunLevel: target.gun_level || 0,
            gunneryLevel: target.gunnery_level || 0, hullLevel: target.hull_level || 0,
            ammo: target.loadout || "round", art: boatArt(foeLevel) },
        me: { name: mine.name, art: mine.art, guns: mine.guns, hp: mine.hp, ammo: mine.ammo.id, level: myLevel,
            rider: me?.avatar_sprite_url || null,
            riderFlip: me?.avatar_sprite_flip === true,
            pet: crew[buyerId] || null },
        foe: { name: theirs.name, cls: `boat level ${foeLevel}`, art: theirs.art, guns: theirs.guns, hp: theirs.hp,
            ammo: theirs.ammo.id, boss: false, mirror: true, flavor: "A passing ship, and everything they are carrying.",
            rider: target.avatar_sprite_url || null,
            riderFlip: target.avatar_sprite_flip === true,
            pet: crew[target.id] || null },
    };
    const state = initBattleState(mine, theirs);
    await saveBattle(buyerId, state, meta);
    return { ok: true, battle: { ...battleView(state, meta), events: [], over: false }, ...(await getSailingState(buyerId)) };
}

// Paying out a finished RAID. ONE REWARD POOL: a rival's ship is matched to the fleet rank it most resembles
// and paid out of the same table as everything else. The old raid-specific design — a flat 25-75 gold, a 0.5%
// chance to copy one of their items, a gold penalty on defeat and a cut of that penalty to the defender — is
// gone. Two reward designs meant two things to balance against each other forever, and the raid half was the
// weaker of them: it could not pay doubloons, so raiding made you worse at raiding.
//
// What that costs, said plainly: there is no longer any way to take a piece of another member's gear. That was
// the most distinctive thing about a raid, and it is the price of having one reward design.
//
// Losing costs the battle and nothing else, exactly as it does against the fleet. No gold penalty means there
// is nothing to pay a defender a share OF, so the defender's bounty goes with it — they still get the report
// and the badges for driving somebody off.
async function finishRaidBattle(buyerId, meta, res) {
    const spoils = [];
    if (res.win) {
        const rank = fleetRankForShip({ guns: meta.foe?.guns, hp: meta.foe?.hp });
        const reward = fleetReward(rank, { first: true });
        // Plunder (sea affinity, chiefly the Dread Corsair set) fattens the purse off a beaten crew.
        const sea = await equippedSeaAffinity(buyerId).catch(() => ({}));
        const bonus = 1 + seaEffects(sea).plunderBonus;
        for (const k of ["doubloons", "gold", "xp", "fragments"]) {
            if (reward[k]) reward[k] = Math.max(1, Math.round(reward[k] * bonus));
        }
        const paid = await payFleetReward(buyerId, reward);
        spoils.push(...paid);

        const wonRow = await db.queryOne(`UPDATE mkt_sailing SET raids_won = COALESCE(raids_won, 0) + 1 WHERE buyer_id = $1 RETURNING raids_won`, [buyerId]).catch(() => null);
        const wins = wonRow?.raids_won || 0;
        if (wins >= BADGE_RAID_MARAUDER) await grantEventBadge(buyerId, "raid_marauder").catch(() => {});
        if (wins >= BADGE_RAID_SCOURGE) await grantEventBadge(buyerId, "raid_scourge").catch(() => {});
        if (res.state.myHp >= res.state.myMax) await grantEventBadge(buyerId, "raid_untouchable").catch(() => {});
        if (wins >= COSMETIC_WARBORN_WINS) await db.query(`INSERT INTO mkt_cosmetic_unlock (buyer_id, category, ref) VALUES ($1, 'border', 'warborn') ON CONFLICT DO NOTHING`, [buyerId]).catch(() => {});
    } else if (meta.targetId) {
        // The defender is told they drove somebody off, and it counts toward their badges — but there is no
        // purse attached, because the raider no longer loses one.
        await db.query(`INSERT INTO mkt_raid_defense (defender_id, attacker_id, gold, gear_item_id) VALUES ($1, $2, 0, NULL)`, [meta.targetId, buyerId]).catch(() => {});
        const defRow = await db.queryOne(
            `INSERT INTO mkt_sailing (buyer_id, raids_defended) VALUES ($1, 1)
             ON CONFLICT (buyer_id) DO UPDATE SET raids_defended = COALESCE(mkt_sailing.raids_defended, 0) + 1 RETURNING raids_defended`,
            [meta.targetId]
        ).catch(() => null);
        const defended = defRow?.raids_defended || 0;
        if (defended >= BADGE_RAID_DEFENDER) await grantEventBadge(meta.targetId, "raid_defender").catch(() => {});
        if (defended >= BADGE_RAID_BASTION) await grantEventBadge(meta.targetId, "raid_bastion").catch(() => {});
    }
    if (meta.dodged) spoils.push({ kind: "free", n: 1 });
    await trackActivity(buyerId, "sail_raid", { outcome: res.win ? "win" : "lose", foe: meta.targetName, rank: res.win ? fleetRankForShip({ guns: meta.foe?.guns, hp: meta.foe?.hp }) : null }).catch(() => {});
    return spoils;
}

// The "you got raided (and won)" welcome-back report: every raid you repelled since you last saw it, grouped
// by attacker, with their hero card, how many times you beat them, gold earned, and any gear you took. Reading
// it marks the entries seen so it only pops once.
export async function getUnseenRaidDefenses(buyerId) {
    // While raiding is under construction only the dev can raid — but their targets are ordinary members, and
    // a "you were raided!" report is the feature announcing itself to someone who cannot see it. Nobody loses
    // anything by being raided (the terms are win-only for the raider), so withholding the report costs them
    // nothing and keeps the rebuild invisible.
    if (!raidsEnabled(buyerId)) return [];
    if (!buyerId) return { defenses: [], totalGold: 0, totalWins: 0 };
    const rows = await db
        .query(
            `SELECT attacker_id, COUNT(*)::int AS n, COALESCE(SUM(gold), 0)::int AS gold,
                    array_remove(array_agg(gear_item_id), NULL) AS gears
               FROM mkt_raid_defense WHERE defender_id = $1 AND seen_at IS NULL
              GROUP BY attacker_id ORDER BY n DESC, gold DESC`,
            [buyerId]
        )
        .catch(() => []);
    if (!rows.length) return { defenses: [], totalGold: 0, totalWins: 0 };
    const ids = rows.map((r) => r.attacker_id);
    const buyers = await db.query(`SELECT id, display_name, alias, COALESCE(xp,0) AS xp, avatar_sprite_url, avatar_sprite_flip, equipped_border, featured_collectible FROM mkt_buyer WHERE id = ANY($1)`, [ids]).catch(() => []);
    const byId = new Map((buyers || []).map((b) => [b.id, b]));
    const defencePetArt = await petArtByBuyer((buyers || []).map((b) => ({ buyerId: b.id, petId: b.featured_collectible })));
    const defenses = rows.map((r) => {
        const b = byId.get(r.attacker_id) || {};
        const pet = defencePetArt[b.id] || null;
        const gear = (r.gears || []).map((id) => { const d = itemById(id); return d ? { name: d.name, rarity: d.rarity } : null; }).filter(Boolean);
        return {
            attacker: {
                name: b.display_name || b.alias || "A raider",
                alias: b.alias || null,
                level: levelForXp(b.xp || 0).level,
                avatarUrl: b.avatar_sprite_url || null,
                avatarFlip: b.avatar_sprite_url ? b.avatar_sprite_flip === true : false,
                border: b.equipped_border && b.equipped_border !== "none" ? b.equipped_border : null,
                petUrl: pet?.url || null,
                petFlip: pet?.flip === true,
            },
            count: r.n,
            gold: r.gold,
            gear,
        };
    });
    await db.query(`UPDATE mkt_raid_defense SET seen_at = NOW() WHERE defender_id = $1 AND seen_at IS NULL`, [buyerId]).catch(() => {});
    return { defenses, totalGold: rows.reduce((s, r) => s + r.gold, 0), totalWins: rows.reduce((s, r) => s + r.n, 0) };
}

// Buy back your daily raid after it's spent. Cost DOUBLES with each reset that day (free while testing). Clears
// raid_day so the raid is available again, and bumps the per-day reset counter that drives the escalating price.
// ── SHIP BATTLES: THE GUN DECK, THE FLEET AND THE QUARTERMASTER ──────────────────────────────────────────────
// Combat progression is bought with DOUBLOONS, not gold. Gold is minted by half the game — letting it buy
// gunnery would mean the best warship in the Den belongs to whoever farms the most rather than to whoever
// fights. Doubloons only come out of a ship battle, so the gun deck is paid for at sea.
// ONE ALLOWANCE FOR BOTH KINDS OF BATTLE. The fleet and member raids used to hold separate daily budgets —
// 3 sorties here, 3-to-5 raids there — which meant they were never competing and neither choice cost anything.
// A single pool makes every battle a decision: climb the ladder, or go and take somebody's cargo.
//
// It rides on the RAID counter (raid_count / raid_day) rather than a new one, so everything already attached
// to it keeps working and now applies to both: the Celestial hull's +1, the Dread Corsair's +1, Cunning's
// chance not to spend the battle at all, and buying another when you run out.
const BASE_RAIDS_PER_DAY_NOTE = "see BASE_RAIDS_PER_DAY — raised when the fleet joined this pool";
const COMBAT_COST_BASE = 18;          // doubloons for the first level of a combat track
const COMBAT_COST_STEP = 1.55;        // each level costs this much more than the last
export const combatUpgradeCost = (level = 0) => Math.round(COMBAT_COST_BASE * Math.pow(COMBAT_COST_STEP, Math.max(0, level)));

const ammoStock = (row) => (row && typeof row.ammo === "object" && row.ammo) || {};
const ammoCount = (row, id) => (ammoById(id).basic ? Infinity : Number(ammoStock(row)[id]) || 0);

// Everything the ship-battle screens read: the gun deck, what is in the racks, the ladder and the purse.
function combatView(row, boatLevel) {
    const gun = row?.gun_level || 0, gunnery = row?.gunnery_level || 0, hull = row?.hull_level || 0;
    const stock = ammoStock(row);
    const loaded = ammoById(row?.loadout || "round");
    const depth = row?.fleet_depth || 0;
    return {
        doubloons: row?.doubloons || 0,
        // The ship as it actually fights, in the same numbers the battle uses — no hidden maths on a screen
        // whose whole job is to let you decide what to buy next.
        ship: {
            guns: gunsFor(gun),
            accuracy: Math.round(accuracyFor(gunnery, boatLevel) * 100),
            hp: hullFor(hull, boatLevel),
            armor: Math.round(armorFor(hull) * 100),
            boatLevel,
        },
        tracks: [
            ...Object.values(COMBAT_TRACKS).map((t) => {
                const level = row?.[t.col] || 0;
                return {
                    key: t.key, name: t.name, icon: t.icon, desc: t.desc, currency: "doubloons",
                    level, max: t.max, maxed: level >= t.max,
                    cost: level >= t.max ? null : combatUpgradeCost(level),
                };
            }),
            // Cunning is a combat lever too — it decides whether a raid costs you your daily raid — so it
            // belongs with the guns rather than three cards away in the BOAT upgrade list, where it sat purely
            // because it happens to be an older track bought with gold.
            (() => {
                const level = row?.raid_level || 0;
                return {
                    key: "cunning", name: "Cunning", icon: "GiSpyglass", action: "upgrade_raid", currency: "gold",
                    desc: "Sea-dog nerve — a chance a raid does not use up your daily raid.",
                    level, max: MAX_RAID_LEVEL, maxed: level >= MAX_RAID_LEVEL,
                    cost: level >= MAX_RAID_LEVEL ? null : upgradeCost(level),
                    effect: `${raidDodgePct(level)}% free`,
                };
            })(),
        ],
        ammo: AMMO_LIST.map((a) => ({
            id: a.id, name: a.name, icon: a.icon, blurb: a.blurb, basic: a.basic, price: a.price,
            count: a.basic ? null : (Number(stock[a.id]) || 0),
            loaded: loaded.id === a.id,
        })),
        loadout: loaded.id,
        fleet: {
            depth, best: row?.fleet_best || 0, max: MAX_FLEET_RANK,
            wins: row?.fleet_wins || 0, losses: row?.fleet_losses || 0,
            cleared: depth >= MAX_FLEET_RANK,
            ships: fleetView(depth),
        },
        // A battle you walked away from — closed the tab, locked the phone, reloaded. The sortie is already
        // spent, so this fight is the only one you have; handing it back on every state read is what lets the
        // screen put you straight back on deck instead of leaving a saved fight nobody can reach.
        openBattle: (() => { const b = readBattle(row); return b ? { ...battleView(b.state, b.meta), events: [], over: false } : null; })(),
    };
}

// The player's profile for a battle: their boat, their gun deck, their sea affinity and what is loaded.
async function myShipProfile(buyerId, row, name) {
    const boatLevel = boatLevelFromUpgrades(row?.speed_level || 0, row?.luck_level || 0, row?.rarity_level || 0, row?.find_level || 0, row?.raid_level || 0);
    const sea = await equippedSeaAffinity(buyerId).catch(() => ({}));
    return shipProfile({
        name: name || "Your ship",
        boatLevel,
        gunLevel: row?.gun_level || 0,
        gunneryLevel: row?.gunnery_level || 0,
        hullLevel: row?.hull_level || 0,
        ammo: row?.loadout || "round",
        art: boatArt(boatLevel),
        sea,
    });
}

// Spend a round of the loaded ammunition (basic types are free and infinite). Returns the id actually fired,
// falling back to round shot when the racks are empty rather than refusing the battle — nobody is ever unable
// to fight because they are out of the fancy stuff.
async function consumeAmmo(buyerId, row) {
    const id = String(row?.loadout || "round");
    const def = ammoById(id);
    if (def.basic) return def.id;
    if (ammoCount(row, id) <= 0) return "round";
    const stock = { ...ammoStock(row), [id]: Math.max(0, (Number(ammoStock(row)[id]) || 0) - 1) };
    await db.query(`UPDATE mkt_sailing SET ammo = $2::jsonb, updated_at = NOW() WHERE buyer_id = $1`, [buyerId, JSON.stringify(stock)]).catch(() => {});
    return def.id;
}

// Pay out a fleet win. Deliberately a HAND of things, most of which spend somewhere else in the game — the
// fleet should move whatever else you are working on, not just its own counter.
async function payFleetReward(buyerId, reward) {
    const out = [];
    if (reward.doubloons) {
        await db.query(`UPDATE mkt_sailing SET doubloons = COALESCE(doubloons,0) + $2 WHERE buyer_id = $1`, [buyerId, reward.doubloons]).catch(() => {});
        out.push({ kind: "doubloons", n: reward.doubloons });
    }
    if (reward.gold) {
        const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`, [buyerId, reward.gold]).catch(() => null);
        await logCoin(buyerId, reward.gold, "ship_battle", { balanceAfter: paid?.gold }).catch(() => {});
        out.push({ kind: "gold", n: reward.gold });
    }
    // gold: 0 is load-bearing — awardXp pays gold 1:1 with points otherwise, and the gold is paid above.
    if (reward.xp) { await awardXp(buyerId, "ship_battle", { points: reward.xp, gold: 0 }).catch(() => {}); out.push({ kind: "xp", n: reward.xp }); }
    if (reward.fragments) {
        // Carry the TIER through to the recap. It always granted wooden and always said "+1 fragments", so the
        // one reward that varies by how hard the fight was read identically whether you sank a fishing boat or
        // the flagship.
        const tier = reward.fragTier || "wooden";
        await grantFragment(buyerId, reward.fragments, tier).catch(() => {});
        out.push({ kind: "fragments", n: reward.fragments, tier });
    }
    if (reward.parts) {
        try {
            const { addParts } = await import("@/lib/marketplace/crafting.js");
            await addParts(buyerId, reward.parts.tier, reward.parts.n);
            out.push({ kind: "parts", n: reward.parts.n, tier: reward.parts.tier });
        } catch { /* the Forge is optional — a battle never fails for it */ }
    }
    if (reward.chest) { await addChests(buyerId, { [reward.chest]: 1 }, { source: "ship_battle" }).catch(() => {}); out.push({ kind: "chest", tier: reward.chest }); }
    if (reward.seed) { const sid = await dropSeedFrom(buyerId, "ship_battle").catch(() => null); if (sid) out.push({ kind: "seed", id: sid }); }
    // PLUNDER — something off their deck. Uncommon by design and weighted hard toward common: the fleet is not
    // meant to out-supply the Forge or the chests, it is meant to occasionally hand you a story. The rank sets
    // both the odds and the ceiling, so a fishing cutter can only ever cough up something ordinary.
    if (reward.loot && Math.random() < reward.loot.chance) {
        const r = reward.loot.maxRank || 1;
        const weights = r >= 13 ? { common: 30, rare: 38, epic: 25, legendary: 7 }
            : r >= 9 ? { common: 42, rare: 40, epic: 16, legendary: 2 }
            : r >= 5 ? { common: 60, rare: 33, epic: 7 }
            : { common: 82, rare: 18 };
        const total = Object.values(weights).reduce((s, w) => s + w, 0);
        let roll = Math.random() * total;
        let rarity = "common";
        for (const [k, w] of Object.entries(weights)) { roll -= w; if (roll <= 0) { rarity = k; break; } }
        // No trophy filter needed: collection pieces are not items any more, so they cannot be in this pool.
        const pool = randomDropPool((i) => i.rarity === rarity && !i.charged);
        const pick = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
        if (pick) {
            await grantItem(buyerId, pick.id, "ship_battle").catch(() => {});
            out.push({ kind: "loot", id: pick.id, name: pick.name, rarity: pick.rarity, slot: pick.slot || null });
        }
    }
    return out;
}

// ── A BATTLE IS FOUGHT A ROUND AT A TIME ─────────────────────────────────────────────────────────────────────
// The first cut resolved the whole thing in one call and played it back, which looked fine and felt like
// nothing: you pressed Engage and watched a replay of a fight you had no part in. Now the server opens a
// battle, hands back the two ships, and waits for an ORDER. Each order resolves one exchange.
//
// The state lives on the row (mkt_sailing.battle_state) rather than in memory, so a locked screen or a reload
// mid-fight does not lose the battle — and one battle at a time per member is the anti-cheat, because the
// sortie is spent the moment the state appears and you cannot open a second fight to shop for a better opening.
const battleView = (st, meta) => ({
    kind: meta.kind, rank: meta.rank ?? null, first: meta.first ?? false,
    me: meta.me,
    // Battles saved before the fleet had captains carry no rider in their meta, and they outlive a deploy — so
    // a fight resumed across it would come back to an empty enemy deck. Fill it from the rank rather than
    // migrating the jsonb: these rows are transient and a read is the cheaper place to be forgiving.
    foe: meta.kind === "fleet" && meta.foe && !meta.foe.rider && meta.rank
        ? { ...meta.foe, rider: fleetCaptain(fleetShip(meta.rank)), riderFlip: false }
        : meta.foe,
    myHp: st.myHp, foeHp: st.foeHp, myMax: st.myMax, foeMax: st.foeMax,
    round: st.round, maxRounds: MAX_ROUNDS,
    gauge: st.gauge,
    rigged: { me: st.myRig || 0, foe: st.foeRig || 0 },
    burning: { me: st.myFire || 0, foe: st.foeFire || 0 },
    orders: ORDER_LIST.map((o) => ({ id: o.id, name: o.name, icon: o.icon, desc: o.desc })),
});

// Rebuild both profiles from the stored meta, so a round resolved an hour later fights the same two ships.
function profilesFrom(meta) {
    return { me: shipProfile(meta.meProfile), foe: meta.foeProfile.fleet ? foeProfile(meta.foeProfile) : shipProfile(meta.foeProfile) };
}

async function saveBattle(buyerId, state, meta) {
    await db.query(`INSERT INTO mkt_sailing (buyer_id) VALUES ($1) ON CONFLICT (buyer_id) DO NOTHING`, [buyerId]).catch(() => {});
    await db.query(`UPDATE mkt_sailing SET battle_state = $2::jsonb, updated_at = NOW() WHERE buyer_id = $1`,
        [buyerId, state ? JSON.stringify({ state, meta }) : null]).catch(() => {});
}
const readBattle = (row) => {
    const b = row?.battle_state;
    if (!b) return null;
    const parsed = typeof b === "string" ? (() => { try { return JSON.parse(b); } catch { return null; } })() : b;
    return parsed?.state && parsed?.meta ? parsed : null;
};

// GIVE AN ORDER — one exchange, then the fight waits again. When it ends, this is also where the spoils are
// paid, exactly once, because the state row is cleared in the same breath.
export async function shipBattleOrder(buyerId, order) {
    if (!raidsEnabled(buyerId)) return { ok: false, error: "under_construction", ...(await getSailingState(buyerId)) };
    const row = await readRow(buyerId);
    const open = readBattle(row);
    if (!open) return { ok: false, error: "no_battle", ...(await getSailingState(buyerId)) };
    const { me, foe } = profilesFrom(open.meta);
    const res = resolveRound(me, foe, open.state, order);

    if (!res.over) {
        await saveBattle(buyerId, res.state, open.meta);
        return {
            ok: true,
            battle: { ...battleView(res.state, open.meta), events: res.events, over: false,
                yourOrder: res.myOrder, theirOrder: res.theirOrder },
            ...(await getSailingState(buyerId)),
        };
    }

    // ── The fight is over. Clear the state FIRST so a double-tap cannot pay twice. ──
    await saveBattle(buyerId, null, null);
    const meta = open.meta;
    let reward = [];
    if (meta.kind === "fleet") reward = await finishFleetBattle(buyerId, meta, res);
    else reward = await finishRaidBattle(buyerId, meta, res);

    return {
        ok: true,
        battle: {
            ...battleView(res.state, meta), events: res.events, over: true,
            win: res.win, sunk: res.sunk, reward,
            yourOrder: res.myOrder, theirOrder: res.theirOrder,
        },
        ...(await getSailingState(buyerId)),
    };
}

// ── A SORTIE AGAINST THE FLEET ───────────────────────────────────────────────────────────────────────────────
// Fight the next rank down the ladder, or re-fight one already sunk for a reduced purse. Win and the ladder
// advances; lose and you have spent a sortie and nothing else — the fleet never takes a rung back.
export async function doFleetBattle(buyerId, rank = null) {
    if (!raidsEnabled(buyerId)) return { ok: false, error: "under_construction", ...(await getSailingState(buyerId)) };
    const row = await readRow(buyerId);
    // ONE FIGHT AT A TIME — but a battle already open is not a reason to do NOTHING. Walking away from a fight
    // (closing the tab, a reload) left a saved battle that no screen reopened, so every later tap on Battle
    // came back `battle_in_progress` and the button looked broken. The sortie is already spent on that fight;
    // hand it back and put them on deck to finish it.
    const openNow = readBattle(row);
    if (openNow) {
        return { ok: true, resumed: true,
            battle: { ...battleView(openNow.state, openNow.meta), events: [], over: false },
            ...(await getSailingState(buyerId)) };
    }
    const myBattleLevel = boatLevelFromUpgrades(row?.speed_level || 0, row?.luck_level || 0, row?.rarity_level || 0, row?.find_level || 0, row?.raid_level || 0);
    const extras = await equippedRaidExtras(buyerId);
    if (raidsUsedToday(row) >= raidsPerDay(myBattleLevel, extras.bonusRaids)) return { ok: false, error: "no_battles", ...(await getSailingState(buyerId)) };
    const depth = row?.fleet_depth || 0;
    // Default target is the next unbeaten rung; an explicit rank may only be one already sunk.
    const want = rank == null ? Math.min(MAX_FLEET_RANK, depth + 1) : Number(rank);
    if (!Number.isFinite(want) || want < 1 || want > MAX_FLEET_RANK) return { ok: false, error: "bad_rank", ...(await getSailingState(buyerId)) };
    if (want > depth + 1) return { ok: false, error: "locked", ...(await getSailingState(buyerId)) };
    const ship = fleetShip(want);
    if (!ship) return { ok: false, error: "bad_rank", ...(await getSailingState(buyerId)) };

    const me = await db.queryOne(`SELECT alias, display_name, avatar_sprite_url, avatar_sprite_flip, avatar_url, featured_collectible FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    const fired = await consumeAmmo(buyerId, row);
    const mine = await myShipProfile(buyerId, { ...row, loadout: fired }, me?.display_name || me?.alias || "Your ship");
    const foe = foeProfile(ship);
    const first = want > depth;

    // The battle is spent HERE, at the opening, not at the end — otherwise a fight you are losing can be
    // abandoned by closing the tab and re-rolled for free. Cunning can save it, exactly as it does for a raid:
    // one pool, one set of rules.
    const dodged = Math.random() < raidDodgeChance(row?.raid_level || 0);
    await db.query(`INSERT INTO mkt_sailing (buyer_id) VALUES ($1) ON CONFLICT (buyer_id) DO NOTHING`, [buyerId]).catch(() => {});
    if (!dodged) await db.query(
        `UPDATE mkt_sailing
            SET raid_count = CASE WHEN raid_day = (NOW() AT TIME ZONE 'America/Chicago')::date THEN raid_count + 1 ELSE 1 END,
                raid_day = (NOW() AT TIME ZONE 'America/Chicago')::date, updated_at = NOW()
          WHERE buyer_id = $1`, [buyerId]).catch(() => {});

    const crew = await petArtByBuyer([{ buyerId, petId: me?.featured_collectible }]);
    const meta = {
        kind: "fleet", rank: want, first,
        meProfile: { name: mine.name, boatLevel: mine.boatLevel, gunLevel: row?.gun_level || 0,
            gunneryLevel: row?.gunnery_level || 0, hullLevel: row?.hull_level || 0, ammo: fired, art: mine.art,
            sea: await equippedSeaAffinity(buyerId).catch(() => ({})) },
        foeProfile: { ...ship, fleet: true },
        me: { name: mine.name, art: mine.art, guns: mine.guns, hp: mine.hp, ammo: mine.ammo.id, level: mine.boatLevel,
            // Your own hull's deck line, so your hero stands on the boat rather than hovering over it, and the
            // battery it carries — one drawn cannon per gun you actually own.
            deck: boatDeck(boatTier(mine.boatLevel)),
            ports: boatGunPorts(boatTier(mine.boatLevel), mine.guns),
            rider: me?.avatar_sprite_url || null,
            riderFlip: me?.avatar_sprite_flip === true,
            pet: crew[buyerId] || null },
        foe: { name: foe.name, cls: ship.cls, art: fleetArt(ship), guns: foe.guns, hp: foe.hp, ammo: foe.ammo.id,
            boss: Boolean(ship.boss), flavor: ship.flavor, mirror: false, deck: fleetDeckOf(ship),
            ports: fleetGunPorts(ship.art, foe.guns),
            // Their captain on deck, mirrored by the scene so they face your ship.
            rider: fleetCaptain(ship), riderFlip: false, pet: null },
    };
    const state = initBattleState(mine, foe);
    await saveBattle(buyerId, state, meta);

    await trackActivity(buyerId, "ship_battle", { rank: want, ship: ship.name, ammo: fired, first }).catch(() => {});
    await bumpQuestProgress(buyerId, "ship_battle", 1).catch(() => {});

    return { ok: true, battle: { ...battleView(state, meta), events: [], over: false }, ...(await getSailingState(buyerId)) };
}

// Paying out a finished FLEET battle — called once, from shipBattleOrder, after the state row is cleared.
async function finishFleetBattle(buyerId, meta, res) {
    const want = meta.rank, first = meta.first;
    const row = await readRow(buyerId);
    const depth = row?.fleet_depth || 0;
    const reward = res.win ? fleetReward(want, { first }) : null;
    const paid = res.win ? await payFleetReward(buyerId, reward) : [];
    await db.query(
        `UPDATE mkt_sailing
            SET fleet_depth = GREATEST(COALESCE(fleet_depth,0), $2::int),
                fleet_best = GREATEST(COALESCE(fleet_best,0), $2::int),
                fleet_wins = COALESCE(fleet_wins,0) + $3::int,
                fleet_losses = COALESCE(fleet_losses,0) + $4::int,
                updated_at = NOW()
          WHERE buyer_id = $1`,
        [buyerId, res.win && first ? want : depth, res.win ? 1 : 0, res.win ? 0 : 1]
    ).catch(() => {});
    await trackActivity(buyerId, "ship_battle_end", { rank: want, win: res.win, sunk: res.sunk, rounds: res.state.round }).catch(() => {});
    if (res.win) {
        const depthNow = Math.max(depth, first ? want : depth);
        if (depthNow >= 1) await grantEventBadge(buyerId, "fleet_first_blood").catch(() => {});
        if (depthNow >= 5) await grantEventBadge(buyerId, "fleet_meg").catch(() => {});
        if (depthNow >= 10) await grantEventBadge(buyerId, "fleet_tithe").catch(() => {});
        if (depthNow >= MAX_FLEET_RANK) await grantEventBadge(buyerId, "fleet_admiral").catch(() => {});
        if (res.state.myHp >= res.state.myMax) await grantEventBadge(buyerId, "fleet_unscathed").catch(() => {});
    }
    return paid;
}

// ── THE QUARTERMASTER ────────────────────────────────────────────────────────────────────────────────────────
export async function buyAmmo(buyerId, ammoId, qty = 5) {
    if (!raidsEnabled(buyerId)) return { ok: false, error: "under_construction", ...(await getSailingState(buyerId)) };
    const def = AMMO[String(ammoId)];
    if (!def || def.basic) return { ok: false, error: "bad_ammo", ...(await getSailingState(buyerId)) };
    const n = Math.max(1, Math.min(50, Number(qty) || 5));
    const cost = def.price * n;
    const row = await readRow(buyerId);
    if ((row?.doubloons || 0) < cost) return { ok: false, error: "not_enough_doubloons", ...(await getSailingState(buyerId)) };
    const stock = { ...ammoStock(row), [def.id]: (Number(ammoStock(row)[def.id]) || 0) + n };
    await db.query(
        `UPDATE mkt_sailing SET doubloons = COALESCE(doubloons,0) - $2, ammo = $3::jsonb, updated_at = NOW()
          WHERE buyer_id = $1 AND COALESCE(doubloons,0) >= $2`,
        [buyerId, cost, JSON.stringify(stock)]
    ).catch(() => {});
    await trackActivity(buyerId, "buy_ammo", { ammo: def.id, n, cost }).catch(() => {});
    return { ok: true, ...(await getSailingState(buyerId)) };
}

// What is in the racks for the next battle. Loading a type you have none of is refused here rather than
// silently swapped at fire time, so the loadout screen never lies about what you are about to shoot.
export async function setLoadout(buyerId, ammoId) {
    if (!raidsEnabled(buyerId)) return { ok: false, error: "under_construction", ...(await getSailingState(buyerId)) };
    const def = AMMO[String(ammoId)];
    if (!def) return { ok: false, error: "bad_ammo", ...(await getSailingState(buyerId)) };
    const row = await readRow(buyerId);
    if (!def.basic && ammoCount(row, def.id) <= 0) return { ok: false, error: "no_stock", ...(await getSailingState(buyerId)) };
    await db.query(`INSERT INTO mkt_sailing (buyer_id) VALUES ($1) ON CONFLICT (buyer_id) DO NOTHING`, [buyerId]).catch(() => {});
    await db.query(`UPDATE mkt_sailing SET loadout = $2, updated_at = NOW() WHERE buyer_id = $1`, [buyerId, def.id]).catch(() => {});
    return { ok: true, ...(await getSailingState(buyerId)) };
}

export async function upgradeCombat(buyerId, track) {
    if (!raidsEnabled(buyerId)) return { ok: false, error: "under_construction", ...(await getSailingState(buyerId)) };
    const def = COMBAT_TRACKS[String(track)];
    if (!def) return { ok: false, error: "bad_upgrade", ...(await getSailingState(buyerId)) };
    const row = await readRow(buyerId);
    const level = row?.[def.col] || 0;
    if (level >= def.max) return { ok: false, error: "maxed", ...(await getSailingState(buyerId)) };
    const cost = combatUpgradeCost(level);
    const paid = await db.queryOne(
        `UPDATE mkt_sailing SET doubloons = COALESCE(doubloons,0) - $2, ${def.col} = ${def.col} + 1, updated_at = NOW()
          WHERE buyer_id = $1 AND COALESCE(doubloons,0) >= $2 RETURNING doubloons`,
        [buyerId, cost]
    ).catch(() => null);
    if (!paid) return { ok: false, error: "not_enough_doubloons", ...(await getSailingState(buyerId)) };
    await trackActivity(buyerId, "buy_upgrade", { track: `ship_${def.key}`, level: level + 1, cost, currency: "doubloons" }).catch(() => {});
    return { ok: true, ...(await getSailingState(buyerId)) };
}

export async function resetRaid(buyerId) {
    if (!raidsEnabled(buyerId)) return { ok: false, error: "under_construction", ...(await getSailingState(buyerId)) };
    const row = await readRow(buyerId);
    const myLevel = boatLevelFromUpgrades(row?.speed_level || 0, row?.luck_level || 0, row?.rarity_level || 0, row?.find_level || 0, row?.raid_level || 0);
    const { bonusRaids } = await equippedRaidExtras(buyerId);
    if (raidsUsedToday(row) < raidsPerDay(myLevel, bonusRaids)) return { ok: false, error: "not_used", ...(await getSailingState(buyerId)) }; // still have raids left
    const resetsToday = row?.raid_reset_is_today ? (row?.raid_resets || 0) : 0;
    const cost = raidResetCost(resetsToday);
    if (cost > 0) {
        const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold - $2, updated_at = NOW() WHERE id = $1 AND gold >= $2 RETURNING gold`, [buyerId, cost]).catch(() => null);
        if (!paid) return { ok: false, error: "not_enough_gold", ...(await getSailingState(buyerId)) };
        await logCoin(buyerId, -cost, "cooldown_skip", { meta: { kind: "raid_reset" }, balanceAfter: paid.gold }).catch(() => {});
    }
    await trackActivity(buyerId, "cooldown_skip", { kind: "raid_reset", cost }).catch(() => {});
    await db.query(
        `UPDATE mkt_sailing
            SET raid_count = GREATEST(0, raid_count - 1),
                raid_resets = CASE WHEN raid_reset_day = (NOW() AT TIME ZONE 'America/Chicago')::date THEN raid_resets + 1 ELSE 1 END,
                raid_reset_day = (NOW() AT TIME ZONE 'America/Chicago')::date,
                updated_at = NOW()
          WHERE buyer_id = $1`,
        [buyerId]
    ).catch(() => {});
    return { ok: true, raidReset: true, spent: cost, ...(await getSailingState(buyerId)) };
}

// ── Gold Merchant actions ──────────────────────────────────────────────────────────────────────────────
// The coin-catch minigame result. `collected` = gold caught (clamped [floor, ceil]); `perfect` = the client's
// flawless flag (caught EVERY coin AND never took a hit). Perfect earns the "Coin Virtuoso" badge and a 10%
// shot at the exclusive elephant pet. Paid + resolved ONCE (atomic guard on minigamePlayed). Owner-gated, so
// the client-reported score/perfect are trusted for now.
export async function merchantMinigame(buyerId, collected, perfectFlag) {
    const row = await readRow(buyerId);
    const m = row?.merchant_json;
    if (!m || m.none) return { ok: false, error: "no_merchant", ...(await getSailingState(buyerId)) };
    const bounty = seaEffects(await equippedSeaAffinity(buyerId)).goldBonus; // Bounty boosts merchant payout too
    const base = Math.max(MERCHANT_GOLD_FLOOR, Math.min(MERCHANT_GOLD_CEIL, Math.round(Number(collected) || 0)));
    const gold = Math.round(base * (1 + bounty));
    const perfect = Boolean(perfectFlag);
    // The pet is NOT tied to the minigame anymore (it unlocks on the 10th encounter, in rollMerchant). A perfect
    // run just earns the badge + the gold. Preserve any petGranted flag the offer already carries (10th meeting).
    const won = await db.queryOne(
        `UPDATE mkt_sailing
            SET merchant_json = merchant_json || jsonb_build_object('minigamePlayed', TRUE, 'goldWon', $2::int, 'perfect', $3::boolean),
                updated_at = NOW()
          WHERE buyer_id = $1 AND merchant_json IS NOT NULL AND (merchant_json->>'minigamePlayed')::boolean IS NOT TRUE
          RETURNING buyer_id`,
        [buyerId, gold, perfect]
    ).catch(() => null);
    if (!won) return { ok: false, error: "already_played", ...(await getSailingState(buyerId)) };
    await db.query(`UPDATE mkt_buyer SET gold = gold + $2, updated_at = NOW() WHERE id = $1`, [buyerId, gold]).catch(() => {});
    await logCoin(buyerId, gold, "merchant_minigame", { meta: { perfect } }).catch(() => {});
    if (perfect) await grantEventBadge(buyerId, "merchant_perfect").catch(() => {}); // "Coin Virtuoso"
    await trackActivity(buyerId, "sail_merchant", { gold, perfect }).catch(() => {});
    return { ok: true, goldWon: gold, perfect, ...(await getSailingState(buyerId)) };
}

// ── WHAT YOU HAVE ALREADY BOUGHT FROM HIM TODAY ──────────────────────────────────────────────────────────────
// Day-stamped and cleared lazily on read, exactly like every other daily budget here (pettings, ratings,
// raids, waves): no cron, no midnight job, and a stale stamp resets itself the first time anyone looks.
const SDAY = "(NOW() AT TIME ZONE 'America/Chicago')::date";
// What the ROW says you have bought today, without another query. Trusts the SQL-computed day flag rather
// than comparing a Postgres DATE to a JS Date, which reads as yesterday on a UTC server.
function merchantBoughtSet(row) {
    if (!row || row.merchant_buys_are_today !== true) return new Set();
    const raw = row.merchant_bought;
    const list = typeof raw === "string" ? JSON.parse(raw || "[]") : (raw || []);
    return new Set(Array.isArray(list) ? list : []);
}
async function merchantBoughtToday(buyerId) {
    const r = await db
        .queryOne(
            `UPDATE mkt_sailing
                SET merchant_bought = CASE WHEN merchant_buy_day = ${SDAY} THEN merchant_bought ELSE '[]'::jsonb END,
                    merchant_buy_day = ${SDAY}
              WHERE buyer_id = $1
              RETURNING merchant_bought`,
            [buyerId]
        )
        .catch(() => null);
    const raw = r?.merchant_bought;
    const list = typeof raw === "string" ? JSON.parse(raw || "[]") : (raw || []);
    return new Set(Array.isArray(list) ? list : []);
}

// Buy one of the merchant's discounted exclusive consumables. Price comes from the STOCK TABLE (never the
// client, and never the number frozen into his rolled offer) so it can't be spoofed or go stale.
//
// ONE OF EACH PER DAY. He is two-thirds off precisely because meeting him is rare, and those two facts were
// fighting: one lucky landing let you buy the same discounted ware until your gold ran out, which turns a rare
// event into a vending machine. The limit is per ITEM, not per visit — his three wares are still three
// purchases, you just cannot stand there buying the same Tome eleven times.
export async function merchantBuy(buyerId, itemId) {
    const row = await readRow(buyerId);
    const m = row?.merchant_json;
    if (!m || m.none) return { ok: false, error: "no_merchant", ...(await getSailingState(buyerId)) };
    const item = (m.shop || []).find((s) => s.id === itemId);
    if (!item) return { ok: false, error: "not_stocked", ...(await getSailingState(buyerId)) };
    const bought = await merchantBoughtToday(buyerId);
    if (bought.has(itemId)) return { ok: false, error: "already_bought_today", ...(await getSailingState(buyerId)) };
    const price = warePrice(item.id) ?? item.price;
    // Claim the day's slot for this ware BEFORE taking the gold, guarded on the item not already being in the
    // list — two taps racing each other can't both get through, and a refund is easier than an un-grant.
    const claimed = await db
        .queryOne(
            `UPDATE mkt_sailing SET merchant_bought = merchant_bought || to_jsonb($2::text)
              WHERE buyer_id = $1 AND merchant_buy_day = ${SDAY} AND NOT (merchant_bought ? $2::text)
              RETURNING buyer_id`,
            [buyerId, itemId]
        )
        .catch(() => null);
    if (!claimed) return { ok: false, error: "already_bought_today", ...(await getSailingState(buyerId)) };
    const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`, [buyerId, price]).catch(() => null);
    if (!paid) {
        // Couldn't afford it — hand the day's slot back rather than charging them a purchase they never made.
        await db.query(`UPDATE mkt_sailing SET merchant_bought = merchant_bought - $2::text WHERE buyer_id = $1`, [buyerId, itemId]).catch(() => {});
        return { ok: false, error: "not_enough_gold", ...(await getSailingState(buyerId)) };
    }
    await logCoin(buyerId, -price, "merchant_buy", { meta: { name: item.name }, balanceAfter: paid.gold }).catch(() => {});
    await grantConsumable(buyerId, itemId, 1).catch(() => {});
    await trackActivity(buyerId, "sail_merchant_buy", { name: item.name, cost: price }).catch(() => {});
    return { ok: true, bought: { id: item.id, name: item.name, emoji: item.emoji }, ...(await getSailingState(buyerId)) };
}

// Once-a-day favorable winds: shave an hour off the remaining voyage (clamped so it can only reach "arrived",
// never overshoot). Atomic — the WHERE enforces once-per-store-day and that a voyage is actually in progress.
export async function favorableWind(buyerId) {
    const preRow = await readRow(buyerId).catch(() => null);
    const remainingMs = preRow?.returns_at ? new Date(preRow.returns_at).getTime() - Date.now() : 0;
    const shavedMinutes = Math.round(Math.min(Math.max(0, remainingMs), 60 * 60 * 1000) / 60000);
    const updated = await db.queryOne(
        `UPDATE mkt_sailing
            SET returns_at = GREATEST(NOW(), returns_at - interval '1 hour'),
                wind_day = (NOW() AT TIME ZONE 'America/Chicago')::date, updated_at = NOW()
          WHERE buyer_id = $1 AND dig_state IS NULL
            AND returns_at IS NOT NULL AND returns_at > NOW()
            AND wind_day IS DISTINCT FROM (NOW() AT TIME ZONE 'America/Chicago')::date
          RETURNING returns_at`,
        [buyerId]
    ).catch(() => null);
    if (!updated) return { ok: false, error: "unavailable", ...(await getSailingState(buyerId)) };
    await trackActivity(buyerId, "cooldown_skip", { kind: "favorable_wind" }).catch(() => {});
    // Milestone perk (Trade-Wind Schooner): chance the tailwind ISN'T consumed — clear wind_day so it's free again.
    const save = boatPerks(decorate(await readRow(buyerId)).level).windSave;
    let windRefunded = false;
    if (save > 0 && Math.random() < save) {
        await db.query(`UPDATE mkt_sailing SET wind_day = NULL WHERE buyer_id = $1`, [buyerId]).catch(() => {});
        windRefunded = true;
    }
    return { ok: true, windRefunded, shavedMinutes, ...(await getSailingState(buyerId)) };
}

// Paid re-use of the tailwind once the free daily one is spent: charge gold, then shave another hour off the
// remaining voyage. Free while WIND_RECHARGE_COST is 0 (testing). Only valid mid-voyage.
export async function rechargeWind(buyerId) {
    const row = await readRow(buyerId);
    const state = decorate(row);
    if (state.status !== "sailing") return { ok: false, error: "not_sailing", ...(await getSailingState(buyerId)) };
    const returnsAt = row?.returns_at ? new Date(row.returns_at).getTime() : 0;
    const remainingMs = returnsAt - Date.now();
    // Nothing meaningful left to shave → DON'T charge (guards the "took my gold, did nothing" case).
    if (remainingMs <= 90 * 1000) return { ok: false, error: "almost_there", ...(await getSailingState(buyerId)) };
    const cost = windRechargeCost(row?.wind_recharges || 0); // escalates: each extra tailwind this voyage costs double

    // BUYING A TAILWIND HAS NEVER WORKED. The affordability check read `state.gold`, and `state` is
    // decorate(row) over a mkt_sailing row — gold lives on mkt_buyer and decorate has never set it. So the
    // value was always `undefined`, `(undefined || 0)` was always 0, `0 < cost` was always true, and every
    // player who tried to catch an extra tailwind was told they were broke no matter what they held. Reported
    // in Den chat by Teegs ("it tells me I don't have enough gold but I in fact have plenty").
    //
    // The spend is also the guarded atomic UPDATE every other purchase in this file already uses. The old one
    // was `GREATEST(0, gold - cost)` with no `gold >= cost` in the WHERE — which clamps at zero instead of
    // refusing, so once the check above was fixed a double-tap could still have shaved two hours for the price
    // of one. Charge first, then shave; refund if the shave turns out to be impossible.
    let paid = null;
    if (cost > 0) {
        paid = await db.queryOne(
            `UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`,
            [buyerId, cost]
        ).catch(() => null);
        if (!paid) return { ok: false, error: "not_enough_gold", ...(await getSailingState(buyerId)) };
    }

    // Shave up to an hour, but never more than what's left — so it ALWAYS produces a real, visible jump.
    const shaveMs = Math.min(remainingMs, 60 * 60 * 1000);
    const updated = await db.queryOne(
        `UPDATE mkt_sailing
            SET returns_at = returns_at - ($2 || ' milliseconds')::interval, wind_recharges = COALESCE(wind_recharges, 0) + 1, updated_at = NOW()
          WHERE buyer_id = $1 AND dig_state IS NULL AND returns_at IS NOT NULL AND returns_at > NOW()
          RETURNING returns_at`,
        [buyerId, shaveMs]
    ).catch(() => null);
    if (!updated) {
        // Lost the race (arrived, or started digging between the two writes) — give the gold straight back
        // rather than charging for a tailwind that never blew.
        if (paid) await db.query(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1`, [buyerId, cost]).catch(() => {});
        return { ok: false, error: "unavailable", ...(await getSailingState(buyerId)) };
    }
    if (cost > 0) {
        await logCoin(buyerId, -cost, "cooldown_skip", { meta: { kind: "wind_recharge" }, balanceAfter: paid?.gold }).catch(() => {});
    }
    await trackActivity(buyerId, "cooldown_skip", { kind: "wind_recharge", cost }).catch(() => {});
    return { ok: true, spent: cost, shavedMinutes: Math.round(shaveMs / 60000), ...(await getSailingState(buyerId)) };
}

// Naming + art for a fragment tier, so anything that HANDS OUT shards (spin wheel, fishing, Cheer proc) can
// say which kind you got and show that tier's real sprite instead of a generic "dig fragment".
export function fragmentInfo(tier = "wooden") {
    const t = CHEST_TIERS[tier] ? tier : "wooden";
    const name = (CHEST_TIERS[t].label || t).replace(" Chest", "");
    return { tier: t, name, label: `${name} Fragment`, art: fragmentArt(t), color: CHEST_TIERS[t].color || "#b08a52" };
}

// Grant treasure-chest fragment(s) of a TIER to a member (Cheer proc, fishing, the spin wheel). Upserts the
// sailing row first, since a member may never have sailed. Returns the tier info so callers can name the prize.
export async function grantFragment(buyerId, n = 1, tier = "wooden") {
    const info = fragmentInfo(tier);
    if (!buyerId || n <= 0) return info;
    await db.query(`INSERT INTO mkt_sailing (buyer_id) VALUES ($1) ON CONFLICT (buyer_id) DO NOTHING`, [buyerId]).catch(() => {});
    // Merge into that tier's slot of the per-tier hold.
    await db.query(
        `UPDATE mkt_sailing
            SET fragments_json = jsonb_set(
                    COALESCE(fragments_json, '{}'::jsonb), ARRAY[$3::text],
                    to_jsonb(COALESCE((fragments_json->>$3)::int, 0) + $2)),
                updated_at = NOW()
          WHERE buyer_id = $1`,
        [buyerId, n, info.tier]
    ).catch(() => {});
    return info;
}

// Spend fragments to forge a loot chest. The cost is boatPerks().forgeCost (10, or 8 at the level-80 form).
// Rarity (+ chest milestone perks) gives a chance the forged chest is BUMPED up a tier (Iron → Gold). Atomic —
// the WHERE guards against forging with too few (or a double-tap racing the balance).
export async function forgeChest(buyerId, fragmentTier = "wooden") {
    const row = await readRow(buyerId);
    const level = decorate(row).level;
    const cost = boatPerks(level).forgeCost;
    if (!CHEST_TIERS[fragmentTier]) return { ok: false, error: "bad_tier", ...(await getSailingState(buyerId)) };
    await db.query(`INSERT INTO mkt_sailing (buyer_id) VALUES ($1) ON CONFLICT (buyer_id) DO NOTHING`, [buyerId]).catch(() => {});
    // Atomic guarded spend of `cost` shards from THIS tier's hold (the WHERE stops a double-tap overdraw).
    const spent = await db.queryOne(
        `UPDATE mkt_sailing
            SET fragments_json = jsonb_set(COALESCE(fragments_json, '{}'::jsonb), $3::text[],
                    to_jsonb(COALESCE((fragments_json->>$4)::int, 0) - $2)),
                updated_at = NOW()
          WHERE buyer_id = $1 AND COALESCE((fragments_json->>$4)::int, 0) >= $2
          RETURNING fragments_json`,
        [buyerId, cost, `{${fragmentTier}}`, fragmentTier]
    ).catch(() => null);
    if (!spent) return { ok: false, error: "not_enough", ...(await getSailingState(buyerId)) };
    // Rarity roll: chance the forged chest comes out one tier ABOVE the shards you spent (a bonus, not capped).
    const upgradeChance = Math.min(0.9, (row?.rarity_level || 0) * RARITY_UPGRADE_PER_LEVEL + boatPerks(level).chestBonus);
    let tierKey = fragmentTier;
    if (Math.random() < upgradeChance) {
        const i = CHEST_ORDER.indexOf(tierKey);
        if (i >= 0 && i < CHEST_ORDER.length - 1) tierKey = CHEST_ORDER[i + 1];
    }
    await addChests(buyerId, { [tierKey]: 1 }, { source: "sailing_forge" }).catch(() => {});
    await trackActivity(buyerId, "sail_forge", { tier: tierKey, upgraded: tierKey !== fragmentTier }).catch(() => {});
    // Chest-points (tier-weighted 1–4). These NO LONGER gate the dig tools — that moved to dig upgrade levels,
    // which the player can actually watch climb on the same screen. Kept as a running stat (and so the column
    // isn't silently abandoned mid-flight); nothing reads it for unlocks any more.
    await db.query(`UPDATE mkt_sailing SET chest_points = COALESCE(chest_points, 0) + $2 WHERE buyer_id = $1`, [buyerId, CHEST_POINT_WEIGHT(tierKey)]).catch(() => {});
    // Achievement badges (hard): forge count + forging a gold-or-better chest.
    const forgedRow = await db.queryOne(`UPDATE mkt_sailing SET chests_forged = COALESCE(chests_forged, 0) + 1 WHERE buyer_id = $1 RETURNING chests_forged`, [buyerId]).catch(() => null);
    if ((forgedRow?.chests_forged || 0) >= BADGE_DIG_EXCAVATOR) await grantEventBadge(buyerId, "dig_excavator").catch(() => {});
    // Earned cosmetic: the "Buried Hoard" profile background for forging chests (idempotent).
    if ((forgedRow?.chests_forged || 0) >= COSMETIC_HOARD_FORGES) await db.query(`INSERT INTO mkt_cosmetic_unlock (buyer_id, category, ref) VALUES ($1, 'background', 'hoard') ON CONFLICT DO NOTHING`, [buyerId]).catch(() => {});
    if (CHEST_ORDER.indexOf(tierKey) >= CHEST_ORDER.indexOf("gold")) await grantEventBadge(buyerId, "dig_goldtouch").catch(() => {});
    const tier = CHEST_TIERS[tierKey];
    const upgraded = tierKey !== fragmentTier;
    const chestArt = await getChestArt().catch(() => ({}));
    return { ok: true, forged: { tier: tierKey, label: tier?.label || "Chest", emoji: tier?.emoji || "🎁", image: chestArt[tierKey] || null, upgraded, from: fragmentTier }, ...(await getSailingState(buyerId)) };
}

// Buy DIG_REFILL more digs for the active excavation with gold. Atomic gold spend; only valid mid-dig.
export async function buyDigs(buyerId) {
    const row = await readRow(buyerId);
    const board = row?.dig_state;
    if (!board || board.status !== "active") return { ok: false, error: "not_digging", ...(await getSailingState(buyerId)) };
    const cost = digRefillCost(board.refills || 0); // escalates: each refill this dig costs double the last
    if (cost > 0) {
        const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`, [buyerId, cost]).catch(() => null);
        if (!paid) return { ok: false, error: "not_enough_gold", ...(await getSailingState(buyerId)) };
        await logCoin(buyerId, -cost, "buy_digs", { balanceAfter: paid.gold }).catch(() => {});
    }
    board.stamina += DIG_REFILL;
    board.maxStamina += DIG_REFILL;
    board.refills = (board.refills || 0) + 1;
    await db.query(`UPDATE mkt_sailing SET dig_state = $2, updated_at = NOW() WHERE buyer_id = $1`, [buyerId, JSON.stringify(board)]).catch(() => {});
    await trackActivity(buyerId, "buy_digs", { cost, refills: board.refills }).catch(() => {});
    return { ok: true, spent: cost, ...(await getSailingState(buyerId)) };
}

export async function beginDig(buyerId) {
    const row = await readRow(buyerId);
    const state = decorate(row);
    if (state.status !== "arrived") return { ok: false, error: "not_arrived", ...(await getSailingState(buyerId)) };
    let petStamina = 0;
    try {
        const { getPetSystemPerk } = await import("@/lib/marketplace/pet-combat.js");
        petStamina = Math.round(await getPetSystemPerk(buyerId, "seafaring"));
    } catch { /* no pets, no bonus */ }
    let petFinds = 0;
    try {
        const { getPetSystemPerk } = await import("@/lib/marketplace/pet-combat.js");
        // /10 to match the description: 20 at cap -> +2 finds.
        petFinds = Math.max(0, Math.round((await getPetSystemPerk(buyerId, "beachcomber")) / 10));
    } catch { /* no companion, no extra finds */ }
    const board = newBoard(row, petStamina, petFinds);
    // Sea affinity (Dredge, from equipped gear/pet) raises every dig-tool's proc chance for this excavation.
    const eff = seaEffects(await equippedSeaAffinity(buyerId));
    if (eff.digProcBonus && board.up) board.up.efficient = (board.up.efficient || 0) + eff.digProcBonus;
    // Starting the dig leaves the merchant behind — clear his offer.
    await db.query(`UPDATE mkt_sailing SET dig_state = $2, merchant_json = NULL, updated_at = NOW() WHERE buyer_id = $1`, [buyerId, JSON.stringify(board)]).catch(() => {});
    return { ok: true, ...(await getSailingState(buyerId)) };
}

// The tier one step up the ladder, but never past the fragment cap.
function nextTierCapped(tier) {
    const capIdx = CHEST_ORDER.indexOf(FRAGMENT_TIER_CAP);
    const i = CHEST_ORDER.indexOf(tier);
    return i >= 0 && i < capIdx ? CHEST_ORDER[i + 1] : tier;
}
// Roll one dug shard's tier from the voyage's duration weights, with a small Rarity chance to bump it up a
// tier (never past the cap).
function rollFragmentTier(qualityId, rarityLevel = 0, level = 1) {
    const opt = VOYAGE_OPTIONS.find((o) => o.id === qualityId) || VOYAGE_OPTIONS[1];
    const weights = opt.frag;
    const total = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
    let r = Math.random() * total;
    let tier = "wooden";
    for (const [t, w] of Object.entries(weights)) { r -= w; if (r <= 0) { tier = t; break; } }
    const bump = Math.min(0.9, Math.max(0, rarityLevel) * RARITY_UPGRADE_PER_LEVEL + boatPerks(level).chestBonus);
    if (Math.random() < bump) tier = nextTierCapped(tier);
    return tier;
}
// Per-tier shard holdings for the UI: every droppable tier (up to the cap) + any tier already held.
function fragmentsView(row, level, chestArt = {}) {
    const counts = (row && typeof row.fragments_json === "object" && row.fragments_json) || {};
    const perChest = boatPerks(level).forgeCost;
    const capIdx = CHEST_ORDER.indexOf(FRAGMENT_TIER_CAP);
    return CHEST_ORDER
        .map((t, i) => ({ t, i }))
        .filter(({ t, i }) => i <= capIdx || (counts[t] || 0) > 0)
        .map(({ t, i }) => {
            const c = CHEST_TIERS[t] || {};
            const count = Number(counts[t]) || 0;
            return {
                tier: t,
                name: (c.label || t).replace(" Chest", ""),
                chestLabel: c.label || "Chest",
                emoji: c.emoji || "🎁",
                color: c.color || "#b08a52",
                art: fragmentArt(t),
                chestImage: chestArt[t] || null, // the REAL per-tier AI chest sprite (falls back to ChestIcon in the UI)
                count,
                perChest,
                canForge: count >= perChest,
                droppable: i <= capIdx,
            };
        });
}
function totalFragments(row) {
    const counts = (row && typeof row.fragments_json === "object" && row.fragments_json) || {};
    return Object.values(counts).reduce((a, b) => a + (Number(b) || 0), 0);
}

// Resolve a finished dig: each shard unearthed (+ lucky Strike bonuses) rolls a TIER from the voyage's chosen
// duration, then merges into the per-tier hold. Clears the voyage + board.
async function finishDig(buyerId, board) {
    const row = await readRow(buyerId);
    const level = decorate(row).level;
    const quality = row?.voyage_quality || "standard";
    const rarityLevel = row?.rarity_level || 0;
    // Reward is ABSTRACTED from the chest tier + how much of it you EXPOSED — not one fragment per cell. A fully
    // uncovered chest gives (2 + tier) fragments (t1=3 … t6=8), scaled down if you only got part of it.
    const total = board.frag.length;
    const uncovered = board.frag.filter(([fr, fc]) => board.depth[fr][fc] === 0).length;
    const chestTier = (board.fragTiers && board.fragTiers[0]) || rollFragmentTier(quality, rarityLevel, level);
    const maxFrags = 2 + ((board.tier || 1) >= 3 ? 1 : 0); // a full chest = 2 fragments (3 at high tiers) — not a pile
    const digSea = seaEffects(await equippedSeaAffinity(buyerId)); // Trove boosts yield; Maw (ship perk) adds flat frags
    const lureMult = row?.dig_lure === true ? 1.5 : 1; // Lucky Lure: +50% fragments this dig
    const baseCount = uncovered > 0 ? Math.max(1, Math.round(maxFrags * (uncovered / total) * (1 + digSea.fragBonus) * lureMult)) : 0;
    const fragCount = baseCount + (baseCount > 0 ? (boatPerks(level).voyageFrags || 0) : 0);
    const foundTiers = Array.from({ length: fragCount }, () => chestTier);
    for (let i = 0; i < (board.bonus || 0); i++) foundTiers.push(rollFragmentTier(quality, rarityLevel, level)); // lucky Strike bonuses
    const earned = foundTiers.length;
    // Grant every real ITEM you dug up along the way, and gather them for the recap.
    const foundItems = (board.items || []).filter((it) => board.depth[it.r]?.[it.c] === 0);
    for (const it of foundItems) await grantConsumable(buyerId, it.id, 1).catch(() => {});
    const itemTally = {};
    for (const it of foundItems) itemTally[it.id] = (itemTally[it.id] || 0) + 1;
    const itemsHaul = Object.entries(itemTally).map(([id, n]) => ({ id, n, name: CONSUMABLES[id]?.name || id, emoji: CONSUMABLES[id]?.emoji || "🎁" }));
    const won = earned > 0 || foundItems.length > 0;
    // Merge into the current per-tier hold.
    const counts = { ...((row && typeof row.fragments_json === "object" && row.fragments_json) || {}) };
    const byTier = {};
    for (const t of foundTiers) {
        byTier[t] = (byTier[t] || 0) + 1;
        counts[t] = (Number(counts[t]) || 0) + 1;
    }
    // NOTE: digging does NOT level the boat — but voyages_completed drives the EXCAVATION level (tool unlocks).
    await db.query(
        `UPDATE mkt_sailing
            SET dig_state = NULL, departed_at = NULL, returns_at = NULL, voyage_quality = NULL, dig_lure = FALSE,
                fragments_json = $2::jsonb, voyages_completed = voyages_completed + 1, updated_at = NOW()
          WHERE buyer_id = $1`,
        [buyerId, JSON.stringify(counts)]
    ).catch(() => {});
    // Rare bonus find: a one-shot SAILING RELIC (kept uncommon so they stay special) — the treasure-map/drum/etc.
    let relicFound = null;
    if (won && Math.random() < 0.08) { relicFound = SAIL_RELIC_DROPS[randInt(SAIL_RELIC_DROPS.length)]; await grantConsumable(buyerId, relicFound, 1).catch(() => {}); }
    // Achievement badges: voyage milestones (first, 25, 100) + fully uncovering a deep chest (tier 3+) in one dig.
    const voyagesNow = (row?.voyages_completed || 0) + 1;
    if (voyagesNow >= BADGE_FIRST_VOYAGE) await grantEventBadge(buyerId, "first_voyage").catch(() => {});
    if (voyagesNow >= BADGE_SAIL_REGULAR) await grantEventBadge(buyerId, "sail_regular").catch(() => {});
    if (voyagesNow >= BADGE_VOYAGER) await grantEventBadge(buyerId, "sail_voyager").catch(() => {});
    // Earned cosmetic: the "Seasoned Sailor" border for sticking with voyages (idempotent).
    if (voyagesNow >= COSMETIC_SAILOR_VOYAGES) await db.query(`INSERT INTO mkt_cosmetic_unlock (buyer_id, category, ref) VALUES ($1, 'border', 'sailor') ON CONFLICT DO NOTHING`, [buyerId]).catch(() => {});
    if (uncovered >= total && (board.tier || 1) >= 3) await grantEventBadge(buyerId, "dig_cleansweep").catch(() => {});
    await bumpQuestProgress(buyerId, "dig_done", 1).catch(() => {}); // "Dig up buried treasure" daily quest
    await dropSeedFrom(buyerId, "sail_dig").catch(() => {}); // a chance to unearth a farming seed
    await trackActivity(buyerId, "sail_dig", { frags: fragCount, tier: board.tier || 1, relic: relicFound || null }).catch(() => {});
    // A WATERLOGGED PAGE is one of the things buried down there, drawn as part of what the dig turns up and
    // returned in the result so the recap can show it — not a roll made on the side once the dig was over.
    let digRecipe = null;
    try {
        const { grantRecipeReward, recipeLuck } = await import("@/lib/marketplace/cooking.js");
        const chance = ((board.tier || 1) >= 3 ? 0.045 : 0.018) * await recipeLuck(buyerId);
        if (Math.random() < chance) digRecipe = await grantRecipeReward(buyerId, (board.tier || 1) >= 3 ? "dig_deep" : "dig");
    } catch { /* a recipe is a bonus; never let it fail the action */ }
    const state = await getSailingState(buyerId);
    // byTier decorated with art/label so the recap can show what kind of shards you hauled up.
    const haul = Object.entries(byTier).map(([tier, n]) => {
        const c = CHEST_TIERS[tier] || {};
        return { tier, n, name: (c.label || tier).replace(" Chest", ""), emoji: c.emoji || "🎁", color: c.color || "#b08a52", art: fragmentArt(tier) };
    }).sort((a, b) => CHEST_ORDER.indexOf(b.tier) - CHEST_ORDER.indexOf(a.tier));
    const fullyUnearthed = uncovered >= total;
    // Reveal where the chest actually was, so players learn how scanning maps to the buried chest.
    const reveal = { rows: board.rows, cols: board.cols, cells: board.frag, dugCells: board.frag.filter(([fr, fc]) => board.depth[fr][fc] === 0) };
    const relic = relicFound ? { id: relicFound, name: CONSUMABLES[relicFound]?.name || relicFound, emoji: CONSUMABLES[relicFound]?.emoji || "🎁", desc: CONSUMABLES[relicFound]?.desc || "" } : null;
    return { ok: true, result: { won, earned, uncovered, total, bonus: board.bonus || 0, haul, items: itemsHaul, relic, shape: board.shape || null, fullArtifact: fullyUnearthed, reveal }, ...state };
}
async function persistDig(buyerId, board) {
    await db.query(`UPDATE mkt_sailing SET dig_state = $2, updated_at = NOW() WHERE buyer_id = $1`, [buyerId, JSON.stringify(board)]).catch(() => {});
    // A mid-dig tap returns ONLY the board.
    //
    // This used to end in `...(await getSailingState(buyerId))`, so every single tile tap re-ran the whole
    // sailing screen: resolveDueEncounter, rollMerchant, the 24-row fleet JOIN, the pet-sprite map, the chest
    // art map, sea affinity and raid extras — roughly eight queries and two art maps, none of which can change
    // while you're stood on an island with a shovel. That round-trip is why digging felt sluggish; the board
    // itself is one UPDATE.
    //
    // `partial` tells the client to MERGE rather than replace, since everything else it already has is still
    // valid. finishDig still returns the full state — that's when rewards, level and forged chests land.
    return { ok: true, partial: true, status: "digging", dig: boardView(board) };
}

export async function digAt(buyerId, r, c) {
    const row = await readRow(buyerId);
    const board = row?.dig_state;
    if (!board || board.status !== "active") return { ok: false, error: "not_digging", ...(await getSailingState(buyerId)) };
    applyDig(board, Number(r), Number(c));
    return (board.status === "won" || board.status === "lost") ? finishDig(buyerId, board) : persistDig(buyerId, board);
}

// The player taps "Finish" to end the dig early (e.g. they've got the chest + what items they want).
export async function endDig(buyerId) {
    const row = await readRow(buyerId);
    const board = row?.dig_state;
    if (!board || board.status !== "active") return { ok: false, error: "not_digging", ...(await getSailingState(buyerId)) };
    forceResolve(board);
    return finishDig(buyerId, board);
}

// Probe a tile with the treasure sense (reveals its neighbour-treasure clue). Never ends the dig.
export async function senseAt(buyerId, r, c) {
    const row = await readRow(buyerId);
    const board = row?.dig_state;
    if (!board || board.status !== "active") return { ok: false, error: "not_digging", ...(await getSailingState(buyerId)) };
    applySense(board, Number(r), Number(c));
    return persistDig(buyerId, board);
}

// Invest gold to raise an unlocked tool's proc chance by one level (up to TOOL_MAX_LEVEL).
export async function upgradeTool(buyerId, toolId) {
    const row = await readRow(buyerId);
    const tool = DIG_TOOLS.find((t) => t.id === String(toolId));
    if (!tool) return { ok: false, error: "bad_tool", ...(await getSailingState(buyerId)) };
    if (digUpgradeLevels(row) < tool.unlockPoints) return { ok: false, error: "locked", ...(await getSailingState(buyerId)) };
    const levels = (row && typeof row.dig_tool_levels === "object" && row.dig_tool_levels) || {};
    const lvl = Number(levels[tool.id]) || 0;
    if (lvl >= TOOL_MAX_LEVEL) return { ok: false, error: "maxed", ...(await getSailingState(buyerId)) };
    const cost = toolUpgradeCost(lvl);
    const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold - $2, updated_at = NOW() WHERE id = $1 AND gold >= $2 RETURNING gold`, [buyerId, cost]).catch(() => null);
    if (!paid) return { ok: false, error: "not_enough_gold", ...(await getSailingState(buyerId)) };
    await logCoin(buyerId, -cost, "upgrade", { meta: { kind: "dig_tool", tool: tool.id }, balanceAfter: paid.gold }).catch(() => {});
    const next = { ...levels, [tool.id]: lvl + 1 };
    await db.query(`INSERT INTO mkt_sailing (buyer_id) VALUES ($1) ON CONFLICT (buyer_id) DO NOTHING`, [buyerId]).catch(() => {});
    await db.query(`UPDATE mkt_sailing SET dig_tool_levels = $2::jsonb, updated_at = NOW() WHERE buyer_id = $1`, [buyerId, JSON.stringify(next)]).catch(() => {});
    await trackActivity(buyerId, "buy_upgrade", { kind: "dig_tool", tool: tool.id, level: lvl + 1, cost }).catch(() => {});
    return { ok: true, ...(await getSailingState(buyerId)) };
}

// The four boat upgrade tracks → their DB columns + level caps. Fortune lives in the legacy luck_level column;
// the "Luck" (early-find) lever lives in find_level.
const UPGRADE_COLS = {
    speed: "speed_level", fortune: "luck_level", rarity: "rarity_level", luck: "find_level", raid: "raid_level",
    // Digging tracks (separate system):
    dig_stamina: "dig_stamina_level", dig_pierce: "dig_pierce_level", dig_strike: "dig_strike_level",
    dig_efficient: "dig_efficient_level", dig_detonator: "dig_detonator_level",
    // Fishing tracks (the Rail) — same buy path, same cost curve.
    ...Object.fromEntries(Object.entries(FISH_TRACK_COL).map(([t, col]) => [`fish_${t}`, col])),
};
const UPGRADE_MAX = {
    speed: MAX_SPEED_LEVEL, fortune: MAX_FORTUNE_LEVEL, rarity: MAX_RARITY_LEVEL, luck: MAX_LUCK_LEVEL, raid: MAX_RAID_LEVEL,
    dig_stamina: DIG_TRACKS.stamina.max, dig_pierce: DIG_TRACKS.pierce.max, dig_strike: DIG_TRACKS.strike.max,
    dig_efficient: DIG_TRACKS.efficient.max, dig_detonator: DIG_TRACKS.detonator.max,
    ...Object.fromEntries(Object.entries(FISH_TRACKS).map(([t, def]) => [`fish_${t}`, def.max])),
};

async function buyUpgrade(buyerId, kind) {
    const col = UPGRADE_COLS[kind];
    if (!col) return { ok: false, error: "bad_upgrade", ...(await getSailingState(buyerId)) };
    const row = await readRow(buyerId);
    const cur = row?.[col] || 0;
    if (cur >= UPGRADE_MAX[kind]) return { ok: false, error: "maxed", ...(await getSailingState(buyerId)) };
    const cost = upgradeCost(cur);
    await db.query(`INSERT INTO mkt_sailing (buyer_id) VALUES ($1) ON CONFLICT (buyer_id) DO NOTHING`, [buyerId]).catch(() => {});
    const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`, [buyerId, cost]).catch(() => null);
    if (!paid) return { ok: false, error: "not_enough_gold", ...(await getSailingState(buyerId)) };
    await logCoin(buyerId, -cost, "upgrade", { meta: { kind }, balanceAfter: paid.gold }).catch(() => {});
    await trackActivity(buyerId, "buy_upgrade", { track: kind, level: cur + 1, cost }).catch(() => {});
    await db.query(`UPDATE mkt_sailing SET ${col} = ${col} + 1, updated_at = NOW() WHERE buyer_id = $1`, [buyerId]).catch(() => {});
    // Achievement badges (hard): commanding the two apex hulls (Leviathan tier 10 @ lvl 90, Celestial tier 11 @ lvl 100).
    const lv = boatLevelFromUpgrades((row?.speed_level || 0) + (kind === "speed" ? 1 : 0), (row?.luck_level || 0) + (kind === "fortune" ? 1 : 0), (row?.rarity_level || 0) + (kind === "rarity" ? 1 : 0), (row?.find_level || 0) + (kind === "luck" ? 1 : 0), (row?.raid_level || 0) + (kind === "raid" ? 1 : 0));
    const tier = boatTier(lv);
    if (tier >= 10) await grantEventBadge(buyerId, "sail_leviathan").catch(() => {});
    if (tier >= 11) await grantEventBadge(buyerId, "sail_admiral").catch(() => {});
    // Mastery badges: maxing THIS track earns Shipwright; maxing every boat + dig track earns Sovereign.
    if (cur + 1 >= UPGRADE_MAX[kind]) {
        await grantEventBadge(buyerId, "sail_shipwright").catch(() => {});
        const allMaxed = Object.entries(UPGRADE_COLS).every(([k, c]) => ((row?.[c] || 0) + (c === col ? 1 : 0)) >= UPGRADE_MAX[k]);
        if (allMaxed) await grantEventBadge(buyerId, "sail_sovereign").catch(() => {});
    }
    return { ok: true, spent: cost, ...(await getSailingState(buyerId)) };
}
export const upgradeSpeed = (buyerId) => buyUpgrade(buyerId, "speed");
export const upgradeFortune = (buyerId) => buyUpgrade(buyerId, "fortune");
export const upgradeRarity = (buyerId) => buyUpgrade(buyerId, "rarity");
export const upgradeLuck = (buyerId) => buyUpgrade(buyerId, "luck"); // the "Luck" (waves) lever
// The "Raiding" (raid-dodge) lever — gated with the rest of raiding, so nobody buys levels in a track whose
// only effect is on a feature they cannot open.
export const upgradeRaid = (buyerId) => (raidsEnabled(buyerId)
    ? buyUpgrade(buyerId, "raid")
    : Promise.resolve({ ok: false, error: "under_construction" }));
export const upgradeDig = (buyerId, track) => buyUpgrade(buyerId, `dig_${track}`); // digging tracks
// Rail tracks — gated like the rest of fishing, so nobody can buy into an unreleased feature.
export const upgradeFishing = (buyerId, track) => (fishingUnlocked(buyerId)
    ? buyUpgrade(buyerId, `fish_${track}`)
    : Promise.resolve({ ok: false, error: "not_available" }));
