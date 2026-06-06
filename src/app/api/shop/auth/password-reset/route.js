import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { isTrustedWriteRequest } from "@/lib/request-security";
import { sendShopPasswordResetEmail } from "@/lib/shop-auth-email";
import {
    consumePasswordResetToken,
    createPasswordResetTokenForEmail,
} from "@/lib/shop-customer-auth-tokens";
import { setShopCustomerSession } from "@/lib/shop-customer-session";
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
    return withRequestLogging(request, "POST /api/shop/auth/password-reset", async ({ internalError }) => {
        if (!isTrustedWriteRequest(request)) {
            return jsonNoStore({ error: "Invalid request origin." }, { status: 403 });
        }

        if (!isPaymentsEnabled()) {
            return jsonNoStore({ error: "Payments are currently disabled." }, { status: 403 });
        }

        try {
            const body = await request.json().catch(() => null);
            const mode = String(body?.mode || "request").trim().toLowerCase();

            if (mode === "request") {
                const email = String(body?.email || "").trim();

                if (email) {
                    const tokenBundle = await createPasswordResetTokenForEmail(email);

                    if (tokenBundle?.token && tokenBundle?.customer?.email) {
                        await sendShopPasswordResetEmail({
                            to: tokenBundle.customer.email,
                            token: tokenBundle.token,
                        });
                    }
                }

                return jsonNoStore({
                    success: true,
                    message: "If an account exists for that email, a reset link has been sent.",
                });
            }

            if (mode !== "confirm") {
                return jsonNoStore({ error: "Invalid password reset mode." }, { status: 400 });
            }

            const token = String(body?.token || "").trim();
            const password = String(body?.password || "");

            if (!token || !password) {
                return jsonNoStore({ error: "Missing token or password." }, { status: 400 });
            }

            const customer = await consumePasswordResetToken(token, password);

            if (!customer) {
                return jsonNoStore({ error: "Reset link is invalid or expired." }, { status: 400 });
            }

            const cookieStore = await cookies();
            setShopCustomerSession(cookieStore, customer.id);

            return jsonNoStore({
                success: true,
                customer,
            });
        } catch (error) {
            if (error?.code === "invalid_password") {
                return jsonNoStore({ error: error.message }, { status: 400 });
            }

            return internalError(error, {
                event: "shop.auth.password_reset.failed",
            });
        }
    });
}
