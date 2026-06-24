import { NextResponse } from "next/server";

import { getBearerToken } from "@/lib/admin-app/auth";
import { revokeAdminAppSession } from "@/lib/admin-app/session";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin-app/auth/logout", async ({ logger, internalError }) => {
        try {
            const token = getBearerToken(request);

            if (token) {
                await revokeAdminAppSession(token);
            }

            logger.info("admin_app.auth.logout.success");

            return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin_app.auth.logout.failure" });
        }
    });
}
