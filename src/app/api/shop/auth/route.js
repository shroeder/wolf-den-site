import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
    SHOP_CUSTOMER_SESSION_COOKIE,
    getAuthenticatedShopCustomerSessionFromCookies,
    getShopCustomerCookieOptions,
    setShopCustomerSession,
    shouldRotateShopCustomerSession,
} from "@/lib/shop-customer-session";
import {
    loginShopCustomer,
    registerShopCustomer,
} from "@/lib/shop-customers";
import { sendShopEmailVerificationEmail } from "@/lib/shop-auth-email";
import { createEmailVerificationTokenForCustomer } from "@/lib/shop-customer-auth-tokens";
import {
    clearFailedShopAuthAttempts,
    isShopAuthTemporarilyBlocked,
    recordFailedShopAuthAttempt,
} from "@/lib/shop-auth-throttle";
import { resolveActiveCartId } from "@/lib/shop-carts";
import { isTrustedWriteRequest } from "@/lib/request-security";
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

const unauthorized = () => jsonNoStore({ error: "Invalid credentials." }, { status: 401 });

function getClientIp(request) {
    const forwarded = request.headers.get("x-forwarded-for") || "";

    if (forwarded) {
        return forwarded.split(",")[0].trim();
    }

    return request.headers.get("x-real-ip") || "unknown";
}

export async function GET(request) {
    return withRequestLogging(request, "GET /api/shop/auth", async ({ internalError }) => {
        if (!isPaymentsEnabled()) {
            return jsonNoStore({ authenticated: false, customer: null });
        }

        try {
            const cookieStore = await cookies();
            const session = await getAuthenticatedShopCustomerSessionFromCookies();

            if (session?.customer && shouldRotateShopCustomerSession(session.payload)) {
                setShopCustomerSession(cookieStore, session.customer.id);
            }

            return jsonNoStore({
                authenticated: Boolean(session?.customer),
                customer: session?.customer || null,
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
            const body = await request.json().catch(() => null);
            const mode = String(body?.mode || "login").trim().toLowerCase();
            const email = String(body?.email || "").trim();
            const password = String(body?.password || "");
            const clientIp = getClientIp(request);

            if (await isShopAuthTemporarilyBlocked({ ip: clientIp, email })) {
                return jsonNoStore({ error: "Too many attempts. Try again later." }, { status: 429 });
            }

            if (!email || !password) {
                await recordFailedShopAuthAttempt({ ip: clientIp, email });
                return unauthorized();
            }

            if (mode !== "login" && mode !== "register") {
                await recordFailedShopAuthAttempt({ ip: clientIp, email });
                return unauthorized();
            }

            let customer = null;

            if (mode === "register") {
                try {
                    customer = await registerShopCustomer(email, password);
                } catch (error) {
                    if (error?.code === "account_exists") {
                        await recordFailedShopAuthAttempt({ ip: clientIp, email });
                        return unauthorized();
                    }

                    return jsonNoStore({ error: error instanceof Error ? error.message : "Could not create account." }, { status: 400 });
                }

                await clearFailedShopAuthAttempts({ ip: clientIp, email });

                try {
                    const verificationToken = await createEmailVerificationTokenForCustomer(customer?.id);

                    if (verificationToken) {
                        await sendShopEmailVerificationEmail({
                            to: customer.email,
                            token: verificationToken,
                        });
                    }
                } catch {
                    // Keep response generic even if email delivery fails.
                }

                return jsonNoStore({
                    success: true,
                    customer: null,
                    requiresEmailVerification: true,
                    message: "Account created. Check your email to verify your account.",
                });
            } else {
                const loginResult = await loginShopCustomer(email, password);

                if (loginResult.status === "email_verification_required") {
                    if (loginResult.customer?.id) {
                        try {
                            const verificationToken = await createEmailVerificationTokenForCustomer(loginResult.customer.id);

                            if (verificationToken) {
                                await sendShopEmailVerificationEmail({
                                    to: loginResult.customer.email,
                                    token: verificationToken,
                                });
                            }
                        } catch {
                            // Keep failure mode generic.
                        }
                    }

                    return jsonNoStore(
                        {
                            error: "Please verify your email before signing in. A fresh verification email has been sent.",
                            code: "email_verification_required",
                        },
                        { status: 403 }
                    );
                }

                customer = loginResult.customer;
            }

            if (!customer) {
                await recordFailedShopAuthAttempt({ ip: clientIp, email });
                return unauthorized();
            }

            await clearFailedShopAuthAttempts({ ip: clientIp, email });
            const cookieStore = await cookies();
            setShopCustomerSession(cookieStore, customer.id);
            await resolveActiveCartId({
                cookieStore,
                customerId: customer.id,
            });

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
