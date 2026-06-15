import { NextResponse } from "next/server";

import { runLookingForAlerts } from "@/lib/looking-for/alerts";
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

export async function GET(request) {
    return withRequestLogging(request, "GET /api/jobs/looking-for-alerts", async ({ logger, internalError }) => {
        try {
            if (!isAuthorized(request)) {
                logger.warn("looking_for.alerts.unauthorized");

                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }

            const result = await runLookingForAlerts();

            return NextResponse.json({ success: true, ...result });
        } catch (error) {
            return internalError(error, { event: "looking_for.alerts.run.failure" });
        }
    });
}
