import { NextResponse } from "next/server";

import { createListing } from "@/lib/marketplace/listings.js";
import { getAuthenticatedVendor } from "@/lib/marketplace/vendor-session.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

// Create a listing for the signed-in vendor.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/vendor/listings", async ({ logger, internalError }) => {
        try {
            const vendor = await getAuthenticatedVendor();

            if (!vendor) {
                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }

            const body = await request.json().catch(() => null);

            if (!body || !body.title || body.price === undefined || body.price === null) {
                return NextResponse.json({ error: "Title and price are required." }, { status: 400 });
            }

            const price = Number(body.price);
            const quantity = body.quantity === undefined ? 1 : Number(body.quantity);

            if (!Number.isFinite(price) || price < 0) {
                return NextResponse.json({ error: "Enter a valid price." }, { status: 400 });
            }

            try {
                const listing = await createListing({
                    vendorId: vendor.id,
                    kind: body.kind === "single" ? "single" : "sealed",
                    catalogProductId: body.catalogProductId || null,
                    game: body.game || null,
                    title: body.title,
                    setName: body.setName || null,
                    cardNumber: body.cardNumber || null,
                    imageUrl: body.imageUrl || null,
                    condition: body.condition || null,
                    graded: Boolean(body.graded),
                    gradingCompany: body.gradingCompany || null,
                    grade: body.grade || null,
                    language: body.language || "English",
                    price,
                    quantity: Number.isFinite(quantity) && quantity >= 0 ? Math.trunc(quantity) : 1,
                    pricingMode: body.pricingMode || "manual",
                    pricingValue: body.pricingValue != null ? Number(body.pricingValue) : null,
                });

                logger.info("marketplace.vendor.listing_created", { vendorId: vendor.id, listingId: listing.id });

                return NextResponse.json({ ok: true, listing });
            } catch (validationError) {
                return NextResponse.json({ error: validationError.message }, { status: 400 });
            }
        } catch (error) {
            return internalError(error, { event: "marketplace.vendor.listing_create.failure" });
        }
    });
}
