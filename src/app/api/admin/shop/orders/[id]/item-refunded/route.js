import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { sendOrderItemRefundedEmail } from "@/lib/shop-order-email.js";
import { getShopOrderById } from "@/lib/shop-orders";
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

// ── ⚠️ THIS ROUTE SENDS AN EMAIL AND CHANGES NOTHING ELSE ───────────────────────────────────────────────────
// sendOrderItemRefundedEmail was added on 2026-11-12 with nothing calling it, so the first two of these went
// out by hand: RESEND_API_KEY is a Vercel-only variable, which means the email can only be sent by code that
// is already deployed. A function no deployed route reaches is a function that cannot send anything.
//
// ⚠️ IT DOES NOT ISSUE THE REFUND, AND MUST NOT START DOING SO WITHOUT SOMEWHERE TO RECORD ONE. A partial
// refund has nowhere to live on shop_orders — refund_id and refund_amount_cents are what the cancel flow
// reads as "this whole order was cancelled", so writing a partial into them would show a live order as
// cancelled on every screen that asks. Until that column exists the refund happens in Square by hand and the
// amount is passed in here, which is why refundAmountCents is required rather than derived: the email states
// a figure to a customer who will check it against their statement, and a guess is worse than a question.
//
// ⚠️ THE NAMES ARE VALIDATED AGAINST THE ORDER. A mistyped name would be emailed verbatim as a card we
// could not find, and would also silently defeat the survivor diff in the email (which falls back to generic
// wording when a name does not match). Refusing outright is better than sending a confusing email that
// cannot be unsent.
export async function POST(request, { params }) {
    return withRequestLogging(request, "POST /api/admin/shop/orders/[id]/item-refunded", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;

        try {
            const { id } = await params;
            const body = await request.json().catch(() => ({}));

            const requested = Array.isArray(body?.itemNames)
                ? body.itemNames
                : [body?.itemNames ?? body?.itemName];
            const itemNames = requested.map((n) => String(n || "").trim()).filter(Boolean);
            const refundAmountCents = Math.round(Number(body?.refundAmountCents));

            if (!itemNames.length) {
                return NextResponse.json({ error: "itemNames is required." }, { status: 400 });
            }
            if (!Number.isFinite(refundAmountCents) || refundAmountCents <= 0) {
                return NextResponse.json(
                    { error: "refundAmountCents is required (the amount actually refunded in Square)." },
                    { status: 400 },
                );
            }

            const order = await getShopOrderById(id);
            if (!order) {
                return NextResponse.json({ error: "Order not found." }, { status: 404 });
            }

            const lineNames = parseItems(order.items_json)
                .map((i) => String(i?.name || i?.itemName || i?.title || "").trim())
                .filter(Boolean);
            const unknown = itemNames.filter((n) => !lineNames.includes(n));
            if (unknown.length) {
                return NextResponse.json(
                    { error: `Not on this order: ${unknown.join(", ")}`, itemsOnOrder: lineNames },
                    { status: 400 },
                );
            }
            if (itemNames.length >= lineNames.length) {
                // Nothing survives, so this is a cancellation and the cancelled email is the honest one.
                return NextResponse.json(
                    { error: "That is every line on the order — cancel and refund it instead." },
                    { status: 400 },
                );
            }

            const sent = await sendOrderItemRefundedEmail(order, { itemNames, refundAmountCents });
            if (!sent) {
                return NextResponse.json(
                    { error: "Email not sent (no recipient address on the order, or mail is not configured)." },
                    { status: 502 },
                );
            }

            logger?.info?.({
                event: "admin.shop.orders.item_refunded.email",
                orderId: order.id,
                itemCount: itemNames.length,
                refundAmountCents,
            });

            return NextResponse.json({ sent: true, itemNames, refundAmountCents });
        } catch (error) {
            return internalError(error, { event: "admin.shop.orders.item_refunded.failure" });
        }
    });
}
