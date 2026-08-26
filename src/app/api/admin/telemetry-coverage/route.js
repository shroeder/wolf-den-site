import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { getTelemetryCoverage } from "@/lib/marketplace/telemetry-coverage.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Which parts of the game we can actually see: the declared system registry joined against what really landed
// in mkt_activity_event, plus the systems that emit nothing at all. See telemetry-coverage.js — and note that
// `npm run check:telemetry` is what keeps the registry honest. GET ?days=7|30|90. Read-only.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/telemetry-coverage", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const days = Number(new URL(request.url).searchParams.get("days")) || 30;
            const data = await getTelemetryCoverage({ days });
            return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.telemetry_coverage.failure" });
        }
    });
}
