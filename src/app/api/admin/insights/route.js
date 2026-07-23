import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { siteInsights } from "@/lib/marketplace/insights.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Engagement / funnel / retention insights for the admin Insights dashboard.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/insights", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const data = await siteInsights();
            return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.insights.failure" });
        }
    });
}
