import { NextResponse } from "next/server";

import { runCropsReadyNudge } from "@/lib/marketplace/farm-crops.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request) {
    const expected = process.env.CRON_SECRET;
    if (!expected) return false;
    return (request.headers.get("authorization") || "") === `Bearer ${expected}`;
}

// Every ~20 min: push members whose crops just finished growing so they come back to harvest.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/jobs/crops-ready", async ({ logger, internalError }) => {
        try {
            if (!isAuthorized(request)) {
                logger.warn("crops_ready.unauthorized");
                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }
            return NextResponse.json({ success: true, ...(await runCropsReadyNudge()) });
        } catch (error) {
            return internalError(error, { event: "crops_ready.run.failure" });
        }
    });
}
