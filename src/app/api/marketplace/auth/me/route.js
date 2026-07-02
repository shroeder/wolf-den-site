import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getAuthenticatedVendor } from "@/lib/marketplace/vendor-session.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

// Resolve the current bearer token to a buyer or vendor identity (app session bootstrap).
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/auth/me", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (buyer) {
                return NextResponse.json({ role: "buyer", buyer }, { headers: { "Cache-Control": "no-store" } });
            }
            const vendor = await getAuthenticatedVendor();
            if (vendor) {
                return NextResponse.json(
                    { role: "vendor", vendor: { id: vendor.id, displayName: vendor.displayName, email: vendor.email } },
                    { headers: { "Cache-Control": "no-store" } }
                );
            }
            return NextResponse.json({ error: "unauthorized" }, { status: 401 });
        } catch (error) {
            return internalError(error, { event: "marketplace.auth.me.failure" });
        }
    });
}
