import { NextResponse } from "next/server";

import { deleteListing, updateListing } from "@/lib/marketplace/listings.js";
import { getAuthenticatedVendor } from "@/lib/marketplace/vendor-session.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

// Edit price / quantity / condition on the vendor's own listing.
export async function PATCH(request, { params }) {
    return withRequestLogging(request, "PATCH /api/marketplace/vendor/listings/[id]", async ({ logger, internalError }) => {
        try {
            const vendor = await getAuthenticatedVendor();

            if (!vendor) {
                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }

            const { id } = await params;
            const body = await request.json().catch(() => ({}));
            const patch = {};

            if (body.price !== undefined) {
                const price = Number(body.price);
                if (!Number.isFinite(price) || price < 0) {
                    return NextResponse.json({ error: "Enter a valid price." }, { status: 400 });
                }
                patch.price = price;
            }

            if (body.quantity !== undefined) {
                const quantity = Number(body.quantity);
                if (!Number.isFinite(quantity) || quantity < 0) {
                    return NextResponse.json({ error: "Enter a valid quantity." }, { status: 400 });
                }
                patch.quantity = Math.trunc(quantity);
            }

            if (body.condition !== undefined) {
                patch.condition = body.condition;
            }

            if (body.language !== undefined) {
                patch.language = body.language;
            }

            if (body.pricingMode !== undefined) {
                patch.pricingMode = body.pricingMode;
            }

            if (body.pricingValue !== undefined) {
                patch.pricingValue = body.pricingValue === null ? null : Number(body.pricingValue);
            }

            if (body.dealerAvailable !== undefined) {
                patch.dealerAvailable = Boolean(body.dealerAvailable);
            }

            if (body.vendorOnly !== undefined) {
                patch.vendorOnly = Boolean(body.vendorOnly);
            }

            if (body.wholesalePrice !== undefined) {
                const wp = body.wholesalePrice === null || body.wholesalePrice === "" ? null : Number(body.wholesalePrice);
                patch.wholesalePrice = wp != null && Number.isFinite(wp) && wp > 0 ? wp : null;
            }

            const listing = await updateListing(id, vendor.id, patch);

            if (!listing) {
                return NextResponse.json({ error: "Listing not found." }, { status: 404 });
            }

            logger.info("marketplace.vendor.listing_updated", { vendorId: vendor.id, listingId: id });

            return NextResponse.json({ ok: true, listing });
        } catch (error) {
            return internalError(error, { event: "marketplace.vendor.listing_update.failure" });
        }
    });
}

export async function DELETE(request, { params }) {
    return withRequestLogging(request, "DELETE /api/marketplace/vendor/listings/[id]", async ({ logger, internalError }) => {
        try {
            const vendor = await getAuthenticatedVendor();

            if (!vendor) {
                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }

            const { id } = await params;
            const listing = await deleteListing(id, vendor.id);

            if (!listing) {
                return NextResponse.json({ error: "Listing not found." }, { status: 404 });
            }

            logger.info("marketplace.vendor.listing_deleted", { vendorId: vendor.id, listingId: id });

            return NextResponse.json({ ok: true });
        } catch (error) {
            return internalError(error, { event: "marketplace.vendor.listing_delete.failure" });
        }
    });
}
