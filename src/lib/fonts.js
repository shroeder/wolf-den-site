// ── EVERY FONT THE SITE LOADS, FROM DISK ─────────────────────────────────────────────────────────────────────
//
// ⚠️ NOTHING HERE TOUCHES THE NETWORK AT BUILD TIME, AND THAT IS THE ENTIRE POINT OF THE FILE.
//
// `next/font/google` fetches each face from Google's servers while Turbopack is compiling. When one of those
// lookups fails the BUILD dies — not the page that wanted the font, the build:
//
//     Error: Turbopack build failed with 6 errors
//     Error while looking up import map: next/font/google queries have exactly one entry
//     [next]/internal/font/google/cinzel_925ed20b.js
//
// That happened FOUR times — 2026-09-27 (Cinzel), 2026-10-17 (Kreon), and twice on 2026-10-30 — and not one
// of the four failing commits touched a font. The fourth was the expensive one: it was the newest deploy, so
// production stayed on the commit before it and a casino change nobody could see had failed sat unshipped.
// Every time, Vercel emailed Luke "Production deployment failed" for a network blip on a third party.
//
// The first pass at this gathered ten scattered calls into four here, which cut the odds and fixed nothing in
// principle — one bad lookup still killed the build. Luke: "Ok fix." So the faces are committed now, and the
// build has no opinion about whether Google is reachable.
//
// ── THE FILES ────────────────────────────────────────────────────────────────────────────────────────────────
// `src/lib/font-files/*.woff2`, ~101KB for all four, each the LATIN subset of the family's VARIABLE font —
// one file covering the whole weight range rather than one per weight. Taken from the same gstatic URLs
// next/font/google was fetching, so these are byte-for-byte the faces the site has always served.
//
// ⚠️ THE DIRECTORY IS `font-files`, NOT `fonts`, because this module is `@/lib/fonts` and a sibling directory
// of that name would make `@/lib/fonts` ambiguous between the file and the folder.
//
// To update a face: re-download the latin woff2 from the css2 endpoint with a modern browser UA (Google
// serves a different, worse format to anything it does not recognise) and drop it in. The weight RANGES below
// must match what the file actually carries, or a weight renders as a synthesised fake.
import localFont from "next/font/local";

// ── THE SITE'S TWO ───────────────────────────────────────────────────────────────────────────────────────────
// Exposed as CSS variables and attached to <body> in layout.js, so everything downstream reads
// var(--font-body) / var(--font-display) rather than importing anything.
export const BODY_FONT = localFont({
    src: "./font-files/manrope.woff2",
    weight: "200 800",
    style: "normal",
    display: "swap",
    variable: "--font-body",
    // The stack that applies while the file is still arriving, and if it never does. `swap` means this IS
    // what a first-time visitor reads for a moment, so it is picked to be close in metrics rather than left
    // at the browser default.
    fallback: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
});

export const DISPLAY_FONT = localFont({
    src: "./font-files/space-grotesk.woff2",
    weight: "300 700",
    style: "normal",
    display: "swap",
    variable: "--font-display",
    fallback: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
});

// ── THE CARD GAME'S TWO ──────────────────────────────────────────────────────────────────────────────────────
// `PANEL_FONT` is the chrome around a card — headers, buttons, the room furniture. It was called in seven
// component files with byte-identical options before any of this; it is called once, here.
export const PANEL_FONT = localFont({
    src: "./font-files/cinzel.woff2",
    weight: "400 900",
    style: "normal",
    display: "swap",
    // Cinzel is an old-style serif, so the stand-in is a serif. Falling back to a sans would reflow the card
    // chrome visibly on a slow connection.
    fallback: ["Georgia", "Times New Roman", "serif"],
});

// `CARD_FONT` is the face of a card itself, and it is deliberately a DIFFERENT face from the panel — see the
// note in CardFace.js. It is still re-exported from there, because a dozen files import it from CardFace and
// moving the definition should not mean touching every one of them.
export const CARD_FONT = localFont({
    src: "./font-files/kreon.woff2",
    weight: "300 700",
    style: "normal",
    display: "swap",
    fallback: ["Georgia", "Times New Roman", "serif"],
});
