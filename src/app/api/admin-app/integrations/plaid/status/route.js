import { NextResponse } from "next/server";

import { requireAdminAppPermission } from "@/lib/admin-app/auth";
import { getDecryptedCredential } from "@/lib/admin-app/integrations";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin-app/integrations/plaid/status", async ({ logger, internalError }) => {
        const gate = await requireAdminAppPermission(request, "banking.view", logger);

        if (gate.response) {
            return gate.response;
        }

        try {
            const integration = await getDecryptedCredential(gate.session.user.storeId, "plaid");
            const connected = Boolean(integration?.status === "connected" && integration?.credential?.access_token);

            return NextResponse.json(
                {
                    connected,
                    status: integration?.status || "disconnected",
                    itemId: integration?.metadata?.item_id || null,
                },
                { headers: { "Cache-Control": "no-store" } }
            );
        } catch (error) {
            return internalError(error, { event: "admin_app.integrations.plaid.status.failure" });
        }
    });
}
