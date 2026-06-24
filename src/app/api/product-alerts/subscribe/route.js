import { NextResponse } from "next/server";

import { withRequestLogging } from "@/lib/server-logger";
import { upsertSubscriberWithCategories } from "@/lib/product-alerts/subscribers";
import { listVisibleCategories } from "@/lib/product-alerts/categories";
import { sendSubscriberConfirmationEmail } from "@/lib/product-alerts/email";

export const runtime = "nodejs";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request) {
    return withRequestLogging(request, "POST /api/product-alerts/subscribe", async ({ logger, internalError }) => {
        try {
            const body = await request.json().catch(() => null);
            const email = String(body?.email || "").trim();
            const categoryIds = Array.isArray(body?.categoryIds) ? body.categoryIds : [];

            if (!EMAIL_PATTERN.test(email.toLowerCase())) {
                return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
            }

            if (!categoryIds.length) {
                return NextResponse.json({ error: "Pick at least one category to follow." }, { status: 400 });
            }

            const result = await upsertSubscriberWithCategories(email, categoryIds);

            if (result.error === "no_categories") {
                return NextResponse.json({ error: "Pick at least one valid category to follow." }, { status: 400 });
            }

            // Resolve names for the confirmation email's "you'll hear about…" line.
            const allCategories = await listVisibleCategories();
            const nameById = new Map(allCategories.map((category) => [category.id, category.name]));
            const categoryNames = result.categoryIds.map((id) => nameById.get(id)).filter(Boolean);

            try {
                await sendSubscriberConfirmationEmail(email, result.rawToken, categoryNames);
            } catch (emailError) {
                logger.warn("product_alerts.subscribe.confirmation_send.failed", {
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
                message: "Check your inbox for a confirmation link to turn on alerts.",
            });
        } catch (error) {
            return internalError(error, { event: "product_alerts.subscribe.failed" });
        }
    });
}
