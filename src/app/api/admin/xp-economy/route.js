import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { getXpEconomy } from "@/lib/marketplace/xp-economy.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// XP-economy analytics for the admin app: XP earned per day, gain by source (action), and top earners.
// GET ?days=1|7|30|90. Read-only.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/xp-economy", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const days = Number(new URL(request.url).searchParams.get("days")) || 30;
            const data = await getXpEconomy({ days });
            return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.xp_economy.failure" });
        }
    });
}
