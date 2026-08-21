import "server-only";

import { db } from "@/lib/db";
import { logCoin } from "@/lib/marketplace/coins.js";
import {
    freshShoe, handValue, isBlackjack, playDealer, settleHand, canSplit, pairValue, BLACKJACK_RAKE,
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
// THE ONE RULE THAT MATTERS HERE: the shoe never leaves the server. `publicView` below is the only thing any
// caller is allowed to hand back, and while a hand is open it shows exactly one of the dealer's cards. A
// blackjack table that ships the remaining deck to the browser is not a card game.
//
// A ROW HOLDS A LIST OF HANDS, not a hand. Splitting forks one hand into two played in order, so every verb
// below acts on `hands[active]` and the turn ends when `active` runs off the end of the list. One hand is the
// list of length one; there is no separate un-split path to keep in step.

const MIN_BET = 25;
const MAX_BET = 2500;
const clampBet = (v) => Math.max(MIN_BET, Math.min(MAX_BET, Math.round(Number(v) || 0)));

const parse = (v, fallback) => {
    try { return typeof v === "string" ? JSON.parse(v) : (v ?? fallback); } catch { return fallback; }
};

const handsOf = (row) => parse(row?.hands, []);

/**
 * What the player is allowed to see. While the hand is open the hole card is not merely hidden in the UI —
 * it is absent from the payload, because "hidden in the UI" is a thing anybody can open devtools and read.
 */
function publicView(row, { reveal = false } = {}) {
    if (!row) return null;
    const hands = handsOf(row);
    const dealer = parse(row.dealer, []);
    const open = row.status === "open";
    const shown = open && !reveal ? dealer.slice(0, 1) : dealer;
    const active = Number(row.active) || 0;

    return {
        id: String(row.id),
        stake: row.stake,
        open,
        active,
        hands: hands.map((h, i) => ({
            cards: h.cards || [],
            value: handValue(h.cards || []),
            doubled: Boolean(h.doubled),
            fromSplit: Boolean(h.fromSplit),
            outcome: h.outcome || null,
            won: h.won || 0,
            rake: h.rake || 0,
            // Only the hand being played can be acted on, and only its first two cards can be doubled or
            // split. Sent as flags rather than left for the client to work out, so the buttons and the
            // server can never disagree about what is legal.
            isActive: open && i === active,
            canDouble: open && i === active && (h.cards || []).length === 2 && !h.doubled && !h.splitAces,
            canSplit: open && i === active && hands.length === 1
                && canSplit(h.cards || [], Boolean(h.fromSplit)),
        })),
        // The dealer's total is computed from WHAT IS SHOWN, so an open hand cannot leak the hole card by
        // arithmetic — a total of 19 next to a single visible 9 tells you everything the card would have.
        dealer: shown,
        dealerValue: handValue(shown),
        dealerHidden: open && dealer.length > shown.length,
        outcome: row.outcome || null,
        won: row.won || 0,
        rake: row.rake || 0,
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

const saveHands = (buyerId, row, hands, active) => db.queryOne(
    `UPDATE mkt_casino_hand SET hands = $3, active = $4 WHERE id = $2 AND buyer_id = $1 AND status = 'open' RETURNING *`,
    [buyerId, row.id, JSON.stringify(hands), active],
).catch(() => null);

// ── PAYING THE HANDS OUT ─────────────────────────────────────────────────────────────────────────────────────
// The stakes are already gone when this runs (taken at the deal, and again on a double or a split), so `back`
// is the whole return: nothing on a loss, the stake on a push, stake plus raked winnings otherwise.
//
// EVERY HAND IS PAID IN ONE CREDIT. Two hands could be two writes, and on a floor with no transactions two
// writes is one more chance to hand somebody half a payout — so they are summed and paid once.
async function settleAll(buyerId, row, dealerCards, hands) {
    const results = hands.map((h) => settleHand({
        player: h.cards, dealer: dealerCards, stake: row.stake, doubled: h.doubled, fromSplit: h.fromSplit,
    }));
    const back = results.reduce((n, r) => n + r.back, 0);
    const won = results.reduce((n, r) => n + r.won, 0);
    const rake = results.reduce((n, r) => n + r.rake, 0);

    let gold = null;
    if (back > 0) {
        const paid = await db.queryOne(
            `UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`, [buyerId, back],
        ).catch(() => null);
        gold = paid?.gold ?? null;
        if (paid) {
            await logCoin(buyerId, back, "casino_blackjack_win", {
                balanceAfter: gold,
                meta: { bet: results.reduce((n, r) => n + r.bet, 0), outcomes: results.map((r) => r.outcome), won, rake, hands: hands.length },
            });
        }
    }
    if (gold == null) {
        const g = await db.queryOne(`SELECT gold FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
        gold = g?.gold ?? 0;
    }

    const finished = hands.map((h, i) => ({ ...h, outcome: results[i].outcome, won: results[i].won, rake: results[i].rake }));
    // The row's own outcome is the first hand's when there is one hand, and "split" when there are two —
    // the per-hand outcomes are on the hands, and inventing a combined word for two different results would
    // be a label that describes neither.
    const outcome = finished.length === 1 ? results[0].outcome : "split";

    const done = await db.queryOne(
        `UPDATE mkt_casino_hand
            SET status = 'done', dealer = $3, hands = $4, outcome = $5, won = $6, rake = $7, settled_at = NOW()
          WHERE id = $2 AND buyer_id = $1 AND status = 'open'
      RETURNING *`,
        [buyerId, row.id, JSON.stringify(dealerCards), JSON.stringify(finished), outcome, won, rake],
    ).catch(() => null);

    const shape = done || { ...row, status: "done", dealer: dealerCards, hands: finished, outcome, won, rake };

    // The rest of the floor's furniture: bounties tick, a prize can land, and the five pets are in play here
    // exactly as they are at every other machine. A hand of blackjack is one play — a hit is not, and neither
    // is the second half of a split — which is why this lives in settlement and not in the action handlers.
    const perks = await casinoPerks(buyerId);
    await tickCasinoQuests(buyerId, "blackjack", won);
    // A natural twenty-one is this table's jackpot: it is the rarest good outcome and the one worth a prize.
    const prize = await rollCasinoPrize(buyerId, { jackpot: results.some((r) => r.outcome === "blackjack"), perks });
    const pet = withCasinoPerk(await maybeGrantCasinoPet(buyerId).catch(() => null));

    return { hand: publicView(shape, { reveal: true }), gold, won, outcome, prize, pet };
}

/**
 * The turn moves on. When it runs off the end of the list the dealer turns over and everything settles.
 *
 * The dealer plays ONCE against however many hands are on the table, and only if any of them survived —
 * drawing cards to beat a pair of busts is theatre that can only cost the house money it already won.
 */
async function advance(buyerId, row, hands, active) {
    const next = active + 1;
    if (next < hands.length) {
        const saved = await saveHands(buyerId, row, hands, next);
        return { ok: true, hand: publicView(saved || { ...row, hands, active: next }) };
    }
    const shoe = parse(row.shoe, []);
    const alive = hands.some((h) => !handValue(h.cards).bust);
    const dealer = alive ? playDealer(parse(row.dealer, []), shoe) : parse(row.dealer, []);
    const s = await settleAll(buyerId, row, dealer, hands);
    return { ok: true, gold: s.gold, hand: s.hand, bet: row.stake, won: s.won, outcome: s.outcome, prize: s.prize, pet: s.pet };
}

/** Take one stake. Returns the new balance, or null if it could not be paid. */
const takeStake = async (buyerId, stake, meta) => {
    const paid = await db.queryOne(
        `UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`,
        [buyerId, stake],
    ).catch(() => null);
    if (!paid) return null;
    await logCoin(buyerId, -stake, "casino_blackjack_bet", { balanceAfter: paid.gold, meta });
    return paid;
};

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
    if (existing) return { ok: true, resumed: true, hand: publicView(existing) };

    const stake = clampBet(bet);
    const paid = await takeStake(buyerId, stake, { bet: stake });
    if (!paid) return { ok: false, error: "no_gold" };

    const shoe = freshShoe();
    const player = [shoe.pop(), shoe.pop()];
    const dealer = [shoe.pop(), shoe.pop()];
    const hands = [{ cards: player, doubled: false, fromSplit: false, splitAces: false }];

    const row = await db.queryOne(
        `INSERT INTO mkt_casino_hand (buyer_id, stake, shoe, hands, dealer, active)
         VALUES ($1, $2, $3, $4, $5, 0) RETURNING *`,
        [buyerId, stake, JSON.stringify(shoe), JSON.stringify(hands), JSON.stringify(dealer)],
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
        const s = await settleAll(buyerId, row, dealer, hands);
        return { ok: true, natural: true, gold: s.gold, hand: s.hand, bet: stake, won: s.won, outcome: s.outcome, prize: s.prize, pet: s.pet };
    }
    return { ok: true, gold: paid.gold, hand: publicView(row), bet: stake };
}

/** HIT. One card to the hand in play. Busting moves the turn on rather than making somebody press stand on a
 *  dead hand. */
export async function hitBlackjack(buyerId) {
    const row = await openHand(buyerId);
    if (!row) return { ok: false, error: "no_hand" };
    const hands = handsOf(row);
    const active = Number(row.active) || 0;
    const hand = hands[active];
    if (!hand) return { ok: false, error: "no_hand" };

    const shoe = parse(row.shoe, []);
    hand.cards = [...hand.cards, shoe.pop()];

    const saved = await db.queryOne(
        `UPDATE mkt_casino_hand SET shoe = $3, hands = $4 WHERE id = $2 AND buyer_id = $1 AND status = 'open' RETURNING *`,
        [buyerId, row.id, JSON.stringify(shoe), JSON.stringify(hands)],
    ).catch(() => null);
    if (!saved) return { ok: false, error: "no_hand" };

    if (handValue(hand.cards).bust) return advance(buyerId, saved, hands, active);
    return { ok: true, hand: publicView(saved) };
}

/** STAND. This hand is finished; the turn moves on. */
export async function standBlackjack(buyerId) {
    const row = await openHand(buyerId);
    if (!row) return { ok: false, error: "no_hand" };
    return advance(buyerId, row, handsOf(row), Number(row.active) || 0);
}

/**
 * DOUBLE. Twice the bet on this hand, exactly one more card, and the turn moves on.
 *
 * The second stake is taken with the same `gold >= $2` guard as the first, and if it does not come back
 * nothing happens at all — the alternative is a doubled hand somebody did not pay for.
 */
export async function doubleBlackjack(buyerId) {
    const row = await openHand(buyerId);
    if (!row) return { ok: false, error: "no_hand" };
    const hands = handsOf(row);
    const active = Number(row.active) || 0;
    const hand = hands[active];
    if (!hand || hand.cards.length !== 2 || hand.doubled || hand.splitAces) return { ok: false, error: "cannot_double" };

    const paid = await takeStake(buyerId, row.stake, { bet: row.stake, doubled: true });
    if (!paid) return { ok: false, error: "no_gold" };

    const shoe = parse(row.shoe, []);
    hand.cards = [...hand.cards, shoe.pop()];
    hand.doubled = true;

    const saved = await db.queryOne(
        `UPDATE mkt_casino_hand SET shoe = $3, hands = $4 WHERE id = $2 AND buyer_id = $1 AND status = 'open' RETURNING *`,
        [buyerId, row.id, JSON.stringify(shoe), JSON.stringify(hands)],
    ).catch(() => null);
    if (!saved) return { ok: false, error: "no_hand" };
    return advance(buyerId, saved, hands, active);
}

/**
 * SPLIT. One pair becomes two hands, played in order, for a second stake of the same size.
 *
 * ONCE ONLY. `canSplit` refuses a hand that already came from a split, so the most this can ever be is two
 * hands — every extra fork multiplies the states this file can lose track of somebody's gold in, and a
 * fourth hand is not worth that.
 *
 * SPLIT ACES GET ONE CARD EACH and the turn is over. Without that rule, splitting aces is the most
 * profitable thing anybody can do at a blackjack table and the rake was not priced for it.
 */
export async function splitBlackjack(buyerId) {
    const row = await openHand(buyerId);
    if (!row) return { ok: false, error: "no_hand" };
    const hands = handsOf(row);
    const active = Number(row.active) || 0;
    const hand = hands[active];
    if (!hand || hands.length !== 1 || !canSplit(hand.cards, hand.fromSplit)) return { ok: false, error: "cannot_split" };

    const paid = await takeStake(buyerId, row.stake, { bet: row.stake, split: true });
    if (!paid) return { ok: false, error: "no_gold" };

    const shoe = parse(row.shoe, []);
    const splitAces = pairValue(hand.cards[0]) === 11;
    const split = hand.cards.map((card) => ({
        cards: [card, shoe.pop()],
        doubled: false,
        fromSplit: true,
        splitAces,
    }));

    const saved = await db.queryOne(
        `UPDATE mkt_casino_hand SET shoe = $3, hands = $4, active = 0 WHERE id = $2 AND buyer_id = $1 AND status = 'open' RETURNING *`,
        [buyerId, row.id, JSON.stringify(shoe), JSON.stringify(split)],
    ).catch(() => null);
    if (!saved) return { ok: false, error: "no_hand" };

    // Aces: both hands are complete the moment they are dealt, so the turn is already over.
    if (splitAces) {
        const shoeNow = parse(saved.shoe, []);
        const dealer = playDealer(parse(saved.dealer, []), shoeNow);
        const s = await settleAll(buyerId, saved, dealer, split);
        return { ok: true, gold: s.gold, hand: s.hand, bet: row.stake * 2, won: s.won, outcome: s.outcome, prize: s.prize, pet: s.pet };
    }
    return { ok: true, hand: publicView(saved) };
}

/** The table as the room needs it: whatever hand is in progress, or nothing. */
export async function blackjackState(buyerId) {
    const row = await openHand(buyerId);
    return { hand: row ? publicView(row) : null, rakeRate: BLACKJACK_RAKE, minBet: MIN_BET, maxBet: MAX_BET };
}
