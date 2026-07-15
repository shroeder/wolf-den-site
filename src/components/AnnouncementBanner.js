"use client";

import { useSyncExternalStore } from "react";

// Temporary new-hours announcement. The banner auto-hides once this moment
// passes. Montgomery, MN is Central Time (CDT, -05:00 in summer). Put up
// July 10, 2026 for one week — expires at the end of Friday, July 17, 2026.
const EXPIRES_AT = new Date("2026-07-18T00:00:00-05:00").getTime();

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
                <strong>New hours:</strong> We&apos;re now open <strong>7 days a week</strong> &mdash; daily
                <strong> 12&ndash;6 PM</strong>, with <strong>Thursday &amp; Friday until 7 PM</strong>.
            </p>
        </div>
    );
}
