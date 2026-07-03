import { NextResponse } from "next/server";

import { resetPassword } from "@/lib/marketplace/buyer-session.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

// Complete a password reset with the emailed token + a new password.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/auth/reset", async ({ logger, internalError }) => {
        try {
            const body = await request.json().catch(() => ({}));
            try {
                await resetPassword(body.token, body.password);
                logger.info("marketplace.auth.reset_completed");
                return NextResponse.json({ ok: true });
            } catch (validationError) {
                return NextResponse.json({ error: validationError.message }, { status: 400 });
            }
        } catch (error) {
            return internalError(error, { event: "marketplace.auth.reset.failure" });
        }
    });
}
