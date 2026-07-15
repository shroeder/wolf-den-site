import { createHmac, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import {
    createMysteryWebhookEvent,
    runMysteryWebhookProcessing,
} from "@/lib/mystery-bags";
import { INVENTORY_EVENT_TYPES } from "@/lib/product-alerts/state";
import { reconcileIfDue } from "@/lib/inventory-feed/reconcile";
import { withRequestLogging } from "@/lib/server-logger";
import { db } from "@/lib/db";
import { awardPurchaseXp } from "@/lib/marketplace/xp";

export const runtime = "nodejs";

// Fetch an order's merchandise subtotal (total minus tax) in cents, so in-store XP is granted on the same
// basis as online (pre-tax merchandise). Best-effort — returns null if the order can't be read.
async function fetchOrderSubtotalCents(orderId) {
    const token = process.env.SQUARE_ACCESS_TOKEN;
    if (!token || !orderId) return null;
    try {
        const res = await fetch(`https://connect.squareup.com/v2/orders/${encodeURIComponent(orderId)}`, {
            headers: {
                Authorization: `Bearer ${token}`,
                "Square-Version": process.env.SQUARE_API_VERSION || "2026-01-22",
            },
        });
        if (!res.ok) return null;
        const order = (await res.json())?.order;
        if (!order) return null;
        const total = Number(order.total_money?.amount || 0);
        const tax = Number(order.total_tax_money?.amount || 0);
        return Math.max(0, total - tax);
    } catch {
        return null;
    }
}

// Fetch a Square customer's email so an in-store sale can be tied to the marketplace account by email.
async function fetchCustomerEmail(customerId) {
    const token = process.env.SQUARE_ACCESS_TOKEN;
    if (!token || !customerId) return null;
    try {
        const res = await fetch(`https://connect.squareup.com/v2/customers/${encodeURIComponent(customerId)}`, {
            headers: {
                Authorization: `Bearer ${token}`,
                "Square-Version": process.env.SQUARE_API_VERSION || "2026-01-22",
            },
        });
        if (!res.ok) return null;
        return (await res.json())?.customer?.email_address || null;
    } catch {
        return null;
    }
}

// In-store loyalty: a completed Square payment credits purchase XP to the matching marketplace account.
// Linked by square_customer_id OR by the Square customer's email — and if no account exists yet, the
// credit is PARKED by email (inside awardPurchaseXp) so it's waiting when they register. Online shop
// orders are skipped here (already awarded at checkout; double-credit avoided by matching the payment id
// against shop_orders). Deduped by Square order/payment id so Square's retries never double-credit.
async function handlePurchaseLoyalty(payload) {
    const payment = payload?.data?.object?.payment;
    if (!payment) return { handled: false, reason: "no_payment" };
    if (payment.status !== "COMPLETED") return { handled: true, skipped: "not_completed" };

    const customerId = payment.customer_id || null;
    if (!customerId) return { handled: true, skipped: "no_customer" };

    // Online orders already awarded XP by email at checkout — don't double-credit them.
    const online = await db
        .queryOne(`SELECT 1 FROM shop_orders WHERE square_payment_id = $1 LIMIT 1`, [payment.id])
        .catch(() => null);
    if (online) return { handled: true, skipped: "online_order" };

    const orderId = payment.order_id || payment.id;
    let amountCents = Number(payment.amount_money?.amount || 0);
    if (payment.order_id) {
        const subtotal = await fetchOrderSubtotalCents(payment.order_id);
        if (subtotal != null) amountCents = subtotal;
    }

    const email = await fetchCustomerEmail(customerId);
    const buyerId = await awardPurchaseXp({ email, squareCustomerId: customerId, amountCents, orderId: `sq:${orderId}` });
    return { handled: true, awarded: Boolean(buyerId), parked: !buyerId && Boolean(email), buyerId: buyerId || null };
}

function isValidSquareSignature({ signature, body, requestUrl }) {
    const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY || "";

    if (!signature || !signatureKey || !requestUrl) {
        return false;
    }

    const expected = createHmac("sha256", signatureKey)
        .update(`${requestUrl}${body}`)
        .digest("base64");

    const providedBuffer = Buffer.from(signature, "utf8");
    const expectedBuffer = Buffer.from(expected, "utf8");

    if (providedBuffer.length !== expectedBuffer.length) {
        return false;
    }

    return timingSafeEqual(providedBuffer, expectedBuffer);
}

function tryParseJson(text) {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

function getProviderEventId(payload) {
    return payload?.event_id || payload?.eventId || payload?.id || payload?.data?.id || null;
}

function getEventType(payload) {
    return payload?.type || payload?.event_type || payload?.eventType || payload?.data?.type || null;
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/webhooks/square", async ({ logger, internalError }) => {
        const signature = request.headers.get("x-square-hmacsha256-signature") || "";
        const bodyText = await request.text();
        const requestUrl = request.url;
        const payload = tryParseJson(bodyText);

        if (!payload) {
            return NextResponse.json(
                {
                    error: "bad_request",
                    code: "bad_request",
                    message: "Invalid JSON payload.",
                },
                { status: 400 }
            );
        }

        const signatureValid = isValidSquareSignature({
            signature,
            body: bodyText,
            requestUrl,
        });

        if (!signatureValid) {
            return NextResponse.json(
                {
                    error: "invalid_webhook_signature",
                    code: "invalid_webhook_signature",
                    message: "Webhook signature verification failed.",
                },
                { status: 401 }
            );
        }

        const eventType = getEventType(payload);

        // In-store loyalty XP. Side-effect only — never returns early, so mystery-bag/inventory handling
        // below still runs for the same event. Best-effort: a failure must not 500 the webhook.
        if (eventType === "payment.created" || eventType === "payment.updated") {
            try {
                const res = await handlePurchaseLoyalty(payload);
                logger.info("webhooks.square.loyalty", { eventType, ...res });
            } catch (error) {
                logger.error("webhooks.square.loyalty.failure", error, { eventType });
            }
        }

        // Inventory/catalog changes drive the new-arrival feed, not mystery bags. Trigger a throttled
        // reconcile (new items / restocks / price drops -> Discord + website) and return early. The
        // periodic cron is the reliability backbone; this just makes changes show up fast. Best-effort:
        // a failure must not 500 the webhook (Square would retry the whole event), so it's caught.
        if (INVENTORY_EVENT_TYPES.has(eventType)) {
            let reconcile = null;

            try {
                reconcile = await reconcileIfDue();

                logger.info("webhooks.square.inventory_feed", { eventType, ...reconcile });
            } catch (error) {
                logger.error("webhooks.square.inventory_feed.failure", error, { eventType });
            }

            return NextResponse.json({ success: true, eventType, reconcile }, { status: 200 });
        }

        try {
            const row = await createMysteryWebhookEvent({
                provider: "square",
                providerEventId: getProviderEventId(payload),
                eventType: getEventType(payload),
                idempotencyKey: getProviderEventId(payload)
                    ? `square:${getProviderEventId(payload)}`
                    : null,
                signatureValid: true,
                payload,
            });

            // Process inline (awaited) rather than fire-and-forget. On Vercel the function is
            // frozen once the response is returned, so setImmediate work never finished and the
            // card removal + Square variation cleanup silently never ran. This is fast (one order
            // fetch + a few writes + one delete) and stays well within Square's webhook timeout.
            const result = await runMysteryWebhookProcessing(row.id);

            logger.info("webhooks.square.processed", {
                eventId: row.id,
                status: result?.status || "unknown",
                processed: result?.processed ?? false,
                assignedCount: result?.assignedCount || 0,
            });

            return NextResponse.json(
                {
                    success: true,
                    eventId: row.id,
                    status: result?.status || "queued",
                    processed: result?.processed ?? false,
                },
                { status: 200 }
            );
        } catch (error) {
            return internalError(error, {
                event: "webhooks.square.enqueue.failure",
                eventType: getEventType(payload),
            });
        }
    });
}
