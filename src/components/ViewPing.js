"use client";

import { useEffect } from "react";

import { trackClient } from "@/lib/marketplace/track-client";

// Drop into any page/section to log a semantic "view" event once on mount (e.g. view_leaderboard, view_boss,
// view_inventory, browse_shop, view_vendor, view_profile). page_view already records the path; this adds the
// higher-level feature signal + optional meta (which vendor, whose profile) for the engagement reports.
export default function ViewPing({ event, meta = null }) {
    const key = meta ? JSON.stringify(meta) : "";
    useEffect(() => {
        if (event) trackClient(event, meta);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [event, key]);
    return null;
}
