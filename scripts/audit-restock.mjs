// ── DID THE RESTOCK ACTUALLY LAND IN SQUARE? ────────────────────────────────────────────────────────────────
// Luke: "look at the recent restock we just did and tell me everything that landed in square and see if we
// missed anything."
//
// ⚠️ THE FAILURE THIS IS LOOKING FOR IS SILENT BY CONSTRUCTION. A line with no sell price cannot be created
// in Square, so the money books and the stock does not -- see [[restock-priceless-line-drop]], which has
// happened five times. Nothing throws. The only way to see it is to walk the purchase batches we recorded
// and ask Square, line by line, whether the thing we paid for exists and is on the shelf.
//
//   node scripts/audit-restock.mjs [--days 7]
//
// Reads production Neon and production Square. Writes NOTHING.
import { readFileSync } from "node:fs";

const pick = (file, key) => {
    const line = readFileSync(file, "utf8").split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
    if (!line) throw new Error(`${key} not found in ${file}`);
    return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, "");
};
const ACCOUNTING = "C:/Users/Luke/Projects/accounting_app";
process.env.DATABASE_URL = pick(`${ACCOUNTING}/.env`, "DATABASE_URL");
process.env.SQUARE_ACCESS_TOKEN = pick(`${ACCOUNTING}/local.properties`, "SQUARE_ACCESS_TOKEN");

const arg = (name, d) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const DAYS = Number(arg("days", 7));

const { db } = await import("../src/lib/db.js");

const SQUARE = "https://connect.squareup.com";
const VERSION = process.env.SQUARE_API_VERSION || "2024-10-17";
const headers = {
    Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
    "Content-Type": "application/json",
    "Square-Version": VERSION,
};
const usd = (n) => (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── WHAT WE RECORDED BUYING ─────────────────────────────────────────────────────────────────────────────────
const batches = await db.query(
    `SELECT id, variation_id, product, quantity, paid_each, occurred_on, created_at
       FROM cogs_ledger
      WHERE quantity > 0 AND occurred_on >= (NOW() AT TIME ZONE 'America/Chicago')::date - ($1::int)
      ORDER BY created_at ASC, id ASC`,
    [DAYS],
).catch((e) => { console.error("cogs_ledger read failed:", e.message); return []; });

console.log();
console.log("=".repeat(96));
console.log(`  RESTOCK AUDIT — purchase batches recorded in the last ${DAYS} days`);
console.log("=".repeat(96));

if (!batches.length) {
    console.log("  No purchase batches recorded in that window. Widen it with --days N.");
    process.exit(0);
}

// Group by the day they were entered, so one restock session reads as one block.
const byDay = new Map();
for (const b of batches) {
    const k = String(b.occurred_on).slice(0, 10);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(b);
}
console.log(`  ${batches.length} lines across ${byDay.size} day(s): ${[...byDay.keys()].join(", ")}`);

// ── ASK SQUARE ABOUT EACH VARIATION ─────────────────────────────────────────────────────────────────────────
// ⚠️ include_deleted_objects, ALWAYS. A deleted item still owns the cost of everything it ever sold, and a
// read that cannot see it reports the line as missing when it merely went away. See
// [[square-deleted-items-cost-loss]].
const ids = [...new Set(batches.map((b) => b.variation_id).filter(Boolean))].map(String);
const catalog = new Map();
for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const res = await fetch(`${SQUARE}/v2/catalog/batch-retrieve`, {
        method: "POST",
        headers,
        body: JSON.stringify({ object_ids: chunk, include_related_objects: true, include_deleted_objects: true }),
    }).then((r) => r.json()).catch(() => ({}));
    for (const o of res.objects || []) catalog.set(o.id, o);
    for (const o of res.related_objects || []) catalog.set(o.id, o);
}

// ── AND WHAT IS ON THE SHELF ────────────────────────────────────────────────────────────────────────────────
const counts = new Map();
for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const res = await fetch(`${SQUARE}/v2/inventory/counts/batch-retrieve`, {
        method: "POST",
        headers,
        body: JSON.stringify({ catalog_object_ids: chunk }),
    }).then((r) => r.json()).catch(() => ({}));
    for (const c of res.counts || []) {
        if (c.state !== "IN_STOCK") continue;
        counts.set(c.catalog_object_id, (counts.get(c.catalog_object_id) || 0) + Number(c.quantity || 0));
    }
}

// ── THE VERDICT, LINE BY LINE ───────────────────────────────────────────────────────────────────────────────
const problems = [];
let spend = 0;
for (const [day, rows] of byDay) {
    console.log();
    console.log("-".repeat(96));
    console.log(`  ${day}  (${rows.length} lines)`);
    console.log("-".repeat(96));
    console.log(`  ${"qty".padStart(4)}  ${"paid ea".padStart(10)}  ${"line".padStart(11)}  ${"on shelf".padStart(9)}  ${"price".padStart(9)}  item`);
    for (const b of rows) {
        const qty = Number(b.quantity) || 0;
        const paid = Number(b.paid_each) || 0;
        spend += qty * paid;
        const vid = b.variation_id ? String(b.variation_id) : null;
        const obj = vid ? catalog.get(vid) : null;
        const price = obj?.item_variation_data?.price_money?.amount;
        const name = obj
            ? `${catalog.get(obj.item_variation_data?.item_id)?.item_data?.name || "?"} — ${obj.item_variation_data?.name || ""}`.trim()
            : (b.product || "(no name recorded)");
        const onShelf = vid && counts.has(vid) ? counts.get(vid) : null;

        let flag = "";
        if (!vid) { flag = "NOT LINKED TO SQUARE"; }
        else if (!obj) { flag = "VARIATION NOT FOUND IN SQUARE"; }
        else if (obj.is_deleted) { flag = "DELETED IN SQUARE"; }
        else if (price == null) { flag = "NO SELL PRICE"; }
        else if (onShelf == null) { flag = "NO STOCK RECORD"; }
        else if (onShelf <= 0) { flag = "STOCK IS ZERO"; }
        if (flag) problems.push({ day, b, name, flag });

        console.log(
            `  ${String(qty).padStart(4)}  ${usd(paid).padStart(10)}  ${usd(qty * paid).padStart(11)}  `
            + `${(onShelf == null ? "—" : String(onShelf)).padStart(9)}  `
            + `${(price == null ? "—" : usd(price / 100)).padStart(9)}  ${name.slice(0, 44)}`
            + (flag ? `   <-- ${flag}` : ""),
        );
    }
}

console.log();
console.log("=".repeat(96));
console.log(`  RECORDED SPEND: ${usd(spend)} across ${batches.length} lines`);
console.log("=".repeat(96));
if (!problems.length) {
    console.log("  Every line is linked, priced, and carries stock in Square. Nothing was dropped.");
} else {
    console.log(`  ⚠ ${problems.length} LINE(S) NEED A LOOK:`);
    for (const p of problems) {
        const qty = Number(p.b.quantity) || 0;
        const paid = Number(p.b.paid_each) || 0;
        console.log(`    ${p.day}  ${String(qty).padStart(3)} x ${usd(paid).padStart(9)} = ${usd(qty * paid).padStart(10)}  ${p.name.slice(0, 40).padEnd(42)} ${p.flag}`);
    }
    console.log();
    console.log("  A line with NO SELL PRICE is the known one: Square cannot create an item without a price,");
    console.log("  so the money books and the stock does not. It has happened five times.");
}
console.log();
