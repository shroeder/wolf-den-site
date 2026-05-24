import { NextResponse } from "next/server";

import { verifyAdminApiKey } from "@/lib/admin/admin-auth";
import { getEventBySlug } from "@/lib/events";
import { getSignupStatus, listSignupsForEvent, setSignupLimit } from "@/lib/event-signups";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

function normalizePatchPayload(body) {
    return {
        signupLimit: body?.signupLimit,
    };
}

function validatePatchPayload(payload) {
    if (payload.signupLimit === undefined) {
        return "missing_signup_limit";
    }

    const signupLimit = Number(payload.signupLimit);

    if (!Number.isInteger(signupLimit) || signupLimit <= 0 || signupLimit > 64) {
        return "invalid_signup_limit";
    }

    payload.signupLimit = signupLimit;

    return null;
}

export async function GET(request, { params }) {
    return withRequestLogging(request, "GET /api/admin/events/[slug]", async ({ logger, internalError }) => {
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
            const [status, signups] = await Promise.all([
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
                    signupStatus: status,
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
                event: "admin.events.detail.failure",
                slug,
            });
        }
    });
}

export async function PATCH(request, { params }) {
    return withRequestLogging(request, "PATCH /api/admin/events/[slug]", async ({ logger, internalError }) => {
        const authError = verifyAdminApiKey(request, logger);

        if (authError) {
            return authError;
        }

        const { slug } = await params;
        const event = getEventBySlug(slug);

        if (!event) {
            return NextResponse.json({ error: "event_not_found" }, { status: 404 });
        }

        if (!event.signupLimit) {
            return NextResponse.json({ error: "event_signup_not_enabled" }, { status: 400 });
        }

        let body;

        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: "invalid_json" }, { status: 400 });
        }

        const payload = normalizePatchPayload(body);
        const payloadError = validatePatchPayload(payload);

        if (payloadError) {
            return NextResponse.json({ error: payloadError }, { status: 400 });
        }

        try {
            const signups = await listSignupsForEvent(slug);

            if (payload.signupLimit < signups.length) {
                return NextResponse.json(
                    {
                        error: "signup_limit_below_current_signups",
                        currentSignups: signups.length,
                    },
                    { status: 409 }
                );
            }

            const settings = await setSignupLimit(slug, payload.signupLimit);
            const status = await getSignupStatus(slug);

            return NextResponse.json({
                success: true,
                settings,
                signupStatus: status,
            });
        } catch (error) {
            return internalError(error, {
                event: "admin.events.update.failure",
                slug,
            });
        }
    });
}
