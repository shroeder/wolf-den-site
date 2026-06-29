import { NextResponse } from "next/server";

import { searchCatalog } from "@/lib/marketplace/search.js";
import { getAuthenticatedVendor } from "@/lib/marketplace/vendor-session.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/vendor/catalog-search", async ({ logger, internalError }) => {
        try {
            const vendor = await getAuthenticatedVendor();

            if (!vendor) {
                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }

            const { searchParams } = new URL(request.url);
            const results = await searchCatalog({
                query: searchParams.get("q") || "",
                game: searchParams.get("game") || null,
            });

            logger.info("marketplace.vendor.catalog_search.success", { resultCount: results.length });

            return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.vendor.catalog_search.failure" });
        }
    });
}
