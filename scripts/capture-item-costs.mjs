// CAPTURE UNIT COSTS OUT OF SQUARE AND INTO OUR OWN TABLE.
//
// Square is currently the only place a unit cost lives (the `wolfden_unit_cost` custom attribute on the
// catalog variation), and the ledger reads it LIVE at report time. When the intake flow switched from
// archiving sold-out items to DELETING them, every historical sale of a deleted item started reporting $0.00
// cost and 100% profit — May, June and July all rewrote themselves.
//
// Square SOFT-deletes, so `include_deleted_objects: true` still returns those variations with the attribute
// intact. That is a reprieve, not a fix: it is not guaranteed forever, and any future edit or purge rewrites
// history again. This copies every cost it can still see into wolfden_item_cost, once, so history stops
// depending on the catalog.
//
// Run:  node scripts/capture-item-costs.mjs [--from 2026-01-01] [--dry]
//
// Idempotent. Re-running refreshes costs and picks up anything sold since. A row already sourced from a
// COGS-export hydration is NOT overwritten by a weaker catalog guess — see the ON CONFLICT below.
import fs from "node:fs";
import { neon } from "@neondatabase/serverless";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const TOKEN = props.match(/SQUARE_ACCESS_TOKEN=(.+)/)?.[1]?.trim();
if (!TOKEN) throw new Error("no SQUARE_ACCESS_TOKEN in accounting_app/local.properties");
const DB = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/.env", "utf8").match(/DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/)?.[1];
if (!DB) throw new Error("no DATABASE_URL in accounting_app/.env");

const sql = neon(DB);
const BASE = "https://connect.squareup.com";
const H = { "Square-Version": "2025-01-23", Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const DRY = process.argv.includes("--dry");
const FROM = `${arg("--from", "2026-01-01")}T05:00:00Z`;   // America/Chicago midnight

const locs = (await (await fetch(`${BASE}/v2/locations`, { headers: H })).json()).locations || [];
const LOC = locs.map((l) => l.id);

// ── Every variation we have actually SOLD. Cost only matters for things that hit a report. ──────────────────
const sold = new Map();
let cursor;
let orders = 0;
do {
    const r = await fetch(`${BASE}/v2/orders/search`, {
        method: "POST", headers: H,
        body: JSON.stringify({
            location_ids: LOC, limit: 500, cursor,
            query: {
                filter: { state_filter: { states: ["COMPLETED"] }, date_time_filter: { closed_at: { start_at: FROM, end_at: new Date().toISOString() } } },
                sort: { sort_field: "CLOSED_AT", sort_order: "DESC" },
            },
        }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(`orders ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
    for (const o of j.orders || []) {
        orders += 1;
        for (const li of o.line_items || []) {
            if (li.catalog_object_id && !sold.has(li.catalog_object_id)) sold.set(li.catalog_object_id, li.name || null);
        }
    }
    cursor = j.cursor;
} while (cursor);
console.log(`${orders} orders since ${FROM.slice(0, 10)} → ${sold.size} distinct variations sold`);

// ── What Square still knows about each of them, DELETED INCLUDED. ────────────────────────────────────────────
const ids = [...sold.keys()];
const fetchObjects = async (list, includeDeleted) => {
    const out = [];
    for (let i = 0; i < list.length; i += 200) {
        const r = await fetch(`${BASE}/v2/catalog/batch-retrieve`, {
            method: "POST", headers: H,
            body: JSON.stringify({ object_ids: list.slice(i, i + 200), include_deleted_objects: includeDeleted }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(`catalog ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
        out.push(...(j.objects || []));
    }
    return out;
};
const liveIds = new Set((await fetchObjects(ids, false)).map((o) => o.id));
const objects = await fetchObjects(ids, true);
console.log(`catalog: ${objects.length} found · ${liveIds.size} still live · ${objects.length - liveIds.size} deleted-but-recoverable`);

// Same precedence the ledger uses: our own recorded purchase cost first, then Square's vendor cost, then
// whatever was typed into the Dashboard. A price is NOT a cost and is never used as one.
function costOf(obj) {
    const v = obj.item_variation_data || {};
    const attr = Object.entries(obj.custom_attribute_values || {}).find(([k]) => k.includes("unit_cost"))?.[1];
    const attrCents = attr?.number_value != null ? Math.round(Number(attr.number_value) * 100) : null;
    if (attrCents > 0) return { cents: attrCents, source: "square_attr" };
    const vendor = v.item_variation_vendor_infos?.[0]?.item_variation_vendor_info_data?.price_money?.amount;
    if (vendor > 0) return { cents: vendor, source: "square_vendor" };
    const native = v.default_unit_cost?.amount || v.cost_money?.amount || v.cost_price_money?.amount;
    if (native > 0) return { cents: native, source: "square_native" };
    return null;
}

const rows = [];
let noCost = 0;
for (const o of objects) {
    if (o.type !== "ITEM_VARIATION") continue;
    const c = costOf(o);
    if (!c) { noCost += 1; continue; }
    rows.push({
        id: o.id, cents: c.cents, source: c.source,
        name: o.item_variation_data?.name ? `${sold.get(o.id) || ""}`.trim() || o.item_variation_data.name : sold.get(o.id),
        sku: o.item_variation_data?.sku || null,
        deleted: !liveIds.has(o.id),
    });
}
console.log(`\ncosted: ${rows.length}   ·   no cost anywhere in Square: ${noCost}`);
console.log(`  of the costed, ${rows.filter((r) => r.deleted).length} exist ONLY as deleted objects — this table becomes their only copy`);
const byS = rows.reduce((m, r) => ({ ...m, [r.source]: (m[r.source] || 0) + 1 }), {});
console.log(`  by source: ${Object.entries(byS).map(([k, n]) => `${k}=${n}`).join(" ")}`);

if (DRY) { console.log("\n--dry: nothing written"); process.exit(0); }

// ON CONFLICT: refresh the cost, but never let a catalog reading overwrite a `cogs_export` or `manual` row —
// those were hydrated from a better source precisely because the catalog had nothing to say.
let written = 0;
for (const r of rows) {
    await sql`
        INSERT INTO wolfden_item_cost (variation_id, unit_cost_cents, source, item_name, sku, from_deleted)
        VALUES (${r.id}, ${r.cents}, ${r.source}, ${r.name}, ${r.sku}, ${r.deleted})
        ON CONFLICT (variation_id) DO UPDATE
           SET unit_cost_cents = EXCLUDED.unit_cost_cents,
               source          = EXCLUDED.source,
               item_name       = COALESCE(EXCLUDED.item_name, wolfden_item_cost.item_name),
               sku             = COALESCE(EXCLUDED.sku, wolfden_item_cost.sku),
               from_deleted    = EXCLUDED.from_deleted,
               updated_at      = NOW()
         WHERE wolfden_item_cost.source NOT IN ('cogs_export', 'manual')`;
    written += 1;
}
console.log(`\nwrote ${written} rows to wolfden_item_cost`);
const [tot] = await sql`SELECT COUNT(*) n, SUM(unit_cost_cents) c FROM wolfden_item_cost`;
console.log(`table now holds ${tot.n} costs`);
