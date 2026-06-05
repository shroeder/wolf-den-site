import { NextResponse } from "next/server";

import { getSquarePaymentById } from "@/lib/consignment/square";
import { getShopOrderById, updateShopOrderPaymentResult } from "@/lib/shop-orders";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

function isPaymentsEnabled() {
    return process.env.PAYMENTS_ENABLED === "true";
}

function mapSquareStatusToOrderStatus(squareStatus) {
    if (squareStatus === "COMPLETED") {
        return "completed";
    }

    if (squareStatus === "CANCELED" || squareStatus === "FAILED") {
        return "failed";
    }

    return "pending";
}

function toStatusResponse(order) {
    return {
        order: {
            id: order.id,
            status: order.status,
            itemName: order.item_name,
            subtotalCents: order.subtotal_cents,
            onlineFeeCents: order.online_fee_cents,
            totalCents: order.total_cents,
            squarePaymentId: order.square_payment_id,
            squareStatus: order.square_status,
            receiptUrl: order.receipt_url,
            createdAt: order.created_at,
            updatedAt: order.updated_at,
        },
    };
}

export async function GET(request, { params }) {
    return withRequestLogging(request, "GET /api/shop/payment-status/[id]", async ({ internalError }) => {
        if (!isPaymentsEnabled()) {
            return NextResponse.json({ error: "Payments are currently disabled." }, { status: 403 });
        }

        try {
            const { id } = await params;
            const orderId = String(id || "").trim();

            if (!orderId) {
                return NextResponse.json({ error: "Missing order id." }, { status: 400 });
            }

            const order = await getShopOrderById(orderId);

            if (!order) {
                return NextResponse.json({ error: "Order not found." }, { status: 404 });
            }

            if (!order.square_payment_id || order.status !== "pending") {
                return NextResponse.json(toStatusResponse(order));
            }

            const payment = await getSquarePaymentById(order.square_payment_id).catch(() => null);

            if (!payment?.status) {
                return NextResponse.json(toStatusResponse(order));
            }

            const refreshedOrder = await updateShopOrderPaymentResult(order.id, {
                status: mapSquareStatusToOrderStatus(payment.status),
                squarePaymentId: payment.id,
                squareStatus: payment.status,
                receiptUrl: payment.receipt_url,
                paymentErrorCode: null,
                paymentErrorMessage: null,
            });

            return NextResponse.json(toStatusResponse(refreshedOrder));
        } catch (error) {
            return internalError(error, {
                event: "shop.payment_status.failed",
            });
        }
    });
}
