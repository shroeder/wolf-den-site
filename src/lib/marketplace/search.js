import "server-only";

import { db } from "@/lib/db";
import { TCG_GAMES } from "@/lib/tcg-games";

// Buyer-facing reads. Search is CATALOG-CENTRIC: it queries tcg_cards (the daily tcgcsv source of
// truth for what an item is + its market price), restricted to products at least one active vendor
// has in stock — there's no point surfacing items nobody is selling. Selecting a product shows every
// vendor's offer for it.

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const AUTOCOMPLETE_LIMIT = 8;

function toNumber(value) {
    return value !== null && value !== undefined ? Number(value) : null;
}

function toIso(value) {
    return value ? new Date(value).toISOString() : null;
}

// A catalog product that is in stock among vendors (search/autocomplete result).
function mapCatalogResult(row) {
    return {
        catalogProductId: String(row.id),
        game: row.game,
        name: row.name,
        setName: row.set_name,
        number: row.number,
        imageUrl: row.image_url,
        marketPrice: toNumber(row.market_price),
        vendorCount: Number(row.vendor_count) || 0,
        minPrice: toNumber(row.min_price),
    };
}

// Shared FROM/JOIN that restricts catalog rows to "in stock among active vendors".
const IN_STOCK_FROM = `
    FROM tcg_cards c
    JOIN tcg_sets s ON s.id = c.set_id
    JOIN mkt_listing l ON l.catalog_product_id = c.id AND l.status = 'active'
    JOIN mkt_vendor v ON v.id = l.vendor_id AND v.status = 'active'`;

const IN_STOCK_SELECT = `
    SELECT c.id, c.game, c.name, c.number, c.image_url, c.market_price,
           s.name AS set_name,
           COUNT(DISTINCT l.vendor_id) AS vendor_count,
           MIN(l.price) AS min_price`;

const IN_STOCK_GROUP = `GROUP BY c.id, s.name`;

// Lightweight typeahead for the search box.
export async function autocompleteInStock({ query, game = null } = {}) {
    const trimmed = String(query || "").trim();

    if (trimmed.length < 2) {
        return [];
    }

    const params = [`%${trimmed}%`];
    let gameClause = "";

    if (game) {
        params.push(game);
        gameClause = `AND c.game = $${params.length}`;
    }

    params.push(AUTOCOMPLETE_LIMIT);

    const rows = await db.query(
        `${IN_STOCK_SELECT}
         ${IN_STOCK_FROM}
         WHERE c.name ILIKE $1 ${gameClause}
         ${IN_STOCK_GROUP}
         ORDER BY c.name ASC
         LIMIT $${params.length}`,
        params
    );

    return rows.map(mapCatalogResult);
}

// Full search results grid. `kind` (sealed|single) filters by what vendors are offering.
export async function searchCatalogInStock({
    query = null,
    game = null,
    kind = null,
    limit = DEFAULT_LIMIT,
    offset = 0,
} = {}) {
    const params = [];
    const filters = [];

    if (query && String(query).trim().length >= 2) {
        params.push(`%${String(query).trim()}%`);
        filters.push(`c.name ILIKE $${params.length}`);
    }

    if (game) {
        params.push(game);
        filters.push(`c.game = $${params.length}`);
    }

    if (kind === "sealed" || kind === "single") {
        params.push(kind);
        filters.push(`l.kind = $${params.length}`);
    }

    const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    params.push(Math.min(Number(limit) || DEFAULT_LIMIT, MAX_LIMIT));
    const limitParam = params.length;
    params.push(Math.max(Number(offset) || 0, 0));
    const offsetParam = params.length;

    const rows = await db.query(
        `${IN_STOCK_SELECT}
         ${IN_STOCK_FROM}
         ${whereClause}
         ${IN_STOCK_GROUP}
         ORDER BY vendor_count DESC, c.name ASC
         LIMIT $${limitParam} OFFSET $${offsetParam}`,
        params
    );

    return rows.map(mapCatalogResult);
}

// Product page: the canonical item (from the catalog) + every active vendor offer, cheapest first.
// Pricing context for a vendor setting a price: the catalog market price plus the lowest active price
// among OTHER vendors (excludeVendorId) and how many are competing. Powers the add-listing helpers.
export async function getProductPricingContext(catalogProductId, excludeVendorId = null) {
    const row = await db.queryOne(
        `SELECT c.market_price,
                MIN(l.price) FILTER (
                    WHERE l.status = 'active' AND v.status = 'active'
                      AND ($2::uuid IS NULL OR l.vendor_id <> $2)
                ) AS lowest_price,
                COUNT(DISTINCT l.vendor_id) FILTER (
                    WHERE l.status = 'active' AND v.status = 'active'
                      AND ($2::uuid IS NULL OR l.vendor_id <> $2)
                ) AS vendor_count
         FROM tcg_cards c
         LEFT JOIN mkt_listing l ON l.catalog_product_id = c.id
         LEFT JOIN mkt_vendor v ON v.id = l.vendor_id
         WHERE c.id = $1
         GROUP BY c.market_price`,
        [catalogProductId, excludeVendorId]
    );

    if (!row) {
        return null;
    }

    return {
        marketPrice: toNumber(row.market_price),
        lowestPrice: toNumber(row.lowest_price),
        vendorCount: Number(row.vendor_count) || 0,
    };
}

export async function getProductWithOffers(catalogProductId) {
    const product = await db.queryOne(
        `SELECT c.id, c.game, c.name, c.number, c.image_url, c.market_price, c.rarity,
                s.name AS set_name
         FROM tcg_cards c
         JOIN tcg_sets s ON s.id = c.set_id
         WHERE c.id = $1`,
        [catalogProductId]
    );

    if (!product) {
        return null;
    }

    const offers = await db.query(
        `SELECT l.id, l.kind, l.condition, l.graded, l.grading_company, l.grade, l.language,
                l.price, l.quantity, l.created_at,
                v.id AS vendor_id, v.display_name AS vendor_name,
                v.location_label, v.region AS vendor_region
         FROM mkt_listing l
         JOIN mkt_vendor v ON v.id = l.vendor_id AND v.status = 'active'
         WHERE l.catalog_product_id = $1 AND l.status = 'active'
         ORDER BY l.price ASC`,
        [catalogProductId]
    );

    return {
        catalogProductId: String(product.id),
        game: product.game,
        name: product.name,
        setName: product.set_name,
        number: product.number,
        rarity: product.rarity,
        imageUrl: product.image_url,
        marketPrice: toNumber(product.market_price),
        offers: offers.map((row) => ({
            listingId: row.id,
            kind: row.kind,
            condition: row.condition,
            graded: Boolean(row.graded),
            gradingCompany: row.grading_company,
            grade: row.grade,
            language: row.language || "English",
            price: toNumber(row.price),
            quantity: row.quantity,
            createdAt: toIso(row.created_at),
            vendor: {
                id: row.vendor_id,
                displayName: row.vendor_name,
                locationLabel: row.location_label,
                region: row.vendor_region,
            },
        })),
    };
}

// Catalog product ids a vendor actually has in stock — the only marketplace product pages worth
// indexing (the catalog has millions of rows; we index only what someone is selling).
export async function listIndexableMarketplaceProductIds() {
    const rows = await db.query(
        `SELECT DISTINCT l.catalog_product_id AS id
         FROM mkt_listing l
         JOIN mkt_vendor v ON v.id = l.vendor_id AND v.status = 'active'
         WHERE l.status = 'active' AND l.catalog_product_id IS NOT NULL`
    );

    return rows.map((row) => String(row.id));
}

// Browse mode: active vendors that actually have inventory, with location for the map + a list.
export async function listVendorsForBrowse() {
    const rows = await db.query(
        `SELECT v.id, v.display_name, v.location_label, v.region, v.city,
                v.latitude, v.longitude,
                COUNT(l.id) FILTER (WHERE l.status = 'active') AS listing_count
         FROM mkt_vendor v
         LEFT JOIN mkt_listing l ON l.vendor_id = v.id
         WHERE v.status = 'active'
         GROUP BY v.id
         HAVING COUNT(l.id) FILTER (WHERE l.status = 'active') > 0
         ORDER BY v.display_name ASC`
    );

    return rows.map((row) => ({
        id: row.id,
        displayName: row.display_name,
        locationLabel: row.location_label,
        region: row.region,
        city: row.city,
        latitude: toNumber(row.latitude),
        longitude: toNumber(row.longitude),
        listingCount: Number(row.listing_count) || 0,
    }));
}

// Games that actually have catalog data, in registry order (drives the dynamic game filters). Read
// from tcg_sets (hundreds of rows) rather than tcg_cards (millions) for speed.
export async function listAvailableGames() {
    const rows = await db.query("SELECT DISTINCT game FROM tcg_sets");
    const present = new Set(rows.map((r) => r.game));

    return TCG_GAMES.filter((g) => present.has(g.slug)).map((g) => ({ slug: g.slug, label: g.label }));
}

// Catalog typeahead for a vendor adding a listing — searches the WHOLE catalog (not restricted to
// in-stock), so a vendor can list anything that exists in tcg_cards.
export async function searchCatalog({ query, game = null, limit = 24 } = {}) {
    const trimmed = String(query || "").trim();

    if (trimmed.length < 2) {
        return [];
    }

    // Multi-term AND search: every word must match somewhere (name, set, collector number, rarity, or
    // set code). So "pikachu surging 58" or "charizard obsidian 125" narrows to the exact card.
    const terms = trimmed.split(/\s+/).filter(Boolean).slice(0, 6);
    const params = [];
    const termClauses = terms.map((term) => {
        params.push(`%${term}%`);
        const p = `$${params.length}`;
        return `(c.name ILIKE ${p} OR s.name ILIKE ${p} OR c.number ILIKE ${p} OR c.rarity ILIKE ${p} OR s.abbreviation ILIKE ${p})`;
    });

    // Whole-query prefix on name, for ranking exact-ish name matches first.
    params.push(`${trimmed}%`);
    const prefixParam = `$${params.length}`;

    let gameClause = "";
    if (game) {
        params.push(game);
        gameClause = `AND c.game = $${params.length}`;
    }

    params.push(Math.min(Number(limit) || 24, 50));
    const limitParam = `$${params.length}`;

    // Drop worthless "Code Card" / "[Set of N]" entries; rank name-prefix matches first, then by
    // market value (so real product beats filler), with bulk case/display/carton units demoted.
    const rows = await db.query(
        `SELECT c.id, c.game, c.name, c.number, c.rarity, c.image_url, c.market_price, s.name AS set_name
         FROM tcg_cards c
         JOIN tcg_sets s ON s.id = c.set_id
         WHERE ${termClauses.join(" AND ")}
           AND c.name NOT ILIKE '%code card%'
           AND c.name NOT ILIKE '%[set of%'
           ${gameClause}
         ORDER BY
           (CASE WHEN c.name ILIKE '% case%' OR c.name ILIKE '% display%' OR c.name ILIKE '% carton%' THEN 1 ELSE 0 END),
           (CASE WHEN c.name ILIKE ${prefixParam} THEN 0 ELSE 1 END),
           c.market_price DESC NULLS LAST,
           c.name ASC
         LIMIT ${limitParam}`,
        params
    );

    return rows.map((row) => ({
        catalogProductId: String(row.id),
        game: row.game,
        name: row.name,
        setName: row.set_name,
        number: row.number,
        rarity: row.rarity,
        imageUrl: row.image_url,
        marketPrice: toNumber(row.market_price),
    }));
}

// A single vendor's public storefront: their info + active listings (cheapest first). Returns null
// if the vendor isn't active.
export async function getVendorStorefront(vendorId) {
    const vendor = await db.queryOne(
        `SELECT id, display_name, location_label, region, city, latitude, longitude,
                created_at, accepted_at
         FROM mkt_vendor
         WHERE id = $1 AND status = 'active'`,
        [vendorId]
    );

    if (!vendor) {
        return null;
    }

    const listings = await db.query(
        `SELECT l.id, l.kind, l.condition, l.graded, l.grading_company, l.grade, l.language,
                l.price, l.quantity, l.catalog_product_id,
                l.title, l.set_name, l.card_number, l.updated_at,
                COALESCE(l.image_url, c.image_url) AS image_url,
                c.market_price
         FROM mkt_listing l
         LEFT JOIN tcg_cards c ON c.id = l.catalog_product_id
         WHERE l.vendor_id = $1 AND l.status = 'active'
         ORDER BY l.price ASC`,
        [vendorId]
    );

    // Objective reputation signals (no star ratings): vetted (active = hand-approved by The Wolf
    // Den), tenure, catalog depth, freshness, and completed sales.
    const lastListedAt = listings.reduce((latest, row) => {
        const t = row.updated_at ? new Date(row.updated_at).getTime() : 0;
        return t > latest ? t : latest;
    }, 0);

    const salesRow = await db.queryOne(
        `SELECT COUNT(*)::int AS count FROM mkt_sale WHERE vendor_id = $1`,
        [vendorId]
    );
    const salesCount = salesRow ? salesRow.count : 0;

    // Funnel-derived signals (close rate, typical response time). Computed here but only meaningful —
    // and only rendered — once a vendor has a few leads, so we never show "0%" on a brand-new vendor.
    const reqRow = await db.queryOne(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE status = 'sold')::int AS sold,
                AVG(EXTRACT(EPOCH FROM (responded_at - created_at)))
                    FILTER (WHERE responded_at IS NOT NULL) AS avg_response_seconds
         FROM mkt_contact_request
         WHERE vendor_id = $1`,
        [vendorId]
    );
    const requestTotal = reqRow ? reqRow.total : 0;
    const closeRate = requestTotal > 0 ? reqRow.sold / requestTotal : null;
    const avgResponseHours =
        reqRow && reqRow.avg_response_seconds != null ? Number(reqRow.avg_response_seconds) / 3600 : null;

    return {
        id: vendor.id,
        displayName: vendor.display_name,
        locationLabel: vendor.location_label,
        region: vendor.region,
        city: vendor.city,
        latitude: toNumber(vendor.latitude),
        longitude: toNumber(vendor.longitude),
        verified: true,
        memberSince: toIso(vendor.accepted_at || vendor.created_at),
        listingCount: listings.length,
        lastListedAt: lastListedAt ? new Date(lastListedAt).toISOString() : null,
        salesCount,
        requestTotal,
        closeRate,
        avgResponseHours,
        listings: listings.map((row) => ({
            listingId: row.id,
            kind: row.kind,
            condition: row.condition,
            graded: Boolean(row.graded),
            gradingCompany: row.grading_company,
            grade: row.grade,
            language: row.language || "English",
            price: toNumber(row.price),
            quantity: row.quantity,
            catalogProductId: row.catalog_product_id ? String(row.catalog_product_id) : null,
            title: row.title,
            setName: row.set_name,
            cardNumber: row.card_number,
            imageUrl: row.image_url,
            marketPrice: toNumber(row.market_price),
        })),
    };
}
