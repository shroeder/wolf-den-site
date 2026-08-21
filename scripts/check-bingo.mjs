// ── WHAT DOES A BINGO CARD RETURN? ───────────────────────────────────────────────────────────────────────────
// Not enumerable: a card is 24 numbers out of 75 laid out in five constrained columns, and the patterns
// overlap each other, so the honest way to price it is to deal a great many of them against real draws and
// count. That is what this does, and it says SIMULATED on its face — the same argument as check-blackjack.
//
// It deals against the game's own `drawFor`, not against a convenient uniform sample, so a bug in the shuffle
// shows up here as a wrong return rather than hiding behind a nicer generator.
//
// Run:  node scripts/check-bingo.mjs   (or npm run check:bingo)
import { drawFor, makeCard, scoreCard, seeded, BINGO_PAYS, BALLS, DRAWN } from "../src/lib/marketplace/bingo-kit.js";
import { RTP_CEILING, RTP_TARGET } from "../src/lib/marketplace/casino.js";

const CARDS = Number(process.env.CARDS || 2_000_000);
const pct = (n) => `${(n * 100).toFixed(2)}%`;
const problems = [];

// Seeded so a run that finds a problem can be re-run and produce the same problem.
const rng = seeded(20260821);

let paid = 0;
const tally = {};
const paidBy = {};
// A fresh draw every few thousand cards rather than one draw for all of them: a single draw would price the
// game against one particular set of forty balls, and any quirk in that set would become the answer.
let drawn = drawFor(1);
for (let i = 0; i < CARDS; i += 1) {
    if (i % 5000 === 0) drawn = drawFor(i + 1);
    const s = scoreCard(makeCard(rng), drawn);
    paid += s.mult;
    const key = s.label || "nothing";
    tally[key] = (tally[key] || 0) + 1;
    // What each outcome actually PAID, summed — rather than looking its multiplier back up from a table
    // written out a second time here. A check script with its own copy of the paytable is a check script
    // that can agree with itself while disagreeing with the game.
    paidBy[key] = (paidBy[key] || 0) + s.mult;
}
const rtp = paid / CARDS;

console.log("BINGO");
console.log(`  the draw     ${DRAWN} balls from ${BALLS}, one set per round — everybody in the room plays it`);
console.log(`  the card     5x5, free centre, 24 numbers`);
console.log(`  pays         corners ${BINGO_PAYS.corners}x · a line ${BINGO_PAYS[1]}x · two ${BINGO_PAYS[2]}x · three ${BINGO_PAYS[3]}x · four ${BINGO_PAYS[4]}x · five ${BINGO_PAYS[5]}x · six+ ${BINGO_PAYS[6]}x`);
console.log(`  cards dealt  ${CARDS.toLocaleString()} (SIMULATED, not enumerated)`);
console.log(`  return       ${pct(rtp)}   target ${pct(RTP_TARGET)}   ceiling ${pct(RTP_CEILING)}`);
console.log(`  house edge   ${pct(1 - rtp)}`);

console.log("\n  how cards ended");
let hitRate = 0;
for (const [k, n] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
    const p = n / CARDS;
    if (k !== "nothing") hitRate += p;
    const odds = p > 0 ? `1 in ${Math.round(1 / p).toLocaleString()}` : "never";
    console.log(`    ${k.padEnd(14)} ${pct(p).padStart(7)}  ${odds.padStart(14)}  ->  ${pct((paidBy[k] || 0) / CARDS)}`);
}
console.log(`\n  hit rate     ${pct(hitRate)} of cards pay something`);

if (rtp > RTP_CEILING) problems.push(`bingo returns ${pct(rtp)}, above the ${pct(RTP_CEILING)} ceiling`);
if (rtp >= 1) problems.push(`bingo returns ${pct(rtp)} — every card is free money`);
if (rtp < 0.82) problems.push(`bingo returns ${pct(rtp)}, well under the ${pct(RTP_TARGET)} the rest of the floor pays`);
// A card you buy and then watch do nothing four times in five is a card nobody buys twice. This is the one
// game on the floor with a WAIT in it, and a wait that usually ends in nothing is the worst thing a game can
// ask of somebody.
if (hitRate < 0.2) problems.push(`only ${pct(hitRate)} of cards pay anything — with a draw to sit through, that is a game nobody buys twice`);

if (problems.length) {
    console.log(`\ncheck:bingo FAILED — ${problems.length} problem(s):\n`);
    for (const p of problems) console.log(`  ✗ ${p}`);
    process.exit(1);
}
console.log(`\ncheck:bingo — a card returns ${pct(rtp)}. The house keeps ${pct(1 - rtp)}.`);
