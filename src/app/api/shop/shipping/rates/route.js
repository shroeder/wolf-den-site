import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getAuthenticatedShopCustomerFromCookies } from "@/lib/shop-customer-session";
import { getCartSummary, resolveActiveCartId } from "@/lib/shop-carts";
import { getShippingRates, isEasyPostEnabled } from "@/lib/shipping/easypost";
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

// Live USPS rates for the buyer's address + current cart. Returns { enabled, rates, shipmentId }.
// When EasyPost isn't configured we return enabled:false so the client keeps its flat-rate flow.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/shop/shipping/rates", async ({ internalError }) => {
        if (!isTrustedWriteRequest(request)) {
            return jsonNoStore({ error: "Invalid request origin." }, { status: 403 });
        }

        if (!isPaymentsEnabled()) {
            return jsonNoStore({ error: "Payments are currently disabled." }, { status: 403 });
        }

        if (!isEasyPostEnabled()) {
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

            const cart = await getCartSummary(cartId, { fulfillmentMode: "shipping" });

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
