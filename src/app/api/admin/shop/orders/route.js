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

            const orders = await listShopOrders({
                limit,
                paymentStatus: "completed",
                fulfillmentStatus: fulfillmentStatus && fulfillmentStatus !== "all" ? fulfillmentStatus : null,
            });

            return NextResponse.json({ orders: orders.map(serializeShopOrderForAdmin) });
        } catch (error) {
            return internalError(error, { event: "admin.shop.orders.list.failure" });
        }
    });
}
