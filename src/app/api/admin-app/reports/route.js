import { NextResponse } from "next/server";

import { verifyAdminApiKey } from "@/lib/admin/admin-auth";
import { readWholeBundle, readReportBreakdown } from "@/lib/admin-app/report-bundle-store.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GRANULARITIES = new Set(["day", "week", "month"]);
const KINDS = new Set(["money", "units"]);

// ── WHAT REPORTS V2 READS ───────────────────────────────────────────────────────────────────────────────
// Two shapes out of one route, because they have opposite sizes and opposite lifetimes:
//
//   GET /api/admin-app/reports
//       The whole ReportsSalesData. The screen's category charts need every bucket's breakdown to draw,
//       so this is all of it — 2.14MB at six months of history. See readWholeBundle for the ceiling.
//
//   GET /api/admin-app/reports?granularity=day&start=<ms>&kind=money
//       ONE bucket's categories and the items inside them, fetched when a bar is tapped.
//
// ⚠️ IT IS SPLIT BECAUSE OF THE PROXY'S ~4.5MB BODY CAP, not for tidiness. The whole bundle with every
// breakdown is megabytes and would simply fail to reach the handset once the shop has a year of history —
// and it would fail by growing into it, long after anyone was looking. See [[admin-app-proxy-body-limit]].
//
// A 404 here means the nightly job has not run yet, which the app shows as "no bundle yet" rather than as
// an error — v1 is still on the drawer and still works.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin-app/reports", async ({ logger, internalError }) => {
        const authError = verifyAdminApiKey(request, logger);
        if (authError) return authError;
        try {
            const url = new URL(request.url);
            const granularity = url.searchParams.get("granularity");
            const start = url.searchParams.get("start");

            if (granularity || start) {
                const kind = url.searchParams.get("kind") || "money";
                if (!GRANULARITIES.has(granularity)) {
                    return NextResponse.json({ error: "bad_granularity" }, { status: 400 });
                }
                if (!KINDS.has(kind)) return NextResponse.json({ error: "bad_kind" }, { status: 400 });
                const bucketStart = Number(start);
                if (!Number.isFinite(bucketStart)) {
                    return NextResponse.json({ error: "bad_start" }, { status: 400 });
                }
                const categories = await readReportBreakdown({ kind, granularity, bucketStart });
                // An empty bucket and a missing bundle are different answers: a day with no sales has a
                // breakdown of zero categories and must not read as "the report is broken".
                if (categories == null) return NextResponse.json({ error: "no_bucket" }, { status: 404 });
                return NextResponse.json({ granularity, kind, bucketStart, categories });
            }

            const bundle = await readWholeBundle();
            if (!bundle) return NextResponse.json({ error: "no_bundle" }, { status: 404 });
            // Logged, not guessed: this payload grows with the shop's history and the ceiling is a hard
            // 4.5MB. Seeing it climb in the logs is the difference between planning the split and
            // debugging a report that stopped loading.
            const body = JSON.stringify(bundle);
            logger.info("admin_app.reports.served", { payloadBytes: body.length, generation: bundle.generation });
            return new NextResponse(body, { status: 200, headers: { "Content-Type": "application/json" } });
        } catch (error) {
            return internalError(error, "admin_app.reports.failed");
        }
    });
}
