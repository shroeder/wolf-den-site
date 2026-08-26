import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { getEngagement } from "@/lib/marketplace/engagement-report.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// How much the game is actually being played: who is active, how many visits they make, and how long those
// visits are — sessionised off mkt_activity_event with a gap measured from the data rather than assumed. See
// engagement-report.js for why the gap is ten minutes. GET ?days=1|7|30. Read-only.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/engagement", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const days = Number(new URL(request.url).searchParams.get("days")) || 1;
            const data = await getEngagement({ days });
            return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.engagement.failure" });
        }
    });
}
