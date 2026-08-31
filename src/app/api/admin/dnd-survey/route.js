import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { getDndSurveyReport } from "@/lib/dnd-survey-store";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin read of the D&D survey: per-option tallies plus the raw responses. Same report the owner-only
// /dnd/results page renders, exposed for the admin app.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/dnd-survey", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;

        try {
            const report = await getDndSurveyReport();
            return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.dnd_survey.failure" });
        }
    });
}
