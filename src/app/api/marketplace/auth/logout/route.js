import { NextResponse } from "next/server";

import { clearBuyerSessionCookie, getBuyerSessionToken, revokeBuyerSession } from "@/lib/marketplace/buyer-session.js";
import { revokeVendorSession } from "@/lib/marketplace/vendor-session.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

// Revoke the current session (app bearer or web cookie) and clear the web cookie.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/auth/logout", async ({ internalError }) => {
        try {
            const token = await getBuyerSessionToken();
            if (token) {
                await revokeBuyerSession(token).catch(() => {});
                await revokeVendorSession(token).catch(() => {});
            }
            await clearBuyerSessionCookie().catch(() => {});
            return NextResponse.json({ ok: true });
        } catch (error) {
            return internalError(error, { event: "marketplace.auth.logout.failure" });
        }
    });
}
