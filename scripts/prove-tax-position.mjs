// ── PROVE THE TAX POSITION ──────────────────────────────────────────────────────────────────────────────────
// Prints the module the Tax Position screen reads, laid out the way the screen lays it out, so the
// arithmetic can be argued with before it is on a phone.
//
//   npm run prove:tax
//   npm run prove:tax -- --w2 170000 --fed 0.24      (model filing single)
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

const arg = (name) => {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : undefined;
};

const { taxPosition } = await import("../src/lib/admin-app/tax-position.js");
const r = await taxPosition({ w2Income: arg("w2"), federalMarginal: arg("fed"), stateRate: arg("state") });

const usd = (n) => (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pad = (s, n) => String(s).padEnd(n);
const rp = (s, n) => String(s).padStart(n);
const rule = (c = "─") => console.log(c.repeat(76));

console.log();
rule("═");
console.log(`  TAX POSITION — ${r.year}    as of ${r.asOf}`);
rule("═");

const sa = r.setAside;
console.log();
console.log(`  SET ASIDE   ${usd(sa.amount)}`);
console.log(`  on projected profit of ${usd(sa.onProfit)}   ·   marginal rate ${sa.marginalRatePercent.toFixed(1)}%`);
console.log(`  range across scenarios: ${usd(sa.low)} .. ${usd(sa.high)}`);
console.log();
console.log(`  why that rate: the day job uses ${usd(r.config.w2Income)} of the ${usd(r.config.ssWageBase)} Social Security`);
console.log(`  wage base, leaving ${usd(r.config.ssRoomLeft)} — so profit inside that gap pays the FULL 15.3%.`);

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
console.log(`  ${pad("net position, year to date", 34)}${rp(usd(y.netPosition), 15)}`);
console.log(`  (${y.unclassified.rows} rows / ${usd(y.unclassified.amount)} could not be classified and are not charged)`);

console.log();
rule();
console.log(`  WHERE IT LANDS — ${r.projection.daysLeft} days left, ~${r.projection.tradingDaysLeft} trading days`);
rule();
console.log(`  ${pad("scenario", 26)}${rp("$/trading day", 15)}${rp("full-year", 14)}${rp("tax", 13)}`);
for (const s of r.projection.scenarios) {
    const marker = s.key === r.projection.midKey ? " <-" : "";
    console.log(`  ${pad(s.label, 26)}${rp(usd(s.perTradingDay), 15)}${rp(usd(s.projectedProfit), 14)}${rp(usd(s.tax.total), 13)}${marker}`);
}
const midS = r.projection.scenarios.find((s) => s.key === r.projection.midKey);
if (midS && !midS.tax.isRefund) {
    console.log();
    console.log(`  the ${usd(midS.tax.total)} is made of:`);
    console.log(`    ${pad("self-employment tax", 26)}${rp(usd(midS.tax.selfEmployment), 13)}`);
    console.log(`    ${pad("federal, after QBI", 26)}${rp(usd(midS.tax.federal), 13)}`);
    console.log(`    ${pad("state", 26)}${rp(usd(midS.tax.state), 13)}`);
}

console.log();
rule();
console.log("  THE INVENTORY DECISION");
rule();
const inv = r.inventory;
const lev = r.inventoryLever;
console.log(`  ending inventory AT COST   ${usd(inv.cost)}   ${inv.units} units across ${inv.variations} variations`);
console.log(`  (bought ${inv.bought.units} units for ${usd(inv.bought.cost)}; ${inv.soldFromBatches.units} sold at ${usd(inv.soldFromBatches.cost)})`);
console.log();
console.log(`  A. capitalise (default)      profit ${rp(usd(lev.capitalised.profit), 13)}   tax ${rp(usd(lev.capitalised.tax.total), 13)}`);
console.log(`  B. deduct when bought        profit ${rp(usd(lev.deductedWhenBought.profit), 13)}   tax ${rp(usd(lev.deductedWhenBought.tax.total), 13)}`);
console.log(`  SWING THIS YEAR              ${usd(lev.swing)}`);
console.log(`  >> DEFERRAL, not a saving: that stock then sells next year with no cost to offset it.`);
console.log();
console.log("  biggest unsold positions:");
for (const p of inv.positions.slice(0, 6)) {
    console.log(`    ${pad(String(p.variationId).slice(0, 24), 26)}${rp(p.units, 5)} x ${rp(usd(p.paidEach), 10)} = ${rp(usd(p.value), 12)}  (${p.boughtOn})`);
}

console.log();
rule();
console.log("  NOT INCOME TAX — never add these to the figure above");
rule();
const n = r.notIncomeTax;
for (const [label, value] of [
    ["sales tax remitted (customers' money)", n.salesTaxRemitted],
    ["wages paid (W-2 due Jan 31)", n.wages],
    ["payroll tax deposits", n.payrollTax],
    ["workers comp", n.workersComp],
    ["capital equipment (s179 candidate)", n.capitalEquipment],
    ["owner contributions in (capital, not income)", n.ownerContributions],
    ["owner draws out (not a taxable event)", n.ownerDraws],
]) {
    console.log(`  ${pad(label, 46)}${rp(usd(value), 14)}`);
}

console.log();
console.log(`  ${r.disclaimer}`);
console.log();
