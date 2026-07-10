import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { isTrustedWriteRequest } from "@/lib/request-security";
import { getAuthenticatedShopCustomerFromCookies } from "@/lib/shop-customer-session";
import { getCustomerOrderById, serializeShopOrderForCustomer } from "@/lib/shop-orders";
import { sendOrderCancelRequestAlertEmail } from "@/lib/shop-order-email.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isPaymentsEnabled() {
    return process.env.PAYMENTS_ENABLED === "true";
}

// A customer REQUESTS cancellation of their own order. This does NOT cancel or refund anything — it
// flags the order for the owner to review and decide. Blocked once the order is shipped/picked up/
// cancelled (too late).
export async function POST(request, { params }) {
    return withRequestLogging(request, "POST /api/shop/orders/[id]/request-cancel", async ({ logger, internalError }) => {
        if (!isTrustedWriteRequest(request)) {
            return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
        }
        if (!isPaymentsEnabled()) {
            return NextResponse.json({ error: "Payments are currently disabled." }, { status: 403 });
        }
        try {
            const customer = await getAuthenticatedShopCustomerFromCookies();
            if (!customer) {
                return NextResponse.json({ error: "Sign in to manage your orders." }, { status: 401 });
            }

            const { id } = await params;
            const body = await request.json().catch(() => ({}));
            const reason = String(body?.reason || "").trim().slice(0, 500);

            const order = await getCustomerOrderById(id, customer.id);
            if (!order) {
                return NextResponse.json({ error: "Order not found." }, { status: 404 });
            }

            const terminal = ["shipped", "picked_up", "cancelled"];
            if (terminal.includes(order.fulfillment_status)) {
                return NextResponse.json(
                    { error: "This order can no longer be cancelled — it's already been fulfilled or cancelled." },
                    { status: 409 }
                );
            }

            const updated = await db.queryOne(
                `UPDATE shop_orders
                 SET cancellation_requested_at = COALESCE(cancellation_requested_at, NOW()),
                     cancellation_request_reason = $2,
                     cancellation_request_status = 'pending',
                     updated_at = NOW()
                 WHERE id = $1
                 RETURNING *`,
                [id, reason || null]
            );

            // Best-effort: tell the owner a request came in (also visible in the admin order view).
            try {
                await sendOrderCancelRequestAlertEmail(updated, { reason });
            } catch (emailError) {
                logger.warn("shop.order.cancel_request.email_failed", {
                    orderId: id,
                    errorMessage: emailError instanceof Error ? emailError.message : "unknown_error",
                });
            }

            return NextResponse.json({ order: serializeShopOrderForCustomer(updated) });
        } catch (error) {
            return internalError(error, { event: "shop.order.request_cancel.failed" });
        }
    });
}
