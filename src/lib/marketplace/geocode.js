import "server-only";

import { createServerLogger } from "@/lib/server-logger";

// Best-effort geocoding via OpenStreetMap Nominatim (free, no API key). Used to place vendors on the
// browse map. Returns null on any failure — geocoding must never block onboarding.

const geocodeLogger = createServerLogger({ source: "api", subsystem: "marketplace-geocode" });

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

function buildQuery({ line1, city, region, postalCode, country }) {
    return [line1, city, region, postalCode, country || "US"].filter(Boolean).join(", ");
}

export async function geocodeAddress(address = {}) {
    const query = buildQuery(address);

    if (!query.trim()) {
        return null;
    }

    try {
        const url = new URL(NOMINATIM_URL);
        url.searchParams.set("format", "json");
        url.searchParams.set("limit", "1");
        url.searchParams.set("q", query);

        const response = await fetch(url, {
            headers: {
                // Nominatim usage policy requires an identifying User-Agent.
                "User-Agent": "WolfDenMarketplace/1.0 (https://wolfdengamingmn.com)",
                Accept: "application/json",
            },
        });

        if (!response.ok) {
            return null;
        }

        const results = await response.json().catch(() => null);
        const top = Array.isArray(results) ? results[0] : null;

        if (!top || top.lat === undefined || top.lon === undefined) {
            return null;
        }

        return { latitude: Number(top.lat), longitude: Number(top.lon) };
    } catch (error) {
        geocodeLogger.warn("marketplace.geocode.failed", { reason: error.message, query });
        return null;
    }
}
