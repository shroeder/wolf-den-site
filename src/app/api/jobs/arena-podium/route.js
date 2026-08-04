import { NextResponse } from "next/server";

import { payArenaPodium } from "@/lib/marketplace/arena.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function isAuthorized(request) {
    const expected = process.env.CRON_SECRET;
    if (!expected) return false;
    return (request.headers.get("authorization") || "") === `Bearer ${expected}`;
}

// Nightly: whoever holds first, second and third in the Arena takes a gold, iron and wooden chest. Runs just
// before midnight Central so it pays the standing the day actually ended on rather than an overnight one.
// payArenaPodium claims the day per member before paying, so running this twice cannot pay twice.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/jobs/arena-podium", async ({ logger, internalError }) => {
        try {
            if (!isAuthorized(request)) {
                logger.warn("arena_podium.unauthorized");
                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }
            const res = await payArenaPodium();
            logger.info({ event: "arena_podium.done", step: "paid", count: res?.paid?.length || 0 });
            return NextResponse.json(res);
        } catch (error) {
            return internalError(error, { event: "arena.podium.failure" });
        }
    });
}
