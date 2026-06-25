import { NextResponse } from "next/server";

import { requireAdminAppPermission } from "@/lib/admin-app/auth";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

function plaidBaseUrl() {
    const env = (process.env.PLAID_ENV || "production").trim().toLowerCase();
    return `https://${env}.plaid.com`;
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin-app/integrations/plaid/link-token", async ({ logger, internalError }) => {
        const gate = await requireAdminAppPermission(request, "banking.view", logger);

        if (gate.response) {
            return gate.response;
        }

        const clientId = process.env.PLAID_CLIENT_ID || "";
        const secret = process.env.PLAID_SECRET || "";

        if (!clientId || !secret) {
            return NextResponse.json({ error: "plaid_not_configured" }, { status: 502 });
        }

        const storeId = gate.session.user.storeId;

        try {
            const response = await fetch(`${plaidBaseUrl()}/link/token/create`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    client_id: clientId,
                    secret,
                    client_name: "Wolf Den Admin",
                    user: { client_user_id: storeId },
                    products: ["transactions"],
                    country_codes: ["US"],
                    language: "en",
                }),
            });

            const data = await response.json();

            if (!response.ok || !data.link_token) {
                logger.error("admin_app.integrations.plaid.link_token.failed", new Error(data?.error_code || "link_token_failed"), { storeId });
                return NextResponse.json({ error: "plaid_link_token_failed" }, { status: 502 });
            }

            return NextResponse.json({ linkToken: data.link_token }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin_app.integrations.plaid.link_token.failure" });
        }
    });
}
