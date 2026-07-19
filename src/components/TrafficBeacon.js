"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

// Fire a page_view on every route change — for EVERY visitor, logged in or not. Anonymous visitors get a
// stable per-browser id so admins can see full minute-to-minute traffic + which pages get engagement.
function anonId() {
    try {
        let id = window.localStorage.getItem("wd_anon");
        if (!id) {
            id = (window.crypto?.randomUUID?.() || `a-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`);
            window.localStorage.setItem("wd_anon", id);
        }
        return id;
    } catch {
        return null;
    }
}

export default function TrafficBeacon() {
    const pathname = usePathname();
    useEffect(() => {
        if (!pathname) return;
        try {
            fetch("/api/marketplace/track", {
                method: "POST",
                headers: { "content-type": "application/json" },
                keepalive: true,
                body: JSON.stringify({ event: "page_view", path: pathname, anonId: anonId() }),
            }).catch(() => {});
        } catch {
            /* best-effort */
        }
    }, [pathname]);
    return null;
}
