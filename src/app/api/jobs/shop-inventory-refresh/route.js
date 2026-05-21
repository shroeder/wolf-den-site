import { NextResponse } from "next/server";

import { refreshShopInventory } from "@/lib/shop/inventory";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

function isAuthorized(request) {
    const expected = process.env.CRON_SECRET;

    if (!expected) {
        return false;
    }

    const authHeader = request.headers.get("authorization") || "";

    return authHeader === `Bearer ${expected}`;
}

export async function GET(request) {
    return withRequestLogging(request, "GET /api/jobs/shop-inventory-refresh", async ({ logger, internalError }) => {
        try {
            if (!isAuthorized(request)) {
                logger.warn("shop.inventory_refresh.unauthorized");

                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }

            const result = await refreshShopInventory();

            return NextResponse.json({ success: true, ...result });
        } catch (error) {
            return internalError(error, {
                event: "shop.inventory_refresh.failure",
            });
        }
    });
}
