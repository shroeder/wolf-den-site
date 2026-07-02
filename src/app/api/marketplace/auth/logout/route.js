import { NextResponse } from "next/server";

import { getBearerToken, revokeBuyerSession } from "@/lib/marketplace/buyer-session.js";
import { revokeVendorSession } from "@/lib/marketplace/vendor-session.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

// Revoke the current app session (whichever kind it is).
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/auth/logout", async ({ internalError }) => {
        try {
            const token = await getBearerToken();
            if (token) {
                await revokeBuyerSession(token).catch(() => {});
                await revokeVendorSession(token).catch(() => {});
            }
            return NextResponse.json({ ok: true });
        } catch (error) {
            return internalError(error, { event: "marketplace.auth.logout.failure" });
        }
    });
}
