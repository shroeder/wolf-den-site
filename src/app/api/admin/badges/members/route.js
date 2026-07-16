import { after, NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { backfillBadgeCongrats, listMembersWithBadges } from "@/lib/marketplace/badges.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Members + the badges they hold, for browsing/inspecting in the admin app. Admin-gated. `q` searches
// alias, name, or email.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/badges/members", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;

        try {
            const { searchParams } = new URL(request.url);
            const q = searchParams.get("q") || "";
            const limit = searchParams.get("limit") || 40;
            const offset = searchParams.get("offset") || 0;
            const members = await listMembersWithBadges({ q, limit, offset });
            // Auto-send any pending badge-congrats emails (no manual action needed). Best-effort, off-path.
            after(() => backfillBadgeCongrats());
            return NextResponse.json({ members }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.badges.members.failure" });
        }
    });
}
