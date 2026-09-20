import { NextResponse } from "next/server";

import { reconcileFifo } from "@/lib/cogs/fifo-reconcile";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

// ── KEEP THE FIFO COSTS CURRENT ──────────────────────────────────────────────────────────────────────────────
// A sale's FIFO cost is written down rather than computed on read, because Square cannot search orders by item
// and answering "how many of this sold before that one" otherwise means scanning the whole order history every
// time somebody opens a report. Something has to do the walking; this is it.
//
// ⚠️ ONCE A NIGHT, NOT EVERY FEW MINUTES. The reconciler is resumable and only scans forward from its cursor,
// so a frequent run would be cheap in CPU — but it wakes Neon and calls Square for every tick, and nothing
// reads these numbers faster than a person opening a report the next morning. The nightly window also means
// it sees a full day's orders in their final state instead of costing a sale that is later voided.
function isAuthorized(request) {
    const expected = process.env.CRON_SECRET;
    if (!expected) return false;
    return (request.headers.get("authorization") || "") === `Bearer ${expected}`;
}

export async function GET(request) {
    return withRequestLogging(request, "GET /api/jobs/fifo-reconcile", async ({ logger, internalError }) => {
        try {
            if (!isAuthorized(request)) {
                logger.warn("cogs.fifo.cron.unauthorized");
                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }

            // `full` re-costs from the first purchase. It is for after history has been EDITED — a backfilled
            // link, a corrected paid_each — because those change which batch an old sale should have drawn
            // from, and an incremental run would leave every sale before the edit holding the old answer.
            const params = new URL(request.url).searchParams;
            const full = params.get("full") === "1";
            // ── ?dry=1 ── WORK IT ALL OUT AND WRITE NOTHING ──────────────────────────────────────────────
            // The safe way to seed existing items: link some purchases, ask what that WOULD do to the stored
            // costs, read the diff, then run it for real. Pair it with full=1 to plan a complete re-cost, which
            // is what a backfill of historical links actually needs.
            const dryRun = params.get("dry") === "1";
            const result = await reconcileFifo({ full, dryRun });

            return NextResponse.json({ success: true, ...result });
        } catch (error) {
            return internalError(error, { event: "cogs.fifo.cron.failure" });
        }
    });
}
