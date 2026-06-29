import { NextResponse } from "next/server";

import { authenticateVendor } from "@/lib/marketplace/vendors.js";
import { createVendorSession, setVendorSessionCookie } from "@/lib/marketplace/vendor-session.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/vendor/login", async ({ logger, internalError }) => {
        try {
            const body = await request.json().catch(() => null);
            const email = typeof body?.email === "string" ? body.email.trim() : "";
            const password = typeof body?.password === "string" ? body.password : "";

            if (!email || !password) {
                return NextResponse.json({ error: "Enter your email and password." }, { status: 400 });
            }

            const vendor = await authenticateVendor(email, password);

            if (!vendor) {
                logger.warn("marketplace.vendor.login.failed");
                return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
            }

            const { token } = await createVendorSession(vendor.id, { deviceLabel: "web" });
            await setVendorSessionCookie(token);

            logger.info("marketplace.vendor.login.success", { vendorId: vendor.id });

            return NextResponse.json({ ok: true, vendor: { displayName: vendor.displayName } });
        } catch (error) {
            return internalError(error, { event: "marketplace.vendor.login.failure" });
        }
    });
}
