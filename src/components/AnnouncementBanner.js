"use client";

import { useSyncExternalStore } from "react";

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
                <strong>New hours!</strong> Open <strong>Thursday&ndash;Sunday</strong> &mdash;
                Thu &amp; Fri <strong>3&ndash;9 PM</strong> · Sat <strong>10 AM&ndash;9 PM</strong> · Sun <strong>10 AM&ndash;5 PM</strong>.
            </p>
        </div>
    );
}
