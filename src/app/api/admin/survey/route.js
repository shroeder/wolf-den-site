import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { surveyResults } from "@/lib/marketplace/survey.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Survey tallies. Sorted by NET (favourite minus least-favourite) rather than raw favourite count, because a
// system that half the Den loves and the other half would drop is a different problem from one nobody has an
// opinion about, and the raw count hides that.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/survey", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            return NextResponse.json(await surveyResults(), { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.survey.failure" });
        }
    });
}
