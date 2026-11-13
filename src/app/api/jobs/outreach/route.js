import { NextResponse } from "next/server";

import { runOutreach } from "@/lib/outreach/campaign.js";
import { syncPurchaseLines } from "@/lib/outreach/sync.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorized(request) {
    const expected = process.env.CRON_SECRET;
    if (!expected) return false;
    return (request.headers.get("authorization") || "") === `Bearer ${expected}`;
}

// ── LAPSED-CUSTOMER OUTREACH ─────────────────────────────────────────────────────────────────────────────────
// Luke, 2026-11-13: "depending on when the last time they came in, if it's gone over 2 weeks, we should send
// them a reminder about items we have in store that we think are relevant to them."
//
// ⚠️ THIS ROUTE IS DELIBERATELY NOT IN vercel.json AND MUST NOT BE ADDED THERE YET. Luke, 2026-11-13: "just
// want to reiterate we dont want to send these live yet." Nothing schedules it, so nothing fires it; going
// live is one line in the crons array, added by him, after he has reviewed the examples. The route exists so
// that line is the ONLY thing left to do, not so it can quietly start running.
//
// ⚠️ AND IT REFUSES TO SEND WITHOUT ?apply=1, ON TOP OF THAT. Two locks rather than one, because the thing
// behind this door cannot be taken back: every send burns a member's one-and-only outreach email for ever,
// and an accidental run would spend all 72 of them at once on whatever happened to be in stock that morning.
// A dry run reports exactly what it WOULD have done and writes nothing.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/jobs/outreach", async ({ logger, internalError }) => {
        try {
            if (!isAuthorized(request)) {
                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }
            const { searchParams } = new URL(request.url);
            const apply = searchParams.get("apply") === "1";

            // Cache any baskets bought since the last run first — a profile built on stale purchases would
            // recommend somebody the card they walked in and bought last week.
            const synced = await syncPurchaseLines();
            const result = await runOutreach({ apply });

            logger.info("outreach job", { ...synced, ...result });
            return NextResponse.json({ ok: true, synced, ...result });
        } catch (error) {
            return internalError(error, { event: "outreach.job.failed" });
        }
    });
}
