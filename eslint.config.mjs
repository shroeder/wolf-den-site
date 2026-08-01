import nextVitals from "eslint-config-next/core-web-vitals";

// ── no-undef ──────────────────────────────────────────────────────────────────────────────────────────────
// Eight bugs in one day shared a single shape: an identifier that is CALLED but never defined, imported, or in
// scope. Every one built clean, because JS resolves none of it until the line runs — and most sat behind a
// catch-all, so they failed silently and were found by members rather than by us:
//
//   rewardLabel   deleted in a refactor, two call sites left  -> the Kitchen 500'd for its only user
//   haulSprite    called six times, defined never             -> 34 fishing treasures paid nothing
//   housePrompt   used in buildPrompt, never imported         -> every paid creation failed
//   seaPets       declared in castLine, used in landFish      -> 8h of dead fishing, casts consumed
//
// next/core-web-vitals does not enable no-undef. This does. It is the one lint rule that would have caught all
// four before a member did.
const config = [
    ...nextVitals,
    {
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: "module",
            globals: {
                // Browser + Node + Web APIs the codebase legitimately reaches for.
                window: "readonly", document: "readonly", navigator: "readonly", location: "readonly",
                localStorage: "readonly", sessionStorage: "readonly", history: "readonly",
                fetch: "readonly", Headers: "readonly", Request: "readonly", Response: "readonly",
                FormData: "readonly", Blob: "readonly", File: "readonly", URL: "readonly",
                URLSearchParams: "readonly", AbortController: "readonly", crypto: "readonly",
                console: "readonly", process: "readonly", Buffer: "readonly", require: "readonly",
                setTimeout: "readonly", clearTimeout: "readonly", setInterval: "readonly",
                clearInterval: "readonly", queueMicrotask: "readonly", structuredClone: "readonly",
                requestAnimationFrame: "readonly", cancelAnimationFrame: "readonly",
                performance: "readonly", getComputedStyle: "readonly", Image: "readonly", Audio: "readonly",
                AudioContext: "readonly", webkitAudioContext: "readonly", CustomEvent: "readonly",
                Event: "readonly", IntersectionObserver: "readonly", ResizeObserver: "readonly",
                MutationObserver: "readonly", TextEncoder: "readonly", TextDecoder: "readonly",
                atob: "readonly", btoa: "readonly", Intl: "readonly",
            },
        },
        rules: { "no-undef": "error" },
    },
];

export default config;
