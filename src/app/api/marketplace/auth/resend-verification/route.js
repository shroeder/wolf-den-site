import { NextResponse } from "next/server";

import { createEmailVerification } from "@/lib/marketplace/buyer-session.js";
import { sendVerificationEmail } from "@/lib/marketplace/email.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

// Resend a verification code. Always responds ok (never reveals whether an email is registered).
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/auth/resend-verification", async ({ logger, internalError }) => {
        try {
            const body = await request.json().catch(() => ({}));
            const verification = await createEmailVerification(body.email);
            if (verification) {
                try {
                    await sendVerificationEmail(verification.email, verification.code);
                } catch (emailError) {
                    logger.warn("marketplace.buyer.resend_email_failed", { reason: emailError.message });
                }
            }
            return NextResponse.json({ ok: true });
        } catch (error) {
            return internalError(error, { event: "marketplace.buyer.resend.failure" });
        }
    });
}
