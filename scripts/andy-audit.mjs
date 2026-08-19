// ── WHAT IS ACTUALLY IN ANDY'S CATEGORY RIGHT NOW ────────────────────────────────────────────────────────────
// Read-only. Before anything is moved or re-costed, this says what Square holds today: every item in the
// consignment category, its variations, current stock, current selling price, whether it already carries a
// unit cost, and whether the buyout CSV has a price for it.
//
// It writes nothing. The buyout is real money and the category is what tells the payout report who is owed
// what, so the change gets looked at before it happens.
//
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/andy-audit.mjs [categoryNameFragment=andy]
import { readFileSync } from "node:fs";

import { squareFetch } from "../src/lib/consignment/square.js";

const WANT = (process.argv[2] || "andy").toLowerCase();

// ── THE CATEGORIES ───────────────────────────────────────────────────────────────────────────────────────────
const cats = [];
let cursor;
do {
    const r = await squareFetch(`/v2/catalog/list?types=CATEGORY${cursor ? `&cursor=${cursor}` : ""}`);
    for (const o of r?.objects || []) cats.push({ id: o.id, name: o.category_data?.name || "" });
    cursor = r?.cursor;
} while (cursor);

const hits = cats.filter((c) => c.name.toLowerCase().includes(WANT));
console.log(`\n  ${cats.length} categories in the catalog. Matching "${WANT}":`);
for (const c of hits) console.log(`    ${c.id}  ${c.name}`);
if (!hits.length) {
    console.log("    none — here is every category so the right name can be picked:");
    for (const c of cats.sort((a, b) => a.name.localeCompare(b.name))) console.log(`      ${c.name}`);
    process.exit(0);
}

// ── EVERY ITEM IN THEM ───────────────────────────────────────────────────────────────────────────────────────
const ids = new Set(hits.map((c) => c.id));
const items = [];
cursor = undefined;
do {
    const r = await squareFetch(`/v2/catalog/list?types=ITEM${cursor ? `&cursor=${cursor}` : ""}`);
    for (const o of r?.objects || []) {
        const d = o.item_data || {};
        // An item's category lives in `categories[]` on newer objects and `category_id` on older ones.
        const cids = [...(d.categories || []).map((c) => c.id), d.category_id, d.reporting_category?.id].filter(Boolean);
        if (!cids.some((c) => ids.has(c))) continue;
        items.push({ id: o.id, name: d.name || "", variations: d.variations || [] });
    }
    cursor = r?.cursor;
} while (cursor);

// ── STOCK ────────────────────────────────────────────────────────────────────────────────────────────────────
const varIds = items.flatMap((i) => i.variations.map((v) => v.id));
const counts = new Map();
for (let i = 0; i < varIds.length; i += 100) {
    const r = await squareFetch(`/v2/inventory/counts/batch-retrieve`, {
        method: "POST",
        body: JSON.stringify({ catalog_object_ids: varIds.slice(i, i + 100) }),
    });
    for (const c of r?.counts || []) {
        if (c.state !== "IN_STOCK") continue;
        counts.set(c.catalog_object_id, (counts.get(c.catalog_object_id) || 0) + Number(c.quantity || 0));
    }
}

// ── WHAT THE BUYOUT SAYS ─────────────────────────────────────────────────────────────────────────────────────
const csv = readFileSync(new URL("../../andy-buyout.csv", import.meta.url), "utf8");
const paid = new Map();
for (const line of csv.split(/\r?\n/)) {
    const cells = line.match(/"([^"]*)"/g)?.map((c) => c.slice(1, -1));
    if (!cells || cells.length < 8 || cells[2] === "SKU" || !cells[2]) continue;
    const cost = Number(String(cells[7]).split("->")[0].trim());
    const qty = Number(cells[3]) || 0;
    if (!qty) continue;
    paid.set(cells[2], { group: cells[0], item: cells[1], qty, unitPrice: Number(cells[4]) || 0, buyCost: Number.isFinite(cost) ? cost : null });
}

console.log(`\n  ${items.length} items in the category, ${varIds.length} variations\n`);
console.log("  stock  sku                       price   our cost   in buyout?   name");
let noCost = 0;
let stockValue = 0;
for (const it of items.sort((a, b) => a.name.localeCompare(b.name))) {
    for (const v of it.variations) {
        const d = v.item_variation_data || {};
        const qty = counts.get(v.id) || 0;
        const price = (d.price_money?.amount || 0) / 100;
        const cost = d.item_variation_vendor_infos?.[0]?.item_variation_vendor_info_data?.price_money?.amount;
        const sku = d.sku || "";
        const b = paid.get(sku);
        if (cost == null) noCost += 1;
        stockValue += qty * price;
        const label = it.variations.length > 1 ? `${it.name} — ${d.name || ""}` : it.name;
        console.log(`  ${String(qty).padStart(5)}  ${sku.padEnd(24)} ${`$${price.toFixed(2)}`.padStart(8)} ${cost == null ? "     none" : `$${(cost / 100).toFixed(2)}`.padStart(9)}   ${b ? (b.buyCost != null ? `paid $${b.buyCost}` : "listed, no price").padEnd(12) : "NOT LISTED  "} ${label.slice(0, 44)}`);
    }
}
console.log(`\n  ${noCost} of ${varIds.length} variations carry no unit cost in Square`);
console.log(`  shelf value of what is on hand: $${stockValue.toFixed(2)}`);
const skus = new Set(items.flatMap((i) => i.variations.map((v) => v.item_variation_data?.sku).filter(Boolean)));
const missing = [...paid.keys()].filter((s) => !skus.has(s));
if (missing.length) console.log(`\n  in the buyout but NOT in this category: ${missing.join(", ")}`);
process.exit(0);
