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
// ── WHY 0.25 ─────────────────────────────────────────────────────────────────────────────────────────────────
// A chip is minted at CHIP_RATE per gold staked, and the machines return about 1.00x of that on average, so a
// member who stakes 10,000 gold walks away with roughly 10,000 x CHIP_RATE chips however the spins fell.
// Everything about what a chip is WORTH is then decided by the Counter's prices and nowhere else. Change this
// number and you have repriced the entire casino — that is the point, there is exactly one lever, and the
// prices in chips.js have to move with it or the gold behind every item silently changes.
//
// 0.25 rather than 0.08, and the reason was RESOLUTION rather than generosity. At 0.08 a whole 1x win on a
// 100-gold spin was 8 chips, so the machine was quantised in eighths — and the smallest paying line on The
// Hunt, three doubloons, came to 0.4 chips and rounded to NOTHING. Caught by playing it on the live site: "3
// doubloon — 0 chips". A machine that draws a winning line across the screen and pays zero for it is broken,
// whatever the maths says.
export const CHIP_RATE = 0.25;

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
