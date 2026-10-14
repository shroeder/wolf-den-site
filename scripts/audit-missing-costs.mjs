// ── WHAT IS THE BREAK-EVEN CALCULATION NOT CHARGING THE SHOP FOR? ──────────────────────────────────────────
// Luke: "Do we not consider spending money in inventory a cost? What other costs did we miss?"
//
// Two separate answers, and conflating them is how you get a wrong number either way:
//   1. Inventory IS a cost — recognised when it SELLS, not when it is bought. This prints how much of the
//      stock spend has actually been recognised so far, and how much is still sitting on the shelf.
//   2. Everything else the cost side genuinely omits, sized from the ledger so it can be ranked.
//
// Reads production Square + Neon. Writes nothing except the FIFO rows costSales() writes on read — which
// the phone's own report writes, through the same function, every time it is opened.
// See [[unit-cost-is-exact-fifo-never-averaged]].
import { readFileSync } from "node:fs";

const pick = (file, key) => {
    const line = readFileSync(file, "utf8").split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
    if (!line) throw new Error(`${key} not found in ${file}`);
    return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, "");
};
const ACCOUNTING = "C:/Users/Luke/Projects/accounting_app";
process.env.DATABASE_URL = pick(`${ACCOUNTING}/.env`, "DATABASE_URL");
process.env.SQUARE_ACCESS_TOKEN = pick(`${ACCOUNTING}/local.properties`, "SQUARE_ACCESS_TOKEN");

const { fetchSaleLines, summarise } = await import("../src/lib/admin-app/reports-v2.js");
const { listEntries } = await import("../src/lib/ledger/ledger.js");
const { listOverhead, perDayCents } = await import("../src/lib/admin-app/breakeven.js");
const { db } = await import("../src/lib/db.js");

const usd = (n) => (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ZONE = "America/Chicago";
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const dayKey = (ms) => dayKeyFmt.format(new Date(ms));
const rule = (c = "─") => console.log(c.repeat(78));

// ── 1. IS INVENTORY A COST? ───────────────────────────────────────────────────────────────────────────────
const lines = await fetchSaleLines({ lookbackDays: 400 });
const consignorRows = await db.query(
    `SELECT square_category_id, payout_rate FROM consignors
      WHERE active = true AND payout_rate > 0 AND payout_rate < 1 AND square_category_id IS NOT NULL`
).catch(() => []);
const consigned = new Map(consignorRows.map((r) => [String(r.square_category_id), Number(r.payout_rate)]));
const refundRows = await db.query(
    `SELECT occurred_on::text AS on, amount FROM cash_ledger WHERE source = 'refund'`
).catch(() => []);
const cashRefunds = refundRows.map((r) => ({ date: String(r.on).slice(0, 10), amount: Math.abs(Number(r.amount) || 0) }));

const yearLines = lines.filter((l) => dayKey(l.soldAtMillis).startsWith("2026"));
const s = summarise({ lines: yearLines, cashRefunds, consignedRateByCategoryId: consigned });

console.log();
rule("═");
console.log("  1. INVENTORY — IS IT A COST?");
rule("═");
console.log(`  net sales                                 ${usd(s.netSales).padStart(14)}`);
console.log(`  realised cost of goods (FIFO, what SOLD)  ${usd(-s.storeCost).padStart(14)}`);
console.log(`  card processing fees                      ${usd(-s.storeFees).padStart(14)}`);
console.log(`  consigned commission earned               ${usd(s.consignedCommission).padStart(14)}`);
console.log(`  refunds                                   ${usd(-s.refunded).padStart(14)}`);
console.log(`  ${"".padEnd(42)}${"─".repeat(14)}`);
console.log(`  merchandise profit                        ${usd(s.profit).padStart(14)}`);
console.log();
console.log("  >> Cost of goods IS already charged — it is inside that profit figure.");

const entries = await listEntries({ limit: 100000 });
const ytd = entries.filter((e) => dayKey(e.date).startsWith("2026"));
const stockBought = -ytd.filter((e) => e.type === "Inventory").reduce((a, e) => a + e.amount, 0);
console.log();
console.log(`  stock PURCHASED this year (ledger)        ${usd(stockBought).padStart(14)}`);
console.log(`  of which has SOLD (realised COGS)         ${usd(-s.storeCost).padStart(14)}`);
console.log(`  ${"".padEnd(42)}${"─".repeat(14)}`);
console.log(`  bought but not yet sold                   ${usd(stockBought - s.storeCost).padStart(14)}`);
console.log();
console.log("  >> That remainder is not a loss, it is stock on the shelf. Charging the purchase AND the");
console.log("     COGS would bill the shop twice for the same cards.");

// ── 2. WHAT THE COST SIDE GENUINELY OMITS ─────────────────────────────────────────────────────────────────
const overhead = (await listOverhead()).filter((i) => i.active);
const overheadLabels = new Set(overhead.map((i) => i.label.toLowerCase()));
const dailyOverhead = overhead.reduce((a, i) => a + perDayCents(i), 0) / 100;

const text = (e) => `${e.description || ""} ${e.notes || ""}`.toLowerCase();
const firstKey = ytd.map((e) => dayKey(e.date)).sort()[0];
const lastKey = dayKey(Date.now());
const monthsElapsed = (Date.parse(`${lastKey}T00:00:00Z`) - Date.parse(`${firstKey}T00:00:00Z`)) / 864e5 / (365.25 / 12);

console.log();
rule("═");
console.log(`  2. REAL SPEND THE BREAK-EVEN COST SIDE NEVER SEES  (${monthsElapsed.toFixed(1)} months of books)`);
rule("═");

// Buckets of real operating spend, excluding the three things profit already nets (stock, consignor
// payouts, card fees) and excluding payroll (which IS charged).
const omitted = new Map();
for (const e of ytd) {
    if (e.type !== "Expense") continue;
    if (text(e).includes("consign") || text(e).includes("payroll")) continue;
    let label = e.category;
    if (label === "Other") label = text(e).includes("insurance") ? "Insurance" : "Other / uncategorised";
    const cur = omitted.get(label) || { rows: 0, amount: 0 };
    cur.rows += 1;
    cur.amount += -e.amount;
    omitted.set(label, cur);
}

console.log(`  ${"category".padEnd(24)}${"rows".padStart(6)}${"spent YTD".padStart(14)}${"per month".padStart(12)}   covered by an overhead line?`);
for (const [label, v] of [...omitted].sort((a, b) => b[1].amount - a[1].amount)) {
    const perMonth = v.amount / monthsElapsed;
    const covered = overheadLabels.has(label.toLowerCase())
        || (label === "Software" && (overheadLabels.has("openai") || overheadLabels.has("anthropic claude")))
        || (label === "Marketing" && overheadLabels.has("advertising"));
    console.log(`  ${label.padEnd(24)}${String(v.rows).padStart(6)}${usd(v.amount).padStart(14)}${usd(perMonth).padStart(12)}   ${covered ? "yes" : "NO  <-- not charged"}`);
}

console.log();
rule();
console.log("  TAXES — what is actually in there");
rule();
for (const e of ytd.filter((x) => x.category === "Taxes").sort((a, b) => a.amount - b.amount)) {
    console.log(`  ${dayKey(e.date)}  ${usd(e.amount).padStart(12)}  ${(e.description || "(no description)").slice(0, 48)}`);
}

console.log();
rule();
console.log("  OVERHEAD LINES THAT EXIST TODAY");
rule();
for (const i of overhead) {
    console.log(`  ${i.label.padEnd(20)}${usd(i.amount_cents / 100).padStart(12)} / ${i.cadence}`);
}
console.log(`  ${"TOTAL".padEnd(20)}${usd(dailyOverhead * (365.25 / 12)).padStart(12)} / month   =  ${usd(dailyOverhead)}/day`);
console.log();
