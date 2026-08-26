// ── WHAT DOES A BINGO CARD RETURN? ───────────────────────────────────────────────────────────────────────────
// Not enumerable: a card is 24 numbers out of 75 laid out in five constrained columns, and the patterns
// overlap each other, so the honest way to price it is to deal a great many of them against real draws and
// count. That is what this does, and it says SIMULATED on its face — the same argument as check-blackjack.
//
// It deals against the game's own `drawFor`, not against a convenient uniform sample, so a bug in the shuffle
// shows up here as a wrong return rather than hiding behind a nicer generator.
//
// Run:  node scripts/check-bingo.mjs   (or npm run check:bingo)
import {
    drawFor, makeCard, scoreCard, seeded, dragonFor, burntOf, BINGO_PAYS, BALLS, DRAWN, DRAGON_CHANCE,
} from "../src/lib/marketplace/bingo-kit.js";
import { CHIP_RATE } from "../src/lib/marketplace/chip-rate.js";

// ── THE QUESTION THIS SCRIPT ASKS HAS CHANGED ────────────────────────────────────────────────────────────────
// It used to compare bingo against RTP_CEILING, which is the ceiling for a game that pays GOLD. Bingo pays
// CHIPS now (Luke: "convert blackjack, keno and bingo to give out chips, not gold"), and the rule for a chip
// game is not the gold ceiling — it is the rule chips.js states and check:slot5 enforces on all five slot
// cabinets: A MACHINE RETURNS 1.00x IN CHIPS.
//
// That is not a looser gate, it is the correct one. The house edge on a chip game is the CONVERSION: you stake
// gold, the gold is gone, and what comes back is chips at CHIP_RATE which buy chests and nothing else. A chip
// game returning 0.88x would simply be a strictly worse slot machine — the same one-way conversion, and then
// twelve points taken off the top for no reason a player could name.
//
// So the band is tight and centred on 1.00, and the ceiling is real: anything meaningfully ABOVE 1.00 is a
// cabinet that mints chips faster than the rest of the floor, which is the actual risk now.
const CHIP_TARGET = 1.00;
const CHIP_BAND = 0.04;

const CARDS = Number(process.env.CARDS || 2_000_000);
const pct = (n) => `${(n * 100).toFixed(2)}%`;
const problems = [];

// Seeded so a run that finds a problem can be re-run and produce the same problem.
const rng = seeded(20260821);

let paid = 0;
// What the dragon is worth on its own — the same cards scored twice, once with the fire and once without, so
// the feature can be priced rather than guessed at. This is the number that has to justify the feature.
let paidNoDragon = 0;
let dragons = 0;
let burntTotal = 0;
const tally = {};
const paidBy = {};
// A fresh draw every few thousand cards rather than one draw for all of them: a single draw would price the
// game against one particular set of forty balls, and any quirk in that set would become the answer.
let drawn = drawFor(1);
for (let i = 0; i < CARDS; i += 1) {
    if (i % 5000 === 0) drawn = drawFor(i + 1);
    const card = makeCard(rng);
    const dragon = dragonFor(card, drawn, rng);
    const burnt = burntOf(dragon);
    if (dragon) { dragons += 1; burntTotal += burnt.length; }
    const s = scoreCard(card, drawn, burnt);
    paid += s.mult;
    paidNoDragon += scoreCard(card, drawn, []).mult;
    const key = s.label || "nothing";
    tally[key] = (tally[key] || 0) + 1;
    // What each outcome actually PAID, summed — rather than looking its multiplier back up from a table
    // written out a second time here. A check script with its own copy of the paytable is a check script
    // that can agree with itself while disagreeing with the game.
    paidBy[key] = (paidBy[key] || 0) + s.mult;
}
const rtp = paid / CARDS;
const rtpCold = paidNoDragon / CARDS;

console.log("BINGO");
console.log(`  the draw     ${DRAWN} balls from ${BALLS}, dealt fresh for every card — no shared round, no wait`);
console.log(`  the card     5x5, free centre, 24 numbers`);
console.log(`  pays         corners ${BINGO_PAYS.corners}x · a line ${BINGO_PAYS[1]}x · two ${BINGO_PAYS[2]}x · three ${BINGO_PAYS[3]}x · four ${BINGO_PAYS[4]}x · five ${BINGO_PAYS[5]}x · six+ ${BINGO_PAYS[6]}x`);
console.log(`  cards dealt  ${CARDS.toLocaleString()} (SIMULATED, not enumerated)`);
console.log(`  the dragon   ${pct(DRAGON_CHANCE)} of cards — one pass across a row, a column or a diagonal, burning only cold squares`);
console.log(`  paid in      CHIPS at ${CHIP_RATE} per gold staked — the gold does not come back`);
console.log(`  return       ${pct(rtp)}   target ${pct(CHIP_TARGET)} +/- ${pct(CHIP_BAND)}`);
console.log(`    of which   ${pct(rtpCold)} from the card, ${pct(rtp - rtpCold)} from the dragon`);
console.log(`  dragons      ${pct(dragons / CARDS)} of cards, ${(burntTotal / Math.max(1, dragons)).toFixed(2)} squares caught per pass`);

console.log("\n  how cards ended");
let hitRate = 0;
for (const [k, n] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
    const p = n / CARDS;
    if (k !== "nothing") hitRate += p;
    const odds = p > 0 ? `1 in ${Math.round(1 / p).toLocaleString()}` : "never";
    console.log(`    ${k.padEnd(14)} ${pct(p).padStart(7)}  ${odds.padStart(14)}  ->  ${pct((paidBy[k] || 0) / CARDS)}`);
}
console.log(`\n  hit rate     ${pct(hitRate)} of cards pay something`);

if (rtp > CHIP_TARGET + CHIP_BAND) {
    problems.push(`bingo returns ${pct(rtp)} in chips, above the ${pct(CHIP_TARGET + CHIP_BAND)} the floor is priced at — it mints chips faster than the slots`);
}
if (rtp < CHIP_TARGET - CHIP_BAND) {
    problems.push(`bingo returns ${pct(rtp)} in chips, under the ${pct(CHIP_TARGET - CHIP_BAND)} the floor is priced at — it is a strictly worse slot machine`);
}
// A card you buy and then watch do nothing four times in five is a card nobody buys twice.
if (hitRate < 0.2) problems.push(`only ${pct(hitRate)} of cards pay anything — that is a game nobody buys twice`);
// The dragon has to be worth having. A bonus that moves the return by a point is a bonus nobody would miss,
// and this one is carrying the difference between the old gold paytable and the floor's chip rate.
if (rtp - rtpCold < 0.04) {
    problems.push(`the dragon is worth only ${pct(rtp - rtpCold)} — that is a decoration, not a feature`);
}

if (problems.length) {
    console.log(`\ncheck:bingo FAILED — ${problems.length} problem(s):\n`);
    for (const p of problems) console.log(`  ✗ ${p}`);
    process.exit(1);
}
console.log(`\ncheck:bingo — a card returns ${pct(rtp)}. The house keeps ${pct(1 - rtp)}.`);
