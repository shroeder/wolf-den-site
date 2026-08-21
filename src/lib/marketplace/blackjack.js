import "server-only";

import { db } from "@/lib/db";
import { logCoin } from "@/lib/marketplace/coins.js";
import {
    freshShoe, handValue, isBlackjack, playDealer, settleHand, BLACKJACK_RAKE,
} from "@/lib/marketplace/blackjack-kit.js";
// The table is a machine on the same floor, so it pays into the same three things every other machine does.
// Imported one way only: casino.js knows nothing about blackjack, which keeps the cycle from ever existing.
import { casinoPerks, rollCasinoPrize, tickCasinoQuests, withCasinoPerk } from "@/lib/marketplace/casino.js";
import { maybeGrantCasinoPet } from "@/lib/marketplace/pet-drops.js";

// ── THE TABLE ────────────────────────────────────────────────────────────────────────────────────────────────
// The rules and the maths live in blackjack-kit.js, which knows nothing about gold or the database. This file
// is the half that moves money, and it is separate for the same reason arena-engine is separate from arena.js:
// the check script has to be able to play two million hands of the real game, and it cannot do that through a
// module that needs a database on the other end.
//
// THE ONE RULE THAT MATTERS HERE: the shoe never leaves the server. `publicHand` below is the only thing any
// caller is allowed to hand back, and while a hand is open it shows exactly one of the dealer's cards. A
// blackjack table that ships the remaining deck to the browser is not a card game.

const MIN_BET = 25;
const MAX_BET = 2500;
const clampBet = (v) => Math.max(MIN_BET, Math.min(MAX_BET, Math.round(Number(v) || 0)));

const parse = (v, fallback) => {
    try { return typeof v === "string" ? JSON.parse(v) : (v ?? fallback); } catch { return fallback; }
};

/**
 * What the player is allowed to see. While the hand is open the hole card is not merely hidden in the UI —
 * it is absent from the payload, because "hidden in the UI" is a thing anybody can open devtools and read.
 */
function publicHand(row, { reveal = false } = {}) {
    if (!row) return null;
    const player = parse(row.player, []);
    const dealer = parse(row.dealer, []);
    const open = row.status === "open";
    const shown = open && !reveal ? dealer.slice(0, 1) : dealer;
    return {
        id: String(row.id),
        stake: row.stake,
        doubled: row.doubled,
        open,
        player,
        playerValue: handValue(player),
        // The dealer's total is computed from WHAT IS SHOWN, so an open hand cannot leak the hole card by
        // arithmetic — a total of 19 next to a single visible 9 tells you everything the card would have.
        dealer: shown,
        dealerValue: handValue(shown),
        dealerHidden: open && dealer.length > shown.length,
        outcome: row.outcome || null,
        won: row.won || 0,
        rake: row.rake || 0,
        canDouble: open && player.length === 2 && !row.doubled,
        rakeRate: BLACKJACK_RAKE,
    };
}

/** The hand in progress, if there is one. */
export async function openHand(buyerId) {
    if (!buyerId) return null;
    const row = await db.queryOne(
        `SELECT * FROM mkt_casino_hand WHERE buyer_id = $1 AND status = 'open' ORDER BY id DESC LIMIT 1`,
        [buyerId],
    ).catch(() => null);
    return row || null;
}

// ── PAYING THE HAND OUT ──────────────────────────────────────────────────────────────────────────────────────
// The stake is already gone when this runs (taken at the deal, and again on a double), so `back` is the whole
// return: nothing on a loss, the stake on a push, stake plus raked winnings otherwise. Written as one credit
// rather than as a refund plus a win, because two writes on a floor with no transactions is one more chance
// to hand somebody half a payout.
async function settle(buyerId, row, dealerCards) {
    const player = parse(row.player, []);
    const result = settleHand({ player, dealer: dealerCards, stake: row.stake, doubled: row.doubled });

    let gold = null;
    if (result.back > 0) {
        const back = await db.queryOne(
            `UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`,
            [buyerId, result.back],
        ).catch(() => null);
        gold = back?.gold ?? null;
        if (back) {
            await logCoin(buyerId, result.back, "casino_blackjack_win", {
                balanceAfter: gold,
                meta: { bet: result.bet, outcome: result.outcome, won: result.won, rake: result.rake },
            });
        }
    }
    if (gold == null) {
        const g = await db.queryOne(`SELECT gold FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
        gold = g?.gold ?? 0;
    }

    const done = await db.queryOne(
        `UPDATE mkt_casino_hand
            SET status = 'done', dealer = $3, outcome = $4, won = $5, rake = $6, settled_at = NOW()
          WHERE id = $2 AND buyer_id = $1 AND status = 'open'
      RETURNING *`,
        [buyerId, row.id, JSON.stringify(dealerCards), result.outcome, result.won, result.rake],
    ).catch(() => null);

    const shape = done || { ...row, status: "done", dealer: dealerCards, outcome: result.outcome, won: result.won, rake: result.rake };

    // The rest of the floor's furniture: bounties tick, a prize can land, and the five pets are in play here
    // exactly as they are at every other machine. A hand of blackjack is one play — a hit is not, which is
    // why this lives in settle and not in the action handlers.
    const perks = await casinoPerks(buyerId);
    await tickCasinoQuests(buyerId, "blackjack", result.won);
    // A natural twenty-one is this table's jackpot: it is the rarest good outcome and the one worth a prize.
    const prize = await rollCasinoPrize(buyerId, { jackpot: result.outcome === "blackjack", perks });
    const pet = withCasinoPerk(await maybeGrantCasinoPet(buyerId).catch(() => null));

    return { hand: publicHand(shape, { reveal: true }), gold, result, prize, pet };
}

/**
 * DEAL.
 *
 * The stake is taken atomically before a card exists, the same way every other machine on this floor takes
 * one. If an open hand is already sitting there it is handed BACK rather than replaced — a second deal that
 * silently abandoned a live hand would be a way to lose a stake by double-tapping.
 */
export async function dealBlackjack(buyerId, { bet } = {}) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };

    const existing = await openHand(buyerId);
    if (existing) return { ok: true, resumed: true, hand: publicHand(existing) };

    const stake = clampBet(bet);
    const paid = await db.queryOne(
        `UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`,
        [buyerId, stake],
    ).catch(() => null);
    if (!paid) return { ok: false, error: "no_gold" };
    await logCoin(buyerId, -stake, "casino_blackjack_bet", { balanceAfter: paid.gold, meta: { bet: stake } });

    const shoe = freshShoe();
    const player = [shoe.pop(), shoe.pop()];
    const dealer = [shoe.pop(), shoe.pop()];

    const row = await db.queryOne(
        `INSERT INTO mkt_casino_hand (buyer_id, stake, shoe, player, dealer)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [buyerId, stake, JSON.stringify(shoe), JSON.stringify(player), JSON.stringify(dealer)],
    ).catch(() => null);
    // The stake is already gone if this fails, so it goes straight back. A hand that could not be recorded is
    // a hand that never happened.
    if (!row) {
        const back = await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`, [buyerId, stake]).catch(() => null);
        await logCoin(buyerId, stake, "casino_blackjack_void", { balanceAfter: back?.gold ?? null });
        return { ok: false, error: "deal_failed" };
    }

    // A natural on either side ends it immediately — there is no turn to take.
    if (isBlackjack(player) || isBlackjack(dealer)) {
        const s = await settle(buyerId, row, dealer);
        return { ok: true, natural: true, gold: s.gold, hand: s.hand, bet: stake, won: s.result.won, outcome: s.result.outcome, prize: s.prize, pet: s.pet };
    }
    return { ok: true, gold: paid.gold, hand: publicHand(row), bet: stake };
}

/** HIT. One card. Busting settles on the spot rather than making somebody press stand on a dead hand. */
export async function hitBlackjack(buyerId) {
    const row = await openHand(buyerId);
    if (!row) return { ok: false, error: "no_hand" };

    const shoe = parse(row.shoe, []);
    const player = [...parse(row.player, []), shoe.pop()];
    const busted = handValue(player).bust;

    const saved = await db.queryOne(
        `UPDATE mkt_casino_hand SET shoe = $3, player = $4 WHERE id = $2 AND buyer_id = $1 AND status = 'open' RETURNING *`,
        [buyerId, row.id, JSON.stringify(shoe), JSON.stringify(player)],
    ).catch(() => null);
    if (!saved) return { ok: false, error: "no_hand" };

    if (busted) {
        const s = await settle(buyerId, saved, parse(saved.dealer, []));
        return { ok: true, gold: s.gold, hand: s.hand, bet: saved.stake, won: 0, outcome: s.result.outcome, prize: s.prize, pet: s.pet };
    }
    return { ok: true, hand: publicHand(saved) };
}

/** STAND. The dealer turns over and plays out the only rule it has. */
export async function standBlackjack(buyerId) {
    const row = await openHand(buyerId);
    if (!row) return { ok: false, error: "no_hand" };
    const shoe = parse(row.shoe, []);
    const dealer = playDealer(parse(row.dealer, []), shoe);
    const s = await settle(buyerId, row, dealer);
    return { ok: true, gold: s.gold, hand: s.hand, bet: row.stake, won: s.result.won, outcome: s.result.outcome, prize: s.prize, pet: s.pet };
}

/**
 * DOUBLE. Twice the bet, exactly one more card, and the turn is over.
 *
 * The second stake is taken with the same `gold >= $2` guard as the first, and if it does not come back the
 * hand simply continues undoubled — the alternative is a doubled hand somebody did not pay for.
 */
export async function doubleBlackjack(buyerId) {
    const row = await openHand(buyerId);
    if (!row) return { ok: false, error: "no_hand" };
    const player0 = parse(row.player, []);
    if (player0.length !== 2 || row.doubled) return { ok: false, error: "cannot_double" };

    const paid = await db.queryOne(
        `UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`,
        [buyerId, row.stake],
    ).catch(() => null);
    if (!paid) return { ok: false, error: "no_gold" };
    await logCoin(buyerId, -row.stake, "casino_blackjack_bet", { balanceAfter: paid.gold, meta: { bet: row.stake, doubled: true } });

    const shoe = parse(row.shoe, []);
    const player = [...player0, shoe.pop()];
    const saved = await db.queryOne(
        `UPDATE mkt_casino_hand SET shoe = $3, player = $4, doubled = TRUE WHERE id = $2 AND buyer_id = $1 AND status = 'open' RETURNING *`,
        [buyerId, row.id, JSON.stringify(shoe), JSON.stringify(player)],
    ).catch(() => null);
    if (!saved) return { ok: false, error: "no_hand" };

    // Busting on the double still ends the hand; otherwise the dealer plays as if you had stood.
    const dealer = handValue(player).bust ? parse(saved.dealer, []) : playDealer(parse(saved.dealer, []), shoe);
    const s = await settle(buyerId, saved, dealer);
    return { ok: true, gold: s.gold, hand: s.hand, bet: saved.stake * 2, won: s.result.won, outcome: s.result.outcome, prize: s.prize, pet: s.pet };
}

/** The table as the room needs it: whatever hand is in progress, or nothing. */
export async function blackjackState(buyerId) {
    const row = await openHand(buyerId);
    return { hand: row ? publicHand(row) : null, rakeRate: BLACKJACK_RAKE, minBet: MIN_BET, maxBet: MAX_BET };
}
