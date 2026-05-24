import "server-only";

import { db } from "@/lib/db";
import { getEventBySlug, events } from "@/lib/events";

function toIso(value) {
    return value ? new Date(value).toISOString() : null;
}

function getDefaultSignupLimit(slug) {
    const event = getEventBySlug(slug);

    if (!event || !event.signupLimit) {
        return null;
    }

    return Number(event.signupLimit);
}

export async function getEffectiveSignupLimit(slug) {
    const defaultLimit = getDefaultSignupLimit(slug);

    if (!defaultLimit) {
        return null;
    }

    const row = await db.queryOne(
        `SELECT signup_limit
         FROM event_signup_settings
         WHERE event_slug = $1`,
        [slug]
    );

    if (!row?.signup_limit) {
        return defaultLimit;
    }

    return Number(row.signup_limit);
}

export async function getSeatsTaken(slug) {
    const row = await db.queryOne(
        `SELECT COUNT(*)::int AS seats_taken
         FROM event_signups
         WHERE event_slug = $1`,
        [slug]
    );

    return row?.seats_taken ?? 0;
}

export async function getSignupStatus(slug) {
    const capacity = await getEffectiveSignupLimit(slug);

    if (!capacity) {
        return {
            enabled: false,
            slug,
        };
    }

    const seatsTaken = await getSeatsTaken(slug);
    const seatsRemaining = Math.max(capacity - seatsTaken, 0);

    return {
        enabled: true,
        slug,
        capacity,
        seatsTaken,
        seatsRemaining,
        isFull: seatsRemaining === 0,
    };
}

export async function listSignupsForEvent(slug) {
    const rows = await db.query(
        `SELECT id, slot_number, name, email, created_at
         FROM event_signups
         WHERE event_slug = $1
         ORDER BY slot_number ASC`,
        [slug]
    );

    return rows.map((row) => ({
        id: row.id,
        slotNumber: Number(row.slot_number),
        name: row.name,
        email: row.email,
        createdAt: toIso(row.created_at),
    }));
}

export async function deleteSignupById(slug, signupId) {
    const row = await db.queryOne(
        `DELETE FROM event_signups
         WHERE event_slug = $1
           AND id = $2
         RETURNING id, slot_number, name, email, created_at`,
        [slug, signupId]
    );

    if (!row) {
        return null;
    }

    return {
        id: row.id,
        slotNumber: Number(row.slot_number),
        name: row.name,
        email: row.email,
        createdAt: toIso(row.created_at),
    };
}

export async function setSignupLimit(slug, signupLimit) {
    const row = await db.queryOne(
        `INSERT INTO event_signup_settings (event_slug, signup_limit, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (event_slug)
         DO UPDATE SET signup_limit = EXCLUDED.signup_limit, updated_at = NOW()
         RETURNING event_slug, signup_limit, updated_at`,
        [slug, signupLimit]
    );

    return {
        slug: row.event_slug,
        signupLimit: Number(row.signup_limit),
        updatedAt: toIso(row.updated_at),
    };
}

export async function listAdminEventSummaries() {
    const settingsRows = await db.query(
        `SELECT event_slug, signup_limit, updated_at
         FROM event_signup_settings`
    );

    const settingsBySlug = new Map(
        settingsRows.map((row) => [
            row.event_slug,
            {
                signupLimit: Number(row.signup_limit),
                updatedAt: toIso(row.updated_at),
            },
        ])
    );

    const signupsRows = await db.query(
        `SELECT event_slug, COUNT(*)::int AS seats_taken
         FROM event_signups
         GROUP BY event_slug`
    );

    const seatsTakenBySlug = new Map(signupsRows.map((row) => [row.event_slug, Number(row.seats_taken || 0)]));

    return events
        .filter((event) => event.signupLimit)
        .map((event) => {
            const override = settingsBySlug.get(event.slug);
            const capacity = override?.signupLimit ?? Number(event.signupLimit);
            const seatsTaken = seatsTakenBySlug.get(event.slug) || 0;
            const seatsRemaining = Math.max(capacity - seatsTaken, 0);

            return {
                slug: event.slug,
                title: event.title,
                day: event.day,
                time: event.time,
                defaultCapacity: Number(event.signupLimit),
                capacity,
                seatsTaken,
                seatsRemaining,
                isFull: seatsRemaining === 0,
                updatedAt: override?.updatedAt || null,
            };
        });
}
