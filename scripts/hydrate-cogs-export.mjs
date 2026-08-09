// HYDRATE UNIT COSTS FROM SQUARE'S "COST OF GOODS SOLD" CSV EXPORT.
//
// The last gap in the cost recovery. Square's COGS report prices items the public API cannot: it computes
// FIFO from RECEIVING cost, and no API surface exposes that (inventory changes carry total_price_money only
// on IN_STOCK->SOLD adjustments, where it is the sale price, not cost). So for the ~288 sold variations with
// no cost anywhere in the catalog, the Dashboard export is the only source that knows what we paid.
//
// Export from: Square Dashboard -> Reports -> Cost of Goods Sold -> the date range -> Export.
// Run:  node scripts/hydrate-cogs-export.mjs <file.csv> [--dry] [--overwrite]
//
// The CSV has no variation id, so rows are matched to Square variations by SKU, then GTIN, then exact
// name+variation name. Ambiguous keys (the same SKU on two variations) are REFUSED rather than guessed —
// a wrong cost is worse than a missing one, because a missing one is visible.
//
// PRECEDENCE, which is not simply "fill the gaps":
//   square_attr / manual  — what WE recorded paying. Kept; the export never overwrites these.
//   square_vendor / square_native — a vendor LIST price or a figure typed into the Dashboard. Neither is
//       necessarily what we paid on any given receipt, and Square's FIFO average IS. Measured across the 82
//       overlapping items: 55 agreed within 2c and 27 did not, and the disagreements were almost all
//       square_vendor rows off by real money (a Chaos Rising box carrying $250 against an actual $170). So
//       the export WINS over these two.
//   (nothing) — filled.
// --overwrite forces the export over everything, square_attr included.
import fs from "node:fs";
import { neon } from "@neondatabase/serverless";

const FILE = process.argv[2];
if (!FILE || !fs.existsSync(FILE)) throw new Error("usage: node scripts/hydrate-cogs-export.mjs <file.csv> [--dry] [--overwrite]");
const DRY = process.argv.includes("--dry");
const OVERWRITE = process.argv.includes("--overwrite");

const TOKEN = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8").match(/SQUARE_ACCESS_TOKEN=(.+)/)?.[1]?.trim();
const DB = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/.env", "utf8").match(/DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/)?.[1];
if (!TOKEN || !DB) throw new Error("missing SQUARE_ACCESS_TOKEN or DATABASE_URL");
const sql = neon(DB);
const BASE = "https://connect.squareup.com";
const H = { "Square-Version": "2025-01-23", Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };

// ── CSV ──────────────────────────────────────────────────────────────────────────────────────────────────────
// Square quotes any field containing a comma, and item names are full of them.
function parseCsv(text) {
    const rows = [];
    let row = [], field = "", quoted = false;
    for (let i = 0; i < text.length; i += 1) {
        const c = text[i];
        if (quoted) {
            if (c === '"') { if (text[i + 1] === '"') { field += '"'; i += 1; } else quoted = false; }
            else field += c;
        } else if (c === '"') quoted = true;
        else if (c === ",") { row.push(field); field = ""; }
        else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
        else if (c !== "\r") field += c;
    }
    if (field || row.length) { row.push(field); rows.push(row); }
    return rows;
}
const money = (s) => {
    const t = String(s || "").replace(/[$,\s]/g, "");
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? Math.round(n * 100) : null;
};
const norm = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");

const raw = fs.readFileSync(FILE, "utf8").replace(/^\uFEFF/, "");
const table = parseCsv(raw).filter((r) => r.length > 3);
const header = table[0].map((h) => norm(h));
const col = (name) => header.indexOf(norm(name));
const C = { name: col("Item Name"), vname: col("Item Variation Name"), gtin: col("GTIN"), sku: col("SKU"), qty: col("Qty Sold"), avg: col("Average Cost"), cogs: col("Cost of Goods Sold") };
if (C.avg < 0) throw new Error(`no "Average Cost" column; header was: ${header.join(" | ")}`);

const csvRows = table.slice(1).map((r) => ({
    name: r[C.name], vname: r[C.vname], gtin: (r[C.gtin] || "").replace(/\s/g, ""), sku: (r[C.sku] || "").trim(),
    qty: Number(r[C.qty]) || 0, avgCents: money(r[C.avg]), cogsCents: money(r[C.cogs]),
})).filter((r) => r.name);
const priced = csvRows.filter((r) => r.avgCents > 0);
console.log(`CSV: ${csvRows.length} rows, ${priced.length} with an Average Cost`);

// ── Square variations we have SOLD, deleted included (that is the whole point). ──────────────────────────────
const locs = (await (await fetch(`${BASE}/v2/locations`, { headers: H })).json()).locations || [];
const LOC = locs.map((l) => l.id);
const soldIds = new Set();
let cursor;
do {
    const r = await fetch(`${BASE}/v2/orders/search`, { method: "POST", headers: H, body: JSON.stringify({
        location_ids: LOC, limit: 500, cursor,
        query: { filter: { state_filter: { states: ["COMPLETED"] }, date_time_filter: { closed_at: { start_at: "2026-01-01T06:00:00Z", end_at: new Date().toISOString() } } }, sort: { sort_field: "CLOSED_AT", sort_order: "DESC" } } }) });
    const j = await r.json();
    if (!r.ok) throw new Error(`orders ${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
    for (const o of j.orders || []) for (const li of o.line_items || []) if (li.catalog_object_id) soldIds.add(li.catalog_object_id);
    cursor = j.cursor;
} while (cursor);

const ids = [...soldIds];
const objects = [];
const related = [];
for (let i = 0; i < ids.length; i += 200) {
    const r = await fetch(`${BASE}/v2/catalog/batch-retrieve`, { method: "POST", headers: H,
        body: JSON.stringify({ object_ids: ids.slice(i, i + 200), include_deleted_objects: true, include_related_objects: true }) });
    const j = await r.json();
    objects.push(...(j.objects || []));
    related.push(...(j.related_objects || []));
}
const itemName = new Map(related.filter((o) => o.type === "ITEM").map((o) => [o.id, o.item_data?.name || ""]));
const variations = objects.filter((o) => o.type === "ITEM_VARIATION");
console.log(`Square: ${variations.length} sold variations (deleted included)`);

// ── Index by SKU / GTIN / name. A key claimed by two different variations is dropped, not guessed. ───────────
function index(keyFn) {
    const m = new Map(), dupe = new Set();
    for (const v of variations) {
        const k = keyFn(v);
        if (!k) continue;
        if (m.has(k) && m.get(k) !== v.id) dupe.add(k);
        m.set(k, v.id);
    }
    for (const k of dupe) m.delete(k);
    return { m, dropped: dupe.size };
}
const bySku = index((v) => (v.item_variation_data?.sku || "").trim().toLowerCase() || null);
const byGtin = index((v) => (v.item_variation_data?.upc || "").replace(/\s/g, "") || null);
const byName = index((v) => {
    const item = itemName.get(v.item_variation_data?.item_id) || "";
    const vn = v.item_variation_data?.name || "";
    return item ? `${norm(item)}||${norm(vn)}` : null;
});
console.log(`  index: sku ${bySku.m.size} (dropped ${bySku.dropped} ambiguous) · gtin ${byGtin.m.size} (${byGtin.dropped}) · name ${byName.m.size} (${byName.dropped})`);

const existing = new Map((await sql`SELECT variation_id, source FROM wolfden_item_cost`).map((r) => [r.variation_id, r.source]));

let matched = 0, viaSku = 0, viaGtin = 0, viaName = 0, unmatched = 0, skipped = 0, upgraded = 0;
const writes = [];
for (const r of priced) {
    let id = null;
    if (r.sku && bySku.m.has(r.sku.toLowerCase())) { id = bySku.m.get(r.sku.toLowerCase()); viaSku += 1; }
    else if (r.gtin && byGtin.m.has(r.gtin)) { id = byGtin.m.get(r.gtin); viaGtin += 1; }
    else if (byName.m.has(`${norm(r.name)}||${norm(r.vname)}`)) { id = byName.m.get(`${norm(r.name)}||${norm(r.vname)}`); viaName += 1; }
    if (!id) { unmatched += 1; continue; }
    matched += 1;
    const had = existing.get(id);
    // Our own recorded purchase cost is never replaced by the export; a vendor/dashboard figure is.
    const keep = had === "square_attr" || had === "manual" || had === "cogs_export";
    if (had && keep && !OVERWRITE) { skipped += 1; continue; }
    if (had) upgraded += 1;
    writes.push({ id, cents: r.avgCents, name: r.name, sku: r.sku || null });
}
console.log(`\nmatched ${matched}/${priced.length}  (sku ${viaSku} · gtin ${viaGtin} · name ${viaName})   unmatched ${unmatched}`);
console.log(`kept our own recorded cost: ${skipped}${OVERWRITE ? " (--overwrite: replacing)" : ""}`);
console.log(`upgraded from a vendor/dashboard figure to Square's actual: ${upgraded}`);
console.log(`NEW costs to write: ${writes.length}`);
if (writes.length) {
    console.log("samples:");
    writes.slice(0, 8).forEach((w) => console.log(`  ${String(w.name).slice(0, 46).padEnd(46)} $${(w.cents / 100).toFixed(2)}`));
}
if (DRY) { console.log("\n--dry: nothing written"); process.exit(0); }

for (const w of writes) {
    await sql`
        INSERT INTO wolfden_item_cost (variation_id, unit_cost_cents, source, item_name, sku)
        VALUES (${w.id}, ${w.cents}, 'cogs_export', ${w.name}, ${w.sku})
        ON CONFLICT (variation_id) DO UPDATE
           SET unit_cost_cents = EXCLUDED.unit_cost_cents, source = 'cogs_export',
               item_name = COALESCE(EXCLUDED.item_name, wolfden_item_cost.item_name),
               sku = COALESCE(EXCLUDED.sku, wolfden_item_cost.sku), updated_at = NOW()`;
}
const [tot] = await sql`SELECT COUNT(*) n FROM wolfden_item_cost`;
console.log(`\nwrote ${writes.length}; table now holds ${tot.n} costs`);
