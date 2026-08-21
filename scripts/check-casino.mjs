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
import { SLOT_SYMBOLS, SLOT_PAYS, RTP_CEILING, RTP_TARGET, slotPayout, slotRtp } from "../src/lib/marketplace/casino.js";

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

// ── THE VERDICT ──────────────────────────────────────────────────────────────────────────────────────────────
if (problems.length) {
    console.log(`\ncheck:casino FAILED — ${problems.length} problem(s):\n`);
    for (const p of problems) console.log(`  ✗ ${p}`);
    console.log("\nThe tables in casino.js are the only place these numbers live. Change them there.");
    process.exit(1);
}
console.log(`\ncheck:casino — every machine keeps a house edge. The slot returns ${pct(rtp)}.`);
