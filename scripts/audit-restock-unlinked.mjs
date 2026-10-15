// ── IS IT MISSING FROM SQUARE, OR MERELY UNLINKED? ──────────────────────────────────────────────────────────
// audit-restock.mjs flags any purchase batch whose variation_id is NULL as "NOT LINKED TO SQUARE". That is
// a fact about OUR cost row, not about Square, and the two possibilities could not be more different:
//
//   A. THE ITEM IS IN SQUARE, the cost row just never got attached to it. Stock is on the shelf and sellable;
//      what is broken is cost tracking, so margin on those sales reads wrong. Annoying, not urgent.
//   B. THE ITEM IS NOT IN SQUARE AT ALL. The money left, the stock never arrived, and nobody can sell it.
//      That is [[restock-priceless-line-drop]] and it is the one that costs real money.
//
// Telling Luke "eleven lines missing" when half are case A would be a false alarm, and telling him they are
// all case A when one is case B is worse. So: search the catalogue BY NAME for each unlinked line and say
// which it is.
//
//   node scripts/audit-restock-unlinked.mjs [--days 10]
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
const DAYS = Number(arg("days", 10));

const { db } = await import("../src/lib/db.js");

const SQUARE = "https://connect.squareup.com";
const headers = {
    Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
    "Content-Type": "application/json",
    "Square-Version": process.env.SQUARE_API_VERSION || "2024-10-17",
};
const usd = (n) => "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const rows = await db.query(
    `SELECT product, quantity, paid_each, occurred_on
       FROM cogs_ledger
      WHERE quantity > 0 AND variation_id IS NULL
        AND occurred_on >= (NOW() AT TIME ZONE 'America/Chicago')::date - ($1::int)
      ORDER BY occurred_on ASC`,
    [DAYS],
).catch(() => []);

// Square's text search matches whole words, so a long retail name with brackets and parentheses finds
// nothing. Take the first few meaningful words -- that is what actually matches a catalogue entry.
const key = (name) => String(name || "")
    .replace(/[[\]()]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 4)
    .join(" ");

console.log();
console.log("=".repeat(100));
console.log(`  UNLINKED PURCHASE LINES — is each one IN Square under another record, or genuinely absent?`);
console.log("=".repeat(100));

let absent = 0;
let present = 0;
for (const r of rows) {
    const q = key(r.product);
    const res = await fetch(`${SQUARE}/v2/catalog/search-catalog-items`, {
        method: "POST",
        headers,
        body: JSON.stringify({ text_filter: q, limit: 8 }),
    }).then((x) => x.json()).catch(() => ({}));

    const items = res.items || [];
    const day = String(r.occurred_on).slice(0, 10);
    const spend = Number(r.quantity) * Number(r.paid_each);
    console.log();
    console.log(`  ${day}  ${String(r.quantity).padStart(3)} x ${usd(Number(r.paid_each)).padStart(9)} = ${usd(spend).padStart(10)}  ${r.product}`);
    console.log(`      searched Square for: "${q}"`);

    if (!items.length) {
        absent += 1;
        console.log(`      ⚠ NOTHING IN THE CATALOGUE MATCHES. Money spent, no sellable item.`);
        continue;
    }
    present += 1;
    for (const it of items.slice(0, 3)) {
        const vars = it.item_data?.variations || [];
        const ids = vars.map((v) => v.id);
        let stock = 0;
        if (ids.length) {
            const c = await fetch(`${SQUARE}/v2/inventory/counts/batch-retrieve`, {
                method: "POST", headers, body: JSON.stringify({ catalog_object_ids: ids }),
            }).then((x) => x.json()).catch(() => ({}));
            for (const row of c.counts || []) {
                if (row.state === "IN_STOCK") stock += Number(row.quantity || 0);
            }
        }
        const price = vars[0]?.item_variation_data?.price_money?.amount;
        console.log(`      · ${it.item_data?.name?.slice(0, 54).padEnd(56)} stock ${String(stock).padStart(4)}  ${price == null ? "NO PRICE" : usd(price / 100)}`);
    }
}

console.log();
console.log("=".repeat(100));
console.log(`  ${present} line(s) DO exist in Square under a catalogue entry — the cost row simply was not linked.`);
console.log(`  ${absent} line(s) have NO matching catalogue entry at all.`);
console.log("=".repeat(100));
console.log();
