import { NextResponse } from "next/server";

import { getResetEmail, resetPassword } from "@/lib/marketplace/buyer-session.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Resolve the email for a reset token, so the reset form can carry it as the browser's username field.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/auth/reset", async ({ internalError }) => {
        try {
            const token = new URL(request.url).searchParams.get("token") || "";
            const email = await getResetEmail(token);
            return NextResponse.json({ email: email || null }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.auth.reset.lookup.failure" });
        }
    });
}

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
