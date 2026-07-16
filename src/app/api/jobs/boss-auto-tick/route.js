import { NextResponse } from "next/server";

import { runBossAutoTick } from "@/lib/marketplace/boss.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request) {
    const expected = process.env.CRON_SECRET;
    if (!expected) return false;
    return (request.headers.get("authorization") || "") === `Bearer ${expected}`;
}

// Hourly: apply the whole pack's passive auto-attack damage to the live boss.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/jobs/boss-auto-tick", async ({ logger, internalError }) => {
        try {
            if (!isAuthorized(request)) {
                logger.warn("boss_auto_tick.unauthorized");
                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }
            return NextResponse.json({ success: true, ...(await runBossAutoTick()) });
        } catch (error) {
            return internalError(error, { event: "boss_auto_tick.run.failure" });
        }
    });
}
