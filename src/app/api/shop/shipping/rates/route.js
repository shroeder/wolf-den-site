import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getAuthenticatedShopCustomerFromCookies } from "@/lib/shop-customer-session";
import { getCartSummary, resolveActiveCartId } from "@/lib/shop-carts";
import { getShippingRates, isEasyPostEnabled } from "@/lib/shipping/easypost";
import { isTrustedWriteRequest } from "@/lib/request-security";
import { withRequestLogging } from "@/lib/server-logger";
import { db } from "@/lib/db";

export const runtime = "nodejs";

function isPaymentsEnabled() {
    return process.env.PAYMENTS_ENABLED === "true";
}

function jsonNoStore(body, init = {}) {
    return NextResponse.json(body, {
        ...init,
        headers: { "Cache-Control": "no-store", ...(init.headers || {}) },
    });
}

// Temporary breadcrumb: persist why each rate request did/didn't produce rates so we can read the
// real outcome of a buyer's request via the admin diagnose endpoint. Never throws into the request.
async function recordDebug(fields) {
    try {
        await db.query(
            `INSERT INTO shop_shipping_debug
                (host, origin, referer, trusted, payments_enabled, easypost_enabled, item_count, rate_count, note)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
                fields.host || null,
                fields.origin || null,
                fields.referer || null,
                fields.trusted ?? null,
                fields.payments ?? null,
                fields.easypost ?? null,
                fields.itemCount ?? null,
                fields.rateCount ?? null,
                fields.note || null,
            ]
        );
    } catch {
        // Debug logging must never break checkout.
    }
}

// Live USPS rates for the buyer's address + current cart. Returns { enabled, rates, shipmentId }.
// When EasyPost isn't configured we return enabled:false so the client keeps its flat-rate flow.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/shop/shipping/rates", async ({ internalError }) => {
        const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
        const origin = request.headers.get("origin") || "";
        const referer = request.headers.get("referer") || "";
        const trusted = isTrustedWriteRequest(request);
        const payments = isPaymentsEnabled();
        const easypost = isEasyPostEnabled();

        if (!trusted) {
            await recordDebug({ host, origin, referer, trusted, payments, easypost, note: "untrusted_origin" });
            return jsonNoStore({ error: "Invalid request origin." }, { status: 403 });
        }

        if (!payments) {
            await recordDebug({ host, origin, referer, trusted, payments, easypost, note: "payments_disabled" });
            return jsonNoStore({ error: "Payments are currently disabled." }, { status: 403 });
        }

        if (!easypost) {
            await recordDebug({ host, origin, referer, trusted, payments, easypost, note: "easypost_disabled" });
            return jsonNoStore({ enabled: false, rates: [], shipmentId: null });
        }

        try {
            const body = await request.json().catch(() => null);
            const shipping = body?.shipping && typeof body.shipping === "object" ? body.shipping : null;

            if (!shipping) {
                await recordDebug({ host, origin, referer, trusted, payments, easypost, note: "no_shipping_body" });
                return jsonNoStore({ error: "Shipping address is required." }, { status: 400 });
            }

            const cookieStore = await cookies();
            const customer = await getAuthenticatedShopCustomerFromCookies();
            const cartId = await resolveActiveCartId({ cookieStore, customerId: customer?.id || null });

            if (!cartId) {
                await recordDebug({ host, origin, referer, trusted, payments, easypost, note: "no_cart" });
                return jsonNoStore({ error: "Cart is empty." }, { status: 409 });
            }

            const cart = await getCartSummary(cartId, { fulfillmentMode: "shipping" });

            if (!cart.items.length) {
                await recordDebug({ host, origin, referer, trusted, payments, easypost, itemCount: 0, note: "empty_cart" });
                return jsonNoStore({ error: "Cart is empty." }, { status: 409 });
            }

            const result = await getShippingRates({ toAddress: shipping, items: cart.items });

            if (!result) {
                // EasyPost couldn't rate this address (e.g. incomplete) — let the client fall back to flat.
                await recordDebug({
                    host, origin, referer, trusted, payments, easypost,
                    itemCount: cart.items.length, rateCount: 0,
                    note: `rates_null to=${String(shipping.city || "")},${String(shipping.state || "")} ${String(shipping.postalCode || "")}`,
                });
                return jsonNoStore({ enabled: false, rates: [], shipmentId: null });
            }

            await recordDebug({
                host, origin, referer, trusted, payments, easypost,
                itemCount: cart.items.length, rateCount: result.rates.length,
                note: result.rates.length ? "ok" : "zero_rates",
            });

            return jsonNoStore({
                enabled: true,
                shipmentId: result.shipmentId,
                rates: result.rates,
            });
        } catch (error) {
            await recordDebug({
                host, origin, referer, trusted, payments, easypost,
                note: `error: ${String(error?.message || error).slice(0, 200)}`,
            });
            return internalError(error, { event: "shop.shipping.rates.failed" });
        }
    });
}
