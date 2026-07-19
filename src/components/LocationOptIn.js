"use client";

import { useEffect, useState } from "react";

import { shareLocation } from "@/lib/marketplace/track-client";

// A gentle, dismissible opt-in that asks a signed-in member to share precise location — framed around the
// value they get (local trades, events, and vendors near them). We only prompt once (remembered in
// localStorage), never a cold prompt on anonymous landing. Precise coords are far better than IP geo.
export default function LocationOptIn() {
    const [state, setState] = useState("init"); // init | show | asking | done

    useEffect(() => {
        try {
            if (window.localStorage.getItem("wd_geo_optin")) { setState("done"); return; }
            setState("show");
        } catch {
            setState("done");
        }
    }, []);

    if (state === "init" || state === "done") return null;

    async function allow() {
        setState("asking");
        const result = await shareLocation();
        try { window.localStorage.setItem("wd_geo_optin", result); } catch { /* ignore */ }
        setState("done");
    }
    function dismiss() {
        try { window.localStorage.setItem("wd_geo_optin", "dismissed"); } catch { /* ignore */ }
        setState("done");
    }

    return (
        <section className="card" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
                <strong>📍 See what&apos;s near you?</strong>
                <p className="muted" style={{ margin: "4px 0 0" }}>
                    Share your location to surface local trades, events, and vendors closest to you.
                </p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="button primary" onClick={allow} disabled={state === "asking"}>
                    {state === "asking" ? "…" : "Allow"}
                </button>
                <button type="button" className="button" onClick={dismiss} disabled={state === "asking"}>Not now</button>
            </div>
        </section>
    );
}
