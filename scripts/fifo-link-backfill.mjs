// LINK HISTORICAL RESTOCKS TO THE ITEM THEY WERE FOR, SO FIFO CAN SEE THEM.
//
// FIFO stacks purchases by Square variation. The intake form only ever captured a typed product NAME, so 216
// of the first 219 ledger rows carry no link and FIFO has nothing to stack — which is why eleven 30th
// Celebration ETBs bought at $120 and five at $115 all costed out at $115.
//
// ⚠️ THIS ONLY LINKS AN EXACT, UNAMBIGUOUS NAME MATCH, AND THAT IS DELIBERATE. Fuzzy matching would "resolve"
// most of the rest and hang a wrong cost on a real product, silently, on the report stock gets priced from. A
// wrong cost is worse than a missing one: missing shows up as an unresolved line somebody can chase, wrong
// looks exactly like an answer. Everything it cannot be sure of goes on the review list instead.
//
// ⚠️ SWEEPS DELETED OBJECTS. Sold-out items get DELETED from the catalog, and a deleted ITEM comes back from
// Square WITHOUT its variations — so the variations are swept separately and joined back by item_id. Skip that
// and every historical purchase of anything since sold out silently fails to match.
//
// Run:  node scripts/fifo-link-backfill.mjs [--apply] [--limit N]
// Default is a dry run. Nothing is written without --apply.
import fs from "node:fs";
import { neon } from "@neondatabase/serverless";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const TOKEN = props.match(/SQUARE_ACCESS_TOKEN=(.+)/)?.[1]?.trim();
if (!TOKEN) throw new Error("no SQUARE_ACCESS_TOKEN in accounting_app/local.properties");
const DB = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/.env", "utf8").match(/DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/)?.[1];
if (!DB) throw new Error("no DATABASE_URL in accounting_app/.env");

const sql = neon(DB);
const H = { "Square-Version": "2025-01-23", Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
const APPLY = process.argv.includes("--apply");

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const money = (n) => `$${(Number(n) || 0).toFixed(2)}`;

async function sweep(type) {
    const out = [];
    let cursor = null;
    do {
        const res = await fetch("https://connect.squareup.com/v2/catalog/search", {
            method: "POST",
            headers: H,
            body: JSON.stringify({ object_types: [type], include_deleted_objects: true, limit: 200, ...(cursor ? { cursor } : {}) }),
        });
        const json = await res.json();
        if (json.errors) throw new Error(JSON.stringify(json.errors));
        out.push(...(json.objects || []));
        cursor = json.cursor || null;
    } while (cursor);
    return out;
}

const items = await sweep("ITEM");
const variations = await sweep("ITEM_VARIATION");
console.log(`catalog: ${items.length} items, ${variations.length} variations (deleted included)`);

const nameOf = new Map(items.map((i) => [i.id, i.item_data?.name || ""]));
// name -> variation ids. Built from the VARIATION sweep so deleted items, whose ITEM object arrives stripped
// of its variations, still resolve.
const byName = new Map();
for (const v of variations) {
    const key = norm(nameOf.get(v.item_variation_data?.item_id));
    if (!key) continue;
    if (!byName.has(key)) byName.set(key, new Set());
    byName.get(key).add(v.id);
}

const rows = await sql`
    SELECT id, product, occurred_on, quantity, paid_each, paid_total
      FROM cogs_ledger
     WHERE variation_id IS NULL AND quantity > 0
     ORDER BY occurred_on DESC`;
console.log(`unlinked ledger rows: ${rows.length}`);

const linked = [];
const review = new Map();
for (const r of rows) {
    const hit = byName.get(norm(r.product));
    if (hit && hit.size === 1) {
        linked.push({ ...r, variationId: [...hit][0] });
        continue;
    }
    const key = r.product || "(blank)";
    if (!review.has(key)) review.set(key, { product: key, rows: 0, units: 0, paid: 0, last: r.occurred_on, why: hit ? `${hit.size} items share this name` : "no catalog item by this name" });
    const e = review.get(key);
    e.rows += 1;
    e.units += Number(r.quantity) || 0;
    e.paid += Number(r.paid_total) || 0;
}

console.log(`\nMATCHED ${linked.length} rows (${new Set(linked.map((l) => norm(l.product))).size} distinct products)`);
for (const l of linked.slice(0, 40)) {
    console.log(`  ${String(l.occurred_on).slice(0, 10)}  ${String(l.quantity).padStart(4)} x ${money(l.paid_each).padStart(9)}  ${l.product}`);
}
if (linked.length > 40) console.log(`  ... and ${linked.length - 40} more`);

const list = [...review.values()].sort((a, b) => b.paid - a.paid);
console.log(`\nNEEDS A HUMAN — ${list.length} product names, ${list.reduce((s, e) => s + e.rows, 0)} rows, ${money(list.reduce((s, e) => s + e.paid, 0))} of purchases`);
for (const e of list.slice(0, 30)) {
    console.log(`  ${money(e.paid).padStart(10)}  ${String(e.units).padStart(4)}u  ${e.product}  — ${e.why}`);
}
if (list.length > 30) console.log(`  ... and ${list.length - 30} more`);

if (!APPLY) {
    console.log("\nDRY RUN. Re-run with --apply to write the links.");
} else {
    let n = 0;
    for (const l of linked) {
        await sql`UPDATE cogs_ledger SET variation_id = ${l.variationId} WHERE id = ${l.id} AND variation_id IS NULL`;
        n += 1;
    }
    console.log(`\nLinked ${n} rows.`);
    console.log("⚠️  Now re-cost: GET /api/jobs/fifo-reconcile?full=1 — linking changes which batch an old sale");
    console.log("    should have drawn from, so every sale has to be worked out again from the beginning.");
}
