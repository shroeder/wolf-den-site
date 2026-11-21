import "server-only";

import { db } from "@/lib/db";
import { createServerLogger } from "@/lib/server-logger";

const logger = createServerLogger({ source: "api", subsystem: "sale-remap" });

// ── A LINE RUNG ON THE WRONG ITEM, POINTED AT THE RIGHT ONE ──────────────────────────────────────────────────
// A completed Square order cannot be edited, so `sale_line_remap` (migration 517) records which variation a
// line SHOULD have been, and this swaps it in on the way past. It runs BEFORE annotateFifoCosts everywhere,
// so the FIFO cost, the category and the name on every screen all follow the corrected item.
//
// ⚠️ ONE FUNCTION, THREE CALLERS: the admin proxy (the phone), reports v2, and the FIFO reconciler. If one of
//    them skipped it the phone and the books would disagree about the same sale.
//
// ⚠️ THE ORIGINAL IS KEPT on `wolfden_remapped_from`, so the line can be traced back to what Square says.

/** Rewrites matching lines in place. Returns how many it changed. Never throws. */
export async function remapOrders(orders) {
    if (!Array.isArray(orders) || !orders.length) return 0;
    const ids = [...new Set(orders.map((o) => o?.id).filter(Boolean))];
    if (!ids.length) return 0;
    let rows;
    try {
        rows = await db.query(
            `SELECT order_id, line_uid, variation_id, item_name FROM sale_line_remap WHERE order_id = ANY($1)`,
            [ids],
        );
    } catch (error) {
        logger.warn("sale_remap.lookup_failed", { message: error?.message });
        return 0;
    }
    if (!rows?.length) return 0;
    const byKey = new Map(rows.map((r) => [`${r.order_id}|${r.line_uid}`, r]));
    let changed = 0;
    for (const order of orders) {
        for (const li of order?.line_items || []) {
            const hit = li?.uid && byKey.get(`${order.id}|${li.uid}`);
            if (!hit) continue;
            li.wolfden_remapped_from = { catalog_object_id: li.catalog_object_id || null, name: li.name || null };
            li.catalog_object_id = hit.variation_id;
            li.name = hit.item_name;
            li.variation_name = "Regular";
            changed += 1;
        }
    }
    return changed;
}

/** The same, for a raw Square response body (string in, string out). */
export async function remapSaleLines(responseBody) {
    let payload;
    try { payload = JSON.parse(responseBody); } catch { return responseBody; }
    const changed = await remapOrders(payload?.orders);
    if (!changed) return responseBody;
    try { return JSON.stringify(payload); } catch { return responseBody; }
}
