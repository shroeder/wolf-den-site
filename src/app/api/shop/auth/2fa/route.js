import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { isTrustedWriteRequest } from "@/lib/request-security";
import {
    getShopPublicCustomerById,
} from "@/lib/shop-customers";
import {
    createShopTrustedDeviceToken,
    verifyShopTwoFactorCode,
} from "@/lib/shop-auth-2fa";
import {
    SHOP_CUSTOMER_2FA_PENDING_COOKIE,
    SHOP_CUSTOMER_TRUSTED_DEVICE_COOKIE,
    getShopCustomerPendingTwoFactorCookieOptions,
    getShopCustomerTrustedDeviceCookieOptions,
    verifyShopCustomerPendingTwoFactorToken,
    setShopCustomerSession,
} from "@/lib/shop-customer-session";
import { resolveActiveCartId } from "@/lib/shop-carts";
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

function getClientIp(request) {
    const forwarded = request.headers.get("x-forwarded-for") || "";

    if (forwarded) {
        return forwarded.split(",")[0].trim();
    }

    return request.headers.get("x-real-ip") || "unknown";
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/shop/auth/2fa", async ({ internalError }) => {
        if (!isTrustedWriteRequest(request)) {
            return jsonNoStore({ error: "Invalid request origin." }, { status: 403 });
        }

        if (!isPaymentsEnabled()) {
            return jsonNoStore({ error: "Payments are currently disabled." }, { status: 403 });
        }

        try {
            const body = await request.json().catch(() => null);
            const code = String(body?.code || "").trim();
            const trustDevice = body?.trustDevice === true;
            const cookieStore = await cookies();
            const pendingToken = cookieStore.get(SHOP_CUSTOMER_2FA_PENDING_COOKIE)?.value;
            const pendingPayload = verifyShopCustomerPendingTwoFactorToken(pendingToken);

            if (!pendingPayload?.customerId) {
                return jsonNoStore({ error: "Two-factor session expired. Sign in again." }, { status: 401 });
            }

            if (!code || !/^\d{6}$/.test(code)) {
                return jsonNoStore({ error: "Enter a valid 6-digit code." }, { status: 400 });
            }

            const valid = await verifyShopTwoFactorCode(pendingPayload.customerId, code);

            if (!valid) {
                return jsonNoStore({ error: "Invalid or expired sign-in code." }, { status: 401 });
            }

            setShopCustomerSession(cookieStore, pendingPayload.customerId);
            cookieStore.set(SHOP_CUSTOMER_2FA_PENDING_COOKIE, "", {
                ...getShopCustomerPendingTwoFactorCookieOptions(),
                maxAge: 0,
            });

            if (trustDevice) {
                const trustedToken = await createShopTrustedDeviceToken(pendingPayload.customerId, {
                    userAgent: request.headers.get("user-agent") || "",
                    ip: getClientIp(request),
                });

                if (trustedToken) {
                    cookieStore.set(
                        SHOP_CUSTOMER_TRUSTED_DEVICE_COOKIE,
                        trustedToken,
                        getShopCustomerTrustedDeviceCookieOptions()
                    );
                }
            }

            await resolveActiveCartId({
                cookieStore,
                customerId: pendingPayload.customerId,
            });

            const customer = await getShopPublicCustomerById(pendingPayload.customerId);

            return jsonNoStore({
                success: true,
                customer,
            });
        } catch (error) {
            return internalError(error, {
                event: "shop.auth.2fa.failed",
            });
        }
    });
}
