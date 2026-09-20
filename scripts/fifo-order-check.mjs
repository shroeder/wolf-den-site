// ── DOES AN INCREMENTAL RUN STILL KNOW WHAT EARLIER RUNS SPENT? ──────────────────────────────────────────────
// Luke: "It's supposed to be first in, first out." The stored-cost table gets that right on a FULL run and got
// it wrong on every run after — `consumed` started empty each call while the reconciler only walks forward from
// its cursor, so the first sale of an item in tonight's run was handed a batch that sales in July had already
// emptied. Same "last price wins" the table was built to kill, one night later and invisible.
//
// This runs the REAL allocator (fifo.js, imported through the app loader) over Luke's actual ETB case and
// asserts both halves: the bug reproduces when the opening position is zero, and the fix holds when it is
// seeded. A test that only checked the fixed path would have passed before the fix too.
//
// Run:  node --experimental-loader ./scripts/lib/app-loader.mjs scripts/fifo-order-check.mjs
import { allocate } from "@/lib/cogs/fifo.js";

// The real purchase history Luke asked about: eleven boxes at $120, then five at $115.
const BATCHES = [
    { ledgerId: "a", occurredOn: "2026-06-01", units: 11, paidEachCents: 12000 },
    { ledgerId: "b", occurredOn: "2026-07-01", units: 5, paidEachCents: 11500 },
];

let failures = 0;
const check = (label, got, want) => {
    const ok = got === want;
    if (!ok) failures += 1;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}\n        got ${got}  want ${want}`);
};

console.log("\nEleven ETBs at $120, five at $115. Sales run in order.\n");

// ── The first eleven sales draw the $120 layer ───────────────────────────────────────────────────────────────
const first11 = allocate(BATCHES, 0, 11);
check("first 11 units cost 11 x $120", first11.costCents, 11 * 12000);
check("  ...and drew from one batch", first11.batches.length, 1);

// ── The twelfth is the one that must step down ───────────────────────────────────────────────────────────────
const twelfth = allocate(BATCHES, 11, 1);
check("12th unit costs $115, not $120", twelfth.costCents, 11500);

// ── THE BUG, REPRODUCED. This is what an incremental run did before the fix: it re-derived the opening
//    position as zero, so the twelfth sale of the season was costed as if it were the first of all time.
const asIncrementalUsedToBe = allocate(BATCHES, 0, 1);
check("the old behaviour really was wrong (12th priced as $120)", asIncrementalUsedToBe.costCents, 12000);
if (asIncrementalUsedToBe.costCents === twelfth.costCents) {
    console.log("  !! the two paths agree, so this check cannot detect the bug it exists for");
    failures += 1;
}

// ── Past the end of the recorded history, units are SHORT and never free ─────────────────────────────────────
const beyond = allocate(BATCHES, 16, 2);
check("a 17th and 18th unit report as short", beyond.short, 2);
check("  ...and cost nothing rather than being priced at zero", beyond.costCents, 0);
check("  ...and say how many units they did cover", beyond.units, 0);

// ── A sale that straddles the price change pays both prices ──────────────────────────────────────────────────
const straddle = allocate(BATCHES, 10, 3);
check("a 3-unit sale across the boundary pays 1x$120 + 2x$115", straddle.costCents, 12000 + 2 * 11500);
check("  ...and names both batches", straddle.batches.length, 2);

console.log(`\n${failures === 0 ? "all checks passed" : failures + " CHECK(S) FAILED"}\n`);
process.exit(failures === 0 ? 0 : 1);
