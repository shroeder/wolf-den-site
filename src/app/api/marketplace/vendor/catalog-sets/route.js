import { NextResponse } from "next/server";

import { listCatalogSets } from "@/lib/marketplace/search.js";
import { getAuthenticatedVendor } from "@/lib/marketplace/vendor-session.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

// Sets for a game, to populate the add-listing set selector so a vendor can browse a set by image.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/vendor/catalog-sets", async ({ internalError }) => {
        try {
            const vendor = await getAuthenticatedVendor();
            if (!vendor) {
                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }

            const { searchParams } = new URL(request.url);
            const sets = await listCatalogSets({ game: searchParams.get("game") || null });

            return NextResponse.json({ sets }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.vendor.catalog_sets.failure" });
        }
    });
}
