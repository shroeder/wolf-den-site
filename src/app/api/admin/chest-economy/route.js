import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { getChestEconomy } from "@/lib/marketplace/chest-economy.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Store-wide chest-drop analytics for the admin app: which sources hand out the most chests, of which tiers, so
// drop rates can be balanced. GET ?days=7|30|90. Read-only.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/chest-economy", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const days = Number(new URL(request.url).searchParams.get("days")) || 30;
            const data = await getChestEconomy({ days });
            return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.chest_economy.failure" });
        }
    });
}
