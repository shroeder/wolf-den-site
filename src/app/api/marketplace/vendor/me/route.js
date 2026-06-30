import { NextResponse } from "next/server";

import { getAuthenticatedVendor } from "@/lib/marketplace/vendor-session.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

// Returns the signed-in vendor (from the cookie) or null — lets public pages adapt to login state.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/vendor/me", async ({ internalError }) => {
        try {
            const vendor = await getAuthenticatedVendor();

            return NextResponse.json(
                { vendor: vendor ? { id: vendor.id, displayName: vendor.displayName } : null },
                { headers: { "Cache-Control": "no-store" } }
            );
        } catch (error) {
            return internalError(error, { event: "marketplace.vendor.me.failure" });
        }
    });
}
