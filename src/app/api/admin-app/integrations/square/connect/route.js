import { NextResponse } from "next/server";

import { requireAdminAppPermission } from "@/lib/admin-app/auth";
import { buildSquareAuthorizeUrl, createSquareOAuthState, isSquareOAuthConfigured } from "@/lib/admin-app/square-oauth";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin-app/integrations/square/connect", async ({ logger, internalError }) => {
        const gate = await requireAdminAppPermission(request, "staff.manage", logger);

        if (gate.response) {
            return gate.response;
        }

        if (!isSquareOAuthConfigured()) {
            return NextResponse.json({ error: "square_oauth_not_configured" }, { status: 502 });
        }

        try {
            const state = createSquareOAuthState(gate.session.user.storeId);
            const authorizeUrl = buildSquareAuthorizeUrl(state);

            logger.info("admin_app.integrations.square.connect.initiated", { storeId: gate.session.user.storeId });

            return NextResponse.json({ authorizeUrl }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin_app.integrations.square.connect.failure" });
        }
    });
}
