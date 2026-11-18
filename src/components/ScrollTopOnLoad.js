"use client";

import { useEffect } from "react";

// ── ⚠️ A PAGE THAT GROWS 7x AFTER PAINT CANNOT RESTORE A SCROLL POSITION ────────────────────────────────────
// Kaishiern, in #bugs 2026-11-11: "Refreshing the character profile page aka the gear page sends me to the
// very bottom of the page."
//
// Reproduced on the live site at 430x880 (scripts/qa-gear-scroll.mjs): scrolled to y=4943, pressed refresh,
// landed at y=7359 of 8239 — the end of the document.
//
// WHY. The gear page is 1,188px tall on first paint and 8,239px once its client half has rendered. The
// browser saves the offset you left at and restores it against the document as it exists at that instant —
// which is the short one — so the restore is clamped, and then eight thousand pixels of content arrive and
// scroll anchoring carries the viewport along with them. You end up at the bottom of a page you were in the
// middle of.
//
// ⚠️ NOTHING ON THE PAGE WAS DOING THIS. There is no scrollIntoView, no autoFocus and no scrollTo in any of
// the three components it mounts; grepping for them is how an afternoon gets spent on the wrong file. It is
// the browser doing exactly what it is supposed to, to a document that changes height under it.
//
// SO THE RESTORE IS TURNED OFF AND THE PAGE STARTS AT THE TOP. Keeping the position honestly would mean
// waiting for the layout to settle and then restoring — more moving parts, and every one of them a new way
// to land somewhere wrong. The top of your own gear page is where you were going anyway.
//
// ⚠️ AND IT IS PUT BACK ON THE WAY OUT. scrollRestoration is a property of the whole session history, not of
// this page — leaving it "manual" would quietly break position restore on every other page in the Den for
// the rest of the visit.
export default function ScrollTopOnLoad() {
    useEffect(() => {
        if (typeof window === "undefined") return undefined;
        const had = window.history.scrollRestoration;
        try { window.history.scrollRestoration = "manual"; } catch { /* unsupported, nothing to undo */ }
        // Immediately, and again after the layout has grown: the first call wins the normal case and the
        // second catches a restore the browser performs after hydration.
        window.scrollTo(0, 0);
        const t = setTimeout(() => window.scrollTo(0, 0), 250);
        return () => {
            clearTimeout(t);
            try { window.history.scrollRestoration = had || "auto"; } catch { /* nothing to undo */ }
        };
    }, []);
    return null;
}
