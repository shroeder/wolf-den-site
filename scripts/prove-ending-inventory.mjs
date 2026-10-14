// ── ENDING INVENTORY AT COST — THE NUMBER A TAX RETURN ACTUALLY WANTS ──────────────────────────────────────
// Three different figures have been confused for each other, so this prints all three side by side:
//
//   retail value   — quantity x SELL price. What the Invested screen shows (~$32k). Right question for
//                    "what is my shelf worth", wrong one for tax.
//   purchases-less-COGS — stock bought minus stock sold, from the ledger. I used this and it was WRONG:
//                    it assumes every item on the shelf arrived as a cash purchase, and trade-ins don't.
//   FIFO remaining — the unsold batches valued at what was PAID for them. This is ending inventory at
//                    cost, and it is the one the return needs. See [[unit-cost-is-exact-fifo-never-averaged]].
//
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/prove-ending-inventory.mjs
//
// Reads production Neon. Writes nothing.
import { readFileSync } from "node:fs";

const pick = (file, key) => {
    const line = readFileSync(file, "utf8").split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
    if (!line) throw new Error(`${key} not found in ${file}`);
    return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, "");
};
const ACCOUNTING = "C:/Users/Luke/Projects/accounting_app";
process.env.DATABASE_URL = pick(`${ACCOUNTING}/.env`, "DATABASE_URL");

const { db } = await import("../src/lib/db.js");

const usd = (n) => (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Every purchase batch, oldest first — the same ordering fifo.js walks.
const batches = await db.query(
    `SELECT variation_id, occurred_on, quantity, paid_each
       FROM cogs_ledger WHERE quantity > 0
      ORDER BY variation_id, occurred_on ASC, created_at ASC`
);
// Units already consumed by costed sales.
const sold = await db.query(
    `SELECT variation_id, COALESCE(SUM(units), 0) AS sold FROM cogs_fifo_cost GROUP BY variation_id`
);
const soldBy = new Map(sold.map((r) => [String(r.variation_id), Number(r.sold) || 0]));

const byVariation = new Map();
for (const b of batches) {
    const k = String(b.variation_id);
    if (!byVariation.has(k)) byVariation.set(k, []);
    byVariation.get(k).push({ units: Number(b.quantity), paid: Number(b.paid_each), on: String(b.occurred_on).slice(0, 10) });
}

let boughtUnits = 0, boughtCost = 0, soldUnits = 0, soldCost = 0, leftUnits = 0, leftCost = 0;
const leftovers = [];
for (const [variationId, bs] of byVariation) {
    let skip = soldBy.get(variationId) || 0;
    for (const b of bs) {
        boughtUnits += b.units;
        boughtCost += b.units * b.paid;
        // FIFO: the oldest batches are the ones that sold, so what remains is the newest.
        const eaten = Math.min(skip, b.units);
        skip -= eaten;
        soldUnits += eaten;
        soldCost += eaten * b.paid;
        const rest = b.units - eaten;
        if (rest > 0) {
            leftUnits += rest;
            leftCost += rest * b.paid;
            leftovers.push({ variationId, units: rest, paid: b.paid, value: rest * b.paid, on: b.on });
        }
    }
}

console.log();
console.log("═".repeat(72));
console.log("  ENDING INVENTORY AT COST — from the FIFO purchase batches");
console.log("═".repeat(72));
console.log(`  variations with purchase history   ${byVariation.size}`);
console.log(`  units bought                       ${boughtUnits.toLocaleString()}  ${usd(boughtCost).padStart(14)}`);
console.log(`  units sold (FIFO-costed)           ${soldUnits.toLocaleString()}  ${usd(soldCost).padStart(14)}`);
console.log(`  ${"-".repeat(52)}`);
console.log(`  UNITS STILL ON THE SHELF           ${leftUnits.toLocaleString()}  ${usd(leftCost).padStart(14)}  <- ending inventory at COST`);
console.log();
console.log("  the three figures that keep getting confused:");
console.log(`    retail value  (Invested screen)      ~$32,000     quantity x SELL price`);
console.log(`    purchases - COGS (what I used)        $10,057     WRONG: assumes all stock was a cash purchase`);
console.log(`    FIFO remaining at cost                ${usd(leftCost).padStart(11)}     what you actually paid for unsold stock`);
console.log();
console.log("  biggest remaining positions:");
for (const l of leftovers.sort((a, b) => b.value - a.value).slice(0, 12)) {
    console.log(`    ${l.variationId.slice(0, 22).padEnd(24)}${String(l.units).padStart(6)} x ${usd(l.paid).padStart(10)} = ${usd(l.value).padStart(11)}  (bought ${l.on})`);
}
console.log();
