import { NextResponse } from "next/server";

import { requireAdminAppAuth } from "@/lib/admin-app/auth";
import { getConnectorStatus } from "@/lib/admin-app/integrations";
import { getStorePublic } from "@/lib/admin-app/store-status";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin-app/auth/me", async ({ logger, internalError }) => {
        const auth = await requireAdminAppAuth(request, logger);

        if (auth.response) {
            return auth.response;
        }

        try {
            const { user, effectivePermissions } = auth.session;
            const [store, connectors] = await Promise.all([
                getStorePublic(user.storeId),
                getConnectorStatus(user.storeId),
            ]);

            return NextResponse.json(
                { user, permissions: effectivePermissions, store, connectors },
                { headers: { "Cache-Control": "no-store" } }
            );
        } catch (error) {
            return internalError(error, { event: "admin_app.auth.me.failure" });
        }
    });
}
