import "server-only";

// ── WHAT SKY IS IT? ──────────────────────────────────────────────────────────────────────────────────────────
// Shared by the sailing ambiance route (which paints the sea to match the player's own window) and by fishing
// (where the sky GATES which species will bite).
//
// Those two want different defaults, and that difference matters:
//
//   AMBIANCE is personal. If you granted location, the sea should show YOUR storm.
//   FISHING is not. Gating a species on the member's own weather quietly made half the roster unreachable —
//     most members never granted location, so `sky` came through null, so Moonfish / Storm Pike / Anglerfish /
//     Ghost Dolphin / Kraken Spawn / Fallen Star simply never bit for them. Nine of the twenty-four species,
//     invisible, with no way for the player to know why.
//
// So fishing resolves the sky at THE DEN — one physical shop, one real sky, the same for everybody. It's the
// fairer rule (nobody is gated behind a browser permission prompt), it's unspoofable (the client no longer
// reports anything), and it's better flavour: the Den's own weather decides what's biting tonight.
const DEN = { lat: 44.4383, lon: -93.5836 }; // The Wolf Den, Montgomery MN — same coords as the site's schema.

const cache = new Map(); // "lat,lon" -> { at, body }
const TTL_MS = 15 * 60 * 1000;

// WMO weather code → our sky type, factoring in local time vs sunrise/sunset for the clear-sky cases.
export function pickSky(cur, daily) {
    const code = Number(cur?.weather_code ?? 0);
    const isDay = Number(cur?.is_day ?? 1) === 1;
    // Nasty weather wins regardless of time.
    if (code >= 95) return { sky: "storm", mood: "storm" };                 // thunderstorm
    if ((code >= 61 && code <= 67) || (code >= 80 && code <= 86) || (code >= 71 && code <= 77)) return { sky: "storm", mood: "storm" }; // rain/showers/snow
    if (code === 45 || code === 48) return { sky: "fog", mood: "overcast" }; // fog
    if (code === 3 || (code >= 51 && code <= 57)) return { sky: "overcast", mood: "overcast" }; // overcast / drizzle

    // Clear-ish → choose by time of day. Open-Meteo returns LOCAL times with NO offset (e.g. "2026-07-22T20:40")
    // and this server runs in UTC, so we must compare against Open-Meteo's OWN local clock (current.time),
    // parsed the same naive way as sunrise/sunset — otherwise the tz offset skews the windows.
    const now = Date.parse(cur?.time || "");
    const sr = Date.parse(daily?.sunrise?.[0] || ""), ss = Date.parse(daily?.sunset?.[0] || "");
    const min = 60 * 1000;
    if (Number.isFinite(now) && Number.isFinite(sr) && Number.isFinite(ss)) {
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

/**
 * Live sky at a coordinate. Rounded to ~11km for privacy + cache hits, cached 15 min.
 * Returns null when the weather service can't be reached — callers decide what that means.
 */
export async function skyAt({ lat, lon } = {}) {
    const rlat = Math.round(Number(lat) * 10) / 10, rlon = Math.round(Number(lon) * 10) / 10;
    if (!Number.isFinite(rlat) || !Number.isFinite(rlon)) return null;
    const key = `${rlat},${rlon}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.body;

    const api = `https://api.open-meteo.com/v1/forecast?latitude=${rlat}&longitude=${rlon}`
        + `&current=weather_code,is_day,cloud_cover,precipitation&daily=sunrise,sunset&timezone=auto&forecast_days=1`;
    const resp = await fetch(api, { cache: "no-store" }).catch(() => null);
    if (!resp?.ok) return null;
    const data = await resp.json().catch(() => null);
    const chosen = pickSky(data?.current, data?.daily);
    const body = {
        skyType: chosen.sky,
        mood: chosen.mood,
        weatherCode: Number(data?.current?.weather_code ?? 0),
        isDay: Number(data?.current?.is_day ?? 1) === 1,
    };
    cache.set(key, { at: Date.now(), body });
    return body;
}

// The sky over the shop — the one fishing gates on. Never takes client input.
export const skyAtTheDen = () => skyAt(DEN);
export const DEN_COORDS = DEN;
