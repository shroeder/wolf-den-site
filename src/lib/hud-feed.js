"use client";

// ── ONE HUD REPLY, EVERY READER ──────────────────────────────────────────────────────────────────────────────
// /api/marketplace/hud is the single question "what does this member have waiting" — fourteen booleans and
// counts that used to be fourteen separate feature builds. GameNav asks it in the layout on every page.
//
// So anything else on the page that wants the same answer must NOT ask again. The game hub wanted chests,
// spins, boss strikes, quests and crops to badge its tiles — every one of them already in that reply — and
// the version before this one reached for /api/marketplace/spin instead, which builds the whole wheel to
// learn a single number. Round trips are Active CPU, and the hub is the most-opened page in the Den.
//
// ⚠️ THE IN-FLIGHT PROMISE IS WHAT IS SHARED, not the resolved value. Same lesson as nudge-feed.js and
// equip-cache.js before it: the readers mount in the same tick, so every one of them asks before any answer
// exists. Caching after the await would have them all miss and open their own request.
let inflight = null;

export function hudFeed() {
    if (!inflight) {
        inflight = fetch("/api/marketplace/hud", { cache: "no-store", credentials: "same-origin" })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null);
        // A failure must not be remembered, or one blip leaves the menu with no Kitchen and the hub with no
        // badges until the next navigation.
        inflight.then((d) => { if (!d) inflight = null; });
    }
    return inflight;
}

/** Drop the cached answer so the next read is fresh. */
export function refreshHud() {
    inflight = null;
}

// Opening a chest spends the chest and cooking spends the ingredients, so the badges have to be able to go
// DOWN without a navigation. Cleared centrally, once, for the same reason nudge-feed.js does it: if every
// reader cleared it in its own handler they would invalidate each other in turn and fire N requests again.
// This module is imported at the top of each reader, so its listener registers before their effects do.
if (typeof window !== "undefined") {
    window.addEventListener("wolfden-hud-refresh", () => { inflight = null; });
}
