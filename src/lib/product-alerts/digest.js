import "server-only";

import { db } from "@/lib/db";
import { createServerLogger } from "@/lib/server-logger";
import { sendNewArrivalsDigestEmail } from "@/lib/product-alerts/email";

const digestLogger = createServerLogger({ source: "job", subsystem: "product-alerts-digest" });

/**
 * Email each verified subscriber a single digest of new arrivals in their followed categories that
 * landed since their last notification. A subscriber's cursor advances to the newest arrival they
 * were actually sent, so nothing replays and nothing inserted mid-run is skipped. Idempotent.
 */
export async function runProductAlertDigest() {
    const rows = await db.query(
        `SELECT
            s.id AS subscriber_id,
            s.email AS email,
            s.unsubscribe_token AS unsubscribe_token,
            a.square_category_id AS category_id,
            cat.name AS category_name,
            a.item_name AS item_name,
            a.kind AS kind,
            a.created_at AS created_at
         FROM product_alert_subscribers s
         JOIN product_alert_subscriptions sub ON sub.subscriber_id = s.id
         JOIN product_alert_arrivals a
            ON a.square_category_id = sub.square_category_id
           AND a.created_at > COALESCE(s.last_notified_at, 'epoch'::timestamptz)
         JOIN product_alert_categories cat ON cat.square_category_id = a.square_category_id
         WHERE s.email_verified = TRUE
         ORDER BY s.id, cat.name, a.item_name`
    );

    // Group into one digest per subscriber, deduping repeat arrivals of the same item in a category.
    const bySubscriber = new Map();

    for (const row of rows) {
        let subscriber = bySubscriber.get(row.subscriber_id);

        if (!subscriber) {
            subscriber = {
                email: row.email,
                unsubscribeToken: row.unsubscribe_token,
                categories: new Map(), // categoryId -> { name, items:Map(itemKey -> {name, kind}) }
                maxCreatedAt: row.created_at,
            };
            bySubscriber.set(row.subscriber_id, subscriber);
        }

        if (row.created_at > subscriber.maxCreatedAt) {
            subscriber.maxCreatedAt = row.created_at;
        }

        let category = subscriber.categories.get(row.category_id);

        if (!category) {
            category = { name: row.category_name, items: new Map() };
            subscriber.categories.set(row.category_id, category);
        }

        const itemKey = `${row.item_name}`.toLowerCase();
        const existing = category.items.get(itemKey);

        // Prefer "new" over "restock" if the same item shows up both ways.
        if (!existing || (existing.kind === "restock" && row.kind === "new")) {
            category.items.set(itemKey, { name: row.item_name, kind: row.kind });
        }
    }

    let subscribersNotified = 0;
    let itemsNotified = 0;

    for (const [subscriberId, subscriber] of bySubscriber) {
        const sections = Array.from(subscriber.categories.values()).map((category) => ({
            categoryName: category.name,
            items: Array.from(category.items.values()),
        }));

        const sectionItemCount = sections.reduce((sum, section) => sum + section.items.length, 0);

        try {
            await sendNewArrivalsDigestEmail(subscriber.email, sections, subscriber.unsubscribeToken);

            await db.query(
                `UPDATE product_alert_subscribers SET last_notified_at = $2, updated_at = NOW() WHERE id = $1`,
                [subscriberId, subscriber.maxCreatedAt]
            );

            subscribersNotified += 1;
            itemsNotified += sectionItemCount;
        } catch (error) {
            digestLogger.warn("product_alerts.digest.email_send.failed", {
                subscriberId,
                reason: error instanceof Error ? error.message : "unknown_error",
            });
        }
    }

    await db.query(
        `UPDATE product_alert_state SET last_digest_at = NOW(), updated_at = NOW() WHERE id = TRUE`
    );

    digestLogger.info("product_alerts.digest.completed", { subscribersNotified, itemsNotified });

    return { subscribersNotified, itemsNotified };
}
