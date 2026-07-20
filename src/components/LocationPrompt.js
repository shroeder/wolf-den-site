"use client";

import { useEffect } from "react";

// Site-wide, best-effort location request for EVERY visitor (not just the vendor map) — powers the
// "near you" distance features and lets us surface local vendors/events. Asks at most once per tab
// session and respects a prior denial (never nags). Stores the last fix in localStorage `wolfden-geo`
// and broadcasts a `wolfden-geo` event so any page (e.g. the marketplace map) can use it without
// re-prompting. Renders nothing.
export default function LocationPrompt() {
    useEffect(() => {
        if (typeof navigator === "undefined" || !navigator.geolocation) return undefined;
        let cancelled = false;
        (async () => {
            try {
                if (sessionStorage.getItem("wolfden-geo-asked")) return;
                // Respect an explicit prior denial — don't re-prompt those who already said no.
                if (navigator.permissions?.query) {
                    const st = await navigator.permissions.query({ name: "geolocation" }).catch(() => null);
                    if (st && st.state === "denied") { sessionStorage.setItem("wolfden-geo-asked", "1"); return; }
                }
                sessionStorage.setItem("wolfden-geo-asked", "1");
            } catch { /* storage/permissions blocked — still try the prompt below */ }
            if (cancelled) return;
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const geo = { lat: pos.coords.latitude, lng: pos.coords.longitude, at: Date.now() };
                    try { localStorage.setItem("wolfden-geo", JSON.stringify(geo)); } catch { /* ignore */ }
                    try { window.dispatchEvent(new CustomEvent("wolfden-geo", { detail: geo })); } catch { /* ignore */ }
                },
                () => { /* denied or unavailable — stay silent */ },
                { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
            );
        })();
        return () => { cancelled = true; };
    }, []);
    return null;
}
