// ── WHAT WOULD SEEDING THIS DO TO THE NUMBERS? ───────────────────────────────────────────────────────────────
// Luke, on the purchase history FIFO still cannot see: "my concern is existing items, and how you can seed
// that properly without interrupting anything."
//
// This is the look-before-you-leap half. It costs every sale against the ledger exactly as the real reconciler
// would, diffs the answer against what is stored, and WRITES NOTHING. Link a batch of restocks to their catalog
// items, run this, read what moves and by how much, and only then apply it.
//
// Why it is safe to run at any hour: the proxy only ever ADDS wolfden_fifo_cost_money where a stored row
// exists, and the phone falls through to the catalog cost when the field is absent. An item that has not been
// seeded behaves precisely as it does today, so seeding is per-item by construction and cannot spill.
//
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/fifo-plan.mjs [--full] [--apply]
//
//   --full   plan a complete re-cost from the first purchase (what a backfill of new links needs).
//            Without it, only sales after the stored cursor are considered.
//   --apply  stop planning and actually run it. Prints the same summary afterwards.
import fs from "node:fs";

// The env the app expects, from where this machine actually keeps it — see the note in CLAUDE.md's sibling
// memory: DATABASE_URL lives in accounting_app/.env, the Square token in accounting_app/local.properties.
const readEnv = () => {
    const local = fs.readFileSync("C:/Users/Luke/Projects/wolf den site/.env.local", "utf8");
    process.env.DATABASE_URL ||= local.match(/DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/)?.[1] || "";
    const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
    process.env.SQUARE_ACCESS_TOKEN ||= props.match(/SQUARE_ACCESS_TOKEN=(.+)/)?.[1]?.trim() || "";
    process.env.SQUARE_API_VERSION ||= "2025-01-23";
    if (!process.env.DATABASE_URL) throw new Error("no DATABASE_URL in wolf den site/.env.local");
    if (!process.env.SQUARE_ACCESS_TOKEN) throw new Error("no SQUARE_ACCESS_TOKEN in accounting_app/local.properties");
};
readEnv();

const { reconcileFifo } = await import("@/lib/cogs/fifo-reconcile.js");

const full = process.argv.includes("--full");
const apply = process.argv.includes("--apply");
const money = (n) => (n == null ? "     —  " : `$${Number(n).toFixed(2)}`.padStart(9));

console.log(`\n${apply ? "APPLYING" : "PLANNING"} a ${full ? "FULL re-cost from the first purchase" : "forward pass from the stored cursor"}\n`);

const r = await reconcileFifo({ full, dryRun: !apply });

if (!r.ok) { console.error("run failed:", r); process.exit(1); }

console.log(`orders scanned      ${r.scanned}`);
console.log(`sale lines seen     ${r.lines ?? "—"}`);
console.log(`lines costed        ${r.costed ?? "—"}`);
console.log(`lines short         ${r.short ?? "—"}   (batches ran out; these stay unreportable, never $0)`);
console.log(`lines skipped       ${r.skipped ?? "—"}   (no linked purchase history at all)`);

if (r.summary) {
    const s = r.summary;
    console.log(`\n  against what is stored today:`);
    console.log(`    new lines costed      ${s.added}`);
    console.log(`    lines that change     ${s.changed}`);
    console.log(`    lines unchanged       ${s.unchanged}`);
    if (full) console.log(`    stored lines dropped  ${s.removed}`);
    console.log(`\n    net movement in reported COGS: ${money(s.deltaDollars)}`);
    if (r.movers?.length) {
        console.log(`\n  biggest movers:`);
        console.log(`    ${"variation".padEnd(26)}${"was".padStart(10)}${"becomes".padStart(10)}${"change".padStart(10)}`);
        for (const m of r.movers.slice(0, 15)) {
            console.log(`    ${String(m.variationId).padEnd(26)}${money(m.from)}${money(m.to)}${money(m.change)}`);
        }
    }
}
console.log(apply ? "\nwritten.\n" : "\nnothing was written. re-run with --apply to commit this.\n");
