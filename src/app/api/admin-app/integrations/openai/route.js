import { NextResponse } from "next/server";

import { requireAdminAppPermission } from "@/lib/admin-app/auth";
import { getDecryptedCredential, setIntegrationStatus, upsertIntegration } from "@/lib/admin-app/integrations";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin-app/integrations/openai", async ({ logger, internalError }) => {
        const gate = await requireAdminAppPermission(request, "staff.manage", logger);

        if (gate.response) {
            return gate.response;
        }

        try {
            const integration = await getDecryptedCredential(gate.session.user.storeId, "openai");
            const connected = Boolean(integration?.status === "connected" && integration?.credential?.api_key);

            return NextResponse.json(
                { connected, status: integration?.status || "disconnected" },
                { headers: { "Cache-Control": "no-store" } }
            );
        } catch (error) {
            return internalError(error, { event: "admin_app.integrations.openai.status.failure" });
        }
    });
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin-app/integrations/openai", async ({ logger, internalError }) => {
        const gate = await requireAdminAppPermission(request, "staff.manage", logger);

        if (gate.response) {
            return gate.response;
        }

        let body;

        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: "invalid_json" }, { status: 400 });
        }

        const apiKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";

        if (!apiKey.startsWith("sk-")) {
            return NextResponse.json({ error: "invalid_key_format" }, { status: 400 });
        }

        const storeId = gate.session.user.storeId;

        try {
            // Validate the key against OpenAI before storing it.
            const check = await fetch("https://api.openai.com/v1/models?limit=1", {
                headers: { Authorization: `Bearer ${apiKey}` },
            });

            if (!check.ok) {
                logger.warn("admin_app.integrations.openai.invalid_key", { storeId, status: check.status });
                return NextResponse.json({ error: "invalid_key" }, { status: 400 });
            }

            await upsertIntegration(storeId, "openai", {
                credentialObject: { api_key: apiKey },
                status: "connected",
            });

            logger.info("admin_app.integrations.openai.connected", { storeId });

            return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin_app.integrations.openai.connect.failure" });
        }
    });
}

export async function DELETE(request) {
    return withRequestLogging(request, "DELETE /api/admin-app/integrations/openai", async ({ logger, internalError }) => {
        const gate = await requireAdminAppPermission(request, "staff.manage", logger);

        if (gate.response) {
            return gate.response;
        }

        try {
            await setIntegrationStatus(gate.session.user.storeId, "openai", "disconnected");
            return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin_app.integrations.openai.disconnect.failure" });
        }
    });
}
