import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { skyAt, DEN_COORDS } from "@/lib/marketplace/sky.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Turn the player's real coordinates into the sky that matches their actual weather + time of day, so the sea
// reflects the world outside their window. Free, no API key: Open-Meteo. The resolving itself lives in sky.js
// because fishing needs the same logic server-side (see the note there on why fishing gates on the DEN's sky
// rather than the member's).
//
// Coordinates are optional now: without them the sea shows the sky over the shop instead of refusing to
// render. Declining the location prompt used to leave the ambiance dead.
const SKY_IMG = (t) => `/images/sailing/sky-${t}.png`;

export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/sailing/ambiance", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

            const url = new URL(request.url);
            const lat = Number(url.searchParams.get("lat"));
            const lon = Number(url.searchParams.get("lon"));
            const usable = Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

            const resolved = await skyAt(usable ? { lat, lon } : DEN_COORDS);
            if (!resolved) return NextResponse.json({ error: "weather_unavailable" }, { status: 502 });

            return NextResponse.json(
                { ...resolved, sky: SKY_IMG(resolved.skyType), atTheDen: !usable },
                { headers: { "Cache-Control": "no-store" } },
            );
        } catch (error) {
            return internalError(error, { event: "marketplace.sailing.ambiance.failure" });
        }
    });
}
