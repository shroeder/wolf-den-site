// ── PROVE THE BUSINESS POSITION ─────────────────────────────────────────────────────────────────────────────
// Prints the module the Position screen reads, laid out the way the screen lays it out, so the arithmetic
// can be argued with before it is on a phone.
//
//   npm run prove:tax
//
// Reads production Neon. Writes nothing, and makes no Square call.
import { readFileSync } from "node:fs";

const pick = (file, key) => {
    const line = readFileSync(file, "utf8").split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
    if (!line) throw new Error(`${key} not found in ${file}`);
    return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, "");
};
const ACCOUNTING = "C:/Users/Luke/Projects/accounting_app";
process.env.DATABASE_URL = pick(`${ACCOUNTING}/.env`, "DATABASE_URL");

const { businessPosition } = await import("../src/lib/admin-app/tax-position.js");
const r = await businessPosition({});

const usd = (n) => (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pad = (s, n) => String(s).padEnd(n);
const rp = (s, n) => String(s).padStart(n);
const rule = (c = "─") => console.log(c.repeat(76));

console.log();
rule("═");
console.log(`  THE BUSINESS — ${r.year}    as of ${r.asOf}`);
rule("═");

const g = r.goal;
console.log();
console.log(`  NET POSITION   ${usd(g.current)}   ${g.isUnder ? "UNDER" : "OVER"} the ${usd(g.target)} line`);
console.log(`  projected by year end: ${usd(g.projected)}  (${g.projectedIsUnder ? "under" : "OVER"} the line)`);
if (g.profitToGiveUp > 0) {
    console.log();
    console.log(`  >> To force it under the line you would have to give up ${usd(g.profitToGiveUp)} of PROFIT.`);
    console.log(`     That is not a saving. And buying stock will not do it — stock is an asset, so the cash`);
    console.log(`     leaves and the position does not move.`);
}

console.log();
rule();
console.log("  WHERE THE YEAR STANDS");
rule();
const y = r.yearToDate;
console.log(`  ${pad("net sales", 34)}${rp(usd(y.netSales), 15)}`);
console.log(`  ${pad("- cost of goods + card fees", 34)}${rp(usd(-y.costAndFees), 15)}`);
console.log(`  ${pad("gross profit on merchandise", 34)}${rp(usd(y.grossProfit), 15)}   margin ${y.marginPercent.toFixed(1)}%`);
console.log(`  ${pad("- operating cost", 34)}${rp(usd(-y.operatingCost), 15)}`);
console.log(`  ${" ".repeat(34)}${rp("-".repeat(14), 15)}`);
console.log(`  ${pad("net position", 34)}${rp(usd(y.netPosition), 15)}`);
console.log(`  (${y.unclassified.rows} rows / ${usd(y.unclassified.amount)} unclassifiable, not charged — the error bar)`);

console.log();
rule();
console.log(`  WHERE IT LANDS — ${r.projection.daysLeft} days left, ~${r.projection.tradingDaysLeft} trading`);
rule();
console.log(`  ${pad("pace", 28)}${rp("$/trading day", 16)}${rp("year end", 16)}${rp("vs line", 12)}`);
for (const s of r.projection.scenarios) {
    const mark = s.key === r.projection.likelyKey ? " <-" : "";
    console.log(`  ${pad(s.label, 28)}${rp(usd(s.perTradingDay), 16)}${rp(usd(s.projectedPosition), 16)}${rp(s.underGoal ? "under" : "OVER", 12)}${mark}`);
}
console.log(`  (cost of staying open for the rest of the year: ${usd(r.projection.forwardCost)})`);

console.log();
rule();
console.log("  MONEY TIED UP IN STOCK");
rule();
const inv = r.inventory;
console.log(`  ${usd(inv.cost)} at cost — ${inv.units} unsold units across ${inv.variations} products`);
console.log(`  (bought ${inv.bought.units} units for ${usd(inv.bought.cost)}; ${inv.soldFromBatches.units} sold)`);
console.log();
console.log("  biggest positions:");
for (const p of inv.positions.slice(0, 6)) {
    console.log(`    ${pad(String(p.variationId).slice(0, 24), 26)}${rp(p.units, 5)} x ${rp(usd(p.paidEach), 10)} = ${rp(usd(p.value), 12)}  (${p.boughtOn})`);
}

console.log();
rule();
console.log("  WHAT THE BUSINESS OWES OR HOLDS");
rule();
const o = r.obligations;
for (const [label, value] of [
    ["sales tax remitted (customers' money)", o.salesTaxRemitted],
    ["wages paid (W-2 due Jan 31)", o.wages],
    ["payroll tax deposits", o.payrollTax],
    ["workers comp", o.workersComp],
    ["capital equipment on the books", o.capitalEquipment],
    ["owner money in (capital, not income)", o.ownerContributions],
    ["owner money out (not a taxable event)", o.ownerDraws],
]) {
    console.log(`  ${pad(label, 44)}${rp(usd(value), 14)}`);
}

console.log();
console.log(`  ${r.note}`);
console.log();
