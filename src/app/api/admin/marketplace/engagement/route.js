import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { getEngagementInsights } from "@/lib/marketplace/admin.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Engagement analytics: unique reach, geography (region/city), demand (top searches), and by-kind.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/marketplace/engagement", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const days = Math.min(Math.max(Number(new URL(request.url).searchParams.get("days")) || 30, 1), 365);
            const engagement = await getEngagementInsights({ days });
            return NextResponse.json({ engagement }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.marketplace.engagement.failure" });
        }
    });
}
