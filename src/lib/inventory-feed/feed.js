import "server-only";

import { db } from "@/lib/db";

const DEFAULT_WINDOW_HOURS = 24 * 7;
const CATEGORY_SEPARATOR = " · ";

/**
 * Recent in-stock changes (new / restock / price_drop) from the unified inventory_feed — the same
 * rows the Discord broadcast posts. Newest change first. No price gate: every changed item appears.
 * Returns plain objects safe to pass to a server component.
 */
export async function listRecentChanges({ windowHours = DEFAULT_WINDOW_HOURS, limit = 120 } = {}) {
    const rows = await db.query(
        `SELECT variation_id, name, image_url, price, quantity, category_names, last_change_kind, last_change_at
         FROM inventory_feed
         WHERE in_stock = TRUE
           AND last_change_at IS NOT NULL
           AND last_change_at > NOW() - ($1 || ' hours')::interval
         ORDER BY last_change_at DESC
         LIMIT $2`,
        [String(windowHours), limit]
    );

    return rows.map((row) => ({
        id: row.variation_id,
        name: row.name,
        imageUrl: row.image_url || null,
        price: row.price == null ? null : Number(row.price),
        quantity: row.quantity == null ? null : Number(row.quantity),
        kind: row.last_change_kind, // 'new' | 'restock' | 'price_drop'
        categoryNames: row.category_names ? row.category_names.split(CATEGORY_SEPARATOR) : [],
        createdAt: row.last_change_at instanceof Date ? row.last_change_at.toISOString() : row.last_change_at,
    }));
}

/**
 * A single inventory item by Square variation id (any stock state — the product page shows
 * out-of-stock items as OutOfStock + noindex rather than 404ing a URL Google already knows).
 */
export async function getInventoryItem(variationId) {
    if (!variationId) {
        return null;
    }

    const row = await db.queryOne(
        `SELECT variation_id, name, image_url, price, quantity, category_names, in_stock,
                last_change_at, updated_at
         FROM inventory_feed
         WHERE variation_id = $1`,
        [variationId]
    );

    if (!row) {
        return null;
    }

    return {
        variationId: row.variation_id,
        name: row.name,
        imageUrl: row.image_url || null,
        price: row.price == null ? null : Number(row.price),
        quantity: row.quantity == null ? null : Number(row.quantity),
        categoryNames: row.category_names ? row.category_names.split(CATEGORY_SEPARATOR) : [],
        inStock: Boolean(row.in_stock),
        updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    };
}

/** Every in-stock item (variation id + name + updated_at) for the sitemap's product URLs. */
export async function listInStockForSitemap() {
    const rows = await db.query(
        `SELECT variation_id, name, updated_at FROM inventory_feed WHERE in_stock = TRUE`
    );

    return rows.map((row) => ({
        variationId: row.variation_id,
        name: row.name,
        updatedAt: row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at),
    }));
}

/**
 * Count of recent changes — used for the homepage call-to-action. Returns 0 on any error so the
 * homepage never breaks on a transient DB hiccup.
 */
export async function countRecentChanges(options = {}) {
    try {
        const items = await listRecentChanges(options);

        return items.length;
    } catch {
        return 0;
    }
}
