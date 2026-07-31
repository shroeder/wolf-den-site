import "server-only";

import { db } from "@/lib/db";
import { awardXp } from "@/lib/marketplace/xp.js";
import { logCoin } from "@/lib/marketplace/coins.js";
import { addChests } from "@/lib/marketplace/chests.js";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { grantEventBadge } from "@/lib/marketplace/badges.js";

// ── FISHING ──────────────────────────────────────────────────────────────────────────────────────────────────
// A voyage is four hours of nothing happening. That dead time is where fishing lives: while the boat is at sea
// (or docked at the island before you dig), you can drop a line over the rail.
//
// The loop is three beats and takes about fifteen seconds:
//   CAST   you pick a spot; the server rolls what's down there and how long it takes to notice your bait.
//   BITE   the line twitches at a moment you can't predict. Tap.
//   REEL   a tension band sweeps; keep the line in the green. How well you reel decides how BIG the fish is.
//
// Two design rules, both from things that went wrong elsewhere in the game:
//
//   1. NOTHING IS PUNISHED. A sloppy reel lands a smaller fish, never nothing. Miss the bite entirely and the
//      fish "steals your bait" — and the cast is REFUNDED, because losing a limited daily resource to a
//      half-second reaction window is the exact kind of forced-timing pressure this game deliberately avoids.
//   2. THE PRIZE IS THE LOG, NOT THE GOLD. Payouts here are small on purpose (a good catch is worth less than a
//      single raid duel). What you're actually playing for is a filled-in Fishing Log, a personal best for every
//      species, and your name on the Den's record board. That scales forever without inflating the economy.
//
// The fish is rolled SERVER-side at cast time and parked in `fish_state`, so the client cannot reroll for a
// rarer one, and the landing is guarded by an atomic clear of that column so a resubmit can't double-pay.

// ── THE SPECIES ──────────────────────────────────────────────────────────────────────────────────────────────
// odds     percentage chance of being what bites — the whole table sums to 100
// lb       [min, max] weight in pounds; personal bests and the record board are measured here
// gold/xp  paid at the TOP of the weight range and scaled down by how heavy yours actually was
//
// `odds` is the ONLY thing deciding what bites. No voyage gates, no weather gates, no unlock ladder — the sea
// is the same for a first-day member and a hundred-voyage veteran, and rarity is expressed purely as odds.
// That was a deliberate reversal: gating meant most of the roster was invisible for weeks (and, when the gate
// was weather, invisible forever for anyone who declined a location prompt).
//
// `lb` is the weight range in pounds. Fishing records are kept by weight everywhere in the real world, and the
// catch screen compares yours against the species best, so weight is the unit the whole feature speaks.
const F = (id, name, emoji, rarity, odds, lb, gold, xp) => ({ id, name, emoji, rarity, odds, lb, gold, xp });

// PAYOUT TUNING, and the story behind these numbers so nobody re-derives them from scratch:
//
// The first pass paid 150-300 gold a day. That got cut by 75% on the belief that fishing had handed out a
// 2,000-gold catch — but the ledger showed the catches themselves paid 4 and 27 gold. The jackpot was two
// one-time BADGES (fish_first + fish_record_holder, 120 each) firing on the very first cast. The cut was made
// on a false premise and left a full day of fishing worth 30-58 gold, under half of one daily quest.
//
// These sit at roughly HALF the original: a day lands around 60-120 gold, a mythic near 300. Still well under
// a daily quest at 110-140, so it can't be farmed as an income source, but a legendary is worth landing and a
// mythic — which shows up about twice a month — actually feels like an event.
// Odds are literal percentages of a catch and sum to 100, so the table can be read straight down without doing
// any arithmetic: a Sardine is 14 casts in 100, a Leviathan Fry is 1 in 500.
export const FISH = [
    // ── COMMON · 62% of catches ──
    F("fish_sardine", "Sardine", "🐟", "common", 14.0, [0.1, 0.8], 4, 4),
    F("fish_perch", "Silver Perch", "🐟", "common", 13.0, [0.4, 3.0], 4, 4),
    F("fish_mackerel", "Mackerel", "🐟", "common", 12.0, [0.8, 6.0], 6, 6),
    F("fish_crab", "Rock Crab", "🦀", "common", 11.5, [0.5, 4.0], 6, 6),
    F("fish_squid", "Bay Squid", "🦑", "common", 11.5, [1.0, 9.0], 8, 6),

    // ── RARE · 28% ──
    F("fish_snapper", "Ruby Snapper", "🐠", "rare", 6.0, [2.0, 16.0], 14, 10),
    F("fish_shrimp", "Tiger Prawn", "🦐", "rare", 5.5, [0.2, 1.5], 12, 8),
    F("fish_pufferfish", "Pufferfish", "🐡", "rare", 5.0, [1.0, 7.0], 16, 10),
    F("fish_lobster", "Blue Lobster", "🦞", "rare", 4.5, [1.5, 12.0], 20, 14),
    F("fish_octopus", "Reef Octopus", "🐙", "rare", 4.0, [3.0, 34.0], 18, 12),
    F("fish_moonfish", "Moonfish", "🌙", "rare", 3.0, [2.0, 24.0], 20, 14),

    // ── EPIC · 8% ──
    F("fish_swordfish", "Swordfish", "🗡️", "epic", 2.0, [45, 700], 40, 26),
    F("fish_tuna", "Bluefin Tuna", "🐟", "epic", 2.0, [60, 900], 36, 24),
    F("fish_manta", "Manta Ray", "🪁", "epic", 1.6, [150, 2400], 46, 30),
    F("fish_stormpike", "Storm Pike", "⚡", "epic", 1.4, [6, 48], 48, 32),
    F("fish_anglerfish", "Anglerfish", "🏮", "epic", 1.0, [2, 18], 44, 28),

    // ── LEGENDARY · 1.6% ──
    F("fish_shark", "Great White", "🦈", "legendary", 0.5, [400, 2800], 96, 66),
    F("fish_dolphin", "Ghost Dolphin", "🐬", "legendary", 0.45, [180, 700], 88, 60),
    F("fish_marlin", "Black Marlin", "🐟", "legendary", 0.4, [220, 1600], 104, 72),
    F("fish_coelacanth", "Coelacanth", "🦴", "legendary", 0.25, [60, 240], 120, 84),

    // ── MYTHIC · 0.4% — four of these exist in the whole ocean ──
    F("fish_whale", "Sunlit Whale", "🐋", "mythic", 0.15, [4000, 40000], 210, 156),
    F("fish_kraken", "Kraken Spawn", "🦑", "mythic", 0.1, [300, 4200], 240, 180),
    F("fish_leviathan", "Leviathan Fry", "🐉", "mythic", 0.1, [500, 6000], 280, 204),
    F("fish_starfish", "Fallen Star", "⭐", "mythic", 0.05, [0.5, 9.0], 300, 228),
];

const BY_ID = new Map(FISH.map((f) => [f.id, f]));
export const fishById = (id) => BY_ID.get(id) || null;
export const FISH_COUNT = FISH.length;

const RARITY_ORDER = ["common", "rare", "epic", "legendary", "mythic"];
const RARITY_RANK = Object.fromEntries(RARITY_ORDER.map((r, i) => [r, i]));

// ── TUNING ───────────────────────────────────────────────────────────────────────────────────────────────────
const CASTS_PER_DAY = 10;            // the daily allowance
const CASTS_PER_ANGLING = 4;         // +1 cast per this many Angling points (sea affinity)
const CASTS_MAX = 18;                // hard ceiling however much Angling you stack
const BITE_MIN_MS = 900;             // the line twitches somewhere in this window — unpredictable on purpose
const BITE_MAX_MS = 4200;
const BITE_GRACE_MS = 12000;         // after which the fish has clearly gone (the cast is refunded)
// Rarity weighting: a plain cast is mostly commons. Angling tilts it, and so does a LURE consumable if we ever
// add one. Multiplicative on the weight of anything above common.
const RARE_TILT_PER_ANGLING = 0.035; // +3.5% weight to non-common fish per Angling point
const RARE_TILT_CAP = 0.9;
// (The old SIZE_FROM_QUALITY / SIZE_FROM_ROLL blend lived here. It made size a foregone conclusion — see
// weightFor, where the reel now shapes the distribution instead of averaging into the answer.)
// ── THE HAUL ─────────────────────────────────────────────────────────────────────────────────────────────────
// Every cast rolls ONE bonus alongside the fish (or nothing, which is still the most common outcome). Rolled as
// a single weighted table rather than a stack of independent chances, so the odds are legible and a cast can't
// accidentally pay out four things at once.
//
// Rarer fish shift the table toward the good end — a mythic on the line is the moment to hand out something
// memorable — but even a Sardine can drop a seed or a fragment, so an ordinary cast is never truly empty.
//
// Balance: ~45% of casts on a common fish return a bonus, almost always a seed or fragments. Gear and chests
// sit deliberately below the rates the Forge and dig already pay, because fishing is 10 casts a day on top of
// everything else — it should feed those loops, never replace them.
// 80% of casts bring up a FISH. The other 20% bring up TREASURE INSTEAD — you pulled something off the sea
// floor rather than out of it. Not both: a cast is one or the other, so "what's on the line?" always has a
// real answer and hauling up a chest is its own moment rather than a footnote under a Sardine.
export const TREASURE_CHANCE = 0.20;

// What the treasure is, when it isn't a fish. Percentages of that 20%.
const TREASURE = { fragment: 38, seed: 30, consumable: 20, gear: 8, chest: 3.6, pet: 0.4 };

// Landing a rare FISH still sweetens things — but as a bonus on top, and only for the genuinely rare ones, so
// a mythic is never a bare fish with no story attached.
const FISH_BONUS = {
    common: { nothing: 100 },
    rare: { nothing: 100 },
    epic: { nothing: 72, fragment: 20, consumable: 8 },
    legendary: { nothing: 40, fragment: 28, consumable: 18, gear: 10, chest: 4 },
    mythic: { nothing: 0, fragment: 22, consumable: 24, gear: 30, chest: 20, pet: 4 },
};
// How many fragments a fragment-drop is worth, by fish rarity.
const FRAGMENT_COUNT = { common: 1, rare: 1, epic: 2, legendary: 3, mythic: 5 };
// Which chest a chest-drop gives. Wooden is the floor so a common's rare chest hit isn't better than a raid's.
const CHEST_TIER = { common: "wooden", rare: "wooden", epic: "iron", legendary: "iron", mythic: "gold" };
// Consumables fishing can hand out: sailing relics, farm supplies and pet treats. Deliberately NOT the combat
// potions — fishing shouldn't be a route to boss damage, and every one of these feeds a loop fishing touches.
// Rarer fish draw from the back of this list, so a mythic hands out a Kraken Bait rather than a Pet Treat.
const FISH_CONSUMABLES = [
    "treat_bone", "farm_growth_tonic", "treat_snack", "farm_harvest_charm",
    "sail_lucky_lure", "sail_war_drum", "sail_treasure_map", "sail_storm_bottle", "sail_kraken_bait",
];
// How far up that list a rarity can reach (index cap), so the good relics stay attached to the good fish.
const CONSUMABLE_REACH = { common: 2, rare: 4, epic: 6, legendary: 8, mythic: 9 };

// One weighted pick off any of the tables above.
function pickWeighted(table) {
    const entries = Object.entries(table || {});
    const total = entries.reduce((a, [, w]) => a + w, 0);
    if (!total) return "nothing";
    let r = Math.random() * total;
    for (const [kind, w] of entries) { r -= w; if (r <= 0) return kind; }
    return "nothing";
}
const rollTreasure = () => pickWeighted(TREASURE);
const rollFishBonus = (rarity) => pickWeighted(FISH_BONUS[rarity] || FISH_BONUS.common);

// Grant one haul entry and describe it for the client. Best-effort throughout: failing to hand over a bonus
// must never cost the member the thing they just landed. `tier` scales the reward and is the fish's rarity for
// a bonus, or the treasure's own rolled tier when the cast came up treasure instead of a fish.
async function grantHaul(buyerId, kind, tier = "common") {
    if (!kind || kind === "nothing") return null;
    if (kind === "fragment") {
        const n = FRAGMENT_COUNT[tier] || 1;
        const { grantFragment } = await import("@/lib/marketplace/sailing.js");
        await grantFragment(buyerId, n).catch(() => {});
        // "Chest Fragment", NOT the "Hull Shard" this used to invent. Sailing has called these chest fragments
        // since day one — they're pieces you forge into a treasure chest — and inventing a third name for the
        // same object left people asking what a Hull Shard even was. It also collided with the Forge's salvage
        // tiers (Cinder Scrap … Emberheart Shard), which are a completely unrelated currency.
        return { kind: "fragment", label: n > 1 ? `${n} Chest Fragments` : "Chest Fragment", emoji: "🔷", n };
    }
    if (kind === "seed") {
        const { dropSeedFrom } = await import("@/lib/marketplace/farm-crops.js");
        const seed = await dropSeedFrom(buyerId, "fishing").catch(() => null);
        return seed ? { kind: "seed", label: seed.name || "Seed", emoji: seed.emoji || "🌱", id: seed.id || null, spriteUrl: await haulSprite("seed", seed.id) } : null;
    }
    if (kind === "consumable") {
        const pool = FISH_CONSUMABLES.slice(0, (CONSUMABLE_REACH[tier] ?? 2) + 1);
        const id = pool[randInt(pool.length)];
        const { grantConsumable, CONSUMABLES } = await import("@/lib/marketplace/consumables.js");
        await grantConsumable(buyerId, id, 1).catch(() => {});
        const def = CONSUMABLES?.[id];
        return { kind: "consumable", label: def?.name || "Supply", emoji: def?.emoji || "🧪", id, spriteUrl: await haulSprite("consumable", id) };
    }
    if (kind === "gear") {
        const item = await grantFishingGear(buyerId, tier).catch(() => null);
        return item ? { kind: "gear", label: item.name, emoji: "⚔️", id: item.id, rarity: item.rarity, spriteUrl: await haulSprite("gear", item.id) } : null;
    }
    if (kind === "chest") {
        const chest = CHEST_TIER[tier] || "wooden";
        await addChests(buyerId, { [chest]: 1 }, { source: "fishing" }).catch(() => {});
        return { kind: "chest", label: `${chest[0].toUpperCase()}${chest.slice(1)} Chest`, emoji: "🧰", tier: chest, spriteUrl: await haulSprite("chest", null, chest) };
    }
    if (kind === "pet") {
        const { maybeGrantFishingPet } = await import("@/lib/marketplace/pet-drops.js");
        const pet = await maybeGrantFishingPet(buyerId, tier).catch(() => null);
        return pet ? { kind: "pet", label: pet.name, emoji: "🐾", id: pet.id, rarity: pet.rarity, spriteUrl: await haulSprite("pet", pet.id) } : null;
    }
    return null;
}

// How good a treasure haul is. Rolled independently of the fish table so pulling up a chest doesn't need a
// mythic on the line — but weighted so most of what the sea gives up is ordinary.
const TREASURE_TIER = { common: 62, rare: 26, epic: 9, legendary: 2.6, mythic: 0.4 };

// ── HELPERS ──────────────────────────────────────────────────────────────────────────────────────────────────
const clamp01 = (n) => Math.max(0, Math.min(1, Number(n) || 0));
const round1 = (n) => Math.round(n * 10) / 10;
const randInt = (n) => Math.floor(Math.random() * n);

// A random piece of gear the member doesn't already own, at a rarity the fish deserves. Mirrors how chests
// pick: never hand out a duplicate, and fall back down the rarity ladder rather than giving nothing.
// Fish rarity → the gear rarities it can pull, best first. Ascendant/eternal are never in reach: those are the
// Forge's and the raid's to give, and fishing should feed those loops rather than short-circuit them.
const GEAR_RARITY = {
    common: ["common"], rare: ["rare", "common"], epic: ["epic", "rare"],
    legendary: ["legendary", "epic"], mythic: ["mythic", "legendary"],
};
async function grantFishingGear(buyerId, fishRarity) {
    const [{ randomDropPool }, { grantItem }] = await Promise.all([
        import("@/lib/marketplace/items.js"),
        import("@/lib/marketplace/inventory.js"),
    ]);
    const owned = new Set((await db.query(`SELECT item_id FROM mkt_user_item WHERE buyer_id = $1`, [buyerId]).catch(() => [])).map((r) => r.item_id));
    for (const rarity of GEAR_RARITY[fishRarity] || ["common"]) {
        const pool = randomDropPool((i) => i.rarity === rarity && !owned.has(i.id));
        if (!pool.length) continue;
        const item = pool[randInt(pool.length)];
        await grantItem(buyerId, item.id, "fishing").catch(() => {});
        return { id: item.id, name: item.name, rarity: item.rarity };
    }
    return null;
}

// ── THE RAIL: FISHING UPGRADES ───────────────────────────────────────────────────────────────────────────────
// Bought with gold at the Rail, on the same cost curve as the boat and excavation tracks. Fishing previously
// had no progression at all — Angling came only from gear and badges, so there was nothing to work toward.
//
// Each track buys a different KIND of fishing rather than just "more of it", so they don't collapse into one
// obvious purchase order:
//
//   line  more casts        — the plainest and most wanted, so it's the most expensive per point of value
//   lure  rarer species     — stacks with Angling's tilt, and it's the one that fills the log
//   net   more treasure     — turns fishing toward loot instead of collection
//   gaff  a better floor    — takes the sting out of a fumbled reel without touching the ceiling
//
// Deliberately capped modestly: a fully-invested angler gets 15 casts a day rather than 10, not 40, because
// casts are the input to every other reward in the feature.
export const FISH_TRACKS = {
    line: { max: 5, per: 1, cap: 5, kind: "count", name: "Line", icon: "🎣", desc: "Extra casts each day." },
    lure: { max: 5, per: 0.05, cap: 0.25, kind: "pct", name: "Lure", icon: "✨", desc: "Better odds of a rarer species." },
    net: { max: 5, per: 0.02, cap: 0.10, kind: "pct", name: "Net", icon: "🪣", desc: "More casts bring up treasure instead of a fish." },
    gaff: { max: 5, per: 0.05, cap: 0.25, kind: "pct", name: "Gaff", icon: "🪝", desc: "A clean landing floors the size on a poor reel." },
};
export const FISH_TRACK_COL = {
    line: "fish_line_level", lure: "fish_lure_level", net: "fish_net_level", gaff: "fish_gaff_level",
};
export const fishTrackValue = (t, lvl) => Math.min(FISH_TRACKS[t].cap, Math.max(0, Number(lvl) || 0) * FISH_TRACKS[t].per);
// Pull every track's level off the sailing row in one go.
export function fishTrackLevels(row) {
    const out = {};
    for (const t of Object.keys(FISH_TRACKS)) out[t] = Number(row?.[FISH_TRACK_COL[t]]) || 0;
    return out;
}

// Angling points → the two things they buy.
export function anglingEffects(angling = 0) {
    const pts = Math.max(0, Number(angling) || 0);
    return {
        bonusCasts: Math.floor(pts / CASTS_PER_ANGLING),
        rareTilt: Math.min(RARE_TILT_CAP, pts * RARE_TILT_PER_ANGLING),
    };
}

export const castsPerDay = (angling = 0, lineLevel = 0) =>
    Math.min(CASTS_MAX, CASTS_PER_DAY + anglingEffects(angling).bonusCasts + fishTrackValue("line", lineLevel));

// ── BUYING MORE CASTS ────────────────────────────────────────────────────────────────────────────────────────
// Once the day's allowance is spent you can buy another cast with gold. The price DOUBLES each time within the
// day (1,000 → 2,000 → 4,000 …), which is what keeps this from being a way to farm the treasure table flat:
// the first is an easy yes, the fourth is a real decision, and a big balance buys sharply less than it looks.
// Resets with the daily allowance, off the same fish_day, so "today" has exactly one definition.
export const RECHARGE_BASE = 1000;
export const RECHARGE_MAX_PER_DAY = 6; // 1k+2k+4k+8k+16k+32k = 63,000 gold to max out a day
export const rechargeCost = (bought = 0) => RECHARGE_BASE * (2 ** Math.max(0, bought));
const rechargesToday = (row) => (row?.fish_is_today ? Number(row.fish_recharges) || 0 : 0);

// Total casts available today = the earned allowance plus anything bought.
const castsAvailable = (row, angling, lineLevel) => castsPerDay(angling, lineLevel) + rechargesToday(row);

// ── THE ROLL ─────────────────────────────────────────────────────────────────────────────────────────────────
// Every species is in the water on every cast. Angling still tilts the odds toward the good stuff, because a
// stat that does nothing is worse than no stat — but it can only ever bend the curve, never unlock a species.
function rollSpecies(rareTilt = 0) {
    // `rareTilt` already includes the Lure track — see castLine.
    const weights = FISH.map((f) => f.odds * (f.rarity === "common" ? 1 : 1 + rareTilt));
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < FISH.length; i++) { r -= weights[i]; if (r <= 0) return FISH[i]; }
    return FISH[FISH.length - 1];
}

// ── HOW BIG IS IT? ───────────────────────────────────────────────────────────────────────────────────────────
// Your reel shifts the ODDS. It does not set the answer.
//
// It used to be a straight blend — 62% your reel, 38% a pre-rolled number — which made the size a foregone
// conclusion: the live meter counted up during the reel and the reveal just restated it. Nothing to find out.
//
// Reeling well then shaped the whole distribution, which was too much the other way — it made a good reel the
// main author of the size, just probabilistically instead of directly.
//
// What it does now: the size is the pre-rolled `roll` (uniform, committed at cast so it can't be rerolled) and
// nothing else. A good reel only puts a FLOOR under it — a perfect reel guarantees you won't land in the
// bottom third of the range, and does nothing whatsoever to the top end. Your ceiling is luck, always. Reeling
// well just means fewer embarrassments.
//
// It is also deliberately INVISIBLE: no live score, no percentage, no meter. You fish; you find out what you
// caught when it surfaces. Watching a number tick up was what killed the reveal in the first place.
const SIZE_CURVE = 1.6;          // big specimens stay genuinely rare
const REEL_FLOOR = 0.35;         // the most a flawless reel can lift the bottom, before the curve

// THERE IS NO MAXIMUM. `lb` is the TYPICAL range for the species, not a ceiling — and roughly one cast in
// forty pushes past the top of it, occasionally by a lot.
//
// A hard cap made the chase self-defeating: land one near the top and the honest read is "that's the biggest
// this gets, no point trying again". Every record, in fishing and in life, exists to be beaten. So the tail is
// open: the overshoot itself is rolled, most trophies clear the range by a little, and once in a great while
// something comes up that nobody has a frame of reference for.
const TROPHY_CHANCE = 0.025;     // how often a catch escapes the typical range at all
const TROPHY_MAX = 1.9;          // and the most it can multiply the range's span by
function weightFor(species, roll, quality, gaff = 0) {
    const [min, max] = species.lb;
    // Gaff widens what a good landing is worth at the bottom end — still nothing at all to the ceiling.
    const floor = clamp01(quality) * (REEL_FLOOR + fishTrackValue("gaff", gaff));
    const t = Math.max(clamp01(roll), floor);
    let scaled = Math.pow(t, SIZE_CURVE);
    // The overshoot rides on a SEPARATE roll, so it isn't just "the top of the distribution" — a trophy is its
    // own event and can surprise you off an unremarkable reel.
    if (Math.random() < TROPHY_CHANCE) {
        // Skewed hard toward small overshoots; the monsters are the tail of the tail.
        scaled = 1 + (TROPHY_MAX - 1) * Math.pow(Math.random(), 2.6);
    }
    const lb = min + (max - min) * scaled;
    return lb < 10 ? Math.round(lb * 100) / 100 : round1(lb);
}
// Where this fish sits in its species' TYPICAL range. Used internally to scale the payout and to rank the
// leaderboard — never shown as a "% of max", because a percentage of a maximum tells you you've nearly
// finished, which is the opposite of what a record board is for.
//
// Not clamped at 1 any more: a trophy that beats the typical range scores above 1.0 and outranks everything
// inside it, which is exactly right.
const percentileOf = (species, lb) => Math.max(0, Math.pow(
    Math.max(0, (Number(lb) - species.lb[0])) / Math.max(0.0001, species.lb[1] - species.lb[0]), 1 / SIZE_CURVE,
));

// ── THE LOG ──────────────────────────────────────────────────────────────────────────────────────────────────
// fish_log is `{ [speciesId]: { n, best, firstAt } }` on mkt_sailing — a JSONB map rather than a row per catch,
// because the log is read on every sailing state load and a map is one column instead of a join.
const logOf = (row) => (row && row.fish_log) || {};

async function readFishRow(buyerId) {
    return db.queryOne(
        // The four Rail track levels are load-bearing here, not decoration: castLine computes the daily cap
        // through fishTrackLevels(row), and without these columns every level reads 0. A member with Line 3
        // saw "2/13 casts left" from the view (which reads the full row) while castLine allowed only 10 and
        // refused with out_of_casts at 11. Two different answers to "how many casts do I get".
        `SELECT buyer_id, voyages_completed, fish_state, fish_log, fish_caught,
                fish_line_level, fish_lure_level, fish_net_level, fish_gaff_level,
                COALESCE(fish_casts, 0) AS fish_casts,
                COALESCE(fish_recharges, 0) AS fish_recharges,
                (fish_day = (NOW() AT TIME ZONE 'America/Chicago')::date) AS fish_is_today
           FROM mkt_sailing WHERE buyer_id = $1`,
        [buyerId]
    ).catch(() => null);
}

// Casts already spent TODAY. The day comparison happens in SQL (store-local) because building a JS Date from a
// Postgres DATE column reads today as yesterday on Vercel — that bug already broke the daily check-in once.
const castsUsed = (row) => (row?.fish_is_today ? Number(row.fish_casts) || 0 : 0);

// ── CLIENT VIEW ──────────────────────────────────────────────────────────────────────────────────────────────
// PURE function off the sailing row — no extra query, so this is free to include in every sailing state load.
// `status` is the voyage status decorate() already computed; fishing is only offered at sea or docked.
export function fishingView(row, angling = 0, status = "idle") {
    const log = logOf(row);
    const lv = fishTrackLevels(row);
    const max = castsAvailable(row, angling, lv.line);
    const used = castsUsed(row);
    const bought = rechargesToday(row);
    const hooked = row?.fish_state || null;
    const caughtIds = Object.keys(log);
    return {
        available: status === "sailing" || status === "arrived",
        casts: { used, max, left: Math.max(0, max - used), bought },
        // Offered only once the day's casts are gone — buying while you still have some would just be a worse
        // way to spend gold, and reads as a trap.
        recharge: {
            available: used >= max && bought < RECHARGE_MAX_PER_DAY,
            cost: rechargeCost(bought),
            bought,
            maxPerDay: RECHARGE_MAX_PER_DAY,
        },
        angling,
        // Something is on the line right now (survives a refresh mid-cast — you can always come back and reel).
        hooked: hooked ? { castAt: hooked.castAt, biteAt: hooked.biteAt, graceMs: BITE_GRACE_MS } : null,
        biteWindow: { minMs: BITE_MIN_MS, maxMs: BITE_MAX_MS, graceMs: BITE_GRACE_MS },
        // The Rail's upgrade tracks, priced and levelled like the boat/dig ones.
        tracks: Object.keys(FISH_TRACKS).map((t) => {
            const def = FISH_TRACKS[t], level = lv[t];
            return {
                id: t, name: def.name, icon: def.icon, desc: def.desc, kind: def.kind,
                level, max: def.max, maxed: level >= def.max, cost: 100 * (level + 1) * (level + 1),
                valueNow: fishTrackValue(t, level), valueNext: fishTrackValue(t, level + 1), cap: def.cap,
            };
        }),
        totalCaught: Number(row?.fish_caught) || 0,
        speciesKnown: caughtIds.length,
        speciesTotal: FISH_COUNT,
        // The full log, always — this is the actual reward, so it should never be a second round-trip. Every
        // species shows its real odds now: with nothing gated there's no unlock to spoil, and "1 in 500" is a
        // better hook than a vague hint about deeper water.
        log: FISH.map((f) => {
            const e = log[f.id];
            return {
                id: f.id, name: f.name, emoji: f.emoji, rarity: f.rarity,
                lb: f.lb, gold: f.gold, odds: f.odds,
                caught: Number(e?.n) || 0,
                best: e?.best ? Number(e.best) : null,
            };
        }),
    };
}

// ── CAST ─────────────────────────────────────────────────────────────────────────────────────────────────────
// Spends a cast, rolls the fish, and parks it on the line. Returns only the bite TIMING — never the species,
// because the surprise of what surfaces is most of the fun.
export async function castLine(buyerId, { status = "sailing", angling = 0 } = {}) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    if (status !== "sailing" && status !== "arrived") return { ok: false, error: "not_at_sea" };
    const row = await readFishRow(buyerId);
    if (!row) return { ok: false, error: "no_ship" };
    if (row.fish_state) return { ok: false, error: "already_cast" };
    const lv = fishTrackLevels(row);
    // castsAvailable, NOT castsPerDay — a member who has paid for an extra cast must actually get it. This is
    // the same trap that once let the view promise "2/13 left" while the mutator refused at 11.
    const max = castsAvailable(row, angling, lv.line);
    if (castsUsed(row) >= max) return { ok: false, error: "out_of_casts" };

    // Fish or treasure is decided HERE, at cast time, along with everything else that matters — the client
    // learns which it was only when it surfaces.
    const isTreasure = Math.random() < (TREASURE_CHANCE + fishTrackValue("net", lv.net));
    const species = rollSpecies(anglingEffects(angling).rareTilt + fishTrackValue("lure", lv.lure));
    const state = {
        species: species.id,
        treasure: isTreasure ? { kind: rollTreasure(), tier: pickWeighted(TREASURE_TIER) } : null,
        roll: Math.round(Math.random() * 1000) / 1000,     // the luck half of the final weight
        castAt: Date.now(),
        biteAt: Date.now() + Math.round(BITE_MIN_MS + Math.random() * (BITE_MAX_MS - BITE_MIN_MS)),
    };
    // One statement spends the cast AND puts the fish on the line, guarded on fish_state IS NULL so two taps
    // can't both cast. The day roll-over is handled inline: a stale fish_day resets the counter to 1.
    const cast = await db.queryOne(
        `UPDATE mkt_sailing
            SET fish_state = $2::jsonb,
                fish_casts = CASE WHEN fish_day = (NOW() AT TIME ZONE 'America/Chicago')::date
                                  THEN COALESCE(fish_casts, 0) + 1 ELSE 1 END,
                fish_day = (NOW() AT TIME ZONE 'America/Chicago')::date,
                updated_at = NOW()
          WHERE buyer_id = $1 AND fish_state IS NULL
          RETURNING fish_casts`,
        [buyerId, JSON.stringify(state)]
    ).catch(() => null);
    if (!cast) return { ok: false, error: "already_cast" };

    return {
        ok: true,
        // `fight` is the rarity of what's on the line — and ONLY that. The client uses it to make a monster
        // pull harder and run more often, so the fight itself telegraphs that something big is down there.
        // The species is deliberately withheld until it surfaces; that reveal is the whole payoff.
        // On a treasure cast the fight reads off the treasure's tier, so the weight in your hands never lies.
        cast: {
            castAt: state.castAt,
            biteAt: state.biteAt,
            graceMs: BITE_GRACE_MS,
            fight: state.treasure ? (state.treasure.tier || "common") : species.rarity,
        },
        castsLeft: Math.max(0, max - (Number(cast.fish_casts) || 0)),
    };
}

// ── LAND IT ──────────────────────────────────────────────────────────────────────────────────────────────────
// `quality` is the reel score the client reports (0..1), clamped here — the same trust model as the forge's
// enhance minigame and the merchant's coin game. `missed` means the bite window elapsed untapped.
export async function landFish(buyerId, { quality = 0, missed = false } = {}) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    // Atomically TAKE the fish off the line. Whoever lands this owns the catch; a resubmit finds nothing.
    //
    // It has to be a CTE rather than the obvious `UPDATE … SET fish_state = NULL … RETURNING fish_state`, because
    // RETURNING hands back the NEW row — which is the NULL we just wrote, not the fish. (Caught by running this
    // against prod before shipping: every single catch came back "nothing_on_the_line".) The SELECT … FOR UPDATE
    // reads and locks the row, the UPDATE clears it, and both happen in one statement, so it stays a race-proof
    // single claim.
    const taken = await db.queryOne(
        `WITH hooked AS (
             SELECT buyer_id, fish_state, COALESCE(fish_casts, 0) AS fish_casts, fish_log, voyages_completed, fish_gaff_level
               FROM mkt_sailing WHERE buyer_id = $1 AND fish_state IS NOT NULL FOR UPDATE
         ), cleared AS (
             UPDATE mkt_sailing s SET fish_state = NULL, updated_at = NOW()
               FROM hooked h WHERE s.buyer_id = h.buyer_id RETURNING s.buyer_id
         )
         SELECT h.fish_state, h.fish_casts, h.fish_log, h.voyages_completed FROM hooked h`,
        [buyerId]
    ).catch(() => null);
    if (!taken?.fish_state) return { ok: false, error: "nothing_on_the_line" };
    // jsonb normally arrives parsed; tolerate a string in case a driver path hands it back raw.
    const state = typeof taken.fish_state === "string" ? (JSON.parse(taken.fish_state) || {}) : taken.fish_state;
    const species = fishById(state.species) || FISH[0];

    // MISSED THE BITE. It took the bait and left — and the cast comes back, because a limited daily resource
    // should never evaporate on a reaction test.
    const elapsed = Date.now() - Number(state.biteAt || 0);
    if (missed || elapsed > BITE_GRACE_MS) {
        await db.query(
            `UPDATE mkt_sailing SET fish_casts = GREATEST(0, COALESCE(fish_casts, 0) - 1) WHERE buyer_id = $1`,
            [buyerId]
        ).catch(() => {});
        await trackActivity(buyerId, "fish_missed", { species: species.id }).catch(() => {});
        return { ok: true, landed: false, refunded: true, message: "It stole your bait and slipped away — cast refunded." };
    }

    // ── TREASURE ─────────────────────────────────────────────────────────────────────────────────────────────
    // One cast in five pulls up something off the sea floor INSTEAD of a fish. No species, no log entry, no
    // record — just the thing itself. Reeling well still matters: a clean reel upgrades the tier one step, so
    // the minigame is never irrelevant.
    if (state.treasure) {
        const q0 = clamp01(quality);
        const tierOrder = RARITY_ORDER;
        let tier = state.treasure.tier || "common";
        if (q0 >= 0.75) tier = tierOrder[Math.min(tierOrder.length - 1, tierOrder.indexOf(tier) + 1)];
        const haul = await grantHaul(buyerId, state.treasure.kind, tier).catch(() => null);
        // A haul that couldn't be granted (every gear item already owned, say) pays a fragment rather than
        // handing back an empty net.
        const prize = haul || await grantHaul(buyerId, "fragment", tier).catch(() => null);
        await trackActivity(buyerId, "fish_treasure", { kind: prize?.kind || "none", tier, quality: q0 }).catch(() => {});
        return { ok: true, landed: true, treasure: true, tier, prize, quality: q0 };
    }

    // ── THE CATCH ────────────────────────────────────────────────────────────────────────────────────────────
    const q = clamp01(quality);
    // Gaff comes off the row we just claimed, so a member who levels it mid-cast still gets the old floor.
    const gaffLvl = Number(taken.fish_gaff_level) || 0;
    const cm = weightFor(species, state.roll, q, gaffLvl);   // pounds; column renamed to lb in mig287
    const pct = percentileOf(species, cm);
    // Payout scales from 45% of the species value at the small end to full value at the top of its typical
    // range — and beyond, for a trophy that clears it, which is the one place the overshoot pays extra.
    const scale = 0.45 + 0.55 * Math.min(1.6, pct);
    const gold = Math.max(1, Math.round(species.gold * scale));
    const xp = Math.max(1, Math.round(species.xp * scale));

    const log = (taken.fish_log && typeof taken.fish_log === "object") ? taken.fish_log : {};
    const prev = log[species.id] || null;
    const firstEver = !prev;
    const personalBest = !prev || cm > Number(prev.best || 0);

    // Merge the log entry in SQL so a concurrent catch can't clobber the map.
    const entry = { n: (Number(prev?.n) || 0) + 1, best: personalBest ? cm : Number(prev.best), firstAt: prev?.firstAt || new Date().toISOString() };
    await db.query(
        `UPDATE mkt_sailing
            SET fish_log = COALESCE(fish_log, '{}'::jsonb) || jsonb_build_object($2::text, $3::jsonb),
                fish_caught = COALESCE(fish_caught, 0) + 1,
                updated_at = NOW()
          WHERE buyer_id = $1`,
        [buyerId, species.id, JSON.stringify(entry)]
    ).catch(() => {});

    // Every catch is also a row on the record board — that's the social half of the feature, and it makes the
    // "biggest in the Den" board possible without any extra bookkeeping.
    await db.query(
        `INSERT INTO mkt_fish_catch (buyer_id, species, lb, quality) VALUES ($1, $2, $3, $4)`,
        [buyerId, species.id, cm, Math.round(q * 1000) / 1000]
    ).catch(() => {});

    // awardXp pays the gold too, so Happy Hour / prosperity multipliers apply consistently with everything else.
    await awardXp(buyerId, "sail_fish", { points: xp, gold }).catch(() => {});
    await logCoin(buyerId, gold, "fishing", { meta: { species: species.id, cm, quality: q } }).catch(() => {});

    // ── THE HAUL ─────────────────────────────────────────────────────────────────────────────────────────────
    const extras = [];
    const kind = rollFishBonus(species.rarity);
    const got = await grantHaul(buyerId, kind, species.rarity).catch(() => null);
    if (got) extras.push(got);

    await trackActivity(buyerId, "fish_caught", { species: species.id, rarity: species.rarity, cm, quality: q, gold, xp, firstEver, personalBest }).catch(() => {});
    await checkFishingBadges(buyerId).catch(() => {});

    // Is this the biggest one in the whole Den? Checked after the insert, so it includes this catch.
    const denBest = await db.queryOne(
        `SELECT buyer_id, lb FROM mkt_fish_catch WHERE species = $1 ORDER BY lb DESC, caught_at ASC LIMIT 1`,
        [species.id]
    ).catch(() => null);
    const denRecord = denBest && String(denBest.buyer_id) === String(buyerId) && Number(denBest.lb) === cm;

    return {
        ok: true, landed: true,
        fish: { id: species.id, name: species.name, emoji: species.emoji, rarity: species.rarity, lb: cm, range: species.lb },
        // No percentage-of-max is sent any more — nothing displays one. `beatsRange` marks the genuine
        // freaks (heavier than the species' typical range) and denBest gives the record to beat.
        beatsRange: cm > species.lb[1],
        denBest: denBest ? Number(denBest.lb) : null,
        gold, xp, extras,
        quality: q,
        firstEver, personalBest, denRecord,
        previousBest: prev?.best ? round1(Number(prev.best)) : null,
    };
}

// ── BADGES ───────────────────────────────────────────────────────────────────────────────────────────────────
// Counted off the catch table and the log, so the numbers can't drift from what actually happened.
export async function checkFishingBadges(buyerId) {
    if (!buyerId) return;
    const num = (v) => Number(v) || 0;
    const row = await db.queryOne(
        `SELECT COALESCE(fish_caught, 0) AS n, fish_log FROM mkt_sailing WHERE buyer_id = $1`, [buyerId]
    ).catch(() => null);
    const n = num(row?.n);
    const log = (row?.fish_log && typeof row.fish_log === "object") ? row.fish_log : {};
    const known = Object.keys(log).length;

    if (n >= 1) await grantEventBadge(buyerId, "fish_first").catch(() => {});
    if (n >= 50) await grantEventBadge(buyerId, "fish_angler").catch(() => {});
    if (n >= 250) await grantEventBadge(buyerId, "fish_master").catch(() => {});
    if (known >= 10) await grantEventBadge(buyerId, "fish_naturalist").catch(() => {});
    if (known >= FISH_COUNT) await grantEventBadge(buyerId, "fish_complete").catch(() => {});
    // Landed one of the four mythics.
    const mythics = FISH.filter((f) => f.rarity === "mythic").map((f) => f.id);
    if (mythics.some((id) => log[id])) await grantEventBadge(buyerId, "fish_deepwater").catch(() => {});
    // Landed something BIGGER than its species' typical range — a genuine freak of a fish. Was "within 2% of
    // the maximum", which stopped meaning anything once the range stopped being a ceiling.
    const trophy = FISH.some((f) => { const e = log[f.id]; return e && Number(e.best) > f.lb[1]; });
    if (trophy) await grantEventBadge(buyerId, "fish_trophy").catch(() => {});
    // Holding the Den record for any species right now — but only where a record was actually CONTESTED.
    //
    // On an empty board the first person to catch anything automatically "holds its record", so this secret
    // prestige badge fired on the very first cast of the feature (a 14cm Sardine) and paid out 120 gold for
    // nothing. Every new member would have got the same freebie. The species now needs catches from at least
    // two different members before its record means anything.
    const holds = await db.queryOne(
        `WITH contested AS (
             SELECT species FROM mkt_fish_catch GROUP BY species HAVING COUNT(DISTINCT buyer_id) >= 2
         ), leaders AS (
             SELECT DISTINCT ON (c.species) c.species, c.buyer_id
               FROM mkt_fish_catch c JOIN contested x ON x.species = c.species
              ORDER BY c.species, c.lb DESC, c.caught_at ASC
         )
         SELECT 1 FROM leaders WHERE buyer_id = $1 LIMIT 1`,
        [buyerId]
    ).catch(() => null);
    if (holds) await grantEventBadge(buyerId, "fish_record_holder").catch(() => {});
}

// ── SOMEONE ELSE'S LOG ───────────────────────────────────────────────────────────────────────────────────────
// For the member inspection screen. A collection nobody else can look at is half a collection — the whole
// point of filling one in is that it can be shown off, and comparing your Marlin against theirs is the reason
// to keep casting after you've seen every species.
//
// Returns only what's been CAUGHT: an empty species list on someone else's profile would hand out the full
// roster of an unreleased feature, and it reads as a list of their failures rather than their trophies.
export async function memberFishLog(buyerId) {
    if (!buyerId) return null;
    const row = await db.queryOne(
        `SELECT fish_log, COALESCE(fish_caught, 0) AS n FROM mkt_sailing WHERE buyer_id = $1`, [buyerId],
    ).catch(() => null);
    const log = (row?.fish_log && typeof row.fish_log === "object") ? row.fish_log : {};
    const caught = FISH
        .filter((f) => log[f.id])
        .map((f) => ({
            id: f.id, name: f.name, emoji: f.emoji, rarity: f.rarity,
            caught: Number(log[f.id]?.n) || 0,
            best: log[f.id]?.best ? Number(log[f.id].best) : null,
            beatsRange: Number(log[f.id]?.best || 0) > f.lb[1],
        }))
        .sort((a, b) => RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] || (b.best || 0) - (a.best || 0));
    return { total: Number(row?.n) || 0, known: caught.length, species: FISH_COUNT, caught };
}

// ── TOP CATCHES ──────────────────────────────────────────────────────────────────────────────────────────────
// The board people actually want: the best catches in the Den, ranked against each other.
//
// Ranking on raw cm would be a whale leaderboard and nothing else — a Sunlit Whale's floor (900cm) is larger
// than a Great White's ceiling, so no other species could ever appear. Instead every catch is scored on how
// close it came to ITS OWN species maximum, which is the thing that actually took skill and luck. A 21.8cm
// Sardine at 99% of possible beats a middling whale, and the board stays winnable from the first cast.
// Rarity breaks ties, so a perfect Kraken still outranks a perfect Sardine.
export async function denTopCatches(limit = 25) {
    const rows = await db.query(
        `SELECT c.buyer_id, c.species, c.lb, c.caught_at,
                COALESCE(NULLIF(b.display_name, ''), b.alias) AS who, b.alias
           FROM mkt_fish_catch c LEFT JOIN mkt_buyer b ON b.id = c.buyer_id
          ORDER BY c.lb DESC LIMIT 600`
    ).catch(() => []);
    return (rows || [])
        .map((r) => {
            const f = fishById(r.species);
            if (!f) return null;
            return {
                species: f.id, name: f.name, emoji: f.emoji, rarity: f.rarity,
                lb: Number(r.lb), max: f.lb[1],
                pct: Math.round(percentileOf(f, Number(r.lb)) * 100),
                who: r.who || null, alias: r.alias || null, at: r.caught_at || null,
            };
        })
        .filter(Boolean)
        .sort((a, b) => (b.pct - a.pct) || (RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity]) || (b.lb - a.lb))
        .slice(0, Math.max(1, Math.min(100, limit)));
}

// ── THE RECORD BOARD ─────────────────────────────────────────────────────────────────────────────────────────
// Biggest of every species anyone in the Den has ever landed. This is the leaderboard the log is chasing.
export async function denFishRecords() {
    const rows = await db.query(
        `SELECT DISTINCT ON (c.species) c.species, c.lb, c.caught_at,
                COALESCE(NULLIF(b.display_name, ''), b.alias) AS who, b.alias
           FROM mkt_fish_catch c LEFT JOIN mkt_buyer b ON b.id = c.buyer_id
          ORDER BY c.species, c.lb DESC, c.caught_at ASC`
    ).catch(() => []);
    const byId = new Map((rows || []).map((r) => [r.species, r]));
    return FISH.map((f) => {
        const r = byId.get(f.id);
        return {
            id: f.id, name: f.name, emoji: f.emoji, rarity: f.rarity, max: f.lb[1],
            record: r ? Number(r.lb) : null,
            who: r?.who || null, alias: r?.alias || null,
            at: r?.caught_at || null,
        };
    });
}


// ── BUY AN EXTRA CAST ────────────────────────────────────────────────────────────────────────────────────────
// Spends gold for one more cast today. Deliberately only offered once the free allowance is gone, and the
// counter resets with the day so tomorrow starts at 1,000 again.
export async function buyRecharge(buyerId) {
    if (!buyerId) return { ok: false, error: "bad_request" };
    // Angling ADDS casts, so it has to be the real value here — treating it as 0 would understate the cap and
    // offer a paid recharge to someone who still has free casts left.
    const { equippedSeaAffinity } = await import("@/lib/marketplace/sailing.js");
    const [row, sea] = await Promise.all([readFishRow(buyerId), equippedSeaAffinity(buyerId).catch(() => ({}))]);
    const angling = Number(sea?.angling) || 0;
    if (!row) return { ok: false, error: "no_ship" };
    const lv = fishTrackLevels(row);
    const used = castsUsed(row);
    const max = castsAvailable(row, angling, lv.line);
    if (used < max) return { ok: false, error: "still_have_casts" };
    const bought = rechargesToday(row);
    if (bought >= RECHARGE_MAX_PER_DAY) return { ok: false, error: "recharge_maxed" };

    const cost = rechargeCost(bought);
    // Conditional spend: the WHERE clause is the balance check, so two taps can't both succeed on one balance.
    const paid = await db.queryOne(
        `UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND COALESCE(gold, 0) >= $2 RETURNING gold`,
        [buyerId, cost],
    ).catch(() => null);
    if (!paid) return { ok: false, error: "not_enough_gold", cost };

    // Stamp fish_day alongside, so a recharge bought before the first cast of a new day still counts as today's.
    await db.query(
        `UPDATE mkt_sailing
            SET fish_recharges = CASE WHEN fish_day = (NOW() AT TIME ZONE 'America/Chicago')::date
                                      THEN COALESCE(fish_recharges, 0) + 1 ELSE 1 END,
                fish_day = (NOW() AT TIME ZONE 'America/Chicago')::date
          WHERE buyer_id = $1`,
        [buyerId],
    ).catch(() => {});
    await logCoin(buyerId, -cost, "fishing_recharge", { meta: { bought: bought + 1 } }).catch(() => {});
    await trackActivity(buyerId, "fish_recharge", { cost, bought: bought + 1 }).catch(() => {});
    return { ok: true, cost, gold: paid.gold, bought: bought + 1, nextCost: rechargeCost(bought + 1) };
}
