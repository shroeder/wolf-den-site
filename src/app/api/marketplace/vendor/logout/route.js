import { NextResponse } from "next/server";

import { clearBuyerSessionCookie, getBuyerSessionToken, revokeBuyerSession } from "@/lib/marketplace/buyer-session.js";
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

            // Unified login: a vendor is usually authenticated via their ACCOUNT session, not the legacy
            // vendor cookie. Clearing only the vendor cookie left them signed in (the account session
            // still resolves to the vendor), so sign out of the account too.
            const accountToken = await getBuyerSessionToken();
            if (accountToken) {
                await revokeBuyerSession(accountToken);
            }
            await clearBuyerSessionCookie();

            logger.info("marketplace.vendor.logout.success");

            return NextResponse.json({ ok: true });
        } catch (error) {
            return internalError(error, { event: "marketplace.vendor.logout.failure" });
        }
    });
}
