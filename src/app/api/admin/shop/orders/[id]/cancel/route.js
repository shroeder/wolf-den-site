import { NextResponse } from "next/server";

import { refundSquarePayment, restockInventoryForCancel } from "@/lib/consignment/square";
import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { getOrderCreditApplied, refundOrderCredit } from "@/lib/marketplace/store-credit.js";
import { sendOrderCancelledEmail } from "@/lib/shop-order-email.js";
import { getShopOrderById, setShopOrderCancelled } from "@/lib/shop-orders";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseItems(itemsJson) {
    try {
        return Array.isArray(itemsJson) ? itemsJson : JSON.parse(itemsJson || "[]");
    } catch {
        return [];
    }
}

// Owner cancels an online order: refund the Square payment, put stock back, record the reason, and
// email the customer an explanation. The reason is required so the customer always gets a "why".
export async function POST(request, { params }) {
    return withRequestLogging(request, "POST /api/admin/shop/orders/[id]/cancel", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;

        try {
            const { id } = await params;
            const body = await request.json().catch(() => ({}));
            const reason = String(body?.reason || "").trim();
            // Restock defaults to true; the owner unchecks it for the rare lost-in-shipping case where
            // the item won't come back, so we shouldn't put it back in Square as sellable.
            const restock = body?.restock !== false;

            if (!reason) {
                return NextResponse.json({ error: "A cancellation reason is required." }, { status: 400 });
            }

            const order = await getShopOrderById(id);
            if (!order) {
                return NextResponse.json({ error: "Order not found." }, { status: 404 });
            }
            if (order.fulfillment_status === "cancelled" && order.refund_id) {
                return NextResponse.json({ order, alreadyCancelled: true });
            }

            // If the buyer applied store credit to this order, the CARD was only charged the remainder — so
            // refund the card exactly what it took, and hand the applied credit back to their balance.
            const applied = await getOrderCreditApplied(order.id).catch(() => ({ cents: 0 }));
            const cardChargedCents = Math.max(0, (order.total_cents || 0) - (applied.cents || 0));

            // Refund the captured card payment (the amount it was actually charged). Only if paid + not yet
            // refunded. The store-credit portion is restored separately below (never touches Square).
            let refundId = order.refund_id || null;
            let refundAmountCents = order.refund_amount_cents || null;

            if (!refundId && order.square_payment_id && order.status === "completed" && cardChargedCents > 0) {
                try {
                    const refund = await refundSquarePayment({
                        paymentId: order.square_payment_id,
                        amountCents: cardChargedCents,
                        reason,
                        idempotencyKey: `cancel-${order.id}`,
                    });
                    refundId = refund?.id || null;
                    refundAmountCents = refund ? cardChargedCents : null;
                } catch (refundError) {
                    logger.warn("shop.order.cancel.refund_failed", {
                        orderId: order.id,
                        errorMessage: refundError instanceof Error ? refundError.message : "unknown_error",
                    });
                    return NextResponse.json(
                        {
                            error: `Refund failed: ${refundError instanceof Error ? refundError.message : "unknown error"}. Order not cancelled — refund manually in Square, or retry.`,
                        },
                        { status: 502 }
                    );
                }
            }

            // Put the items back in stock unless the owner opted out (best-effort — a Square hiccup
            // shouldn't block the cancel).
            if (restock) {
                try {
                    await restockInventoryForCancel(parseItems(order.items_json), { idempotencyKey: `cancel-${order.id}` });
                } catch (restockError) {
                    logger.warn("shop.order.cancel.restock_failed", {
                        orderId: order.id,
                        errorMessage: restockError instanceof Error ? restockError.message : "unknown_error",
                    });
                }
            }

            // Restore any store credit the order applied (idempotent; independent of the card refund).
            const creditRestored = await refundOrderCredit(order.id).catch(() => ({ cents: 0 }));
            if (creditRestored.cents > 0) {
                logger.info("shop.order.cancel.credit_restored", { orderId: order.id, cents: creditRestored.cents });
            }

            const updated = await setShopOrderCancelled(id, { reason, refundId, refundAmountCents });

            // Tell the customer why + confirm the refund (best-effort).
            try {
                await sendOrderCancelledEmail(updated, { reason, refundAmountCents });
            } catch (emailError) {
                logger.warn("shop.order.cancel.email_failed", {
                    orderId: order.id,
                    errorMessage: emailError instanceof Error ? emailError.message : "unknown_error",
                });
            }

            return NextResponse.json({ order: updated, refundId, refundAmountCents });
        } catch (error) {
            return internalError(error, { event: "admin.shop.order.cancel.failure" });
        }
    });
}
