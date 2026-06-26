import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { withRequestLogging } from "@/lib/server-logger";
import { runProductAlertScan } from "@/lib/product-alerts/detection";
import { runProductAlertDigest } from "@/lib/product-alerts/digest";
import { backfillRecentArrivalsToDiscord } from "@/lib/product-alerts/webhook-discord";

// Sentinel key in discord_alert_events marking that the one-time post-rewrite reconciliation has
// run, so the bootstrap below fires exactly once across all cron ticks.
const BACKFILL_SENTINEL = "backfill:bootstrap";

export const runtime = "nodejs";
export const maxDuration = 300;

function isAuthorized(request) {
    const expected = process.env.CRON_SECRET;

    if (!expected) {
        return false;
    }

    const authHeader = request.headers.get("authorization") || "";

    return authHeader === `Bearer ${expected}`;
}

export async function GET(request) {
    return withRequestLogging(request, "GET /api/jobs/product-alerts", async ({ logger, internalError }) => {
        try {
            if (!isAuthorized(request)) {
                logger.warn("product_alerts.job.unauthorized");

                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }

            // Discord posting moved to the Square webhook (src/lib/product-alerts/webhook-discord.js)
            // so arrivals broadcast immediately on a count increase. This cron now only drives the
            // category opt-in email digest.
            const scan = await runProductAlertScan();
            const digest = await runProductAlertDigest();

            // One-shot Discord reconciliation: on the first tick after the webhook-direct rewrite
            // deployed, announce recent in-stock arrivals the old cron/category path silently
            // dropped. Guarded by a sentinel so it runs exactly once, and the sentinel is only set
            // when the backfill actually ran (not when it skipped for a missing webhook URL), so it
            // retries until Discord is configured. Isolated in try/catch so it can never break the
            // email digest. Safe to delete this block later — the sentinel keeps it inert regardless.
            let backfill = null;

            try {
                const done = await db.query(
                    `SELECT 1 FROM discord_alert_events WHERE event_id = $1`,
                    [BACKFILL_SENTINEL]
                );

                if (!done.length) {
                    backfill = await backfillRecentArrivalsToDiscord({ lookbackHours: 168 });

                    if (!backfill.skipped) {
                        await db.query(
                            `INSERT INTO discord_alert_events (event_id) VALUES ($1) ON CONFLICT (event_id) DO NOTHING`,
                            [BACKFILL_SENTINEL]
                        );
                    }
                }
            } catch (error) {
                logger.warn("product_alerts.backfill.bootstrap_failed", {
                    reason: error instanceof Error ? error.message : "unknown_error",
                });
            }

            return NextResponse.json({ success: true, scan, digest, backfill });
        } catch (error) {
            return internalError(error, { event: "product_alerts.job.run.failed" });
        }
    });
}
