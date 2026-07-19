"use client";

// Client-side telemetry helper. Fires a whitelisted activity event (best-effort, non-blocking) and always
// attaches the stable anon id + lightweight device/context so anonymous traffic is enriched server-side.

const ATTR_COOKIE = "wd_attr"; // first-touch acquisition attribution (JSON), first-touch wins
const VID_COOKIE = "wd_vid"; // durable, server-readable mirror of the anon id
const COOKIE_MAX_AGE = 60 * 60 * 24 * 400; // ~400 days (Chrome caps cookie lifetime here)

function readCookie(name) {
    try {
        const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
        return m ? decodeURIComponent(m[1]) : null;
    } catch {
        return null;
    }
}
function writeCookie(name, value) {
    try {
        document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${COOKIE_MAX_AGE}; path=/; SameSite=Lax`;
    } catch {
        /* best-effort */
    }
}

export function anonId() {
    try {
        let id = window.localStorage.getItem("wd_anon");
        if (!id) {
            id = window.crypto?.randomUUID?.() || `a-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
            window.localStorage.setItem("wd_anon", id);
        }
        // Mirror into a first-party cookie so the server can read the visitor id on the very first request.
        if (readCookie(VID_COOKIE) !== id) writeCookie(VID_COOKIE, id);
        return id;
    } catch {
        return null;
    }
}

function referrerHost() {
    try {
        return document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, "") : null;
    } catch {
        return null;
    }
}

// Coarse acquisition bucket from the UTM medium / source / referrer / click id.
function classifySource({ utm_source, utm_medium, click_id, host }) {
    const s = (utm_source || host || "").toLowerCase();
    const m = (utm_medium || "").toLowerCase();
    if (click_id || /cpc|ppc|paid|display/.test(m)) return "paid";
    if (/email|newsletter/.test(m)) return "email";
    if (/google|bing|duckduckgo|yahoo|ecosia/.test(s) && !/business/.test(s)) return "search";
    if (/facebook|instagram|fb\.|ig\.|twitter|x\.com|t\.co|tiktok|discord|reddit|youtube|snapchat|linkedin/.test(s)) return "social";
    if (!utm_source && !host) return "direct";
    return "referral";
}

// First-touch acquisition attribution — captured once (from the landing URL + referrer) and persisted in a
// cookie so it survives navigation and return visits. Never overwritten, so it reflects how they FIRST arrived.
export function firstTouchAttribution() {
    try {
        const existing = readCookie(ATTR_COOKIE);
        if (existing) {
            try {
                return JSON.parse(existing);
            } catch {
                /* fall through and re-capture */
            }
        }
        const q = new URLSearchParams(window.location.search);
        const pick = (k) => { const v = q.get(k); return v ? v.slice(0, 120) : null; };
        const host = referrerHost();
        const click_id = pick("gclid") || pick("fbclid") || pick("msclkid") || pick("ttclid");
        const attr = {
            utm_source: pick("utm_source"),
            utm_medium: pick("utm_medium"),
            utm_campaign: pick("utm_campaign"),
            utm_term: pick("utm_term"),
            utm_content: pick("utm_content"),
            click_id,
            referrer: document.referrer ? document.referrer.slice(0, 300) : null,
            landing: window.location.pathname,
        };
        attr.source_kind = classifySource({ ...attr, host });
        writeCookie(ATTR_COOKIE, JSON.stringify(attr));
        return attr;
    } catch {
        return null;
    }
}

// Screen / viewport / language / timezone / referrer / connection — signals the server can't read from headers.
export function clientContext() {
    try {
        const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        return {
            screen: window.screen ? `${window.screen.width}x${window.screen.height}` : null,
            viewport: `${window.innerWidth}x${window.innerHeight}`,
            lang: navigator.language || null,
            tz: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
            referrer: document.referrer || null,
            connection: conn?.effectiveType || null,
        };
    } catch {
        return {};
    }
}

export function trackClient(event, meta = null, path = null) {
    try {
        fetch("/api/marketplace/track", {
            method: "POST",
            headers: { "content-type": "application/json" },
            keepalive: true,
            body: JSON.stringify({
                event,
                meta: meta && typeof meta === "object" ? meta : null,
                path: path ?? (typeof window !== "undefined" ? window.location.pathname : null),
                anonId: anonId(),
                client: clientContext(),
                attr: firstTouchAttribution(),
            }),
        }).catch(() => {});
    } catch {
        /* best-effort */
    }
}

// Ask the browser for precise location (native permission prompt) and, if granted, send it up. Resolves to
// "granted" | "denied" | "unavailable". Precise lat/long is far more accurate than IP geo.
export function shareLocation() {
    return new Promise((resolve) => {
        if (typeof navigator === "undefined" || !navigator.geolocation) {
            resolve("unavailable");
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                try {
                    fetch("/api/marketplace/track", {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        keepalive: true,
                        body: JSON.stringify({
                            event: "share_location",
                            anonId: anonId(),
                            client: clientContext(),
                            geo: {
                                lat: pos.coords.latitude,
                                lng: pos.coords.longitude,
                                accuracy: pos.coords.accuracy,
                            },
                        }),
                    }).catch(() => {});
                } catch {
                    /* best-effort */
                }
                resolve("granted");
            },
            () => resolve("denied"),
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 600000 }
        );
    });
}
