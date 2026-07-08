import "server-only";

import { db } from "@/lib/db";

// Data for the marketplace map: SUPPLY (vendor pins with live inventory counts) and DEMAND
// (clustered engagement points for the heatmap). Public — anonymous, coarse geo only.
export async function getMarketplaceMap({ days = 90 } = {}) {
    const [vendors, demand] = await Promise.all([
        db.query(
            `SELECT v.id, v.display_name, v.latitude, v.longitude, v.location_label, v.region, v.logo_url,
                    COUNT(l.id) FILTER (WHERE l.status = 'active' AND NOT l.vendor_only) AS listing_count
             FROM mkt_vendor v
             LEFT JOIN mkt_listing l ON l.vendor_id = v.id
             WHERE v.status = 'active' AND v.latitude IS NOT NULL AND v.longitude IS NOT NULL
             GROUP BY v.id
             ORDER BY listing_count DESC`,
        ),
        // Cluster demand to a ~0.05° grid (city-block scale) and weight by event count, so the
        // heatmap is smooth and we don't ship thousands of raw points.
        db.query(
            `SELECT round(lat::numeric / 0.05) * 0.05 AS glat,
                    round(lng::numeric / 0.05) * 0.05 AS glng,
                    count(*)::int AS weight
             FROM mkt_engagement
             WHERE lat IS NOT NULL AND lng IS NOT NULL
               AND created_at >= NOW() - ($1 || ' days')::interval
               AND kind IN ('search', 'view', 'want', 'pageview')
             GROUP BY glat, glng
             HAVING count(*) > 0
             ORDER BY weight DESC
             LIMIT 500`,
            [days],
        ),
    ]);

    return {
        vendors: vendors.map((v) => ({
            id: v.id,
            name: v.display_name,
            lat: Number(v.latitude),
            lng: Number(v.longitude),
            locationLabel: v.location_label || v.region || null,
            logoUrl: v.logo_url || null,
            listingCount: Number(v.listing_count) || 0,
        })),
        demand: demand.map((d) => ({ lat: Number(d.glat), lng: Number(d.glng), weight: d.weight })),
    };
}

// What's driving the heat near a point: the products people searched/viewed/wanted, and raw search
// terms. Powers the map's "tap heat" sheet alongside buy orders.
export async function getDemandNear({ lat, lng, radiusKm = 60, days = 90 } = {}) {
    const dist = `(6371 * acos(LEAST(1, cos(radians($1)) * cos(radians(e.lat)) * cos(radians(e.lng) - radians($2)) + sin(radians($1)) * sin(radians(e.lat)))))`;

    const [activityRow, products, searches] = await Promise.all([
        db.query(
            `SELECT count(*)::int AS n
             FROM mkt_engagement e
             WHERE e.lat IS NOT NULL
               AND e.created_at >= NOW() - ($4 || ' days')::interval
               AND ${dist} <= $3`,
            [lat, lng, radiusKm, days]
        ),
        db.query(
            `SELECT e.catalog_product_id, c.name, c.image_url, c.market_price, s.name AS set_name,
                    count(*)::int AS weight
             FROM mkt_engagement e
             JOIN tcg_cards c ON c.id = e.catalog_product_id
             JOIN tcg_sets s ON s.id = c.set_id
             WHERE e.lat IS NOT NULL AND e.catalog_product_id IS NOT NULL
               AND e.created_at >= NOW() - ($4 || ' days')::interval
               AND ${dist} <= $3
             GROUP BY e.catalog_product_id, c.name, c.image_url, c.market_price, s.name
             ORDER BY weight DESC
             LIMIT 20`,
            [lat, lng, radiusKm, days]
        ),
        db.query(
            `SELECT lower(e.search_term) AS term, count(*)::int AS weight
             FROM mkt_engagement e
             WHERE e.lat IS NOT NULL AND e.search_term IS NOT NULL AND btrim(e.search_term) <> ''
               AND e.created_at >= NOW() - ($4 || ' days')::interval
               AND ${dist} <= $3
             GROUP BY lower(e.search_term)
             ORDER BY weight DESC
             LIMIT 10`,
            [lat, lng, radiusKm, days]
        ),
    ]);

    return {
        activity: Number(activityRow[0]?.n) || 0,
        products: products.map((p) => ({
            catalogProductId: String(p.catalog_product_id),
            name: p.name,
            setName: p.set_name,
            imageUrl: p.image_url,
            marketPrice: p.market_price === null ? null : Number(p.market_price),
            weight: Number(p.weight) || 0,
        })),
        searches: cleanSearchTerms(searches),
    };
}

// Typeahead logs a 'search' on every keystroke, so raw terms are noisy prefixes ("lu", "lumo",
// "lumin…"). Drop <3 chars and collapse a term that's just a prefix of a longer kept one.
function cleanSearchTerms(rows) {
    const terms = rows
        .map((r) => ({ term: String(r.term || "").trim(), weight: Number(r.weight) || 0 }))
        .filter((r) => r.term.length >= 3);
    const byLongest = [...terms].sort((a, b) => b.term.length - a.term.length);
    const kept = [];
    for (const t of byLongest) {
        if (!kept.some((k) => k.term.startsWith(t.term))) kept.push(t);
    }
    return kept.sort((a, b) => b.weight - a.weight).slice(0, 8);
}
