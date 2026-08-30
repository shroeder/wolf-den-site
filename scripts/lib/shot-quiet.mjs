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
    // ── THE BADGE POP ────────────────────────────────────────────────────────────────────────────────
    // It is marked seen on DISMISS and server-side, deliberately — a tab closed mid-read should hand the
    // badge back rather than swallow it (see BadgePop). Which is right for a member and merciless for a
    // rig: an undismissed badge sits over EVERY page load forever. It cost two wrong readings on the
    // casino before I shot the screen and saw it — check:feel reported the floor as silent and the counter
    // as unresponsive, and both were measuring a modal that had been sitting there since the run before.
    ".bdg-scrim",
    ".plu-scrim", ".petx-overlay", ".levelup-overlay",
    ".gm-overlay", ".arl-scrim", ".ck-scrim", ".ckmg-scrim", ".cmp-scrim", ".dgl-scrim",
    ".fga-scrim", ".jwr-scrim", ".mk-scrim", ".mkl-scrim", ".mmg-scrim", ".poll-scrim",
    ".svy-scrim", ".gearpick-scrim", ".fishlaunch-scrim", ".minelaunch-scrim",
    // ── HIDE THE DIALOG, NOT ONLY ITS SCRIM ──────────────────────────────────────────────────────────
    // The poll and the survey put the scrim and the panel side by side under a `-wrap`, so hiding the
    // scrim removed the dimming and left the card sitting in the middle of the shot — which cost a whole
    // capture of the casino's bonus screen. Hide the wrap and both halves go.
    ".poll-wrap", ".svy-wrap",
    // ── THE ARENA'S AWAY REPORT ──────────────────────────────────────────────────────────────────────
    // Dismissed by TAPPING it, and it reappears the moment anybody challenges you while you are logged
    // out — so on the owner's account, which the whole Den challenges, it is over the arena on nearly
    // every capture. It covered the entire Road tab on the first shot of the season track.
    ".ar-away",
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

// ── AND THE TWO HOOKS THAT ACTUALLY APPLY IT ─────────────────────────────────────────────────────────────────
// The lists above were shared; the CODE that installed them was not. shot.mjs had both hooks written out
// inline and check-feel.mjs had NEITHER — so the screenshot rig quietly dismissed every overlay in the Den and
// the polish gate measured straight through them.
//
// That is not a cosmetic difference. check:feel reported the casino floor as silent and the counter as
// unresponsive, twice, and both readings were of an undismissed "Badge earned" modal sitting over the page.
// A gate that measures through a modal does not report the modal — it reports whatever the modal made the
// screen underneath look like, which is a wrong answer delivered with total confidence.
//
// So both hooks live here now and both callers use them. `send` is a CDP sender; call this after Page.enable
// and BEFORE navigating, because both hooks run at document-start.
export async function installQuiet(send, { hide = "", seen = "" } = {}) {
    const sel = String(hide).split(",").map((x) => x.trim()).filter(Boolean).join(", ");
    if (sel) {
        const css = `${sel} { display: none !important; }`;
        await send("Page.addScriptToEvaluateOnNewDocument", {
            source: `(() => {
                const put = () => {
                    // At document-start there may be no head AND no documentElement yet. Calling appendChild
                    // on null throws, and because the throw would happen BEFORE the listener below is
                    // registered, the whole hook dies silently and nothing is hidden at all.
                    const root = document.head || document.documentElement;
                    if (!root) return false;
                    const s = document.createElement("style");
                    s.textContent = ${JSON.stringify(css)};
                    root.appendChild(s);
                    return true;
                };
                document.addEventListener("DOMContentLoaded", put);
                put();
                let n = 0;
                const t = setInterval(() => { put(); if (++n > 40) clearInterval(t); }, 100);
            })();`,
        });
    }

    const keys = String(seen).split(";").map((k) => k.trim()).filter(Boolean);
    if (keys.length) {
        const setters = keys.map((entry) => {
            const eq = entry.indexOf("=");
            const key = eq === -1 ? entry : entry.slice(0, eq);
            const raw = eq === -1 ? "1" : entry.slice(eq + 1);
            // `now` is a timestamp, not a flag: the web-push prompt snoozes by storing Date.now() and
            // comparing against it, so a "1" reads as 1970 and the banner shows anyway.
            const value = raw === "now" ? "String(Date.now())"
                : raw === "now-day" ? 'new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date())'
                    : JSON.stringify(raw);
            return `localStorage.setItem(${JSON.stringify(key)}, ${value});`;
        });
        await send("Page.addScriptToEvaluateOnNewDocument", {
            source: `try { ${setters.join(" ")} } catch (e) {}`,
        });
    }
}
