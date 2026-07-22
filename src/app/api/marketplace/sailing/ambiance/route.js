import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Turn the player's real coordinates into the sky that matches their actual weather + time of day, so the
// sea reflects the world outside their window. Free, no API key: Open-Meteo. Coordinates are rounded to ~11km
// before use (privacy) and results cached briefly so we don't hammer the API.
const SKY = (t) => `/images/sailing/sky-${t}.png`;
const cache = new Map(); // "lat,lon" -> { at, body }
const TTL_MS = 15 * 60 * 1000;

// WMO weather code → our sky type, factoring in local time vs sunrise/sunset for the clear-sky cases.
function pickSky(cur, daily) {
    const code = Number(cur?.weather_code ?? 0);
    const isDay = Number(cur?.is_day ?? 1) === 1;
    // Nasty weather wins regardless of time.
    if (code >= 95) return { sky: "storm", mood: "storm" };                 // thunderstorm
    if ((code >= 61 && code <= 67) || (code >= 80 && code <= 86) || (code >= 71 && code <= 77)) return { sky: "storm", mood: "storm" }; // rain/showers/snow
    if (code === 45 || code === 48) return { sky: "fog", mood: "overcast" }; // fog
    if (code === 3 || (code >= 51 && code <= 57)) return { sky: "overcast", mood: "overcast" }; // overcast / drizzle

    // Clear-ish → choose by time of day using today's sunrise/sunset (local ISO strings from Open-Meteo).
    const now = Date.now();
    const sr = Date.parse(daily?.sunrise?.[0] || ""), ss = Date.parse(daily?.sunset?.[0] || "");
    const min = 60 * 1000;
    if (Number.isFinite(sr) && Number.isFinite(ss)) {
        if (now >= sr - 20 * min && now <= sr + 45 * min) return { sky: "sunrise", mood: "calm" };
        if (now >= ss - 45 * min && now <= ss + 10 * min) return { sky: "sunset", mood: "calm" };
        if (now >= ss + 10 * min && now <= ss + 55 * min) return { sky: "dusk", mood: "calm" };
        if (now >= ss - 105 * min && now < ss - 45 * min) return { sky: "goldenhour", mood: "calm" };
        if (now < sr - 20 * min || now > ss + 55 * min) return { sky: "night", mood: "night" };
    } else if (!isDay) {
        return { sky: "night", mood: "night" };
    }
    return { sky: "clearday", mood: "calm" };
}

export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/sailing/ambiance", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

            const url = new URL(request.url);
            const lat = Number(url.searchParams.get("lat"));
            const lon = Number(url.searchParams.get("lon"));
            if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
                return NextResponse.json({ error: "bad_coords" }, { status: 400 });
            }
            // Round to ~1 decimal (~11km) for privacy + cache hits.
            const rlat = Math.round(lat * 10) / 10, rlon = Math.round(lon * 10) / 10;
            const key = `${rlat},${rlon}`;
            const hit = cache.get(key);
            if (hit && Date.now() - hit.at < TTL_MS) {
                return NextResponse.json(hit.body, { headers: { "Cache-Control": "no-store" } });
            }

            const api = `https://api.open-meteo.com/v1/forecast?latitude=${rlat}&longitude=${rlon}`
                + `&current=weather_code,is_day,cloud_cover,precipitation&daily=sunrise,sunset&timezone=auto&forecast_days=1`;
            const resp = await fetch(api, { cache: "no-store" });
            if (!resp.ok) return NextResponse.json({ error: "weather_unavailable" }, { status: 502 });
            const data = await resp.json().catch(() => null);
            const chosen = pickSky(data?.current, data?.daily);
            const body = {
                sky: SKY(chosen.sky),
                skyType: chosen.sky,
                mood: chosen.mood,
                weatherCode: Number(data?.current?.weather_code ?? 0),
                isDay: Number(data?.current?.is_day ?? 1) === 1,
            };
            cache.set(key, { at: Date.now(), body });
            return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.sailing.ambiance.failure" });
        }
    });
}
