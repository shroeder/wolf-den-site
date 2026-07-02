import { NextResponse } from "next/server";

import { createEvent, listEventsForVendor } from "@/lib/marketplace/events.js";
import { getAuthenticatedVendor } from "@/lib/marketplace/vendor-session.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

// Upcoming events + whether this vendor is attending (for the "I'll be there" portal section).
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/vendor/events", async ({ internalError }) => {
        try {
            const vendor = await getAuthenticatedVendor();
            if (!vendor) {
                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }
            const events = await listEventsForVendor(vendor.id);
            return NextResponse.json({ events }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.events.list.failure" });
        }
    });
}

// Create a new event (or reuse a duplicate).
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/vendor/events", async ({ logger }) => {
        const vendor = await getAuthenticatedVendor();
        if (!vendor) {
            return NextResponse.json({ error: "unauthorized" }, { status: 401 });
        }
        const body = await request.json().catch(() => ({}));
        try {
            const id = await createEvent({
                name: body.name,
                locationLabel: body.locationLabel ?? null,
                eventDate: body.eventDate || null,
                createdBy: vendor.id,
            });
            logger.info("marketplace.event.created", { vendorId: vendor.id, eventId: id });
            return NextResponse.json({ ok: true, id });
        } catch (validationError) {
            return NextResponse.json({ error: validationError.message }, { status: 400 });
        }
    });
}
