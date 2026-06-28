"use client";

import { useSyncExternalStore } from "react";

// Temporary new-hours announcement. The banner auto-hides once this moment
// passes. Montgomery, MN is Central Time (CDT, -05:00 in summer); this expires
// at the end of Sunday, June 29, 2026 — two days after it went up on June 27.
const EXPIRES_AT = new Date("2026-06-30T00:00:00-05:00").getTime();

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
            <p className="opening-banner-text shell">
                <strong>New hours:</strong> We&apos;re now open <strong>Sundays 12:00 PM &ndash; 6:00 PM</strong>.
            </p>
        </div>
    );
}
