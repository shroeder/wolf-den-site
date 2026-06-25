import { NextResponse } from "next/server";

import { requireAdminAppPermission } from "@/lib/admin-app/auth";
import { upsertIntegration } from "@/lib/admin-app/integrations";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

function plaidBaseUrl() {
    const env = (process.env.PLAID_ENV || "production").trim().toLowerCase();
    return `https://${env}.plaid.com`;
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin-app/integrations/plaid/exchange", async ({ logger, internalError }) => {
        const gate = await requireAdminAppPermission(request, "banking.view", logger);

        if (gate.response) {
            return gate.response;
        }

        const clientId = process.env.PLAID_CLIENT_ID || "";
        const secret = process.env.PLAID_SECRET || "";

        if (!clientId || !secret) {
            return NextResponse.json({ error: "plaid_not_configured" }, { status: 502 });
        }

        let body;

        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: "invalid_json" }, { status: 400 });
        }

        const publicToken = typeof body?.publicToken === "string" ? body.publicToken : body?.public_token;

        if (!publicToken) {
            return NextResponse.json({ error: "missing_public_token" }, { status: 400 });
        }

        const storeId = gate.session.user.storeId;

        try {
            const response = await fetch(`${plaidBaseUrl()}/item/public_token/exchange`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ client_id: clientId, secret, public_token: publicToken }),
            });

            const data = await response.json();

            if (!response.ok || !data.access_token) {
                logger.error("admin_app.integrations.plaid.exchange.failed", new Error(data?.error_code || "exchange_failed"), { storeId });
                return NextResponse.json({ error: "plaid_exchange_failed" }, { status: 502 });
            }

            await upsertIntegration(storeId, "plaid", {
                credentialObject: { access_token: data.access_token },
                metadata: { item_id: data.item_id || null },
                status: "connected",
            });

            logger.info("admin_app.integrations.plaid.exchange.connected", { storeId });

            // The access token is intentionally NOT returned to the client.
            return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin_app.integrations.plaid.exchange.failure" });
        }
    });
}
