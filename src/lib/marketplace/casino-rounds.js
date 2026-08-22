import "server-only";

import { db } from "@/lib/db";
import { logCoin } from "@/lib/marketplace/coins.js";

// ── THE SHARED FLOOR ─────────────────────────────────────────────────────────────────────────────────────────
// Keno and roulette are both played by everyone at once: one draw, one pocket, and every ticket in the window
// scored against it. That is what those games ARE — a keno lounge where each player gets private balls is not
// a keno lounge, it is a slot machine with numbers on it.
//
// Bingo is already shared and needed none of this, because a bingo CARD IS SERVER-CHOSEN. You cannot pick it,
// so knowing the draw buys you nothing and the whole thing can resolve the instant a card is bought.
//
// KENO AND ROULETTE ARE THE OPPOSITE: you choose. Which forces the one rule this file exists to enforce —
//
//   THE OUTCOME OF A ROUND DOES NOT EXIST UNTIL THE ROUND IS OVER.
//
// Not "is not sent to the client". Does not exist. It is rolled by whoever asks first AFTER the window shuts,
// written once, and read by everyone else. Any design where the draw could be computed while bets are open —
// a seeded shuffle of the round number, say — is a design where somebody who works out the seed buys a
// winning ticket every round, and "nobody knows the algorithm" is not a thing to bet a gold economy on.
//
// No scheduler and no cron: a round is arithmetic on the clock, and it resolves when somebody next looks.

/** How long bets stay open. Short enough that a solo player is not sat waiting, long enough to be shared. */
export const ROUND_MS = { keno: 45_000 };

export const roundOf = (game, nowMs) => Math.floor(nowMs / (ROUND_MS[game] || 45_000));
export const roundEndsAt = (game, round) => (round + 1) * (ROUND_MS[game] || 45_000);

/**
 * The outcome of a CLOSED round, rolled once and shared by everyone in it.
 *
 * `roll` is only ever called for a round that has already ended, and its result is written with
 * ON CONFLICT DO NOTHING — so two players arriving at the same moment cannot produce two different draws.
 * The insert is the thing that decides; the read after it is what everybody gets.
 */
export async function outcomeFor(game, round, roll) {
    const now = Date.now();
    if (roundEndsAt(game, round) > now) return null;   // still open — there is nothing to know yet

    const have = await db.queryOne(
        `SELECT outcome FROM mkt_casino_round WHERE game = $1 AND round = $2`, [game, round],
    ).catch(() => null);
    if (have) return typeof have.outcome === "string" ? JSON.parse(have.outcome) : have.outcome;

    const outcome = roll();
    await db.query(
        `INSERT INTO mkt_casino_round (game, round, outcome) VALUES ($1, $2, $3) ON CONFLICT (game, round) DO NOTHING`,
        [game, round, JSON.stringify(outcome)],
    ).catch(() => {});
    // Read back rather than trusting the local roll: if somebody else won the race, theirs is the draw and
    // this player must be scored against the same one. Returning the local roll here would be the bug where
    // two people in one round see two different sets of balls.
    const settled = await db.queryOne(
        `SELECT outcome FROM mkt_casino_round WHERE game = $1 AND round = $2`, [game, round],
    ).catch(() => null);
    if (!settled) return outcome;
    return typeof settled.outcome === "string" ? JSON.parse(settled.outcome) : settled.outcome;
}

/** Place a bet into the round that is currently open. The stake is taken here; nothing is scored yet. */
export async function placeBet(buyerId, game, { stake, choice, reason }) {
    const round = roundOf(game, Date.now());
    const paid = await db.queryOne(
        `UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`,
        [buyerId, stake],
    ).catch(() => null);
    if (!paid) return { ok: false, error: "no_gold" };
    await logCoin(buyerId, -stake, reason, { balanceAfter: paid.gold, meta: { bet: stake, round: String(round), choice } });

    const row = await db.queryOne(
        `INSERT INTO mkt_casino_bet (buyer_id, game, round, stake, choice) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [buyerId, game, round, stake, JSON.stringify(choice)],
    ).catch(() => null);
    if (!row) {
        // The stake is already gone, so it goes straight back. A bet that could not be recorded is a bet that
        // never happened — and with a round to wait for, an unrecorded bet is one nobody would ever notice.
        const back = await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`, [buyerId, stake]).catch(() => null);
        await logCoin(buyerId, stake, `${reason}_void`, { balanceAfter: back?.gold ?? null });
        return { ok: false, error: "bet_failed" };
    }
    return { ok: true, id: String(row.id), round, gold: paid.gold, closesAt: roundEndsAt(game, round) };
}

/**
 * Score every bet of this member's whose round has closed, and pay them.
 *
 * Runs on any request that touches the game — placing the next bet, or just looking at the room. That is what
 * makes a scheduler unnecessary: nothing has to happen at the moment a round ends, it only has to have
 * happened by the time anybody asks.
 *
 * `score(choice, outcome)` returns `{ won, detail }`, where `won` is the TOTAL returned including the stake.
 */
export async function settleBets(buyerId, game, { roll, score, reason }) {
    if (!buyerId) return [];
    const now = Date.now();
    const current = roundOf(game, now);
    const rows = await db.query(
        `SELECT id, round, stake, choice FROM mkt_casino_bet
          WHERE buyer_id = $1 AND game = $2 AND status = 'open' AND round < $3
          ORDER BY round ASC LIMIT 25`,
        [buyerId, game, current],
    ).catch(() => []);
    if (!rows.length) return [];

    const results = [];
    for (const row of rows) {
        const outcome = await outcomeFor(game, Number(row.round), roll);
        if (!outcome) continue;
        const choice = typeof row.choice === "string" ? JSON.parse(row.choice) : row.choice;
        const { won, detail } = score(choice, outcome, row.stake);

        // Marked settled FIRST, and only paid if this request is the one that marked it. Two requests
        // arriving together would otherwise both score the same bet and pay it twice — which is the shape of
        // every duplicate-payout bug there has ever been.
        const claimed = await db.queryOne(
            `UPDATE mkt_casino_bet SET status = 'done', won = $3, detail = $4, settled_at = NOW()
              WHERE id = $2 AND buyer_id = $1 AND status = 'open' RETURNING id`,
            [buyerId, row.id, won, JSON.stringify(detail || null)],
        ).catch(() => null);
        if (!claimed) continue;

        if (won > 0) {
            const back = await db.queryOne(
                `UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`, [buyerId, won],
            ).catch(() => null);
            if (back) {
                await logCoin(buyerId, won, reason, {
                    balanceAfter: back.gold,
                    meta: { bet: row.stake, round: String(row.round), won },
                });
            }
        }
        results.push({ id: String(row.id), round: Number(row.round), stake: row.stake, choice, outcome, won, detail });
    }
    return results;
}

/** The bets this member still has riding on an open round. */
export async function openBets(buyerId, game) {
    if (!buyerId) return [];
    const rows = await db.query(
        `SELECT id, round, stake, choice FROM mkt_casino_bet WHERE buyer_id = $1 AND game = $2 AND status = 'open' ORDER BY id ASC`,
        [buyerId, game],
    ).catch(() => []);
    return rows.map((r) => ({
        id: String(r.id),
        round: Number(r.round),
        stake: r.stake,
        choice: typeof r.choice === "string" ? JSON.parse(r.choice) : r.choice,
        closesAt: roundEndsAt(game, Number(r.round)),
    }));
}

/** Who else is in the round that is open right now — the entire reason these games are shared. */
export async function roundPlayers(game, round) {
    const rows = await db.query(
        `SELECT b.display_name, b.alias, COUNT(*)::int AS bets
           FROM mkt_casino_bet c JOIN mkt_buyer b ON b.id = c.buyer_id
          WHERE c.game = $1 AND c.round = $2
          GROUP BY b.display_name, b.alias ORDER BY MIN(c.id) ASC LIMIT 12`,
        [game, round],
    ).catch(() => []);
    return rows.map((r) => ({ name: r.alias || r.display_name || "Someone", bets: r.bets }));
}
