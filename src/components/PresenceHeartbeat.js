"use client";

import { useEffect } from "react";

import { anonId } from "@/lib/marketplace/track-client";

// Keeps a signed-in member's "online now" status fresh: pings /api/marketplace/presence every ~40s while the
// tab is VISIBLE (and immediately on becoming visible), so the Town reflects who's actually here in real time.
// Best-effort, non-blocking; the endpoint no-ops for anonymous visitors so this is safe to mount site-wide.
const PING_MS = 40000;

export default function PresenceHeartbeat() {
    useEffect(() => {
        let timer = null;
        const ping = () => {
            if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
            try {
                fetch("/api/marketplace/presence", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    keepalive: true,
                    body: JSON.stringify({ anonId: anonId() }),
                }).catch(() => {});
            } catch {
                /* best-effort */
            }
        };
        ping(); // right away on load
        timer = setInterval(ping, PING_MS);
        const onVis = () => { if (document.visibilityState === "visible") ping(); };
        document.addEventListener("visibilitychange", onVis);
        return () => {
            if (timer) clearInterval(timer);
            document.removeEventListener("visibilitychange", onVis);
        };
    }, []);

    return null;
}
