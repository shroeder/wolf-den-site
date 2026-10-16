"use client";

// ── ONE ANSWER TO "IS THERE A MEMBER HERE", SHARED BY EVERY CLIENT THAT ASKS ─────────────────────────────────
// SiteHeader has asked /api/marketplace/auth/me on every page of the site since it was written, to decide
// between a Sign In button and the member's avatar. The peekers need the same fact, and a second component
// calling the same endpoint on every page view is the exact shape check:chrome exists to catch: a thing
// mounted in the layout costs its request on EVERY navigation by EVERY visitor, for ever.
//
// ⚠️ THE PROMISE IS CACHED, NOT THE VALUE. Both callers mount in the same tick, so a resolved-value cache is
// still empty when the second one looks — they would both miss and both fetch, which is the whole bug this
// avoids. Handing back the in-flight promise means the second caller waits on the first caller's request.
// Same rule the nav and HUD round-trip work landed on; see the note in CLAUDE.md about narrowing a call.
let inflight = null;

/** The signed-in member, or null. Resolved once per page load and shared. */
export function memberSession() {
    if (!inflight) {
        inflight = fetch("/api/marketplace/auth/me", { cache: "no-store" })
            .then((r) => (r && r.ok ? r.json() : null))
            .then((d) => d?.buyer || null)
            .catch(() => null);
    }
    return inflight;
}
