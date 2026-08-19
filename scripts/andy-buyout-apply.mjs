// ── FINISH THE ANDY BUYOUT IN SQUARE ─────────────────────────────────────────────────────────────────────────
// Andy's Cards is a CONSIGNMENT category: what sits in it is his, and the payout report reads it to work out
// what he is owed. We bought his plush, squishies and squeeze toys outright, so those are ours now and must
// leave the category — and they need the cost we actually paid attached, or every one of them reports as pure
// profit for as long as it sits on the shelf.
//
// Three things, in this order:
//
//   1. CAPTURE, THEN DELETE. Seven lines have zero stock. Deleting a Square item takes its unit cost with it
//      for every past sale (Square soft-deletes, but the recovery is not guaranteed and any purge rewrites
//      history) — so anything carrying a cost is copied into wolfden_item_cost FIRST. Ours to keep, whatever
//      Square does with the catalog afterwards.
//   2. MOVE the bought lines from Andy's Cards into Plush.
//   3. COST them at what we paid: the shelf price times the buy rate off the buyout sheet — 75% on the NeeDoh
//      and squeeze lines, 50% on the three Squishmallows. Written through cost-sync's writeCostToSquare, which
//      echoes the whole variation back (an upsert REPLACES the object, so a partial write blanks the price and
//      SKU) and then READS IT BACK, because this account has spent months believing 200s that stored nothing.
//
// The two sealed Pokemon boxes stay exactly where they are. They are still his.
//
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/andy-buyout-apply.mjs [--apply]
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { squareFetch } from "../src/lib/consignment/square.js";
import { writeCostToSquare } from "../src/lib/cogs/cost-sync.js";
import { db } from "../src/lib/db.js";

const APPLY = process.argv.includes("--apply");
const FROM_CATEGORY = "Andy's Cards";
const TO_CATEGORY = "Plush";
// His, not ours. Never touched by this script.
const CONSIGNED = new Set(["P275277", "G782177"]);

const cats = [];
let cursor;
do {
    const r = await squareFetch(`/v2/catalog/list?types=CATEGORY${cursor ? `&cursor=${cursor}` : ""}`);
    for (const o of r?.objects || []) cats.push({ id: o.id, name: o.category_data?.name || "" });
    cursor = r?.cursor;
} while (cursor);
const from = cats.find((c) => c.name === FROM_CATEGORY);
const to = cats.find((c) => c.name === TO_CATEGORY);
if (!from || !to) throw new Error(`need both categories: ${FROM_CATEGORY} / ${TO_CATEGORY}`);

const items = [];
cursor = undefined;
do {
    const r = await squareFetch(`/v2/catalog/list?types=ITEM${cursor ? `&cursor=${cursor}` : ""}`);
    for (const o of r?.objects || []) {
        const d = o.item_data || {};
        const cids = [...(d.categories || []).map((c) => c.id), d.category_id, d.reporting_category?.id].filter(Boolean);
        if (cids.includes(from.id)) items.push(o);
    }
    cursor = r?.cursor;
} while (cursor);

// Stock, so "zero" is a fact rather than an assumption.
const varIds = items.flatMap((i) => (i.item_data.variations || []).map((v) => v.id));
const stock = new Map();
for (let i = 0; i < varIds.length; i += 100) {
    const r = await squareFetch(`/v2/inventory/counts/batch-retrieve`, {
        method: "POST", body: JSON.stringify({ catalog_object_ids: varIds.slice(i, i + 100) }),
    });
    for (const c of r?.counts || []) {
        if (c.state !== "IN_STOCK") continue;
        stock.set(c.catalog_object_id, (stock.get(c.catalog_object_id) || 0) + Number(c.quantity || 0));
    }
}

// The buy rate per SKU, straight off the sheet Andy was paid from.
const rates = new Map();
for (const line of readFileSync(new URL("../../andy-buyout.csv", import.meta.url), "utf8").split(/\r?\n/)) {
    const c = line.match(/"([^"]*)"/g)?.map((x) => x.slice(1, -1));
    if (!c || c.length < 8 || !c[2] || c[2] === "SKU") continue;
    const rate = Number(String(c[6]).replace("%", "")) / 100;
    if (rate > 0) rates.set(c[2], rate);
}

const move = [];
const remove = [];
for (const it of items) {
    for (const v of it.item_data.variations || []) {
        const d = v.item_variation_data || {};
        const sku = d.sku || "";
        const qty = stock.get(v.id) || 0;
        const price = (d.price_money?.amount || 0) / 100;
        const nativeCost = d.item_variation_vendor_infos?.[0]?.item_variation_vendor_info_data?.price_money?.amount ?? null;
        if (CONSIGNED.has(sku)) continue;
        if (qty <= 0) { remove.push({ item: it, v, sku, price, nativeCost, name: it.item_data.name }); continue; }
        const rate = rates.get(sku);
        move.push({ item: it, v, sku, qty, price, rate: rate ?? null, cents: rate ? Math.round(price * rate * 100) : null, name: it.item_data.name });
    }
}

const money = (c) => `$${(c / 100).toFixed(2)}`;
console.log(`\n  ${FROM_CATEGORY} → ${TO_CATEGORY}\n`);
console.log("  MOVE AND COST:");
let owed = 0;
for (const m of move.sort((a, b) => b.qty * (b.cents || 0) - a.qty * (a.cents || 0))) {
    owed += m.qty * (m.cents || 0);
    console.log(`    ${m.sku.padEnd(10)} ${String(m.qty).padStart(3)} @ $${m.price.toFixed(2)}  x${m.rate != null ? `${(m.rate * 100).toFixed(0)}%` : "  ?"} -> cost ${m.cents != null ? money(m.cents) : "UNKNOWN — skipped"}   ${m.name.slice(0, 40)}`);
}
console.log(`\n    ${move.length} lines, ${move.reduce((n, m) => n + m.qty, 0)} units, ${money(owed)} of cost basis`);
const noRate = move.filter((m) => m.cents == null);
if (noRate.length) console.log(`    ${noRate.length} have no buy rate on the sheet and will be MOVED BUT NOT COSTED: ${noRate.map((m) => m.sku).join(", ")}`);

console.log("\n  DELETE (zero stock):");
for (const r of remove) {
    console.log(`    ${r.sku.padEnd(10)} $${r.price.toFixed(2)}  ${r.nativeCost != null ? `cost ${money(r.nativeCost)} — captured first` : "no cost"}   ${r.name.slice(0, 42)}`);
}

if (!APPLY) { console.log("\n  dry run — pass --apply to write\n"); process.exit(0); }

// 1. Keep the cost of anything about to be deleted.
for (const r of remove) {
    if (r.nativeCost == null) continue;
    await db.query(
        `INSERT INTO wolfden_item_cost (variation_id, sku, item_name, unit_cost_cents, source, from_deleted)
         VALUES ($1,$2,$3,$4,'pre_delete_capture',TRUE)
         ON CONFLICT (variation_id) DO UPDATE SET unit_cost_cents = EXCLUDED.unit_cost_cents, updated_at = NOW()`,
        [r.v.id, r.sku, r.name, r.nativeCost],
    );
    console.log(`  kept ${r.sku} cost ${money(r.nativeCost)}`);
}
// 2. Delete them.
for (const r of remove) {
    await squareFetch(`/v2/catalog/object/${r.item.id}`, { method: "DELETE" });
    console.log(`  deleted ${r.sku}  ${r.name.slice(0, 40)}`);
}
// 3. Re-categorise. An upsert replaces the object, so the whole item_data is echoed back with only the
//    category swapped — dropping a field here would blank it.
for (const m of move) {
    const cur = (await squareFetch(`/v2/catalog/object/${m.item.id}`))?.object;
    if (!cur) { console.log(`  MISSING ${m.sku}`); continue; }
    // Already there — a second upsert of an unchanged object is not a no-op to Square, it is a 400.
    const already = (cur.item_data?.categories || []).some((c) => c.id === to.id);
    if (already) { console.log(`  ${m.sku} already in ${TO_CATEGORY}`); continue; }
    // MINIMAL OBJECT. Echoing the whole thing back sends read-only fields (updated_at, created_at,
    // is_deleted, is_archived, channels) and the nested variations with read-only fields of their own, and
    // Square answers "Invalid Object with Id". Only what an upsert is allowed to carry goes up — and
    // `category_id` is left alone entirely: it is the deprecated single-category field, these items do not
    // have it, and setting it alongside `categories` is what makes the object invalid.
    const d = { ...cur.item_data, categories: [{ id: to.id, ordinal: 0 }] };
    if (d.reporting_category) d.reporting_category = { id: to.id };
    // Variations MUST come along — an ITEM upsert without them is "must have at least one variation" — but
    // only the writable half of each: their own updated_at/created_at/is_deleted are read-only and echoing
    // them is what Square rejects.
    d.variations = (cur.item_data.variations || []).map((v) => ({
        type: "ITEM_VARIATION",
        id: v.id,
        version: v.version,
        item_variation_data: v.item_variation_data,
        ...(v.present_at_all_locations != null ? { present_at_all_locations: v.present_at_all_locations } : {}),
        ...(v.present_at_location_ids ? { present_at_location_ids: v.present_at_location_ids } : {}),
    }));
    const object = {
        type: "ITEM", id: cur.id, version: cur.version, item_data: d,
        ...(cur.present_at_all_locations != null ? { present_at_all_locations: cur.present_at_all_locations } : {}),
        ...(cur.present_at_location_ids ? { present_at_location_ids: cur.present_at_location_ids } : {}),
    };
    await squareFetch("/v2/catalog/object", {
        method: "POST",
        body: JSON.stringify({ // A FRESH KEY EVERY ATTEMPT. A stable key looks careful and is the opposite: Square replays the
        // FIRST body sent under it, so once a failed shape has been tried the retry is rejected as "can only
        // be retried with the same request data" — the key pins you to the broken version.
        idempotency_key: randomUUID(), object }),
    });
    console.log(`  moved ${m.sku} → ${TO_CATEGORY}`);
}
// 4. And the cost we paid.
for (const m of move) {
    if (m.cents == null) continue;
    try {
        const res = await writeCostToSquare(m.v.id, m.cents);
        console.log(`  cost ${m.sku} = ${money(m.cents)} ${res?.ok === false ? `FAILED: ${res.error}` : "ok"}`);
    } catch (e) {
        console.log(`  cost ${m.sku} FAILED: ${e.message}`);
    }
}
console.log("\n  done\n");
process.exit(0);
