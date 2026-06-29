import { NextResponse } from "next/server";

import { autocompleteInStock } from "@/lib/marketplace/search.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/autocomplete", async ({ logger, internalError }) => {
        try {
            const { searchParams } = new URL(request.url);
            const query = searchParams.get("q") || "";
            const game = searchParams.get("game") || null;

            const results = await autocompleteInStock({ query, game });

            logger.info("marketplace.autocomplete.success", { resultCount: results.length });

            return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.autocomplete.failure" });
        }
    });
}
