import "server-only";

import { db } from "@/lib/db";

// ── TOKENS ───────────────────────────────────────────────────────────────────────────────────────────────────
// What the casino PAYS. Chips are what it takes.
//
// Luke: "You buy chips, you earn tokens by winning, that way chips always goes down, and gold is spent to sink
// into chips." The loop, end to end:
//
//     gold  →  chips  (staked, destroyed)  →  a spin  →  TOKENS  →  the Counter
//
// ⚠️ THE WHOLE POINT IS THAT THESE TWO NEVER MEET. Nothing in this file mints a chip and nothing in chips.js
// mints a token. A machine debits chips and credits tokens in the same call and the two numbers are unrelated
// quantities — the chip is the thing you spent, the token is the thing you won, and they are never added,
// netted or converted. That is not squeamishness: the old floor had one currency doing both jobs, which meant
// the paytable's return rate WAS the prize faucet and the two could not be tuned apart. See migration 436.
//
// ⚠️ AND THERE IS NO PATH BACK TO GOLD, which chips.js says about chips and is doubly true here. Tokens are
// won, not bought; they leave at the Counter and nowhere else. A token that could be sold would rebuild the
// loop the split exists to break, and this time from the far side of a 121% floor.
//
// The mechanics below are moveChips's, deliberately line for line: the conditional debit that stops two tabs
// spending the same last token, the awaited-but-best-effort ledger write, and the balance returned so a caller
// never has to re-read it. Two ledgers with the same discipline is worth more than one clever abstraction over
// both — the day an argument about somebody's balance happens, it is settled from these rows.

/**
 * Move a member's tokens and write the row that says why.
 *
 * Returns the new balance, or null if nothing moved — which for a negative delta is how "they could not
 * afford it" is reported. Callers MUST treat null as a refusal and not as a zero.
 */
export async function moveTokens(buyerId, delta, reason, { ref = null, meta = null } = {}) {
    if (!buyerId || !delta || !reason) return null;
    const n = Math.round(delta);
    // The guard is inside the UPDATE. A spend checked in JS and applied afterwards is two taps buying one
    // pet — see rule 2 in chip-store.js, which is the file this protects.
    const row = n < 0
        ? await db.queryOne(
            `UPDATE mkt_buyer SET tokens = tokens + $2 WHERE id = $1 AND tokens >= $3 RETURNING tokens`,
            [buyerId, n, Math.abs(n)])
        : await db.queryOne(`UPDATE mkt_buyer SET tokens = tokens + $2 WHERE id = $1 RETURNING tokens`, [buyerId, n]);
    if (!row) return null;
    // AWAITED, and still best-effort. Un-awaited this is a fire-and-forget write on Vercel, which tears the
    // sandbox down the moment the handler returns — the row lands only if the fetch happens to finish first.
    // The .catch keeps a ledger failure from breaking the move it is recording.
    await db.query(
        `INSERT INTO mkt_token_event (buyer_id, delta, balance_after, reason, ref, meta)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [buyerId, n, Number(row.tokens), reason, ref, meta ? JSON.stringify(meta) : null],
    ).catch(() => {});
    return Number(row.tokens);
}

export async function tokenBalance(buyerId) {
    const row = await db.queryOne(
        `SELECT COALESCE(tokens, 0)::bigint AS tokens FROM mkt_buyer WHERE id = $1`, [buyerId]);
    return Number(row?.tokens || 0);
}

// ── WHAT A SPIN IS WORTH, IN THE CURRENCY IT IS PAID IN ──────────────────────────────────────────────────────
// A paytable multiple is a multiple of the BET, and the bet is in chips — so a line paying 13.2x on a 100-chip
// spin is 1,320 tokens. One to one, because the machines were tuned to a return of about 1.21 tokens per chip
// staked (TARGET_RTP in casino-slot5.js) and a second exchange rate on top of that would make the one number
// worth arguing about impossible to reason about.
//
// It exists as a function anyway, and not as a bare 1, because chip-rate.js is the cautionary tale: the same
// conversion lived inline in six files and moving the rate meant finding all six. If tokens ever stop being
// one-for-one with the bet, this is the only place that has to know.
export const TOKEN_RATE = 1;
export const tokensFor = (multipleOfBet, bet) => Math.round(Number(multipleOfBet || 0) * Number(bet || 0) * TOKEN_RATE);
