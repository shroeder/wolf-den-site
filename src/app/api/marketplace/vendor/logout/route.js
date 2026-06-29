import { NextResponse } from "next/server";

import { clearVendorSessionCookie, getVendorSessionToken, revokeVendorSession } from "@/lib/marketplace/vendor-session.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/vendor/logout", async ({ logger, internalError }) => {
        try {
            const token = await getVendorSessionToken();

            if (token) {
                await revokeVendorSession(token);
            }

            await clearVendorSessionCookie();
            logger.info("marketplace.vendor.logout.success");

            return NextResponse.json({ ok: true });
        } catch (error) {
            return internalError(error, { event: "marketplace.vendor.logout.failure" });
        }
    });
}
