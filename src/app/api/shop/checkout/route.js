import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";

import { NextResponse } from "next/server";

import {
    createSquareCardPayment,
} from "@/lib/consignment/square";
import { getExistingCartId } from "@/lib/shop-cart-session";
import { clearCartItems, getCartSummary } from "@/lib/shop-carts";
import {
    createPendingShopOrder,
    updateShopOrderPaymentResult,
} from "@/lib/shop-orders";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

const badRequest = (message) => NextResponse.json({ error: message }, { status: 400 });

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

function toCheckoutResponse(order, payment) {
    return {
        success: order.status === "completed",
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
        payment: payment
            ? {
                id: payment.id,
                status: payment.status,
                receiptUrl: payment.receipt_url || null,
            }
            : null,
    };
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/shop/checkout", async ({ logger, internalError }) => {
        if (!isPaymentsEnabled()) {
            return NextResponse.json({ error: "Payments are currently disabled." }, { status: 403 });
        }

        try {
            const body = await request.json().catch(() => null);

            if (!body) {
                return badRequest("Invalid request body.");
            }

            const sourceId = String(body.sourceId || "").trim();

            if (!sourceId) {
                return badRequest("Missing payment source id.");
            }

            const cookieStore = await cookies();
            const cartId = getExistingCartId(cookieStore);

            if (!cartId) {
                return NextResponse.json({ error: "Cart is empty." }, { status: 409 });
            }

            const cart = await getCartSummary(cartId);

            if (!cart.items.length) {
                return NextResponse.json({ error: "Cart is empty." }, { status: 409 });
            }

            if (cart.hasUnavailableItems) {
                return NextResponse.json({
                    error: "Cart contains unavailable items. Please review your cart and try again.",
                    cart,
                }, { status: 409 });
            }

            const idempotencyKey = randomUUID();

            const pendingOrder = await createPendingShopOrder({
                catalogObjectId: "cart",
                itemName: `${cart.itemCount} item cart`,
                quantity: cart.itemCount,
                subtotalCents: cart.subtotalCents,
                onlineFeeCents: cart.onlineFeeCents,
                totalCents: cart.totalCents,
                idempotencyKey,
                cartId,
                items: cart.items,
            });

            let payment;

            try {
                payment = await createSquareCardPayment({
                    sourceId,
                    amountCents: cart.totalCents,
                    idempotencyKey,
                    note: `Shop order ${pendingOrder.id}`,
                    referenceId: pendingOrder.id,
                });
            } catch (error) {
                await updateShopOrderPaymentResult(pendingOrder.id, {
                    status: "failed",
                    paymentErrorCode: error?.squareCode || "payment_create_failed",
                    paymentErrorMessage: error instanceof Error ? error.message : "Unknown payment error.",
                });

                logger.warn("shop.checkout.payment_failed", {
                    orderId: pendingOrder.id,
                    squareCode: error?.squareCode,
                    squareStatus: error?.squareStatus,
                });

                return NextResponse.json(
                    {
                        error: "Payment could not be processed.",
                        code: error?.squareCode || "payment_create_failed",
                    },
                    { status: error?.squareStatus === 400 ? 402 : 502 }
                );
            }

            const orderStatus = mapSquareStatusToOrderStatus(payment?.status);
            const updatedOrder = await updateShopOrderPaymentResult(pendingOrder.id, {
                status: orderStatus,
                squarePaymentId: payment?.id,
                squareStatus: payment?.status,
                receiptUrl: payment?.receipt_url,
                paymentErrorCode: null,
                paymentErrorMessage: null,
            });

            if (updatedOrder.status === "completed") {
                await clearCartItems(cartId);
            }

            return NextResponse.json(toCheckoutResponse(updatedOrder, payment), {
                status: updatedOrder.status === "completed" ? 200 : 202,
            });
        } catch (error) {
            return internalError(error, {
                event: "shop.checkout.failed",
            });
        }
    });
}
