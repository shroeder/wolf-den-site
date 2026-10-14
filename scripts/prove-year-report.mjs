// ── PROVE THE YEAR REPORT ───────────────────────────────────────────────────────────────────────────────────
// Runs the server module the Year screen reads and prints it the way the screen lays it out, so the
// arithmetic can be argued with before it is on a phone.
//
//   npm run prove:year
//   npm run prove:year -- --year 2026
//
// Reads production Neon and writes NOTHING — no Square call either, because profit comes off the nightly
// report bundle. Safe to run as often as you like.
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

const arg = (name, fallback = null) => {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const { yearReport } = await import("../src/lib/admin-app/year-report.js");

const yearArg = arg("year");
const r = await yearReport(yearArg ? { year: Number(yearArg) } : {});

const usd = (n) => (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pad = (s, n) => String(s).padEnd(n);
const rpad = (s, n) => String(s).padStart(n);
const rule = (c = "─") => console.log(c.repeat(74));

console.log();
rule("═");
console.log(`  THE YEAR — ${r.year}    ${r.range.from} to ${r.range.to}    ${r.entryCount} ledger rows`);
rule("═");

const be = r.breakEven;
console.log();
console.log(`  ${pad("merchandise profit", 34)}${rpad(usd(r.profit.merchProfit), 14)}`);
console.log(`  ${pad(`overhead  ${r.range.tradingDays} days x ${usd(r.costToStayOpen.dailyOverheadCents / 100)}/day`, 34)}${rpad(usd(-r.costToStayOpen.overheadTotal), 14)}`);
console.log(`  ${pad("wages (Square payroll)", 34)}${rpad(usd(-r.costToStayOpen.wagesTotal), 14)}`);
console.log(`  ${" ".repeat(34)}${rpad("─".repeat(13), 14)}`);
console.log(`  ${pad("NET POSITION", 34)}${rpad(usd(be.netPosition), 14)}   ${be.isAbove ? "ABOVE" : "BELOW"} break-even`);
console.log();
console.log(`  net sales ${usd(r.profit.netSales)}   margin ${r.profit.marginPercent.toFixed(1)}%   `
    + `bundle built ${r.profit.builtAt || "never"}`);
console.log(`  trading since ${r.range.tradingFrom}   needs ${usd(be.perDayNeeded)}/day   `
    + `crossed ${be.crossedMonth || "not yet"}`);

console.log();
rule();
console.log("  MONTH BY MONTH");
rule();
console.log(`  ${pad("month", 9)}${rpad("profit", 11)}${rpad("overhead", 11)}${rpad("wages", 10)}${rpad("net", 11)}${rpad("cumulative", 12)}`);
for (const m of r.months) {
    console.log(`  ${pad(m.month, 9)}${rpad(usd(m.profit), 11)}${rpad(usd(-m.overhead), 11)}`
        + `${rpad(usd(-m.wages), 10)}${rpad(usd(m.net), 11)}${rpad(usd(m.cumulative), 12)}`);
}

console.log();
rule();
console.log(`  CASH OUT — ${usd(r.spend.total)} total`);
rule();
for (const b of r.spend.buckets) {
    const share = r.spend.total ? (b.amount / r.spend.total) * 100 : 0;
    console.log(`  ${pad(b.bucket, 22)}${rpad(b.rows + " rows", 10)}${rpad(usd(b.amount), 14)}${rpad(share.toFixed(1) + "%", 8)}`);
}
if (r.spend.uncategorizedRows) {
    console.log(`  ⚠ ${r.spend.uncategorizedRows} rows (${usd(r.spend.uncategorizedAmount)}) have no category — bank-synced and never filed.`);
}

console.log();
rule();
console.log("  LUKE'S OWN MONEY");
rule();
const pi = r.personalInvestment;
console.log(`  ${pad("contributions in", 34)}${rpad(usd(pi.contributions), 14)}`);
console.log(`  ${pad("draws + reimbursements out", 34)}${rpad(usd(-pi.drawsOut), 14)}`);
console.log(`  ${" ".repeat(34)}${rpad("─".repeat(13), 14)}`);
console.log(`  ${pad("NET INVESTED", 34)}${rpad(usd(pi.net), 14)}`);
console.log();
console.log(`  (ledger deposits ${usd(r.deposits)} — gross Square settlement, not profit)`);
console.log();

console.log("overhead lines:", r.costToStayOpen.overheadLines.map((l) => `${l.label} ${usd(l.amountCents / 100)}/${l.cadence}`).join(", "));
console.log();
