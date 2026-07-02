import { NextResponse } from "next/server";

import { createDealerOffer, listDealerOffers } from "@/lib/marketplace/offers.js";
import { getAuthenticatedVendor } from "@/lib/marketplace/vendor-session.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

// A vendor's dealer offers (incoming on their listings + outgoing they made).
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/vendor/offers", async ({ internalError }) => {
        try {
            const vendor = await getAuthenticatedVendor();
            if (!vendor) {
                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }
            const offers = await listDealerOffers(vendor.id);
            return NextResponse.json({ offers }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.offers.list.failure" });
        }
    });
}

// Make a dealer offer on another vendor's dealer-available listing.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/vendor/offers", async ({ logger, internalError }) => {
        try {
            const vendor = await getAuthenticatedVendor();
            if (!vendor) {
                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }
            const body = await request.json().catch(() => ({}));
            if (!body?.listingId) {
                return NextResponse.json({ error: "A listing is required." }, { status: 400 });
            }
            try {
                const id = await createDealerOffer({
                    fromVendorId: vendor.id,
                    listingId: body.listingId,
                    kind: body.kind === "trade" ? "trade" : "buy",
                    amount: body.amount ?? null,
                    quantity: body.quantity ?? 1,
                    note: body.note ?? null,
                });
                logger.info("marketplace.offer.api_created", { vendorId: vendor.id, offerId: id });
                return NextResponse.json({ ok: true, id });
            } catch (validationError) {
                return NextResponse.json({ error: validationError.message }, { status: 400 });
            }
        } catch (error) {
            return internalError(error, { event: "marketplace.offers.create.failure" });
        }
    });
}
