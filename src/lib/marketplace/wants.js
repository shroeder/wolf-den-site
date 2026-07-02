import "server-only";

import { db } from "@/lib/db";
import { sendWantAvailableEmail } from "@/lib/marketplace/email.js";
import { createServerLogger } from "@/lib/server-logger";

// Buyer "notify me when a vendor lists this" demand signals. Capture -> alert on first matching
// listing -> aggregate into a vendor-facing "most wanted" shopping list.

const wantsLogger = createServerLogger({ source: "api", subsystem: "marketplace-wants" });

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
}

export function isValidEmail(value) {
    return EMAIL_PATTERN.test(normalizeEmail(value));
}

// Record a buyer's want for a catalog product (idempotent per person+product). An optional maxPrice
// only alerts them when a listing appears at or under that price.
export async function createWant({ catalogProductId, email, maxPrice = null }) {
    if (!catalogProductId) {
        throw new Error("A product is required.");
    }
    if (!isValidEmail(email)) {
        throw new Error("A valid email address is required.");
    }

    // Confirm the product exists in the catalog before recording demand against it.
    const product = await db.queryOne("SELECT id FROM tcg_cards WHERE id = $1", [catalogProductId]);
    if (!product) {
        throw new Error("That product isn't in the catalog.");
    }

    const parsed = maxPrice != null && maxPrice !== "" ? Number(maxPrice) : null;
    const normalizedMax = parsed != null && Number.isFinite(parsed) && parsed > 0 ? parsed : null;

    // Re-registering updates the threshold and re-arms the alert (so a matching listing re-notifies).
    await db.query(
        `INSERT INTO mkt_want (catalog_product_id, email, email_normalized, max_price)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (catalog_product_id, email_normalized)
         DO UPDATE SET max_price = EXCLUDED.max_price, notified_at = NULL, updated_at = NOW()`,
        [catalogProductId, String(email).trim(), normalizeEmail(email), normalizedMax]
    );

    wantsLogger.info("marketplace.want.created", { catalogProductId, hasMaxPrice: normalizedMax != null });
}

// Called when a vendor lists a product: email everyone waiting on it (once), mark them notified.
// Best-effort — never let an alert failure break listing creation.
export async function notifyWantsForProduct(catalogProductId, listingPrice = null) {
    if (!catalogProductId) {
        return;
    }

    const price = listingPrice != null && Number.isFinite(Number(listingPrice)) ? Number(listingPrice) : null;

    // Only alert wants whose threshold is met: no max_price, unknown listing price, or price <= max.
    // Wants with a higher threshold stay pending for a future cheaper listing.
    const pending = await db.query(
        `SELECT w.id, w.email,
                c.name, c.number, c.image_url, s.name AS set_name
         FROM mkt_want w
         JOIN tcg_cards c ON c.id = w.catalog_product_id
         JOIN tcg_sets s ON s.id = c.set_id
         WHERE w.catalog_product_id = $1 AND w.notified_at IS NULL
           AND (w.max_price IS NULL OR $2::numeric IS NULL OR w.max_price >= $2::numeric)`,
        [catalogProductId, price]
    );

    for (const want of pending) {
        try {
            await sendWantAvailableEmail(want.email, {
                catalogProductId: String(catalogProductId),
                name: want.name,
                setName: want.set_name,
                number: want.number,
                imageUrl: want.image_url,
            });

            await db.query("UPDATE mkt_want SET notified_at = NOW(), updated_at = NOW() WHERE id = $1", [want.id]);
        } catch (error) {
            wantsLogger.warn("marketplace.want.notify_failed", { wantId: want.id, reason: error.message });
        }
    }

    if (pending.length) {
        wantsLogger.info("marketplace.want.notified", { catalogProductId, count: pending.length });
    }
}

// Vendor "most wanted" board: products buyers want, by demand. A shopping list of what to go buy.
export async function listMostWanted(limit = 40) {
    const rows = await db.query(
        `SELECT c.id, c.name, c.number, c.image_url, c.market_price, s.name AS set_name,
                COUNT(w.id) AS want_count
         FROM mkt_want w
         JOIN tcg_cards c ON c.id = w.catalog_product_id
         JOIN tcg_sets s ON s.id = c.set_id
         GROUP BY c.id, s.name
         ORDER BY want_count DESC, c.name ASC
         LIMIT $1`,
        [Math.min(Number(limit) || 40, 100)]
    );

    return rows.map((row) => ({
        catalogProductId: String(row.id),
        name: row.name,
        setName: row.set_name,
        number: row.number,
        imageUrl: row.image_url,
        marketPrice: row.market_price === null ? null : Number(row.market_price),
        wantCount: Number(row.want_count) || 0,
    }));
}

// How many buyers want a given product (for "N people are looking for this").
export async function getWantCount(catalogProductId) {
    const row = await db.queryOne("SELECT COUNT(*) AS n FROM mkt_want WHERE catalog_product_id = $1", [catalogProductId]);
    return Number(row?.n) || 0;
}

// A buyer's want list, by email (accountless). Low-sensitivity (just cards they want).
export async function listWantsByEmail(email) {
    if (!isValidEmail(email)) {
        return [];
    }
    const rows = await db.query(
        `SELECT w.id, w.catalog_product_id, w.max_price, w.notified_at, w.created_at,
                c.name, c.number, c.image_url, c.game, c.market_price, s.name AS set_name
         FROM mkt_want w
         JOIN tcg_cards c ON c.id = w.catalog_product_id
         JOIN tcg_sets s ON s.id = c.set_id
         WHERE w.email_normalized = $1
         ORDER BY w.created_at DESC`,
        [normalizeEmail(email)]
    );
    return rows.map((r) => ({
        id: r.id,
        catalogProductId: String(r.catalog_product_id),
        name: r.name,
        setName: r.set_name,
        number: r.number,
        game: r.game,
        imageUrl: r.image_url,
        marketPrice: r.market_price != null ? Number(r.market_price) : null,
        maxPrice: r.max_price != null ? Number(r.max_price) : null,
        notified: Boolean(r.notified_at),
    }));
}

// Remove a want from a buyer's list (authorized by matching the email it was created under).
export async function deleteWant(id, email) {
    if (!id || !isValidEmail(email)) {
        return false;
    }
    const rows = await db.query(
        `DELETE FROM mkt_want WHERE id = $1 AND email_normalized = $2 RETURNING id`,
        [id, normalizeEmail(email)]
    );
    return rows.length > 0;
}
