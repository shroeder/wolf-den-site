import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { unreadCountForBuyer, unreadCountForVendor } from "@/lib/marketplace/messaging.js";
import { getAuthenticatedVendor } from "@/lib/marketplace/vendor-session.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Total unread messages for the caller across both roles (buyer + vendor), for the app/portal badge.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/threads/unread", async ({ internalError }) => {
        try {
            const [buyer, vendor] = await Promise.all([getAuthenticatedBuyer(), getAuthenticatedVendor()]);
            if (!buyer && !vendor) {
                return NextResponse.json({ unread: 0 }, { headers: { "Cache-Control": "no-store" } });
            }
            const [b, v] = await Promise.all([
                buyer ? unreadCountForBuyer(buyer.id) : 0,
                vendor ? unreadCountForVendor(vendor.id) : 0,
            ]);
            return NextResponse.json({ unread: (b || 0) + (v || 0) }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.threads.unread.failure" });
        }
    });
}
