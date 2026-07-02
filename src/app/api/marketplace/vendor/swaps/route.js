import { NextResponse } from "next/server";

import { createSwap, listSwaps } from "@/lib/marketplace/swaps.js";
import { getAuthenticatedVendor } from "@/lib/marketplace/vendor-session.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/vendor/swaps", async ({ internalError }) => {
        try {
            const vendor = await getAuthenticatedVendor();
            if (!vendor) {
                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }
            const swaps = await listSwaps(vendor.id);
            return NextResponse.json({ swaps }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.swaps.list.failure" });
        }
    });
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/vendor/swaps", async ({ logger, internalError }) => {
        try {
            const vendor = await getAuthenticatedVendor();
            if (!vendor) {
                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }
            const body = await request.json().catch(() => ({}));
            try {
                const id = await createSwap({
                    fromVendorId: vendor.id,
                    toVendorId: body.toVendorId,
                    offerListingIds: Array.isArray(body.offerListingIds) ? body.offerListingIds : [],
                    requestListingIds: Array.isArray(body.requestListingIds) ? body.requestListingIds : [],
                    cash: body.cash ?? null,
                    note: body.note ?? null,
                });
                logger.info("marketplace.swap.api_created", { vendorId: vendor.id, swapId: id });
                return NextResponse.json({ ok: true, id });
            } catch (validationError) {
                return NextResponse.json({ error: validationError.message }, { status: 400 });
            }
        } catch (error) {
            return internalError(error, { event: "marketplace.swaps.create.failure" });
        }
    });
}
