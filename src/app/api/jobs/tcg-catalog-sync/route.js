import { NextResponse } from "next/server";

import { runCatalogSyncStep } from "@/lib/looking-for/catalog-sync";
import { refreshStockSnapshot } from "@/lib/looking-for/stock";
import { withRequestLogging } from "@/lib/server-logger";
import { startJobRun, finishJobRun } from "@/lib/job-run.js";

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
        // Outside the try on purpose: the catch closes this row, and a job that DIED is the case the log
        // exists for. Scoped inside, the failure path could not reach it.
        let runId = null;
        try {
            if (!isAuthorized(request)) {
                logger.warn("tcg.catalog.sync.unauthorized");

                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }

            // ── LEAVE A TRACE ────────────────────────────────────────────────────────────────────────
            // Opened before the work, closed after. Every run of this job overwrites price_updated_at on the
            // whole catalog, so without this row there is no way to answer "did the cron run yesterday?" —
            // which is exactly the question that got asked, and could only be guessed at from the few dozen
            // delisted products that stopped being written.
            runId = await startJobRun("tcg-catalog-sync");

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

            await finishJobRun(runId, { ok: true, detail: { stock, ...result } });
            return NextResponse.json({ success: true, stock, ...result });
        } catch (error) {
            // Closed on the failure path too — a job that died is the case the log exists for, and a
            // success-only log would show a clean history right up to the morning nothing was priced.
            await finishJobRun(runId, { ok: false, error: error instanceof Error ? error.message : "unknown_error" });
            return internalError(error, {
                event: "tcg.catalog.sync.run.failure",
            });
        }
    });
}
