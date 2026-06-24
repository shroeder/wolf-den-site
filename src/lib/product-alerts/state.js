import "server-only";

import { db } from "@/lib/db";

// Square event types that mean shop inventory may have changed (new intake or restock). The
// webhook flags these so the product-alerts cron runs a prompt scan instead of waiting for its
// next scheduled tick.
export const INVENTORY_EVENT_TYPES = new Set(["inventory.count.updated", "catalog.version.updated"]);

/**
 * Mark the product-alert state dirty so the next cron tick performs a scan. Sets dirty_since only
 * on the leading edge of a burst, so it reflects when the change wave started.
 */
export async function flagInventoryDirty() {
    await db.query(
        `UPDATE product_alert_state
         SET dirty = TRUE,
             dirty_since = COALESCE(dirty_since, NOW()),
             updated_at = NOW()
         WHERE id = TRUE`
    );
}
