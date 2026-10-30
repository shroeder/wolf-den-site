// ── EVERY GOOGLE FONT THE SITE LOADS, LOADED ONCE ────────────────────────────────────────────────────────────
//
// ⚠️ THIS IS THE ONLY FILE ALLOWED TO IMPORT `next/font/google`, AND THAT IS A BUILD RULE RATHER THAN A STYLE
// PREFERENCE. Each call is a network lookup at BUILD time, inside Turbopack, against Google's servers. When
// one of them cannot be resolved the whole build dies — not the page that uses the font, the build:
//
//     Error: Turbopack build failed with 6 errors
//     Error while looking up import map: next/font/google queries have exactly one entry
//     [next]/internal/font/google/cinzel_925ed20b.js
//
// That has now happened FOUR times — 2026-09-27 (Cinzel), 2026-10-17 (Kreon), and twice on 2026-10-30 — and
// not once was the failing commit related to fonts. The second one on 2026-10-30 blocked a casino change from
// shipping for an hour while production sat on the commit before it. Vercel emails Luke "Production
// deployment failed" every time, so a transient network blip arrives looking exactly like a broken diff.
//
// ── WHY GATHERING THEM HELPS ─────────────────────────────────────────────────────────────────────────────────
// `Cinzel` was called in SEVEN component files with byte-identical options:
//
//     Cinzel({ subsets: ["latin"], weight: ["600", "700"], display: "swap" })
//
// Seven calls, seven lookups, seven chances to fail, for one font. The repo made ten lookups for four faces;
// this makes four. It does not remove the dependency — one bad lookup still kills the build — but it cuts the
// surface by well over half, and it puts every face in one place so self-hosting them (`next/font/local` with
// the woff2 files committed) is a change to this file alone rather than to nine.
//
// ⚠️ DO NOT "TIDY" A FONT CALL BACK INTO A COMPONENT. A second call site with the same options is not a
// duplicate the bundler folds away — it is a second lookup, and the whole point of this file is that there
// are as few of those as possible.
import { Cinzel, Kreon, Manrope, Space_Grotesk } from "next/font/google";

// ── THE SITE'S TWO ───────────────────────────────────────────────────────────────────────────────────────────
// Exposed as CSS variables and attached to <body> in layout.js, so everything downstream reads
// var(--font-body) / var(--font-display) rather than importing anything.
export const BODY_FONT = Manrope({
    subsets: ["latin"],
    variable: "--font-body",
});

export const DISPLAY_FONT = Space_Grotesk({
    subsets: ["latin"],
    variable: "--font-display",
});

// ── THE CARD GAME'S TWO ──────────────────────────────────────────────────────────────────────────────────────
// `PANEL_FONT` is the chrome around a card — headers, buttons, the room furniture. Imported as `panelFont` by
// the seven screens that used to each call Cinzel themselves.
export const PANEL_FONT = Cinzel({ subsets: ["latin"], weight: ["600", "700"], display: "swap" });

// `CARD_FONT` is the face of a card itself, and it is deliberately a DIFFERENT face from the panel — see the
// note in CardFace.js. It is still re-exported from there, because a dozen files import it from CardFace and
// moving the definition should not mean touching every one of them.
export const CARD_FONT = Kreon({ subsets: ["latin"], weight: ["400", "600", "700"], display: "swap" });
