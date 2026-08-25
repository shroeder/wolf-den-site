import "server-only";

import { db } from "@/lib/db";
import { logCoin } from "@/lib/marketplace/coins.js";
import {
    BINGO_PAYS, DRAWN, DRAGON_CHANCE, burntOf, dragonFor, drawFor, makeCard, scoreCard,
} from "@/lib/marketplace/bingo-kit.js";
import { casinoPerks, rollCasinoPrize, tickCasinoQuests, withCasinoPerk } from "@/lib/marketplace/casino.js";
import { maybeGrantCasinoPet } from "@/lib/marketplace/pet-drops.js";
// Gold in, chips out — see the long note in blackjack.js. The stake is still gold because gold staked is what
// chips are made of; the payout is chips because chips are what this floor pays.
import { moveChips, chipsFor, chipBalance, CHIP_RATE } from "@/lib/marketplace/chips.js";

// ── THE BINGO HALL ───────────────────────────────────────────────────────────────────────────────────────────
// The money half. The rules and the maths are in bingo-kit.js, which knows nothing about gold or chips — same
// split as blackjack, and for the same reason: check:bingo deals two million cards through the real scoring
// function, and it cannot do that through a module that needs a database.
//
// NO TABLE, AND NOW NO ROUND EITHER. This used to run a shared three-minute round: everybody who bought in the
// same window played the same forty balls, and who was in it was counted off the coin ledger. Luke: "you can
// remove all multiplayer for many of the games that we had previously tried to do." The long version of why is
// at the top of bingo-kit.js; the short version is that a shared round on an empty floor is not a ritual, it
// is a three-minute wait for company that is not there — and his own screenshot of the hall said "nobody yet".
//
// So a card is dealt, drawn and settled in one round trip. It has its own forty balls from its own seed, the
// dragon either comes or does not, and the whole thing is over before the player's thumb leaves the button.
// What is on screen after that is an ANIMATION of something already decided, which is what it always was.

const CARD_MIN = 25;
const CARD_MAX = 2500;
const clampBet = (v) => Math.max(CARD_MIN, Math.min(CARD_MAX, Math.round(Number(v) || 0)));

// Mixed into the round number before the shuffle. Not a secret in any meaningful sense — a random card
// against a known draw has identical odds, so there is nothing here to protect — but it stops the numbers
// being a plain function of the clock, which would invite somebody to "verify" them and conclude the game
// was rigged when their own shuffle disagreed.
const DRAW_SALT = 0x5730_1d;

/**
 * The hall as it stands: the paytable and the limits, which is all a screen needs before a card exists.
 *
 * `players`, `round`, `msLeft` and `roundMs` are gone with the shared round. They are not merely unused — a
 * state payload that still carried a countdown would keep the client's clock alive and the "Drawn in 1s" rail
 * on screen forever, which is exactly the kind of leftover that outlives the feature it belonged to.
 */
export async function bingoState() {
    return {
        balls: DRAWN,
        pays: BINGO_PAYS,
        dragonChance: DRAGON_CHANCE,
        cardMin: CARD_MIN,
        cardMax: CARD_MAX,
    };
}

/**
 * BUY A CARD.
 *
 * One round trip does the whole thing: takes the stake, deals a card, deals ITS OWN forty balls, flies the
 * dragon if the dragon is coming, scores it and pays. Nothing is pending — the outcome is decided the moment
 * the card exists, and pretending otherwise by holding it back would only mean the game could lose it.
 *
 * `force` is the owner's dragon trigger. It is checked against the real owner flag by the route, never here.
 */
export async function buyBingoCard(buyerId, { bet, force = false } = {}) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const stake = clampBet(bet);

    const perks = await casinoPerks(buyerId);
    const paid = await db.queryOne(
        `UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`,
        [buyerId, stake],
    ).catch(() => null);
    if (!paid) return { ok: false, error: "no_gold" };
    await logCoin(buyerId, -stake, "casino_bingo_bet", { balanceAfter: paid.gold, meta: { bet: stake } });

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
    // ── THIS CARD'S OWN FORTY BALLS ──────────────────────────────────────────────────────────────────────
    // The seed is random rather than the clock, which is the whole difference between a shared round and a
    // private one. It is still a SEED rather than a direct shuffle so that a card can be replayed exactly
    // from its row if anybody ever has to answer "what did this actually draw" — and so check:bingo deals
    // against the same generator the game does.
    const seed = (Math.floor(Math.random() * 0xffff_ffff) >>> 0) || 1;
    const drawn = drawFor(seed, DRAW_SALT);
    const dragon = dragonFor(card, drawn, Math.random, { force: Boolean(force) });
    const burnt = burntOf(dragon);
    const score = scoreCard(card, drawn, burnt);

    // ── AND IT PAYS IN CHIPS ─────────────────────────────────────────────────────────────────────────────
    // `wonGold` is the paytable's own units — a multiple of what the card cost. The conversion happens once,
    // here, exactly as it does at every slot cabinet and now at the blackjack table.
    const wonGold = Math.round(stake * score.mult);
    const won = wonGold > 0 ? chipsFor(wonGold, 1) : 0;
    let chips = null;
    if (won > 0) {
        chips = await moveChips(buyerId, won, "casino_bingo_win", {
            meta: { bet: stake, tier: score.tier, lines: score.lines.length, dragon: burnt.length, wonGold, rate: CHIP_RATE },
        });
    }
    if (chips == null) chips = await chipBalance(buyerId);

    // Six lines or more is this game's rarest good thing — about one card in two thousand — so it is what
    // counts as the jackpot for the prize shelf.
    const prize = await rollCasinoPrize(buyerId, { jackpot: score.lines.length >= 6, perks });
    await tickCasinoQuests(buyerId, "bingo", won);
    const pet = withCasinoPerk(await maybeGrantCasinoPet(buyerId).catch(() => null));

    return {
        ok: true,
        card,
        drawn,
        // ── THE DRAGON, AS A FLIGHT RATHER THAN A RESULT ─────────────────────────────────────────────
        // The screen gets the whole pass: the line the dragon flew along, so the sprite can travel it, and
        // which squares actually caught, so only the cold ones ignite. Handing over the burnt cells alone
        // would leave the client to guess the path — and it would guess wrong on every pass that burned
        // nothing, which is the one a player most needs to understand.
        dragon: dragon ? { kind: dragon.kind, i: dragon.i, cells: dragon.cells, burnt: dragon.burnt } : null,
        // The winning lines, so the card can light them up rather than making somebody find them.
        lines: score.lines.map((l) => ({ kind: l.kind, i: l.i })),
        corners: score.corners,
        tier: score.tier,
        label: score.label,
        mult: score.mult,
        bet: stake,
        won,
        wonGold,
        chips,
        gold: paid.gold,
        prize,
        pet,
        onHouse,
    };
}
