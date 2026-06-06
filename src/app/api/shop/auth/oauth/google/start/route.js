import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
    SHOP_CUSTOMER_OAUTH_STATE_COOKIE,
    getShopCustomerOAuthStateCookieOptions,
} from "@/lib/shop-customer-session";
import { withRequestLogging } from "@/lib/server-logger";
import { SITE_URL } from "@/lib/site";

export const runtime = "nodejs";

function isPaymentsEnabled() {
    return process.env.PAYMENTS_ENABLED === "true";
}

function buildCallbackUrl() {
    const base = process.env.NEXT_PUBLIC_BASE_URL || SITE_URL;

    return new URL("/api/shop/auth/oauth/google/callback", base).toString();
}

export async function GET(request) {
    return withRequestLogging(request, "GET /api/shop/auth/oauth/google/start", async () => {
        if (!isPaymentsEnabled()) {
            return NextResponse.redirect(new URL("/shop/account", request.url));
        }

        const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;

        if (!clientId) {
            return NextResponse.redirect(new URL("/shop/account?oauth=disabled", request.url));
        }

        const state = randomUUID();
        const cookieStore = await cookies();

        cookieStore.set(
            SHOP_CUSTOMER_OAUTH_STATE_COOKIE,
            state,
            getShopCustomerOAuthStateCookieOptions()
        );

        const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
        authUrl.searchParams.set("client_id", clientId);
        authUrl.searchParams.set("redirect_uri", buildCallbackUrl());
        authUrl.searchParams.set("response_type", "code");
        authUrl.searchParams.set("scope", "openid email profile");
        authUrl.searchParams.set("state", state);
        authUrl.searchParams.set("prompt", "select_account");
        authUrl.searchParams.set("access_type", "offline");

        return NextResponse.redirect(authUrl);
    });
}
