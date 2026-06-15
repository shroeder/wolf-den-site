import { NextResponse } from "next/server";

import { runCatalogSyncStep } from "@/lib/looking-for/catalog-sync";
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
    return withRequestLogging(request, "GET /api/jobs/tcg-catalog-sync", async ({ logger, internalError }) => {
        try {
            if (!isAuthorized(request)) {
                logger.warn("tcg.catalog.sync.unauthorized");

                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }

            const result = await runCatalogSyncStep();

            return NextResponse.json({ success: true, ...result });
        } catch (error) {
            return internalError(error, {
                event: "tcg.catalog.sync.run.failure",
            });
        }
    });
}
