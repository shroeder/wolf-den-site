import { NextResponse } from "next/server";

import { repriceActiveListings } from "@/lib/marketplace/reprice.js";
import { withRequestLogging } from "@/lib/server-logger";

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

// Nightly: recompute every active auto-priced marketplace listing (runs after the catalog sync so
// market prices are fresh).
export async function GET(request) {
    return withRequestLogging(request, "GET /api/jobs/marketplace-reprice", async ({ logger, internalError }) => {
        try {
            if (!isAuthorized(request)) {
                logger.warn("marketplace.reprice.unauthorized");
                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }

            const result = await repriceActiveListings();
            return NextResponse.json({ success: true, ...result });
        } catch (error) {
            return internalError(error, { event: "marketplace.reprice.run.failure" });
        }
    });
}
