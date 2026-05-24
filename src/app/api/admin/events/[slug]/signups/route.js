import { NextResponse } from "next/server";

import { verifyAdminApiKey } from "@/lib/admin/admin-auth";
import { getEventBySlug } from "@/lib/events";
import { getSignupStatus, listSignupsForEvent } from "@/lib/event-signups";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

export async function GET(request, { params }) {
    return withRequestLogging(request, "GET /api/admin/events/[slug]/signups", async ({ logger, internalError }) => {
        const authError = verifyAdminApiKey(request, logger);

        if (authError) {
            return authError;
        }

        const { slug } = await params;
        const event = getEventBySlug(slug);

        if (!event) {
            return NextResponse.json({ error: "event_not_found" }, { status: 404 });
        }

        try {
            const [signupStatus, signups] = await Promise.all([
                getSignupStatus(slug),
                listSignupsForEvent(slug),
            ]);

            return NextResponse.json(
                {
                    event: {
                        slug: event.slug,
                        title: event.title,
                        day: event.day,
                        time: event.time,
                    },
                    signupStatus,
                    signups,
                },
                {
                    headers: {
                        "Cache-Control": "no-store",
                    },
                }
            );
        } catch (error) {
            return internalError(error, {
                event: "admin.events.signups.list.failure",
                slug,
            });
        }
    });
}
