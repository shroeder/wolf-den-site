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
import { createLoyaltyClaim } from "@/lib/marketplace/loyalty-claim.js";
import { sendAdminPush } from "@/lib/push/send.js";

export const runtime = "nodejs";

const SITE_URL = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://www.wolfdengamingmn.com";

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

// Fetch a Square customer's email + phone so an in-store sale can be tied to the marketplace account.
async function fetchCustomerContact(customerId) {
    const token = process.env.SQUARE_ACCESS_TOKEN;
    if (!token || !customerId) return { email: null, phone: null };
    try {
        const res = await fetch(`https://connect.squareup.com/v2/customers/${encodeURIComponent(customerId)}`, {
            headers: {
                Authorization: `Bearer ${token}`,
                "Square-Version": process.env.SQUARE_API_VERSION || "2026-01-22",
            },
        });
        if (!res.ok) return { email: null, phone: null };
        const customer = (await res.json())?.customer || {};
        return { email: customer.email_address || null, phone: customer.phone_number || null };
    } catch {
        return { email: null, phone: null };
    }
}

// Push a scan-to-earn claim's QR out to staff phones (owner + employee), so a cashier can show it to a
// customer who isn't linked. The route string drives in-app navigation straight to the QR screen.
async function pushLoyaltyClaim({ token, amountCents }) {
    const cents = Math.max(0, Math.trunc(amountCents) || 0);
    const dollars = (cents / 100).toFixed(2);
    await sendAdminPush({
        title: "Loyalty — offer points",
        body: `Show the QR so this customer banks points on their $${dollars} purchase.`,
        route: `loyaltyClaim/${token}/${cents}`,
        channels: ["full", "employee"],
        data: { token, amountCents: String(cents), claimUrl: `${SITE_URL}/marketplace/claim/${token}` },
    });
}

// In-store loyalty for a completed Square payment.
//   1. Online shop orders are skipped (already awarded at checkout; matched by payment id).
//   2. If the sale already carries a Square customer we can map to an account (by square_customer_id or
//      that customer's email), award silently — no QR needed. Unmatched-but-known emails are PARKED so
//      the credit waits for sign-up.
//   3. Otherwise mint a single-use claim for this payment and push its QR to staff phones — the customer
//      scans it with their own phone to bank the XP.
// Deduped by Square order id end to end so retries / a later sign-up never double-credit.
async function handlePurchaseLoyalty(payload) {
    const payment = payload?.data?.object?.payment;
    if (!payment) return { handled: false, reason: "no_payment" };
    if (payment.status !== "COMPLETED") return { handled: true, skipped: "not_completed" };

    // Online orders already awarded XP by email at checkout — don't double-credit them.
    const online = await db
        .queryOne(`SELECT 1 FROM shop_orders WHERE square_payment_id = $1 LIMIT 1`, [payment.id])
        .catch(() => null);
    if (online) return { handled: true, skipped: "online_order" };

    const orderId = payment.order_id || payment.id;
    const awardOrderId = `sq:${orderId}`;
    let amountCents = Number(payment.amount_money?.amount || 0);
    if (payment.order_id) {
        const subtotal = await fetchOrderSubtotalCents(payment.order_id);
        if (subtotal != null) amountCents = subtotal;
    }

    // Try to auto-credit a known customer (by Square id, email, or phone; also parks by email otherwise).
    if (payment.customer_id) {
        const { email, phone } = await fetchCustomerContact(payment.customer_id);
        const buyerId = await awardPurchaseXp({ email, phone, squareCustomerId: payment.customer_id, amountCents, orderId: awardOrderId });
        if (buyerId) return { handled: true, awarded: true, buyerId };
    }

    // Nobody to credit — offer the QR so the customer can claim it on their own phone.
    const claim = await createLoyaltyClaim({ squarePaymentId: payment.id, awardOrderId, amountCents, locationId: payment.location_id });
    // Push ONLY when the claim is first minted. Square sends payment.created AND payment.updated (and
    // can repeat payment.updated), and createLoyaltyClaim reuses the existing claim on those retries —
    // pushing every time is what caused multiple notifications per transaction.
    if (claim?.isNew) await pushLoyaltyClaim({ token: claim.token, amountCents: claim.amountCents });
    return { handled: true, awarded: false, claimed: Boolean(claim) };
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
