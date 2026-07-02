import { NextResponse } from "next/server";

import { setEventAttendance } from "@/lib/marketplace/events.js";
import { getAuthenticatedVendor } from "@/lib/marketplace/vendor-session.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

// Toggle a vendor's attendance at an event ("I'll be there").
export async function PATCH(request, { params }) {
    return withRequestLogging(request, "PATCH /api/marketplace/vendor/events/[id]", async ({ logger }) => {
        const vendor = await getAuthenticatedVendor();
        if (!vendor) {
            return NextResponse.json({ error: "unauthorized" }, { status: 401 });
        }
        const { id } = await params;
        const body = await request.json().catch(() => ({}));
        await setEventAttendance(id, vendor.id, Boolean(body.attending));
        logger.info("marketplace.event.attendance", { vendorId: vendor.id, eventId: id, attending: Boolean(body.attending) });
        return NextResponse.json({ ok: true });
    });
}
