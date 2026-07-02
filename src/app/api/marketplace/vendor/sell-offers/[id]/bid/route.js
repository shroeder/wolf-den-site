import { NextResponse } from "next/server";

import { createSellOfferBid } from "@/lib/marketplace/sell-offers.js";
import { getAuthenticatedVendor } from "@/lib/marketplace/vendor-session.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

// A vendor makes a structured offer (amount + note) on a seller's /get-offers post. Emails the seller.
export async function POST(request, { params }) {
    return withRequestLogging(request, "POST /api/marketplace/vendor/sell-offers/[id]/bid", async ({ logger }) => {
        const vendor = await getAuthenticatedVendor();
        if (!vendor) {
            return NextResponse.json({ error: "unauthorized" }, { status: 401 });
        }
        const { id } = await params;
        const body = await request.json().catch(() => ({}));
        try {
            const bidId = await createSellOfferBid({
                sellOfferId: id,
                vendorId: vendor.id,
                amount: body.amount ?? null,
                note: body.note ?? null,
            });
            logger.info("marketplace.sell_bid.api_created", { vendorId: vendor.id, bidId });
            return NextResponse.json({ ok: true, id: bidId });
        } catch (validationError) {
            return NextResponse.json({ error: validationError.message }, { status: 400 });
        }
    });
}
