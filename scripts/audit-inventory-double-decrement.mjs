// ── DID SQUARE TAKE THE SAME UNIT OFF TWICE? ─────────────────────────────────────────────────────────────────
//
//   node scripts/audit-inventory-double-decrement.mjs [sinceISO]
//
// Read-only. Not a gate (see gates-dont-make-them) — a tool, and the one that proved the 2026-10-06
// regression.
//
// ⚠️ WHY A LEAK LIKE THIS HAS NO SYMPTOM. An online checkout used to charge a bare Square payment: Square
// had no order to attribute the sale to, so it never touched stock, and our own explicit decrement was the
// only one. On 2026-10-06 the checkout began building an ITEMISED Square order so online sales tax would be
// recorded as tax — and an itemised order decrements inventory by itself when its payment captures. From
// that day every online card order took TWO units out for every one sold.
//
// Nothing errored. The idempotency key on our call is scoped to our own request, so it cannot see a
// decrement Square made on its own behalf; nothing reached the repair queue; and the only visible effect was
// stock draining twice as fast as it sold. That reads as theft, or as a miscount, long before it reads as a
// bug — which is exactly why it has to be checkable from the outside.
//
// The test is simple and does not depend on any of our own bookkeeping: for every completed order Square
// knows about, line up its inventory adjustments. A sale should produce ONE IN_STOCK -> SOLD adjustment
// carrying that order's transaction_id. A second adjustment at the same second with NO transaction and a
// source of "Wolf Den App" is us having done it again.
import fs from "node:fs";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const TOKEN = props.match(/^SQUARE_ACCESS_TOKEN=["']?([^"'\r\n]+)/m)?.[1];
if (!TOKEN) throw new Error("No SQUARE_ACCESS_TOKEN in accounting_app/local.properties");

const SINCE = process.argv[2] || new Date(Date.now() - 30 * 86400_000).toISOString();
const UNTIL = new Date(Date.now() + 3600_000).toISOString();

const api = async (path, init = {}) => {
    const res = await fetch(`https://connect.squareup.com${path}`, {
        ...init,
        headers: {
            Authorization: `Bearer ${TOKEN}`,
            "Content-Type": "application/json",
            "Square-Version": "2025-01-23",
            ...(init.headers || {}),
        },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
        console.error(`  ! ${path} -> ${res.status} ${JSON.stringify(body).slice(0, 200)}`);
        return {};
    }
    return body;
};

const locations = (await api("/v2/locations")).locations || [];
const locationIds = locations.map((l) => l.id);
console.log(`locations: ${locations.map((l) => l.name).join(", ")}`);
console.log(`window: ${SINCE.slice(0, 16)} .. now\n`);

// ── Every completed order in the window ──────────────────────────────────────────────────────────────────
const orders = [];
let cursor = null;
do {
    const body = {
        location_ids: locationIds,
        limit: 500,
        query: {
            filter: {
                date_time_filter: { created_at: { start_at: SINCE, end_at: UNTIL } },
                state_filter: { states: ["COMPLETED"] },
            },
            sort: { sort_field: "CREATED_AT", sort_order: "ASC" },
        },
    };
    if (cursor) body.cursor = cursor;
    const page = await api("/v2/orders/search", { method: "POST", body: JSON.stringify(body) });
    orders.push(...(page.orders || []));
    cursor = page.cursor || null;
} while (cursor);

// ⚠️ closed_at, NOT created_at. An order is created when the cart is submitted and CLOSED when the payment
// captures, a second or two later, and the inventory adjustment lands at close. Matching on created_at
// reports zero doubles while the raw records plainly show them — the first run of this script did exactly
// that and the clean result was wrong. See checks-that-cannot-fail.
const sales = new Map(); // variation -> [{ second, qty, orderId, name, source }]
for (const order of orders) {
    const second = (order.closed_at || order.created_at || "").slice(0, 19);
    for (const line of order.line_items || []) {
        if (!line.catalog_object_id) continue;
        if (!sales.has(line.catalog_object_id)) sales.set(line.catalog_object_id, []);
        sales.get(line.catalog_object_id).push({
            second, qty: Number(line.quantity || 0), orderId: order.id,
            name: line.name, source: order.source?.name || "counter",
        });
    }
}
console.log(`${orders.length} completed orders, ${sales.size} distinct variations sold`);

// ── Their adjustments, batched ───────────────────────────────────────────────────────────────────────────
const variationIds = [...sales.keys()];
const doubles = [];
for (let i = 0; i < variationIds.length; i += 25) {
    const batch = variationIds.slice(i, i + 25);
    const byVariation = new Map();
    let c = null;
    do {
        const body = { catalog_object_ids: batch, location_ids: locationIds, types: ["ADJUSTMENT"], limit: 100, updated_after: SINCE };
        if (c) body.cursor = c;
        const page = await api("/v2/inventory/changes/batch-retrieve", { method: "POST", body: JSON.stringify(body) });
        for (const change of page.changes || []) {
            const adj = change.adjustment;
            if (!adj || adj.from_state !== "IN_STOCK" || adj.to_state !== "SOLD") continue;
            if (!byVariation.has(adj.catalog_object_id)) byVariation.set(adj.catalog_object_id, []);
            byVariation.get(adj.catalog_object_id).push(adj);
        }
        c = page.cursor || null;
    } while (c);

    for (const variationId of batch) {
        const adjustments = byVariation.get(variationId) || [];
        for (const sale of sales.get(variationId)) {
            const atSameSecond = adjustments.filter((a) => a.occurred_at.slice(0, 19) === sale.second);
            const squares = atSameSecond.filter((a) => a.transaction_id);
            const ours = atSameSecond.filter((a) => !a.transaction_id);
            if (squares.length && ours.length) {
                doubles.push({
                    variationId, name: sale.name, second: sale.second, orderId: sale.orderId,
                    source: sale.source, sold: sale.qty,
                    extra: ours.reduce((sum, a) => sum + Number(a.quantity || 0), 0),
                });
            }
        }
    }
}

doubles.sort((a, b) => (a.second < b.second ? -1 : 1));
console.log(`\n──── ORDERS WHERE THE SAME UNIT CAME OFF TWICE (${doubles.length}) ────`);
let lost = 0;
for (const d of doubles) {
    lost += d.extra;
    console.log(`  [${d.second.replace("T", " ")}] sold x${d.sold}, removed an EXTRA x${d.extra}  ${String(d.name || "").slice(0, 42).padEnd(42)}  ${d.source}`);
    console.log(`      order ${d.orderId}  variation ${d.variationId}`);
}

if (!doubles.length) {
    console.log("  none — every sale took exactly one unit off.\n");
} else {
    const byItem = new Map();
    for (const d of doubles) byItem.set(d.name, (byItem.get(d.name) || 0) + d.extra);
    console.log(`\n  ${lost} units of stock removed in Square that were never sold.`);
    console.log("\n  Square is UNDER-counting these by:");
    for (const [name, qty] of [...byItem.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`    ${String(qty).padStart(3)}  ${name}`);
    }
    console.log("\n  ⚠️ Correcting the counts moves real stock numbers, so it is deliberately NOT automatic.");
}
