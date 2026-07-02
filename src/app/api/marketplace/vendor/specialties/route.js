import { NextResponse } from "next/server";

import { getAuthenticatedVendor } from "@/lib/marketplace/vendor-session.js";
import { setVendorSpecialties } from "@/lib/marketplace/vendors.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

// Save a vendor's specialty tags (curated vocabulary; invalid values are dropped server-side).
export async function PATCH(request) {
    return withRequestLogging(request, "PATCH /api/marketplace/vendor/specialties", async ({ logger }) => {
        const vendor = await getAuthenticatedVendor();
        if (!vendor) {
            return NextResponse.json({ error: "unauthorized" }, { status: 401 });
        }
        const body = await request.json().catch(() => ({}));
        const updated = await setVendorSpecialties(vendor.id, Array.isArray(body.specialties) ? body.specialties : []);
        logger.info("marketplace.vendor.specialties_saved", { vendorId: vendor.id, count: updated.specialties.length });
        return NextResponse.json({ ok: true, specialties: updated.specialties });
    });
}
