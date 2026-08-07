"use client";

import { useEffect } from "react";

// ── WHEN A DEPLOY LANDS UNDER SOMEBODY'S FEET ────────────────────────────────────────────────────────────────
// Next.js splits the app into chunks and the HTML a member is holding names them by build. Ship a new
// deployment while their tab is open and those filenames stop existing: the next navigation asks for
// /_next/static/chunks/<old>.js, gets a 404, and React throws ChunkLoadError. The member sees a crash screen
// for a page that is perfectly healthy — they are simply holding yesterday's map.
//
// This is not a bug to fix in the page. The only correct response is to go and get the new map: reload once,
// and the member lands on the page they asked for with the current build. That is invisible when it works.
//
// The guard rails matter more than the reload:
//   • ONCE per minute per tab (sessionStorage). If a deployment is genuinely broken, a reload loop would hide
//     the real error behind an infinite refresh and hammer the origin doing it.
//   • only for chunk failures. Anything else belongs on the crash screen where it can be read and reported.
//   • still reported, tagged recovered, so a spike in these is visible as "we deployed on top of people"
//     rather than silently swallowed.
const KEY = "wd_chunk_reload_at";
const COOLDOWN_MS = 60_000;

export function isChunkError(err) {
    const name = String(err?.name || "");
    const msg = String(err?.message || err || "");
    return name === "ChunkLoadError"
        || /Loading chunk \S+ failed/i.test(msg)
        || /Failed to load chunk/i.test(msg)
        || /Loading CSS chunk/i.test(msg)
        || /error loading dynamically imported module/i.test(msg);
}

// Exported so the crash boundary can take the same decision without duplicating the rules.
export function recoverFromChunkError(err, where = "unknown") {
    if (typeof window === "undefined" || !isChunkError(err)) return false;
    let last = 0;
    try { last = Number(window.sessionStorage.getItem(KEY)) || 0; } catch { /* private mode */ }
    if (Date.now() - last < COOLDOWN_MS) return false; // already tried — let the real error surface
    try { window.sessionStorage.setItem(KEY, String(Date.now())); } catch { /* private mode */ }

    // Tell us it happened. Fire-and-forget with keepalive so it survives the reload we are about to do.
    try {
        fetch("/api/client-error", {
            method: "POST", keepalive: true, headers: { "content-type": "application/json" },
            body: JSON.stringify({
                name: "ChunkLoadError", recovered: true, where,
                message: String(err?.message || err || "chunk load failed"),
                path: window.location.pathname + window.location.search,
            }),
        }).catch(() => {});
    } catch { /* never block the reload on telemetry */ }

    // A plain reload is enough: the document request returns the current build's HTML, which names chunks that
    // exist. `location.reload()` rather than a cache-busting query so we do not litter the member's URL.
    window.location.reload();
    return true;
}

export default function ChunkRecovery() {
    useEffect(() => {
        const onError = (e) => { recoverFromChunkError(e?.error || e?.message, "window.error"); };
        const onRejection = (e) => { recoverFromChunkError(e?.reason, "unhandledrejection"); };
        window.addEventListener("error", onError);
        window.addEventListener("unhandledrejection", onRejection);
        return () => {
            window.removeEventListener("error", onError);
            window.removeEventListener("unhandledrejection", onRejection);
        };
    }, []);
    return null;
}
