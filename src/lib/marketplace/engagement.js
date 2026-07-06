import "server-only";

import { cookies, headers } from "next/headers";

import { db } from "@/lib/db";

// Record one passive engagement event, tagged with the anonymous visitor id (cookie for web, an
// x-mkt-vid header for the native app) and coarse Vercel edge geo. Never throws — analytics must not
// break a request. Call it from route handlers, ideally via `after()` so it runs post-response.
export async function recordEngagement(kind, { catalogProductId = null, searchTerm = null, path = null, vid: vidOverride = null } = {}) {
    try {
        const h = await headers();
        const c = await cookies();
        const vid = vidOverride || h.get("x-mkt-vid") || c.get("mkt_vid")?.value || null;
        const cityRaw = h.get("x-vercel-ip-city");
        // Approximate (city-level) coordinates from Vercel edge geo, for the demand heatmap.
        const lat = Number(h.get("x-vercel-ip-latitude"));
        const lng = Number(h.get("x-vercel-ip-longitude"));
        await db.query(
            `INSERT INTO mkt_engagement (visitor_id, kind, catalog_product_id, search_term, path, country, region, city, lat, lng)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
                vid ? String(vid).slice(0, 80) : null,
                String(kind).slice(0, 24),
                catalogProductId ? Number(catalogProductId) || null : null,
                searchTerm ? String(searchTerm).slice(0, 120) : null,
                path ? String(path).slice(0, 200) : null,
                h.get("x-vercel-ip-country") || null,
                h.get("x-vercel-ip-country-region") || null,
                cityRaw ? decodeURIComponent(cityRaw) : null,
                Number.isFinite(lat) ? lat : null,
                Number.isFinite(lng) ? lng : null,
            ]
        );
    } catch {
        // swallow — engagement logging is best-effort
    }
}
