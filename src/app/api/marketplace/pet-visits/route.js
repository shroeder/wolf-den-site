import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getUnseenPetVisits } from "@/lib/marketplace/farm.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The "who petted your pets while you were away" welcome-back recap. Fetching it marks the entries seen, so it
// pops once. Mirrors /api/marketplace/raid-defense.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/pet-visits", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return NextResponse.json({ visits: [], totalXp: 0, totalVisits: 0, petterCount: 0 }, { headers: { "Cache-Control": "no-store" } });
            const report = await getUnseenPetVisits(buyer.id);
            return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.pet_visits.failure" });
        }
    });
}
