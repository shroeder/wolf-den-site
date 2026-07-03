import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { listBuyersForAdmin } from "@/lib/marketplace/admin.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Everyone who signed up as a buyer.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/marketplace/buyers", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const buyers = await listBuyersForAdmin();
            return NextResponse.json({ buyers }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.marketplace.buyers.failure" });
        }
    });
}
