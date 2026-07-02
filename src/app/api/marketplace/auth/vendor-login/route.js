import { NextResponse } from "next/server";

import { createVendorSession } from "@/lib/marketplace/vendor-session.js";
import { authenticateVendor } from "@/lib/marketplace/vendors.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

// Vendor (seller) login from the phone app. Same session tokens as the web, returned as a bearer token.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/auth/vendor-login", async ({ logger, internalError }) => {
        try {
            const body = await request.json().catch(() => ({}));
            const vendor = await authenticateVendor(body.email, body.password);
            if (!vendor) {
                return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
            }
            const { token, expiresAt } = await createVendorSession(vendor.id, { deviceLabel: "app" });
            logger.info("marketplace.vendor.app_login", { vendorId: vendor.id });
            return NextResponse.json({
                ok: true,
                token,
                expiresAt,
                role: "vendor",
                vendor: { id: vendor.id, displayName: vendor.displayName, email: vendor.email },
            });
        } catch (error) {
            return internalError(error, { event: "marketplace.vendor.app_login.failure" });
        }
    });
}
