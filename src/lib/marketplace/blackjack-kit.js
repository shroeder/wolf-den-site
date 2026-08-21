// ── BLACKJACK, AND THE PROBLEM WITH BLACKJACK ────────────────────────────────────────────────────────────────
// Every other machine on this floor is priced by a paytable: change a number, the return moves, and
// check-casino enumerates the whole thing exactly. Blackjack has no paytable. Its return comes out of the
// RULES, and the rules of blackjack are famous — a well-played hand against a normal table returns about
// 99.5%. That is not a casino game by this floor's standards, it is a bank account.
//
// The usual ways a real casino claws that back are all miserable: pay 6:5 on a blackjack, have the dealer win
// ties, hit soft 17. Every one of them is a rule the player has to notice is worse, and the good ones are
// invisible until you have already lost to them.
//
// So this table plays by the rules everybody already knows — six decks, dealer stands on all 17, blackjack
// pays 3:2, double on your first two — and the house takes its edge as an OPENLY STATED RAKE on the money you
// win. Your stake always comes back whole. The table says the number out loud before you sit down, which is
// the one version of a house edge a player can actually make a decision about.
//
// NO SPLITTING, deliberately, for now: splits fork the hand into two independently-playable states, and half
// a split implementation is a way to lose track of somebody's gold. The table says so on its face rather than
// silently refusing the button.
//
// NO SHOE MEMORY: the deck is fresh every hand. A persistent six-deck shoe is countable, and a countable shoe
// on a website with an API is not a game, it is a withdrawal mechanism.

// A fifth of what you WIN. Tuned against check-blackjack, which plays a basic-strategy simulation and reports
// the real return — see that script for the number this actually produces.
export const BLACKJACK_RAKE = 0.2;

export const DECKS = 6;
export const DEALER_STANDS_ON = 17;
export const BLACKJACK_PAYS = 1.5;

export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
export const SUITS = ["s", "h", "d", "c"];

/** A fresh six-deck shoe, shuffled. `rng` is injectable so the check script is reproducible. */
export function freshShoe(rng = Math.random) {
    const cards = [];
    for (let d = 0; d < DECKS; d += 1) for (const r of RANKS) for (const s of SUITS) cards.push(r + s);
    // Fisher-Yates. The naive sort(() => rng() - 0.5) is NOT a shuffle — it biases toward the original order,
    // and on a card game that bias is money.
    for (let i = cards.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1));
        [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    return cards;
}

export const rankOf = (card) => String(card).slice(0, -1);

/** The best total a hand can hold, and whether an ace is still counted as eleven. */
export function handValue(cards = []) {
    let total = 0;
    let aces = 0;
    for (const c of cards) {
        const r = rankOf(c);
        if (r === "A") { aces += 1; total += 11; }
        else if (r === "K" || r === "Q" || r === "J" || r === "10") total += 10;
        else total += Number(r);
    }
    // Demote aces from eleven to one, one at a time, only as far as it takes to stop busting.
    let soft = aces > 0;
    while (total > 21 && aces > 0) { total -= 10; aces -= 1; }
    if (aces === 0) soft = false;
    return { total, soft, bust: total > 21 };
}

export const isBlackjack = (cards = []) => cards.length === 2 && handValue(cards).total === 21;

/** The dealer's whole turn, played by the only rule the dealer has. */
export function playDealer(cards, shoe) {
    const hand = [...cards];
    while (handValue(hand).total < DEALER_STANDS_ON) hand.push(shoe.pop());
    return hand;
}

// ── WHAT THE HAND PAID ───────────────────────────────────────────────────────────────────────────────────────
// One function, used by the table AND by the check script, so the number the simulation reports is the number
// the floor actually pays. A gate that scores a hand its own way is a gate checking arithmetic nobody runs.
//
// Returns what comes back to the player IN TOTAL, stake included: 0 on a loss, the stake on a push, and stake
// plus the raked winnings otherwise.
export function settleHand({ player, dealer, stake, doubled = false }) {
    const bet = doubled ? stake * 2 : stake;
    const p = handValue(player);
    const d = handValue(dealer);
    const pBJ = isBlackjack(player);
    const dBJ = isBlackjack(dealer);

    if (p.bust) return { back: 0, outcome: "bust", won: 0, rake: 0, bet };
    if (pBJ && dBJ) return { back: bet, outcome: "push", won: 0, rake: 0, bet };
    if (pBJ) return raked(bet, bet * BLACKJACK_PAYS, "blackjack");
    if (dBJ) return { back: 0, outcome: "dealer_blackjack", won: 0, rake: 0, bet };
    if (d.bust) return raked(bet, bet, "dealer_bust");
    if (p.total > d.total) return raked(bet, bet, "win");
    if (p.total < d.total) return { back: 0, outcome: "lose", won: 0, rake: 0, bet };
    return { back: bet, outcome: "push", won: 0, rake: 0, bet };
}

// The rake applies to WINNINGS only, never to the stake — the whole reason this is the honest version of a
// house edge is that a push and a loss are exactly what they look like.
function raked(bet, winnings, outcome) {
    const rake = Math.round(winnings * BLACKJACK_RAKE);
    const won = Math.round(winnings) - rake;
    return { back: bet + won, outcome, won, rake, bet };
}

// ── BASIC STRATEGY ───────────────────────────────────────────────────────────────────────────────────────────
// Lives here rather than in the check script on purpose. The whole question this table has to answer is "what
// does it return to somebody who plays it WELL" — a simulation of a bad player would report a flattering
// number and prove nothing. This is the standard multi-deck chart, minus the split rows, since the table has
// no split button.
//
// It is also the honest answer to "what should the table hint at", if a hint is ever added.
export function basicStrategy(player, dealerUp, canDouble) {
    const { total, soft } = handValue(player);
    const up = (() => {
        const r = rankOf(dealerUp);
        if (r === "A") return 11;
        if (r === "K" || r === "Q" || r === "J" || r === "10") return 10;
        return Number(r);
    })();

    if (soft) {
        if (total >= 19) return "stand";
        if (total === 18) {
            if (canDouble && up >= 3 && up <= 6) return "double";
            return up >= 9 ? "hit" : "stand";
        }
        if (total === 17) return canDouble && up >= 3 && up <= 6 ? "double" : "hit";
        if (total >= 15) return canDouble && up >= 4 && up <= 6 ? "double" : "hit";
        if (total >= 13) return canDouble && up >= 5 && up <= 6 ? "double" : "hit";
        return "hit";
    }
    if (total >= 17) return "stand";
    if (total >= 13) return up >= 7 ? "hit" : "stand";
    if (total === 12) return up >= 4 && up <= 6 ? "stand" : "hit";
    if (total === 11) return canDouble ? "double" : "hit";
    if (total === 10) return canDouble && up <= 9 ? "double" : "hit";
    if (total === 9) return canDouble && up >= 3 && up <= 6 ? "double" : "hit";
    return "hit";
}
