import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { withRequestLogging } from "@/lib/server-logger";
import { attachWatcherEmail, getOrCreateWatcher } from "@/lib/looking-for/watchers";
import { sendWatcherConfirmationEmail } from "@/lib/looking-for/email";

export const runtime = "nodejs";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request) {
    return withRequestLogging(request, "POST /api/looking-for/email", async ({ logger, internalError }) => {
        try {
            const body = await request.json().catch(() => null);
            const email = String(body?.email || "").trim();

            if (!EMAIL_PATTERN.test(email.toLowerCase())) {
                return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
            }

            const cookieStore = await cookies();
            const watcher = await getOrCreateWatcher(cookieStore);
            const rawToken = await attachWatcherEmail(watcher.id, email);

            try {
                await sendWatcherConfirmationEmail(email, rawToken);
            } catch (emailError) {
                logger.warn("looking_for.email.confirmation_send.failed", {
                    reason: emailError instanceof Error ? emailError.message : "unknown_error",
                });

                return NextResponse.json(
                    { error: "We couldn't send the confirmation email. Please try again later." },
                    { status: 502 }
                );
            }

            return NextResponse.json({
                success: true,
                email,
                emailVerified: false,
                message: "Check your inbox for a confirmation link to turn on alerts.",
            });
        } catch (error) {
            return internalError(error, { event: "looking_for.email.attach.failed" });
        }
    });
}
