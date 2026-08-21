import "server-only";

import { db } from "@/lib/db";
import { logCoin } from "@/lib/marketplace/coins.js";
import { grantHaul } from "@/lib/marketplace/fishing.js";
import { COLLECTIBLES } from "@/lib/marketplace/collectibles.js";
import { maybeGrantCasinoPet } from "@/lib/marketplace/pet-drops.js";

// ── THE CASINO ───────────────────────────────────────────────────────────────────────────────────────────────
// A room off the town, owner-gated, laid out like the tavern: you walk left and right, other members walking
// around are really there, and the things you interact with are MACHINES rather than people.
//
// Luke's brief: "a slot machine, a blackjack table, roulette, Keno, maybe bingo, maybe three different kinds
// of slot machines... it's a gold sink with a chance to win chests, laurels, doubloons, pet stones,
// consumables, recipes, and maybe five exclusive pets that are hard-to-find late-game things — not powerful,
// they just give casino bonuses. No limit to how much you can play other than how much coin you have."
//
// ── WHAT THIS FILE IS FOR ────────────────────────────────────────────────────────────────────────────────────
// The floor is the easy half and it is mostly free: `mkt_town_presence` already carries a `zone`, so a casino
// is a new zone value and seeing other people in it comes with the tavern's own machinery.
//
// The hard half is the money, and it is the whole reason the odds live in ONE file with a check script
// pointed at them. A payout table is the one kind of content in this game that can mint currency out of
// nothing — this codebase has already been bitten by exactly that once, where awardXp paid gold 1:1 with
// points on a repeatable caller. A slot machine is that bug with a lever on it.
//
// So: every machine's odds are a table here, the return-to-player is COMPUTED from that same table rather
// than asserted in a comment, and scripts/check-casino.mjs fails the build if any machine can pay out more
// than it takes in. The number in the comment cannot drift from the number in the game, because the comment
// does not contain a number.

export const CASINO_ZONE = "casino";

// ── HOUSE EDGE ───────────────────────────────────────────────────────────────────────────────────────────────
// Luke: "yes just like a real machine." So gold does come back — a session has small wins in it rather than
// being a coin shredder with an occasional prize — and the house keeps a share.
//
// Real slots run 85-95% RTP and are tuned to feel generous while being anything but. This sits at the bottom
// of that range on purpose: the Den's gold has other places to be, and the casino is meant to be a SINK
// first. The ceiling is what the check script enforces; the target is what the tables are tuned to.
export const RTP_CEILING = 0.95;     // above this a machine is a money printer; the check script refuses it
export const RTP_TARGET = 0.88;      // what the tables are actually tuned to

export const MIN_BET = 25;
export const MAX_BET = 5000;

// ── THE SLOT: THREE REELS, ONE TABLE ─────────────────────────────────────────────────────────────────────────
// Weighted symbols, three identical reels, and a paytable keyed on what comes up. Three reels rather than
// five because three can be enumerated EXACTLY — every outcome of this machine is one of 6^3 combinations, so
// its return is arithmetic rather than a simulation that happened to look fine on the day it was run.
//
// The symbols are the Den's own currency of meaning: the wolf is the house, and the things below it are the
// things a member already wants.
export const SLOT_SYMBOLS = [
    { id: "wolf", label: "Wolf", weight: 1 },
    { id: "chest", label: "Chest", weight: 3 },
    { id: "laurel", label: "Laurel", weight: 5 },
    { id: "doubloon", label: "Doubloon", weight: 8 },
    { id: "bone", label: "Bone", weight: 12 },
    { id: "moon", label: "Moon", weight: 16 },
];

// What a line pays, as a MULTIPLE OF THE BET.
//
// THE FIRST TABLE FAILED ITS OWN CHECK, which is the argument for having one: it returned 48% and paid
// something on one pull in twelve. Correct in the sense that the house could never lose, and it would have
// read as a broken machine — you would have sat there watching nothing happen.
//
// Two changes. Every symbol pays on a PAIR now, not just the top two, which is what a real machine does and
// what puts something on the screen often enough to be worth watching. And the low pairs pay LESS THAN THE
// BET on purpose — a moon pair returns 0.4x, so it is a win that is really a smaller loss. That is exactly
// what slot machines do, and it is honest here because the number on screen is the number you actually got.
export const SLOT_PAYS = {
    three: { wolf: 700, chest: 100, laurel: 35, doubloon: 20, bone: 8, moon: 4 },
    two: { wolf: 8, chest: 3, laurel: 1.5, doubloon: 1, bone: 0.5, moon: 0.4 },
};

/** Exact return-to-player for the slot, enumerated over every combination rather than sampled.
 *  Exported so the check script and the game read the SAME number from the SAME table. */
export function slotRtp() {
    const total = SLOT_SYMBOLS.reduce((n, s) => n + s.weight, 0);
    let paid = 0;
    for (const a of SLOT_SYMBOLS) {
        for (const b of SLOT_SYMBOLS) {
            for (const c of SLOT_SYMBOLS) {
                const p = (a.weight / total) * (b.weight / total) * (c.weight / total);
                paid += p * slotPayout([a.id, b.id, c.id]);
            }
        }
    }
    return paid;
}

/** What one spin pays, as a multiple of the bet. The single source of truth for a result — the screen shows
 *  what this returned rather than working it out again. */
export function slotPayout(reels) {
    const [a, b, c] = reels;
    if (a === b && b === c) return SLOT_PAYS.three[a] || 0;
    // A genuine pair, and only reached when it is NOT three of a kind — that case is handled above and would
    // otherwise be counted twice. Every symbol has a pair value now; see the note on SLOT_PAYS.
    const pair = a === b ? a : b === c ? b : a === c ? a : null;
    return pair ? (SLOT_PAYS.two[pair] || 0) : 0;
}

const pickSymbol = () => {
    const total = SLOT_SYMBOLS.reduce((n, s) => n + s.weight, 0);
    let r = Math.random() * total;
    for (const s of SLOT_SYMBOLS) { r -= s.weight; if (r <= 0) return s.id; }
    return SLOT_SYMBOLS[SLOT_SYMBOLS.length - 1].id;
};

const clampBet = (v) => Math.max(MIN_BET, Math.min(MAX_BET, Math.round(Number(v) || 0)));

/**
 * ONE PULL.
 *
 * The bet is taken FIRST and atomically — `gold >= $2` in the UPDATE, so two taps cannot both spend the same
 * coin and a member can never bet gold they do not have. If that write does not come back, nothing else
 * happens: there is no version of this where the reels roll on credit.
 *
 * The payout is computed from the same table the RTP is computed from, so what the machine pays and what the
 * check script proves it pays cannot come apart.
 */
export async function spinSlot(buyerId, { bet } = {}) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const stake = clampBet(bet);

    const perks = await casinoPerks(buyerId);
    // ── ON THE HOUSE ─────────────────────────────────────────────────────────────────────────────────────
    // Copper Paw and the Night Auditor pay for the odd play. Refunded AFTER the debit rather than skipping
    // it, so the ledger still shows the bet being placed and the stake coming back — a play that never
    // appears in the coin log is a play nobody can audit.
    let onHouse = false;
    const paid = await db.queryOne(
        `UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`,
        [buyerId, stake],
    ).catch(() => null);
    if (!paid) return { ok: false, error: "no_gold" };
    await logCoin(buyerId, -stake, "casino_slot_bet", { balanceAfter: paid.gold, meta: { bet: stake } });

    if (onTheHouse(perks)) {
        const back = await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`,
            [buyerId, stake]).catch(() => null);
        if (back) {
            onHouse = true;
            paid.gold = back.gold;
            await logCoin(buyerId, stake, "casino_on_the_house", { balanceAfter: back.gold, meta: { game: "slot" } });
        }
    }

    const reels = [pickSymbol(), pickSymbol(), pickSymbol()];
    const mult = slotPayout(reels);
    const won = Math.round(stake * mult);

    let gold = paid.gold;
    if (won > 0) {
        const back = await db.queryOne(
            `UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`,
            [buyerId, won],
        ).catch(() => null);
        if (back) {
            gold = back.gold;
            await logCoin(buyerId, won, "casino_slot_win", { balanceAfter: gold, meta: { bet: stake, reels, mult } });
        }
    }
    // Three of a kind on the top symbol is this machine's rarest event, so it is the one that is certain.
    const prize = await rollCasinoPrize(buyerId, { jackpot: reels.every((r) => r === "wolf"), perks });
    // The five. Rolled on every play at absolute odds — see maybeGrantCasinoPet.
    const pet = withPerk(await maybeGrantCasinoPet(buyerId).catch(() => null));
    return { ok: true, reels, mult, bet: stake, won, gold, prize, pet, onHouse };
}

// ── WHAT THE CASINO PETS ARE WORTH ───────────────────────────────────────────────────────────────────────────
// Five pets whose only source is this floor and whose only effect is on this floor. A pet that made you
// better at fighting would be a pet everybody has to chase; these are for people who like the wheel.
//
// EVERY PERK IS BOUNDED, and that is not a style choice — the check script computes each machine's return
// with ALL FIVE owned and fails if it crosses the ceiling. The ceiling is what makes these safe to hand out:
// they cannot be tuned into a money printer by accident, because a printer is what the check is looking for.
//
//   freePlay     the stake comes back. Adds its own value straight onto the return.
//   prizeChance  more non-gold prizes. Does not touch the gold maths at all.
//   prizeTierUp  prizes roll from a better shelf.
//   wheelRefund  a share of a LOSING wheel spin, so it only ever helps where the wheel already took it.
export const CASINO_PETS = COLLECTIBLES.filter((p) => p.casinoExclusive && p.casinoPerk);

// What a perk IS, in a sentence, written once. The floor shows it on the rail and the drop banner says it
// at the moment the pet arrives — a prestige drop whose effect has to be looked up elsewhere lands flat.
export function perkPhrase(k = {}) {
    if (k.freePlay) return `Pays for about 1 play in ${Math.round(1 / k.freePlay)}`;
    if (k.wheelRefund) return `Pushes ${Math.round(Math.min(1, k.wheelRefund / REFUND_CHANCE) * 100)}% back on the odd losing spin`;
    if (k.prizeChance) return "Finds prizes the house missed";
    if (k.prizeTierUp) return "Prizes come off a better shelf";
    return "Works the floor";
}

/** A dropped pet, told what it does. maybeGrantCasinoPet is shared with every other pet source, so the
 *  casino-specific half is added here rather than bent into the generic granter. */
const withPerk = (pet) => {
    if (!pet) return null;
    const def = CASINO_PETS.find((p) => p.id === pet.id);
    return { ...pet, perk: perkPhrase(def?.casinoPerk) };
};

/** Everything the pets in a member's collection add up to. Owned, not equipped: these are not combat pets
 *  and making somebody re-equip to use the casino would be a rule nobody would guess. */
export async function casinoPerks(buyerId) {
    const out = { freePlay: 0, prizeChance: 0, prizeTierUp: false, wheelRefund: 0, pets: [] };
    if (!buyerId) return out;
    const rows = await db.query(
        `SELECT item_id FROM mkt_item_collected WHERE buyer_id = $1`, [buyerId],
    ).catch(() => []);
    const owned = new Set(rows.map((r) => r.item_id));
    for (const pet of CASINO_PETS) {
        if (!owned.has(pet.id)) continue;
        out.pets.push({ id: pet.id, name: pet.name, perk: perkPhrase(pet.casinoPerk) });
        const k = pet.casinoPerk;
        out.freePlay += k.freePlay || 0;
        out.prizeChance += k.prizeChance || 0;
        out.wheelRefund += k.wheelRefund || 0;
        if (k.prizeTierUp) out.prizeTierUp = true;
    }
    return out;
}

/** The stake back, before anything else happens. Returns true when the house is paying for this one. */
const onTheHouse = (perks) => (perks?.freePlay || 0) > 0 && Math.random() < perks.freePlay;

// ── THE PRIZE ON TOP ─────────────────────────────────────────────────────────────────────────────────────────
// Luke's brief again: "it's a gold sink with a chance to win like chests, laurels, doubloons, pet stones,
// consumables, recipes." Gold alone makes the floor a shredder with a slightly slower blade — what makes a
// machine worth sitting at is the possibility of something you cannot buy with the gold it just took.
//
// TWO WAYS TO GET ONE, and the split is the whole design:
//
//   the rare roll   a flat chance on ANY play, win or lose. It is small, it is not tied to the gold outcome,
//                   and it means a losing session can still turn up something — which is what stops a bad
//                   run being purely a bad run.
//   the jackpot     three wolves, five of five, or the wolf pocket. Guaranteed, and from a better shelf.
//
// PRIZES ARE ON TOP OF THE RETURN, deliberately, and the check script says so out loud rather than folding
// them into the RTP. The gold maths is exact and provable; a chest is worth whatever a chest is worth to the
// person who opened it, and pretending otherwise would be a number that looks rigorous and is invented.
// The rate is kept low enough that it cannot become the reason to play.
export const PRIZE_CHANCE = 0.015;    // any play, win or lose

// What the shelves hold. Weighted, and the tiers move up with the occasion rather than the table changing.
export const PRIZE_SHELF = [
    { kind: "doubloons", weight: 34 },
    { kind: "consumable", weight: 26 },
    { kind: "chest", weight: 20 },
    { kind: "recipe", weight: 10 },
    { kind: "seed", weight: 6 },
    { kind: "gear", weight: 4 },
];

const pickPrize = () => {
    const total = PRIZE_SHELF.reduce((n, p) => n + p.weight, 0);
    let r = Math.random() * total;
    for (const p of PRIZE_SHELF) { r -= p.weight; if (r <= 0) return p.kind; }
    return "doubloons";
};

/**
 * Roll for something that is not gold.
 *
 * `jackpot` means the machine did its rarest thing, so a prize is certain and comes from a better tier. Every
 * other play takes the flat chance. Granting goes through the SAME function a fishing haul uses, so a chest
 * from a slot machine and a chest from the sea are the same chest and land in the same place.
 */
export async function rollCasinoPrize(buyerId, { jackpot = false, perks = null } = {}) {
    const chance = PRIZE_CHANCE + (perks?.prizeChance || 0);
    if (!jackpot && Math.random() >= chance) return null;
    let tier = jackpot
        ? (Math.random() < 0.35 ? "legendary" : "epic")
        : (Math.random() < 0.2 ? "rare" : "common");
    // The Magpie never takes the smaller shiny.
    if (perks?.prizeTierUp) {
        const ladder = ["common", "rare", "epic", "legendary"];
        tier = ladder[Math.min(ladder.length - 1, ladder.indexOf(tier) + 1)] || tier;
    }
    const kind = jackpot && Math.random() < 0.5 ? "chest" : pickPrize();
    const prize = await grantHaul(buyerId, kind, tier).catch(() => null);
    if (prize) {
        await logCoin(buyerId, 0, "casino_prize", { meta: { kind: prize.kind, tier, jackpot } }).catch(() => {});
    }
    return prize ? { ...prize, tier, jackpot } : null;
}

// ── THE WHEEL ────────────────────────────────────────────────────────────────────────────────────────────────
// Roulette, in the Den's own shape rather than a copy of Monte Carlo. A real European wheel returns 97.3%
// (36/37) and an American one 94.7% — the first is above our ceiling and the second only just under it, and
// both are the way they are because a physical wheel has to have 37 pockets. Ours does not.
//
// Twenty segments: nine gold, nine violet, and TWO wolves. The wolves are the house's edge made visible —
// they are on the wheel where you can see them, rather than hidden in a payout that is quietly short.
//
// How often the Croupier's Cat pushes chips back. The PET carries the expected cost; this only decides
// whether that cost arrives as a dribble or as a moment. See spinWheel.
export const REFUND_CHANCE = 0.05;

// ── EVERY PET OWNED ──────────────────────────────────────────────────────────────────────────────────────────
// The worst case the odds have to survive. check-casino runs each machine's return through perkedRtp with
// THIS and fails if any of them crosses the ceiling — so a perk cannot be nudged upward without the gate
// noticing. Built from the pet list rather than typed out, because a hand-copied budget is a budget that
// silently stops matching the pets.
export const MAX_PERKS = CASINO_PETS.reduce((out, pet) => {
    const k = pet.casinoPerk || {};
    out.freePlay += k.freePlay || 0;
    out.prizeChance += k.prizeChance || 0;
    out.wheelRefund += k.wheelRefund || 0;
    if (k.prizeTierUp) out.prizeTierUp = true;
    return out;
}, { freePlay: 0, prizeChance: 0, wheelRefund: 0, prizeTierUp: false });

/**
 * A machine's return once the pets are in play — the one formula, used by the games' pricing and by the
 * check script, so the gate can never be checking arithmetic the floor does not run.
 *   freePlay    hands the stake back on some plays, which adds its own rate straight onto the return
 *   wheelRefund pays a share of a LOSS, and only on plays that were not already free
 * prizeChance and prizeTierUp are deliberately absent: they buy chests, not gold, and folding a chest into
 * a percentage produces a number that looks rigorous and is invented.
 */
export function perkedRtp(base, perks = MAX_PERKS, lossChance = 0) {
    const free = Math.min(1, perks?.freePlay || 0);
    return base + free + (1 - free) * lossChance * (perks?.wheelRefund || 0);
}

// Every bet on this wheel returns exactly 90%, which is deliberate: there is no "smart" bet to discover and
// no trap bet to fall into. What you choose changes the SHAPE of the outcome — often and small, or rarely and
// enormous — and never the value of it.
export const WHEEL = [
    ...Array.from({ length: 9 }, (_, i) => ({ i, kind: "gold" })),
    ...Array.from({ length: 9 }, (_, i) => ({ i: i + 9, kind: "violet" })),
    { i: 18, kind: "wolf" }, { i: 19, kind: "wolf" },
];

export const WHEEL_BETS = {
    gold:   { label: "Gold", pays: 2, hits: (seg) => seg.kind === "gold" },
    violet: { label: "Violet", pays: 2, hits: (seg) => seg.kind === "violet" },
    wolf:   { label: "Wolf", pays: 9, hits: (seg) => seg.kind === "wolf" },
    // One pocket out of twenty. The long shot, and the only bet on the floor that can pay 18x.
    single: { label: "One pocket", pays: 18, hits: (seg, pick) => seg.i === Number(pick) },
};

/** Exact return for one wheel bet, enumerated over all twenty pockets. */
export function wheelRtp(betId, pick = 0) {
    const bet = WHEEL_BETS[betId];
    if (!bet) return 0;
    const wins = WHEEL.filter((seg) => bet.hits(seg, pick)).length;
    return (wins / WHEEL.length) * bet.pays;
}

export async function spinWheel(buyerId, { bet, choice = "gold", pick = 0 } = {}) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const rule = WHEEL_BETS[choice];
    if (!rule) return { ok: false, error: "bad_bet" };
    const stake = clampBet(bet);

    const perks = await casinoPerks(buyerId);
    // ── ON THE HOUSE ─────────────────────────────────────────────────────────────────────────────────────
    // Copper Paw and the Night Auditor pay for the odd play. Refunded AFTER the debit rather than skipping
    // it, so the ledger still shows the bet being placed and the stake coming back — a play that never
    // appears in the coin log is a play nobody can audit.
    let onHouse = false;
    const paid = await db.queryOne(
        `UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`,
        [buyerId, stake],
    ).catch(() => null);
    if (!paid) return { ok: false, error: "no_gold" };
    await logCoin(buyerId, -stake, "casino_wheel_bet", { balanceAfter: paid.gold, meta: { bet: stake, choice } });

    if (onTheHouse(perks)) {
        const back = await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`,
            [buyerId, stake]).catch(() => null);
        if (back) {
            onHouse = true;
            paid.gold = back.gold;
            await logCoin(buyerId, stake, "casino_on_the_house", { balanceAfter: back.gold, meta: { game: "wheel" } });
        }
    }

    const seg = WHEEL[Math.floor(Math.random() * WHEEL.length)];
    const hit = rule.hits(seg, pick);
    const won = hit ? Math.round(stake * rule.pays) : 0;

    let gold = paid.gold;
    if (won > 0) {
        const back = await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`,
            [buyerId, won]).catch(() => null);
        if (back) {
            gold = back.gold;
            await logCoin(buyerId, won, "casino_wheel_win", { balanceAfter: gold, meta: { bet: stake, choice, seg: seg.i } });
        }
    }
    // ── THE CROUPIER'S CAT ─────────────────────────────────────────────────────────────────────────────────
    // A share of a spin the wheel already took. Three rules keep it honest and one keeps it fun:
    //   • only on a LOSS, so it can never compound with a win into something the ceiling did not price;
    //   • never on a play that was already free, because refunding a stake nobody paid mints gold;
    //   • the same expected cost either way — but paid RARELY and BIG (a quarter of the pile, one losing
    //     spin in twenty) instead of a rounding error on every loss. A 1% dribble is invisible; the cat
    //     sliding a stack back across the felt is the reason to want the cat.
    let refund = 0;
    if (!hit && !onHouse && perks.wheelRefund > 0 && Math.random() < REFUND_CHANCE) {
        refund = Math.round(stake * Math.min(1, perks.wheelRefund / REFUND_CHANCE));
        if (refund > 0) {
            const back = await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`,
                [buyerId, refund]).catch(() => null);
            if (back) { gold = back.gold; await logCoin(buyerId, refund, "casino_wheel_refund", { balanceAfter: gold }); }
            else refund = 0;
        }
    }
    const prize = await rollCasinoPrize(buyerId, { jackpot: hit && choice === "wolf", perks });
    const pet = withPerk(await maybeGrantCasinoPet(buyerId).catch(() => null));
    return { ok: true, seg, choice, hit, bet: stake, won, gold, prize, pet, onHouse, refund };
}

// ── KENO ─────────────────────────────────────────────────────────────────────────────────────────────────────
// Pick five from forty; the house draws ten. What you are paid depends on how many of yours came up, and the
// odds are HYPERGEOMETRIC — drawing without replacement — which is why the check script computes them with
// factorials rather than sampling. Five hits out of five is a 1-in-2,600 event and no simulation short of
// millions of runs would price it honestly.
export const KENO_POOL = 40;
export const KENO_PICKS = 5;
export const KENO_DRAWN = 10;

// By how many of your five came up. Nothing for two or fewer than two is deliberate — a game that pays on
// almost every ticket is a game where nothing means anything.
export const KENO_PAYS = { 0: 0, 1: 0, 2: 0.5, 3: 3, 4: 25, 5: 600 };

const choose = (n, k) => {
    if (k < 0 || k > n) return 0;
    let r = 1;
    for (let i = 1; i <= k; i += 1) r = (r * (n - k + i)) / i;
    return r;
};

/** The exact chance of matching `k` of your picks. Hypergeometric, so this is arithmetic and not an estimate. */
export function kenoChance(k) {
    return (choose(KENO_PICKS, k) * choose(KENO_POOL - KENO_PICKS, KENO_DRAWN - k)) / choose(KENO_POOL, KENO_DRAWN);
}

export function kenoRtp() {
    let r = 0;
    for (let k = 0; k <= KENO_PICKS; k += 1) r += kenoChance(k) * (KENO_PAYS[k] || 0);
    return r;
}

export async function playKeno(buyerId, { bet, picks = [] } = {}) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    // The ticket is validated here and not trusted: a POST body can carry six numbers, or the same number
    // five times, or 400. Either of those would break the odds this game was priced on.
    const clean = [...new Set((Array.isArray(picks) ? picks : []).map((n) => Math.round(Number(n))))]
        .filter((n) => n >= 1 && n <= KENO_POOL);
    if (clean.length !== KENO_PICKS) return { ok: false, error: "bad_ticket" };
    const stake = clampBet(bet);

    const perks = await casinoPerks(buyerId);
    // ── ON THE HOUSE ─────────────────────────────────────────────────────────────────────────────────────
    // Copper Paw and the Night Auditor pay for the odd play. Refunded AFTER the debit rather than skipping
    // it, so the ledger still shows the bet being placed and the stake coming back — a play that never
    // appears in the coin log is a play nobody can audit.
    let onHouse = false;
    const paid = await db.queryOne(
        `UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`,
        [buyerId, stake],
    ).catch(() => null);
    if (!paid) return { ok: false, error: "no_gold" };
    await logCoin(buyerId, -stake, "casino_keno_bet", { balanceAfter: paid.gold, meta: { bet: stake, picks: clean } });

    if (onTheHouse(perks)) {
        const back = await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`,
            [buyerId, stake]).catch(() => null);
        if (back) {
            onHouse = true;
            paid.gold = back.gold;
            await logCoin(buyerId, stake, "casino_on_the_house", { balanceAfter: back.gold, meta: { game: "keno" } });
        }
    }

    // Draw without replacement, which is what makes the odds hypergeometric rather than binomial.
    const bag = Array.from({ length: KENO_POOL }, (_, i) => i + 1);
    const drawn = [];
    for (let i = 0; i < KENO_DRAWN; i += 1) drawn.push(...bag.splice(Math.floor(Math.random() * bag.length), 1));
    const hits = clean.filter((n) => drawn.includes(n));
    const won = Math.round(stake * (KENO_PAYS[hits.length] || 0));

    let gold = paid.gold;
    if (won > 0) {
        const back = await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`,
            [buyerId, won]).catch(() => null);
        if (back) {
            gold = back.gold;
            await logCoin(buyerId, won, "casino_keno_win", { balanceAfter: gold, meta: { bet: stake, hits: hits.length } });
        }
    }
    // Five of five is 1 in 2,611 — the rarest thing on the floor, and the only one that is worth a certainty.
    const prize = await rollCasinoPrize(buyerId, { jackpot: hits.length === KENO_PICKS, perks });
    const pet = withPerk(await maybeGrantCasinoPet(buyerId).catch(() => null));
    return { ok: true, picks: clean, drawn, hits, bet: stake, won, gold, prize, pet, onHouse };
}

// ── THE FLOOR ────────────────────────────────────────────────────────────────────────────────────────────────
// Presence, exactly as the tavern does it — same table, same 90-second liveness, a different `zone`. Written
// as its own pair of functions rather than a shared helper for now, because the tavern's copy carries chat
// bubbles and featured collectibles that the casino does not have machines for yet; when the casino grows
// them, the two collapse into one.
const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(Number(v)) ? Number(v) : lo));

export async function moveCasino(buyerId, { x, y, facing } = {}) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const cx = clampN(x, 4, 96);
    const cy = clampN(y, 55, 90);
    const f = facing === -1 ? -1 : 1;
    await db.query(
        `INSERT INTO mkt_town_presence (buyer_id, x, y, facing, zone, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (buyer_id) DO UPDATE SET x = $2, y = $3, facing = $4, zone = $5, updated_at = NOW()`,
        [buyerId, cx, cy, f, CASINO_ZONE],
    ).catch(() => {});
    return { ok: true };
}

/** Everybody else on the floor right now. 90 seconds is the tavern's own liveness window — someone who closes
 *  the tab drops off rather than haunting the room. */
export async function casinoOccupants(selfId) {
    const rows = await db.query(
        `SELECT p.buyer_id, p.x, p.y, p.facing, b.display_name, b.alias, b.avatar_sprite_url
           FROM mkt_town_presence p JOIN mkt_buyer b ON b.id = p.buyer_id
          WHERE p.zone = $1 AND p.updated_at > NOW() - INTERVAL '90 seconds'
            AND ($2::uuid IS NULL OR p.buyer_id <> $2)
          LIMIT 30`,
        [CASINO_ZONE, selfId || null],
    ).catch(() => []);
    return rows.map((r) => ({
        id: r.buyer_id,
        name: r.display_name || r.alias || "A gambler",
        x: Number(r.x) || 50,
        y: Number(r.y) || 72,
        facing: Number(r.facing) === -1 ? -1 : 1,
        sprite: r.avatar_sprite_url || null,
    }));
}

/** What the room needs to draw itself: your purse, who else is here, and the machine's own numbers. */
export async function getCasinoState(buyerId) {
    const [me, others] = await Promise.all([
        db.queryOne(`SELECT gold FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null),
        casinoOccupants(buyerId),
    ]);
    return {
        gold: Number(me?.gold) || 0,
        others,
        slot: { symbols: SLOT_SYMBOLS, pays: SLOT_PAYS, minBet: MIN_BET, maxBet: MAX_BET },
        wheel: { segments: WHEEL, bets: Object.fromEntries(Object.entries(WHEEL_BETS).map(([k, v]) => [k, { label: v.label, pays: v.pays }])) },
        keno: { pool: KENO_POOL, picks: KENO_PICKS, drawn: KENO_DRAWN, pays: KENO_PAYS },
        perks: await casinoPerks(buyerId),
    };
}
