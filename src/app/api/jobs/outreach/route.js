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
// ⚠️ LIVE SINCE 2026-11-13. Luke, after reviewing the examples: "I think im fine shipping with this for now."
// Scheduled at 16:00 UTC, which is 10am in Chicago — the other member-facing jobs are tuned the same way
// (recap-digest 17:00 UTC is 11am local), and a marketing email that lands at 3am reads as a robot.
//
// ⚠️ IT STILL REFUSES TO SEND WITHOUT ?apply=1, AND THE CRON PATH CARRIES IT. Being scheduled did not
// remove the second lock: anything that reaches this route by hand, by accident or by a copied URL without
// that parameter does a dry run and writes nothing. Every send burns a member's one-and-only outreach email
// for ever, so the expensive direction keeps needing to be asked for explicitly.

export async function GET(request) {
    return withRequestLogging(request, "GET /api/jobs/outreach", async ({ logger, internalError }) => {
        try {
            if (!isAuthorized(request)) {
                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }
            const { searchParams } = new URL(request.url);
            const apply = searchParams.get("apply") === "1";
            // ── ⚠️ A DAILY CEILING, WHICH IS A DELIVERABILITY RULE AND NOT A COST ONE ──────────────────
            // 74 people are eligible on day one. Mailing all of them in one burst from a domain that
            // normally sends receipts and card alerts is the classic way to get filtered — the volume
            // spike is the signal, not the content. Drained over three mornings it looks like what it is.
            // Luke: "it's important that we don't get people unsubscribing or reporting us as spam."
            const limit = Math.max(1, Math.min(200, Number(searchParams.get("limit")) || 25));

            // Cache any baskets bought since the last run first — a profile built on stale purchases would
            // recommend somebody the card they walked in and bought last week.
            const synced = await syncPurchaseLines();
            const result = await runOutreach({ apply, limit });

            logger.info("outreach job", { ...synced, ...result });
            return NextResponse.json({ ok: true, synced, ...result });
        } catch (error) {
            return internalError(error, { event: "outreach.job.failed" });
        }
    });
}
