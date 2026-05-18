import { NextResponse } from "next/server";

import { runNightlyConsignmentReports } from "@/lib/consignment/nightly-reports";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

function isAuthorized(request) {
    const expected = process.env.CRON_SECRET;

    if (!expected) {
        return false;
    }

    const authHeader = request.headers.get("authorization") || "";

    return authHeader === `Bearer ${expected}`;
}

export async function GET(request) {
    return withRequestLogging(request, "GET /api/jobs/consignment-nightly-reports", async ({ logger, internalError }) => {
        try {
            if (!isAuthorized(request)) {
                logger.warn("consignment.nightly_reports.unauthorized");

                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }

            const result = await runNightlyConsignmentReports();

            return NextResponse.json({
                success: true,
                ...result,
            });
        } catch (error) {
            return internalError(error, {
                event: "consignment.nightly_reports.run.failure",
            });
        }
    });
}
