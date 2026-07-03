import { NextResponse } from "next/server";

import { getProductWithOffers } from "@/lib/marketplace/search.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

// Product detail for the phone app: the catalog item + every vendor offer (cheapest first) + the
// local price index. Public (same data as the web product page).
export async function GET(request, { params }) {
    return withRequestLogging(request, "GET /api/marketplace/product/[id]", async ({ internalError }) => {
        try {
            const { id } = await params;
            const product = await getProductWithOffers(id);
            if (!product) {
                return NextResponse.json({ error: "not_found" }, { status: 404 });
            }
            return NextResponse.json({ product }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.product.detail.failure" });
        }
    });
}
