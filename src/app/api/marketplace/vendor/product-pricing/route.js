import { NextResponse } from "next/server";

import { getProductPricingContext } from "@/lib/marketplace/search.js";
import { getAuthenticatedVendor } from "@/lib/marketplace/vendor-session.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

// Pricing helpers for the add-listing form: market price + lowest competing vendor price for a product.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/vendor/product-pricing", async ({ internalError }) => {
        try {
            const vendor = await getAuthenticatedVendor();
            if (!vendor) {
                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }

            const { searchParams } = new URL(request.url);
            const catalogProductId = searchParams.get("catalogProductId");
            if (!catalogProductId) {
                return NextResponse.json({ error: "catalogProductId is required." }, { status: 400 });
            }

            const pricing = await getProductPricingContext(catalogProductId, vendor.id);
            if (!pricing) {
                return NextResponse.json({ error: "Product not found." }, { status: 404 });
            }

            return NextResponse.json(pricing, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.vendor.product_pricing.failure" });
        }
    });
}
