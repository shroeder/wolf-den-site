"use client";

// ── ONE REQUEST, FOUR WATCHERS ───────────────────────────────────────────────────────────────────────────────
// RewardNudge, HappyHourWatcher, RecipeFoundWatcher and BadgePop all mount together in the root layout and all
// used to fetch their own endpoint on mount. That is four invocations on every page load of the whole site to
// answer four versions of "is there anything to show this member", and the answer is usually no.
//
// ⚠️ THE IN-FLIGHT PROMISE IS WHAT IS SHARED, not the resolved value — the same lesson equip-cache.js learned
// the expensive way. These four components mount in the same tick, so every one of them asks before any answer
// exists. Caching after the await would have every one of them miss and open its own request, and the four
// would still be four. Handing out the same promise means three of them wait on the first one's request.
let inflight = null;

export function nudgeFeed() {
    if (!inflight) {
        inflight = fetch("/api/marketplace/nudges", { cache: "no-store", credentials: "same-origin" })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null);
        // A failure must not be remembered, or a single blip leaves the whole page with no nudges until the
        // next navigation.
        inflight.then((d) => { if (!d) inflight = null; });
    }
    return inflight;
}

/** After something that changes what is pending — claiming a badge, cooking a dish — so the next read is fresh. */
export function refreshNudges() {
    inflight = null;
}

// ── AND WHO CLEARS IT ────────────────────────────────────────────────────────────────────────────────────────
// The watchers all re-read on `wolfden-hud-refresh`. If each of them called refreshNudges() first, the four
// would invalidate each other in turn and fire four requests again — exactly the thing this file exists to
// stop. So the feed listens once, centrally, and clears before any component handler runs: this module is
// imported at the top of each watcher, so its listener is registered before their effects register theirs.
if (typeof window !== "undefined") {
    window.addEventListener("wolfden-hud-refresh", () => { inflight = null; });
}
