import "server-only";

import { db } from "@/lib/db";
import { logCoin } from "@/lib/marketplace/coins.js";

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

    const paid = await db.queryOne(
        `UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`,
        [buyerId, stake],
    ).catch(() => null);
    if (!paid) return { ok: false, error: "no_gold" };
    await logCoin(buyerId, -stake, "casino_slot_bet", { balanceAfter: paid.gold, meta: { bet: stake } });

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
    return { ok: true, reels, mult, bet: stake, won, gold };
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
    };
}
