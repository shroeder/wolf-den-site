import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { getRareItemEconomy } from "@/lib/marketplace/rare-item-economy.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Rare-item economy analytics for the admin app: how many rare-or-better gear pieces enter the game, by
// source and by rarity, over a window. GET ?days=1|7|30|90. Read-only.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/rare-item-economy", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const days = Number(new URL(request.url).searchParams.get("days")) || 30;
            const data = await getRareItemEconomy({ days });
            return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.rare_item_economy.failure" });
        }
    });
}
