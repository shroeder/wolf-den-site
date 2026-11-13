import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getAuthenticatedShopCustomerFromCookies } from "@/lib/shop-customer-session";
import { getCartSummary, resolveActiveCartId } from "@/lib/shop-carts";
import { getShippingRates, isEasyPostEnabled } from "@/lib/shipping/easypost";
import { OWN_SHIPPING } from "@/lib/shipping/own-shipping";
import { isTrustedWriteRequest } from "@/lib/request-security";
import { withRequestLogging } from "@/lib/server-logger";

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

// Live carrier rates for the buyer's address + current cart. Returns { enabled, rates, shipmentId }.
// enabled:false means the client keeps the cart's own shipping figure — which is now the normal case, see
// OWN_SHIPPING in shipping/own-shipping.js.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/shop/shipping/rates", async ({ internalError }) => {
        if (!isTrustedWriteRequest(request)) {
            return jsonNoStore({ error: "Invalid request origin." }, { status: 403 });
        }

        if (!isPaymentsEnabled()) {
            return jsonNoStore({ error: "Payments are currently disabled." }, { status: 403 });
        }

        // ── ⚠️ THE SHOP PRICES ITS OWN POSTAGE NOW ──────────────────────────────────────────────────────
        // `enabled: false` is the same answer the client already handles for "EasyPost is not configured",
        // and it is the right one here: the cart's own banded figure stands, no option list is drawn, and
        // nobody is asked to choose a service the shop was not going to buy. 1 label of 13 orders.
        //
        // It also returns BEFORE the EasyPost call, so a rate nobody will see is not paid for in latency on
        // the one screen a buyer is waiting on.
        if (OWN_SHIPPING || !isEasyPostEnabled()) {
            return jsonNoStore({ enabled: false, rates: [], shipmentId: null });
        }

        try {
            const body = await request.json().catch(() => null);
            const shipping = body?.shipping && typeof body.shipping === "object" ? body.shipping : null;

            if (!shipping) {
                return jsonNoStore({ error: "Shipping address is required." }, { status: 400 });
            }

            const cookieStore = await cookies();
            const customer = await getAuthenticatedShopCustomerFromCookies();
            const cartId = await resolveActiveCartId({ cookieStore, customerId: customer?.id || null });

            if (!cartId) {
                return jsonNoStore({ error: "Cart is empty." }, { status: 409 });
            }

            const cart = await getCartSummary(cartId, { fulfillmentMode: "shipping", cached: true });

            if (!cart.items.length) {
                return jsonNoStore({ error: "Cart is empty." }, { status: 409 });
            }

            const result = await getShippingRates({ toAddress: shipping, items: cart.items });

            if (!result) {
                // EasyPost couldn't rate this address (e.g. incomplete) — let the client fall back to flat.
                return jsonNoStore({ enabled: false, rates: [], shipmentId: null });
            }

            return jsonNoStore({
                enabled: true,
                shipmentId: result.shipmentId,
                rates: result.rates,
            });
        } catch (error) {
            return internalError(error, { event: "shop.shipping.rates.failed" });
        }
    });
}
