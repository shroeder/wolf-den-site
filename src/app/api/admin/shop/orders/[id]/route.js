import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { setShopOrderFulfillment } from "@/lib/shop-orders";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FULFILLMENT = new Set(["unfulfilled", "ready", "shipped", "picked_up", "cancelled"]);

// Owner marks an online order ready/shipped/picked up/cancelled and records a tracking number.
export async function PATCH(request, { params }) {
    return withRequestLogging(request, "PATCH /api/admin/shop/orders/[id]", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const { id } = await params;
            const body = await request.json().catch(() => ({}));
            const fulfillmentStatus = FULFILLMENT.has(body.fulfillmentStatus) ? body.fulfillmentStatus : null;
            const trackingNumber = typeof body.trackingNumber === "string" ? body.trackingNumber.trim() : null;
            if (!fulfillmentStatus && trackingNumber === null) {
                return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
            }
            const order = await setShopOrderFulfillment(id, { fulfillmentStatus, trackingNumber });
            if (!order) {
                return NextResponse.json({ error: "Order not found." }, { status: 404 });
            }
            return NextResponse.json({ order });
        } catch (error) {
            return internalError(error, { event: "admin.shop.order.update.failure" });
        }
    });
}
