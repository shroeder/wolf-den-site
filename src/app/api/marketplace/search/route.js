import { after, NextResponse } from "next/server";

import { recordEngagement } from "@/lib/marketplace/engagement.js";
import { searchCatalogInStock } from "@/lib/marketplace/search.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/search", async ({ logger, internalError }) => {
        try {
            const { searchParams } = new URL(request.url);
            const query = searchParams.get("q") || null;
            const game = searchParams.get("game") || null;
            const kind = searchParams.get("kind") || null;
            const limit = searchParams.get("limit") || undefined;
            const offset = searchParams.get("offset") || undefined;
            const sort = searchParams.get("sort") || "relevance";

            // Buyer location for distance/nearest: explicit lat/lng from the app, else Vercel edge geo.
            // Fall back to edge geo ONLY for web. The mobile app sends src=app: on cellular, carrier-IP
            // geolocation lands hundreds of miles away, so the app gets NO distance rather than a wrong
            // one (it supplies real GPS when the user shares location).
            let lat = Number(searchParams.get("lat")) || null;
            let lng = Number(searchParams.get("lng")) || null;
            if ((lat == null || lng == null) && searchParams.get("src") !== "app") {
                lat = Number(request.headers.get("x-vercel-ip-latitude")) || null;
                lng = Number(request.headers.get("x-vercel-ip-longitude")) || null;
            }

            const results = await searchCatalogInStock({ query, game, kind, lat, lng, sort, limit, offset });

            logger.info("marketplace.search.success", { resultCount: results.length });
            if (query && query.trim().length >= 2) {
                after(() => recordEngagement("search", { searchTerm: query }));
            }

            return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.search.failure" });
        }
    });
}
