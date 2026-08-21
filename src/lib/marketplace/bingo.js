import "server-only";

import { db } from "@/lib/db";
import { logCoin } from "@/lib/marketplace/coins.js";
import {
    BINGO_PAYS, DRAWN, ROUND_MS, drawFor, makeCard, roundEndsAt, roundOf, scoreCard,
} from "@/lib/marketplace/bingo-kit.js";
import { casinoPerks, rollCasinoPrize, tickCasinoQuests, withCasinoPerk } from "@/lib/marketplace/casino.js";
import { maybeGrantCasinoPet } from "@/lib/marketplace/pet-drops.js";

// ── THE BINGO HALL ───────────────────────────────────────────────────────────────────────────────────────────
// The money half. The rules and the maths are in bingo-kit.js, which knows nothing about gold — same split as
// blackjack, and for the same reason: check:bingo deals two million cards through the real scoring function,
// and it cannot do that through a module that needs a database.
//
// NO TABLE. This game has a round, a draw and a set of players, and stores none of them:
//   • the round is `roundOf(Date.now())` — arithmetic on the clock, no row, no scheduler;
//   • the draw is a seeded shuffle of the round number, so every server computes the same forty balls;
//   • who else is playing is COUNTED OFF THE COIN LEDGER, which was already recording every buy-in.
// A migration that adds a table to store things that can be derived is a migration that adds a second thing
// to keep in step with the first.

const CARD_MIN = 25;
const CARD_MAX = 2500;
const clampBet = (v) => Math.max(CARD_MIN, Math.min(CARD_MAX, Math.round(Number(v) || 0)));

// Mixed into the round number before the shuffle. Not a secret in any meaningful sense — a random card
// against a known draw has identical odds, so there is nothing here to protect — but it stops the numbers
// being a plain function of the clock, which would invite somebody to "verify" them and conclude the game
// was rigged when their own shuffle disagreed.
const DRAW_SALT = 0x5730_1d;

/** Everybody who bought a card in a given round, read off the ledger rather than a table of its own. */
async function playersIn(round) {
    const rows = await db.query(
        `SELECT c.buyer_id, b.display_name, b.alias, COUNT(*)::int AS cards
           FROM mkt_coin_event c JOIN mkt_buyer b ON b.id = c.buyer_id
          WHERE c.reason = 'casino_bingo_bet' AND c.meta->>'round' = $1
          GROUP BY c.buyer_id, b.display_name, b.alias
          ORDER BY MIN(c.created_at) ASC LIMIT 12`,
        [String(round)],
    ).catch(() => []);
    return rows.map((r) => ({ id: r.buyer_id, name: r.alias || r.display_name || "Someone", cards: r.cards }));
}

/**
 * The hall as it stands right now: which round is running, how long is left on it, and who is in it.
 *
 * `draw` is deliberately ABSENT. Not because seeing it would help anybody — it would not, the card is random
 * relative to it — but because the client animates the balls coming out, and a screen that has been handed
 * the answer has no reason to wait for it.
 */
export async function bingoState(buyerId) {
    const now = Date.now();
    const round = roundOf(now);
    return {
        round,
        msLeft: Math.max(0, roundEndsAt(round) - now),
        roundMs: ROUND_MS,
        balls: DRAWN,
        pays: BINGO_PAYS,
        cardMin: CARD_MIN,
        cardMax: CARD_MAX,
        players: await playersIn(round),
        you: buyerId || null,
    };
}

/**
 * BUY A CARD.
 *
 * One round trip does the whole thing: takes the stake, deals a card, scores it against the round's forty
 * balls and pays. The DRAW takes three minutes on screen but nothing is pending — the outcome was decided
 * the moment the card existed, which is the honest version of a ceremony. Nothing the player does between
 * now and the last ball can change it, so pretending otherwise by holding the result back would only mean
 * the game could lose it.
 *
 * Buying more than one card in a round is allowed, because that is what people do in a bingo hall.
 */
export async function buyBingoCard(buyerId, { bet } = {}) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const stake = clampBet(bet);
    const now = Date.now();
    const round = roundOf(now);

    const perks = await casinoPerks(buyerId);
    const paid = await db.queryOne(
        `UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`,
        [buyerId, stake],
    ).catch(() => null);
    if (!paid) return { ok: false, error: "no_gold" };
    // `round` is stamped on the row because it is what playersIn counts. This is the only record that the
    // round ever had anybody in it.
    await logCoin(buyerId, -stake, "casino_bingo_bet", { balanceAfter: paid.gold, meta: { bet: stake, round: String(round) } });

    let onHouse = false;
    if ((perks.freePlay || 0) > 0 && Math.random() < perks.freePlay) {
        const back = await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`, [buyerId, stake]).catch(() => null);
        if (back) {
            onHouse = true;
            paid.gold = back.gold;
            await logCoin(buyerId, stake, "casino_on_the_house", { balanceAfter: back.gold, meta: { game: "bingo" } });
        }
    }

    const card = makeCard();
    const drawn = drawFor(round, DRAW_SALT);
    const score = scoreCard(card, drawn);
    const won = Math.round(stake * score.mult);

    let gold = paid.gold;
    if (won > 0) {
        const back = await db.queryOne(
            `UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`,
            [buyerId, won],
        ).catch(() => null);
        if (back) {
            gold = back.gold;
            await logCoin(buyerId, won, "casino_bingo_win", {
                balanceAfter: gold,
                meta: { bet: stake, tier: score.tier, lines: score.lines.length, round: String(round) },
            });
        }
    }

    // Six lines or more is this game's rarest good thing — about one card in seven thousand — so it is what
    // counts as the jackpot for the prize shelf.
    const prize = await rollCasinoPrize(buyerId, { jackpot: score.lines.length >= 6, perks });
    await tickCasinoQuests(buyerId, "bingo", won);
    const pet = withCasinoPerk(await maybeGrantCasinoPet(buyerId).catch(() => null));

    return {
        ok: true,
        round,
        msLeft: Math.max(0, roundEndsAt(round) - now),
        card,
        drawn,
        // The winning lines, so the card can light them up rather than making somebody find them.
        lines: score.lines.map((l) => ({ kind: l.kind, i: l.i })),
        corners: score.corners,
        tier: score.tier,
        label: score.label,
        mult: score.mult,
        bet: stake,
        won,
        gold,
        prize,
        pet,
        onHouse,
    };
}
