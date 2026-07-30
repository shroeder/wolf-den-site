import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { getTownTelemetry } from "@/lib/marketplace/town-telemetry.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Owner raid/town-event telemetry for the admin app: spawn cadence vs the 1-3/day target, turnout, push reach.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/town-telemetry", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const data = await getTownTelemetry();
            return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.town_telemetry.failure" });
        }
    });
}
