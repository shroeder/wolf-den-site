import "server-only";

import { db } from "@/lib/db";
import { createServerLogger } from "@/lib/server-logger";

// Marketplace listings: one row per item a vendor has for sale. The vendor sets the price (the
// platform never computes value). `catalog_product_id` links to tcg_cards when matched, but the
// display fields are snapshotted so a listing survives catalog churn / unmatched CSV imports.

const listingsLogger = createServerLogger({ source: "api", subsystem: "marketplace-listings" });

const VALID_KINDS = new Set(["sealed", "single"]);
const VALID_CONDITIONS = new Set(["NM", "LP", "MP", "HP", "DMG"]);
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const LISTING_COLUMNS = `id, vendor_id, kind, catalog_product_id, game, title, set_name,
    card_number, image_url, condition, graded, grading_company, grade, price, quantity, status,
    created_at, updated_at`;

function toIso(value) {
    return value ? new Date(value).toISOString() : null;
}

function toNumber(value) {
    return value !== null && value !== undefined ? Number(value) : null;
}

export function isValidKind(kind) {
    return VALID_KINDS.has(kind);
}

export function isValidCondition(condition) {
    return condition === null || condition === undefined || VALID_CONDITIONS.has(condition);
}

function mapListing(row) {
    if (!row) {
        return null;
    }

    const listing = {
        id: row.id,
        vendorId: row.vendor_id,
        kind: row.kind,
        catalogProductId: row.catalog_product_id !== null && row.catalog_product_id !== undefined
            ? String(row.catalog_product_id)
            : null,
        game: row.game,
        title: row.title,
        setName: row.set_name,
        cardNumber: row.card_number,
        imageUrl: row.image_url,
        condition: row.condition,
        graded: Boolean(row.graded),
        gradingCompany: row.grading_company,
        grade: row.grade,
        price: toNumber(row.price),
        quantity: row.quantity,
        status: row.status,
        createdAt: toIso(row.created_at),
        updatedAt: toIso(row.updated_at),
    };

    // Present only when a query joined the vendor / catalog (search + detail views).
    if (row.vendor_name !== undefined) {
        listing.vendor = {
            id: row.vendor_id,
            displayName: row.vendor_name,
            locationLabel: row.location_label,
            region: row.vendor_region,
        };
    }

    if (row.catalog_market_price !== undefined) {
        listing.catalogMarketPrice = toNumber(row.catalog_market_price);
    }

    return listing;
}

export async function createListing({
    vendorId,
    kind,
    catalogProductId = null,
    game = null,
    title,
    setName = null,
    cardNumber = null,
    imageUrl = null,
    condition = null,
    graded = false,
    gradingCompany = null,
    grade = null,
    price,
    quantity = 1,
}) {
    if (!isValidKind(kind)) {
        throw new Error(`Invalid listing kind: ${kind}`);
    }

    // Grading only applies to singles. A graded single uses company + grade (no condition); a raw
    // single uses condition; sealed uses none of these.
    const isGraded = kind === "single" && Boolean(graded);
    const rawCondition = kind === "single" && !isGraded ? condition : null;

    if (!isValidCondition(rawCondition)) {
        throw new Error(`Invalid condition: ${condition}`);
    }

    const row = await db.queryOne(
        `INSERT INTO mkt_listing
            (vendor_id, kind, catalog_product_id, game, title, set_name, card_number,
             image_url, condition, graded, grading_company, grade, price, quantity)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING ${LISTING_COLUMNS}`,
        [
            vendorId,
            kind,
            catalogProductId,
            game,
            String(title || "").trim(),
            setName,
            cardNumber,
            imageUrl,
            rawCondition,
            isGraded,
            isGraded ? (gradingCompany ? String(gradingCompany).trim() : null) : null,
            isGraded ? (grade ? String(grade).trim() : null) : null,
            price,
            quantity,
        ]
    );

    listingsLogger.info("marketplace.listing.created", {
        step: "listing_created",
        listingId: row.id,
        vendorId,
        kind,
    });

    return mapListing(row);
}

// Patch a vendor's own listing. Vendor-scoped so one vendor can't edit another's row.
export async function updateListing(id, vendorId, patch = {}) {
    const allowed = {
        title: "title",
        setName: "set_name",
        cardNumber: "card_number",
        imageUrl: "image_url",
        condition: "condition",
        graded: "graded",
        gradingCompany: "grading_company",
        grade: "grade",
        price: "price",
        quantity: "quantity",
        game: "game",
        catalogProductId: "catalog_product_id",
    };

    const sets = [];
    const params = [id, vendorId];

    for (const [key, column] of Object.entries(allowed)) {
        if (patch[key] !== undefined) {
            params.push(patch[key]);
            sets.push(`${column} = $${params.length}`);
        }
    }

    if (sets.length === 0) {
        return getListingById(id);
    }

    const row = await db.queryOne(
        `UPDATE mkt_listing
         SET ${sets.join(", ")}, updated_at = NOW()
         WHERE id = $1 AND vendor_id = $2 AND status = 'active'
         RETURNING ${LISTING_COLUMNS}`,
        params
    );

    return mapListing(row);
}

// Soft delete (status -> 'deleted'). Vendor-scoped.
export async function deleteListing(id, vendorId) {
    const row = await db.queryOne(
        `UPDATE mkt_listing
         SET status = 'deleted', updated_at = NOW()
         WHERE id = $1 AND vendor_id = $2 AND status = 'active'
         RETURNING ${LISTING_COLUMNS}`,
        [id, vendorId]
    );

    return mapListing(row);
}

export async function getListingById(id) {
    const row = await db.queryOne(
        `SELECT ${aliasedListingColumns("l")},
                v.display_name AS vendor_name, v.location_label, v.region AS vendor_region,
                c.market_price AS catalog_market_price
         FROM mkt_listing l
         JOIN mkt_vendor v ON v.id = l.vendor_id
         LEFT JOIN tcg_cards c ON c.id = l.catalog_product_id
         WHERE l.id = $1`,
        [id]
    );

    return mapListing(row);
}

export async function listVendorListings(vendorId, { includeDeleted = false } = {}) {
    const rows = await db.query(
        `SELECT ${LISTING_COLUMNS}
         FROM mkt_listing
         WHERE vendor_id = $1 ${includeDeleted ? "" : "AND status = 'active'"}
         ORDER BY created_at DESC`,
        [vendorId]
    );

    return rows.map(mapListing);
}

// Public buyer-facing search. Only active listings from active vendors. Optional filters: free-text
// title, game, kind, vendor region. Joins vendor location + catalog market price for display.
export async function searchListings({
    query = null,
    game = null,
    kind = null,
    region = null,
    limit = DEFAULT_LIMIT,
    offset = 0,
} = {}) {
    const where = ["l.status = 'active'", "v.status = 'active'"];
    const params = [];

    if (query) {
        params.push(`%${query}%`);
        where.push(`l.title ILIKE $${params.length}`);
    }

    if (game) {
        params.push(game);
        where.push(`l.game = $${params.length}`);
    }

    if (kind && isValidKind(kind)) {
        params.push(kind);
        where.push(`l.kind = $${params.length}`);
    }

    if (region) {
        params.push(region);
        where.push(`v.region ILIKE $${params.length}`);
    }

    params.push(Math.min(Number(limit) || DEFAULT_LIMIT, MAX_LIMIT));
    const limitParam = params.length;
    params.push(Math.max(Number(offset) || 0, 0));
    const offsetParam = params.length;

    const rows = await db.query(
        `SELECT ${aliasedListingColumns("l")},
                v.display_name AS vendor_name, v.location_label, v.region AS vendor_region,
                c.market_price AS catalog_market_price
         FROM mkt_listing l
         JOIN mkt_vendor v ON v.id = l.vendor_id
         LEFT JOIN tcg_cards c ON c.id = l.catalog_product_id
         WHERE ${where.join(" AND ")}
         ORDER BY l.created_at DESC
         LIMIT $${limitParam} OFFSET $${offsetParam}`,
        params
    );

    return rows.map(mapListing);
}

// LISTING_COLUMNS qualified with a table alias (for the joined queries).
function aliasedListingColumns(alias) {
    return LISTING_COLUMNS.split(",")
        .map((col) => `${alias}.${col.trim()}`)
        .join(", ");
}
