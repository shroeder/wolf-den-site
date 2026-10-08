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

/* Every body is anchored at the scene's GROUND LINE and moved by transform. The loop writes translate3d
   onto these; nothing here animates on its own.

   ⚠️ bottom IS 13%, NOT 0. World y=0 is the ground the hero walks on, and on every one of these plates the
   painted ground sits about an eighth of the way up the frame — anchored at 0 the whole population stood
   below the forest floor with their legs cut off by the bezel. The number is a property of how the plates
   were drawn, which is why it lives next to them rather than in the simulation. */
/* ⚠️ bottom IS A VARIABLE NOW, NOT 13%. The loop computes it from the plate's RENDERED height every
   frame (see GROUND_OF_PLATE in GroveScene.js): background-size: cover scales the backdrop to the larger
   of the two ratios, so on any viewport wider than the plate's own 3:2 it renders taller than the scene and
   is cropped at the top — and 13% of the scene stops being the line the grass is painted on. The 13%
   fallback is what a 16/10 box resolves to anyway, so nothing moves before the first frame. */
.gv-foe, .gv-hero, .gv-pet { position: absolute; left: 0; bottom: var(--gv-ground, 13%);
    transform-origin: 50% 100%; will-change: transform; }
/* ⚠️ SIZED IN WORLD UNITS, NOT IN PERCENT OF THE SCENE. The loop publishes --gv-unit (see
   GroveScene.js); the 1% fallback is exactly what these used to be, so nothing moves on the first frame
   before the loop has run. A body expressed in percent keeps its pixel size when the scale zooms and only
   the gaps between bodies grow, which made a portrait phone look like a wide shot of very small animals. */
.gv-foe { width: calc(8 * var(--gv-unit, 1%)); aspect-ratio: 1; background: none; border: 0; padding: 0;
    cursor: pointer; margin-left: calc(-4 * var(--gv-unit, 1%));
    transition: opacity 380ms ease, transform 380ms ease; }
.gv-foe img { width: 100%; height: 100%; object-fit: contain; display: block;
    filter: drop-shadow(0 3px 5px rgba(0,0,0,0.5)); }
.gv-foe i { display: block; width: 60%; height: 60%; margin: 20%; border-radius: 50%;
    background: rgba(255,255,255,0.2); }
.gv-foe.is-rare img { filter: drop-shadow(0 0 14px rgba(170,140,255,0.85)) drop-shadow(0 3px 5px rgba(0,0,0,0.5)); }
/* The shared death animation. Simple on purpose. */
.gv-foe.is-dead { opacity: 0; pointer-events: none; }
/* A boss is bigger than the things that wander around it, and lit so you can pick it out at the end of a
   zone. The glow is per-layer on the sprite rather than an overlay across the scene - a tint over the whole
   frame flattens every pixel to one colour. See no-overlay-for-lighting. */
.gv-foe.is-boss { width: calc(17 * var(--gv-unit, 1%)); margin-left: calc(-8.5 * var(--gv-unit, 1%)); }
.gv-foe.is-boss img { filter: drop-shadow(0 0 18px rgba(255,170,90,0.6)) drop-shadow(0 6px 10px rgba(0,0,0,0.6)); }

/* The hero and the pet. The gradient stays as the BACKGROUND of the box, so it is what shows through when
   there is no sprite yet - a fallback that is a CSS background cannot itself fail to load. */
.gv-hero { width: calc(7 * var(--gv-unit, 1%)); aspect-ratio: 1; margin-left: calc(-3.5 * var(--gv-unit, 1%));
    background: radial-gradient(circle at 50% 40%, #ffe28a, #c8872e 62%, transparent 70%); }
.gv-pet { width: calc(4.5 * var(--gv-unit, 1%)); aspect-ratio: 1; margin-left: calc(-2.25 * var(--gv-unit, 1%));
    background: radial-gradient(circle at 50% 40%, #9fe08a, #3f7a35 62%, transparent 70%); }
/* ⚠️ object-fit: contain, AND A CONTACT SHADOW. Without contain the sprite stretches to the box; without
   the shadow it reads as pasted onto the plate rather than standing on the ground. See
   sprite-floats-object-fit-contain. The background is cleared only when a sprite is actually there. */
.gv-hero:has(img), .gv-pet:has(img) { background: none; }
.gv-hero img, .gv-pet img { width: 100%; height: 100%; object-fit: contain; display: block;
    filter: drop-shadow(0 3px 5px rgba(0,0,0,0.55)); }

/* A ledge. Earth and moss rather than a UI bar, so it belongs to the painted plate instead of sitting on top
   of it: a dark soil body, a lit mossy lip along the top, and a soft shadow underneath to give it thickness.
   Anchored to the same 13% ground line as every body, because a ledge the bodies do not stand ON is worse
   than no ledge at all. */
/* ── ⚠️ A BRANCH, NOT A WIRE, AND ITS TOP IS THE FLOOR ─────────────────────────────────────
   Two things the zoom exposed rather than caused.

   The height was a flat 9px, which read as a twig when the frame held a hundred units and reads as dental
   floss now that a hero is 150px tall beside it. In world units it was a fortieth of his height. Sized in
   units like every other body, it is the same proportion at every zoom.

   ⚠️ AND THICKENING IT ALONE WOULD HAVE PUT IT OVER EVERYONE’S FEET. bottom + the loop’s negative
   translate place the box‘s BOTTOM edge on the platform’s y, while a body standing on that platform has
   its FEET on the same y — so the bar has always been drawn in the 9px above the floor it represents,
   covering the bottom of anything standing there. Invisible at 9px, a shin-deep puddle at 24. The negative
   margin drops the box by exactly its own height so its TOP is the standing surface, which is both correct
   and what it already looked like. Nothing in the simulation moves; floorUnder never read this. */
.gv-ledge { position: absolute; left: 0; bottom: var(--gv-ground, 13%);
    height: calc(1.15 * var(--gv-unit, 1%)); margin-bottom: calc(-1.15 * var(--gv-unit, 1%));
    border-radius: 4px 4px 2px 2px;
    pointer-events: none; will-change: transform;
    background: linear-gradient(#5f7a3a 0 34%, #4a3a28 34% 100%);
    box-shadow: 0 3px 6px rgba(0,0,0,0.45), inset 0 -2px 0 rgba(0,0,0,0.3); }

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

.gv-float { position: absolute; left: 50%; bottom: 40%; font-weight: 800; font-size: 0.95rem;
    pointer-events: none; animation: gvFloat 900ms ease-out forwards; text-shadow: 0 2px 4px rgba(0,0,0,0.9); }
.gv-float.is-hit { color: #ffe9a8; }
.gv-float.is-crit { color: #ff9f4a; font-size: 1.3rem; }
.gv-float.is-took { color: #ff6b6b; }
.gv-float.is-heal { color: #7cffb2; }
.gv-float.is-loot { color: #cdf5bd; font-size: 0.8rem; }
@keyframes gvFloat { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(-34px); } }

/* Below the HUD row rather than tucked against it - the name and the health bar are two lines and they were
   crowding the hp bar and the kill count. */
.gv-boss { position: absolute; top: calc(40px + env(safe-area-inset-top)); left: 50%; transform: translateX(-50%); width: 70%;
    text-align: center; pointer-events: none; }
.gv-boss b { display: block; font-size: 0.8rem; letter-spacing: .1em; text-transform: uppercase;
    color: #e5d2ff; text-shadow: 0 2px 4px rgba(0,0,0,0.9); margin-bottom: 4px; }
.gv-boss span { display: block; height: 11px; border-radius: 999px; background: rgba(0,0,0,0.6);
    border: 1px solid rgba(197,160,255,0.55); overflow: hidden; }
.gv-boss i { display: block; height: 100%; background: linear-gradient(90deg, #a982ff, #e0c6ff);
    transition: width 220ms ease; }

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
.gv-hp { flex: 0 0 38%; height: 10px; border-radius: 999px; background: rgba(0,0,0,0.6);
    border: 1px solid rgba(255,255,255,0.2); overflow: hidden; }
.gv-hp i { display: block; height: 100%; background: linear-gradient(90deg, #d8402f, #ff8a6b);
    transition: width 180ms ease; }
.gv-hud b { font-size: 0.78rem; color: #efe7d8; text-shadow: 0 2px 4px rgba(0,0,0,0.9); }
.gv-leave { margin-left: auto; pointer-events: auto; padding: 6px 14px; border-radius: 999px; cursor: pointer;
    font: inherit; font-size: 0.78rem; font-weight: 700; color: #efe7d8;
    background: rgba(0,0,0,0.55); border: 1px solid rgba(255,255,255,0.22); }

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
