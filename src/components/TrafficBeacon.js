"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { trackClient } from "@/lib/marketplace/track-client";

// Fire a page_view on every route change — for EVERY visitor, logged in or not. The client helper attaches a
// stable per-browser anon id + device/geo context so admins see full, enriched minute-to-minute traffic.
export default function TrafficBeacon() {
    const pathname = usePathname();
    useEffect(() => {
        if (!pathname) return;
        trackClient("page_view", null, pathname);
    }, [pathname]);
    return null;
}
