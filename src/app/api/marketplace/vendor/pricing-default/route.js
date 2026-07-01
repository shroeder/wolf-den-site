import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getAuthenticatedVendor } from "@/lib/marketplace/vendor-session.js";
import { PRICING_MODES } from "@/lib/marketplace/reprice.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

// Save the vendor's default pricing rule for NEW listings (applied client-side when the add form loads).
export async function PATCH(request) {
    return withRequestLogging(request, "PATCH /api/marketplace/vendor/pricing-default", async ({ logger, internalError }) => {
        try {
            const vendor = await getAuthenticatedVendor();
            if (!vendor) {
                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }

            const body = await request.json().catch(() => ({}));
            const mode = PRICING_MODES.has(body.mode) ? body.mode : "manual";
            const value = mode === "manual" || body.value == null ? null : Number(body.value);

            if (value != null && (!Number.isFinite(value) || value < 0)) {
                return NextResponse.json({ error: "Invalid pricing value." }, { status: 400 });
            }

            await db.query(
                `UPDATE mkt_vendor SET default_pricing_mode = $2, default_pricing_value = $3 WHERE id = $1`,
                [vendor.id, mode, value]
            );

            logger.info("marketplace.vendor.pricing_default_saved", { vendorId: vendor.id, mode });
            return NextResponse.json({ ok: true, mode, value });
        } catch (error) {
            return internalError(error, { event: "marketplace.vendor.pricing_default.failure" });
        }
    });
}
