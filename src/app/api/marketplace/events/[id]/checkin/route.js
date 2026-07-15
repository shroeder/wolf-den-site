import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { awardXp } from "@/lib/marketplace/xp.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// Event + whether today (store-local, Central) is its date. Check-in is only open on the event day.
async function eventDayInfo(id) {
    return db
        .queryOne(
            `SELECT id, event_date,
                    (event_date = (NOW() AT TIME ZONE 'America/Chicago')::date) AS is_today
               FROM mkt_event WHERE id = $1`,
            [id]
        )
        .catch(() => null);
}

const dedupeKey = (eventId, buyerId) => `event_checkin:${eventId}:${buyerId}`;

// Status for the check-in button: is the user signed in, is it the event day, have they already checked in.
export async function GET(request, { params }) {
    return withRequestLogging(request, "GET /api/marketplace/events/[id]/checkin", async ({ internalError }) => {
        try {
            const { id } = await params;
            const ev = await eventDayInfo(id);
            if (!ev) return noStore({ error: "not_found" }, { status: 404 });
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ signedIn: false, eligible: ev.is_today === true, checkedIn: false });
            const done = await db
                .queryOne(`SELECT 1 FROM mkt_xp_event WHERE buyer_id = $1 AND dedupe_key = $2`, [buyer.id, dedupeKey(id, buyer.id)])
                .catch(() => null);
            return noStore({ signedIn: true, eligible: ev.is_today === true, checkedIn: Boolean(done) });
        } catch (error) {
            return internalError(error, { event: "marketplace.event.checkin.get.failure" });
        }
    });
}

// Check in for +50 XP, once per event, only on the event day.
export async function POST(request, { params }) {
    return withRequestLogging(request, "POST /api/marketplace/events/[id]/checkin", async ({ internalError }) => {
        try {
            const { id } = await params;
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            const ev = await eventDayInfo(id);
            if (!ev) return noStore({ error: "not_found" }, { status: 404 });
            if (ev.is_today !== true) return noStore({ error: "not_event_day" }, { status: 400 });
            const points = await awardXp(buyer.id, "event_checkin", { dedupeKey: dedupeKey(id, buyer.id), meta: { eventId: id } });
            return noStore({ ok: true, points: points || 0, already: points == null });
        } catch (error) {
            return internalError(error, { event: "marketplace.event.checkin.post.failure" });
        }
    });
}
