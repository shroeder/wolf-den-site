import { NextResponse } from "next/server";

import { listAgingInventory } from "@/lib/marketplace/listings.js";
import { getAuthenticatedVendor } from "@/lib/marketplace/vendor-session.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

// The signed-in vendor's aging stock (30+ days) with demand context, for the app's Aging view.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/vendor/aging", async ({ internalError }) => {
        try {
            const vendor = await getAuthenticatedVendor();
            if (!vendor) {
                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }
            const aging = await listAgingInventory(vendor.id);
            return NextResponse.json({ aging }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.vendor.aging.failure" });
        }
    });
}
