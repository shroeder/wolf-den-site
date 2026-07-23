import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { liveFeed } from "@/lib/marketplace/activity.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Real-time site firehose for the admin "Live Feed" screen. GET ?since=<id> returns only events newer than
// the last one the client saw (for incremental polling); omit `since` for the initial page. ?limit caps rows.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/live-feed", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const params = new URL(request.url).searchParams;
            const sinceRaw = params.get("since");
            const sinceId = sinceRaw && /^\d+$/.test(sinceRaw) ? sinceRaw : null;
            const limit = Number(params.get("limit")) || 60;
            const data = await liveFeed({ sinceId, limit });
            return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.live_feed.failure" });
        }
    });
}
