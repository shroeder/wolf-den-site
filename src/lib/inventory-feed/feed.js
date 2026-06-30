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
