// ── THE GROVE'S LOOK ─────────────────────────────────────────────────────────────────────────────────────────
// ⚠️ NO BACKTICKS ANYWHERE IN THESE COMMENTS. This is a template literal, and a backtick inside a CSS comment
// ends it and breaks the build. That has happened eleven times in this repo across two sessions, which is
// why npm run check:css exists — run it after touching this file.
//
// ⚠️ AND NO FILTER ON A SCENE ANCESTOR. A filter or backdrop-filter creates a containing block, and the
// scene positions everything absolutely inside it; a tint on a wrapper would silently re-anchor every body in
// the zone. See filter-creates-containing-block, which cost a whole mobile menu.
export const GROVE_CSS = `
.gv { position: relative; color: #efe7d8; }

/* ── CHROME ──────────────────────────────────────────────────────────────────────────────────── */
.gv-head { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; flex-wrap: wrap; }
.gv-head > b { font-size: 1.05rem; color: #9fe08a; letter-spacing: .02em; }
/* Scrolls rather than wraps: four pills and a title wrapped onto three lines on a phone, which pushed the
   map itself below the fold on the screen whose whole job is the map. */
.gv-head nav { display: flex; gap: 6px; flex: 1; overflow-x: auto; scrollbar-width: none; }
.gv-head nav::-webkit-scrollbar { display: none; }
.gv-head nav button { flex: 0 0 auto; }
.gv-head nav button { padding: 7px 13px; border-radius: 999px; cursor: pointer; font: inherit;
    font-size: 0.82rem; font-weight: 600; color: #cfc6b6; background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.10); }
.gv-head nav button.is-on { background: rgba(159,224,138,0.16); border-color: rgba(159,224,138,0.5); color: #cdf5bd; }
.gv-note { margin: 0 0 10px; padding: 9px 13px; border-radius: 10px; font-size: 0.85rem;
    background: rgba(159,224,138,0.12); border: 1px solid rgba(159,224,138,0.35); color: #d8f5cc; }

/* ── THE MAP ─────────────────────────────────────────────────────────────────────────────────── */
.gv-map { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
.gv-node { position: relative; aspect-ratio: 3/2; border-radius: 14px; overflow: hidden; cursor: pointer;
    border: 1px solid rgba(255,255,255,0.12); background-size: cover; background-position: center;
    display: flex; flex-direction: column; justify-content: flex-end; padding: 10px; text-align: left;
    font: inherit; color: #fff; }
.gv-node::after { content: ""; position: absolute; inset: 0;
    background: linear-gradient(180deg, rgba(8,10,8,0.10), rgba(8,10,8,0.86)); }
.gv-node > * { position: relative; z-index: 1; }
.gv-node.is-locked { background: rgba(255,255,255,0.03); cursor: not-allowed; color: #6f6a60; }
.gv-node.is-clear { border-color: rgba(159,224,138,0.55); }
/* ⚠️ INSIDE THE PADDING, NOT ABOVE IT. This sat at top:-2px in a box with overflow:hidden, so every zone
   number was sliced in half — the node is the positioning context and anything negative is simply cut. */
.gv-node-n { position: absolute; top: 8px; left: 10px; font-size: 0.72rem; font-weight: 800;
    letter-spacing: .14em; color: #9fe08a; text-shadow: 0 1px 3px rgba(0,0,0,0.9); }
.gv-node-name { font-weight: 700; font-size: 0.92rem; text-shadow: 0 1px 3px rgba(0,0,0,0.8); }
.gv-node-bar { display: block; margin-top: 6px; height: 5px; border-radius: 999px;
    background: rgba(255,255,255,0.18); position: relative; }
.gv-node-bar i { display: block; height: 100%; border-radius: 999px; background: #9fe08a; }
.gv-node-bar em { position: absolute; right: 0; top: 7px; font-style: normal; font-size: 0.66rem; color: #cfc6b6; }
.gv-node-lock { font-size: 0.72rem; letter-spacing: .1em; text-transform: uppercase; }

/* ── THE MAP: THE ZONES THEMSELVES, LEFT TO RIGHT ──────────────────────────────
   Luke: "its supposed to have unique areas resembling the node, and the map should be colorful ...
   The maps are horizontal."

   ⚠️ ONE DRAWING CANNOT GIVE TWELVE PLACES AN IDENTITY. The parchment region map was a single
   sepia illustration standing in for all of them, so no panel looked like anywhere in particular and
   the one colourful thing each zone owns - its own painted backdrop - was being thrown away. The map
   is now those twelve paintings in a row, in the direction you actually travel. */
.gv-strip { display: flex; gap: 10px; overflow-x: auto; overflow-y: hidden; padding: 4px 2px 12px;
    scroll-snap-type: x mandatory; -webkit-overflow-scrolling: touch;
    scrollbar-width: thin; scrollbar-color: rgba(159,224,138,0.4) transparent; }
.gv-strip::-webkit-scrollbar { height: 7px; }
.gv-strip::-webkit-scrollbar-thumb { background: rgba(159,224,138,0.35); border-radius: 999px; }

/* A place on the map. Tall rather than wide so several read at once on a phone and the eye runs
   along the journey instead of down a list. */
.gv-area { position: relative; flex: 0 0 auto; width: 188px; height: 250px; scroll-snap-align: start;
    border-radius: 14px; overflow: hidden; cursor: pointer; padding: 0; font: inherit; color: #fff;
    background-size: cover; background-position: center;
    border: 2px solid rgba(255,255,255,0.14); text-align: left;
    transition: transform 160ms ease, border-color 160ms ease; }
.gv-area:not(.is-locked):hover { transform: translateY(-3px); border-color: rgba(159,224,138,0.75); }
.gv-area::after { content: ""; position: absolute; inset: 0;
    background: linear-gradient(180deg, rgba(6,9,6,0.08) 34%, rgba(6,9,6,0.92)); }
.gv-area > * { position: relative; z-index: 1; }

.gv-area-n { position: absolute; top: 9px; left: 9px; width: 30px; height: 30px; border-radius: 50%;
    display: grid; place-items: center; font-size: 0.82rem; font-weight: 800; z-index: 2;
    background: rgba(8,12,8,0.82); color: #9fe08a; border: 1px solid rgba(159,224,138,0.6); }
.gv-area.is-clear { border-color: rgba(217,180,74,0.8); }
.gv-area.is-clear .gv-area-n { color: #e8c764; border-color: rgba(217,180,74,0.8); }

.gv-area-foot { position: absolute; left: 0; right: 0; bottom: 0; padding: 11px 12px 12px; }
.gv-area-foot em { display: block; font-style: normal; font-weight: 700; font-size: 0.92rem;
    line-height: 1.2; color: #f2ead9; text-shadow: 0 1px 4px rgba(0,0,0,0.95); }
.gv-area-meter { display: block; margin-top: 7px; height: 5px; border-radius: 999px;
    background: rgba(255,255,255,0.2); position: relative; }
.gv-area-meter i { display: block; height: 100%; border-radius: 999px; background: #9fe08a; }
.gv-area.is-clear .gv-area-meter i { background: #e8c764; }
.gv-area-meter u { position: absolute; right: 0; top: 7px; text-decoration: none; font-size: 0.66rem;
    letter-spacing: .06em; color: #cfc6b6; }
.gv-area-lock { display: block; margin-top: 6px; font-size: 0.68rem; letter-spacing: .14em;
    text-transform: uppercase; color: #8d8578; }

/* ⚠️ A LOCKED PLACE KEEPS ITS PICTURE AND LOSES ITS COLOUR. Blanking it entirely would make the
   map a row of grey boxes with nothing to walk toward; full colour would spoil twelve backdrops at a
   glance. Drained and darkened says "not yet" while still showing there is somewhere to go. */
.gv-area.is-locked { cursor: not-allowed; border-color: rgba(255,255,255,0.09); }
.gv-area.is-locked::after { background: linear-gradient(180deg, rgba(6,9,6,0.72), rgba(6,9,6,0.95)); }
.gv-area.is-locked { filter: grayscale(0.82) brightness(0.52); }
.gv-area.is-locked .gv-area-n { color: #7d776c; border-color: rgba(255,255,255,0.18); }

/* ── THE SCENE ───────────────────────────────────────────────────────────────────────────────── */
.gv-scene { position: relative; width: 100%; aspect-ratio: 16/10; border-radius: 14px; overflow: hidden;
    background: #0a0d0a; border: 1px solid rgba(255,255,255,0.12); touch-action: manipulation;
    user-select: none; }

/* ── FULL SCREEN ─────────────────────────────────────────────────────────────────────────────────
   Luke: "It should be full screen within reason so mobile and tablet horizontal or vertical true full
   screen for the grove. PC screen also full screen if possible but slightly windowed understandable."

   A fixed overlay rather than the Fullscreen API alone, because the API is the part that is NOT
   dependable: iOS Safari refuses requestFullscreen on anything that is not a video element, which is
   most of the phones that will ever open this. The overlay covers the viewport everywhere, and the
   real API is offered on top of it where it exists (it additionally hides the browser's own chrome).

   100dvh, not 100vh. On mobile 100vh is the LARGEST the viewport ever gets, so with the address bar
   showing, a 100vh element runs under it and the HUD sits off the bottom of the screen. dvh tracks
   the viewport as the bar slides away.

   overscroll-behavior stops the pull-to-refresh that a downward drag would otherwise trigger mid-fight. */
.gv-scene.is-full { position: fixed; inset: 0; z-index: 70;
    width: 100vw; width: 100dvw; height: 100vh; height: 100dvh;
    aspect-ratio: auto; border-radius: 0; border: 0;
    overscroll-behavior: none; }
/* The page behind it must not scroll while it is up. */
.gv-full-lock { overflow: hidden; }
/* ⚠️ AND THE SITE’S OWN FLOATING CHROME HAS TO GO WITH IT. The social bubble and the DM bubble are
   fixed to the bottom-right corner, which in a full-screen zone is INSIDE the play area and on top of it —
   so a thumb reaching for an enemy in that corner opens a chat panel instead of attacking. Hidden only while
   the zone is up; leaving restores them with the body class. */
.gv-full-lock .social-bubble,
.gv-full-lock .dm-bubble-wrap { display: none; }
/* ── ⚠️ THE BACKDROP IS A STRIP, NOT A PLATE ───────────────────────────────────────────────
   Luke: "The map bg doesnt scroll which makes it impossible to feel immersed."

   It was one inset:0 div with a 3:2 painting on it, in a zone up to seven screens wide, so it could not
   scroll at all — and .gv-layer, the div that WAS being translated every frame, was empty. Bodies
   moving across a fixed picture reads as a treadmill.

   Anchored BOTTOM and taller than the scene, so the vertical camera has painted sky to pan into rather
   than a hole. Width is left to the flex children so the strip sizes itself to its tiles. The loop writes
   --gv-sky-h / --gv-sky-w and the transform; see SKY_PX / SKY_PY in GroveScene.js. */
.gv-sky { position: absolute; left: 0; bottom: 0; height: var(--gv-sky-h, 100%);
    display: flex; align-items: stretch; pointer-events: none; will-change: transform; }
/* Each tile is the plate's own aspect ratio at the strip's height, so 100% 100% is cover and stretches
   nothing. */
.gv-sky-t { flex: 0 0 auto; width: var(--gv-sky-w, 100%); height: 100%;
    background-size: 100% 100%; background-position: center; background-repeat: no-repeat; }
/* ⚠️ THIS IS WHAT REMOVES THE SEAM. Every second tile is the painting reflected, so each join meets
   its own mirror image and is continuous. A plain repeat-x would put a hard vertical cut through the
   artwork every tile-width. */
.gv-sky-t:nth-child(even) { transform: scaleX(-1); }

/* ── ⚠️ THE WORLD LAYER ────────────────────────────────────────────────────────────────────────
   Everything that is IN the zone lives inside this one element so the screen shake can move the world
   without moving the interface. The HUD, the boss bar, the streak and Leave are deliberately outside it:
   a shaking interface reads as a broken page rather than as impact, and Leave is the control you most
   need when something has gone wrong.

   ⚠️ NO FILTER MAY EVER GO ON THIS ELEMENT. It already carries a transform, so it is a containing
   block; a filter would additionally flatten every layer of the zone to one tint. See
   filter-creates-containing-block and no-overlay-for-lighting. */
.gv-world { position: absolute; inset: 0; will-change: transform; }

/* Every body is anchored at the scene's GROUND LINE and moved by transform. The loop writes translate3d
   onto these; nothing here animates on its own.

   ⚠️ bottom IS A VARIABLE, NOT 13%. The loop computes it from the plate's RENDERED height every frame:
   background-size cover scales the backdrop to the larger of the two ratios, so on any viewport wider than
   the plate's own 3:2 it renders taller than the scene and is cropped at the top — and 13% of the scene
   stops being the line the grass is painted on. The 13% fallback is what a 16/10 box resolves to anyway,
   so nothing moves before the first frame. */
.gv-foe, .gv-hero, .gv-pet { position: absolute; left: 0; bottom: var(--gv-ground, 13%);
    will-change: transform; }

/* ── ⚠️ A BODY IS SIZED BY ITS HEIGHT, AND IT USED TO BE SIZED BY ONE SHARED WIDTH ──────────────
   .gv-foe was width 8 units with aspect-ratio 1 for every creature in the game, and these sprites fill
   their plates — so a rootrat stood in an 8-unit-tall box against a 7-unit hero and was TALLER THAN THE
   KNIGHT, while an Elderling was exactly the same size as the rat. One number decided the silhouette of a
   twelve-zone bestiary, and scale is the first thing an eye reads: no amount of animation work reaches a
   zone where every animal is the same height as every other animal and all of them match the player.

   So the height comes from GROVE_SIZE per creature, published as --gv-h on each body, and the box is
   square around it because the sprites are square. Vermin come to the knee and the deep forest looms.

   ⚠️ SIZED IN UNITS, NOT PERCENT. The loop publishes --gv-unit; a body expressed in percent of the scene
   keeps its pixel size when the scale zooms and only the gaps between bodies grow, which made a portrait
   phone look like a wide shot of very small animals. */
.gv-foe, .gv-hero, .gv-pet {
    height: calc(var(--gv-h, 7) * var(--gv-unit, 1%));
    width: calc(var(--gv-h, 7) * var(--gv-unit, 1%));
    margin-left: calc(var(--gv-h, 7) * var(--gv-unit, 1%) / -2);
}
.gv-foe { background: none; border: 0; padding: 0; cursor: pointer; }

/* ── ⚠️ THE TRANSITION THAT WAS BREAKING EVERYTHING IS GONE, AND CANNOT COME BACK HERE ─────────
   .gv-foe used to carry transition: opacity 380ms, transform 380ms while the loop writes a transform onto
   it sixty times a second. Three separate complaints came out of that one line:

     · a freshly spawned body starts at transform:none, which is the scene's bottom-left corner, and EASES
       to its real position over 380ms. That is the "floating in from a deterministic spot".
     · every frame's position is interpolated toward instead of set, so all motion is mush.
     · scaleX flipping from 1 to -1 is INTERPOLATED THROUGH ZERO, so the sprite squashed flat and came back
       mirrored every single time a creature turned round. That is the "weird spin", and it looked for all
       the world like a deliberate animation nobody could find.

   ⚠️ SO POSITION AND FACING ARE NOW ON DIFFERENT ELEMENTS. The shell above is translated; .gv-art below
   carries the mirror and every squash. A transition added to either one later cannot interpolate a mirror
   through zero, because no element has both. That is the fix — the deletion alone would have left the trap
   armed for the next person. */
.gv-art { position: absolute; inset: 0; transform-origin: 50% 100%; will-change: transform; }
.gv-art img { width: 100%; height: 100%; object-fit: contain; object-position: 50% 100%; display: block;
    filter: drop-shadow(0 3px 5px rgba(0,0,0,0.45)); }

/* ── THE HIT FLASH ────────────────────────────────────────────────────────────────────────────
   The struck body goes white for about a frame and a half, so the eye is told WHICH thing was hit without
   having to find the damage number.

   ⚠️ IT IS THE SPRITE'S OWN SILHOUETTE, masked by the art itself. A white box over the sprite reads as a
   rendering glitch, and a brightness filter on an already-dark creature barely registers at all. The loop
   writes the opacity; the mask url arrives as a custom property per body. */
.gv-flash { position: absolute; inset: 0; opacity: 0; pointer-events: none;
    background: #fff;
    -webkit-mask-image: var(--gv-art-url); mask-image: var(--gv-art-url);
    -webkit-mask-size: contain; mask-size: contain;
    -webkit-mask-position: 50% 100%; mask-position: 50% 100%;
    -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat; }
/* ⚠️ AND IT HIDES ITSELF WHERE MASKING IS NOT SUPPORTED. An unmasked white div is a white rectangle over
   the creature, which is far worse than no flash — this is the one case where the fallback must be nothing. */
@supports not ((-webkit-mask-image: url(x)) or (mask-image: url(x))) {
    .gv-flash { display: none; }
}

/* ── THE CONTACT SHADOW ───────────────────────────────────────────────────────────────────────
   The only thing on screen that says how high off the floor a body is, which makes it the thing that sells
   "grounded" — a sprite with no shadow is pasted on, and the Grove had none. The loop plants it at the
   SURFACE under the body and shrinks it as the body rises, so a hop leaves its shadow behind on the floor. */
.gv-shadow { position: absolute; left: 50%; bottom: 0; width: 62%; height: 9%;
    margin-left: -31%; border-radius: 50%; pointer-events: none;
    background: radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0.6), rgba(0,0,0,0) 72%); }

/* ── THE SWING ARC ────────────────────────────────────────────────────────────────────────────
   Visible for the 70ms of the strike and nothing else. The strike being the shortest phase of the swing is
   what makes it look fast, and a smear in front of the blade is what makes it look like it went somewhere. */
/* ⚠️ A CRESCENT, NOT A PUFF. The first cut was a soft conic wedge and on film it read as a cloud of dust
   in front of the hero rather than as a blade going through something. The ring mask is tightened to a thin
   band and the gradient to a short bright sweep with a hard leading edge, which is what makes the eye read
   it as a single fast motion instead of an effect fading in. */
.gv-swipe { position: absolute; left: 46%; top: 16%; width: 66%; height: 68%; opacity: 0; pointer-events: none;
    border-radius: 50%; filter: drop-shadow(0 0 4px rgba(255,235,170,0.7));
    background: conic-gradient(from -50deg, rgba(255,255,255,0) 0deg, rgba(255,246,214,0.4) 12deg,
        rgba(255,255,255,0.92) 32deg, rgba(255,255,255,0) 44deg, rgba(255,255,255,0) 360deg);
    -webkit-mask-image: radial-gradient(closest-side, transparent 76%, #000 82%, #000 96%, transparent 99%);
    mask-image: radial-gradient(closest-side, transparent 76%, #000 82%, #000 96%, transparent 99%); }

/* A rare spawn and a boss are lit so you can pick them out. The glow is per-layer on the sprite rather
   than an overlay across the scene — a tint over the whole frame flattens every pixel to one colour.
   See no-overlay-for-lighting. */
.gv-foe.is-rare .gv-art img { filter: drop-shadow(0 0 14px rgba(170,140,255,0.9)) drop-shadow(0 3px 5px rgba(0,0,0,0.5)); }
.gv-foe.is-boss .gv-art img { filter: drop-shadow(0 0 20px rgba(255,170,90,0.65)) drop-shadow(0 6px 10px rgba(0,0,0,0.6)); }
.gv-foe.is-boss .gv-shadow { width: 70%; height: 7%; margin-left: -35%; }

/* The hero and the pet. The gradient stays as the BACKGROUND of the box, so it is what shows through when
   there is no sprite yet — a fallback that is a CSS background cannot itself fail to load. */
.gv-hero { background: radial-gradient(circle at 50% 40%, #ffe28a, #c8872e 62%, transparent 70%); }
.gv-pet { background: radial-gradient(circle at 50% 40%, #9fe08a, #3f7a35 62%, transparent 70%); }
.gv-hero:has(img), .gv-pet:has(img) { background: none; }

/* ── A LEDGE ──────────────────────────────────────────────────────────────────────────────────
   Earth and moss rather than a UI bar, so it belongs to the painted plate instead of sitting on top of it.

   ⚠️ ITS TOP IS THE STANDING SURFACE. bottom plus the loop's negative translate put the box's BOTTOM edge
   on the platform's y, while a body standing on that platform has its FEET on the same y — so the bar was
   drawn in the band ABOVE the floor it represents, covering the shins of anything standing there. The
   negative margin drops the box by its own height. Nothing in the simulation moves. */
/* ⚠️ A SHELF OF EARTH, NOT A BAR. At 1.15 units it was a 25-pixel strip of two flat colours, which on
   film read as a plank floating in mid-air — the single most programmer-art thing in the scene. What makes
   a ledge belong to a painted forest is thickness, a lit mossy lip that OVERHANGS the soil under it, and a
   shadow it casts on what is behind. It is 2.1 units deep now, which is a third of a hero: enough to read
   as ground you are standing on top of rather than a line you are balanced on.

   The rounded ends matter as much as the thickness. A ledge is 13 to 29 units wide against an 18-unit
   frame, so its ends are often the only part on screen, and a square-cut end reads as the strip continuing
   off-frame — exactly the "is this a platform or is this the floor" confusion the width change was meant to
   fix. */
.gv-ledge { position: absolute; left: 0; bottom: var(--gv-ground, 13%);
    height: calc(2.1 * var(--gv-unit, 1%)); margin-bottom: calc(-2.1 * var(--gv-unit, 1%));
    /* ⚠️ THE CORNER RADIUS IS IN UNITS, NOT PERCENT. A percentage radius is a share of the element's own
       WIDTH, and a ledge is 13 to 29 units wide — so 40% drew ends that were 5 to 12 units of ellipse and
       every ledge came out as a capsule. In units the end is the same small rounded corner whatever the
       ledge's length, which is the only way a long one and a short one read as the same kind of object. */
    border-radius: calc(0.7 * var(--gv-unit, 1%)) calc(0.7 * var(--gv-unit, 1%))
        calc(0.35 * var(--gv-unit, 1%)) calc(0.35 * var(--gv-unit, 1%));
    pointer-events: none; will-change: transform;
    background:
        linear-gradient(180deg, #4f7030 0 26%, #4a3a26 26% 44%, #35291c 44% 82%, #241b13 82% 100%),
        #35291c;
    box-shadow: 0 6px 12px rgba(0,0,0,0.55), inset 0 -3px 6px rgba(0,0,0,0.5); }
/* ⚠️ THE MOSS IS A LAYER, NOT A HIGHLIGHT. The first pass tried to do the lit top edge with an inset
   box-shadow and a pale wash, and against a dark bramble backdrop the whole ledge came out as a flat cream
   lozenge — the lit edge won and ate the earth under it. A ledge needs its top band to be a real colour of
   its own, which also gives it somewhere for the grass to sit. */
/* ⚠️ AND THE MOSS IS DESATURATED. #86b94c against the Mothlight's blue night read as lime plastic — a
   UI element lying in the forest. Ground cover in these plates is olive, not spring green, and a surface
   the player stands on has to belong to the painting behind it rather than announce itself. */
.gv-ledge::after { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 26%;
    border-radius: inherit;
    background: linear-gradient(180deg, #6a8f40, #46632a);
    box-shadow: 0 1px 0 rgba(0,0,0,0.4); }

/* ── LOOT ON THE FLOOR ────────────────────────────────────────────────────────────────────────
   Luke: "when they drop loot, it needs to be like a dopamine inducing explosion of like what they drop and
   it should hang out on the ground for a while. You should actually see the sprite and the name of it
   before it gets sucked up to your character."

   ⚠️ THERE WAS NO LOOT ON THE FLOOR AT ALL BEFORE THIS. A kill floated one line of text at the corpse
   and the drop was deleted the moment you walked within seven units of where it had been — nothing fell,
   nothing rested, nothing was ever collected. The three stages ARE the reward: the throw says you earned
   something, the rest lets you read what it is, and the draw-in is the collecting of it.

   Luke: the items should use the sprites for the items. So each drop is now its own painted object and the
   tier survives as the COLOUR OF ITS GLOW — a deep part still reads as a deep part across a dark floor,
   which is the whole job the drawn stone was doing. The stone itself stays below as the fallback. */
/* ⚠️ 3.2 UNITS, NOT 2.2. A hero is 7, so the drawn stone was about 3% of the frame on a phone — fine for a
   shape that was nothing but a silhouette, and far too small for a painted object with a form to read. The
   sprites are alpha-trimmed at generation precisely so this number buys painted pixels rather than margin. */
.gv-drop { position: absolute; left: 0; bottom: var(--gv-ground, 13%);
    width: calc(3.2 * var(--gv-unit, 1%)); height: calc(3.2 * var(--gv-unit, 1%));
    margin-left: calc(-1.6 * var(--gv-unit, 1%));
    pointer-events: none; will-change: transform; }
/* ⚠️ object-position: bottom, OR EVERY DROP FLOATS. contain centres the image inside the box, so a wide
   flat thing like the moss mat would hang half a unit above the ground it is supposed to be lying on while
   a tall thing like the antler sat correctly — the bug would have looked like a physics bug and been in the
   stylesheet. The box bottom IS the item's y, so seating the art there puts it on the floor. See
   sprite-floats-object-fit-contain. */
.gv-drop img { position: absolute; inset: 0; width: 100%; height: 100%;
    object-fit: contain; object-position: bottom;
    filter: drop-shadow(0 0 8px var(--gv-glow, rgba(255,255,255,0.35)))
        drop-shadow(0 2px 3px rgba(0,0,0,0.8));
    animation: gvBob 1500ms ease-in-out infinite; }
/* ⚠️ A CUT STONE, NOT A ROUNDED RECTANGLE. The first pass was a soft-cornered box in a pale tier colour,
   which on a brown forest path read as a blank sticky note lying in the grass — the one thing a reward must
   never look like. A hard-edged gem silhouette with a bright facet and a dark rim reads as an OBJECT at
   48 pixels, which is all the size there is to work with. See no-pity-progress-bars for the same instinct:
   the cheap version of a reward is worse than none. */
/* ⚠️ A DIAMOND, AND THE HIGHLIGHT IS A FACET NOT A WASH. The pentagon read as a blank house-shaped
   sticker, and a 75%-white sheet over the top half of a 48-pixel object leaves no room for the tier colour
   to say anything at all — every tier came out the same pale grey. The diamond is the one silhouette every
   player already reads as "pick this up", and keeping the highlight to one hard-edged facet is what makes
   it look faceted rather than lit. */
.gv-drop i { position: absolute; inset: 0;
    clip-path: polygon(50% 0%, 88% 44%, 50% 100%, 12% 44%);
    background:
        linear-gradient(118deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.5) 26%, rgba(255,255,255,0) 27%),
        linear-gradient(160deg, var(--gv-t1, #cfd6dd), var(--gv-t2, #8e9aa6));
    filter: drop-shadow(0 0 8px var(--gv-glow, rgba(255,255,255,0.35)))
        drop-shadow(0 2px 3px rgba(0,0,0,0.8));
    animation: gvBob 1500ms ease-in-out infinite; }
.gv-drop.t1 { --gv-t1: #c9b188; --gv-t2: #7a6540; --gv-glow: rgba(201,177,136,0.35); }
.gv-drop.t2 { --gv-t1: #b6d3a0; --gv-t2: #6b8f57; --gv-glow: rgba(182,211,160,0.32); }
.gv-drop.t3 { --gv-t1: #a7cbe0; --gv-t2: #577f96; --gv-glow: rgba(167,203,224,0.34); }
.gv-drop.t4 { --gv-t1: #c3b0e8; --gv-t2: #6e5aa0; --gv-glow: rgba(195,176,232,0.36); }
.gv-drop.t5 { --gv-t1: #f2cf8a; --gv-t2: #b48a35; --gv-glow: rgba(242,207,138,0.4); }
.gv-drop.t6 { --gv-t1: #ffd0e2; --gv-t2: #c4588f; --gv-glow: rgba(255,208,226,0.45); }
/* An emblem is the rare thing in the pile and has to be picked out of it at a glance: a different
   silhouette entirely (a star, not a stone) and a much louder glow. Luke: "Emblems are rare." */
.gv-drop.is-emblem i {
    clip-path: polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%);
    background: linear-gradient(160deg, #fff6d8, #ffc14a);
    filter: drop-shadow(0 0 14px rgba(255,200,110,0.95)) drop-shadow(0 2px 3px rgba(0,0,0,0.7)); }
.gv-drop.is-rare i { animation: gvBob 1500ms ease-in-out infinite, gvSheen 2200ms linear infinite; }
/* The painted emblem keeps the loud halo the gold star had. The silhouette is the sprite's job now, so
   this is only the glow that picks it out of a pile of six ordinary parts. */
.gv-drop.is-emblem img {
    filter: drop-shadow(0 0 14px rgba(255,200,110,0.95)) drop-shadow(0 2px 3px rgba(0,0,0,0.7)); }
.gv-drop.is-rare img { animation: gvBob 1500ms ease-in-out infinite, gvSheen 2200ms linear infinite; }
/* An emblem's name is longer than a part's and it lands in the same place, so it gets the room to say it. */
.gv-drop.is-emblem b { color: #ffe9b0; border-color: rgba(255,208,120,0.45); }
/* The name, up long enough to read and then gone — a floor full of old loot must not become a wall of
   text over the fight. The loop writes the opacity, so this is only how it looks. */
.gv-drop b { position: absolute; left: 50%; bottom: 112%; transform: translateX(-50%);
    white-space: nowrap; font-size: 0.68rem; font-weight: 700; letter-spacing: .01em;
    padding: 2px 7px; border-radius: 999px; opacity: 0;
    color: #f3ead9; background: rgba(6,10,6,0.78); border: 1px solid rgba(255,255,255,0.18);
    text-shadow: 0 1px 3px rgba(0,0,0,0.9); }
@keyframes gvBob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-14%); } }
@keyframes gvSheen { 0%, 100% { filter: brightness(1); } 50% { filter: brightness(1.45); } }

/* ── PARTICLES AND NUMBERS ────────────────────────────────────────────────────────────────────
   Created and destroyed by hand into this layer rather than rendered by React — they are born and dead
   inside half a second, several per swing, and nothing ever updates one. */
.gv-fx { position: absolute; inset: 0; pointer-events: none; }

/* A thrown damage number. ⚠️ NOT .gv-pop — THAT CLASS IS THE UNLOCK CELEBRATION, which is a fixed
   full-screen scrim; a damage number wearing it would black out the zone once per hit. Two things called
   pop in one stylesheet is how that happens. */
.gv-num { position: absolute; left: 0; bottom: var(--gv-ground, 13%); font-weight: 800; font-size: 0.95rem;
    white-space: nowrap; pointer-events: none; will-change: transform, opacity;
    text-shadow: 0 2px 4px rgba(0,0,0,0.95), 0 0 10px rgba(0,0,0,0.6); }
.gv-num.is-hit { color: #ffe9a8; }
.gv-num.is-crit { color: #ffb14a; font-size: 1.5rem; letter-spacing: -.01em;
    text-shadow: 0 2px 5px rgba(0,0,0,0.95), 0 0 16px rgba(255,150,40,0.8); }
.gv-num.is-took { color: #ff6b6b; font-size: 1.1rem; }
.gv-num.is-heal { color: #7cffb2; }
.gv-num.is-loot { color: #cdf5bd; font-size: 0.78rem; font-weight: 700; }

.gv-spark { position: absolute; left: 0; bottom: var(--gv-ground, 13%);
    width: calc(0.5 * var(--gv-unit, 1%)); height: calc(0.5 * var(--gv-unit, 1%));
    margin: 0 0 calc(-0.25 * var(--gv-unit, 1%)) calc(-0.25 * var(--gv-unit, 1%));
    border-radius: 50%; pointer-events: none; will-change: transform, opacity;
    background: #fff6cf; box-shadow: 0 0 6px 2px rgba(255,220,130,0.8); }
.gv-spark.is-crit { background: #fff; box-shadow: 0 0 9px 3px rgba(255,170,60,0.95); }
/* Dust is bigger, slower and has no light of its own — it is displaced earth, not energy. */
.gv-spark.is-dust { width: calc(1.1 * var(--gv-unit, 1%)); height: calc(1.1 * var(--gv-unit, 1%));
    margin: 0 0 calc(-0.55 * var(--gv-unit, 1%)) calc(-0.55 * var(--gv-unit, 1%));
    background: rgba(170,152,120,0.55); box-shadow: none; }

/* The ring an attack leaves when it resolves. It is the difference between damage arriving and damage
   LANDING somewhere — the player needs to see the place the thing they dodged went off. */
.gv-boom { position: absolute; left: 0; bottom: var(--gv-ground, 13%);
    width: calc(9 * var(--gv-unit, 1%)); height: calc(3 * var(--gv-unit, 1%));
    margin: 0 0 calc(-1.5 * var(--gv-unit, 1%)) calc(-4.5 * var(--gv-unit, 1%));
    border-radius: 50%; pointer-events: none; will-change: transform, opacity;
    border: 2px solid rgba(255,150,100,0.9); }
.gv-boom.is-sweep { border-color: rgba(255,215,120,0.9); }
.gv-boom.is-volley { border-color: rgba(190,160,255,0.9); }

/* ── ⚠️ THE TELEGRAPHS ────────────────────────────────────────────────────────────────────────
   Luke asked for attacks that "telecast where they will damage". A band on the ground where the attack
   will land, filling left to right over the attack's own wind-up, so what is on screen IS the window you
   have to leave. The duration comes from the attack, set inline, not guessed at here.

   ⚠️ AN ELLIPSE ON THE FLOOR, NOT A BAR. A rectangle at the ground line reads as a progress meter, which
   is the one thing a danger zone must not read as; a flattened ellipse reads as a patch of ground. And the
   loop now places it at the y of the creature that made it, so an attack from a ledge is announced on that
   ledge rather than painted on the floor underneath while hitting you through it.

   ⚠️ WIDTH IS SET IN PIXELS BY THE LOOP, NOT scaleX. Scaling a 2r-wide box would stretch its border with
   it, so a wide sweep would have a four-pixel edge and a slam a one-pixel one. */
/* ⚠️ LOUD, BECAUSE THE FIRST VERSION WAS INVISIBLE. A two-pixel 40%-white rim on a painted forest floor
   is nothing: filmed at 25ms intervals the band under the hero's feet could barely be found in the frame,
   and a tell the player does not SEE is the same as no tell at all — which is the whole defect this feature
   was supposed to have fixed. A danger zone has to win against the busiest art in the game, so: a dark
   ground wash to separate it from the grass, a thick saturated rim, and a glow that spills past the edge.

   The brightness is deliberately uncomfortable. It is on screen for well under a second and it is the only
   warning the player gets. */
.gv-tel { position: absolute; left: 0; bottom: var(--gv-ground, 13%);
    height: calc(3.6 * var(--gv-unit, 1%)); margin-bottom: calc(-1.8 * var(--gv-unit, 1%));
    border-radius: 50%; pointer-events: none; overflow: hidden; will-change: transform;
    border: 3px solid rgba(255,255,255,0.75); background: rgba(8,3,2,0.55);
    box-shadow: 0 0 14px 3px rgba(255,90,60,0.5), inset 0 0 12px rgba(0,0,0,0.6);
    animation: gvTelPulse 300ms ease-in-out infinite alternate; }
.gv-tel::after { content: ""; position: absolute; inset: 0; transform-origin: 0 50%;
    animation: gvTel linear forwards; animation-duration: inherit; }
/* The rim pulses so a telegraph that has only just appeared is still caught by peripheral vision — the eye
   is drawn to change far more reliably than to colour. */
@keyframes gvTelPulse { from { filter: brightness(0.85); } to { filter: brightness(1.3); } }
.gv-tel.is-slam { border-color: rgba(255,140,105,0.95); box-shadow: 0 0 16px 4px rgba(255,80,50,0.6), inset 0 0 12px rgba(0,0,0,0.6); }
.gv-tel.is-slam::after { background: linear-gradient(90deg, rgba(255,90,60,0.75), rgba(255,160,100,0.95)); }
.gv-tel.is-sweep { height: calc(2.8 * var(--gv-unit, 1%)); margin-bottom: calc(-1.4 * var(--gv-unit, 1%));
    border-color: rgba(255,225,135,0.95); box-shadow: 0 0 16px 4px rgba(255,190,60,0.55), inset 0 0 12px rgba(0,0,0,0.6); }
.gv-tel.is-sweep::after { background: linear-gradient(90deg, rgba(255,180,60,0.7), rgba(255,235,140,0.92)); }
.gv-tel.is-volley { border-color: rgba(200,175,255,0.95); box-shadow: 0 0 16px 4px rgba(150,110,255,0.6), inset 0 0 12px rgba(0,0,0,0.6); }
.gv-tel.is-volley::after { background: linear-gradient(90deg, rgba(140,100,255,0.72), rgba(210,185,255,0.95)); }
@keyframes gvTel { from { transform: scaleX(0); } to { transform: scaleX(1); } }

/* ── THE SCREEN'S OWN REACTION ────────────────────────────────────────────────────────────────
   A red wash at the edges on being hit, and a slow pulse while nearly dead. The one piece of feedback a
   player cannot miss while watching their own character instead of the bar — and in a zone where dying
   sends you back to town, "I did not notice I was low" is the complaint it prevents.

   ⚠️ A VIGNETTE, NOT A TINT. It is clear in the middle on purpose: a full-frame red overlay would flatten
   the whole zone to one colour, which is the mistake no-overlay-for-lighting is about, and it would hide
   the telegraph you are trying to step out of. */
.gv-vign { position: absolute; inset: 0; z-index: 3; opacity: 0; pointer-events: none;
    background: radial-gradient(ellipse at 50% 50%, rgba(255,0,0,0) 46%, rgba(185,12,12,0.62) 100%);
    box-shadow: inset 0 0 70px rgba(170,0,0,0.38); }

/* The boss reward panel rides the area-unlock panel's shape, with room for the sprite and a line for the
   hyper-rare. */
.gv-won div { max-width: 320px; }
.gv-won img { width: 120px; height: 120px; object-fit: contain; display: block; margin: 6px auto 2px; }
.gv-won-loot { margin: 2px 0 0; font-size: 0.82rem; color: #d8e6cf; line-height: 1.5; }
.gv-hyper { display: block; margin-top: 8px; font-size: 1rem; color: #ffd98a;
    text-shadow: 0 0 14px rgba(255,200,110,0.55); }

/* ── ⚠️ THE TELEGRAPHS ──────────────────────────────────────────────────────────────────────────────
   These did not exist. The wind-up was simulated from the first version of the scene and drawn by nothing, so
   damage landed after a pause and the player was given no reason why. Luke asked for attacks that "telecast
   where they will damage", and a telegraph you cannot see is just a slow hit.

   A band on the ground at the place the attack will land. The fill sweeps left to right over the attack's own
   wind-up, so what is on screen IS the window you have to leave - the animation duration is set inline from
   the attack, not guessed at here.

   ⚠️ WIDTH IS SET IN PIXELS BY THE LOOP, NOT scaleX. Scaling a 2r-wide box would stretch its border and
   its fill with it, so a wide sweep would have a four-pixel edge and a slam a one-pixel one. */
.gv-tel { position: absolute; left: 0; bottom: calc(var(--gv-ground, 13%) - 10px); height: 12px; border-radius: 3px;
    pointer-events: none; overflow: hidden; will-change: transform;
    border: 1px solid rgba(255,255,255,0.35); background: rgba(0,0,0,0.3); }
.gv-tel::after { content: ""; position: absolute; inset: 0; transform-origin: 0 50%;
    animation: gvTel linear forwards; animation-duration: inherit; }
.gv-tel.is-slam { border-color: rgba(255,120,90,0.75); }
.gv-tel.is-slam::after { background: linear-gradient(90deg, rgba(255,90,60,0.35), rgba(255,140,80,0.75)); }
.gv-tel.is-sweep { height: 9px; border-color: rgba(255,210,110,0.7); }
.gv-tel.is-sweep::after { background: linear-gradient(90deg, rgba(255,180,60,0.3), rgba(255,225,120,0.65)); }
.gv-tel.is-volley { height: 14px; border-color: rgba(170,140,255,0.8); }
.gv-tel.is-volley::after { background: linear-gradient(90deg, rgba(140,100,255,0.35), rgba(200,170,255,0.8)); }
@keyframes gvTel { from { transform: scaleX(0); } to { transform: scaleX(1); } }

/* ⚠️ .gv-float IS GONE. It was the only damage feedback the Grove had: a span appended to the scene
   at a fixed left: 50%, bottom: 40% with a CSS keyframe moving it 34px up. So every number in the game
   appeared in the MIDDLE OF THE SCREEN regardless of what had been hit or where it was standing, four at
   a time during a volley, stacked on top of each other. A damage number has to be at the thing it
   describes or it is a HUD element pretending to be feedback. See .gv-num above, which is thrown as a
   physics body from the point of contact. */

/* Below the HUD row rather than tucked against it - the name and the health bar are two lines and they were
   crowding the hp bar and the kill count. */
.gv-boss { position: absolute; top: calc(40px + env(safe-area-inset-top)); left: 50%; transform: translateX(-50%); width: 70%;
    text-align: center; pointer-events: none; }
.gv-boss b { display: block; font-size: 0.8rem; letter-spacing: .1em; text-transform: uppercase;
    color: #e5d2ff; text-shadow: 0 2px 4px rgba(0,0,0,0.9); margin-bottom: 4px; }
.gv-boss span { position: relative; display: block; height: 13px; border-radius: 999px;
    background: rgba(0,0,0,0.6); border: 1px solid rgba(197,160,255,0.55); overflow: hidden; }
.gv-boss u, .gv-boss i { position: absolute; left: 0; top: 0; height: 100%; display: block; }
/* Same chase pair as the player's bar, and for the same reason — against 7,200 hit points a boss bar with
   no ghost layer barely appears to move at all, which makes a good hit feel like a bad one. */
.gv-boss u { background: linear-gradient(90deg, #f0e2ff, #fff); }
.gv-boss i { background: linear-gradient(90deg, #a982ff, #e0c6ff); }

/* The death screen. Covers the zone outright rather than tinting it: a dimmed but still-moving scene reads
   as a stutter, and the one thing it must say clearly is that the run is over and you are going somewhere. */
.gv-dead { position: absolute; inset: 0; z-index: 5; display: flex; align-items: center; justify-content: center;
    background: rgba(6,8,6,0.82); text-align: center; animation: gvDead 320ms ease-out both; }
.gv-dead b { display: block; font-size: 1.5rem; letter-spacing: .04em; color: #ff8a7a;
    text-shadow: 0 2px 10px rgba(0,0,0,0.9); }
.gv-dead span { display: block; margin-top: 8px; font-size: 0.88rem; color: #cfc6b6; }
@keyframes gvDead { from { opacity: 0; } to { opacity: 1; } }

/* Above the ground line rather than across it — the HUD was drawn straight over the row of enemies
   standing on the floor, which is the one row you need to be able to see and tap. */
/* ⚠️ SAFE-AREA INSETS. Full screen on a phone puts this row under the notch and the rounded corners;
   Leave is the control you most need when something has gone wrong, so it must never be the thing tucked
   behind a camera cutout. env() resolves to 0 everywhere that has no cutout, so this costs nothing. */
.gv-hud { position: absolute; display: flex; align-items: center; gap: 10px; pointer-events: none;
    left: calc(10px + env(safe-area-inset-left));
    right: calc(10px + env(safe-area-inset-right));
    top: calc(10px + env(safe-area-inset-top)); }
/* ── THE CHASE BAR ────────────────────────────────────────────────────────────────────────────
   Luke: "how it shows their health plummeting with their like intermediate red lerp bar."

   Two layers. The front one IS the health and moves instantly; the one behind holds where the health used
   to be and catches up after a beat, so the bright strip between them is the SIZE of the chunk just taken
   off rather than something inferred from two numbers.

   ⚠️ NO CSS TRANSITION ON EITHER OF THEM. The loop writes both widths every frame (see stepChase), and a
   transition on top of a per-frame write is the .gv-foe bug again in a different place: the easing fights
   the simulation and the result is mush with a lag on it. The 180ms transition that used to be on the fill
   is exactly why a big hit read as the bar sliding rather than as a bite being taken out of it. */
.gv-hp { position: relative; flex: 0 0 38%; height: 11px; border-radius: 999px; background: rgba(0,0,0,0.62);
    border: 1px solid rgba(255,255,255,0.2); overflow: hidden; }
.gv-hp u, .gv-hp i { position: absolute; left: 0; top: 0; height: 100%; display: block; }
.gv-hp u { background: linear-gradient(90deg, #ffd0c0, #fff1e6); }
.gv-hp i { background: linear-gradient(90deg, #d8402f, #ff8a6b); }
.gv-hud b { font-size: 0.78rem; color: #efe7d8; text-shadow: 0 2px 4px rgba(0,0,0,0.9); }
.gv-leave { margin-left: auto; pointer-events: auto; padding: 6px 14px; border-radius: 999px; cursor: pointer;
    font: inherit; font-size: 0.78rem; font-weight: 700; color: #efe7d8;
    background: rgba(0,0,0,0.55); border: 1px solid rgba(255,255,255,0.22); }

/* ── THE STREAK ───────────────────────────────────────────────────────────────────────────────
   ⚠️ IT PAYS NOTHING, DELIBERATELY. The Grove is a kill loop with no daily cap, so a reward multiplier
   for killing faster would be a faucet with a pedal on it — see COMBO_WINDOW_MS in grove-juice.js. What a
   streak is FOR here is the rhythm: a number that climbs, a hit sound that rises in pitch with it, and a
   word at the rungs. That is most of where a grinder's dopamine actually comes from and it costs the
   economy nothing at all.

   Top right, under the HUD row, out of the thumb's way on a phone. Empty until there is a streak, so it
   is not one more permanent number on the screen. */
.gv-combo { position: absolute; z-index: 4; pointer-events: none;
    right: calc(14px + env(safe-area-inset-right)); top: calc(44px + env(safe-area-inset-top));
    font-size: 1.05rem; font-weight: 800; letter-spacing: .02em; color: #ffe9a8;
    text-shadow: 0 2px 5px rgba(0,0,0,0.95); opacity: 0; transform: scale(.8);
    transition: opacity 140ms ease, transform 140ms cubic-bezier(.2,1.7,.4,1); }
.gv-combo.is-on { opacity: 1; transform: scale(1); }
.gv-combo.is-hot { color: #ffb14a; text-shadow: 0 2px 5px rgba(0,0,0,0.95), 0 0 18px rgba(255,150,40,0.75); }

/* ── ⚠️ THE UNLOCK POP ─────────────────────────────────────────────────────────────────────
   Luke: "a dopamine pop middle of the screen for a duration."

   FIXED, not absolute. The zone scene is a full-screen portal on <body> and the map is a scrolling
   strip; an absolutely positioned overlay would land in the middle of whichever of those happened to
   be its offset parent rather than in the middle of the SCREEN, which is the one thing this has to do.

   The card scales up past its resting size and settles back — an overshoot is what separates a
   reward from a notification. */
.gv-pop { position: fixed; inset: 0; z-index: 200; display: grid; place-items: center;
    background: rgba(4,6,4,0.72); animation: gvPopIn 180ms ease-out both; cursor: pointer; padding: 20px; }
.gv-pop-card { position: relative; text-align: center; padding: 30px 34px 26px; border-radius: 22px;
    background: linear-gradient(rgba(22,32,20,0.98), rgba(10,16,10,0.98));
    border: 2px solid rgba(159,224,138,0.55);
    box-shadow: 0 26px 70px rgba(0,0,0,0.85), 0 0 80px rgba(159,224,138,0.22);
    animation: gvPopCard 520ms cubic-bezier(.2,1.5,.4,1) both; max-width: 340px; }
/* A slow turn of light behind the card. Sits UNDER the content and never takes a tap. */
.gv-pop-rays { position: absolute; left: 50%; top: 46%; width: 460px; height: 460px; margin: -230px 0 0 -230px;
    border-radius: 50%; pointer-events: none; z-index: 0; opacity: .5;
    background: conic-gradient(from 0deg, rgba(159,224,138,0.32) 0 6deg, transparent 6deg 30deg,
        rgba(159,224,138,0.32) 30deg 36deg, transparent 36deg 60deg, rgba(159,224,138,0.32) 60deg 66deg,
        transparent 66deg 90deg, rgba(159,224,138,0.32) 90deg 96deg, transparent 96deg 120deg,
        rgba(159,224,138,0.32) 120deg 126deg, transparent 126deg 150deg, rgba(159,224,138,0.32) 150deg 156deg,
        transparent 156deg 180deg, rgba(159,224,138,0.32) 180deg 186deg, transparent 186deg 210deg,
        rgba(159,224,138,0.32) 210deg 216deg, transparent 216deg 240deg, rgba(159,224,138,0.32) 240deg 246deg,
        transparent 246deg 270deg, rgba(159,224,138,0.32) 270deg 276deg, transparent 276deg 300deg,
        rgba(159,224,138,0.32) 300deg 306deg, transparent 306deg 330deg, rgba(159,224,138,0.32) 330deg 336deg,
        transparent 336deg 360deg);
    mask-image: radial-gradient(circle, #000 20%, transparent 70%);
    -webkit-mask-image: radial-gradient(circle, #000 20%, transparent 70%);
    animation: gvRays 14s linear infinite; }
.gv-pop-card > *:not(.gv-pop-rays) { position: relative; z-index: 1; }
.gv-pop-kicker { display: block; font-size: 0.7rem; letter-spacing: .26em; text-transform: uppercase;
    color: #9fe08a; }
.gv-pop-name { display: block; margin: 8px 0 16px; font-size: 1.7rem; line-height: 1.1; color: #f2ead9;
    text-shadow: 0 2px 14px rgba(0,0,0,0.9); }
.gv-pop-art { display: block; width: 100%; aspect-ratio: 16/10; border-radius: 14px;
    background-size: cover; background-position: center;
    border: 1px solid rgba(255,255,255,0.16); box-shadow: 0 10px 28px rgba(0,0,0,0.7); }
.gv-pop-go { display: block; margin-top: 16px; font-size: 0.72rem; letter-spacing: .16em;
    text-transform: uppercase; color: #9b9487; }
@keyframes gvPopIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes gvPopCard { from { opacity: 0; transform: scale(.72); } to { opacity: 1; transform: scale(1); } }
@keyframes gvRays { to { transform: rotate(360deg); } }

.gv-unlock { position: absolute; inset: 0; z-index: 30; display: grid; place-items: center;
    background: rgba(6,10,6,0.86); cursor: pointer; }
.gv-unlock > div { text-align: center; padding: 26px 32px; border-radius: 18px;
    background: linear-gradient(180deg, rgba(30,46,26,0.96), rgba(12,18,12,0.96));
    border: 1px solid rgba(159,224,138,0.5); box-shadow: 0 0 44px rgba(159,224,138,0.28);
    animation: gvPop 420ms cubic-bezier(.2,1.5,.4,1) both; }
.gv-unlock span { display: block; font-size: 0.68rem; letter-spacing: .16em; text-transform: uppercase; color: #9db18f; }
.gv-unlock b { display: block; font-size: 1.3rem; color: #cdf5bd; margin: 6px 0 14px; }
.gv-unlock button { padding: 8px 22px; border-radius: 999px; border: none; cursor: pointer; font: inherit;
    font-weight: 800; background: linear-gradient(180deg, #b9f0a4, #6fb95c); color: #16280f; }
@keyframes gvPop { from { opacity: 0; transform: scale(0.84) translateY(10px); } to { opacity: 1; transform: none; } }

/* ── BAG, BANK, TABLET ───────────────────────────────────────────────────────────────────────── */
.gv-bag { display: flex; flex-direction: column; gap: 16px; }
.gv-bag h4 { margin: 0 0 8px; font-size: 0.86rem; letter-spacing: .06em; text-transform: uppercase; color: #9fe08a; }
.gv-bag h4 i { font-style: normal; color: #8d8577; margin-left: 6px; }
.gv-slots { display: grid; grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); gap: 8px; }
.gv-slot { display: flex; flex-direction: column; gap: 2px; padding: 10px; border-radius: 10px; cursor: pointer;
    text-align: left; font: inherit; color: #efe7d8; background: rgba(255,255,255,0.045);
    border: 1px solid rgba(255,255,255,0.10); }
.gv-slot b { font-size: 0.84rem; }
.gv-slot span { font-size: 1.05rem; font-weight: 800; color: #9fe08a; }
.gv-slot em { font-style: normal; font-size: 0.68rem; color: #8d8577; }
.gv-slot.is-on { border-color: rgba(159,224,138,0.6); background: rgba(159,224,138,0.12); }
.gv-slot.is-on em { color: #9fe08a; }
/* A tool not yet made: shown so the ladder is visible before you can climb it. */
.gv-slot.is-dim { opacity: 0.55; }
.gv-belt { color: #9fe08a !important; }
.gv-tablet { padding: 14px; border-radius: 12px; background: rgba(255,255,255,0.035);
    border: 1px solid rgba(255,255,255,0.10); }
.gv-tablet ul { margin: 8px 0 0; padding-left: 18px; font-size: 0.82rem; color: #cfc6b6; }

/* ── THE WORKBENCH ───────────────────────────────────────────────────────────────────────────── */
.gv-bench { display: flex; flex-direction: column; gap: 10px; }
.gv-recipe { display: flex; align-items: center; gap: 14px; padding: 14px; border-radius: 12px;
    background: rgba(255,255,255,0.035); border: 1px solid rgba(255,255,255,0.10); }
.gv-recipe.is-ready { border-color: rgba(159,224,138,0.55); background: rgba(159,224,138,0.08); }
.gv-recipe > div { flex: 1; min-width: 0; }
.gv-recipe b { font-size: 0.95rem; }
.gv-recipe p { margin: 3px 0 6px; font-size: 0.8rem; color: #9d9486; }
.gv-recipe ul { margin: 0; padding: 0; list-style: none; display: flex; flex-wrap: wrap; gap: 4px 12px;
    font-size: 0.78rem; color: #8d8577; }
.gv-recipe li.is-have { color: #9fe08a; }
.gv-recipe li span { opacity: 0.75; }
.gv-recipe button { padding: 9px 18px; border-radius: 999px; border: none; cursor: pointer; font: inherit;
    font-weight: 700; font-size: 0.82rem; background: rgba(255,255,255,0.09); color: #cfc6b6; }
.gv-recipe.is-ready button { background: linear-gradient(180deg, #b9f0a4, #6fb95c); color: #16280f; }
.gv-recipe button:disabled { opacity: 0.55; cursor: default; }

/* ── EMBLEMS ─────────────────────────────────────────────────────────────────────────────────── */
.gv-emblems { display: flex; flex-direction: column; gap: 14px; }
.gv-eslots { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; }
.gv-eslot { aspect-ratio: 1; border-radius: 12px; display: grid; place-items: center; text-align: center;
    background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.12); font-size: 0.68rem;
    color: #8d8577; padding: 6px; }
.gv-eslot.is-sealed { border-style: dashed; opacity: 0.5; }
.gv-eslot button { background: none; border: 0; cursor: pointer; font: inherit; color: #efe7d8;
    display: flex; flex-direction: column; gap: 2px; align-items: center; }
.gv-eslot button b { font-size: 0.8rem; }
.gv-eslot button span { font-size: 0.66rem; }
.gv-eslot button em { font-style: normal; font-size: 0.6rem; color: #8d8577; }
.gv-elist { display: flex; flex-direction: column; gap: 8px; }
.gv-em { display: flex; align-items: center; gap: 12px; padding: 11px 13px; border-radius: 11px;
    background: rgba(255,255,255,0.035); border: 1px solid rgba(255,255,255,0.10); }
.gv-em > b { font-size: 0.9rem; letter-spacing: .04em; min-width: 62px; }
.gv-em > div { flex: 1; min-width: 0; }
.gv-em p { margin: 2px 0; font-size: 0.8rem; color: #cfc6b6; }
.gv-em p em { font-style: normal; color: #ffcf6a; }
.gv-em small { font-size: 0.7rem; color: #8d8577; }
.gv-em button { padding: 7px 15px; border-radius: 999px; border: none; cursor: pointer; font: inherit;
    font-size: 0.76rem; font-weight: 700; background: rgba(159,224,138,0.18); color: #cdf5bd; }
.gv-em button:disabled { opacity: 0.5; cursor: default; }
`;
