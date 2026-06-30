import { NextResponse } from "next/server";

import { searchCatalog } from "@/lib/marketplace/search.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

// Public full-catalog search (not restricted to in-stock) — used to turn a buyer's dead-end search
// into a "notify me when a vendor lists this" opportunity.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/catalog-search", async ({ logger, internalError }) => {
        try {
            const { searchParams } = new URL(request.url);
            const results = await searchCatalog({
                query: searchParams.get("q") || "",
                game: searchParams.get("game") || null,
                limit: 12,
            });

            logger.info("marketplace.catalog_search.success", { resultCount: results.length });

            return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.catalog_search.failure" });
        }
    });
}
