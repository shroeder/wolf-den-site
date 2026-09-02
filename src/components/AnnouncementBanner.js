"use client";

import { useSyncExternalStore } from "react";

import { closedSummary, hoursSummary } from "@/lib/marketplace/store-hours.js";

// Temporary new-hours announcement. The banner auto-hides once this moment
// passes. Montgomery, MN is Central Time (CDT, -05:00 in summer). Put up
// July 21, 2026 — expires at the end of Sunday, August 10, 2026.
const EXPIRES_AT = new Date("2026-08-11T00:00:00-05:00").getTime();

// No external source to subscribe to — we only need a server/client-aware read
// of the current time so the banner can disappear after it expires.
const subscribe = () => () => {};
const getSnapshot = () => Date.now() < EXPIRES_AT;
const getServerSnapshot = () => true;

export default function AnnouncementBanner() {
    const visible = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

    if (!visible) {
        return null;
    }

    return (
        <div className="opening-banner" role="region" aria-label="Store announcement">
            <p className="opening-banner-text">
                {/* ── THE LAST COPY OF THE HOURS, NOW DERIVED ─────────────────────────────────────────
                    This banner typed them out: "Thu & Fri 3–9 PM · Sat 10 AM–9 PM · Sun 10 AM–5 PM". Two of
                    those three were wrong — Saturday opens at 11 and Sunday runs to 7 — so a banner headed
                    "New hours!" was printing the old ones. It has been expired since August so nobody saw it,
                    which is exactly how a wrong copy survives: dead code tells you nothing until somebody
                    re-dates it and ships last season's hours site-wide.
                    store-hours.js was written to end this (there were four copies and three different answers
                    for Sunday); this was the one that got away. It reads the table now, so re-dating the
                    banner is safe by construction. */}
                <strong>New hours!</strong> {hoursSummary()}. {closedSummary()}.
            </p>
        </div>
    );
}
