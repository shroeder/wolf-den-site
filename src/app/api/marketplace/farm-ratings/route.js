import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getUnseenFarmRatings, searchFarms } from "@/lib/marketplace/farm-rating.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The "N people rated your farm" welcome-back recap. Fetching it marks the ratings seen, so it pops once.
// Mirrors /api/marketplace/pet-visits.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/farm-ratings", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return NextResponse.json({ raters: [], newCount: 0, byTier: { 1: 0, 2: 0, 3: 0 }, total: 0 }, { headers: { "Cache-Control": "no-store" } });
            // ?q= searches every farm instead — the route to somebody else's farm, which the page had lost.
            // Kept on this route rather than a new one: it is the same board, asked a different question.
            const q = new URL(request.url).searchParams.get("q");
            if (q != null) return NextResponse.json({ farms: await searchFarms(buyer.id, q) }, { headers: { "Cache-Control": "no-store" } });
            const report = await getUnseenFarmRatings(buyer.id);
            return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.farm_ratings.failure" });
        }
    });
}
