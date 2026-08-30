// ── THE THREE ANSWERS, WHERE A BROWSER CAN READ THEM ─────────────────────────────────────────────────────────
// notify-prefs.js is `server-only` — it imports the database — and the settings screen is a client component
// that needs to render three labelled buttons. Importing the real module from the client is the mistake that
// has cost this repo a 165-error build before now (see badge-bonus-meta.js and casino-perk-tracks.js, both
// extracted for exactly this reason).
//
// So the labels live here, with no imports at all, and notify-prefs.js pulls them in and re-exports them —
// imported AND exported rather than `export { X } from`, because that form binds nothing locally and would
// leave the server module's own references undefined.
//
// ⚠️ THE COPY IS HERE; THE RULE IS NOT. What "some" actually switches on is decided by SOME_GROUPS in
// notify-prefs.js, read off the catalog's own grouping. Nothing in this file decides anything — if a mode's
// description here stops matching what its rule does, the description is the thing that is wrong.
export const NOTIFY_MODES = [
    { key: "all", label: "Everything", desc: "Every notification the Den can send you." },
    { key: "some", label: "Just the important ones", desc: "Someone waiting on you, messages and friend requests. Nothing else." },
    { key: "none", label: "Nothing", desc: "No push, no email. You will find things when you come looking." },
];

export const isNotifyMode = (m) => NOTIFY_MODES.some((x) => x.key === String(m || ""));
