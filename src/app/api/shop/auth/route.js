import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
    SHOP_CUSTOMER_SESSION_COOKIE,
    createShopCustomerSessionToken,
    getAuthenticatedShopCustomerFromCookies,
    getShopCustomerCookieOptions,
} from "@/lib/shop-customer-session";
import {
    loginShopCustomer,
    registerShopCustomer,
} from "@/lib/shop-customers";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

function isPaymentsEnabled() {
    return process.env.PAYMENTS_ENABLED === "true";
}

const unauthorized = () => NextResponse.json({ error: "Unauthorized" }, { status: 401 });

export async function GET(request) {
    return withRequestLogging(request, "GET /api/shop/auth", async ({ internalError }) => {
        if (!isPaymentsEnabled()) {
            return NextResponse.json({ authenticated: false, customer: null });
        }

        try {
            const customer = await getAuthenticatedShopCustomerFromCookies();

            return NextResponse.json({
                authenticated: Boolean(customer),
                customer: customer || null,
            });
        } catch (error) {
            return internalError(error, {
                event: "shop.auth.session_read.failed",
            });
        }
    });
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/shop/auth", async ({ internalError }) => {
        if (!isPaymentsEnabled()) {
            return NextResponse.json({ error: "Payments are currently disabled." }, { status: 403 });
        }

        try {
            const body = await request.json().catch(() => null);
            const mode = String(body?.mode || "login").trim().toLowerCase();
            const email = String(body?.email || "").trim();
            const password = String(body?.password || "");

            if (!email || !password) {
                return unauthorized();
            }

            let customer = null;

            if (mode === "register") {
                try {
                    customer = await registerShopCustomer(email, password);
                } catch (error) {
                    if (error?.code === "account_exists") {
                        return NextResponse.json({ error: "Account already exists for this email." }, { status: 409 });
                    }

                    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create account." }, { status: 400 });
                }
            } else {
                customer = await loginShopCustomer(email, password);
            }

            if (!customer) {
                return unauthorized();
            }

            const token = createShopCustomerSessionToken(customer.id);
            const cookieStore = await cookies();

            cookieStore.set(SHOP_CUSTOMER_SESSION_COOKIE, token, getShopCustomerCookieOptions());

            return NextResponse.json({
                success: true,
                customer,
            });
        } catch (error) {
            return internalError(error, {
                event: "shop.auth.failed",
            });
        }
    });
}

export async function DELETE(request) {
    return withRequestLogging(request, "DELETE /api/shop/auth", async ({ internalError }) => {
        try {
            const cookieStore = await cookies();
            cookieStore.set(SHOP_CUSTOMER_SESSION_COOKIE, "", {
                ...getShopCustomerCookieOptions(),
                maxAge: 0,
            });

            return NextResponse.json({ success: true });
        } catch (error) {
            return internalError(error, {
                event: "shop.auth.logout.failed",
            });
        }
    });
}
