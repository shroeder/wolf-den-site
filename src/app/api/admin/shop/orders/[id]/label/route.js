import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { getShopOrderById, setShopOrderShippingLabel } from "@/lib/shop-orders";
import { buyShippingLabel, isEasyPostEnabled } from "@/lib/shipping/easypost";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Owner buys the EasyPost shipping label for an order (from the shipment + rate chosen at checkout),
// stores the label URL + tracking, and marks the order shipped.
export async function POST(request, { params }) {
    return withRequestLogging(request, "POST /api/admin/shop/orders/[id]/label", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;

        if (!isEasyPostEnabled()) {
            return NextResponse.json({ error: "EasyPost is not configured." }, { status: 400 });
        }

        try {
            const { id } = await params;
            const order = await getShopOrderById(id);

            if (!order) {
                return NextResponse.json({ error: "Order not found." }, { status: 404 });
            }

            if (order.shipping_label_url) {
                // Already purchased — return it rather than buying a second label.
                return NextResponse.json({ order, labelUrl: order.shipping_label_url, alreadyBought: true });
            }

            if (!order.easypost_shipment_id || !order.easypost_rate_id) {
                return NextResponse.json(
                    { error: "This order has no EasyPost shipment (pickup order, or placed before shipping was enabled)." },
                    { status: 400 }
                );
            }

            const label = await buyShippingLabel({
                shipmentId: order.easypost_shipment_id,
                rateId: order.easypost_rate_id,
            });

            const updated = await setShopOrderShippingLabel(id, {
                labelUrl: label.labelUrl,
                trackingNumber: label.trackingCode,
                carrier: label.carrier,
                service: label.service,
            });

            return NextResponse.json({ order: updated, labelUrl: label.labelUrl, trackingCode: label.trackingCode });
        } catch (error) {
            return internalError(error, { event: "admin.shop.order.label.failure" });
        }
    });
}
