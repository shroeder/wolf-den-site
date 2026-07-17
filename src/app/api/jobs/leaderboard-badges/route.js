import { NextResponse } from "next/server";

import { syncLeaderboardBadges } from "@/lib/marketplace/badges.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request) {
    const expected = process.env.CRON_SECRET;
    if (!expected) return false;
    return (request.headers.get("authorization") || "") === `Bearer ${expected}`;
}

// Keep the 1st/2nd/3rd place badges reflecting the current leaderboard leaders.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/jobs/leaderboard-badges", async ({ logger, internalError }) => {
        try {
            if (!isAuthorized(request)) {
                logger.warn("leaderboard_badges.unauthorized");
                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }
            return NextResponse.json({ success: true, ...(await syncLeaderboardBadges()) });
        } catch (error) {
            return internalError(error, { event: "leaderboard_badges.run.failure" });
        }
    });
}
