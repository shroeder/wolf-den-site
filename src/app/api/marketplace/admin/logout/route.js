import { NextResponse } from "next/server";

import { revokeAdminAppSession } from "@/lib/admin-app/session";
import { clearAdminWebSessionCookie, getAdminWebSessionToken } from "@/lib/admin-app/web-session";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/admin/logout", async ({ logger, internalError }) => {
        try {
            const token = await getAdminWebSessionToken();

            if (token) {
                await revokeAdminAppSession(token);
            }

            await clearAdminWebSessionCookie();
            logger.info("marketplace.admin.logout.success");

            return NextResponse.json({ ok: true });
        } catch (error) {
            return internalError(error, { event: "marketplace.admin.logout.failure" });
        }
    });
}
