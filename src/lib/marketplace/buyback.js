// ── WHAT WE PAY FOR A CARD BACK ──────────────────────────────────────────────────────────────────────────────
// Luke, 2026-10-27: "I think we should buy back cards at 60 percent store credit so it matched what we do in
// store, when selling the card."
//
// Sell-back used to pay 100% of market, which was never the shop's rate — it was a placeholder that happened
// to make the first build's maths simple. The counter pays 60% in trade credit, and a different rate online
// is two prices for one transaction: somebody finds out, and the one they find out about is whichever is
// worse for them.
//
// ── ⚠️ ONE FUNCTION, CALLED BY EVERY PATH THAT TOUCHES THE NUMBER ────────────────────────────────────────────
// There are FOUR of them and they must never disagree:
//
//   1. choosePackOutcome()  — selling at the reveal
//   2. sellVaultCards()     — selling from the vault
//   3. completeBuyBack()    — what the card costs us once it is back on the shelf
//   4. the buttons          — "Sell back — $X", on two screens
//
// The first two had already drifted into separate consequences once and had to be merged; a rate copied into
// four places would drift on the first change to it, and the symptom is a member being shown one number and
// paid another. The clients are handed the figure from the server rather than deriving it, so (4) is not
// really arithmetic at all — see sellBackCents on the pack and vault payloads.
//
// ⚠️ AND (3) IS NOT THE SAME NUMBER AS THE SHELF PRICE. restockBoughtBackCard() takes `valueCents` (what we
// re-list it at = market) and `paidCents` (what it cost us = this). They were equal while the rate was 100%,
// which hid the distinction; collapsing them now would book every re-sold buy-back at zero margin.

/** The counter's rate, in percent. Shown to members — the number is the argument for its own fairness. */
export const BUYBACK_PERCENT = 60;

/**
 * ⚠️ NOTHING PAYS LESS THAN A DOLLAR. 60% of a $1.00 common is sixty cents, and sixty cents does not read as
 * a transaction — it reads as being brushed off, on a screen whose whole job is making a member feel good
 * about the thing they just opened. Three cards in the live pool sit under the line and it costs the shop
 * pennies a year; what it buys is that no sell-back is ever insulting.
 */
export const BUYBACK_MIN_CENTS = 100;

/**
 * ⚠️ AND IT ROUNDS UP, NEVER DOWN. $2.40 pays $2.50. Measured across the real 78-card pool the round-up and
 * the floor together cost 0.6 of a percentage point — effective 60.6% instead of 60.0%, about 11¢ a pack —
 * and every payout in the shop lands on a clean quarter that is always at or above the stated rate. A rate
 * that rounds against the member is a rate they are right not to trust.
 */
export const BUYBACK_ROUND_CENTS = 25;

/**
 * Did the FLOOR decide this payout rather than the rate?
 *
 * ⚠️ THE SCREEN CANNOT SAY "60% of $1.40" OVER A $1.00 BUTTON. It is the one place the stated rate and the
 * paid figure visibly fail to multiply — $1.40 × 0.6 is $0.84 — and a disclosure whose own arithmetic does
 * not check out is worse than none: it reads as the rate being made up. Three cards in the live pool sit
 * under the line, so it is a case somebody sees.
 *
 * ⚠️ AND IT LIVES HERE, NOT IN THE BUTTON. Working it out client-side means a fourth copy of the rate, the
 * rounding and the floor, which is precisely what the note at the top of this file says never to do. The
 * quarter round-up is NOT reported — it moves the payout by at most 24¢, always upward, and "60% of $38.00"
 * over $23.00 reads as rounding in the member's favour, which is what it is.
 */
export function buyBackIsFloored(marketCents) {
    const market = Math.max(0, Math.round(Number(marketCents) || 0));
    if (market <= 0) return false;
    const rounded = Math.ceil(((market * BUYBACK_PERCENT) / 100) / BUYBACK_ROUND_CENTS) * BUYBACK_ROUND_CENTS;
    return rounded < BUYBACK_MIN_CENTS;
}

/** What we pay, in cents, for a card whose market value is `marketCents`. */
export function buyBackCents(marketCents) {
    const market = Math.max(0, Math.round(Number(marketCents) || 0));
    if (market <= 0) return 0;
    const raw = (market * BUYBACK_PERCENT) / 100;
    const rounded = Math.ceil(raw / BUYBACK_ROUND_CENTS) * BUYBACK_ROUND_CENTS;
    return Math.max(BUYBACK_MIN_CENTS, rounded);
}

/** The payout for a basket, summed per card — ⚠️ never by rating the total, which would round once. */
export function buyBackTotalCents(marketCentsList = []) {
    return marketCentsList.reduce((sum, cents) => sum + buyBackCents(cents), 0);
}

/**
 * How many packs this sell-back is worth, to one decimal — the "making bank" line.
 *
 * ⚠️ IT RETURNS null BELOW 1×, AND THAT IS THE DESIGN. The screen celebrates when there is something to
 * celebrate and says nothing when there is not. "0.4× your pack" is a true sentence that no member needs
 * read back to them at the moment they are deciding what to do with a card they just lost money on.
 */
export function packsWorth(payoutCents, packPriceCents) {
    const price = Math.round(Number(packPriceCents) || 0);
    const payout = Math.round(Number(payoutCents) || 0);
    if (price <= 0 || payout < price) return null;
    return Math.round((payout / price) * 10) / 10;
}
