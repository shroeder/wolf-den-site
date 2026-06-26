import { NextResponse } from "next/server";

import { withRequestLogging } from "@/lib/server-logger";
import { reconcileInventory } from "@/lib/inventory-feed/reconcile";

export const runtime = "nodejs";
export const maxDuration = 300;

function isAuthorized(request) {
    const expected = process.env.CRON_SECRET;

    if (!expected) {
        return false;
    }

    return (request.headers.get("authorization") || "") === `Bearer ${expected}`;
}

/**
 * Periodic reliability backbone for the new-arrival feed. Reconciles current Square stock against
 * the snapshot, posting new items / restocks / price drops to Discord and refreshing the website
 * feed. The Square webhook also triggers this for immediacy; the timer guarantees changes show up
 * even if a webhook is missed. Authed with CRON_SECRET (Vercel injects it on cron invocations).
 */
export async function GET(request) {
    return withRequestLogging(request, "GET /api/jobs/inventory-feed", async ({ logger, internalError }) => {
        if (!isAuthorized(request)) {
            logger.warn("inventory_feed.job.unauthorized");

            return NextResponse.json({ error: "unauthorized" }, { status: 401 });
        }

        try {
            const result = await reconcileInventory();

            return NextResponse.json({ success: true, ...result });
        } catch (error) {
            return internalError(error, { event: "inventory_feed.job.run.failed" });
        }
    });
}
