// ── WHAT MOVED IN SQUARE TODAY ──────────────────────────────────────────────────────────────────────────────
// Luke: "I did just convert 3 30th etbs and 2 prismatic etbs to packs though."
//
// A conversion is TWO movements that must both land: the boxes come off the shelf and the packs go on. Only
// one of them is visible in a restock audit, so a conversion that decremented the boxes and never created
// the packs reads as a perfectly healthy restock with some stock sold. This prints every inventory movement
// Square recorded in a window, so both halves can be seen together.
//
//   node scripts/audit-inventory-changes.mjs [--hours 24]
//
// Reads production Square. Writes NOTHING.
import { readFileSync } from "node:fs";

const pick = (file, key) => {
    const line = readFileSync(file, "utf8").split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
    if (!line) throw new Error(`${key} not found in ${file}`);
    return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, "");
};
const ACCOUNTING = "C:/Users/Luke/Projects/accounting_app";
process.env.SQUARE_ACCESS_TOKEN = pick(`${ACCOUNTING}/local.properties`, "SQUARE_ACCESS_TOKEN");

const arg = (name, d) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const HOURS = Number(arg("hours", 24));

const SQUARE = "https://connect.squareup.com";
const headers = {
    Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
    "Content-Type": "application/json",
    "Square-Version": process.env.SQUARE_API_VERSION || "2024-10-17",
};

const since = new Date(Date.now() - HOURS * 3600000).toISOString();

// Every adjustment and physical count in the window.
const changes = [];
let cursor;
do {
    const res = await fetch(`${SQUARE}/v2/inventory/changes/batch-retrieve`, {
        method: "POST",
        headers,
        body: JSON.stringify({ updated_after: since, cursor, limit: 500 }),
    }).then((r) => r.json()).catch(() => ({}));
    for (const c of res.changes || []) changes.push(c);
    cursor = res.cursor;
} while (cursor);

// Name every variation that moved.
const ids = [...new Set(changes.map((c) => c.adjustment?.catalog_object_id || c.physical_count?.catalog_object_id).filter(Boolean))];
const names = new Map();
for (let i = 0; i < ids.length; i += 100) {
    const res = await fetch(`${SQUARE}/v2/catalog/batch-retrieve`, {
        method: "POST", headers,
        body: JSON.stringify({ object_ids: ids.slice(i, i + 100), include_related_objects: true, include_deleted_objects: true }),
    }).then((r) => r.json()).catch(() => ({}));
    const items = new Map();
    for (const o of res.related_objects || []) items.set(o.id, o);
    for (const o of res.objects || []) {
        const item = items.get(o.item_variation_data?.item_id);
        names.set(o.id, `${item?.item_data?.name || "?"}${o.item_variation_data?.name && o.item_variation_data.name !== "Regular" ? ` — ${o.item_variation_data.name}` : ""}`);
    }
}

// ⚠️ A SALE AND A CONVERSION BOTH DECREMENT. The difference is the REASON Square records, so group by it --
// without that, boxes taken off the shelf to be opened look exactly like boxes that were bought.
const rows = changes.map((c) => {
    const a = c.adjustment || c.physical_count;
    const id = a?.catalog_object_id;
    const qty = Number(a?.quantity || 0);
    const from = c.adjustment?.from_state || null;
    const to = c.adjustment?.to_state || (c.physical_count ? "PHYSICAL_COUNT" : null);
    return {
        at: a?.occurred_at || a?.created_at,
        name: names.get(id) || id || "?",
        qty, from, to,
        source: c.adjustment?.source?.name || c.physical_count?.source?.name || "",
    };
}).sort((x, y) => String(x.at).localeCompare(String(y.at)));

console.log();
console.log("=".repeat(104));
console.log(`  SQUARE INVENTORY MOVEMENTS — last ${HOURS}h (${rows.length} changes)`);
console.log("=".repeat(104));
console.log(`  ${"when".padEnd(20)} ${"qty".padStart(6)}  ${"from".padEnd(14)} ${"to".padEnd(16)} item`);
for (const r of rows) {
    const when = String(r.at || "").replace("T", " ").slice(0, 19);
    console.log(`  ${when.padEnd(20)} ${String(r.qty).padStart(6)}  ${String(r.from || "—").padEnd(14)} ${String(r.to || "—").padEnd(16)} ${r.name.slice(0, 44)}`);
}

// A net view: what is up and what is down over the window.
const net = new Map();
for (const r of rows) {
    const sign = r.to === "IN_STOCK" ? 1 : r.from === "IN_STOCK" ? -1 : 0;
    if (!sign) continue;
    net.set(r.name, (net.get(r.name) || 0) + sign * r.qty);
}
console.log();
console.log("-".repeat(104));
console.log("  NET MOVEMENT");
console.log("-".repeat(104));
for (const [name, n] of [...net].sort((a, b) => a[1] - b[1])) {
    if (!n) continue;
    console.log(`  ${(n > 0 ? "+" : "") + String(n).padStart(5)}   ${name.slice(0, 60)}`);
}
console.log();
