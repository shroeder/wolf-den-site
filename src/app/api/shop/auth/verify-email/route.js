import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { isTrustedWriteRequest } from "@/lib/request-security";
import { sendShopEmailVerificationEmail } from "@/lib/shop-auth-email";
import {
    consumeEmailVerificationToken,
    createEmailVerificationTokenForCustomer,
} from "@/lib/shop-customer-auth-tokens";
import { setShopCustomerSession } from "@/lib/shop-customer-session";
import { resolveActiveCartId } from "@/lib/shop-carts";
import { getShopCustomerByEmail } from "@/lib/shop-customers";
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
    return withRequestLogging(request, "POST /api/shop/auth/verify-email", async ({ internalError }) => {
        if (!isTrustedWriteRequest(request)) {
            return jsonNoStore({ error: "Invalid request origin." }, { status: 403 });
        }

        if (!isPaymentsEnabled()) {
            return jsonNoStore({ error: "Payments are currently disabled." }, { status: 403 });
        }

        try {
            const body = await request.json().catch(() => null);
            const mode = String(body?.mode || "confirm").trim().toLowerCase();

            if (mode === "request") {
                const email = String(body?.email || "").trim();

                if (email) {
                    const customer = await getShopCustomerByEmail(email);

                    if (customer && !customer.email_verified_at) {
                        const token = await createEmailVerificationTokenForCustomer(customer.id);

                        if (token) {
                            await sendShopEmailVerificationEmail({
                                to: customer.email,
                                token,
                            });
                        }
                    }
                }

                return jsonNoStore({
                    success: true,
                    message: "If an account exists, a verification email has been sent.",
                });
            }

            const token = String(body?.token || "").trim();

            if (!token) {
                return jsonNoStore({ error: "Missing verification token." }, { status: 400 });
            }

            const customer = await consumeEmailVerificationToken(token);

            if (!customer) {
                return jsonNoStore({ error: "Verification link is invalid or expired." }, { status: 400 });
            }

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
                event: "shop.auth.verify_email.failed",
            });
        }
    });
}
