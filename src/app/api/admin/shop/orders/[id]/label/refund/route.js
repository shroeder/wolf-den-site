import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { db } from "@/lib/db";
import { getShopOrderById } from "@/lib/shop-orders";
import { getShipment, refundShipment } from "@/lib/shipping/easypost";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── REFUND (VOID) A BOUGHT LABEL ─────────────────────────────────────────────────────────────────────────────
// Luke, 2026-11-20, after a label bought at the wrong size: "I don't know if we can get that money back."
// USPS refunds an unused label; EasyPost returns the postage to the balance once USPS confirms.
//
// ⚠️ THE ORDER IS RESET SO A NEW LABEL CAN BE BOUGHT. The label link, tracking and shipment are cleared and the
// order goes back to unfulfilled — otherwise the card keeps offering to print a label that no longer works.
// The refund request is kept in the log with the old tracking number.
export async function POST(request, { params }) {
    return withRequestLogging(request, "POST /api/admin/shop/orders/[id]/label/refund", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;

        const { id } = await params;
        try {
            const order = await getShopOrderById(id);
            if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
            if (!order.easypost_shipment_id || !order.shipping_label_url) {
                return NextResponse.json({ error: "This order has no bought label to refund." }, { status: 400 });
            }

            const before = await getShipment(order.easypost_shipment_id).catch(() => null);
            const result = await refundShipment(order.easypost_shipment_id);
            logger.warn("admin.shop.order.label.refunded", {
                orderId: id,
                shipmentId: order.easypost_shipment_id,
                trackingNumber: order.tracking_number,
                paidCents: before?.paidCents ?? null,
                refundStatus: result.refundStatus,
            });

            const updated = await db.queryOne(
                `UPDATE shop_orders
                 SET shipping_label_url = NULL, tracking_number = NULL,
                     easypost_shipment_id = NULL, easypost_rate_id = NULL,
                     fulfillment_status = 'unfulfilled', fulfilled_at = NULL, updated_at = NOW()
                 WHERE id = $1
                 RETURNING id`,
                [id]
            );

            return NextResponse.json({
                ok: true,
                refundStatus: result.refundStatus,
                refundedCents: before?.paidCents ?? null,
                orderId: updated?.id || id,
            });
        } catch (error) {
            if (error?.easyPostStatus) {
                return NextResponse.json({ error: error.message, easyPostStatus: error.easyPostStatus }, { status: 502 });
            }
            return internalError(error, { event: "admin.shop.order.label.refund_failure" });
        }
    });
}
