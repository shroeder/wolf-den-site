// ── EVERY MODAL THAT COVERS EVERY SCREENSHOT ─────────────────────────────────────────────────────────────────
// A fresh headless profile is always a first-time visitor, so every screenshot of every page in the Den starts
// life underneath something: the daily check-in, a feature launch card, a pet levelling up, happy hour, the
// web-push prompt. Each one has been rediscovered by hand — grep for the copy, find the component, find its
// class or its localStorage key, add it to the command line — and then rediscovered again a fortnight later by
// whoever next needed a picture of something.
//
// This is that list, kept once. `SHOT_QUIET=1` merges it into whatever SHOT_SEEN and SHOT_HIDE already say, so
// a caller who needs one specific overlay left visible can still ask for it.
//
// WHEN A NEW ANNOUNCEMENT SHIPS, ADD ITS KEY HERE. That is the whole maintenance burden, and the alternative
// is another afternoon of filming a modal.

// Markers that make a component decide it has already been shown. `=now` means the current timestamp rather
// than "1" — the web-push prompt stores Date.now() and compares against it, so a "1" reads as 1970 and the
// banner shows anyway.
export const QUIET_SEEN = [
    "wolfden-webpush-dismissed=now",
    "wolfden-checkin-day=now-day",           // the daily check-in keys on the STORE day, not a flag
    "wolfden-feature-farm-launch-2026-07",
    "wolfden-dungeons-announce-v1",
    "wolfden-fishing-announce-v1",
    "wolfden-forge-announce-v1",
    "wolfden-market-announce-v1",
    "wolfden-mining-announce-v2",
    "wolfden-hh-seen",
    "wolfden-arena-reopen-v1",
];

// Overlays with no marker to seed — they are server-driven, so the only way to be rid of them is a stylesheet.
// The happy-hour card has no class at all and is matched through the dialog it wraps.
export const QUIET_HIDE = [
    ".checkin-overlay",
    ".plu-scrim", ".petx-overlay", ".levelup-overlay",
    ".gm-overlay", ".arl-scrim", ".ck-scrim", ".ckmg-scrim", ".cmp-scrim", ".dgl-scrim",
    ".fga-scrim", ".jwr-scrim", ".mk-scrim", ".mkl-scrim", ".mmg-scrim", ".poll-scrim",
    ".svy-scrim", ".gearpick-scrim", ".fishlaunch-scrim", ".minelaunch-scrim",
    "div:has(> [aria-label='Happy Hour is live'])",
    // Not a modal, but it sits at the bottom of every page for five seconds after ANY mutating call — which
    // is exactly where a game's primary button lives. It ate the click on the casino's Pull button and the
    // film showed thirty frames of a machine nobody had pulled.
    ".xp-toast",
    // Feature-launch cards are inline-styled with no class of their own; the aria-label is the only handle.
    "[aria-label^='New feature']",
    // The web-push permission card. Same failure as .xp-toast above and found the same way: it anchors to the
    // bottom of the viewport, which is where the casino's Pull button is, so "Not now" was sitting ON the
    // button and three measurement runs came back reporting reels that never moved.
    ".webpush-prompt",
];

/** Merge the quiet list into an env value, keeping anything the caller asked for. */
export function quiet(env, extra, sep) {
    const have = (env || "").split(sep).map((x) => x.trim()).filter(Boolean);
    return [...new Set([...have, ...extra])].join(sep);
}
