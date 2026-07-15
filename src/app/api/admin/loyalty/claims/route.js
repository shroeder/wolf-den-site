import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { listRecentClaims } from "@/lib/marketplace/loyalty-claim.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Recent loyalty QR claims for the admin/employee app — so a missed push notification isn't a lost
// claim; a cashier can pull the list up and re-open any claim's QR. Same auth as the loyalty dashboard.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/loyalty/claims", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "loyalty.view", logger);
        if (authError) return authError;

        try {
            const claims = await listRecentClaims(50);
            return NextResponse.json({ claims }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.loyalty.claims.failure" });
        }
    });
}
