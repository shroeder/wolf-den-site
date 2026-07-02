import { NextResponse } from "next/server";

import { authenticateBuyer, createBuyerSession } from "@/lib/marketplace/buyer-session.js";
import { createVendorSession } from "@/lib/marketplace/vendor-session.js";
import { authenticateVendor } from "@/lib/marketplace/vendors.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

// Unified login for the phone app: one email + password. We try the vendor (seller) credentials
// first — an approved vendor logs in with the SAME email/password as the web portal and gets the
// seller experience ("unlocked"). Otherwise we fall back to a buyer account. New signups are buyers;
// becoming a seller is the separate vendor application/approval flow.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/auth/login", async ({ logger, internalError }) => {
        try {
            const body = await request.json().catch(() => ({}));
            const email = body.email;
            const password = body.password;

            // Seller path — same credentials as the web vendor portal.
            const vendor = await authenticateVendor(email, password);
            if (vendor) {
                const { token, expiresAt } = await createVendorSession(vendor.id, { deviceLabel: "app" });
                logger.info("marketplace.auth.login", { role: "vendor", vendorId: vendor.id });
                return NextResponse.json({
                    ok: true,
                    token,
                    expiresAt,
                    role: "vendor",
                    vendor: { id: vendor.id, displayName: vendor.displayName, email: vendor.email },
                });
            }

            // Buyer path.
            const buyer = await authenticateBuyer(email, password);
            if (buyer) {
                const { token, expiresAt } = await createBuyerSession(buyer.id, { deviceLabel: "app" });
                logger.info("marketplace.auth.login", { role: "buyer", buyerId: buyer.id });
                return NextResponse.json({ ok: true, token, expiresAt, role: "buyer", buyer });
            }

            return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
        } catch (error) {
            return internalError(error, { event: "marketplace.auth.login.failure" });
        }
    });
}
