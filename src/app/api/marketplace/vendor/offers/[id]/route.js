import { NextResponse } from "next/server";

import { respondToDealerOffer } from "@/lib/marketplace/offers.js";
import { getAuthenticatedVendor } from "@/lib/marketplace/vendor-session.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

// Respond to a dealer offer: accept/decline (listing owner) or withdraw (offering dealer).
export async function PATCH(request, { params }) {
    return withRequestLogging(request, "PATCH /api/marketplace/vendor/offers/[id]", async ({ logger, internalError }) => {
        try {
            const vendor = await getAuthenticatedVendor();
            if (!vendor) {
                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }
            const { id } = await params;
            const body = await request.json().catch(() => ({}));
            const action = body?.action;
            if (!["accept", "decline", "withdraw"].includes(action)) {
                return NextResponse.json({ error: "Invalid action." }, { status: 400 });
            }
            try {
                const status = await respondToDealerOffer(id, vendor.id, action);
                logger.info("marketplace.offer.api_responded", { vendorId: vendor.id, offerId: id, status });
                return NextResponse.json({ ok: true, status });
            } catch (validationError) {
                return NextResponse.json({ error: validationError.message }, { status: 400 });
            }
        } catch (error) {
            return internalError(error, { event: "marketplace.offers.respond.failure" });
        }
    });
}
