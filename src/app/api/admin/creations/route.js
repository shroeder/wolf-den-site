import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { getCreationsAdmin } from "@/lib/marketplace/creations-admin.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Creations console for the admin app: purchases (who bought which bundle), usage (who made what custom art),
// and outstanding balances. Read-only.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/creations", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const data = await getCreationsAdmin();
            return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.creations.failure" });
        }
    });
}
