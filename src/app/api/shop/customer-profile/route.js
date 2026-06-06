import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { getSquareCustomerById, toCheckoutProfileFromSquareCustomer } from "@/lib/consignment/square";
import {
    getAuthenticatedShopCustomerSessionFromCookies,
    setShopCustomerSession,
    shouldRotateShopCustomerSession,
} from "@/lib/shop-customer-session";
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
            const cookieStore = await cookies();
            const session = await getAuthenticatedShopCustomerSessionFromCookies();
            const customer = session?.customer || null;

            if (!customer) {
                return jsonNoStore({ found: false, profile: null }, { status: 401 });
            }

            if (shouldRotateShopCustomerSession(session.payload)) {
                setShopCustomerSession(cookieStore, customer.id);
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
