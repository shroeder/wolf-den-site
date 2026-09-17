import { after, NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { getShopOrderById, setShopOrderFulfillment } from "@/lib/shop-orders";
import { sendOrderCancelledEmail, sendOrderStatusEmail } from "@/lib/shop-order-email.js";
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
            // Read the current status BEFORE the write so we only email on an actual transition. Tapping
            // "Ready" twice, or saving a tracking number on an already-shipped order, must not re-notify
            // the customer.
            const previous = await getShopOrderById(id);
            const order = await setShopOrderFulfillment(id, { fulfillmentStatus, trackingNumber });
            if (!order) {
                return NextResponse.json({ error: "Order not found." }, { status: 404 });
            }

            const statusChanged =
                Boolean(fulfillmentStatus) && previous?.fulfillment_status !== fulfillmentStatus;

            if (statusChanged) {
                // Awaited inside after() so the serverless function doesn't terminate mid-send, and never
                // allowed to fail the status update — the owner's tap already succeeded.
                after(async () => {
                    try {
                        if (fulfillmentStatus === "cancelled") {
                            // Cancelling from the status dropdown carries no refund (that's the /cancel
                            // route's job), so send the notice without a refund amount.
                            await sendOrderCancelledEmail(order, {
                                reason: order.cancellation_reason || null,
                                refundAmountCents: order.refund_amount_cents || 0,
                            });
                        } else {
                            await sendOrderStatusEmail(order, fulfillmentStatus);
                        }
                    } catch (emailError) {
                        logger.warn("admin.shop.order.status_email_failed", {
                            orderId: id,
                            fulfillmentStatus,
                            errorMessage: emailError instanceof Error ? emailError.message : "unknown_error",
                        });
                    }
                });
            }

            return NextResponse.json({ order, customerNotified: statusChanged });
        } catch (error) {
            return internalError(error, { event: "admin.shop.order.update.failure" });
        }
    });
}
