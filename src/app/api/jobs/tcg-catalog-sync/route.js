import { NextResponse } from "next/server";

import { runCatalogSyncStep } from "@/lib/looking-for/catalog-sync";
import { refreshStockSnapshot } from "@/lib/looking-for/stock";
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

            // Refresh the in-stock snapshot first so it updates daily even if the (multi-day)
            // catalog seed is still draining. A Square failure here must not fail the catalog job.
            let stock = null;
            try {
                stock = await refreshStockSnapshot();
            } catch (stockError) {
                logger.warn("tcg.stock.refresh.failed", {
                    reason: stockError instanceof Error ? stockError.message : "unknown_error",
                });
            }

            const result = await runCatalogSyncStep();

            return NextResponse.json({ success: true, stock, ...result });
        } catch (error) {
            return internalError(error, {
                event: "tcg.catalog.sync.run.failure",
            });
        }
    });
}
