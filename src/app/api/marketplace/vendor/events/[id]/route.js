import { NextResponse } from "next/server";

import { setEventAttendance, updateEvent } from "@/lib/marketplace/events.js";
import { getAuthenticatedVendor } from "@/lib/marketplace/vendor-session.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

// Attendance toggle ({attending}), or edit the event fields (creator only).
export async function PATCH(request, { params }) {
    return withRequestLogging(request, "PATCH /api/marketplace/vendor/events/[id]", async ({ logger }) => {
        const vendor = await getAuthenticatedVendor();
        if (!vendor) {
            return NextResponse.json({ error: "unauthorized" }, { status: 401 });
        }
        const { id } = await params;
        const body = await request.json().catch(() => ({}));

        if ("attending" in body) {
            await setEventAttendance(id, vendor.id, Boolean(body.attending));
            logger.info("marketplace.event.attendance", { vendorId: vendor.id, eventId: id, attending: Boolean(body.attending) });
            return NextResponse.json({ ok: true });
        }

        try {
            const updated = await updateEvent({
                eventId: id,
                vendorId: vendor.id,
                name: body.name,
                locationLabel: body.locationLabel,
                eventDate: body.eventDate,
                imageUrl: body.imageUrl,
                latitude: body.latitude,
                longitude: body.longitude,
            });
            if (!updated) {
                return NextResponse.json({ error: "You can only edit events you created." }, { status: 403 });
            }
            logger.info("marketplace.event.updated", { vendorId: vendor.id, eventId: id });
            return NextResponse.json({ ok: true });
        } catch (validationError) {
            return NextResponse.json({ error: validationError.message }, { status: 400 });
        }
    });
}
