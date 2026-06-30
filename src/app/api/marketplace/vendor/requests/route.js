import { NextResponse } from "next/server";

import { getVendorRequestStats, listVendorContactRequests } from "@/lib/marketplace/contact.js";
import { getAuthenticatedVendor } from "@/lib/marketplace/vendor-session.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

// The vendor's inbound contact requests + funnel stats.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/vendor/requests", async ({ internalError }) => {
        try {
            const vendor = await getAuthenticatedVendor();

            if (!vendor) {
                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }

            const [requests, stats] = await Promise.all([
                listVendorContactRequests(vendor.id),
                getVendorRequestStats(vendor.id),
            ]);

            return NextResponse.json({ requests, stats }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.vendor.requests_list.failure" });
        }
    });
}
