// ── DELETE EVERY ARCHIVED ITEM IN THE SQUARE CATALOG ─────────────────────────────────────────────────────────
// Archiving hides an item from the register but leaves it in the catalog forever, so the catalog fills with
// dead rows that still turn up in searches, exports and duplicate hunts. This removes them for good.
//
// What it does NOT touch: anything not archived, and any historical ORDER. Square keeps completed orders and
// their line items independently of the catalog, so deleting a catalog object does not rewrite past sales or
// the numbers on a sales-tax return.
//
// Dry by default — it prints exactly what it would delete and stops. Pass --apply to write.
//
//   node scripts/square-purge-archived.mjs             (dry run)
//   node scripts/square-purge-archived.mjs --apply
import fs from "node:fs";

const APPLY = process.argv.includes("--apply");
const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const TOKEN = process.env.SQUARE_ACCESS_TOKEN || props.match(/^SQUARE_ACCESS_TOKEN\s*=\s*(.+)$/m)?.[1]?.trim();
if (!TOKEN) throw new Error("no SQUARE_ACCESS_TOKEN");
const H = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", "Square-Version": "2025-01-23" };

const api = async (path, body, method) => {
    const r = await fetch(`https://connect.squareup.com/v2${path}`, {
        method: method || (body ? "POST" : "GET"), headers: H, body: body ? JSON.stringify(body) : undefined,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Square ${r.status} ${path}: ${JSON.stringify(j).slice(0, 400)}`);
    return j;
};

// Every ITEM in the catalog, including the archived ones (they are only returned when asked for).
const items = [];
let cursor;
do {
    const j = await api("/catalog/search", {
        object_types: ["ITEM"], include_deleted_objects: false, include_related_objects: false,
        cursor, limit: 200,
    });
    items.push(...(j.objects || []));
    cursor = j.cursor;
} while (cursor);

// Square marks an archived item with is_archived on the item data.
const archived = items.filter((o) => o.item_data?.is_archived === true);
console.log(`Catalog items: ${items.length}`);
console.log(`ARCHIVED: ${archived.length}\n`);
for (const a of archived) {
    const vs = (a.item_data?.variations || []).length;
    console.log(`   • ${a.item_data?.name || "(unnamed)"}  id=${a.id}  variations=${vs}  updated=${String(a.updated_at).slice(0, 10)}`);
}

if (!archived.length) { console.log("\nNothing archived — nothing to do."); process.exit(0); }

// SAFETY: an archived item that still shows stock on hand is a different thing from a dead row — deleting it
// takes that stock out of inventory valuation. Report those before anything is removed.
const varIds = archived.flatMap((a) => (a.item_data?.variations || []).map((v) => v.id));
const withStock = [];
for (let i = 0; i < varIds.length; i += 400) {
    const counts = await api("/inventory/counts/batch-retrieve", { catalog_object_ids: varIds.slice(i, i + 400) });
    for (const c of counts.counts || []) {
        const qty = Number(c.quantity) || 0;
        if (c.state === "IN_STOCK" && qty > 0) withStock.push({ id: c.catalog_object_id, qty });
    }
}
if (withStock.length) {
    const byId = new Map();
    for (const a of archived) for (const v of a.item_data?.variations || []) byId.set(v.id, a.item_data?.name);
    const units = withStock.reduce((n, w) => n + w.qty, 0);
    console.log(`\n!!  ${withStock.length} archived variation(s) still show stock on hand (${units} unit(s)):`);
    for (const w of withStock.slice(0, 20)) console.log(`     ${w.qty} x ${byId.get(w.id) || w.id}`);
    if (withStock.length > 20) console.log(`     ...and ${withStock.length - 20} more`);
} else {
    console.log("\nOK — no archived item is holding stock, so nothing leaves inventory valuation.");
}

if (!APPLY) { console.log(`\nDRY RUN — re-run with --apply to delete these ${archived.length} item(s).`); process.exit(0); }

// Batch-delete. Square takes up to 200 ids per call and removes each item's variations with it.
let deleted = 0;
for (let i = 0; i < archived.length; i += 100) {
    const ids = archived.slice(i, i + 100).map((a) => a.id);
    const res = await api("/catalog/batch-delete", { object_ids: ids });
    deleted += (res.deleted_object_ids || []).length;
    console.log(`   deleted ${(res.deleted_object_ids || []).length} object(s) in this batch`);
}
console.log(`\nDone — ${deleted} catalog object(s) deleted (items plus their variations).`);
