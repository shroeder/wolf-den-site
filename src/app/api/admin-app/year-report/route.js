import { NextResponse } from "next/server";

import { verifyAdminApiKey } from "@/lib/admin/admin-auth";
import { yearReport } from "@/lib/admin-app/year-report.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin-app/year-report[?year=2026]
//
// The Year screen. Three round trips (ledger rows, overhead lines, the nightly report bundle) and no Square
// call — profit comes off the cached bundle, so this is cheap enough to open on a whim and does not get
// slower as the shop's history grows. Opened by hand from the drawer; nothing polls it.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin-app/year-report", async ({ logger, internalError }) => {
        const authError = verifyAdminApiKey(request, logger);
        if (authError) return authError;
        try {
            const { searchParams } = new URL(request.url);
            const yearParam = searchParams.get("year");
            const year = yearParam ? Number(yearParam) : undefined;
            if (yearParam && (!Number.isInteger(year) || year < 2000 || year > 2100)) {
                return NextResponse.json({ error: "year must be a 4-digit year." }, { status: 400 });
            }
            const report = await yearReport({ year });
            logger.info("admin.yearReport.success", {
                year: report.year,
                netPosition: Math.round(report.breakEven.netPosition),
                entries: report.entryCount,
            });
            return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.yearReport.failure" });
        }
    });
}
