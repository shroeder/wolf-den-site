// ── THE ONE RATE, AND THE ONE CONVERSION ─────────────────────────────────────────────────────────────────────
// Split out of chips.js, which is `server-only` — and these two are neither. They are a constant and a pure
// function, and three things that are not the server need them:
//
//   THE SCREEN. Keno and bingo print their paytables as MULTIPLES of the stake, and the machines pay CHIPS.
//   Both numbers were true and they were in different currencies, so the tile said "3x", the payout said
//   "1,875" on a 2,500 stake, and there was nothing on screen to reconcile them. Luke: "keno lies, it should
//   pay what it says it will." The screen has to be able to do this arithmetic to stop lying about it, and
//   the one thing it must not do is its own copy of it — a second implementation of a conversion is a
//   paytable that goes wrong the day the rate moves, silently, in the direction of the house.
//
//   THE GATES. check:bingo, check:blackjack and check:chips each import CHIP_RATE, and importing it from
//   chips.js dragged `server-only` into a plain node script. All three have been dying on
//   ERR_MODULE_NOT_FOUND — not from anything they check, but from where they had to reach for one number.
//
//   THE MACHINES, unchanged: chips.js re-exports both, so every existing import still resolves there.
//
// ── WHY 1 ────────────────────────────────────────────────────────────────────────────────────────────────────
// A chip is paid at CHIP_RATE per gold of a machine's own payout, and the machines return about 1.00x on
// average, so a member who stakes 10,000 gold walks away with roughly 10,000 x CHIP_RATE chips however the
// spins fell. Everything about what a chip is WORTH is then decided by the Counter's prices and nowhere else.
//
// IT WAS 0.25 AND EVERY SCREEN HAD TO APOLOGISE FOR IT. The paytables are written in multiples of the stake —
// "3 of 5 pays 3x", "blackjack pays 3 to 2", "a line gets your card back" — and every one of those multiples
// was then quartered on its way into the purse. Luke, on keno: "keno lies, it should pay what it says it
// will, 2500 x 3 is 7500." Then again on the blackjack table, having doubled 100 into 200 and won:
// "I shouldn't win chips at the payout rate declared, not a percent of them."
//
// I fixed the first one by making the SCREEN quote chips, which made it honest and left it strange: the ladder
// said 1,875 where the felt behind it said 3x. The second report is the same complaint about the same
// arithmetic, so the answer is the arithmetic. At 1, a multiple means what it says everywhere it is printed —
// on the ladder, on the felt, in the result line — and there is nothing left to reconcile.
//
// ── WHAT THIS DOES AND DOES NOT MOVE ─────────────────────────────────────────────────────────────────────────
// It does NOT touch any machine's return. Every paytable is in multiples of the stake and every check script
// measures those multiples, so check:slot5, check:bingo, check:blackjack and check:casino are all unaffected —
// this is the conversion that happens after they have finished.
//
// It DOES multiply what an hour at the machines is worth in chips by four, and the Counter's prices have not
// been moved to match. That is deliberate rather than forgotten: those prices were set by hand today and they
// are the lever Luke has been actively tuning, so quadrupling them to hold purchasing power constant would
// overwrite a decision with an inference. The effect is that everything at the Counter is now four times
// cheaper in playing time. Multiplying every price in chips.js by four restores exactly what it felt like
// before, and is a five-minute change whenever that is what is wanted.
//
// (The old value was 0.25, and before that 0.08. The step to 0.25 was about RESOLUTION rather than generosity:
// at 0.08 the smallest paying line on The Hunt came to 0.4 chips and rounded to nothing, so a machine could
// draw a winning line across the screen and pay zero for it. At 1 that whole class of problem is gone.)
export const CHIP_RATE = 1;

// What a bet of `gold` mints. The machines' payouts are multiples of the bet and know nothing about chips;
// the conversion happens once, here.
//
// AND ANYTHING THAT PAID AT ALL PAYS AT LEAST ONE CHIP. Rounding is not allowed to turn a win into a loss:
// the line lit, the screen said it paid, and a zero underneath that is the machine contradicting itself.
export const chipsFor = (gold, multiple) => {
    const raw = gold * multiple * CHIP_RATE;
    if (raw <= 0) return 0;
    return Math.max(1, Math.round(raw));
};
