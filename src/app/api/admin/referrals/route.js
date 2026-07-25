import { NextResponse } from "next/server";

import { verifyAdminApiKey } from "@/lib/admin/admin-auth";
import { withRequestLogging } from "@/lib/server-logger";
import { getReferralAdminStats } from "@/lib/marketplace/referral.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Invite-program telemetry — admin-key gated. Feeds a future admin-app screen: headline totals, the most
// recent joins, and a top-referrer leaderboard, all computed from mkt_buyer with grouped SQL (no N+1).
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/referrals", async ({ logger, internalError }) => {
        const authError = verifyAdminApiKey(request, logger);
        if (authError) return authError;
        try {
            const stats = await getReferralAdminStats();
            return NextResponse.json(stats, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.referrals.get.failure" });
        }
    });
}
