import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { getCasinoReport } from "@/lib/marketplace/casino-report.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// What the casino floor is actually doing, in the two currencies it moves: COIN SPENT and CHIPS WON, never
// netted against each other. Per game, per cabinet, per member, plus where the chips came from — pay line or
// bonus — and what leaves through the Counter. Read off the coin and chip ledgers rather than the activity
// feed, which did not exist for the floor's first five days; see casino-report.js.
//
// Tapping a member goes to /api/admin/casino/player for the same numbers one level down.
// GET ?days=1|7|30. Read-only.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/casino", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const days = Number(new URL(request.url).searchParams.get("days")) || 7;
            const data = await getCasinoReport({ days });
            return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.casino.failure" });
        }
    });
}
