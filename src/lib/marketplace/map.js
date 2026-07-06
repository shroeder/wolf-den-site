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
