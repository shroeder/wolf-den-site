"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useWishlist } from "./useWishlist.js";

import {
    GROVE_ENEMIES, GROVE_RARE, GROVE_POP, spawnGapMs, GROVE_HYPER, dropsAnyOf, HEAL_AT, scaledFoe, scaledRare, groveDepth, groveBoss, groveSize, grovePart,
    groveArt, groveEmblem, GROVE_ZONES, groveBiome, slabArt, slabSurface, hangArt, sitArt,
} from "@/lib/marketplace/grove-catalog.js";
import { rngFrom, rollKill, rollRareSpawn } from "@/lib/marketplace/grove-roll.js";
import {
    UNITS_PER_SCREEN, zoneWidth, platformsFor, decorateLedges, swing, makeTelegraph, telegraphHits, mitigate,
    BLEED_TICK_MS, BLEED_TICKS, petBite, petBiteCd,
} from "@/lib/marketplace/grove-world.js";
// Pure files, both of them — no DB and no server-only, which is why a client scene may read them. The
// alternative was a second haste curve that drifts from the ring's the first time either is touched.
import { procFrom, HASTE_PER_POINT } from "@/lib/marketplace/arena-kit.js";

/** What a haste proc is worth, and for how long. */
const HASTE_MULT = 1.6;
const HASTE_MS = 2200;
// ── ⚠️ THE SIMULATION LIVES IN A SOLVER NOW, NOT IN THIS FILE ───────────────────────────────────────
// Luke: "some kind of minimalistic kind of physics engine so that we don't have to try and pre-calculate
// where platforms are and instead just like spawn them on a platform and have some gravity and like friction".
//
// So every body in the zone — hero, pet, thirty creatures, every piece of loot and every spark — is an
// intent (which way, and whether to hop) handed to ONE solver. The scene decides what things want; the solver
// decides where they end up. Before this, position was authored frame by frame: nothing had weight, nothing
// could be knocked back, nothing was ever grounded on a ledge it had not been placed on, and a wanderer
// strolled off every ledge in the zone. See grove-physics.js for the long version.
import {
    makeBody, integrate, drive, hop, impulse, spawnOnPlatform, navigate, wanderIntent, surfaceUnder,
    HOP,
} from "@/lib/marketplace/grove-physics.js";
// ── ⚠️ GAME FEEL IS A NAMED KIT, AND IT IS ALL IN ONE FILE ──────────────────────────────────────────
// Luke: "It's missing most of the design principles around like juicy hit lag and like hit flash and all
// these things that game developers do to make it really sell the feeling of hitting an enemy."
import {
    makeClock, makeShaker, makeChase, stepChase, swingPose, breathe, landSquash, shadowFor,
    makePop, stepPop, makeSpark, spillVelocity, comboRung,
    popScale, popWeight, barHit, barColor, FOE_BAR_LINGER_MS,
    HITSTOP_MS, TRAUMA, SWING, SWING_TOTAL_MS, KNOCK, RECOIL, FLASH_MS, SPAWN_FADE_MS,
    deathKit, DEATH_SINK, DEATH_OPAQUE_UNTIL, DEATH_IMPACT, HERO_DEATH, DEATH_VEIL_DELAY_MS,
    SPARK, DUST, VIGNETTE, COMBO_WINDOW_MS, COMBO_PITCH_STEPS, LOOT_BOUNCE, LOOT_REST_MS,
    LOOT_LABEL_MS, LOOT_DRAW_ACCEL, LOOT_DRAW_MAX, LOOT_EAT_DIST,
    pouncePose, POUNCE, PET_TRAUMA_SHARE, PET_KNOCK_SHARE, PET_SPARKS,
} from "@/lib/marketplace/grove-juice.js";
import { footOf } from "@/components/grove/grove-foot.js";
import {
    playHit, playKill, playHurt, playDrop, playPickup, playWhiff, playTell, celebrateUnlock, playEmblemDrop, playBossNotice, playDeath,
    playPetHit,
} from "@/components/grove/grove-sfx.js";
// ── ⚠️ THE GEOMETRY LIVES IN ITS OWN FILE SO IT CAN BE CHECKED ─────────────────────────────────────
// Every distance that is really a SHARE OF THE FRAME is in grove-view.js, with the long version of why. The
// short version: three such distances were written here as bare constants tuned for a 100-unit frame, and all
// three broke silently when the frame became 26 units. scripts/check-grove.mjs now runs these functions across
// the real viewport sizes and asserts the hero and the pet are on screen, which no amount of reading the
// component would have told anyone.
import {
    HERO_UNITS, PET_UNITS, SKY_PX, SKY_PY, SKY_TILE_COUNT,
    viewFor, petFollow, cameraX, cameraY,
} from "@/lib/marketplace/grove-view.js";

// ── THE ZONE, ON SCREEN ──────────────────────────────────────────────────────────────────────────────────────
// The whole scene runs here. Nothing about movement, wandering, swinging, dying or looting touches the server
// — see grove-roll.js for why. The server issued a seed; this plays it, and sends back only what it killed.
//
// ⚠️ THE SIMULATION WRITES TRANSFORMS, NEVER REACT STATE. Thirty enemies at 60fps is 1,800 state updates a
// second, which would re-render the whole zone thirty times a frame. Positions live in refs and are pushed
// onto DOM nodes; React renders each body ONCE and never touches it again. Same rule as the gachapon's
// physics, for the same reason.
//
// React state here is only ever things that change a few times a minute: who is alive, and whether you are.
// ⚠️ EVEN THE HEALTH BAR IS NOT STATE ANY MORE. It has a chase layer that has to move every frame, and a
// setState per frame for a bar is the same mistake as a setState per frame for a position.
//
// ── ⚠️ WHAT WAS ACTUALLY WRONG, FROM FILMING IT ────────────────────────────────────────────────────────
// Luke: "The Grove looks so ghetto. I need it to look like an actual video game." Three of the four things he
// named turned out to be one-line causes that no amount of animation work would have reached, and they are
// worth keeping written down because each one photographs as something else entirely:
//
//   1. ⚠️ THE "WEIRD SPIN" AND THE "FLOAT IN FROM A DETERMINISTIC SPOT" WERE ONE LINE OF CSS.
//      .gv-foe carried `transition: opacity 380ms, transform 380ms` while this loop writes
//      translate3d + scaleX onto those same nodes sixty times a second. So a freshly spawned body started at
//      transform:none — the scene's bottom-left corner — and EASED to its real position over 380ms (the
//      float), every frame's position was being interpolated toward rather than set (all motion mush), and
//      scaleX flipping 1 to -1 was INTERPOLATED THROUGH ZERO, which squashed the sprite flat and brought it
//      back mirrored every single time a creature turned around. That was the spin.
//
//      ⚠️ SO THE FACING FLIP DOES NOT LIVE ON THE POSITIONED NODE ANY MORE. Position is written to the
//      outer node and scaleX to an inner one, which makes that class of bug unreachable rather than fixed:
//      a transition added to either node later can no longer interpolate a mirror through zero.
//
//   2. ⚠️ EVERY CREATURE WAS THE SAME SIZE, AND THAT SIZE WAS BIGGER THAN THE HERO. A flat 8-unit box
//      with aspect-ratio: 1 against a 7-unit hero, and the sprites fill their plates — so a rootrat stood
//      taller than the knight and an Elderling was no bigger than the rat. See GROVE_SIZE.
//
//   3. ⚠️ THE LEDGES WERE UNREACHABLE. Nothing in the scene could jump, so the vertical half of every zone
//      was scenery with enemies standing on it. See navigate() and platformsFor().

// ── ⚠️ 45s, AND A BEACON ON THE WAY OUT ─────────────────────────────────────────────────────────────────────
// This was 90s, which meant up to a minute and a half of killing was thrown away if the tab died — and a
// phone browser kills a backgrounded tab without ceremony. 45s is one respawn window, so a settle lines up
// with the rhythm of the zone, and it is still only about thirteen requests in a ten-minute session.
//
// The React cleanup covers walking away. It does NOT cover the tab being closed or the phone swallowing the
// page, because a fetch started during teardown is cancelled with the document. sendBeacon is the one thing
// the browser promises to deliver after the page is gone.
const SETTLE_EVERY_MS = 45_000;

// ── THE IN-ZONE DOCK ─────────────────────────────────────────────────────────────────────────────────────────
// ⚠️ THE SAME FOUR OBJECTS AS THE HUB'S DOCK, DELIBERATELY. They are the same four places and a player
// should not have to learn a second set of icons for them; what changes in a zone is the ARRANGEMENT —
// a row across the bottom rather than a column up the right, because the right-hand column is where Leave
// and the full-screen toggle already live and because a thumb crossing the middle of a fight to reach a
// menu is a thumb over the thing it is fighting.
const ZONE_DOCK = [
    { k: "map", label: "Map", art: "/images/grove/ui-map.webp" },
    { k: "bag", label: "Backpack", art: "/images/grove/ui-bag.webp" },
    { k: "bench", label: "Workbench", art: "/images/grove/ui-bench.webp" },
    { k: "emblems", label: "Emblems", art: "/images/grove/ui-emblems.webp" },
];

// ── REACH, IN WORLD UNITS ───────────────────────────────────────────────────────────────────────────────────
// ⚠️ GENUINE WORLD DISTANCES, WHICH IS WHY THEY ARE ALLOWED TO BE CONSTANTS HERE. A reach does not change
// meaning when the camera zooms; a lookahead does. Anything that is really a share of the frame belongs in
// grove-view.js — see view-space-constants-break-on-zoom.
// ⚠️ HALVED WITH THE REST OF THE WORLD. Nine units is half a phone frame: the hero stopped a whole
// screen-width short of what he was attacking and the two of them were never in the same picture.
const ATTACK_RANGE = 4.5;
// ── ⚠️ REACH IS MEASURED TO THE EDGE OF THE BODY, NOT TO ITS CENTRE ────────────────────────────────────
// Every body in the Grove is a point with a half-width, and a flat reach to the point means the hero walks
// a fixed distance from the MIDDLE of whatever he is hitting. That was survivable when every creature was
// the same size; now that a grub is 2.3 units and the Heartwood Elder is 21, the same number either stops
// him a body's length short of a rat or walks him into the middle of a boss.
//
// This used to be a special case — a constant added only for bosses — which is the shape of a rule that has
// not been noticed yet. The Elderling and the Crystal Stag are not bosses and are both nearly ten units
// tall; they were getting the rootrat's number. Adding the target's own half-width covers all of them and
// deletes the special case, which is the version that cannot drift.
const reachTo = (foe) => ATTACK_RANGE + (Number(foe?.halfW) || 0);
// Luke: "The player must walk near the loot for it to get picked up." Rest is where it lands; this is how
// close you have to come before it commits to you.
const LOOT_DRAW_RANGE = 6;

// ── THE PET'S OWN NUMBERS ────────────────────────────────────────────────────────────────────────────────
// How close the pet gets before it bites. Shorter than the hero's 4.5, because a pet has no weapon: the
// whole read of a pounce is that the animal arrives at the thing and bites it, and a companion snapping at
// air from a sword's length away looks like it missed on every single hit.
const PET_REACH = 2.6;
// ⚠️ HOW LONG THE PET KEEPS FIGHTING AFTER YOUR LAST SWING. Must be longer than one hero swing at the
// SLOWEST tempo (410ms at tempo 1) or the pet downs tools between your blows and never crosses the gap;
// short enough that tapping away stops it inside a second, because "I walked off and my pet was still
// over there fighting" is the complaint this number exists to prevent. Also what makes a kill end the
// pet's involvement cleanly: the window lapses, there is nothing left to renew it.
const PET_ENGAGE_MS = 900;
// ── ⚠️ WHAT YOU WALKED OUT WITH, NOT WHAT YOU JUST TOUCHED ─────────────────────────────────────────────
// Luke: "when we collect items, I want to see them pop up on the left side in like a snack bar that tells me
// how many I got. And if you get more, it makes the amount go up so that it stays there longer, just so you
// can see what you're actually getting."
//
// The floating label at the collector's head already says what ONE pickup was, and it is the right thing for
// that job — it fires at whoever collected it, which is how the pet's errands read as the pet's. What it
// cannot do is add up. Six Thornhusk over twenty seconds is six labels that each live 1.1 seconds, in six
// different places, and at the end of it the honest answer to "what am I actually getting in here" is that
// you have no idea.
//
// So the tally is a SECOND surface, not a replacement: one row per kind, pinned left, counting up. A row's
// life extends on every arrival rather than restarting, which is the "stays there longer" — a kind that keeps
// dropping keeps its row, and the row for the thing you stopped finding ages out on its own.
const HAUL_MS = 4200;            // how long a row survives its last arrival
const HAUL_MAX_MS = 14_000;      // ⚠️ and the ceiling on that. Without it a common part in a good zone renews
                                 // its row for ever and the tally becomes permanent furniture down one side
                                 // of the screen -- which is the HUD the whole Grove was built without.
const HAUL_ROWS = 5;             // oldest row falls off the bottom; five is what fits above the dock on a phone

// How far the pet will range to collect a drop. Generous on purpose — a fetcher that only picks up what
// you were nearly standing on anyway has not saved you a single step, which is the entire feature.
// How close to its flanking spot counts as arrived. Loose enough that the pet is not nudging itself into
// position for ever against a creature that wanders, tight enough that it actually crosses over.
const PET_FLANK_SLACK = 1.6;
const PET_FETCH_RANGE = 26;
// And how close it has to get before the drop commits to it. Wider than the hero's LOOT_EAT_DIST because
// the pet is 4.5 units tall against his 7 and reaching rather than walking over the top of it.
const PET_FETCH_REACH = 3.2;
// What the fetch bench puts on the floor. A zone-one part, so its sprite certainly exists; named here
// rather than inline so the one place it is typed is the one place it can be wrong.
const LAB_FETCH_PART = "grub_fat";

// ── THE DOORS ────────────────────────────────────────────────────────────────────────────────────────────
// How far in from the wall a door stands. Far enough that the hero can get fully past it and turn round —
// flush against the wall he would be standing inside it with nowhere to step back to.
const DOOR_INSET = 9;
// ⚠️ HALF THE GATE'S OWN BUTTON, AND IT MUST MATCH THE STYLESHEET. .gv-door is 12 units wide and centred on
// its x (margin-left: -6), so the thing you can press reaches six units either side of the door's position.
// Anything that must not cover the way out is placed against this.
const DOOR_HALF = 6;
// How close the hero has to be for a working door to notice him. Wide enough that it wakes up while he is
// still walking toward it — a reaction that only fires once you are standing inside the thing reads as a bug.
const DOOR_NEAR = 11;

// ── AN EMBLEM ARRIVING ───────────────────────────────────────────────────────────────────────────────────────
// Longer than a boss kill stop (130ms), because this is rarer than any boss: twelve bosses exist and an
// emblem is roughly one kill in four hundred. Long enough to register as the world pausing, short enough
// that it never reads as a stutter.
const EMBLEM_STOP_MS = 190;
// Thrown harder than ordinary loot so it hangs at the top of its arc while the ring and the sparks resolve
// underneath it. LOOT_SPILL.up is 0.62; this is the one drop allowed to upstage the rest of the pile.
const EMBLEM_THROW = 1.15;

// ── A BOSS NOTICING YOU ──────────────────────────────────────────────────────────────────────────────────────
// Further out than its own reach (26) so the announcement lands while you are still deciding to approach,
// not once you are already inside the fight.
const BOSS_NOTICE = 34;
// Matches the herald's CSS animation. A banner cleared on a timer rather than on animationend, because
// animationend never fires if the element is not painted, and a banner that never clears is a word
// sitting across the middle of a fight.
const HERALD_MS = 2200;

// ── DYING ────────────────────────────────────────────────────────────────────────────────────────────────────
// The longest hold in the feature, because it is the only one with nothing after it. A boss kill stops for
// 130ms and an emblem for 190; this is allowed to sit, because the next thing the player sees is a panel
// telling them the run is over and the screen should already feel like it has stopped before it arrives.
const DEATH_STOP_MS = 420;
// How long the flare covers the screen before the zone is allowed to change under it, and how long the
// arrival takes to clear. Short on purpose: this is a transition, not a loading screen.
const WARP_OUT_MS = 260;
const WARP_IN_MS = 420;
const ZONE_COUNT = GROVE_ZONES.length;
const DOOR_ART = {
    open: "/images/grove/portal-open.webp",
    locked: "/images/grove/portal-locked.webp",
    skull: "/images/grove/portal-skull.webp",
};
// How far above or below a creature the hero will still swing at it. A body one tier up is not in reach.
const SWING_V_REACH = 6;
// A pet that falls this far behind has lost the plot — see the rescue in the loop.
const PET_LOST = 30;

export default function GroveScene({
    zone, seed, bonuses, stats, heroArt, petArt, belt, labScene,
    // ⚠️ ONE NUMBER, ALREADY MULTIPLIED OUT, AND NOT THE RARITY AND LEVEL IT CAME FROM. The share of a
    // hero swing this member's companion bites for, computed on the server in heroLook (grove.js) off the
    // equipped pet's rarity and its pet-XP level. Handing the scene the two inputs instead would have put
    // the balance table in the client, where a tampered one could claim to be primordial — and would have
    // meant two places that know how rarity becomes damage. 0 means no pet equipped, and the resolver
    // reads that as "do not bite", not as "bite for nothing".
    petBite: petShare = 0,
    // How many things are waiting at the workbench -- craftable recipes plus unopened chests. Counted in
    // GroveClient off the shared recipe rule; see the note there.
    benchReady = 0,
    onSettle, onBoss, onLeave, onDeath, onTravel, onPanel, paused = false, unlockedN = 1,
}) {
    const hostRef = useRef(null);
    const worldLayerRef = useRef(null);
    const fxRef = useRef(null);
    // ⚠️ hpRef / hpGhostRef ARE GONE WITH THE ELEMENT THEY POINTED AT. The player's own bar was removed
    // on Luke's call ("I hate the kill display and red bar. Remove it.") and these two refs stayed behind,
    // written to by the loop every frame against null for ever after. Declared but never mounted: see the
    // lint gate of the same name. The screen's own red wash is the hero's health readout now.
    const bossStripRef = useRef(null);
    const bossFillRef = useRef(null);
    const bossGhostRef = useRef(null);
    const comboRef = useRef(null);
    const vignRef = useRef(null);
    const worldRef = useRef(null);
    const camRef = useRef(0);
    const camYRef = useRef(0);

    // ⚠️ THE SESSION'S KILL COUNT IS NOT STATE ANY MORE, AND THAT WAS A REAL CARRY-OVER. It was a
    // useState seeded at zero on MOUNT, and the scene does not unmount between zones — the world is
    // rebuilt by a useMemo and the component lives on — so walking through a gate took the last zone's
    // tally with it. The door's readout is `zone.kills + kills`, so arriving in the Hollow after twenty
    // kills in the Thicket showed 20/25 on a zone you had never swung in. The world already counts this
    // (w.killIndex, which the boss-readiness check reads), so there were two numbers for one fact and
    // only one of them was reset when the zone was.
    // One door at a time: two taps while the first request is in flight would enter twice.
    const travelRef = useRef(false);
    // ⚠️ A REF, NOT A DEPENDENCY. Pausing through the effect's dep array would TEAR THE LOOP DOWN AND
    // REBUILD IT every time a panel opens — and this effect's cleanup banks the unsettled kill log, so
    // every open and close would fire a settle request. A ref the running frame reads costs nothing and
    // changes nothing else.
    const pausedRef = useRef(paused);
    pausedRef.current = paused;
    // null while standing still; "out" while the gate floods the screen, "in" while the new zone arrives.
    const [warp, setWarp] = useState(null);
    // Which gate is being walked through, so it can flare under the screen flood.
    const [entering, setEntering] = useState(null);
    // ⚠️ THE RUNNING TOTAL, NOT THIS VISIT'S. zone.kills is what the server has banked across every session
    // in this zone; `kills` is only what has died since this one started. Luke: "Ensure the kill count
    // persists, we don't want it to get reset if you leave." The door reads the sum, so walking out at 19
    // of 20 and coming back needs one more kill — not twenty. Adding the live count on top is what makes
    // the door open on the kill that earns it rather than on the next settle.
    const [dead, setDead] = useState(false);
    // ⚠️ THE BAR'S NAME LIVES ON THE WORLD, NOT IN STATE, BECAUSE ITS NUMBER ALREADY DID. w.bossBar
    // holds the hit points and this held the name, and the two had different lifetimes: the world is
    // rebuilt when the zone changes and component state is not. So walking away from a live boss and
    // going on carried its NAME into the next zone with a bar that could never move again. One fact, one
    // lifetime — and the reset comes free with the world rather than needing to be remembered.
    // The one-shot banner across the middle when a boss first notices you, distinct from the bar it leaves.
    // ⚠️ bossIntro IS GONE: IT WAS NEVER SET TO ANYTHING. Both of its setters passed null — it was
    // superseded by the herald below and the leftovers stayed, so `{bossIntro ? <div …>}` could not
    // render under any circumstances. Declared but never read; see the lint gate of that name.
    // ── THE HERALD ──────────────────────────────────────────────────────────────────────────────
    // Centred on the VIEWPORT, which is the entire point. The old unlock announcement was a float at
    // the door's world position, so killing the twentieth creature anywhere else on the map put the
    // zone's biggest beat off screen entirely. Not a modal: nothing is dismissed and nothing is
    // blocked -- it says its piece and leaves.
    const heraldTimer = useRef(null);
    const [beltLeft, setBeltLeft] = useState(Number(belt?.count) || 0);
    // ── ⚠️ THE LIST IS STATE; THE POSITIONS ARE NOT ─────────────────────────────────────────────────
    // The first version pushed foes into world.foes imperatively and React was never told, so the zone
    // rendered with zero enemies in it while the simulation happily ran thirty of them. The split that
    // works is by FREQUENCY: the population changes on a spawn or a death — a few times a minute — so it
    // is state; a position changes sixty times a second per body, so it stays a ref and is written
    // straight onto the node.
    const [gen, bumpGen] = useState(0);
    const rerender = useCallback(() => bumpGen((g) => g + 1), []);

    // ── WHAT THE CREATURES IN THIS ZONE ARE CARRYING OFF YOUR LIST ──────────────────────────────
    // ⚠️ KEYED BY CREATURE AND BUILT ONCE PER (zone, list). Every body in the zone renders against it, so
    // the alternative is dropsAnyOf per body per re-render — and the answer is the same for all nineteen
    // Husks on screen. Memoised on the list joined, not on the array, because the hook hands back a new
    // array identity on every notify.
    const { wish } = useWishlist();
    const wishKey = wish.join(",");
    const wishHere = useMemo(() => {
        const out = {};
        if (!wish.length) return out;
        for (const id of [...(zone?.enemies || []), GROVE_RARE.id]) {
            const hit = wish.filter((p) => dropsAnyOf(id, [p]));
            if (hit.length) out[id] = hit;
        }
        return out;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [zone?.id, wishKey]);

    // ── ⚠️ THE PAGE BEHIND A FIXED OVERLAY STILL SCROLLS ──────────────────────────────────
    // position: fixed takes the scene out of the flow; it does not stop the document under it moving. On a
    // phone a drag that misses an enemy would scroll the shop page behind the zone and bounce the overlay
    // around with it. Removed on unmount so leaving never strands the page unscrollable.
    useEffect(() => {
        document.body.classList.add("gv-full-lock");
        return () => document.body.classList.remove("gv-full-lock");
    }, []);

    // ── ⚠️ THE SCENE IS PORTALLED TO <body>, AND THAT IS NOT A STYLE CHOICE ──────────────────
    // position: fixed resolves against the viewport ONLY while no ancestor creates a containing block, and
    // the global `.reveal > *` page-entry animation runs fade-in-up with fill-mode BOTH — so when it
    // finishes it leaves transform: translateY(0) on the element for ever. An IDENTITY matrix, visually
    // nothing, and enough to make every fixed descendant resolve against it instead. The full-screen scene
    // came out as a 390px-tall strip starting 211px down the page, with every rule applying correctly.
    //
    // This repo has now been bitten by that rule twice: a backdrop-filter on the header did the same thing to
    // the mobile menu. Rather than find and defeat whichever ancestor it is this time, the overlay stops
    // depending on ancestors it does not own. See filter-creates-containing-block.
    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []);

    // The browser's own full screen, where it exists. ⚠️ NOT RELIED ON: iOS Safari refuses
    // requestFullscreen for anything that is not a <video>, which is a large share of the phones that will
    // open this. The fixed overlay above is what actually delivers full screen; this only additionally hides
    // the browser's chrome, so the button is simply absent where it would not work.
    const [canNative, setCanNative] = useState(false);
    const [isNative, setIsNative] = useState(false);
    useEffect(() => {
        setCanNative(typeof document !== "undefined" && Boolean(document.documentElement?.requestFullscreen));
        const onChange = () => setIsNative(Boolean(document.fullscreenElement));
        document.addEventListener("fullscreenchange", onChange);
        return () => document.removeEventListener("fullscreenchange", onChange);
    }, []);
    const toggleNative = useCallback(() => {
        if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
        else hostRef.current?.requestFullscreen?.().catch(() => {});
    }, []);

    // ── ⚠️ DYING DID NOTHING AT ALL ──────────────────────────────────────────────────────────
    // setDead(true) only made the tap handlers return early, so a dead player sat on a frozen zone at 0 HP
    // with the enemies still wandering around them and no indication anything had happened. The only way out
    // was to notice the Leave button. Luke: "when you die it should send you back to town."
    useEffect(() => {
        if (!dead) return undefined;
        const t = setTimeout(() => onDeath?.(), 2600);
        return () => clearTimeout(t);
    }, [dead, onDeath]);

    // ⚠️ ONE TIMER, CLEARED ON REPLACE. Two beats can land within a second of each other -- the way
    // opening and the boss waking are both caused by the SAME kill -- and without clearing, the first
    // banner's timer would take the second one off the screen early.
    // ⚠️ ON THE WORLD TOO, AND THE TIMER CHECKS IT IS STILL THE SAME WORLD. A banner fired a second
    // before a gate is walked through used to arrive in the NEXT zone and sit there for its full three
    // seconds, announcing something that happened somewhere else. Writing it onto the world means the
    // swap clears it; the identity check means the timer cannot clear or revive a banner belonging to a
    // zone that no longer exists.
    const fireHerald = useCallback((kicker, word, kind = "way") => {
        const w = worldRef.current;
        if (!w) return;
        w.herald = { kicker, word, kind };
        rerender();
        if (heraldTimer.current) clearTimeout(heraldTimer.current);
        heraldTimer.current = setTimeout(() => {
            if (worldRef.current !== w) return;
            w.herald = null;
            rerender();
        }, HERALD_MS);
    }, [rerender]);
    useEffect(() => () => { if (heraldTimer.current) clearTimeout(heraldTimer.current); }, []);

    // ⚠️ UNITS, NOT SCREENS — zoneWidth answers in world units now. See the note on it.
    const W = zoneWidth(zone.n);
    const maxHp = stats?.maxHp || 100;

    // ── THE WORLD ───────────────────────────────────────────────────────────────────────────────────
    const world = useMemo(() => {
        const rand = rngFrom(seed);
        // ⚠️ DRESSED AT BUILD, NOT AT RENDER. Which vine hangs where is rolled here, once, off the zone's
        // own seed, and stored on the ledge — see decorateLedges. Rolling it inside the render would
        // re-roll it on every re-render, and the scene re-renders whenever a telegraph appears.
        const platforms = decorateLedges(platformsFor(zone.n, rand), groveBiome(zone.biome), rand);
        const mk = (x, h, speed, art) => ({
            ...makeBody({ x, y: 0, h, halfW: h * 0.3, speed }),
            art, phase: rand(), landedAt: 0, flash: 0, node: null,
        });
        return {
            platforms,
            // The zone's highest ledge, so the backdrop knows how much sky this particular zone needs.
            topY: platforms.reduce((m, p) => Math.max(m, p.y), 0),
            groundPx: 0,
            unitPx: 0,
            rand,
            hero: mk(12, HERO_UNITS, 1 + (stats?.moveSpeed || 0) / 100, heroArt),
            pet: mk(6, PET_UNITS, 0.95, petArt),
            // ── THE PET'S FIGHT ─────────────────────────────────────────────────────────────────
            // What it is biting, until when, and where it is in its pounce. petDone starts TRUE: the
            // resolver below reads "a pounce is in flight" as !petDone, so starting false would resolve
            // a phantom bite against a null foe on frame one.
            petFoe: null,
            // Which side of the target it takes. Set when the target changes; see the engage block.
            petSide: 1,
            petEngagedUntil: 0,
            petBiting: null,
            petAt: null,
            petDone: true,
            // The one drop it has committed to collecting, so it does not dither between two piles.
            petFetch: null,
            // Replaced by the real figure at the end of the first camera pass; this is only what the pet
            // follow reads on frame one, before anything has been measured.
            visibleUnits: UNITS_PER_SCREEN,
            foes: [],
            // ── THE DOORS ───────────────────────────────────────────────────────────────────────
            // One at each end of the zone. Luke: "Add portals to each side. Since one takes you back a
            // level and the other goes forward a level."
            //
            // ⚠️ WORLD OBJECTS, NOT BUTTONS ON THE HUD. A zone is 300 to 700 units wide and about 20 of
            // them are on screen, so a door at the far end is something you WALK to — which is the whole
            // reason it reads as a door rather than as a menu item. It also means the way on is in the
            // same place every time: the right-hand wall.
            doors: [
                ...(zone.n > 1 ? [{ side: "back", to: zone.n - 1, x: DOOR_INSET, node: null }] : []),
                ...(zone.n < ZONE_COUNT
                    ? [{ side: "on", to: zone.n + 1, x: zoneWidth(zone.n) - DOOR_INSET, node: null }]
                    : []),
            ],
            drops: [],
            tels: [],
            sparks: [],
            pops: [],
            killLog: [],
            killIndex: 0,
            target: null,
            moveTo: null,
            swingAt: null,
            swingFoe: null,
            swingDone: true,
            nextRespawn: 0,
            // The running tally down the left. Keyed by label so two drops of one kind share a row.
            haul: new Map(),
            eaten: {},
            foodLeft: Number(belt?.count) || 0,
            boss: null,
            bossClaimed: false,
            // One-shot: the settle that banks the clearing kills so groveBoss will accept the fight.
            clearFlushed: false,
            // The name beside the big health bar (a boss, or the rare spawn once you hit it), and the
            // banner across the middle. Both belong to the ZONE, so both are replaced when it is.
            barName: null,
            herald: null,
            // ── FEEL STATE ──────────────────────────────────────────────────────────────────────
            clock: makeClock(),
            shake: makeShaker(),
            hp: stats?.maxHp || 100,
            hpBar: makeChase(1),
            bossBar: null,
            bossChase: makeChase(1),
            combo: 0,
            comboUntil: 0,
            comboShown: -1,
            hurtAt: -1e9,
        };
    // ⚠️ heroArt / petArt are read once on purpose: they are the sprites for this session, and rebuilding
    // the whole world because an image URL arrived late would reset the zone under the player.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [zone.n, seed, stats?.moveSpeed, stats?.maxHp]);

    useEffect(() => { worldRef.current = world; }, [world]);

    // ── ⚠️ WHAT THE LAST ZONE LEFT BEHIND ───────────────────────────────────────────────────────────
    // Luke: "the grove had a bunch of stale carry over between maps, like boss state. Damage numbers etc."
    //
    // The scene does NOT unmount when you walk through a gate. `world` is a useMemo keyed on the zone, so
    // the simulation is replaced — but every useState in this component and every node the loop has put in
    // the fx layer by hand belongs to the component, and the component lives on. Three things came through
    // the door with the player:
    //
    //   · THE BOSS BAR AND ITS NAME. setBossName is cleared when a boss DIES (see killFoe) and nowhere
    //     else, so walking away from a live one and going on carried its name and a frozen bar into the
    //     next zone. Its hp lives on the world, so the bar could not even move: a dead-looking readout for
    //     a creature in a different forest.
    //   · THE DAMAGE NUMBERS. Pops and sparks are real DOM nodes appended to the fx layer, retired by the
    //     loop when it walks w.pops — and w.pops is replaced with [] by the new world, so anything in
    //     flight at the moment of the swap is orphaned and stays on screen for ever. The comment on
    //     procCall already claimed these were "cleaned up with everything else"; nothing was doing it.
    //   · THE BANNER. The herald clears on a timer, so it survived a fast exit and announced the last
    //     zone's news in the new one. It lives on the world now, with the timer checking the world is
    //     still the one it was fired for.
    //
    // ⚠️ KEYED ON THE SEED AS WELL AS THE ZONE. Re-entering the SAME zone from the map is a new session
    // with a new seed and the same zone.n, and that is just as much a fresh start as a different place.
    //
    // (Every setState here is to null or false, so this cannot cascade: on a zone where nothing was left
    // behind, each one is a no-op React drops.)
    useEffect(() => {
        if (heraldTimer.current) { clearTimeout(heraldTimer.current); heraldTimer.current = null; }
        fxRef.current?.replaceChildren();
    }, [zone.n, seed]);

    // ── THE DOOR'S READOUT ──────────────────────────────────────────────────────────────────────────
    // The running total: what the server has banked for this zone across every session, plus what has died
    // since this one started. Luke: "Ensure the kill count persists, we don't want it to get reset if you
    // leave." Walking out at 19 of 20 and coming back needs one more kill, not twenty.
    //
    // ⚠️ DECLARED UNDER THE WORLD IT READS. A hook above the `world` useMemo that names `world` is the
    // temporal-dead-zone trap check:hook-deps exists to catch — and this one moved here from above it.
    // `gen` is a dependency because killIndex is a mutable field: the loop bumps gen on every kill, and
    // without it React has no reason to read the number again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const killsHere = useMemo(() => (Number(zone.kills) || 0) + (world.killIndex || 0), [zone.kills, world, gen]);

    // ── SPAWNING ────────────────────────────────────────────────────────────────────────────────────
    // Luke: "15 to 30 enemies, fully replenishing every 45 seconds."
    const spawn = useCallback((w, now) => {
        // ⚠️ ONE BODY PER CALL ONCE THE ZONE IS STANDING, THE WHOLE ZONE ON THE FIRST CALL. See GROVE_POP:
        // the 45 seconds is a refill RATE, and the burst reading of it left a cleared zone visibly empty for
        // most of every window. `w.want` is rolled once, by the caller, when the zone is built.
        if (!w.want) w.want = GROVE_POP.min + Math.floor(w.rand() * (GROVE_POP.max - GROVE_POP.min + 1));
        // ⚠️ GATED ON "HAS THIS ZONE EVER FILLED", NOT ON "ARE THERE ANY FOES LEFT". Keying off the standing
        // population reads an emptied zone as a fresh one and dumps the whole roster back in on one frame —
        // the burst, returned, and at the exact moment the player earned the quiet.
        const room = w.filled ? Math.min(w.want, w.foes.length + 1) : w.want;
        w.filled = true;
        while (w.foes.length < room) {
            const i = w.killIndex + w.foes.length;
            const isRare = rollRareSpawn(GROVE_RARE.spawnChance, seed, i, bonuses);
            const pickId = zone.enemies[Math.floor(w.rand() * zone.enemies.length)];
            // ⚠️ DEPTH, NOT `zone.n` — see groveDepth. A zone number restarts on every map, so scaling
            // against it would have made map 2 a second tutorial. `zone.map` is absent on map 1's zones and
            // groveDepth reads that as map 1, which is why this is the same number today and the right one
            // the day a second map lands. The rare climbs with everything else now.
            const depth = groveDepth(zone.map, zone.n);
            const base = isRare ? scaledRare(depth) : scaledFoe(pickId, depth);
            const id = isRare ? GROVE_RARE.id : pickId;
            const size = groveSize(id);
            // ⚠️ SPAWNED ALREADY STANDING ON A LEDGE, not dropped from above. Luke: "just like spawn them on
            // a platform". A zone that opens with thirty creatures falling out of the canopy is the
            // floating-in problem again, dressed up as physics. Weighted by platform width, so the forest
            // floor gets its share and a 26-unit ledge is not as crowded as the whole zone.
            const spot = spawnOnPlatform(w.platforms, w.rand, { minX: 14, maxX: W - 14, inset: 2.5 });
            w.foes.push({
                ...makeBody({ x: spot.x, y: spot.y, h: size.h, halfW: size.h * 0.32, speed: 0.55 }),
                uid: `f${i}-${Math.floor(w.rand() * 1e6)}`,
                id,
                rare: isRare,
                art: base.art,
                foot: size.foot,
                name: base.name,
                hp: base.hp, maxHp: base.hp,
                dmg: base.dmg, telegraph: base.telegraph, passive: base.passive,
                face: w.rand() < 0.5 ? -1 : 1,
                phase: w.rand(),
                born: now, landedAt: now, flash: 0, node: null,
            });
        }
        // ── THE BOSS, AT THE END OF THE ZONE ────────────────────────────────────────────────────────
        // Luke: "Each zone would end with a boss." So it stands at the far end and you have to walk to it,
        // rather than it wandering into the first screen with the rootrats.
        //
        // ⚠️ NOT IN THE RESPAWN POPULATION. It is spawned once, it never refills, and it is NOT counted
        // toward `want` above — otherwise the thirty-body cap would quietly despawn it, or respawn it the
        // instant it died, which is the thirty-minute cooldown walked around on the client.
        const bd = groveBoss(zone.boss);
        // ── ⚠️ READINESS IS LIVE, NOT WHAT THE SERVER SAID ON THE WAY IN ───────────────────────
        // `zone.bossReady` is computed once, server-side, at zone open. So a player who walked in on
        // nineteen kills and then earned the twentieth got nothing: the door opened (that check has
        // always used a live count) and the boss stayed absent until they left and came back. The
        // zone's climax was gated on a page navigation.
        //
        // Same arithmetic the server does, against the count that is actually running. The cooldown
        // still comes from the server, because a timer the client computes is a timer the client can
        // argue with — and `bossClaimed` still stops him standing back up inside one session.
        const liveKills = (Number(zone.kills) || 0) + w.killIndex;
        const bossReadyNow = liveKills >= zone.toUnlock && (Number(zone.bossWaitMs) || 0) <= 0;
        if (bd && bossReadyNow && !w.boss && !w.bossClaimed) {
            const bsz = groveSize(bd.id, { boss: true });
            // ── ⚠️ CLEAR OF THE GATE, AND THIS IS WHY YOU "HAD TO" BEAT IT ─────────────────────────
            // Luke: "you have to beat the boss to move on." You did, and nothing in the rules said so —
            // the server opens the next zone on a KILL COUNT and the boss has never been a gate (see the
            // note on toUnlock in grove-catalog.js). It was geometry.
            //
            // The boss stood at W - 20. The gate stands at W - DOOR_INSET and its button is twelve units
            // wide and centred (.gv-door in grove-css.js), so it spans W-15 to W-3. A creature's button is
            // a SQUARE the height of its sprite — and a boss is 14 to 22 units tall, so its box reached
            // from W-31 to W-9 and lay across the left half of the doorway. Both are positioned siblings
            // with no z-index and the foes are rendered after the doors, so the boss's transparent corner
            // won every tap aimed at the gate. The way on was unpressable until the thing standing on it
            // was dead, which is indistinguishable from a rule.
            //
            // So it stands its own half-width plus the door's clear of the gate. It is still the last
            // thing in the zone and still blocks the APPROACH — it just no longer sits on the handle.
            const clearOfGate = DOOR_INSET + DOOR_HALF + bsz.h * 0.5 + 3;
            const spot = { x: Math.max(W * 0.5, W - clearOfGate), y: 0 };
            w.boss = {
                ...makeBody({ x: spot.x, y: spot.y, h: bsz.h, halfW: bsz.h * 0.3, speed: 0.42 }),
                uid: `boss-${bd.id}`, id: bd.id, name: bd.name, art: bd.art, foot: bsz.foot,
                isBoss: true, big: true,
                hp: bd.hp, maxHp: bd.hp, dmg: bd.dmg, attacks: bd.attacks, passive: true,
                face: -1, phase: 0, born: now, landedAt: now, flash: 0, atk: 0, node: null,
                nextAttack: now + 1500,
            };
            w.foes.push(w.boss);
        }

        w.nextRespawn = now + spawnGapMs();
        rerender();
    }, [zone, seed, bonuses, W, rerender]);

    // ── ⚠️ THE HERO AND THE PET HAVE THEIR FEET MEASURED, BECAUSE NOTHING CAN AUTHOR THEM ───────────
    // Every creature carries a `foot` from GROVE_SIZE — the transparent air under its body, measured
    // offline — and without it the drawing hovers inside a correctly placed box. The hero and the pet are
    // the member's own equipped sprites, so there is no table that could hold a number for a picture
    // nobody has seen; they were running at foot 0 and were the two bodies on screen most of the time.
    //
    // ⚠️ WRITTEN ONTO THE BODY, NOT INTO STATE. The loop reads b.foot every frame; a state round trip
    // would re-render the whole zone to deliver one constant. Cancelled on unmount so a slow decode cannot
    // write into a world that has been replaced.
    useEffect(() => {
        let live = true;
        const w = worldRef.current;
        if (!w) return undefined;
        footOf(heroArt).then((v) => { if (live && w.hero) w.hero.foot = v; });
        footOf(petArt).then((v) => { if (live && w.pet) w.pet.foot = v; });
        return () => { live = false; };
    }, [heroArt, petArt, world]);

    // ── ⚠️ ONE COPY OF SCREEN-TO-WORLD, BECAUSE THE LOOP NOW ASKS THE SAME QUESTION ────────────────
    // A held finger is re-resolved every frame (see the hold block in the loop), so this conversion has two
    // callers. Written out twice it is two ideas of where a tap landed, which is the bug the scale note
    // below already records once.
    const worldAt = useCallback((clientX, clientY) => {
        const w = worldRef.current;
        const host = hostRef.current;
        if (!w || !host) return null;
        const rect = host.getBoundingClientRect();
        // ── ⚠️ THE SAME SCALE THE LOOP IS DRAWING AT, WHICH THIS WAS NEVER USING ────────────
        // This read rect.width / UNITS_PER_SCREEN — a SECOND, independent idea of how big a world unit is,
        // which never agreed with the one on screen: a tap at the right-hand edge asked the hero to walk
        // about half as far as the spot that was tapped, and he stopped short of it with no indication why.
        // A scale must be PUBLISHED, never recomputed.
        const unit = w.unitPx || rect.width / UNITS_PER_SCREEN;
        const ground = w.groundPx || rect.height * 0.13;
        const x = camRef.current + (clientX - rect.left) / unit;
        // ── ⚠️ AND THE TAP HAS A HEIGHT NOW ────────────────────────────────────────────────
        // It only ever read clientX, so every tap meant "walk along the floor" and there was no way to ask
        // to go UP. The zones have had three tiers of ledges since the first version and no input that
        // could reach them. Snapped to the surface under the point, so tapping the air over a ledge means
        // that ledge rather than a spot in mid-air the hero can never stand on.
        const yRaw = camYRef.current + (rect.height - (clientY - rect.top) - ground) / unit;
        const surf = w.platforms.reduce((best, p) => {
            if (x < p.x || x > p.x + p.w) return best;
            if (p.y > yRaw + 6) return best;
            return !best || p.y > best.y ? p : best;
        }, null);
        return { x: Math.max(2, Math.min(W - 2, x)), y: surf ? surf.y : 0 };
    }, [W]);

    // ── ⚠️ A HELD FINGER IS A SCREEN POSITION, NOT A WORLD ONE ─────────────────────────────────────
    // Luke: "If i hold down my finger it should continue to pursue where im clicking."
    //
    // A tap resolved to a WORLD point once and the hero walked to it and stopped — which is right for a tap
    // and wrong for a hold, because the thing the player is pointing at is a place on the GLASS. Hold near
    // the right edge and the camera follows him, so the world point under that finger slides right with it;
    // resolving it once freezes it at wherever the camera happened to be on the first frame, and he stops
    // dead in the middle of the screen with a finger still pressed on the edge of it.
    //
    // So the hold stores client coordinates and the loop re-resolves them against the camera as it is NOW.
    // Hold still and he keeps walking; drag and he turns to follow; let go and he finishes the walk to the
    // last place you pointed, which is the tap behaviour unchanged.
    const holdRef = useRef(null);

    // ── THE LOOP ────────────────────────────────────────────────────────────────────────────────────
    useEffect(() => {
        const host = hostRef.current;
        const w = worldRef.current;
        if (!host || !w) return undefined;

        let raf = 0;
        // ── ⚠️ THE SCENE RUNS ON ITS OWN CLOCK, WHICH STOPS WHEN THE SCENE DOES ─────────────────
        // Nearly every deadline in here is an ABSOLUTE timestamp — when the next wave respawns, when a
        // creature may attack again, when a flash ends, when the combo window closes, when the next settle
        // is due. Freezing the loop does not freeze performance.now(), so coming back from thirty seconds
        // in the workbench with the raw clock would fire every one of those on the same frame: a full
        // respawn, every wind-up resolving at once, every timer expired. Clamping dt does not help, because
        // the fault is in the deadlines, not in the step.
        //
        // So the whole scene reads sceneNow() instead, which is real time minus every millisecond spent
        // paused. Nothing else has to know: a deadline set before the pause and a comparison made after it
        // are both in the same clock, so they simply resume.
        w.pauseMs = 0;
        w.pauseAt = 0;
        const sceneNow = () => performance.now() - (w.pauseMs || 0);
        w.sceneNow = sceneNow;
        let last = sceneNow();
        let lastSettle = sceneNow();
        spawn(w, last);
        // ⚠️ THE LAB'S SCENES ARE SET UP HERE, NOT IN THE LAB. The lab can only hand over props; what makes
        // a fight happen in the first second of film is the hero standing NEXT TO something, which is a fact
        // about the world. labScene was already being passed and this component ignored it entirely, so
        // every scene in the lab was the wander scene and nothing about a fight could be filmed.
        if (labScene) {
            // ── ⚠️ THE LAB GETS A HANDLE ON THE LIVE WORLD ─────────────────────────────────────
            // Not scaffolding in the UI sense (see no-temp-ui-scaffolding) — nothing is drawn, and it only
            // exists on a route that 404s outside development. It is there because a contact sheet can tell
            // you THAT something is wrong and never what: "the sprites are missing" and "every body in the
            // zone is at y = -344 because it is falling through the floor" photograph identically, and the
            // second one is the answer.
            window.__grove = w;
            if (labScene !== "wander") {
                const named = setUpLabScene(w, labScene);
                if (named) w.barName = named;
                // ⚠️ AND THE CAMERA GOES WITH HIM, OR THE SCENE FILMS ITS OWN PAN. camRef eases toward the
                // hero at about 5.5% a frame from wherever it was, and a lab scene teleports him — so
                // "door" and "unlock" put him at the far wall and then spent two and a half seconds
                // travelling there. The world was right the whole time: the probe showed the hero at 287
                // and the gate at 291 while the DOM had it 2,285px off the right of frame, and the unlock
                // happened out of shot. Nothing in real play teleports, which is why this never bit the
                // game — only the bench that exists to look at it.
                // ⚠️ FLAGGED, NOT SNAPPED HERE. visibleUnits is still the 100-unit placeholder until the
                // first camera pass measures the element, so snapping now lands eighty units short and the
                // pan is merely shorter. The loop does it on frame one, when the number is real.
                w.snapCam = true;
            }
        }

        const place = (b, cam, camY, unit, extraDx = 0) => {
            if (!b.node) return;
            // ⚠️ POSITION ONLY. The facing flip and every squash go on the inner node — see the header.
            b.node.style.transform =
                `translate3d(${(b.x + extraDx - cam) * unit}px, ${-(b.y - camY) * unit}px, 0)`;
        };

        // The visible sprite: facing, breath, landing squash, swing pose, and the measured foot nudge.
        const pose = (b, nowMs, unit, { sx = 1, sy = 1, dy = 0, moving = false } = {}) => {
            if (b.art0) {
                const br = breathe(b.phase, nowMs, moving);
                const sq = landSquash(nowMs - (b.landedAt || 0), 1);
                const fx = br.sx * sq.sx * sx;
                const fy = br.sy * sq.sy * sy;
                // ⚠️ THE FOOT NUDGE. Every one of these sprites carries a few percent of transparent air
                // under the creature, and it differs per sprite because they were drawn by different passes
                // — measured by scripts/grove-sprite-bounds.mjs, never guessed. Without it the drawing
                // hovers over the floor its own body is standing on, which is most of what "the sprites
                // look pasted on" actually was. The working theory before measuring was object-fit
                // centring a landscape sprite in a square box; the sprites are square and that would have
                // fixed nothing.
                // ⚠️ dy IS IN WORLD UNITS AND EVERYTHING ELSE HERE IS A PERCENTAGE OF THE BODY. The
                // pounce leaves the ground, and the only body that passes a dy is the pet; converting
                // through the body's own height keeps it the same leap at every zoom level, which a
                // percentage typed in by eye would not be. See [[view-space-constants-break-on-zoom]].
                const down = (b.foot || 0) * 100 - (dy / (b.h || 1)) * 100;
                b.art0.style.transform = `translateY(${down}%) scale(${fx}, ${fy}) scaleX(${b.face || 1})`;
            }
            if (b.flashNode) b.flashNode.style.opacity = String(b.flash || 0);
            // ⚠️ THE SHADOW STAYS ON THE FLOOR WHILE THE BODY LEAVES IT. It is the only thing on screen
            // that says how high up a body is, so it is drawn at the SURFACE under the body rather than at
            // the body — a shadow that rides up with a jump is worse than none, because it actively says
            // the creature never left the ground.
            if (b.shadowNode) {
                const floorY = b.floorY == null ? 0 : b.floorY;
                const air = Math.max(0, b.y - floorY);
                const sh = shadowFor(air, b.h);
                b.shadowNode.style.transform = `translateY(${(air * unit).toFixed(1)}px) scale(${sh.scale})`;
                b.shadowNode.style.opacity = String(sh.opacity);
            }
        };

        // ── ⚠️ THE CREATURE'S OWN HEALTH BAR, AND WHEN IT IS ALLOWED TO EXIST ───────────────────────
        // Luke: "Enemies should have hp bars."
        //
        // A bar over all thirty wanderers at once is a row of interface laid across a painted forest, so
        // the rule is: the one you are FIGHTING always, anything that has been HIT for a couple of seconds
        // after, and nothing else. Which is also what makes it cheap — a chase bar is only stepped for the
        // two or three that are actually showing one, not for the whole population.
        const drawFoeBar = (f, now) => {
            const bar = f.barNode;
            if (!bar) return;
            const want = (f === w.target && f.hp > 0 && !f.dying)
                || (f.hurtAt && now - f.hurtAt < FOE_BAR_LINGER_MS);
            if (!want) {
                if (f.barOn) { f.barOn = false; bar.classList.remove("is-on"); }
                return;
            }
            if (!f.barOn) { f.barOn = true; bar.classList.add("is-on"); }
            if (!f.chase) f.chase = makeChase(1);
            const frac = Math.max(0, f.hp) / Math.max(1, f.maxHp);
            stepChase(f.chase, now, frac);
            // ⚠️ THE COLOUR IS OFF THE REAL FRACTION, NOT THE CHASE BAR. The chase lags by design, so a
            // creature taken to a sliver would spend that moment still painted green — which is the one
            // moment the colour exists to report.
            const c = barColor(frac);
            const jolt = barHit(f.hurtAt ? now - f.hurtAt : null);
            if (f.barFill) {
                f.barFill.style.width = `${f.chase.shown * 100}%`;
                f.barFill.style.setProperty("--gv-bar1", c.from);
                f.barFill.style.setProperty("--gv-bar2", c.to);
            }
            if (f.barGhost) f.barGhost.style.width = `${f.chase.ghost * 100}%`;
            bar.style.setProperty("--gv-bf", jolt.flash.toFixed(3));
            bar.style.setProperty("--gv-bs", jolt.swell.toFixed(3));
            bar.style.setProperty("--gv-bj", `${jolt.jolt.toFixed(2)}px`);
        };

        // ── THE HERO'S OWN BAR ──────────────────────────────────────────────────────────────────────
        // Luke: "I cant see my hp, was hoping to see that above my char."
        //
        // ⚠️ THE RULE IS THE OPPOSITE OF THE CREATURES'. A foe shows a bar only while it is the target or
        // was hit in the last couple of seconds, because thirty permanent bars is a row of interface laid
        // across a painted forest. There is only ever ONE hero, and the whole point of the number is to be
        // glanceable before you are in trouble rather than after -- so his is always on.
        //
        // It is the same strip, chase and colour the creatures use, read from the same helpers, so a big
        // hit takes the same visible bite out of his bar as it does out of theirs. Two bars built from two
        // sets of rules would drift the first time either was tuned.
        const drawHeroBar = (now) => {
            const b = w.hero;
            const bar = b.barNode;
            if (!bar) return;
            if (!b.barOn) { b.barOn = true; bar.classList.add("is-on"); }
            if (!b.chase) b.chase = makeChase(1);
            const frac = Math.max(0, w.hp) / Math.max(1, maxHp);
            stepChase(b.chase, now, frac);
            const c = barColor(frac);
            const jolt = barHit(w.hurtAt ? now - w.hurtAt : null);
            if (b.barFill) {
                b.barFill.style.width = `${b.chase.shown * 100}%`;
                b.barFill.style.setProperty("--gv-bar1", c.from);
                b.barFill.style.setProperty("--gv-bar2", c.to);
            }
            if (b.barGhost) b.barGhost.style.width = `${b.chase.ghost * 100}%`;
            bar.style.setProperty("--gv-bf", jolt.flash.toFixed(3));
            bar.style.setProperty("--gv-bs", jolt.swell.toFixed(3));
            bar.style.setProperty("--gv-bj", `${jolt.jolt.toFixed(2)}px`);
        };

        // ── POPS AND PARTICLES ARE BUILT BY HAND, NOT BY REACT ──────────────────────────────────────
        // ⚠️ AND THAT IS THE EXCEPTION TO THE RULE AT THE TOP OF THIS FILE, ON PURPOSE. A damage number, a
        // spark and a dust mote are born and dead inside half a second, several per swing — rendering them
        // through state would re-render the entire zone a few times a second to draw things that never need
        // reconciling, because nothing ever updates one: it is created, it moves, it is removed.
        const addPop = (kind, text, x, y, weight = null, art = null) => {
            const layer = fxRef.current;
            if (!layer) return;
            const p = makePop(kind, x, y, w.rand);
            p.born = w.sceneNow ? w.sceneNow() : performance.now();
            // How large this number ends up, before the arrival punch is multiplied on top of it by the
            // loop. One for everything that is not a hit — a pickup label has no magnitude to report.
            p.weight = weight?.scale || 1;
            // ⚠️ A FIXED TILT PER NUMBER, ROLLED ONCE. Thrown dead straight, four numbers off four fast
            // hits stack into a column that reads as one object; a couple of degrees either way and the
            // same four read as four separate impacts. Rolled here because a tilt recomputed per frame is
            // a vibration, which is a different and much worse effect.
            p.tilt = (w.rand() * 2 - 1) * (kind === "crit" ? 9 : 5);
            const el = document.createElement("span");
            el.className = `gv-num is-${kind}${weight?.big && kind !== "crit" ? " is-big" : ""}`;
            if (art) {
                // Built by hand rather than with innerHTML: a part name is authored data today, but a
                // label is exactly the kind of string that later arrives from somewhere else.
                const img = document.createElement("img");
                img.src = art;
                img.alt = "";
                el.appendChild(img);
                el.appendChild(document.createTextNode(text));
            } else {
                el.textContent = text;
            }
            layer.appendChild(el);
            p.node = el;
            w.pops.push(p);
        };
        // ⚠️ The scale option IS A REAL ARGUMENT, NOT A HINT. A boss hitting the floor has to throw more dirt
        // than a rat does, and an option this function quietly ignored would have been a dead
        // parameter at the only call site that passes it. It moves the COUNT and the SPEED; the
        // particle size is set in CSS and stays put.
        const burst = (x, y, { crit = false, dir = 0, kind = "spark", scale = 1 } = {}) => {
            const layer = fxRef.current;
            if (!layer) return;
            const dust = kind === "dust";
            const base = dust ? DUST.n : crit ? SPARK.nCrit : SPARK.n;
            const n = Math.max(1, Math.round(base * scale));
            for (let i = 0; i < n; i += 1) {
                const s = makeSpark(i, n, x, y, {
                    speed: (dust ? DUST.speed : crit ? SPARK.speedCrit : SPARK.speed) * scale,
                    life: dust ? DUST.life : crit ? SPARK.lifeCrit : SPARK.life,
                    dir, rand: w.rand,
                });
                s.born = w.sceneNow ? w.sceneNow() : performance.now();
                s.g = dust ? DUST.gravity : SPARK.gravity;
                const el = document.createElement("i");
                el.className = `gv-spark is-${kind}${crit ? " is-crit" : ""}`;
                layer.appendChild(el);
                s.node = el;
                w.sparks.push(s);
            }
        };
        // ── ⚠️ A PROC IS AN EVENT, AND IT WAS WEARING A DAMAGE NUMBER'S CLOTHES ──────────────────
        // Luke: "if something procs like haste it should be dopamine inducing."
        //
        // HASTE fired addPop("hit", "HASTE") -- the word rendered in the same cream as every ordinary hit,
        // at the same size, drifting up alongside four actual damage numbers. The one moment the player's
        // own gear did something arrived indistinguishable from the thing it was happening next to.
        //
        // This is its own object: it rides at the hero rather than at the target, it punches in wide and
        // snaps, it carries a ring out from him, and it has its own colour per proc so two different
        // procs are two different events rather than two words.
        const procCall = (text, kind = "haste") => {
            const layer = fxRef.current;
            if (!layer) return;
            const el = document.createElement("b");
            el.className = `gv-proc is-${kind}`;
            el.textContent = text;
            layer.appendChild(el);
            // Positioned by the same pop pipeline so it rides the camera and is cleaned up with everything
            // else -- a hand-placed node here would be left behind by a zone swap.
            const pr = makePop("proc", w.hero.x, w.hero.y + w.hero.h * 0.9, w.rand);
            pr.born = w.sceneNow ? w.sceneNow() : performance.now();
            pr.weight = 1;
            pr.tilt = 0;
            pr.node = el;
            w.pops.push(pr);
            // The ring is what makes it read as coming OUT of the hero rather than appearing above him.
            shockwave(w.hero.x, w.hero.y + w.hero.h * 0.45, kind);
            w.shake.add(TRAUMA.hit * 0.8);
        };

        const shockwave = (x, y, kind) => {
            const layer = fxRef.current;
            if (!layer) return;
            const el = document.createElement("i");
            el.className = `gv-boom is-${kind}`;
            layer.appendChild(el);
            w.sparks.push({ x, y, vx: 0, vy: 0, g: 0, born: w.sceneNow ? w.sceneNow() : performance.now(), life: 380, node: el, ring: true });
        };

        // ── ⚠️ ONE FUNCTION PAYS A KILL, AND BOTH CALLERS GO THROUGH IT ───────────────────────────
        // Two paths for one payout always drift — see atomic-split-into-steps-drops-lines, which this repo
        // has now paid for twice.
        const killFoe = (wd, foe, now) => {
            const crit = foe.lastCrit;
            wd.clock.stop(now, HITSTOP_MS.kill);
            wd.shake.add(foe.isBoss ? TRAUMA.boss : TRAUMA.kill);
            // The death pop: launched away from the blow, spinning, fading. ⚠️ IT IS A REAL IMPULSE
            // through the solver rather than a CSS animation, so a creature killed on a ledge falls off it.
            // ⚠️ LAUNCHED BY WEIGHT, AND THE DIRECTION IS REMEMBERED. A rat is thrown; a boss barely
            // moves. `deathDir` is what the topple rotates away from, so the fall points back at the blow
            // instead of picking a fixed side.
            const dk = deathKit(foe);
            foe.deathKit = dk;
            foe.deathDir = foe.face || 1;
            impulse(foe, foe.deathDir * -dk.launch, dk.up);
            foe.dying = now;
            foe.flash = 1;
            burst(foe.x, foe.y + foe.h * 0.45, { crit: true, dir: -(foe.face || 1), kind: "spark" });
            burst(foe.x, foe.y, { kind: "dust" });

            if (foe.big || foe.rare) { wd.bossBar = null; wd.barName = null; }

            // ── ⚠️ A BOSS IS NOT ADDED TO THE KILL LOG ────────────────────────────────────────────
            // It has its own request (action: "boss") because it has its own authority: the server checks the
            // zone was cleared and that the thirty-minute cooldown elapsed. Put it in the batch and those two
            // checks would be bypassed by a settle that claims it two hundred times.
            //
            // bossClaimed also stops the respawn pass from standing it back up the moment it falls.
            if (foe.isBoss) {
                wd.bossClaimed = true;
                wd.boss = null;
                wd.target = null;
                playKill(11);
                // ── ⚠️ THE BOSS IS WHAT OPENS THE WAY, SO THE BEAT BELONGS HERE ───────────────
                // It used to fire on the kill that crossed toUnlock, back when that was what moved
                // unlocked_n. Now the door opens on this kill, and the biggest beat in the zone
                // lands on the biggest thing in it.
                //
                // The door gets its own burst and shockwave because that is WHERE it opened; the
                // herald says WHAT happened, in the middle of the screen, because the boss may have
                // died nowhere near the door. The word is the PLACE it opened — a name you can now
                // walk to is the reward. "Onward" is only for zone twelve, where there is nowhere
                // further to name.
                const open = wd.doors.find((d) => d.side === "on");
                if (open && !open.openedAt) {
                    open.openedAt = now;
                    const y = 6;
                    burst(open.x, y, { crit: true });
                    burst(open.x, y, { kind: "dust" });
                    shockwave(open.x, y, "kill");
                    wd.shake.add(TRAUMA.boss);
                    celebrateUnlock();
                    const nextZone = GROVE_ZONES.find((z) => z.n === zone.n + 1);
                    fireHerald("The way is open", nextZone?.name || "Onward", "way");
                }
                onBoss?.();
                return;
            }

            // ── ⚠️ STEP TO THE NEXT ONE, IF THERE IS ONE WITHIN ARM'S REACH ────────────────────────
            // Luke's rule is "auto attack until you tap away or the enemy perishes", and taken literally the
            // hero stops dead after every single kill — which in a zone holding fifteen to thirty creatures
            // is a tap per rat, for ever. That is not a control scheme, it is a chore, and it is the single
            // thing most likely to make a grind loop feel bad.
            //
            // ⚠️ BUT ONLY WHAT IS ALREADY NEXT TO HIM, AND NEVER SOMETHING THAT IS IGNORING HIM. Picking
            // the nearest enemy anywhere would turn the hero into an autoplayer that walks the zone killing
            // things by itself, and picking a PASSIVE creature would break the other rule Luke set — early
            // enemies ignore you entirely, which has to mean you can walk past them. So: a creature that is
            // already angry, or is already in the swing you are standing in, and nothing else. Walk into a
            // crowd and you keep swinging; kill the last one near you and you stop.
            const nextUp = wd.foes.find((f) => f !== foe && f.hp > 0 && !f.dying
                && Math.abs(f.x - wd.hero.x) <= reachTo(f) + 3
                && Math.abs(f.y - wd.hero.y) <= SWING_V_REACH
                && (f.hit || !f.passive));
            wd.target = nextUp || null;

            const i = wd.killIndex;
            wd.killIndex += 1;
            wd.killLog.push({ id: foe.id, i });
            // The counter is drawn from wd.killIndex, which the line above has just moved; this is what
            // tells React to look at it again. It is the same re-render the foe list needs anyway.
            rerender();

            // ── THE STREAK ──────────────────────────────────────────────────────────────────────
            // ⚠️ PRESENTATION ONLY. It pays nothing — see COMBO_WINDOW_MS in grove-juice.js for why a kill
            // loop with no daily cap must never have a reward multiplier bolted to how fast you clear it.
            // ── ⚠️ THE KILL THAT OPENS THE WAY IS THE BIGGEST BEAT IN THE ZONE, AND IT WAS SILENT ──
            // Crossing toUnlock is the whole reason the grind has a shape, and until now it did nothing on
            // screen: the locked sprite was simply a different sprite on the next render, with no sound, no
            // shake and nothing to look at. The map already celebrates it — but that happens on a DIFFERENT
            // SCREEN, minutes later, after a settle. The moment belongs where it is earned, on the door, on
            // the kill that earns it.
            //
            // Fired from here rather than from an effect because burst, shockwave and the shaker all live in
            // this closure, and because this is the one place that knows a kill just happened.
            // ── ⚠️ CROSSING toUnlock EARNS THE BOSS, NOT THE DOOR ────────────────────────────
            // This used to burst the door, shake the screen and herald "The way is open" right here,
            // which was a lie the moment the boss became a real gate: the door stays shut until the
            // thing at the end of the zone is dead. The beat moved to the boss kill below, where it
            // is actually earned. The boss appearing has its own beat already — the spawn pass fires
            // "The zone stirs" and playBossNotice the instant bossReadyNow goes true.
            //
            // ⚠️ BUT THE FLUSH STAYS, AND IT IS LOAD-BEARING. groveBoss refuses the kill unless the
            // DATABASE says kills >= toUnlock, so the kills claimed since the last settle have to be
            // banked before the boss can be fought at all — otherwise the player clears the zone,
            // walks into the boss, and the server answers "Clear the zone first" for up to a respawn
            // window. Fire and forget: the kills are spliced out of the log by the call, so a failure
            // cannot double-claim them and the next settle carries on.
            const way = wd.doors.find((d) => d.side === "on");
            if (way && !wd.clearFlushed && (Number(zone.kills) || 0) + wd.killIndex >= zone.toUnlock) {
                wd.clearFlushed = true;
                if (wd.killLog.length) {
                    const ate = wd.eaten; wd.eaten = {};
                    Promise.resolve(onSettle?.(wd.killLog.splice(0), ate)).catch(() => {});
                }
            }

            wd.combo = now < wd.comboUntil ? wd.combo + 1 : 1;
            wd.comboUntil = now + COMBO_WINDOW_MS;
            playKill(Math.min(COMBO_PITCH_STEPS, wd.combo));

            // The client rolls the SAME answer the server will, so the loot can spill immediately.
            // ⚠️ zone.n AND GROVE_HYPER ARE PASSED ON BOTH SIDES OR NEITHER. The server replays this exact
            // call to verify the settle (see settleKills), so an argument present here and absent there is
            // a client that celebrates a Power Scroll the settle then declines to hand over.
            const got = rollKill(foe.rare ? GROVE_RARE : GROVE_ENEMIES[foe.id], seed, i, bonuses,
                zone.n, GROVE_HYPER);
            // ⚠️ LAB ONLY, AND ONCE. An emblem is roughly one kill in four hundred, so the rarest moment in
            // the Grove could otherwise only be reviewed by killing four hundred things and hoping — which
            // is the same reason the boss and the climb have scenes. Guarded by labScene, which is null in
            // every build but development.
            if (labScene === "emblem" && !wd.emblemForced) {
                wd.emblemForced = true;
                got.emblem = GROVE_ENEMIES[foe.id]?.emblem || "em_grub";
            }
            const rows = Object.entries(got.parts);
            const total = rows.length + (got.emblem ? 1 : 0);
            let n = 0;
            const spill = (uid, part, label, opts = {}) => {
                const v = spillVelocity(n, total, wd.rand);
                n += 1;
                wd.drops.push({
                    ...makeBody({ x: foe.x, y: foe.y + foe.h * 0.4, h: 2.4, halfW: 1.2 }),
                    uid, part, label, art: groveArt(part), state: "spill", restAt: 0, born: now, node: null,
                    // ⚠️ BORN IN THE AIR, BECAUSE makeBody BORNS THINGS GROUNDED. The spill stage ends
                    // when the piece touches down, and a drop that starts life claiming to be grounded ends
                    // its spill on frame one: it still flew, but it skipped the bounce, started its rest
                    // timer at the corpse, and was therefore eligible to be sucked into the hero while it
                    // was still in mid-air. Luke asked for an explosion of loot that HANGS ON THE GROUND
                    // long enough to read; that is the stage this was quietly skipping.
                    grounded: false,
                    vx: v.vx, vy: v.vy, ...opts,
                });
            };
            for (const [part, count] of rows) {
                const meta = grovePart(part);
                // ⚠️ WHAT MADE IT SPECIAL RIDES THE DROP. A twelve-fold windfall that lands looking like a
                // single root is a windfall nobody noticed, and the whole point of the tail is that the
                // player SEES the roll land. Two different kinds of special, dressed differently: a big
                // pile is LOUD (band), one uncommon part is VALUABLE (rare).
                const isRareRow = got.rare === part;
                spill(`d${i}-${part}`, part, `${count}x ${meta?.name || part.replace(/_/g, " ")}`,
                    { tier: meta?.tier || 1, rare: Boolean(meta?.rare) || isRareRow,
                      band: isRareRow ? null : got.band, rareRow: isRareRow,
                      // ⚠️ THE TALLY KEYS ON THESE, NOT ON `label`. See HAUL_MS.
                      name: meta?.name || part.replace(/_/g, " "), qty: count });
            }
            // ── ⚠️ A HYPER OFF AN ORDINARY KILL IS THE RAREST THING IN THE FEATURE ──────────────────
            // About one kill in two thousand. It gets the emblem's treatment -- the world stops, a ring
            // goes out, the screen takes a boss-weight knock -- because a drop this rare arriving with the
            // same four pixels as a root is a rarity the player cannot feel. See [[no-pity-progress-bars]]
            // for the opposite failure; this is the one place loudness is earned.
            if (got.hyper) {
                wd.clock.stop(now, EMBLEM_STOP_MS);
                wd.shake.add(TRAUMA.boss);
                shockwave(foe.x, foe.y + foe.h * 0.4, "crit");
                burst(foe.x, foe.y + foe.h * 0.4, { crit: true });
                playEmblemDrop();
                procCall(String(got.hyper.name || "A RARE FIND").toUpperCase(), "hyper");
            }
            // ── ⚠️ AN EMBLEM IS ABOUT ONE KILL IN FOUR HUNDRED AND IT LANDED LIKE A TWIG ───────────
            // Luke: "Emblems are rare." The drop itself knew that — gold glow, a sheen, its own silhouette —
            // but the MOMENT did not: same kill sound, same spill arc, no pause, nothing on the screen to
            // say that the thing which just happened almost never happens. Rarity the player cannot feel is
            // a number in a table.
            //
            // So the world stops for a beat, the corpse throws a gold ring and a crit burst, the screen
            // takes a boss-weight knock, and the emblem is thrown HIGHER than ordinary loot so it hangs at
            // the top of its arc while all that resolves. The hit-stop is what sells it: 190ms of everything
            // else holding still is the difference between a drop and an event.
            if (got.emblem) {
                const em = groveEmblem(got.emblem);
                wd.clock.stop(now, EMBLEM_STOP_MS);
                wd.shake.add(TRAUMA.boss);
                shockwave(foe.x, foe.y + foe.h * 0.4, "crit");
                burst(foe.x, foe.y + foe.h * 0.4, { crit: true });
                playEmblemDrop();
                addPop("loot", em?.name || "Emblem", foe.x, foe.y + foe.h + 4);
                spill(`e${i}`, got.emblem, em?.name || "Emblem", // name/qty default below
                    { emblem: true, tier: 6, rare: true, vy: EMBLEM_THROW, vx: 0 });
            }
            rerender();
        };

        const step = (raw) => {
            // ── ⚠️ FROZEN WHILE A PANEL IS OPEN, AND THE PAUSED TIME IS BANKED ──────────────────
            // The frame does nothing while a sheet is up, and every millisecond it skips is added to
            // w.pauseMs so that sceneNow() simply does not advance. That is what lets a thirty-second
            // visit to the workbench resume into the fight it left rather than into a full respawn with
            // every wind-up firing at once — see the clock note above.
            //
            // The rAF keeps running rather than being cancelled, because stopping it means restarting it,
            // and the only place to restart it from is the effect whose cleanup banks the kill log.
            if (pausedRef.current) {
                if (!w.pauseAt) w.pauseAt = raw;
                raf = requestAnimationFrame(step);
                return;
            }
            if (w.pauseAt) { w.pauseMs += raw - w.pauseAt; w.pauseAt = 0; }
            const now = raw - (w.pauseMs || 0);

            // ⚠️ REAL MILLISECONDS AND SIMULATION dt ARE DIFFERENT CLOCKS, AND MIXING THEM DEADLOCKS.
            // Hit-stop scales dt toward zero; anything measured in simulation frames would itself be frozen
            // by the hit-stop and never end. So: dt drives the world, realMs drives every timer.
            const realMs = Math.min(60, now - last);
            const dt = w.clock.dt(now, last);
            last = now;

            if (now >= w.nextRespawn) spawn(w, now);

            // ⚠️ PRUNED IN THE LOOP AND RE-RENDERED ONLY WHEN SOMETHING ACTUALLY LEFT. A setTimeout per row
            // is a timer per pickup, and a pickup is the single most frequent event in the Grove; the loop is
            // already running and already knows the time. The guard is what keeps this from being a React
            // render sixty times a second for as long as the tally is on screen.
            if (w.haul.size) {
                let gone = false;
                for (const [k, row] of w.haul) if (now >= row.until) { w.haul.delete(k); gone = true; }
                if (gone) rerender();
            }

            const plats = w.platforms;
            // Walkable bounds, inset by a body so nothing can stand with half of itself outside the zone.
            const bounds = [HERO_UNITS * 0.6, W - HERO_UNITS * 0.6];

            // ── ⚠️ A HELD FINGER IS RE-RESOLVED EVERY FRAME ─────────────────────────────────────
            // Luke: "If i hold down my finger it should continue to pursue where im clicking." The hold is
            // stored in CLIENT coordinates and turned into a world point here, against the camera as it is
            // now — so holding near an edge keeps him walking as the view travels, instead of stopping at
            // whatever world point happened to be under the finger on the first frame. See worldAt.
            //
            // Resolved against LAST frame's camera, which is one frame of lag and invisible: this runs
            // before the hero moves and the camera is eased after he does. Doing it the other way round
            // would mean moving him on a point computed from where he had not gone yet.
            // ── HOW FAST THIS BODY SWINGS, RIGHT NOW ───────────────────────────────────────────
            // Tempo is the standing rate (Ferocity, weapon speed, the tree's tempoBonus and the Grove's
            // own attack-speed emblem, all through the ring's one converter). Haste is a PROC on top:
            // points convert at the ring's HASTE_PER_POINT and, when it fires, the body swings at
            // HASTE_MULT for HASTE_MS. Two different stats doing two different things, which is what
            // Luke asked for — "attack speed, chance to haste" named separately.
            //
            // ⚠️ DECLARED ABOVE EVERY READER ON PURPOSE. `const` sits in the temporal dead zone until its
            // line runs, so a reader forty lines earlier throws "Cannot access before initialization" —
            // the same shape as the prerender crash in [[verify-build-and-migrations]].
            const swingRate = () => Math.max(0.2, (stats?.tempo || 1)) * (now < (w.hasteUntil || 0) ? HASTE_MULT : 1);

            if (holdRef.current) {
                const at = worldAt(holdRef.current.cx, holdRef.current.cy);
                // A hold never steals an attack: tapping a creature targets it, and a finger resting on the
                // glass afterwards must not quietly turn that into a walk somewhere.
                if (at && !w.target) w.moveTo = at;
            }

            // ── HERO ────────────────────────────────────────────────────────────────────────────
            const tgt = w.target && w.target.hp > 0 && !w.target.dying ? w.target : null;
            if (tgt) {
                const range = reachTo(tgt);
                const inReach = Math.abs(tgt.x - w.hero.x) <= range
                    && Math.abs(tgt.y - w.hero.y) <= SWING_V_REACH;
                if (!inReach) {
                    // Stand off on the near side rather than walking into the sprite.
                    const standX = tgt.x - Math.sign(tgt.x - w.hero.x || 1) * (range - 2);
                    const nav = navigate(plats, w.hero, standX, tgt.y);
                    drive(w.hero, nav.dir);
                    if (nav.hop) hop(w.hero, HOP);
                } else if (w.swingDone) {
                    w.hero.face = Math.sign(tgt.x - w.hero.x) || w.hero.face;
                }
                // Auto-attack: "makes them auto attack until you tap away or the enemy perishes."
                // ── ⚠️ TEMPO SCALES THE WHOLE SWING, NOT JUST THE GAP BETWEEN SWINGS ───────────────
                // BARE_TEMPO is 1, so tempo IS the multiplier: a member at 4.00 swings four times as
                // often as an unarmed one. Shortening only the cooldown would have been wrong and
                // visibly so — at tempo 4 the gap (102ms) is shorter than the wind-up and strike
                // (220ms), so the next swing would start before the last one had landed and the
                // animation would never complete. `swingRate` is read by the strike test and by the
                // pose as well, so the arm actually moves faster. See the pose call.
                const cd = SWING_TOTAL_MS / swingRate();
                if (inReach && w.swingDone && now - (w.swingAt || -1e9) > cd) {
                    w.swingAt = now;
                    w.swingFoe = tgt;
                    w.swingDone = false;
                    // ── ⚠️ THIS IS THE WHOLE "ONLY IF YOU ATTACK" RULE, AND IT LIVES HERE ──────────
                    // Luke: "I think the pet should only attack if you attack, and it should attack your
                    // target."
                    //
                    // Both halves are one line each because both are read off the hero's own commitment
                    // to a swing rather than inferred. A pet that picks its own fights turns every walk
                    // across a zone into a brawl with the thirty wandering creatures the player was
                    // deliberately not engaging — and in a zone where a rare spawn and a boss are the
                    // things you choose your moment with, a companion that starts fights is actively
                    // hostile to the player.
                    //
                    // ⚠️ A WINDOW, NOT A FLAG. Tied to "the hero has a target" the pet would keep
                    // biting while he walked away from a fight he had disengaged from; tied to the
                    // single swing it would stop dead in the gap between swings and never reach
                    // anything. The window is longer than one hero swing and shorter than a walk, so it
                    // renews as long as you keep swinging and lapses on its own when you tap away.
                    // ⚠️ THE SIDE IS PICKED ONCE PER TARGET, NOT EVERY FRAME. Recomputed from the
                    // hero's current position it flips the instant he steps past the creature's centre,
                    // and the pet turns round and re-crosses — which at a jittering stand-off distance
                    // is a companion running back and forth through a rootrat for ever.
                    if (w.petFoe !== tgt) {
                        w.petSide = Math.sign(tgt.x - w.hero.x) || 1;
                        // ── ⚠️ A NEW TARGET GETS THE FIRST BITE FREE, AND WITHOUT THIS THE PET NEVER
                        //        ATTACKS ANYTHING AT ALL ────────────────────────────────────────────
                        // The cadence exists to stop a fast build turning its companion into a strobe
                        // DURING a sustained fight. Applied to the opening bite as well it gates the one
                        // bite most fights ever get to: measured against the live game, a member hitting
                        // for 413 kills an ordinary creature in 410-820ms, and the first bite could not
                        // arrive before 915ms. Zones one to six, every creature, every time: the pet
                        // crossed to the flank, arrived, and the fight was already over.
                        //
                        // It worked perfectly on a boss -- 104 bites across 85 seconds -- which is exactly
                        // why nothing caught it. The bench scene gives its creature 6,000 health so it can
                        // be filmed, so the only fight anybody had ever watched was a long one.
                        //
                        // Clearing petAt makes the first bite available the moment the pet is in reach,
                        // and the cadence takes over from the second bite on. Switching targets re-arms it,
                        // which is not exploitable: changing target restarts the HERO's swing too, so the
                        // trade is symmetric, and the bite is a tenth of a blow.
                        w.petAt = null;
                    }
                    w.petFoe = tgt;
                    w.petEngagedUntil = now + PET_ENGAGE_MS;
                }
            } else if (w.moveTo) {
                const nav = navigate(plats, w.hero, w.moveTo.x, w.moveTo.y);
                drive(w.hero, nav.dir);
                if (nav.hop) hop(w.hero, HOP);
                if (!nav.dir && !nav.hop && Math.abs(w.moveTo.x - w.hero.x) < 2.5
                    && Math.abs(w.moveTo.y - w.hero.y) < 4) w.moveTo = null;
            }

            // ── ⚠️ THE BLOW LANDS ON THE STRIKE, NOT WHEN THE SWING STARTS ──────────────────────
            // Animation's oldest rule, and the whole reason a wind-up exists: anticipation is what makes the
            // hit land. Resolving damage on frame one and playing an animation afterwards is a hit that has
            // already happened being mimed — which is exactly what "it doesn't feel like you're hitting
            // them" describes. The number, the sparks, the hit-stop and the knockback all arrive together,
            // 150ms after the hero starts to lean back.
            if (!w.swingDone && w.swingAt != null && now - w.swingAt >= SWING.windMs / swingRate()) {
                w.swingDone = true;
                const foe = w.swingFoe;
                w.swingFoe = null;
                const range = foe ? reachTo(foe) : 0;
                const still = foe && foe.hp > 0 && !foe.dying
                    && Math.abs(foe.x - w.hero.x) <= range + 2
                    && Math.abs(foe.y - w.hero.y) <= SWING_V_REACH;
                if (!still) {
                    playWhiff();
                } else {
                    // The whole fighter, not four hand-picked fields. Creatures carry no armour, so the
                    // 0 is honest rather than a placeholder — mitigation runs on what comes AT you.
                    const hit = swing(stats, 0, w.rand);
                    foe.hp -= hit.dealt;
                    foe.hit = true;
                    foe.lastCrit = hit.crit;
                    // ── THE WOUND ───────────────────────────────────────────────────────────────
                    // ⚠️ A FRESH BLEED REPLACES A WEAKER ONE RATHER THAN STACKING. Stacking turns a high
                    // attack-speed build into a multiplier on a multiplier — every swing adding a whole
                    // new wound — and the ring deliberately does not do that either. Refreshing keeps the
                    // stat worth having without making tempo pay twice.
                    if (hit.bleed) {
                        const better = !foe.bleed || hit.bleed.dmg >= foe.bleed.dmg;
                        if (better) {
                            foe.bleed = { dmg: hit.bleed.dmg, leech: hit.bleed.leech,
                                left: BLEED_TICKS, nextAt: now + BLEED_TICK_MS };
                        }
                    }
                    // When its bar was last struck. Drives whether the bar is up at all, and the flash,
                    // jolt and swell on it while it is. See drawFoeBar.
                    foe.hurtAt = now;
                    foe.flash = 1;
                    foe.flashUntil = now + (hit.crit ? FLASH_MS * 1.6 : FLASH_MS);
                    const dir = Math.sign(foe.x - w.hero.x) || 1;
                    // ⚠️ KNOCKBACK IS AN IMPULSE INTO THE SOLVER, which is what makes it carry the
                    // target's weight: a boss barely moves and a rootrat is thrown, with nobody writing
                    // either case down. Scaled by the target's height so a 21-unit Elder is not punted.
                    const mass = Math.max(0.35, Math.min(1.6, HERO_UNITS / foe.h));
                    impulse(foe, dir * (hit.crit ? KNOCK.crit : KNOCK.hit) * mass,
                        (hit.crit ? KNOCK.upCrit : KNOCK.up) * mass);
                    // And the hero recoils, so the two bodies react to each other rather than one being
                    // furniture that numbers come out of.
                    impulse(w.hero, -dir * RECOIL, 0);
                    w.clock.stop(now, hit.crit ? HITSTOP_MS.crit : HITSTOP_MS.hit);
                    w.shake.add(hit.crit ? TRAUMA.crit : TRAUMA.hit);
                    const px = foe.x - dir * foe.halfW * 0.6;
                    const py = foe.y + foe.h * 0.5;
                    burst(px, py, { crit: hit.crit, dir: -dir });
                    // ⚠️ A CRIT GETS A RING AND AN ORDINARY HIT DOES NOT. Everything else separating the
                    // two -- a longer flash, a harder stop, more trauma, a brighter number -- is a
                    // DIFFERENCE IN DEGREE, and degrees stop reading once they are happening sixty times
                    // a minute. The ring is the only thing on screen that an ordinary hit never does, so
                    // it is the only part a player can catch without counting.
                    if (hit.crit) shockwave(px, py, "crit");
                    // ⚠️ SIZED BY THE SHARE IT TOOK OFF, NOT BY THE RAW NUMBER. 400 is a huge hit on a
                    // rootrat and a scratch on the Heartwood Elder, so a flat threshold would call the
                    // scratch the big one. See popWeight.
                    addPop(hit.crit ? "crit" : "hit", `${hit.dealt}${hit.crit ? "!" : ""}`, px, py,
                        popWeight(hit.dealt, foe.maxHp));
                    playHit(Math.min(COMBO_PITCH_STEPS, w.combo), hit.crit);
                    // The haste roll rides the landed blow, the same place the ring rolls it.
                    if ((stats?.haste || 0) > 0 && w.rand() < procFrom(stats.haste, HASTE_PER_POINT)) {
                        // ⚠️ THE WORD ONLY FIRES WHEN THE BUFF ACTUALLY STARTS. The roll happens on every
                        // landed blow, so a proc landing while haste was ALREADY running printed a second
                        // HASTE on top of the first -- two identical words overlapping, which reads as a
                        // rendering fault rather than as a second proc. Refreshing the duration is right;
                        // announcing it twice is not. Caught on the juice sheet, where the scene pins the
                        // proc to near-certainty and the collision happens every other swing.
                        const wasHasted = now < (w.hasteUntil || 0);
                        w.hasteUntil = now + HASTE_MS;
                        if (!wasHasted) procCall("HASTE", "haste");
                    }
                    if (hit.healed > 0) {
                        w.hp = Math.min(maxHp, w.hp + hit.healed);
                        // ── ⚠️ LIFESTEAL DOES NOT GET A NUMBER, AND THAT IS A DELIBERATE DELETION ────
                        // Life steal is a percentage of every single hit, so a pop for it is a "+1" on
                        // EVERY SWING for ever. On film there were five numbers on screen at once and two
                        // of them were +1 and +2, which is not information — it is the same fact restated
                        // sixty times a minute, competing with the damage number that actually matters.
                        // The health bar already says it, instantly and in the right place.
                        //
                        // A heal still pops when it is an EVENT: eating off the belt, below, which happens
                        // a few times a zone and is something you want to notice.
                    }
                    if (foe.big || foe.rare) w.bossBar = { hp: Math.max(0, foe.hp), maxHp: foe.maxHp };
                    if (foe.isBoss || foe.big || foe.rare) w.bossHurtAt = now;
                    if (foe.hp <= 0) killFoe(w, foe, now);
                }
            }

            // ── THE PET ─────────────────────────────────────────────────────────────────────────
            // ⚠️ IT TRAILS BY A SHARE OF THE FRAME, NOT BY A FLAT 9 UNITS — nine units is 9% of a
            // 100-unit frame and THIRTY-FIVE PERCENT of a 26-unit one, which parked the pet on the left
            // bezel and then off it entirely. See grove-view.js.
            const pf = petFollow(w.visibleUnits || UNITS_PER_SCREEN);

            // ── ⚠️ THREE JOBS, IN A FIXED ORDER, AND THE ORDER IS THE DESIGN ────────────────────
            // Luke: "the pet should only attack if you attack, and it should attack your target", and
            // separately "the pet should be able to set it to pick up items for you. Actually, it should
            // do that automatically."
            //
            // FIGHT beats FETCH beats FOLLOW, and fighting winning is what makes the pickup safe to make
            // automatic. The alternative — nearest job wins — means a drop landing mid-boss walks your
            // damage out of the fight to go shopping, which is the kind of "help" a player would want a
            // toggle to switch off. Loot never expires (a drop rests in w.drops until something collects
            // it), so deferring the sweep until the fight is over costs nothing at all: the pet tidies the
            // floor on the walk to the next thing. That is why there is no setting. The priority IS the
            // setting, and it is the one a player would have picked.
            const petTgt = w.petFoe && w.petFoe.hp > 0 && !w.petFoe.dying ? w.petFoe : null;
            const petting = now < (w.petEngagedUntil || 0) && petTgt;
            if (petting) {
                // ── FIGHT ──────────────────────────────────────────────────────────────────────
                // ⚠️ IT FLANKS, and that is a readability fix rather than a flourish. Standing on the
                // hero's side it pounces through the same six units of screen he is already swinging
                // through, so two bodies, two sets of sparks and two numbers all land in one place —
                // which is the "too noisy" failure in its purest form. On the far side of the target the
                // fight has two legible halves, and the pet stops painting over the hero's sword arm.
                const far = petTgt.x + w.petSide * (PET_REACH + petTgt.halfW);
                // ...unless the far side is off the end of the zone, in which case it takes the near one.
                // A pet shoved against the wall by the solver reads as stuck, and at the zone edges —
                // where the boss stands — that would be most of the fight that matters.
                const flank = far > 4 && far < bounds[1] - 4
                    ? far
                    : petTgt.x - w.petSide * (PET_REACH + petTgt.halfW);
                // ⚠️ IT WALKS TO THE FLANK EVEN WHEN IT IS ALREADY IN RANGE, AND THAT IS THE WHOLE POINT.
                // Gated on being out of bite range instead, the pet stops the moment it can reach — which
                // on a probe put hero at 50, pet at 52 and the creature at 54, the pet sandwiched between
                // the two of them with both sets of sparks landing in the same two units of screen. That
                // is the "too noisy and confusing" failure exactly, and it passed every other check: it
                // bit, it did the right damage, and it looked fine in a still.
                //
                // So reaching the SPOT and being able to BITE are two different tests now. It crosses,
                // then it settles, and the fight has two legible halves.
                const atFlank = Math.abs(w.pet.x - flank) < PET_FLANK_SLACK;
                const inBite = Math.abs(petTgt.x - w.pet.x) <= PET_REACH + petTgt.halfW
                    && Math.abs(petTgt.y - w.pet.y) <= SWING_V_REACH;
                if (!atFlank) {
                    const nav = navigate(plats, w.pet, flank, petTgt.y);
                    drive(w.pet, nav.dir);
                    if (nav.hop) hop(w.pet, HOP);
                }
                // Facing is always at the creature, including while crossing to the far side of it — a
                // pet that turns its back on the thing it is biting is the one pose that cannot be right.
                if (w.petDone) w.pet.face = Math.sign(petTgt.x - w.pet.x) || w.pet.face;
                // ⚠️ THE CADENCE IS HALF THE HERO'S, FLOORED — see petBiteCd. It reads the SAME
                // swingRate() the hero's cooldown does, so a tempo build speeds its companion up too
                // rather than leaving the pet plodding along beside a blur.
                const petCd = petBiteCd(SWING_TOTAL_MS / swingRate());
                if (inBite && w.petDone && now - (w.petAt || -1e9) > petCd) {
                    w.petAt = now;
                    w.petBiting = petTgt;
                    w.petDone = false;
                }
            } else if (w.petFetch && (w.petFetch.state !== "rest" || !w.drops.includes(w.petFetch))) {
                // The drop it was going for was collected by the hero on his way past, or the zone was
                // rebuilt under it. Drop the errand rather than walking to where it used to be.
                w.petFetch = null;
            } else {
                // ── FETCH ──────────────────────────────────────────────────────────────────────
                // Nothing to fight: the pet goes and gets the floor. It commits to ONE drop at a time and
                // keeps it until it is collected — re-picking the nearest every frame makes it dither
                // between two equidistant piles for ever, which films as a pet having a seizure.
                if (!w.petFetch) {
                    let best = null;
                    let bestD = PET_FETCH_RANGE;
                    for (const d of w.drops) {
                        if (d.state !== "rest") continue;
                        // Not the ones the hero is about to walk over himself. Letting the pet race him
                        // for a drop two units from his feet steals the one bit of collecting that is
                        // supposed to feel like the player did it.
                        if (Math.hypot(d.x - w.hero.x, d.y - w.hero.y) < LOOT_DRAW_RANGE) continue;
                        const dist = Math.hypot(d.x - w.pet.x, (d.y - w.pet.y) * 0.8);
                        if (dist < bestD) { bestD = dist; best = d; }
                    }
                    w.petFetch = best;
                }
                if (w.petFetch) {
                    const d = w.petFetch;
                    const nav = navigate(plats, w.pet, d.x, d.y);
                    drive(w.pet, nav.dir);
                    if (nav.hop) hop(w.pet, HOP);
                    // Close enough: the drop commits to the PET and is drawn in by the same magnet that
                    // serves the hero. See the loot block for why that matters.
                    if (Math.hypot(d.x - w.pet.x, (d.y - w.pet.y) * 0.8) < PET_FETCH_REACH) {
                        d.state = "draw";
                        d.dv = 0;
                        d.to = "pet";
                        w.petFetch = null;
                    }
                } else {
                    // ── FOLLOW ─────────────────────────────────────────────────────────────────
                    const petWant = w.hero.x - w.hero.face * pf.trail;
                    if (Math.abs(petWant - w.pet.x) > pf.slack || Math.abs(w.hero.y - w.pet.y) > 4) {
                        const nav = navigate(plats, w.pet, petWant, w.hero.y);
                        drive(w.pet, nav.dir);
                        if (nav.hop) hop(w.pet, HOP);
                    }
                }
            }

            // ── ⚠️ THE BITE LANDS ON THE LEAP, NOT WHEN THE POUNCE STARTS ───────────────────────
            // The same rule as the hero's strike and for the same reason: the coil is anticipation, and
            // damage resolved on frame one with an animation played afterwards is a hit being mimed.
            if (!w.petDone && w.petAt != null && now - w.petAt >= POUNCE.coilMs) {
                w.petDone = true;
                const foe = w.petBiting;
                w.petBiting = null;
                const still = foe && foe.hp > 0 && !foe.dying
                    && Math.abs(foe.x - w.pet.x) <= PET_REACH + foe.halfW + 2
                    && Math.abs(foe.y - w.pet.y) <= SWING_V_REACH;
                // ⚠️ NO WHIFF SOUND ON A MISSED BITE. The hero's whiff is the sound of HAVING DODGED
                // something; a companion's missed lunge is a non-event, and a second whiff layered over
                // the hero's own swings is the kind of noise that has no information in it.
                if (still && petShare > 0) {
                    const bite = petBite(stats, petShare, 0, w.rand);
                    foe.hp -= bite.dealt;
                    foe.hit = true;
                    // ⚠️ DELIBERATELY NOT foe.lastCrit. That field is read by killFoe to decide how big
                    // the death is, and a pet crit landing the killing blow would give the hero's kill
                    // the pet's reason — the body is thrown and the screen shaken on the strength of
                    // something the player did not do.
                    foe.hurtAt = now;
                    foe.flash = 1;
                    foe.flashUntil = now + FLASH_MS;
                    const dir = Math.sign(foe.x - w.pet.x) || 1;
                    const mass = Math.max(0.35, Math.min(1.6, HERO_UNITS / foe.h));
                    // A twitch, not a throw: the pet's knockback is a fraction of the hero's so the
                    // target stays roughly where the player put it. See PET_KNOCK_SHARE.
                    impulse(foe, dir * KNOCK.hit * mass * PET_KNOCK_SHARE, KNOCK.up * mass * PET_KNOCK_SHARE);
                    // ⚠️ NO clock.stop(). Hit-stop freezes the simulation, and a second body freezing it
                    // on its own schedule is a stutter rather than impact. The hero owns time here —
                    // see the note over PET_TRAUMA_SHARE in grove-juice.js.
                    if (bite.crit) w.shake.add(TRAUMA.hit * PET_TRAUMA_SHARE);
                    const px = foe.x - dir * foe.halfW * 0.6;
                    // ⚠️ LOW ON THE BODY, AND THE SEPARATION IS VERTICAL ON PURPOSE. The hero's number
                    // spawns at half the creature's height; the pet attacks from the other side, so the
                    // two were relying on HORIZONTAL distance to stay apart — about 1.2 half-widths. On a
                    // 17-unit phone frame that is a couple of units, and the two numbers overlapped into
                    // something unreadable. A share of the creature's own height separates them at every
                    // zoom and on every size of creature, which a horizontal gap cannot do. See
                    // [[view-space-constants-break-on-zoom]].
                    //
                    // It is also simply where a companion bites: at the legs.
                    const py = foe.y + foe.h * 0.12;
                    burst(px, py, { dir: -dir, kind: "pet", scale: PET_SPARKS });
                    // ⚠️ AND NO CRIT RING, even on a crit. The ring is the only thing on screen an
                    // ordinary hit never does, which is exactly what makes it readable; handing it to a
                    // second body is how that signal stops being one.
                    addPop("pet", `${bite.dealt}${bite.crit ? "!" : ""}`, px, py,
                        popWeight(bite.dealt, foe.maxHp));
                    playPetHit(bite.crit);
                    if (foe.big || foe.rare) w.bossBar = { hp: Math.max(0, foe.hp), maxHp: foe.maxHp };
                    if (foe.isBoss || foe.big || foe.rare) w.bossHurtAt = now;
                    // ⚠️ AND IT CAN LAND THE KILL, THROUGH THE HERO'S OWN killFoe. A pet whose bite
                    // cannot finish a creature would leave rats standing at 1hp waiting for the player,
                    // and the loot, the kill log and the zone's banked count all hang off this one
                    // function. Two paths for one payout always drift — see
                    // [[atomic-split-into-steps-drops-lines]].
                    if (foe.hp <= 0) killFoe(w, foe, now);
                }
            }
            // ⚠️ AND IT GETS RESCUED. A follower with real physics WILL eventually be left behind — stuck
            // under a ledge it mistimed, or on the wrong side of the zone after the hero climbed. Every game
            // with a companion does this and it is invisible when it works; without it the pet is simply
            // gone, which is the exact complaint Luke raised by name the last time ("my dude and pet").
            if (Math.abs(w.hero.x - w.pet.x) > PET_LOST) {
                w.pet.x = w.hero.x - w.hero.face * pf.trail;
                w.pet.y = w.hero.y;
                w.pet.vx = 0; w.pet.vy = 0;
                burst(w.pet.x, w.pet.y, { kind: "dust" });
            }

            // ── FOES ────────────────────────────────────────────────────────────────────────────
            for (const f of w.foes) {
                if (f.flashUntil && now >= f.flashUntil) { f.flash = 0; f.flashUntil = 0; }
                else if (f.flashUntil) f.flash = Math.max(0, (f.flashUntil - now) / FLASH_MS);
                if (f.dying) {
                    // ── THE TOPPLE ──────────────────────────────────────────────────────────────
                    // Still falling: the solver already ran over this body in settle(), so a creature
                    // killed on a ledge comes off it. What is added here is the WEIGHT — the rotation
                    // eases out instead of ticking over at a fixed rate, so the blow owns the first
                    // part of the fall and the ground owns the end of it.
                    const kit = f.deathKit || (f.deathKit = deathKit(f));
                    const k = Math.min(1, (now - f.dying) / kit.ms);
                    // 1-(1-k)^3: fast away from the blow, settling as it meets the floor.
                    f.lean = -(f.deathDir || 1) * kit.lean * (1 - (1 - k) ** 3);
                    // ⚠️ THE IMPACT IS AN EVENT, NOT A POSE. A body that lands part-way through its fall
                    // squashes ONCE at the moment it touches, and only if it was actually in the air —
                    // reading `grounded` every frame would squash a creature that died standing still.
                    if (!f.deathHit && f.grounded && now - f.dying > 60) {
                        f.deathHit = now;
                        burst(f.x, f.floorY == null ? f.y : f.floorY, { kind: "dust", scale: kit.dust });
                    }
                    continue;
                }
                if (f.hp <= 0) continue;

                // ── THE WOUND KEEPS ARRIVING ────────────────────────────────────────────────────
                // ⚠️ IT TICKS ON THE CREATURE'S OWN CLOCK, NOT ON YOUR SWINGS. A bleed that only
                // resolved when you hit again would be a worse version of the hit, and would pay
                // nothing at all to the player who applies it and backs off — which is the one
                // playstyle it exists to reward.
                //
                // Bleed PIERCES: it is dealt straight off hp without going through mitigate, which
                // is the whole identity of the stat. See [[bleed-front-load-magnitude]].
                if (f.bleed && now >= f.bleed.nextAt) {
                    const tick = Math.max(1, Math.round(f.bleed.dmg));
                    f.hp -= tick;
                    f.hurtAt = now;
                    addPop("hit", `${tick}`, f.x, f.y + f.h * 0.6, popWeight(tick, f.maxHp) * 0.7);
                    if (f.bleed.leech > 0) {
                        w.hp = Math.min(maxHp, w.hp + Math.max(1, Math.round(tick * f.bleed.leech)));
                    }
                    f.bleed.left -= 1;
                    f.bleed.nextAt = now + BLEED_TICK_MS;
                    if (f.bleed.left <= 0) f.bleed = null;
                    // ── ⚠️ A BLEED KILL IS A KILL, AND THIS LINE USED TO JUST CLAMP IT TO ZERO ──
                    // `if (f.hp <= 0) { f.hp = 0; }` and nothing else. The creature reached zero and then
                    // STOOD THERE: no topple, no loot, no kill-log entry, and `bossBar` never cleared —
                    // and because the hero only ever targets `hp > 0 && !dying`, it could not be hit
                    // again either. An unkillable statue holding the boss bar.
                    //
                    // Luke, on the Crystal Stag: "i killed it but no drop no death now I cant attack."
                    // The rare has 9,000 HP and is exactly the kind of thing you finish with a bleed
                    // ticking, which is why it surfaced there first — but every bleed kill in the Grove
                    // did this, on every creature, since bleed shipped.
                    //
                    // TWO PATHS FOR ONE OUTCOME ALWAYS DRIFT. The sword's path calls killFoe (see the hit
                    // resolution above); this one has to be the SAME call, not a second opinion about what
                    // dying means. `continue` because killFoe sets `dying`, and everything below here is
                    // the behaviour of something still alive.
                    if (f.hp <= 0) { f.hp = 0; killFoe(w, f, now); continue; }
                }

                // Passive early enemies never initiate — Luke: "the ones earlier in the game being fully
                // passive. And later in the game attacking when they are attacked." A boss is passive until
                // you reach it and then never stops.
                // ── ⚠️ THE BOSS ARRIVES, RATHER THAN BEING DISCOVERED STANDING THERE ───────────
                // It is spawned at the far wall on zone entry and stays passive, and its bar and its name
                // only ever appeared when you TAPPED it. So the climax of a zone was a large animal you
                // walked into, and the only thing that marked it was a health bar you had to start the
                // fight to see. A boss that does not announce itself is scenery with a lot of hit points.
                if (f.isBoss && !f.noticed && Math.abs(f.x - w.hero.x) < BOSS_NOTICE) {
                    f.noticed = true;
                    w.bossBar = { hp: f.hp, maxHp: f.maxHp };
                    w.bossChase = makeChase(1);
                    w.shake.add(TRAUMA.boss);
                    playBossNotice();
                    w.barName = f.name;
                    fireHerald("The zone stirs", f.name, "boss");
                    // ⚠️ CLEARED ON A TIMER rather than an animation event, for the same reason the warp is:
                    // animationend never fires if the element is not painted, and a banner that never
                    // clears is a name sitting across the middle of a boss fight.
                }
                const angry = f.isBoss ? (f === tgt || f.hit) : (!f.passive && (f === tgt || f.hit));
                const near = Math.abs(f.x - w.hero.x) < (f.isBoss ? 26 : 15)
                    && Math.abs(f.y - w.hero.y) < SWING_V_REACH + 4;
                if (angry && near && now >= (f.nextAttack || 0)) {
                    if (f.isBoss && f.attacks?.length) {
                        // ⚠️ CYCLED IN ORDER, NOT PICKED AT RANDOM. A boss you can learn is the whole point
                        // of telegraphing; a random pick from three shapes is just noise with a wind-up.
                        const atk = f.attacks[f.atk % f.attacks.length];
                        f.atk += 1;
                        w.tels.push(...makeTelegraph(f, w.hero.x, now, atk));
                        f.nextAttack = now + atk.telegraph + 900 + w.rand() * 700;
                        f.windUntil = now + atk.telegraph;
                        playTell(atk.kind);
                    } else {
                        w.tels.push(...makeTelegraph(f, w.hero.x, now));
                        f.nextAttack = now + 1800 + w.rand() * 1600;
                        f.windUntil = now + (f.telegraph || 600);
                    }
                    rerender();
                }
                // ⚠️ A CREATURE WINDING UP DOES NOT WALK. Moving through your own tell is what makes a
                // telegraph a lie — the band is drawn where the attack will land, and a shuffling attacker
                // means the drawing and the hit disagree.
                const winding = f.windUntil && now < f.windUntil;
                if (winding) {
                    f.vx *= 0.7;
                } else if (angry) {
                    const nav = navigate(plats, f, w.hero.x - Math.sign(w.hero.x - f.x || 1) * 4, w.hero.y);
                    drive(f, nav.dir);
                    if (nav.hop) hop(f, HOP);
                } else if (!f.isBoss) {
                    const wi = wanderIntent(f, plats, w.rand, dt);
                    drive(f, wi.dir);
                    if (wi.hop) hop(f, HOP);
                }
            }

            // ── EVERY BODY GOES THROUGH THE SOLVER ──────────────────────────────────────────────
            const settle = (b) => {
                const wasAir = !b.grounded;
                integrate(b, plats, dt, { clampX: bounds });
                b.floorY = surfaceUnder(plats, b.x, b.y + 0.5).y;
                if (wasAir && b.grounded) {
                    b.landedAt = now;
                    if (Math.abs(b.vyPrev || 0) > 1.1) {
                        burst(b.x, b.y, { kind: "dust" });
                        if (b === w.hero) w.shake.add(TRAUMA.land);
                    }
                }
            };
            settle(w.hero);
            settle(w.pet);
            for (const f of w.foes) settle(f);

            // ── TELEGRAPHS RESOLVE ──────────────────────────────────────────────────────────────
            for (let i = w.tels.length - 1; i >= 0; i -= 1) {
                const tel = w.tels[i];
                if (now < tel.fires) continue;
                w.tels.splice(i, 1);
                rerender();
                shockwave(tel.x, tel.y, tel.kind);
                // ⚠️ MATCHED ON uid. This read tel.foeId against f.uid, which never matched, so every attack
                // in the Grove fell through to a hardcoded 5 damage and the whole difficulty curve was dead.
                const foe = w.foes.find((f) => f.uid === tel.foeUid) || null;
                if (!telegraphHits(tel, w.hero.x, w.hero.y)) { playWhiff(); continue; }
                const base = foe ? foe.dmg[0] + Math.round(w.rand() * (foe.dmg[1] - foe.dmg[0])) : 5;
                // A sweep is wide and weak, a slam is narrow and hard. The multiplier is what makes them
                // read differently rather than just look different.
                const raw = Math.max(1, Math.round(base * (Number(tel.mult) || 1)));
                // ⚠️ mitigate(), NOT A SECOND COPY OF IT. This was the 60/(60+armour) formula written out by
                // hand, next to a module that exports exactly that rule as ARMOUR_K. Two copies is two games.
                const dealt = mitigate(raw, stats?.armour || 0);

                w.hp -= dealt;
                w.hurtAt = now;
                w.clock.stop(now, HITSTOP_MS.hurt);
                w.shake.add(TRAUMA.hurt);
                w.combo = 0;
                impulse(w.hero, Math.sign(w.hero.x - tel.x || 1) * 0.42, 0.2);
                addPop("took", `-${dealt}`, w.hero.x, w.hero.y + HERO_UNITS * 0.9);
                burst(w.hero.x, w.hero.y + HERO_UNITS * 0.4, { crit: true, dir: Math.sign(w.hero.x - tel.x || 1) });
                playHurt();

                // ── ⚠️ EATING IS DECIDED AGAINST THE HP THAT IS ACTUALLY COMMITTED ──────────────
                // Luke: "equip food or potions that auto heal you if you get below 60 percent hp." This used
                // to live inside a setState updater, because that was the only place the true current value
                // could be read while hp was React state. With hp in a ref there is only one value and this
                // is simply where it is read — two hits in one frame can no longer eat twice or eat nothing.
                if (w.hp > 0 && w.hp < maxHp * HEAL_AT && w.foodLeft > 0 && belt?.id) {
                    w.foodLeft -= 1;
                    w.eaten[belt.id] = (w.eaten[belt.id] || 0) + 1;
                    const healed = Math.round(maxHp * (Number(belt.heals) || 0));
                    w.hp = Math.min(maxHp, w.hp + healed);
                    addPop("heal", `+${healed}`, w.hero.x, w.hero.y + HERO_UNITS * 1.1);
                    setBeltLeft(w.foodLeft);
                }
                // ── ⚠️ DYING HAD NO MOMENT, ONLY A CONSEQUENCE ─────────────────────────────────
                // Hitting zero flipped a flag and a dark panel appeared over a zone that was still
                // cheerfully simulating underneath it. Every other beat in here — a crit, a kill, an
                // emblem, a boss noticing you — stops the world for a fraction of a second, and the one
                // moment that actually ends the run did not. So the hit that kills you lands like a hit
                // that kills you: the longest stop in the feature, the heaviest shake, and a sound that
                // falls further than the boss's.
                if (w.hp <= 0 && !w.died) {
                    w.died = true;
                    w.hp = 0;
                    w.clock.stop(now, DEATH_STOP_MS);
                    w.shake.add(1);
                    burst(w.hero.x, w.hero.y + HERO_UNITS * 0.5, { crit: true });
                    shockwave(w.hero.x, w.hero.y + HERO_UNITS * 0.4, "hurt");
                    playDeath();
                    // ── ⚠️ HE NOW ACTUALLY FALLS ────────────────────────────────────────────
                    // Everything above was already here and all of it happened to a hero who stayed
                    // standing bolt upright underneath the panel that followed. He is thrown back by
                    // whatever killed him and goes down through the same solver every other body uses,
                    // so he comes off a ledge if he died on one.
                    w.heroDeath = now;
                    w.heroDeathDir = w.hero.face || 1;
                    impulse(w.hero, w.heroDeathDir * -HERO_DEATH.launch, HERO_DEATH.up);
                    setDead(true);
                }
            }

            // ── LOOT: SPILL, REST, DRAW IN ──────────────────────────────────────────────────────
            // Luke: "it needs to be like a dopamine inducing explosion of like what they drop and it should
            // hang out on the ground for a while. You should actually see the sprite and the name of it
            // before it gets sucked up to your character when you get close enough."
            //
            // ⚠️ THREE STATES, NOT A TRANSITION. It used to be a text float at the corpse and nothing else:
            // nothing fell, nothing rested, nothing was ever collected, and the pickup radius quietly deleted
            // the drop the moment you walked past. The three stages ARE the dopamine — the throw says you
            // earned something, the rest lets you read what, and the draw-in is the collection.
            for (let i = w.drops.length - 1; i >= 0; i -= 1) {
                const d = w.drops[i];
                if (d.state === "spill") {
                    integrate(d, plats, dt, { bounce: LOOT_BOUNCE, clampX: bounds });
                    if (d.grounded) { d.state = "rest"; d.restAt = now; playDrop(); }
                } else if (d.state === "rest") {
                    integrate(d, plats, dt, { clampX: bounds });
                    const dist = Math.hypot(d.x - w.hero.x, (d.y - w.hero.y) * 0.8);
                    if (now - d.restAt > LOOT_REST_MS && dist < LOOT_DRAW_RANGE) {
                        d.state = "draw"; d.dv = 0; d.to = "hero";
                        // The hero walking over a drop outranks the errand: if the pet was on its way,
                        // the errand is simply over. Without this the pet keeps walking to a pile that
                        // is already flying to the hero and then stands on the empty spot.
                        if (d === w.petFetch) w.petFetch = null;
                    }
                } else {
                    // ⚠️ EASING IN, NOT A CONSTANT GLIDE. A magnet that commits is the whole feeling; a
                    // piece of loot sliding over at a fixed speed reads as a UI element animating.
                    //
                    // ⚠️ AND IT IS DRAWN TO WHOEVER CLAIMED IT. The pet fetching a drop sets d.to, and
                    // the magnet follows that body instead of the hero — which is how the pickup stays
                    // ONE pipeline with one payout rather than the pet growing a second collection path
                    // beside this one. Two paths for one payout always drift; this repo has paid for that
                    // twice. See [[atomic-split-into-steps-drops-lines]].
                    d.dv = Math.min(LOOT_DRAW_MAX, (d.dv || 0) + LOOT_DRAW_ACCEL * dt);
                    const by = d.to === "pet" ? w.pet : w.hero;
                    const hx = by.x;
                    const hy = by.y + by.h * 0.45;
                    const dist = Math.hypot(hx - d.x, hy - d.y) || 1;
                    d.x += ((hx - d.x) / dist) * d.dv * dt;
                    d.y += ((hy - d.y) / dist) * d.dv * dt;
                    if (dist < LOOT_EAT_DIST) {
                        // Hidden rather than removed, for the same reason as a dying foe above.
                        if (d.node) d.node.style.display = "none";
                        w.drops.splice(i, 1);
                        if (d === w.petFetch) w.petFetch = null;
                        // ⚠️ THE THING YOU PICKED UP, NOT THE NAME OF IT. Luke: "You should actually see
                        // the sprite and the name of it." The drop spends its whole life as a sprite on
                        // the floor and then became a line of text at the moment of collection, which is
                        // the one moment it is a reward. The art rides the label now.
                        //
                        // ⚠️ THE LABEL POPS AT WHOEVER COLLECTED IT. A drop the pet ran twenty units to
                        // fetch announcing itself over the hero's head says the player picked it up, and
                        // the one thing this feature has to communicate is that the PET did — otherwise
                        // it reads as loot teleporting and the whole errand went unnoticed.
                        addPop("loot", d.label, by.x + (by.face || 1) * 1.5, by.y + by.h * 0.75,
                            null, d.art || null);
                        // ⚠️ EXTENDED, NOT RESTARTED, AND CAPPED. See HAUL_MS. An arrival pushes the row's
                        // expiry out by one more HAUL_MS from NOW, so a steady trickle of one kind holds its
                        // row open; HAUL_MAX_MS from the row's birth is the furthest that can ever reach.
                        {
                            const key = d.part || d.label;
                            const row = w.haul.get(key);
                            if (row) {
                                row.qty += d.qty || 1;
                                row.at = now;
                                row.until = Math.min(now + HAUL_MS, row.born + HAUL_MAX_MS);
                                if (d.rare) row.rare = true;
                            } else {
                                w.haul.set(key, { key, label: d.name || d.label, art: d.art || null,
                                    rare: Boolean(d.rare), qty: d.qty || 1,
                                    born: now, at: now, until: now + HAUL_MS });
                            }
                        }
                        playPickup(Boolean(d.rare));
                        rerender();
                        continue;
                    }
                }
            }

            // ── THE CAMERA ──────────────────────────────────────────────────────────────────────
            // Luke: "The camera would trolley and lookahead slightly, common sense. Not jostle the person."
            // So it EASES toward a point ahead of the hero rather than tracking them exactly — a camera
            // locked to the player is what makes a scrolling game feel like it is shaking.
            const vw = host.clientWidth;
            const vh = host.clientHeight;
            const view = viewFor(vw, vh, w.topY);
            const { unit, skyBoxH, groundPx, tileW } = view;

            // ⚠️ THE SPRITES SCALE WITH IT. Every body is sized in world units off this variable; a body
            // sized in percent of the scene keeps its pixel size when the scale zooms and only the gaps
            // between bodies grow, which is the opposite of what zooming is for.
            if (unit !== w.unitPx) { w.unitPx = unit; host.style.setProperty("--gv-unit", `${unit}px`); }
            if (groundPx !== w.groundPx) { w.groundPx = groundPx; host.style.setProperty("--gv-ground", `${groundPx}px`); }
            if (skyBoxH !== w.skyBoxH) {
                w.skyBoxH = skyBoxH;
                host.style.setProperty("--gv-sky-h", `${skyBoxH}px`);
                host.style.setProperty("--gv-sky-w", `${tileW}px`);
            }

            // The vertical camera. The top tier of a late zone is 78 units up and the frame holds about 25,
            // so the ledges are reached by the camera RISING, exactly as the horizontal one handles a zone
            // seven screens wide. Held by a deadzone so the horizon never bobs on a hop.
            const wantCamY = cameraY(w.hero.y, view.skyUnits);
            camYRef.current += (wantCamY - camYRef.current) * Math.min(1, 0.07 * dt);
            const camY = camYRef.current;

            // ⚠️ THE LOOKAHEAD AND THE CLAMP ARE SHARES OF WHAT IS VISIBLE, not of a 100-unit frame. A flat
            // 14-unit lookahead became more than half the frame when the scale changed and settled the
            // camera further right than the hero stood — he rendered at x = -65, off the left edge of his own
            // zone, at the correct size, which photographs as an empty forest.
            const visibleUnits = view.visibleUnits;
            w.visibleUnits = visibleUnits;
            const wantCam = cameraX(w.hero.x, w.hero.face, visibleUnits, W);
            // A lab scene that teleports the hero asks the camera to be there already, rather than to
            // travel. Real play never teleports, so this only ever fires on the bench.
            if (w.snapCam) { camRef.current = wantCam; w.snapCam = false; }
            camRef.current += (wantCam - camRef.current) * Math.min(1, 0.055 * dt);
            const cam = camRef.current;

            // ── SCREEN SHAKE ────────────────────────────────────────────────────────────────────
            // ⚠️ ON THE WORLD LAYER, NEVER THE HOST. The HUD, the boss bar and the Leave button are
            // outside it on purpose: a shaking interface reads as a broken page, and Leave is the control
            // you most need when something has gone wrong. Trauma decays on REAL ms so a shake still
            // finishes while hit-stop holds the simulation still.
            w.shake.step(realMs, w.rand);
            if (worldLayerRef.current) {
                worldLayerRef.current.style.transform =
                    `translate3d(${w.shake.x.toFixed(2)}px, ${w.shake.y.toFixed(2)}px, 0)`;
            }

            // ── PAINT ───────────────────────────────────────────────────────────────────────────
            // Elapsed is SCALED, so a fast fighter's arm moves fast rather than freezing mid-arc
            // waiting out an animation written for one speed.
            const sp = swingPose(w.swingAt == null ? null : (now - w.swingAt) * swingRate(), w.hero.face);
            place(w.hero, cam, camY, unit, sp.dx);
            pose(w.hero, now, unit, { sx: sp.sx, sy: sp.sy, moving: Math.abs(w.hero.vx) > 0.04 });
            if (w.hero.swipeNode) {
                // The arc only exists during the strike — 70ms. The shortest phase of the swing is the one
                // that is supposed to look fast.
                w.hero.swipeNode.style.opacity = sp.t === "strike" ? "1" : "0";
            }
            // ⚠️ THE POUNCE IS NOT SCALED BY swingRate() THE WAY THE HERO'S SWING IS. His animation is
            // stretched to his attack speed so the arm keeps up with the blows; the pet's cadence is
            // already derived from that rate (petBiteCd), so scaling the animation too would compress a
            // 410ms pounce into 100ms at tempo 4 — a blur with no readable coil, which is the opposite
            // of what a differentiated motion is for.
            const pp = pouncePose(w.petAt == null ? null : now - w.petAt, w.pet.face);
            place(w.pet, cam, camY, unit, pp.dx);
            pose(w.pet, now, unit, { sx: pp.sx, sy: pp.sy, dy: pp.dy,
                moving: Math.abs(w.pet.vx) > 0.04 });
            if (w.pet.clawNode) {
                // Only during the crossing — 85ms. Same rule as the hero's crescent: the shortest beat of
                // the motion is the one that is meant to look fast.
                w.pet.clawNode.style.opacity = pp.t === "leap" ? "1" : "0";
            }
            drawHeroBar(now);

            // ── THE HERO GOING DOWN ─────────────────────────────────────────────────────────────────
            // Runs AFTER the normal pose so it overwrites it — the same shape the foe topple uses, with
            // two differences that are the whole character of it.
            //
            //   1. HE BUCKLES BEFORE HE GOES OVER. The first third is a knee giving way: he drops and
            //      squashes without much rotation, and only then keels. A single rotation from upright
            //      to flat reads as a felled tree, not a person.
            //   2. HE DOES NOT DISAPPEAR. He settles at a readable opacity and stays there. The run
            //      ending with the body still on the floor is the picture; a hero who dissolves reads
            //      as a disconnect rather than a death.
            if (w.heroDeath && w.hero.art0) {
                const k = Math.min(1, (now - w.heroDeath) / HERO_DEATH.ms);
                const knee = Math.min(1, k / HERO_DEATH.knee);
                const over = Math.max(0, (k - HERO_DEATH.knee) / (1 - HERO_DEATH.knee));
                const lean = -(w.heroDeathDir || 1) * HERO_DEATH.lean * (1 - (1 - over) ** 3);
                // The buckle: compressing as the knee goes, easing out of it as he turns over.
                const sy = 1 - 0.18 * knee * (1 - over * 0.6);
                const sx = 1 + 0.10 * knee * (1 - over * 0.6);
                const sink = (w.hero.foot || 0) * 100 + k * DEATH_SINK * 100;
                w.hero.art0.style.transformOrigin = "50% 92%";
                w.hero.art0.style.transform =
                    `translateY(${sink}%) rotate(${lean}deg) scale(${sx}, ${sy}) scaleX(${w.hero.face || 1})`;
                if (w.hero.node) {
                    w.hero.node.style.opacity = String(1 - (1 - HERO_DEATH.rest) * k);
                }
                if (!w.heroDeathHit && w.hero.grounded && now - w.heroDeath > 80) {
                    w.heroDeathHit = now;
                    burst(w.hero.x, w.hero.floorY == null ? w.hero.y : w.hero.floorY,
                        { kind: "dust", scale: 1.5 });
                }
            }

            for (let i = w.foes.length - 1; i >= 0; i -= 1) {
                const f = w.foes[i];
                place(f, cam, camY, unit);
                if (f.dying) {
                    const kit = f.deathKit || (f.deathKit = deathKit(f));
                    const k = Math.min(1, (now - f.dying) / kit.ms);
                    if (f.node) {
                        // It holds full opacity through the topple and only then goes, so the fall is
                        // watched rather than faded through.
                        const fade = Math.max(0, (k - DEATH_OPAQUE_UNTIL) / (1 - DEATH_OPAQUE_UNTIL));
                        f.node.style.opacity = String(1 - fade);
                        f.node.style.pointerEvents = "none";
                    }
                    if (f.art0) {
                        // The landing squash, decaying over its own short window.
                        const hit = f.deathHit ? Math.max(0, 1 - (now - f.deathHit) / DEATH_IMPACT.ms) : 0;
                        const sx = 1 + (DEATH_IMPACT.sx - 1) * hit;
                        const sy = 1 + (DEATH_IMPACT.sy - 1) * hit;
                        // Sinking into the floor as it goes — a share of its own height, never a world
                        // distance, so the zoom cannot break it.
                        const sink = (f.foot || 0) * 100 + k * DEATH_SINK * 100;
                        f.art0.style.transformOrigin = "50% 92%";
                        f.art0.style.transform =
                            `translateY(${sink}%) rotate(${f.lean || 0}deg) scale(${sx}, ${sy}) scaleX(${f.face || 1})`;
                    }
                    if (f.flashNode) f.flashNode.style.opacity = String(Math.max(0, 1 - k * 3));
                    if (k >= 1) {
                        // ⚠️ HIDDEN, NEVER .remove()d — THIS CRASHED THE WHOLE SCENE. A foe's node is
                        // rendered by React; taking it out of the DOM by hand and then asking React to
                        // re-render the list without it makes React try to remove a node that is no longer
                        // its parent's child, which throws "The node to be removed is not a child of this
                        // node" and drops the entire zone into the error boundary. Only the nodes this file
                        // CREATED by hand (damage numbers, sparks) may be removed by hand. Hiding closes
                        // the one-frame gap before React's own removal lands.
                        if (f.node) f.node.style.display = "none";
                        w.foes.splice(i, 1);
                        if (w.target === f) w.target = null;
                        rerender();
                    }
                    continue;
                }
                const born = now - (f.born || 0);
                if (born < SPAWN_FADE_MS && f.node) f.node.style.opacity = String(born / SPAWN_FADE_MS);
                else if (f.node && f.node.style.opacity !== "1") f.node.style.opacity = "1";
                const wind = f.windUntil && now < f.windUntil;
                pose(f, now, unit, {
                    // A creature winding up coils: shorter and wider, holding still. It is the only tell a
                    // wanderer has beyond its band on the floor.
                    sx: wind ? 1.07 : 1, sy: wind ? 0.93 : 1,
                    moving: Math.abs(f.vx) > 0.03,
                });
                drawFoeBar(f, now);
            }

            for (const pf2 of plats) {
                if (!pf2.node) continue;
                pf2.node.style.transform = `translate3d(${(pf2.x - cam) * unit}px, ${-(pf2.y - camY) * unit}px, 0)`;
                pf2.node.style.width = `${pf2.w * unit}px`;
            }

            // ⚠️ AND THE BANDS RIDE THEIR OWN FLOOR. A telegraph is drawn at the y of the creature that
            // made it, so an attack from a ledge is announced on that ledge. Painted at the ground line and
            // resolved on x alone, a creature standing a tier up hit you through the floor it stood on.
            for (const t of w.tels) {
                if (!t.node) continue;
                t.node.style.transform =
                    `translate3d(${(t.x - cam - t.r) * unit}px, ${-((t.y || 0) - camY) * unit}px, 0)`;
                t.node.style.width = `${t.r * 2 * unit}px`;
            }

            for (const dr of w.doors) {
                if (!dr.node) continue;
                dr.node.style.transform = `translate3d(${(dr.x - cam) * unit}px, ${camY * unit}px, 0)`;
                // ⚠️ THE CLASS IS TOGGLED, NOT REWRITTEN. className = ... here would wipe is-locked and
                // is-opening every frame, which is sixty times a second of the open sprite fighting the
                // unlock animation for the same element.
                const near = Math.abs(w.hero.x - dr.x) < DOOR_NEAR && !dr.node.classList.contains("is-locked");
                dr.node.classList.toggle("is-near", near);
            }

            for (const d of w.drops) {
                if (!d.node) continue;
                d.node.style.transform = `translate3d(${(d.x - cam) * unit}px, ${-(d.y - camY) * unit}px, 0)`;
                if (d.labelNode) {
                    // The name is up long enough to read and then goes, so a floor full of old loot does not
                    // become a wall of text over the fight.
                    const age = now - (d.restAt || now);
                    d.labelNode.style.opacity = d.state === "rest" && age < LOOT_LABEL_MS
                        ? String(Math.min(1, (age / 220)) * Math.min(1, (LOOT_LABEL_MS - age) / 400))
                        : "0";
                }
            }

            // ── PARTICLES AND NUMBERS ───────────────────────────────────────────────────────────
            for (let i = w.pops.length - 1; i >= 0; i -= 1) {
                const p = w.pops[i];
                const age = now - p.born;
                if (age > p.life) { p.node?.remove(); w.pops.splice(i, 1); continue; }
                stepPop(p, dt);
                const k = age / p.life;
                // ⚠️ THE PUNCH IS A SCALE ON THE SAME TRANSFORM AS THE ARC, NOT A CSS ANIMATION. The loop
                // writes this element's transform every frame, so a keyframe animation on it would be
                // overwritten sixty times a second and never be seen — the same trap as the mirror inside
                // the sway keyframes. Both the arrival punch and the hit's weight multiply into one scale.
                const sc = (popScale(age) * (p.weight || 1)).toFixed(3);
                p.node.style.transform =
                    `translate3d(${(p.x - cam) * unit}px, ${-(p.y - camY) * unit}px, 0)`
                    + ` scale(${sc}) rotate(${p.tilt || 0}deg)`;
                // Held bright, then dropped — a number that fades from frame one is never read.
                p.node.style.opacity = String(k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4);
            }
            for (let i = w.sparks.length - 1; i >= 0; i -= 1) {
                const s = w.sparks[i];
                const age = now - s.born;
                if (age > s.life) { s.node?.remove(); w.sparks.splice(i, 1); continue; }
                const k = age / s.life;
                if (!s.ring) {
                    s.vy -= s.g * dt;
                    s.x += s.vx * dt;
                    s.y += s.vy * dt;
                    s.node.style.transform =
                        `translate3d(${(s.x - cam) * unit}px, ${-(s.y - camY) * unit}px, 0) scale(${1 - k})`;
                } else {
                    s.node.style.transform =
                        `translate3d(${(s.x - cam) * unit}px, ${-(s.y - camY) * unit}px, 0) scale(${0.3 + k * 2.4})`;
                }
                s.node.style.opacity = String(1 - k);
            }

            // ── THE BACKDROP ────────────────────────────────────────────────────────────────────
            // Wrapped on TWO tiles rather than one, because the mirroring has a period of two: tile 0 is
            // the painting, tile 1 is its reflection, and only after both has the pattern repeated.
            //
            // ⚠️ AND THE WRAP HAS TO BE A POSITIVE MODULO, WHICH JS'S % IS NOT. cam is clamped at
            // -CAM_OVERSCAN, not at 0 — so on entering a zone, where the hero spawns at the far left and
            // the camera is pinned to its overscan, `cam * unit % period` came out NEGATIVE and the strip
            // translated the wrong way: it slid right off its own left edge and showed bare scene down the
            // side of the frame. It was about 38px of it at the old 0.38 and would be ~100px at 1:1, on
            // every single zone entry. Floor the offset into [0, period) and the strip always starts at or
            // left of the frame, which is what the five-tile budget in check-grove.mjs assumes.
            if (w.skyNode) {
                const period = tileW * 2;
                const raw = cam * unit * SKY_PX;
                const offX = period > 0 ? ((raw % period) + period) % period : 0;
                w.skyNode.style.transform = `translate3d(${-offX}px, ${camY * unit * SKY_PY}px, 0)`;
            }

            // ── THE BARS ────────────────────────────────────────────────────────────────────────
            // Luke: "how it shows their health plummeting with their like intermediate red lerp bar."
            // ⚠️ WRITTEN STRAIGHT ONTO THE NODES. A chase bar moves every frame; through state it would be
            // sixty re-renders a second of the whole zone to animate a strip of colour.
            stepChase(w.hpBar, now, Math.max(0, w.hp) / maxHp);
            if (w.bossBar && bossFillRef.current) {
                const bfrac = Math.max(0, w.bossBar.hp) / w.bossBar.maxHp;
                stepChase(w.bossChase, now, bfrac);
                bossFillRef.current.style.width = `${w.bossChase.shown * 100}%`;
                if (bossGhostRef.current) bossGhostRef.current.style.width = `${w.bossChase.ghost * 100}%`;
                // ⚠️ AND THE BOSS BAR IS STRUCK, NOT JUST SHORTENED. Against seven thousand hit points a
                // good hit moves this bar by about a pixel and a half, so the chase pair on its own made
                // the best swing in the zone feel like the worst one. The flash, the jolt and the swell
                // are the same three the creature bars get, and they do not care how big the number was.
                if (bossStripRef.current) {
                    const bj = barHit(w.bossHurtAt ? now - w.bossHurtAt : null);
                    bossStripRef.current.style.setProperty("--gv-bf", bj.flash.toFixed(3));
                    bossStripRef.current.style.setProperty("--gv-bs", bj.swell.toFixed(3));
                    bossStripRef.current.style.setProperty("--gv-bj", `${bj.jolt.toFixed(2)}px`);
                }
            }

            // The streak. Only touched when the number actually changes, so this is not a DOM write a frame.
            if (now >= w.comboUntil && w.combo) w.combo = 0;
            if (w.combo !== w.comboShown) {
                w.comboShown = w.combo;
                const node = comboRef.current;
                if (node) {
                    const rung = comboRung(w.combo);
                    node.textContent = w.combo > 1 ? `${w.combo}x${rung ? ` ${rung.label}` : ""}` : "";
                    node.className = `gv-combo${w.combo > 1 ? " is-on" : ""}${rung ? " is-hot" : ""}`;
                }
            }

            // ── THE SCREEN REACTS ───────────────────────────────────────────────────────────────
            // A red wash on being hit, and a slow pulse while nearly dead. The one piece of feedback a
            // player cannot miss while watching their own character instead of the bar — and in a zone where
            // dying sends you back to town, "I did not notice I was low" is the complaint it prevents.
            if (vignRef.current) {
                const hurt = Math.max(0, 1 - (now - w.hurtAt) / VIGNETTE.hurtMs);
                const frac = Math.max(0, w.hp) / maxHp;
                const low = frac < VIGNETTE.lowAt && w.hp > 0
                    ? (0.22 + 0.16 * Math.sin((now / VIGNETTE.pulseMs) * Math.PI * 2)) * (1 - frac / VIGNETTE.lowAt)
                    : 0;
                // ⚠️ 0.55, NOT 0.85, AND THE CLEAR CENTRE IS WIDER. At full strength the wash covered the
                // whole frame including the middle — on film a single hit turned the entire zone red and
                // the thing you were supposed to be stepping out of went with it. A vignette has to say
                // "you are being hurt" without taking away the information you need to stop being hurt.
                vignRef.current.style.opacity = String(Math.min(0.92, hurt * 0.55 + low));
            }

            // ── AUTOSAVE ────────────────────────────────────────────────────────────────────────
            if (now - lastSettle > SETTLE_EVERY_MS && w.killLog.length) {
                lastSettle = now;
                const batch = w.killLog.splice(0, w.killLog.length);
                const ate = w.eaten; w.eaten = {};
                onSettle?.(batch, ate);
            }

            raf = requestAnimationFrame(step);
        };

        raf = requestAnimationFrame(step);
        const onVis = () => {
            if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
            // ⚠️ A HIDDEN TAB IS A PAUSE TOO, AND IT WAS NOT BEING BANKED. The loop was cancelled and
            // restarted with a fresh `last`, which fixed dt and left every absolute deadline in the past —
            // so coming back to a backgrounded Grove fired the whole respawn and every pending timer on
            // one frame. It goes through the same accumulator now.
            else if (!raf) { if (!w.pauseAt) w.pauseAt = performance.now(); raf = requestAnimationFrame(step); }
        };
        document.addEventListener("visibilitychange", onVis);

        // The tab being closed, backgrounded on a phone, or navigated away from. Fire-and-forget by design:
        // nothing can read a response after this point, which is exactly why it has to be a beacon.
        const flush = () => {
            const w2 = worldRef.current;
            if (!w2?.killLog?.length || !navigator.sendBeacon) return;
            const ate = w2.eaten; w2.eaten = {};
            const body = JSON.stringify({ action: "settle", zone: zone.id, kills: w2.killLog.splice(0), eaten: ate });
            navigator.sendBeacon("/api/marketplace/grove", new Blob([body], { type: "application/json" }));
        };
        window.addEventListener("pagehide", flush);

        return () => {
            cancelAnimationFrame(raf);
            document.removeEventListener("visibilitychange", onVis);
            window.removeEventListener("pagehide", flush);
            // ⚠️ SETTLE ON THE WAY OUT. Walking away must not throw the session's kills away — the same
            // reason the casino releases a held balance when you stand up.
            const wEnd = worldRef.current;
            if (wEnd?.killLog?.length) { const ate = wEnd.eaten; wEnd.eaten = {}; onSettle?.(wEnd.killLog.splice(0), ate); }
        };
    // ⚠️ mounted IS A REAL DEPENDENCY. The scene is portalled, so the first render returns null and
    // hostRef is still empty when this effect first runs — it takes the early return above and, without
    // mounted here, never runs again. The zone came up with the backdrop painted, the hero standing in his
    // start position and absolutely nothing happening: no spawn, no simulation, no camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mounted, world, spawn, seed, bonuses, stats, onSettle, W, zone.id, zone.boss, labScene, maxHp, belt?.id, belt?.heals, onBoss, rerender, worldAt]);

    // ── WALKING THROUGH A DOOR ──────────────────────────────────────────────────────────────────────
    // ⚠️ SETTLE BEFORE TRAVELLING, AND AWAIT IT. The kills that open the right-hand door are the same ones
    // the server has not been told about yet, so entering first means the server checks a lock that this
    // session's own kills were about to open — you would be refused at the door you just earned. The
    // unmount cleanup settles too, but that fires AFTER the new zone has been asked for, which is too late.
    // ⚠️ THE SAME FLUSH THE DOOR DOES, FOR THE SAME REASON. Walking through a gate banks the kill log
    // before the zone is swapped; opening the backpack has to bank it before the bag is read, or the panel
    // shows a snapshot from up to forty-five seconds ago. Awaited, so the panel opens onto fresh state
    // rather than refreshing underneath the player a moment after it is on screen.
    const openPanel = useCallback(async (kind) => {
        const w = worldRef.current;
        if (w?.killLog?.length) {
            const ate = w.eaten; w.eaten = {};
            // ⚠️ A FAILED SETTLE MUST NOT EAT THE TAP. This await used to be unguarded, so any rejection
            // -- a dropped request on shop wifi, a 500, a timeout -- threw out of the handler before
            // onPanel ran and the button did nothing at all. No error, no feedback, just a dock that
            // ignores you, which is half of what was reported. The settle exists to make the panel open
            // onto FRESH state; failing it is a reason to show slightly stale parts, never a reason to
            // refuse to open the backpack.
            //
            // The kills are already spliced out of the log by the call, so a rejection does not
            // double-claim them either: they are gone from the client's list whichever way this goes.
            try {
                await onSettle?.(w.killLog.splice(0), ate);
            } catch {
                /* open anyway */
            }
        }
        onPanel?.(kind);
    }, [onSettle, onPanel]);

    const travel = useCallback(async (to) => {
        if (travelRef.current) return;
        travelRef.current = true;
        // ── ⚠️ THE SWAP NEEDS COVERING, OR GOING THROUGH A PORTAL IS A JUMP CUT ────────────────────
        // Without this the zone simply becomes a different zone between two frames: new backdrop, new
        // creatures, hero somewhere else, no sense of having gone anywhere. It is the cheapest-looking
        // moment in the feature and it is the one the whole door exists to deliver.
        //
        // Two halves either side of the await. "out" floods the screen from the gate's own colour while
        // the settle and the enter are in flight — which also means the request latency stops being dead
        // air and becomes the travel. "in" clears once the new zone is standing.
        setWarp("out");
        try {
            const w = worldRef.current;
            if (w?.killLog?.length) {
                const ate = w.eaten; w.eaten = {};
                await onSettle?.(w.killLog.splice(0), ate);
            }
            // The flare has to be covering the screen before the swap, not racing it.
            await new Promise((r) => setTimeout(r, WARP_OUT_MS));
            await onTravel?.(to);
            setWarp("in");
            // ⚠️ CLEARED ON A TIMER, NOT ON AN ANIMATION EVENT. animationend does not fire if the element
            // is never painted — a backgrounded tab, a slow first frame of the new zone — and a warp that
            // never clears is a white screen with a game running invisibly behind it.
            setTimeout(() => { setWarp(null); setEntering(null); }, WARP_IN_MS);
        } catch {
            setWarp(null);
            setEntering(null);
        } finally {
            travelRef.current = false;
        }
    }, [onSettle, onTravel]);

    // ── INPUT ───────────────────────────────────────────────────────────────────────────────────────
    const onTapWorld = useCallback((e) => {
        const w = worldRef.current;
        if (!w || dead) return;
        const at = worldAt(e.clientX, e.clientY);
        if (!at) return;
        // Tapping the ground clears the target — "until you tap away".
        w.target = null;
        w.moveTo = at;
        holdRef.current = { cx: e.clientX, cy: e.clientY, id: e.pointerId };
    }, [dead, worldAt]);

    // ⚠️ WINDOW LISTENERS, NOT setPointerCapture. Capture is the obvious tool and it BREAKS MOUSE CLICKS
    // in this codebase — see pointer-capture-kills-desktop-clicks, which cost a working desktop control the
    // last time. Mounted once and gated on holdRef instead, so there is no add/remove churn per tap and
    // nothing to leak if a pointerup never arrives.
    useEffect(() => {
        const move = (e) => {
            const h = holdRef.current;
            if (!h || (h.id != null && e.pointerId !== h.id)) return;
            h.cx = e.clientX;
            h.cy = e.clientY;
        };
        // blur as well as up and cancel: a finger that leaves the window, an alt-tab, or a notification
        // taking focus all end the hold without a pointerup, and a hold that never ends is a hero walking
        // at a wall for ever.
        const end = () => { holdRef.current = null; };
        window.addEventListener("pointermove", move, { passive: true });
        window.addEventListener("pointerup", end, { passive: true });
        window.addEventListener("pointercancel", end, { passive: true });
        window.addEventListener("blur", end);
        return () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", end);
            window.removeEventListener("pointercancel", end);
            window.removeEventListener("blur", end);
        };
    }, []);

    // Dying mid-hold must not leave him walking into the death screen.
    useEffect(() => { if (dead) holdRef.current = null; }, [dead]);

    const onTapFoe = useCallback((uid) => (e) => {
        e.stopPropagation();
        const w = worldRef.current;
        if (!w || dead) return;
        const foe = w.foes.find((f) => f.uid === uid);
        if (!foe || foe.dying) return;
        foe.hit = true;        // retaliating enemies wake on being struck
        w.target = foe;
        w.moveTo = null;
        if (foe.big || foe.rare) {
            w.bossBar = { hp: foe.hp, maxHp: foe.maxHp };
            w.bossChase = makeChase(foe.hp / foe.maxHp);
            // ⚠️ AND REPAINT. This used to be setBossName, which brought a render with it; the name is a
            // field on the world now, so the bar would not appear until something else happened to
            // re-render the scene — which on a quiet screen is the next spawn, up to 45 seconds later.
            w.barName = foe.name;
            rerender();
        }
    }, [dead, rerender]);

    // ── ⚠️ ONE REF CALLBACK PER BODY, AND IT FINDS ITS OWN PARTS ───────────────────────────────────
    // Each body is four nodes — a positioned shell, a contact shadow, the sprite, and a white silhouette for
    // the hit flash — and the loop writes to each of them for a different reason. Querying them once when
    // the shell mounts keeps the render free of four separate ref props per body and keeps the loop free of
    // querySelector, which it would otherwise be doing thirty times a frame.
    const wire = useCallback((b) => (n) => {
        const body = b;
        body.node = n;
        body.art0 = n?.querySelector(".gv-art") || null;
        body.flashNode = n?.querySelector(".gv-flash") || null;
        body.shadowNode = n?.querySelector(".gv-shadow") || null;
        body.swipeNode = n?.querySelector(".gv-swipe") || null;
        body.clawNode = n?.querySelector(".gv-claw") || null;
        // The creature's own health bar: the strip, the ghost behind it, the fill, and the white strike.
        // Looked up once here rather than queried in the loop, like everything else on a body.
        body.barNode = n?.querySelector(".gv-ehp") || null;
        body.barGhost = body.barNode?.querySelector("u") || null;
        body.barFill = body.barNode?.querySelector("i") || null;
    }, []);

    // A body: shell (position) > shadow + art (facing, squash) > sprite + flash.
    const bodyArt = (art, { swipe = false, claw = false } = {}) => (
        <>
            {/* The only thing on screen that says how high off the floor a body is, which makes it the thing
                that sells "grounded". A sprite with no shadow is pasted on. */}
            <span className="gv-shadow" aria-hidden="true" />
            <span className="gv-art">
                {/* ⚠️ NO <img> AT ALL WHEN THERE IS NO URL, rather than an img that 404s. An SSR-rendered
                    broken src fires onError before React has hydrated, so a fallback wired to onError never
                    runs and the player gets the browser's broken-image glyph — which is how every card in the
                    game ended up wearing one. See img-onerror-fires-before-hydration. */}
                {art ? <img src={art} alt="" draggable={false} /> : null}
                {/* The hit flash: the sprite's own silhouette in white, masked by the art itself, with its
                    opacity driven by the loop. A flash has to be the SHAPE of the thing that was hit — a
                    white box over the sprite reads as a glitch, and a brightness filter on a dark sprite
                    barely reads at all. */}
                {art ? <span className="gv-flash" style={{ "--gv-art-url": `url(${art})` }} aria-hidden="true" /> : null}
                {swipe ? <span className="gv-swipe" aria-hidden="true" /> : null}
                {/* The pet's equivalent, and deliberately a different MARK rather than a smaller version
                    of the hero's crescent: three short claw lines across the direction of travel. Two
                    copies of one shape at two sizes is what reads as one shape stuttering. */}
                {claw ? <span className="gv-claw" aria-hidden="true"><i /><i /><i /></span> : null}
            </span>
        </>
    );

    const scene = (
        // ⚠️ THE SLAB IS A VARIABLE ON THE SCENE, NOT A src ON EACH LEDGE. A zone has up to a dozen ledges
        // and they are all made of the same thing, so one custom property inherited down is one declaration
        // and one decoded bitmap — and border-image has no src attribute to set anyway.
        <div className="gv-scene is-full" ref={hostRef} onPointerDown={onTapWorld}
            style={{ "--gv-slab": `url(${slabArt(zone.biome)})`, "--gv-slab-surface": slabSurface(zone.biome) }}>
            {/* ── ⚠️ EVERYTHING THAT IS IN THE WORLD IS INSIDE THIS ONE LAYER ────────────────────
                So the screen shake can move the world without moving the interface. The HUD, the boss bar
                and Leave are deliberately outside it: a shaking interface reads as a broken page rather
                than as impact, and Leave is the control you most need when something has gone wrong.

                ⚠️ AND NO FILTER MAY EVER GO ON THIS ELEMENT. It already carries a transform, which is a
                containing block; a filter would additionally flatten every layer of the zone to one tint.
                See filter-creates-containing-block and no-overlay-for-lighting. */}
            <div className="gv-world" ref={worldLayerRef}>
                {/* The backdrop, mirror-tiled so it can scroll. Five tiles covers any viewport plus a full
                    two-tile wrap; they share one decoded bitmap, so the extra nodes cost nothing. */}
                {/* ⚠️ BEHIND THE PLATE AND OUTSIDE .gv-sky, so it neither scrolls with the tiles nor gets
                    clipped to their height. It only shows where the world-sized plate stops short of the
                    top of the screen -- nothing at all on anything short and wide. See .gv-haze. */}
                <div className="gv-haze" style={{ "--gv-haze-img": `url(${zone.bg})` }} aria-hidden="true" />
                <div className="gv-sky" ref={(n) => { if (worldRef.current) worldRef.current.skyNode = n; }}>
                    {Array.from({ length: SKY_TILE_COUNT }, (_, i) => i).map((i) => (
                        <div key={i} className="gv-sky-t" style={{ backgroundImage: `url(${zone.bg})` }} />
                    ))}
                </div>

                {/* ── THE LEDGES ────────────────────────────────────────────────────────────────
                    The ground plank (y === 0) is skipped: the plate already paints a floor, and a bar drawn
                    over the whole width of it would hide it. */}
                {world.platforms.filter((pf) => pf.y > 0).map((pf) => (
                    <span key={`pf${pf.i}`} className="gv-ledge" ref={(n) => { pf.node = n; }} aria-hidden="true">
                        {/* The painted slab, three-sliced so the ends keep their shape at any ledge width.
                            A separate element from the ledge box on purpose: border-image needs a real
                            border, and a border would inset the padding box that the decorations below
                            position their percentages against. */}
                        <i className="gv-slab" />
                        {/* ⚠️ left IS A PERCENT OF THE LEDGE, WHICH IS WHY THE LOOP NEVER TOUCHES THESE.
                            The loop rewrites a ledge's pixel width every frame; anything positioned in
                            percent of it rides along for free. In pixels this would be a second list for
                            the loop to walk, sixty times a second, to say something it already knows. */}
                        {(pf.dec || []).map((d, i) => (
                            <span key={`d${i}`} className={`gv-dec is-${d.t}`} style={{ left: `${d.at * 100}%` }}>
                                <img src={d.t === "h" ? hangArt(d.art) : sitArt(d.art)} alt="" draggable={false}
                                    style={{ "--gv-ds": d.s, "--gv-df": d.f, animationDelay: `-${d.d}ms` }} />
                            </span>
                        ))}
                    </span>
                ))}

                {/* ── THE TELEGRAPHS ───────────────────────────────────────────────────────────
                    Luke asked for attacks that "telecast where they will damage". The fill sweeps over the
                    attack's own wind-up, so what is on screen IS the window you have — the duration is set
                    inline from the attack rather than guessed at in the stylesheet. */}
                {world.tels.map((t) => (
                    <span key={t.uid} className={`gv-tel is-${t.kind}`} ref={(n) => { t.node = n; }}
                        style={{ animationDuration: `${t.ms}ms` }} aria-hidden="true" />
                ))}

                {/* Loot on the floor: the item's own sprite and a name you can read, per Luke's note.
                    The drawn tier-stone stays as the fallback for anything with no art yet — a new part
                    added without a sprite should land on the floor looking like loot, not like a hole. */}
                {world.drops.map((d) => (
                    <span key={d.uid} className={`gv-drop t${d.tier || 1}${d.emblem ? " is-emblem" : ""}${d.rare ? " is-rare" : ""}${d.band ? ` is-${d.band}` : ""}${d.rareRow ? " is-rarerow" : ""}`}
                        ref={(n) => { const dd = d; dd.node = n; dd.labelNode = n?.querySelector("b") || null; }}
                        aria-hidden="true">
                        {d.art ? <img src={d.art} alt="" /> : <i />}
                        <b>{d.label}</b>
                    </span>
                ))}

                {/* ⚠️ BEFORE THE CREATURES AND THE HERO, so a door never paints over something you need
                    to hit. Document order is the whole stacking rule in this layer. */}
                {world.doors.map((dr) => {
                    // ── ⚠️ LOCKED BY WHAT THE SERVER WILL ALLOW, NOT BY WHAT WE HAVE COUNTED ──────
                    // groveEnter refuses any zone past unlocked_n. This used to read killsHere < toUnlock
                    // instead -- the client's own optimistic tally, which includes kills the server has
                    // not banked yet and kills the rolling ceiling may trim. The two disagree exactly
                    // when it matters, and the result was an open-looking portal that answered "That one
                    // is still closed." Luke: "the portal keeps showing it can go through even when I
                    // dont have enough."
                    //
                    // The counter above still runs on the optimistic number, because that is a progress
                    // readout and should move on the kill. The DOOR is a rule, and a rule has to match
                    // the thing enforcing it.
                    const locked = dr.side === "on" && dr.to > unlockedN;
                    // ── ⚠️ WHAT IS OWED CHANGES ONCE THE ZONE IS CLEARED ──────────────────────
                    // Before the clear it is kills, floored at one: the server may not have banked
                    // the last few even when the local tally has got there. After it, the only gate
                    // left is the boss — and a skull with "1" beside it on a door that wants a boss
                    // reads as "one more rat", which is exactly the misread that let the boss look
                    // optional in the first place. So: a number while kills are owed, and the glyph
                    // alone once the thing you owe is a creature.
                    const owed = Math.max(0, zone.toUnlock - killsHere);
                    const need = owed > 0 ? Math.max(1, owed) : null;
                    return (
                        <button key={dr.side} type="button"
                            className={`gv-door${locked ? " is-locked" : ""}${
                                dr.openedAt && Date.now() - dr.openedAt < 1400 ? " is-opening" : ""}${
                                entering === dr.side ? " is-entering" : ""}`}
                            ref={(n) => { const d = dr; d.node = n; }}
                            onPointerDown={locked ? undefined : () => { setEntering(dr.side); travel(dr.to); }}
                            aria-label={locked
                                ? (need
                                    ? `Locked — ${need} more kills to open the way on`
                                    : `Locked — defeat ${groveBoss(zone.boss)?.name || "the boss"} to open the way on`)
                                : dr.side === "back" ? "Back a zone" : "On to the next zone"}>
                            {/* ⚠️ KEYED, SO REACT REPLACES THE ELEMENT RATHER THAN SWAPPING ITS src.
                                A CSS animation on an element that merely changed attribute does not run
                                again — the chains would vanish and the gate would light up with no beat
                                between them. A new element animates from nothing, which is the point. */}
                            <img key={locked ? "locked" : "open"}
                                src={locked ? DOOR_ART.locked : DOOR_ART.open} alt="" />
                            {locked ? (
                                <span className="gv-door-need">
                                    <img src={DOOR_ART.skull} alt="" />
                                    {need ? <b>{need}</b> : null}
                                </span>
                            ) : null}
                        </button>
                    );
                })}

                {world.foes.map((f) => (
                    <button key={f.uid} type="button"
                        className={`gv-foe${f.rare ? " is-rare" : ""}${f.isBoss ? " is-boss" : ""}`}
                        style={{ "--gv-h": f.h }}
                        ref={wire(f)}
                        onPointerDown={onTapFoe(f.uid)} aria-label={f.name}>
                        {bodyArt(f.art)}
                        {/* ⚠️ THE BAR IS RENDERED FOR EVERY CREATURE AND SHOWN FOR ALMOST NONE OF THEM.
                            It is one hidden strip per body, which costs nothing, and it means the loop can
                            reveal one the instant a hit lands — building the element at that moment would
                            mean a re-render of the whole zone per hit. Visibility is a class the loop
                            toggles; see the bar block in the loop for when.

                            Not on anything that drives the banner at the top of the screen: a boss and the
                            rare spawn already have a named bar up there, and two bars for one creature is
                            the player reading the same number twice. */}
                        {f.isBoss || f.big || f.rare ? null : (
                            <span className="gv-ehp" aria-hidden="true">
                                <u /><i /><s />
                            </span>
                        )}
                        {/* ── ⚠️ WHICH OF THESE IS CARRYING WHAT YOU CAME FOR ──────────────────────
                            Luke: "above enemies which items they have that you wish for".

                            A zone holds fifteen to thirty creatures of three or four kinds and they are
                            told apart by silhouette, which works right up until the question is "which
                            one drops Thornhusk". This answers it in the one place the player is already
                            aiming. The PART's own sprite, not a generic marker: the generic marker says
                            "something you want" and a player with four things on their list still has to
                            go and check.

                            ⚠️ COMPUTED HERE AND NOT IN THE LOOP. It depends only on the creature's id and
                            the list, both of which change on a tap and never on a frame — putting it in
                            the rAF would be per-body work sixty times a second to answer a question whose
                            answer cannot have changed. */}
                        {wishHere[f.id]?.length ? (
                            <span className="gv-foe-wish" aria-hidden="true">
                                {wishHere[f.id].slice(0, 3).map((pt) => (
                                    /* eslint-disable-next-line @next/next/no-img-element */
                                    <img key={pt} src={groveArt(pt)} alt="" width={16} height={16} />
                                ))}
                            </span>
                        ) : null}
                    </button>
                ))}

                {/* ⚠️ THE PET IS RENDERED BEFORE THE HERO, SO IT PAINTS BEHIND HIM. These are absolutely
                    positioned siblings with no z-index, so document order is the entire stacking rule — and
                    with the pet last it was drawing OVER the hero's sword arm every time it caught up,
                    which made the two of them read as one lumpy object. The player's own character is the
                    one thing on screen that must never be occluded by anything friendly. */}
                <div className="gv-pet" style={{ "--gv-h": PET_UNITS }} ref={wire(world.pet)}>
                    {bodyArt(petArt, { claw: true })}
                </div>
                <div className="gv-hero" style={{ "--gv-h": HERO_UNITS }} ref={wire(world.hero)}>
                    {bodyArt(heroArt, { swipe: true })}
                    {/* ⚠️ THIS IS NOT THE BAR LUKE DELETED. That one was .gv-hp, a strip across the top of
                        the screen -- "I hate the kill display and red bar" -- and it is still gone. This is
                        the SAME over-head bar every creature in the zone already wears, on the one body that
                        did not have one, so the player reads their own health where they are already
                        looking: at their character. wire() finds .gv-ehp by itself, so the hero inherits the
                        foe bar's whole machinery -- ghost, colour bands, hit flash -- for free. */}
                    <span className="gv-ehp is-hero" aria-hidden="true">
                        <u /><i /><s />
                    </span>
                </div>

                {/* Damage numbers, sparks, dust and shockwaves are created by hand into this layer. */}
                <div className="gv-fx" ref={fxRef} aria-hidden="true" />
            </div>

            {/* The screen's own reaction. Outside the world layer so it does not shake with it. */}
            <div className="gv-vign" ref={vignRef} aria-hidden="true" />

            {/* The journey itself. Outside the world layer so it does not shake, and above everything so
                the zone can be rebuilt underneath it unseen. */}
            {warp ? <div className={`gv-warp is-${warp}`} aria-hidden="true" /> : null}

            {/* ── THE HAUL, DOWN THE LEFT ───────────────────────────────────────────────────────
                Newest at the TOP, because the row that just changed is the one being read. aria-hidden:
                every one of these also fired a pop at the collector and every one of them is banked in the
                pack -- a screen reader announcing each arrival twice is noise, not access. */}
            {world.haul?.size ? (
                <ul className="gv-haul" aria-hidden="true">
                    {[...world.haul.values()].sort((a, b) => b.at - a.at).slice(0, HAUL_ROWS).map((row) => (
                        <li key={row.key} className={row.rare ? "is-rare" : undefined}>
                            {row.art ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img src={row.art} alt="" width={26} height={26} />
                            ) : null}
                            <span>{row.label}</span>
                            {/* ⚠️ KEYED ON THE COUNT so React replaces the node and the bump animation
                                re-runs. Mutating the text of a live element does not restart a CSS
                                animation, which is the whole tell that the number went up. */}
                            <b key={row.qty}>{row.qty}</b>
                        </li>
                    ))}
                </ul>
            ) : null}

            {world.herald ? (
                <div className={`gv-herald is-${world.herald.kind}`} aria-hidden="true">
                    <i>{world.herald.kicker}</i>
                    <b>{world.herald.word}</b>
                    <u />
                </div>
            ) : null}

            {world.barName ? (
                <div className="gv-boss">
                    <b>{world.barName}</b>
                    <span ref={bossStripRef}>
                        <u ref={bossGhostRef} />
                        <i ref={bossFillRef} />
                        <s />
                    </span>
                </div>
            ) : null}

            {/* ⚠️ THE HEALTH BAR AND THE KILL COUNT ARE GONE, ON LUKE'S CALL: "I hate the kill display
                and red bar. Remove it." The count was the weaker of the two anyway — it counted THIS visit,
                starting at zero every time you walked in, while the number that actually matters is the
                running total the server has kept all along. That total is what the right-hand door shows,
                in the place where it changes what you do. */}
            {/* ── ⚠️ A CONTROL INSIDE THE SCENE MUST SWALLOW ITS OWN POINTERDOWN ────────────────
                The scene's root carries onPointerDown={onTapWorld} — tap the world, walk there — and every
                floating control is a child of it. So pressing the backpack also told the hero to walk to
                the bottom of the screen: he set off for the dock the moment the panel closed, which read
                as the pause failing to resume properly rather than as a stray walk order. onTapFoe already
                stopped propagation for exactly this reason; the HUD and the dock never did, which also
                quietly made the full-screen toggle a move command. */}
            {/* ── ⚠️ THE COUNT IS THE RUNNING TOTAL, AND IT IS AIMED AT THE DOOR ──────────────────
                Luke: "I want to see kill count on top middle of screen."

                Not the bare number it used to be -- that version was removed because a naked tally is one
                more figure on the screen that answers nothing ("I hate the kill display"). What a player
                actually wants to know is how far off the way opening is, so the count is shown AGAINST
                toUnlock and the number underneath is what is left. Once the zone is open it drops to the
                total alone, because the goal it was counting toward is gone.

                killsHere, not `kills`: the server has banked every kill from every previous session in
                this zone, and a counter that restarts at zero each visit would tell a player on their
                nineteenth kill that they had made no progress at all. */}
            <div className="gv-kills" aria-hidden="true">
                {killsHere < zone.toUnlock ? (
                    <>
                        <b>{killsHere}<i>/{zone.toUnlock}</i></b>
                        <span>{zone.toUnlock - killsHere} to open the way</span>
                    </>
                ) : (
                    <>
                        <b>{killsHere}</b>
                        <span>felled here</span>
                    </>
                )}
            </div>

            <div className="gv-hud" onPointerDown={(e) => e.stopPropagation()}>
                {belt?.id ? <b className="gv-belt">{belt.name} x{Math.max(0, beltLeft)}</b> : null}
                {canNative ? (
                    <button type="button" className="gv-leave" onClick={toggleNative}
                        aria-label={isNative ? "Leave full screen" : "Full screen"}>
                        {isNative ? "⇲" : "⇱"}
                    </button>
                ) : null}
                <button type="button" className="gv-leave" onClick={onLeave}>Leave</button>
            </div>

            {/* ── ⚠️ THE DOCK, AND IT BANKS THE KILLS BEFORE IT OPENS ANYTHING ───────────────────
                Luke: "The buttons to access crafting and backpack and map should be available when in a
                node on the Grove. Across the bottom, perhaps slightly smaller. Floating."

                It lives in the SCENE rather than in GroveClient for one reason: kills are settled in
                batches every 45 seconds, so at any moment there can be most of a minute of drops that the
                server has never heard about. Opening a backpack that is missing the last forty creatures
                you killed is worse than not having the button — and crafting off that stale bag would ask
                the workbench to spend parts the server does not yet know you own. The scene is the only
                thing holding that list, so it is the thing that flushes it. */}
            {onPanel ? (
                <nav className="gv-zdock" aria-label="The Grove" onPointerDown={(e) => e.stopPropagation()}>
                    {ZONE_DOCK.map((d) => (
                        <button key={d.k} type="button" title={d.label}
                            aria-label={d.k === "bench" && benchReady > 0
                                ? `${d.label}, ${benchReady} waiting` : d.label}
                            onClick={() => openPanel(d.k)}>
                            <img src={d.art} alt="" draggable={false} />
                            {/* ⚠️ A NUMBER ON A DOOR, NOT A PROMPT. The one thing standing between a
                                player with 93 parts and the crafting system is that nothing in the zone
                                -- where the whole session happens -- ever mentions it exists. A badge is
                                the smallest possible thing that fixes that, and the only kind of
                                teaching this game does. It counts chests too: "is there anything to go
                                and do" is one question from the player's side. */}
                            {d.k === "bench" && benchReady > 0 ? (
                                <b className="gv-zdock-n" aria-hidden="true">{benchReady > 99 ? "99+" : benchReady}</b>
                            ) : null}
                        </button>
                    ))}
                </nav>
            ) : null}

            <b className="gv-combo" ref={comboRef} aria-hidden="true" />

            {dead ? (
                <div className="gv-dead">
                    <div>
                        <b>You were overcome</b>
                        <span>Patched up back in town. The Grove keeps what you carried out.</span>
                        {/* The 2.6s before onDeath fires, said out loud. Two and a half seconds of a
                            motionless panel reads as the game having hung. */}
                        <u aria-hidden="true"><i /></u>
                    </div>
                </div>
            ) : null}
        </div>
    );

    // Nothing is rendered until mounted, because the portal needs a real document and this component
    // still server-renders.
    void gen;
    return mounted ? createPortal(scene, document.body) : null;
}

// ── ⚠️ THE LAB'S SCENES, WHICH THE SCENE USED TO IGNORE ─────────────────────────────────────────────────────
// GroveLab has passed `labScene` since it was written and this component never read the prop, so "fight",
// "boss" and "loot" all played the wander scene — the bench built to make rare moments happen on demand could
// only show the one moment that happens anyway. That is how a 380ms transition on a transform survived: the
// first 400ms of a spawn was never filmed, because there was no way to film anything else.
//
// It lives here rather than in the lab because what makes a fight happen in the first second is the hero
// standing NEXT TO something, which is a fact about the world and not a prop.
function setUpLabScene(w, scene) {
    const near = (foe, gap) => {
        const f = foe;
        // Clamped into the zone: a scene that places a creature at a negative x has it shoved back to the
        // wall by the solver, which is how three rootrats ended up standing inside the hero.
        f.x = Math.max(6, w.hero.x + gap);
        f.y = w.hero.y;
        f.vx = 0; f.vy = 0;
        f.grounded = true;
        f.face = -1;
    };
    if (scene === "fight") {
        // Two of them, one either side, both already awake — so the film opens on a swing rather than on a
        // walk, and both facings get exercised in the same shot.
        const [a, b] = w.foes.filter((f) => !f.isBoss);
        // ⚠️ GIVEN ENOUGH HEALTH TO SURVIVE BEING FILMED. A zone-one rootrat dies to one swing from a
        // mid-game kit, so the fight scene was over before the first frame and every sheet of it was a
        // picture of the aftermath. A scene exists to make the moment happen DURING the film.
        if (a) { near(a, 7); a.hit = true; a.passive = false; a.hp = 2000; a.maxHp = 2000; }
        if (b) { near(b, -9); b.hit = true; b.passive = false; b.hp = 2000; b.maxHp = 2000; }
        // ⚠️ AND THE HERO HAS TO BE TOLD TO FIGHT ONE. Without a target he auto-attacks nothing, so the
        // first film of the fight scene was twenty frames of him standing between two rootrats being bitten
        // and not swinging — which reads as the attack animation being broken rather than as the scene
        // never having asked for one.
        if (a) w.target = a;
    } else if (scene === "pet") {
        // ── THE PET FIGHTING ───────────────────────────────────────────────────────────────────────
        // The same staging as "fight" -- one creature with enough health to survive being photographed,
        // already awake, already targeted -- because what has to happen during the film is the HERO
        // swinging: the pet only joins in off the hero's own commitment to a swing, so a scene that does
        // not make him attack cannot produce a single bite.
        //
        // ⚠️ ONE CREATURE, NOT TWO. The fight scene puts one either side to exercise both facings, which
        // is right for the hero and wrong here: the pet flanks to the far side of its target, and with a
        // second creature standing there the flank lands inside another body and the thing being judged
        // (can you tell the two attackers apart) is obscured by the thing that is not.
        const [one] = w.foes.filter((f) => !f.isBoss);
        if (one) {
            near(one, 9);
            one.hit = true;
            one.passive = false;
            // Fat enough to outlive the film at a mid-game kit plus a top-rarity pet biting for a third
            // of every swing. 2000 died inside two seconds once the pet was contributing.
            one.hp = 6000;
            one.maxHp = 6000;
            w.target = one;
        }
    } else if (scene === "fetch") {
        // ── THE PET COLLECTING ─────────────────────────────────────────────────────────────────────
        // Loot on the floor, well out of the hero's own draw range, and nothing left alive to fight — so
        // the pet drops into its FETCH job on frame one and the errand is the whole shot.
        //
        // ⚠️ THE DROPS ARE PLACED, NOT KILLED FOR. The loot scene kills creatures and lets the spill
        // land where it falls, which puts most of it within six units of the hero and collected by him
        // before the pet has taken a step. These are put down by hand at a distance only the pet will
        // cover, which is the one arrangement that films the feature.
        const weak = w.foes.filter((x) => !x.isBoss);
        weak.forEach((f) => { f.hp = 1; f.passive = true; });
        for (let i = 0; i < 4; i += 1) {
            w.drops.push({
                ...makeBody({ x: w.hero.x + 13 + i * 5, y: 0, h: 2.4, halfW: 1.2 }),
                // ⚠️ A REAL PART ID, AND ITS NAME READ OUT OF THE CATALOGUE. grub_husk does not exist --
                // groveArt would have returned nothing and the shot would have been four invisible drops
                // being fetched, which photographs as the pet walking off for no reason.
                uid: `lab-fetch-${i}`, part: LAB_FETCH_PART,
                label: `1x ${grovePart(LAB_FETCH_PART)?.name || LAB_FETCH_PART}`,
                art: groveArt(LAB_FETCH_PART), state: "rest", restAt: -1e9, born: -1e9, node: null,
                grounded: true, tier: 1, rare: i === 3,
            });
        }
    } else if (scene === "loot") {
        // One hit point, so the first swing kills and the spill, the rest and the draw-in all land inside
        // three seconds of film.
        // ⚠️ THE WHOLE POPULATION, NOT FOUR OF THEM. Four creatures at one hit point die inside the first
        // second and every sheet of this scene was a picture of the aftermath — loot already resting, hero
        // already idle, and not one frame of the kill itself. A scene for filming a kill has to be able to
        // produce a kill for as long as the camera is running.
        const weak = w.foes.filter((x) => !x.isBoss);
        weak.forEach((f, i) => {
            f.hp = 1;
            f.hit = true;
            f.passive = false;
            if (i < 6) near(f, (i % 2 ? 1 : -1) * (6 + f.h + i * 2));
        });
        if (weak[0]) w.target = weak[0];
    } else if (scene === "boss") {
        const boss = w.foes.find((f) => f.isBoss);
        if (boss) {
            near(boss, 16);
            w.target = boss;
            w.bossBar = { hp: boss.hp, maxHp: boss.maxHp };
            return boss.name;
        }
    } else if (scene === "bossin") {
        // ⚠️ OUTSIDE NOTICE RANGE, WALKING IN. The "boss" scene stands the hero at reach so telegraphs can
        // be filmed, which means the arrival has already happened before the first frame — the bar and the
        // name are up and the banner has been and gone. This one puts the boss well beyond BOSS_NOTICE and
        // sends him at it, so the moment it notices him is on camera.
        const boss = w.foes.find((f) => f.isBoss);
        if (boss) {
            // ⚠️ 120 UNITS, NOT 52. The film rig settles for over four seconds before it starts capturing,
            // and the hero covers about thirteen units a second — so at 52 he had already noticed the boss
            // and the banner had been and gone before frame zero, twice. The walk has to outlast the settle.
            boss.x = w.hero.x + 120;
            boss.y = 0;
            boss.vx = 0; boss.vy = 0; boss.grounded = true; boss.face = -1;
            w.moveTo = { x: boss.x - 12, y: 0 };
        }
    } else if (scene === "juice") {
        // ⚠️ EVERY RARE BEAT AT ONCE, ON PURPOSE. Crits, haste procs, kills and loot pickups each happen
        // on their own schedule in a real zone -- a crit is one swing in five, a proc rarer still, and a
        // pickup needs something to have died first. Filmed separately that is four sheets and a lot of
        // waiting; filmed together it is one sheet that answers whether they READ APART from each other,
        // which is the actual question. Two numbers, a ring and a word all arriving in the same 200ms is
        // the case that matters, and it is the case no other scene produces.
        //
        // Health tuned so the first one dies a few frames in (loot and the death topple) while the second
        // survives the whole sheet (crits and procs keep landing after the first corpse).
        const marks = w.foes.filter((f) => !f.isBoss).slice(0, 2);
        marks.forEach((f, i) => {
            f.x = Math.max(6, w.hero.x + (i === 0 ? 3.2 : -3.4));
            f.y = w.hero.y;
            f.vx = 0; f.vy = 0;
            f.grounded = true;
            f.face = f.x > w.hero.x ? -1 : 1;
            f.passive = false;
            f.hit = true;
            f.hp = i === 0 ? 70 : 4000;
            f.maxHp = f.hp;
            // They must not kill the hero mid-film: this scene is about what HE does.
            f.dmg = [0, 0];
        });
        if (marks[0]) w.target = marks[0];
        w.moveTo = null;
    } else if (scene === "kill") {
        // ⚠️ THE OPPOSITE PROBLEM TO THE FIGHT SCENE. That one gives its creatures 2,000 health so the
        // moment lasts long enough to film; this one exists to film the moment they RUN OUT, so they get
        // just enough to survive the wind-up and die a few frames into the sheet. Too little and the first
        // frame is already a corpse; too much and the sheet ends before anything falls.
        //
        // Three of them, spread out, so one topple is never hidden behind another — and the hero kills them
        // in sequence rather than all at once, which is also what exercises the step-to-the-next-one rule.
        const marks = w.foes.filter((f) => !f.isBoss).slice(0, 3);
        marks.forEach((f, i) => {
            f.x = Math.max(6, w.hero.x + (i === 0 ? 3.2 : i === 1 ? -3.2 : 6.4));
            f.y = w.hero.y;
            f.vx = 0; f.vy = 0;
            f.grounded = true;
            f.face = f.x > w.hero.x ? -1 : 1;
            f.passive = false;
            f.hit = true;
            // Enough to take a couple of swings, not enough to outlast the sheet.
            f.hp = 60; f.maxHp = 60;
            // They must not kill the hero mid-film: this scene is about THEIR deaths.
            f.dmg = [0, 0];
        });
        if (marks[0]) w.target = marks[0];
        w.moveTo = null;
    } else if (scene === "killbig") {
        // The heavy fall, which has its own timing and its own weight class in the death kit. One creature,
        // made big, so the slow topple and the larger dust get a sheet of their own rather than being judged
        // from a rat.
        const big = w.foes.find((f) => !f.isBoss);
        if (big) {
            big.x = Math.max(6, w.hero.x + 3.6);
            big.y = w.hero.y;
            big.vx = 0; big.vy = 0;
            big.grounded = true;
            big.face = -1;
            big.passive = false;
            big.hit = true;
            // big=true is what picks the heavy weight class out of the death kit. Its HEIGHT is
            // deliberately left alone: scaling h moved the body out of the hero reach check and the
            // first film of this scene was a man swinging at nothing.
            big.big = true;
            // Dies to the first swing on purpose: the sheet is about what happens AFTER the blow, so
            // every frame spent getting there is a frame not spent on the topple.
            big.hp = 18; big.maxHp = 18;
            big.dmg = [0, 0];
            w.target = big;
        }
        w.moveTo = null;
    } else if (scene === "death") {
        // ⚠️ THE ONE MOMENT THAT CANNOT BE REACHED BY PLAYING WELL. Dying on the bench means standing a
        // hero with almost no health next to something already angry — and using a zone whose creatures
        // retaliate, because a passive rootrat will watch you stand there for ever.
        // ⚠️ AND NO FOOD. The belt auto-eats below 60% of max, and the lab kit carries five poultices —
        // so a hero dropped to 14 hit points healed himself back up on the very next frame and the scene
        // filmed a man strolling away from three creatures. The one scene about dying has to be the one
        // scene that cannot heal.
        w.hp = 14;
        w.foodLeft = 0;
        const biters = w.foes.filter((f) => !f.isBoss).slice(0, 3);
        biters.forEach((f, i) => {
            f.x = w.hero.x + (i % 2 ? 3.5 : -3.5);
            f.y = 0;
            f.vx = 0; f.vy = 0; f.grounded = true;
            f.hp = 9999; f.maxHp = 9999;
            f.passive = false;
            f.hit = true;
            f.dmg = [14, 20];
            f.nextAttack = 0;
        });
        // Hold him there: a hero with no target wanders, and he wandered out of their reach.
        if (biters[0]) w.target = biters[0];
        w.moveTo = null;
    } else if (scene === "emblem") {
        // One creature at the hero's elbow with enough health to still be dying when the camera starts.
        const victim = w.foes.filter((f) => !f.isBoss)[0];
        if (victim) {
            victim.x = w.hero.x + 2.5;
            victim.y = 0;
            victim.vx = 0; victim.vy = 0; victim.grounded = true; victim.face = -1;
            victim.hp = 420; victim.maxHp = 420;
            victim.hit = true; victim.passive = false;
            w.target = victim;
        }
    } else if (scene === "door" || scene === "unlock" || scene === "travel" || scene === "gate") {
        // ⚠️ THE FAR WALL, WHICH NO AMOUNT OF ORDINARY PLAY REACHES INSIDE A FILM. The way on stands at
        // the right-hand end of a zone three to seven hundred units wide, so without this the only door
        // anyone could ever photograph was the one you spawn beside. Stand him where the toll is readable.
        // ⚠️ THE WIDEST RIGHT EDGE, NOT platforms[0]. The first platform is not the ground — reading
        // its end gave a wall a few units from the origin, so Math.max(6, wall - 13) pinned the hero at 6
        // and the gate stayed three thousand pixels off the right of frame while he walked to it. The
        // probe found that in one line; two contact sheets had not.
        const wall = w.platforms.reduce((m, pf) => Math.max(m, pf.x + pf.w), 0) || w.hero.x;
        w.hero.x = Math.max(6, wall - 13);
        w.hero.y = 0;
        w.pet.x = w.hero.x - 5;
        w.pet.y = 0;

        // ⚠️ AND THE VICTIM COMES AFTER HIM, NOT BEFORE. The fixture banks toUnlock - 1 for this scene, so
        // the beat is one swing away — but the camera follows the HERO, so a creature left wherever it
        // spawned drags him away down the zone and the gate opens off screen. Placed at his elbow, the
        // door, the kill and the moment are all in the same frame.
        if (scene === "unlock") {
            const victim = w.foes.filter((f) => !f.isBoss)[0];
            if (victim) {
                // ⚠️ BETWEEN HIM AND THE GATE, not behind him. The camera follows the hero, so a victim
                // placed on his left turns him left and carries the door off the right edge at the exact
                // instant it opens — the first film of this beat was of an empty wall.
                victim.x = w.hero.x + 2.5;
                victim.y = 0;
                victim.vx = 0; victim.vy = 0; victim.grounded = true; victim.face = -1;
                // ⚠️ NOT 1 HP. At one hit point it died inside the first thirty milliseconds and every
                // frame of the film was of a door that had ALREADY opened — the same mistake the fight
                // scene made before it. Enough health for two or three swings puts the break on camera.
                // ⚠️ 420, NOT 70. The film rig only starts capturing once the page has settled, which is
                // well over a second after the simulation begins — at seventy hit points the gate had
                // already opened before frame zero, three sheets running. It has to still be dying when
                // the camera starts rolling, so the beat lands in the middle of the window.
                victim.hp = 420;
                victim.maxHp = 420;
                victim.hit = true;
                victim.passive = false;
                w.target = victim;
            }
        }
    } else if (scene === "climb") {
        // Point the hero at the highest ledge in the zone — the one thing no amount of ordinary play
        // reliably produces inside a few seconds of film, and the half of the zone that until now did not
        // work at all.
        //
        // ⚠️ AND STAND HIM AT THE FOOT OF ITS OWN STAIRCASE, not wherever he spawned. Walking two hundred
        // units along the floor to reach the bottom of the climb is thirty seconds of film of a man walking.
        // The parent chain the generator recorded is exactly the list of ledges between him and the top, so
        // its lowest rung is where the interesting part starts.
        const top = w.platforms.filter((p) => p.y > 0).sort((a, b) => b.y - a.y)[0];
        if (top) {
            let foot = top;
            while (foot.parent > 0) foot = w.platforms[foot.parent];
            w.hero.x = foot.x + foot.w / 2;
            w.hero.y = 0;
            w.pet.x = w.hero.x - 5;
            w.pet.y = 0;
            w.moveTo = { x: top.x + top.w / 2, y: top.y };
        }
    }
    return null;
}
