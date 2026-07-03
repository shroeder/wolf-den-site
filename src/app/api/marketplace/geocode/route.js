import { NextResponse } from "next/server";

import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Location autocomplete for the events picker. Proxies OpenStreetMap's Nominatim — free, no API key.
// Server-side so we can set the required User-Agent and cache. Returns place suggestions + coordinates.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/geocode", async ({ internalError }) => {
        try {
            const q = (new URL(request.url).searchParams.get("q") || "").trim();
            if (q.length < 3) {
                return NextResponse.json({ places: [] }, { headers: { "Cache-Control": "no-store" } });
            }
            const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&q=${encodeURIComponent(q)}`;
            const res = await fetch(url, {
                headers: {
                    "User-Agent": "WolfDenMarketplace/1.0 (https://www.wolfdengamingmn.com)",
                    Accept: "application/json",
                },
            });
            if (!res.ok) {
                return NextResponse.json({ places: [] }, { headers: { "Cache-Control": "no-store" } });
            }
            const data = await res.json();
            const places = (Array.isArray(data) ? data : []).slice(0, 6).map((d) => {
                const a = d.address || {};
                const short = [a.name || a.amenity || a.shop || a.building, a.city || a.town || a.village || a.county, a.state]
                    .filter(Boolean)
                    .join(", ");
                return {
                    label: short || d.display_name,
                    fullLabel: d.display_name,
                    latitude: Number(d.lat),
                    longitude: Number(d.lon),
                };
            });
            return NextResponse.json({ places }, { headers: { "Cache-Control": "public, max-age=300" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.geocode.failure" });
        }
    });
}
