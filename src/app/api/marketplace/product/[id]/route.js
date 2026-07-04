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
            const sp = new URL(request.url).searchParams;
            const sort = sp.get("sort") || "price";
            let lat = Number(sp.get("lat")) || null;
            let lng = Number(sp.get("lng")) || null;
            // Web falls back to Vercel edge geo; the app (src=app) does not — carrier-IP geo on cellular
            // is hundreds of miles off, so show no distance rather than a wrong one.
            if ((lat == null || lng == null) && sp.get("src") !== "app") {
                lat = Number(request.headers.get("x-vercel-ip-latitude")) || null;
                lng = Number(request.headers.get("x-vercel-ip-longitude")) || null;
            }
            const product = await getProductWithOffers(id, { lat, lng, sort });
            if (!product) {
                return NextResponse.json({ error: "not_found" }, { status: 404 });
            }
            return NextResponse.json({ product }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.product.detail.failure" });
        }
    });
}
