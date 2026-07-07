import { NextResponse } from "next/server";

import { resolveBuyerSession } from "@/lib/marketplace/buyer-session.js";
import { listBuyOrders } from "@/lib/marketplace/wants.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Open buy orders (buyer demand). Public for vendors/map. Query params:
//   productId=<id>            one product's buy orders
//   lat=&lng=&radiusKm=       buy orders near a point (map demand tap)
//   mine=1 (with bearer)      the signed-in buyer's own buy orders
//   limit=<n>
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/buy-orders", async ({ internalError }) => {
        try {
            const { searchParams } = new URL(request.url);

            let buyerId = null;
            if (searchParams.get("mine") === "1") {
                const auth = request.headers.get("authorization") || "";
                const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null;
                const session = token ? await resolveBuyerSession(token).catch(() => null) : null;
                if (!session?.buyer?.id) {
                    return NextResponse.json({ error: "Sign in to see your buy orders." }, { status: 401 });
                }
                buyerId = session.buyer.id;
            }

            const lat = Number(searchParams.get("lat"));
            const lng = Number(searchParams.get("lng"));
            const near = Number.isFinite(lat) && Number.isFinite(lng)
                ? { lat, lng, radiusKm: Number(searchParams.get("radiusKm")) || 60 }
                : null;

            const orders = await listBuyOrders({
                productId: searchParams.get("productId") || null,
                buyerId,
                near,
                limit: Number(searchParams.get("limit")) || 100,
            });

            return NextResponse.json({ orders }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.buy_orders.failure" });
        }
    });
}
