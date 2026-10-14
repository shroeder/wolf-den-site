import { NextResponse } from "next/server";

import { rebuildReportBundle } from "@/lib/admin-app/report-bundle-store.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A 730-day rebuild is one Square order search, a catalog batch per 100 variations, and one payment fetch
// per payment for the card fees. Measured at 43s for 120 days from a desktop; the full window lands near
// 150s. 300 is the ceiling with room, and the job is the only thing paying it instead of every phone.
export const maxDuration = 300;

function isAuthorized(request) {
    const expected = process.env.CRON_SECRET;
    if (!expected) return false;
    return (request.headers.get("authorization") || "") === `Bearer ${expected}`;
}

// NIGHTLY (03:45 America/Chicago — see vercel.json): rebuild the Reports v2 bundle.
//
// ⚠️ IT RUNS AFTER fifo-reconcile (08:15 UTC), AND THAT ORDER IS THE POINT. The reconciler is what writes
// the FIFO cost rows; a bundle built before it would cost the day's sales off the catalog attribute — the
// newest restock price — which is the exact bug FIFO exists to fix, baked into a cached report that then
// looks authoritative for 24 hours. See [[unit-cost-is-exact-fifo-never-averaged]].
//
// Nothing here is incremental. A sale from July can still change today (a refund lands, a cost is corrected,
// a consignor's rate is edited), and a report that only ever appends would carry the old answer forever.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/jobs/ledger-report-bundle", async ({ logger, internalError }) => {
        try {
            if (!isAuthorized(request)) {
                logger.warn("report_bundle.unauthorized");
                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }
            const result = await rebuildReportBundle();
            return NextResponse.json({ ok: true, ...result });
        } catch (error) {
            return internalError(error, "report_bundle.failed");
        }
    });
}
