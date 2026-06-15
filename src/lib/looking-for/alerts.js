import "server-only";

import { db } from "@/lib/db";
import { createServerLogger } from "@/lib/server-logger";
import { listInStockTcgSkus } from "@/lib/consignment/square";
import { sendCardRestockEmail } from "@/lib/looking-for/email";

const alertsLogger = createServerLogger({ source: "job", subsystem: "looking-for-alerts" });

/**
 * Match every verified watcher's wishlist against current Square inventory and email them about
 * cards that just became available. Alerts fire on the out-of-stock -> in-stock edge only:
 * items are flagged once notified, and the flag resets when the card leaves stock so a future
 * restock re-alerts. Idempotent across runs.
 */
export async function runLookingForAlerts() {
    const inStock = await listInStockTcgSkus();
    const inStockIds = Array.from(inStock.keys());

    // Re-arm any previously notified items whose card is no longer in stock.
    await db.query(
        `UPDATE card_watchlist_items
         SET notified_in_stock = FALSE
         WHERE notified_in_stock = TRUE
           AND NOT (card_id = ANY($1::bigint[]))`,
        [inStockIds]
    );

    if (!inStockIds.length) {
        alertsLogger.info("looking_for.alerts.no_inventory");

        return { inStockProducts: 0, watchersNotified: 0, cardsNotified: 0 };
    }

    const pending = await db.query(
        `SELECT
            w.id AS watcher_id,
            w.email AS email,
            c.id AS card_id,
            c.name AS name,
            c.number AS number,
            c.market_price AS market_price,
            c.image_url AS image_url,
            s.name AS set_name
         FROM card_watchlist_items i
         JOIN card_watchers w ON w.id = i.watcher_id
         JOIN tcg_cards c ON c.id = i.card_id
         JOIN tcg_sets s ON s.id = c.set_id
         WHERE i.notified_in_stock = FALSE
           AND w.email_verified = TRUE
           AND w.email IS NOT NULL
           AND i.card_id = ANY($1::bigint[])
         ORDER BY w.id, c.name`,
        [inStockIds]
    );

    const byWatcher = new Map();

    for (const row of pending) {
        if (!byWatcher.has(row.watcher_id)) {
            byWatcher.set(row.watcher_id, { email: row.email, cards: [] });
        }

        byWatcher.get(row.watcher_id).cards.push({
            id: Number(row.card_id),
            name: row.name,
            number: row.number,
            marketPrice: row.market_price === null ? null : Number(row.market_price),
            imageUrl: row.image_url,
            setName: row.set_name,
        });
    }

    let watchersNotified = 0;
    let cardsNotified = 0;

    for (const [watcherId, { email, cards }] of byWatcher) {
        try {
            await sendCardRestockEmail(email, cards);

            await db.query(
                `UPDATE card_watchlist_items
                 SET notified_in_stock = TRUE, last_notified_at = NOW()
                 WHERE watcher_id = $1 AND card_id = ANY($2::bigint[])`,
                [watcherId, cards.map((card) => card.id)]
            );

            watchersNotified += 1;
            cardsNotified += cards.length;
        } catch (error) {
            alertsLogger.warn("looking_for.alerts.email_send.failed", {
                watcherId,
                reason: error instanceof Error ? error.message : "unknown_error",
            });
        }
    }

    alertsLogger.info("looking_for.alerts.completed", {
        inStockProducts: inStockIds.length,
        watchersNotified,
        cardsNotified,
    });

    return { inStockProducts: inStockIds.length, watchersNotified, cardsNotified };
}
