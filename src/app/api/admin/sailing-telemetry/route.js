import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { getSailingTelemetry } from "@/lib/marketplace/sailing-telemetry.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin sailing telemetry — cross-user summary + per-user breakdown (for the admin app's Sailing screen).
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/sailing-telemetry", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            return NextResponse.json(await getSailingTelemetry(), { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.sailing_telemetry.failure" });
        }
    });
}
