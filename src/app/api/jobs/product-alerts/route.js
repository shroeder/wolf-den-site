import { NextResponse } from "next/server";

import { withRequestLogging } from "@/lib/server-logger";
import { runProductAlertScan } from "@/lib/product-alerts/detection";
import { runProductAlertDigest } from "@/lib/product-alerts/digest";

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

            return NextResponse.json({ success: true, scan, digest });
        } catch (error) {
            return internalError(error, { event: "product_alerts.job.run.failed" });
        }
    });
}
