import { NextResponse } from "next/server";

import { getAccountLinkedVendorId, getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getAuthenticatedVendor } from "@/lib/marketplace/vendor-session.js";
import { getVendorById } from "@/lib/marketplace/vendors.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

// Resolve the current app session to an identity + derived role (one account; seller if it has a
// linked active vendor profile, otherwise buyer).
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/auth/me", async ({ internalError }) => {
        try {
            const account = await getAuthenticatedBuyer();
            if (account) {
                const vendorId = await getAccountLinkedVendorId(account.id);
                if (vendorId) {
                    const vendor = await getVendorById(vendorId);
                    return NextResponse.json(
                        {
                            role: "vendor",
                            account,
                            vendor: { id: vendor.id, displayName: vendor.displayName, email: vendor.email },
                        },
                        { headers: { "Cache-Control": "no-store" } }
                    );
                }
                return NextResponse.json({ role: "buyer", buyer: account }, { headers: { "Cache-Control": "no-store" } });
            }

            // Legacy vendor session (web cookie / old vendor-login token).
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
