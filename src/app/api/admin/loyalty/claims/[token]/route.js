import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { getClaimOrderDetail } from "@/lib/marketplace/loyalty-claim.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One loyalty claim's staff detail — chiefly the SQUARE ORDER id behind the sale, so the admin app can
// itemize the purchase (line items, cost, profit) on the claim's QR screen.
//
// Gated on `cogs.view`, NOT the `loyalty.view` the claims list uses: what this unlocks downstream is
// cost + margin, which is owner/manager information. Staff-role sessions (and the employee app flavor,
// which never calls this) don't get it.
export async function GET(request, { params }) {
    return withRequestLogging(request, "GET /api/admin/loyalty/claims/[token]", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "cogs.view", logger);
        if (authError) return authError;

        try {
            const { token } = await params;
            const claim = await getClaimOrderDetail(String(token || "").trim());
            if (!claim) return NextResponse.json({ error: "not_found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
            return NextResponse.json(claim, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.loyalty.claim.detail.failure" });
        }
    });
}
