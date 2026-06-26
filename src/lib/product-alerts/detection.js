import "server-only";

import { db } from "@/lib/db";
import { createServerLogger } from "@/lib/server-logger";
import { listShopInventory } from "@/lib/consignment/square";
import { syncCategoriesFromSquare } from "@/lib/product-alerts/categories";

const detectionLogger = createServerLogger({ source: "job", subsystem: "product-alerts-scan" });

// listShopInventory appends a synthetic "Just In" pseudo-category whose items are duplicates
// of real categories. It isn't a Square category, so we skip it for both sync and detection.
const SYNTHETIC_CATEGORY_ID = "new-just-in";

// Scanned singles carry a TCG-<tcgplayerProductId> SKU (accounting_app
// SquareTransactionsService.buildSquareVariationSku). The Discord broadcast uses this to gate
// low-value singles; sealed/supplies/etc. have other SKUs and always post.
const TCG_SINGLE_SKU_PATTERN = /^TCG-\d+$/i;

function isSingleSku(sku) {
    return TCG_SINGLE_SKU_PATTERN.test(String(sku || "").trim());
}

/**
 * Scan current Square inventory and record new arrivals. An arrival is `new` if we've never seen
 * the variation, or `restock` if it's an existing variation whose on-hand count went up since the
 * last scan — whether that's a return from zero or a top-up that never hit zero. The category list
 * is synced in the same pass. Out-of-stock variations are re-armed (count zeroed) so a future
 * restock alerts again. Idempotent: running twice with no inventory change produces no arrivals.
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
                entry = {
                    name: item.name,
                    imageUrl: item.imageUrl || null,
                    price: typeof item.price === "number" ? item.price : null,
                    isSingle: isSingleSku(item.sku),
                    // On-hand count is per-variation (identical across the categories a variation
                    // belongs to), so capturing it once on first sight is enough.
                    quantity: Number(item.quantity) || 0,
                    categoryIds: new Set(),
                };
                currentInStock.set(item.id, entry);
            }

            entry.categoryIds.add(category.id);
        }
    }

    await syncCategoriesFromSquare(categoryMap);

    // 2. Prior per-variation state. `quantity` is NULL for rows written before the column existed
    //    (re-baselined silently on the next scan — see the quantity-increase guard below).
    const priorRows = await db.query(
        `SELECT variation_id, in_stock, quantity FROM product_alert_inventory_state`
    );
    const priorState = new Map(
        priorRows.map((row) => [
            row.variation_id,
            { inStock: row.in_stock === true, quantity: row.quantity == null ? null : Number(row.quantity) },
        ])
    );
    const isSeedingRun = priorState.size === 0;

    // 3. Diff. On the very first scan we seed the baseline silently rather than flagging the entire
    //    catalog as "new".
    const arrivals = []; // { variationId, categoryId, name, imageUrl, kind }

    for (const [variationId, entry] of currentInStock) {
        const prior = priorState.get(variationId);
        const seenBefore = priorState.has(variationId);
        const wasInStock = prior?.inStock === true;
        const priorQuantity = prior && prior.quantity != null ? prior.quantity : null;

        // Arrival rules:
        //   - never seen before               -> "new"
        //   - was out of stock, now in stock   -> "restock" (the original 0 -> positive flip)
        //   - on-hand count went up vs last scan -> "restock" (a top-up that never hit zero)
        // The quantity-increase signal is skipped when priorQuantity is NULL (row predates the
        // quantity column) so the first post-migration scan re-baselines instead of flagging the
        // whole catalog.
        let kind = null;

        if (!isSeedingRun) {
            if (!seenBefore) {
                kind = "new";
            } else if (!wasInStock || (priorQuantity !== null && entry.quantity > priorQuantity)) {
                kind = "restock";
            }
        }

        if (kind) {
            for (const categoryId of entry.categoryIds) {
                arrivals.push({
                    variationId,
                    categoryId,
                    name: entry.name,
                    imageUrl: entry.imageUrl,
                    price: entry.price,
                    isSingle: entry.isSingle,
                    kind,
                });
            }
        }

        await db.query(
            `INSERT INTO product_alert_inventory_state (variation_id, item_name, in_stock, quantity, last_seen_at)
             VALUES ($1, $2, TRUE, $3, NOW())
             ON CONFLICT (variation_id) DO UPDATE SET
                item_name = EXCLUDED.item_name,
                in_stock = TRUE,
                quantity = EXCLUDED.quantity,
                last_seen_at = NOW()`,
            [variationId, entry.name, entry.quantity]
        );
    }

    // 4. Re-arm variations that left stock so a future restock alerts again.
    const inStockIds = Array.from(currentInStock.keys());

    await db.query(
        `UPDATE product_alert_inventory_state
         SET in_stock = FALSE, quantity = 0
         WHERE in_stock = TRUE AND NOT (variation_id = ANY($1::text[]))`,
        [inStockIds]
    );

    // 5. Persist arrivals.
    for (const arrival of arrivals) {
        await db.query(
            `INSERT INTO product_alert_arrivals
                (square_category_id, variation_id, item_name, kind, image_url, price, is_single)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [arrival.categoryId, arrival.variationId, arrival.name, arrival.kind, arrival.imageUrl, arrival.price, arrival.isSingle]
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
