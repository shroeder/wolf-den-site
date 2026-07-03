import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { listVendorsForAdmin } from "@/lib/marketplace/vendors.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// All vendors + aggregate stats for the admin app's Marketplace console.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/marketplace/vendors", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const vendors = await listVendorsForAdmin();
            return NextResponse.json({ vendors }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.marketplace.vendors.failure" });
        }
    });
}
