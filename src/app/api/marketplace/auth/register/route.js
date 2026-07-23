import { after, NextResponse } from "next/server";

import { createBuyer, createEmailVerification } from "@/lib/marketplace/buyer-session.js";
import { sendVerificationEmail } from "@/lib/marketplace/email.js";
import { sendAdminPush } from "@/lib/push/send.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

// Buyer self-registration from the phone app. Creates an UNVERIFIED account, emails a 6-digit code,
// and returns no token — the app must verify the code (auth/verify) to get a session.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/auth/register", async ({ logger, internalError }) => {
        try {
            const body = await request.json().catch(() => ({}));
            try {
                const buyer = await createBuyer({
                    email: body.email,
                    password: body.password,
                    displayName: body.displayName ?? null,
                    firstName: body.firstName ?? null,
                    lastName: body.lastName ?? null,
                    refCode: body.ref ?? body.refCode ?? null, // referral @handle from an invite link
                });
                const verification = await createEmailVerification(buyer.email);
                if (verification) {
                    try {
                        await sendVerificationEmail(verification.email, verification.code);
                    } catch (emailError) {
                        logger.warn("marketplace.buyer.verify_email_failed", { reason: emailError.message });
                    }
                }
                logger.info("marketplace.buyer.registered", { buyerId: buyer.id, needsVerification: true });
                // Ping the owner/admin app that a new member joined (fire-and-forget).
                const who = buyer.displayName || [buyer.firstName, buyer.lastName].filter(Boolean).join(" ") || buyer.email;
                after(() => sendAdminPush({
                    title: "🐺 New member joined!",
                    body: `${who} just signed up in the app.`,
                    route: `members?member=${buyer.id}`, // deep-link straight to the new member's profile
                    data: { type: "new_member", buyerId: buyer.id },
                }).catch(() => {}));
                return NextResponse.json({ ok: true, needsVerification: true, email: buyer.email });
            } catch (validationError) {
                return NextResponse.json({ error: validationError.message }, { status: 400 });
            }
        } catch (error) {
            return internalError(error, { event: "marketplace.buyer.register.failure" });
        }
    });
}
