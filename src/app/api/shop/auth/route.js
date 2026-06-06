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
import { isTrustedWriteRequest } from "@/lib/request-security";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS_PER_WINDOW = 8;
const MAX_IP_ATTEMPTS_PER_WINDOW = 30;
const LOCKOUT_MS = 20 * 60 * 1000;
const authAttemptsByIdentity = new Map();
const authAttemptsByIp = new Map();

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

const unauthorized = () => jsonNoStore({ error: "Invalid credentials." }, { status: 401 });

function getClientIp(request) {
    const forwarded = request.headers.get("x-forwarded-for") || "";

    if (forwarded) {
        return forwarded.split(",")[0].trim();
    }

    return request.headers.get("x-real-ip") || "unknown";
}

function getAuthAttemptIdentityKey(ip, email) {
    return `${ip}|${String(email || "").trim().toLowerCase()}`;
}

function pruneAttempts(map) {
    const now = Date.now();

    for (const [key, state] of map.entries()) {
        if (state.lockedUntil && state.lockedUntil > now) {
            continue;
        }

        if (state.windowStart + ATTEMPT_WINDOW_MS < now) {
            map.delete(key);
        }
    }
}

function isTemporarilyBlocked(map, key) {
    const now = Date.now();
    const state = map.get(key);

    if (!state) {
        return false;
    }

    if (state.lockedUntil && state.lockedUntil > now) {
        return true;
    }

    if (state.windowStart + ATTEMPT_WINDOW_MS < now) {
        map.delete(key);
        return false;
    }

    return false;
}

function recordFailedAttempt(map, key, maxAttemptsPerWindow) {
    const now = Date.now();
    const state = map.get(key);

    if (!state || state.windowStart + ATTEMPT_WINDOW_MS < now) {
        map.set(key, {
            count: 1,
            windowStart: now,
            lockedUntil: 0,
        });
        return;
    }

    state.count += 1;

    if (state.count >= maxAttemptsPerWindow) {
        state.lockedUntil = now + LOCKOUT_MS;
    }

    map.set(key, state);
}

function clearFailedAttempts(map, key) {
    map.delete(key);
}

export async function GET(request) {
    return withRequestLogging(request, "GET /api/shop/auth", async ({ internalError }) => {
        if (!isPaymentsEnabled()) {
            return jsonNoStore({ authenticated: false, customer: null });
        }

        try {
            const customer = await getAuthenticatedShopCustomerFromCookies();

            return jsonNoStore({
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
        if (!isTrustedWriteRequest(request)) {
            return jsonNoStore({ error: "Invalid request origin." }, { status: 403 });
        }

        if (!isPaymentsEnabled()) {
            return jsonNoStore({ error: "Payments are currently disabled." }, { status: 403 });
        }

        try {
            pruneAttempts(authAttemptsByIdentity);
            pruneAttempts(authAttemptsByIp);

            const body = await request.json().catch(() => null);
            const mode = String(body?.mode || "login").trim().toLowerCase();
            const email = String(body?.email || "").trim();
            const password = String(body?.password || "");
            const clientIp = getClientIp(request);
            const identityAttemptKey = getAuthAttemptIdentityKey(clientIp, email);
            const ipAttemptKey = clientIp;

            if (isTemporarilyBlocked(authAttemptsByIdentity, identityAttemptKey) || isTemporarilyBlocked(authAttemptsByIp, ipAttemptKey)) {
                return jsonNoStore({ error: "Too many attempts. Try again later." }, { status: 429 });
            }

            if (!email || !password) {
                recordFailedAttempt(authAttemptsByIdentity, identityAttemptKey, MAX_ATTEMPTS_PER_WINDOW);
                recordFailedAttempt(authAttemptsByIp, ipAttemptKey, MAX_IP_ATTEMPTS_PER_WINDOW);
                return unauthorized();
            }

            let customer = null;

            if (mode === "register") {
                try {
                    customer = await registerShopCustomer(email, password);
                } catch (error) {
                    if (error?.code === "account_exists") {
                        recordFailedAttempt(authAttemptsByIdentity, identityAttemptKey, MAX_ATTEMPTS_PER_WINDOW);
                        recordFailedAttempt(authAttemptsByIp, ipAttemptKey, MAX_IP_ATTEMPTS_PER_WINDOW);
                        return unauthorized();
                    }

                    return jsonNoStore({ error: error instanceof Error ? error.message : "Could not create account." }, { status: 400 });
                }
            } else {
                customer = await loginShopCustomer(email, password);
            }

            if (!customer) {
                recordFailedAttempt(authAttemptsByIdentity, identityAttemptKey, MAX_ATTEMPTS_PER_WINDOW);
                recordFailedAttempt(authAttemptsByIp, ipAttemptKey, MAX_IP_ATTEMPTS_PER_WINDOW);
                return unauthorized();
            }

            clearFailedAttempts(authAttemptsByIdentity, identityAttemptKey);

            const token = createShopCustomerSessionToken(customer.id);
            const cookieStore = await cookies();

            cookieStore.set(SHOP_CUSTOMER_SESSION_COOKIE, token, getShopCustomerCookieOptions());

            return jsonNoStore({
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
        if (!isTrustedWriteRequest(request)) {
            return jsonNoStore({ error: "Invalid request origin." }, { status: 403 });
        }

        try {
            const cookieStore = await cookies();
            cookieStore.set(SHOP_CUSTOMER_SESSION_COOKIE, "", {
                ...getShopCustomerCookieOptions(),
                maxAge: 0,
            });

            return jsonNoStore({ success: true });
        } catch (error) {
            return internalError(error, {
                event: "shop.auth.logout.failed",
            });
        }
    });
}
