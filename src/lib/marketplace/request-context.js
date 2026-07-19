import "server-only";

// Turn a request's headers into a device + network + geo context we can store alongside a telemetry event.
// Vercel's edge injects geo headers for free; the IP comes from the forwarding chain. No external lookups.

// Lightweight User-Agent classification — good enough for device/browser/OS segmenting without a dependency.
export function parseUserAgent(ua = "") {
    const s = String(ua || "");
    let device = "desktop";
    if (/bot|crawler|spider|crawling|facebookexternalhit|slurp|bingpreview|headless|lighthouse/i.test(s)) device = "bot";
    else if (/ipad|tablet|playbook|silk|kindle|(android(?!.*mobile))/i.test(s)) device = "tablet";
    else if (/mobi|iphone|ipod|android.*mobile|windows phone|blackberry|bb10|opera mini/i.test(s)) device = "mobile";

    let os = "Unknown";
    if (/windows nt/i.test(s)) os = "Windows";
    else if (/iphone|ipad|ipod/i.test(s)) os = "iOS";
    else if (/mac os x/i.test(s)) os = "macOS";
    else if (/android/i.test(s)) os = "Android";
    else if (/cros/i.test(s)) os = "ChromeOS";
    else if (/linux/i.test(s)) os = "Linux";

    let browser = "Unknown";
    if (/edg\//i.test(s)) browser = "Edge";
    else if (/opr\/|opera/i.test(s)) browser = "Opera";
    else if (/samsungbrowser/i.test(s)) browser = "Samsung Internet";
    else if (/(chrome|crios)\//i.test(s)) browser = "Chrome";
    else if (/firefox|fxios/i.test(s)) browser = "Firefox";
    else if (/safari/i.test(s)) browser = "Safari";

    return { device, os, browser };
}

// Build context from a Headers-like object (e.g. request.headers). Everything is nullable/best-effort.
export function contextFromHeaders(h) {
    if (!h || typeof h.get !== "function") return {};
    const get = (k) => { const v = h.get(k); return v || null; };
    const dec = (v) => { if (!v) return null; try { return decodeURIComponent(v); } catch { return v; } };
    const fwd = get("x-forwarded-for");
    const ip = (fwd ? fwd.split(",")[0].trim() : null) || get("x-real-ip") || null;
    const ua = get("user-agent") || "";
    const { device, os, browser } = parseUserAgent(ua);
    return {
        ip: ip ? ip.slice(0, 64) : null,
        userAgent: ua ? ua.slice(0, 400) : null,
        device,
        os,
        browser,
        country: get("x-vercel-ip-country"),
        region: dec(get("x-vercel-ip-country-region")),
        city: dec(get("x-vercel-ip-city")),
        latitude: get("x-vercel-ip-latitude"),
        longitude: get("x-vercel-ip-longitude"),
        timezone: get("x-vercel-ip-timezone"),
    };
}
