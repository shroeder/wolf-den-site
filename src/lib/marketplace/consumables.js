import "server-only";

import { db } from "@/lib/db";
import { awardXp } from "@/lib/marketplace/xp.js";
import { itemById } from "@/lib/marketplace/items.js";
import { collectibleById } from "@/lib/marketplace/collectibles.js";
import { addPetXp, levelUpPet } from "@/lib/marketplace/pet-level.js";
import { getPetLevelSprite } from "@/lib/marketplace/pet-sprite.js";
import { previewShopCoupon, consumeShopCoupon, getShopCoupon, couponedPrice } from "@/lib/marketplace/shop-coupon.js";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { logCoin } from "@/lib/marketplace/coins.js";
import { applyGrowthTonic, grantSeedBundle, grantFarmFertilizer, grantHarvestLuckCharges, grantExtraPettings, grantExtraRatings } from "@/lib/marketplace/farm-consumables.js";
import { SEED_PACKS } from "@/lib/marketplace/seed-packs.js";
import { RECIPES, MASTER_RECIPES, SEASON_RECIPES } from "@/lib/marketplace/cooking-recipes.js";

// CONSUMABLES — one-shot, SELF-USE boosts (the player uses them from their stash; no admin involvement).
// Three buyable flavors (potions/scrolls/stones) plus two ultra-rare "relics" that only drop from the top
// chests. Effect types the boss fight / gear system understand:
//   xp             → instant XP
//   strikes        → +N boss attacks TODAY (expires end of day)
//   damage         → ×mult boss damage for `hours` (your manual strikes)
//   recharge       → refill ALL charges on a chosen charged item (target)
//   reset_cooldown → clear the cooldown on a chosen charged item that still has a charge (target)
//   pet_xp         → feed the EQUIPPED pet a flat amount of pet-XP (levels it toward Lv5)
//   pet_level      → instantly bump the equipped pet up one level
//   spin_token     → grant N daily-wheel spins
//   spin_reset     → refresh the free daily spin (spin again today)
//   delve_reset    → clear today's dungeon runs, so all four are walkable again
// Non-combat ACTIVITY effects (farming / petting / liking / sailing) — applied via the helpers in
// farm-consumables.js and the sail_* block:
//   farm_grow         → speed up your slowest-growing crop by `cut`
//   farm_seed         → grant `count` random crop seeds (weighted common)
//   farm_harvest_luck → bank `charges` harvest-luck charges (better harvest loot for the next N harvests)
//   farm_fertilizer   → grant `count` fertilizer
//   farm_petting      → +`amount` EXTRA own-pet pettings today
//   farm_rating       → +`amount` EXTRA farm-rating charges today
//   sail_tailwind     → buyable gust: shave `hours` off your current voyage
export const CONSUMABLES = {
    scroll_wisdom: { name: "Tome of Wisdom", emoji: "📜", kind: "scroll", desc: "Instantly gain 500 XP.", price: 1500, effect: { type: "xp", amount: 500 } },
    scroll_ancient: { name: "Ancient Codex", emoji: "📖", kind: "scroll", desc: "Instantly gain 2,000 XP.", price: 5000, effect: { type: "xp", amount: 2000 } },
    pot_adrenaline: { name: "Adrenaline Vial", emoji: "🧪", kind: "potion", desc: "Gain +2 manual daily strikes today.", price: 1200, effect: { type: "strikes", amount: 2 } },
    pot_secondwind: { name: "Second Wind", emoji: "🌀", kind: "potion", desc: "Gain +5 manual daily strikes today.", price: 3200, effect: { type: "strikes", amount: 5 } },
    pot_berserker: { name: "Berserker's Brew", emoji: "🍺", kind: "potion", desc: "DOUBLE your daily strike damage for 24 hours.", price: 4000, effect: { type: "damage", mult: 2, hours: 24 } },
    pot_fury: { name: "Bottled Fury", emoji: "🔥", kind: "potion", desc: "TRIPLE your daily strike damage for 6 hours.", price: 6500, effect: { type: "damage", mult: 3, hours: 6 } },
    stone_ember: { name: "Ember Stone", emoji: "🔴", kind: "stone", desc: "DOUBLE your daily strike damage for 12 hours.", price: 3500, effect: { type: "damage", mult: 2, hours: 12 } },
    stone_storm: { name: "Storm Crystal", emoji: "🔷", kind: "stone", desc: "Gain +3 manual daily strikes today.", price: 2000, effect: { type: "strikes", amount: 3 } },
    // ULTRA relics — no gold price (drop only from the highest chests). Applied to a charged item you pick.
    elixir_renewal: { name: "Elixir of Renewal", emoji: "⚗️", kind: "relic", price: null, target: "recharge", desc: "Fully RECHARGE all charges on one of your charged items.", effect: { type: "recharge" } },
    sands_of_time: { name: "Sands of Time", emoji: "⏳", kind: "relic", price: null, target: "cooldown", desc: "Instantly RESET the cooldown on a charged item that still has a charge left.", effect: { type: "reset_cooldown" } },
    // FORGE SCROLLS — used AT the Forge (not the generic use screen). The Power Scroll is a free enhancement (no
    // salvaged parts). The rarer Enchantment Scroll permanently adds an elemental affinity you pick (can exceed two).
    forge_power_scroll: { name: "Power Scroll", emoji: "📜", kind: "scroll", price: null, target: "forge", desc: "A free enhancement at the Forge — enhance a piece WITHOUT spending salvaged parts.", effect: { type: "forge_enhance" } },
    forge_enchant_scroll: { name: "Enchantment Scroll", emoji: "🪄", kind: "scroll", price: null, target: "forge", desc: "Permanently add an elemental affinity of your choice to a piece of gear (can extend it past two).", effect: { type: "forge_enchant" } },
    // PET TREATS — feed your EQUIPPED pet to level it up. Six buyable tiers + four drop-only.
    treat_bone: { name: "Pet Treat", emoji: "🦴", kind: "treat", desc: "Feed your equipped pet +25 pet XP.", price: 400, effect: { type: "pet_xp", amount: 25 } },
    treat_snack: { name: "Hearty Snack", emoji: "🍖", kind: "treat", desc: "Feed your equipped pet +75 pet XP.", price: 1000, effect: { type: "pet_xp", amount: 75 } },
    treat_toy: { name: "Chew Toy", emoji: "🧸", kind: "treat", desc: "Feed your equipped pet +150 pet XP.", price: 1800, effect: { type: "pet_xp", amount: 150 } },
    treat_feast: { name: "Pet Feast", emoji: "🍲", kind: "treat", desc: "Feed your equipped pet +300 pet XP.", price: 3200, effect: { type: "pet_xp", amount: 300 } },
    treat_golden: { name: "Golden Bone", emoji: "✨", kind: "treat", desc: "Feed your equipped pet +600 pet XP.", price: 6000, effect: { type: "pet_xp", amount: 600 } },
    treat_kibble: { name: "Legendary Kibble", emoji: "🥩", kind: "treat", desc: "Feed your equipped pet +1,200 pet XP.", price: 10000, effect: { type: "pet_xp", amount: 1200 } },
    // Drop-only pet treats (chests / boss).
    treat_wild: { name: "Wild Rations", emoji: "🌿", kind: "treat", price: null, desc: "Feed your equipped pet +400 pet XP.", effect: { type: "pet_xp", amount: 400 } },
    treat_marrow: { name: "Ancient Marrow", emoji: "🍥", kind: "treat", price: null, desc: "Feed your equipped pet +800 pet XP.", effect: { type: "pet_xp", amount: 800 } },
    treat_mythic: { name: "Mythic Morsel", emoji: "💎", kind: "treat", price: null, desc: "Feed your equipped pet +1,500 pet XP.", effect: { type: "pet_xp", amount: 1500 } },
    treat_ambrosia: { name: "Ambrosia", emoji: "🍯", kind: "treat", price: null, desc: "Instantly LEVEL UP your equipped pet.", effect: { type: "pet_level" } },
    // SAILING relics — drop-only one-shots that bend the sailing systems. Used from your stash; effects land on
    // your next voyage / dig / raid (see the sail_* handlers in useConsumable).
    sail_war_drum: { name: "War Drum", emoji: "🥁", kind: "relic", price: null, desc: "Beat the drums to regain one spent daily raid.", effect: { type: "sail_raid" } },
    sail_treasure_map: { name: "Treasure Map", emoji: "🗺️", kind: "relic", price: null, desc: "Your next landing is guaranteed to meet the Gold Merchant — including this one, if you are already ashore.", effect: { type: "sail_merchant" } },
    sail_lucky_lure: { name: "Lucky Lure", emoji: "🎣", kind: "relic", price: null, desc: "Your next dig has a good chance of TWO chests buried instead of one — and pays +50% more doubloons if you fall short.", effect: { type: "sail_lure" } },
    sail_storm_bottle: { name: "Storm in a Bottle", emoji: "🌪️", kind: "relic", price: null, desc: "Uncork mid-voyage to HALVE the remaining sail time.", effect: { type: "sail_storm" } },
    sail_kraken_bait: { name: "Kraken Bait", emoji: "🦑", kind: "relic", price: null, desc: "Your next voyage is guaranteed a marine encounter.", effect: { type: "sail_encounter" } },
    // SPIN charges — feed the daily wheel. Tokens = extra spins; a rewind refreshes your free daily spin.
    spin_lucky_coin: { name: "Lucky Coin", emoji: "🎟️", kind: "spin", desc: "Gain +2 wheel spins.", price: 1500, effect: { type: "spin_token", amount: 2 } },
    spin_golden_ticket: { name: "Golden Ticket", emoji: "🎫", kind: "spin", price: null, desc: "Gain +5 wheel spins.", effect: { type: "spin_token", amount: 5 } },
    spin_rewind: { name: "Wheel Rewind", emoji: "⏪", kind: "spin", price: null, desc: "Refresh your FREE daily spin — spin again now.", effect: { type: "spin_reset" } },

    // ── THE SECOND DESCENT ───────────────────────────────────────────────────────────────────────────
    // Clears today's dungeon runs — all four, not one. One dungeon would be the fiddlier item AND the worse
    // one: it needs a picker, and the answer is always "the deepest one I can clear", so the choice is not a
    // choice. All four is one tap and one sentence.
    //
    // `price: null` — it is never sold. A daily reset you can buy is not a daily limit, and the shop is where
    // rare things go to stop being rare. It drops from a dungeon BOSS and nowhere else (see FIGHT_DROPS
    // .descent), which means the only way to earn another descent is to finish the one you are on.
    delve_second_descent: {
        name: "Second Descent", emoji: "🕳️", kind: "relic", price: null,
        desc: "Clears today's dungeon runs — walk back into all four.",
        effect: { type: "delve_reset" },
    },
    // FARM supplies — buyable boosts for the garden loop. Growth Tonic / Fertilizer Crate speed crops; Seed
    // Packet restocks the seed bag; Harvest Charm sweetens the next few harvests' loot rolls.
    farm_growth_tonic: { name: "Growth Tonic", emoji: "🧴", kind: "farm", desc: "Speed up your slowest-growing crop by 60%.", price: 600, effect: { type: "farm_grow", cut: 0.6 } },
    // Seed packs (farm_seed_packet / _crate / _vault) are injected below from SEED_PACKS — the tiered bags are
    // the only way to get seeds now.
    farm_harvest_charm: { name: "Harvest Charm", emoji: "🍀", kind: "farm", desc: "Your next 5 harvests roll for better loot.", price: 1200, effect: { type: "farm_harvest_luck", charges: 5 } },
    farm_fertilizer_crate: { name: "Fertilizer Crate", emoji: "📦", kind: "farm", desc: "A crate of 5 fertilizer for your crops.", price: 1500, effect: { type: "farm_fertilizer", count: 5 } },
    // Drop-only bumper crate — a bigger fertilizer haul from the better chests.
    farm_fertilizer_haul: { name: "Bumper Fertilizer Haul", emoji: "🚜", kind: "farm", price: null, desc: "A haul of 12 fertilizer for your crops.", effect: { type: "farm_fertilizer", count: 12 } },
    // PETTING & LIKING — small daily top-ups for the social farm loops.
    farm_pet_whistle: { name: "Pettin' Whistle", emoji: "🐕", kind: "farm", desc: "Grants +2 EXTRA pettings on your own pets today.", price: 400, effect: { type: "farm_petting", amount: 2 } },
    farm_kindness_token: { name: "Kindness Token", emoji: "💝", kind: "farm", desc: "Grants +2 EXTRA farm ratings you can give today.", price: 300, effect: { type: "farm_rating", amount: 2 } },
    // SAILING — BUYABLE so players can actually purchase into the sailing/dig/raid loops (the relics above are
    // all drop-only). Tailwind Charm speeds the current voyage; Prospector's Charm is a buyable dig-luck;
    // Raiding Horn a buyable raid restore.
    sail_tailwind_charm: { name: "Tailwind Charm", emoji: "🌬️", kind: "sail", desc: "Summon a gust — shave 2 hours off your current voyage.", price: 700, effect: { type: "sail_tailwind", hours: 2 } },
    sail_prospectors_charm: { name: "Prospector's Charm", emoji: "⛏️", kind: "sail", desc: "Your next dig has a good chance of TWO chests buried instead of one — and pays +50% more doubloons if you fall short.", price: 600, effect: { type: "sail_lure" } },
    sail_raiding_horn: { name: "Raiding Horn", emoji: "📯", kind: "sail", desc: "Sound the horn to regain one spent daily raid.", price: 900, effect: { type: "sail_raid" } },
};

// Inject the tiered seed packs from the shared catalog (single source of truth for tiers/weights/prices).
for (const p of SEED_PACKS) {
    CONSUMABLES[p.id] = { name: p.name, emoji: p.emoji, kind: "farm", desc: p.desc, price: p.price, effect: { type: "farm_seed", count: p.count, weights: p.weights } };
}

// -- DISHES YOU CAN ACTUALLY FEED SOMETHING ------------------------------------------------------------------
// Every dish in the book is now a thing you OWN and can give to your pet. Until this, cooking a dish paid a rung
// off its tier's reward ladder and the dish itself evaporated: sixty-four named plates with their own art, and
// none of them existed once the animation stopped. GrayKitsune asked for something to do with output that
// otherwise just piles up; the answer is to make the food food.
//
// The ladder reward is UNTOUCHED. A cook pays exactly what it always paid, and now also hands you the plate.
//
// -- THE NUMBERS, AND WHY THESE ONES -------------------------------------------------------------------------
// The brief was "not crazy exp", so these are anchored to two things that already exist rather than to feel:
//
//   1. The TREAT LADDER above (25 / 75 / 150 / 300 / 600 / 1,200 pet XP, bought with gold). A dish arrives free
//      alongside a reward you were already getting, so each tier sits at or below the treat you could have
//      bought instead. Tier 5 is 350 - over a Pet Feast, well under a Golden Bone.
//   2. What the Den actually cooks. Measured over the seven days to 18 Aug: 352 tier-1 cooks, 259 tier-2, 86
//      tier-3, 15 tier-4 and 2 tier-5, with the heaviest cook in the game peaking at 37 dishes in a day. There
//      is no daily cap on cooking - only ingredients - so the ceiling had to be checked against real volume,
//      not against a limit that does not exist.
//
// Against those measured days: GrayKitsune's 30-dish peak pays 495 pet XP, the busiest day anyone had (37
// dishes, into tier 4) pays 1,260. A dedicated player already earns about 710 pet XP a day from the equipped
// share and the trickle, and a common pet needs 30,000 to reach six. So a big day at the stove is a real second
// source and never the main one, which is the whole intent of "not crazy".
//
// ONE PLATE PER COOK, never multiplied by `portions`. Portions is the Seasoning track's second helping of the
// LADDER reward; letting it double the pet XP as well would put a maxed track quietly in charge of this number.
// The enshrinement stone on the tier-5 ladder is excluded from portions for the same reason.
//
// BAIT IS NOT FEEDABLE, and neither are preps. Both already have an `out` that lands in the pantry: bait is
// spent on a cast, a prep is spent on the next recipe. Only `kind: "dish"` becomes food.
export const DISH_PET_XP = { 1: 10, 2: 25, 3: 60, 4: 150, 5: 350 };
export const DISH_TIER_NAME = { 1: "Simple", 2: "Hearty", 3: "Fine", 4: "Exquisite", 5: "Legendary" };

// The dish's consumable id IS its recipe id - one name for one thing, so the sprite already sitting in
// mkt_cooking_sprite under that key is the sprite the stash draws (see consumable-sprites.js). Guarded, because
// a recipe id that collided with a real consumable would silently overwrite it.
export const DISH_IDS = [];
// ── EVERY DISH IN THE BOOK, INCLUDING THE TIER BEHIND THE DOOR ───────────────────────────────────────────────
// This iterated RECIPES, which is the ORDINARY book — so the six master dishes had no consumable definition at
// all, and cooking one would have produced an id that resolves to nothing. Found while gating the master tier
// out of the market: the tier was unobtainable in one direction and uncookable in the other.
//
// Defining them here does not leak anything. CONSUMABLES is a table of what a thing IS, not a list of what you
// may have — a member who has never bought the Master s Book cannot roll the recipe, cannot cook the dish and
// will never hold one, and locked-content.js keeps the output off the market either way.
// SEASON_RECIPES joins them for exactly the reason MASTER_RECIPES did: a dish with no consumable definition
// cooks into an id that resolves to nothing. Same note applies — CONSUMABLES says what a thing IS, not what
// you may have, and a member who never walked the Road can neither learn the page nor cook the dish.
for (const r of [...RECIPES, ...MASTER_RECIPES, ...SEASON_RECIPES]) {
    if (r.kind !== "dish") continue;
    if (CONSUMABLES[r.id]) throw new Error(`cooking recipe "${r.id}" collides with an existing consumable id`);
    const amount = DISH_PET_XP[r.tier] || DISH_PET_XP[1];
    CONSUMABLES[r.id] = {
        name: r.name,
        emoji: "🍽️",
        kind: "dish",
        price: null, // cooked, never bought - the Kitchen is the only source
        tier: r.tier,
        desc: `${DISH_TIER_NAME[r.tier]} dish. Feed your equipped pet +${amount.toLocaleString()} pet XP.`,
        effect: { type: "pet_xp", amount },
    };
    DISH_IDS.push(r.id);
}

// Buyable order (shop). Relics + drop-only treats are intentionally excluded — they're chest/boss-only.
const SHOP_ORDER = [
    "scroll_wisdom", "scroll_ancient", "pot_adrenaline", "pot_secondwind", "pot_berserker", "pot_fury", "stone_ember", "stone_storm",
    "treat_bone", "treat_snack", "treat_toy", "treat_feast", "treat_golden", "treat_kibble",
    "spin_lucky_coin",
    // Non-combat activity supplies.
    "farm_growth_tonic", "farm_seed_packet", "farm_seed_crate", "farm_seed_vault", "farm_harvest_charm", "farm_fertilizer_crate", "farm_pet_whistle", "farm_kindness_token",
    "sail_tailwind_charm", "sail_prospectors_charm", "sail_raiding_horn",
];

// --- Boss-fight hooks (read by boss.js) -------------------------------------------------------------

// ── THE STRONGEST BREW WINS. THEY DO NOT STACK. ──────────────────────────────────────────────────────────────
// This MULTIPLIED every active damage boost together, with no ceiling of its own. Four Berserker's Brews is
// therefore not double damage, it is 2^4 — SIXTEEN times — and that is not a hypothetical: at the time of
// writing one member was sitting on exactly that and topping the Hall of Heroes with 16.8 million damage
// against a second place of 9.1 million and a fourth place of 1.6 million. Luke: "we can't have people doing
// this much damage and it's surely because of the consumables."
//
// It is, and it is not the supply. I audited every source — chests (mythic through celestial), the daily
// wheel, the mine, sailing's shop and its landing loot, encounters, and the gold shop — and counted what
// actually gets drunk: three to eight damage potions a day across the whole membership, with twenty-one held
// in total. That is a trickle. The bug was never how many people had; it was that having four made them
// sixteen times stronger instead of twice.
//
// So the rule is the one every game with a buff bar already uses and every player already expects: the
// STRONGEST one applies and the rest wait their turn. A Bottled Fury (x3) beats a Berserker's Brew (x2);
// drinking a second Brew while the first is running does nothing but waste it. It cannot be stacked, it
// cannot be hoarded into a burst, and it is still worth exactly what the label says.
//
// The label is what it says on the bottle, so no potion is being nerfed — only the multiplication between
// them, which nothing ever promised and nobody could see coming.
export async function memberDamageMult(buyerId) {
    if (!buyerId) return 1;
    const rows = await db.query(`SELECT magnitude FROM mkt_user_boost WHERE buyer_id = $1 AND kind = 'damage' AND expires_at > NOW()`, [buyerId]).catch(() => []);
    return rows.reduce((m, r) => Math.max(m, Number(r.magnitude) || 1), 1);
}

// ── AND THERE IS A LIMIT TO HOW MANY TIMES A DAY YOU CAN SWING ───────────────────────────────────────────────
// Strikes DO add up — that is the right shape for them, and unlike the damage multiplier it is linear, so ten
// vials is ten times one vial rather than a thousand. But it had no ceiling at all, and the supply here is a
// real flood where the damage potions were a trickle: 141 Adrenaline Vials held across 26 members, and 64 to
// 77 strike boosts drunk on a busy day. Nothing stopped somebody drinking twenty of them and taking forty
// extra swings at a boss sized for one.
//
// Eight is deliberately generous — it is four Second Winds, or a whole day of wheel drops — and it is a cap on
// the POTION contribution only. Gear, pets, signatures and set capstones are untouched and still add on top,
// because those are things a member built rather than things they stockpiled.
export const MAX_POTION_STRIKES = 8;

export async function memberBonusStrikes(buyerId) {
    if (!buyerId) return 0;
    const row = await db.queryOne(`SELECT COALESCE(SUM(magnitude), 0)::int AS n FROM mkt_user_boost WHERE buyer_id = $1 AND kind = 'strikes' AND expires_at > NOW()`, [buyerId]).catch(() => null);
    return Math.min(MAX_POTION_STRIKES, row?.n || 0);
}

export async function activeBoosts(buyerId) {
    if (!buyerId) return [];
    const rows = await db.query(`SELECT kind, magnitude, expires_at FROM mkt_user_boost WHERE buyer_id = $1 AND expires_at > NOW() ORDER BY expires_at ASC`, [buyerId]).catch(() => []);
    // Combine same-effect boosts into ONE line so multiple of the same thing read cleanly (e.g. two "+5
    // attacks" show as "+10 attacks today", not two identical badges).
    let strikeTotal = 0; let strikeExpiry = null;
    const damage = new Map(); // magnitude → { count, expiresAt }
    for (const r of rows) {
        if (r.kind === "strikes") { strikeTotal += Number(r.magnitude) || 0; strikeExpiry = r.expires_at; }
        else if (r.kind === "damage") { const m = Number(r.magnitude); const cur = damage.get(m) || { count: 0, expiresAt: r.expires_at }; cur.count += 1; cur.expiresAt = r.expires_at; damage.set(m, cur); }
    }
    // ── AND IT SAYS WHAT IS ACTUALLY APPLYING ────────────────────────────────────────────────────────────
    // This used to print "2× damage (×4)" for four brews, which read as eight — or as sixteen, which is what
    // it really was. Now that only the strongest applies, the badge names the one that is doing the work and
    // says plainly that the others are queued behind it. Same for strikes past the cap: a member who drank
    // twelve vials should be told that eight of them count, not left to work it out from a swing counter.
    const applied = Math.max(1, ...[...damage.keys()]);
    const out = [];
    if (strikeTotal > 0) {
        const kept = Math.min(MAX_POTION_STRIKES, strikeTotal);
        out.push({ kind: "strikes", magnitude: kept, expiresAt: strikeExpiry,
            label: `+${kept} attacks today${strikeTotal > kept ? ` (${strikeTotal - kept} over the daily limit)` : ""}` });
    }
    for (const [m, info] of damage) {
        const isTop = m === applied;
        out.push({ kind: "damage", magnitude: m, expiresAt: info.expiresAt,
            label: `${m}× damage${isTop ? "" : " (waiting — a stronger one is running)"}` });
    }
    return out;
}

// ── WHICH SCREEN A CONSUMABLE BELONGS TO ─────────────────────────────────────────────────────────────────────
// Kaishiern: "And a button to use consumables on tier respective screens. With an icon to say if they have
// been used already/ are active."
//
// He is describing the shape of the problem exactly. Everything you own lives on ONE stash screen inside the
// store, and every one of these things is spent somewhere else — a Tailwind Charm is only ever interesting
// while you are looking at a voyage, a Harvest Charm while you are looking at crops. So the answer to "do I
// have anything that helps here" was: leave, go to the store, read a list of forty, come back.
//
// DERIVED FROM THE EFFECT, not a hand-kept list of ids. A list would need a line added every time a consumable
// is, and the one that got missed would be the one nobody could find — which is the bug this is fixing. The
// effect a thing HAS is already the honest answer to which screen it belongs on.
const FEATURE_BY_EFFECT = {
    strikes: "boss", damage: "boss",
    recharge: "gear", reset_cooldown: "gear",
    forge_enhance: "forge", forge_enchant: "forge",
    pet_xp: "pets", pet_level: "pets",
    spin_token: "spin", spin_reset: "spin",
    delve_reset: "delve",
};

/** Which feature screen this consumable belongs on, or null for one that belongs to no screen in particular. */
export function featureOf(id) {
    const t = CONSUMABLES[id]?.effect?.type || "";
    if (FEATURE_BY_EFFECT[t]) return FEATURE_BY_EFFECT[t];
    // The sail_* and farm_* families name their own home, and a new one added to either will land here without
    // anybody remembering this function exists.
    if (t.startsWith("sail_")) return "sail";
    if (t.startsWith("farm_")) return "farm";
    return null;   // the XP scrolls: instant, and no screen is more theirs than any other
}

/**
 * What this member is holding FOR ONE SCREEN, and what is already running there.
 *
 * `active` is the other half of Kaishiern's ask — "an icon to say if they have been used already / are
 * active". It is read from wherever each effect actually lives rather than from a second bookkeeping table:
 * timed boosts on mkt_user_boost, the sailing one-shots as flags on mkt_sailing, the farm's charges as counts
 * on mkt_buyer. A shelf that kept its own copy of "is this on" would be a copy that could be wrong.
 */
export async function featureConsumables(buyerId, feature) {
    const f = String(feature || "").trim();
    if (!buyerId || !f) return { feature: f, stash: [], active: [] };
    const own = await db.query(`SELECT consumable_id, count FROM mkt_user_consumable WHERE buyer_id = $1 AND count > 0`, [buyerId]).catch(() => []);
    const stash = own
        .filter((r) => CONSUMABLES[r.consumable_id] && featureOf(r.consumable_id) === f)
        .map((r) => {
            const c = CONSUMABLES[r.consumable_id];
            return { id: r.consumable_id, name: c.name, emoji: c.emoji, kind: c.kind, desc: c.desc,
                // Whether the shelf may offer "Use all". Decided here, from the same allow-list the POST
                // enforces, so the button and the door can never disagree about what is bulk-usable.
                count: Number(r.count) || 0, target: c.target || null, bulk: canBulkUse(r.consumable_id) };
        })
        // Cheapest-feeling first is wrong here; what you want at a glance is the thing you have most of, then
        // by name so the shelf does not reshuffle itself between visits.
        .sort((a, z) => z.count - a.count || a.name.localeCompare(z.name));

    const active = [];
    if (f === "boss") active.push(...(await activeBoosts(buyerId)));
    if (f === "sail") {
        const r = await db.queryOne(`SELECT dig_lure, force_encounter, force_merchant FROM mkt_sailing WHERE buyer_id = $1`, [buyerId]).catch(() => null);
        const lures = Number(r?.dig_lure) || 0;
        if (lures > 0) active.push({ kind: "sail_lure", label: lures === 1 ? "Next dig is charmed" : `${lures} charmed digs banked` });
        if (r?.force_encounter) active.push({ kind: "sail_encounter", label: "Next voyage draws an encounter" });
        if (r?.force_merchant) active.push({ kind: "sail_merchant", label: "Next landing meets the Gold Merchant" });
    }
    if (f === "farm") {
        const r = await db.queryOne(`SELECT COALESCE(farm_harvest_luck,0)::int AS luck, COALESCE(farm_fertilizer,0)::int AS fert FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
        // Charmed harvests carry NO action on purpose — they are spent by the next harvest, whichever crop
        // that turns out to be, so there is nothing here to press. The pill is a count, and it says so.
        if (r?.luck > 0) active.push({ kind: "farm_harvest_luck", label: `${r.luck} charmed harvest${r.luck === 1 ? "" : "s"} left` });
        // Fertilizer DOES have one. It is spent a plot at a time from a button on the plot, so a shed holding
        // 127 of it was the one place in the game that could tell you what you had and not let you use any.
        if (r?.fert > 0) active.push({ kind: "farm_fertilizer", label: `${r.fert} fertilizer in stock`, action: "fertilize_all", cta: "Spread it" });
    }
    return { feature: f, stash, active };
}

// ── SPENDING WHAT IS ALREADY RUNNING ─────────────────────────────────────────────────────────────────────────
// An `active` pill is normally a read-out: a boost with an hour left, a lure banked against the next dig. Those
// have no button because there is nothing a tap could do — they fire on their own, on the next thing you do.
//
// Fertilizer is the exception. It sits as a COUNT on your farm rather than as a charge on a crop, and the only
// thing that spends it is a button on an individual plot. So the shed could report 127 of it and offer no way
// to use one, which is the complaint this answers.
//
// Dispatched by `kind` here rather than by the shelf calling a farm endpoint directly, because the shelf is
// generic — it is mounted on six screens and must not learn what a plot is. The list is deliberately closed:
// an action nobody authored is not an action.
export async function useActiveEffect(buyerId, action) {
    if (!buyerId) return { ok: false, error: "bad_request" };
    if (action === "fertilize_all") {
        const { fertilizeAll } = await import("@/lib/marketplace/farm-crops.js");
        const r = await fertilizeAll(buyerId);
        if (!r.ok) return r;
        return { ...r, applied: `Fertilizer on ${r.fertilized} ${r.fertilized === 1 ? "crop" : "crops"} — ${r.left} left in the shed.` };
    }
    return { ok: false, error: "unknown_action" };
}

// --- Stash + shop -----------------------------------------------------------------------------------

export async function listConsumables(buyerId) {
    if (!buyerId) return { gold: 0, shop: [], stash: [], chargedItems: [], active: [] };
    const [goldRow, ownRows, chargedRows, active, coupon] = await Promise.all([
        db.queryOne(`SELECT COALESCE(gold, 0) AS gold FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null),
        db.query(`SELECT consumable_id, count FROM mkt_user_consumable WHERE buyer_id = $1 AND count > 0`, [buyerId]).catch(() => []),
        db.query(`SELECT item_id, charges_left, last_charge_at FROM mkt_user_item WHERE buyer_id = $1`, [buyerId]).catch(() => []),
        activeBoosts(buyerId),
        getShopCoupon(buyerId).catch(() => null),
    ]);
    const gold = goldRow?.gold || 0;
    const shop = SHOP_ORDER.filter((id) => CONSUMABLES[id]?.price != null).map((id) => {
        const c = CONSUMABLES[id];
        // effectivePrice folds in an active coupon so the shown price + affordability match the actual charge.
        const effectivePrice = couponedPrice(coupon, c.price);
        return { id, name: c.name, emoji: c.emoji, kind: c.kind, desc: c.desc, price: c.price, effectivePrice, discounted: effectivePrice < c.price, canAfford: gold >= effectivePrice };
    });
    const stash = ownRows.map((r) => {
        const c = CONSUMABLES[r.consumable_id];
        if (!c) return null;
        // `feedable` drives the stash's "Use all" — read off the EFFECT, the same question feedPetBulk asks,
        // so a food added later is offered here without anyone remembering to update a list of kinds.
        return { id: r.consumable_id, name: c.name, emoji: c.emoji, kind: c.kind, desc: c.desc, count: r.count,
            // `bulk` is the same question for everything that ISN'T pet food, answered by the one allow-list
            // the POST enforces — so the button and the door cannot disagree.
            target: c.target || null, feedable: c.effect?.type === "pet_xp", bulk: canBulkUse(r.consumable_id) };
    }).filter(Boolean);
    // The member's charged gear, for the recharge / cooldown-reset target pickers.
    const now = Date.now();
    const chargedItems = chargedRows.map((r) => {
        const def = itemById(r.item_id);
        if (!def?.charged) return null;
        const left = Math.max(0, r.charges_left ?? 0);
        const cd = Math.max(0, def.cooldownDays || 0);
        const readyAt = r.last_charge_at ? new Date(r.last_charge_at).getTime() + cd * 86400000 : 0;
        const onCooldown = left > 0 && readyAt > now;
        return { id: def.id, name: def.name, icon: def.icon, rarity: def.rarity, chargesLeft: left, maxCharges: def.charges || 0, full: left >= (def.charges || 0), onCooldown, cooldownUntil: onCooldown ? new Date(readyAt).toISOString() : null };
    }).filter(Boolean);
    return { gold, shop, stash, chargedItems, active, coupon };
}

// Grant a consumable (chest drop / owner). Best-effort.
export async function grantConsumable(buyerId, id, n = 1) {
    if (!buyerId || !CONSUMABLES[id]) return;
    await db.query(
        `INSERT INTO mkt_user_consumable (buyer_id, consumable_id, count) VALUES ($1, $2, $3)
         ON CONFLICT (buyer_id, consumable_id) DO UPDATE SET count = mkt_user_consumable.count + $3`,
        [buyerId, id, n]
    ).catch(() => {});
}

export async function buyConsumable(buyerId, id) {
    const c = CONSUMABLES[id];
    if (!buyerId || !c || c.price == null) return { ok: false, error: "not_for_sale" };
    const cp = await previewShopCoupon(buyerId, c.price); // apply a login coupon if one's active
    const row = await db.queryOne(`UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`, [buyerId, cp.price]).catch(() => null);
    if (!row) return { ok: false, error: "not_enough_gold" };
    await logCoin(buyerId, -cp.price, "buy_consumable", { meta: { name: c.name }, balanceAfter: row.gold }).catch(() => {});
    if (cp.pct > 0) await consumeShopCoupon(buyerId);
    // The Bulk Buyer: one purchase in three comes in pairs. Rolled AFTER the gold is taken, so it is a second
    // one free rather than a discount — and it rides the quantity, which is the only thing on this counter a
    // power can touch without becoming a price cut that stacks with the coupon.
    const { powerRoll } = await import("@/lib/marketplace/ascension-powers.js");
    const paired = await powerRoll(buyerId, "bulk_buyer", 3).catch(() => false);
    await grantConsumable(buyerId, id, paired ? 2 : 1);
    await trackActivity(buyerId, "buy_consumable", { id, name: c.name, couponPct: cp.pct || 0, paired });
    return { ok: true, gold: row.gold, couponPct: cp.pct || 0, paired };
}

// Use one from the stash. Targeted relics (recharge / reset) take a charged item id; validated BEFORE the
// consumable is spent so a bad target never wastes it.
// ── SPENDING A STACK IN ONE REQUEST ──────────────────────────────────────────────────────────────────────────
// Drinking eleven vials is eleven taps and, until now, eleven function invocations — the client had no bulk
// path at all, so the only way to spend a stack was to spend it one at a time. Chests (openChests) and the
// Forge (combineAllAtTier, salvageAllOfRarity) already do this server-side; this is the same shape for the
// shelf.
//
// IT LOOPS THE SINGLE-ITEM PATH ON PURPOSE, exactly as the Forge does. Summing the effect and applying it once
// would be fewer queries, but it would be a SECOND implementation of what every consumable does — and some of
// them grant XP, which pays gold 1:1 unless the caller says otherwise. A bulk path that re-derives the reward
// is how a money printer gets built. Looping cannot drift: eleven uses here are the same eleven uses the
// player would have tapped.
//
// ── WHICH ONES, AND WHY NOT THE REST ─────────────────────────────────────────────────────────────────────────
// Only effects that are untargeted and purely additive, where N uses is N times the result and nothing is
// wasted. Everything else is deliberately excluded rather than left to the client to be careful with:
//
//   recharge / reset_cooldown   need a specific item; "all" has no meaning against one target
//   pet_xp / pet_level          already bulk, via feedPetBulk on the equipped pet (see the route)
//   farm_fertilizer             lands on a chosen plot
//   sail_*                      situational one-shots mid-voyage; dumping a stack burns the lot for one leg
//
// The allow-list lives HERE and not in the UI, so a client cannot ask for a bulk it was never meant to have.
export const BULK_USE_CAP = 25;
const BULK_USABLE = new Set(["xp", "strikes", "damage", "spin_token"]);

/** Is there a sensible "use all" for this consumable? The shelf asks so it can draw the button. */
export const canBulkUse = (id) => BULK_USABLE.has(CONSUMABLES[id]?.effect?.type);

export async function useConsumableBulk(buyerId, id, { max = BULK_USE_CAP } = {}) {
    const c = CONSUMABLES[id];
    if (!buyerId || !c) return { ok: false, error: "unknown" };
    if (!canBulkUse(id)) return { ok: false, error: "not_bulkable" };
    const row = await db.queryOne(
        `SELECT count FROM mkt_user_consumable WHERE buyer_id = $1 AND consumable_id = $2`, [buyerId, id]).catch(() => null);
    const have = Math.max(0, Number(row?.count) || 0);
    if (have < 1) return { ok: false, error: "none_owned" };

    const runs = Math.min(have, Math.max(1, max));
    const lines = [];
    let used = 0;
    let remaining = have;
    // ⚠️ WHY THE REFUSAL IS KEPT. Tested live against an account already holding the maximum bonus strikes:
    // the first use came back "strikes_capped", the loop stopped and spent nothing — right — but the caller
    // reported "none_applied", so the shelf would have said "Could not use those" to somebody whose actual
    // problem was that they were already at the cap. The single-use path says why; the bulk one has to as well
    // or it is a worse button than the one it replaces.
    let refusal = null;
    for (let i = 0; i < runs; i += 1) {
        const r = await useConsumable(buyerId, id).catch(() => null);
        if (!r?.ok) { refusal = r || null; break; }   // capped out or nothing left: stop cleanly, keep the rest
        used += 1;
        remaining = Number.isFinite(r.remaining) ? r.remaining : Math.max(0, remaining - 1);
        if (r.applied) lines.push(r.applied);
    }
    // Nothing landed: hand back the reason the FIRST use gave, not a generic one of our own.
    if (!used) return { ok: false, error: refusal?.error || "none_applied", message: refusal?.message || null };
    return {
        ok: true, used, remaining, name: c.name, emoji: c.emoji,
        // The LAST sentence plus a count, rather than eleven identical lines stacked up the screen.
        applied: used === 1 ? (lines[0] || "Used.") : `${used} x ${c.name} - ${lines[lines.length - 1] || "used"}`,
        // Whether anything is left, so the caller knows if the cap stopped it rather than the stack running out.
        cappedAt: used === max && have > max ? max : null,
        // Stopped EARLY — the stack still has some and the game refused the next one (full, capped, maxed).
        // The shelf says so rather than leaving somebody wondering why four of eleven went.
        stopped: used < runs ? (refusal?.error || null) : null,
    };
}

export async function useConsumable(buyerId, id, targetItemId = null, targetPetId = null) {
    const c = CONSUMABLES[id];
    if (!buyerId || !c) return { ok: false, error: "unknown" };
    const e = c.effect;

    // Forge scrolls are consumed at the Forge (they need the enhance flow / an item+element picker), not here.
    if (e.type === "forge_enhance" || e.type === "forge_enchant") return { ok: false, error: "use_at_forge" };

    if (e.type === "recharge" || e.type === "reset_cooldown") {
        const def = itemById(targetItemId);
        if (!def?.charged) return { ok: false, error: "bad_target" };
        const row = await db.queryOne(`SELECT charges_left, last_charge_at FROM mkt_user_item WHERE buyer_id = $1 AND item_id = $2`, [buyerId, targetItemId]).catch(() => null);
        if (!row) return { ok: false, error: "target_not_owned" };
        if (e.type === "recharge") {
            if ((row.charges_left ?? 0) >= (def.charges || 0)) return { ok: false, error: "already_full" };
        } else {
            const cd = Math.max(0, def.cooldownDays || 0);
            const readyAt = row.last_charge_at ? new Date(row.last_charge_at).getTime() + cd * 86400000 : 0;
            if (!((row.charges_left ?? 0) > 0 && readyAt > Date.now())) return { ok: false, error: "not_on_cooldown" };
        }
        const dec = await db.queryOne(`UPDATE mkt_user_consumable SET count = count - 1 WHERE buyer_id = $1 AND consumable_id = $2 AND count > 0 RETURNING count`, [buyerId, id]).catch(() => null);
        if (!dec) return { ok: false, error: "none_owned" };
        await trackActivity(buyerId, "use_consumable", { id, name: c.name });
        if (e.type === "recharge") {
            await db.query(`UPDATE mkt_user_item SET charges_left = $3 WHERE buyer_id = $1 AND item_id = $2`, [buyerId, targetItemId, def.charges || 0]).catch(() => {});
            return { ok: true, remaining: dec.count, name: c.name, emoji: c.emoji, applied: `${def.name} fully recharged — ${def.charges} charges` };
        }
        await db.query(`UPDATE mkt_user_item SET last_charge_at = NULL WHERE buyer_id = $1 AND item_id = $2`, [buyerId, targetItemId]).catch(() => {});
        return { ok: true, remaining: dec.count, name: c.name, emoji: c.emoji, applied: `${def.name} cooldown reset — ready to redeem now` };
    }

    // Pet treats feed a pet — the EQUIPPED one by default, or a specific `targetPetId` (e.g. fed from the
    // farm). Validate a pet is chosen BEFORE spending so a treat is never wasted. (The caller is responsible
    // for verifying the target pet is owned.)
    if (e.type === "pet_xp" || e.type === "pet_level") {
        let petId = targetPetId || null;
        if (!petId) {
            const buyer = await db.queryOne(`SELECT featured_collectible FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
            petId = buyer?.featured_collectible;
        }
        if (!petId) return { ok: false, error: "no_pet_equipped" };
        const petName = collectibleById(petId)?.name || "your pet";
        // Checked BEFORE the treat is spent. A pet at Lv5 cannot gain anything, and this consumed the item
        // first and asked afterwards — so feeding a maxed pet quietly destroyed a treat for nothing.
        const { petLevelInfo } = await import("@/lib/marketplace/pet-level.js");
        const lvlRow = await db.queryOne(`SELECT xp FROM mkt_pet_level WHERE buyer_id = $1 AND pet_id = $2`, [buyerId, petId]).catch(() => null);
        if (petLevelInfo(Number(lvlRow?.xp) || 0, collectibleById(petId)?.rarity).maxed) {
            return { ok: false, error: "pet_maxed", message: `${petName} is already at max level.` };
        }
        const dec = await db.queryOne(`UPDATE mkt_user_consumable SET count = count - 1 WHERE buyer_id = $1 AND consumable_id = $2 AND count > 0 RETURNING count`, [buyerId, id]).catch(() => null);
        if (!dec) return { ok: false, error: "none_owned" };
        let res;
        if (e.type === "pet_level") {
            res = await levelUpPet(buyerId, petId).catch(() => ({ ok: false }));
        } else {
            res = await addPetXp(buyerId, petId, e.amount).catch(() => ({ ok: false }));
            // ── AND EVERY OTHER PET THAT EARNS FOR YOU ───────────────────────────────────────────────
            // Luke: "if I feed my active pet it should also give that exp to the stand pets." THIS is the
            // path a member feeding their OWN pet takes — farm.js only handles feeding somebody ELSE'S —
            // so patching that one alone would have fixed the rarer case and left the one he described.
            //
            // Pays the fed pet AND the rest rather than only firing when the featured pet is fed: an
            // asymmetry there would quietly make "always feed the equipped one" the correct play, and a
            // hidden optimal way to use an item is worse than either rule on its own.
            //
            // A LEVEL treat is deliberately NOT shared — `pet_level` grants a whole level outright, and four
            // levels from one item is a different item. This shares XP treats, which is what was asked for.
            const { earningPetIds } = await import("@/lib/marketplace/pet-level.js");
            const others = (await earningPetIds(buyerId).catch(() => [])).filter((x) => x !== petId);
            for (const other of others) await addPetXp(buyerId, other, e.amount).catch(() => {});
        }
        await trackActivity(buyerId, "use_consumable", { id, name: c.name, petId }).catch(() => {});
        const leveled = e.type === "pet_level" ? Boolean(res?.ok) : Boolean(res?.leveled);
        const applied = e.type === "pet_level"
            ? (res?.ok ? `${petName} leveled up to Lv ${res.level}! ⬆️` : `${petName} is already max level`)
            : `+${e.amount.toLocaleString()} pet XP to ${petName}${res?.leveled ? ` — Lv ${res.level}! ⬆️` : ""}`;
        // Structured level-up payload so the client can fire the full celebration (not a tiny text line).
        // Include the LEVEL-appropriate sprite so the reveal shows the pet you just evolved into, not the Lv1 base.
        let petLevelUp = null;
        if (leveled) {
            const art = await getPetLevelSprite(petId, res.level).catch(() => null);
            petLevelUp = { petId, petName, level: res.level, rarity: collectibleById(petId)?.rarity || "common", maxed: res.level >= 5, spriteUrl: art?.url || null, spriteFlip: Boolean(art?.flip) };
        }
        return { ok: true, remaining: dec.count, name: c.name, emoji: c.emoji, applied, petLevelUp, petXpGain: e.type === "pet_xp" ? e.amount : null };
    }

    // Sailing relics — effects land on the sailing row. Validate context BEFORE spending so a relic is never wasted.
    if (e.type?.startsWith("sail_")) {
        await db.query(`INSERT INTO mkt_sailing (buyer_id) VALUES ($1) ON CONFLICT (buyer_id) DO NOTHING`, [buyerId]).catch(() => {});
        const s = await db.queryOne(`SELECT returns_at, dig_state, raid_count, (raid_day = (NOW() AT TIME ZONE 'America/Chicago')::date) AS raid_today FROM mkt_sailing WHERE buyer_id = $1`, [buyerId]).catch(() => null);
        if (e.type === "sail_raid" && !(s?.raid_today && (s?.raid_count || 0) > 0)) return { ok: false, error: "no_raid_used" };
        const midVoyage = s?.returns_at && !s?.dig_state && new Date(s.returns_at).getTime() > Date.now();
        if (e.type === "sail_storm" && !midVoyage) return { ok: false, error: "not_sailing" };
        if (e.type === "sail_tailwind" && !midVoyage) return { ok: false, error: "not_sailing" };
        const dec = await db.queryOne(`UPDATE mkt_user_consumable SET count = count - 1 WHERE buyer_id = $1 AND consumable_id = $2 AND count > 0 RETURNING count`, [buyerId, id]).catch(() => null);
        if (!dec) return { ok: false, error: "none_owned" };
        let applied = "";
        if (e.type === "sail_raid") { await db.query(`UPDATE mkt_sailing SET raid_count = GREATEST(0, raid_count - 1) WHERE buyer_id = $1`, [buyerId]).catch(() => {}); applied = "One daily raid restored — go raiding!"; }
        else if (e.type === "sail_merchant") {
            // Dynamic import: sailing.js imports THIS module for grantConsumable, so a static one is a cycle.
            const { applyTreasureMap } = await import("@/lib/marketplace/sailing.js");
            applied = await applyTreasureMap(buyerId).catch(() => "Your next landing will meet the Gold Merchant.");
        }
        else if (e.type === "sail_lure") {
            // BANKS, rather than overwrites. As a boolean this threw away every charge after the first, which
            // is why nobody spent them — see mig400. The sentence says the stack so a second use is visibly
            // worth something.
            const r = await db.queryOne(`UPDATE mkt_sailing SET dig_lure = COALESCE(dig_lure, 0) + 1 WHERE buyer_id = $1 RETURNING dig_lure`, [buyerId]).catch(() => null);
            const n = Number(r?.dig_lure) || 1;
            applied = n > 1 ? `Charmed — ${n} digs banked, each worth +50% fragments.` : "Your next dig will turn up +50% fragments.";
        }
        else if (e.type === "sail_storm") { await db.query(`UPDATE mkt_sailing SET returns_at = NOW() + (returns_at - NOW()) / 2 WHERE buyer_id = $1 AND returns_at > NOW()`, [buyerId]).catch(() => {}); applied = "The storm hurls you homeward — sail time halved!"; }
        else if (e.type === "sail_tailwind") { const h = Math.max(1, Number(e.hours) || 2); await db.query(`UPDATE mkt_sailing SET returns_at = GREATEST(NOW(), returns_at - ($2 || ' hours')::interval) WHERE buyer_id = $1 AND dig_state IS NULL AND returns_at > NOW()`, [buyerId, String(h)]).catch(() => {}); applied = `A strong gust fills your sails — ${h} hours shaved off the voyage!`; }
        else if (e.type === "sail_encounter") { await db.query(`UPDATE mkt_sailing SET force_encounter = TRUE WHERE buyer_id = $1`, [buyerId]).catch(() => {}); applied = "Something stirs the deep — your next voyage brings an encounter."; }
        await trackActivity(buyerId, "use_consumable", { id, name: c.name }).catch(() => {});
        return { ok: true, remaining: dec.count, name: c.name, emoji: c.emoji, applied };
    }

    // Non-combat ACTIVITY consumables (farming / petting / liking). All self-use, no target picker — Growth
    // Tonic auto-picks your slowest crop; the rest grant supplies or extra daily charges. Validate context
    // (only Growth Tonic needs a growing crop) BEFORE spending so an item is never wasted.
    if (e.type?.startsWith("farm_")) {
        if (e.type === "farm_grow") {
            const growing = await db.queryOne(`SELECT 1 AS ok FROM mkt_farm_plot WHERE buyer_id = $1 AND ready_at > NOW() LIMIT 1`, [buyerId]).catch(() => null);
            if (!growing) return { ok: false, error: "no_growing_crop" };
        }
        const decF = await db.queryOne(`UPDATE mkt_user_consumable SET count = count - 1 WHERE buyer_id = $1 AND consumable_id = $2 AND count > 0 RETURNING count`, [buyerId, id]).catch(() => null);
        if (!decF) return { ok: false, error: "none_owned" };
        let appliedF = "";
        if (e.type === "farm_grow") {
            const pct = Math.round((e.cut ?? 0.6) * 100);
            const res = await applyGrowthTonic(buyerId, e.cut ?? 0.6).catch(() => null);
            appliedF = res ? `${res.emoji} ${res.name} surges ahead — ${pct}% of its grow time gone!` : "Crop growth sped up!";
        } else if (e.type === "farm_seed") {
            const res = await grantSeedBundle(buyerId, e.count ?? 3, e.weights).catch(() => null);
            const list = res?.got?.map((g) => `${g.emoji} ${g.name}${g.count > 1 ? ` ×${g.count}` : ""}`).join(", ");
            appliedF = list ? `Seeds added: ${list}` : `+${e.count ?? 3} seeds added to your bag`;
        } else if (e.type === "farm_fertilizer") {
            const res = await grantFarmFertilizer(buyerId, e.count ?? 5).catch(() => null);
            appliedF = `+${res?.count ?? e.count ?? 5} fertilizer added to your stock 📦`;
        } else if (e.type === "farm_harvest_luck") {
            const res = await grantHarvestLuckCharges(buyerId, e.charges ?? 5).catch(() => null);
            appliedF = `🍀 Your next ${res?.count ?? e.charges ?? 5} harvests will roll for better loot`;
        } else if (e.type === "farm_petting") {
            const res = await grantExtraPettings(buyerId, e.amount ?? 2).catch(() => null);
            appliedF = `+${res?.count ?? e.amount ?? 2} extra pettings today 🐾`;
        } else if (e.type === "farm_rating") {
            const res = await grantExtraRatings(buyerId, e.amount ?? 2).catch(() => null);
            appliedF = `+${res?.count ?? e.amount ?? 2} extra farm ratings today 💝`;
        }
        await trackActivity(buyerId, "use_consumable", { id, name: c.name }).catch(() => {});
        return { ok: true, remaining: decF.count, name: c.name, emoji: c.emoji, applied: appliedF };
    }

    // ── A POTION THAT CANNOT DO ANYTHING IS NOT SPENT ────────────────────────────────────────────────────
    // Alyssa: "I got 2 adrenaline vials from the mines and used them but didn't get the extra boss strikes."
    //
    // She was right, and nothing was broken: she was already holding 11 strikes' worth against a cap of 8,
    // so both vials went in, both rows were written, and both were worth exactly zero. Her ledger for that
    // day — +5, +3, then +3, +2, +2 — is four potions drunk for three strikes. The screen even says which
    // eight count (see activeBoosts), but it says it AFTER the vial is gone, which is the wrong end.
    //
    // Same rule the pet treats above already keep, in the same words: validate BEFORE spending so it is
    // never wasted. Refused only when it would do NOTHING — a vial that can still land one of its two is
    // allowed through, because part of a potion is a choice the member can reasonably make.
    if (e.type === "strikes") {
        const held = await memberBonusStrikes(buyerId).catch(() => 0);
        if (held >= MAX_POTION_STRIKES) return { ok: false, error: "strikes_capped" };
    }
    // Same rule, same reason: a Second Descent used on a day you have not been down is a rare item destroyed
    // for nothing. Asked BEFORE it is spent, which is the end Alyssa's vials were asked at the wrong one of.
    if (e.type === "delve_reset") {
        const { delvesUsedToday } = await import("@/lib/marketplace/delves.js");
        if (!(await delvesUsedToday(buyerId).catch(() => 0))) return { ok: false, error: "no_delves_used" };
    }
    const dec = await db.queryOne(`UPDATE mkt_user_consumable SET count = count - 1 WHERE buyer_id = $1 AND consumable_id = $2 AND count > 0 RETURNING count`, [buyerId, id]).catch(() => null);
    if (!dec) return { ok: false, error: "none_owned" };
    let applied = "";
    if (e.type === "spin_token") {
        await db.query(`UPDATE mkt_buyer SET spin_tokens = spin_tokens + $2 WHERE id = $1`, [buyerId, e.amount]).catch(() => {});
        applied = `+${e.amount} wheel spin${e.amount > 1 ? "s" : ""}`;
    } else if (e.type === "spin_reset") {
        await db.query(`UPDATE mkt_buyer SET free_spin_day = NULL WHERE id = $1`, [buyerId]).catch(() => {});
        applied = "free daily spin refreshed — spin again!";
    } else if (e.type === "delve_reset") {
        // Through the delve module rather than an UPDATE written here. The stamp lives in runs_json and the
        // rule for what counts as "today" is Chicago-midnight arithmetic that delves.js already owns — a
        // second copy of it here would be right until one of them moved.
        const { resetDailyDelves } = await import("@/lib/marketplace/delves.js");
        const n = await resetDailyDelves(buyerId).catch(() => 0);
        applied = n === 1
            ? "The way down opens again — that dungeon is walkable."
            : `The way down opens again — all ${n} dungeons are walkable.`;
    } else if (e.type === "xp") {
        // gold: 0 — XP ONLY. awardXp defaults gold to track XP 1:1, so an XP scroll paid GOLD back on top of
        // the XP, and with the town/market/hangout multipliers it paid back more than the scroll cost:
        //
        //     Ancient Codex — costs 5,000 gold, grants 2,000 XP, refunded ~8,000 gold. Net +3,000 a use.
        //     Tome of Wisdom — costs 1,500, grants 500 XP, refunded ~2,000. Net +500 a use.
        //
        // Both were an unbounded money printer at roughly one use per second. One member reached 9.5M XP and
        // 3.5M gold this way — 270x the next player — which is not a clever exploit so much as us paying people
        // to press a button.
        //
        // This is exactly the case the `gold` parameter already exists for: trades pass gold: 0 "so we don't
        // hand out spendable currency for a payout we already paid the customer for". A scroll is the same
        // shape — they PAID gold for it; handing gold back is refunding the purchase and then some.
        //
        // flat: true — and NOT for the same reason as gold: 0. A scroll is bought at a FIXED gold price for a
        // FIXED amount of XP, but the XP used to ride Happy Hour while the price did not, which made the shop a
        // gold→XP arbitrage that paid four times as much for the same coin. On 2026-08-08 one member spent his
        // whole week's gold — 27,500 — on nine scrolls inside a 4x window, bought and used back-to-back over
        // thirteen minutes, and took 48,048 XP out of it against the ~12,000 the same gold buys normally. There
        // is no cap or cooldown on buying them, so the only limit was his balance. The scroll IS the reward; it
        // should not compound with a buff that exists to reward playing.
        await awardXp(buyerId, "consumable", { points: e.amount, gold: 0, flat: true, meta: { consumable: id } }).catch(() => {});
        applied = `+${e.amount.toLocaleString()} XP`;
    } else if (e.type === "strikes") {
        // Expire at the next STORE-LOCAL (America/Chicago) midnight — the same boundary the boss swing counter
        // resets on. Using UTC midnight let an evening-bought potion stay active past the Chicago-day rollover,
        // so its bonus strikes counted toward TWO days ("+N today" applied twice). Align them so it's one day.
        await db.query(
            `INSERT INTO mkt_user_boost (buyer_id, kind, magnitude, expires_at)
             VALUES ($1, 'strikes', $2, (date_trunc('day', NOW() AT TIME ZONE 'America/Chicago') + interval '1 day') AT TIME ZONE 'America/Chicago')`,
            [buyerId, e.amount]
        ).catch(() => {});
        applied = `+${e.amount} manual daily strikes today`;
    } else if (e.type === "damage") {
        // ── A SECOND BOTTLE BUYS TIME, NOT A BIGGER NUMBER ───────────────────────────────────────────────
        // Every use used to INSERT its own row, and memberDamageMult takes the STRONGEST of them — so a
        // second bottle of the same strength did nothing whatsoever. That made "use all" a shredder: the
        // shelf offers it (damage is in BULK_USABLE, cap 25) and Nicholas pressed it, spending twenty-five
        // bottles for the effect of one. His words: "It took 25 bottles of my double daily strike for 24
        // hours when I hit use one... just about over it with this."
        //
        // Luke: "I'm not sure what it's supposed to do when you stack them, but I would think it would just
        // extend the duration." So it does. Same strength extends the clock; a DIFFERENT strength still gets
        // its own row, because those are genuinely different effects and the strongest should still win
        // rather than a x3 being diluted into a x2's timer.
        const ext = await db.queryOne(
            `UPDATE mkt_user_boost
                SET expires_at = expires_at + ($3 || ' hours')::interval
              WHERE ctid = (SELECT ctid FROM mkt_user_boost
                             WHERE buyer_id = $1 AND kind = 'damage' AND magnitude = $2 AND expires_at > NOW()
                             ORDER BY expires_at DESC LIMIT 1)
              RETURNING expires_at`,
            [buyerId, e.mult, String(e.hours)],
        ).catch(() => null);
        if (!ext) {
            await db.query(`INSERT INTO mkt_user_boost (buyer_id, kind, magnitude, expires_at) VALUES ($1, 'damage', $2, NOW() + ($3 || ' hours')::interval)`, [buyerId, e.mult, String(e.hours)]).catch(() => {});
        }
        applied = ext
            ? `${e.mult}× boss damage extended by ${e.hours}h`
            : `${e.mult}× boss damage for ${e.hours}h`;
    }
    // Every other branch above tracks its use; this one never did, so spin tokens, XP scrolls, strike potions
    // and damage potions were all invisible to telemetry. That's how 1,213 XP-scroll uses in 90 minutes left no
    // trace on the admin screens — the only record was the coin ledger, and you had to already suspect
    // something to go looking there. An action that moves currency should always be visible as an action.
    await trackActivity(buyerId, "use_consumable", { id, name: c.name }).catch(() => {});
    return { ok: true, remaining: dec.count, name: c.name, emoji: c.emoji, applied };
}
