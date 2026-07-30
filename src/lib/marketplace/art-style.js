// ── THE WOLF DEN HOUSE ART STYLE ─────────────────────────────────────────────────────────────────────────────
// ONE source of truth for how every generated image should look. Import this from any generator instead of
// writing style prose inline — that's how we ended up with four different looks in the same game:
//
//   · items    → heavy black ink contour, faceted cel shading, painted interior, rim light   ← the real style
//   · decos    → softer brown outlines, flat cartoon shading, much less detail
//   · badges   → flat two-colour VECTOR ICON, thin uniform line, no shading at all
//   · town/bg  → soft painterly, no outlines whatsoever
//
// The target is the item look, described by its concrete attributes rather than by a style name. Image models
// follow attribute lists ("bold black contour", "hard-edged value steps") far more reliably than trend labels
// ("Hearthstone style"), which drift as models change and often get ignored outright.
//
// NOTE ON OUTLINES — these are two different things and the distinction matters:
//   ✅ WANT:    a dark INK CONTOUR that is part of the drawing, like comic line art.
//   ❌ NEVER:   a white/pale STICKER RIM, glow outline or drop shadow around the die-cut edge. That's the halo
//               artefact; it looks like a cheap sticker and it's what dehalo.js exists to clean up.
// Keep both halves — asking for ink lines without banning the sticker rim reliably produces both.

// The core rendering style. Every generated image gets this, sprite or scene.
export const HOUSE_STYLE =
    "Rendered in a bold stylised fantasy video-game illustration style: a strong DARK near-black ink contour " +
    "line of even weight around the silhouette and around each major form, like comic/graphic-novel line art. " +
    "Shading is CEL-SHADED in two or three crisp hard-edged value steps — no soft airbrushed gradients across " +
    "the whole form — with finer painted texture and detail worked inside each value step. Rich saturated " +
    "jewel-tone colours, cool-toned shadows against warm highlights, a crisp specular rim light along the upper " +
    "edges, and chunky slightly exaggerated proportions with a strong readable silhouette. High detail and " +
    "confident craftsmanship, never flat, never minimal, never a plain vector icon.";

// What NOT to draw. Split out because every generator needs it and it's the half people forget.
export const NEGATIVE_STYLE =
    "No text, no letters, no numbers, no words, no logos, no watermarks, no signature, no UI elements. " +
    "No white or pale sticker rim, no die-cut border, no glow outline, no drop shadow, no vignette, no frame. " +
    "Not photorealistic, not 3D-rendered, not a soft watercolour painting, not a flat minimal vector icon, " +
    "not pixel art.";

// A single object floating free, for anything composited into the UI (items, pets, badges, decorations, chests).
export const DIE_CUT =
    "A SINGLE isolated subject, centred and filling most of the frame, on a FULLY TRANSPARENT background — " +
    "nothing behind it at all: no backdrop, no scene, no ground, no shadow beneath it.";

// A full-bleed environment, for backgrounds and boss/key art.
export const SCENE =
    "A full-bleed scene filling the entire frame edge to edge, with clear foreground, midground and background " +
    "depth, and lighting that reads instantly at a glance.";

/**
 * Compose a house-style prompt.
 *
 * @param {string} subject  what to draw — the ONLY part that should vary per asset
 * @param {object} [opts]
 * @param {"sprite"|"scene"} [opts.framing="sprite"]  die-cut object vs full-bleed environment
 * @param {string} [opts.extra]  asset-specific direction (pose, angle, palette, must-read-at-24px…)
 * @returns {string}
 */
export function housePrompt(subject, { framing = "sprite", extra = "" } = {}) {
    return [
        String(subject || "").trim(),
        framing === "scene" ? SCENE : DIE_CUT,
        HOUSE_STYLE,
        String(extra || "").trim(),
        NEGATIVE_STYLE,
    ].filter(Boolean).join(" ");
}

// Small subjects (badges, stat icons, inventory thumbnails) are viewed tiny, so they need a louder silhouette
// and less interior noise — but the SAME ink-and-cel treatment, so they still belong to the set.
export const SMALL_ICON_EXTRA =
    "This is viewed small: keep one clear dominant shape, exaggerate the silhouette, limit the palette to two or " +
    "three hues plus a metal accent, and keep interior detail bold and chunky so it stays legible shrunk to 24 " +
    "pixels. Still fully shaded with ink contours — not a flat icon.";
