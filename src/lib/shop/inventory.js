import "server-only";

import { db } from "@/lib/db";
import { listShopInventory } from "@/lib/consignment/square";
import { createServerLogger } from "@/lib/server-logger";

const SNAPSHOT_KEY = "shop_inventory";
const shopLogger = createServerLogger({ source: "api", subsystem: "shop-inventory" });

export async function refreshShopInventory() {
    shopLogger.info("shop.inventory.refresh.started");

    const data = await listShopInventory();

    await db.query(
        `INSERT INTO shop_inventory_snapshot (snapshot_key, data, refreshed_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (snapshot_key) DO UPDATE
             SET data = EXCLUDED.data,
                 refreshed_at = EXCLUDED.refreshed_at`,
        [SNAPSHOT_KEY, JSON.stringify(data)]
    );

    shopLogger.info("shop.inventory.refresh.completed", {
        categoryCount: data.length,
        totalItems: data.reduce((sum, c) => sum + c.items.length, 0),
    });

    return { categoryCount: data.length, totalItems: data.reduce((sum, c) => sum + c.items.length, 0) };
}

export async function getShopInventory() {
    const result = await db.query(
        "SELECT data, refreshed_at FROM shop_inventory_snapshot WHERE snapshot_key = $1",
        [SNAPSHOT_KEY]
    );

    if (!result.rows.length) {
        return null;
    }

    return {
        categories: result.rows[0].data,
        refreshedAt: result.rows[0].refreshed_at,
    };
}
