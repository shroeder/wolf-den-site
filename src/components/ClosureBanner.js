"use client";

import { useSyncExternalStore } from "react";

// Show a temporary store-closure notice. The banner stops showing once the
// store reopens on June 21, 2026. The expiry is anchored to Central Time
// (Montgomery, MN is on CDT / UTC-05:00 in June) so it clears at the right
// moment regardless of the visitor's timezone or any page caching.
const EXPIRES_AT = Date.parse("2026-06-21T00:00:00-05:00");

// Empty subscription: the value only matters at first render, and a visitor
// sitting on the page across midnight on the 21st is an edge case not worth a
// timer for. A refresh after that point correctly hides the banner.
const subscribe = () => () => {};
const getSnapshot = () => Date.now() < EXPIRES_AT;
const getServerSnapshot = () => false;

export default function ClosureBanner() {
    const show = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

    if (!show) {
        return null;
    }

    return (
        <div className="closure-banner" role="status">
            <span className="shell closure-banner-inner">
                <strong>Heads up:</strong> The Wolf Den will be <strong>closed Saturday, June 20</strong>. We&apos;ll be
                back to our regular hours after that — thanks for understanding!
            </span>
        </div>
    );
}
