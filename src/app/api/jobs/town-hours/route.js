import { NextResponse } from "next/server";

import { runTownHoursTick } from "@/lib/marketplace/town-events.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function isAuthorized(request) {
    const expected = process.env.CRON_SECRET;
    if (!expected) return false;
    return (request.headers.get("authorization") || "") === `Bearer ${expected}`;
}

// Every ~15 min: when the shop has just opened, auto-spawn a Town event + push everyone. No-op unless
// TOWN_EVENTS_LIVE is set (owner-gated build) and the store just opened.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/jobs/town-hours", async ({ logger, internalError }) => {
        try {
            if (!isAuthorized(request)) {
                logger.warn("town_hours.unauthorized");
                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }
            return NextResponse.json({ success: true, ...(await runTownHoursTick()) });
        } catch (error) {
            return internalError(error, { event: "town_hours.run.failure" });
        }
    });
}
