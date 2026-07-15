import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { listBadges } from "@/lib/marketplace/badges.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// All badge definitions (curated + unlockable) for the admin app's badge manager. Admin-gated.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/badges", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;

        try {
            const badges = await listBadges();
            return NextResponse.json({ badges }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.badges.list.failure" });
        }
    });
}
