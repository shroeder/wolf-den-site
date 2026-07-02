import { NextResponse } from "next/server";

import { snapshotNetworkPrices } from "@/lib/marketplace/search.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const maxDuration = 120;

function isAuthorized(request) {
    const expected = process.env.CRON_SECRET;
    if (!expected) {
        return false;
    }
    const authHeader = request.headers.get("authorization") || "";
    return authHeader === `Bearer ${expected}`;
}

// Daily: record the Community Price History snapshot (per-product network supply/pricing).
export async function GET(request) {
    return withRequestLogging(request, "GET /api/jobs/marketplace-price-snapshot", async ({ logger, internalError }) => {
        try {
            if (!isAuthorized(request)) {
                logger.warn("marketplace.price_snapshot.unauthorized");
                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }
            const result = await snapshotNetworkPrices();
            return NextResponse.json({ success: true, ...result });
        } catch (error) {
            return internalError(error, { event: "marketplace.price_snapshot.run.failure" });
        }
    });
}
