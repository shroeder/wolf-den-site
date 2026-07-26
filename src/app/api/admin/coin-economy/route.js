import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { getCoinEconomy } from "@/lib/marketplace/coin-economy.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Coin-economy analytics for the admin app: supply/inflation over time, mint vs burn, coin gain/usage by
// source, and top holders + growers. GET ?days=7|30|90. Read-only.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/coin-economy", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const days = Number(new URL(request.url).searchParams.get("days")) || 30;
            const data = await getCoinEconomy({ days });
            return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.coin_economy.failure" });
        }
    });
}
