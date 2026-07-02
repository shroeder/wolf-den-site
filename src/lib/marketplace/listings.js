import "server-only";

import { db } from "@/lib/db";
import { computeListingPriceNow, PRICING_MODES } from "@/lib/marketplace/reprice.js";
import { notifyWantsForProduct } from "@/lib/marketplace/wants.js";
import { createServerLogger } from "@/lib/server-logger";

// Marketplace listings: one row per item a vendor has for sale. The vendor sets the price (the
// platform never computes value). `catalog_product_id` links to tcg_cards when matched, but the
// display fields are snapshotted so a listing survives catalog churn / unmatched CSV imports.

const listingsLogger = createServerLogger({ source: "api", subsystem: "marketplace-listings" });

const VALID_KINDS = new Set(["sealed", "single"]);
const VALID_CONDITIONS = new Set(["NM", "LP", "MP", "HP", "DMG"]);
// Common TCG print languages. Anything else falls back to English.
export const LISTING_LANGUAGES = [
    "English",
    "Japanese",
    "Chinese (Simplified)",
    "Chinese (Traditional)",
    "Korean",
    "German",
    "French",
    "Italian",
    "Spanish",
    "Portuguese",
    "Russian",
    "Thai",
    "Indonesian",
];
const VALID_LANGUAGES = new Set(LISTING_LANGUAGES);
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const LISTING_COLUMNS = `id, vendor_id, kind, catalog_product_id, game, title, set_name,
    card_number, image_url, condition, graded, grading_company, grade, language, price, quantity,
    pricing_mode, pricing_value, dealer_available, wholesale_price, vendor_only, status, created_at, updated_at`;

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

// Normalize a free-form language to a supported one, defaulting to English.
export function normalizeLanguage(language) {
    const value = String(language || "").trim();
    return VALID_LANGUAGES.has(value) ? value : "English";
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
        language: row.language || "English",
        price: toNumber(row.price),
        quantity: row.quantity,
        pricingMode: row.pricing_mode || "manual",
        pricingValue: toNumber(row.pricing_value),
        dealerAvailable: row.dealer_available === true,
        wholesalePrice: toNumber(row.wholesale_price),
        vendorOnly: row.vendor_only === true,
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
    language = "English",
    price,
    quantity = 1,
    pricingMode = "manual",
    pricingValue = null,
    dealerAvailable = false,
    wholesalePrice = null,
    vendorOnly = false,
}) {
    if (!isValidKind(kind)) {
        throw new Error(`Invalid listing kind: ${kind}`);
    }

    const normalizedWholesale =
        wholesalePrice != null && wholesalePrice !== "" && Number.isFinite(Number(wholesalePrice)) && Number(wholesalePrice) > 0
            ? Number(wholesalePrice)
            : null;

    // Auto-pricing: compute the price from the rule now so it's correct immediately (the nightly job
    // keeps it current afterward). Falls back to the passed price if we can't compute one.
    const mode = PRICING_MODES.has(pricingMode) ? pricingMode : "manual";
    let effectivePrice = price;
    if (mode !== "manual") {
        const computed = await computeListingPriceNow({ catalogProductId, vendorId, mode, value: pricingValue });
        if (computed != null) {
            effectivePrice = computed;
        }
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
             image_url, condition, graded, grading_company, grade, language, price, quantity,
             pricing_mode, pricing_value, dealer_available, wholesale_price, vendor_only)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
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
            normalizeLanguage(language),
            effectivePrice,
            quantity,
            mode,
            mode === "manual" ? null : pricingValue,
            Boolean(dealerAvailable),
            normalizedWholesale,
            Boolean(vendorOnly),
        ]
    );

    listingsLogger.info("marketplace.listing.created", {
        step: "listing_created",
        listingId: row.id,
        vendorId,
        kind,
    });

    // Demand alert: email anyone who asked to be notified when this product gets listed (respecting
    // their price threshold). Skipped for vendor-only (hidden) stock — buyers never see it.
    if (catalogProductId && !vendorOnly) {
        try {
            await notifyWantsForProduct(catalogProductId, effectivePrice);
        } catch (error) {
            listingsLogger.warn("marketplace.listing.want_notify_failed", { listingId: row.id, reason: error.message });
        }
    }

    return mapListing(row);
}

// Patch a vendor's own listing. Vendor-scoped so one vendor can't edit another's row.
export async function updateListing(id, vendorId, patch = {}) {
    // Switching to / adjusting an auto-pricing rule recomputes the price now (then the nightly job maintains it).
    if (patch.pricingMode !== undefined || patch.pricingValue !== undefined) {
        const existing = await getListingById(id);
        if (existing && existing.vendorId === vendorId) {
            const mode = patch.pricingMode !== undefined ? patch.pricingMode : existing.pricingMode;
            const value = patch.pricingValue !== undefined ? patch.pricingValue : existing.pricingValue;
            const normMode = PRICING_MODES.has(mode) ? mode : "manual";
            patch.pricingMode = normMode;
            patch.pricingValue = normMode === "manual" ? null : value;
            if (normMode !== "manual") {
                const computed = await computeListingPriceNow({
                    catalogProductId: existing.catalogProductId,
                    vendorId,
                    mode: normMode,
                    value,
                });
                if (computed != null) patch.price = computed;
            }
        }
    }

    const allowed = {
        title: "title",
        setName: "set_name",
        cardNumber: "card_number",
        imageUrl: "image_url",
        condition: "condition",
        graded: "graded",
        gradingCompany: "grading_company",
        grade: "grade",
        language: "language",
        price: "price",
        quantity: "quantity",
        game: "game",
        catalogProductId: "catalog_product_id",
        pricingMode: "pricing_mode",
        pricingValue: "pricing_value",
        dealerAvailable: "dealer_available",
        wholesalePrice: "wholesale_price",
        vendorOnly: "vendor_only",
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

// Inventory aging: a vendor's active listings sitting 30+ days, with demand context (network wants)
// and dealer-availability, so stale stock surfaces with a suggested action.
export async function listAgingInventory(vendorId) {
    const rows = await db.query(
        `SELECT l.id, l.title, l.set_name, l.price, l.quantity, l.dealer_available,
                (CURRENT_DATE - l.created_at::date) AS age_days,
                (SELECT COUNT(DISTINCT w.email_normalized) FROM mkt_want w
                   WHERE w.catalog_product_id = l.catalog_product_id) AS want_count
         FROM mkt_listing l
         WHERE l.vendor_id = $1 AND l.status = 'active'
           AND l.created_at <= NOW() - INTERVAL '30 days'
         ORDER BY l.created_at ASC
         LIMIT 60`,
        [vendorId]
    );
    return rows.map((r) => ({
        id: r.id,
        title: r.title,
        setName: r.set_name,
        price: r.price != null ? Number(r.price) : null,
        quantity: r.quantity,
        ageDays: Number(r.age_days) || 0,
        dealerAvailable: r.dealer_available === true,
        wantCount: Number(r.want_count) || 0,
    }));
}

// Dealer-to-dealer sourcing: OTHER vendors' listings flagged available to dealers, with wholesale
// price + who's selling. Excludes the requesting vendor's own stock.
export async function listDealerInventory({ excludeVendorId = null, query = "", game = null, limit = 60 } = {}) {
    const params = [];
    // Dealer-facing: both listings opened to dealers and hidden vendor-only (wholesale/overstock) stock.
    const where = ["l.status = 'active'", "(l.dealer_available = TRUE OR l.vendor_only = TRUE)", "v.status = 'active'"];

    if (excludeVendorId) {
        params.push(excludeVendorId);
        where.push(`l.vendor_id <> $${params.length}`);
    }
    if (game) {
        params.push(game);
        where.push(`l.game = $${params.length}`);
    }
    const q = String(query || "").trim();
    if (q.length >= 2) {
        params.push(`%${q}%`);
        where.push(`(l.title ILIKE $${params.length} OR l.set_name ILIKE $${params.length})`);
    }

    params.push(Math.min(Number(limit) || 60, 100));
    const rows = await db.query(
        `SELECT l.id, l.kind, l.title, l.set_name, l.card_number, l.game, l.condition, l.graded,
                l.grading_company, l.grade, l.language, l.price, l.wholesale_price, l.quantity,
                COALESCE(l.image_url, c.image_url) AS image_url,
                v.id AS vendor_id, v.display_name AS vendor_name, v.location_label
         FROM mkt_listing l
         JOIN mkt_vendor v ON v.id = l.vendor_id AND v.status = 'active'
         LEFT JOIN tcg_cards c ON c.id = l.catalog_product_id
         WHERE ${where.join(" AND ")}
         ORDER BY l.updated_at DESC
         LIMIT $${params.length}`,
        params
    );

    return rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        title: r.title,
        setName: r.set_name,
        cardNumber: r.card_number,
        game: r.game,
        condition: r.condition,
        graded: Boolean(r.graded),
        gradingCompany: r.grading_company,
        grade: r.grade,
        language: r.language,
        price: toNumber(r.price),
        wholesalePrice: toNumber(r.wholesale_price),
        quantity: r.quantity,
        imageUrl: r.image_url,
        vendor: { id: r.vendor_id, displayName: r.vendor_name, locationLabel: r.location_label },
    }));
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
    const where = ["l.status = 'active'", "v.status = 'active'", "NOT l.vendor_only"];
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
