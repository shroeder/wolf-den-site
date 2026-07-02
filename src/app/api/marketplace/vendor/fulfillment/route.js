import { NextResponse } from "next/server";

import { getAuthenticatedVendor } from "@/lib/marketplace/vendor-session.js";
import { setVendorFulfillment } from "@/lib/marketplace/vendors.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

// Save a vendor's fulfillment options (ships / local pickup) shown on their storefront trust strip.
export async function PATCH(request) {
    return withRequestLogging(request, "PATCH /api/marketplace/vendor/fulfillment", async ({ logger }) => {
        const vendor = await getAuthenticatedVendor();
        if (!vendor) {
            return NextResponse.json({ error: "unauthorized" }, { status: 401 });
        }

        const body = await request.json().catch(() => ({}));
        const ships = Boolean(body.ships);
        const localPickup = Boolean(body.localPickup);

        const updated = await setVendorFulfillment(vendor.id, { ships, localPickup });
        logger.info("marketplace.vendor.fulfillment_saved", { vendorId: vendor.id, ships, localPickup });
        return NextResponse.json({ ok: true, ships: updated.ships, localPickup: updated.localPickup });
    });
}
