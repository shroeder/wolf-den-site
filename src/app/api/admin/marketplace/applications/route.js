import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { listApplications } from "@/lib/marketplace/applications.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vendor sign-up applications (newest first). Optional ?status=pending|approved|rejected.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/marketplace/applications", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const status = new URL(request.url).searchParams.get("status") || undefined;
            const applications = await listApplications({ status });
            return NextResponse.json({ applications }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.marketplace.applications.failure" });
        }
    });
}
