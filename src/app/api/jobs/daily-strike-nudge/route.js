import { NextResponse } from "next/server";

import { runDailyStrikeNudge } from "@/lib/marketplace/boss.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request) {
    const expected = process.env.CRON_SECRET;
    if (!expected) return false;
    return (request.headers.get("authorization") || "") === `Bearer ${expected}`;
}

// Once a day (late afternoon store-local): nudge opted-in members who still have their daily boss strike
// waiting, so the ~half of active players who forget it get a friendly reminder.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/jobs/daily-strike-nudge", async ({ logger, internalError }) => {
        try {
            if (!isAuthorized(request)) {
                logger.warn("daily_strike_nudge.unauthorized");
                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }
            return NextResponse.json({ success: true, ...(await runDailyStrikeNudge()) });
        } catch (error) {
            return internalError(error, { event: "daily_strike_nudge.run.failure" });
        }
    });
}
