import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { listShopOrders, serializeShopOrderForAdmin } from "@/lib/shop-orders";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// List paid online orders for the admin app's Shop Orders screen (the web page uses a server
// component; the phone app needs JSON). Same shape both sides via serializeShopOrderForAdmin.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/shop/orders", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;

        try {
            const url = new URL(request.url);
            const fulfillmentStatus = url.searchParams.get("fulfillment") || null;
            const limit = Number(url.searchParams.get("limit")) || 200;
            // ?archived=1 for the filed ones, ?archived=all for both. Anything else means the active list,
            // which is what every screen asks for by default.
            const archivedParam = url.searchParams.get("archived");
            const archived = archivedParam === "all" ? "all" : archivedParam === "1" || archivedParam === "true";

            const orders = await listShopOrders({
                limit,
                paymentStatus: "completed",
                fulfillmentStatus: fulfillmentStatus && fulfillmentStatus !== "all" ? fulfillmentStatus : null,
                archived,
            });

            return NextResponse.json({ orders: orders.map(serializeShopOrderForAdmin) });
        } catch (error) {
            return internalError(error, { event: "admin.shop.orders.list.failure" });
        }
    });
}
