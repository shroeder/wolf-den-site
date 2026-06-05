import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import {
    calculateOnlineFeeCents,
    createSquareCardPayment,
    findShopItemByVariationId,
    toPriceCents,
} from "@/lib/consignment/square";
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

            const catalogObjectId = String(body.catalogObjectId || "").trim();
            const sourceId = String(body.sourceId || "").trim();

            if (!catalogObjectId) {
                return badRequest("Missing catalog object id.");
            }

            if (!sourceId) {
                return badRequest("Missing payment source id.");
            }

            const item = await findShopItemByVariationId(catalogObjectId);

            if (!item) {
                return NextResponse.json({ error: "Item not found or not available." }, { status: 404 });
            }

            if (!Number.isFinite(item.price) || item.price <= 0) {
                return NextResponse.json({ error: "Item price is unavailable." }, { status: 409 });
            }

            if (!Number.isFinite(item.quantity) || item.quantity < 1) {
                return NextResponse.json({ error: "Item is out of stock." }, { status: 409 });
            }

            const subtotalCents = toPriceCents(item.price);
            const onlineFeeCents = calculateOnlineFeeCents(item.price);
            const totalCents = subtotalCents + onlineFeeCents;
            const idempotencyKey = randomUUID();

            const pendingOrder = await createPendingShopOrder({
                catalogObjectId: item.id,
                itemName: item.name,
                quantity: 1,
                subtotalCents,
                onlineFeeCents,
                totalCents,
                idempotencyKey,
            });

            let payment;

            try {
                payment = await createSquareCardPayment({
                    sourceId,
                    amountCents: totalCents,
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
