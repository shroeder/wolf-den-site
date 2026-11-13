// ── THE MARGIN RULE ──────────────────────────────────────────────────────────────────────────────────────────
// Luke, 2026-11-13: "an item, it has a 20% margin on it. I wouldn't want to go under 15% margin on that item.
// So maybe 75% of my existing margin should be retained."
//
// That is one sentence and it is the whole rule, so it gets one file and every caller imports it. The
// alternative — a percentage written into the email template — is how a discount that nobody checked goes out
// to 87 people at once. See [[balance-constants-never-copied]].
//
// ── THE ARITHMETIC ───────────────────────────────────────────────────────────────────────────────────────────
// Retaining 75% of the margin DOLLARS means the discount may be at most 25% of them:
//
//     margin      M  = price - cost
//     discount    D <= 0.25 x M
//     percent off    = D / price  =  0.25 x (margin as a fraction of price)
//
// So a 20% margin affords 5% off, a 40% margin affords 10%, an 80% margin affords 20%. Luke's own example
// checks out exactly: $100 at $80 cost -> $5 off -> sells at $95 holding $15, which is 75% of the $20 it
// started with. Expressed against the NEW price that reads 15.8%, which is the right side of his floor.
//
// ⚠️ MARGIN DOLLARS, NOT MARGIN POINTS. "75% of 20% is 15%" happens to give the same answer at his example
// and stops doing so the moment a discount moves the denominator. Percentage points of a number that the
// discount itself changes is not a quantity that can be held constant; the dollars can.
//
// ── WHY ROUNDING DOWN IS A SAFETY PROPERTY AND NOT A COSMETIC ONE ────────────────────────────────────────────
// Offers are cut to clean 5s because "9% off" reads like a rounding error in a shop and "10% off" reads like
// an offer. Rounding DOWN means the realised retention is always >= 75%, never below it — the cosmetic choice
// and the safe choice are the same direction, which is the only reason it is allowed to be cosmetic at all.

/** Fraction of the gross margin the shop keeps. Luke's number. */
export const MARGIN_RETAINED = 0.75;
/** Offers are cut to clean multiples of this many percent. */
export const DISCOUNT_STEP = 5;
/** Below this an offer is not worth printing, so the item goes out at full price instead. */
export const MIN_DISCOUNT_PCT = 5;
/** A ceiling that no margin, however fat, is allowed to exceed. Bulk and graded singles can run 90%+. */
export const MAX_DISCOUNT_PCT = 20;
// ── AND A FLOOR IN DOLLARS, WHICH THE PERCENTAGE FLOOR DOES NOT GIVE YOU ────────────────────────────────────
// Caught in the first preview: a $7 booster pack at a 24% margin cleared MIN_DISCOUNT_PCT comfortably and
// produced "5% off", which is thirty-five cents. That is not an offer, it is a reason to think less of the
// shop that sent it — and it still costs real margin to honour. A discount has to be worth the sentence it
// is written in, so there is a second floor and an offer must clear BOTH.
export const MIN_DISCOUNT_CENTS = 100;

// ── ⚠️ THE MARGIN RULE IS A CEILING, NOT A TARGET. THIS WAS THE FIRST VERSION'S REAL MISTAKE ───────────────
// v1 offered the LARGEST discount each item could afford, so a fat-margin card gave away the most. Luke saw
// the output and named it exactly: "One gives 5 percent off a 20 dollar item, another gives 20 off a 100. I
// dont want to throw away margin like that."
//
// He is right twice over. A $20 giveaway is not twenty times more persuasive than a $1 one — the job of the
// number is to tip a decision that is already close, and past that it is just margin handed to somebody who
// was going to buy anyway. And the SPREAD was indefensible on its own: two customers comparing emails would
// find the shop had priced its goodwill at 5% for one of them and 20% for the other, for no reason either
// could see.
//
// So the offer is one modest number for everybody, and the margin rule only ever TAKES IT AWAY.
export const TARGET_DISCOUNT_PCT = 10;
// And a hard dollar ceiling on top, because 10% of an expensive card is still a lot of money to post to
// somebody who has not asked for it. Above this the discount stops growing and the percentage quietly
// shrinks — a $287 card is offered $15 off, not $28.70.
export const MAX_DISCOUNT_CENTS = 1500;

/**
 * The best offer an item can carry without breaking the rule — or `null`, meaning "show it at full price".
 *
 * ⚠️ CONSIGNED STOCK IS NEVER DISCOUNTED, WHATEVER THE MARGIN SAYS. Luke, 2026-11-13: "we cant discount
 * anything in consignment." It is not the shop's to discount — the consignor's payout is fixed, so every
 * cent off comes out of the shop's cut alone, and the shop is not the party that agreed to the sale price.
 * This is checked BEFORE the margin arithmetic rather than left to the cost lookup to refuse by accident:
 * 89 of the 403 consigned items in stock DO carry a unit cost, so the margin rule alone would happily
 * discount them. [[consigned-stock-costs-its-payout]]
 *
 * ⚠️ AN UNKNOWN COST RETURNS null, AND THAT IS THE IMPORTANT BRANCH. 946 of 2,057 in-stock items have no
 * recorded unit cost (every consigned line but 89 of them, among others). A missing cost is the one case
 * where the rule cannot protect the shop, so it refuses rather than assuming a typical margin: the item is
 * still allowed in an email, it simply never carries a number off its price. [[unit-cost-is-exact-fifo-never-averaged]]
 */
export function offerFor({ priceCents, unitCostCents, consigned = false } = {}) {
    if (consigned) return null;                              // not ours to discount
    const price = Number(priceCents);
    const cost = Number(unitCostCents);
    if (!Number.isFinite(price) || price <= 0) return null;
    if (!Number.isFinite(cost) || cost <= 0) return null;   // unknown cost -> never discount
    const margin = price - cost;
    if (margin <= 0) return null;                            // at or below cost -> never discount

    // What the item could afford, which is the ceiling and nothing more.
    const affordableCents = margin * (1 - MARGIN_RETAINED);
    const affordablePct = Math.floor(((affordableCents / price) * 100) / DISCOUNT_STEP) * DISCOUNT_STEP;

    const pct = Math.min(TARGET_DISCOUNT_PCT, MAX_DISCOUNT_PCT, affordablePct);
    if (pct < MIN_DISCOUNT_PCT) return null;      // cannot afford an offer worth printing -> full price

    const wanted = Math.round((price * pct) / 100);
    const offCents = Math.min(MAX_DISCOUNT_CENTS, wanted);
    if (offCents < MIN_DISCOUNT_CENTS) return null;
    const nowCents = price - offCents;
    // Whether the dollar ceiling is what decided this, which changes how it should be WRITTEN: a capped
    // offer is quoted in dollars. Badging a $287 card "5% OFF" beside a $20 card's "10% OFF" reproduces the
    // exact inconsistency the fixed rate was brought in to remove, and it undersells a bigger discount.
    const capped = offCents < wanted;
    return {
        // ⚠️ RECOMPUTED FROM THE MONEY, NOT CARRIED DOWN FROM THE INTENT. Once MAX_DISCOUNT_CENTS bites, the
        // item is no longer getting `pct` off and a badge saying so would be a false price in a customer's
        // inbox. Floored, so the badge can never claim more than the till will give.
        pct: Math.floor((offCents / price) * 100),
        offCents,
        capped,
        nowCents,
        wasCents: price,
        marginBeforeCents: margin,
        marginAfterCents: nowCents - cost,
        /** What share of the original margin survives. The rule says this must never drop below MARGIN_RETAINED. */
        retained: (nowCents - cost) / margin,
    };
}

/**
 * The guard, stated as a question rather than trusted as an outcome.
 *
 * Every offer is run through this before it can reach an email. It restates the rule from the raw numbers
 * instead of re-using anything offerFor computed, because a check that shares the code's arithmetic agrees
 * with itself and ships green — [[a-test-cannot-share-the-codes-guess]].
 */
export function offerIsSafe(offer, { priceCents, unitCostCents, consigned = false } = {}) {
    if (!offer) return true;                                 // no offer cannot be unsafe
    if (consigned) return false;                             // an offer on consigned stock is never safe
    const price = Number(priceCents);
    const cost = Number(unitCostCents);
    if (!Number.isFinite(price) || !Number.isFinite(cost) || cost <= 0) return false;
    const before = price - cost;
    const after = (price - offer.offCents) - cost;
    if (before <= 0 || after <= 0) return false;
    if (offer.pct > MAX_DISCOUNT_PCT) return false;
    // A hair of tolerance for the cent-rounding in offCents, which can only ever cost a fraction of a cent.
    return after / before >= MARGIN_RETAINED - 0.0001;
}
