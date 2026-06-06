import { NextResponse } from "next/server";

import { getSquareCustomerById, toCheckoutProfileFromSquareCustomer } from "@/lib/consignment/square";
import { getAuthenticatedShopCustomerFromCookies } from "@/lib/shop-customer-session";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

function isPaymentsEnabled() {
    return process.env.PAYMENTS_ENABLED === "true";
}

function jsonNoStore(body, init = {}) {
    return NextResponse.json(body, {
        ...init,
        headers: {
            "Cache-Control": "no-store",
            ...(init.headers || {}),
        },
    });
}

export async function POST(request) {
    return GET(request);
}

export async function GET(request) {
    return withRequestLogging(request, "GET /api/shop/customer-profile", async ({ internalError }) => {
        if (!isPaymentsEnabled()) {
            return jsonNoStore({ error: "Payments are currently disabled." }, { status: 403 });
        }

        try {
            const customer = await getAuthenticatedShopCustomerFromCookies();

            if (!customer) {
                return jsonNoStore({ found: false, profile: null }, { status: 401 });
            }

            if (!customer.hasSavedProfile) {
                return jsonNoStore({ found: false, profile: null });
            }

            const squareCustomer = await getSquareCustomerById(customer.squareCustomerId);

            return jsonNoStore({
                found: Boolean(squareCustomer),
                profile: toCheckoutProfileFromSquareCustomer(squareCustomer),
            });
        } catch (error) {
            return internalError(error, {
                event: "shop.customer_profile.current.failed",
            });
        }
    });
}
