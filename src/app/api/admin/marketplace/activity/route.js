import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { listMarketplaceActivity } from "@/lib/marketplace/admin.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cross-marketplace activity feed (signups, listings, contacts, offers, swaps, sales).
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/marketplace/activity", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const activity = await listMarketplaceActivity({ limit: 150 });
            return NextResponse.json({ activity }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.marketplace.activity.failure" });
        }
    });
}
