import "server-only";

import { db } from "@/lib/db";

// ── COIN IN, COIN OUT ────────────────────────────────────────────────────────────────────────────────────
// Luke: "The casino will now just be pure coin in coin out."
//
// The floor used to take chips and pay chips, and chips had exactly one sink: the Counter. That whole layer
// is gone — the Counter is a ladder now, claimed off lifetime winnings rather than bought — so a chip would
// be a currency with no reason to exist. Every bet and every payout on this floor is GOLD.
//
// ⚠️ THE LEDGER STAYS WHERE IT WAS, AND THAT IS DELIBERATE. These writes still land in mkt_casino_ledger, which
// is the casino's own book: every report, every audit script and every argument about somebody's balance
// reads it, and it holds both sides of every play in one table. Moving the rows to mkt_coin_event would mix
// the floor into every harvest and quest in the game and cost the one place that can answer "what did this
// room do today". The COLUMN being moved is gold; the BOOK is still the casino's.
//
// ⚠️ AND A PAYOUT DOES NOT GO THROUGH mint(). Every other faucet in the game does, because every other faucet
// creates gold out of nothing. This one does not: the floor returns 88% of what it takes, so across any real
// number of plays it DESTROYS gold. Running a sink through the mint rate would shave a return — which the
// note at the top of gold-rate.js calls theft dressed as a nerf, and it is right. What bounds this faucet is
// the RTP, and the RTP is below one.

/**
 * Move gold on the casino floor. Same shape as the old moveChips, so every call site reads the same.
 *
 * Negative is a stake and is REFUSED if the member cannot cover it — the conditional update is the lock, and
 * it is what stops two taps on a phone both placing the same last bet.
 *
 * Returns the new gold balance, or null if the move did not happen.
 */
export async function moveCoin(buyerId, delta, reason, { ref = null, meta = null } = {}) {
    if (!buyerId || !delta || !reason) return null;
    const n = Math.round(delta);
    const row = n < 0
        ? await db.queryOne(
            `UPDATE mkt_buyer SET gold = gold + $2, updated_at = NOW() WHERE id = $1 AND gold >= $3 RETURNING gold`,
            [buyerId, n, Math.abs(n)])
        : await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2, updated_at = NOW() WHERE id = $1 RETURNING gold`, [buyerId, n]);
    if (!row) return null;
    // AWAITED, and still best-effort. Un-awaited it is a fire-and-forget write on Vercel, which tears the
    // sandbox down the moment the handler returns — the row lands only if the fetch happens to finish first.
    // The .catch keeps a ledger failure from breaking the move it is recording.
    await db.query(
        `INSERT INTO mkt_casino_ledger (buyer_id, delta, balance_after, reason, ref, meta)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [buyerId, n, Number(row.gold), reason, ref, meta ? JSON.stringify(meta) : null],
    ).catch(() => {});
    return Number(row.gold);
}

/** What a member can bet with. One name, so no screen has to know which column the floor is denominated in. */
export async function coinBalance(buyerId) {
    const row = await db.queryOne(`SELECT COALESCE(gold, 0)::bigint AS gold FROM mkt_buyer WHERE id = $1`, [buyerId]);
    return Number(row?.gold || 0);
}

// ── AND THE ONE NUMBER THE WHOLE LADDER HANGS OFF ────────────────────────────────────────────────────────
// Lifetime gold won here, which only ever goes up and which nothing can spend down. It is the currency of
// the Counter now — see casino-milestones.js — so it is written in the same call that pays the win, not
// recomputed from the ledger on read.
//
// ⚠️ ONLY POSITIVE MOVES COUNT, AND ONLY FROM A WIN. A refund, a void hand or an on-the-house replay is the
// member's own stake coming back; counting those would make the ladder climbable by betting and cancelling.
export async function recordWon(buyerId, amount) {
    const n = Math.max(0, Math.round(Number(amount) || 0));
    if (!buyerId || n <= 0) return;
    await db.query(
        `UPDATE mkt_buyer SET casino_won = COALESCE(casino_won, 0) + $2 WHERE id = $1`,
        [buyerId, n],
    ).catch(() => {});
}

export async function lifetimeWon(buyerId) {
    if (!buyerId) return 0;
    const r = await db.queryOne(`SELECT COALESCE(casino_won, 0)::bigint AS n FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    return Number(r?.n) || 0;
}
