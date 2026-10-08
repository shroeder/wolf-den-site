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
export const HERO_MIN_VH = 0.13;
export const HERO_MAX_VH = 0.20;

// ⚠️ 0.13 RATHER THAN 0.09 BECAUSE OF WHAT A PORTRAIT PHONE LOOKS LIKE. At 0.09 the hero was a perfectly
// reasonable 76px and the frame was still 90% empty canopy, with the whole zone in a strip along the bottom.
// Being small in PIXELS and being small in the COMPOSITION are different problems and only the second one
// reads as tiny. It binds on portrait only; every landscape screen is held by the ceiling or the span.

// ── THE HORIZON ─────────────────────────────────────────────────────────────────────────────────────────────
// The backdrop may be scaled up past cover until its painted ground line is at least this far up the frame,
// which crops dead canopy off the top rather than displaying it. Moves the composition WITHOUT touching the
// world scale, so the hero does not have to grow to compensate. Costs sharpness, hence a floor not a factor.
export const GROUND_MIN_VH = 0.24;

// How far the backdrop can be panned into when the camera climbs, as a share of that climb.
export const SKY_PY = 0.22;
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

    // The strip has to be at least: tall enough to pan into, wide-screen cover, and high enough to put the
    // horizon where GROUND_MIN_VH wants it. One box, so the ground line and the tiles can never be measured
    // against two different numbers.
    const skyBoxH = Math.max(
        vh + (topY + HERO_UNITS) * unit * SKY_PY * 1.1,
        vw * (PLATE_H / PLATE_W),
        (GROUND_MIN_VH * vh) / GROUND_OF_PLATE,
    );

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
