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

            const results = await searchCatalogInStock({ query, game, kind, limit, offset });

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
