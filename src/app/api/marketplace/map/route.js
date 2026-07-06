import { NextResponse } from "next/server";

import { getMarketplaceMap } from "@/lib/marketplace/map.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Marketplace map data: vendor supply pins + demand heat points. Public.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/map", async ({ internalError }) => {
        try {
            const days = Math.min(Math.max(Number(new URL(request.url).searchParams.get("days")) || 90, 1), 365);
            const map = await getMarketplaceMap({ days });
            return NextResponse.json(map, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.map.failure" });
        }
    });
}
