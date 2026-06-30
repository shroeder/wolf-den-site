import { NextResponse } from "next/server";

import { setContactRequestStatus } from "@/lib/marketplace/contact.js";
import { getAuthenticatedVendor } from "@/lib/marketplace/vendor-session.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

// Move a lead through the funnel: responded | sold | closed. Marking 'sold' also closes out the
// linked listing and attributes the sale back to this lead.
export async function PATCH(request, { params }) {
    return withRequestLogging(request, "PATCH /api/marketplace/vendor/requests/[id]", async ({ logger, internalError }) => {
        try {
            const vendor = await getAuthenticatedVendor();

            if (!vendor) {
                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }

            const { id } = await params;
            const body = await request.json().catch(() => ({}));
            const status = String(body.status || "").trim();

            if (!["responded", "sold", "closed"].includes(status)) {
                return NextResponse.json({ error: "Invalid status." }, { status: 400 });
            }

            const updated = await setContactRequestStatus(id, vendor.id, status);

            if (!updated) {
                return NextResponse.json({ error: "Request not found." }, { status: 404 });
            }

            logger.info("marketplace.vendor.request_status", { vendorId: vendor.id, requestId: id, status });

            return NextResponse.json({ ok: true, request: updated });
        } catch (error) {
            return internalError(error, { event: "marketplace.vendor.request_status.failure" });
        }
    });
}
