// ── PATRONAGE · WHAT THE COUNTER PAYS ────────────────────────────────────────────────────────────────────────
// Luke: "when someone buys stuff at the store and uses the qr code we need to make it way more rewarding ...
// as well as random loot random chests seeds etc, it should pull from a wide pool and try to be rewarding
// based on the amount spent. if someone blows 209 bucks at the store, they should feel like a baller in game
// when they scan the qr."
//
// Before this, scanning the QR paid XP and the gold that rides on it, and nothing else. A $12 impulse buy and
// a $209 box break produced the same screen with different numbers on it — which is the one moment the shop
// has a member's full attention, standing at the counter, holding the thing they just bought.
//
// TWO REWARDS, AND THEY ARE DIFFERENT SHAPES ON PURPOSE:
//
//   THE LADDER is lifetime and permanent. Five pets nobody can get any other way, at $50/$100/$250/$500/$1000
//   of lifetime in-store spend. You cross a rung once and it is yours. It is the reason to keep scanning after
//   the novelty of the first one wears off.
//
//   THE HAUL is per-scan and random. Its SIZE is what scales with the receipt — a bigger spend is more rolls
//   on the same table, not a better table, so a $209 break is eleven pulls rather than one enormous one.
//   Eleven things landing one after another is what "baller" actually feels like; one big number is a number.
//
// ⚠️ AND THE HAUL IS SCOPED. It is the reward for scanning, drawn from scanning's own table — not a second
// unrelated prize riding along behind the XP. See [[rewards-must-be-scoped]]: the anti-pattern is "you get a
// thing, and then also a chest"; this is "the thing IS the hand". Nothing else in the codebase rolls on it.
//
// PURE — no database — like forest.js and captains.js, so the payout can be simulated across a thousand
// receipts rather than argued about. patronage-store.js is the half that grants it.

import { COLLECTIBLES } from "@/lib/marketplace/collectibles.js";

// ── THE LADDER ───────────────────────────────────────────────────────────────────────────────────────────────
// ⚠️ READ OFF THE PET DEFINITIONS, NEVER RESTATED HERE. The five rungs are the `spend` field on the five
// `source: "counter"` pets, so the number the locked card shows a member and the number that actually grants
// the pet are the same number, and adding a sixth rung is one line in collectibles.js.
// See [[reuse-the-rule-never-restate-it]].
export const PATRON_PETS = COLLECTIBLES
    .filter((p) => p.source === "counter")
    .sort((a, b) => (a.spend || 0) - (b.spend || 0));
export const PATRON_RUNGS = PATRON_PETS.map((p) => p.spend);

/** Every patronage pet a lifetime spend has earned. Used for the grant AND for the backfill — same rule. */
export const patronPetsFor = (dollars) => PATRON_PETS.filter((p) => (Number(dollars) || 0) >= p.spend);

/** The rungs crossed by one purchase, so the screen can announce what THIS scan just unlocked. */
export const patronPetsCrossed = (beforeDollars, afterDollars) =>
    PATRON_PETS.filter((p) => (Number(beforeDollars) || 0) < p.spend && (Number(afterDollars) || 0) >= p.spend);

/** The next rung and how far off it is — the locked card and the receipt both want this. */
export function nextPatronRung(dollars) {
    const d = Number(dollars) || 0;
    const next = PATRON_PETS.find((p) => d < p.spend);
    return next ? { pet: next, need: Math.max(0, next.spend - d) } : null;
}

// ── THE HAUL ─────────────────────────────────────────────────────────────────────────────────────────────────
// How many pulls a receipt is worth. Linear in dollars and capped, because the cap is what stops a single
// enormous case break from being worth more than a year of ordinary visits.
// ⚠️ AND THE RATE WENT FROM ONE-PER-$20 TO ONE-PER-$12. Luke, on a real $180 scan that paid gold, forge
// parts, doubloons and a single chest: "a 190 dollar purchase should give multiple chests, a few generation
// tokens, a recipe, a couple pieces of gear, etc. Thats my expectation ... make it random but what im
// describing should be the average." Ten pulls could not carry that list — nine kinds over ten rolls leaves
// roughly one of each and a coin-flip on whether the good ones showed up at all, which is exactly the receipt
// he was looking at. Sixteen can. Measured, not guessed: scripts/haul-odds.mjs prints the average hand for
// every receipt size, and the numbers in the POOL comment below are its output.
export const HAUL_PER_DOLLAR = 12;
export const HAUL_MAX = 24;
// ⚠️ THE FLOOR IS TWO, AND THE FLOOR IS THE MODE. Measured over all 217 redeemed receipts: the median is $30,
// 61% of scans fall in the plain band and 38% of them drew exactly ONE roll. So the thing most customers
// experience most of the time was a single pull, and a quarter of those were plain coin -- which the purchase
// XP had already paid. 17% of all scans handed over nothing but currency.
//
// Luke, on a real $11 scan: "rewards were lame for her." He is right, and the fault was never the scaling --
// it was that the bottom of the curve was one pull deep. Two is the difference between "here is a thing" and
// "here is what the counter threw in", and it costs the big receipts nothing: they were already past it.
export const HAUL_FLOOR = 2;
export const rollsFor = (dollars) => Math.max(HAUL_FLOOR, Math.min(HAUL_MAX, 1 + Math.floor((Number(dollars) || 0) / HAUL_PER_DOLLAR)));

// And how good a pull can be. Four bands rather than a smooth curve so the step up is legible: a member who
// spends $100 instead of $90 can see what it bought them.
export const BANDS = ["plain", "good", "rich", "lavish"];
export const bandFor = (dollars) => {
    const d = Number(dollars) || 0;
    return d >= 250 ? "lavish" : d >= 100 ? "rich" : d >= 40 ? "good" : "plain";
};

// ── THE POOL ─────────────────────────────────────────────────────────────────────────────────────────────────
// Luke: "it should pull from a WIDE pool." NINE kinds, and the point of nine is that they land in nine
// different parts of the game — the purse, the farm, the pantry, the Forge, the sea, the chest pile, the
// recipe book, the art studio and your own gear. A member who only plays the farm still gets something they
// wanted out of a card purchase.
//
// ⚠️ GOLD IS DELIBERATELY THE THING THAT SHRINKS AS THE BAND CLIMBS, AND AT LAVISH IT IS GONE. A scan ALREADY
// pays gold — awardPurchaseXp gives `dollars x SPEND_XP_PER_DOLLAR` in XP and awardXp mints gold 1:1 with
// points — so a $209 receipt is already handing over roughly a thousand coins before this table is touched.
// Making the big spenders' extra rolls ALSO mostly gold would be paying the same reward twice and calling it
// variety. The rich bands trade coin for chests, gear, pages and Creations: things you cannot simply buy with
// the coin. Two earlier tunings walked gold down from 24% of a plain pull; this one finishes the argument by
// taking it off the lavish table entirely.
//
// ⚠️ THE GOLD RANGES ARE PRE-MINT. "patronage" is now in MINT_REASONS, so roughly 40% of these numbers is what
// a member actually receives — they were raised by the reciprocal, which is why they look enormous beside the
// pile the screen shows. See [[gold-mint-rate-lever]].
//
// ── WHAT THIS PAYS, MEASURED ─────────────────────────────────────────────────────────────────────────────────
// 20,000 simulated scans per size, from `node --experimental-loader ./scripts/lib/app-loader.mjs
// scripts/haul-odds.mjs`. Averages per scan; gold is post-mint:
//
//     $     band    rolls  chests  gear  creations  recipes  seeds  crops  parts  doubloons  gold   coin-only
//     11    plain     2      0.3    0.1     0.1       0.1     0.4    0.3    0.5       1       22      12.9%
//     30    plain     3      0.4    0.2     0.1       0.1     0.6    0.4    0.7       2       32       4.7%
//     60    good      6      1.0    0.6     0.4       0.3     0.9    0.6    1.9       8      104       0.3%
//    100    rich      9      1.9    1.2     1.4       0.6     0.9    0.6    4.0      20      131       0.0%
//    180    rich     16      3.4    2.1     2.4       1.1     1.6    1.1    7.2      36      227       0.0%
//    250  lavish     21      4.8    3.6     5.0       1.7     1.5    1.1   13.3      74        0       0.0%
//    400  lavish     24      5.5    4.1     5.8       1.9     1.7    1.2   15.0      84        0       0.0%
//
// The $180 row IS the ask: "multiple chests, a few generation tokens, a recipe, a couple pieces of gear."
// Against the table this replaced, the same receipt paid 1.9 chests, 1.0 gear, no Creations and no recipe.
//
// ⚠️ THE NUMBER TO WATCH WHEN THESE MOVE IS THE LAST COLUMN, not the averages. The failure this table has
// shipped twice is not "too little on average" — it is a scan whose entire hand was currency, which reads as
// nothing at all because the purchase XP already paid gold. It was 17.1% of all scans two tunings ago and is
// 12.9% at the very bottom of the curve now. See [[economy-nerf-measure-daily-total]].
export const POOL = {
    plain:  { gold: 10, seed: 21, crop: 15, parts: 15, doubloons: 11, chest: 14, gear:  7, recipe: 3, token:  4 },
    good:   { gold:  7, seed: 15, crop: 10, parts: 16, doubloons: 14, chest: 17, gear: 10, recipe: 5, token:  6 },
    rich:   { gold:  3, seed: 10, crop:  7, parts: 15, doubloons: 14, chest: 21, gear: 13, recipe: 7, token: 10 },
    lavish: { gold:  0, seed:  7, crop:  5, parts: 14, doubloons: 14, chest: 23, gear: 17, recipe: 8, token: 12 },
};

// ── WHAT ONE PULL IS WORTH ───────────────────────────────────────────────────────────────────────────────────
// `stack` is how many of a seed or crop come at once. `chest` and `gear` are WEIGHTED TABLES rather than one
// fixed tier, so a rich receipt is usually a gold chest and occasionally a mythic one — the spike is most of
// what makes a random table worth watching, and a band that always pays exactly its own tier is a schedule.
//
// ⚠️ THE CHEST SPIKE STOPS AT MYTHIC, ON PURPOSE. Ascendant and above are the ELITE chests: they draw from
// ELITE_POOL, which is the charged Ascendant/Eternal gear. A QR scan at the counter must not be a door into
// that, however large the receipt. See [[rewards-must-be-scoped]].
//
// ⚠️ AND GOLD IS QUOTED BEFORE THE MINT RATE. "patronage" is now in MINT_REASONS (it always claimed to be in
// the comment beside the grant, and was not), so these numbers are multiplied by GOLD_MINT_RATE on the way
// out and a member sees roughly 40% of them. They were raised to match, so the pile a scan pays is about what
// it paid before — the change is that the one lever can finally see it. See [[gold-mint-rate-lever]].
export const SIZE = {
    plain: {
        gold: [150, 400], parts: [1, 2], partTier: 1, doubloons: [3, 8], stack: [1, 3], tokens: [1, 1],
        chest: { wooden: 86, iron: 14 },
        gear: { common: 78, rare: 22 },
    },
    good: {
        gold: [350, 900], parts: [1, 3], partTier: 2, doubloons: [6, 14], stack: [2, 4], tokens: [1, 1],
        chest: { wooden: 26, iron: 66, gold: 8 },
        gear: { common: 40, rare: 52, epic: 8 },
    },
    rich: {
        gold: [700, 1700], parts: [2, 4], partTier: 3, doubloons: [10, 22], stack: [3, 6], tokens: [1, 2],
        chest: { iron: 22, gold: 70, mythic: 8 },
        gear: { common: 12, rare: 58, epic: 27, legendary: 3 },
    },
    lavish: {
        gold: [0, 0], parts: [3, 6], partTier: 4, doubloons: [16, 34], stack: [4, 8], tokens: [1, 3],
        chest: { gold: 26, mythic: 74 },
        gear: { rare: 30, epic: 46, legendary: 21, mythic: 3 },
    },
};

const pick = (weights, roll) => {
    const total = Object.values(weights).reduce((n, w) => n + w, 0);
    let r = roll * total;
    for (const [k, w] of Object.entries(weights)) { r -= w; if (r <= 0) return k; }
    return Object.keys(weights)[0];
};
const between = ([lo, hi], roll) => lo + Math.floor(roll * (hi - lo + 1));

/**
 * Roll a receipt's haul. Returns a list of INTENTS — what to grant — rather than granting anything, so the
 * whole table can be run ten thousand times in a simulator without a database. patronage-store.js turns each
 * intent into the real thing.
 *
 * `rng` is passed in for the same reason swing() and regrow() take one.
 */
export function rollHaul(dollars, rng = Math.random) {
    const band = bandFor(dollars);
    const n = rollsFor(dollars);
    const w = POOL[band], sz = SIZE[band];
    const out = [];
    for (let i = 0; i < n; i += 1) {
        const kind = pick(w, rng());
        if (kind === "gold") out.push({ kind, n: between(sz.gold, rng()) });
        else if (kind === "doubloons") out.push({ kind, n: between(sz.doubloons, rng()) });
        else if (kind === "parts") out.push({ kind, n: between(sz.parts, rng()), tier: sz.partTier });
        else if (kind === "chest") out.push({ kind, tier: pick(sz.chest, rng()), n: 1 });
        else if (kind === "gear") out.push({ kind, rarity: pick(sz.gear, rng()) });
        else if (kind === "token") out.push({ kind, n: between(sz.tokens, rng()) });
        else if (kind === "recipe") out.push({ kind, band: `patron_${band}` });
        else out.push({ kind, n: between(sz.stack, rng()) });   // seed | crop
    }
    // ⚠️ MERGED, BECAUSE ELEVEN ROLLS IS ELEVEN LINES AND NOBODY READS ELEVEN LINES. Coin and doubloons add
    // into one line each — they are one pile in the purse either way — while every named thing (a chest, a
    // seed, a piece of gear) stays its own line, because the name IS the reward. Same rule the raid-defence
    // report follows.
    // ⚠️ CHESTS OF THE SAME TIER MERGE TOO, and that is new. "Multiple chests" as three identical rows reads
    // as a bug; one card saying x3 reads as a haul. Creations merge for the same reason — they are a count of
    // one fungible thing. A recipe and a piece of gear never merge: the NAME is the reward.
    const merged = [];
    for (const x of out) {
        const at = merged.find((m) => m.kind === x.kind && (x.kind === "gold" || x.kind === "doubloons"
            || x.kind === "token"
            || (x.kind === "parts" && m.tier === x.tier)
            || (x.kind === "chest" && m.tier === x.tier)));
        if (at) at.n += x.n; else merged.push({ ...x });
    }
    return { band, rolls: n, hand: merged };
}
