import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { db } from "@/lib/db";
import { filterKnownCategoryIds } from "@/lib/product-alerts/categories";

function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
}

function hashToken(token) {
    return createHash("sha256").update(token).digest("hex");
}

function createRawToken() {
    return randomBytes(32).toString("hex");
}

/**
 * Create or update a subscriber for `email` following `categoryIds`, and issue a fresh confirmation
 * token. Re-subscribing (or changing categories) resets verification so a new double opt-in is
 * required, matching the watcher flow in `attachWatcherEmail`. Unknown category ids are dropped.
 * Returns { rawToken, categoryIds } or { error } when no valid categories were supplied.
 */
export async function upsertSubscriberWithCategories(email, categoryIds) {
    const normalized = normalizeEmail(email);
    const validCategoryIds = await filterKnownCategoryIds(categoryIds);

    if (!validCategoryIds.length) {
        return { error: "no_categories" };
    }

    const rawToken = createRawToken();
    const tokenHash = hashToken(rawToken);

    const subscriber = await db.queryOne(
        `INSERT INTO product_alert_subscribers (
            email, email_normalized, email_verified, verify_token_hash, verify_sent_at, unsubscribe_token
         ) VALUES ($1, $2, FALSE, $3, NOW(), $4)
         ON CONFLICT (email_normalized) DO UPDATE SET
            email = EXCLUDED.email,
            email_verified = FALSE,
            verify_token_hash = EXCLUDED.verify_token_hash,
            verify_sent_at = NOW(),
            updated_at = NOW()
         RETURNING id`,
        [String(email).trim(), normalized, tokenHash, createRawToken()]
    );

    await setCategories(subscriber.id, validCategoryIds);

    return { rawToken, categoryIds: validCategoryIds };
}

/**
 * Replace a subscriber's followed categories with exactly `categoryIds`.
 */
export async function setCategories(subscriberId, categoryIds) {
    await db.query(
        `DELETE FROM product_alert_subscriptions WHERE subscriber_id = $1`,
        [subscriberId]
    );

    for (const categoryId of categoryIds) {
        await db.query(
            `INSERT INTO product_alert_subscriptions (subscriber_id, square_category_id)
             VALUES ($1, $2)
             ON CONFLICT (subscriber_id, square_category_id) DO NOTHING`,
            [subscriberId, categoryId]
        );
    }
}

/**
 * Verify a subscriber from a raw confirmation token. Returns the subscriber row or null.
 */
export async function confirmSubscriber(rawToken) {
    if (!rawToken) {
        return null;
    }

    // Baseline last_notified_at at confirm time so a new subscriber receives only arrivals that
    // land *after* they opt in, not the entire historical backlog. Preserve an existing baseline
    // on re-confirm so we never replay arrivals they were already eligible for.
    return db.queryOne(
        `UPDATE product_alert_subscribers SET
            email_verified = TRUE,
            verify_token_hash = NULL,
            last_notified_at = COALESCE(last_notified_at, NOW()),
            updated_at = NOW()
         WHERE verify_token_hash = $1
         RETURNING id, email`,
        [hashToken(rawToken)]
    );
}

/**
 * Remove a subscriber (and, via cascade, their category rows) from their unsubscribe token.
 * Returns the removed email or null if the token didn't match.
 */
export async function unsubscribeByToken(rawToken) {
    if (!rawToken) {
        return null;
    }

    return db.queryOne(
        `DELETE FROM product_alert_subscribers WHERE unsubscribe_token = $1 RETURNING email`,
        [String(rawToken)]
    );
}
