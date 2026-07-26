import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { getCraftingAdmin } from "@/lib/marketplace/crafting-admin.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Forge/crafting telemetry for the admin app: usage totals, mini-game grade distribution, activity trend,
// top items, an adoption/abandonment funnel, and a recent raw-event feed. Read-only.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/crafting", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            return NextResponse.json(await getCraftingAdmin(), { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.crafting.failure" });
        }
    });
}
