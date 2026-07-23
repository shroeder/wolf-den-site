import { NextResponse } from "next/server";

import { runSailingArrivals } from "@/lib/marketplace/sailing.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request) {
    const expected = process.env.CRON_SECRET;
    if (!expected) return false;
    return (request.headers.get("authorization") || "") === `Bearer ${expected}`;
}

// Every ~15 min: push members whose voyage just landed so they come back to dig (once each).
export async function GET(request) {
    return withRequestLogging(request, "GET /api/jobs/sailing-arrivals", async ({ logger, internalError }) => {
        try {
            if (!isAuthorized(request)) {
                logger.warn("sailing_arrivals.unauthorized");
                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }
            return NextResponse.json({ success: true, ...(await runSailingArrivals()) });
        } catch (error) {
            return internalError(error, { event: "sailing_arrivals.run.failure" });
        }
    });
}
