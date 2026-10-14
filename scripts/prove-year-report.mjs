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
const cost = r.costToStayOpen;
console.log();
console.log(`  ${pad("merchandise profit", 42)}${rpad(usd(r.profit.merchProfit), 14)}`);
console.log(`  ${pad("operating cost (ACTUAL, from the ledger)", 42)}${rpad(usd(-cost.operatingCost), 14)}`);
console.log(`  ${" ".repeat(42)}${rpad("-".repeat(13), 14)}`);
console.log(`  ${pad("NET POSITION", 42)}${rpad(usd(be.netPosition), 14)}   ${be.isAbove ? "ABOVE" : "BELOW"} break-even`);
console.log();
console.log(`  net sales ${usd(r.profit.netSales)}   margin ${r.profit.marginPercent.toFixed(1)}%   crossed ${be.crossedMonth || "not yet"}`);
console.log(`  forward run rate ${usd(be.runRatePerDay)}/day -- the Today page target, NOT what this is measured against`);
console.log();
console.log("  NOT charged, because it is already counted elsewhere or was never the shop's cost:");
for (const x of cost.excluded) {
    console.log(`    ${pad(x.bucket, 26)}${rpad(usd(x.amount), 13)}  ${x.why || ""}`);
}
console.log();
console.log(`  >> ERROR BAR: ${r.unidentified.rows} rows / ${usd(r.unidentified.amount)} carry no merchant name, cannot be`);
console.log("     classified by code, and are NOT charged. That is the range this report is honest to.");
console.log(`  >> ${r.mirrored.pairs} hand entries matched their own bank debit (${usd(r.mirrored.amount)}) and were counted once.`);

console.log();
rule();
console.log("  MONTH BY MONTH");
rule();
console.log(`  ${pad("month", 9)}${rpad("profit", 12)}${rpad("cost", 12)}${rpad("net", 12)}${rpad("cumulative", 13)}`);
for (const m of r.months) {
    console.log(`  ${pad(m.month, 9)}${rpad(usd(m.profit), 12)}${rpad(usd(-m.cost), 12)}${rpad(usd(m.net), 12)}${rpad(usd(m.cumulative), 13)}`);
}
console.log();
rule();
console.log(`  EVERY DOLLAR OUT, CLASSIFIED -- ${usd(r.spend.total)} across ${r.spend.countedRows} rows`);
rule();
console.log(`  ${pad("bucket", 26)}${rpad("rows", 6)}${rpad("amount", 14)}  charged?`);
for (const b of r.spend.buckets) {
    console.log(`  ${pad(b.bucket, 26)}${rpad(b.rows, 6)}${rpad(usd(b.amount), 14)}  ${b.cost ? "YES" : "no"}`);
    if (!b.cost && b.why) console.log(`  ${" ".repeat(26)}${" ".repeat(20)}  (${b.why})`);
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

console.log("forward run-rate lines:", cost.runRateLines.map((l) => `${l.label} ${usd(l.amountCents / 100)}/${l.cadence}`).join(", "));
console.log();
