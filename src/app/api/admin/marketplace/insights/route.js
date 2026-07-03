import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { getMarketplaceInsights } from "@/lib/marketplace/admin.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Marketplace insights: live stats, most-wanted (unmet demand), search demand (coverage gaps),
// contact→sale funnel, and vendor responsiveness leaderboard.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/marketplace/insights", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const insights = await getMarketplaceInsights();
            return NextResponse.json({ insights }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.marketplace.insights.failure" });
        }
    });
}
