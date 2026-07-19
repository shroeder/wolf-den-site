"use client";

// Client-side telemetry helper. Fires a whitelisted activity event (best-effort, non-blocking) and always
// attaches the stable anon id + lightweight device/context so anonymous traffic is enriched server-side.

export function anonId() {
    try {
        let id = window.localStorage.getItem("wd_anon");
        if (!id) {
            id = window.crypto?.randomUUID?.() || `a-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
            window.localStorage.setItem("wd_anon", id);
        }
        return id;
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
            }),
        }).catch(() => {});
    } catch {
        /* best-effort */
    }
}
