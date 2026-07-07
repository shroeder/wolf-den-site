import { NextResponse } from "next/server";

import { authenticateBuyer, createBuyerSession, createEmailVerification, getAccountLinkedVendorId, setBuyerSessionCookie } from "@/lib/marketplace/buyer-session.js";
import { createVendorSession } from "@/lib/marketplace/vendor-session.js";
import { sendVerificationEmail } from "@/lib/marketplace/email.js";
import { authenticateVendor, getVendorById } from "@/lib/marketplace/vendors.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

// Unified login: one account, one email + password. We authenticate the account (mkt_buyer); an
// account with a linked active vendor profile is a SELLER, otherwise a BUYER. Existing vendors were
// backfilled accounts with their web-portal credentials, so they sign in unchanged and land as
// sellers. (Legacy fallback covers any vendor without an account yet.)
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/auth/login", async ({ logger, internalError }) => {
        try {
            const body = await request.json().catch(() => ({}));
            const { email, password } = body;

            const account = await authenticateBuyer(email, password);
            if (account) {
                if (!account.emailVerified) {
                    // Block unverified accounts; re-send a fresh code so they can finish verifying.
                    const verification = await createEmailVerification(account.email);
                    if (verification) {
                        try {
                            await sendVerificationEmail(verification.email, verification.code);
                        } catch (emailError) {
                            logger.warn("marketplace.auth.login_verify_email_failed", { reason: emailError.message });
                        }
                    }
                    logger.info("marketplace.auth.login_needs_verification", { accountId: account.id });
                    return NextResponse.json({ ok: true, needsVerification: true, email: account.email });
                }
                const { token, expiresAt } = await createBuyerSession(account.id, { deviceLabel: "app" });
                // Also set a web cookie so the SAME account works on the website (app ignores it and
                // uses the returned token). getAuthenticatedVendor falls back to the linked account,
                // so this one cookie covers both buyer and seller web sessions.
                await setBuyerSessionCookie(token);
                const vendorId = await getAccountLinkedVendorId(account.id);
                if (vendorId) {
                    const vendor = await getVendorById(vendorId);
                    logger.info("marketplace.auth.login", { role: "vendor", accountId: account.id, vendorId });
                    return NextResponse.json({
                        ok: true,
                        token,
                        expiresAt,
                        role: "vendor",
                        account,
                        vendor: { id: vendor.id, displayName: vendor.displayName, email: vendor.email },
                    });
                }
                logger.info("marketplace.auth.login", { role: "buyer", accountId: account.id });
                return NextResponse.json({ ok: true, token, expiresAt, role: "buyer", buyer: account });
            }

            // Legacy: a vendor with no linked account yet (shouldn't happen after the backfill).
            const vendor = await authenticateVendor(email, password);
            if (vendor) {
                const { token, expiresAt } = await createVendorSession(vendor.id, { deviceLabel: "app" });
                logger.info("marketplace.auth.login", { role: "vendor", vendorId: vendor.id, legacy: true });
                return NextResponse.json({
                    ok: true,
                    token,
                    expiresAt,
                    role: "vendor",
                    vendor: { id: vendor.id, displayName: vendor.displayName, email: vendor.email },
                });
            }

            return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
        } catch (error) {
            return internalError(error, { event: "marketplace.auth.login.failure" });
        }
    });
}
