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

// ── HOLDING AN OLD BUILD THAT STILL LOADS ────────────────────────────────────────────────────────────────────
// The chunk recovery above only fires when a chunk 404s. There is a second, nastier shape of the same problem:
// the member's tab is hours old, every chunk it names still EXISTS on the CDN, and the code inside them is the
// version with the bug you already fixed. They navigate client-side, hit the old render path, and crash — over
// and over, against a deployment that is no longer current.
//
// That is exactly what happened with the Forge: the fix went out at 13:19 and members were still crashing at
// 15:13 against `dpl_3bPJ…`, three deployments behind, because nothing ever made their tab go and get the new
// one. There is no service worker involved; a long-lived tab is enough.
//
// So on ANY crash we ask the server which deployment is current. If it does not match the one this bundle was
// built as, the member is holding a stale build and the correct response is the same as for a missing chunk:
// reload once and land on the current code. Same one-per-minute guard, for the same reason — if the CURRENT
// build is broken too, a reload loop would hide it.
//
// (Vercel's Skew Protection solves this properly at the platform level and is worth turning on; this is the
// belt to that pair of braces, and it works on every host.)
export async function recoverFromStaleBuild(err, where = "unknown") {
    if (typeof window === "undefined") return false;
    const mine = process.env.NEXT_PUBLIC_BUILD_ID || "";
    if (!mine) return false;                       // no id baked in — nothing to compare, do not guess
    let last = 0;
    try { last = Number(window.sessionStorage.getItem(KEY)) || 0; } catch { /* private mode */ }
    if (Date.now() - last < COOLDOWN_MS) return false;

    let current = "";
    try {
        const r = await fetch("/api/build-id", { cache: "no-store" });
        current = (await r.json())?.id || "";
    } catch { return false; }                      // offline or blocked — a crash screen beats a blind reload
    if (!current || current === mine) return false;

    try { window.sessionStorage.setItem(KEY, String(Date.now())); } catch { /* private mode */ }
    try {
        fetch("/api/client-error", {
            method: "POST", keepalive: true, headers: { "content-type": "application/json" },
            body: JSON.stringify({
                name: "StaleBuild", recovered: true, where,
                message: `held ${mine}, current ${current}: ${String(err?.message || err || "crash")}`.slice(0, 400),
                path: window.location.pathname + window.location.search,
            }),
        }).catch(() => {});
    } catch { /* reporting is a bonus */ }
    window.location.reload();
    return true;
}
