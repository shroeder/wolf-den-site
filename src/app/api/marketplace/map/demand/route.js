import { NextResponse } from "next/server";

import { getDemandNear } from "@/lib/marketplace/map.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// What people are searching/viewing/wanting near a point (drives the map's "tap heat" sheet). Public.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/map/demand", async ({ internalError }) => {
        try {
            const { searchParams } = new URL(request.url);
            const lat = Number(searchParams.get("lat"));
            const lng = Number(searchParams.get("lng"));
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
                return NextResponse.json({ error: "lat and lng are required." }, { status: 400 });
            }
            const radiusKm = Math.min(Math.max(Number(searchParams.get("radiusKm")) || 60, 1), 500);
            const demand = await getDemandNear({ lat, lng, radiusKm });
            return NextResponse.json(demand, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.map.demand.failure" });
        }
    });
}
