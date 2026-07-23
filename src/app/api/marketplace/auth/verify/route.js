import { NextResponse } from "next/server";

import { verifyEmailCode, createBuyerSession, setBuyerSessionCookie } from "@/lib/marketplace/buyer-session.js";
import { maybeGrantReferral } from "@/lib/marketplace/referral.js";
import { bridgeMarketplaceToShop } from "@/lib/marketplace/shop-bridge.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

const REASON_MESSAGES = {
    invalid_code: "That code isn't right.",
    expired: "That code expired — request a new one.",
    too_many_attempts: "Too many attempts — request a new code.",
    no_code: "Request a verification code first.",
    not_found: "No account found for that email.",
};

// Confirm the 6-digit email code. On success the account is marked verified and a session token is
// returned (this is what logs a freshly-registered user in).
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/auth/verify", async ({ logger, internalError }) => {
        try {
            const body = await request.json().catch(() => ({}));
            const result = await verifyEmailCode(body.email, body.code);
            if (!result.ok) {
                const message = REASON_MESSAGES[result.reason] || "Couldn't verify your email.";
                return NextResponse.json({ error: message, reason: result.reason }, { status: 400 });
            }
            const { token, expiresAt } = await createBuyerSession(result.buyer.id, { deviceLabel: "app" });
            await setBuyerSessionCookie(token);
            await bridgeMarketplaceToShop(result.buyer.email).catch(() => {});
            // If they arrived via an invite link, pay out the one-time both-sides referral reward now.
            await maybeGrantReferral(result.buyer.id).catch(() => {});
            logger.info("marketplace.buyer.verified", { buyerId: result.buyer.id });
            return NextResponse.json({ ok: true, token, expiresAt, role: "buyer", buyer: result.buyer });
        } catch (error) {
            return internalError(error, { event: "marketplace.buyer.verify.failure" });
        }
    });
}
