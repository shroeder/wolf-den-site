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
export const HAUL_PER_DOLLAR = 20;
export const HAUL_MAX = 14;
export const rollsFor = (dollars) => Math.max(1, Math.min(HAUL_MAX, 1 + Math.floor((Number(dollars) || 0) / HAUL_PER_DOLLAR)));

// And how good a pull can be. Four bands rather than a smooth curve so the step up is legible: a member who
// spends $100 instead of $90 can see what it bought them.
export const BANDS = ["plain", "good", "rich", "lavish"];
export const bandFor = (dollars) => {
    const d = Number(dollars) || 0;
    return d >= 250 ? "lavish" : d >= 100 ? "rich" : d >= 40 ? "good" : "plain";
};

// ── THE POOL ─────────────────────────────────────────────────────────────────────────────────────────────────
// Luke: "it should pull from a WIDE pool." Seven kinds, and the point of seven is that they land in seven
// different parts of the game — the purse, the farm, the pantry, the Forge, the sea, the chest pile and your
// own gear. A member who only plays the farm still gets something they wanted out of a card purchase.
//
// ⚠️ GOLD IS DELIBERATELY THE THING THAT SHRINKS AS THE BAND CLIMBS. A scan ALREADY pays gold — awardPurchaseXp
// gives `dollars x SPEND_XP_PER_DOLLAR` in XP and awardXp mints gold 1:1 with points — so a $209 receipt is
// already handing over roughly a thousand coins before this table is touched. Making the big spenders' extra
// rolls ALSO mostly gold would be paying the same reward twice and calling it variety. The rich bands trade
// coin for chests, Forge parts and gear: things you cannot simply buy with the coin.
// ⚠️ THE FIRST CUT OF THIS TABLE PAID 89% AS MUCH GOLD AGAIN AS THE XP ALREADY MINTS. Run over all 213 real
// receipts in the Den's history, the haul came to 48,823 coins against the 55,030 the purchase XP already
// pays — so the "wide pool" was, in practice, a gold faucet with some seeds in it, which is the exact thing
// the comment above says it must not be. Gold's weight and its size both came down; everything else came up.
// It now lands around a third on top, and what a member actually REMEMBERS from a scan is the chest.
export const POOL = {
    plain:  { gold: 24, seed: 23, crop: 19, parts: 16, doubloons: 12, chest: 4,  gear: 2 },
    good:   { gold: 19, seed: 20, crop: 14, parts: 19, doubloons: 14, chest: 9,  gear: 5 },
    rich:   { gold: 14, seed: 15, crop: 10, parts: 20, doubloons: 16, chest: 16, gear: 9 },
    lavish: { gold: 10, seed: 10, crop: 7,  parts: 21, doubloons: 16, chest: 22, gear: 14 },
};

// What one pull of each kind is worth, per band. `stack` is how many of a seed or crop come at once.
export const SIZE = {
    plain:  { gold: [40, 120],  parts: [1, 2], partTier: 1, doubloons: [3, 8],   chest: "wooden", gear: "common", stack: [1, 3] },
    good:   { gold: [90, 240],  parts: [1, 3], partTier: 2, doubloons: [6, 14],  chest: "iron",   gear: "rare",   stack: [2, 4] },
    rich:   { gold: [170, 420], parts: [2, 4], partTier: 3, doubloons: [10, 22], chest: "gold",   gear: "rare",   stack: [3, 6] },
    lavish: { gold: [280, 600], parts: [3, 6], partTier: 4, doubloons: [16, 34], chest: "mythic", gear: "epic",   stack: [4, 8] },
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
        else if (kind === "chest") out.push({ kind, tier: sz.chest });
        else if (kind === "gear") out.push({ kind, rarity: sz.gear });
        else out.push({ kind, n: between(sz.stack, rng()) });   // seed | crop
    }
    // ⚠️ MERGED, BECAUSE ELEVEN ROLLS IS ELEVEN LINES AND NOBODY READS ELEVEN LINES. Coin and doubloons add
    // into one line each — they are one pile in the purse either way — while every named thing (a chest, a
    // seed, a piece of gear) stays its own line, because the name IS the reward. Same rule the raid-defence
    // report follows.
    const merged = [];
    for (const x of out) {
        const at = merged.find((m) => m.kind === x.kind && (x.kind === "gold" || x.kind === "doubloons"
            || (x.kind === "parts" && m.tier === x.tier)));
        if (at) at.n += x.n; else merged.push({ ...x });
    }
    return { band, rolls: n, hand: merged };
}
