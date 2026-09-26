import "server-only";

import { storedCosts, costSales } from "@/lib/cogs/fifo.js";
import { createServerLogger } from "@/lib/server-logger";

const logger = createServerLogger({ source: "api", subsystem: "admin-app-fifo" });

// ── HAND THE REPORT THE REAL COST, NOT THE LAST PRICE ────────────────────────────────────────────────────────
// The phone works out COGS from ONE number per item — the `wolfden_unit_cost` custom attribute on the Square
// variation. That number is whatever restock was entered most recently, which is why eleven boxes bought at
// $120 and five at $115 all costed out at $115.
//
// FIFO cannot be expressed that way: the cost of a sale depends on how many of that item were sold BEFORE it,
// so it belongs on the SALE, not on the item. The reconciler has already worked each one out and written it
// down; this hangs it on the line item the app is about to read.
//
// ⚠️ ADDED, NEVER SUBSTITUTED. The existing fields are left exactly as they are, so an app that has not been
// updated yet behaves precisely as before and nothing regresses on a phone that skipped a release. The app
// prefers `wolfden_fifo_cost_money` when it is present and falls back to the catalog attribute when it is
// not — which is also what happens for any item with no purchase history recorded against it.
export async function annotateFifoCosts(responseBody) {
    let payload;
    try {
        payload = JSON.parse(responseBody);
    } catch { return responseBody; }
    const orders = payload?.orders;
    if (!Array.isArray(orders) || !orders.length) return responseBody;

    const pairs = [];
    for (const order of orders) {
        for (const li of order?.line_items || []) {
            if (!li?.catalog_object_id || !li?.uid) continue;
            pairs.push({
                orderId: order.id,
                lineUid: li.uid,
                variationId: String(li.catalog_object_id),
                // Square gives closed_at on a completed sale and created_at always. FIFO is an ORDERING, so
                // the sale needs the time it actually happened, not the time this report was asked for.
                soldAt: order.closed_at || order.created_at || null,
                units: Number(li.quantity) || 0,
            });
        }
    }
    if (!pairs.length) return responseBody;

    let costs;
    try {
        costs = await storedCosts(pairs);
    } catch (error) {
        logger.warn("admin_app.fifo.lookup_failed", { message: error?.message });
        return responseBody;
    }

    // ── ⚠️ COST WHAT THE RECONCILER HAS NOT REACHED YET, RATHER THAN FALLING BACK ────────────────────────────
    // This is the whole bug, and it looked exactly like FIFO being broken. The reconciler runs on a cron; the
    // Today screen reads LIVE orders. A sale made after the last run has no row in cogs_fifo_cost, so the app
    // fell through to `wolfden_unit_cost` — the catalog attribute, which is whatever restock was entered most
    // recently. On 2026-09-26 that showed the fifth 30th Celebration ETB sold costing $140 (the Sep 22
    // restock) when the four before it had correctly costed at $120 and eleven of the $120 batch were still
    // unspent. The stored rows were right the whole time; today's sale simply had none yet.
    //
    // Falling back is the correct behaviour for an item with NO purchase history — that is what the fallback
    // is for. It is the wrong behaviour for an item with a perfectly good history that a cron has not caught
    // up with, and the two were indistinguishable from here.
    //
    // ⚠️ AND IT IS THE SAME costSales() THE RECONCILER RUNS. Not a second implementation — a second one would
    // drift, and "what did this cost" is the last number in the business that should have two answers. It
    // writes its rows too, so a line is costed once and every later read is the stored one.
    //
    // Prior consumption is read from the stored table for sales STRICTLY OLDER than these, which is exactly
    // right here: the uncosted lines are the newest ones, so everything already written is the opening
    // position and the walk continues from it rather than restarting at the oldest batch.
    const missing = pairs.filter((p) => p.soldAt && p.units > 0 && !costs.has(`${p.orderId}|${p.lineUid}`));
    if (missing.length) {
        try {
            await costSales(missing);
            costs = await storedCosts(pairs);
            logger.info("admin_app.fifo.costed_on_read", { lines: missing.length });
        } catch (error) {
            // A failure here must never break the report — it lands the caller back on the old fallback,
            // which is where it already was.
            logger.warn("admin_app.fifo.on_read_failed", { lines: missing.length, message: error?.message });
        }
    }

    if (!costs.size) return responseBody;

    let tagged = 0;
    for (const order of orders) {
        for (const li of order?.line_items || []) {
            if (!li?.catalog_object_id || !li?.uid) continue;
            const hit = costs.get(`${order.id}|${li.uid}`);
            if (!hit) continue;
            li.wolfden_fifo_cost_money = { amount: Math.round(hit.costCents), currency: "USD" };
            // The batches it drew from, so a cost can be taken apart on screen rather than taken on trust.
            li.wolfden_fifo_batches = hit.batches;
            tagged += 1;
        }
    }

    if (!tagged) return responseBody;
    logger.info("admin_app.fifo.annotated", { lines: tagged });
    try { return JSON.stringify(payload); } catch { return responseBody; }
}
