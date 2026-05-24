import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { sendEventSignupConfirmationEmail } from "@/lib/events/email";
import { getEventBySlug } from "@/lib/events";
import { getEffectiveSignupLimit, getSeatsTaken, getSignupStatus } from "@/lib/event-signups";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

const badRequest = (message) => NextResponse.json({ error: message }, { status: 400 });

function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
}

function sanitizeName(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
}

async function reserveSeat({ slug, name, email, signupLimit }) {
    const normalizedEmail = normalizeEmail(email);

    for (let attempt = 0; attempt < 3; attempt += 1) {
        const inserted = await db.queryOne(
            `INSERT INTO event_signups (event_slug, slot_number, name, email, email_normalized)
             SELECT $1, seat.slot_number, $2, $3, $4
             FROM generate_series(1, $5) AS seat(slot_number)
             WHERE NOT EXISTS (
                 SELECT 1
                 FROM event_signups existing_email
                 WHERE existing_email.event_slug = $1
                   AND existing_email.email_normalized = $4
             )
             AND NOT EXISTS (
                 SELECT 1
                 FROM event_signups occupied
                 WHERE occupied.event_slug = $1
                   AND occupied.slot_number = seat.slot_number
             )
             ORDER BY seat.slot_number
             LIMIT 1
             ON CONFLICT DO NOTHING
             RETURNING slot_number`,
            [slug, name, email, normalizedEmail, signupLimit]
        );

        if (inserted?.slot_number) {
            return { status: "created", slotNumber: inserted.slot_number };
        }

        const duplicate = await db.queryOne(
            `SELECT slot_number
             FROM event_signups
             WHERE event_slug = $1
               AND email_normalized = $2`,
            [slug, normalizedEmail]
        );

        if (duplicate?.slot_number) {
            return { status: "duplicate", slotNumber: duplicate.slot_number };
        }

        const seatsTaken = await getSeatsTaken(slug);

        if (seatsTaken >= signupLimit) {
            return { status: "full" };
        }
    }

    return { status: "retry_exhausted" };
}

export async function GET(request, { params }) {
    return withRequestLogging(request, "GET /api/events/[slug]/signup", async ({ logger, internalError }) => {
        try {
            const { slug } = await params;
            const event = getEventBySlug(slug);

            if (!event) {
                return NextResponse.json({ error: "Event not found" }, { status: 404 });
            }

            const status = await getSignupStatus(slug);

            if (!status.enabled) {
                return NextResponse.json({
                    ...status,
                    message: "Event signup is not enabled for this event.",
                });
            }

            return NextResponse.json(status);
        } catch (error) {
            logger.error("events.signup.status.failed", error);
            return internalError(error, {
                event: "events.signup.status.failed",
            });
        }
    });
}

export async function POST(request, { params }) {
    return withRequestLogging(request, "POST /api/events/[slug]/signup", async ({ logger, internalError }) => {
        try {
            const { slug } = await params;
            const event = getEventBySlug(slug);

            if (!event) {
                return NextResponse.json({ error: "Event not found" }, { status: 404 });
            }

            const signupLimit = await getEffectiveSignupLimit(slug);

            if (!signupLimit) {
                return badRequest("Event signup is not enabled for this event.");
            }

            const body = await request.json().catch(() => null);

            if (!body) {
                return badRequest("Invalid request body");
            }

            const name = sanitizeName(body.name);
            const email = String(body.email || "").trim();
            const emailNormalized = normalizeEmail(email);

            if (!name || name.length < 2 || name.length > 80) {
                return badRequest("Name must be between 2 and 80 characters.");
            }

            if (!emailNormalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNormalized)) {
                return badRequest("A valid email address is required.");
            }

            const signup = await reserveSeat({
                slug,
                name,
                email,
                signupLimit,
            });

            const seatsTaken = await getSeatsTaken(slug);
            const seatsRemaining = Math.max(signupLimit - seatsTaken, 0);

            if (signup.status === "created") {
                try {
                    await sendEventSignupConfirmationEmail({
                        to: email,
                        name,
                        event,
                        slotNumber: signup.slotNumber,
                        seatsRemaining,
                        capacity: signupLimit,
                    });
                } catch (emailError) {
                    logger.warn("events.signup.confirmation_email.failed", {
                        slug,
                        email: emailNormalized,
                        reason: emailError instanceof Error ? emailError.message : "unknown_error",
                    });
                }

                return NextResponse.json(
                    {
                        success: true,
                        status: "created",
                        message: `You are confirmed for ${event.title}.`,
                        capacity: signupLimit,
                        seatsTaken,
                        seatsRemaining,
                    },
                    { status: 201 }
                );
            }

            if (signup.status === "duplicate") {
                return NextResponse.json(
                    {
                        success: true,
                        status: "duplicate",
                        message: "This email is already signed up for this event.",
                        capacity: signupLimit,
                        seatsTaken,
                        seatsRemaining,
                    },
                    { status: 200 }
                );
            }

            if (signup.status === "full") {
                return NextResponse.json(
                    {
                        success: false,
                        status: "full",
                        message: "This event is currently full.",
                        capacity: signupLimit,
                        seatsTaken,
                        seatsRemaining,
                    },
                    { status: 409 }
                );
            }

            logger.warn("events.signup.retry_exhausted", {
                slug,
            });

            return NextResponse.json(
                {
                    success: false,
                    status: "retry_exhausted",
                    message: "Could not complete signup right now. Please try again.",
                    capacity: signupLimit,
                    seatsTaken,
                    seatsRemaining,
                },
                { status: 503 }
            );
        } catch (error) {
            logger.error("events.signup.create.failed", error);
            return internalError(error, {
                event: "events.signup.create.failed",
            });
        }
    });
}
