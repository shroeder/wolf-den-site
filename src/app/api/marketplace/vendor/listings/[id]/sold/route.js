import { NextResponse } from "next/server";

import { markListingSold } from "@/lib/marketplace/sales.js";
import { getAuthenticatedVendor } from "@/lib/marketplace/vendor-session.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

// Mark the vendor's own active listing as sold: snapshots it into mkt_sale and drops it from
// active inventory. Vendor-scoped.
export async function POST(request, { params }) {
    return withRequestLogging(request, "POST /api/marketplace/vendor/listings/[id]/sold", async ({ logger, internalError }) => {
        try {
            const vendor = await getAuthenticatedVendor();

            if (!vendor) {
                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }

            const { id } = await params;
            const sale = await markListingSold(id, vendor.id);

            if (!sale) {
                return NextResponse.json({ error: "Listing not found." }, { status: 404 });
            }

            logger.info("marketplace.vendor.listing_sold", { vendorId: vendor.id, listingId: id, saleId: sale.id });

            return NextResponse.json({ ok: true, sale });
        } catch (error) {
            return internalError(error, { event: "marketplace.vendor.listing_sold.failure" });
        }
    });
}
