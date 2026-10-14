// ── STEP 1 OF REPORTS V2: DOES THE PORT AGREE WITH THE PHONE? ───────────────────────────────────────────────
// Luke: "Once I can assert reports v2 works exactly like reports v1 we will delete the old reports."
//
// Nothing else in v2 is worth building until the rules themselves are proven, so this runs the server port
// over a window and prints the three numbers off the phone's Reports screen. Pass the expected figures and it
// asserts them; pass nothing and it just reports, which is what you want on any window but the screenshot's.
//
//   npm run prove:reports -- --days 14 --net 12683.04 --profit 3841.53
//   npm run prove:reports -- --days 30
//
// ⚠️ IT READS PRODUCTION SQUARE AND PRODUCTION NEON, and writes nothing except the FIFO rows `costSales()`
// writes on read — which the phone's own report writes too, through the same function, every time it is
// opened. See [[unit-cost-is-exact-fifo-never-averaged]].
import { readFileSync } from "node:fs";

// Local secrets live next door in the Android project — `vercel env pull` masks them.
// See [[local-secrets-live-in-accounting-app]].
const pick = (file, key) => {
    const line = readFileSync(file, "utf8").split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
    if (!line) throw new Error(`${key} not found in ${file}`);
    return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, "");
};
const ACCOUNTING = "C:/Users/Luke/Projects/accounting_app";
process.env.DATABASE_URL = pick(`${ACCOUNTING}/.env`, "DATABASE_URL");
process.env.SQUARE_ACCESS_TOKEN = pick(`${ACCOUNTING}/local.properties`, "SQUARE_ACCESS_TOKEN");

const arg = (name, fallback = null) => {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const days = Number(arg("days", 14));
const expectNet = arg("net") === null ? null : Number(arg("net"));
const expectProfit = arg("profit") === null ? null : Number(arg("profit"));

const { db } = await import("@/lib/db.js");
const { fetchSaleLines, summarise, fetchCatalogCategories, categoryNameFor } =
    await import("@/lib/admin-app/reports-v2.js");

// ⚠️ A 100% PAYOUT RATE IS NOT A CONSIGNMENT ARRANGEMENT. It is the owner's test account, which deliberately
// points at a real consignor's Square category — left in, it reports every sale of theirs at zero profit.
// Same filter the phone applies. See [[consignor-luke-is-a-test-category]].
const consignorRows = await db.query(
    `SELECT square_category_id, payout_rate FROM consignors
      WHERE active = true AND payout_rate > 0 AND payout_rate < 1 AND square_category_id IS NOT NULL`
).catch(() => []);
const consignedRateByCategoryId = new Map(
    consignorRows.map((r) => [String(r.square_category_id), Number(r.payout_rate)])
);

// A refund is revenue reversed. Stored negative (cash leaving the drawer); reported as a magnitude.
const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
const refundRows = await db.query(
    `SELECT occurred_on::text AS on, description, amount FROM cash_ledger
      WHERE source = 'refund' AND occurred_on >= $1::date`,
    [since]
).catch(() => []);
const cashRefunds = refundRows.map((r) => ({
    date: String(r.on).slice(0, 10),
    description: r.description || "Customer refund",
    amount: Math.abs(Number(r.amount) || 0),
}));

console.log(`Reports v2 port — last ${days} days (since ${since})`);
console.log(`  consigned categories: ${consignedRateByCategoryId.size}   cash refunds: ${cashRefunds.length}`);

const t0 = Date.now();
const lines = await fetchSaleLines({ lookbackDays: days });
const categoryNamesById = await fetchCatalogCategories().catch(() => new Map());
const s = summarise({ lines, cashRefunds, consignedRateByCategoryId });
const secs = ((Date.now() - t0) / 1000).toFixed(1);

const money = (n) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
console.log(`\n  ${lines.length} sale lines in ${secs}s\n`);
console.log(`  NET SALES   ${money(s.netSales)}`);
console.log(`  PROFIT      ${money(s.profit)}`);
console.log(`  MARGIN      ${s.marginPercent.toFixed(1)}%`);
console.log(`\n  store sales ${money(s.storeSales)} · COGS ${money(s.storeCost)} · card fees ${money(s.storeFees)}`);
console.log(`  consigned commission ${money(s.consignedCommission)} · refunded ${money(s.refunded)}`);
console.log(`  units sold ${s.unitsSold} (+${s.tradeCreditUnits} on trade credit, uncounted)`);

// The categories behind the number, so a mismatch has somewhere to be looked for rather than just being a
// wrong total. Sorted by value, which is how the phone sorts them too.
const byCategory = new Map();
for (const l of lines) {
    const key = l.squareCategoryId || null;
    const name = categoryNameFor(key, categoryNamesById);
    byCategory.set(name, (byCategory.get(name) || 0) + l.netSales);
}
console.log("\n  by category (gross lines, before the store/consigned split):");
for (const [name, total] of [...byCategory].sort((a, b) => b[1] - a[1]).slice(0, 14)) {
    console.log(`    ${name.padEnd(34)} ${money(total).padStart(12)}`);
}

let failed = false;
const near = (a, b) => Math.abs(a - b) < 0.015;
if (expectNet !== null) {
    const ok = near(s.netSales, expectNet);
    console.log(`\n  ${ok ? "MATCH" : "MISMATCH"}  net sales: got ${money(s.netSales)}, phone says ${money(expectNet)}` +
        (ok ? "" : `  (off by ${money(s.netSales - expectNet)})`));
    failed ||= !ok;
}
if (expectProfit !== null) {
    const ok = near(s.profit, expectProfit);
    console.log(`  ${ok ? "MATCH" : "MISMATCH"}  profit:    got ${money(s.profit)}, phone says ${money(expectProfit)}` +
        (ok ? "" : `  (off by ${money(s.profit - expectProfit)})`));
    failed ||= !ok;
}
if (expectNet !== null || expectProfit !== null) {
    console.log(failed ? "\nThe port does NOT agree with the phone yet." : "\nThe port agrees with the phone.");
}
process.exit(failed ? 1 : 0);
