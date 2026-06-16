import "server-only";

import { db } from "@/lib/db";
import { createServerLogger } from "@/lib/server-logger";
import { listInStockTcgSkus } from "@/lib/consignment/square";

const stockLogger = createServerLogger({ source: "job", subsystem: "tcg-stock" });

const UPSERT_BATCH = 200;

/**
 * Refresh the in-stock snapshot from Square. Upserts current in-stock products (keyed by
 * tcgplayer product id) and drops any that are no longer in stock. Used to highlight in-stock
 * cards in the "Looking For" search.
 */
export async function refreshStockSnapshot() {
    const inStock = await listInStockTcgSkus();
    const entries = Array.from(inStock.entries());

    for (let index = 0; index < entries.length; index += UPSERT_BATCH) {
        const slice = entries.slice(index, index + UPSERT_BATCH);
        const values = [];
        const placeholders = slice.map(([productId, quantity], offset) => {
            values.push(productId, quantity);
            return `($${offset * 2 + 1}, $${offset * 2 + 2})`;
        });

        await db.query(
            `INSERT INTO tcg_stock (product_id, quantity)
             VALUES ${placeholders.join(", ")}
             ON CONFLICT (product_id) DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = NOW()`,
            values
        );
    }

    // Remove products that are no longer in stock (empty array -> clears the whole table).
    await db.query(
        `DELETE FROM tcg_stock WHERE product_id <> ALL($1::bigint[])`,
        [entries.map(([productId]) => productId)]
    );

    stockLogger.info("tcg.stock.refresh.completed", { inStockProducts: entries.length });

    return { inStockProducts: entries.length };
}
