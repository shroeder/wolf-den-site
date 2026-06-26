import { NextResponse } from "next/server";

import { withRequestLogging } from "@/lib/server-logger";
import { backfillRecentArrivalsToDiscord } from "@/lib/product-alerts/webhook-discord";

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

/**
 * One-time reconciliation endpoint: posts recent in-stock arrivals to Discord that the old
 * cron/category path silently dropped. Authed with CRON_SECRET (not on a schedule — run manually).
 * Lookback defaults to 168h (7 days); override with ?hours=N. Idempotent: already-announced items
 * are skipped, so it's safe to re-run.
 */
export async function GET(request) {
    return withRequestLogging(request, "GET /api/jobs/product-alerts-backfill", async ({ logger, internalError }) => {
        try {
            if (!isAuthorized(request)) {
                logger.warn("product_alerts.backfill.unauthorized");

                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }

            const hoursParam = Number(new URL(request.url).searchParams.get("hours"));
            const lookbackHours = Number.isFinite(hoursParam) && hoursParam > 0 ? hoursParam : 168;

            const result = await backfillRecentArrivalsToDiscord({ lookbackHours });

            return NextResponse.json({ success: true, ...result });
        } catch (error) {
            return internalError(error, { event: "product_alerts.backfill.run.failed" });
        }
    });
}
