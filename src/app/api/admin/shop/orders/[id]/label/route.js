import { after, NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { getShopOrderById, setShopOrderShippingLabel } from "@/lib/shop-orders";
import { sendOrderStatusEmail } from "@/lib/shop-order-email.js";
import { buyShippingLabel, getShipment, isEasyPostEnabled } from "@/lib/shipping/easypost";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// What the common EasyPost refusals actually mean, in the words of someone standing at a counter trying to
// post a parcel. These three cover nearly every first-ever label purchase that fails.
function hintFor(error) {
    const m = String(error?.message || "").toLowerCase();
    if (/payment|billing|funds|balance|card/.test(m)) {
        return "EasyPost needs a payment method on the account before it will sell postage. "
            + "Add a card at easypost.com under Billing, then try again.";
    }
    if (/carrier account|not enabled|unauthorized|permission|ups/.test(m)) {
        return "The carrier account for this service isn't set up on EasyPost yet. "
            + "UPS GroundSaver in particular needs the UPS account enabled under Carriers.";
    }
    if (/rate|expired|not found/.test(m)) {
        return "The rate quoted at checkout is no longer on offer. The shipment needs re-rating.";
    }
    return null;
}

// ── WHY CAN THIS LABEL NOT BE BOUGHT? ────────────────────────────────────────────────────────────────────────
// ⚠️ READ-ONLY. IT BUYS NOTHING. Diagnosing a failed label meant either reading a Vercel log nobody at the
// shop has access to, or pressing Buy again and risking a real charge to find out what the error was. Neither
// is a reasonable thing to ask of somebody standing at a counter with a parcel.
//
// This asks EasyPost what it currently thinks of the shipment and reports it: whether postage already exists
// (a previous attempt that bought and failed to record), whether the rate we stored is still on offer, and
// what rates ARE on offer now.
export async function GET(request, { params }) {
    return withRequestLogging(request, "GET /api/admin/shop/orders/[id]/label", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;

        const { id } = await params;
        try {
            const order = await getShopOrderById(id);
            if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });

            const base = {
                orderId: id,
                easyPostConfigured: isEasyPostEnabled(),
                fulfillmentMode: order.fulfillment_mode,
                shipmentId: order.easypost_shipment_id || null,
                storedRateId: order.easypost_rate_id || null,
                storedCarrier: order.shipping_carrier || null,
                storedService: order.shipping_service || null,
                recordedLabelUrl: order.shipping_label_url || null,
            };

            if (!isEasyPostEnabled()) return NextResponse.json({ ...base, verdict: "EasyPost is not configured on the server." });
            if (!order.easypost_shipment_id) return NextResponse.json({ ...base, verdict: "This order has no EasyPost shipment." });

            const shipment = await getShipment(order.easypost_shipment_id);
            const rateStillOffered = Boolean(shipment?.rateIds?.includes(order.easypost_rate_id));

            return NextResponse.json({
                ...base,
                shipmentStatus: shipment?.status || null,
                alreadyHasPostage: Boolean(shipment?.labelUrl),
                easyPostLabelUrl: shipment?.labelUrl || null,
                trackingCode: shipment?.trackingCode || null,
                rateStillOffered,
                ratesOnOffer: shipment?.rateIds?.length ?? 0,
                verdict: shipment?.labelUrl
                    ? "Postage ALREADY BOUGHT for this shipment. Pressing Buy will recover it rather than charge again."
                    : rateStillOffered
                        ? "The shipment is fine and the quoted rate is still on offer. A failure here is an account-level refusal from EasyPost (billing or carrier setup) — press Buy to see the exact message."
                        : "The rate quoted at checkout is NO LONGER on offer. The shipment needs re-rating before a label can be bought.",
            });
        } catch (error) {
            if (error?.easyPostStatus) {
                return NextResponse.json({
                    orderId: id,
                    error: error.message,
                    easyPostStatus: error.easyPostStatus,
                    hint: hintFor(error),
                    verdict: "EasyPost refused a plain read of this shipment, so the problem is the API key or the account itself, not the parcel.",
                }, { status: 502 });
            }
            return internalError(error, { event: "admin.shop.order.label.probe_failure" });
        }
    });
}

// Owner buys the EasyPost shipping label for an order (from the shipment + rate chosen at checkout),
// stores the label URL + tracking, and marks the order shipped.
export async function POST(request, { params }) {
    return withRequestLogging(request, "POST /api/admin/shop/orders/[id]/label", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;

        if (!isEasyPostEnabled()) {
            return NextResponse.json({ error: "EasyPost is not configured." }, { status: 400 });
        }

        // ⚠️ RESOLVED OUTSIDE THE try SO THE catch CAN NAME THE ORDER. It was destructured inside, which
        // scoped it away from the error handler and left the failure log without the one field that makes it
        // findable.
        const { id } = await params;

        try {
            const order = await getShopOrderById(id);

            if (!order) {
                return NextResponse.json({ error: "Order not found." }, { status: 404 });
            }

            if (order.shipping_label_url) {
                // Already purchased — return it rather than buying a second label.
                return NextResponse.json({ order, labelUrl: order.shipping_label_url, alreadyBought: true });
            }

            if (!order.easypost_shipment_id || !order.easypost_rate_id) {
                return NextResponse.json(
                    { error: "This order has no EasyPost shipment (pickup order, or placed before shipping was enabled)." },
                    { status: 400 }
                );
            }

            // ── ⚠️ ASK EASYPOST BEFORE SPENDING ANYTHING ────────────────────────────────────
            // The order row says no label, but the order row is written AFTER the purchase — so if a
            // previous attempt bought a label and then failed on the write, the money is already gone and
            // the only record of it is at EasyPost. Buying again would charge a second time for a parcel
            // that already has postage.
            //
            // One free GET on the one operation in this app that cannot be undone.
            let label = await getShipment(order.easypost_shipment_id).catch(() => null);
            let recovered = false;

            if (label?.labelUrl) {
                recovered = true;
                logger.warn("admin.shop.order.label.recovered", {
                    orderId: id,
                    shipmentId: order.easypost_shipment_id,
                    reason: "shipment already had postage; a previous attempt bought it and failed to record it",
                });
            } else {
                // The stored rate has to still be on offer. EasyPost refuses a rate it has aged out, and
                // "rate not found" is a far less useful thing for Luke to read than this is.
                if (label?.rateIds?.length && !label.rateIds.includes(order.easypost_rate_id)) {
                    return NextResponse.json({
                        error: "The shipping rate quoted at checkout has expired, so this label can't be bought at that price. "
                            + "EasyPost will need a fresh rate for this shipment.",
                        code: "rate_expired",
                        shipmentId: order.easypost_shipment_id,
                        rateId: order.easypost_rate_id,
                    }, { status: 409 });
                }

                label = await buyShippingLabel({
                    shipmentId: order.easypost_shipment_id,
                    rateId: order.easypost_rate_id,
                });
            }

            // ⚠️ IF THIS WRITE FAILS THE LABEL IS STILL BOUGHT. It must not take the response down with
            // it: the URL is returned either way, and the recovery path above means the next attempt finds
            // the label rather than buying another.
            let updated = null;
            try {
                updated = await setShopOrderShippingLabel(id, {
                    labelUrl: label.labelUrl,
                    trackingNumber: label.trackingCode,
                    carrier: label.carrier,
                    service: label.service,
                });
            } catch (writeError) {
                logger.error("admin.shop.order.label.record_failed", writeError, {
                    orderId: id,
                    labelUrl: label.labelUrl,
                    trackingCode: label.trackingCode,
                });
                return NextResponse.json({
                    order,
                    labelUrl: label.labelUrl,
                    trackingCode: label.trackingCode,
                    recovered,
                    warning: "The label was bought but couldn't be saved to the order. Print it from this link now "
                        + "— the order still shows as unfulfilled.",
                }, { status: 200 });
            }

            // Buying a label is the SECOND way an order becomes "shipped" (the status dropdown is the
            // other), and it's the one that has the tracking number, so the customer hears it from here.
            // Guarded by the already-bought early return above, so one label = one email.
            if (order.fulfillment_status !== "shipped") {
                after(async () => {
                    try {
                        await sendOrderStatusEmail(updated, "shipped");
                    } catch (emailError) {
                        logger.warn("admin.shop.order.label.ship_email_failed", {
                            orderId: id,
                            errorMessage: emailError instanceof Error ? emailError.message : "unknown_error",
                        });
                    }
                });
            }

            return NextResponse.json({
                order: updated, labelUrl: label.labelUrl, trackingCode: label.trackingCode, recovered,
            });
        } catch (error) {
            // ── ⚠️ THE REAL REASON, NOT "Internal Server Error" ───────────────────────────────────
            // This endpoint is owner-and-staff only, and the generic 500 body meant the one person who could
            // actually fix the problem was the one person not allowed to see it — the EasyPost message sat
            // in a Vercel log needing dashboard access to read. There is nothing here worth hiding from the
            // people who run the shop.
            if (error?.easyPostStatus) {
                logger.error("admin.shop.order.label.easypost_failed", error, {
                    orderId: id,
                    easyPostStatus: error.easyPostStatus,
                    easyPostCode: error.easyPostCode || null,
                });
                return NextResponse.json({
                    error: error.message,
                    code: error.easyPostCode || "easypost_error",
                    // The three that account for almost every failed first purchase, named so nobody has to
                    // go and look them up.
                    hint: hintFor(error),
                    easyPostStatus: error.easyPostStatus,
                }, { status: 502 });
            }
            return internalError(error, { event: "admin.shop.order.label.failure" });
        }
    });
}
