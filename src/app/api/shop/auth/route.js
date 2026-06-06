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

const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS_PER_WINDOW = 8;
const LOCKOUT_MS = 20 * 60 * 1000;
const authAttempts = new Map();

function isPaymentsEnabled() {
    return process.env.PAYMENTS_ENABLED === "true";
}

const unauthorized = () => NextResponse.json({ error: "Invalid credentials." }, { status: 401 });

function getClientIp(request) {
    const forwarded = request.headers.get("x-forwarded-for") || "";

    if (forwarded) {
        return forwarded.split(",")[0].trim();
    }

    return request.headers.get("x-real-ip") || "unknown";
}

function getAuthAttemptKey(request, email) {
    return `${getClientIp(request)}|${String(email || "").trim().toLowerCase()}`;
}

function isTemporarilyBlocked(key) {
    const now = Date.now();
    const state = authAttempts.get(key);

    if (!state) {
        return false;
    }

    if (state.lockedUntil && state.lockedUntil > now) {
        return true;
    }

    if (state.windowStart + ATTEMPT_WINDOW_MS < now) {
        authAttempts.delete(key);
        return false;
    }

    return false;
}

function recordFailedAttempt(key) {
    const now = Date.now();
    const state = authAttempts.get(key);

    if (!state || state.windowStart + ATTEMPT_WINDOW_MS < now) {
        authAttempts.set(key, {
            count: 1,
            windowStart: now,
            lockedUntil: 0,
        });
        return;
    }

    state.count += 1;

    if (state.count >= MAX_ATTEMPTS_PER_WINDOW) {
        state.lockedUntil = now + LOCKOUT_MS;
    }

    authAttempts.set(key, state);
}

function clearFailedAttempts(key) {
    authAttempts.delete(key);
}

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
            const attemptKey = getAuthAttemptKey(request, email);

            if (isTemporarilyBlocked(attemptKey)) {
                return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
            }

            if (!email || !password) {
                recordFailedAttempt(attemptKey);
                return unauthorized();
            }

            let customer = null;

            if (mode === "register") {
                try {
                    customer = await registerShopCustomer(email, password);
                } catch (error) {
                    if (error?.code === "account_exists") {
                        recordFailedAttempt(attemptKey);
                        return unauthorized();
                    }

                    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create account." }, { status: 400 });
                }
            } else {
                customer = await loginShopCustomer(email, password);
            }

            if (!customer) {
                recordFailedAttempt(attemptKey);
                return unauthorized();
            }

            clearFailedAttempts(attemptKey);

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
