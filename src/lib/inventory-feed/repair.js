import "server-only";

import { db } from "@/lib/db";

// Durable inventory-repair queue. Instead of swallowing a failed Square decrement to a log line, every
// leak point records it here so nothing is lost and the Remediations tab can review + retry it.

// Record a failed/needed inventory adjustment. Idempotent per (source, reference, variation_id) — a retry
// of the same failing operation refreshes the row rather than piling up duplicates.
export async function recordInventoryRepair({ variationId, itemName = null, fromState = "IN_STOCK", toState = "SOLD", quantity = 1, source, reference = null, error = null }) {
    if (!source) return;
    await db
        .query(
            `INSERT INTO inventory_repair (variation_id, item_name, from_state, to_state, quantity, source, reference, error)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (source, reference, variation_id)
             DO UPDATE SET quantity = EXCLUDED.quantity, error = EXCLUDED.error, item_name = COALESCE(EXCLUDED.item_name, inventory_repair.item_name),
                           status = 'open', resolved_at = NULL, updated_at = NOW()`,
            [variationId || null, itemName, fromState, toState, Math.max(1, Math.floor(Number(quantity) || 1)), source, reference, error ? String(error).slice(0, 500) : null]
        )
        .catch(() => {});
}

// Open (unresolved) repairs for the Remediations tab.
export async function listOpenRepairs(limit = 200) {
    return db
        .query(
            `SELECT id, variation_id, item_name, from_state, to_state, quantity, source, reference, error, created_at
               FROM inventory_repair WHERE status = 'open' ORDER BY created_at DESC LIMIT $1`,
            [Math.max(1, Math.min(1000, Math.floor(Number(limit) || 200)))]
        )
        .catch(() => []);
}

// Stamp that an online order's inventory decrement landed (so the webhook/retry won't run it again).
export async function markOrderInventoryAdjusted(orderId) {
    await db.query(`UPDATE shop_orders SET inventory_adjusted_at = NOW() WHERE id = $1 AND inventory_adjusted_at IS NULL`, [orderId]).catch(() => {});
}

export async function markRepairResolved(id, status = "resolved") {
    await db.query(`UPDATE inventory_repair SET status = $2, resolved_at = NOW(), updated_at = NOW() WHERE id = $1`, [id, status === "dismissed" ? "dismissed" : "resolved"]).catch(() => {});
}
