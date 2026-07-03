import "server-only";

import { cookies, headers } from "next/headers";

import { db } from "@/lib/db";

// Record one passive engagement event, tagged with the anonymous visitor id (cookie for web, an
// x-mkt-vid header for the native app) and coarse Vercel edge geo. Never throws — analytics must not
// break a request. Call it from route handlers, ideally via `after()` so it runs post-response.
export async function recordEngagement(kind, { catalogProductId = null, searchTerm = null } = {}) {
    try {
        const h = await headers();
        const c = await cookies();
        const vid = h.get("x-mkt-vid") || c.get("mkt_vid")?.value || null;
        const cityRaw = h.get("x-vercel-ip-city");
        await db.query(
            `INSERT INTO mkt_engagement (visitor_id, kind, catalog_product_id, search_term, country, region, city)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
                vid ? String(vid).slice(0, 80) : null,
                String(kind).slice(0, 24),
                catalogProductId ? Number(catalogProductId) || null : null,
                searchTerm ? String(searchTerm).slice(0, 120) : null,
                h.get("x-vercel-ip-country") || null,
                h.get("x-vercel-ip-country-region") || null,
                cityRaw ? decodeURIComponent(cityRaw) : null,
            ]
        );
    } catch {
        // swallow — engagement logging is best-effort
    }
}
