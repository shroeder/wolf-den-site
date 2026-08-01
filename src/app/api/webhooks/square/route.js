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
import { awardPurchaseXp, resolveBuyerId } from "@/lib/marketplace/xp";
import { createLoyaltyClaim } from "@/lib/marketplace/loyalty-claim.js";
import { recordSquareStoreCreditRedemption, getStoreCredit } from "@/lib/marketplace/store-credit.js";
import { sendAdminPush } from "@/lib/push/send.js";

export const runtime = "nodejs";

const SITE_URL = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://www.wolfdengamingmn.com";

// Fetch an order's merchandise subtotal (total minus tax) in cents, so in-store XP is granted on the same
// basis as online (pre-tax merchandise). Best-effort — returns null if the order can't be read.
// What a sale is worth in loyalty terms: the pre-tax subtotal, MINUS any gift card sold on it.
//
// Tax is excluded so we never pay points on the state's money.
//
// Gift cards are excluded because otherwise the same dollar earns twice — once when the card is bought, and
// again when it is spent on actual merchandise. Store-credit top-ups were already skipped for exactly this
// reason ("the buyer already got their coins at checkout"); a gift card is the same shape and was missed.
//
// The PURCHASE is the side that gets skipped, not the spend. Buying a gift card moves money without moving
// stock — the merchandise sale happens later — and gift cards are usually bought FOR somebody else, so the
// person who should earn the points is whoever eventually spends it.
//
// A MIXED sale still earns on its merchandise: only the gift-card lines come out, so buying a $50 card and a
// $30 booster box on one ticket earns on the $30.
async function fetchOrderEligibleCents(orderId) {
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
        const subtotal = Math.max(0, total - tax);
        // item_type is Square's own marker for a gift card line (activation OR reload). The name check is a
        // belt-and-braces fallback for a manually-rung card that was never a catalog gift-card object.
        const giftCard = (order.line_items || [])
            .filter((li) => li.item_type === "GIFT_CARD" || /gift\s*card/i.test(li.name || ""))
            .reduce((n, li) => n + Number(li.total_money?.amount || 0), 0);
        return { subtotal, giftCard, eligible: Math.max(0, subtotal - giftCard) };
    } catch {
        return null;
    }
}

// Fetch an order's tenders (payment methods applied to the sale) so we can spot a store-credit custom
// tender. Best-effort — returns [] if the order can't be read.
async function fetchOrderTenders(orderId) {
    const token = process.env.SQUARE_ACCESS_TOKEN;
    if (!token || !orderId) return [];
    try {
        const res = await fetch(`https://connect.squareup.com/v2/orders/${encodeURIComponent(orderId)}`, {
            headers: {
                Authorization: `Bearer ${token}`,
                "Square-Version": process.env.SQUARE_API_VERSION || "2026-01-22",
            },
        });
        if (!res.ok) return [];
        const order = (await res.json())?.order;
        return Array.isArray(order?.tenders) ? order.tenders : [];
    } catch {
        return [];
    }
}

// The store's ONE custom register tender for store credit — the exact name from Square → Payment methods →
// Custom payment methods. Hardcoded (no env var). Trades AND real redemptions both ring on this same tender,
// so an exact name match only tells us "the Store Credit tender was used"; whether it's a genuine REDEMPTION
// vs a trade-in applied at the register is settled downstream by the member actually having banked store
// credit to spend (see the balance gate in the webhook handler). Match name only — never the free-text note.
const STORE_CREDIT_TENDER_NAME = "Store Credit";
function storeCreditNameMatches(text) {
    return String(text == null ? "" : text).trim().toLowerCase() === STORE_CREDIT_TENDER_NAME.toLowerCase();
}

// Detect the store-credit tender on a paid sale. Store credit is rung up at the register as a custom
// PAYMENT TYPE (tender), not a line item, so we look in two places:
//   1. order.tenders[] — a tender of type OTHER / WALLET / EXTERNAL whose name or note names store credit.
//   2. payment.external_details — a POS custom tender can surface only on the payment as source_type
//      "EXTERNAL" with an external_details.source/type that names store credit.
// Returns { used, amountCents } where amountCents is the store-credit portion of the sale in cents.
async function detectStoreCreditTender(payment) {
    let amountCents = 0;

    const orderId = payment?.order_id;
    if (orderId) {
        const tenders = await fetchOrderTenders(orderId);
        for (const tender of tenders) {
            const type = String(tender?.type || "").toUpperCase();
            if (type !== "OTHER" && type !== "WALLET" && type !== "EXTERNAL") continue;
            // Match the tender NAME only (never the free-text note — cashier notes catch trades/misc).
            if (storeCreditNameMatches(tender?.name)) {
                amountCents += Number(tender?.amount_money?.amount || 0);
            }
        }
    }

    // Fall back to the payment's own EXTERNAL details when the order didn't surface it.
    if (amountCents <= 0 && String(payment?.source_type || "").toUpperCase() === "EXTERNAL") {
        const ext = payment?.external_details || {};
        if (storeCreditNameMatches(ext.source) || storeCreditNameMatches(ext.type)) {
            amountCents += Number(payment?.amount_money?.amount || 0);
        }
    }

    return { used: amountCents > 0, amountCents: Math.max(0, Math.trunc(amountCents)) };
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
    // Fire on APPROVED too, not just COMPLETED. Square sends payment.created/APPROVED the instant the card
    // is tapped; COMPLETED only lands after card settlement (seconds-to-minutes later) — which is what made
    // the loyalty-QR push arrive way too late, after the customer had left. The dedup below (claim.isNew +
    // awardPurchaseXp's order-id dedupe) means the later COMPLETED event never double-pushes or double-credits.
    if (payment.status !== "COMPLETED" && payment.status !== "APPROVED") {
        return { handled: true, skipped: `status_${(payment.status || "unknown").toLowerCase()}` };
    }

    // Online orders already awarded XP by email at checkout — don't double-credit them.
    const online = await db
        .queryOne(`SELECT 1 FROM shop_orders WHERE square_payment_id = $1 LIMIT 1`, [payment.id])
        .catch(() => null);
    if (online) return { handled: true, skipped: "online_order" };

    // Store-credit top-ups are NOT merchandise sales — the buyer already got their coins + credit at
    // checkout. Never award loyalty or mint a staff QR for them. Matched by reference_id (set when the
    // payment is created, so there's no race with the square_payment_id write) or the payment id.
    const creditTopUp = await db
        .queryOne(`SELECT 1 FROM mkt_credit_purchase WHERE id::text = $1 OR square_payment_id = $2 LIMIT 1`, [payment.reference_id || null, payment.id])
        .catch(() => null);
    if (creditTopUp) return { handled: true, skipped: "credit_purchase" };

    const orderId = payment.order_id || payment.id;
    const awardOrderId = `sq:${orderId}`;
    let amountCents = Number(payment.amount_money?.amount || 0);
    if (payment.order_id) {
        const amt = await fetchOrderEligibleCents(payment.order_id);
        if (amt) {
            // Checked BEFORE the auto-credit below, so a gift-card sale never awards a customer 0 XP and never
            // mints a staff QR for a purchase that earns nothing.
            if (amt.giftCard > 0 && amt.eligible <= 0) return { handled: true, skipped: "gift_card_purchase" };
            amountCents = amt.eligible;
        }
    }

    // Try to auto-credit a known customer (by Square id, email, or phone; also parks by email otherwise).
    if (payment.customer_id) {
        const { email, phone } = await fetchCustomerContact(payment.customer_id);
        const buyerId = await awardPurchaseXp({ email, phone, squareCustomerId: payment.customer_id, amountCents, orderId: awardOrderId });
        if (buyerId) return { handled: true, awarded: true, buyerId };
    }

    // A $0 payment (fully-comped sale, a $0 auth, etc.) earns nothing — never offer a QR for it.
    if (amountCents <= 0) return { handled: true, skipped: "zero_amount" };

    // Nobody to credit — offer the QR so the customer can claim it on their own phone.
    const claim = await createLoyaltyClaim({ squarePaymentId: payment.id, awardOrderId, amountCents, locationId: payment.location_id });
    // Push ONLY when the claim is first minted. Square sends payment.created AND payment.updated (and
    // can repeat payment.updated), and createLoyaltyClaim reuses the existing claim on those retries —
    // pushing every time is what caused multiple notifications per transaction.
    if (claim?.isNew) await pushLoyaltyClaim({ token: claim.token, amountCents: claim.amountCents });
    return { handled: true, awarded: false, claimed: Boolean(claim) };
}

// In-store STORE-CREDIT redemption alert. Store credit is entered at the register as a custom tender (a
// payment type), not a line item, and today NO in-store redemptions are recorded — this closes that gap.
// When a paid sale carries the store-credit tender we alert the admin + employee apps and, if the sale
// carries a mappable Square customer, auto-deduct the amount from their balance so the ledger stays honest.
// Additive to the loyalty flow: a store-credit sale still runs the normal XP/loyalty path. Deduped per order
// (ref sc:<orderId>) so Square's repeated payment.created/updated events fire the push + deduct exactly once.
async function handleStoreCreditRedemption(payload) {
    const payment = payload?.data?.object?.payment;
    if (!payment) return { handled: false, reason: "no_payment" };
    if (payment.status !== "COMPLETED" && payment.status !== "APPROVED") {
        return { handled: true, skipped: `status_${(payment.status || "unknown").toLowerCase()}` };
    }

    const { used, amountCents } = await detectStoreCreditTender(payment);
    if (!used || amountCents <= 0) return { handled: true, used: false };

    const orderId = String(payment.order_id || payment.id);

    // Best-effort member resolution from the Square customer on the sale (same rules as loyalty XP).
    let buyerId = null;
    let alias = "";
    if (payment.customer_id) {
        const { email, phone } = await fetchCustomerContact(payment.customer_id);
        buyerId = await resolveBuyerId({ squareCustomerId: payment.customer_id, email, phone });
        if (buyerId) {
            const row = await db.queryOne(`SELECT alias FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
            alias = row?.alias ? `@${row.alias}` : "";
        }
    }

    // ── Redemption vs trade gate ──────────────────────────────────────────────────────────────────────────
    // The store rings BOTH real store-credit redemptions AND trade-in value (cards traded against a purchase)
    // on the single "Store Credit" custom tender, so they're identical at the tender level. The reliable tell:
    // a real redemption spends a member's BANKED store credit — a trade-in customer has none (or not enough).
    // So we only treat it as a redemption (alert + auto-deduct) when we can tie it to a member who actually has
    // a balance that covers it. No member, or an insufficient balance → it's a trade → ignore silently.
    const balanceCents = buyerId ? await getStoreCredit(buyerId).catch(() => 0) : 0;
    if (!buyerId || balanceCents < amountCents) {
        return { handled: true, used: true, skipped: "not_a_redemption" };
    }

    const result = await recordSquareStoreCreditRedemption({ orderId, buyerId, amountCents });
    // Push ONLY on the first time this order is processed (like the loyalty claim?.isNew guard), so retries
    // never re-notify. All FCM data values are strings (see the push contract for store_credit_redeem).
    if (result.ok && !result.alreadyProcessed) {
        const dollars = (amountCents / 100).toFixed(2);
        if (buyerId && result.deducted) {
            await sendAdminPush({
                title: "🏦 Store credit used",
                body: `$${dollars} deducted from ${alias || "a member"} — tap to review.`,
                route: "store_credit_redeem",
                data: { buyerId, alias, amountCents: String(amountCents), orderId, autoDeducted: "true" },
                channels: ["full", "employee"],
            });
        } else if (buyerId) {
            // Member known but the balance couldn't cover it (or a transient deduct miss) — flag for manual
            // handling, but still hand the app the member so staff can pick them straight away.
            await sendAdminPush({
                title: "🏦 Store credit used",
                body: `$${dollars} in store credit used by ${alias || "a member"}, but it wasn't auto-deducted — tap to record it.`,
                route: "store_credit_redeem",
                data: { buyerId, alias, amountCents: String(amountCents), orderId, autoDeducted: "false" },
                channels: ["full", "employee"],
            });
        } else {
            await sendAdminPush({
                title: "🏦 Store credit used",
                body: `$${dollars} in store credit was used — tap to record it (pick the member).`,
                route: "store_credit_redeem",
                data: { buyerId: "", alias: "", amountCents: String(amountCents), orderId, autoDeducted: "false" },
                channels: ["full", "employee"],
            });
        }
    }

    return { handled: true, used: true, buyerId: buyerId || null, deducted: result.deducted, alreadyProcessed: result.alreadyProcessed };
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

            // In-store store-credit redemption (custom tender) alert + auto-deduct. Additive + independent of
            // loyalty; deduped per order so it fires once. Best-effort: a failure must not 500 the webhook.
            try {
                const res = await handleStoreCreditRedemption(payload);
                logger.info("webhooks.square.store_credit", { eventType, ...res });
            } catch (error) {
                logger.error("webhooks.square.store_credit.failure", error, { eventType });
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
