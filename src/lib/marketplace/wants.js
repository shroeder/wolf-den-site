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
export async function createWant({
    catalogProductId,
    email,
    maxPrice = null,
    quantity = 1,
    note = null,
    lat = null,
    lng = null,
    buyerId = null,
}) {
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
    const qty = Math.min(Math.max(Math.round(Number(quantity) || 1), 1), 999);
    const cleanNote = note != null && String(note).trim() !== "" ? String(note).trim().slice(0, 500) : null;
    const glat = Number.isFinite(Number(lat)) ? Number(lat) : null;
    const glng = Number.isFinite(Number(lng)) ? Number(lng) : null;

    // Re-registering updates the buy order and re-arms the alert (so a matching listing re-notifies).
    // COALESCE keeps a prior location/buyer if this call didn't supply one.
    await db.query(
        `INSERT INTO mkt_want (catalog_product_id, email, email_normalized, max_price, quantity, note, lat, lng, buyer_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'open')
         ON CONFLICT (catalog_product_id, email_normalized)
         DO UPDATE SET max_price = EXCLUDED.max_price, quantity = EXCLUDED.quantity, note = EXCLUDED.note,
                       lat = COALESCE(EXCLUDED.lat, mkt_want.lat), lng = COALESCE(EXCLUDED.lng, mkt_want.lng),
                       buyer_id = COALESCE(EXCLUDED.buyer_id, mkt_want.buyer_id),
                       status = 'open', notified_at = NULL, updated_at = NOW()`,
        [catalogProductId, String(email).trim(), normalizeEmail(email), normalizedMax, qty, cleanNote, glat, glng, buyerId]
    );

    wantsLogger.info("marketplace.want.created", { catalogProductId, hasMaxPrice: normalizedMax != null, qty });
}

// One open buy order with its buyer email + product, for a vendor's "I can fill this" response.
export async function getBuyOrderById(id) {
    if (!id) return null;
    return db.queryOne(
        `SELECT w.id, w.email, w.buyer_id, w.max_price, w.quantity, w.catalog_product_id,
                c.name, s.name AS set_name
         FROM mkt_want w
         JOIN tcg_cards c ON c.id = w.catalog_product_id
         JOIN tcg_sets s ON s.id = c.set_id
         WHERE w.id = $1 AND w.status = 'open'`,
        [id]
    );
}

// Open buy orders (demand) for vendors + the map. Filter by `near` {lat,lng,radiusKm} for a map tap,
// by `productId` for one product, or by `buyerId` for a buyer's own orders. Each row carries the
// product, the buyer's max price + quantity, and a coarse location.
export async function listBuyOrders({ productId = null, buyerId = null, near = null, limit = 100 } = {}) {
    const params = [];
    const where = ["w.status = 'open'"];

    if (productId) {
        params.push(productId);
        where.push(`w.catalog_product_id = $${params.length}`);
    }
    if (buyerId) {
        params.push(buyerId);
        where.push(`w.buyer_id = $${params.length}`);
    }

    let distanceSelect = "NULL::numeric AS distance_km";
    let orderBy = "w.created_at DESC";
    if (near && Number.isFinite(Number(near.lat)) && Number.isFinite(Number(near.lng))) {
        const radiusKm = Math.min(Math.max(Number(near.radiusKm) || 60, 1), 500);
        params.push(Number(near.lat), Number(near.lng));
        const latP = `$${params.length - 1}`;
        const lngP = `$${params.length}`;
        // Haversine (km). Only orders with a location can match a location filter.
        const dist = `(6371 * acos(LEAST(1, cos(radians(${latP})) * cos(radians(w.lat)) * cos(radians(w.lng) - radians(${lngP})) + sin(radians(${latP})) * sin(radians(w.lat)))))`;
        distanceSelect = `${dist} AS distance_km`;
        where.push(`w.lat IS NOT NULL AND w.lng IS NOT NULL AND ${dist} <= ${radiusKm}`);
        orderBy = "distance_km ASC, w.created_at DESC";
    }

    params.push(Math.min(Number(limit) || 100, 300));

    const rows = await db.query(
        `SELECT w.id, w.catalog_product_id, w.max_price, w.quantity, w.note, w.lat, w.lng, w.created_at,
                c.name, c.number, c.image_url, c.market_price, c.game, s.name AS set_name,
                ${distanceSelect}
         FROM mkt_want w
         JOIN tcg_cards c ON c.id = w.catalog_product_id
         JOIN tcg_sets s ON s.id = c.set_id
         WHERE ${where.join(" AND ")}
         ORDER BY ${orderBy}
         LIMIT $${params.length}`,
        params
    );

    return rows.map((row) => ({
        id: row.id,
        catalogProductId: String(row.catalog_product_id),
        name: row.name,
        setName: row.set_name,
        number: row.number,
        game: row.game,
        imageUrl: row.image_url,
        marketPrice: row.market_price === null ? null : Number(row.market_price),
        maxPrice: row.max_price === null ? null : Number(row.max_price),
        quantity: Number(row.quantity) || 1,
        note: row.note || null,
        lat: row.lat === null ? null : Number(row.lat),
        lng: row.lng === null ? null : Number(row.lng),
        distanceKm: row.distance_km === null ? null : Number(row.distance_km),
        createdAt: row.created_at,
    }));
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
