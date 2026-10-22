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
// ── ⚠️ 0.13, AND THE PLATE IS WHAT MADE 0.19 UNMOVABLE ──────────────────────────────────────────────────────
// Luke: "The grove on mobile is too zoomed in to the character." A phone saw 17 world units across while a
// laptop saw 59 -- the hero was 41% of the width of a phone screen and 12% of a laptop's.
//
// Every previous attempt to pull the camera back hit the same wall. The hero is scaled by the WORLD; the
// backdrop was scaled to COVER THE VIEWPORT. Those are independent, so zooming out shrank the hero and left
// the painted grass exactly where it was, and he waded into it -- the ant-in-a-forest bug, which
// check-grove.mjs correctly refuses. That looked like a hard constraint from the art. It was not: it was
// the plate being sized against the screen instead of against the world.
//
// Size the plate in WORLD UNITS (see PLATE_UNITS) and the two shrink together. The hero stands exactly as
// proud of the grass at any zoom, because the ratio no longer contains the viewport at all:
//
//     heroOverGround = HERO_UNITS / (GROUND_OF_PLATE * PLATE_UNITS)      -- a constant
//
// So this number is finally free to be chosen for how the game READS rather than for what the backdrop
// will tolerate. 0.13 gives a phone 25 units across instead of 17.
export const HERO_MIN_VH = 0.13;
export const HERO_MAX_VH = 0.26;

// ── ⚠️ HOW TALL THE PLATE IS, IN WORLD UNITS ────────────────────────────────────────────────────────────────
// The number that replaces "cover the viewport". It is not invented: it is what the old scheme already
// produced, so the painting's relationship to the hero is preserved exactly rather than re-tuned.
//
//     old plate height = vh * SKY_HEADROOM = 1.12vh, at unit = 0.19vh/7  ->  1.12 / (0.19/7) = 41.3 units
//
// Which is why heroOverGround still comes out at 1.30, the value every backdrop was drawn against and the
// value check-grove.mjs asserts. Raising this zooms the PAINTING out without touching the world; lowering
// it is the grass-taller-than-the-knight bug.
export const PLATE_UNITS = 41.3;
// ⚠️ AND A FLOOR, OR A WIDE SHORT SCREEN PAINTS A LETTERBOX. On a landscape phone the span term wins and
// unit falls far enough that a world-sized plate would occupy under half the height, leaving more haze than
// painting. Below this the plate goes back to covering, and the hero simply reads a little taller against
// the grass there -- which is the right way to fail, because that is the screen with the least grass on it.
export const MIN_PLATE_OF_VH = 0.72;

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
//
// ⚠️ IT IS DELIBERATELY NOT 1:1 LIKE SKY_PX IS, AND THE REASON IS ARITHMETIC RATHER THAN TASTE. The strip
// is infinitely wide, so matching the camera horizontally costs nothing; vertically it is ONE plate with
// SKY_HEADROOM = 1.12, which is 0.12vh of painted sky above the frame to pan into. A three-tier zone puts
// the hero 33 units up and the camera climbs about 0.95vh to follow him — eight times the headroom there
// is. Paying for a 1:1 vertical means roughly SKY_HEADROOM = 2.1, and a plate at twice the height is the
// grass-taller-than-the-knight bug written out in full (see the block above). So the floor is locked to
// the world and the climb is the one axis that floats. Fixing it properly is a second plate or a painted
// sky band, not a bigger number here.
export const SKY_PY = 0.08;

// ── ⚠️ HORIZONTALLY THE BACKDROP IS NOT PARALLAX. IT IS THE GROUND. ────────────────────────────────────
// Luke: "background scroll is not right. It should be 1:1 with enemy scroll and player scroll. Right now
// it makes a slidey effect."
//
// This was 0.38, which is the right number for a DISTANT band and the wrong one for this plate, because
// the plate paints the floor everybody is standing on — GROUND_OF_PLATE, the bottom 13% of it, is the
// surface the hero's feet are anchored to. Moving that surface at 38% of the camera means every step the
// hero takes slides him 62% of its length across the grass he is supposedly walking on, and that is read
// instantly as weightlessness even by someone who could not say which layer was wrong. Depth that costs
// the floor its traction is not worth having.
//
// 1:1 is free here and nothing else had to change for it: the strip is mirror-tiled, so it has no edge to
// run out of no matter how far the camera travels, and the wrap already covered a full two-tile period.
// If the Grove ever wants real depth it has to come from a SECOND, further strip behind this one with its
// own factor — never from sliding the floor.
export const SKY_PX = 1;
export const SKY_TILE_COUNT = 5;

// ── SHARES OF THE FRAME ─────────────────────────────────────────────────────────────────────────────────────
// Both of these were the bug. Expressed against what is visible, they hold their look at any zoom, and at the
// old 100-unit frame they are exactly the constants they replace (14 and 9).
// ⚠️ 0.11, NOT 0.14. The lookahead decides where the hero SITS in the frame — at 0.14 he stands 36% of
// the way in from the left edge, and everything that follows him has to fit in that 36%. The pet did not.
// Leading less keeps the camera's job (you see where you are going) while leaving the hero room behind him.
export const LOOKAHEAD_OF_FRAME = 0.11;

// ── ⚠️ A FOLLOWER'S DISTANCE IS A BODY DISTANCE, NOT A SHARE OF THE FRAME ──────────────────────────────
// This was the correction to a real bug and it over-corrected. A flat 9 units was 9% of the old 100-unit
// frame and 35% of a 26-unit one, so the pet rode the left bezel and then fell off it — and the fix was to
// express it as a share of what is visible. That is right for a CAMERA LOOKAHEAD, which is genuinely a
// fraction of the frame, and wrong for a pet: 12% of an 18-unit phone frame is 2.1 units, and the hero is
// SEVEN UNITS WIDE. The pet was standing inside him, in every frame of film, at every phone size.
//
// What the number actually wants to be is "just clear of his shoulder" — a distance in bodies. The share of
// the frame survives as the thing that makes a wide desktop frame look right rather than leaving the pet
// glued to the hero's hip, and PET_TRAIL_MIN is the floor that stops it ever overlapping again. That floor
// wins over the cap on purpose: a pet near the edge of the frame is a worse look than a pet in the middle
// of the hero is a bug.
export const PET_TRAIL_OF_FRAME = 0.13;
// ⚠️ 0.62, AND THE CEILING IS THE FRAME ITSELF, NOT TASTE. Their boxes do still overlap slightly at this
// value — but 0.78 put the pet at x = -25 on a 390px phone and check-grove.mjs failed it by name at two
// viewport sizes, which is the whole reason that gate exists. The arithmetic is forced: the camera settles
// the hero about seven units from the left edge, and the pet's box is 4.5 units wide, so anything over a
// 4.75-unit trail hangs it off the screen. The overlap is a symptom of how tight the zoom is, and the fix
// for it is the pet painting BEHIND the hero (see GroveScene) rather than a number that cannot fit.
export const PET_TRAIL_MIN_BODIES = 0.62;
export const PET_TRAIL_MAX_BODIES = 1.1;
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
    // ⚠️ THE PLATE IS SIZED BY THE WORLD NOW, NOT BY THE SCREEN. This one line is the whole fix: with the
    // plate in world units, the grass and the hero shrink together and the zoom is free. See PLATE_UNITS.
    //
    // ⚠️ AND IT MAY BE SHORTER THAN THE VIEWPORT, WHICH IS THE PRICE AND IT IS PAYABLE. On a tall narrow
    // phone a world-sized plate no longer reaches the top of the screen. Measured across all 84 backdrops,
    // the top 8% of 64 of them is flat atmospheric haze a gradient continues invisibly; 14 are middling and
    // 6 are busy enough to show a seam (fernway, boar_run, wirewood_stand, kelpforest, ember_drift,
    // palisade). The scene paints that band with the plate's own top colour -- see hazeH, and the note on
    // .gv-haze in grove-css.js.
    // ⚠️ AND A CEILING AT THE OLD COVER HEIGHT, OR AN ULTRAWIDE PAINTS A MURAL. There the span term wins
    // and unit reaches 50px, so a world-sized plate would be 2090px tall for a 1440px screen -- a 2.04x
    // upscale of a 1536px source, which check-grove.mjs correctly calls soft next to crisp sprites. The
    // plate never needs to be taller than it was before; above this it just goes back to covering, and the
    // hero reads a little MORE proud of the grass there, which is the safe direction to fail in.
    const skyBoxH = Math.min(vh * SKY_HEADROOM, Math.max(vh * MIN_PLATE_OF_VH, PLATE_UNITS * unit));

    const groundPx = GROUND_OF_PLATE * skyBoxH;
    return {
        unit,
        span,
        visibleUnits: vw / unit,
        skyUnits: Math.max(40, vh - groundPx) / unit,
        groundPx,
        skyBoxH,
        // How much bare sky sits above the plate, in px. Zero on anything short and wide, where the
        // world-sized plate still overtops the viewport and gets cropped exactly as it always did.
        hazeH: Math.max(0, vh - skyBoxH),
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
    const trail = Math.min(
        HERO_UNITS * PET_TRAIL_MAX_BODIES,
        Math.max(HERO_UNITS * PET_TRAIL_MIN_BODIES, visibleUnits * PET_TRAIL_OF_FRAME),
    );
    return { trail, slack: Math.max(1.2, trail * 0.35) };
}

// ── ⚠️ THREE RANGES THAT WERE BARE CONSTANTS AND ARE REALLY SHARES OF THE FRAME ────────────────────────
// Found by walking the Grove across every screen size: a portrait phone sees 24-30 world units and a
// landscape one sees 56-68, and all three of these were written as flat numbers tuned on landscape. Each is
// LARGER THAN A PORTRAIT PHONE'S ENTIRE FRAME, so on the orientation most people hold their phone in, each
// one reaches somewhere the player cannot see. Exactly the failure this file's header describes, three more
// times, which is why they now live here.
//
// Every share below is chosen to reproduce the tuned landscape number at 58 units, so nothing changes on the
// screen they were tuned on and the portrait case stops reaching off-camera.

// ⚠️ THE PET MUST FETCH WHAT YOU CAN SEE IT FETCH. 26 units against a 25-unit phone frame meant the pet
// walked off the right-hand edge to collect a drop and came back, measured leaving the frame by 11-78px at
// every portrait size and staying in it at every landscape one. 0.45 is 26/58 -- the landscape feel exactly
// -- and on a phone it is 11 units against a half-frame of 12.5, so the errand happens on screen.
export const PET_FETCH_OF_FRAME = 0.45;
export const PET_FETCH_MIN_BODIES = 1.6;
export const fetchRangeFor = (visibleUnits) =>
    Math.max(HERO_UNITS * PET_FETCH_MIN_BODIES, visibleUnits * PET_FETCH_OF_FRAME);

// ⚠️ A BOSS SHOULD BE NOTICED AS IT COMES INTO VIEW, NOT A SCREEN BEFORE IT. At 34 the bar, the shake, the
// sound and the herald all fired with the boss still about nineteen units past the right edge on a portrait
// phone -- the game announcing something the player cannot look at yet, which reads as a bug rather than as
// a threat. 0.58 is 34/58, so landscape is untouched, and on a phone it lands just as the thing arrives.
export const BOSS_NOTICE_OF_FRAME = 0.58;
export const BOSS_NOTICE_MIN_BODIES = 2;
export const bossNoticeFor = (visibleUnits) =>
    Math.max(HERO_UNITS * BOSS_NOTICE_MIN_BODIES, visibleUnits * BOSS_NOTICE_OF_FRAME);

// ⚠️ AND "THE PET HAS LOST THE PLOT" IS A VIEW DISTANCE BY DEFINITION -- it means off screen and not coming
// back. At a flat 30 on a 25-unit phone the pet was gone for most of a screen before the rescue fired.
export const PET_LOST_OF_FRAME = 0.55;
export const PET_LOST_MIN_BODIES = 2.5;
export const petLostFor = (visibleUnits) =>
    Math.max(HERO_UNITS * PET_LOST_MIN_BODIES, visibleUnits * PET_LOST_OF_FRAME);

// ── ⚠️ THE CAMERA MAY LOOK A LITTLE PAST THE ZONE'S EDGE ───────────────────────────────────────────────
// Clamped hard at 0, the camera stops dead the moment the hero is within half a frame of the start of the
// zone — so he keeps walking while the view does not, and at the far left he renders HALF OFF THE SCREEN.
// Filmed at the edge of Thicket Edge he was a sliver of shoulder and the pet was gone entirely. A player
// fighting anything near either end of a zone hits this, which in a zone whose boss stands at the far end
// is most of the fight that matters.
//
// Letting it overscan a few units costs nothing visually: the backdrop is a tiled strip with no edge, and
// the ground plank is painted by the plate rather than drawn, so there is nothing out there to reveal.
export const CAM_OVERSCAN = 5;

/** The camera's resting x, clamped so the zone's own edges barely scroll into frame. */
export const cameraX = (heroX, face, visibleUnits, zoneW) => Math.max(
    -CAM_OVERSCAN,
    Math.min(zoneW - visibleUnits + CAM_OVERSCAN, heroX + face * lookaheadFor(visibleUnits) - visibleUnits / 2),
);

/**
 * The camera's resting y. Zero while the hero is in the lower part of the sky, so the horizon does not bob
 * on every hop, and never negative because there is nothing below the ground to look at.
 */
export const cameraY = (heroY, skyUnits) =>
    Math.max(0, heroY + HERO_UNITS - skyUnits * CAM_Y_DEADZONE);

/** Where a body at world x renders, in px from the left edge of the frame. */
export const screenX = (x, cam, unit) => (x - cam) * unit;
