import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { clearBuyerSessionCookie, getBuyerSessionToken, revokeBuyerSession } from "@/lib/marketplace/buyer-session.js";
import { revokeVendorSession } from "@/lib/marketplace/vendor-session.js";
import {
    SHOP_CUSTOMER_SESSION_COOKIE, SHOP_CUSTOMER_2FA_PENDING_COOKIE,
    getShopCustomerCookieOptions, getShopCustomerPendingTwoFactorCookieOptions,
} from "@/lib/shop-customer-session";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

// Revoke the current session (app bearer or web cookie) and clear the web cookie.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/auth/logout", async ({ internalError }) => {
        try {
            const token = await getBuyerSessionToken();
            if (token) {
                await revokeBuyerSession(token).catch(() => {});
                await revokeVendorSession(token).catch(() => {});
            }
            await clearBuyerSessionCookie().catch(() => {});

            // ── ⚠️ THE SHOP SESSION HAS TO GO TOO, OR SIGNING OUT DOES NOTHING ──────────────────────
            // Luke, 2026-10-30: "when Eric is signing out, it just keeps signing him back in again every
            // time he clicks sign out."
            //
            // getAuthenticatedBuyer falls through to buyerFromShopSession() when there is no marketplace
            // token -- deliberately, so that ONE sign-in covers the shop and the game. Sign-out only ever
            // undid half of that: this route revoked the marketplace session and cleared its cookie, the
            // /shop cookie survived untouched, and the very next request re-derived the same buyer from it
            // (getOrCreateBuyerByEmail, so it would even have rebuilt the row). The button worked
            // perfectly and the user was signed back in before the page finished loading.
            //
            // A bridge has to be symmetrical. One sign-in covers everything, so one sign-out does too.
            //
            // ⚠️ THE TRUSTED-DEVICE COOKIE IS DELIBERATELY LEFT ALONE, exactly as /api/shop/auth DELETE
            // leaves it: it remembers that this device already passed two-factor, not that anybody is
            // signed in. Clearing it would make every sign-out cost a 2FA round trip on the way back.
            const cookieStore = await cookies();
            cookieStore.set(SHOP_CUSTOMER_SESSION_COOKIE, "", {
                ...getShopCustomerCookieOptions(), maxAge: 0,
            });
            cookieStore.set(SHOP_CUSTOMER_2FA_PENDING_COOKIE, "", {
                ...getShopCustomerPendingTwoFactorCookieOptions(), maxAge: 0,
            });

            return NextResponse.json({ ok: true });
        } catch (error) {
            return internalError(error, { event: "marketplace.auth.logout.failure" });
        }
    });
}
