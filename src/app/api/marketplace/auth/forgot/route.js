import { NextResponse } from "next/server";

import { createPasswordReset } from "@/lib/marketplace/buyer-session.js";
import { sendPasswordResetEmail } from "@/lib/marketplace/email.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

// Start a password reset. Always responds ok (never reveals whether an email is registered).
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/auth/forgot", async ({ logger, internalError }) => {
        try {
            const body = await request.json().catch(() => ({}));
            const reset = await createPasswordReset(body.email);
            if (reset) {
                try {
                    await sendPasswordResetEmail(reset.email, reset.token);
                } catch (error) {
                    logger.warn("marketplace.auth.reset_email_failed", { reason: error.message });
                }
            }
            return NextResponse.json({ ok: true });
        } catch (error) {
            return internalError(error, { event: "marketplace.auth.forgot.failure" });
        }
    });
}
