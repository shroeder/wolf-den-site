import { NextResponse } from "next/server";

import { verifyAdminApiKey } from "@/lib/admin/admin-auth";
import { getEventBySlug } from "@/lib/events";
import { deleteSignupById, getSignupStatus } from "@/lib/event-signups";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

export async function DELETE(request, { params }) {
    return withRequestLogging(request, "DELETE /api/admin/events/[slug]/signups/[signupId]", async ({ logger, internalError }) => {
        const authError = verifyAdminApiKey(request, logger);

        if (authError) {
            return authError;
        }

        const { slug, signupId } = await params;
        const event = getEventBySlug(slug);

        if (!event) {
            return NextResponse.json({ error: "event_not_found" }, { status: 404 });
        }

        if (!signupId || typeof signupId !== "string") {
            return NextResponse.json({ error: "invalid_signup_id" }, { status: 400 });
        }

        try {
            const removed = await deleteSignupById(slug, signupId);

            if (!removed) {
                return NextResponse.json({ error: "signup_not_found" }, { status: 404 });
            }

            const signupStatus = await getSignupStatus(slug);

            return NextResponse.json({
                success: true,
                removed,
                signupStatus,
            });
        } catch (error) {
            return internalError(error, {
                event: "admin.events.signups.delete.failure",
                slug,
                signupId,
            });
        }
    });
}
