import { NextResponse } from "next/server";

import { listDealerInventory } from "@/lib/marketplace/listings.js";
import { getAuthenticatedVendor } from "@/lib/marketplace/vendor-session.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

// Dealer-to-dealer sourcing: other vendors' dealer-available inventory a logged-in vendor can buy/swap.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/vendor/dealer-inventory", async ({ internalError }) => {
        try {
            const vendor = await getAuthenticatedVendor();
            if (!vendor) {
                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }

            const { searchParams } = new URL(request.url);
            const listings = await listDealerInventory({
                excludeVendorId: vendor.id,
                query: searchParams.get("q") || "",
                game: searchParams.get("game") || null,
            });

            return NextResponse.json({ listings }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.vendor.dealer_inventory.failure" });
        }
    });
}
