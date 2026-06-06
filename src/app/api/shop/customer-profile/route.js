import { NextResponse } from "next/server";

import { getSquareCustomerById, toCheckoutProfileFromSquareCustomer } from "@/lib/consignment/square";
import { getAuthenticatedShopCustomerFromCookies } from "@/lib/shop-customer-session";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

function isPaymentsEnabled() {
    return process.env.PAYMENTS_ENABLED === "true";
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/shop/customer-profile", async ({ internalError }) => {
        if (!isPaymentsEnabled()) {
            return NextResponse.json({ error: "Payments are currently disabled." }, { status: 403 });
        }

        try {
            const customer = await getAuthenticatedShopCustomerFromCookies();

            if (!customer) {
                return NextResponse.json({ found: false, profile: null }, { status: 401 });
            }

            if (!customer.hasSavedProfile) {
                return NextResponse.json({ found: false, profile: null });
            }

            const squareCustomer = await getSquareCustomerById(customer.squareCustomerId);

            return NextResponse.json({
                found: Boolean(squareCustomer),
                profile: toCheckoutProfileFromSquareCustomer(squareCustomer),
            });
        } catch (error) {
            return internalError(error, {
                event: "shop.customer_profile.lookup.failed",
            });
        }
    });
}

export async function GET(request) {
    return withRequestLogging(request, "GET /api/shop/customer-profile", async ({ internalError }) => {
        if (!isPaymentsEnabled()) {
            return NextResponse.json({ error: "Payments are currently disabled." }, { status: 403 });
        }

        try {
            const customer = await getAuthenticatedShopCustomerFromCookies();

            if (!customer) {
                return NextResponse.json({ found: false, profile: null }, { status: 401 });
            }

            if (!customer.hasSavedProfile) {
                return NextResponse.json({ found: false, profile: null });
            }

            const squareCustomer = await getSquareCustomerById(customer.squareCustomerId);

            return NextResponse.json({
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
