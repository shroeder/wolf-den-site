import "server-only";

import { db } from "@/lib/db";

/**
 * Aggregate the "Looking For" wishlist demand for the admin app, grouped by watcher (customer).
 *
 * Each watcher is an anonymous visitor that may have attached a verified email. We surface every
 * watchlist item joined to its catalog card and the current in-stock snapshot (`tcg_stock`, keyed
 * by tcgplayer product id == `tcg_cards.id`) so staff can see who wants what and which of those
 * cards are in stock right now to build a custom order.
 *
 * Watchers with in-stock items are sorted first (immediately actionable), then by wishlist size;
 * within a watcher, in-stock items come first.
 */
export async function listLookingForDemand() {
    const rows = await db.query(
        `SELECT
            w.id AS watcher_id,
            w.email AS email,
            w.email_verified AS email_verified,
            i.created_at AS added_at,
            i.quantity AS quantity,
            c.id AS card_id,
            c.game AS game,
            c.name AS name,
            c.number AS number,
            c.image_url AS image_url,
            c.market_price AS market_price,
            s.name AS set_name,
            st.quantity AS stock_quantity
         FROM card_watchlist_items i
         JOIN card_watchers w ON w.id = i.watcher_id
         JOIN tcg_cards c ON c.id = i.card_id
         JOIN tcg_sets s ON s.id = c.set_id
         LEFT JOIN tcg_stock st ON st.product_id = c.id
         ORDER BY w.id, c.name`
    );

    const byWatcher = new Map();

    for (const row of rows) {
        const watcherId = row.watcher_id;

        if (!byWatcher.has(watcherId)) {
            byWatcher.set(watcherId, {
                id: watcherId,
                email: row.email || null,
                emailVerified: Boolean(row.email_verified),
                items: [],
            });
        }

        const stockQuantity = row.stock_quantity === null ? null : Number(row.stock_quantity);

        byWatcher.get(watcherId).items.push({
            cardId: Number(row.card_id),
            game: row.game,
            name: row.name,
            setName: row.set_name,
            number: row.number,
            imageUrl: row.image_url,
            marketPrice: row.market_price === null ? null : Number(row.market_price),
            quantity: row.quantity === null ? 1 : Number(row.quantity),
            inStock: stockQuantity !== null && stockQuantity > 0,
            stockQuantity,
            addedAt: row.added_at ? new Date(row.added_at).toISOString() : null,
        });
    }

    const watchers = Array.from(byWatcher.values()).map((watcher) => {
        // In-stock items first within each watcher's list.
        watcher.items.sort((a, b) => {
            if (a.inStock !== b.inStock) {
                return a.inStock ? -1 : 1;
            }

            return a.name.localeCompare(b.name);
        });

        const inStockCount = watcher.items.filter((item) => item.inStock).length;

        return {
            ...watcher,
            itemCount: watcher.items.length,
            totalQuantity: watcher.items.reduce((sum, item) => sum + item.quantity, 0),
            inStockCount,
        };
    });

    // Actionable watchers (have something in stock) first, then by wishlist size.
    watchers.sort((a, b) => {
        if ((a.inStockCount > 0) !== (b.inStockCount > 0)) {
            return a.inStockCount > 0 ? -1 : 1;
        }

        if (b.inStockCount !== a.inStockCount) {
            return b.inStockCount - a.inStockCount;
        }

        return b.itemCount - a.itemCount;
    });

    const totals = {
        watchers: watchers.length,
        items: watchers.reduce((sum, watcher) => sum + watcher.itemCount, 0),
        units: watchers.reduce((sum, watcher) => sum + watcher.totalQuantity, 0),
        inStockItems: watchers.reduce((sum, watcher) => sum + watcher.inStockCount, 0),
    };

    return { watchers, totals };
}
