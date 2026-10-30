// ── THE GROVE'S LOOK ─────────────────────────────────────────────────────────────────────────────────────────
// ⚠️ NO BACKTICKS ANYWHERE IN THESE COMMENTS. This is a template literal, and a backtick inside a CSS comment
// ends it and breaks the build. That has happened eleven times in this repo across two sessions, which is
// why npm run check:css exists — run it after touching this file.
//
// ⚠️ AND NO FILTER ON A SCENE ANCESTOR. A filter or backdrop-filter creates a containing block, and the
// scene positions everything absolutely inside it; a tint on a wrapper would silently re-anchor every body in
// the zone. See filter-creates-containing-block, which cost a whole mobile menu.
// The one interpolation in this file. The veil's delay has to match the hero's fall exactly, and a
// copied number would drift the first time the fall is retimed.
import { DEATH_VEIL_DELAY_MS } from "@/lib/marketplace/grove-juice";

export const GROVE_CSS = `
.gv { position: relative; color: #efe7d8; }

/* ── CHROME ──────────────────────────────────────────────────────────────────────────────────── */
/* ⚠️ .gv-head IS GONE AND SO ARE ITS RULES. Luke: "The main screen for the grove. It should only have a
   map." It was a title and four word-pills in a scrolling strip above the map, which spent a line of a
   phone saying what four objects now say without one — and a horizontally scrolling tab row had already
   hidden its last item once, on the back office, for exactly the same reason. Deleting the rules with the
   element is deliberate: a stale rule for a shape that no longer exists is how a later element with a
   reused class name inherits a background nobody meant it to have. See stale-css-rule-on-reshape. */

/* ── THE WHOLE FEATURE, FULL SCREEN ──────────────────────────────────────────────────────────
   Luke: "the entire grove feature is full screen". The ZONE already was — see .gv-scene.is-full below,
   which came from the same instruction about the zone. The map, the bag, the workbench and the emblems
   were still a card in the middle of the marketplace page, so walking out of a zone dropped you from a
   full-screen game back into a web page.

   ⚠️ z-index 60, UNDER THE ZONE'S 70. The scene mounts its own full-screen layer on top of this one and
   has to stay there; equal values would leave which one wins to document order, and the zone is portalled
   to the end of body by a different component. */
.gv.is-full { position: fixed; inset: 0; z-index: 60;
    width: 100vw; width: 100dvw; height: 100vh; height: 100dvh;
    display: flex; flex-direction: column;
    background: radial-gradient(120% 80% at 50% 0%, #16251a 0%, #0a120d 60%, #060a07 100%);
    overscroll-behavior: none; }
/* Everything that is not the dock scrolls in here, so the dock never travels with the content.
   ⚠️ min-height: 0, OR A FLEX CHILD WILL NOT SCROLL. Its default min-height is auto, which means it grows
   to its content instead of overflowing it, and the panel simply runs off the bottom of the screen. */
.gv-sheet { flex: 1; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch;
    display: flex; flex-direction: column;
    padding: calc(52px + env(safe-area-inset-top)) 14px calc(104px + env(safe-area-inset-bottom)); }
/* ⚠️ THE MAP SITS IN THE MIDDLE OF THE SCREEN IT WAS JUST GIVEN. Going full screen made the strip a band
   across the top of nine hundred pixels with five hundred of black under it — more room is not the same
   thing as using it. Auto margins centre it when there is space and collapse when there is not, which a
   fixed justify-content would not; and the strip is a single row of fixed height, so it can never overflow
   vertically and be pushed out of reach by them. */
.gv.is-full .gv-strip { margin-block: auto; }
/* The paper takes the whole sheet rather than being centred in it — a chart is the screen, not an item on it. */
.gv.is-full .gv-paper-wrap { flex: 1; min-height: 0; }

/* The way out. Top-left, where a back control is looked for, and clear of the dock. */
.gv-exit { position: fixed; z-index: 66;
    top: calc(10px + env(safe-area-inset-top)); left: calc(10px + env(safe-area-inset-left));
    width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; cursor: pointer;
    color: #efe7d8; background: rgba(8,12,8,0.62); border: 1px solid rgba(255,255,255,0.20);
    padding: 0; font: inherit; }

/* ── THE DOCK ────────────────────────────────────────────────────────────────────────────────
   Four objects floating over the content at the bottom right, which is where a right thumb already rests.
   That corner is only free because .gv-full-lock hides the site's own chat bubbles, which live there and
   were already stealing taps inside a full-screen zone.

   ⚠️ SIZED FOR A THUMB, NOT FOR THE ART. 56px is about the smallest a reliable touch target gets; the
   sprite inside is 40 and is allowed to overflow its button slightly, because a painted object cropped to
   a circle stops reading as an object. */
/* ⚠️ A ROW ALONG THE BOTTOM, NOT A COLUMN UP THE RIGHT EDGE, AND THAT IS A BUG FIX.
   Luke: "Hate how the buttons cover stuff up."

   A fixed column on the right hand edge is four objects parked ON TOP of the right-hand quarter of
   every panel underneath it -- and the panels are two-column grids, so it was permanently sitting on
   the whole right column: the Craft button on the workbench, Pickaxe and Smith's Hammer in the bag.
   Nothing overflowed and nothing errored; the content was simply underneath it.

   The zone's dock has been a centred bottom row since Luke asked for one ("Across the bottom, perhaps
   slightly smaller. Floating"), and the fix here is to be the same thing. A bottom row only ever covers
   a strip the scroller can be padded past, which .gv-sheet already is. */
/* ⚠️ THE DOCK'S RULES ARE GONE, NOT ORPHANED. Both docks -- the hub's bar of six circles and the zone's
   row across the bottom -- were replaced by the left drawer in GroveMenu.js, and their stylesheets went
   with them in the same commit. A replaced component whose CSS stays behind is a rule that will one day
   match something new by accident; see stale-css-rule-on-reshape. */
/* Inside a bar the buttons no longer need their own plate -- two nested dark discs is one too many. */
/* ⚠️ THE CURRENT ONE IS LIT, NOT OUTLINED. At this size an outline is a rounding error, and the only
   question the dock has to answer at a glance is "where am I". */
/* ── ⚠️ ON A LANDSCAPE PHONE HALF THE SCREEN WAS PADDING ──────────────────────────────────────
   52 above and 104 below is 156px of a 320px-tall viewport -- 49% of the screen reserved for a 40px
   button in one corner and a dock in the other, leaving about two rows of the workbench visible. The
   numbers are right for a tall screen and were never checked against a short one.


   ⚠️ A MEDIA QUERY ADDS NO SPECIFICITY, and this block is where that was learned. The dock it was written
   against is gone (replaced by the left drawer -- see GroveMenu.js), but the lesson it paid for is not:
   placed ABOVE the rule it meant to override, this query lost silently, and the padding around the dock
   shrank while the dock itself stayed 74px tall on every landscape phone. Nothing errored. The only thing
   that caught it was the rig measuring the element rather than trusting the rule just written. Order still
   decides every override in here.

   Keyed on HEIGHT, not width: this is about how little vertical room there is, and a 915x412 phone has
   the same problem as a 568x320 one. The dock shrinks with it rather than the padding merely getting
   tighter around it -- 46px buttons still clear the 44px a thumb needs, and that is what buys the room.
   Everything above this breakpoint is untouched. */
@media (max-height: 460px) {
    .gv-sheet { padding-top: calc(48px + env(safe-area-inset-top));
        padding-bottom: calc(72px + env(safe-area-inset-bottom)); }
    /* The in-zone sheet pays the same tax for the same reason -- a close button in one corner -- and on
       a 320px-tall screen 58 above and 24 below is a quarter of everything there is. */
    .gv-zsheet { padding-top: calc(46px + env(safe-area-inset-top));
        padding-bottom: calc(14px + env(safe-area-inset-bottom)); }
    .gv-zsheet-x { width: 36px; height: 36px; top: calc(6px + env(safe-area-inset-top)); }
    .gv-exit { width: 36px; height: 36px; top: calc(6px + env(safe-area-inset-top)); }
}


/* ── THE SAME DOCK, INSIDE A ZONE ─────────────────────────────────────────────────────────────
   Luke: "The buttons to access crafting and backpack and map should be available when in a node on the
   Grove. Across the bottom, perhaps slightly smaller. Floating."

   ⚠️ A ROW, NOT THE COLUMN, AND THAT IS NOT A STYLE CHOICE. The hub's dock runs up the right-hand edge;
   in a zone that edge already carries Leave and the full-screen toggle at the top, and the right side of
   the floor is where the hero is walking. A row centred along the bottom keeps a thumb off the fight.

   46px rather than 56. Still above the ~44px a touch target needs, and it has to give up less of a phone
   screen than the hub's does, because here the thing underneath it is the game.

   ⚠️ AND IT CLEARS THE HOME INDICATOR. bottom is safe-area-inset plus a margin: on a gesture-bar phone a
   control flush to the bottom edge is a control that swipes the browser away instead of pressing. */
/* ⚠️ THE TRANSITION BELONGS HERE AND THE VALUE IS WRITTEN BY THE LOOP. The menu handle fades back while
   you are swinging or being hit and returns when you stop -- see DOCK_QUIET_MS. Easing it in CSS keeps the
   loop writing one number instead of animating one, and the loop only writes it when it changes, or the
   transition would restart every frame and never arrive. The loop writes to the HANDLE now (it still holds
   zdockRef); there is no longer a row of buttons standing in the middle of the fight. */
/* ── THE SOUND SWITCH, IN THE DOCK ────────────────────────────────────────────────────────────
   It sits with the map and the backpack rather than up beside Leave, where it was colliding with the
   centred kill count. Slightly smaller and quieter than the four panel doors: it is a SETTING, and a
   setting that draws the eye as hard as the workbench is a setting in the wrong place. It is also the
   only button down here with no painted sprite, so the icon carries it. */


/* ── A PANEL OVER A PAUSED ZONE ───────────────────────────────────────────────────────────────
   Opaque rather than tinted. A dimmed-but-visible zone behind a backpack reads as the game still running
   and the menu being in the way of it — and the zone IS frozen, so a half-seen still frame of it would be
   actively misleading. The scene stays mounted underneath because unmounting it rebuilds the world: full
   health, full population, every creature you killed back on its feet.

   ⚠️ overflow-y: auto HERE, NOT ON THE BODY. The body carries gv-full-lock, which is what stops the page
   behind the Grove scrolling; the sheet has to do its own scrolling or the workbench is unreachable past
   the fold on a phone. */
/* ⚠️ FIXED AND ABOVE 70, WHICH IS THE ZONE'S OWN LAYER. The ladder is .gv.is-full at 60, the scene's
   full-screen layer at 70, and this at 80 — and it has to be stated, because the scene is PORTALLED to the
   end of body, so document order says nothing about which of the two wins. At z-index 8 the sheet rendered,
   paused the zone, and was painted underneath it: the backpack was invisible, the close button unreachable,
   and the only way out was to reload. elementFromPoint over the close button was the thing that said so. */
.gv-zsheet { position: fixed; inset: 0; z-index: 80;
    background: #0c120d; overflow-y: auto; -webkit-overflow-scrolling: touch;
    padding: calc(58px + env(safe-area-inset-top)) 0 calc(24px + env(safe-area-inset-bottom));
    animation: gvSheetIn 180ms ease-out both; }
@keyframes gvSheetIn { from { opacity: 0; transform: translateY(2%); } to { opacity: 1; transform: none; } }
/* Top-LEFT, where the zone's own way out already is, so the control that closes a layer is always in the
   same corner whichever layer you are on. */
.gv-zsheet-x { position: fixed; z-index: 81;
    top: calc(12px + env(safe-area-inset-top)); left: calc(12px + env(safe-area-inset-left));
    width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; cursor: pointer;
    color: #efe7d8; background: rgba(8,12,8,0.78); border: 1px solid rgba(255,255,255,0.18);
    -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
.gv-zsheet-x:hover { border-color: rgba(255,255,255,0.36); }

/* ── THE PAPER MAP ───────────────────────────────────────────────────────────────────────────
   A drawn chart with the twelve places on it and a trail between them. The plate is terrain only; the
   route and the places are drawn over it from grove-map.js.

   ⚠️ THE PAPER IS TALLER THAN THE SCREEN IS WIDE, ON PURPOSE. Fitting a 3:2 chart into a 390px phone
   gives you a 260px-tall map with twelve symbols on it about thirty pixels across, which is a picture of
   a map rather than a map. It fills the height instead and scrolls sideways, which is also the direction
   the journey runs. */
.gv-paper { width: 100%; height: 100%; overflow: auto hidden; -webkit-overflow-scrolling: touch;
    scrollbar-width: none; border-radius: 12px; }
/* ── ⚠️ THE MAP NEEDS A DEFINITE HEIGHT, AND IN A ZONE NOTHING WAS GIVING IT ONE ──────────────
   Luke: "When i click the map while in the grove its teeny on vertical phone."

   The chart sizes itself BACKWARDS compared to everything else on this screen: .gv-paper-in is
   aspect-ratio 2/1 with height:100%, so its WIDTH is derived from its height. That is fine wherever a
   parent hands it a real height -- and exactly one rule does, .gv.is-full .gv-paper { flex: 1 }, which
   only matches when the map is the whole screen on the hub.

   Opened from inside a zone it is not there. It is rendered through a createPortal into .gv-zsheet, which
   is outside .gv.is-full entirely, so height:100% has no definite parent to resolve against, collapses to
   its content, and drags the width down with it through the aspect-ratio. Hence a postage stamp, and hence
   only in a zone -- the hub map, which Luke has never complained about, is the same markup under the rule
   that works.

   A viewport height is the right fix rather than another flex chain: the sheet is position:fixed over the
   whole screen, so vh IS its height, and this cannot be undone by whatever the portal is nested in. The
   floor stops a short landscape phone collapsing it again. */
/* Superseded by .gv-zsheet .gv-paper-wrap below — the height moved up one level when the
   wrapper was introduced. Kept at 100% so the scroller fills whatever the wrapper is given. */
.gv-zsheet .gv-paper { height: 100%; }
.gv-paper::-webkit-scrollbar { display: none; }
/* ⚠️ 2:1, WIDER THAN THE PLATE IS. Twelve places across a 3:2 chart sit 88px apart, which is barely
   wider than the symbols themselves; at 2:1 they get 109 and stop crowding. The plate covers the box and
   crops, which costs nothing because its top band is bare parchment by design. */
.gv-paper-in { position: relative; height: 100%; aspect-ratio: 2 / 1; min-width: 100%; }
.gv-paper-plate { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
    border-radius: 12px; }

/* The trail. Dashed brown ink, drawn in percentage space so it stretches with the paper.
   ⚠️ vector-effect: non-scaling-stroke, OR THE LINE IS A WEDGE. preserveAspectRatio: none stretches the
   viewBox unevenly, and a stroke stretches with it — the route came out thick where the map is wide and
   thin where it is tall, which reads as a smudge rather than a drawn line. */
.gv-paper-trail { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.gv-paper-trail path { fill: none; stroke-linecap: round; stroke-linejoin: round;
    vector-effect: non-scaling-stroke; }
.gv-paper-trail .is-ghost { stroke: rgba(94, 70, 38, 0.30); stroke-width: 2; stroke-dasharray: 5 7; }
.gv-paper-trail .is-walked { stroke: rgba(94, 70, 38, 0.80); stroke-width: 3; stroke-dasharray: 7 6; }

/* A place. The symbol is the button; the label sits under it and only appears when there is room.
   ⚠️ TRANSLATED BY HALF ITSELF, because left/top are the point the trail passes through — anchoring by
   the corner would hang every symbol down and right of its own position on the route. */
.gv-node { position: absolute; transform: translate(-50%, -50%);
    /* ⚠️ 7%, NOT 13%. At thirteen a symbol came out 138px wide on a 1062px chart whose places are 88px
       apart — every one of them overlapped its neighbours and two of them filled a phone. The spacing
       between places is what sets this, not how nice the drawing looks on its own. */
    width: 7%; min-width: 58px; padding: 0; border: 0; background: none; cursor: pointer;
    display: flex; flex-direction: column; align-items: center; gap: 2px; font: inherit;
    -webkit-tap-highlight-color: transparent; transition: transform 160ms ease; }
.gv-node img { width: 100%; height: auto; display: block;
    filter: drop-shadow(0 2px 3px rgba(60, 44, 20, 0.35)); }
.gv-node:not(.is-locked):hover { transform: translate(-50%, -50%) scale(1.07); }
.gv-node:not(.is-locked):active { transform: translate(-50%, -50%) scale(0.94); }
/* ⚠️ IT WRAPS TO THE SYMBOL, rather than running as wide as the name happens to be. nowrap made every
   label wider than the place it belonged to, so neighbouring names overlapped each other across the
   trail and it was no longer clear which name went with which drawing. */
/* ⚠️ THE NAME GETS ONE LINE AND THE STATE GETS A CHIP. It used to be two stacked blocks of wrapping
   text in a box the width of a shrub, so "Mossy Hollow / The Mossmother" came out as three cramped lines
   and the name and the state ran together. One line that truncates, one chip underneath. */
.gv-node-label { display: flex; flex-direction: column; align-items: center; gap: 2px; line-height: 1.15;
    max-width: 150%; padding: 3px 6px; border-radius: 7px; background: rgba(247, 238, 214, 0.92);
    border: 1px solid rgba(94, 70, 38, 0.28); text-align: center; }
.gv-node-label em { font-style: normal; font-weight: 700; font-size: 0.6rem; color: #4a3720;
    max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.gv-node-label u { text-decoration: none; font-size: 0.52rem; font-weight: 700; color: #7b6442;
    letter-spacing: 0.02em; padding: 1px 5px; border-radius: 999px; white-space: nowrap;
    background: rgba(94, 70, 38, 0.10); }
/* Cleared is a stamp on the page — a scribe marks a job finished. */
.gv-node.is-clear .gv-node-label { background: rgba(250, 236, 196, 0.94); border-color: rgba(186, 142, 46, 0.6); }
.gv-node.is-clear .gv-node-label u { color: #6f5208; background: rgba(186, 142, 46, 0.22); }
.gv-node.is-clear .gv-node-label u::before { content: "✓ "; font-weight: 900; }
/* ⚠️ A LOCKED PLACE KEEPS ITS DRAWING AND LOSES ITS COLOUR. Blanking it would make most of the chart
   empty paper with nothing to walk toward; full colour would spoil twelve places at a glance. */
.gv-node.is-locked { cursor: not-allowed; }
.gv-node.is-locked img { filter: grayscale(0.9) opacity(0.45); }
.gv-node.is-locked .gv-node-label { background: rgba(236, 228, 208, 0.62); border-color: rgba(94, 70, 38, 0.18); }
.gv-node.is-locked .gv-node-label em, .gv-node.is-locked .gv-node-label u { color: #8d7f66; }
.gv-note { margin: 0 0 10px; padding: 9px 13px; border-radius: 10px; font-size: 0.85rem;
    background: rgba(159,224,138,0.12); border: 1px solid rgba(159,224,138,0.35); color: #d8f5cc; }
/* ── ⚠️ THE SAME NOTE, OVER A ZONE, WHERE IT IS THE ONLY ONE THAT EVER FIRES ───────────────────
   Every setNote in this feature happens while the player is standing in a zone -- the settle, the boss,
   the door -- and the zone had no .gv-note in it at all. The line existed, the string was correct, and
   it was rendered into a panel the player had to go and open afterwards.

   Bottom centre, above the dock: the top of the frame is taken by the belt, the kill count, the streak
   and the boss bar, and the left edge by the haul list. 78 sits between the scene's full-screen layer
   at 70 and the sheet at 80, so a panel covers it rather than fighting it. Opaque enough to read over
   a lit forest, and it clears itself on a timer -- see the note effect in GroveClient. */
/* ── ⚠️ LEFT EDGE, NOT THE MIDDLE OF THE FIGHT ────────────────────────────────────────────────
   Luke: "When you can craft a new item, the notification that pops up is directly in the play area.
   It should instead be... on the left side near the whole crafting panel. That would make a lot more
   sense."

   It was centred over the floor you are fighting on, which is both the worst place to read something
   and the worst place to be interrupted. The menu handle is pinned to the left edge at half height and the workbench
   lives inside it, so the message and the thing it is telling you to go and do are now on the same
   edge of the screen -- the note points at its own answer instead of at the middle of nowhere.

   ⚠️ BOTTOM-LEFT RATHER THAN BESIDE THE HANDLE, because the haul list already runs down the left edge from
   42% and would have been underneath it. Below the haul and above the dock is the one gap on that
   edge. */
.gv-note.is-zone { position: fixed; z-index: 78; margin: 0; cursor: pointer;
    left: max(8px, env(safe-area-inset-left));
    bottom: calc(68px + env(safe-area-inset-bottom));
    max-width: min(62vw, 300px); text-align: left;
    font-weight: 700; color: #eafbe0;
    background: rgba(10,16,10,0.88); border-color: rgba(159,224,138,0.55);
    box-shadow: 0 8px 24px rgba(0,0,0,0.6);
    animation: gvNoteIn 220ms cubic-bezier(.2,1.6,.4,1) both; }
/* ⚠️ NO -50% HERE ANY MORE. The note used to be centred by a transform, so its keyframe had to carry
   that -50% or the animation threw it across the screen on every appearance. Left-anchored now, so the
   slide is a plain nudge -- and a stale -50% in here would have been an invisible 150px jump. */
@keyframes gvNoteIn { from { opacity: 0; transform: translateX(-10px); }
    to { opacity: 1; transform: translateX(0); } }

/* ── ⚠️ THE FIRST MAP'S RULES LIVED HERE AND OUTLIVED THE FIRST MAP BY TWO REDESIGNS ─────────────
   .gv-map, .gv-node, .gv-node-n, .gv-node-name, .gv-node-bar and .gv-node-lock styled a grid of
   backdrop tiles that was replaced by .gv-strip / .gv-area, and then by the paper chart. Nothing has
   rendered any of those class names in a long time — except that the chart's places are also called
   .gv-node, and a second .gv-node rule was still sitting here carrying aspect-ratio: 3/2, overflow:
   hidden, a border, and an ::after that paints a dark gradient over the whole element.

   So every place on the new map came out as a dark rounded tile with its drawing clipped away inside
   it. Mine won every property it set and lost every property it did not think to set, which is exactly
   the failure mode: a stale rule does not announce itself, it just quietly keeps being true.

   This is the third time this repo has paid for it and it is in the memory as stale-css-rule-on-reshape:
   change an element's shape and DELETE its old rule, or the old background and transform still win. */

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
/* ── ⚠️ AN iPAD TREATS A FAST DOUBLE TAP AS TEXT SELECTION ────────────────────────────────────
   Luke: "when he double taps a lot on the iPad, it like selects all and comes up with a context
   menu." Which is exactly what a browser is supposed to do with a double tap on a page -- select the
   word under it -- and exactly wrong inside a game where a double tap is two attacks.

   Three different behaviours have to be turned off and they are not the same switch:
     user-select         the selection itself, and the blue wash that comes with it
     touch-callout       the long-press menu Safari raises over anything it thinks is content
     touch-action        the double-tap-to-zoom gesture, which also costs every tap a 300ms wait
                         while the browser decides whether a second one is coming

   ⚠️ ON THE WHOLE SURFACE, NOT ON THE BUTTONS. Some controls already carried touch-action, which is
   why the dock felt fine and the zone did not -- the taps that matter most in this feature land on
   the scene itself, on creatures, and on empty floor. */
.gv, .gv-scene, .gv-zsheet, .gv-full-lock {
    -webkit-user-select: none; user-select: none;
    -webkit-touch-callout: none;
    touch-action: manipulation; }
/* ⚠️ touch-action IS NOT INHERITED, AND THE THINGS HE TAPS ARE CHILDREN. Setting it on .gv-scene left
   every creature and the hero on auto -- so the double-tap gesture and its 300ms wait were still live
   on precisely the elements a player hits, which is the whole complaint. Verified with the computed
   style rather than by reading the rule: the parent said manipulation and .gv-foe said auto. */
.gv-scene *, .gv *, .gv-zsheet * { touch-action: manipulation; }
/* ⚠️ THE PANELS ARE THE EXCEPTION. A player reading a recipe or an item name should still be able to
   select the text of it; nothing in a panel is a double-tap target. */
.gv-sheet { -webkit-user-select: text; user-select: text; }

.gv-full-lock { overflow: hidden; }
/* ⚠️ AND THE SITE’S OWN FLOATING CHROME HAS TO GO WITH IT. The social bubble and the DM bubble are
   fixed to the bottom-right corner, which in a full-screen zone is INSIDE the play area and on top of it —
   so a thumb reaching for an enemy in that corner opens a chat panel instead of attacking. Hidden only while
   the zone is up; leaving restores them with the body class. */
/* ⚠️ AND .social-fab, WHICH THIS RULE HAS BEEN MISSING SINCE IT WAS WRITTEN. .social-bubble is the toast
   that appears when something happens; .social-fab is the button that is ALWAYS there — bottom right, at
   z-index 900, which beats the full-screen zone's 70 outright. So the one element this rule exists to get
   out of the play area was the one element it did not name, and it has been sitting in the corner of every
   full-screen zone since. It turned up because the new dock wants that same corner and only three of its
   four buttons were reachable. */
.gv-full-lock .social-bubble,
.gv-full-lock .social-fab,
.gv-full-lock .dm-bubble-wrap { display: none; }
/* ── ⚠️ THE BACKDROP IS A STRIP, NOT A PLATE ───────────────────────────────────────────────
   Luke: "The map bg doesnt scroll which makes it impossible to feel immersed."

   It was one inset:0 div with a 3:2 painting on it, in a zone up to seven screens wide, so it could not
   scroll at all — and .gv-layer, the div that WAS being translated every frame, was empty. Bodies
   moving across a fixed picture reads as a treadmill.

   Anchored BOTTOM and taller than the scene, so the vertical camera has painted sky to pan into rather
   than a hole. Width is left to the flex children so the strip sizes itself to its tiles. The loop writes
   --gv-sky-h / --gv-sky-w and the transform; see SKY_PX / SKY_PY in GroveScene.js. */
/* ── ⚠️ THE SKY ABOVE THE PLATE ────────────────────────────────────────────────────────────────
   The plate is sized in WORLD units now (see PLATE_UNITS in grove-view.js), which is what let the camera
   finally pull back without the hero drowning in painted grass. The price is that on a tall narrow phone a
   world-sized plate no longer reaches the top of the screen, and the band above it has to be painted or the
   page shows through.

   ⚠️ IT IS THE PLATE'S OWN TOP EDGE, STRETCHED -- NOT A COLOUR SOMEBODY SAMPLED. A generated per-zone
   colour table is 84 numbers that drift silently the first time a backdrop is redrawn, and a redrawn
   backdrop is a thing this game does often. background-size 100% 1600% blows the image up sixteen times
   the box height so only its top ~6% is visible, smeared vertically: whatever the artist painted at the
   top of that plate is exactly what continues upward, for ever, with no table to keep in step.

   Measured across all 84 backdrops, the top 8% of 64 of them is flat atmospheric haze where this is
   invisible. Six are busy enough to show the smear (fernway, boar_run, wirewood_stand, kelpforest,
   ember_drift, palisade) -- the blur is what keeps those readable as distance rather than as a stretched
   texture. It sits BEHIND the tiles and does not scroll with them, which is correct: it is the furthest
   thing in the scene. */
.gv-haze { position: absolute; left: 0; right: 0; top: 0; bottom: 0; pointer-events: none;
    background-image: var(--gv-haze-img); background-size: 100% 1600%;
    background-position: top center; background-repeat: repeat-x;
    filter: blur(14px) saturate(0.92); transform: scale(1.06); transform-origin: top center; }
/* ⚠️ AND THE PLATE'S TOP EDGE FADES INTO THAT HAZE, OR THE JOIN IS A RULED LINE. Filmed without this the
   two met at a hard horizontal seam across the top fifth of a phone screen -- the stretched haze read as a
   flat band of paint rather than as distance. Fading the plate out over its top tenth lets the two blend.

   ⚠️ IT IS SAFE ON EVERY SCREEN, INCLUDING THE ONES WITH NO HAZE AT ALL. The element is bottom-anchored,
   so where the plate overtops the viewport its faded top sits ABOVE the screen and is never seen. A mask
   does not create a containing block either -- unlike a filter, which on this element would break the
   camera transform. See [[filter-creates-containing-block]]. */
.gv-sky { position: absolute; left: 0; bottom: 0; height: var(--gv-sky-h, 100%);
    display: flex; align-items: stretch; pointer-events: none; will-change: transform;
    -webkit-mask-image: linear-gradient(to bottom, rgba(0,0,0,0) 0%, #000 11%);
    mask-image: linear-gradient(to bottom, rgba(0,0,0,0) 0%, #000 11%); }
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

/* ── ⚠️ WHAT IS HAPPENING TO A CREATURE, FOR AS LONG AS IT IS HAPPENING ───────────────────────
   Luke: "it should feel like a real game." A freeze holds for two seconds, a chill for eight, a burn
   for three ticks -- and every one of them used to be a word that flashed once over a body that then
   looked completely untouched for the whole duration. You could not glance at a fight and see which
   creature was on fire.

   ⚠️ MASKED TO THE SPRITE, LIKE THE FLASH ABOVE, AND HIDDEN ENTIRELY WHERE MASKING IS NOT SUPPORTED.
   A tinted rectangle sitting over a creature is worse than no tint, which is exactly why .gv-flash
   carries the same fallback. */
.gv-status { position: absolute; inset: 0; opacity: 0; pointer-events: none;
    -webkit-mask-image: var(--gv-art-url); mask-image: var(--gv-art-url);
    -webkit-mask-size: contain; mask-size: contain;
    -webkit-mask-position: 50% 100%; mask-position: 50% 100%;
    -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat;
    transition: opacity 180ms ease; }
@supports not ((-webkit-mask-image: url(x)) or (mask-image: url(x))) {
    .gv-status { display: none; }
}
/* Fire sits ON the body and moves; ice sits over it and does not. The burn flickers because a flame
   that holds still reads as a colour wash, and the whole point is that it is alive. */
.gv-status.is-burning { opacity: 0.62;
    background: linear-gradient(0deg, #ff7a18 0%, #ffb347 42%, rgba(255,220,150,0.35) 100%);
    animation: gvBurnFlicker 420ms steps(3, end) infinite; }
@keyframes gvBurnFlicker { 0% { opacity: 0.52; } 50% { opacity: 0.72; } 100% { opacity: 0.52; } }
/* A hard, flat, pale blue -- the one condition that should read as STOPPED, so nothing about it moves. */
.gv-status.is-frozen { opacity: 0.74; background: linear-gradient(0deg, #6fb5ff 0%, #cdeaff 100%); }
/* ⚠️ A STUN IS A BLOW TO THE HEAD, NOT ICE. It holds a creature through the same lock a freeze does,
   which is right mechanically and would be wrong on screen: a player has to be able to tell which of
   their own stats just fired. Hot white rather than blue, and it pulses, because a stunned creature is
   reeling where a frozen one is stopped. */
.gv-status.is-stunned { opacity: 0.6; background: linear-gradient(0deg, #ffe9a8 0%, #fffdf2 100%);
    animation: gvStunReel 300ms ease-in-out infinite; }
@keyframes gvStunReel { 0%, 100% { opacity: 0.44; } 50% { opacity: 0.68; } }
/* Chill is the same colour at a fraction of the weight: a creature slowed, not stopped. */
.gv-status.is-chilled { opacity: 0.3; background: linear-gradient(0deg, #6fb5ff 0%, #cdeaff 100%); }
/* ── THE HERO'S OWN TWO ────────────────────────────────────────────────────────────────────────
   ⚠️ BOTH ARE READOUTS, NOT DECORATION, so neither is subtle. A ward or a guard standing between the
   player and the next blow is the single most useful thing to know in a fight they are losing, and so
   is being a hit from the floor -- and until now the hero looked identical in both states and in
   neither. Steel for the shield, because that is the Warden's colour everywhere else; red for the
   last quarter of health, pulsing, because a static red hero reads as a palette rather than a warning. */
/* ⚠️ LIGHTER THAN A CREATURE'S CONDITION, ON PURPOSE. A burning rootrat is one of thirty bodies and
   has to be picked out of a crowd; the hero is the body you are already looking at and the one you
   identify with. The first cut ran this at the creature weight and he stopped looking like himself --
   and a Warden is warded for much of a fight, so that is most of the time. Enough to read as armour
   standing in front of him, not enough to repaint him. */
.gv-status.is-warded { opacity: 0.24; background: linear-gradient(0deg, #6f9fd8 0%, #cfe4ff 100%); }
.gv-status.is-low { opacity: 0.5; background: linear-gradient(0deg, #e2594a 0%, #ff9a86 100%);
    animation: gvLowPulse 760ms ease-in-out infinite; }
@keyframes gvLowPulse { 0%, 100% { opacity: 0.34; } 50% { opacity: 0.6; } }
/* Both at once is a guarded hero who is still nearly dead -- the red has to win, because it is the one
   that decides whether they should be running. */
.gv-status.is-warded.is-low { background: linear-gradient(0deg, #e2594a 0%, #cfe4ff 100%); }

/* ⚠️ BURNING AND FROZEN AT ONCE IS CATACLYSM, and it must not look like either one alone -- that
   combination is one swing in twenty on a full tree and the rarest thing a Runecaller does. */
.gv-status.is-burning.is-frozen { opacity: 0.8;
    background: linear-gradient(0deg, #ff7a18 0%, #ffd9a0 45%, #cdeaff 100%);
    animation: none; }

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

/* ── ⚠️ A DROP THAT WAS SPECIAL HAS TO LOOK SPECIAL ───────────────────────────────────────────
   Luke: "am I suprised by rare events drops, or is it super predictable".

   The drop roll has a tail on it now -- usually the authored band, sometimes several times it, rarely
   twelve times it -- and a twelvefold windfall that lands looking exactly like a single root is a
   windfall nobody noticed. The roll already knows which band it came out of; this is where that becomes
   visible.

   TWO DIFFERENT KINDS OF SPECIAL, DRESSED DIFFERENTLY ON PURPOSE. A big pile is LOUD: warm, bigger,
   with a glow that says quantity. One uncommon part is VALUABLE: cool violet, a slow pulse, small. They
   must not borrow each other's clothes or the player learns neither. */
.gv-drop.is-handful img { filter: drop-shadow(0 0 7px rgba(255,214,120,0.85)) drop-shadow(0 2px 4px rgba(0,0,0,0.6)); }
.gv-drop.is-handful { transform-origin: 50% 100%; }
.gv-drop.is-haul img { filter: drop-shadow(0 0 11px rgba(255,186,70,0.95)) drop-shadow(0 2px 5px rgba(0,0,0,0.65));
    scale: 1.22; }
.gv-drop.is-windfall img { filter: drop-shadow(0 0 16px rgba(255,150,40,1)) drop-shadow(0 0 30px rgba(255,110,20,0.75))
    drop-shadow(0 3px 6px rgba(0,0,0,0.7)); scale: 1.5; }
/* The rare row: a part from deeper in the forest than the thing that dropped it. Violet, because every
   other loud thing in this scene is warm and this one is not about quantity. */
.gv-drop.is-rarerow img { filter: drop-shadow(0 0 10px rgba(178,140,255,0.95)) drop-shadow(0 2px 5px rgba(0,0,0,0.6));
    animation: gv-rarebeat 1.5s ease-in-out infinite; }
@keyframes gv-rarebeat { 0%, 100% { scale: 1; } 50% { scale: 1.14; } }

/* ── ⚠️ WHAT IS WAITING AT THE WORKBENCH, ON THE BUTTON ───────────────────────────────────────
   A player spends the entire session inside a zone. Nothing in a zone ever mentioned that crafting
   existed, let alone that twenty-five recipes were already makeable -- so the deepest player in the
   game had 93 of one part and had never crafted anything at all.

   A count on the door, which is how this game teaches everything. Deliberately NOT a prompt, a modal or
   a tutorial: see no-temp-ui-scaffolding and teach-by-showing-not-telling. */
@keyframes gv-benchpulse { 0%, 92%, 100% { transform: scale(1); } 96% { transform: scale(1.18); } }

/* ── THE ZONE WHOSE BOSS IS STILL STANDING ────────────────────────────────────────────────────
   The map used to say "Cleared" the moment the kill quota was met, while the next node still said
   "Locked" and nothing said why. The quota earns the right to FIGHT the boss; the boss opens the way.
   A node at quota with its boss alive is the one place the player should be going, so it says so and
   it is lit. */
/* ── ⚠️ "A BOSS IS HERE" AND "GO HERE NEXT" ARE NOT THE SAME THING ───────────────────────────────
   Both wore this amber and both pulsed, so a chart with two unfought bosses shouted twice and pointed
   nowhere — Luke, reading his own map: "Why are two selected". On that save one of them was the frontier
   and the other was four zones behind him. A boss standing behind you is a note; the frontier is an
   instruction, and only one thing on a map may be an instruction. */
.gv-node.is-boss .gv-node-label { border-color: rgba(185, 125, 28, 0.6); }
.gv-node.is-boss .gv-node-label u { color: #7a4a06; background: rgba(240, 180, 76, 0.3); }
.gv-node.is-boss:not(.is-next) img { filter: drop-shadow(0 2px 3px rgba(60,44,20,0.35))
    drop-shadow(0 0 7px rgba(255,170,70,0.4)); }

/* THE FRONTIER. One pin, one bob, one gold label — the single place the chart is pointing at. */
.gv-node.is-next { z-index: 3; }
.gv-node.is-next .gv-node-label { background: linear-gradient(180deg, #ffe3a8, #f0b44c);
    border-color: #a86c12; box-shadow: 0 2px 10px rgba(150, 95, 10, 0.4); }
.gv-node.is-next .gv-node-label em { color: #3a2906; }
.gv-node.is-next .gv-node-label u { color: #4a2d04; background: rgba(255,255,255,0.42); }
.gv-node.is-next img { filter: drop-shadow(0 3px 5px rgba(60,44,20,0.45))
    drop-shadow(0 0 14px rgba(255,180,70,0.95)); animation: gv-bossbeat 2.2s ease-in-out infinite; }
/* The pin: a dropped marker that lands once and then holds, so it reads as placed rather than throbbing. */
/* ── ⚠️ THE BAG'S BADGE WARNS; THE BENCH'S INVITES ────────────────────────────────────────────
   Same object, opposite meanings, so they cannot share a colour. The bench badge is gold because it
   counts things you could go and make. This one counts the room you have left, and it only appears at
   three or fewer -- amber while there is still time to do something about it, red at nought, which is
   the state where loot is already being left on the floor. */
.gv-node-pin { position: absolute; top: -17px; left: 50%; width: 15px; height: 15px; margin-left: -7.5px;
    border-radius: 50% 50% 50% 0; transform: rotate(-45deg); background: linear-gradient(135deg, #ffd978, #d98b16);
    border: 1.5px solid #8a5607; box-shadow: 0 3px 7px rgba(60, 44, 20, 0.5);
    animation: gv-pin-drop 560ms cubic-bezier(.2,1.5,.4,1) both; }
.gv-node-pin::after { content: ""; position: absolute; inset: 4px; border-radius: 50%; background: #5a3708; }
@keyframes gv-pin-drop {
    0% { opacity: 0; transform: rotate(-45deg) translate(14px, -14px) scale(0.5); }
    100% { opacity: 1; transform: rotate(-45deg) translate(0, 0) scale(1); }
}



/* ── THE CHART'S CHROME ──────────────────────────────────────────────────────────────────────────────
   ⚠️ .gv-paper-head HAD NO RULES AT ALL. It has been in the markup for two passes carrying the map name,
   the map-to-map arrows and now the cleared count, and every one of them rendered as bare unstyled text
   on parchment — invisible in every screenshot anybody looked at, including mine. Nothing fails when a
   class is never styled; it just quietly does not exist.

   Both of these sit OUTSIDE the horizontal scroller, over it, so they stay put while the paper slides. */
/* ⚠️ THE WRAPPER CARRIES THE HEIGHT, AND GETTING THAT WRONG BROKE THE IN-ZONE MAP FOR THE FOURTH TIME.
   There has been a rule for this case since the paper was built — .gv-zsheet .gv-paper { height:
   min(60vh, 520px) } — because opened from inside a zone the chart is portalled into .gv-zsheet, which is
   NOT a flex column and hands its children no height at all. Adding .gv-paper-wrap put a second selector
   of exactly equal specificity later in the file, so "height: 100%" quietly beat it, resolved against an
   auto-height parent, and collapsed a 2:1 plate into a short band with twelve places piled on top of each
   other. Nothing errored; the only symptom was a screenshot.

   The height now lives on the WRAPPER in both contexts and .gv-paper simply fills it, so there is one
   chain rather than two rules fighting over the same box. */
.gv-paper-wrap { position: relative; width: 100%; height: 100%; }
.gv-paper-wrap > .gv-paper { height: 100%; }
/* ── ⚠️ BOTH ENDS OF THE OLD min(68vh, 620px) WITH A 300px FLOOR WERE WRONG ───────────────────
   Written for a phone held upright, and measured across every screen it was the only thing on this
   panel that did not fit:

     · the 300px FLOOR overflowed a 568x320 landscape phone. The sheet has 82px of padding, so 238px is
       all there is -- ninety pixels of the chart sat below the fold, on a map you already have to scroll
       sideways. A map you scroll in two directions to see at all is not a map.
     · the 620px CAP shrank it everywhere above a laptop. Opened from inside a zone an ultrawide got 43%
       of its height; the SAME map opened from the hub got 87%. One chart, two sizes, for no reason the
       player could see.

   The viewport is the right unit here and that part was always right -- the sheet is position:fixed over
   the whole screen, so vh IS its height and no portal can take that away. What it needed was a share
   rather than a ceiling, and a second term that knows about the padding instead of a floor that does
   not. 78vh lands within a few pixels of what the hub gives the same chart at every size. */
/* ⚠️ 140, AND IT IS MEASURED RATHER THAN DERIVED. The sheet's padding-top is 58, but the chart does not
   start there -- measured live it begins at y=110 on most sizes, and the sheet pays more at the bottom.
   A first cut at 92 was arithmetic off the padding alone and hung the map 25-54px below the fold on
   three screens; 140 got that to 6-10px and no further, because the offset is not a constant -- the
   short-screen media query below moves it. 152 is the measured worst case rather than a derivation, and
   the rig is what settled it. The stylesheet reads as if 92 were obviously right. */
.gv-zsheet .gv-paper-wrap { height: min(78vh, calc(100vh - 152px)); min-height: 164px; }

/* THE PLATE. One object: name and arrows on top, the twelve places beneath. */
.gv-paper-chrome { position: absolute; z-index: 4; top: 8px; left: 50%; transform: translateX(-50%);
    max-width: calc(100% - 28px); display: flex; flex-direction: column; align-items: center; gap: 4px;
    padding: 5px 7px 6px; border-radius: 16px;
    background: rgba(247, 238, 214, 0.94); border: 1px solid rgba(94, 70, 38, 0.32);
    box-shadow: 0 3px 12px rgba(50, 36, 14, 0.32); }
.gv-paper-head { display: flex; align-items: center; gap: 7px; max-width: 100%; }
.gv-paper-head b { font-size: 0.78rem; font-weight: 800; color: #3f2e18; letter-spacing: 0.01em;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.gv-paper-head i { font-style: normal; font-size: 0.62rem; font-weight: 800; color: #6f5a35;
    white-space: nowrap; padding: 2px 7px; border-radius: 999px; background: rgba(94, 70, 38, 0.14);
    font-variant-numeric: tabular-nums; }
.gv-paper-arrow:disabled { opacity: 0.3; cursor: default; }

/* ── THE WHOLE CHART, AS TWELVE PIPS ──────────────────────────────────────────────────────────────
   A phone shows about two of the twelve places, so without this there is no way to tell whether you are
   near the start or the end, how much is left, or that something is still standing behind you. Inside
   the plate rather than floating under it, because two stacked chips read as two controls. */
.gv-paper-pips { display: flex; gap: 5px; margin: 0; padding: 0; list-style: none; }
.gv-paper-pips li { width: 7px; height: 7px; border-radius: 50%; background: rgba(94, 70, 38, 0.18); }
.gv-paper-pips li.is-done { background: #b98f2e; }
.gv-paper-pips li.is-open { background: rgba(94, 70, 38, 0.45); }
.gv-paper-pips li.is-boss { background: #e8a93a; }
.gv-paper-pips li.is-next { background: #f0b44c; box-shadow: 0 0 0 2px rgba(240, 180, 76, 0.5);
    transform: scale(1.3); }

/* ── THE TRAIL DRAWS ITSELF ──────────────────────────────────────────────────────────────────────
   The route you have walked inks in when the chart opens. One pass, 900ms, then it simply sits there —
   a line that redrew on every render would be a fidget rather than an arrival.
   ⚠️ A LENGTH LARGE ENOUGH FOR ANY ROUTE. The path is in percent space so its true length is small and
   varies per map; 400 covers twelve legs of a 100x100 box with room to spare, and an over-long dash just
   means the animation starts fully hidden, which is what it wants anyway. */
.gv-paper-trail .is-walked { animation: gv-ink 900ms ease-out both; }
@keyframes gv-ink { from { stroke-dasharray: 0 400; } to { stroke-dasharray: 7 6; } }
@media (prefers-reduced-motion: reduce) {
    /* The zone note is the one animation here that is NOT the readout -- the words are. It still has to
       appear, so the slide goes and the line stays. See animations-always-play for the house rule and
       why the bump on a kill count does not get this treatment. */
    .gv-paper-trail .is-walked, .gv-node-pin, .gv-node.is-next img, .gv-note.is-zone,
    .gv-belt.is-eat, .gv-belt.is-eat i,
    /* The tint IS the readout; only the flicker on it is decoration. */
    .gv-status.is-burning, .gv-status.is-stunned, .gv-status.is-low { animation: none; }
}
@keyframes gv-bossbeat { 0%, 100% { scale: 1; } 50% { scale: 1.07; } }

/* A hyper-rare off an ordinary kill is about one in two thousand -- the rarest thing in the feature.
   It wears the proc word, in the colour nothing else uses. */
.gv-proc.is-hyper { color: #ffd0ff; text-shadow: 0 2px 6px rgba(0,0,0,0.9), 0 0 20px rgba(255,120,255,0.95),
    0 0 38px rgba(210,70,255,0.7); }
.gv-boom.is-hyper { border-color: rgba(255,150,255,0.95); }

/* ── THE PET'S CLAW MARK ──────────────────────────────────────────────────────────────────────
   The pet's answer to .gv-swipe, and deliberately a different SHAPE rather than a smaller crescent.

   Luke: "it has to be differentiated from the character that's attacking, because otherwise it might just
   get too noisy and confusing."

   The hero cuts one long arc with a hard leading edge. This is three short parallel rakes, slanted across
   the direction of travel, in the pet's cool green rather than the hero's hot cream -- so the two marks
   differ in count, in angle and in colour, and any one of those three is enough to tell them apart at a
   glance in the middle of a fight. Visible for the 85ms of the leap and nothing else.

   The lines are children rather than a repeating-linear-gradient because they are different LENGTHS: a
   rake where the middle claw reaches furthest reads as a paw, and three identical bars read as a UI
   element. */
.gv-claw { position: absolute; left: 52%; top: 24%; width: 52%; height: 54%; opacity: 0;
    pointer-events: none; transform: rotate(-16deg); }
.gv-claw i { position: absolute; left: 0; width: 100%; height: 9%; border-radius: 50%;
    background: linear-gradient(90deg, rgba(190,255,170,0) 0%, rgba(214,255,190,0.95) 55%, rgba(255,255,255,0.9) 78%, rgba(255,255,255,0) 100%);
    filter: drop-shadow(0 0 3px rgba(150,240,130,0.8)); }
.gv-claw i:nth-child(1) { top: 8%; width: 82%; }
.gv-claw i:nth-child(2) { top: 44%; width: 100%; }
.gv-claw i:nth-child(3) { top: 80%; width: 74%; }

/* A rare spawn and a boss are lit so you can pick them out. The glow is per-layer on the sprite rather
   than an overlay across the scene — a tint over the whole frame flattens every pixel to one colour.
   See no-overlay-for-lighting. */
.gv-foe.is-rare .gv-art img { filter: drop-shadow(0 0 14px rgba(170,140,255,0.9)) drop-shadow(0 3px 5px rgba(0,0,0,0.5)); }
.gv-foe.is-boss .gv-art img { filter: drop-shadow(0 0 20px rgba(255,170,90,0.65)) drop-shadow(0 6px 10px rgba(0,0,0,0.6)); }
.gv-foe.is-boss .gv-shadow { width: 70%; height: 7%; margin-left: -35%; }

/* The hero and the pet. The gradient stays as the BACKGROUND of the box, so it is what shows through when
   there is no sprite yet — a fallback that is a CSS background cannot itself fail to load. */
/* ── ⚠️ NEITHER OF THEM MAY EAT A TAP ─────────────────────────────────────────────────────────
   The hero's box is 148px square on a 390px phone -- 38% of the width -- and the pet's is 95px. Both are
   painted AFTER the creatures (document order is the whole stacking rule here), so anything standing on or
   next to you is behind them. With pointer-events left at the default, a tap aimed at a creature inside
   either box lands on the sprite's img instead, falls through to the scene's own handler, and is read as
   "walk to where you are already standing". Nothing happens, and nothing says why.

   Probed in the live game: EVERY creature on screen was untappable on three runs out of three. The whole
   input vocabulary of this feature is "tap the thing you want to hit", and the thing you most want to hit
   is the one that has walked up to you.

   Neither element is interactive -- no handler, no role, no focus. The creatures are real <button>s, the
   doors have their own hit box, and the scene behind handles walk-taps. So this costs nothing and is the
   whole fix. See [[farm-z-order-steals-taps]], which is the same bug in the Farm. */
.gv-hero, .gv-pet { pointer-events: none; }
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
/* ── ⚠️ THE LEDGE IS PAINTED NOW, AND THE GRADIENT IS GONE ─────────────────────────────────────
   Luke: "Lets make the platforms more detailed ... the platforms are just way too plain."

   It was four stops of linear-gradient with a green band on top, which is the right tool for a prototype
   and the wrong one for the ONE OBJECT THE PLAYER ACTUALLY STANDS ON sitting in front of a painted plate.
   Everything else in the zone is a painting; the ledge was the only thing that was not, and that is the
   whole of what read as plain.

   ── ⚠️ AND IT IS A THREE-SLICE, BECAUSE A LEDGE IS 13 TO 29 UNITS WIDE ───────────────────────
   One sprite stretched across that range puts its two ends at two different aspect ratios: a round cap on
   a short ledge and a flat ellipse on a long one, in the same frame, cut from the same drawing. So the
   slab is a border-image — the left and right thirds of the painting are pinned at their painted size and
   only the middle is stretched, which is exactly what the prompt in gen-grove-art.mjs makes empty.

   ⚠️ THE CAP WIDTH IS TIED TO THE SLICE, AND BOTH ARE TIED TO THE FILE. The source is normalised to
   1024x320 at generation and sliced 150px in from each side, so a cap is 150/320 = 0.469 of the slab's
   height. Change either number without the other and the caps come out stretched or clipped, with
   nothing to say so. */
/* ⚠️ THE DEPTH AND THE CAP WIDTH ARE ONE NUMBER, NOT TWO. The cap is 150 of the slab's 320 pixels of
   height, so its width on screen is 0.469 of however deep the ledge is drawn — and the two were written
   out separately at first, which is the balance-constants-never-copied shape: change the depth, forget the
   cap, and every ledge in the game renders with stretched ends and nothing says so. One variable, and the
   border-width is derived from it.

   2.9 units deep, not 2.4. At 2.4 the painted slab came out as a thin plank floating in front of the plate
   in every zone — the moss cap was a few pixels of green and the earth under it had no body at all. The
   source art is a chunky three-band shelf and it needs the depth to show it: 2.9 against a 7-unit hero is
   a shelf you are standing on top of. */
/* ── ⚠️ AND THE BOX IS DROPPED SO ITS PAINTED SURFACE LANDS ON THE FEET LINE ───────────────────
   Luke: "the enemies and player and pet are floating, maybe we can fix that for all platforms?"

   A body's feet sit at this element's TOP EDGE, and the top edge is the top ROW OF THE PAINTING — the tip
   of the tallest moss tuft, not the surface. A knight standing on the apex of the cushion is exactly what
   reads as hovering. --gv-slab-surface is the MEASURED median of that slab's top edge (SLAB_SURFACE in
   grove-catalog.js), so dropping the box by that much puts the feet where half the tufts stand above the
   boot and half below, which is what standing in moss looks like.

   ⚠️ IT IS A DIFFERENT NUMBER PER SLAB AND THAT IS THE POINT. The char slab's top edge wanders over 1.6%
   of its height and the bramble's over 13%, so one shared nudge fixes one platform and breaks another —
   which is why this read as a single bug and was a different amount of wrong in every zone.

   ⚠️ AND THE SIGN IS THE WHOLE THING. The bottom property positions the MARGIN edge, so a MORE negative
   margin-bottom raises the box and carries the surface further ABOVE the feet. It wants to be LESS
   negative. Written the other way round first, it made the float worse by exactly the amount it was meant
   to remove, and the screenshot was the only thing that said so. */
.gv-ledge { --gv-ledge-h: 2.9; position: absolute; left: 0; bottom: var(--gv-ground, 13%);
    height: calc(var(--gv-ledge-h) * var(--gv-unit, 1%));
    margin-bottom: calc(-1 * var(--gv-ledge-h) * (1 - var(--gv-slab-surface, 0)) * var(--gv-unit, 1%));
    pointer-events: none; will-change: transform; }
.gv-slab { position: absolute; inset: 0;
    border-style: solid; border-width: 0 calc(0.469 * var(--gv-ledge-h) * var(--gv-unit, 1%));
    border-image-source: var(--gv-slab);
    border-image-slice: 0 150 fill;
    border-image-repeat: stretch;
    /* The ledge has to sit IN FRONT OF the plate rather than on it, and a painted cutout gets that from a
       cast shadow the same way every body in the zone does. drop-shadow follows the alpha, so it traces
       the slab's actual silhouette instead of boxing it. */
    filter: drop-shadow(0 calc(0.3 * var(--gv-unit, 1%)) calc(0.5 * var(--gv-unit, 1%)) rgba(0,0,0,0.6)); }

/* ── WHAT GROWS ON A LEDGE ─────────────────────────────────────────────────────────────────────
   Luke: "add sprite decorations like vines hanging from platforms where biome permits".

   Which sprite is allowed where is GROVE_BIOMES in grove-catalog.js; where it sits on a given ledge is
   decorateLedges() in grove-world.js, rolled once off the zone seed. This is only the drawing.

   ⚠️ POSITIONED IN PERCENT OF THE LEDGE, SIZED IN UNITS. The percent is what makes a vine ride its own
   ledge for free when the loop rewrites that ledge's width every frame — no second per-frame write, no
   list of decorations for the loop to walk. The SIZE has to be in units for the same reason every body
   is: a vine in percent keeps its pixel size when the scale zooms while the hero beside it does not. See
   view-space-constants-break-on-zoom. */
.gv-dec { position: absolute; pointer-events: none; }
.gv-dec img { display: block; width: auto; }
/* Hanging: pinned just inside the slab's underside so the top of the sprite is swallowed by the earth it
   is growing out of. A vine that starts exactly at the edge reads as hung ON the ledge, not grown from it. */
.gv-dec.is-h { top: calc(100% - 0.5 * var(--gv-unit, 1%)); transform: translateX(-50%); z-index: 0; }
.gv-dec.is-h img { height: calc(4.4 * var(--gv-ds, 1) * var(--gv-unit, 1%));
    transform-origin: 50% 0;
    filter: drop-shadow(0 2px 3px rgba(0,0,0,0.5));
    animation: gvHangSway var(--gv-dt, 4200ms) ease-in-out infinite; }
/* Sitting: its base tucked a little BELOW the top edge, into the moss, for the same reason. */
/* ⚠️ ON THE SAME SURFACE LINE THE BODIES STAND ON, plus a touch so the base tucks into the cushion
   rather than balancing on it. This was a flat 0.45 units, which is why the mushrooms read as seated
   while the knight standing beside them did not — they were the only thing on the ledge sunk into it. */
.gv-dec.is-s {
    bottom: calc(100% - (var(--gv-ledge-h) * var(--gv-slab-surface, 0) + 0.3) * var(--gv-unit, 1%));
    transform: translateX(-50%); z-index: 0; }
.gv-dec.is-s img { height: calc(2.1 * var(--gv-ds, 1) * var(--gv-unit, 1%));
    transform-origin: 50% 100%;
    filter: drop-shadow(0 2px 3px rgba(0,0,0,0.5));
    animation: gvSitSway var(--gv-dt, 5200ms) ease-in-out infinite; }
/* ⚠️ THE MIRROR LIVES INSIDE THE KEYFRAMES. scaleX is on the same element as the sway, so a transform
   set outside the animation would simply be overwritten by it the moment it starts — the flip would apply
   for one frame and then silently stop, which is the kind of thing that looks like the random seed being
   broken. Both halves are in every keyframe instead. */
@keyframes gvHangSway {
    0%, 100% { transform: scaleX(var(--gv-df, 1)) rotate(-2.4deg); }
    50% { transform: scaleX(var(--gv-df, 1)) rotate(2.4deg); }
}
@keyframes gvSitSway {
    0%, 100% { transform: scaleX(var(--gv-df, 1)) rotate(-1.4deg); }
    50% { transform: scaleX(var(--gv-df, 1)) rotate(1.4deg); }
}

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
   this is only the glow that picks it out of a pile of six ordinary parts.

   ⚠️ AND IT IS BIGGER THAN EVERYTHING ELSE IN THE PILE. Luke, watching one land: "What does it look like
   on the ground. It should show the sprite of the card properly." It did show the sprite — at 3.2 units,
   which is the size of a gnawed root, and the sprites are DARK: a brown amulet on a brown forest floor at
   thirty-odd pixels is a smudge. The rarest drop in the feature was the hardest one to see.

   5.4 units rather than 3.2, and a light underneath it rather than only a glow around it. The halo alone
   lost against the foliage; a beam has nothing behind it to lose against. */
.gv-drop.is-emblem { width: calc(5.4 * var(--gv-unit, 1%)); height: calc(5.4 * var(--gv-unit, 1%));
    margin-left: calc(-2.7 * var(--gv-unit, 1%)); z-index: 3; }
.gv-drop.is-emblem img {
    filter: drop-shadow(0 0 10px rgba(255,214,130,0.95)) drop-shadow(0 0 22px rgba(255,170,60,0.55))
        drop-shadow(0 2px 4px rgba(0,0,0,0.85)); }
/* The card, lying in the grass. The same object the reveal showed, shrunk -- a drop that looks like one
   thing in the air and a different thing on the floor is a drop the player has to learn twice.
   ⚠️ NO TEXT ON IT AT THIS SIZE. At roughly 60 pixels tall a name renders as a grey smear and makes the
   card look like a bug; the label beside the drop already says what it is. */
.gv-drop-card { position: absolute; inset: 0; display: grid; place-items: center;
    border-radius: 15%; padding: 7%;
    background: linear-gradient(168deg, #6b5330 0%, #48381f 54%, #382b17 100%);
    border: 1px solid #8a6f42;
    box-shadow: inset 0 0 0 1px rgba(255,222,160,0.2), 0 1px 4px rgba(0,0,0,0.8);
    animation: gvBob 1500ms ease-in-out infinite; }
.gv-drop-card > img { width: 100%; height: 100%; object-fit: contain;
    filter: drop-shadow(0 1px 2px rgba(0,0,0,0.8)); }
.gv-drop-card .gv-drop-seal { position: absolute; right: 4%; bottom: 4%; width: 30%; height: 30%; }
/* The beam. Sits behind the amulet, anchored to the floor the amulet is lying on, and does not spin —
   a rotating shaft reads as a portal; a still one reads as "this is worth walking over to". */
.gv-drop.is-emblem::before { content: ""; position: absolute; left: 50%; bottom: -8%;
    width: 220%; height: 300%; transform: translateX(-50%);
    background: radial-gradient(ellipse 34% 50% at 50% 100%, rgba(255,196,96,0.5), rgba(255,170,60,0.18) 45%, transparent 72%);
    animation: gvTrophBeam 2400ms ease-in-out infinite; pointer-events: none; }
@keyframes gvTrophBeam { 0%, 100% { opacity: 0.62; } 50% { opacity: 1; } }
.gv-drop.is-rare img { animation: gvBob 1500ms ease-in-out infinite, gvSheen 2200ms linear infinite; }
/* An emblem's name is longer than a part's and it lands in the same place, so it gets the room to say it. */
.gv-drop.is-emblem b { color: #ffe9b0; border-color: rgba(255,208,120,0.45); }
/* ── THE DOORS AT EACH END OF THE ZONE ─────────────────────────────────────────────────────────
   Standing on the ground at the far walls, so you reach them by walking. Sized against the hero rather
   than the screen: 11 units to his 7, which is the proportion that reads as a thing you go THROUGH.
   ⚠️ SIZED IN UNITS LIKE EVERY OTHER BODY. A door expressed in percent of the scene is a door that
   changes size when the phone rotates, while the hero beside it does not. See
   view-space-constants-break-on-zoom. */
/* ⚠️ A SQUARE BOX, BECAUSE THE SPRITE IS SQUARE. This was 8 wide by 11 tall, and object-fit: contain
   resolves against the SMALLER dimension — so the 1:1 art was capped at 8 units and the doorway came out
   SHORTER than the 7-unit hero standing beside it. A door you walk through cannot be shorter than you; it
   read as a headstone. 12 square puts the arch at 1.7x his height, which is what makes it a doorway. */
.gv-door { position: absolute; left: 0; bottom: var(--gv-ground, 13%);
    width: calc(12 * var(--gv-unit, 1%)); height: calc(12 * var(--gv-unit, 1%));
    margin-left: calc(-6 * var(--gv-unit, 1%));
    padding: 0; border: 0; background: none; cursor: pointer;
    will-change: transform; -webkit-tap-highlight-color: transparent;
    touch-action: manipulation; }
.gv-door img { width: 100%; height: 100%; object-fit: contain; object-position: bottom;
    filter: drop-shadow(0 0 16px rgba(90,230,210,0.45)) drop-shadow(0 4px 6px rgba(0,0,0,0.7)); }
/* A locked door is not a dimmed open one — it is its own sprite, so it only needs its glow taken away.
   Tapping it does nothing by design: there is no handler, so it cannot report a failure nobody asked for. */
.gv-door.is-locked { cursor: default; }
.gv-door.is-locked img { filter: drop-shadow(0 3px 6px rgba(0,0,0,0.75)); }

/* ── A WORKING DOOR IS NEVER QUITE STILL ──────────────────────────────────────────────────────
   The light in the arch drifts whether or not anyone is looking at it, which is the difference between
   a gate and a photograph of a gate. Slow and small — a portal that throbs is a hazard, not a door. */
.gv-door:not(.is-locked) img { animation: gvDoorBreathe 3400ms ease-in-out infinite; }
@keyframes gvDoorBreathe {
    0%, 100% { filter: drop-shadow(0 0 14px rgba(90,230,210,0.38)) drop-shadow(0 4px 6px rgba(0,0,0,0.7)); }
    50% { filter: drop-shadow(0 0 22px rgba(120,245,225,0.62)) drop-shadow(0 4px 6px rgba(0,0,0,0.7)); }
}
/* ⚠️ AND IT NOTICES YOU. Walking up to a thing that does not acknowledge you is the single cheapest way
   for a world to feel dead. The loop toggles .is-near; this is only what that looks like. Scaled from the
   BOTTOM, because a door growing from its middle lifts off the ground it is standing on. */
.gv-door.is-near img { animation: gvDoorNear 1500ms ease-in-out infinite; transform-origin: 50% 100%; }
@keyframes gvDoorNear {
    0%, 100% { transform: scale(1); filter: drop-shadow(0 0 20px rgba(120,245,225,0.6)) drop-shadow(0 4px 6px rgba(0,0,0,0.7)); }
    50% { transform: scale(1.035); filter: drop-shadow(0 0 30px rgba(150,255,235,0.85)) drop-shadow(0 4px 6px rgba(0,0,0,0.7)); }
}

/* ── THE KILL THAT OPENS IT ───────────────────────────────────────────────────────────────────
   The gate arrives: a hard white flash, a kick of scale, and then it settles into its breathing. The
   sparks, the shockwave, the shake and the sound are fired from the loop at the same instant — this is
   only the door's own part of it. Luke asked for juice; a progression beat with no beat is where to spend it. */
.gv-door.is-opening img {
    animation: gvDoorOpen 820ms cubic-bezier(.2, 1.5, .4, 1) both,
        gvDoorBreathe 3400ms ease-in-out 820ms infinite;
    transform-origin: 50% 100%;
}
@keyframes gvDoorOpen {
    0% { transform: scale(0.72); filter: brightness(4) drop-shadow(0 0 46px rgba(190,255,245,1)); }
    45% { transform: scale(1.14); filter: brightness(1.7) drop-shadow(0 0 40px rgba(150,255,235,0.95)); }
    100% { transform: scale(1); filter: drop-shadow(0 0 18px rgba(90,230,210,0.45)) drop-shadow(0 4px 6px rgba(0,0,0,0.7)); }
}
/* ── GOING THROUGH ────────────────────────────────────────────────────────────────────────────
   The zone is rebuilt behind this, so the swap is never seen: new backdrop, new creatures, the hero
   somewhere else. Without it, travelling is a jump cut — the cheapest-looking moment in the feature and
   the one the whole door exists to deliver.

   ⚠️ IT IS THE GATE'S OWN COLOUR, not a white flash or a black fade. A white flash on a dark forest is a
   camera bulb; black is a loading screen. Turquoise says the thing you walked into is what took you.
   ⚠️ AND IT COVERS EVERYTHING — z-index above the vignette and the HUD, because a Leave button sitting
   crisply on top of a transition is what makes it read as an overlay rather than as travel. */
.gv-warp { position: absolute; inset: 0; z-index: 9; pointer-events: none;
    background: radial-gradient(circle at 50% 58%, #9ffff0 0%, #35d6c4 32%, #0b5c57 72%, #061a1a 100%); }
.gv-warp.is-out { animation: gvWarpOut 260ms ease-in both; }
.gv-warp.is-in { animation: gvWarpIn 420ms ease-out both; }
/* Out rushes in from the edges and closes over; in opens back up from the middle, which reads as
   arriving somewhere rather than as the same curtain being pulled twice. */
@keyframes gvWarpOut {
    0% { opacity: 0; transform: scale(1.35); }
    100% { opacity: 1; transform: scale(1); }
}
@keyframes gvWarpIn {
    0% { opacity: 1; transform: scale(1); }
    100% { opacity: 0; transform: scale(1.45); }
}

/* The gate reacts to being used, under the flare — so the last thing seen before the screen floods is
   the thing that caused it. */
.gv-door.is-entering img { animation: gvDoorEnter 260ms ease-in both; transform-origin: 50% 100%; }
@keyframes gvDoorEnter {
    0% { transform: scale(1); filter: drop-shadow(0 0 20px rgba(120,245,225,0.6)); }
    100% { transform: scale(1.5); filter: brightness(3) drop-shadow(0 0 60px rgba(190,255,245,1)); }
}

/* The toll leaves rather than simply stopping being rendered — a number that vanishes between frames reads
   as a glitch, and this one is the thing the player has been counting down for. */
.gv-door.is-opening .gv-door-need { animation: gvTollGone 420ms ease-in both; }
@keyframes gvTollGone {
    0% { transform: translateX(-50%) scale(1); opacity: 1; }
    40% { transform: translateX(-50%) scale(1.3); opacity: 1; }
    100% { transform: translateX(-50%) scale(0.4); opacity: 0; }
}
/* The toll, written on the door itself. A skull and a number, because "14" beside a skull needs no label
   and survives being read at a glance from across the zone. */
.gv-door-need { position: absolute; left: 50%; bottom: 66%; transform: translateX(-50%);
    display: flex; align-items: center; gap: calc(0.5 * var(--gv-unit, 1%));
    padding: calc(0.4 * var(--gv-unit, 1%)) calc(0.9 * var(--gv-unit, 1%));
    border-radius: 999px; background: rgba(6,10,6,0.82);
    border: 1px solid rgba(255,255,255,0.18); pointer-events: none; }
.gv-door-need img { width: calc(2.2 * var(--gv-unit, 1%)); height: calc(2.2 * var(--gv-unit, 1%));
    filter: none; }
.gv-door-need b { font-size: calc(2 * var(--gv-unit, 1%)); font-weight: 800; color: #f3ead9;
    line-height: 1; text-shadow: 0 1px 3px rgba(0,0,0,0.9); }

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
/* ── ⚠️ THE NUMBER IS DRAWN AT A SCALE THE LOOP OWNS ───────────────────────────────────────────
   Luke: "damage numbers and hp bar effects should be way more juicy."

   Two separate things were missing and both are multiplied into --gv-ns by the loop rather than set here:

     THE PUNCH   it arrives at 1.85x and snaps to 1 in 150ms (popScale in grove-juice.js). A number that
                 simply appears at its final size reads as a label that was always going to be there; the
                 snap is the same anticipation-then-strike the swing is built from, at a tenth of the length.
     THE WEIGHT  a hit is sized by the SHARE of the target it took off (popWeight), so 4 off a rootrat and
                 400 off the Elder no longer arrive identical. A flat damage threshold cannot do this —
                 400 is enormous on a rat and a scratch on a boss.

   ⚠️ SO font-size HERE IS THE BASE AND NOTHING MAY SET IT PER KIND ANY MORE. A per-kind font-size would
   be multiplied by the same --gv-ns and the two scales would fight; the kinds differ by colour, weight and
   their own --gv-nb base instead. */
.gv-num { position: absolute; left: 0; bottom: var(--gv-ground, 13%);
    font-weight: 900; font-size: calc(1.05rem * var(--gv-nb, 1));
    white-space: nowrap; pointer-events: none; will-change: transform, opacity;
    transform-origin: 50% 100%;
    /* A hard dark edge, not a blur. These land on a painted forest of every value from black bark to lit
       moss, and a soft shadow disappears against the light half of it — the number has to carry its own
       contrast rather than borrow it from whatever is behind. */
    -webkit-text-stroke: calc(0.1em) rgba(12,10,8,0.92);
    paint-order: stroke fill;
    text-shadow: 0 2px 5px rgba(0,0,0,0.9); }
/* ── ⚠️ LOOT ARRIVES WITH ITS OWN FACE ────────────────────────────────────────────────────────
   Luke: "You should actually see the sprite and the name of it." The drop spends its whole life as a
   sprite on the floor and then turned into a line of text at the exact moment it became a reward. */
.gv-num.is-loot img { width: 1.5em; height: 1.5em; margin-right: 0.3em; vertical-align: -0.38em;
    object-fit: contain; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.85)); }

/* ── ⚠️ A PROC IS NOT A DAMAGE NUMBER ─────────────────────────────────────────────────────────
   Luke: "if something procs like haste it should be dopamine inducing."

   HASTE used to render in the same cream as every ordinary hit, at the same size, drifting up beside
   four real damage numbers -- the one moment the player's own gear did something was indistinguishable
   from the thing it happened next to. This is wider, tracked out, electric rather than warm, and it
   carries a ring out of the hero. Warm is what damage looks like in this game; a proc has to not be
   warm or it joins the same conversation. */
.gv-proc { position: absolute; left: 0; bottom: var(--gv-ground, 13%);
    font-weight: 900; font-size: calc(0.92rem * var(--gv-nb, 1)); letter-spacing: 0.22em;
    white-space: nowrap; pointer-events: none; will-change: transform, opacity;
    transform-origin: 50% 100%; text-transform: uppercase;
    -webkit-text-stroke: 0.09em rgba(6,12,18,0.95); paint-order: stroke fill;
    color: #9fe8ff;
    text-shadow: 0 2px 6px rgba(0,0,0,0.9), 0 0 16px rgba(80,200,255,0.95), 0 0 36px rgba(40,140,255,0.6); }
.gv-proc.is-haste { color: #9fe8ff; }
/* ── ⚠️ THE HEAL IS GREEN, AND IT IS THE ONLY PROC THAT CARRIES AN OBJECT ─────────────────────
   Luke: "when it gets used it should be clear. And sexy, showing it happens and the effect."

   Haste is electric because it is a stat firing. This is a thing the player MADE being spent, so the
   thing itself is in the call -- the same sprite that sits on the belt chip at the top of the screen,
   which is what ties the two into one object rather than two notifications about one event.

   Green rather than blue because it is the colour of the heal number it arrives with and of the ring it
   throws, and because warm is damage in this game: the one moment the player gets something BACK must
   not be in the palette of the thing taking it away. */
/* ⚠️ CENTRED WITH THE translate PROPERTY, NOT INSIDE transform. The loop rewrites style.transform on
   this node sixty times a second (world position, arrival punch, tilt), so a -50% folded in there would
   be wiped on the next frame -- the same trap as a keyframe animation on a pop. translate is a separate
   channel that composes with it and the loop never touches it.

   ⚠️ AND NO BACKTICKS IN HERE. This block is inside a template literal; the first draft quoted the two
   property names in backticks and ended the string mid-comment, which took the whole stylesheet out and
   photographed as the zone failing to render at all. check:css is what said so.

   Only the heal, deliberately: the haste proc is left-anchored, tuned and shipped, and moving it is not
   this change's business. This one carries a sprite and a two-word name, so it is nearly three times as
   wide and hangs off the hero's shoulder instead of sitting over him. */
/* ── THE COLD, AND THE ONE THAT IS BOTH ───────────────────────────────────────────────────────
   FROZEN, STUNNED and CHILLED used to be drawn at damage-number size while SURGE and HASTE got the big
   tracked call-out with a ring behind it -- so the most dramatic things in the game were the quietest
   on screen. A freeze that stops a creature dead for two seconds should not land softer than an
   attack-speed buff. */
.gv-proc.is-ice { translate: -50% 0; color: #cdeaff; letter-spacing: 0.22em;
    text-shadow: 0 2px 6px rgba(0,0,0,0.9), 0 0 16px rgba(140,210,255,0.95), 0 0 34px rgba(60,150,255,0.6); }
.gv-boom.is-ice { border-color: rgba(190,230,255,0.95); }
.gv-boom.is-surge { border-color: rgba(255,210,110,0.95); }
.gv-boom.is-guard { border-color: rgba(175,215,255,0.95); }
.gv-boom.is-riposte { border-color: rgba(255,225,160,0.95); }
.gv-boom.is-grudge { border-color: rgba(255,120,100,0.95); }
/* The call-outs each wear their own particle's colour, so the word and the burst are one event. */
/* ── REND ─────────────────────────────────────────────────────────────────────────────────────
   The Reaver's word, and the only proc in the zone that had none. Arterial red, hotter than the
   bleed ticks it starts so the CAUSE reads louder than its instalments. */
.gv-proc.is-bleed { translate: -50% 0; color: #ff6b6b; letter-spacing: 0.2em;
    text-shadow: 0 2px 6px rgba(0,0,0,0.9), 0 0 14px rgba(255,70,70,0.9), 0 0 30px rgba(190,20,20,0.6); }

/* And the instalments. Deeper than the call-out above and deliberately NOT the sword's cream:
   a wound ticking is a different event from the blow that opened it. */
.gv-num.is-bleed { color: #ff8b8b; --gv-nb: 0.88;
    text-shadow: 0 2px 5px rgba(0,0,0,0.9), 0 0 12px rgba(255,80,80,0.8); }

.gv-proc.is-chill { translate: -50% 0; color: #bfe8ff; letter-spacing: 0.2em;
    text-shadow: 0 2px 6px rgba(0,0,0,0.9), 0 0 14px rgba(120,190,255,0.8); }
.gv-proc.is-surge { translate: -50% 0; color: #ffe9a8; letter-spacing: 0.26em;
    text-shadow: 0 2px 6px rgba(0,0,0,0.9), 0 0 18px rgba(255,190,60,0.95); }
.gv-proc.is-guard { translate: -50% 0; color: #dcebff; letter-spacing: 0.2em;
    text-shadow: 0 2px 6px rgba(0,0,0,0.9), 0 0 16px rgba(130,185,255,0.9); }
.gv-proc.is-riposte { translate: -50% 0; color: #fff2cf; letter-spacing: 0.22em;
    text-shadow: 0 2px 6px rgba(0,0,0,0.9), 0 0 16px rgba(255,210,120,0.95); }
.gv-proc.is-grudge { translate: -50% 0; color: #ff8a7a; letter-spacing: 0.18em;
    text-shadow: 0 2px 6px rgba(0,0,0,0.9), 0 0 18px rgba(220,50,40,0.9); }
.gv-proc.is-wild { translate: -50% 0; color: #c6ffb0; letter-spacing: 0.22em;
    text-shadow: 0 2px 6px rgba(0,0,0,0.9), 0 0 16px rgba(120,255,160,0.9); }
/* Hot white, the stun's own. Warm because a blow landed; not gold, because a crit already owns gold. */
.gv-proc.is-stun { translate: -50% 0; color: #fffdf2; letter-spacing: 0.22em;
    text-shadow: 0 2px 6px rgba(0,0,0,0.9), 0 0 16px rgba(255,235,170,0.95), 0 0 32px rgba(255,200,80,0.6); }
.gv-boom.is-stun { border-color: rgba(255,240,190,0.95); }
/* Both halves at once, so it wears both colours and is the only thing on screen that does. */
.gv-proc.is-cata { translate: -50% 0; color: #ffd9a0; letter-spacing: 0.26em;
    text-shadow: 0 2px 6px rgba(0,0,0,0.95), 0 0 18px rgba(255,150,60,0.95), 0 0 38px rgba(120,190,255,0.8); }
.gv-boom.is-cata { border-color: rgba(255,200,140,0.95); }
/* Soulfire is a second blow of pure magic off the first, so it is neither a hit colour nor a crit one. */
/* ⚠️ A BLOCKED BLOW HAS TO LOOK BLOCKED. Cream is what an ordinary blow landing on you looks like; a
   blow your shield turned aside is a different event and printing it in the same colour at a smaller
   size says only "that one hurt less", which a weak creature also says. */
/* ⚠️ THORNS ARE NOT YOUR SWORD. They land on the creature in the same place a hit does, so in cream
   they read as the blow the player just struck -- and the whole appeal of the node is that being
   ATTACKED hurts them. Steel, because it is the shield doing it, and it is the same steel the blocked
   number wears: one colour for "your defence did this", wherever it lands. */
.gv-num.is-thorn { color: #a9c8ef; --gv-nb: 0.84;
    text-shadow: 0 2px 5px rgba(0,0,0,0.9), 0 0 12px rgba(150,200,255,0.8); }
.gv-num.is-warded { color: #bcd8ff;
    text-shadow: 0 2px 6px rgba(0,0,0,0.9), 0 0 14px rgba(150,200,255,0.85); }
.gv-num.is-soul { color: #e3b8ff; --gv-nb: 0.9;
    text-shadow: 0 2px 6px rgba(0,0,0,0.9), 0 0 16px rgba(190,120,255,0.9); }

/* ── MULTI-KILL ───────────────────────────────────────────────────────────────────────────────
   ⚠️ IT IS NOT A DAMAGE NUMBER AND MUST NOT LOOK LIKE ONE. Every other number thrown off a creature
   reports what came off its health; this one reports how much of the ZONE just closed, and it is thrown
   from the same body on the same frame as the hit that caused it. Cream or gold here and the player
   reads two damage numbers and wonders which is real.

   So: green, which in this scene belongs to progress and pickup (the loot label and the pet's bite),
   bigger than a crit, and the only number in the game that is wider than it is tall. */
.gv-num.is-multi { color: #9df08a; --gv-nb: 1.72; font-weight: 900; letter-spacing: 0.06em;
    -webkit-text-stroke: 0.07em rgba(10,20,8,0.92);
    text-shadow: 0 2px 7px rgba(0,0,0,0.95), 0 0 18px rgba(120,255,110,0.85), 0 0 38px rgba(60,200,60,0.5); }

/* ── THE WARDEN'S ANSWER ──────────────────────────────────────────────────────────────────────
   Steel rather than heat. Every other call-out in here is something the player DID to a creature --
   a crit, a haste proc, a poultice -- and this one is something that did not happen to them, which is
   a different kind of good news and should not share a palette with damage. */
.gv-proc.is-block { translate: -50% 0; color: #bcd8ff; letter-spacing: 0.2em;
    text-shadow: 0 2px 6px rgba(0,0,0,0.9), 0 0 14px rgba(150,200,255,0.9), 0 0 30px rgba(70,130,220,0.55); }
.gv-boom.is-block { border-color: rgba(170,210,255,0.9); }
.gv-proc.is-heal { translate: -50% 0; color: #8dffb8; letter-spacing: 0.16em;
    text-shadow: 0 2px 6px rgba(0,0,0,0.9), 0 0 16px rgba(80,255,160,0.9), 0 0 36px rgba(30,200,110,0.6); }
/* Sized off the type like the loot pop's, so the object scales with the number beside it rather than
   being a fixed pixel count that is huge on a phone and lost on a desktop. */
.gv-proc.is-heal img { width: 1.5em; height: 1.5em; margin-right: 0.34em; vertical-align: -0.4em;
    object-fit: contain; filter: drop-shadow(0 2px 5px rgba(0,0,0,0.85)); }
.gv-boom.is-heal { border-color: rgba(125,255,175,0.95); }
/* Motes rising off him rather than sparks flying off a blow: no gravity to fight, softer light, and the
   green the rest of the beat is in. */
.gv-spark.is-heal { background: #c8ffd8; box-shadow: 0 0 8px 3px rgba(110,255,165,0.8); }

/* The ring a crit throws, and the one a proc throws. ⚠️ A CRIT'S IS THE ONLY THING AN ORDINARY HIT
   NEVER DOES -- everything else between them is a difference of degree, and degrees stop reading once
   they are happening sixty times a minute. */
.gv-boom.is-crit { border-color: rgba(255,186,80,0.95); }
.gv-boom.is-haste { border-color: rgba(120,215,255,0.95); }

.gv-num.is-hit { color: #ffe9a8; }
/* ⚠️ A CRIT IS A DIFFERENT EVENT, NOT A BIGGER NUMBER. Bigger alone reads as more damage; what says CRIT
   is that it is a different colour, it is lit from inside, and it arrives at an angle nothing else does. */
.gv-num.is-crit { color: #ffcf5a; --gv-nb: 1.58; letter-spacing: -.02em;
    text-shadow: 0 2px 6px rgba(0,0,0,0.9), 0 0 18px rgba(255,150,40,0.95), 0 0 34px rgba(255,110,20,0.6); }
/* The loudest a hit gets without being a crit: a hit worth a seventh of the target. Same colour family as
   an ordinary hit, so the ladder still reads as one scale rather than as a third kind of event. */
/* ── ⚠️ A BURN TICK IS NOT A SWORD TICK ───────────────────────────────────────────────────────
   Bleed ticks wear the ordinary hit cream because a wound is the weapon still working. Fire is the
   other tree's identity and the only way a Runecaller is visibly a Runecaller in a zone, so it gets its
   own heat -- and it has to be legible against a forest of every green there is, hence the hard stroke
   the rest of these carry rather than a glow doing the work. */
.gv-num.is-burn { color: #ffb347;
    text-shadow: 0 2px 6px rgba(0,0,0,0.9), 0 0 16px rgba(255,140,40,0.95), 0 0 32px rgba(255,90,10,0.6); }
/* The motes thrown when fire catches the body beside it. Warmer and sparser than a blow's sparks --
   this is something igniting, not something being struck. */
.gv-spark.is-burn { background: #ffd9a0; box-shadow: 0 0 8px 3px rgba(255,150,50,0.85); }
.gv-num.is-big { color: #fff3c4; text-shadow: 0 2px 6px rgba(0,0,0,0.9), 0 0 16px rgba(255,205,110,0.7); }
/* ── ⚠️ THE PET'S NUMBER IS COOL AND SMALL, AND BOTH ARE LOAD-BEARING ─────────────────────────
   Warm is what the player's own damage looks like in this game -- cream for a hit, gold for a crit, pale
   gold for a big one. The pet's bite is the same KIND of event from a different body, so it has to be
   legible as damage while never competing with the number the player is actually reading.

   Cool green does that in one move, and it is the pet's existing colour: .gv-pet's fallback gradient is
   green and the claw mark above is green, so a green number is the third thing saying the same thing
   rather than a fourth colour to learn. 0.78 keeps it clearly subordinate -- the pet bites for about a
   third of your blow, and a number the same size as yours would claim parity it does not have. */
.gv-num.is-pet { color: #aef09a; --gv-nb: 0.78; font-weight: 800;
    text-shadow: 0 2px 5px rgba(0,0,0,0.9), 0 0 12px rgba(120,230,110,0.5); }
.gv-num.is-took { color: #ff6b6b; --gv-nb: 1.08; }
.gv-num.is-heal { color: #7cffb2; }
.gv-num.is-loot { color: #cdf5bd; --gv-nb: 0.74; font-weight: 700; -webkit-text-stroke: 0.07em rgba(12,10,8,0.9); }

/* ── ⚠️ THE ENEMY'S OWN BAR ────────────────────────────────────────────────────────────────────
   Luke: "Enemies should have hp bars."

   ⚠️ IT IS NOT ON ALL THIRTY OF THEM AT ONCE, AND THAT IS THE WHOLE DESIGN. A zone carries 15 to 30
   wandering creatures; a permanent bar over every one of them is a row of interface strung across a
   painted forest, and it would undo the work that made these read as animals in a place rather than
   targets on a screen. The loop puts is-on only on a creature that is HURT or is the one being fought,
   and takes it off again a couple of seconds later — which is also what keeps it cheap, because only the
   handful that are showing one have their chase bar stepped.

   Sized in units like every other thing in the world, so it holds its proportion against the creature at
   any zoom; a bar in pixels is a tag that grows relative to a shrinking rootrat. */
/* ⚠️ THE WIDTH TRACKS THE CREATURE BUT IS CLAMPED AT BOTH ENDS. Sized purely off --gv-h, an Elderling at
   twelve units got a bar eleven units wide — a third of a phone screen, floating over a sprite half hidden
   behind the hero, reading as a loading bar rather than as that animal's health. And a grub at three units
   got a bar too short to show a chase chunk in. The creature's size still decides it, between a floor and
   a ceiling, which is the same shape as the hero scale in grove-view.js and for the same reason. */
.gv-ehp { position: absolute; left: 50%; bottom: 100%; z-index: 2;
    width: clamp(calc(3.6 * var(--gv-unit, 1%)),
        calc(var(--gv-h, 7) * 0.9 * var(--gv-unit, 1%)),
        calc(7.5 * var(--gv-unit, 1%)));
    height: calc(0.52 * var(--gv-unit, 1%));
    min-height: 3px;
    margin: 0 0 calc(0.5 * var(--gv-unit, 1%)) 0;
    transform: translateX(calc(-50% + var(--gv-bj, 0px))) scaleY(var(--gv-bs, 1));
    transform-origin: 50% 100%;
    border-radius: 999px; overflow: hidden;
    background: rgba(8,10,8,0.72);
    box-shadow: 0 0 0 1px rgba(0,0,0,0.55), 0 1px 3px rgba(0,0,0,0.6);
    opacity: 0; transition: opacity 180ms linear; pointer-events: none; }
.gv-ehp.is-on { opacity: 1; }
/* ⚠️ THE PLAYER'S OWN BAR, AND IT IS THE SAME STRIP ON PURPOSE. Luke: "I cant see my hp, was hoping
   to see that above my char." Not the .gv-hp strip he had removed -- that was a HUD bar across the top
   of the screen and it stays deleted. This is the over-head bar every creature already wears, on the
   one body that lacked one, so his health is read where his eyes already are.
   Slightly taller and ringed, because among thirty creatures wearing the same strip the player has to
   be able to pick out their own at a glance. */
.gv-ehp.is-hero { height: calc(0.68 * var(--gv-unit, 1%)); min-height: 4px;
    box-shadow: 0 0 0 1px rgba(255,255,255,0.30), 0 0 0 2px rgba(0,0,0,0.6), 0 2px 5px rgba(0,0,0,0.65); }
.gv-ehp u, .gv-ehp i, .gv-ehp s { position: absolute; left: 0; top: 0; height: 100%; display: block;
    border-radius: inherit; }
/* The ghost: where the health WAS, catching up, so the chunk just taken off is a shape rather than a
   difference between two numbers you never read. Same pair as the boss bar. */
.gv-ehp u { background: linear-gradient(180deg, #ffd9d0, #ff6a4a); }
.gv-ehp i { background: linear-gradient(180deg, var(--gv-bar1, #9be36a), var(--gv-bar2, #5aa833)); }
/* The strike: a white wash over the WHOLE strip for a fifth of a second. This is the part that makes a bar
   feel hit rather than merely shorter, and it has to cover the whole bar — a flash only on the lost
   segment is invisible on the hit that takes two percent. */
.gv-ehp s { width: 100%; background: #fff; opacity: var(--gv-bf, 0); }

/* ── AND THE BOSS BAR TAKES THE SAME TREATMENT ─────────────────────────────────────────────────
   It had the chase pair and nothing else, which against seven thousand hit points meant a good hit moved
   it by a pixel and a half and felt like a bad one. */
.gv-boss span { transform: translateX(var(--gv-bj, 0px)) scaleY(var(--gv-bs, 1)); transform-origin: 50% 50%; }
.gv-boss s { position: absolute; left: 0; top: 0; width: 100%; height: 100%; display: block;
    border-radius: inherit; background: #fff; opacity: var(--gv-bf, 0); }

.gv-spark { position: absolute; left: 0; bottom: var(--gv-ground, 13%);
    width: calc(0.5 * var(--gv-unit, 1%)); height: calc(0.5 * var(--gv-unit, 1%));
    margin: 0 0 calc(-0.25 * var(--gv-unit, 1%)) calc(-0.25 * var(--gv-unit, 1%));
    border-radius: 50%; pointer-events: none; will-change: transform, opacity;
    background: #fff6cf; box-shadow: 0 0 6px 2px rgba(255,220,130,0.8); }
.gv-spark.is-crit { background: #fff; box-shadow: 0 0 9px 3px rgba(255,170,60,0.95); }
/* The pet's bite throws its own colour, and fewer of them (PET_SPARKS). Smaller too: the spark is the
   thing that says a blow CONNECTED, and the pet's connects for less. */
.gv-spark.is-pet { width: calc(0.34 * var(--gv-unit, 1%)); height: calc(0.34 * var(--gv-unit, 1%));
    margin: 0 0 calc(-0.17 * var(--gv-unit, 1%)) calc(-0.17 * var(--gv-unit, 1%));
    background: #ddffcc; box-shadow: 0 0 5px 2px rgba(150,240,120,0.75); }
/* ── ⚠️ A PARTICLE PER KIND, BECAUSE A COLOURED WORD IS NOT AN EFFECT ─────────────────────────
   Luke: "the effects should be cool, not words, or not just words." Every proc in here used to be a
   caption with a ring behind it; these are the things the caption is a label FOR.

   Ice is the one that is not round. A shard reads as ice the moment it is not a dot, and it is the
   cheapest possible way to say "this is a different element" -- no new art, one border-radius. */
/* ⚠️ BIGGER AND BLUER THAN THE FIRST CUT. At spark size in near-white they read as the ordinary hit
   sparks they sit next to -- against a lit forest everything pale looks the same. A shard has to be
   large enough to show it is not round and saturated enough to be a colour rather than a highlight. */
.gv-spark.is-ice { width: calc(0.95 * var(--gv-unit, 1%)); height: calc(0.95 * var(--gv-unit, 1%));
    margin: 0 0 calc(-0.47 * var(--gv-unit, 1%)) calc(-0.47 * var(--gv-unit, 1%));
    border-radius: 2px 70% 2px 70%; background: #7fd4ff;
    box-shadow: 0 0 14px 5px rgba(60,170,255,0.95); }
/* A stun is a blow that rang their head -- hot white, hard, and gone quickly. */
.gv-spark.is-stun { background: #fffdf2; box-shadow: 0 0 9px 3px rgba(255,225,150,0.95); }
/* Soulfire is magic: cooler light, softer edge, and it drifts rather than flying. */
.gv-spark.is-soul { width: calc(0.72 * var(--gv-unit, 1%)); height: calc(0.72 * var(--gv-unit, 1%));
    margin: 0 0 calc(-0.36 * var(--gv-unit, 1%)) calc(-0.36 * var(--gv-unit, 1%));
    background: #d59bff; box-shadow: 0 0 14px 5px rgba(170,70,255,0.9); }
/* Steel off a shield arm. Pale and hard, the same family as the blocked number and the thorns. */
.gv-spark.is-block { background: #e8f1ff; box-shadow: 0 0 8px 3px rgba(150,200,255,0.9); }
/* ── ⚠️ ONE LOOK PER ABILITY, BECAUSE SHARING ONE MAKES TWO NODES THE SAME NODE ───────────────
   Luke: "every ability should have effects that are unique." Surge was wearing haste's particle, so
   the one proc a player can SEE COMING looked identical to the one they cannot. Guard, block, riposte
   and grudge were all one steel. Chill was wearing the freeze's, which made the cheap one look like
   the rare one landing weakly. */
/* Chill: the same family as ice and deliberately smaller and softer -- slowed, not stopped. */
.gv-spark.is-chill { width: calc(0.5 * var(--gv-unit, 1%)); height: calc(0.5 * var(--gv-unit, 1%));
    margin: 0 0 calc(-0.25 * var(--gv-unit, 1%)) calc(-0.25 * var(--gv-unit, 1%));
    background: #bfe8ff; box-shadow: 0 0 8px 3px rgba(120,190,255,0.6); }
/* Surge: gold and square-edged, because it is charge rather than light. */
.gv-spark.is-surge { width: calc(0.8 * var(--gv-unit, 1%)); height: calc(0.8 * var(--gv-unit, 1%));
    margin: 0 0 calc(-0.4 * var(--gv-unit, 1%)) calc(-0.4 * var(--gv-unit, 1%));
    border-radius: 2px; background: #ffe9a8; box-shadow: 0 0 14px 5px rgba(255,190,60,0.95); }
/* Guard: the shield seating. Wide, pale, and short-lived. */
.gv-spark.is-guard { width: calc(0.85 * var(--gv-unit, 1%)); height: calc(0.85 * var(--gv-unit, 1%));
    margin: 0 0 calc(-0.42 * var(--gv-unit, 1%)) calc(-0.42 * var(--gv-unit, 1%));
    background: #dcebff; box-shadow: 0 0 12px 5px rgba(130,185,255,0.9); }
/* Riposte: the answer. Hot and narrow, because it is a point rather than a plate. */
.gv-spark.is-riposte { width: calc(0.42 * var(--gv-unit, 1%)); height: calc(0.9 * var(--gv-unit, 1%));
    margin: 0 0 calc(-0.45 * var(--gv-unit, 1%)) calc(-0.21 * var(--gv-unit, 1%));
    border-radius: 2px; background: #fff2cf; box-shadow: 0 0 12px 4px rgba(255,210,120,0.95); }
/* Grudge: everything they did to you coming back at once. The only deep red in the kit. */
.gv-spark.is-grudge { width: calc(0.9 * var(--gv-unit, 1%)); height: calc(0.9 * var(--gv-unit, 1%));
    margin: 0 0 calc(-0.45 * var(--gv-unit, 1%)) calc(-0.45 * var(--gv-unit, 1%));
    background: #ff8a7a; box-shadow: 0 0 14px 5px rgba(220,50,40,0.9); }
/* Wild: it picks one of three at random, so it is the one that is not a single colour. */
.gv-spark.is-wild { width: calc(0.7 * var(--gv-unit, 1%)); height: calc(0.7 * var(--gv-unit, 1%));
    margin: 0 0 calc(-0.35 * var(--gv-unit, 1%)) calc(-0.35 * var(--gv-unit, 1%));
    background: #c6ffb0; box-shadow: 0 0 12px 4px rgba(120,255,160,0.85); }
/* Dust is bigger, slower and has no light of its own — it is displaced earth, not energy. */
.gv-spark.is-dust { width: calc(1.1 * var(--gv-unit, 1%)); height: calc(1.1 * var(--gv-unit, 1%));
    margin: 0 0 calc(-0.55 * var(--gv-unit, 1%)) calc(-0.55 * var(--gv-unit, 1%));
    background: rgba(170,152,120,0.55); box-shadow: none; }

/* The ring an attack leaves when it resolves. It is the difference between damage arriving and damage
   LANDING somewhere — the player needs to see the place the thing they dodged went off. */
/* ── THE AoE RING ─────────────────────────────────────────────────────────────────────────────
   Luke: "the most important thing for me is that the AoE and the being able to see the AoE happen.
   Up until now, we really haven't been able to show skill effects in a way that I'm satisfied with."

   ⚠️ SIZED FROM THE REAL RADIUS, PASSED IN AS --r IN WORLD UNITS. Every other ring in this scene is a
   fixed 9-unit ellipse, which is fine for "something happened here" and useless for an area: an AoE
   whose edge you cannot see is just numbers appearing on things you did not aim at. This one is drawn
   at exactly the radius the damage used, so the picture IS the hitbox.

   It expands from nothing to full over 520ms and fades — a ring that appears at full size reads as a
   decal, a ring that GROWS reads as a shockwave leaving the body. Flat ellipse rather than a circle
   because the stage is side-on: a true circle reads as a sphere hanging in the air. */
.gv-nova { position: absolute; left: 0; bottom: var(--gv-ground, 13%);
    width: calc(var(--r, 4) * 2 * var(--gv-unit, 1%));
    height: calc(var(--r, 4) * 0.8 * var(--gv-unit, 1%));
    margin-left: calc(var(--r, 4) * -1 * var(--gv-unit, 1%));
    margin-bottom: calc(var(--r, 4) * -0.4 * var(--gv-unit, 1%));
    border-radius: 50%; pointer-events: none; will-change: transform, opacity;
    border: 3px solid rgba(255,120,90,0.95);
    box-shadow: 0 0 26px 6px rgba(255,90,60,0.45), inset 0 0 34px 10px rgba(255,120,70,0.3);
    animation: gv-nova-grow 520ms cubic-bezier(.12,.75,.3,1) both; }
.gv-nova.is-corpse { border-color: rgba(255,70,70,0.95);
    box-shadow: 0 0 30px 8px rgba(220,30,30,0.5), inset 0 0 40px 12px rgba(200,20,20,0.34); }
.gv-nova.is-frost { border-color: rgba(150,225,255,0.95);
    box-shadow: 0 0 30px 8px rgba(90,190,255,0.5), inset 0 0 40px 12px rgba(120,200,255,0.3); }
.gv-nova.is-burn { border-color: rgba(255,190,80,0.95);
    box-shadow: 0 0 30px 8px rgba(255,150,40,0.5), inset 0 0 40px 12px rgba(255,170,60,0.32); }
@keyframes gv-nova-grow {
    0%   { transform: scale(0.12); opacity: 0; }
    18%  { opacity: 1; }
    70%  { opacity: 0.85; }
    100% { transform: scale(1); opacity: 0; }
}

/* The numbers an area deals. Distinct from a sword's cream and a wound's red: an AoE tick is neither
   of those, and several of them land on the same frame. */
.gv-num.is-nova { color: #ffbf7a; --gv-nb: 1.04; font-weight: 900;
    text-shadow: 0 2px 6px rgba(0,0,0,0.95), 0 0 16px rgba(255,140,60,0.85); }

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

/* ── A BOSS NOTICING YOU ──────────────────────────────────────────────────────────────────────
   The name arrives across the middle of the screen once, then gets out of the way and leaves the bar
   behind. It is deliberately the only thing in the zone that uses the middle of the frame: everything
   else is corners and ground line, so the centre still means something when it is finally used.

   ⚠️ pointer-events: none, OR IT EATS THE FIRST TAP OF THE FIGHT. It covers the whole width for two
   seconds, which is exactly the two seconds in which the player is reaching for the boss. */
/* -- THE WISHLIST, ON THREE SURFACES ------------------------------------------------------------
   Luke: "You should be able to tap ingredients to add to wish list and see on the map where to find
   and above enemies which items they have that you wish for, and you can tap to remove similar to how
   yoi add. And an abikity to clear your wishlist."

   ⚠️ ONE LANGUAGE ACROSS ALL THREE, AND IT IS THE PART'S OWN PICTURE. A bench chip, a map node and an
   enemy's head are three completely different contexts, and the one thing that has to survive the trip
   between them is "this is the thing I am looking for". A badge, a dot or a count would each need
   learning once per surface. The sprite needs learning never. Luke, on the screen before this one:
   "Dont use words to explain use proffesional design."

   The shared mark is the GOLD RING. Wished on the bench, wished on the map, wished over a creature. */
.gv-cost li > button { display: flex; align-items: center; gap: 5px; min-height: 32px; padding: 3px 9px 3px 4px;
    border-radius: 999px; border: 1px solid transparent; background: none; cursor: pointer;
    font: inherit; color: inherit; -webkit-tap-highlight-color: transparent; }
.gv-cost li > button.is-wished { border-color: #e0a83c; background: rgba(224,168,60,0.16);
    box-shadow: 0 0 10px rgba(224,168,60,0.25); }

/* THE MAP NODE. Pinned to the node's top-right corner, outside the label, so it never collides with the
   zone name -- which has its own history of wrapping to three lines in a box the width of a shrub. */
.gv-node-wish { position: absolute; top: -6px; right: -6px; z-index: 3; display: flex; align-items: center;
    gap: 1px; padding: 2px 4px; border-radius: 999px;
    background: rgba(18,12,4,0.86); border: 1px solid #e0a83c;
    box-shadow: 0 2px 8px rgba(0,0,0,0.5), 0 0 12px rgba(224,168,60,0.3); }
.gv-node-wish img { width: 18px; height: 18px; object-fit: contain; display: block; }
.gv-node-wish i { font-style: normal; font-size: 0.6rem; font-weight: 800; color: #ffd75e; padding: 0 2px; }

/* OVER A CREATURE'S HEAD. Above the health bar, which already owns the strip directly over a body.
   ⚠️ pointer-events: none -- the whole creature is one button and tapping it is how you attack. A marker
   that swallowed the tap would make the enemy you most want to hit the one you cannot. */
.gv-foe-wish { position: absolute; left: 50%; bottom: 100%; transform: translate(-50%, -4px);
    pointer-events: none; display: flex; gap: 1px; padding: 2px 3px; border-radius: 999px;
    background: rgba(18,12,4,0.8); border: 1px solid #e0a83c;
    box-shadow: 0 0 10px rgba(224,168,60,0.4);
    animation: gvWishBob 2200ms ease-in-out infinite; }
.gv-foe-wish img { width: 16px; height: 16px; object-fit: contain; display: block; }
@keyframes gvWishBob { 0%, 100% { transform: translate(-50%, -4px); }
    50% { transform: translate(-50%, -8px); } }

/* THE LIST ITSELF, under the map's pips. Scrolls sideways rather than wrapping: the map sheet is short on
   a phone and a second row of chips would come out of the map. */
.gv-wishbar { display: flex; align-items: center; gap: 7px; margin-top: 8px; }
.gv-wishbar > ul { flex: 1; min-width: 0; list-style: none; margin: 0; padding: 2px;
    display: flex; gap: 5px; overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
.gv-wishbar > ul::-webkit-scrollbar { display: none; }
.gv-wishbar li { flex: none; }
.gv-wishbar li > button { display: grid; place-items: center; width: 34px; height: 34px; padding: 0;
    border-radius: 9px; cursor: pointer; background: rgba(18,12,4,0.5); border: 1px solid #e0a83c;
    -webkit-tap-highlight-color: transparent; }
/* ⚠️ IT HAS TO LOOK PRESSABLE ON PARCHMENT. The first pass used the dark-panel treatment -- a grey
   glyph on a translucent black chip -- and on the map's cream paper that is exactly how this codebase
   draws a DISABLED control. It sits beside live gold chips, so it takes the paper's own ink. */
.gv-wish-clear { flex: none; display: grid; place-items: center; width: 34px; height: 34px; padding: 0;
    border-radius: 9px; cursor: pointer; color: #5c4a2a;
    background: rgba(92,74,42,0.1); border: 1px solid rgba(92,74,42,0.38); }
.gv-wish-clear svg { width: 18px; height: 18px; }

/* -- THE HAUL, DOWN THE LEFT -------------------------------------------------------------------
   Luke: "I want to see them pop up on the left side in like a snack bar that tells me how many I got.
   And if you get more, it makes the amount go up so that it stays there longer."

   A tally, not an alert. It sits on the left wall at mid height, over empty sky in every zone -- the
   hero lives on the lower right of the frame and the boss bar owns the top, so this is the one strip of
   the screen a running list can hold without covering anything that matters.

   ⚠️ pointer-events: none ON THE LIST. Every tap in a zone is a move order on the world underneath, and
   a list that grows under the player's thumb while they are walking left would silently eat those taps.
   Nothing in here is pressable and nothing in here may become pressable. */
.gv-haul { position: absolute; left: max(8px, env(safe-area-inset-left)); top: 42%;
    transform: translateY(-50%); z-index: 5; pointer-events: none;
    list-style: none; margin: 0; padding: 0;
    display: flex; flex-direction: column; gap: 5px; max-width: min(56vw, 230px); }
.gv-haul li { display: flex; align-items: center; gap: 7px; padding: 4px 9px 4px 4px;
    border-radius: 999px; background: rgba(8,11,8,0.68); border: 1px solid rgba(255,255,255,0.1);
    box-shadow: 0 3px 10px rgba(0,0,0,0.4); backdrop-filter: blur(3px);
    animation: gvHaulIn 260ms cubic-bezier(0.2, 1.3, 0.4, 1) both; }
.gv-haul li img { flex: none; width: 26px; height: 26px; object-fit: contain; display: block;
    filter: drop-shadow(0 1px 2px rgba(0,0,0,0.6)); }
.gv-haul li span { flex: 1; min-width: 0; font-size: 0.74rem; font-weight: 600; color: #e6e0d2;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* ⚠️ THE COUNT IS THE POINT OF THE ROW, so it is the only thing in it that moves. The node is keyed on
   the number in the JSX, so React swaps the element and this animation re-runs -- rewriting the text of
   a live element does not restart a CSS animation, and a number that changes without moving is a number
   nobody sees change. */
.gv-haul li b { flex: none; min-width: 22px; text-align: right; font-size: 0.86rem; font-weight: 900;
    color: #ffd75e; font-variant-numeric: tabular-nums;
    animation: gvHaulBump 320ms cubic-bezier(0.2, 1.6, 0.4, 1) both; }
/* The one uncommon part in a pile gets the same gold the drop itself wore on the floor. */
.gv-haul li.is-rare { border-color: rgba(255,200,97,0.45); background: rgba(38,26,6,0.74);
    box-shadow: 0 3px 10px rgba(0,0,0,0.4), 0 0 14px rgba(255,200,97,0.18); }
.gv-haul li.is-rare span { color: #ffe6a8; }
@keyframes gvHaulIn { from { opacity: 0; transform: translateX(-14px) scale(0.92); }
    to { opacity: 1; transform: none; } }
@keyframes gvHaulBump { 0% { transform: scale(1); } 40% { transform: scale(1.5); color: #fff6df; }
    100% { transform: scale(1); } }
/* ⚠️ NO prefers-reduced-motion BRANCH, AND THAT IS THE HOUSE RULE, NOT AN OVERSIGHT -- see
   animations-always-play. The bump IS the readout. */

/* ── THE HERALD ────────────────────────────────────────────────────────────────────────────────────────────
   Luke: "nothing pops up in the middle of my screen letting me know ive got a boss encounter or the portal
   unlocked. Not a modal, but stylized text with dopamine."

   The boss already had one of these. The two moments that did NOT were the two that are EARNED rather than
   walked into: crossing the kill count that opens the way, and the boss becoming available because of it.
   Opening the way fired a float at the door -- which is positioned at the DOOR, so if the twentieth rat died
   anywhere else on the map the one announcement of the zone's biggest beat happened off screen.

   A herald is centred on the VIEWPORT, not on a world position, for exactly that reason. It is not a modal:
   nothing is dismissed, nothing is blocked, pointer-events stay off, and it leaves on its own.

   Two lines, because the beat has two halves: what happened, and what it means. The kicker is small and
   tracked out; the word is the size of the screen. */
.gv-herald { position: absolute; inset: 0; z-index: 4; display: flex; flex-direction: column;
    align-items: center; justify-content: center; pointer-events: none; text-align: center; padding: 0 6%; }
/* ⚠️ THE KICKER HAS TO SURVIVE THE BACKDROP. Pale gold at a soft shadow vanished into the lit canopy
   of zone one -- filmed, it read as a faint grey line above the word. The zone art is painted and
   bright and the herald can land over ANY of it, so the small line needs its own dark bed rather than
   a drop shadow: a tight ring of shadow carries it over light and dark alike. */
.gv-herald i { display: block; font-style: normal; font-size: clamp(0.68rem, 3vw, 0.86rem);
    letter-spacing: .34em; text-transform: uppercase; color: #fff1c4; opacity: 1;
    text-shadow: 0 0 3px rgba(0,0,0,1), 0 0 10px rgba(0,0,0,0.95), 0 2px 10px rgba(0,0,0,0.95),
        0 0 22px rgba(255,170,40,0.55);
    animation: gvHeraldKick 2200ms cubic-bezier(.16,1,.3,1) both; }
.gv-herald b { display: block; margin-top: 6px; font-size: clamp(1.5rem, 8.5vw, 2.9rem); font-weight: 800;
    letter-spacing: .04em; text-transform: uppercase; color: #fff6df; line-height: 1.03;
    text-shadow: 0 0 26px rgba(255,196,74,0.92), 0 0 60px rgba(255,150,30,0.45), 0 4px 12px rgba(0,0,0,0.95);
    animation: gvHeraldWord 2200ms cubic-bezier(.16,1,.3,1) both; }
/* A rule under it that draws itself outward, which is the bit that reads as a thing being UNLOCKED rather
   than a thing being announced. */
.gv-herald u { display: block; margin-top: 12px; width: min(220px, 46%); height: 2px; border-radius: 999px;
    background: linear-gradient(90deg, rgba(255,196,74,0), #ffc44a, rgba(255,196,74,0));
    transform-origin: 50% 50%; animation: gvHeraldRule 2200ms cubic-bezier(.16,1,.3,1) both; }
/* The boss variant keeps the purple the boss banner already owns, so the two beats stay told apart. */
.gv-herald.is-boss i { color: #e4d2ff; }
.gv-herald.is-boss b { color: #f3e6ff;
    text-shadow: 0 0 26px rgba(169,130,255,0.92), 0 0 60px rgba(120,70,220,0.45), 0 4px 12px rgba(0,0,0,0.95); }
.gv-herald.is-boss u { background: linear-gradient(90deg, rgba(169,130,255,0), #a982ff, rgba(169,130,255,0)); }
/* The kicker lands first and alone, then the word arrives under it -- the same order as the death screen,
   and for the same reason: both at once reads as a page loading rather than as a moment happening. */
@keyframes gvHeraldKick {
    0%   { opacity: 0; transform: translateY(8px); letter-spacing: .5em; }
    14%  { opacity: .92; transform: translateY(0); letter-spacing: .34em; }
    74%  { opacity: .92; }
    100% { opacity: 0; transform: translateY(-10px); }
}
@keyframes gvHeraldWord {
    0%   { opacity: 0; transform: scale(1.38); }
    10%  { opacity: 0; transform: scale(1.38); }
    26%  { opacity: 1; transform: scale(1); }
    74%  { opacity: 1; transform: scale(1); }
    100% { opacity: 0; transform: scale(0.95) translateY(-12%); }
}
@keyframes gvHeraldRule {
    0%   { opacity: 0; transform: scaleX(0); }
    30%  { opacity: 1; transform: scaleX(1); }
    74%  { opacity: 1; transform: scaleX(1); }
    100% { opacity: 0; transform: scaleX(1); }
}
.gv-boss-intro { position: absolute; inset: 0; z-index: 4; display: flex;
    align-items: center; justify-content: center; pointer-events: none; }
.gv-boss-intro b { font-size: clamp(1.3rem, 7vw, 2.4rem); font-weight: 800; letter-spacing: .06em;
    text-transform: uppercase; text-align: center; color: #f3e6ff; padding: 0 6%;
    text-shadow: 0 0 22px rgba(169,130,255,0.9), 0 3px 10px rgba(0,0,0,0.95);
    animation: gvBossIntro 2000ms cubic-bezier(.16,1,.3,1) both; }
/* Arrives big and slightly wide, settles, holds while it is read, then lifts away — rather than simply
   fading, which reads as the page loading something. */
@keyframes gvBossIntro {
    0% { opacity: 0; transform: scale(1.5); letter-spacing: .3em; }
    18% { opacity: 1; transform: scale(1); letter-spacing: .06em; }
    72% { opacity: 1; transform: scale(1); }
    100% { opacity: 0; transform: scale(0.94) translateY(-14%); }
}

/* The death screen. Covers the zone outright rather than tinting it: a dimmed but still-moving scene reads
   as a stutter, and the one thing it must say clearly is that the run is over and you are going somewhere.

   IT NOW WAITS FOR THE HERO TO FALL. The delay is DEATH_VEIL_DELAY_MS, interpolated above so it cannot drift
   from the fall it is waiting on. Arriving in 320ms over a hero who was still standing was fine when there
   was no death animation; covering one that exists would be the one way to waste it. The rule in the first
   paragraph still holds, because the only motion left under the veil is the body going down. */
.gv-dead { position: absolute; inset: 0; z-index: 5; display: flex; align-items: center; justify-content: center;
    background: rgba(6,8,6,0.82); text-align: center;
    animation: gvDead 320ms ease-out ${DEATH_VEIL_DELAY_MS}ms both; }
/* ⚠️ THE WORDS ARRIVE AFTER THE DARK, NOT WITH IT. Both at once reads as a page navigating. Letting the
   zone go out first and then saying what happened is the order the player experiences it in, and the 180ms
   gap is most of why it lands — it is the same reason the loot rests before it can be collected. */
.gv-dead > div { animation: gvDeadWord 520ms cubic-bezier(.16,1,.3,1) 180ms both; }
@keyframes gvDeadWord {
    0% { opacity: 0; transform: scale(1.22); filter: blur(6px); }
    100% { opacity: 1; transform: scale(1); filter: blur(0); }
}
.gv-dead b { display: block; font-size: 1.5rem; letter-spacing: .04em; color: #ff8a7a;
    text-shadow: 0 2px 10px rgba(0,0,0,0.9); }
.gv-dead span { display: block; margin-top: 8px; font-size: 0.88rem; color: #cfc6b6; }
/* Where you are going, counting down in the open rather than leaving 2.6 seconds of nothing. Not a progress
   bar standing in for progress — the wait is real, fixed, and already decided; this only says so. */
.gv-dead u { display: block; margin: 16px auto 0; width: 92px; height: 3px; border-radius: 999px;
    background: rgba(255,255,255,0.18); overflow: hidden; }
.gv-dead u i { display: block; height: 100%; width: 100%; background: #ff8a7a; transform-origin: left;
    animation: gvDeadWait 2600ms linear both; }
@keyframes gvDeadWait { 0% { transform: scaleX(1); } 100% { transform: scaleX(0); } }
@keyframes gvDead { from { opacity: 0; } to { opacity: 1; } }

/* Above the ground line rather than across it — the HUD was drawn straight over the row of enemies
   standing on the floor, which is the one row you need to be able to see and tap. */
/* ⚠️ SAFE-AREA INSETS. Full screen on a phone puts this row under the notch and the rounded corners;
   Leave is the control you most need when something has gone wrong, so it must never be the thing tucked
   behind a camera cutout. env() resolves to 0 everywhere that has no cutout, so this costs nothing. */
/* ── THE KILL COUNT ───────────────────────────────────────────────────────────────────────────
   Luke: "I want to see kill count on top middle of screen."

   Top centre, on the same line as the HUD row but positioned independently of it -- the HUD is a flex
   row with the belt pushed left and the buttons right, and dropping a centred item into it would be
   centred between those two rather than on the screen. It sits ABOVE the boss banner, which owns 40px
   down, so the two never collide when a boss wakes up.

   Tabular figures, because a count that shifts its own width every time it ticks past a 1 reads as the
   whole element twitching. */
.gv-kills { position: absolute; z-index: 4; pointer-events: none; text-align: center;
    left: 50%; transform: translateX(-50%);
    top: calc(8px + env(safe-area-inset-top)); }
.gv-kills b { display: block; font-size: 1.32rem; font-weight: 800; line-height: 1;
    color: #fff6df; font-variant-numeric: tabular-nums;
    text-shadow: 0 0 14px rgba(0,0,0,0.95), 0 2px 5px rgba(0,0,0,0.95); }
/* The denominator is deliberately quieter: the number that moves is the one worth reading. */
.gv-kills b i { font-style: normal; font-size: 0.78em; font-weight: 700; opacity: 0.55; }
.gv-kills span { display: block; margin-top: 2px; font-size: 0.6rem; font-weight: 700;
    letter-spacing: 0.1em; text-transform: uppercase; color: #e0a83c;
    text-shadow: 0 0 10px rgba(0,0,0,1), 0 1px 4px rgba(0,0,0,0.95); }

.gv-hud { position: absolute; display: flex; align-items: center; gap: 10px; pointer-events: none;
    justify-content: flex-end;
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
/* ⚠️ .gv-hp IS GONE FROM THE SCREEN AND ITS RULES WITH IT. Luke: "I hate the kill display and red bar."
   The refs and the chase maths stay in the loop because the hurt flash, the vignette and the food trigger
   all read the same number — what was removed is the strip, not the health. Deleting the rule along with
   the element is deliberate: a stale rule for a shape that no longer exists is how a later element with a
   reused class name inherits a background nobody meant it to have. See stale-css-rule-on-reshape. */
.gv-hud b { font-size: 0.78rem; color: #efe7d8; text-shadow: 0 2px 4px rgba(0,0,0,0.9); }
/* ⚠️ THE PUSH BELONGS TO THE FIRST BUTTON, NOT TO EVERY BUTTON. Both of these carried
   margin-left:auto, and flexbox SPLITS free space between multiple auto margins -- so with the
   full-screen toggle present the pair straddled the row and the toggle sat dead centre, where it
   collided with the kill count the moment that was added. Pushing only the first one sends the whole
   group right and keeps working whether the toggle is rendered or not. */
/* ── THE PUSH BELONGS TO THE BELT, NOT TO THE FIRST BUTTON ────────────────────────────────────
   This was .gv-hud > button:first-of-type { margin-left: auto }, which was correct for exactly as long
   as the belt was a passive <b>. The belt is a BUTTON when it is empty -- the one that says where more
   food comes from -- and a type selector cannot tell the two apart, so the push landed on the BELT and
   shoved it to the right where it collided with the kill count. The row would have laid out correctly
   in every screenshot of a stocked belt and wrongly in every screenshot of an empty one.

   Pushing from the LEFT-hand item instead holds whether the belt is a b, a button, or absent: the row
   is end-justified, so with no belt at all the group still sits right. */
.gv-belt { margin-right: auto; }
.gv-leave { pointer-events: auto; padding: 6px 14px; border-radius: 999px; cursor: pointer;
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
/* ── ⚠️ THE PANELS STACK AS BLOCKS, AND THE SCROLLER MUST NOT SQUASH THEM ────────────────────
   Every panel in here is a child of .gv-sheet, which is a COLUMN FLEXBOX that also scrolls. A flex item
   defaults to flex-shrink: 1, so the scroller's own content was being compressed to fit the viewport
   INSTEAD of scrolling -- and once compressed, flex redistributed that height across the sections, which
   is why the Bank came out taller than the one line it contains and the Backpack came out shorter than
   its own six slots. The sections were drawn as flat rectangles before, so there was nothing to see;
   giving them a painted box made a layout bug that had been there all along suddenly visible.

   Two rules fix it at the root. The scroller's children keep their natural height and the scroller
   scrolls; the panels themselves stack as plain blocks, where there is no shrinking and no stretching to
   a common height to go wrong in the first place. */
.gv-sheet > * { flex: none; }
.gv-bag { display: block; }

/* ── ⚠️ NAMED .gv-sect, AND THAT IS THE SECOND VERSION OF THIS FILE'S .gv-area ────────────────
   The first cut of these panels was called .gv-area -- a class THIS STYLESHEET ALREADY USED, 200 lines
   up, for the map strip's zone cards: width 188px, height 250px, scroll-snapped. So every painted panel
   silently inherited a 188x250 box. That is exactly what the symptoms were: half width, every section
   the same height, the Backpack clipped through its own slots and the Bank padded out with empty board.
   Nothing errored, nothing overflowed the viewport, and the paint looked deliberate enough to screenshot.
   It cost four rounds of trying to explain it with flexbox before the probe showed a height was being
   SET rather than computed.

   The reverse direction was live too and worse: the map's zone cards were wearing this panel's board,
   iron corners and name-board rules the whole time.

   Grep the stylesheet for a class name before taking it. */
/* ── ⚠️ A PANEL IS A PAINTED OBJECT NOW, NOT A ROUNDED RECTANGLE ──────────────────────────────
   Luke: "hate the lack of color and lack of sprite paneling and trim ... Sprites in title etc are
   needed for each respective area."

   What was here: four headings on the bag panel, all four the same word in the same green, over cards
   that were rgba(255,255,255,0.045) on black. Nothing told you which area you were in except reading it.

   Four things carry it now, and each is doing a job rather than decorating:

     THE BOARD    a worn plank surface behind the section, darkened hard so it reads as material
                  rather than as texture competing with the counts printed on it.
     THE CORNERS  one iron bracket sprite, flipped into all four corners. A frame made of a drawn
                  object rather than of a 1px border.
     THE PLATE    the heading sits on slab-plank -- the SAME 3-slice board the ledges are built from,
                  already pinned to 1024x320 with its rope caps painted at the edges. Reused, not
                  redrawn. border-image-slice 0 150 fill is the ledges' own number.
     THE COLOUR   one --area hue per section, worn by the heading rule, the count chip and the cards'
                  own borders, so Bank never reads as Backpack at a glance.

   ⚠️ NO BACKTICKS IN THESE COMMENTS -- template literal. See the header of this file. */
/* ⚠️ THE BOX IS STATED, NOT INHERITED, AND THAT IS WHAT THE FIRST CUT GOT WRONG.
   Dropped into .gv-bag -- a column flexbox -- the first version of these panels came out HALF WIDTH with
   their contents clipped: each one had shrunk to its own max-content width (one slot column) and then been
   squeezed vertically by flex-shrink against a short viewport. Nothing errored and the paint looked
   deliberate, which is exactly how a layout bug survives a screenshot.

   A section that is going to be reused inside four different parents must not depend on what any of them
   sets for align-items. So it says its own width, refuses to shrink, and counts its padding inside that
   width. */
.gv-sect { --area: #e0a83c;
    width: 100%; box-sizing: border-box; flex: none; align-self: stretch;
    /* ⚠️ AND CAPPED, BECAUSE THE NAME-BOARD IS A PAINTING. The plank is a 3-slice: its ends are pinned
       and its middle is STRETCHED. At 1900px on a desktop that middle smears into a flat grey bar and
       the wood stops being wood -- caught on the wide pass, invisible on a phone. A capped, centred
       column is the better reading measure for a six-slot grid anyway. */
    max-width: 760px; margin-inline: auto;
    position: relative; margin: 0 auto 15px; padding: 0 12px 13px; border-radius: 14px;
    overflow: hidden;
    background:
        linear-gradient(180deg, rgba(9,11,8,0.80), rgba(9,11,8,0.90)),
        url("/images/grove/ui-board.webp") center / cover;
    border: 1px solid rgba(0,0,0,0.65);
    box-shadow: 0 8px 22px rgba(0,0,0,0.46), inset 0 1px 0 rgba(255,255,255,0.055); }
.gv-sect.is-bank { --area: #7cc6f0; }
.gv-sect.is-belt { --area: #9be36a; }
.gv-sect.is-tools { --area: #cbd5dc; }
.gv-sect.is-chests { --area: #9be36a; }
.gv-sect.is-emblems { --area: #e0a8ff; }
.gv-sect.is-map { --area: #f0d8a0; }

/* FOUR CORNERS OUT OF ONE SPRITE. The painting is drawn with its corner at the TOP-LEFT, so the other
   three are that same file mirrored -- which is why the brief asked for a symmetrical L. */
.gv-sect::before, .gv-sect::after,
.gv-sect-trim::before, .gv-sect-trim::after {
    content: ""; position: absolute; width: 21px; height: 21px; pointer-events: none; opacity: 0.9;
    background: url("/images/grove/ui-corner.webp") center / contain no-repeat; }
.gv-sect::before { top: 5px; left: 5px; }
.gv-sect::after { top: 5px; right: 5px; transform: scaleX(-1); }
.gv-sect-trim::before { bottom: 5px; left: 5px; transform: scaleY(-1); }
.gv-sect-trim::after { bottom: 5px; right: 5px; transform: scale(-1); }

/* THE NAME BOARD. Pulled out past the panel padding so the plank spans the full width of the panel and
   its rope caps land on the panel edge, which is what makes it read as fixed TO the board rather than
   floating on it. */
.gv-sect > h4 { position: relative; margin: 0 0 12px; min-height: 52px;
    display: flex; align-items: center; gap: 9px; padding: 7px 10px;
    border-style: solid; border-width: 0 26px; border-image-source: url("/images/grove/slab-plank.webp");
    border-image-slice: 0 150 fill; border-image-repeat: stretch;
    font-size: 0.92rem; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase;
    /* ⚠️ DARK INK ON PALE WOOD. The plank is light grey; the cream the rest of this screen is set in
       would be invisible on it, and a text-shadow does not rescue a 1.2:1 pairing. */
    color: #22190f; text-shadow: 0 1px 0 rgba(255,255,255,0.28);
    /* A long title loses size before it loses the board it is written on. */
    min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.gv-sect-ico { width: 38px; height: 38px; flex: none; object-fit: contain; object-position: 50% 100%;
    filter: drop-shadow(0 2px 4px rgba(0,0,0,0.55)); }
/* The sub-count rides the board as its own pressed-in plate, in the area's colour. */
.gv-sect > h4 i { margin-left: auto; flex: none; font-style: normal; font-size: 0.7rem; font-weight: 700;
    letter-spacing: 0.08em; padding: 4px 10px; border-radius: 999px;
    color: var(--area); background: rgba(14,16,11,0.82); text-shadow: none;
    border: 1px solid rgba(0,0,0,0.5); }

/* The cards inside an area take its colour, faintly, so the hue reaches past the heading. */
.gv-sect .gv-slot { border-color: color-mix(in srgb, var(--area) 26%, rgba(255,255,255,0.10)); }
.gv-sect .gv-slot span { color: var(--area); }

/* -- THE ARMOURY ------------------------------------------------------------------------------
   Five sets, three pieces each, and every tile has to answer three questions at once: what does it
   give me, what does it cost, am I wearing it. So the stats are a list, the cost is always on screen
   rather than behind the button, and the worn state is a colour rather than a word.

   The set colour comes from the rarity rather than from the panel, because rarity is the only thing
   that distinguishes one of these from another -- Rootbound and Heartwrought are the same three
   slots with the same three stat profiles, and the band IS the progression.

   NO BACKTICKS IN THESE COMMENTS -- template literal. */
.gv-arm-say { margin: 0 0 12px; font-size: 0.78rem; color: #9aa08f; }
.gv-arm-set { --rar: #9aa08f; margin: 0 0 13px; padding: 10px; border-radius: 12px;
    background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.07); }
.gv-arm-set.is-common { --rar: #9aa08f; }
.gv-arm-set.is-uncommon { --rar: #9be36a; }
.gv-arm-set.is-rare { --rar: #6fd0ff; }
.gv-arm-set.is-epic { --rar: #e0a8ff; }
.gv-arm-set.is-legendary { --rar: #ffb648; }
.gv-arm-set.is-complete { border-color: var(--rar);
    box-shadow: 0 0 20px color-mix(in srgb, var(--rar) 26%, transparent); }

.gv-arm-set > header { display: flex; align-items: baseline; gap: 8px; margin-bottom: 9px; }
.gv-arm-set > header b { font-size: 0.98rem; color: var(--rar); }
.gv-arm-set > header em { font-style: normal; font-size: 0.6rem; font-weight: 800; letter-spacing: 0.1em;
    text-transform: uppercase; color: var(--rar); opacity: 0.8; }
.gv-arm-set > header span { font-size: 0.68rem; color: #777d70; }
.gv-arm-set > header u { margin-left: auto; text-decoration: none; font-size: 0.74rem; font-weight: 800;
    font-variant-numeric: tabular-nums; color: #cfc6b6; }

.gv-arm-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.gv-arm-piece { display: flex; flex-direction: column; gap: 6px; padding: 8px 7px; border-radius: 10px;
    background: linear-gradient(180deg, rgba(0,0,0,0.4), rgba(0,0,0,0.26));
    border: 1px solid rgba(255,255,255,0.07);
    box-shadow: inset 0 2px 6px rgba(0,0,0,0.5); }
.gv-arm-piece.is-have { border-color: rgba(255,255,255,0.14); }
.gv-arm-piece.is-on { border-color: var(--rar);
    background: linear-gradient(180deg, color-mix(in srgb, var(--rar) 18%, rgba(0,0,0,0.4)), rgba(0,0,0,0.3)); }
.gv-arm-piece > b { font-size: 0.78rem; color: #fff6df; }
.gv-arm-piece ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 1px; }
.gv-arm-piece li { font-size: 0.62rem; color: #9be36a; }

.gv-arm-cost { display: flex; flex-direction: column; gap: 2px; margin-top: auto; }
.gv-arm-cost i { display: flex; align-items: center; gap: 4px; font-style: normal; font-size: 0.6rem;
    color: #9aa08f; }
.gv-arm-cost i img { width: 14px; height: 14px; object-fit: contain; }
/* What you cannot pay, said in the colour the rest of the game says it in. */
.gv-arm-cost i.is-short { color: #f0a08a; font-weight: 700; }

.gv-arm-go { margin-top: 4px; padding: 6px 4px; border-radius: 999px; border: 0; cursor: pointer;
    font: inherit; font-size: 0.72rem; font-weight: 800; color: #1a1a12;
    background: linear-gradient(180deg, #ffd166, #e0a83c); }
.gv-arm-go:disabled { cursor: default; color: #8d8577;
    background: rgba(255,255,255,0.06); }
.gv-arm-go.is-off { color: #cfc6b6; background: rgba(255,255,255,0.08); }

.gv-arm-bonus { margin: 9px 0 0; font-size: 0.66rem; color: #777d70; }
.gv-arm-bonus b { color: #9aa08f; }
.gv-arm-bonus.is-on { color: var(--rar); }
.gv-arm-bonus.is-on b { color: var(--rar); }

/* -- THE ITEM TILE ---------------------------------------------------------------------------
   Luke: "The item tiles look bad both in quality and also the text layout relative to the sprite."

   What was here was a left-aligned CARD: sprite in the top-left corner at 34px, then the name, then
   the count, then a hint, each on its own line down the left edge. Three problems in one.

     THE SPRITE WAS A BULLET POINT. Pinned to the corner at 34px with three lines of text running
     past it, the picture read as an icon decorating a list row. These are drawn objects and the
     object is the thing being picked out of a grid -- it leads, centred, at 46px.

     THE TEXT FOUGHT IT. Name, count and hint stacked in a column beside a picture is four reading
     positions for one item. The count belongs ON the sprite as a badge, the way a stack count has
     worked in every inventory since Diablo, and the name belongs in a band UNDER it where it reads
     as a caption rather than as a competing heading. The hint goes to the tooltip -- "tap to bank"
     printed on all twenty tiles is the same sentence twenty times.

     AND THE SLOT DID NOT LOOK LIKE A SLOT. A flat rounded rectangle with a hairline border reads as
     a button. A slot is a recess: inset shadow, darker than the board it is cut into, so a filled
     one reads as an object sitting IN something.

   NO BACKTICKS IN THESE COMMENTS -- template literal. */
.gv-inv { display: grid; grid-template-columns: repeat(auto-fill, minmax(78px, 1fr)); gap: 7px; }
.gv-cell { position: relative; display: flex; flex-direction: column; align-items: stretch;
    padding: 0; overflow: hidden; border-radius: 11px; font: inherit; color: #efe7d8; cursor: pointer;
    background: linear-gradient(180deg, rgba(0,0,0,0.42), rgba(0,0,0,0.3));
    border: 1px solid rgba(0,0,0,0.55);
    box-shadow: inset 0 2px 6px rgba(0,0,0,0.6), inset 0 -1px 0 rgba(255,255,255,0.05);
    transition: transform 120ms ease, border-color 120ms ease; }
.gv-cell:active { transform: scale(0.95); }
.gv-cell:hover { border-color: color-mix(in srgb, var(--area, #e0a83c) 55%, rgba(0,0,0,0.55)); }

/* The object leads. aspect-ratio rather than a height so the tile scales with the column. */
.gv-cell-face { position: relative; display: grid; place-items: center; aspect-ratio: 1 / 0.86; }
.gv-cell-face .gv-ico { width: 46px; height: 46px; object-fit: contain; object-position: 50% 50%;
    filter: drop-shadow(0 3px 4px rgba(0,0,0,0.6)); }
/* The stack count, on the object rather than under it. */
.gv-cell-face i { position: absolute; right: 3px; bottom: 1px; padding: 1px 6px; border-radius: 999px;
    font-style: normal; font-size: 0.72rem; font-weight: 800; font-variant-numeric: tabular-nums;
    color: #fff6df; background: rgba(8,10,7,0.86); border: 1px solid rgba(255,255,255,0.12); }
/* The name is a caption band, not a heading. One line, always. */
.gv-cell-name { display: block; padding: 3px 5px 4px; font-size: 0.58rem; line-height: 1.15;
    letter-spacing: 0.02em; text-align: center; color: #b9b1a2;
    background: rgba(0,0,0,0.42); border-top: 1px solid rgba(255,255,255,0.05);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ROOM, NOT VOID. The unfilled half of the bag, drawn as what it is. */
.gv-cell.is-empty { aspect-ratio: 1 / 1.12; border-style: dashed; border-color: rgba(255,255,255,0.07);
    background: rgba(0,0,0,0.3); box-shadow: inset 0 2px 7px rgba(0,0,0,0.5); cursor: default; }

.gv-slots { display: grid; grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); gap: 8px; }
/* -- THE ROW TILE ---------------------------------------------------------------------------
   The inventory grid above is for identity and a count. This is the other shape: things that carry
   a STAT as well as a name -- a food with a heal fraction, a tool with a tier and a bonus -- where a
   caption band under a square has nowhere to put the third line.

   Same fix as the grid though, which was Luke's actual complaint: "the text layout relative to the
   sprite". The picture used to sit in the top-left CORNER with three lines of text running down past
   it, so it read as a bullet point rather than as the object. It is a proper framed thumbnail on the
   left now, vertically centred against its own text block, on the same recessed plate the grid cells
   use so the two shapes look like they come from one game. */
.gv-slot { display: grid; grid-template-columns: auto 1fr; column-gap: 11px; row-gap: 1px;
    align-items: center; padding: 9px 11px; border-radius: 11px; cursor: pointer;
    text-align: left; font: inherit; color: #efe7d8;
    background: linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.025));
    border: 1px solid rgba(255,255,255,0.10); }
.gv-slot > b, .gv-slot > span, .gv-slot > em { grid-column: 2; }
.gv-slot:disabled { cursor: default; }
.gv-slot b { font-size: 0.84rem; }
.gv-slot span { font-size: 1.05rem; font-weight: 800; color: #9fe08a; }
.gv-slot em { font-style: normal; font-size: 0.68rem; color: #8d8577; }
/* ── THE PART, AS ITSELF ──────────────────────────────────────────────────────────────────────
   A slot is picked out of a grid at a glance, so the picture leads and the name confirms it. The
   sprites are drawn on a dark forest and these panels are dark too, so they need no plate behind them —
   just the shadow that keeps them from floating off the row. */
.gv-slot .gv-ico, .gv-slot .gv-glyph {
    grid-column: 1; grid-row: 1 / -1; align-self: center;
    box-sizing: border-box; display: block; width: 52px; height: 52px; padding: 4px;
    object-fit: contain; border-radius: 10px;
    background: linear-gradient(180deg, rgba(0,0,0,0.42), rgba(0,0,0,0.28));
    box-shadow: inset 0 2px 6px rgba(0,0,0,0.6);
    filter: drop-shadow(0 2px 3px rgba(0,0,0,0.55)); }
/* A tool has no painted sprite, so it wears its glyph on the same plate rather than leaving the
   column empty -- half the tiles framed and half not is worse than neither. */
.gv-slot .gv-glyph { display: grid; place-items: center; padding: 0; filter: none; color: #cbd5dc; }
.gv-slot .gv-glyph svg { width: 28px; height: 28px; }
.gv-slot.is-dim .gv-glyph { color: #6d7366; }
/* THE TOOL SPRITE, AND THE GLYPH UNDERNEATH IT. Both are in the markup: the picture is what a player
   should see, and the icon is what they see instead if the file is missing. So the glyph is hidden by
   default and the img reveals it by tagging its parent on error - the opposite order would flash an icon
   on every load, and a sibling selector cannot do it because the fallback has to survive the img failing. */
.gv-slot .gv-glyph img { width: 44px; height: 44px; object-fit: contain;
    filter: drop-shadow(0 2px 3px rgba(0,0,0,0.55)); }
.gv-slot .gv-glyph svg { display: none; }
.gv-slot .gv-glyph.is-noart svg { display: block; }
.gv-slot.is-dim .gv-glyph img { filter: grayscale(0.75) brightness(0.62) drop-shadow(0 2px 3px rgba(0,0,0,0.55)); }
/* Inside a sentence rather than above one, so it sits on the text baseline instead of on the line box. */
.gv-recipe .gv-ico { display: inline-block; width: 20px; height: 20px; object-fit: contain;
    vertical-align: -0.35em; margin-right: 3px;
    filter: drop-shadow(0 1px 2px rgba(0,0,0,0.5)); }
.gv-slot.is-on { border-color: rgba(159,224,138,0.6); background: rgba(159,224,138,0.12); }
.gv-slot.is-on em { color: #9fe08a; }
/* A tool not yet made: shown so the ladder is visible before you can climb it. */
.gv-slot.is-dim { opacity: 0.55; }
/* ⚠️ !important HERE ONLY BECAUSE IT IS ALREADY HERE. The base rule carries one, so a plain
   .gv-belt.is-out colour would lose to it however specific it looks in the file -- the .btn-ghost
   footgun, which is worth remembering every time one of these is written. Two importants, and the more
   specific selector wins. */
.gv-belt { color: #9fe08a !important; }
/* The belt with nothing on it. Amber rather than green because it is a thing to go and do, and sized
   and padded like the Leave button beside it because it is now the same kind of object. */
.gv-belt.is-out { pointer-events: auto; cursor: pointer; font: inherit;
    font-size: 0.78rem; font-weight: 700; padding: 6px 12px; border-radius: 999px;
    color: #ffd166 !important; background: rgba(0,0,0,0.55);
    border: 1px solid rgba(255,209,102,0.42);
    text-shadow: 0 2px 4px rgba(0,0,0,0.9); }
.gv-belt.is-out:hover { border-color: rgba(255,209,102,0.8); }
/* ── WHAT IS ON THE BELT, AS AN OBJECT ────────────────────────────────────────────────────────
   The sprite is the same one the pop carries when it is eaten, which is the whole point: the thing that
   leaves your belt and the thing that flies off your head are visibly one object. The count is its own
   element so it can hold its weight next to a long name on a 320px phone. */
.gv-belt { display: inline-flex; align-items: center; gap: 5px;
    pointer-events: none; white-space: nowrap; }
.gv-belt img { width: 18px; height: 18px; object-fit: contain; display: block;
    filter: drop-shadow(0 1px 2px rgba(0,0,0,0.7)); }
.gv-belt i { font-style: normal; font-weight: 800; color: #fff6df;
    padding: 1px 6px; border-radius: 999px; font-size: 0.72rem;
    background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.16); }
/* ⚠️ THE FLASH IS ON MOUNT, AND THE ELEMENT IS REMOUNTED BY ITS KEY. No class is toggled and no timer
   strips one, so the loop cannot race a render -- see the note by setBeltAte. The eye needs to be told
   that something it owns was just spent; the count alone changes too quietly to notice in a fight. */
.gv-belt.is-eat { animation: gvBeltAte 460ms ease-out both; }
@keyframes gvBeltAte {
    0% { transform: scale(1); }
    22% { transform: scale(1.22); }
    100% { transform: scale(1); }
}
/* ── ⚠️ THE NAME GIVES WAY FIRST ON A 320px PHONE ─────────────────────────────────────────────
   Adding the sprite and the count pill took the chip from 89px to 122px, and the kill counter is
   centred at the top of the same row: measured at 320x568 the two overlapped by 418 square pixels.
   The NAME is what goes, because the sprite is already saying which food this is -- a picture and a
   number is the whole readout, and the full name still arrives on the call-out every time one is drunk
   and on the belt ladder in the backpack. Dropping the count instead would leave the thing the chip
   exists to report. */
@media (max-width: 400px) {
    .gv-belt span { display: none; }
}
.gv-belt.is-eat i { animation: gvBeltAteN 460ms ease-out both; }
@keyframes gvBeltAteN {
    0% { background: rgba(159,224,138,0.85); color: #0c120d; }
    100% { background: rgba(0,0,0,0.5); color: #fff6df; }
}

/* ── YOUR CLASS, IN THE GROVE'S OWN NUMBERS ───────────────────────────────────────────────────
   The sigil is the Arena's own class emblem rather than a second drawing -- a Reaver should be the same
   object in both places, and a member who has stared at that mark in the ring recognises it here with
   no caption at all. */
.gv-train { display: flex; gap: 12px; align-items: flex-start; }
.gv-train-sigil { flex: none; width: 46px; height: 46px; object-fit: contain;
    filter: drop-shadow(0 2px 5px rgba(0,0,0,0.6)); }
.gv-train-body { flex: 1; min-width: 0; }
.gv-train-body > b { display: block; font-size: 1rem; line-height: 1.2; }
.gv-train-body > em { display: block; font-style: normal; font-size: 0.76rem; color: #a99f8d;
    margin-bottom: 8px; }
/* Two columns on anything but the narrowest phone: these are short label/value pairs and a single
   column of them is a tall thin list with half the card empty beside it. */
.gv-train-list { list-style: none; margin: 0; padding: 0;
    display: grid; grid-template-columns: repeat(auto-fit, minmax(146px, 1fr)); gap: 2px 14px; }
.gv-train-list li { display: flex; align-items: baseline; justify-content: space-between; gap: 8px;
    font-size: 0.8rem; padding: 3px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
.gv-train-list li span { color: #cfc6b6; }
.gv-train-list li b { color: #9fe08a; font-variant-numeric: tabular-nums; white-space: nowrap; }

.gv-tablet ul { margin: 8px 0 0; padding-left: 18px; font-size: 0.82rem; color: #cfc6b6; }

/* ── THE WORKBENCH ───────────────────────────────────────────────────────────────────────────── */
/* ── THE WORKBENCH ────────────────────────────────────────────────────────────────────────────
   Luke: "Crafting is very ghetto, needs full pass of grove crafting dopamine thoughtfulness and
   accountability to user."

   The old .gv-bench was a stack of plain rows. What this adds is RANK: a ready recipe is lit from the
   left with a gold rail and its own ground, an impossible one recedes, and a built one is struck
   through in grey. The player should be able to find what they can make without reading a word.

   NO BACKTICKS IN THESE COMMENTS -- this is a template literal. See the header of this file. */
/* ── THE CRAFTING LADDER ──────────────────────────────────────────────────────────────────────
   Luke: "The crafting level needs dopamine massively and visibility transparency recall and awareness."

   It is the first thing on the panel rather than a number that flashes past in a result card. The bar
   is the dopamine, the odds row is the transparency, the recall list is the history, and each tool on
   the bench below wears the band it rolled -- so what the level BUYS is visible on the thing it was
   spent on.

   NO BACKTICKS IN THESE COMMENTS -- template literal. See the header of this file. */
.gv-level-top, .gv-level-meta, .gv-level-say { display: none; }

/* ⚠️ THE ODDS ARE THE POINT OF THIS ROW. They come from the server computed off the same curve the roll
   uses, so what is shown and what is rolled cannot drift -- a hand-written table here would be the
   worst possible version of "transparency". */
.gv-odds { list-style: none; margin: 0; padding: 0; display: grid;
    grid-template-columns: repeat(4, 1fr); gap: 5px; }
.gv-odds li { padding: 7px 4px; border-radius: 9px; text-align: center;
    background: rgba(0,0,0,0.32); border: 1px solid rgba(255,255,255,0.07); }
.gv-odds b { display: block; font-size: 0.94rem; color: #fff6df; font-variant-numeric: tabular-nums; }
.gv-odds span { display: block; font-size: 0.6rem; letter-spacing: 0.06em; text-transform: uppercase; }
.gv-odds em { display: block; font-style: normal; font-size: 0.58rem; color: #8f968a; margin-top: 1px; }
/* MASTERWORK. Warmer and brighter than Pristine, and the only band given a glow: it is a few percent
   at every level, so the one time a player sees it the screen should not be subtle about it. */
.gv-odds li.is-masterwork { border-color: rgba(255,200,97,0.5); box-shadow: 0 0 14px rgba(255,200,97,0.22) inset; }

/* RECALL. Collapsed by default: it is the answer to a question, not a thing to scroll past every time. */
.gv-recall { margin-top: 11px; }
.gv-recall summary { cursor: pointer; font-size: 0.72rem; letter-spacing: 0.08em; text-transform: uppercase;
    color: #e0a83c; }
.gv-recall ul { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
.gv-recall li { display: flex; align-items: center; gap: 8px; font-size: 0.76rem;
    padding: 5px 8px; border-radius: 7px; background: rgba(0,0,0,0.26); }
.gv-recall li span { flex: 1; min-width: 0; color: #cfc6b6; overflow: hidden;
    text-overflow: ellipsis; white-space: nowrap; }
.gv-recall li em { font-style: normal; font-size: 0.66rem; color: #9aa08f; }
.gv-recall li b { color: #e0a83c; font-variant-numeric: tabular-nums; }

/* AWARENESS: the band a tool rolled, worn on the recipe that made it. */
.gv-tag.is-q { background: rgba(255,255,255,0.08); }

/* DOPAMINE: the ladder moving, on the card that just moved it. */
.gv-made-lv { margin-top: 16px; padding: 12px; border-radius: 12px;
    background: rgba(0,0,0,0.34); border: 1px solid rgba(255,255,255,0.08); }
.gv-made-lv.is-up { border-color: rgba(224,168,60,0.6);
    background: linear-gradient(180deg, rgba(224,168,60,0.2), rgba(0,0,0,0.3));
    animation: gvLevelUp 760ms cubic-bezier(.16,1,.3,1) both; }
/* What the boss actually paid, on the card that says it died. */
.gv-won-chest { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 4px 9px;
    margin-top: 12px; padding: 11px 13px; border-radius: 12px; font-size: 1rem; color: #fff6df;
    background: linear-gradient(180deg, rgba(224,168,60,0.26), rgba(0,0,0,0.3));
    border: 1px solid rgba(224,168,60,0.56);
    animation: gvWonDrop 640ms cubic-bezier(.16,1,.3,1) both; }
.gv-won-chest img { width: 34px; height: 34px; object-fit: contain; filter: drop-shadow(0 3px 8px rgba(0,0,0,0.6)); }
.gv-won-chest em { flex-basis: 100%; font-style: normal; font-size: 0.72rem; color: #cfc6b6; }
.gv-won-merits { display: inline-flex; align-items: center; gap: 6px; margin-top: 9px;
    font-size: 0.88rem; font-weight: 700; color: #e0a83c; }
.gv-won-merits svg { width: 18px; height: 18px; }
@keyframes gvWonDrop {
    0% { transform: translateY(-14px) scale(0.9); opacity: 0; }
    60% { transform: translateY(0) scale(1.04); opacity: 1; }
    100% { transform: translateY(0) scale(1); opacity: 1; }
}

/* ── THE CHEST SHELF AND THE OPENING ─────────────────────────────────────────────────────────────
   Luke, playing the live game: "I don't see any of the dopamine." He was right -- the boss had been
   paying chests and merits into the database for as long as they had existed and no screen said so.

   The shelf is the first thing on the bench because an unopened chest outranks every recipe under it,
   and the opening is staggered because a reward that arrives already complete was never revealed.

   NO BACKTICKS IN THESE COMMENTS -- template literal. */
.gv-shelf { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 7px; }
.gv-chest button { width: 100%; display: flex; align-items: center; gap: 11px; padding: 8px 10px;
    border-radius: 11px; background: rgba(0,0,0,0.34); border: 1px solid rgba(255,255,255,0.09);
    color: inherit; font: inherit; text-align: left; cursor: pointer; }
.gv-chest button:disabled { opacity: 0.6; cursor: default; }
.gv-chest-art { position: relative; flex: none; display: grid; place-items: center;
    width: 46px; height: 46px; border-radius: 10px; background: rgba(0,0,0,0.4); }
.gv-chest-art img { width: 40px; height: 40px; object-fit: contain; filter: drop-shadow(0 3px 7px rgba(0,0,0,0.6)); }
/* The count rides the art, not the name -- "three of these" is a fact about the pile. */
.gv-chest-art em { position: absolute; right: -4px; bottom: -4px; padding: 1px 5px; border-radius: 999px;
    font-style: normal; font-size: 0.64rem; font-weight: 800; color: #1a1a12; background: #e0a83c; }
.gv-chest b { flex: 1; min-width: 0; font-size: 0.92rem; color: #fff6df; }
.gv-chest-go { flex: none; padding: 6px 13px; border-radius: 999px; font-size: 0.8rem; font-weight: 800;
    color: #1a1a12; background: linear-gradient(180deg, #ffd166, #e0a83c);
    box-shadow: 0 0 18px rgba(224,168,60,0.4); }

.gv-merits { margin-left: auto; display: flex; align-items: center; gap: 5px; flex: none;
    padding: 5px 10px; border-radius: 999px; background: rgba(0,0,0,0.4);
    border: 1px solid rgba(224,168,60,0.34); }
.gv-merits svg { width: 17px; height: 17px; color: #e0a83c; }
.gv-merits b { font-size: 0.92rem; color: #fff6df; font-variant-numeric: tabular-nums; }

.gv-spill-face { position: relative; display: grid; place-items: center; margin: 4px 0 10px; }
.gv-spill-face img { width: 104px; height: 104px; object-fit: contain;
    filter: drop-shadow(0 0 26px rgba(224,168,60,0.6));
    animation: gvLidBurst 620ms cubic-bezier(.16,1,.3,1) both; }
.gv-spill-burst { position: absolute; width: 112px; height: 112px; border-radius: 50%;
    background: radial-gradient(circle, rgba(255,243,196,0.75), rgba(224,168,60,0) 68%);
    animation: gvBurst 760ms ease-out both; }
@keyframes gvLidBurst {
    0% { transform: scale(0.72) rotate(-10deg); opacity: 0; }
    55% { transform: scale(1.12) rotate(4deg); opacity: 1; }
    100% { transform: scale(1) rotate(0deg); opacity: 1; }
}
@keyframes gvBurst {
    0% { transform: scale(0.3); opacity: 0.95; }
    100% { transform: scale(2.1); opacity: 0; }
}

/* THE STAGGER IS THE REVEAL. Each row carries its own inline animation-delay. */
.gv-spill-loot { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.gv-spill-loot li { display: flex; align-items: center; gap: 9px; padding: 7px 11px; border-radius: 10px;
    background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.07);
    animation: gvSpillIn 460ms cubic-bezier(.16,1,.3,1) both; }
.gv-spill-loot b { font-size: 1rem; color: #e0a83c; font-variant-numeric: tabular-nums; }
.gv-spill-loot span { flex: 1; min-width: 0; font-size: 0.86rem; color: #cfc6b6; }
.gv-tag.is-new { color: #9be36a; background: rgba(155,227,106,0.18); }
@keyframes gvSpillIn {
    0% { transform: translateY(-16px) scale(0.9); opacity: 0; }
    100% { transform: translateY(0) scale(1); opacity: 1; }
}

.gv-spill-merits { display: flex; align-items: center; justify-content: center; gap: 7px;
    margin-top: 11px; padding: 10px; border-radius: 11px;
    background: linear-gradient(180deg, rgba(224,168,60,0.22), rgba(0,0,0,0.3));
    border: 1px solid rgba(224,168,60,0.44);
    animation: gvSpillIn 520ms cubic-bezier(.16,1,.3,1) both; }
.gv-spill-merits svg { width: 22px; height: 22px; color: #e0a83c; }
.gv-spill-merits b { font-size: 1.2rem; color: #fff6df; }
.gv-spill-merits span { font-size: 0.78rem; letter-spacing: 0.1em; text-transform: uppercase; color: #cfc6b6; }

.gv-spill-over { margin: 10px 0 0; font-size: 0.76rem; color: #f0a08a; }
.gv-spill-again { margin-top: 14px; width: 100%; padding: 11px; border-radius: 999px;
    font-size: 0.9rem; font-weight: 800; color: #1a1a12; border: 0; cursor: pointer;
    background: linear-gradient(180deg, #ffd166, #e0a83c); }
.gv-spill-again:disabled { opacity: 0.6; cursor: default; }
.gv-spill-card > button:last-child { margin-top: 8px; }

/* THE LEVEL-UP ITSELF. It gets the biggest number on the card -- a crafting level is earned over many
   crafts and the moment it moves is the only time the ladder is worth interrupting the player for. The old
   number is struck through beside the new one so the jump is shown rather than stated. */
.gv-made-lv-up { display: block; text-align: center; margin-bottom: 12px; }
.gv-made-lv-up i { display: block; font-style: normal; font-size: 0.64rem; font-weight: 800;
    letter-spacing: 0.22em; text-transform: uppercase; color: #e0a83c; }
.gv-made-lv-up b { display: flex; align-items: baseline; justify-content: center; gap: 10px; margin: 2px 0 4px; }
.gv-made-lv-up s { font-size: 1.3rem; color: #6d7366; text-decoration-thickness: 2px; }
.gv-made-lv-up u { font-size: 2.5rem; line-height: 1; text-decoration: none; color: #fff6df;
    text-shadow: 0 0 26px rgba(224,168,60,0.75);
    animation: gvLvNum 720ms cubic-bezier(.16,1,.3,1) both; }
.gv-made-lv-up > span { display: block; font-size: 0.76rem; color: #cfc6b6; }
@keyframes gvLvNum {
    0% { transform: scale(0.4) rotate(-7deg); opacity: 0; }
    60% { transform: scale(1.14) rotate(2deg); opacity: 1; }
    100% { transform: scale(1) rotate(0deg); opacity: 1; }
}

.gv-made-lv-top { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.gv-made-lv-top b { font-size: 0.9rem; color: #fff6df; }
.gv-made-lv-top em { font-style: normal; font-size: 0.8rem; font-weight: 800; color: #e0a83c; }
.gv-made-lv-bar { display: block; margin-top: 8px; height: 7px; border-radius: 999px; overflow: hidden;
    background: rgba(0,0,0,0.5); }
.gv-made-lv-bar i { display: block; height: 100%; border-radius: 999px;
    background: linear-gradient(90deg, #e0a83c, #ffd166); }
.gv-made-q { display: block; margin-top: 9px; font-size: 0.82rem; font-weight: 800; }
@keyframes gvLevelUp {
    0% { transform: scale(0.94); box-shadow: 0 0 0 rgba(224,168,60,0); }
    45% { transform: scale(1.035); box-shadow: 0 0 34px rgba(224,168,60,0.55); }
    100% { transform: scale(1); box-shadow: 0 0 0 rgba(224,168,60,0); }
}

.gv-bench2 { display: flex; flex-direction: column; }

.gv-bh { display: flex; align-items: baseline; gap: 10px;
    padding: 12px 14px; border-radius: 12px;
    background: linear-gradient(180deg, rgba(224,168,60,0.14), rgba(0,0,0,0.22));
    border: 1px solid rgba(224,168,60,0.26); }
.gv-bh b { display: block; font-size: 1.04rem; color: #fff6df; }
.gv-bh span { display: block; margin-top: 3px; font-size: 0.76rem; color: #9aa08f; line-height: 1.45; }

/* The recipe filter. Scrolls sideways rather than wrapping: six chips on a 375px phone wrap to two rows
   and push the list it filters off the fold, which is the one thing a filter must never do. */
.gv-recfilter { display: flex; gap: 6px; overflow-x: auto; padding: 2px 0 8px; margin: 0;
    scrollbar-width: none; -webkit-overflow-scrolling: touch; }
.gv-recfilter::-webkit-scrollbar { display: none; }
.gv-recchip { flex: none; display: inline-flex; align-items: center; gap: 5px; cursor: pointer;
    padding: 6px 11px; border-radius: 999px; font-size: 12px; font-weight: 800; letter-spacing: .02em;
    color: #cfc6b6; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.10); }
.gv-recchip em { font-style: normal; font-size: 11px; font-weight: 800; opacity: .65; }
.gv-recchip.is-on { color: #1b1408; background: #e0a83c; border-color: #e0a83c; }
.gv-recchip.is-on em { opacity: .75; }
.gv-recs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 9px; }

/* The rail on the left is the whole ranking signal: gold means go. */
/* ⚠️ THE CARD IS A COLUMN; THE THREE COLUMNS ARE A ROW INSIDE IT. The temper strip was first added as a
   fourth grid child spanning 1 / -1, which is exactly the trap grid sets for you: a spanning item's
   min-content is distributed into the tracks it crosses. Measured on a 375px phone, the auto column took
   214px of that and the 1fr body column resolved to 0px, so the recipe text wrapped one word per line and
   the cost rows fell off the right edge. minmax(0, 1fr) did not help -- it simply let the body collapse
   without complaint. A sibling cannot size a grid it is not in. */
.gv-rec { display: flex; flex-direction: column; gap: 6px;
    padding: 12px; border-radius: 12px;
    background: rgba(255,255,255,0.035); border: 1px solid rgba(255,255,255,0.08);
    box-shadow: inset 3px 0 0 rgba(255,255,255,0.10); }
.gv-rec.is-ready { background: linear-gradient(90deg, rgba(224,168,60,0.17), rgba(255,255,255,0.04) 60%);
    border-color: rgba(224,168,60,0.44); box-shadow: inset 3px 0 0 #e0a83c, 0 6px 18px rgba(224,168,60,0.13); }
.gv-rec.is-built { opacity: 0.55; box-shadow: inset 3px 0 0 rgba(255,255,255,0.18); }

.gv-rec-main { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 10px; align-items: center; }
.gv-rec-face { width: 44px; height: 44px; flex: none; display: grid; place-items: center;
    border-radius: 11px; background: rgba(0,0,0,0.42); border: 1px solid rgba(255,255,255,0.07); }
.gv-rec-face svg { width: 30px; height: 30px; color: #cfc6b6; }
.gv-rec.is-ready .gv-rec-face { background: rgba(224,168,60,0.16); border-color: rgba(224,168,60,0.4); }
.gv-rec.is-ready .gv-rec-face svg { color: #ffd166; }
.gv-rec-face img { object-fit: contain; }

.gv-rec-body { min-width: 0; }
.gv-rec-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.gv-rec-top b { font-size: 0.98rem; color: #fff6df; }
/* ── THE ROW THAT PUTS ITS OWN PARTS ON THE LIST ──────────────────────────────────────────────
   Sits with the name and the state tag because it belongs to the recipe rather than to any one
   ingredient. Quiet until it is on: an outline on 129 rows is furniture, and the lit state is the only
   thing on this screen that says which recipe you have decided to go after. */
.gv-rec-want { margin-left: auto; flex: none; font: inherit; cursor: pointer;
    font-size: 0.6rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;
    padding: 3px 9px; border-radius: 999px; color: #c8bda8;
    background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.14);
    transition: color 140ms ease, border-color 140ms ease, background 140ms ease; }
.gv-rec-want:hover { color: #efe7d8; border-color: rgba(255,255,255,0.3); }
.gv-rec-want.is-on { color: #ffd166; background: rgba(224,168,60,0.2);
    border-color: rgba(255,209,102,0.6); }
/* "You have made one of these before." Deliberately the quietest tag on the row — it is a fact to
   recognise at a glance, not a call to action, and anything louder would compete with the parts you
   are actually short of. The row stays fully craftable: gear rolls its quality, so a second one is a
   real reason to spend. */
.gv-rec.is-made .gv-tag.is-made { color: #b9ae99; background: rgba(255,255,255,0.06);
    border-color: rgba(255,255,255,0.14); }

.gv-tag { font-style: normal; font-size: 0.6rem; font-weight: 800; letter-spacing: 0.08em;
    text-transform: uppercase; padding: 3px 7px; border-radius: 999px;
    background: rgba(255,255,255,0.08); color: #9aa08f; }
.gv-tag.is-go { background: rgba(224,168,60,0.22); color: #ffd166; }
.gv-tag.is-done { background: rgba(67,196,107,0.18); color: #7ddc9b; }

/* ⚠️ THE PAYOFF LINE IS THE ACCOUNTABILITY, AND IT OUTRANKS THE FLAVOUR TEXT. What a thing DOES, in
   numbers, above what it is like. The blurb used to be the only line here. */
.gv-rec-pay { margin: 5px 0 0; font-size: 0.82rem; color: #e0a83c; font-weight: 600; line-height: 1.4; }
.gv-rec-blurb { margin: 3px 0 0; font-size: 0.78rem; color: #8f968a; line-height: 1.4; font-style: italic; }

.gv-cost { list-style: none; margin: 9px 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 5px; }
.gv-cost li { display: flex; align-items: center; gap: 5px; padding: 4px 8px 4px 5px;
    border-radius: 999px; font-size: 0.74rem;
    background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.07); }
.gv-cost li.is-have { border-color: rgba(67,196,107,0.34); }
.gv-cost li.is-short { border-color: rgba(224,91,106,0.4); background: rgba(224,91,106,0.1); }
.gv-cost-n { font-weight: 800; color: #fff6df; font-variant-numeric: tabular-nums; }
.gv-cost li.is-short .gv-cost-n { color: #ff9c8a; }
.gv-cost-name { color: #9aa08f; }
.gv-cost li em { font-style: normal; font-weight: 700; color: #ff9c8a; }
.gv-cost :global(img) { width: 18px; height: 18px; object-fit: contain; }

.gv-rec-go { flex: none; pointer-events: auto; white-space: nowrap; cursor: pointer; font: inherit;
    padding: 11px 16px; border-radius: 999px; font-weight: 800; font-size: 0.84rem;
    color: #9aa08f; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); }
.gv-rec.is-ready .gv-rec-go { color: #1a1403; border: none;
    background: linear-gradient(180deg, #ffd166, #e0a83c);
    box-shadow: 0 6px 18px rgba(224,168,60,0.34); }
.gv-rec-go:disabled { cursor: default; }

/* ── ⚠️ THE ACTION COLUMN IS ONE GRID CHILD HOLDING TWO BUTTONS ───────────────────────────────
   gv-rec-main is a three-column auto / 1fr / auto grid, so whatever sits in the third column decides how much
   width is left for the body -- and the body is about 250px on a 390px phone with the artwork
   beside it. Hence the batch button is a SHORT secondary pill stacked under Craft rather than a
   second full-width one beside it: "All · 10" costs the column nothing it was not already using
   for "16 short".
   And it is deliberately quiet. Playing the act is the better craft; this is the convenience. */
/* ⚠️ min-content WIDTH, OR THE PILL BECOMES A COIN. The old single button carried a flex:none,
   which is inert once its parent is a grid cell rather than a flex child -- so the action column
   collapsed under the body's 1fr and "Craft" squashed from a pill into a circle. Sizing the wrapper
   to its widest child restores the natural width and the body keeps exactly the room it had. */
/* ⚠️ A FLOOR, BECAUSE max-content ALONE MAKES A COIN. "Craft" measures 29px of text; with the phone
   media query's 13px side padding that is a 55px box, and the 44px tap-target floor added for touch
   turns 55x44 at a 999px radius into a circle rather than a pill. The floor is the shortest label's
   problem only -- "16 short" already measures past it, so nothing else on the list moves. */
.gv-rec-acts { display: grid; gap: 6px; justify-items: stretch; min-width: 76px; }
.gv-rec-all { pointer-events: auto; cursor: pointer; font: inherit;
    padding: 7px 12px; border-radius: 999px; font-weight: 800; font-size: 0.74rem;
    color: #cfe3c6; background: rgba(255,255,255,0.05);
    border: 1px solid rgba(207,227,198,0.28); white-space: nowrap; }
.gv-rec-all:disabled { cursor: default; opacity: 0.6; }

/* ── THE BATCH STEPPER ────────────────────────────────────────────────────────────────────────
   Minus, the make button, plus, and the ceiling. Luke: "they should be able to craft a selected
   amount up to the max quantity of ingredients that they have."

   ⚠️ THE MIDDLE COLUMN IS 1fr AND THE STEPPERS ARE auto, so the row cannot grow when the number
   inside it goes from 2 to 10 -- gv-rec-acts is the narrow third column of a three-column grid and
   a button that widens with its label would push the artwork and the body around on every tap.

   ⚠️ 30px TARGETS, NOT 20. These sit next to a primary action in a scrolling list on a phone, and a
   stepper small enough to be elegant is a stepper that fires the craft button instead. */
.gv-rec-qty { display: grid; grid-template-columns: auto 1fr auto; gap: 4px; align-items: center; }
.gv-rec-qty > button:not(.gv-rec-all) { pointer-events: auto; cursor: pointer; font: inherit;
    width: 30px; height: 30px; padding: 0; border-radius: 9px; line-height: 1;
    font-size: 1rem; font-weight: 800;
    color: #cfe3c6; background: rgba(255,255,255,0.05);
    border: 1px solid rgba(207,227,198,0.28); }
.gv-rec-qty > button:not(.gv-rec-all):disabled { cursor: default; opacity: 0.35; }
.gv-rec-qty .gv-rec-all { padding-left: 6px; padding-right: 6px; }
/* Spans all three columns so the ceiling sits under the control it belongs to rather than beside it. */
.gv-rec-qty em { grid-column: 1 / -1; justify-self: center; font-style: normal;
    font-size: 0.62rem; font-weight: 700; letter-spacing: 0.04em;
    color: rgba(207,227,198,0.55); }

/* ── "SHOW ME WHERE IT WENT" ──────────────────────────────────────────────────────────────────
   The craft card's answer to the one question it never used to answer. Quieter than the close
   button on purpose: it is an offer, not the thing most people want after a craft. */
.gv-made-goto { display: block; width: 100%; margin: 10px 0 0; padding: 9px 12px;
    border-radius: 999px; font: inherit; font-size: 0.78rem; font-weight: 800; cursor: pointer;
    color: #cfe3c6; background: rgba(255,255,255,0.05);
    border: 1px solid rgba(207,227,198,0.28); }
.gv-made-goto:hover { background: rgba(255,255,255,0.09); }

/* ── THE SHELF THAT WAS JUST SCROLLED TO ──────────────────────────────────────────────────────
   ⚠️ A SMOOTH SCROLL THAT LANDS ON A WALL OF IDENTICAL PANELS leaves the player hunting for which
   one moved. The flash says "this one" and then gets out of the way. Removed on a timer in
   goToArea rather than on animationend -- an animationend never fires if the element is not
   painted, and a permanently lit panel would be worse than no flash at all. */
.gv-sect.is-found { animation: gv-found 1.6s ease-out; }
@keyframes gv-found {
    0%, 100% { box-shadow: 0 0 0 0 rgba(159,224,138,0); }
    18% { box-shadow: 0 0 0 3px rgba(159,224,138,0.55), 0 0 26px rgba(159,224,138,0.35); }
}
@media (prefers-reduced-motion: reduce) { .gv-sect.is-found { animation: none; } }

/* ── THE RESULT ───────────────────────────────────────────────────────────────────────────────
   Both halves of the trade on one card: what arrived, and underneath it what left. A toast can
   report a name; it can never report a cost, which is the thing a player needs to see to trust the
   system enough to spend twenty minutes of parts on it again. */
/* ⚠️ ABOVE THE DOCK. The dock sits over the panel by design and kept floating on top of the
   result card, so the moment that is supposed to own the screen had four buttons punched
   through it. 1200 clears every chrome layer this feature has. */
.gv-made { position: fixed; inset: 0; z-index: 1200; display: grid; place-items: center;
    background: rgba(4,6,4,0.76); padding: 18px;
    animation: gvMadeIn 220ms ease-out both; }
.gv-made-card { width: min(380px, 100%); text-align: center; padding: 22px 20px 18px;
    border-radius: 18px; border: 1px solid rgba(224,168,60,0.42);
    background: radial-gradient(120% 90% at 50% 0%, rgba(224,168,60,0.2), transparent 62%), #14170f;
    box-shadow: 0 24px 70px rgba(0,0,0,0.7);
    animation: gvMadePop 420ms cubic-bezier(.16,1,.3,1) both; }
.gv-made-kick { display: block; font-style: normal; font-size: 0.64rem; font-weight: 800;
    letter-spacing: 0.26em; text-transform: uppercase; color: #e0a83c; }
/* ── THE REWORK ───────────────────────────────────────────────────────────────────────────────
   The one button on the bench that can be pressed twice, so it reads differently from Craft: the same
   shape, cooler, and clearly an attempt rather than a purchase. */
.gv-rec-go.is-rework { background: linear-gradient(180deg, #6f87c4, #3f5591); border-color: #2c3d6b;
    color: #f2f6ff; }
.gv-rec-go.is-rework:disabled { filter: saturate(.3) brightness(.8); }
/* A roll that lost is not a failure to hide -- it is the outcome the player paid for. Stated plainly in
   the same place the win would be, one shade quieter. */
.gv-made-roll { margin: 2px 0 10px; font-size: 14px; color: #cfe0c6; text-align: center; }
.gv-made-roll b { color: #ffe9a8; }
.gv-made-kick.is-held { color: #b9c7ea; }
.gv-made-name { display: block; margin-top: 4px; font-size: 1.5rem; line-height: 1.15; color: #fff6df; }
.gv-made-face { margin: 14px auto 10px; width: 112px; height: 112px; display: grid; place-items: center;
    border-radius: 20px; background: rgba(224,168,60,0.13); border: 1px solid rgba(224,168,60,0.3); }
.gv-made-face svg { width: 62px; height: 62px; color: #ffd166; }
.gv-made-face img { object-fit: contain; }
.gv-made-pay { margin: 0 0 14px; font-size: 0.88rem; color: #e0a83c; font-weight: 600; }
.gv-made-cost { margin-top: 12px; color: #8f968a; }
.gv-made-spent { list-style: none; margin: 8px 0 0; padding: 0;
    display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; }
.gv-made-spent li { display: flex; align-items: center; gap: 5px; padding: 5px 9px 5px 6px;
    border-radius: 999px; font-size: 0.76rem;
    background: rgba(0,0,0,0.34); border: 1px solid rgba(255,255,255,0.08); }
.gv-made-spent span { font-weight: 800; color: #ff9c8a; font-variant-numeric: tabular-nums; }
.gv-made-spent em { font-style: normal; color: #9aa08f; }
.gv-made-spent :global(img) { width: 20px; height: 20px; object-fit: contain; }
.gv-made-card button { margin-top: 18px; cursor: pointer; font: inherit; font-weight: 800;
    padding: 12px 30px; border-radius: 999px; border: none; color: #1a1403;
    background: linear-gradient(180deg, #ffd166, #e0a83c); }
@keyframes gvMadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes gvMadePop {
    0% { opacity: 0; transform: scale(0.88) translateY(14px); }
    100% { opacity: 1; transform: scale(1) translateY(0); }
}

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
/* ── THE ARMOURY, WITH PICTURES ───────────────────────────────────────────────────────────────
   Fifteen pieces of stat text with nothing to look at, beside a tool ladder carrying 156 sprites.
   The face sits left of the name the way every other tile in the Grove is laid out. */
.gv-arm-face { flex: 0 0 auto; width: 56px; height: 56px; display: grid; place-items: center;
    border-radius: 10px; margin-bottom: 4px;
    background: radial-gradient(120% 120% at 50% 15%, rgba(255,255,255,0.07), rgba(0,0,0,0.28) 72%);
    border: 1px solid rgba(255,255,255,0.12); }
.gv-arm-face img { width: 52px; height: 52px; object-fit: contain;
    filter: drop-shadow(0 2px 5px rgba(0,0,0,0.7)); }

/* The purse. A currency with a face is a currency people talk about — see the note in GroveArmoury. */
.gv-arm-purse { display: flex; align-items: center; gap: 8px; margin: 0 0 12px;
    padding: 8px 12px; border-radius: 10px; width: fit-content;
    background: rgba(90,140,110,0.12); border: 1px solid rgba(140,200,160,0.3); }
.gv-arm-purse img { width: 26px; height: 26px; object-fit: contain; }
.gv-arm-purse b { font-size: 1.05rem; font-weight: 900; color: #b8e6c6; }
.gv-arm-purse span { font-size: 0.76rem; letter-spacing: 0.1em; text-transform: uppercase; color: #8fae98; }

/* ── THE TWO HALVES OF THE PANEL ──────────────────────────────────────────────────────────────
   Luke: "I'm looking at the card equipment area and I'm getting confused with the merit area. And
   they should be separate." A shelf of earned collectibles and a till that spends a currency were
   in one continuous scroll in matching painted planks. Now you can only be looking at one.

   The count on each tab is the thing that half is about — how many cards you hold, how many merits
   you have to spend — so the tab answers the question before you press it. */
.gv-etabs { display: flex; gap: 8px; margin: 0 0 12px; }
.gv-etabs button { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 7px;
    padding: 9px 10px; border-radius: 10px; cursor: pointer; font: inherit;
    font-size: 0.82rem; font-weight: 800; letter-spacing: 0.02em; color: #b9ae99;
    background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.12); }
.gv-etabs button i { font-style: normal; font-size: 0.72rem; font-weight: 900; padding: 1px 7px;
    border-radius: 999px; background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.12); }
.gv-etabs button.is-on { color: #ffe9a8; background: rgba(255,215,94,0.13);
    border-color: rgba(255,215,94,0.5); }
.gv-etabs button.is-on i { color: #ffd75e; }

/* ── THE MONSTER CARD'S FACE ──────────────────────────────────────────────────────────────────
   A framed plate with the creature in it and its rung in the corner — the shape of a collectible
   rather than a row in a table. This is the single change that stops the emblem shelf reading as
   the merits panel below it: one of them has pictures of animals on it. */
/* ⚠️ THE FRAME IS THE RUNG'S COLOUR, so the shelf is readable at arm's length. Luke: the monster
   cards "need to be way more colorful". Worn is steel, Marked green, Etched blue, Sealed violet,
   Crowned gold, Ascendant pink — the same ladder EMBLEM_STARS already paints the stars with, which
   means the colour is information rather than decoration. A dormant card keeps the neutral frame. */
.gv-em-face { position: relative; flex: 0 0 auto; width: 54px; height: 54px; border-radius: 10px;
    display: grid; place-items: center; overflow: visible;
    background:
        radial-gradient(120% 120% at 50% 15%, color-mix(in srgb, var(--rung, #8d8577) 26%, transparent), transparent 72%),
        radial-gradient(120% 120% at 50% 15%, rgba(255,255,255,0.09), rgba(0,0,0,0.3) 70%);
    border: 1px solid color-mix(in srgb, var(--rung, #8d8577) 55%, rgba(255,255,255,0.14));
    box-shadow: 0 0 14px -4px color-mix(in srgb, var(--rung, #8d8577) 70%, transparent); }
.gv-em-face img { width: 46px; height: 46px; object-fit: contain;
    filter: drop-shadow(0 2px 5px rgba(0,0,0,0.75)); }
.gv-em-face i { position: absolute; bottom: -7px; left: 50%; transform: translateX(-50%);
    font-style: normal; font-size: 0.56rem; letter-spacing: -0.04em; white-space: nowrap;
    padding: 1px 5px; border-radius: 999px; background: rgba(8,10,8,0.92);
    border: 1px solid rgba(255,255,255,0.16); }

/* Below the first rung an emblem pays nothing. It is DIMMED rather than marked wrong — it is not
   broken, it is unfinished, and the line beside it says how much more. */
.gv-em.is-dormant .gv-em-face { opacity: 0.55; filter: saturate(0.4); }
.gv-em-dormant { color: #8d8577 !important; font-style: italic; }

.gv-em > b { font-size: 0.9rem; letter-spacing: .04em; min-width: 62px; }
.gv-em > div { flex: 1; min-width: 0; }
.gv-em p { margin: 2px 0; font-size: 0.8rem; color: #cfc6b6; }
.gv-em p em { font-style: normal; color: #ffcf6a; }
.gv-em small { font-size: 0.7rem; color: #8d8577; }
.gv-em button { padding: 7px 15px; border-radius: 999px; border: none; cursor: pointer; font: inherit;
    font-size: 0.76rem; font-weight: 700; background: rgba(159,224,138,0.18); color: #cdf5bd; }
.gv-em button:disabled { opacity: 0.5; cursor: default; }

/* ── TEMPERING ───────────────────────────────────────────────────────────────────────────────────────────
   The one control on a recipe card that is a choice rather than a confirmation, so it reads as a switch
   with a price on it: the button, what it buys, and what it costs, on one line. Dim until armed — an
   always-lit second button beside Craft would compete with the thing the card is for. */
.gv-temper { display: flex; align-items: center; gap: 8px; margin-top: 8px;
    padding: 6px 8px; border-radius: 9px; background: rgba(0,0,0,0.24);
    border: 1px solid rgba(255,255,255,0.06); }
.gv-temper.is-on { border-color: rgba(255,200,97,0.42); background: rgba(255,200,97,0.09); }
.gv-temper-go { flex: none; padding: 4px 10px; border-radius: 7px; cursor: pointer;
    font-size: 0.68rem; letter-spacing: 0.07em; text-transform: uppercase; font-weight: 700;
    color: #cfc6b6; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.12); }
.gv-temper.is-on .gv-temper-go { color: #2a1f05; background: #ffc861; border-color: #c89a3a; }
/* ⚠️ nowrap AND overflow-hidden, because this sits in a ~250px column beside the recipe art. Allowed to
   wrap, the odds and the cost reflowed into each other and printed on top of one another on a phone. */
.gv-temper-odds { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    font-size: 0.68rem; color: #9aa08f; font-variant-numeric: tabular-nums; }
.gv-temper-odds i { margin: 0 3px; font-style: normal; }
.gv-temper-odds b { color: #ffc861; }
.gv-temper-odds em { margin-left: 6px; font-style: normal; font-size: 0.62rem; color: #8f968a; }

/* What the band bought, on the card for the thing it bought it for. Sits under the roll, because it is
   the roll's consequence and reads as its second half. */
/* ⚠️ NO COLOUR ON THE BASE RULE. It carried a hardcoded green that beat the band tint on
   specificity, so every result read the same shade whatever it rolled — the colour is the
   fastest thing on the card to read and it was saying nothing. */
.gv-made-bonus { display: block; margin-top: 4px; font-size: 0.9rem; font-weight: 800; }
.gv-made-tmp { margin-left: 7px; font-style: normal; font-size: 0.62rem; letter-spacing: 0.08em;
    text-transform: uppercase; color: #ffc861; opacity: 0.85; }

/* ── CHARMS ──────────────────────────────────────────────────────────────────────────────────────────────
   A slot row like the belt's, because it is the same kind of decision: one of several, armed for the next
   run. The band rides the name, since two rows of one charm differ by nothing else. */
.gv-q { font-style: normal; font-size: 0.62rem; letter-spacing: 0.05em; text-transform: uppercase;
    margin-left: 5px; color: #9aa08f; }
/* The glyph carries the band's colour too. Three rows of one charm differ only by how well they came out,
   and a stark white icon on all of them makes the shelf read as three identical things. */
.gv-empty { margin: 4px 2px; font-size: 0.78rem; line-height: 1.45; color: #9aa08f; }

/* The recipe a boss handed over. The loudest line on the kill card, because it happens once per map and
   a row quietly appearing in a list of two hundred is a reward nobody notices they earned. */
.gv-won-taught { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 10px;
    padding: 9px 11px; border-radius: 11px; font-size: 0.9rem; font-weight: 800; color: #2a1f05;
    background: linear-gradient(180deg, #ffd98a, #e6a93c); border: 1px solid #c89a3a; }
.gv-won-taught svg { width: 20px; height: 20px; }
.gv-won-taught em { flex-basis: 100%; font-style: normal; font-size: 0.68rem; font-weight: 700;
    letter-spacing: 0.06em; text-transform: uppercase; opacity: 0.72; }







/* ── ⚠️ THE RECIPE ROW IS A LIST ITEM, NOT A POSTER ──────────────────────────────────────────────────────
   Luke: "cards are too big and verbose". There are 129 of these and each one carried a name, a tag, a
   payoff line, two lines of italic flavour, one full-width row PER INGREDIENT, and a temper strip — about
   190px of phone for a thing you are scanning past. The flavour is gone from the row, the ingredients are
   chips on one wrapped line instead of a stack, and the padding is tighter. Roughly half the height, with
   nothing a player was actually reading removed. */
.gv-rec { padding: 9px 10px; }
.gv-cost { display: flex; flex-wrap: wrap; gap: 5px; list-style: none; margin: 5px 0 0; padding: 0; }
.gv-cost li { display: inline-flex; align-items: center; gap: 5px; padding: 3px 8px 3px 4px;
    border-radius: 999px; font-size: 0.72rem; background: rgba(0,0,0,0.3);
    border: 1px solid rgba(255,255,255,0.08); }
.gv-cost li.is-have { border-color: rgba(124,185,90,0.42); }
.gv-cost li.is-short { border-color: rgba(255,122,106,0.42); }
.gv-cost li.is-short .gv-cost-n { color: #ff9f90; }
.gv-cost-n { font-weight: 800; font-variant-numeric: tabular-nums; color: #e9e2d2; }
.gv-rec-pay { margin: 2px 0 0; font-size: 0.78rem; line-height: 1.3; color: #e0a83c;
    overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.gv-rec-top b { font-size: 0.9rem; }
.gv-temper { margin-top: 0; padding: 5px 8px; }
.gv-rec-go { padding: 9px 13px; font-size: 0.82rem; }

/* ── ⚠️ ONE RULE FOR EVERY BAND COLOUR ───────────────────────────────────────────────────────────────────
   There were eleven places in this file naming a hex for Pristine and all eleven had to agree. They are
   gone: QUALITY_BANDS carries a tint and an ink, components hand them over as --band and --band-ink, and
   the only thing left here is what to DO with a colour. Retint the ladder in rarity.js and every surface
   in the feature moves together.

   ⚠️ AND THIS BLOCK WAS SILENTLY DELETED ONCE. A later edit replaced the craft-act styles by cutting from
   their header to the end of the template literal — which swallowed everything that happened to sit
   after them, including this. Nothing failed: no gate, no build error, no console warning. The band
   labels simply went back to inherited cream and stayed that way until a screenshot was read closely.
   Anything appended at the end of this file is one careless slice away from vanishing; this lives above
   the act block now, where the act block cannot reach it. */
.gv-odds li[style*="--band"] span,
.gv-recall li em[style*="--band"],
.gv-made-q[style*="--band"],
.gv-made-bonus[style*="--band"],
.gv-q[style*="--band"],
.gv-act-odds li[style*="--band"] b { color: var(--band) !important; }
.gv-tag.is-q[style*="--band"] { color: var(--band);
    background: color-mix(in srgb, var(--band) 18%, transparent); }
.gv-slot[style*="--band"] svg { color: var(--band); }
.gv-slot.is-masterwork svg { filter: drop-shadow(0 0 7px color-mix(in srgb, var(--band) 60%, transparent)); }
.gv-made-q.is-masterwork, .gv-made-bonus.is-masterwork {
    text-shadow: 0 0 12px color-mix(in srgb, var(--band) 55%, transparent); }
.gv-odds li[style*="--band"] { border-color: color-mix(in srgb, var(--band) 26%, transparent); }
.gv-odds li.is-masterwork { border-color: color-mix(in srgb, var(--band) 55%, transparent);
    box-shadow: 0 0 14px color-mix(in srgb, var(--band) 24%, transparent); }

/* ── ⚠️ THE BENCH HEADER IS ONE STRIP ────────────────────────────────────────────────────────────────
   It was 294px on a 390x920 phone and the first pressable recipe started at y=472 — over half the
   screen spent on statistics before a single Craft button. A seven-year-old called it too
   complicated and he was being kind about it.

   Level, a thin bar, merits, and a Details disclosure. The odds table moved inside that disclosure
   because the craft act already shows the odds LIVE and for the aim you are actually taking; a static
   copy on the screen before it was the less useful of the two and was charging the most rent. */
.gv-level { display: flex; align-items: center; gap: 10px; margin: 0 0 10px; padding: 8px 11px;
    border-radius: 11px; background: rgba(0,0,0,0.26); border: 1px solid rgba(255,255,255,0.07); }
.gv-level-no { flex: none; display: inline-flex; align-items: baseline; gap: 4px; }
.gv-level-no i { font-style: normal; font-size: 0.6rem; letter-spacing: 0.1em; text-transform: uppercase;
    color: #9aa08f; }
.gv-level-no b { font-size: 1.05rem; font-weight: 900; color: #e0a83c; font-variant-numeric: tabular-nums; }
.gv-level-bar { position: relative; flex: 1; min-width: 0; height: 6px; border-radius: 999px; overflow: hidden;
    background: rgba(0,0,0,0.5); box-shadow: inset 0 1px 3px rgba(0,0,0,0.6); }
.gv-level-bar i { display: block; height: 100%; border-radius: 999px;
    background: linear-gradient(90deg, #b47a12, #ffd75e); transition: width 300ms ease; }
.gv-level-bar::after { content: ""; position: absolute; inset: 0; pointer-events: none;
    background: linear-gradient(100deg, transparent 20%, rgba(255,255,255,0.45) 50%, transparent 80%);
    transform: translateX(-100%); animation: gvLevelSheen 2600ms ease-in-out infinite; }
@keyframes gvLevelSheen { 0%, 55% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
.gv-level-more { flex: none; }
.gv-level-more > summary { list-style: none; cursor: pointer; min-height: 32px; display: grid;
    place-items: center; padding: 0 11px; border-radius: 999px; font-size: 0.66rem; font-weight: 700;
    letter-spacing: 0.07em; text-transform: uppercase; color: #cfc6b6;
    background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.12); }
.gv-level-more > summary::-webkit-details-marker { display: none; }
.gv-level-more[open] > summary { color: #1b1408; background: #e0a83c; border-color: #e0a83c; }
/* ⚠️ THE OPEN PANEL ESCAPES THE STRIP. The strip is a flex row; left in flow the details body would
   squeeze the bar to nothing the moment it opened. Absolute, full width of the bench, under the row. */
.gv-level-more > div { position: absolute; left: 0; right: 0; z-index: 5; margin-top: 9px;
    padding: 11px; border-radius: 11px; background: #171a13;
    border: 1px solid rgba(255,255,255,0.12); box-shadow: 0 12px 30px rgba(0,0,0,0.55);
    display: flex; flex-direction: column; gap: 10px; }
.gv-bench2 { position: relative; }
.gv-recall-list { list-style: none; display: flex; flex-direction: column; gap: 3px; margin: 0; padding: 0; }
.gv-recall-list li { display: flex; align-items: center; gap: 8px; font-size: 0.76rem;
    padding: 5px 8px; border-radius: 7px; background: rgba(0,0,0,0.26); }
.gv-recall-list li span { flex: 1; min-width: 0; color: #cfc6b6; overflow: hidden;
    text-overflow: ellipsis; white-space: nowrap; }
.gv-recall-list li em { font-style: normal; font-size: 0.66rem; font-weight: 700; color: var(--band); }
.gv-recall-list li b { color: #e0a83c; font-variant-numeric: tabular-nums; font-size: 0.74rem; }

/* ── ⚠️ EVERY CONTROL IN THE GROVE IS AT LEAST 44px TALL ─────────────────────────────────────────────
   Luke: "audit every detail of the grove on all screen sizes." The first pass of this block set the
   floor at 32 and listed the five controls that were under it.

   ⚠️ THE NUMBER WAS WRONG AND THE MEASUREMENT WAS THE REASON. 32 is the smallest a control can be and
   still be hit on purpose; 44 is the size a thumb actually covers, and it is the figure the rest of this
   repo already works to. Re-audited with elementFromPoint rather than getBoundingClientRect -- "can a
   thumb land on this" instead of "how big is the box" -- and the zone HUD, both close buttons, Craft,
   Temper, Forge, the filter chips and both emblem buttons all came in under it on every phone size.

   ⚠️ AND TWO MECHANISMS, BECAUSE ONE DOES NOT COVER IT:

   min-height, where the control can grow. Still min-height rather than padding, for the original
   reason: a control grows to the floor and no further, and padding on the already-tall ones would push
   the panels out of a 441px phone.

   A transparent ::after, where it cannot. The zone HUD is a row of small pills over the game and the
   close buttons are 40px circles in a corner -- growing those boxes would cost the screen real estate
   the game is using, so the HIT AREA grows and the box does not.

   ⚠️ THE EXPANDER COMES IN TWO SHAPES AND THAT IS NOT TIDINESS. Widening everything to 44 made adjacent
   controls overlap: the ingredient chips sit six pixels apart, so each 54px chip grown to 44 wide stole
   its neighbour's edge and a thumb aimed at one toggled the next. Isolated controls grow both ways;
   anything that sits in a row grows in height only, which is the axis that was short anyway.

   ⚠️ AND AN EXPANDER CANNOT LEAVE A SCROLLER. The filter row is overflow-x:auto, which computes
   overflow-y to auto as well, so those chips clip their own ::after on all four sides -- they are in the
   min-height list for that reason and no other.

   ⚠️ THE INGREDIENT CHIPS STAY AT 32, DELIBERATELY. Three to a cost row across 129 rows, and Luke on
   this exact screen: "cards are too big and verbose". They are a fine-grained shortcut whose job is now
   done by the Find control in the same card's header, so 44px each would cost three rows of height on
   every card to duplicate a button already sitting above them. */
.gv-paper-arrow { min-width: 44px; min-height: 44px; }
.gv-temper-go { min-height: 44px; padding-inline: 12px; }
.gv-arm-go { min-height: 44px; }
.gv-recchip { min-height: 44px; }
.gv-em button, .gv-eslot button { min-height: 44px; }
.gv-act-hit, .gv-rec-go, .gv-slot { min-height: 44px; }

/* Isolated and small in both axes: nothing sits beside them, so they grow both ways. */
.gv-leave, .gv-exit, .gv-zsheet-x, .gv-rec-want, .gv-wish-clear { position: relative; }
.gv-leave::after, .gv-exit::after, .gv-zsheet-x::after, .gv-rec-want::after, .gv-wish-clear::after {
    content: ""; position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
    width: max(100%, 44px); height: max(100%, 44px); border-radius: inherit; }

/* ── ⚠️ AND THE PLANK TITLES STOP TRUNCATING AT 320px ────────────────────────────────────────────────
   "Backpack 11/20", "Workbench 7 ready", "Emblems 0/3 worn" and "Boss Armour 368 merits" all lost
   characters to an ellipsis on the smallest phone, and the last one clipped at 390 too — which is an
   ordinary modern handset, not an edge case. The name is what identifies the panel, so the COUNT gives
   up its space first: smaller, tighter, and allowed to shrink. */
@media (max-width: 400px) {
    /* ⚠️ IT WRAPS RATHER THAN TRUNCATES AT THE NARROWEST SIZES. Shrinking the type got three of the five
       titles to fit and left "Workbench 7 ready" and "Boss Armour 368 merits" still losing characters at
       320px. A name with its end cut off is worse than a name on two lines — and the plank is a 3-slice
       that stretches, so it simply grows to hold them. */
    .gv-sect > h4 { padding: 7px 6px; font-size: 0.84rem; letter-spacing: 0.03em;
        white-space: normal; line-height: 1.16; text-overflow: clip; }
    .gv-sect > h4 i { font-size: 0.62rem; padding: 3px 7px; min-width: 0; overflow: hidden;
        text-overflow: ellipsis; }
    .gv-sect-ico { width: 30px; height: 30px; }
    .gv-paper-chrome { max-width: calc(100% - 16px); padding: 4px 5px 5px; }
    .gv-paper-head { gap: 5px; }
    .gv-paper-head b { font-size: 0.72rem; }
    .gv-paper-head i { font-size: 0.56rem; padding: 2px 5px; }
}

/* ── THE CRAFT ACT: THREE STAGES ─────────────────────────────────────────────────────────────────────────
   Luke: "its 3 separate stages with immersive background and sprite decorations, you seem to have combined
   it all?" The first build was one panel with the rack bolted on top and the controls swapping underneath —
   a widget with three modes. These are three rooms: the fire, the anvil, the cooling rack, each behind its
   own painted backdrop with the piece you are making as the hero of the scene. */
/* ⚠️ THE PANEL SITS AT THE BOTTOM, NOT THE MIDDLE. Centred, it covered the coals and the anvil — the
   exact part of each painting the stage exists to show. The controls belong under the work, the way they
   would if you were standing at the bench. */
/* ⚠️ ABOVE THE PUSH PROMPT, WHICH IS z-index 1200. The act was 120, and the moment its panel moved to the
   bottom of the screen the site's "Turn on notifications" banner — fixed, full width on a phone, bottom 10px
   — landed squarely on top of the PUMP button and made the first stage unplayable. It only showed up because
   the stage was photographed on an account that has not enabled push; a modal that owns the whole screen has
   to outrank a passive prompt. */
.gv-act { position: fixed; inset: 0; z-index: 1300; display: grid; align-items: end; justify-items: center;
    padding: 12px; background: #090806; overflow: hidden; }
.gv-act.is-shook { animation: gv-act-shake 480ms cubic-bezier(.36,.07,.19,.97); }
@keyframes gv-act-shake {
    0%, 100% { transform: translate3d(0,0,0); }
    12% { transform: translate3d(-6px,2px,0) rotate(-0.5deg); }
    28% { transform: translate3d(5px,-3px,0) rotate(0.4deg); }
    46% { transform: translate3d(-4px,2px,0) rotate(-0.3deg); }
    66% { transform: translate3d(3px,-1px,0); }
    84% { transform: translate3d(-1px,1px,0); }
}

/* THE SCENES. One layer per stage, cross-faded — swapping a url pops the next room in unpainted. */
.gv-act-scenes { position: absolute; inset: 0; pointer-events: none; }
.gv-act-scene { position: absolute; inset: 0; opacity: 0; background-size: cover;
    background-position: center 62%; transition: opacity 520ms ease, transform 900ms ease;
    transform: scale(1.06); }
.gv-act-scene.is-on { opacity: 1; transform: scale(1); }
/* ⚠️ A SCRIM OVER THE ART, NOT A DARKER PAINTING. The backdrops have to stay readable as rooms while
   carrying type and a plinko rack; dimming them in the file would have made three murky plates that could
   never be brightened. Heavier at the top, where the panel sits, and light at the bottom so the floor of
   the room still reads. */
.gv-act-scenes::after { content: ""; position: absolute; inset: 0;
    background: linear-gradient(180deg, rgba(6,5,4,0.50) 0%, rgba(6,5,4,0.12) 38%, rgba(6,5,4,0.78) 100%); }

/* ⚠️ THE PANEL BARELY FILLS. The first cut put a 52-80% wash here ON TOP of the scene scrim, and two
   stacked scrims turned three painted rooms into a dark smudge — the opposite of the immersive backdrop
   that was asked for. The controls carry their own dark pills and the type carries a shadow, so the panel
   only needs to soften the middle of the frame, not hide it. */
.gv-act-in { position: relative; z-index: 2; width: min(430px, 100%); max-height: 86%; overflow-y: auto;
    display: flex; flex-direction: column; gap: 10px; padding: 0 12px 14px; border-radius: 14px;
    background: radial-gradient(130% 78% at 50% 62%, rgba(6,8,5,0.68), rgba(6,8,5,0.26) 78%, transparent);
    box-shadow: 0 18px 50px rgba(0,0,0,0.45); }
.gv-act-in::before, .gv-act-in::after,
.gv-act-trim::before, .gv-act-trim::after {
    content: ""; position: absolute; width: 21px; height: 21px; pointer-events: none; opacity: 0.9;
    background: url("/images/grove/ui-corner.webp") center / contain no-repeat; z-index: 3; }
.gv-act-in::before { top: 5px; left: 5px; }
.gv-act-in::after { top: 5px; right: 5px; transform: scaleX(-1); }
.gv-act-trim::before { bottom: 5px; left: 5px; transform: scaleY(-1); }
.gv-act-trim::after { bottom: 5px; right: 5px; transform: scale(-1); }

.gv-act-plank { position: relative; margin: 0 -12px 2px; min-height: 52px; display: flex;
    align-items: center; gap: 9px; padding: 7px 10px;
    border-style: solid; border-width: 0 26px; border-image-source: url("/images/grove/slab-plank.webp");
    border-image-slice: 0 150 fill; border-image-repeat: stretch;
    font-size: 0.9rem; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase;
    color: #22190f; text-shadow: 0 1px 0 rgba(255,255,255,0.28);
    min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.gv-act-ico { width: 34px; height: 34px; flex: none; object-fit: contain;
    filter: drop-shadow(0 2px 4px rgba(0,0,0,0.55)); }
.gv-act-plank i { margin-left: auto; flex: none; font-style: normal; font-size: 0.62rem; font-weight: 700;
    letter-spacing: 0.1em; padding: 4px 10px; border-radius: 999px; color: #ffd75e;
    background: rgba(14,16,11,0.88); text-shadow: none; border: 1px solid rgba(0,0,0,0.5); }

.gv-act-beats { display: flex; gap: 5px; justify-content: center; }
.gv-act-beats span { width: 30px; height: 3px; border-radius: 2px; background: rgba(255,255,255,0.16); }
.gv-act-beats span.is-done { background: #5ce0c0; }
.gv-act-beats span.is-now { background: #ffd75e; box-shadow: 0 0 10px rgba(255,215,94,0.8); }

.gv-act-stage { display: flex; flex-direction: column; gap: 10px;
    animation: gv-act-enter 420ms cubic-bezier(.2,.8,.3,1); }
@keyframes gv-act-enter {
    from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; }
}
@media (prefers-reduced-motion: reduce) {
    .gv-act-stage, .gv-act-scene { animation: none; transition: opacity 200ms ease; }
}

/* ── THE WORK, STANDING IN THE ROOM ──────────────────────────────────────────────────────────────────
   Absolutely placed over the SCENE at that room's hot spot — in the coal bed, on the anvil face — rather
   than centred in a control panel in front of it. That one change is most of what "it still looks like a
   sprite in front of a picture" was describing. */
.gv-act-work-at { position: absolute; z-index: 1; width: 0; height: 0;
    display: grid; place-items: center; pointer-events: none; }
.gv-act-work-piece { width: 104px; height: 104px; object-fit: contain; grid-area: 1 / 1;
    transition: filter 120ms linear;
    filter: drop-shadow(0 6px 10px rgba(0,0,0,0.65)); }
.gv-act-work-piece.is-struck { animation: gv-act-ring 320ms cubic-bezier(.2,1.6,.4,1); }
@keyframes gv-act-ring {
    0% { transform: scale(1) rotate(0); } 28% { transform: scale(1.16) rotate(-5deg); }
    100% { transform: scale(1) rotate(0); }
}
.gv-act-work-piece.is-perfect { filter: drop-shadow(0 0 22px rgba(255,215,94,0.95)) brightness(1.35); }
.gv-act-work-piece.is-hit { filter: drop-shadow(0 0 16px rgba(92,224,192,0.8)) brightness(1.2); }

.gv-act-emberglow { grid-area: 1 / 1; width: 230px; height: 150px; border-radius: 50%;
    background: radial-gradient(ellipse at center, rgba(255,150,45,0.8), rgba(255,90,20,0.22) 52%, transparent 70%);
    filter: blur(8px); transition: opacity 140ms linear; }

/* ⚠️ EMBERS THAT ANSWER THE TAPPING. Eight motes on staggered delays, rising faster and further as the
   bar fills — the thing that makes the bellows feel wired to the fire instead of to a progress bar. */
.gv-act-embers { grid-area: 1 / 1; width: 110px; height: 10px; position: relative; }
.gv-act-embers i { position: absolute; bottom: 0; width: 4px; height: 4px; border-radius: 50%;
    left: calc(var(--i) * 13px); background: #ffbe5a;
    box-shadow: 0 0 7px rgba(255,170,60,0.95);
    animation: gv-act-ember 2s ease-out infinite; animation-delay: calc(var(--i) * -0.27s);
    transition: opacity 200ms linear; }
@keyframes gv-act-ember {
    0% { transform: translate3d(0,0,0) scale(1); opacity: 0.95; }
    70% { opacity: 0.5; }
    100% { transform: translate3d(calc(var(--i) * 1.6px - 6px), -120px, 0) scale(0.25); opacity: 0; }
}

/* Sparks off the anvil, in the colour the blow earned. */
/* ⚠️ A POSITIONED BOX OF ITS OWN, AND ABOVE THE PIECE. The first cut was a 0x0 grid cell with no
   a position of its own, so ten sparks resolved against a different ancestor and stacked invisibly behind the
   sprite — the harness counted ten elements and the screenshot showed none. An element count is not
   evidence that anything was drawn. */
.gv-act-sparks { grid-area: 1 / 1; position: relative; width: 1px; height: 1px; z-index: 3; }
.gv-act-sparks i { position: absolute; top: 0; left: 0; width: 4px; height: 13px; margin: -6px -2px;
    border-radius: 2px; transform-origin: 50% 100%;
    background: #ffd75e; box-shadow: 0 0 10px rgba(255,215,94,0.95);
    transform: rotate(var(--a)); animation: gv-act-spark-fly 560ms ease-out forwards; }
.gv-act-sparks.is-hit i { background: #5ce0c0; box-shadow: 0 0 8px rgba(92,224,192,0.9); }
.gv-act-sparks.is-miss i { background: #8b8375; box-shadow: none; opacity: 0.5; }
@keyframes gv-act-spark-fly {
    0% { opacity: 1; transform: rotate(var(--a)) translateY(0) scale(1); }
    100% { opacity: 0; transform: rotate(var(--a)) translateY(calc(var(--d) * -1)) scale(0.35); }
}

/* ── THE PUMP BURST ───────────────────────────────────────────────────────────────────────────
   One burst per pump, thrown upward out of the button in a ragged fan.

   ⚠️ NOT gv-act-embers, WHICH ALREADY EXISTS TWENTY LINES UP. That one is the ambient coal glow and
   I first wrote this under the same name, which would have replaced the fire to add sparks to it.
   The coals answer your SCORE; this answers your TAP. Two different jobs, two class names.

   ⚠️ THE COLOUR IS THE SCORE. --hot comes in from the component as the heat bar's own fraction, and
   these interpolate dull-red -> orange -> white with it, so a glance at the embers says how close to
   temperature the fire is without anybody reading the counter. Decoration that is also a readout.

   ⚠️ STAGGERED BY --t AND SCATTERED BY THE ANGLE the component passes, because nine identical
   particles leaving at the same instant on the same arc reads as one fat triangle rather than a
   shower of sparks. */
.gv-act-pumpfx { grid-area: 1 / 1; position: absolute; left: 50%; bottom: 46px;
    width: 1px; height: 1px; z-index: 3; pointer-events: none; }
.gv-act-pumpfx i { position: absolute; top: 0; left: 0;
    width: calc(3px + 2px * var(--hot)); height: calc(3px + 2px * var(--hot));
    margin: -2px; border-radius: 999px;
    background: rgb(calc(214 + 41 * var(--hot)) calc(74 + 155 * var(--hot)) calc(22 + 190 * var(--hot)));
    box-shadow: 0 0 calc(5px + 7px * var(--hot)) rgba(255, calc(120 + 110 * var(--hot)), 60,
        calc(0.55 + 0.45 * var(--hot)));
    transform: rotate(var(--a));
    animation: gv-act-ember-fly calc(420ms + 220ms * var(--hot)) ease-out var(--t) forwards; }
@keyframes gv-act-ember-fly {
    0% { opacity: 0; transform: rotate(var(--a)) translateY(0) scale(0.5); }
    18% { opacity: 1; }
    100% { opacity: 0; transform: rotate(var(--a)) translateY(calc(var(--d) * -1)) scale(1.15); }
}
@media (prefers-reduced-motion: reduce) { .gv-act-pumpfx { display: none; } }

/* ── THE COUNT-IN ─────────────────────────────────────────────────────────────────────────────
   Over the coals, before the clock. Big, because its whole job is to be impossible to miss, and
   it scales DOWN as it fades so the eye reads it as a beat landing rather than a thing appearing. */
.gv-act-count { grid-area: 1 / 1; place-self: center; font-style: normal; z-index: 4;
    font-size: 4.2rem; font-weight: 900; color: #ffe9a8; margin-top: -40px;
    text-shadow: 0 4px 22px rgba(0,0,0,0.95), 0 0 36px rgba(255,180,60,0.6);
    animation: gv-act-countin 560ms cubic-bezier(.2,.9,.3,1) both; }
.gv-act-count.is-go { font-size: 2.6rem; letter-spacing: 0.16em; color: #ffd75e; }
@keyframes gv-act-countin {
    0%   { opacity: 0; transform: scale(1.9); }
    28%  { opacity: 1; transform: scale(1); }
    78%  { opacity: 1; transform: scale(0.98); }
    100% { opacity: 0; transform: scale(0.86); }
}

/* ── HOW THAT STAGE WENT ──────────────────────────────────────────────────────────────────────
   Luke: "every stage should let you know how you did with like colorful text and vibrations."
   Colour IS the grade here — gold is flawless, green is clean, amber is scrappy, red is a miss —
   so the word is legible at a glance without being read. The sub-line under it is the evidence:
   the pump count, or three marks for three blows. */
.gv-act-stageword { grid-area: 1 / 1; place-self: center; font-style: normal; z-index: 4;
    display: grid; justify-items: center; gap: 2px; margin-top: -52px; white-space: nowrap;
    font-size: 1.5rem; font-weight: 900; letter-spacing: 0.14em; text-transform: uppercase;
    text-shadow: 0 3px 14px rgba(0,0,0,0.95);
    animation: gv-act-stage 1700ms ease-out both; }
.gv-act-stageword i { font-style: normal; font-size: 0.78rem; font-weight: 700; letter-spacing: 0.22em;
    opacity: 0.82; }
.gv-act-stageword.is-perfect { color: #ffd75e; text-shadow: 0 3px 14px rgba(0,0,0,0.95), 0 0 30px rgba(255,200,70,0.75); }
.gv-act-stageword.is-hit { color: #9df08a; }
.gv-act-stageword.is-ok { color: #ffb347; }
.gv-act-stageword.is-miss { color: #ff6b6b; }
@keyframes gv-act-stage {
    0%   { opacity: 0; transform: translateY(14px) scale(0.9); }
    14%  { opacity: 1; transform: translateY(0) scale(1.06); }
    24%  { transform: translateY(0) scale(1); }
    76%  { opacity: 1; }
    100% { opacity: 0; transform: translateY(-16px); }
}

/* ── THE REVEAL ───────────────────────────────────────────────────────────────────────────────
   Luke: "it rolled pristine, but I have no idea what that means ... should be like a huge
   dopamine reveal of like what all of your efforts mounted up to."

   ⚠️ THE MULTIPLIER IS THE HERO, NOT THE NAME. "Pristine" is an adjective; x1.60 is the thing you
   wanted. So the number is the biggest text on the screen, the band name labels it, and the three
   beats that earned it sit underneath — because after a good roll the question is "what did I do
   right" and after a bad one it is "what do I fix", and those have the same answer. */
.gv-act-reveal { display: grid; justify-items: center; gap: 1px; margin-top: 2px;
    animation: gv-act-reveal-in 520ms cubic-bezier(.2,.9,.3,1) both; }
.gv-act-reveal-mult { font-size: 3rem; font-weight: 900; line-height: 1; color: var(--band, #ffd75e);
    letter-spacing: -0.02em;
    text-shadow: 0 3px 18px rgba(0,0,0,0.9), 0 0 34px color-mix(in srgb, var(--band, #ffd75e) 60%, transparent); }
.gv-act-reveal-band { font-size: 1.08rem; font-weight: 900; letter-spacing: 0.2em; text-transform: uppercase;
    color: var(--band, #ffd75e); }
.gv-act-reveal-sub { font-size: 0.78rem; color: #cdd2d8; opacity: 0.85; margin-bottom: 6px; }
.gv-act-reveal-run { display: flex; gap: 10px; margin-bottom: 9px; }
.gv-act-reveal-run i { font-style: normal; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.08em;
    color: #cdd2d8; opacity: 0.7; padding: 3px 9px; border-radius: 999px;
    background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); }
@keyframes gv-act-reveal-in {
    0%   { opacity: 0; transform: scale(0.82); }
    60%  { opacity: 1; transform: scale(1.04); }
    100% { opacity: 1; transform: scale(1); }
}

.gv-act-flash { grid-area: 1 / 1; display: grid; place-items: center; font-style: normal;
    white-space: nowrap; margin-top: -78px;
    font-size: 1.35rem; font-weight: 900; letter-spacing: 0.12em; text-transform: uppercase; z-index: 2;
    text-shadow: 0 2px 10px rgba(0,0,0,0.95); animation: gv-act-pop 460ms ease-out; }
.gv-act-flash.is-perfect { color: #ffd75e; }
.gv-act-flash.is-hit { color: #5ce0c0; }
.gv-act-flash.is-miss { color: #ff7a6a; }
@keyframes gv-act-pop {
    0% { transform: scale(0.6); opacity: 0; } 26% { transform: scale(1.18); opacity: 1; }
    100% { transform: scale(1.05); opacity: 0; }
}

.gv-act-say { margin: 0; text-align: center; font-size: 0.94rem; font-weight: 700;
    letter-spacing: 0.04em; color: #fff4e2;
    text-shadow: 0 1px 3px #000, 0 2px 10px rgba(0,0,0,0.95); }

/* THE HEAT */
.gv-act-bar { position: relative; height: 24px; border-radius: 7px; overflow: hidden;
    background: rgba(0,0,0,0.6); border: 1px solid rgba(0,0,0,0.65);
    box-shadow: inset 0 2px 6px rgba(0,0,0,0.7); }
.gv-act-fill { position: absolute; inset: 0 auto 0 0; transition: width 90ms linear;
    background: linear-gradient(90deg, #8a2f0d, #ff7a3c 45%, #ffd75e 80%, #fff3c4); }
.gv-act-bar em { position: absolute; inset: 0; display: grid; place-items: center; font-style: normal;
    font-size: 0.72rem; font-weight: 800; color: #fff6df; text-shadow: 0 1px 3px rgba(0,0,0,0.9);
    font-variant-numeric: tabular-nums; }
.gv-act-clock { display: block; height: 3px; border-radius: 2px; background: rgba(0,0,0,0.55); }
.gv-act-clock i { display: block; height: 100%; border-radius: 2px; background: #ffd75e;
    transition: width 90ms linear; }

/* THE ANVIL */
.gv-act-anvil { position: relative; height: 36px; border-radius: 8px; overflow: hidden;
    background: linear-gradient(180deg, rgba(44,48,41,0.9), rgba(16,18,13,0.95));
    border: 1px solid rgba(0,0,0,0.7); box-shadow: inset 0 2px 7px rgba(0,0,0,0.75); }
.gv-act-zone { position: absolute; top: 0; bottom: 0; left: 50%; transform: translateX(-50%);
    background: rgba(92,224,192,0.22); border-left: 1px solid rgba(92,224,192,0.55);
    border-right: 1px solid rgba(92,224,192,0.55); }
.gv-act-core { position: absolute; top: 0; bottom: 0; left: 50%; transform: translateX(-50%);
    background: rgba(255,215,94,0.5); box-shadow: 0 0 14px rgba(255,215,94,0.5); }
.gv-act-marker { position: absolute; top: -2px; bottom: -2px; width: 3px; margin-left: -1.5px;
    background: #fff6df; box-shadow: 0 0 12px rgba(255,246,223,0.95); }
/* ── ⚠️ THE HAND-OFF HAS TO BE VISIBLE, NOT JUST ENFORCED ─────────────────────────────────────
   A beat where the anvil refuses blows is only fair if the anvil looks like it is refusing them.
   Photographed side by side, the waiting frame and the live frame were the same bright gold button
   over the same bar, and the only difference was a word. Dim both while the piece is being set, and
   bring them up together when the window opens -- the brightening IS the go signal. */
.gv-act-hit.is-waiting { filter: saturate(0.45) brightness(0.72); cursor: default; }
.gv-act-anvil.is-waiting { opacity: 0.62; }
/* ⚠️ THE TRANSITION IS ON THE BASE RULE, NOT ON .is-waiting. A transition declared only on the
   dimmed state animates going IN and snaps coming OUT, so the moment that matters -- the window
   opening -- is the one that gets no animation at all. */
.gv-act-hit.is-hammer, .gv-act-anvil { transition: filter 180ms ease-out, opacity 180ms ease-out; }

.gv-act-hits { list-style: none; display: flex; gap: 6px; margin: 0; padding: 0; }
.gv-act-hits li { flex: 1; text-align: center; padding: 6px 0; border-radius: 6px; font-size: 0.62rem;
    letter-spacing: 0.07em; text-transform: uppercase; color: #8b8375; background: rgba(0,0,0,0.5); }
.gv-act-hits li.is-perfect { color: #2a1f05; background: #ffd75e; box-shadow: 0 0 12px rgba(255,215,94,0.5); }
.gv-act-hits li.is-hit { color: #05251e; background: #5ce0c0; }
.gv-act-hits li.is-miss { color: #ffe2dc; background: rgba(255,122,106,0.6); }

/* ── THE RACK ─────────────────────────────────────────────────────────────────────────────────────────
   Sits over the painted cooling rack, so the pegs and bins line up with a room rather than floating. */
.gv-act-rack { position: relative; padding: 9px 9px 22px; border-radius: 10px; touch-action: none;
    background: rgba(6,8,10,0.55); border: 1px solid rgba(0,0,0,0.6);
    box-shadow: inset 0 3px 14px rgba(0,0,0,0.55); }
/* ⚠️ 150px WAS THE WHOLE COMPLAINT. Luke: "the Plinko screen needs to be like way taller. It's like,
   it feels like it's been shoved in the bottom portion of the screen." It was: a fixed 150px board
   under two stacked headers, so the ball crossed the entire rack in well under a second and the stage
   that decides the item's QUALITY was the smallest thing on the page.
   Viewport-relative with a floor and a ceiling, so a short phone still gets a real board and a desktop
   does not get an absurd one. The peg rows space themselves out, so the only thing that changes is how
   far the ball falls -- which is the drama. */
.gv-act-pegs { position: relative; height: clamp(230px, 44vh, 380px); display: flex;
    flex-direction: column; justify-content: space-between; }
.gv-act-pegrow { display: flex; justify-content: space-around; }
.gv-act-pegrow i { width: 5px; height: 5px; border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, #efe0bb, #8a7a52 70%, #2a2318);
    box-shadow: 0 1px 1px rgba(0,0,0,0.6); transition: box-shadow 120ms, background 120ms; }
.gv-act-pegrow.is-struck i { background: radial-gradient(circle at 35% 30%, #fffbe8, #ffd75e 65%, #b47a12);
    box-shadow: 0 0 10px rgba(255,215,94,0.95), 0 0 20px rgba(255,215,94,0.45); }
.gv-act-piece { position: absolute; width: 32px; height: 32px; margin: -16px 0 0 -16px;
    display: grid; place-items: center; z-index: 2;
    transition: left 95ms linear, top 95ms linear; }
/* ── THE BALL ──────────────────────────────────────────────────────────────────────────────────
   --n is how far down the rack it is, 0 at the top and 1 in the bucket. Everything rides it: the hue
   travels about 210 degrees on the way down, the glow roughly doubles, and the ball grows a little.
   So the fall LOOKS like it is building to something rather than being a sprite sliding down a wall. */
.gv-act-orb { display: block; width: calc(20px + 6px * var(--n, 0)); height: calc(20px + 6px * var(--n, 0));
    border-radius: 50%;
    background:
        radial-gradient(circle at 34% 28%, rgba(255,255,255,0.95) 0 14%, rgba(255,255,255,0) 46%),
        radial-gradient(circle at 50% 55%,
            hsl(calc(42 + 210 * var(--n, 0)) 100% 64%),
            hsl(calc(14 + 210 * var(--n, 0)) 96% 46%) 72%);
    box-shadow:
        0 0 calc(10px + 14px * var(--n, 0)) hsl(calc(42 + 210 * var(--n, 0)) 100% 60% / 0.95),
        0 0 calc(22px + 30px * var(--n, 0)) hsl(calc(42 + 210 * var(--n, 0)) 100% 55% / 0.45),
        inset 0 -3px 6px rgba(0,0,0,0.35);
    animation: gv-act-orb-spin 620ms linear infinite; }
@keyframes gv-act-orb-spin { to { filter: hue-rotate(26deg); } }
@media (prefers-reduced-motion: reduce) { .gv-act-orb { animation: none; } }
.gv-act-piece.is-set { transition: none; animation: gv-act-land 440ms cubic-bezier(.2,1.6,.4,1); }
@keyframes gv-act-land { 0% { transform: scale(1.45); } 50% { transform: scale(0.78); } 100% { transform: scale(1); } }

.gv-act-burst { position: absolute; bottom: -6px; width: 0; height: 0; z-index: 3; pointer-events: none; }
.gv-act-burst i { position: absolute; width: 7px; height: 7px; margin: -3.5px; border-radius: 50%;
    background: var(--band, #ffd75e); box-shadow: 0 0 14px var(--band, #ffd75e), 0 0 26px var(--band, #ffd75e);
    animation: gv-act-spark 720ms ease-out forwards; transform: rotate(var(--a)) translateY(0);
    /* ⚠️ AFTER THE SHORTHAND, NEVER BEFORE IT. The animation shorthand resets every animation-*
       longhand it does not name, so a delay declared above it is silently wiped — the shards would all
       have left at the same instant and the stagger would have looked like it was never written. */
    animation-delay: var(--t, 0ms); }
@keyframes gv-act-spark {
    0% { opacity: 1; transform: rotate(var(--a)) translateY(0) scale(1.2); }
    100% { opacity: 0; transform: rotate(var(--a)) translateY(calc(var(--d) * -1)) scale(0.3); }
}
.gv-act-burst.is-masterwork i { animation-duration: 1100ms; width: 7px; height: 7px; }

.gv-act-buckets { display: flex; align-items: flex-end; height: 38px; margin-top: 6px;
    border-radius: 4px; overflow: hidden; }
.gv-act-bucket { position: relative; height: 100%; display: grid; place-items: center; min-width: 0;
    border-left: 1px solid rgba(0,0,0,0.8);
    box-shadow: inset 0 8px 12px rgba(0,0,0,0.45), inset 0 -3px 0 rgba(255,255,255,0.22);
    /* ⚠️ A SHALLOW GRADIENT. Lifting the top toward white and crushing the bottom took the epic violet of
       a Fine bin visibly pink on a phone. The band colour has to survive being painted. */
    background: linear-gradient(180deg,
        color-mix(in srgb, var(--band) 96%, #fff 4%),
        color-mix(in srgb, var(--band) 86%, #000 14%));
    transition: filter 180ms, transform 180ms; }
.gv-act-bucket b { font-size: 0.56rem; font-weight: 900; color: rgba(0,0,0,0.6);
    text-shadow: 0 1px 0 rgba(255,255,255,0.3); white-space: nowrap; overflow: hidden; }
.gv-act-bucket.is-masterwork { margin-top: -7px; height: calc(100% + 7px); border-radius: 3px 3px 0 0;
    border-left: 1px solid rgba(255,255,255,0.5); border-right: 1px solid rgba(255,255,255,0.5);
    box-shadow: inset 0 8px 12px rgba(0,0,0,0.25), inset 0 -3px 0 rgba(255,255,255,0.5),
        0 0 18px color-mix(in srgb, var(--band) 75%, transparent); }
/* ⚠️ A GLOW, NOT A HUE SHIFT. saturate() on top of brightness pushed a Fine bin into hot pink, so the
   second-best bucket lit up looking like the jackpot. */
.gv-act-bucket.is-hit { filter: brightness(1.3); transform: translateY(3px);
    box-shadow: inset 0 8px 12px rgba(0,0,0,0.2), inset 0 -3px 0 rgba(255,255,255,0.5),
        0 0 28px color-mix(in srgb, var(--band) 85%, transparent); }

/* The jackpot flag. Three percent of a bar cannot announce itself; the tab hangs UNDER the rack where the
   falling piece can never cover it. */
.gv-act-jack { position: absolute; top: 2px; bottom: 20px; width: 1px; margin-left: -0.5px;
    pointer-events: none; z-index: 1;
    background: repeating-linear-gradient(180deg, rgba(55,245,192,0.5) 0 5px, transparent 5px 11px); }
.gv-act-jack b { position: absolute; bottom: -17px; left: 50%; transform: translateX(-50%);
    padding: 2px 8px; border-radius: 999px; font-size: 0.58rem; font-weight: 900; letter-spacing: 0.06em;
    color: #032a20; white-space: nowrap; background: #37f5c0;
    box-shadow: 0 0 16px rgba(55,245,192,0.7); }
.gv-act-jack b::before { content: ""; position: absolute; top: -4px; left: 50%; margin-left: -4px;
    border: 4px solid transparent; border-bottom-color: #37f5c0; }
.gv-act-aim { position: absolute; top: 4px; bottom: 58px; width: 2px; margin-left: -1px; z-index: 4;
    background: linear-gradient(180deg, rgba(255,215,94,0.1), #ffd75e);
    box-shadow: 0 0 12px rgba(255,215,94,0.9); pointer-events: none; }
.gv-act-aim::after { content: ""; position: absolute; left: 50%; bottom: -8px; width: 17px; height: 17px;
    margin-left: -8.5px; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #fffbe8, #ffd75e);
    box-shadow: 0 0 14px rgba(255,215,94,0.95), 0 2px 5px rgba(0,0,0,0.6); }

.gv-act-odds { list-style: none; display: flex; gap: 4px; margin: 0; padding: 0; }
.gv-act-odds li { flex: 1; text-align: center; padding: 5px 2px; border-radius: 7px;
    background: rgba(8,10,6,0.82); border: 1px solid rgba(0,0,0,0.55);
    font-size: 0.5rem; letter-spacing: 0.04em; text-transform: uppercase; color: #9aa08f; }
.gv-act-odds b { display: block; font-size: 0.82rem; font-variant-numeric: tabular-nums; color: var(--band); }
.gv-act-odds li.is-masterwork { border-color: color-mix(in srgb, var(--band) 60%, transparent);
    box-shadow: 0 0 12px color-mix(in srgb, var(--band) 28%, transparent); }

/* THE ONE BUTTON */
.gv-act-hit { padding: 15px; border-radius: 11px; cursor: pointer; font: inherit; font-size: 1rem;
    font-weight: 900; letter-spacing: 0.14em; color: #2a1f05; border: 1px solid #c89a3a;
    background: linear-gradient(180deg, #ffe28a, #ffb020); touch-action: manipulation;
    -webkit-user-select: none; user-select: none; }
.gv-act-hit:active { transform: translateY(1px); filter: brightness(1.14); }
.gv-act-hit.is-bellows { background: linear-gradient(180deg, #ffb46a, #ff7a3c); border-color: #9a4a12; }
.gv-act-hit.is-release { background: linear-gradient(180deg, #8fd8ff, #4aa3ff); border-color: #2a6fb0;
    color: #04202f; }
.gv-act-work { text-align: center; font-size: 0.74rem; color: #9aa08f; }
.gv-act-hit.is-band {
    background: linear-gradient(180deg,
        color-mix(in srgb, var(--band) 97%, #fff 3%),
        color-mix(in srgb, var(--band) 88%, #000 12%));
    border-color: color-mix(in srgb, var(--band) 55%, #000 45%);
    color: var(--band-ink, #2a1f05); }
.gv-act-hit.is-band.is-masterwork { box-shadow: 0 0 32px color-mix(in srgb, var(--band) 70%, transparent); }


/* ── THE ATLAS: MAPS DOWN, ZONES ACROSS ───────────────────────────────────────────────────────────────
   Luke wanted the paper-scroll chart gone and this instead — a vertical stack of maps, each a horizontal
   scroll of its zones, the town leftmost. The carousel mechanics are the pack picker's (.pk-pick-track),
   because that one already solved end-cards-can-never-centre and there-is-no-selector-for-snapped. */
.ga-atlas { display: flex; flex-direction: column; gap: 18px; padding: 4px 0 10px; }

.ga-row { display: flex; flex-direction: column; gap: 7px; }
.ga-row.is-shut { opacity: 0.5; }
.ga-row-head { display: flex; align-items: baseline; justify-content: space-between; padding: 0 12px; }
.ga-row-head b { font-size: 0.96rem; letter-spacing: 0.01em; color: #f0e9d8; }
.ga-row-head i { font-style: normal; font-size: 0.76rem; color: #9b937f; font-variant-numeric: tabular-nums; }

/* ⚠️ THE PADDING IS LOAD-BEARING. Without it the first and last cards snap to the track's edge and can
   never become the centred one — the same bug the pack picker's note records. */
.ga-track {
    display: flex; gap: 10px; overflow-x: auto; overflow-y: hidden;
    scroll-snap-type: x mandatory; scrollbar-width: none; -webkit-overflow-scrolling: touch;
    padding: 2px 32%;
}
.ga-track::-webkit-scrollbar { display: none; }
.ga-cell { flex: 0 0 auto; scroll-snap-align: center; }

.ga-card {
    position: relative; flex: 0 0 auto; width: 188px; height: 118px; padding: 0; border: 0;
    border-radius: 13px; overflow: hidden; cursor: pointer; background: #14170f;
    box-shadow: 0 2px 10px rgba(0,0,0,0.5); scroll-snap-align: center;
    /* Off-centre cards sit back, so the one you are on is unmistakably the subject — a transition rather
       than a scroll-driven animation, because the snap already does the timing. */
    opacity: 0.52; transform: scale(0.92); transition: opacity .2s ease, transform .2s ease, box-shadow .2s ease;
}
.ga-cell.ga-on .ga-card, .ga-card.ga-town { opacity: 1; transform: scale(1); }
.ga-card img { width: 100%; height: 100%; object-fit: cover; display: block; }
.ga-card.is-locked { cursor: default; filter: grayscale(0.9) brightness(0.45); }
.ga-card.is-clear { box-shadow: 0 0 0 2px rgba(120,190,120,0.55), 0 2px 10px rgba(0,0,0,0.5); }
.ga-card.is-boss  { box-shadow: 0 0 0 2px rgba(226,120,60,0.75), 0 2px 10px rgba(0,0,0,0.5); }
.ga-card.is-next  { box-shadow: 0 0 0 2px #ffd75e, 0 0 18px rgba(255,215,94,0.35); }

/* The plate sits ON the picture rather than under it — a caption bar under every card turns the row into
   a spreadsheet, and the art is the thing worth looking at. */
.ga-card-plate {
    position: absolute; left: 0; right: 0; bottom: 0; display: flex; flex-direction: column; gap: 1px;
    padding: 16px 9px 7px; text-align: left;
    background: linear-gradient(180deg, rgba(10,12,8,0) 0%, rgba(10,12,8,0.82) 55%, rgba(10,12,8,0.94) 100%);
}
.ga-card-plate em { font-style: normal; font-weight: 700; font-size: 0.83rem; color: #f3eee0; line-height: 1.15; }
.ga-card-plate u { text-decoration: none; font-size: 0.7rem; color: #b9b19a; font-variant-numeric: tabular-nums; }
.ga-card.is-next .ga-card-plate u { color: #ffd75e; }

.ga-card-pin {
    position: absolute; top: 7px; right: 7px; padding: 2px 7px; border-radius: 999px;
    background: #ffd75e; color: #241c05; font-size: 0.64rem; font-weight: 800; letter-spacing: 0.04em;
}
/* The town card reads as a place you return to rather than a place you fight in. */
.ga-card.ga-town { width: 132px; }
.ga-card.ga-town .ga-card-plate em { color: #ffd98a; }

@media (max-width: 560px) {
    .ga-track { padding: 2px 24%; }
    .ga-card { width: 164px; height: 104px; }
    .ga-card.ga-town { width: 118px; }
}

/* ── THE GEAR PANEL ──────────────────────────────────────────────────────────────────────────────────────────
   Luke: "the grove is not doing a good job showing you your gear."

   Built out of the same parts as the backpack — a board, a grid of cells, art in every cell — because they
   answer the same shape of question and a second visual language for "things you own" would be one language
   too many. What differs is that a gear cell carries a SLOT, so it is labelled and it is never absent: an
   empty ring slot is drawn, because a player who cannot see the slot cannot go looking for the ring. */
.gv-gear { display: grid; gap: 10px; }

.gv-gslots { display: grid; grid-template-columns: repeat(auto-fill, minmax(92px, 1fr)); gap: 7px; }

.gv-gslot {
    position: relative; display: flex; flex-direction: column; align-items: center; gap: 3px;
    padding: 8px 5px 7px; border-radius: 11px; font: inherit; color: #efe7d8; cursor: pointer;
    background: linear-gradient(180deg, rgba(0,0,0,0.42), rgba(0,0,0,0.3));
    border: 1px solid rgba(0,0,0,0.55);
    box-shadow: inset 0 2px 6px rgba(0,0,0,0.6), inset 0 -1px 0 rgba(255,255,255,0.05);
    transition: transform 120ms ease, border-color 120ms ease;
}
.gv-gslot:active { transform: scale(0.95); }
.gv-gslot:hover { border-color: color-mix(in srgb, var(--area, #e0a83c) 55%, rgba(0,0,0,0.55)); }
/* A filled slot is edged in its item's rarity — the same colour vocabulary the vault and the reveal use, so
   the colour a player learns in one place means the same thing here. */
.gv-gslot.is-on { border-color: color-mix(in srgb, var(--rar, #9aa3b2) 62%, rgba(0,0,0,0.55)); }
.gv-gslot.is-open { border-color: #ffd75e; }

.gv-gslot-face {
    position: relative; display: flex; align-items: center; justify-content: center;
    width: 52px; height: 52px;
}
.gv-gslot-face .gv-gart { width: 46px; height: 46px; display: flex; align-items: center; justify-content: center; }
/* ⚠️ contain, NOT cover. A die-cut sprite is not a photograph and cropping one takes the tip off a sword —
   see [[sprite-floats-object-fit-contain]]. */
.gv-gslot-face .gv-gart img { width: 100%; height: 100%; object-fit: contain; }
.gv-gslot-face .gv-gart svg { width: 34px; height: 34px; opacity: 0.75; }

/* An empty slot is a hole in the board, drawn as one: a recessed dashed well rather than nothing at all. */
.gv-gslot-none {
    width: 44px; height: 44px; border-radius: 9px;
    border: 1px dashed rgba(255,255,255,0.16);
    background: rgba(0,0,0,0.3);
}
.gv-gslot-n {
    position: absolute; right: 1px; bottom: 1px; min-width: 17px; padding: 0 4px;
    border-radius: 999px; background: #ffd75e; color: #241c05;
    font-size: 0.64rem; font-weight: 800; font-style: normal; line-height: 17px; text-align: center;
}
.gv-gslot-label {
    font-size: 0.6rem; letter-spacing: 0.07em; text-transform: uppercase; color: #a79e88;
}
.gv-gslot-name {
    font-size: 0.68rem; line-height: 1.15; text-align: center; color: #efe7d8;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.gv-gslot:not(.is-on) .gv-gslot-name { color: #6f6a5c; }

/* ── THE DRAWER ───────────────────────────────────────────────────────────────────────────────────────────
   Opens UNDER the grid rather than over it, so the piece being replaced stays on screen while you choose.
   A sheet that covers the thing you are comparing against is a sheet that makes you remember it. */
.gv-gpick {
    display: grid; gap: 5px; margin-top: 9px; padding: 9px;
    border-radius: 11px; background: rgba(0,0,0,0.34); border: 1px solid rgba(0,0,0,0.5);
}
.gv-gpick h5 {
    margin: 0 0 2px; font-size: 0.66rem; letter-spacing: 0.08em; text-transform: uppercase; color: #a79e88;
}
.gv-gpick-row {
    display: flex; align-items: center; gap: 9px; width: 100%; padding: 7px 9px;
    border-radius: 9px; font: inherit; color: #efe7d8; cursor: pointer; text-align: left;
    background: linear-gradient(180deg, rgba(255,255,255,0.05), rgba(0,0,0,0.2));
    border: 1px solid rgba(0,0,0,0.5);
    border-left: 3px solid var(--rar, #9aa3b2);
}
.gv-gpick-row:hover { border-color: #ffd75e; border-left-color: var(--rar, #9aa3b2); }
.gv-gpick-row:active { transform: scale(0.99); }
.gv-gpick-row.is-worn { border-left-color: #ffd75e; background: rgba(255,215,94,0.08); }
.gv-gpick-row .gv-gart-sm { width: 34px; height: 34px; flex: 0 0 34px; display: flex; align-items: center; justify-content: center; }
.gv-gpick-row .gv-gart-sm img { width: 100%; height: 100%; object-fit: contain; }
.gv-gpick-row .gv-gart-sm svg { width: 26px; height: 26px; opacity: 0.75; }
.gv-gpick-text { display: grid; gap: 1px; min-width: 0; flex: 1; }
.gv-gpick-text b { font-size: 0.8rem; font-weight: 700; }
/* ⚠️ TWO LINES, NOT ONE. A single nowrap line cut every item at "42 Damage · 1.12/s Attack Speed · +3…" —
   and the clipped tail is where the affixes live, which is the half that decides between two weapons. Two
   lines fit the whole stat string for almost every item at 390px and still bound the row height. */
.gv-gpick-text i {
    font-style: normal; font-size: 0.68rem; color: #a79e88; line-height: 1.25;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.gv-gpick-go, .gv-gpick-off {
    flex: 0 0 auto; padding: 4px 9px; border-radius: 999px;
    font-size: 0.68rem; font-weight: 800; white-space: nowrap;
}
.gv-gpick-go { background: #ffd75e; color: #241c05; }
.gv-gpick-off { background: rgba(255,255,255,0.09); color: #cfc7b4; }

.gv-gear-wait { margin: 4px 2px; font-size: 0.76rem; color: #a79e88; line-height: 1.45; }
.gv-gear-err { margin: 6px 2px 0; font-size: 0.76rem; color: #ff9f8a; }

/* ── WHAT IT ADDS UP TO ───────────────────────────────────────────────────────────────────────────────────
   The figures the SCENE is handed, so "I put the sword on and my damage went up" is something a player can
   watch happen rather than infer. Tabular numerals so the column does not jitter when a value changes. */
.gv-gstats { display: grid; grid-template-columns: repeat(auto-fill, minmax(88px, 1fr)); gap: 6px; }
.gv-gstat {
    display: grid; gap: 1px; padding: 7px 9px; border-radius: 9px;
    background: rgba(0,0,0,0.3); border: 1px solid rgba(0,0,0,0.5);
}
.gv-gstat span { font-size: 0.6rem; letter-spacing: 0.07em; text-transform: uppercase; color: #a79e88; }
.gv-gstat b { font-size: 0.98rem; font-weight: 800; color: #ffd75e; font-variant-numeric: tabular-nums; }

@media (max-width: 560px) {
    /* 375px with browser chrome is the tightest real screen this has to work on. Three slots across keeps
       the item name readable on two lines instead of clipping every one of them. */
    .gv-gslots { grid-template-columns: repeat(3, 1fr); }
    .gv-gstats { grid-template-columns: repeat(3, 1fr); }
}

/* The totals, on the gear board rather than a board of their own — see the note in GroveGear. */
.gv-gtot { margin-top: 10px; padding-top: 9px; border-top: 1px solid rgba(255,255,255,0.08); }
.gv-gtot h5 {
    margin: 0 0 6px; font-size: 0.66rem; letter-spacing: 0.08em; text-transform: uppercase; color: #a79e88;
}

/* ── THE QUEST HELPER ────────────────────────────────────────────────────────────────────────────
   Built around the zone number, because that is the one thing the panel exists to tell you: three
   givers are hidden across twelve zones on purpose, and without this the instruction "come back to
   them" means walking the map hoping. */
.gq { display: flex; flex-direction: column; gap: 12px; padding: 4px 2px 10px; }
.gq-note { margin: 0; font-size: 0.78rem; color: #cbbf9d; }
.gq-empty { margin: 10px 2px; font-size: 0.82rem; color: #9b937f; line-height: 1.45; }
.gq-map h4 {
    margin: 0 0 6px; font-size: 0.66rem; letter-spacing: 0.08em; text-transform: uppercase; color: #a79e88;
}
.gq-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }

.gq-row, .gq-col {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 10px; border-radius: 10px;
    background: rgba(20, 26, 18, 0.72); border: 1px solid rgba(120, 140, 96, 0.22);
}
.gq-col { border-color: rgba(220, 180, 90, 0.3); }
/* A finished chain stays on the list and says so — see the note in GroveQuests about not hiding it. */
.gq-row.is-done { opacity: 0.6; }
.gq-row.is-ready { border-color: rgba(240, 180, 76, 0.55); background: rgba(44, 38, 18, 0.8); }

.gq-face {
    width: 42px; height: 58px; object-fit: contain; flex: 0 0 auto;
    filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.45));
}
.gq-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1 1 auto; }
.gq-who { font-size: 0.86rem; color: #f0e7cf; }
.gq-where { font-size: 0.68rem; color: #a79e88; }
.gq-task { font-size: 0.8rem; color: #e4d9ba; }
.gq-ask { font-size: 0.7rem; color: #9b937f; text-transform: capitalize; }
.gq-fin { font-size: 0.74rem; color: #8d866f; font-style: italic; }
.gq-num { font-size: 0.66rem; color: #a79e88; font-variant-numeric: tabular-nums; }

.gq-bar {
    display: block; height: 5px; border-radius: 3px; margin-top: 3px;
    background: rgba(255, 255, 255, 0.09); overflow: hidden;
}
.gq-bar i { display: block; height: 100%; background: linear-gradient(90deg, #7fae55, #cfe08a); }

.gq-claim {
    flex: 0 0 auto; border: 0; border-radius: 8px; cursor: pointer;
    padding: 7px 12px; font-size: 0.78rem; font-weight: 700;
    background: linear-gradient(180deg, #ffe3a8, #f0b44c); color: #3a2906;
}
.gq-claim:disabled { opacity: 0.5; cursor: default; }
.gq-pip {
    flex: 0 0 auto; font-size: 0.64rem; letter-spacing: 0.06em; text-transform: uppercase;
    color: #3a2906; background: #f0b44c; border-radius: 6px; padding: 3px 7px;
}

/* ── A QUEST-GIVER STANDING IN A ZONE ────────────────────────────────────────────────────────────
   Positioned against the floor the same way the doors are, and deliberately NOT inside the creature
   layer — see the note in GroveScene about why an NPC must never be a .gv-foe. */
.gv-npc {
    position: absolute; left: 62%; bottom: 10%;
    width: 72px; height: 104px; padding: 0; border: 0; background: none;
    cursor: pointer; z-index: 240;
}
.gv-npc img {
    width: 100%; height: 100%; object-fit: contain; object-position: bottom;
    filter: drop-shadow(0 3px 3px rgba(0, 0, 0, 0.5));
}
/* Finished chains stay standing — a giver who vanishes reads as a bug — but stop asking for attention. */
.gv-npc.is-done img { filter: drop-shadow(0 3px 3px rgba(0, 0, 0, 0.5)) saturate(0.65) brightness(0.8); }

.gv-npc-pip {
    position: absolute; top: -4px; left: 50%; transform: translateX(-50%);
    min-width: 20px; padding: 2px 6px; border-radius: 9px;
    font-size: 0.62rem; font-weight: 700; font-variant-numeric: tabular-nums;
    background: rgba(18, 22, 16, 0.92); color: #cbbf9d; border: 1px solid rgba(140, 160, 110, 0.4);
}
.gv-npc.is-ready .gv-npc-pip {
    background: linear-gradient(180deg, #ffe3a8, #f0b44c); color: #3a2906; border-color: #f0b44c;
    animation: gvNpcNudge 1.8s ease-in-out infinite;
}
@keyframes gvNpcNudge {
    0%, 100% { transform: translateX(-50%) translateY(0); }
    50% { transform: translateX(-50%) translateY(-3px); }
}

/* ── A CHEST SITTING ON THE ARENA FLOOR ──────────────────────────────────────────────────────────
   Spread along the bottom rather than stacked, because four boxes in one spot is one box as far as a
   thumb is concerned. --gv-chest-i is the index, so they lay out without needing world positions. */
.gv-chest {
    position: absolute; bottom: 7%;
    left: calc(26% + (var(--gv-chest-i, 0) * 16%));
    width: 58px; height: 52px; padding: 0; border: 0; background: none;
    cursor: pointer; z-index: 250;
    animation: gvChestLand 420ms cubic-bezier(0.2, 1.3, 0.4, 1) both;
}
.gv-chest img {
    width: 100%; height: 100%; object-fit: contain;
    filter: drop-shadow(0 3px 4px rgba(0, 0, 0, 0.55));
    animation: gvChestBob 2.4s ease-in-out infinite;
}
/* The tap has to read before the round trip answers, or it reads as the tap not working. */
.gv-chest.is-opening { pointer-events: none; }
.gv-chest.is-opening img { animation: gvChestPop 320ms ease-out both; }

@keyframes gvChestLand {
    from { transform: translateY(-34px) scale(0.8); opacity: 0; }
    to { transform: translateY(0) scale(1); opacity: 1; }
}
@keyframes gvChestBob {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-4px); }
}
@keyframes gvChestPop {
    0% { transform: scale(1); }
    45% { transform: scale(1.25) rotate(-4deg); }
    100% { transform: scale(0.6) translateY(-10px); opacity: 0; }
}

/* The marshal's two actions sit together: "no key" is a state the daily button answers. */
.gq-colacts { display: flex; flex-direction: column; gap: 5px; flex: 0 0 auto; }
.gq-colacts .gq-claim { padding: 6px 10px; font-size: 0.72rem; }

/* ── ⚠️ A NEUTRAL GREY SLAB READS AS GREEN AGAINST LAVA ──────────────────────────────────────────
   slab-char is correct art — black rock, lava veins, a grey ash top — and it MEASURES neutral: the
   rendered ledge samples rgb(108,111,109), a green bias of +3 out of 255. It still looked green to
   two people independently, because simultaneous contrast pushes a neutral toward the complement of
   whatever surrounds it, and the Ashen Reach surrounds it with saturated red.
   So this is not a colour bug, it is a colour ILLUSION, and the fix is the same either way: carry a
   little of the room's own heat in the stone so there is no neutral left to shift. */
.gv-scene[data-biome="char"] .gv-slab {
    filter: sepia(0.55) saturate(1.45) hue-rotate(-14deg) brightness(1.02);
}


/* -- THE TROPHY REVEAL ----------------------------------------------------------------------------
   One kill in four hundred earns this, and before it existed the whole event was a dark blob arcing
   over green foliage and a thin grey label that looked exactly like picking up a twig.

   ⚠️ IT IS NOT A CARD AND MUST NOT BE SHAPED LIKE ONE. The amulets hang on leather cords; the frame
   here is the cord and the hook it swings from. Luke's worry was players filing these under the card game, and
   a rounded rectangle with a portrait window in it would have confirmed the misread rather than fixing
   it. See the note at the markup.

   Pointer-transparent throughout: the fight is still running underneath, and this must never eat a tap
   meant for the creature behind it. */
.gv-mc { position: absolute; inset: 0; display: grid; place-items: center; align-content: center;
    gap: 14px; pointer-events: none; z-index: 46;
    animation: gvMcIn 2100ms cubic-bezier(0.16, 1, 0.3, 1) forwards; }
/* ── ⚠️ THE WORLD HAS TO DROP BACK, OR NONE OF THIS IS VISIBLE ──────────────────────────────────────
   Filmed without this, the moment was gold light and a two-line strapline over a SUNLIT GREEN FOREST:
   the ray fan disappeared completely, both small lines of type were gone, and the only thing that
   survived the background was the name in bold white. The reveal was running perfectly and reading as
   nothing.

   A radial scrim rather than a flat one -- darkest at the edges, thinner at the centre -- so the card
   sits in the one bright part of the frame and the fight stays legible underneath it. This is a REVEAL
   scrim, not scene lighting: no-overlay-for-lighting is about painting depth into a world, which is
   still a thing to fix in the art rather than with a sheet. */
.gv-mc::before { content: ""; position: absolute; inset: 0; pointer-events: none;
    background: radial-gradient(ellipse 72% 48% at 50% 44%, rgba(12,10,6,0.44), rgba(8,7,4,0.84) 78%);
    animation: gvMcScrim 2100ms ease-out forwards; }
@keyframes gvMcScrim { 0% { opacity: 0; } 8% { opacity: 1; } 80% { opacity: 1; } 100% { opacity: 0; } }
/* The light behind the card. Scaled from nothing in ~250ms so the frame the card lands on is the
   brightest -- the flash IS the event and everything after it is the player reading what they got. */
.gv-mc-rays { position: absolute; width: 104%; aspect-ratio: 1; border-radius: 50%;
    background:
        conic-gradient(from 0deg, rgba(255,226,150,0.85) 0deg 7deg, transparent 7deg 26deg,
            rgba(255,210,120,0.55) 26deg 31deg, transparent 31deg 54deg,
            rgba(255,232,165,0.92) 54deg 62deg, transparent 62deg 88deg,
            rgba(255,204,110,0.5) 88deg 93deg, transparent 93deg 120deg,
            rgba(255,226,150,0.85) 120deg 128deg, transparent 128deg 150deg,
            rgba(255,210,120,0.55) 150deg 155deg, transparent 155deg 180deg,
            rgba(255,232,165,0.92) 180deg 188deg, transparent 188deg 212deg,
            rgba(255,204,110,0.5) 212deg 217deg, transparent 217deg 244deg,
            rgba(255,226,150,0.85) 244deg 252deg, transparent 252deg 274deg,
            rgba(255,210,120,0.55) 274deg 279deg, transparent 279deg 306deg,
            rgba(255,232,165,0.92) 306deg 314deg, transparent 314deg 338deg,
            rgba(255,204,110,0.5) 338deg 343deg, transparent 343deg 360deg);
    /* ⚠️ MASKED TO A RING, or the shafts converge to a solid disc at the centre and the card -- the one
       thing the moment exists to show -- sits on a bright plate and loses all its contrast. */
    -webkit-mask: radial-gradient(circle, transparent 34%, #000 50%, rgba(0,0,0,0.5) 72%, transparent 86%);
    mask: radial-gradient(circle, transparent 34%, #000 50%, rgba(0,0,0,0.5) 72%, transparent 86%);
    /* The blur is what turns them into LIGHT. Unblurred, a conic gradient's segments are hard-edged cream
       rectangles -- filmed, the fan read as confetti laid over the forest rather than as a glow. */
    filter: blur(9px);
    animation: gvMcRays 2100ms ease-out forwards; }

/* ── THE CARD ────────────────────────────────────────────────────────────────────────────────────
   A real card: portrait aspect, a carved wooden border, the creature in a window, its name and what
   it grants. The border is drawn here rather than generated, so all 21 cards cost nothing in art and a
   22nd creature is a card the day its sprite lands. */
.gv-mc-card { position: relative; width: min(54vw, 208px); aspect-ratio: 5 / 7;
    display: grid; grid-template-rows: 1fr auto auto; gap: 4px;
    padding: 9px 9px 10px; border-radius: 13px;
    /* Carved wood, lit from the top-left like every other object in the house style. The double border
       is the card's edge and its bevel -- one ring of pale grain inside one ring of shadow, which is what
       makes a flat rectangle read as a cut object rather than as a div. */
    background: linear-gradient(168deg, #6b5330 0%, #48381f 54%, #382b17 100%);
    border: 2px solid #8a6f42;
    box-shadow: inset 0 0 0 1px rgba(255,222,160,0.22),
        0 0 26px rgba(255,186,80,0.5), 0 10px 22px rgba(0,0,0,0.75);
    transform-origin: 50% 50%;
    animation: gvMcDeal 2100ms cubic-bezier(0.16, 1, 0.3, 1) forwards; }
.gv-mc-art { position: relative; border-radius: 8px; overflow: hidden;
    background: radial-gradient(ellipse 78% 68% at 50% 62%, #2c4a2a, #16241a 72%);
    display: grid; place-items: center; }
.gv-mc-art > img { width: 92%; height: 92%; object-fit: contain;
    filter: drop-shadow(0 4px 8px rgba(0,0,0,0.7)); }
/* The carved mark, demoted to what an emblem always was: the seal that stands for the creature. Sat in
   the corner of the window rather than thrown away -- nineteen of these are drawn and on disk. */
/* ⚠️ SELECT IT AS .gv-mc-art > img.gv-mc-seal, NOT AS A BARE .gv-mc-seal. The window's own rule
   is one class and one element, which outranks a bare class, so the seal was being sized by the rule
   meant for the creature and rendered at 92% of the card. Filmed, the amulet covered the rat completely
   and the Monster Card showed everything except the monster. Name the parent to win the cascade. */
.gv-mc-art > img.gv-mc-seal { position: absolute; right: 3%; bottom: 3%; width: 26%; height: 26%;
    object-fit: contain; opacity: 0.95;
    filter: drop-shadow(0 1px 3px rgba(0,0,0,0.9)); }
.gv-mc-card > b { font-size: 0.92rem; line-height: 1.15; text-align: center; color: #fff4dc;
    text-wrap: balance; text-shadow: 0 1px 3px rgba(0,0,0,0.9); }
.gv-mc-card > u { text-decoration: none; font-size: 0.72rem; font-weight: 700; text-align: center;
    color: #c8f0ac; text-shadow: 0 1px 3px rgba(0,0,0,0.9); }
/* ⚠️ THE ONE WORD THAT STOPS THIS BEING FILED UNDER SPIRE. Luke's worry, said out loud at the one
   moment the player is definitely looking. */
.gv-mc-tag { font-size: 0.64rem; letter-spacing: 0.3em; text-transform: uppercase; color: #ffd98f;
    text-shadow: 0 1px 4px rgba(0,0,0,1), 0 0 12px rgba(0,0,0,0.9);
    animation: gvMcSay 2100ms ease-out forwards; }
@keyframes gvMcIn { 0% { opacity: 0; } 6% { opacity: 1; } 86% { opacity: 1; } 100% { opacity: 0; } }
@keyframes gvMcRays {
    0% { opacity: 0; transform: scale(0.2) rotate(-26deg); }
    12% { opacity: 1; transform: scale(1.1) rotate(0deg); }
    26% { opacity: 0.85; transform: scale(1) rotate(6deg); }
    100% { opacity: 0.5; transform: scale(1.04) rotate(30deg); } }
/* Dealt: spun in edge-on and overshot. The overshoot is the whole reason it reads as thrown to you
   rather than faded in -- the drop's own arc does the same thing in the world layer. */
@keyframes gvMcDeal {
    0% { opacity: 0; transform: translateY(22%) scale(0.3) rotate(-18deg); }
    14% { opacity: 1; transform: translateY(0) scale(1.14) rotate(5deg); }
    28% { transform: scale(1) rotate(-2.5deg); }
    48% { transform: scale(1) rotate(1.2deg); }
    100% { opacity: 1; transform: scale(1) rotate(0deg); } }
@keyframes gvMcSay {
    0%, 14% { opacity: 0; transform: translateY(6px); }
    30% { opacity: 1; transform: translateY(0); }
    100% { opacity: 1; transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) {
    /* ⚠️ THE MOMENT STILL HAPPENS. Reduced motion means no spin and no turning light, not a rare drop
       the player is never told about -- see animations-always-play for the same rule. */
    .gv-mc-card, .gv-mc-rays, .gv-mc-tag { animation-duration: 1ms; animation-fill-mode: forwards; }
    .gv-mc-rays { transform: scale(1); opacity: 0.7; }
    .gv-drop.is-emblem::before { animation: none; opacity: 0.85; } }
.gv-mc-what { margin: 0 0 12px; padding: 10px 12px; border-radius: 10px;
    background: rgba(255,196,96,0.07); border: 1px solid rgba(255,196,96,0.22);
    font-size: 0.82rem; line-height: 1.5; color: #d8cdb8; }
.gv-mc-what b { color: #ffd98f; }


/* ── THE COLLECTION SHELF ─────────────────────────────────────────────────────────────────────────
   A row per map, scrolling sideways, bosses in with that map's wanderers. The rig is GroveAtlas's --
   .ga-row / .ga-track / .ga-cell, reused rather than rebuilt, so the two screens scroll identically and
   a fix to the track's padding lands on both.

   ⚠️ THE GRID THAT WAS HERE IS GONE, not left orbiting. It was .gv-cgrid plus .gv-cshelf headings for
   eight stacked sections; nothing renders either any more. See stale-css-rule-on-reshape -- a replaced
   component whose CSS stays behind is a rule that will one day match something new by accident.

   Luke: "the vertical skew would be different maps, and the horizontal skew would be different enemies.
   And the bosses would just be lumped in with enemies for that map." */
.gv-cards { display: flex; flex-direction: column; gap: 16px; padding: 2px 0 8px; }
/* ⚠️ THE TRACK IS THE ATLAS'S, but its cards are 188px wide and these are 124 -- so the 32% side padding
   that lets the atlas centre its first and last card leaves far too much dead rail here. Narrower cards
   need less runway, and 38% of a phone is most of the screen. */
.gv-cards .ga-track { padding: 2px 34%; gap: 9px; }
/* ⚠️ THE NEIGHBOURS STAY LEGIBLE. The atlas dims its off-centre cards to 0.52 because they are zone
   photographs and the point is which one you are entering. These are a COLLECTION -- the whole reason to
   scroll a row is to see what is on it -- so a neighbour dimmed to near-nothing makes browsing 25 cards
   a card-at-a-time crawl. Lifted enough that the centred one is still unmistakably the subject. */
/* ── ⚠️ EVERY CARD THE SAME HEIGHT, FOUND OR NOT ──────────────────────────────────────────────
   Luke: "the height of the cards should match regardless of if you found them or not. It looks a
   little odd that one's janked down and the next one janks back up again."

   A found card carries a Wear button and a count line that an unfound one does not, so each card was
   as tall as its own contents and the row's baseline stepped up and down as you scrolled past it. On
   a shelf where most cards are silhouettes, that is a ragged edge running the whole way along.

   The track is already a flex row, so its items stretch to the tallest by default -- the cells just
   were not passing that down. A cell becomes a flex box, the card fills it, and the card's own grid
   packs to the top so the spare space falls at the BOTTOM of a short card rather than being shared
   out between its rows, which would have pushed the name away from the picture. */
.gv-cards .ga-cell { display: flex; }
.gv-cards .ga-cell > .gv-card { height: 100%; align-content: start; }
.gv-cards .ga-cell { transition: transform .2s ease, opacity .2s ease; opacity: 0.8; transform: scale(0.95); }
.gv-cards .ga-cell.ga-on { opacity: 1; transform: scale(1); }
/* ── ⚠️ A FRAMED, NEAR-BLACK ROW ──────────────────────────────────────────────────────────────
   Luke: "I don't like the transparency. I think what I want is like high detail, thorny, like
   bordered area for like the forest area... But then like a just a black or whatever near black
   color we typically use for the contrast on the cards, like on the background, so that the cards
   contrast with it."

   The backdrop-behind-the-cards idea is dead and this is why it deserved to be: a painted scrim is
   a compromise in both directions at once. Light enough to read as a theme, it steals contrast from
   the cards; dark enough to leave the cards alone, it is a brown smear. There is no setting where it
   is doing both jobs, which is what the two passes at 0.80/0.92 and 0.70/0.88 were really measuring.

   So the theme moves to the EDGE and the middle goes near-black -- #15151a, the same colour the site
   drawer uses, for the same reason: cards on it are the brightest thing in their row.

   ⚠️ border-image, NOT A BACKGROUND PICTURE, AND THAT IS THE WHOLE TRICK. Luke: "The border idea
   probably won't work out unless you get the aspect ratio right." He is right that a single painted
   frame cannot work -- a row is about 374x215 on a phone and changes height with its content, so any
   fixed-aspect frame art is stretched the moment it is used. border-image slices one square drawing
   into nine, pins the four corners, and REPEATS the four edges to whatever length they need. The
   aspect ratio stops being a thing that can be got wrong.

   A map with no frame drawn yet simply has no border-image and falls back to the plain near-black
   row, which is also exactly the state to revert to if this idea does not earn its keep. */
.gv-cards .ga-row.is-themed { position: relative; border-radius: 12px; padding: 10px 0 12px;
    background: #15151a; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.05); }
/* ⚠️ THE FRAME IS A SEPARATE LAYER, NOT A BORDER ON THE ROW. border-image replaces the border box,
   so putting it on .ga-row would fight the border-radius and the inset hairline, and the frame's own
   transparent middle would let the row's corners show through square. An overlay owns the frame and
   nothing else; it is pointer-transparent so it can never eat a swipe on the track beneath it. */
.gv-cards .ga-row.is-framed > .gv-row-frame {
    position: absolute; inset: 0; pointer-events: none; z-index: 2;
    border: 30px solid transparent;
    border-image: var(--row-frame) 128 round; }
/* ── ⚠️ THE ROW HAS TO MAKE REAL ROOM FOR ITS OWN FRAME ──────────────────────────────────────
   The overlay sits on TOP of the content, so anything that reaches the row's edge goes under the
   brambles. The first pass padded 26px top and bottom and NOTHING at the sides, on the reasoning that
   the track's own 34% runway already holds cards away from the edge. That was wrong: the runway is
   padding INSIDE a scroller, so it scrolls away with everything else -- the cards slide straight under
   the left and right bands as soon as you move the row.

   Luke: "can you first make some padding inside the border? Right now it's overlapping stuff."

   So the padding is on the ROW, which does not scroll, and it is on all four sides. 34 against a 30px
   border leaves a few pixels of daylight between the art and the content rather than having them just
   touch -- a card resting exactly on the inner edge of a frame reads as clipped even when it is not. */
/* ⚠️ 38 AT THE SIDES AGAINST A 30px BAND, not 30. Matching the padding to the border exactly puts the
   track's box flush with the inner edge of the art, so a scrolling card grazes the brambles -- which is
   what "it's overlapping stuff" still looked like after the first fix. The extra 8px is the daylight. */
.gv-cards .ga-row.is-framed { padding: 34px 38px 34px; }
/* The header is already inside the row's padding; this is only the small inset that lines it up with
   the cards below it. */
.gv-cards .ga-row.is-framed > .ga-row-head { padding: 0 4px 6px; }
/* ⚠️ AND THE TRACK'S RUNWAY SHRINKS WITH THE BOX. 34% of a 374px row is 127px; 34% of the 298px left
   inside the frame is 101 -- still more than half a 124px card, which is all that centring the first
   and last card actually needs. */
.gv-cards .ga-row.is-framed .ga-track { padding: 2px 32%; }
/* ── ⚠️ THE TRACK FADES AT ITS EDGES INSTEAD OF SLICING ───────────────────────────────────────
   Luke: "it looks like it needs like a transporter border, transparent border inset or something, so
   that it fades from like the padding to the things inside of it. But like, also the card shouldn't be
   underlapping the overflow. Like it's underflowing. That doesn't look good."

   Those are one fault, not two. A scroller always has a part-card at each end -- that is how you know
   there is more -- but an overflow box cuts it with a hard vertical line, and a straight edge through
   the middle of a painted card does not read as "there is more", it reads as broken. Against a drawn
   frame it reads worse still, because the eye expects the art to be what ended the card and instead
   finds a clean machine cut a few pixels inside it.

   A mask makes the same part-card fade out into the padding. Nothing about the scrolling changes; only
   the thing that terminates it does.

   ⚠️ A MASK, NOT AN OVERLAID GRADIENT. The row behind this is #15151a but the FRAME sits on top at the
   same edges, so a painted fade would have to match the row's colour and would then show as a dark
   smear over the brambles. A mask removes the card instead of painting over it, so the frame stays
   untouched whatever is behind it.

   36px is a little more than a quarter of a 124px card: enough that the cut is unmistakably a fade,
   not so much that a card centred at the edge of the runway goes ghostly. */
.gv-cards .ga-track {
    -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 36px,
        #000 calc(100% - 36px), transparent 100%);
    mask-image: linear-gradient(90deg, transparent 0, #000 36px,
        #000 calc(100% - 36px), transparent 100%); }
.gv-cards .ga-row-head { padding: 0 12px 2px; }
/* ⚠️ THE HEADING WEARS ITS MAP'S OWN COLOUR, and it is the only thing on the row that does -- the cards
   below carry the RUNG colours (Worn grey through Ascendant pink) and those mean something precise. Two
   colour systems through the same cards would make both unreadable. */
.gv-cards .ga-row-head b { font-size: 0.74rem; font-weight: 800; letter-spacing: 0.16em;
    text-transform: uppercase; color: var(--map, #ffd98f);
    text-shadow: 0 1px 3px rgba(0,0,0,0.85); }
.gv-cards .ga-row-head i { font-size: 0.66rem; }

.gv-card { position: relative; width: 124px; display: grid; gap: 3px; padding: 6px 6px 7px; border-radius: 10px;
    background: linear-gradient(168deg, #4a3a22 0%, #382b17 62%, #2b2112 100%);
    border: 1px solid color-mix(in srgb, var(--rung) 55%, #2b2112);
    box-shadow: inset 0 0 0 1px rgba(255,222,160,0.12),
        0 0 14px color-mix(in srgb, var(--rung) 32%, transparent),
        0 3px 8px rgba(0,0,0,0.6); }
.gv-card-win { position: relative; aspect-ratio: 1; border-radius: 7px; overflow: hidden;
    display: grid; place-items: center;
    background: radial-gradient(ellipse 78% 68% at 50% 62%,
        color-mix(in srgb, var(--rung) 20%, #22351f), #16241a 74%); }
.gv-card-win > img { width: 94%; height: 94%; object-fit: contain;
    filter: drop-shadow(0 3px 6px rgba(0,0,0,0.7)); }
.gv-card-win > img.gv-card-seal { position: absolute; right: 3%; bottom: 3%; width: 30%; height: 30%;
    filter: drop-shadow(0 1px 2px rgba(0,0,0,0.9)); }
/* ── ⚠️ A SILHOUETTE, NOT A QUESTION MARK ──────────────────────────────────────────────────────
   brightness(0) on the creature's own sprite, so the outline is still the animal: the stag's antlers,
   the moth's wings, the scarecrow's arms. A missing card is therefore a SPECIFIC thing you have not
   killed yet rather than an anonymous hole, which is the whole difference between a set that pulls you
   back into the forest and a grid of boxes. A "?" tile would have been less work and taught nothing. */
.gv-card.is-locked { border-color: #3a3326; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.04); }
.gv-card.is-locked .gv-card-win { background: radial-gradient(ellipse 78% 68% at 50% 62%, #1d2419, #10160f 74%); }
.gv-card.is-locked .gv-card-win > img { filter: brightness(0) opacity(0.78); }
.gv-card.is-locked > b { color: #5d6552; letter-spacing: 0.18em; }
/* The pips are the ladder, and all six show from the first card so the room left to climb is visible
   on a one-star card instead of only on a maxed one. */
.gv-card-pips { display: flex; justify-content: center; gap: 1px; font-size: 0.56rem; line-height: 1;
    margin-top: 1px; }
.gv-card-pips i { font-style: normal; color: #2f2a1e; }
.gv-card-pips i.on { text-shadow: 0 0 6px currentColor; }
.gv-card > b { font-size: 0.66rem; line-height: 1.2; text-align: center; text-wrap: balance;
    color: color-mix(in srgb, var(--rung) 62%, #fff4dc);
    text-shadow: 0 1px 2px rgba(0,0,0,0.9); }
.gv-card > u { text-decoration: none; font-size: 0.58rem; line-height: 1.25; text-align: center;
    color: #c8f0ac; text-shadow: 0 1px 2px rgba(0,0,0,0.9); }
.gv-card > u.gv-card-none { color: #7d8670; }
/* ⚠️ THE BAR MEASURES THE RUNG YOU ARE IN, not the whole ladder -- see the note at the markup. Against
   the full ladder every bar below Crowned sits near empty and reads as no progress at all. */
.gv-card-bar { height: 3px; border-radius: 999px; background: rgba(0,0,0,0.45); overflow: hidden; }
.gv-card-bar i { display: block; height: 100%; border-radius: 999px; background: var(--rung);
    box-shadow: 0 0 7px var(--rung); }
.gv-card > small { font-size: 0.54rem; text-align: center; color: #9aa48e;
    font-variant-numeric: tabular-nums; }
.gv-card > button { margin-top: 2px; padding: 3px 0; border: 0; border-radius: 999px; cursor: pointer;
    font: inherit; font-size: 0.58rem; font-weight: 800; letter-spacing: 0.08em;
    color: #2b2112; background: color-mix(in srgb, var(--rung) 80%, #ffe6b0); }
/* Worn is a state you can see from across the shelf, not a word in a button. */
.gv-card.is-worn { border-color: var(--rung);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--rung) 45%, transparent),
        0 0 20px color-mix(in srgb, var(--rung) 55%, transparent), 0 3px 8px rgba(0,0,0,0.6); }
/* A boss card says so on its face: it is the heavier thing on an otherwise undifferentiated row. Top
   RIGHT, because Worn already owns the top left and the two can be true at once. */
.gv-card-boss { position: absolute; top: 4%; right: 4%; padding: 1px 5px; border-radius: 999px;
    font-style: normal; font-size: 0.5rem; font-weight: 800; letter-spacing: 0.1em;
    text-transform: uppercase; color: #ffe9c4; background: rgba(20,14,6,0.82);
    border: 1px solid rgba(255,214,130,0.5); }
.gv-card.is-locked .gv-card-boss { color: #7d8670; border-color: rgba(255,255,255,0.14); }
.gv-card-worn { position: absolute; top: 4%; left: 4%; padding: 1px 5px; border-radius: 999px;
    font-style: normal; font-size: 0.5rem; font-weight: 800; letter-spacing: 0.1em;
    text-transform: uppercase; color: #2b2112; background: var(--rung); }
/* ── CROWNED AND ASCENDANT GET A SHEEN ───────────────────────────────────────────────────────────
   The top two rungs are 110 and 250 of one creature, which is a very long way, and a card that arrives
   there looking like the 50 did pays nothing for the trip. One slow diagonal pass of light -- the same
   trick the rare drops on the floor use, so it reads as the same language rather than a new effect.
   ⚠️ Kept off the lower four deliberately: if everything shines, nothing does. */
.gv-card.is-high .gv-card-win::after { content: ""; position: absolute; inset: -40%;
    background: linear-gradient(68deg, transparent 42%, rgba(255,255,255,0.3) 50%, transparent 58%);
    animation: gvCardSheen 3600ms linear infinite; pointer-events: none; }
@keyframes gvCardSheen { 0% { transform: translateX(-62%); } 100% { transform: translateX(62%); } }
@media (prefers-reduced-motion: reduce) { .gv-card.is-high .gv-card-win::after { animation: none; opacity: 0.25; } }


/* ── THE GROVE'S MENU ─────────────────────────────────────────────────────────────────────────────
   ⚠️ THIS IS .nav-drawer, NOT A NEW DESIGN. Luke: "I want the menu black, okay? Like other slide-out
   menus we have. You can get rid of the weird stuff you got going on with that thing. Just ever be on
   the left like the other slide-out menus."

   I had built it twice and both were inventions. First a flat dark full-height slab, then -- reacting
   to "that don't look attached to the left" -- a carved wooden board with a brass hinge, recessed
   sockets, a hue per family and a slat per row. The second one was prettier and still wrong, because
   the site already HAS a slide-out menu and a player opening this one should not be meeting a new
   object. Every decision below is copied from .nav-drawer in globals.css rather than chosen:

     · #15151a, lifted off the page colour deliberately -- a drawer the same shade as what it covers
       reads as the page reflowing rather than as a panel sliding over it. (its words, its reason)
     · full height, min(82vw, 320px), one hairline border on the right, a long shadow
     · parked at translateX(-100%) with visibility hidden, so it SLIDES rather than popping, and does
       not swallow taps along the left edge while closed
     · 240ms cubic-bezier(0.2, 0.9, 0.3, 1)
     · rows are inset rounded pills, 12px 13px, separated by SPACING AND NOT BY RULES

   That last one is load-bearing and it is Luke's, two days ago, on the site menu: "the menu items have
   a bad border." A drawer separates rows by space. My slats were that same mistake rebuilt in wood.

   ⚠️ WHAT IS NOT COPIED: .nav-drawer is opened by the wolf in the site header, and the Grove has no
   header -- in a zone the screen is the game. So the handle below stays. It is the one piece of this
   that has to exist here and nowhere else, and it is drawn as quietly as it can be. */

/* The handle. Plain, dark, flush to the edge, no bigger than it needs to be. */
.gv-mmenu-handle { position: fixed; z-index: 1002;
    left: 0; top: 50%; transform: translateY(-50%);
    width: 30px; height: 76px; padding: 0; cursor: pointer;
    border: 1px solid var(--line, rgba(255,255,255,0.12)); border-left: 0;
    border-radius: 0 12px 12px 0;
    background: #15151a; box-shadow: 6px 0 20px rgba(0,0,0,0.6);
    display: grid; align-content: center; justify-items: center; gap: 5px;
    -webkit-tap-highlight-color: transparent; touch-action: manipulation;
    transition: transform 240ms cubic-bezier(0.2,0.9,0.3,1), background 140ms ease, opacity 260ms ease; }
.gv-mmenu-handle i { display: block; width: 14px; height: 2px; border-radius: 2px;
    background: #d8d4cc; transition: transform 240ms ease, opacity 180ms ease; }
.gv-mmenu-handle:hover { background: #1d1d23; }
/* Rides out on the drawer's edge and folds into a cross: the thing that opened it shuts it. */
.gv-mmenu-handle.is-open { transform: translateY(-50%) translateX(min(82vw, 320px)); }
.gv-mmenu-handle.is-open i:nth-child(1) { transform: translateY(7px) rotate(45deg); }
.gv-mmenu-handle.is-open i:nth-child(2) { opacity: 0; }
.gv-mmenu-handle.is-open i:nth-child(3) { transform: translateY(-7px) rotate(-45deg); }
/* One dot for the whole menu: a shut drawer has to be able to say "there is something in here". */
.gv-mmenu-dot { position: absolute; top: 9px; right: 5px; width: 7px; height: 7px; border-radius: 50%;
    background: #9fe08a; box-shadow: 0 0 8px #9fe08a; }

.gv-mmenu-scrim { position: fixed; inset: 0; z-index: 1000; border: 0; padding: 0; cursor: pointer;
    background: rgba(0,0,0,0.55); -webkit-tap-highlight-color: transparent; }

.gv-mmenu {
    position: fixed; inset: 0 auto 0 0; height: 100dvh;
    width: min(82vw, 320px); z-index: 1001;
    display: flex; flex-direction: column;
    border-right: 1px solid var(--line, rgba(255,255,255,0.12));
    background: #15151a;
    box-shadow: 14px 0 50px rgba(0,0,0,0.75);
    overscroll-behavior: contain; touch-action: pan-y;
    transform: translateX(-100%); visibility: hidden;
    transition: transform 240ms cubic-bezier(0.2,0.9,0.3,1); }
.gv-mmenu.is-open { transform: translateX(0); visibility: visible; }
.gv-mmenu:focus { outline: none; }
.gv-mmenu > header { padding: max(18px, env(safe-area-inset-top)) 16px 12px;
    font-size: 0.68rem; font-weight: 700; letter-spacing: 0.26em; text-transform: uppercase;
    color: #8f8a80; }
.gv-mmenu-scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 0 10px 18px; }
/* ⚠️ THE SECTION AND HEADING RULES ARE GONE, not left orbiting. The menu renders one flat list now --
   see the note at the markup for why three headings over six rows was more chrome than content. The
   scroller below is the list; there are no section elements in this component any more. */
.gv-mmenu-scroll { display: flex; flex-direction: column; gap: 2px; }
/* An inset rounded pill, exactly like the site drawer's rows. ⚠️ NO BORDERS AND NO DIVIDERS --
   separated by the 2px gap above. See the note at the top. */
.gv-mmenu-scroll > button { width: 100%; display: flex; align-items: center; gap: 11px;
    padding: 10px 13px; border: 0; border-radius: 12px; background: transparent; font: inherit;
    text-align: left; cursor: pointer; color: #efe7d8;
    -webkit-tap-highlight-color: transparent;
    transition: background 140ms ease; }
.gv-mmenu-scroll > button:hover,
.gv-mmenu-scroll > button:active { background: rgba(255,255,255,0.06); }
.gv-mmenu-scroll > button.is-on { background: rgba(255,255,255,0.09); }
.gv-mmenu-sock { flex: none; width: 34px; height: 34px; display: grid; place-items: center; }
.gv-mmenu-sock img { width: 34px; height: 34px; object-fit: contain; display: block; }
.gv-mmenu-scroll > button > span:not(.gv-mmenu-sock) { flex: 1; min-width: 0; }
.gv-mmenu-scroll > button b { display: block; font-size: 1rem; font-weight: 600; color: #efe7d8; }
/* The line a row of circles had nowhere to put. */
.gv-mmenu-scroll > button small { display: block; font-size: 0.72rem; line-height: 1.3; color: #8f8a80; }
.gv-mmenu-scroll > button em { flex: none; font-style: normal; font-size: 0.68rem; font-weight: 700;
    padding: 2px 8px; border-radius: 999px; color: #10120d; background: #9fe08a; }

/* ⚠️ CLEARS THE SITE'S OWN NAV BUBBLE. That circle is fixed to the bottom-LEFT of every page and this
   drawer is full height on the left, so the two share a corner -- filmed, the nav wolf sat straight on
   top of the word "Sound". .nav-drawer never hits this because the bubble IS its opener and lives in
   the header; here it is a separate control that happens to land in the same place. */
.gv-mmenu > footer { border-top: 1px solid var(--line, rgba(255,255,255,0.1));
    padding: 8px 10px calc(62px + env(safe-area-inset-bottom)); }
.gv-mmenu-sound { width: 100%; display: flex; align-items: center; gap: 11px; cursor: pointer;
    padding: 10px 13px; border: 0; border-radius: 12px; background: transparent; font: inherit;
    font-size: 0.86rem; color: #a8a49c; -webkit-tap-highlight-color: transparent; }
.gv-mmenu-sound svg { width: 20px; height: 20px; flex: none; }
.gv-mmenu-sound:hover { background: rgba(255,255,255,0.06); }
.gv-mmenu-sound[aria-pressed="true"] { color: #6f6b63; }

@media (prefers-reduced-motion: reduce) {
    /* ⚠️ IT STILL OPENS AND SHUTS. Reduced motion means no slide, not a menu that cannot be used. */
    .gv-mmenu, .gv-mmenu-handle { transition: none; }
}


/* ── THE STATUE VENDOR ────────────────────────────────────────────────────────────────────────────
   One row per stat, and the row IS the bar. The line wears its own colour (--line), which is stone
   until the first crystal and then never goes back -- that recolour is the reward, so it is the
   loudest thing on the row. */
.gv-stat { display: flex; flex-direction: column; gap: 14px; }
.gv-stat-lede { margin: 0; font-size: 0.8rem; line-height: 1.5; color: #cfc6b6;
    padding: 10px 12px; border-radius: 10px;
    background: rgba(255,196,96,0.07); border: 1px solid rgba(255,196,96,0.22); }
.gv-stat-lede b { color: #ffd98f; }
.gv-stat-locked { margin: 0; font-size: 0.84rem; color: #9aa48e; }
.gv-stat-locked b { color: #ffd98f; }
.gv-stat-next { margin: 0; font-size: 0.76rem; color: #8f8a80; text-align: center; }

.gv-statline { display: grid; gap: 6px; padding: 12px 13px; border-radius: 11px;
    background: linear-gradient(168deg, rgba(40,38,30,0.9), rgba(26,25,19,0.95));
    border: 1px solid color-mix(in srgb, var(--line) 36%, #2b2112);
    box-shadow: inset 0 0 0 1px rgba(255,222,160,0.07),
        0 0 16px color-mix(in srgb, var(--line) 22%, transparent); }
.gv-statline header { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.gv-statline header b { font-size: 0.92rem; color: color-mix(in srgb, var(--line) 55%, #fff4dc); }
.gv-statline header em { font-style: normal; font-size: 0.8rem; font-weight: 700; color: #c8f0ac; }

/* ⚠️ A REAL BOX WITH A REAL HEIGHT. A percentage-width fill inside a zero-height parent paints nothing
   -- see percentage-needs-a-real-box, which cost four bug reports on the farm. */
.gv-statbar { height: 8px; border-radius: 999px; overflow: hidden;
    background: rgba(0,0,0,0.5); box-shadow: inset 0 1px 2px rgba(0,0,0,0.6); }
.gv-statbar i { display: block; height: 100%; border-radius: 999px;
    background: linear-gradient(90deg, color-mix(in srgb, var(--line) 70%, #fff), var(--line));
    box-shadow: 0 0 10px var(--line); transition: width 320ms cubic-bezier(0.16,1,0.3,1); }
.gv-statline small { font-size: 0.68rem; color: #9aa48e; font-variant-numeric: tabular-nums; }

.gv-statheld { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 2px; }
.gv-statnone { font-size: 0.72rem; color: #6f6b63; }
/* A statue is a tap target first. The glyph is a plinth-and-figure silhouette drawn in CSS rather than
   generated: at 34px a painted statue is a smudge, and five stats would be five more sprites to keep in
   step with a stat table that changes. */
.gv-statue { display: grid; grid-template-columns: auto auto auto; align-items: center; gap: 6px;
    padding: 6px 10px 6px 7px; border-radius: 9px; cursor: pointer; font: inherit;
    background: linear-gradient(168deg, rgba(60,55,42,0.9), rgba(32,29,22,0.95));
    border: 1px solid color-mix(in srgb, var(--r) 50%, #2b2112);
    box-shadow: 0 0 12px color-mix(in srgb, var(--r) 28%, transparent);
    -webkit-tap-highlight-color: transparent; transition: transform 120ms ease, box-shadow 140ms ease; }
.gv-statue:active { transform: scale(0.95); }
.gv-statue:disabled { opacity: 0.55; cursor: default; }
.gv-statue-glyph { width: 15px; height: 20px; background: var(--r);
    clip-path: polygon(50% 0%, 66% 16%, 62% 46%, 76% 74%, 84% 100%, 16% 100%, 24% 74%, 38% 46%, 34% 16%);
    filter: drop-shadow(0 0 5px color-mix(in srgb, var(--r) 60%, transparent)); }
.gv-statue-n { font-size: 0.86rem; font-weight: 800; color: #f6edda; }
.gv-statue-w { font-size: 0.64rem; font-weight: 700; color: color-mix(in srgb, var(--r) 70%, #fff); }

/* The two moments the system exists for. Loud, and gone on the next render. */
.gv-statflash { margin: 4px 0 0; font-size: 0.78rem; font-weight: 700;
    animation: gvStatFlash 2600ms ease-out forwards; }
.gv-statflash.is-level { color: #c8f0ac; }
.gv-statflash.is-crystal { color: #7fd4e8; text-shadow: 0 0 12px rgba(127,212,232,0.6); }
.gv-statflash.is-prismatic { color: #d08aff; text-shadow: 0 0 14px rgba(208,138,255,0.7); }
@keyframes gvStatFlash {
    0% { opacity: 0; transform: translateY(4px); }
    8% { opacity: 1; transform: translateY(0); }
    80% { opacity: 1; }
    100% { opacity: 0; } }
`;
