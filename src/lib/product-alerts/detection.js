import "server-only";

import { db } from "@/lib/db";
import { createServerLogger } from "@/lib/server-logger";
import { listShopInventory } from "@/lib/consignment/square";
import { syncCategoriesFromSquare } from "@/lib/product-alerts/categories";

const detectionLogger = createServerLogger({ source: "job", subsystem: "product-alerts-scan" });

// listShopInventory appends a synthetic "recently added" pseudo-category whose items are duplicates
// of real categories. It isn't a Square category, so we skip it for both sync and detection.
const SYNTHETIC_CATEGORY_ID = "new-last-4-days";

/**
 * Scan current Square inventory and record new arrivals. An arrival is a variation that flipped
 * from absent/out-of-stock to in-stock: `new` if we've never seen it, `restock` if it was
 * previously out. The category list is synced in the same pass. Out-of-stock variations are
 * re-armed so a future restock alerts again. Idempotent: running twice with no inventory change
 * produces no arrivals.
 */
export async function runProductAlertScan() {
    const inventory = await listShopInventory();

    // 1. Real categories (id -> name) and the current in-stock variation set, aggregated across
    //    categories (a variation can belong to more than one).
    const categoryMap = new Map();
    const currentInStock = new Map(); // variationId -> { name, imageUrl, categoryIds:Set }

    for (const category of inventory) {
        if (category.id === SYNTHETIC_CATEGORY_ID) {
            continue;
        }

        categoryMap.set(category.id, category.name);

        for (const item of category.items || []) {
            if (!(item.quantity > 0)) {
                continue;
            }

            let entry = currentInStock.get(item.id);

            if (!entry) {
                entry = { name: item.name, imageUrl: item.imageUrl || null, categoryIds: new Set() };
                currentInStock.set(item.id, entry);
            }

            entry.categoryIds.add(category.id);
        }
    }

    await syncCategoriesFromSquare(categoryMap);

    // 2. Prior per-variation state.
    const priorRows = await db.query(
        `SELECT variation_id, in_stock FROM product_alert_inventory_state`
    );
    const priorState = new Map(priorRows.map((row) => [row.variation_id, row.in_stock]));
    const isSeedingRun = priorState.size === 0;

    // 3. Diff. On the very first scan we seed the baseline silently rather than flagging the entire
    //    catalog as "new".
    const arrivals = []; // { variationId, categoryId, name, imageUrl, kind }

    for (const [variationId, entry] of currentInStock) {
        const prior = priorState.get(variationId);
        const wasInStock = prior === true;
        const seenBefore = priorState.has(variationId);

        if (!isSeedingRun && !wasInStock) {
            const kind = seenBefore ? "restock" : "new";

            for (const categoryId of entry.categoryIds) {
                arrivals.push({ variationId, categoryId, name: entry.name, imageUrl: entry.imageUrl, kind });
            }
        }

        await db.query(
            `INSERT INTO product_alert_inventory_state (variation_id, item_name, in_stock, last_seen_at)
             VALUES ($1, $2, TRUE, NOW())
             ON CONFLICT (variation_id) DO UPDATE SET
                item_name = EXCLUDED.item_name,
                in_stock = TRUE,
                last_seen_at = NOW()`,
            [variationId, entry.name]
        );
    }

    // 4. Re-arm variations that left stock so a future restock alerts again.
    const inStockIds = Array.from(currentInStock.keys());

    await db.query(
        `UPDATE product_alert_inventory_state
         SET in_stock = FALSE
         WHERE in_stock = TRUE AND NOT (variation_id = ANY($1::text[]))`,
        [inStockIds]
    );

    // 5. Persist arrivals.
    for (const arrival of arrivals) {
        await db.query(
            `INSERT INTO product_alert_arrivals
                (square_category_id, variation_id, item_name, kind, image_url)
             VALUES ($1, $2, $3, $4, $5)`,
            [arrival.categoryId, arrival.variationId, arrival.name, arrival.kind, arrival.imageUrl]
        );
    }

    await db.query(
        `UPDATE product_alert_state SET last_scan_at = NOW(), dirty = FALSE, dirty_since = NULL, updated_at = NOW() WHERE id = TRUE`
    );

    detectionLogger.info("product_alerts.scan.completed", {
        categories: categoryMap.size,
        inStockVariations: currentInStock.size,
        arrivals: arrivals.length,
        seeding: isSeedingRun,
    });

    return { categories: categoryMap.size, inStockVariations: currentInStock.size, arrivals: arrivals.length, seeding: isSeedingRun };
}
