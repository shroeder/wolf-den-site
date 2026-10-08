// ── THE GROVE'S GEOMETRY ─────────────────────────────────────────────────────────────────────────────────────
// How big a world unit is on this screen, where the ground line falls, how far the camera leads the hero, and
// how closely the pet follows. Everything here is a pure function of the viewport and the zone — no React, no
// DOM, no state. GroveScene.js owns the easing and the transforms; this owns the numbers they ease toward.
//
// ⚠️ IT LIVES HERE BECAUSE OF A BUG CLASS THAT HIT THREE TIMES IN ONE SESSION. The scene used to be drawn at
// roughly 100 world units across, and several distances were tuned as bare constants in that frame:
//
//   · the camera lookahead, 14 units
//   · the pet's trail, 9 units
//   · the tap handler's own private copy of the scale, rect.width / 100
//
// Each reads as a world distance and is really a VIEW distance — a fraction of the frame, written down in the
// units of one particular frame size. The moment the scale changed to make the hero readable, the frame held
// 26 units instead of 100 and all three silently changed meaning: the camera led the hero by more than half
// the screen and left him at x = -65, the pet rode the left bezel and then fell off it, and a tap asked for
// about half the distance it pointed at. None of them error. All three photograph as something else entirely
// — an empty forest, a lost pet, a hero who stops short.
//
// ⚠️ SO ANY DISTANCE THAT IS REALLY A SHARE OF THE FRAME BELONGS IN THIS FILE, EXPRESSED AGAINST THE FRAME.
// scripts/check-grove.mjs runs every function below across the real viewport sizes and asserts the hero and
// the pet are actually on screen. A bare node can import this, which is the whole point — it must stay free
// of imports, exactly like grove-roll.js.

// ── ⚠️ MUST MATCH THE STYLESHEET ────────────────────────────────────────────────────────────────────────────
// .gv-hero is calc(7 * var(--gv-unit)) and .gv-pet is 4.5. The scale below is chosen so that a 7-unit hero
// lands at a readable size, so if the stylesheet changes these have to change with it.
export const HERO_UNITS = 7;
export const PET_UNITS = 4.5;

// The backdrops are all generated at 1536x1024 with the painted ground about an eighth of the way up.
export const PLATE_W = 1536;
export const PLATE_H = 1024;
export const PLATE_AR = PLATE_W / PLATE_H;
export const GROUND_OF_PLATE = 0.13;

// ── THE SCALE ───────────────────────────────────────────────────────────────────────────────────────────────
// Aim for a number of world units across the frame, then hold the hero between a floor and a ceiling as a
// share of the viewport HEIGHT. The ceiling stops a short wide screen filling itself with a shoulder; the
// floor stops a tall narrow one showing a doll in a cathedral.
export const SPAN_NARROW = 44;
export const SPAN_MID = 56;
export const SPAN_WIDE = 68;
export const HERO_MIN_VH = 0.19;
export const HERO_MAX_VH = 0.26;

// ⚠️ 0.13 RATHER THAN 0.09 BECAUSE OF WHAT A PORTRAIT PHONE LOOKS LIKE. At 0.09 the hero was a perfectly
// reasonable 76px and the frame was still 90% empty canopy, with the whole zone in a strip along the bottom.
// Being small in PIXELS and being small in the COMPOSITION are different problems and only the second one
// reads as tiny. It binds on portrait only; every landscape screen is held by the ceiling or the span.

// ── ⚠️ THE BACKDROP IS NEVER SCALED UP TO LIFT THE HORIZON. THAT IS WHAT MADE HIM AN ANT. ───────────
// Luke: "Look at the background, it looks like honey I shrunk the kids ... What am I an ant in a forest of
// grass."
//
// There used to be a GROUND_MIN_VH here that scaled the painting up until its ground line sat high in the
// frame, on the theory that the empty canopy above the action was what read as "tiny". It is not, and the
// cure was worse than the complaint: scaling a backdrop up scales THE WHOLE FOREST up. At a 1.9x plate the
// painted grass band was 34% of the screen and the hero was 19% of it — the blades of grass were
// literally taller than the knight. No sprite size can survive that. He was not small, the world was huge.
//
// ⚠️ SO THE RULE IS THE RATIO, NOT THE SPRITE. A character reads as person-sized when he TOWERS OVER THE
// FOREGROUND FOLIAGE, which is what MapleStory and every side-scroller like it actually do: ankle-high grass,
// knee-high shrubs, a character who is the tallest thing standing on the floor. The hero must therefore be
// taller than the painted ground band, and scripts/check-grove.mjs asserts exactly that now.
//
// The plate is rendered at COVER plus a little headroom for the vertical camera and nothing more. That keeps
// the grass band at its painted 13%, under a hero at 19-26%, and it has the second effect of removing the
// upscale entirely — at cover the 1536px source renders at or below native on every screen but an
// ultrawide, so the backdrop is sharp instead of the mush a 2x upscale was producing next to crisp sprites.
export const SKY_HEADROOM = 1.12;

// How far the backdrop can be panned into when the camera climbs, as a share of that climb.
// ⚠️ AND THE VERTICAL PARALLAX IS SMALL ON PURPOSE. It was 0.22, and the plate had to grow by the whole
// of a zone's depth times that to have somewhere to pan into — which is the other thing that was quietly
// inflating the painting. Distant scenery barely drops when you climb anyway, so 0.08 is both more correct
// and cheap enough to fit inside SKY_HEADROOM at every zone depth.
export const SKY_PY = 0.08;
export const SKY_PX = 0.38;
export const SKY_TILE_COUNT = 5;

// ── SHARES OF THE FRAME ─────────────────────────────────────────────────────────────────────────────────────
// Both of these were the bug. Expressed against what is visible, they hold their look at any zoom, and at the
// old 100-unit frame they are exactly the constants they replace (14 and 9).
export const LOOKAHEAD_OF_FRAME = 0.14;
export const PET_TRAIL_OF_FRAME = 0.12;
export const PET_TRAIL_MAX = 9;
export const CAM_Y_DEADZONE = 0.62;

/**
 * Everything the scene needs to lay itself out, from the viewport and the zone's tallest ledge.
 *
 * `topY` is the highest platform in the zone; it only sets how much extra backdrop has to exist above the
 * frame so a climb pans into painted sky instead of a hole. ⚠️ IT NO LONGER CONSTRAINS THE SCALE — that is
 * the clamp this file exists to have removed.
 */
export function viewFor(vw, vh, topY = 0) {
    const span = vw < 560 ? SPAN_NARROW : vw < 1000 ? SPAN_MID : SPAN_WIDE;
    const unit = Math.min(
        Math.max(vw / span, (HERO_MIN_VH * vh) / HERO_UNITS),
        (HERO_MAX_VH * vh) / HERO_UNITS,
    );

    // ⚠️ COVER, PLUS HEADROOM, AND NOTHING ELSE. Every extra pixel of height here scales the whole
    // painting up, which makes the grass taller than the hero — see SKY_HEADROOM above. The headroom is a
    // flat share of the viewport rather than a function of the zone's depth, so a deep zone cannot quietly
    // inflate the forest; the vertical parallax is clamped to fit it instead.
    // ⚠️ THE TILE DOES NOT HAVE TO BE AS WIDE AS THE SCREEN. It is a TILED strip, so width is covered
    // by laying down more tiles; only the HEIGHT has to be covered by one. Carrying a vw-based term here
    // forced a 3440px screen to render the plate 2293px tall — a 2.24x stretch of a 1536px painting, for
    // no reason at all. Height alone now, which means the stretch depends only on how tall the viewport is.
    const skyBoxH = vh * SKY_HEADROOM;

    const groundPx = GROUND_OF_PLATE * skyBoxH;
    return {
        unit,
        span,
        visibleUnits: vw / unit,
        skyUnits: Math.max(40, vh - groundPx) / unit,
        groundPx,
        skyBoxH,
        tileW: skyBoxH * PLATE_AR,
        heroPx: HERO_UNITS * unit,
        // ⚠️ THE NUMBER THAT DECIDES WHETHER HE LOOKS LIKE A PERSON OR AN INSECT. Above 1 the hero
        // stands taller than the painted foreground; below it he is wading through grass drawn for something
        // the size of a beetle. Asserted in check-grove.mjs.
        heroOverGround: (HERO_UNITS * unit) / groundPx,
        // How far the 1536px source is being stretched. Over about 1.3 and the backdrop goes soft next to
        // the sprites, which is what scaling the plate up to lift the horizon used to cost.
        plateUpscale: (skyBoxH * PLATE_AR) / PLATE_W,
    };
}

/** How far ahead of the hero the camera settles. A share of the frame — see the header. */
export const lookaheadFor = (visibleUnits) => visibleUnits * LOOKAHEAD_OF_FRAME;

/** Where the pet wants to stand, and how much slack before it bothers moving. */
export function petFollow(visibleUnits) {
    const trail = Math.min(PET_TRAIL_MAX, visibleUnits * PET_TRAIL_OF_FRAME);
    return { trail, slack: Math.max(1.2, trail * 0.35) };
}

/** The camera's resting x, clamped so the zone's own edges never scroll into frame. */
export const cameraX = (heroX, face, visibleUnits, zoneW) =>
    Math.max(0, Math.min(zoneW - visibleUnits, heroX + face * lookaheadFor(visibleUnits) - visibleUnits / 2));

/**
 * The camera's resting y. Zero while the hero is in the lower part of the sky, so the horizon does not bob
 * on every hop, and never negative because there is nothing below the ground to look at.
 */
export const cameraY = (heroY, skyUnits) =>
    Math.max(0, heroY + HERO_UNITS - skyUnits * CAM_Y_DEADZONE);

/** Where a body at world x renders, in px from the left edge of the frame. */
export const screenX = (x, cam, unit) => (x - cam) * unit;
