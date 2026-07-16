import { NextResponse } from "next/server";

import { runProductAlertScan } from "@/lib/product-alerts/detection";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const maxDuration = 300;

function isAuthorized(request) {
    const expected = process.env.CRON_SECRET;
    if (!expected) return false;
    return (request.headers.get("authorization") || "") === `Bearer ${expected}`;
}

// Scan Square inventory for new/restocked items (keeps the "Just In" feed + Discord broadcast state
// current). The per-subscriber email/push digest was retired with the on-site alerts feature — Discord
// is the channel now — so only the scan runs.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/jobs/product-alerts", async ({ logger, internalError }) => {
        try {
            if (!isAuthorized(request)) {
                logger.warn("product_alerts.job.unauthorized");
                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }

            const scan = await runProductAlertScan();
            return NextResponse.json({ success: true, scan });
        } catch (error) {
            return internalError(error, { event: "product_alerts.job.run.failure" });
        }
    });
}
