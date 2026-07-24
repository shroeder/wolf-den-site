import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { getFarmTelemetry } from "@/lib/marketplace/farm-telemetry.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Owner farm/pet telemetry for the admin app: pack-wide pet leveling + owner farm activity.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/farm-telemetry", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const data = await getFarmTelemetry();
            return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.farm_telemetry.failure" });
        }
    });
}
