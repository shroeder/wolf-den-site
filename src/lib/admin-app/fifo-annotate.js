import "server-only";

import { storedCosts } from "@/lib/cogs/fifo.js";
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
            pairs.push({ orderId: order.id, lineUid: li.uid });
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
