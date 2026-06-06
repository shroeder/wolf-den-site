import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { sendShopTwoFactorCodeEmail } from "@/lib/shop-auth-email";
import {
    createShopTwoFactorCode,
    isShopTrustedDeviceTokenValid,
} from "@/lib/shop-auth-2fa";
import {
    SHOP_CUSTOMER_2FA_PENDING_COOKIE,
    SHOP_CUSTOMER_OAUTH_STATE_COOKIE,
    SHOP_CUSTOMER_TRUSTED_DEVICE_COOKIE,
    createShopCustomerPendingTwoFactorToken,
    getShopCustomerOAuthStateCookieOptions,
    getShopCustomerPendingTwoFactorCookieOptions,
    setShopCustomerSession,
} from "@/lib/shop-customer-session";
import { upsertShopCustomerOauthIdentity } from "@/lib/shop-customers";
import { resolveActiveCartId } from "@/lib/shop-carts";
import { withRequestLogging } from "@/lib/server-logger";
import { SITE_URL } from "@/lib/site";

export const runtime = "nodejs";

function buildCallbackUrl() {
    const base = process.env.NEXT_PUBLIC_BASE_URL || SITE_URL;

    return new URL("/api/shop/auth/oauth/google/callback", base).toString();
}

export async function GET(request) {
    return withRequestLogging(request, "GET /api/shop/auth/oauth/google/callback", async ({ internalError }) => {
        try {
            const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
            const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

            if (!clientId || !clientSecret) {
                return NextResponse.redirect(new URL("/shop/account?oauth=disabled", request.url));
            }

            const url = new URL(request.url);
            const code = String(url.searchParams.get("code") || "").trim();
            const state = String(url.searchParams.get("state") || "").trim();
            const cookieStore = await cookies();
            const expectedState = String(cookieStore.get(SHOP_CUSTOMER_OAUTH_STATE_COOKIE)?.value || "");

            cookieStore.set(SHOP_CUSTOMER_OAUTH_STATE_COOKIE, "", {
                ...getShopCustomerOAuthStateCookieOptions(),
                maxAge: 0,
            });

            if (!code || !state || state !== expectedState) {
                return NextResponse.redirect(new URL("/shop/account?oauth=state_error", request.url));
            }

            const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: new URLSearchParams({
                    code,
                    client_id: clientId,
                    client_secret: clientSecret,
                    redirect_uri: buildCallbackUrl(),
                    grant_type: "authorization_code",
                }),
                cache: "no-store",
            });

            const tokenPayload = await tokenResponse.json().catch(() => null);

            if (!tokenResponse.ok || !tokenPayload?.access_token) {
                return NextResponse.redirect(new URL("/shop/account?oauth=token_error", request.url));
            }

            const profileResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
                headers: {
                    Authorization: `Bearer ${tokenPayload.access_token}`,
                },
                cache: "no-store",
            });
            const profile = await profileResponse.json().catch(() => null);

            if (!profileResponse.ok || !profile?.sub || !profile?.email) {
                return NextResponse.redirect(new URL("/shop/account?oauth=profile_error", request.url));
            }

            const customer = await upsertShopCustomerOauthIdentity({
                provider: "google",
                providerSubject: profile.sub,
                email: profile.email,
                emailVerified: profile.email_verified === true,
            });

            if (!customer?.id) {
                return NextResponse.redirect(new URL("/shop/account?oauth=account_error", request.url));
            }

            const trustedToken = cookieStore.get(SHOP_CUSTOMER_TRUSTED_DEVICE_COOKIE)?.value || "";
            const trustedValid = trustedToken
                ? await isShopTrustedDeviceTokenValid(customer.id, trustedToken)
                : false;

            if (trustedValid) {
                setShopCustomerSession(cookieStore, customer.id);
                await resolveActiveCartId({
                    cookieStore,
                    customerId: customer.id,
                });

                return NextResponse.redirect(new URL("/shop/account?oauth=success", request.url));
            }

            const pendingToken = createShopCustomerPendingTwoFactorToken(customer.id);

            cookieStore.set(
                SHOP_CUSTOMER_2FA_PENDING_COOKIE,
                pendingToken,
                getShopCustomerPendingTwoFactorCookieOptions()
            );

            const codeValue = await createShopTwoFactorCode(customer.id);

            await sendShopTwoFactorCodeEmail({
                to: customer.email,
                code: codeValue,
            });

            return NextResponse.redirect(new URL("/shop/account?oauth=2fa", request.url));
        } catch (error) {
            return internalError(error, {
                event: "shop.auth.oauth.google.callback.failed",
            });
        }
    });
}
