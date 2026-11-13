import "server-only";

import { db } from "@/lib/db";
import { createServerLogger } from "@/lib/server-logger";

const logger = createServerLogger({ source: "job", subsystem: "outreach-sync" });

const SQUARE_BASE = "https://connect.squareup.com";
const squareHeaders = () => ({
    Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
    "Content-Type": "application/json",
    "Square-Version": "2025-01-23",
});

// ── PULLING THE BASKET BACK OUT OF SQUARE ────────────────────────────────────────────────────────────────────
// A member's purchase reaches this database as a `purchase_spend` XP event whose meta carries `orderId`, which
// the QR handshake at the counter stamped on. That id is the only thread between a person and a basket:
// measured 2026-11-13, exactly 5 of 1,646 Square orders carry a `customer_id`, so the obvious join — order to
// customer to member — does not exist and never did. The handshake is the attribution.
//
// ⚠️ SO THE COHORT IS BOUNDED BY WHO SCANS, not by who shops. 123 members have an attributable purchase out of
// far more people who have bought something. That is a real limit on this feature and it is not a bug to fix
// here: an unattributed sale has no person attached to it anywhere in the system.

/** Orders already cached, so a resync only pays for what is new. */
async function knownOrderIds() {
    const rows = await db.query(`SELECT DISTINCT order_id FROM mkt_purchase_line`).catch(() => []);
    return new Set(rows.map((r) => r.order_id));
}

async function batchRetrieve(orderIds) {
    const out = [];
    for (let i = 0; i < orderIds.length; i += 100) {
        const r = await fetch(`${SQUARE_BASE}/v2/orders/batch-retrieve`, {
            method: "POST",
            headers: squareHeaders(),
            body: JSON.stringify({ location_ids: [process.env.SQUARE_LOCATION_ID], order_ids: orderIds.slice(i, i + 100) }),
        });
        const j = await r.json().catch(() => ({}));
        if (j?.errors) { logger.warn("batch-retrieve failed", { errors: j.errors }); continue; }
        out.push(...(j.orders || []));
    }
    return out;
}

// ── CATEGORY ─────────────────────────────────────────────────────────────────────────────────────────────────
// `inventory_feed` already carries a category per variation and covers 647 of the 740 variations members have
// bought. The other 93 are things that sold out and left the feed, so they are looked up at Square once and
// then live in the cached row for ever — a sold-out item's category never changes again.
//
// ⚠️ reporting_category IS THE ONLY CATEGORY THAT REACHES A SALE. `category_id` on a catalog item stores
// nothing that comes back on a line item. [[square-reporting-category-is-the-only-one]]
async function categoriesFor(variationIds) {
    const map = new Map();
    if (!variationIds.length) return map;
    const rows = await db.query(
        `SELECT variation_id, category_names FROM inventory_feed WHERE variation_id = ANY($1)`,
        [variationIds]
    ).catch(() => []);
    for (const r of rows) if (r.category_names) map.set(r.variation_id, r.category_names);

    const missing = variationIds.filter((v) => !map.has(v));
    for (let i = 0; i < missing.length; i += 100) {
        const r = await fetch(`${SQUARE_BASE}/v2/catalog/batch-retrieve`, {
            method: "POST",
            headers: squareHeaders(),
            body: JSON.stringify({ object_ids: missing.slice(i, i + 100), include_related_objects: true }),
        });
        const j = await r.json().catch(() => ({}));
        const related = new Map((j?.related_objects || []).map((o) => [o.id, o]));
        for (const o of j?.objects || []) {
            const parent = related.get(o?.item_variation_data?.item_id);
            const catId = parent?.item_data?.reporting_category?.id;
            const cat = catId ? related.get(catId)?.category_data?.name : null;
            if (cat) map.set(o.id, cat);
        }
    }
    return map;
}

/**
 * Cache the line items of every attributable purchase that is not cached yet.
 *
 * Returns `{ orders, lines }` — how many it actually pulled, which is zero on a quiet day.
 */
export async function syncPurchaseLines({ force = false } = {}) {
    const events = await db.query(
        `SELECT buyer_id, meta->>'orderId' AS oid, created_at
           FROM mkt_xp_event
          WHERE action = 'purchase_spend' AND meta->>'orderId' LIKE 'sq:%'`
    ).catch(() => []);
    if (!events.length) return { orders: 0, lines: 0 };

    const known = force ? new Set() : await knownOrderIds();
    const byOrder = new Map();
    for (const e of events) {
        const id = String(e.oid).slice(3);
        if (!id || known.has(id)) continue;
        byOrder.set(id, { buyerId: e.buyer_id, at: e.created_at });
    }
    if (!byOrder.size) return { orders: 0, lines: 0 };

    const orders = await batchRetrieve([...byOrder.keys()]);
    const variationIds = [...new Set(orders.flatMap((o) => (o.line_items || []).map((l) => l.catalog_object_id)).filter(Boolean))];
    const cats = await categoriesFor(variationIds);

    let lines = 0;
    for (const o of orders) {
        const meta = byOrder.get(o.id);
        if (!meta) continue;
        // Delete-then-insert rather than upsert: one order can carry the same variation on two lines (two
        // copies of a single in different conditions), so there is no natural key to conflict on.
        await db.query(`DELETE FROM mkt_purchase_line WHERE order_id = $1`, [o.id]).catch(() => {});
        for (const l of o.line_items || []) {
            if (!l.catalog_object_id) continue;   // CUSTOM_AMOUNT lumps say nothing about taste
            await db.query(
                `INSERT INTO mkt_purchase_line (buyer_id, order_id, variation_id, name, category, amount_cents, quantity, bought_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [meta.buyerId, o.id, l.catalog_object_id, l.name || null,
                 cats.get(l.catalog_object_id) || null,
                 Math.round(Number(l.total_money?.amount) || 0), Number(l.quantity) || 1,
                 o.closed_at || o.created_at || meta.at]
            ).catch(() => {});
            lines += 1;
        }
    }
    logger.info("purchase lines synced", { orders: orders.length, lines });
    return { orders: orders.length, lines };
}
