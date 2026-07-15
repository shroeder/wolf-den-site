import { NextResponse } from "next/server";

import { runProductAlertScan } from "@/lib/product-alerts/detection";
import { runProductAlertDigest } from "@/lib/product-alerts/digest";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const maxDuration = 300;

function isAuthorized(request) {
    const expected = process.env.CRON_SECRET;
    if (!expected) return false;
    return (request.headers.get("authorization") || "") === `Bearer ${expected}`;
}

// New-arrival alerts pipeline: scan Square inventory for new/restocked items, then email + push a
// digest to account subscribers by followed category. First scan seeds the baseline silently.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/jobs/product-alerts", async ({ logger, internalError }) => {
        try {
            if (!isAuthorized(request)) {
                logger.warn("product_alerts.job.unauthorized");
                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }

            const scan = await runProductAlertScan();
            const digest = await runProductAlertDigest();

            return NextResponse.json({ success: true, scan, digest });
        } catch (error) {
            return internalError(error, { event: "product_alerts.job.run.failure" });
        }
    });
}
