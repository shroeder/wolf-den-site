import { NextResponse } from "next/server";

import { sendMissionDigests } from "@/lib/marketplace/missions.js";
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

// Weekly: email each active vendor their Vendor Missions digest (network opportunities). Vendor-only.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/jobs/marketplace-missions", async ({ logger, internalError }) => {
        try {
            if (!isAuthorized(request)) {
                logger.warn("marketplace.missions.unauthorized");
                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }

            const result = await sendMissionDigests();
            return NextResponse.json({ success: true, ...result });
        } catch (error) {
            return internalError(error, { event: "marketplace.missions.run.failure" });
        }
    });
}
