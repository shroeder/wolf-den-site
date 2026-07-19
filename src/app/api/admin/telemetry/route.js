import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { telemetryDashboard } from "@/lib/marketplace/activity.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?hours=24 — site-wide telemetry: live feed (all users + anonymous) + engagement reports
// (top features, top pages, hourly traffic, totals).
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/telemetry", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const hours = Number(new URL(request.url).searchParams.get("hours")) || 24;
            const data = await telemetryDashboard({ hours });
            return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.telemetry.failure" });
        }
    });
}
