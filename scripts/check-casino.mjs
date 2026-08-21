// ── CAN A MACHINE MINT GOLD? ─────────────────────────────────────────────────────────────────────────────────
// A payout table is the one kind of content in this game that can create currency out of nothing, and this
// codebase has already paid for that lesson once: awardXp paid gold 1:1 with points, and a repeatable caller
// that forgot `gold: 0` was a money printer nobody noticed until the ledger did.
//
// A slot machine is that bug with a lever on it, so the odds do not get to be checked by eye. This reads the
// SAME tables the game pays from — not a copy, the actual export — enumerates every outcome exactly, and
// fails if any machine returns more than RTP_CEILING.
//
// Exact, not sampled. Three reels of six symbols is 216 combinations; there is no reason to estimate a number
// that can be computed.
//
// Run:  node scripts/check-casino.mjs   (or npm run check:casino)
import {
    SLOT_SYMBOLS, SLOT_PAYS, RTP_CEILING, RTP_TARGET, slotPayout, slotRtp,
    WHEEL, WHEEL_BETS, wheelRtp, KENO_PICKS, KENO_PAYS, kenoChance, kenoRtp,
    PRIZE_CHANCE, PRIZE_SHELF,
} from "../src/lib/marketplace/casino.js";

const pct = (n) => `${(n * 100).toFixed(2)}%`;
const problems = [];

// ── THE SLOT ─────────────────────────────────────────────────────────────────────────────────────────────────
const total = SLOT_SYMBOLS.reduce((n, s) => n + s.weight, 0);
const rtp = slotRtp();

console.log("THE SLOT");
console.log(`  symbols      ${SLOT_SYMBOLS.length}, ${total} weight across the reel`);
console.log(`  combinations ${SLOT_SYMBOLS.length ** 3} (enumerated exactly, not sampled)`);
console.log(`  return       ${pct(rtp)}   target ${pct(RTP_TARGET)}   ceiling ${pct(RTP_CEILING)}`);
console.log(`  house edge   ${pct(1 - rtp)}`);

if (rtp > RTP_CEILING) {
    problems.push(`the slot returns ${pct(rtp)}, above the ${pct(RTP_CEILING)} ceiling — it is a money printer`);
}
if (rtp >= 1) {
    problems.push(`the slot returns ${pct(rtp)} — every pull is free money and the Den's economy is over`);
}

// ── WHERE THE MONEY GOES ─────────────────────────────────────────────────────────────────────────────────────
// Which lines carry the return, so a table can be re-tuned with the consequence visible. A machine whose whole
// return sits on one jackpot FEELS like a coin shredder however good the average is — the number below the
// jackpot line is the one that decides whether a session has anything in it.
const contrib = [];
for (const a of SLOT_SYMBOLS) {
    for (const b of SLOT_SYMBOLS) {
        for (const c of SLOT_SYMBOLS) {
            const p = (a.weight / total) * (b.weight / total) * (c.weight / total);
            const pay = slotPayout([a.id, b.id, c.id]);
            if (pay > 0) contrib.push({ line: `${a.id}/${b.id}/${c.id}`, p, ret: p * pay, pay });
        }
    }
}
const byKind = {};
for (const c of contrib) {
    const kind = c.line.split("/").every((x, _, arr) => x === arr[0]) ? `three ${c.line.split("/")[0]}` : "a pair";
    byKind[kind] = (byKind[kind] || 0) + c.ret;
}
console.log("\n  what carries the return");
for (const [kind, ret] of Object.entries(byKind).sort((x, y) => y[1] - x[1])) {
    console.log(`    ${kind.padEnd(16)} ${pct(ret).padStart(8)}  (${pct(ret / rtp)} of everything paid)`);
}

const jackpot = byKind[`three ${SLOT_SYMBOLS[0].id}`] || 0;
if (jackpot / rtp > 0.5) {
    problems.push(`${pct(jackpot / rtp)} of the return sits on the jackpot alone — a session will feel like nothing but losses`);
}

// How often a pull pays ANYTHING. A machine that pays one pull in twenty is technically generous and reads as
// broken; real slots land somewhere near one in three.
const hitRate = contrib.reduce((n, c) => n + c.p, 0);
console.log(`\n  hit rate     ${pct(hitRate)} of pulls pay something`);
if (hitRate < 0.15) problems.push(`only ${pct(hitRate)} of pulls pay anything — that reads as a broken machine`);

// ── THE WHEEL ────────────────────────────────────────────────────────────────────────────────────────────────
// Every bet enumerated over all twenty pockets. They are meant to return the SAME amount as each other — a
// wheel with a smart bet on it is a wheel with a trap bet on it.
console.log("\nTHE WHEEL");
const wheelReturns = [];
for (const [id, bet] of Object.entries(WHEEL_BETS)) {
    const r = wheelRtp(id, 0);
    wheelReturns.push(r);
    const wins = WHEEL.filter((seg) => bet.hits(seg, 0)).length;
    console.log(`  ${bet.label.padEnd(11)} pays ${String(bet.pays).padStart(3)}x on ${String(wins).padStart(2)}/${WHEEL.length} pockets  ->  ${pct(r)}`);
    if (r > RTP_CEILING) problems.push(`the wheel's ${bet.label} bet returns ${pct(r)}, above the ${pct(RTP_CEILING)} ceiling`);
}
const spread = Math.max(...wheelReturns) - Math.min(...wheelReturns);
console.log(`  spread between bets ${pct(spread)}`);
if (spread > 0.02) {
    problems.push(`the wheel's bets return between ${pct(Math.min(...wheelReturns))} and ${pct(Math.max(...wheelReturns))} — one of them is strictly better, which makes the rest traps`);
}

// ── KENO ─────────────────────────────────────────────────────────────────────────────────────────────────────
// Hypergeometric, computed with factorials. Five-of-five is rare enough that no simulation would price it
// honestly without millions of runs, which is the whole argument for doing the arithmetic.
console.log("\nKENO");
let kenoTotal = 0;
for (let k = 0; k <= KENO_PICKS; k += 1) {
    const p = kenoChance(k);
    kenoTotal += p;
    const pay = KENO_PAYS[k] || 0;
    const odds = p > 0 ? `1 in ${Math.round(1 / p).toLocaleString()}` : "never";
    console.log(`  ${k} hit${k === 1 ? " " : "s"}  ${pct(p).padStart(8)}  ${odds.padStart(12)}  pays ${String(pay).padStart(4)}x  ->  ${pct(p * pay)}`);
}
const kr = kenoRtp();
console.log(`  return       ${pct(kr)}`);
if (Math.abs(kenoTotal - 1) > 1e-6) problems.push(`keno's outcome probabilities sum to ${kenoTotal.toFixed(6)}, not 1 — the maths is wrong`);
if (kr > RTP_CEILING) problems.push(`keno returns ${pct(kr)}, above the ${pct(RTP_CEILING)} ceiling`);

// ── PRIZES, WHICH ARE NOT IN THE RETURN ──────────────────────────────────────────────────────────────────────
// Said out loud rather than folded into the RTP. The gold maths above is exact and provable; a chest is worth
// whatever a chest is worth to whoever opened it, and rolling that into a percentage would produce a number
// that looks rigorous and is invented.
//
// What IS checked is that the rate stays small enough to be a surprise rather than a strategy — a floor where
// the prizes are the reason to play is a floor whose gold economy no longer matters.
console.log("\nPRIZES (on top of the return, not counted in it)");
console.log(`  any play      ${pct(PRIZE_CHANCE)}  — roughly 1 in ${Math.round(1 / PRIZE_CHANCE)}`);
console.log(`  a jackpot     certain, from a better shelf`);
console.log(`  the shelf     ${PRIZE_SHELF.map((p) => p.kind).join(", ")}`);
if (PRIZE_CHANCE > 0.05) {
    problems.push(`prizes land on ${pct(PRIZE_CHANCE)} of plays — that is often enough to be the reason to play, which makes the gold economy decorative`);
}

// ── THE VERDICT ──────────────────────────────────────────────────────────────────────────────────────────────
if (problems.length) {
    console.log(`\ncheck:casino FAILED — ${problems.length} problem(s):\n`);
    for (const p of problems) console.log(`  ✗ ${p}`);
    console.log("\nThe tables in casino.js are the only place these numbers live. Change them there.");
    process.exit(1);
}
console.log(`\ncheck:casino — every machine keeps a house edge. The slot returns ${pct(rtp)}.`);
