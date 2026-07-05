"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

// Reuse the marketplace visitor id (cookie) when readable, else a stable per-browser id in localStorage.
function getVid() {
    try {
        const m = document.cookie.match(/(?:^|;\s*)mkt_vid=([^;]+)/);
        if (m) return decodeURIComponent(m[1]);
    } catch {
        // ignore
    }
    try {
        let v = localStorage.getItem("mkt_vid");
        if (!v) {
            v = (typeof crypto !== "undefined" && crypto.randomUUID)
                ? crypto.randomUUID()
                : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
            localStorage.setItem("mkt_vid", v);
        }
        return v;
    } catch {
        return null;
    }
}

// Fires an anonymous 'pageview' beacon on every client navigation so feature/page usage shows up in
// the admin app's telemetry. Best-effort — never blocks or errors the page.
export default function Telemetry() {
    const pathname = usePathname();
    useEffect(() => {
        if (!pathname || pathname.startsWith("/api")) return;
        try {
            fetch("/api/track", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ path: pathname, vid: getVid() }),
                keepalive: true,
            }).catch(() => {});
        } catch {
            // ignore
        }
    }, [pathname]);
    return null;
}
