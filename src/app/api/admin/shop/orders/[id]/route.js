import { after, NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { getShopOrderById, setShopOrderFulfillment } from "@/lib/shop-orders";
import { sendOrderCancelledEmail, sendOrderStatusEmail } from "@/lib/shop-order-email.js";
import { parseTrackingFromScan } from "@/lib/shipping/tracking-scan.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FULFILLMENT = new Set(["unfulfilled", "ready", "shipped", "picked_up", "cancelled"]);

// Owner marks an online order ready/shipped/picked up/cancelled and records a tracking number.
export async function PATCH(request, { params }) {
    return withRequestLogging(request, "PATCH /api/admin/shop/orders/[id]", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const { id } = await params;
            const body = await request.json().catch(() => ({}));
            const fulfillmentStatus = FULFILLMENT.has(body.fulfillmentStatus) ? body.fulfillmentStatus : null;

            // ── A RAW LABEL SCAN, PARSED HERE ───────────────────────────────────────────────────────
            // Luke: "when we ship it should let us scan or take a picture of the shipping label and email
            // the tracking info to the customer" — done from the admin/employee app, which scans with ML
            // Kit on-device and posts what the barcode said.
            //
            // ⚠️ THE APP SENDS WHAT IT READ; THE SERVER DECIDES WHAT IT MEANS. The barcode's raw value is
            // not the tracking number — USPS leads with 420 + the destination ZIP, UPS buries the 1Z in a
            // structured 2D block. That logic lives in ONE place with its own checks beside it, rather than
            // being ported into Kotlin where it would drift from this copy the first time a carrier changed
            // a format. See tracking-scan.js.
            const scanRaw = typeof body.scanRaw === "string" ? body.scanRaw : "";
            const scanned = scanRaw ? parseTrackingFromScan(scanRaw) : null;
            if (scanRaw && !scanned) {
                // Told plainly rather than saved as-is: a label that will not parse is a thing to look at,
                // and the alternative is emailing a customer somebody's ZIP code.
                return NextResponse.json({ error: "Couldn't read a tracking number off that scan." }, { status: 422 });
            }

            const trackingNumber = scanned
                ? scanned.tracking
                : (typeof body.trackingNumber === "string" ? body.trackingNumber.trim() : null);
            // A resend changes nothing and is still a valid request — without this it would be turned away
            // as "Nothing to update" before the send below ever came into view.
            if (!fulfillmentStatus && trackingNumber === null && body.resend !== true) {
                return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
            }
            // Read the current status BEFORE the write so we only email on an actual transition. Tapping
            // "Ready" twice, or saving a tracking number on an already-shipped order, must not re-notify
            // the customer.
            const previous = await getShopOrderById(id);

            // ── WHICH CARRIER ACTUALLY HAS THE PARCEL ───────────────────────────────────────────
            // Luke, while EasyPost is blocked: "we are manually doing shipping using usps and we gota
            // account for that flow in the app."
            //
            // ⚠️ A MANUALLY POSTED PARCEL CONTRADICTS THE QUOTE. shipping_carrier was set at CHECKOUT from
            // the rate the customer chose — it says what we INTENDED to ship with, and an order quoted UPS
            // and then carried to the post office keeps saying UPS against a USPS number. Correct it from the
            // number's own shape, which is evidence rather than intent.
            //
            // Only when no label was bought here: a label bought through us IS the carrier, and the scan of
            // our own label should never be allowed to argue with it.
            let learnedCarrier = null;
            if (trackingNumber && !previous?.shipping_label_url) {
                const shape = scanned || parseTrackingFromScan(trackingNumber);
                if (shape?.carrier) learnedCarrier = shape.carrier;
            }

            const order = await setShopOrderFulfillment(id, { fulfillmentStatus, trackingNumber, carrier: learnedCarrier });
            if (!order) {
                return NextResponse.json({ error: "Order not found." }, { status: 404 });
            }

            const statusChanged =
                Boolean(fulfillmentStatus) && previous?.fulfillment_status !== fulfillmentStatus;

            // ── A TRACKING NUMBER ARRIVING IS ITSELF NEWS ───────────────────────────────────────────
            // Luke: "when we ship it should ... email the tracking info to the customer."
            //
            // The email only ever fired on a STATUS transition, so the common shipping-day order — mark it
            // shipped, go and print the label, come back and scan the tracking off it — notified the
            // customer BEFORE there was a number to give them, and then never again. The one email they
            // got said "it's on its way" with no way to watch it.
            //
            // So a tracking number that is new, on an order already shipped, sends too. Guarded on the
            // value actually CHANGING: saving the same number twice, or re-saving a row untouched, must
            // not mail somebody the same parcel twice.
            const trackingChanged = Boolean(trackingNumber)
                && trackingNumber !== (previous?.tracking_number || "")
                && (order.fulfillment_status === "shipped" || fulfillmentStatus === "shipped");

            // ── ⚠️ SENDING IT AGAIN ON PURPOSE ─────────────────────────────────────────────────────
            // Every guard above is about NOT mailing somebody twice, which is right by default and leaves no
            // way to fix an email that went out wrong. One did: an order quoted UPS at checkout and posted by
            // hand at USPS emailed its customer a ups.com link carrying a USPS number, which resolves to
            // nothing. The number had not changed, so nothing above would ever send the correction.
            //
            // Explicit and off by default: the caller has to ask for it, so it can never happen by accident.
            const resend = body.resend === true && order.fulfillment_status === "shipped";
            const notify = statusChanged || trackingChanged || resend;

            if (notify) {
                // Awaited inside after() so the serverless function doesn't terminate mid-send, and never
                // allowed to fail the status update — the owner's tap already succeeded.
                after(async () => {
                    try {
                        if (fulfillmentStatus === "cancelled" && statusChanged) {
                            // Cancelling from the status dropdown carries no refund (that's the /cancel
                            // route's job), so send the notice without a refund amount.
                            await sendOrderCancelledEmail(order, {
                                reason: order.cancellation_reason || null,
                                refundAmountCents: order.refund_amount_cents || 0,
                            });
                        } else {
                            // On a tracking-only save the status is not in the body, so the email is sent
                            // against the status the order actually HAS.
                            await sendOrderStatusEmail(order, fulfillmentStatus || order.fulfillment_status);
                        }
                    } catch (emailError) {
                        logger.warn("admin.shop.order.status_email_failed", {
                            orderId: id,
                            fulfillmentStatus,
                            errorMessage: emailError instanceof Error ? emailError.message : "unknown_error",
                        });
                    }
                });
            }

            // `scanned` goes back so the app can show WHICH carrier and number it just sent, and say so to
            // the person holding the parcel — a scan that silently succeeds is a scan you cannot check.
            return NextResponse.json({ order, customerNotified: notify, scanned: scanned || null });
        } catch (error) {
            return internalError(error, { event: "admin.shop.order.update.failure" });
        }
    });
}
