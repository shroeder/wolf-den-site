"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { COLISEUM_H, coliseumArt } from "@/lib/marketplace/grove-arena.js";
import { createPortal } from "react-dom";
import { GiSoundOff, GiSoundOn } from "react-icons/gi";

import GroveMenu from "./GroveMenu.js";

import {
    GROVE_ENEMIES, GROVE_RARE, GROVE_POP, spawnGapMs, GROVE_HYPER, scaledFoe, scaledRare, killCredit, groveBoss, groveSize, grovePart,
    groveArt, groveEmblem, emblemArt, emblemFace, GROVE_ZONES, groveBiome, slabArt, slabSurface, hangArt, sitArt,
} from "@/lib/marketplace/grove-catalog.js";
import { rngFrom, rollKillTimes, rollRareSpawn } from "@/lib/marketplace/grove-roll.js";
import {
    UNITS_PER_SCREEN, zoneWidth, platformsFor, decorateLedges, swing, makeTelegraph, telegraphHits, mitigate,
    BLEED_TICK_MS, BLEED_TICKS, BURN_SHARE, BURN_TICK_MS, BURN_TICKS,
    BURN_SPREAD_UNITS, BURN_SPREAD_SHARE, petBite, petBiteCd, WALK_INSET,
} from "@/lib/marketplace/grove-world.js";
// Pure files, both of them — no DB and no server-only, which is why a client scene may read them. The
// alternative was a second haste curve that drifts from the ring's the first time either is touched.
import { procFrom, HASTE_PER_POINT, STUN_PER_POINT, defendBlow } from "@/lib/marketplace/arena-kit.js";
import { SURGE_EVERY } from "@/lib/marketplace/arena-engine.js";

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
    makePop, stepPop, spillVelocity, comboRung,
    popScale, popWeight, barHit, barColor, FOE_BAR_LINGER_MS,
    HITSTOP_MS, TRAUMA, SWING, SWING_TOTAL_MS, KNOCK, RECOIL, FLASH_MS, SPAWN_FADE_MS,
    deathKit, DEATH_SINK, DEATH_OPAQUE_UNTIL, DEATH_IMPACT, HERO_DEATH, DEATH_VEIL_DELAY_MS,
    SPARK, DUST, VIGNETTE, COMBO_WINDOW_MS, COMBO_PITCH_STEPS, LOOT_BOUNCE, LOOT_REST_MS, LOOT_AUTO_MS,
    LOOT_LABEL_MS, LOOT_DRAW_ACCEL, LOOT_DRAW_MAX, LOOT_EAT_DIST,
    pouncePose, POUNCE, PET_TRAUMA_SHARE, PET_KNOCK_SHARE, PET_SPARKS,
} from "@/lib/marketplace/grove-juice.js";
import { footOf } from "@/components/grove/grove-foot.js";
import {
    playHit, playKill, playHurt, playDrop, playPickup, playWhiff, playTell, celebrateUnlock, playEmblemDrop, playBossNotice, playDeath,
    playPetHit, playQuaff,
    playFreeze, playStun, playChill, playCataclysm, playSoulfire, playSurge,
    playGuard, playBlock, playRiposte, playGrudge, playIgnite, playWild,
} from "@/components/grove/grove-sfx.js";
// ── THE ZONE'S MUSIC ────────────────────────────────────────────────────────────────────────────────
// A bed per zone, synthesised from the map's mode, the biome's voices and the depth — see grove-music.js
// for the long version. Three things reach it from here: which zone we are standing in, how badly it is
// going, and whether something large has noticed. Nothing else in this file needs to know it exists.
import {
    duckGroveMusic, setGroveBoss, setGroveDanger, startGroveMusic, stopGroveMusic,
} from "@/components/grove/grove-music.js";
// The room's one sound switch, and it is the ARENA's flag rather than a second one — the casino learned
// that two mutes which can disagree is a worse bug than no mute at all, and the Grove had no way to find
// out the sound had been turned off on another screen weeks ago, let alone turn it back on.
import { isMuted, setMuted, unlock } from "@/components/arena/arena-audio.js";
// ── ⚠️ THE GEOMETRY LIVES IN ITS OWN FILE SO IT CAN BE CHECKED ─────────────────────────────────────
// Every distance that is really a SHARE OF THE FRAME is in grove-view.js, with the long version of why. The
// short version: three such distances were written here as bare constants tuned for a 100-unit frame, and all
// three broke silently when the frame became 26 units. scripts/check-grove.mjs now runs these functions across
// the real viewport sizes and asserts the hero and the pet are on screen, which no amount of reading the
// component would have told anyone.
import {
    HERO_UNITS, PET_UNITS, SKY_PX, SKY_PY, SKY_TILE_COUNT,
    viewFor, petFollow, cameraX, cameraY, fetchRangeFor, bossNoticeFor, petLostFor,
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

// ── THE IN-ZONE MENU ─────────────────────────────────────────────────────────────────────────────────────────
// ⚠️ FAMILIES, NOT A ROW. This was ZONE_DOCK -- the same six sprite circles as the hub, floating across the
// bottom of the frame, which is where the creatures are. Luke: "I don't like the floating buttons, lets make
// a true families menu for the grove, maybe it slides out from the left."
//
// The grouping is the point and it is the same on the hub, so a player learns one menu: where you GO, what
// you CARRY, what you MAKE. Six identical circles said none of that and had nowhere to put a word, which is
// why the only way to find out what the anvil opened was to press it.
//
// ⚠️ SAME KEYS AS BEFORE. openPanel is unchanged and still flushes the kill batch before anything opens --
// see the note at the markup. The arrangement moved; the wiring did not.
const ZONE_FAMILIES = [
    // ── ✂️ THE "Do" FAMILY AND ITS QUESTS ROW WERE HERE ─────────────────────────────────────────
    // It outlived its panel by a day. The quest client went on 2026-11-08 and this row did not, so the
    // zone dock kept a door that opened onto nothing -- a dead button in the live game, which is worse
    // than the missing feature it pointed at. The hub's own menu had already dropped the row; only the
    // zone copy was left, which is exactly the failure the two lists being hand-kept invites.
    //
    // Eric, 2026-11-09: "remove the quests option".
    {
        title: "Go", rows: [
            { k: "map", label: "Map", art: "/images/grove/ui-map.webp" },
        ],
    },
    {
        title: "Carry", rows: [
            // ✂️ BACKPACK AND GEAR WERE HERE. The Backpack had become the belt and nothing else once
            // parts went, and the belt went with the food on 2026-11-09; Gear went the same day. The
            // fighting gear is on the equipment screen, where gear lives, and the Grove tools now have
            // their own tab beside it.
            { k: "emblems", label: "Monster Cards", art: "/images/grove/ui-cards.webp" },
        ],
    },
    // ✂️ THE "Make" FAMILY WAS HERE. The dock and the hub menu carry the same families on purpose, so
    // a player learns one arrangement; both lost this row on 2026-11-08.
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

// ── ⚠️ A HIT FLASH IS TWO FIELDS, AND THEY MUST BE SET TOGETHER ─────────────────────────────────────────────
// Luke: "In the grove, sometimes the enemies flash white and stay white despite being alive and not being
// hit."
//
// The decay only runs on creatures that have a deadline:
//
//     if (f.flashUntil && now >= f.flashUntil) { f.flash = 0; f.flashUntil = 0; }
//     else if (f.flashUntil) f.flash = Math.max(0, (f.flashUntil - now) / FLASH_MS);
//
// Five places set `.flash = 1`. Two of them also set `flashUntil`. The other three — area damage, the nova
// skill and the death kit — set the brightness and no deadline, so the decay branch never looked at them and
// the creature stayed lit at full white for the rest of its life. Anything killed by a single hit looked
// fine; anything that survived an AoE tick stood there glowing.
//
// So lighting one up is a function now, and it is the only way to do it. Two fields that must agree, written
// by hand in five places, is the same shape as every other defect this week: the pairing cannot be enforced
// by remembering. `npm run check:flash` fails if `.flash = 1` appears anywhere outside this helper.
const lightUp = (foe, now, mult = 1) => {
    foe.flash = 1;
    foe.flashUntil = now + FLASH_MS * mult;
};
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
// ── ✂️ THE TALLY, AND ITS THREE CONSTANTS, ARE GONE ─────────────────────────────────────────────────────────
// Luke, 2026-11-08: "I dont want the loot noise in the grove" — and then, rather than quieting it,
// "I think we remove monster part items, remove crafting all together."
//
// It was one row per kind pinned down the left, counting up, where a row's life EXTENDED on every arrival
// rather than restarting — so a kind that kept dropping kept its row and the kind you stopped finding aged
// out on its own. HAUL_MS was 4.2s, HAUL_MAX_MS capped the renewal at 14s (without it a common part in a
// good zone renewed for ever and the tally became permanent furniture down one side of the screen, which
// is the HUD the whole Grove was built without), and HAUL_ROWS was 5, what fits above the dock on a phone.
//
// ⚠️ GEAR DOES NOT GET A TALLY TO REPLACE IT, AND SHOULD NOT. The tally existed because parts arrived in
// volume and individually meant nothing; a gear drop is one object every forty kills that already gets a
// label, a sound and a line on the settle receipt. A running list of one thing is furniture.

// How far the pet will range to collect a drop. Generous on purpose — a fetcher that only picks up what
// you were nearly standing on anyway has not saved you a single step, which is the entire feature.
// How close to its flanking spot counts as arrived. Loose enough that the pet is not nudging itself into
// position for ever against a creature that wanders, tight enough that it actually crosses over.
const PET_FLANK_SLACK = 1.6;
// And how close it has to get before the drop commits to it. Wider than the hero's LOOT_EAT_DIST because
// the pet is 4.5 units tall against his 7 and reaching rather than walking over the top of it.
const PET_FETCH_REACH = 3.2;
// What the fetch bench puts on the floor, and it is now a FIXTURE ID rather than a live one.
//
// ⚠️ IT IS STILL A PART, ON PURPOSE. Parts stopped dropping on 2026-11-08 but GROVE_PARTS survives as
// data, so grovePart and groveArt still resolve this and the pet-fetch bench still has something to film.
// A fetch test needs an object on the ground with a real sprite; what that object IS does not matter to
// the thing being tuned, which is how far the pet will range and whether the hand-off reads.
//
// ⚠️ DO NOT "FIX" THIS BY POINTING IT AT A GEAR ID. Gear art comes off the session payload through
// gearArtRef — the scene has no database and cannot look one up — so a gear id here would photograph as
// four invisible drops being fetched, which is exactly the bug the note below was written about.
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
// ── DRINKING SOMETHING YOU MADE ─────────────────────────────────────────────────────────────────────────────
// Longer than the hurt stop (70ms) that triggers it, because the heal has to outrank the hit: the player is
// being bitten, and if the two freeze for the same length the hit is what they read. Shorter than an emblem,
// which is a thousand times rarer. clock.stop never shortens a freeze already running, so the two compose.
const QUAFF_STOP_MS = 110;

// ── A CREATURE SEEING STARS ─────────────────────────────────────────────────────────────────────────────────
// The ring spends a stun as "the defender loses their NEXT swing". A zone has no turns, so it is a duration --
// and an ordinary creature's attack cadence is 1800-3400ms, which makes this a little under half of one. Long
// enough to be worth the stat and to be clearly seen, short enough that a high-stun build does not simply
// switch the zone off.
//
// ⚠️ THE HERO HAS CARRIED STUN POINTS FROM GEAR SINCE THE GROVE SHIPPED AND NOTHING READ THEM. This is not
// only the two class nodes: every weapon and jewel that ever granted stun was inert in here too.
// Below this share of maximum health the hero himself shows it. A quarter, which was originally chosen
// to sit UNDER the belt's 60% eat so the band was not lit for most of a fight. The belt is gone and
// nothing heals mid-zone now, so the number is no longer pinned to anything -- it is simply the share at
// which being in trouble should be visible, and it is free to be retuned on its own merits.
const HERO_LOW_SHARE = 0.25;

// ── ⚠️ THE DOCK STANDS IN THE BEST PART OF THE SCREEN ───────────────────────────────────────────────────────
// Luke: "I dont like the floating buttons, wonder if there is a way to put them somewhere accessible but not
// take up primo real estate."
//
// Moving them is the obvious answer and it is the wrong one: every edge of a side-scroller is carrying
// something already -- the way out at the top, the haul list on the left, the kill count in the
// middle -- and the bottom centre is where a right thumb actually rests, which is why they went there.
//
// The real observation is that you never want the backpack DURING a fight. So the dock gets out of the way
// while you are swinging or being hit and comes back the moment you stop, which costs the player nothing and
// hands the busiest part of the screen back for exactly as long as the fight lasts. It never fully
// disappears -- a control that vanishes is a control people stop believing in -- and it stops taking taps
// while it is faint, so a thumb reaching into the fight cannot open a backpack by accident.
const DOCK_QUIET_MS = 1600;
const DOCK_FIGHT_OPACITY = 0.22;
// How often a burning body throws embers. Not every frame: thirty bodies at sixty hertz would be
// thousands of nodes a second to build and bin, and fire does not read any better for it.
const EMBER_EVERY_MS = 150;
const STUN_MS = 1400;
// A freeze is a stun that holds longer -- the ring's own note calls it "the Runecaller's two seconds".
const FREEZE_MS = 2000;

// ── ⚠️ A LOCK THAT RENEWS ITSELF IS NOT A CONTROL EFFECT, IT IS THE END OF THE FIGHT ────────────────────────
// That sentence is the ring's, written after Luke reported "getting stunned and frozen to the point where i
// just insta die". The Arena answers it with controlImmune: one beat off the board buys you the next one
// through.
//
// The Grove shipped its stun without any such rule, and the bench proved the consequence immediately -- at a
// pinned certainty the creature stood permanently stunned, never acting again. The locked party here is a
// rootrat rather than a member, so it is not unfair; it is worse than that, it is the zone switching itself
// off. A build that can perma-lock has removed the game it was bought to play.
//
// So a creature that has just been held cannot be held again until this has passed. Chill is deliberately
// NOT covered: a slow is a degree, not a lost turn, and the ring draws the same line.
const LOCK_IMMUNE_MS = 1100;

// How long a chill takes to wear off, and what it does. The node says "slows their turn bar, and the cold
// wears off over eight seconds; it stacks, and nothing caps it" -- the turn bar IS the attack cadence here,
// so that is the thing it stretches. Movement is left alone on purpose: the solver owns it, and a creature
// that walks in treacle reads as the game lagging rather than as the player having done something.
const CHILL_FADE_MS = 8000;
// A ceiling the node does not have, because the ring's turn bar cannot stall for ever and a cadence can.
// At a maxed 10% a blow, this is reached after about seven landed blows.
const CHILL_MAX = 0.75;

// Thrown harder than ordinary loot so it hangs at the top of its arc while the ring and the sparks resolve
// underneath it. LOOT_SPILL.up is 0.62; this is the one drop allowed to upstage the rest of the pile.
const EMBLEM_THROW = 1.15;

// ── A BOSS NOTICING YOU ──────────────────────────────────────────────────────────────────────────────────────
// Further out than its own reach (26) so the announcement lands while you are still deciding to approach,
// not once you are already inside the fight.
// Matches the herald's CSS animation. A banner cleared on a timer rather than on animationend, because
// animationend never fires if the element is not painted, and a banner that never clears is a word
// sitting across the middle of a fight.
const HERALD_MS = 2200;

// ── DYING ────────────────────────────────────────────────────────────────────────────────────────────────────
// The longest hold in the feature, because it is the only one with nothing after it. A boss kill stops for
// How long the dealt card stays up. Long enough to read the creature, the name and what it gives — three
// things — and short enough that it is gone before the next wanderer closes. Measured against the fight
// rather than chosen: at 1.2s the card was still on screen when a replacement spawned and walked under it.
const TROPHY_HOLD_MS = 2100;

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


// ── ⚠️ A CREATURE IS RENDERED ONCE AND THEN LEFT ALONE ──────────────────────────────────────────────────────
// Luke: "when I kill like more than one thing, the game freaking like lags out and freaking like stutters big
// time."
//
// A kill changes w.foes.length, which calls rerender(), which re-rendered this list — and every surviving
// creature's whole subtree with it: shell, shadow, sprite, hit flash, status layer, health bar and wish
// icons, thirty times over, several times during a multi-kill. Profiled at 6x CPU throttle that is what is
// left at the top of the frame once the forced layout reads are gone: ReactElement, world.foes.map,
// batchedUpdates, getNearestMountedFiber.
//
// Nothing about a creature's MARKUP changes while it lives. Its position, facing, flash, status and health
// are all written straight onto its nodes by the frame loop, which is why this file keeps bodies in refs
// rather than state in the first place. The only thing a kill genuinely changes is which creatures exist.
//
// So the subtree is memoised and every prop is stable for the creature's lifetime: the ref and the tap
// handler are cached per uid by the parent rather than allocated fresh each render, because a new closure
// in either one is a changed prop, and a changed prop defeats memo entirely. A re-render now walks the list
// and bails out on everyone still alive.
//
// ⚠️ THAT MEANS REACT WILL NOT REPAINT A LIVING CREATURE. Anything that must change about a body while it
// lives belongs on the loop's side -- a class or a style the loop writes -- exactly as .gv-status and
// .gv-ehp already are. Adding a prop here that changes during a life would silently stop updating.
const FoeBody = memo(function FoeBody({ art, h, rare, isBoss, big, name, onDown, refCb }) {
    return (
        <button type="button"
            className={`gv-foe${rare ? " is-rare" : ""}${isBoss ? " is-boss" : ""}`}
            // ⚠️ THE SPRITE URL RIDES ON THE SHELL so the status layer can mask to the creature's own
            // silhouette, the way .gv-flash already does. A condition painted as a rectangle over the body
            // is far worse than no condition at all.
            style={{ "--gv-h": h, "--gv-art-url": art ? `url(${art})` : undefined }}
            ref={refCb}
            onPointerDown={onDown} aria-label={name}>
            {bodyArt(art)}
            {/* Rendered once and never touched by React again: the loop owns its className outright. */}
            <i className="gv-status" aria-hidden="true" />
            {/* One hidden strip per body, revealed by the loop the instant a hit lands. Building it at that
                moment would mean a re-render of the whole zone per hit. */}
            {isBoss || big || rare ? null : (
                <span className="gv-ehp" aria-hidden="true">
                    <u /><i /><s />
                </span>
            )}
            {/* ✂️ THE WISHLIST BADGE WAS HERE — up to three wishlisted part sprites over a creature that
                carried one, so you could pick a target out of nineteen bodies by what it was holding. */}
        </button>
    );
});

export default function GroveScene({
    // ✂️ `npcHere` and `onTalk` were here — the quest giver standing in this zone, and the tap that
    // opened his dialogue without leaving the world.
    // ── ⚠️ THE COLISEUM IS A PLACE YOU WALK TO NOW ──────────────────────────────────────────────
    // Luke asked where the Coliseum and its NPC were, and the honest answer was NOWHERE: the arena
    // existed, the marshal was drawn, and the only way in was a card in the quest panel that showed
    // up identically in all twelve zones. "Coliseum · zone 7" was a line of text about a place that
    // was not rendered. So the gate and the marshal stand in that zone, and you reach them the same
    // way you reach anything else here — by walking.
    //
    // Null in every other zone, and null during a run: an arena has no doors (see the note on them)
    // and a way back out mid-clock is the exact misclick that note exists to prevent.
    coliseumHere = null,
    // ⚠️ TWO HANDLERS, BECAUSE THEY ARE TWO DIFFERENT ACTS. Tapping the BUILDING means "in, now" — you have
    // already decided. Tapping the MARSHAL means "tell me about this". One handler for both is what made a
    // tap on a man standing in a field silently spend a key and start a timed fight.
    onColiseum,
    onMarshal,
    // ── ⚠️ THE COLISEUM IS THIS SAME SCENE, DELIBERATELY ────────────────────────────────────────
    // Luke: "there's no special rules in the Coliseum. It's the same as if you were killing them."
    // So it reuses the combat rather than reimplementing it — a second copy of swings, multi-kill and
    // loot would drift from this one the first time either was touched. What `arena` changes is the
    // FRAME: a contained floor instead of a scrolling zone, waves instead of a drip, a clock.
    //
    // Every branch below is guarded on it, so with arena null this file behaves exactly as it did.
    arena = null,
    waves = null,
    onWave,
    onRunEnd,
    // Chests a finished run left on the ground. Rows rather than scene state, so closing the tab
    // mid-collection is not how you lose what you just earned — see migration 500.
    groundChests = null,
    onOpenChest,
    // ── ⚠️ THE KILL BAR, AND IT IS A PROP RATHER THAN SCENE STATE ───────────────────────────────
    // The server owns it: it ticks on settle, off the clamped kill count, because it is the one place
    // in the Grove where kills convert into chests. The scene cannot be allowed an opinion about how
    // full it is, or the meter would disagree with the rewards — so this is read-only and arrives from
    // groveEnter on the way in and from every settle response after that. See grove-bar.js.
    bar = null,
    zone, seed, bonuses, stats, heroArt, petArt, labScene, bagRoom = null, gearArt = null,
    // ⚠️ ONE NUMBER, ALREADY MULTIPLIED OUT, AND NOT THE RARITY AND LEVEL IT CAME FROM. The share of a
    // hero swing this member's companion bites for, computed on the server in heroLook (grove.js) off the
    // equipped pet's rarity and its pet-XP level. Handing the scene the two inputs instead would have put
    // the balance table in the client, where a tampered one could claim to be primordial — and would have
    // meant two places that know how rarity becomes damage. 0 means no pet equipped, and the resolver
    // reads that as "do not bite", not as "bite for nothing".
    petBite: petShare = 0,
    onSettle, onBoss, onLeave, onDeath, onTravel, onPanel, paused = false, unlockedN = 1,
}) {
    const hostRef = useRef(null);
    const worldLayerRef = useRef(null);
    const fxRef = useRef(null);
    // The Coliseum gate and its marshal. Refs rather than world bodies: they never move, never take a
    // hit and never die, so the only thing the loop owes them is the camera transform.
    const colGateRef = useRef(null);
    const colNpcRef = useRef(null);
    // ⚠️ THE QUEST GIVER IS A PLACE IN THE ZONE, NOT A SPOT ON THE SCREEN. See the note in the camera loop
    // beside colX, which named this exact defect before Luke hit it: "Anything positioned in PERCENTAGES
    // would sit still while the world moved underneath it — which is what the quest giver does today, and
    // the reason he reads as part of the HUD rather than part of the room."
    const npcRef = useRef(null);
    // ⚠️ hpRef / hpGhostRef ARE GONE WITH THE ELEMENT THEY POINTED AT. The player's own bar was removed
    // on Luke's call ("I hate the kill display and red bar. Remove it.") and these two refs stayed behind,
    // written to by the loop every frame against null for ever after. Declared but never mounted: see the
    // lint gate of the same name. The screen's own red wash is the hero's health readout now.
    const bossStripRef = useRef(null);
    const bossFillRef = useRef(null);
    const bossGhostRef = useRef(null);
    const comboRef = useRef(null);
    // The in-zone dock, so the loop can get it out of the way during a fight. See the fade below.
    const zdockRef = useRef(null);
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
    // ── ⚠️ THE TROPHY, SHOWN. A trophy is about one kill in four hundred, it is carved with the creature's
    // own mark, and at the moment it dropped the player saw a twenty-pixel dark blob arc across a
    // green forest and a thin grey label. Filmed frame by frame it was indistinguishable from picking up
    // a twig. The collectible had a face the whole time and the drop never showed it.
    //
    // Held in React rather than on the world object because it OUTLIVES the frame that caused it: the
    // card stays up while the fight carries on underneath, and the loop must not own something whose
    // lifetime it does not control.
    const [trophy, setTrophy] = useState(null);
    // ── ⚠️ THE COLISEUM HAD NO CLOCK AND NO WAVE NUMBER ON SCREEN ──────────────────────────────────
    // Luke, 2026-11-12: "I'm in the collusium and I dont see s timer or wave number."
    //
    // Neither existed. The run is twelve waves against a two-minute clock and the chest it pays is a
    // function of waves cleared (chestsFor), so the one number that decides the reward was invisible and
    // so was the one that decides how long you have to earn it. `onWave` has been firing since the arena
    // shipped — into GroveLab, a debug surface, and nowhere else. Another [[declared-but-never-read]].
    //
    // ⚠️ SPLIT ON PURPOSE: the WAVE is React state because it changes twelve times in two minutes, and
    // the CLOCK is written straight to a DOM node by the loop because it changes sixty times a second.
    // Putting the clock in state would re-render the whole scene every frame, which is the one thing
    // this file is built to avoid — the same rule as .gv-status and .gv-ehp on the bodies.
    const [waveNow, setWaveNow] = useState(0);
    const clockRef = useRef(null);
    const [menuOpen, setMenuOpen] = useState(false);
    // ⚠️ KEYED ON THE TROPHY ITSELF so a second emblem during the first one's hold restarts the moment
    // rather than being swallowed — rare twice in a row is the best thing that can happen and must not
    // read as the second one failing to drop.
    useEffect(() => {
        if (!trophy) return undefined;
        const t = setTimeout(() => setTrophy(null), TROPHY_HOLD_MS);
        return () => clearTimeout(t);
    }, [trophy]);
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
    // ✂️ beltLeft, beltAte AND beltCount WERE HERE, with a long note about keeping the chip's count in
    // step with a craft made mid-dive. The bench went on 2026-11-08 and the belt itself on 2026-11-09.
    // ⚠️ A REF, NOT THE PROP. The kill handler runs inside the animation loop's closure, which is created
    // once — reading `gearArt` directly there would capture whatever it was when the scene mounted and keep
    // using it after a zone change. Same reason every other live value in this file is a ref.
    const gearArtRef = useRef(gearArt || {});
    useEffect(() => { gearArtRef.current = gearArt || {}; }, [gearArt]);

    // ── ⚠️ THE LIST IS STATE; THE POSITIONS ARE NOT ─────────────────────────────────────────────────
    // The first version pushed foes into world.foes imperatively and React was never told, so the zone
    // rendered with zero enemies in it while the simulation happily ran thirty of them. The split that
    // works is by FREQUENCY: the population changes on a spawn or a death — a few times a minute — so it
    // is state; a position changes sixty times a second per body, so it stays a ref and is written
    // straight onto the node.
    const [gen, bumpGen] = useState(0);
    const rerender = useCallback(() => bumpGen((g) => g + 1), []);

    // ⚠️ THE FLUSH GUARD CLEARS WHEN THE SERVER ANSWERS. `fills` only moves when a reward was actually
    // paid, so this re-arms on the payout rather than on any old refresh — which is what stops one full
    // bar firing a settle on every frame until the response lands. See the flush in killFoe.
    useEffect(() => {
        const w = worldRef.current;
        if (w) w.barFlushed = false;
    }, [bar?.fills, bar?.kills]);

    // ── ✂️ WHAT THE CREATURES IN THIS ZONE WERE CARRYING OFF YOUR LIST ──────────────────────────
    // Up to three wishlisted PART sprites floated over any creature that dropped one, so you could pick
    // your target out of nineteen bodies by what it was carrying. Deleted with parts on 2026-11-08, along
    // with the wishlist itself.
    //
    // ⚠️ THE MEMOISATION IS THE PART WORTH KEEPING IN MIND. It was keyed by creature and built once per
    // (zone, list), because every body in the zone rendered against it and the alternative was dropsAnyOf
    // per body per re-render — the same answer recomputed for all nineteen Husks on screen. And it keyed on
    // the list JOINED rather than the array, because the hook handed back a new array identity on every
    // notify. Anything that marks up bodies by what they carry wants both of those.

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

    // ── ⚠️ THE TROPHY ART IS FETCHED BEFORE IT IS EVER NEEDED ────────────────────────────────────
    // The reveal mounts an <img> at the instant of the kill, and a 256px webp that has never been asked
    // for before takes most of a second to arrive and decode. Filmed, that is nine frames of a gold ray
    // fan spinning around an EMPTY HOLE before the amulet turns up -- which reads as a loading spinner,
    // the single worst thing the rarest moment in the feature could be mistaken for.
    //
    // There is no clever fix at reveal time, because the reveal is the first moment anything knows which
    // trophy dropped. So nothing waits: every trophy this zone's creatures can leave is pulled into the
    // browser cache on mount. It is two to four images on a screen that has already loaded a backdrop,
    // a hero, a pet and thirty creatures, and it buys the one frame that matters.
    //
    // ⚠️ THE GROUND DROP READS THE SAME URL, so this covers that too -- the amulet lying in the grass was
    // arriving just as late and for exactly the same reason.
    useEffect(() => {
        if (!mounted) return;
        const ids = new Set();
        for (const e of zone.enemies || []) {
            const em = GROVE_ENEMIES[e]?.emblem;
            if (em) ids.add(em);
        }
        for (const id of ids) {
            const url = emblemArt(id);
            if (!url) continue;
            const img = new window.Image();
            img.decoding = "async";
            img.src = url;
        }
    }, [mounted, zone.id, zone.enemies]);

    // ── THE MUSIC ────────────────────────────────────────────────────────────────────────────────
    // ⚠️ KEYED ON THE ZONE AND NOTHING ELSE. The loop effect below depends on the world, the stats, the
    // bonuses and a rerender counter, so it tears down and rebuilds many times a session — hanging the bed
    // off that would restart the music every time a panel opened. Walking through a gate changes zone.id
    // and swaps the bed; nothing else here touches it.
    //
    // ⚠️ THE FIELDS, NOT THE OBJECT. `zone` is a prop and nothing promises it is the same object between
    // renders — depending on its identity would fade the bed out and back in on any render that happened to
    // rebuild it. These five are everything grove-music reads.
    useEffect(() => {
        if (!mounted) return undefined;
        startGroveMusic({ id: zone.id, name: zone.name, map: zone.map, biome: zone.biome, n: zone.n });
        return () => stopGroveMusic();
    }, [mounted, zone.id, zone.name, zone.map, zone.biome, zone.n]);

    // Behind a panel the scene is paused, so the forest drops back rather than stopping — see
    // duckGroveMusic for why that is a gain ramp and not a stop.
    useEffect(() => { duckGroveMusic(paused); }, [paused]);

    // ── THE SOUND SWITCH ─────────────────────────────────────────────────────────────────────────
    // Read after mount, never during render: it lives in localStorage and the server has no idea what it
    // says, so touching it while rendering is a hydration mismatch.
    const [soundOff, setSoundOff] = useState(false);
    useEffect(() => { setSoundOff(isMuted()); }, []);
    const toggleSound = useCallback(() => {
        setSoundOff((was) => {
            const next = !was;
            setMuted(next);
            // A confirming sound, but only on the way ON. A sound to tell you the sound is off is a joke
            // that lands once.
            if (!next) { unlock(); playPickup(false); }
            return next;
        });
    }, []);

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
    // A Coliseum is 26 units and does not scroll; a zone is 300-700 and does. Handing the arena a zone's
    // width would put bodies off the side of a room that has no camera to follow them.
    const W = arena ? arena.width : zoneWidth(zone.n);
    // ⚠️ NEAR THE ENTRANCE, NOT MID-ZONE, AND THAT IS NOT LAZINESS. The first cut put it at W*0.5, which
    // is correct-sounding and useless: a zone is 300-700 units wide and about 20 are on screen, so a gate
    // in the middle is a hundred units of walking past nothing to reach a thing you had no reason to
    // believe was there. The whole complaint this fixes is that the Coliseum was invisible. Putting it
    // somewhere you cannot see it from either door would have fixed the data and not the complaint.
    //
    // One screen in from the back wall: you arrive from the previous zone walking right, and it comes into
    // view almost immediately, without ever sitting on top of the door you just came through.
    // ⚠️ TUNED AGAINST THE PHONE, NOT THE DESKTOP. Three positions were tried: +16 put the marshal on top
    // of the back door the hero spawns beside; +24 cleared it but pushed the building off the right edge of
    // a 390px screen, so the doorway was not visible from the spawn at all. +20, with the marshal pulled in
    // to 11 units, clears the door AND leaves the building in frame as you arrive.
    const colX = DOOR_INSET + 20;
    // Far enough from the Coliseum gate that the two never share a patch of ground, and in from the door so
    // you walk past him rather than onto him.
    const npcX = DOOR_INSET + 34;
    // ⚠️ THE ARENA BRINGS ITS OWN ROOM. The backdrop is read from zone.bg in two places — the haze behind
    // everything and the tiled sky — and an arena that only replaced the FLOOR would have put a Coliseum's
    // platforms in front of a forest. One derived source so the two cannot disagree.
    const bgArt = arena?.art || zone.bg;
    // ⚠️ ONE BIOME FOR THE WHOLE SCENE. It is read in three places — the ledge dressing, the slab art and
    // its measured surface — and an arena that overrode only some of them put mossy forest planks across a
    // lava pit. slab-char.webp has existed the whole time; nothing was asking for it.
    const sceneBiome = arena?.biome || zone.biome;
    const maxHp = stats?.maxHp || 100;


    // ── THE WORLD ───────────────────────────────────────────────────────────────────────────────────
    const world = useMemo(() => {
        const rand = rngFrom(seed);
        // ⚠️ DRESSED AT BUILD, NOT AT RENDER. Which vine hangs where is rolled here, once, off the zone's
        // own seed, and stored on the ledge — see decorateLedges. Rolling it inside the render would
        // re-roll it on every re-render, and the scene re-renders whenever a telegraph appears.
        const platforms = decorateLedges(
            arena ? arena.platforms : platformsFor(zone.n, rand),
            groveBiome(sceneBiome), rand,
        );
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
            // ⚠️ NO DOORS IN AN ARENA. A Coliseum is one room you are locked into until the clock
            // decides otherwise — a door would be a way to walk out mid-run holding a spent key, and a
            // "back a zone" arrow in a fight on a timer is a misclick waiting to happen.
            doors: arena ? [] : [
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
            // ── ⚠️ TWO NUMBERS, BECAUSE THEY ARE TWO FACTS ──────────────────────────────────────
            // `killIndex` is how many creatures have died, and it is the LOOT STREAM'S INDEX: the server
            // replays killRng(seed, i) against it to re-roll exactly what the scene showed falling, and
            // the spawner derives the next body's seed from it too. It must count bodies and nothing else.
            //
            // `killCredit` is how much of the zone has been cleared, and multi-kill means it is no longer
            // the same number — one blow worth four credits moves the door four steps and still rolls one
            // drop. Keeping one counter for both would have made an overkill pay four times the loot, which
            // is a drop-rate multiplier bolted to gear. See killCredit in grove-catalog.js.
            killIndex: 0,
            killCredit: 0,
            target: null,
            moveTo: null,
            swingAt: null,
            swingFoe: null,
            swingDone: true,
            nextRespawn: 0,
            // ── THE COLISEUM'S OWN STATE ────────────────────────────────────────────────────────
            // waveAt is how many waves have been SENT, not cleared; endsAt is the wall clock. Both are
            // null outside the arena so nothing here can affect an ordinary zone.
            waveAt: arena ? 0 : null,
            waveCleared: arena ? 0 : null,
            endsAt: null,
            runOver: false,
            eaten: {},
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
            // Full health on arrival. This is a SEED, read once when the zone is built — see the dependency
            // note below for why a later change to max HP must not re-run this.
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
    //
    // ── ⚠️ AND NEITHER stats.maxHp NOR stats.moveSpeed IS A DEPENDENCY, DELIBERATELY ─────────────────
    // They used to be, and it was invisible while gear could only be changed outside the Grove. It stops
    // being invisible the moment there is a gear panel in the zone: this memo seeds the hero at FULL health,
    // so rebuilding on a max-HP change means swapping any item at 12 hit points hands you a complete heal,
    // mid-fight, for free — and repopulates the zone on the way past. It is the same exploit the panel note
    // warns about for the backpack ("opening your bag at 12 hit points would have been a heal"), arriving
    // through a different door.
    //
    // Nothing is lost by dropping them. `maxHp` is read as its own const above and used live everywhere that
    // matters — the bar, the heal clamps, the ward cap — so a bigger pool applies the instant it is equipped
    // without the world being touched. Move speed is baked into the body at build and therefore applies from
    // the next zone; that is a fair price for not resetting the one you are standing in, and the alternative
    // is a rebuild that also respawns everything you just killed.
    // ⚠️ AND THE ARENA IS A DEPENDENCY, BUT ONLY AS A STABLE KEY. A Coliseum sits INSIDE a zone, so
    // starting a run does not change zone.n — without this the arena's floor would never be built and the
    // waves would spawn onto the zone's platforms in a room 26 units wide. But passing the object itself
    // would rebuild on every render that re-made it, which is the free-full-heal bug described above
    // arriving through a third door. The art path changes exactly when you enter or leave an arena, which
    // is precisely when the world SHOULD be rebuilt — a run does start at full health.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [zone.n, seed, arena?.art || null]);

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
    const killsHere = useMemo(() => (Number(zone.kills) || 0) + (world.killCredit || 0), [zone.kills, world, gen]);

    // ── SPAWNING ────────────────────────────────────────────────────────────────────────────────────
    // Luke: "15 to 30 enemies, fully replenishing every 45 seconds."
    const spawn = useCallback((w, now) => {
        // ── ⚠️ THE COLISEUM SENDS WAVES, NOT A DRIP ────────────────────────────────────────────────
        // A zone trickles one body every 1.5s because it is a place that is lived in. An arena is a
        // fight on a clock: the next wave arrives the instant the last one is down, because waiting is
        // the one thing a two-minute run cannot afford.
        //
        // ⚠️ IT COUNTS WHAT IS STANDING, NOT w.foes.length. A dying body is still in the array while its
        // death animation plays, so spawning on length alone would hold the next wave behind corpses —
        // the same trap the drip's `standing` filter exists for.
        if (arena && waves) {
            if (w.runOver) return;
            const standing = w.foes.filter((f) => !f.dying).length;
            if (standing > 0) return;
            if (w.waveAt >= waves.length) { w.runOver = true; return; }

            const wv = waves[w.waveAt];
            w.waveAt += 1;
            // ⚠️ THE SCENE TELLS ITSELF, not only its caller. onWave is a lab hook and was the only
            // consumer; the player needs the number more than the lab does.
            setWaveNow(w.waveAt);
            onWave?.(w.waveAt, waves.length);

            const bodies = [
                ...(wv.bodies || []),
                ...(wv.bossBody ? [wv.bossBody] : []),
                ...(wv.rareBodies || []),
            ];
            for (const body of bodies) {
                if (!body) continue;
                const i = w.killIndex + w.foes.length;
                const spot = spawnOnPlatform(w.platforms, w.rand, { minX: 2, maxX: W - 2, inset: 1.5 });
                // ⚠️ THE SAME SHAPE THE DRIP BUILDS, FIELD FOR FIELD. The first cut invented a smaller
                // object and six bodies rendered as ONE: the list is keyed on `f.uid`, which this did not
                // set, so React saw six children with the same undefined key. `foot` is what the body
                // stands on, `telegraph` and `passive` are how it fights, and without `face` it never
                // turns. A creature missing any of them is not a creature, it is a hitbox.
                const size = groveSize(body.id);
                const isBoss = Boolean(wv.bossBody && body === wv.bossBody);
                w.foes.push({
                    ...makeBody({ x: spot.x, y: spot.y, h: size.h, halfW: size.h * 0.32, speed: 0.55 }),
                    uid: `a${w.waveAt}-${i}-${Math.floor(w.rand() * 1e6)}`,
                    id: body.id,
                    rare: (wv.rareBodies || []).includes(body),
                    isBoss,
                    art: body.art,
                    foot: size.foot,
                    name: body.name,
                    hp: body.hp, maxHp: body.hp,
                    dmg: body.dmg, telegraph: body.telegraph, passive: body.passive,
                    attacks: body.attacks || [],
                    face: w.rand() < 0.5 ? -1 : 1,
                    phase: w.rand(),
                    born: now, landedAt: now, flash: 0, node: null,
                });
            }
            // ⚠️ AND TELL REACT. The loop mutates w.foes directly for speed and the drip path ends on
            // `if (w.foes.length !== before) rerender()` — which this branch returns before ever reaching.
            // The waves spawned correctly into the world and nothing drew them: the probe showed waveAt 1
            // and six bodies standing while the screen showed an empty arena. A spawn nobody is told about
            // is indistinguishable from a spawn that did not happen.
            rerender();
            return;
        }

        // ⚠️ ONE BODY PER CALL ONCE THE ZONE IS STANDING, THE WHOLE ZONE ON THE FIRST CALL. See GROVE_POP:
        // the 45 seconds is a refill RATE, and the burst reading of it left a cleared zone visibly empty for
        // most of every window. `w.want` is rolled once, by the caller, when the zone is built.
        if (!w.want) w.want = GROVE_POP.min + Math.floor(w.rand() * (GROVE_POP.max - GROVE_POP.min + 1));
        // ── ⚠️ A CLEARED ZONE REFILLS AT ONCE. WAITING IS NOT DIFFICULTY ───────────────────────────
        // Luke: "players in the Grove shouldn't have to wait for respawns. If they clear the map it should
        // respawn all."
        //
        // The drip is one body every 1.5s, so a player who cleared thirty stood in an empty zone for
        // forty-five seconds picking off arrivals one at a time. That is not pacing, it is the reward for
        // playing well being dead air — and it got worse with the new difficulty curve, because clearing
        // got faster while the refill did not.
        //
        // So: the drip still governs a zone being WORN DOWN (kill a few, a few wander in), which is the
        // texture the drip was written for. An EMPTIED zone is a different event and gets the whole roster
        // back immediately.
        //
        // ⚠️ THE BOSS DOES NOT COUNT AS POPULATION. It is pushed into w.foes like anything else, so testing
        // `w.foes.length` would read a zone containing only the boss as still populated and never refill —
        // the player would be left alone with a boss they may not be able to take, in a zone that had
        // decided it was full.
        const standing = w.foes.filter((f) => !f.isBoss && !f.dying).length;
        const room = (w.filled && standing > 0) ? Math.min(w.want, w.foes.length + 1) : w.want;
        w.filled = true;
        const before = w.foes.length;
        while (w.foes.length < room) {
            const i = w.killIndex + w.foes.length;
            const isRare = rollRareSpawn(GROVE_RARE.spawnChance, seed, i, bonuses);
            const pickId = zone.enemies[Math.floor(w.rand() * zone.enemies.length)];
            // ── ⚠️ `zone.n` IS ALREADY GLOBAL DEPTH. IT WAS BEING COUNTED TWICE ────────────────
            // This read groveDepth(zone.map, zone.n) on the stated theory that "a zone number restarts on
            // every map". That was true of the DESIGN and never true of the data: MAP_ZONES sets `n: depth`
            // (grove-maps.js), and grove.js has always treated it that way — GROVE_ZONES[zone.n] for the
            // next zone, `zone.n > unlocked_n` for the lock. Map one's twelve happen to equal their depth,
            // which is exactly why it looked right for as long as there was only one map.
            //
            // So every map after the first added its own offset a second time. Map 7 zone 1 spawned at
            // depth 145 instead of 73 — and the climb compounds at 4.48% a zone, so that is not a 2x error,
            // it is 23x the health. The whole back half of the built game was a wall nobody designed.
            //
            // Luke, on the fix: "making it easier sounds good because it's too difficult." Bosses never had
            // this — scaledFoe is the only caller and it refuses to touch a boss — so this moves wanderers
            // and the rare spawn alone. groveDepth is gone with its last caller.
            const depth = Math.max(1, Number(zone.n) || 1);
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
        const liveKills = (Number(zone.kills) || 0) + w.killCredit;
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
        // ⚠️ ONLY IF SOMETHING ARRIVED. The drip wakes this up every 1.5s instead of every 45, and a full
        // zone takes that path doing nothing -- an unconditional rerender() there is forty re-renders a
        // minute of a thirty-button list while the player stands still. The boss counts: it is pushed
        // outside the loop above, after `before` is taken.
        if (w.foes.length !== before) rerender();
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
    // How deep a ledge is DRAWN, in world units — --gv-ledge-h in grove-css.js. A tap inside that depth
    // is a tap on the slab; a tap below it is a tap on the air under the slab.
    const LEDGE_DEPTH = 2.9;

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
        // ── ⚠️ THE GRACE IS THE SLAB YOU CAN SEE, AND IT USED TO BE DOUBLE THAT ────────────────
        // Luke, 2026-11-12: "I cant get down from a platform, I'm clicking below my platform."
        //
        // He reported this once before and the fix went into navigate() — see its "going down is a
        // decision too" note. That fix is correct and still works. This is the SAME SYMPTOM FROM A
        // DIFFERENT CAUSE, one step upstream: the tap never reached navigate as a downward goal,
        // because this snap turned it into the ledge he was already standing on.
        //
        // The rule keeps the highest platform whose surface is at most `grace` ABOVE the tap, so you can
        // tap a ledge's drawn body and mean that ledge. At 6 units that reached well past the slab into
        // open air underneath it. Measured on the Coliseum's own arena (floor y=0, ledge y=11): a tap
        // anywhere from 5 to 8 — below the ledge, in plain air, where a player tapping "down" aims —
        // snapped back to y=11, navigate read the goal as the floor he was already on, and returned
        // dir 0. He stands still with the tap marker under his feet. Four units of the eleven-unit gap
        // were dead.
        //
        // ⚠️ SO IT IS THE SLAB'S OWN DEPTH, NOT A ROUND NUMBER. --gv-ledge-h is 2.9 world units
        // (grove-css.js) and that is exactly the question being asked: "did they point at the thing
        // that is drawn there?" Anything below the drawn slab is air, and air below a ledge means the
        // floor. Keep this in step with --gv-ledge-h if the art changes depth.
        const surf = w.platforms.reduce((best, p) => {
            if (x < p.x || x > p.x + p.w) return best;
            if (p.y > yRaw + LEDGE_DEPTH) return best;
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
            // ⚠️ THE ARENA IS NOT A LAB FIXTURE, IT IS THE REAL MODE. setUpLabScene builds a hand-made
            // tableau and clears the population to do it, so routing "arena" through it produced a zone
            // backdrop, the zone's platforms and NOTHING spawning — the wave driver never got a turn. The
            // arena already has its own floor, its own waves and its own clock; the lab only has to mount
            // it and get out of the way.
            if (labScene !== "wander" && labScene !== "arena") {
                // ⚠️ THE BENCH'S OWN BLOW, HANDED IN. The "multi" scene sizes its creatures against what
                // this fixture actually swings for, so the four rungs land wherever the kit is tuned
                // rather than against a number copied out of here and left to drift.
                const named = setUpLabScene(w, labScene,
                    Math.round((Number(stats?.damage) || 34) * (1 + (Number(stats?.dmgPct) || 0))));
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
        /**
         * One tick of a damage-over-time on one creature. Returns true if it died, because the caller
         * must then stop touching it -- killFoe sets `dying` and everything after that point in the loop
         * is the behaviour of something still alive.
         */
        const tickDot = (wd, f, now, kind, everyMs) => {
            const dot = f[kind];
            if (!dot || now < dot.nextAt) return false;
            const tick = Math.max(1, Math.round(dot.dmg));
            f.hp -= tick;
            f.hurtAt = now;
            // ⚠️ A WOUND IS NOT A SWORD BLOW. This passed "hit" for bleed, so the damage a Reaver's
            // whole build exists to produce arrived in the same cream as the swing that caused it —
            // invisible as a separate thing. Burn already had its own colour; bleed now does too.
            addPop(kind === "burn" ? "burn" : kind === "bleed" ? "bleed" : "hit", `${tick}`, f.x, f.y + f.h * 0.6,
                popWeight(tick, f.maxHp) * 0.7);
            if (dot.leech > 0) {
                wd.hp = Math.min(maxHp, wd.hp + Math.max(1, Math.round(tick * dot.leech)));
            }
            // ── ⚠️ FIRE CATCHES WHAT IS STANDING NEXT TO IT, ONCE ───────────────────────────────
            // The spread is the Grove's half of the Runecaller: every one of that tree's nodes is
            // written for a ring that only ever has one enemy in it. It fires on the tick rather than
            // on the blow so you SEE it jump, and `spread` is cleared on the child so a zone can never
            // chain-ignite off one roll. See BURN_SPREAD_UNITS in grove-world.
            if (kind === "burn" && dot.spread) {
                dot.spread = false;
                let best = null;
                let bestD = BURN_SPREAD_UNITS;
                for (const other of wd.foes) {
                    if (other === f || other.burn || other.dying || other.hp <= 0) continue;
                    const d = Math.hypot(other.x - f.x, (other.y - f.y) * 0.8);
                    if (d < bestD) { bestD = d; best = other; }
                }
                if (best) {
                    best.burn = { dmg: Math.max(1, Math.round(dot.dmg * BURN_SPREAD_SHARE)),
                        leech: dot.leech, spread: false,
                        left: BURN_TICKS, nextAt: now + everyMs };

                }
            }
            dot.left -= 1;
            dot.nextAt = now + everyMs;
            if (dot.left <= 0) f[kind] = null;
            // TWO PATHS FOR ONE OUTCOME ALWAYS DRIFT -- this is the sword's own killFoe, not a second
            // opinion about what dying means.
            if (f.hp <= 0) { f.hp = 0; killFoe(wd, f, now); return true; }
            return false;
        };

        // ── ✂️ THE PARTICLES ARE GONE, 2026-11-08 ──────────────────────────────────────────────
        // Luke: "Remove the particles entirely, and the ground circle effect, the boing noises, and the
        // multiplier text."
        //
        // `burst` spawned sparks and dust into the fx layer, with SPARK_BUDGET scaling the count down as
        // the array filled. Thirty-one call sites: every hit, kill, proc, ignite, block, land and skill.
        //
        // ⚠️ WHY IT CAME OUT RATHER THAN GETTING A THIRD TUNE: measured on the live page they DID render —
        // 101 at peak, 6.7px, on screen, opacity 0.8 — and still could not be seen in a real fight. Colour,
        // drag, stretch, size and a budget-starvation fix did not change that. Every node they built was
        // cost for a picture nobody was going to notice.

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
        // ⚠️ art IS OPTIONAL, AND THE BELT'S EAT IS WHY IT EVER WAS. A poultice leaving the belt was a
        // proc in every way that mattered, except that the player had MADE that one -- so the object had
        // to be in the frame rather than a word standing in for it. The eat went on 2026-11-09 and the
        // optional art stays: it is how any proc that is an OBJECT rather than an effect gets drawn,
        // and the next one will want it. Same pipeline, same ring, same shake;
        // one more child in the node. A second call-out function beside this one would drift from it.
        // ⚠️ atY IS OPTIONAL AND THE HEAL IS WHY. A proc fires on the player's own swing and has the air
        // over the hero to itself. The quaff does not: it is TRIGGERED by the blow that dropped him under
        // the line, so the red number for that blow is in the frame at the same instant and at the same
        // height, and the two drew through each other every single time. Haste keeps its tuned 0.9.
        // ⚠️ AND IT CAN RIDE SOMEWHERE OTHER THAN THE HERO. Every proc this was built for happens TO the
        // player -- haste, surge, a poultice -- so it was hardcoded to him. The conditions are the
        // opposite: a freeze, a stun, a chill happen to a CREATURE, and announcing them over the hero
        // tells the player the one thing they already know (it was them) instead of the thing they need
        // (which of thirty bodies it landed on). `on` is the body it belongs to.
        // ── ⚠️ THE NODE'S NAME IF THE PLAYER BOUGHT ONE, ELSE THE MECHANIC'S ───────────────────────────
        // Luke, twice: "I don't see my skills firing." They were firing; the zone was calling them something
        // else. Every Reaver node is a passive percentage with an ability's name — Rend is +6% bleedChance,
        // Bloodscent is +2% hasteBonus — so a member who spent five points in Bloodscent watched the word
        // HASTE come off their hero with nothing connecting the two.
        //
        // `stats.procNames` is stat -> the node they actually have ranks in (grove-kit builds it; only nodes
        // with points spent are in there, because a word you never bought appearing over your head is worse
        // than the generic one). Falls back to the mechanic for gear-granted procs and for anyone with no
        // class at all, which is the common case and must keep working.
        const procWord = (stat, fallback) =>
            String(stats?.procNames?.[stat] || fallback).toUpperCase();

        const procCall = (text, kind = "haste", art = null, atY = 0.9, on = null) => {
            const layer = fxRef.current;
            if (!layer) return;
            const el = document.createElement("b");
            el.className = `gv-proc is-${kind}`;
            if (art) {
                // Built by hand rather than with innerHTML, same as the loot pop: a food name is authored
                // data today and exactly the kind of string that later arrives from somewhere else.
                const img = document.createElement("img");
                img.src = art;
                img.alt = "";
                el.appendChild(img);
            }
            el.appendChild(document.createTextNode(text));
            layer.appendChild(el);
            // Positioned by the same pop pipeline so it rides the camera and is cleaned up with everything
            // else -- a hand-placed node here would be left behind by a zone swap.
            const src = on || w.hero;
            const pr = makePop("proc", src.x, src.y + src.h * atY, w.rand);
            pr.born = w.sceneNow ? w.sceneNow() : performance.now();
            pr.weight = 1;
            pr.tilt = 0;
            pr.node = el;
            w.pops.push(pr);
            // The ring is what makes it read as coming OUT of the hero rather than appearing above him.

            w.shake.add(TRAUMA.hit * 0.8);
        };

        // ✂️ THE GROUND RING IS GONE with the particles — the expanding circle an attack left where it
        // resolved, fourteen call sites. This was only the flash afterwards.
        //
        // ⚠️ THIS NOTE USED TO SAY "the TELEGRAPH is untouched... so attacks are still dodgeable". That was
        // true when it was written and stopped being true an hour later, when the band went too. The attack
        // still resolves and still hit-tests; nothing draws it. Corrected rather than deleted because a
        // confident stale comment is worse than no comment.


        // ✂️ skillFx IS GONE with the engine. It drew one shape per cast — slash, bolt, column, claw,
        // flurry, spray, shards, dome — as a single element riding the spark pool's lifetime loop.


        // ✂️ THE NOVA RING IS GONE with the other ground circle. It drew the AoE's edge at its REAL radius,
        // which its own note called the whole point — "an AoE you cannot see the edge of is a number
        // appearing on things you did not hit". That readability is the price of removing it, and it is
        // worth saying out loud rather than discovering later: the skill still hits exactly what it hit.
        // The skill SHAPES (slash, bolt and the rest, via skillFx) are untouched.


        // ⚠️ A NOVA MAY NOT CHAIN OFF ITS OWN KILLS FOR EVER. Bloodletting at rank five detonates every
        // corpse for 60% of its health, and in a thirty-body zone the first tap would otherwise cascade to
        // a white screen and a cleared map. Two deep: a blow kills, the corpse bursts, that burst's kills
        // burst once more, and the third generation is silent. Luke: "we don't really have to worry so much
        // about balance" — this is not balance, it is a termination condition.
        // ✂️ NOVA_MAX_DEPTH and novaDepth went too. Worth recording what they were FOR, because the
        // failure they prevented is the kind that only shows up in a full zone: Bloodletting at rank five
        // detonated every corpse, and each detonation's kills detonated again — an unbounded chain that
        // ended in a white screen and a cleared map. If any chain-on-kill mechanic is ever built again, it
        // needs a termination condition from the first line, not after someone clears a map by accident.

        // ✂️ sayOnce went with it — the once-per-cast caption guard, so a nova catching nine
        // bodies announced its name once instead of nine times.


        // ✂️ skillNova went with the engine — the AoE primitive itself. "No more aoe".


        // ✂️ nearestFoes went with it: the cleave/spread primitives' target picker.

        // ── ✂️ THE SKILL ENGINE IS GONE, 2026-11-08 ────────────────────────────────────────────────
        // Luke: "Remove all skill effects skills and the class related screens from the grove. No more aoe"
        //
        // Six primitives — nova, corpse, cleave, spread, aura, self — composed into thirty-six skills, fired
        // from eleven triggers: hit, crit, kill, killN, swingN, block, guardBreak, hurt and the rest. The
        // table that said WHAT each node did lived in grove-skills.js and is deleted with it.
        //
        // ⚠️ THIS REVERSES ITEM B OF THE FEEDBACK BACKLOG, which was built to this brief: "the whole class
        // tree and everything, that all needs to also live in a menu in the Grove... you should be able to
        // make class selections and tree decisions from that same area". That is a deliberate reversal, not
        // a regression — see the note in docs/grove-feedback-backlog.md.
        //
        // ⚠️ WHAT SURVIVES: the class's STATS. combatStats still feeds might, armour, crit, lifesteal and
        // the rest into the Grove's fighter through grove-kit, so a build is still worth what it is worth.
        // What is gone is the class DOING things — the AoE, the procs and the art that announced them.


        // ── ⚠️ ONE FUNCTION PAYS A KILL, AND BOTH CALLERS GO THROUGH IT ───────────────────────────
        // Two paths for one payout always drift — see atomic-split-into-steps-drops-lines, which this repo
        // has now paid for twice.
        // `dealt` is the damage of the blow that landed the kill — what multi-kill is measured against.
        // A damage-over-time tick passes nothing, because the fifth tick of a bleed is not one strike.
        const killFoe = (wd, foe, now, dealt = 0) => {
            const crit = foe.lastCrit;
            // ── ⚠️ IT DROPS WHATEVER IT WAS WINDING UP ──────────────────────────────────────────
            // Luke: "Ensure enemies cant attack from the dead."
            //
            // A telegraph is an entry in wd.tels that resolves on a clock of its own, and nothing here ever
            // took one back. Kill a creature mid-wind-up and its blow still landed, in full, from a corpse.
            // Worse: once the body was gone the resolver could not find the foe at all and fell through to
            // a hardcoded 5 damage, so the hit arrived from nobody.
            //
            // ⚠️ THE SAME LINE THE STUN PATH ALREADY USED, and that is the tell this was an oversight rather
            // than a decision — being frozen cancels your attack, being killed did not. Filtered rather than
            // flagged because React owns these nodes; see the identical call in `lock`.
            //
            // ⚠️ AND IT IS ABOVE THE BOSS BRANCH, which returns early. A boss dies mid-telegraph more often
            // than anything else in the game — it is the only thing that telegraphs on a cycle.
            wd.tels = wd.tels.filter((t) => t.foeUid !== foe.uid);
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
            lightUp(foe, now);
            // ── ⚠️ THE BURST AND THE NUMBER MUST NOT SHARE A POINT ──────────────────────────────
            // The kill pop goes up at foe.y + 0.7h on foe.x. Spraying the sparks from 0.45h on the same
            // x put six small bright things directly under a glyph ten times their size — see the note
            // on SPARK in grove-juice.js, where the held frame showed them eating the "3" of "1300".
            //
            // Pushed to the STRIKE SIDE and lower: the sparks now leave from where the blow landed and
            // travel away from the number rather than through it. Two separate events in two places,
            // which is what lets the eye read both.
            const hitX = foe.x + (foe.face || 1) * foe.halfW * 0.5;

            // ⚠️ DUST AT THE FLOOR, NOT AT THE BODY. A corpse disturbs the ground it falls on; thrown
            // from the body's centre it was a grey disc floating over the sprite.


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

            // ── MULTI-KILL ──────────────────────────────────────────────────────────────────────
            // Luke: "if you kill an enemy in one strike, and it does over twice their health, then it
            // counts for two kills... 4x overkill, and it counts for 4, etc."
            //
            // The rule itself is in grove-catalog.js, shared with the server — this is only the place that
            // knows how hard the last blow hit. `c` rides on the kill log entry so the settle can credit
            // the zone with it; it is left OFF an ordinary kill rather than written as 1, because the log
            // is a payload sent every forty-five seconds and a field that is always the same value on
            // ninety-odd percent of rows is bytes for nothing.
            // ⚠️ READ THE STATUS BEFORE THE BODY IS CLEANED UP. Emberheart wants to know it was burning
            // and Frostbite wants to know it was frozen, and both flags belong to a creature that is about
            // to stop existing. Captured here, handed to the skills below.
            const wasBurning = Boolean(foe.burn);
            const wasFrozen = now < (foe.stunUntil || 0);
            // ⚠️ THE SAME BONUS THE SERVER WILL SETTLE AGAINST. The Ember Mark's overkill lowers the bar
            // for a rung, and the scene must compute the same credit the settle accepts — safeCredit only
            // checks that a claim is a REAL rung, so a scene that ignored the card would show x1 while the
            // player had earned x2, and quietly under-pay the door.
            const credit = killCredit(dealt, foe.maxHp, bonuses?.overkill || 0);
            const i = wd.killIndex;
            wd.killIndex += 1;
            wd.killCredit += credit;
            wd.killLog.push(credit > 1 ? { id: foe.id, i, c: credit } : { id: foe.id, i });

            // ⚠️ AND IT HAS TO BE SEEN, OR IT IS A NUMBER CHANGING FASTER ON A DOOR. The door's readout
            // would simply jump by four with nothing to say why, which reads as a counting bug rather than
            // as a reward. Thrown straight up off the body, held a full second, with the kill chime pitched
            // up the same way the combo pitches it — a louder version of the thing that already means
            // "that one counted".
            // ✂️ A `credit > 1` BRANCH STOOD HERE and is empty now — it held the "x8" plate and playMulti,
            // both removed on Luke's instruction. The rule it recorded is still true for whatever announces
            // a multikill next: do NOT fire a second playKill. The ordinary kill chime below already plays
            // for every kill and climbs with the streak, so another on the same frame is two chimes rather
            // than one bigger one.
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
            if (way && !wd.clearFlushed && (Number(zone.kills) || 0) + wd.killCredit >= zone.toUnlock) {
                wd.clearFlushed = true;
                if (wd.killLog.length) {
                    const ate = wd.eaten; wd.eaten = {};
                    Promise.resolve(onSettle?.(wd.killLog.splice(0), ate)).catch(() => {});
                }
            }

            // ── ⚠️ THE BAR PAYS AT THE MOMENT IT FILLS, NOT UP TO 45 SECONDS LATER ──────────────
            // Luke: "When i get the full bar. Nothing happens."
            //
            // He was describing a real structural gap, not a missing animation. The bar fills from kills
            // the client already knows about, but the REWARD is granted by bumpBar inside the settle — and
            // the ordinary settle is on a 45-second timer. So the strip could sit at 250/250 with the
            // payout most of a minute away, and the moment it is supposed to celebrate had already passed
            // by the time anything arrived. A full bar that does nothing is worse than no bar.
            //
            // So crossing the line flushes immediately, exactly as clearing a zone does above and for the
            // same reason: the server has to be told NOW because something is waiting on its answer.
            //
            // ⚠️ GUARDED BY A FLAG, NOT BY THE COUNT. The pending log is spliced by the flush, so the sum
            // drops back under the line on the very next frame — but a second kill landing before the
            // response returns would cross it again against the OLD bar.kills and fire a second settle.
            // `barFlushed` clears when a fresh bar arrives (see the effect on bar.fills).
            if (bar?.need && !wd.barFlushed) {
                const pend = wd.killLog.reduce((a, k) => a + (Number(k?.c) || 1), 0);
                if ((Number(bar.kills) || 0) + pend >= bar.need) {
                    wd.barFlushed = true;
                    const ate = wd.eaten; wd.eaten = {};
                    Promise.resolve(onSettle?.(wd.killLog.splice(0), ate)).catch(() => {});
                }
            }

            // ── THE CLASS ANSWERS THE KILL ──────────────────────────────────────────────────────
            // After the log and the credit, before the loot: a corpse that bursts and takes three more
            // bodies with it must have those three counted as their own kills, which is what calling
            // killFoe recursively (depth-guarded) through skillNova gives for free.
            
            wd.killStreak = (wd.killStreak || 0) + 1;

            wd.combo = now < wd.comboUntil ? wd.combo + 1 : 1;
            wd.comboUntil = now + COMBO_WINDOW_MS;
            playKill(Math.min(COMBO_PITCH_STEPS, wd.combo));

            // The client rolls the SAME answer the server will, so the loot can spill immediately.
            // ⚠️ zone.n AND GROVE_HYPER ARE PASSED ON BOTH SIDES OR NEITHER. The server replays this exact
            // call to verify the settle (see settleKills), so an argument present here and absent there is
            // a client that celebrates a Power Scroll the settle then declines to hand over.
            // ⚠️ AS MANY ROLLS AS THE BLOW WAS WORTH, THROUGH THE SHARED FUNCTION. A multi-kill pays the
            // loot table that many times (Luke's call — see the note on rollKillTimes), and the server
            // replays this exact call at settle. The credit is the one computed for this kill above, so
            // the spill on screen and the grant in the database cannot disagree.
            const got = rollKillTimes(foe.rare ? GROVE_RARE : GROVE_ENEMIES[foe.id], seed, i, bonuses,
                zone.n, GROVE_HYPER, credit);
            // ⚠️ LAB ONLY, AND ONCE. An emblem is roughly one kill in four hundred, so the rarest moment in
            // the Grove could otherwise only be reviewed by killing four hundred things and hoping — which
            // is the same reason the boss and the climb have scenes. Guarded by labScene, which is null in
            // every build but development.
            if (labScene === "emblem" && !wd.emblemForced) {
                wd.emblemForced = true;
                got.emblem = GROVE_ENEMIES[foe.id]?.emblem || "em_grub";
            }
            // ⚠️ AND THE SAME DOOR FOR GEAR, FOR THE SAME REASON. Gear is one kill in forty on the on-ramp
            // and one in two hundred at the frontier, so "does the sword actually land on the ground" is a
            // question nobody can answer by playing. Forced from whatever this zone's table holds — the
            // first id in gearArt, which is exactly what the session says can drop here — so the lab tests
            // the real payload rather than a made-up item that would have art in no build.
            // EVERY kill, not the first one. The scene is running before a camera can be attached, so a
            // once-only force had already been spent by frame zero of every film — the sheet showed the
            // staff in the TALLY and never on the ground. Repeating it is also simply better for review:
            // several in flight at once is how you judge whether they read against the floor.
            if (labScene === "gear") {
                const first = Object.keys(gearArtRef.current || {})[0] || null;
                if (first) { got.gear = first; got.gearTier = "sup"; }
            }
            // ⚠️ EVERYTHING THAT FALLS COUNTS TOWARD THE FAN. spillVelocity spreads n drops across an arc
            // using `total`, so a count that omits one aims every piece as though there were one fewer —
            // the pieces bunch and the last one leaves the arc. It used to be dominated by the parts rows;
            // at most two things fall now, which makes the arc wide and the bug impossible to see. Kept
            // honest anyway, because it is the kind that only shows up on the rare kill nobody films.
            const total = (got.emblem ? 1 : 0) + (got.gear ? 1 : 0);
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
            // ── ⚠️ GEAR FALLS ON THE GROUND LIKE EVERYTHING ELSE ────────────────────────────────
            // It is the best thing a wanderer can drop and it was the only drop with nothing to watch.
            // Spilled through the same path as a part so it arcs, lands, waits to be walked over and
            // pops the same way — a second drop pipeline would be a second set of bugs.
            //
            // `art` comes off the session payload (see the note in grove.js), never a lookup here: the
            // scene has no database and a request per kill is the one thing this feature cannot do.
            if (got.gear) {
                const g = gearArtRef.current?.[got.gear] || null;
                if (g?.url) {
                    spill(`gear-${i}-${got.gear}`, got.gear, g.name || got.gear, {
                        art: g.url,
                        // The rarest slot throws higher and lands slower, so a super-rare reads as an
                        // event rather than as another root.
                        // "set" is rarer than "sup" and must not fall through to the quiet case —
                        // a collection piece is the rarest thing a creature drops in the whole feature.
                        band: got.gearTier === "sup" || got.gearTier === "set" ? "rare"
                            : got.gearTier === "rare" ? "band" : null,
                    });
                }
            }
            // ── ✂️ THE PARTS SPILL WAS HERE ─────────────────────────────────────────────────────────
            // One drop per row of the loot table, dressed by what made it special: a twelve-fold windfall
            // landed LOUD (`band`) because a windfall that looks like a single root is a windfall nobody
            // noticed, and a deeper-map part landed VALUABLE (`rare`). Both of those dressings, and the
            // `name`/`qty` the tally keyed on, went with the parts.

            // ── ⚠️ A HYPER OFF AN ORDINARY KILL IS THE RAREST THING IN THE FEATURE ──────────────────
            // About one kill in two thousand. It gets the emblem's treatment -- the world stops, a ring
            // goes out, the screen takes a boss-weight knock -- because a drop this rare arriving with the
            // same four pixels as a root is a rarity the player cannot feel. See [[no-pity-progress-bars]]
            // for the opposite failure; this is the one place loudness is earned.
            // ── ⚠️ GEAR, WHICH THE PLAYER COULD NOT PREVIOUSLY TELL HAD HAPPENED ────────────
            // Luke: "Playing the grove should drop gear. We designed this but never implemented it."
            //
            // It was rolling (grove-roll.js), granting (grantItem, via "grove") and landing in the bag
            // the whole time. What never existed is THIS: the drop made no sound, printed no label, and
            // did not appear on the settle receipt, so a one-in-forty event was indistinguishable from
            // killing a rat for nothing. A reward the player cannot perceive is not a reward.
            // [[reward-with-no-screen-is-not-shipped]].
            //
            // ⚠️ ONLY THE GOOD SLOTS SHOUT. Gear is one kill in forty on the on-ramp, and a name across
            // the screen with a shake and a sound every forty kills is not a moment, it is weather — and
            // the thing that would make the Grove feel slow. The normal and rare slots keep the spill
            // they already had, which is correctly sized for them; `sup` and the set piece get the
            // emblem's treatment, which puts them around one kill in four hundred and up.
            //
            // Pitched BELOW the hyper: no world-stop, a crit-weight knock rather than a boss one. The
            // hyper keeps the stop to itself because it is forty times rarer again.
            if (got.gear && (got.gearTier === "sup" || got.gearTier === "set")) {
                const art = gearArtRef.current?.[got.gear] || null;
                wd.shake.add(TRAUMA.crit);

                playEmblemDrop();
                procCall(String(art?.name || "A PIECE OF GEAR").toUpperCase(), "gear", art?.url || null);
            }
            if (got.hyper) {
                wd.clock.stop(now, EMBLEM_STOP_MS);
                wd.shake.add(TRAUMA.boss);


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


                playEmblemDrop();
                spill(`e${i}`, got.emblem, em?.name || "Emblem", // name/qty default below
                    {
                        emblem: true, tier: 6, rare: true, vy: EMBLEM_THROW, vx: 0,
                        // ⚠️ THE THING ON THE GROUND IS THE CARD. Luke: "What does it look like on the
                        // ground. It should show the sprite of the card properly." It was showing
                        // `emblem-em_*.webp` -- the carved mark -- at the same 3.2 units as a gnawed
                        // root, so the rarest drop in the feature was a small brown smudge on a brown
                        // forest floor AND it was the wrong object. A card lies on the floor as a card.
                        face: emblemFace(got.emblem), seal: emblemArt(got.emblem),
                    });
                // ⚠️ NO addPop HERE ANY MORE. The little floating name was doing the job the reveal now
                // does, and two labels for one event read as a bug rather than as emphasis.
                setTrophy({
                    id: got.emblem,
                    name: em?.name || "Emblem",
                    // ⚠️ TWO PICTURES, AND THE CREATURE IS THE FACE. See emblemFace -- the carved amulet
                    // is the SEAL on the card, not the card.
                    face: emblemFace(got.emblem),
                    seal: emblemArt(got.emblem),
                    stat: em?.stat || null,
                    per: em?.per || 0,
                    kind: em?.kind || "flat",
                    at: Date.now(),
                });
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

            // ── ⚠️ THE FRAME'S GEOMETRY, ONCE, AT THE TOP ───────────────────────────────────────
            // This used to be computed down in the camera block, which is the last thing the frame does.
            // Three of the intents ABOVE it are shares of what is visible now (fetch range, boss notice,
            // pet rescue -- see grove-view.js), and an intent that reads the scale after deciding with it
            // is reading last frame's. One read, at the top, used by everything including the camera.
            // ⚠️ THE HOST'S SIZE IS CACHED, NOT READ. clientWidth/clientHeight are LAYOUT READS: asking for
            // either one forces the browser to flush pending style changes and recompute layout before it
            // can answer. This loop writes a transform for every body, every shadow, every particle and
            // every floater, so a read placed after those writes makes the engine lay the whole scene out
            // again mid-frame -- and the cost of that scales with how many nodes are in the scene.
            //
            // Which is exactly the shape of Luke's complaint: "when I kill like more than one thing, the
            // game freaking like lags out and freaking like stutters big time." A multi-kill floods the
            // scene with corpses, sparks, loot labels and damage numbers, every one of them making the
            // forced re-layout more expensive, four times a frame. Measured at 6x CPU throttle on a
            // production build, line-level: this one line took 7695 of the profiler's samples, five times
            // the next worst, and the four reads together dwarfed everything else in the frame.
            //
            // It also explains a fix that did NOT work: capping how many particle nodes are created in one
            // frame cut creation from 180 to 70 and moved the frame times not at all, because the expense
            // was never the insertion -- it was laying out whatever already exists, over and over.
            //
            // A scene host only changes size when the window does, so it is observed instead of polled.
            const frameView = viewFor(w.hostW || host.clientWidth, w.hostH || host.clientHeight, w.topY);
            w.view = frameView;

            // ⚠️ REAL MILLISECONDS AND SIMULATION dt ARE DIFFERENT CLOCKS, AND MIXING THEM DEADLOCKS.
            // Hit-stop scales dt toward zero; anything measured in simulation frames would itself be frozen
            // by the hit-stop and never end. So: dt drives the world, realMs drives every timer.
            const realMs = Math.min(60, now - last);
            const dt = w.clock.dt(now, last);
            last = now;

            // ── ⚠️ THE ARENA'S CLOCK, AND THE ONE CALL THAT ENDS A RUN ─────────────────────────
            // Started on the first frame rather than when the scene mounts: a run whose clock began
            // while the backdrop was still decoding would hand back seconds the player never saw.
            if (arena && waves && !w.runOver) {
                if (!w.endsAt) w.endsAt = now + (arena.runMs || 120000);
                const done = w.waveAt >= waves.length && w.foes.filter((f) => !f.dying).length === 0;
                if (done || now >= w.endsAt) {
                    w.runOver = true;
                    // waveCleared is waves FINISHED, which is waveAt minus whichever one is still
                    // standing when the clock runs out. A run that timed out mid-wave did not clear it.
                    const standing = w.foes.filter((f) => !f.dying).length;
                    w.waveCleared = Math.max(0, w.waveAt - (standing > 0 ? 1 : 0));
                    onRunEnd?.({ wavesCleared: w.waveCleared, cleared: done });
                }
                // ── ⚠️ THE CLOCK IS WRITTEN, NOT RENDERED ──────────────────────────────────────
                // Straight onto the node, once a frame, which is the same reason the health flash and
                // the enemy strips are loop-owned: a seconds counter in React state is a re-render of
                // the whole scene sixty times a second for the sake of one digit changing once.
                //
                // Only when the TEXT would actually change — the node is touched about twice a second
                // instead of 120 times, and a DOM write nobody can see is still a DOM write.
                const node = clockRef.current;
                if (node) {
                    const leftMs = Math.max(0, (w.endsAt || now) - now);
                    const secs = Math.ceil(leftMs / 1000);
                    const text = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
                    if (node.textContent !== text) node.textContent = text;
                    // ⚠️ THE LAST TWENTY SECONDS LOOK DIFFERENT. A clock that reads the same at 1:40
                    // and 0:08 is a number, not tension — and the back half of the wave ramp is where
                    // a run is actually won or lost.
                    const urgent = secs <= 20;
                    if (node.classList.contains("is-urgent") !== urgent) node.classList.toggle("is-urgent", urgent);
                }
            }
            if (now >= w.nextRespawn) spawn(w, now);

            // ✂️ THE TALLY'S EXPIRY SWEEP WAS HERE, and the reason it was a sweep rather than a timer is
            // worth keeping: a setTimeout per row is a timer per pickup, and a pickup was the single most
            // frequent event in the Grove, while this loop was already running and already knew the time.
            // It re-rendered only when a row had actually left, which is what kept it from being a React
            // render sixty times a second for as long as the tally was on screen.

            const plats = w.platforms;
            // Walkable bounds, inset by a body so nothing can stand with half of itself outside the zone.
            // ⚠️ WALK_INSET, NOT A SECOND COPY OF THE ARITHMETIC. This number decides whether a ledge can
            // be walked off, so the generators that PLACE ledges have to agree with it exactly — and when
            // it lived here as `HERO_UNITS * 0.6` they did not: the ledge placer used 2 and the arena used
            // nothing. See the long note on WALK_INSET in grove-world.js.
            const bounds = [WALK_INSET, W - WALK_INSET];

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
                    // ── ⚠️ SURGE IS COUNTED, NOT ROLLED, AND THAT IS THE WHOLE POINT OF IT ──────
                    // Runic Overflow's own words: "every fifth swing of yours is a Surge -- counted,
                    // not rolled, you can see it coming." Rolling it would make it a crit with extra
                    // steps. The count is of LANDED blows, which is what the ring counts too.
                    w.swings = (w.swings || 0) + 1;
                    const surging = (stats?.surge || 0) > 0 && w.swings % SURGE_EVERY === 0;

                    const hit = swing(stats, 0, w.rand);
                    if (surging) {
                        hit.dealt = Math.round(hit.dealt * (1 + Number(stats.surge)));
                        // Counted, not rolled -- so it is the one proc the player can SEE coming, and it
                        // should arrive like something that was building. A ring out of the hero and a
                        // charge thrown off the blade.
                        // ⚠️ SURGE IS NOT HASTE. They were sharing a particle and a colour, so the one
                        // proc a player can SEE COMING looked identical to the one they cannot.


                        w.shake.add(TRAUMA.crit);
                        procCall(procWord("surge", "Surge"), "surge");
                        playSurge();
                    }

                    // ── ⚠️ THE GRUDGE RIDES THE SWING THAT ANSWERS IT ───────────────────────────
                    // Grudge's own words: "a share of everything done to you since your last swing is
                    // added to your next one." Banked in the hurt path, spent here, and cleared whether
                    // or not it was worth anything -- a grudge that survived its own swing would pay
                    // twice and keep paying.
                    const grudgeShare = Math.max(0, Number(stats?.grudge) || 0);
                    const avenged = grudgeShare > 0 && (w.banked || 0) > 0
                        ? Math.round(w.banked * grudgeShare) : 0;
                    if ((w.banked || 0) > 0) w.banked = 0;
                    // ⚠️ AND IT SAYS SO. The banked share was folded into the blow and the only sign of
                    // it was a number that happened to be bigger -- so the node a player spent five
                    // points in looked exactly like a good roll. GRUDGE is the one word that explains
                    // where the extra came from.
                    if (avenged > 0) {
                        hit.dealt += avenged;

                        procCall(`GRUDGE +${avenged}`, "grudge", null, 1.5, foe);
                        playGrudge();
                    }

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
                        // ── ⚠️ AND IT SAYS SO. THE REAVER'S WHOLE IDENTITY WAS SILENT ───────────
                        // Luke: "I'm also not seeing any of my abilities fire as a reaver ... I would
                        // expect like cool skills to be firing. Is this like another fundamental
                        // misalignment between you and me?"
                        //
                        // His class was firing the entire time — measured off his own account: bleed on
                        // 32% of swings, crit 25%, counter 18%, and the tree worth +30% bleed chance and
                        // +20% bleed damage. Thirteen procs in this file announce themselves with a word
                        // (SURGE, GRUDGE, CHILLED, CATACLYSM, HASTE, WILD, GUARD, RIPOSTE, BLOCK...) and
                        // bleed, the one a Reaver is BUILT around, was not one of them. Worse, its ticks
                        // print through addPop("hit") — the same cream number as an ordinary sword blow.
                        // So a third of his swings opened a wound that looked exactly like not opening one.
                        //
                        // ⚠️ ON THE CATCH, NOT ON THE REFRESH, and that is the same rule the fire below
                        // already follows. A word on every swing of a 32% build is not a proc, it is a
                        // label stuck to the screen.
                        if (better && !foe.bleed) procCall(procWord("bleedChance", "Rend"), "bleed", null, 1.2, foe);
                        if (better) {
                            foe.bleed = { dmg: hit.bleed.dmg, leech: hit.bleed.leech,
                                left: BLEED_TICKS, nextAt: now + BLEED_TICK_MS };
                        }
                    }
                    // ── AND THE FIRE ───────────────────────────────────────────────────────────
                    // Same refresh-rather-than-stack rule as the wound above, for the same reason: a
                    // fast build must not get a whole new fire per swing. `spread: true` marks this as
                    // one a player's own blow lit, so it is allowed to catch ONE neighbour; the burn it
                    // starts is marked false and the chain stops there. See BURN_SPREAD_UNITS.
                    if (hit.burn) {
                        const better = !foe.burn || hit.burn.dmg >= foe.burn.dmg;
                        // Only when it CATCHES, not on every refresh -- a hiss on every swing of a
                        // high-burn build is a kettle.
                        if (better && !foe.burn) { playIgnite();  }
                        if (better) {
                            foe.burn = { dmg: hit.burn.dmg, leech: hit.burn.leech, spread: true,
                                left: BURN_TICKS, nextAt: now + BURN_TICK_MS };
                        }
                    }
                    // ── ⚠️ A STUN COSTS IT THE SWING IT WAS WINDING UP ──────────────────────────
                    // Rolled on the landed blow, the same place and the same arithmetic as the ring:
                    // points through STUN_PER_POINT, plus the tree's flat share on top.
                    //
                    // ⚠️ AND IT CANCELS WHAT IS ALREADY IN THE AIR. A telegraph that has been thrown
                    // resolves on its own timer regardless of what happened to the thing that threw it,
                    // so without this you stun a creature mid-wind-up and are hit by it anyway -- which
                    // reads as the stat doing nothing, which is exactly where this feature started.
                    // Filtered rather than removed by hand: these are React's nodes, and the loop only
                    // ever deletes what it created itself.
                    // ⚠️ ONE LOCK FUNCTION FOR BOTH, because a freeze IS a stun -- the ring spends
                    // them through the same `def.stunned` counter and the only differences here are the
                    // duration and the word. A second copy would be the bleed/burn mistake again.
                    // `word` may be null when the caller has already announced itself -- see cataclysm.
                    const lock = (ms, word, kind = "ice") => {
                        if (foe.isBoss || now < (foe.lockImmuneUntil || 0)) return false;
                        foe.stunUntil = now + ms;
                        // Which kind of hold this was, so the body can wear the right one.
                        foe.lockKind = kind;
                        foe.lockImmuneUntil = foe.stunUntil + LOCK_IMMUNE_MS;
                        foe.nextAttack = Math.max(foe.nextAttack || 0, foe.stunUntil);
                        foe.windUntil = 0;
                        // Filtered rather than removed by hand: React owns these nodes.
                        w.tels = w.tels.filter((t) => t.foeUid !== foe.uid);
                        // ── ⚠️ IT LANDS AS AN IMPACT, AND THE WORD IS THE SMALL PART ──────────
                        // A caption is a label on an effect, not the effect. Ice arrives as a burst of
                        // shards off the body with a ring going out through it; a stun arrives as a hot
                        // white crack. The word rides on top for the half-second it takes to read, and
                        // what sells the moment is everything underneath it.


                        w.shake.add(kind === "ice" ? TRAUMA.crit : TRAUMA.hit);
                        // ⚠️ ITS OWN SOUND, AND NOT IN THE BLOW'S REGISTER. A landed hit is a mid thud;
                        // cold is glass above it and a stun is a knock underneath, so neither competes
                        // with the swing that caused it -- they all land in the same half second.
                        if (kind === "ice") playFreeze(); else playStun();
                        if (word) procCall(word, kind, null, 1.15, foe);
                        return true;
                    };

                    const stunOdds = procFrom(stats?.stun || 0, STUN_PER_POINT)
                        + Math.max(0, Number(stats?.stunBonus) || 0);
                    const freezeOdds = Math.max(0, Number(stats?.freeze) || 0);
                    // ⚠️ FREEZE IS OFFERED FIRST because it is the longer hold and the rarer stat; rolling
                    // the stun first would let a 15% stun eat the roll a 10% freeze was going to win.
                    if (freezeOdds > 0 && w.rand() < freezeOdds) lock(FREEZE_MS, "FROZEN", "ice");
                    else if (stunOdds > 0 && w.rand() < stunOdds) lock(STUN_MS, "STUNNED", "stun");

                    // ── THE COLD BUILDS UP ──────────────────────────────────────────────────────
                    // Every landed blow adds another share and the whole thing fades over eight
                    // seconds from the LAST one, so backing off thaws them. Capped, unlike the ring's,
                    // because a turn bar cannot stall for ever and an attack cadence can.
                    const chillPer = Math.max(0, Number(stats?.chill) || 0);
                    if (chillPer > 0) {
                        const was = foe.chill || 0;
                        foe.chill = Math.min(CHILL_MAX, was + chillPer);
                        foe.chillAt = now;
                        // ⚠️ ITS OWN LOOK, NOT THE FREEZE'S. Chill and freeze are different nodes doing
                        // different things -- one slows, one stops -- and sharing a particle made the
                        // cheaper one look like the rarer one landing weakly.
                        //
                        // ⚠️ AND THE PARTICLES FIRE ON EVERY STACK WHILE THE WORD FIRES ONCE. Chill
                        // climbs to 75% over about seven blows, and the first cut announced only the
                        // first one -- so the whole of it deepening was invisible and a player could not
                        // see the stat working past the opening hit. A word per stack would be seven
                        // CHILLED in a row, which is noise; frost per stack is the thing itself.

                        if (was === 0) {
                            procCall(procWord("chill", "Chilled"), "chill", null, 1.15, foe);
                            playChill();
                        }
                    }

                    // ── ⚠️ SOULFIRE GOES PAST ARMOUR AND PAST SHIELDS BOTH ─────────────────────
                    // Which is what makes it different from pierce: it is not a share of the blow that
                    // ignores armour, it is a SECOND blow of pure magic off what the first one landed.
                    // Dealt straight to health, exactly as the ring does it.
                    if ((stats?.soulfire || 0) > 0 && hit.dealt > 0 && foe.hp > 0) {
                        const soul = Math.max(1, Math.round(hit.dealt * stats.soulfire));
                        foe.hp -= soul;

                        playSoulfire();
                        addPop("soul", `${soul}`, foe.x, foe.y + foe.h * 0.8);
                    }

                    // ── CATACLYSM LIGHTS AND FREEZES AT ONCE, BOTH GUARANTEED ──────────────────
                    // Rolled once rather than rolling each, so when it lands it lands whole. It goes
                    // through the same two machines everything else uses -- the burn slot and the lock --
                    // so it obeys the lock immunity like any other freeze.
                    if ((stats?.cataclysm || 0) > 0 && foe.hp > 0 && w.rand() < stats.cataclysm) {
                        foe.burn = { dmg: Math.max(1, Math.round(hit.dealt * BURN_SHARE)),
                            leech: Math.max(0, Number(stats?.burnLeech) || 0), spread: true,
                            left: BURN_TICKS, nextAt: now + BURN_TICK_MS };
                        // ⚠️ THE WORD IS SAID WHETHER OR NOT THE FREEZE LANDS. lock() declines while a
                        // creature is still inside its immunity window, and the first cut let that
                        // swallow the announcement -- so a cataclysm would light a creature on fire and
                        // tell the player nothing, which is the exact fault this whole pass has been
                        // about. The burn is the half that always happens; the freeze is the half that
                        // can be refused.
                        // The rarest thing a Runecaller does -- one swing in twenty at a full tree, and
                        // it is both halves at once. It gets its own word and its own colour.
                        // One swing in twenty at a full tree, and both halves at once -- it gets fire
                        // AND ice off the same body, two rings, and the heaviest shake in the kit.


                        w.shake.add(TRAUMA.kill);
                        procCall(procWord("cataclysm", "Cataclysm"), "cata", null, 1.3, foe);
                        playCataclysm();
                        lock(FREEZE_MS, null);
                    }

                    // ── ⚠️ THE WARD SHARES THE GUARD'S POOL ────────────────────────────────────
                    // Both are absorb shields and a hero with two of them should not carry two separate
                    // numbers -- that is the bleed/burn lesson again. The ward tops the pool up toward
                    // its own ceiling on every swing; the guard slams it to a full guard's worth when it
                    // rolls. Whichever is larger is what stands.
                    if ((stats?.ward || 0) > 0) {
                        const cap = Math.round(maxHp * stats.ward);
                        const top = Math.round(maxHp * (Number(stats?.wardRefill) || 0));
                        if ((w.shield || 0) < cap) w.shield = Math.min(cap, (w.shield || 0) + Math.max(1, top));
                    }

                    // ── MENDING, ON THE BEAT THE RING HEALS ON ─────────────────────────────────
                    // The ring regenerates at the top of your turn. A swing is the nearest thing to one,
                    // and it keeps the Warden's sustain tied to being in a fight rather than ticking
                    // while standing still in an empty clearing -- the same call the guard makes.
                    if ((stats?.regen || 0) > 0 && w.hp > 0 && w.hp < maxHp) {
                        const healed = Math.max(1, Math.round(maxHp * stats.regen));
                        w.hp = Math.min(maxHp, w.hp + healed);
                        addPop("heal", `+${healed}`, w.hero.x, w.hero.y + HERO_UNITS * 1.3);
                    }

                    // ── ⚠️ ONE ROLL, THEN IT DECIDES WHICH OF THE THREE IT IS ──────────────────
                    // Red Harvest's shape in the ring, kept: a single chance, and only once it lands does
                    // it pick. "extra" is a free immediate blow, "haste" starts the haste buff, and
                    // "counter" has no meaning on your OWN swing in a side-scroller -- there is nothing
                    // to counter -- so it falls to the extra blow, which is the closest honest reading.
                    if ((stats?.wildProc || 0) > 0 && w.rand() < stats.wildProc) {
                        const pick = Math.floor(w.rand() * 3);
                        playWild(pick);
                        if (pick === 2) {
                            w.hasteUntil = now + HASTE_MS;
                            procCall(procWord("hasteBonus", "Haste"), "haste");
                        } else {
                            const extra = swing(stats, 0, w.rand);
                            foe.hp -= extra.dealt;
                            addPop("hit", `${extra.dealt}`, foe.x, foe.y + foe.h * 0.7,
                                popWeight(extra.dealt, foe.maxHp));

                            procCall(procWord("wildProc", "Wild"), "wild", null, 1.2, foe);
                        }
                    }

                    // ── ⚠️ A GUARD IS RAISED ON YOUR OWN SWING ──────────────────────────────────
                    // The ring rolls guardChance at the top of the acting fighter's turn. A side-scroller
                    // has no turns, and the closest honest analogue is the moment you commit to a blow --
                    // which also keeps the Warden's defence tied to being in the fight rather than
                    // accruing while standing still in an empty clearing.
                    //
                    // Capped at one guard's worth so it cannot bank into an invulnerability across a long
                    // fight; the ring decays it per turn for the same reason and this is that rule in
                    // real-time terms.
                    if ((stats?.guardChance || 0) > 0 && w.rand() < stats.guardChance) {
                        const one = Math.round(maxHp * (Number(stats?.guardSize) || 0));
                        if (one > 0 && (w.shield || 0) < one) {
                            w.shield = one;
                            // The shield itself: a ring snapping out from the hero and steel coming off
                            // him. The word is the receipt; this is the thing that happened.


                            procCall(procWord("guardChance", "Guard"), "guard", null, 1.1);
                            playGuard();
                        }
                    }
                    // When its bar was last struck. Drives whether the bar is up at all, and the flash,
                    // jolt and swell on it while it is. See drawFoeBar.
                    foe.hurtAt = now;
                    lightUp(foe, now, hit.crit ? 1.6 : 1);
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

                    // ⚠️ A CRIT GETS A RING AND AN ORDINARY HIT DOES NOT. Everything else separating the
                    // two -- a longer flash, a harder stop, more trauma, a brighter number -- is a
                    // DIFFERENCE IN DEGREE, and degrees stop reading once they are happening sixty times
                    // a minute. The ring is the only thing on screen that an ordinary hit never does, so
                    // it is the only part a player can catch without counting.
                    if (hit.crit) 
                    // ⚠️ SIZED BY THE SHARE IT TOOK OFF, NOT BY THE RAW NUMBER. 400 is a huge hit on a
                    // rootrat and a scratch on the Heartwood Elder, so a flat threshold would call the
                    // scratch the big one. See popWeight.
                    addPop(hit.crit ? "crit" : "hit", `${hit.dealt}${hit.crit ? "!" : ""}`, px, py,
                        popWeight(hit.dealt, foe.maxHp));
                    playHit(Math.min(COMBO_PITCH_STEPS, w.combo), hit.crit);
                    // The haste roll rides the landed blow, the same place the ring rolls it.
                    // ⚠️ THE SHARE RIDES ON TOP OF THE POINTS, SAME AS LIFESTEAL. Bloodscent pays a flat
                    // percentage and the ring adds it after the per-point curve; this read the points
                    // alone, so a Reaver's node did nothing here.
                    const hasteOdds = procFrom(stats?.haste || 0, HASTE_PER_POINT)
                        + Math.max(0, Number(stats?.hasteBonus) || 0);
                    if (hasteOdds > 0 && w.rand() < hasteOdds) {
                        // ⚠️ THE WORD ONLY FIRES WHEN THE BUFF ACTUALLY STARTS. The roll happens on every
                        // landed blow, so a proc landing while haste was ALREADY running printed a second
                        // HASTE on top of the first -- two identical words overlapping, which reads as a
                        // rendering fault rather than as a second proc. Refreshing the duration is right;
                        // announcing it twice is not. Caught on the juice sheet, where the scene pins the
                        // proc to near-certainty and the collision happens every other swing.
                        const wasHasted = now < (w.hasteUntil || 0);
                        w.hasteUntil = now + HASTE_MS;
                        if (!wasHasted) procCall(procWord("hasteBonus", "Haste"), "haste");
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
                        // A heal would still pop if it were an EVENT rather than a trickle -- that was
                        // the belt's eat, which went on 2026-11-09. Nothing produces one today; the rule
                        // is kept because the distinction is about heals, not about the belt.
                    }
                    if (foe.big || foe.rare) w.bossBar = { hp: Math.max(0, foe.hp), maxHp: foe.maxHp };
                    if (foe.isBoss || foe.big || foe.rare) w.bossHurtAt = now;
                    // ── THE CLASS ANSWERS THE BLOW ──────────────────────────────────────────────
                    // Before the kill check, because Runic Might's little blast and Killing Edge's cleave
                    // are part of the SAME swing — resolving them after the body falls would make a lethal
                    // hit quietly skip them, which is the one hit they most obviously belong on.
                    
                    if (hit.crit) 
                    // ── AND EVERY NTH SWING ─────────────────────────────────────────────────────
                    w.swingCount = (w.swingCount || 0) + 1;
                    if (foe.hp <= 0) killFoe(w, foe, now, hit.dealt);
                }
            }

            // ── THE PET ─────────────────────────────────────────────────────────────────────────
            // ⚠️ IT TRAILS BY A SHARE OF THE FRAME, NOT BY A FLAT 9 UNITS — nine units is 9% of a
            // 100-unit frame and THIRTY-FIVE PERCENT of a 26-unit one, which parked the pet on the left
            // bezel and then off it entirely. See grove-view.js.
            const pf = petFollow(w.visibleUnits || UNITS_PER_SCREEN);

            // ── ⚠️ TWO JOBS NOW: FIGHT, THEN FOLLOW ────────────────────────────────────────────
            // Luke: "the pet should only attack if you attack, and it should attack your target."
            //
            // It used to FETCH as well, and that is gone. Luke: "The pet like glitches out in the grove and
            // like tries to go pick stuff up, but then just keeps getting rubber banded back to me. I wonder
            // if maybe let's just have the pet focus on attacking."
            //
            // ⚠️ THE RUBBER BAND WAS TWO CORRECT RULES FIGHTING EACH OTHER. The fetch errand ranged as far
            // as fetchRangeFor() — a share of the visible frame — while the leash below rescues the pet the
            // moment it is further from the hero than petLostFor(). Those are two different fractions of the
            // same frame, so on any screen where the fetch range is the larger one the pet walks out, trips
            // the leash, is teleported back, re-picks the same drop and walks out again, for ever. Neither
            // rule is wrong on its own and neither logs anything, which is why it reads as the pet glitching
            // rather than as a conflict.
            //
            // The loot problem it was solving is solved properly instead: a drop now comes to the hero on
            // its own after LOOT_AUTO_MS, from anywhere. Nothing has to walk to it, so nothing can be
            // yanked back mid-errand, and the floor still empties itself.
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
            } else {
                // ── FOLLOW ─────────────────────────────────────────────────────────────────
                const petWant = w.hero.x - w.hero.face * pf.trail;
                if (Math.abs(petWant - w.pet.x) > pf.slack || Math.abs(w.hero.y - w.pet.y) > 4) {
                    const nav = navigate(plats, w.pet, petWant, w.hero.y);
                    drive(w.pet, nav.dir);
                    if (nav.hop) hop(w.pet, HOP);
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
                    lightUp(foe, now);
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
                    if (foe.hp <= 0) killFoe(w, foe, now, bite.dealt);
                }
            }
            // ⚠️ AND IT GETS RESCUED. A follower with real physics WILL eventually be left behind — stuck
            // under a ledge it mistimed, or on the wrong side of the zone after the hero climbed. Every game
            // with a companion does this and it is invisible when it works; without it the pet is simply
            // gone, which is the exact complaint Luke raised by name the last time ("my dude and pet").
            if (Math.abs(w.hero.x - w.pet.x) > petLostFor(frameView.visibleUnits)) {
                w.pet.x = w.hero.x - w.hero.face * pf.trail;
                w.pet.y = w.hero.y;
                w.pet.vx = 0; w.pet.vy = 0;

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
                // ── THE WOUND, AND THE FIRE, KEEP ARRIVING ──────────────────────────────────────
                // ⚠️ ONE PIECE OF CODE FOR BOTH. Bleed and burn differ by a number, a colour and whether
                // fire catches the thing standing next to it -- everything else about them is identical,
                // and a second copy of "tick, leech, expire, and a tick can kill" is a second set of
                // rules that stops agreeing with the first the day either is touched. The kill path in
                // particular has already been paid for once: a bleed used to leave an unkillable statue
                // holding the boss bar because it clamped hp to zero instead of calling killFoe.
                //
                // ⚠️ IT TICKS ON THE CREATURE'S OWN CLOCK, NOT ON YOUR SWINGS. A wound that only resolved
                // when you hit again would be a worse version of the hit, and would pay nothing to the
                // player who applies it and backs off -- the one playstyle it exists to reward.
                //
                // Both PIERCE: dealt straight off hp without going through mitigate, which is the whole
                // identity of the pair. See [[bleed-front-load-magnitude]].
                const dotKill = tickDot(w, f, now, "bleed", BLEED_TICK_MS)
                    || tickDot(w, f, now, "burn", BURN_TICK_MS);
                if (dotKill) continue;

                // Passive early enemies never initiate — Luke: "the ones earlier in the game being fully
                // passive. And later in the game attacking when they are attacked." A boss is passive until
                // you reach it and then never stops.
                // ── ⚠️ THE BOSS ARRIVES, RATHER THAN BEING DISCOVERED STANDING THERE ───────────
                // It is spawned at the far wall on zone entry and stays passive, and its bar and its name
                // only ever appeared when you TAPPED it. So the climax of a zone was a large animal you
                // walked into, and the only thing that marked it was a health bar you had to start the
                // fight to see. A boss that does not announce itself is scenery with a lot of hit points.
                if (f.isBoss && !f.noticed && Math.abs(f.x - w.hero.x) < bossNoticeFor(frameView.visibleUnits)) {
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
                // ── ⚠️ A BOSS FIGHT IS A DUEL, AND IT WAS A DUEL IN A CROWD ────────────────────
                // Luke: "he's on the Everburning and it's kicking his ass, and it shouldn't be."
                //
                // It was not the boss. Measured against his real kit, The Everburning alone deals 136 a
                // second and he heals 232 -- he cannot lose that fight. But it is an 88-SECOND fight, and
                // a zone holds 15-30 creatures: with four of them also on him he starts losing ground, at
                // six he is dead in fourteen seconds, at eight in eight. He was never losing to the boss.
                //
                // ⚠️ AND THE CROWD IS SUPPOSED TO BE THE THREAT -- that is this mode's whole design, "the
                // threat here is three things closing at once". It just cannot ALSO be true during the one
                // fight you are not allowed to walk away from. Every boss he has ever reached is still
                // standing: ten zones, not one kill.
                //
                // So while the boss is awake, the rest of the zone loses interest. Nothing despawns --
                // they are still there, still killable, still carrying loot -- they simply stop swinging,
                // which makes the climax of a zone a fight with the thing the zone is about.
                //
                // ⚠️ AND IT CANNOT BE FARMED. A passive creature is still a kill, so this looks like free
                // safe farming -- it buys nothing. killCeiling bounds a dive by respawn rather than by
                // kill speed (see gold-mint-rate-lever), and the boss is on a thirty-minute cooldown, so
                // standing in a boss arena killing trash is strictly slower than leaving and coming back.
                const bossAwake = w.foes.some((x) => x.isBoss && x.noticed && !x.dying && x.hp > 0);
                // ⚠️ AND IT CANNOT START A NEW ONE EITHER. nextAttack is pushed past the stun when it
                // lands, but a creature whose cadence had already elapsed would wind up on the very next
                // frame; this is the gate that actually holds it still.
                const stunned = now < (f.stunUntil || 0);
                // The cold wearing off. Linear from the last blow that applied it -- a creature left
                // alone is back to full speed eight seconds later.
                if ((f.chill || 0) > 0) {
                    const age = now - (f.chillAt || 0);
                    if (age >= CHILL_FADE_MS) f.chill = 0;
                }
                if (angry && near && !stunned && (f.isBoss || !bossAwake) && now >= (f.nextAttack || 0)) {
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
                        // ⚠️ THE CHILL STRETCHES THE GAP, which is what "slows their turn bar" means in
                        // a place with no turn bar. Applied to the gap rather than to the wind-up: a
                        // longer wind-up would make the attack EASIER to dodge as well as rarer, paying
                        // the stat twice.
                        f.nextAttack = now + (1800 + w.rand() * 1600) * (1 + (f.chill || 0));
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

                // ⚠️ MATCHED ON uid. This read tel.foeId against f.uid, which never matched, so every attack
                // in the Grove fell through to a hardcoded 5 damage and the whole difficulty curve was dead.
                const foe = w.foes.find((f) => f.uid === tel.foeUid) || null;
                // ── ⚠️ NO BLOW FROM A DEAD OWNER. THE SECOND GUARD, AND IT IS THE ONE THAT HOLDS ──────
                // killFoe now takes a dying creature's telegraphs back, which is the real fix. This is the
                // backstop for every other way an owner can stop existing — despawn, zone rebuild, a body
                // removed by the respawn pass — and for the `|| null` directly above, which used to mean
                // "owner not found, deal 5 anyway". An attack with nobody behind it is not a hard fight,
                // it is a bug the player correctly reads as being hit by thin air.
                if (!foe || foe.dying || foe.hp <= 0) continue;
                if (!telegraphHits(tel, w.hero.x, w.hero.y)) { playWhiff(); continue; }
                const base = foe.dmg[0] + Math.round(w.rand() * (foe.dmg[1] - foe.dmg[0]));
                // A sweep is wide and weak, a slam is narrow and hard. The multiplier is what makes them
                // read differently rather than just look different.
                const raw = Math.max(1, Math.round(base * (Number(tel.mult) || 1)));
                // ⚠️ mitigate(), NOT A SECOND COPY OF IT. This was the 60/(60+armour) formula written out by
                // hand, next to a module that exports exactly that rule as ARMOUR_K. Two copies is two games.
                const armoured = mitigate(raw, stats?.armour || 0);

                // ── ⚠️ THE WARDEN'S DEFENCE, WHICH THIS LINE USED TO SKIP ENTIRELY ──────────────
                // Luke: "all choices on your class must be honored." Nine of a Warden's twelve nodes did
                // nothing in a zone and four of them resolve right here -- the hero took armoured damage
                // straight to health with no block, no guard and no thorns anywhere in the feature.
                //
                // ⚠️ defendBlow() IS THE RING'S OWN RULE, NOT A SECOND COPY. It was lifted out of
                // arena-engine into arena-kit for this and proved identical to the lines it replaced over
                // 200,000 random blows. "What a shield does" must not have two answers.
                const guard = defendBlow(armoured, stats || {}, w.rand);
                let dealt = guard.blow;

                // A GUARD EATS WHAT IT CAN BEFORE HEALTH SEES ANY OF IT. Raised on the hero's own swing
                // (see the guard roll in the swing block) because that is the ring's "your turn", and the
                // nearest thing a side-scroller has to one.
                let soaked = 0;
                if ((w.shield || 0) > 0 && dealt > 0) {
                    soaked = Math.min(w.shield, dealt);
                    w.shield -= soaked;
                    dealt -= soaked;
                }

                // ⚠️ THORNS ANSWER THE BLOCK, NOT THE BLOW, so a build with thorns and no block returns
                // nothing -- the ring's rule, and the reason Thornmail reads as a shield talent. The
                // damage goes back to the body that actually swung, and a thorns kill is a KILL: killFoe,
                // never a clamp to zero, which is the bug a bleed tick already paid for here once.
                if (guard.thornsBack > 0 && foe && !foe.dying && foe.hp > 0) {
                    foe.hp -= guard.thornsBack;
                    foe.hurtAt = now;
                    // ⚠️ ITS OWN NUMBER, NOT A SWORD'S. Thorns print on the creature exactly where a
                    // hit does, so in cream they were indistinguishable from the blow the player just
                    // landed -- the one node whose whole appeal is "being attacked hurts them" and you
                    // could not see it happen.
                    addPop("thorn", `${guard.thornsBack}`, foe.x, foe.y + foe.h * 0.6,
                        popWeight(guard.thornsBack, foe.maxHp) * 0.7);
                    if (foe.hp <= 0) { foe.hp = 0; killFoe(w, foe, now, guard.thornsBack); }
                }

                // ⚠️ ICE THORNS ANSWER WHAT GOT THROUGH, NOT WHAT WAS BLOCKED -- the opposite of
                // Thornmail above, and the ring's own split. Thorns are a shield talent and pay only when
                // the shield works; Rimeguard is a coat of frost that bites whatever actually hurt you.
                const iceBack = (stats?.iceThorns || 0) > 0 && dealt > 0
                    ? Math.round(dealt * stats.iceThorns) : 0;
                if (iceBack > 0 && foe && !foe.dying && foe.hp > 0) {
                    foe.hp -= iceBack;
                    foe.hurtAt = now;
                    addPop("thorn", `${iceBack}`, foe.x, foe.y + foe.h * 0.6,
                        popWeight(iceBack, foe.maxHp) * 0.7);
                    if (foe.hp <= 0) { foe.hp = 0; killFoe(w, foe, now, iceBack); }
                }

                // ── ⚠️ THE COUNTER ANSWERS THE BODY THAT SWUNG ─────────────────────────────────
                // Riposte and Retribution. Rolled when you are HIT, which is the only place a counter
                // can mean anything, and it goes through swing() rather than doing its own arithmetic --
                // Luke, on the ring: "when I counter attack why does it only do 1 damage", because the
                // counter was the one blow in the game that skipped the shared damage path. It does not
                // skip it here.
                if ((stats?.counter || 0) > 0 && foe && !foe.dying && foe.hp > 0
                    && w.rand() < stats.counter) {
                    const riposte = swing(stats, 0, w.rand);
                    foe.hp -= riposte.dealt;
                    foe.hurtAt = now;
                    addPop("hit", `${riposte.dealt}`, foe.x, foe.y + foe.h * 0.7,
                        popWeight(riposte.dealt, foe.maxHp));


                    procCall(procWord("counterBonus", "Riposte"), "riposte", null, 1.32, foe);
                    playRiposte();
                    if (foe.hp <= 0) { foe.hp = 0; killFoe(w, foe, now, riposte.dealt); }
                }

                // THE GRUDGE banks what reached health and rides the next swing -- see the swing block.
                if ((stats?.grudge || 0) > 0 && dealt > 0) w.banked = (w.banked || 0) + dealt;

                // ── THE WARDEN'S TWO MOMENTS ────────────────────────────────────────────────────
                // `block` is a shield turning a blow aside; `guardBreak` is the absorb pool finally running
                // out. Bastion, Unbreakable and Aether Ward all hang off the second one and it is the
                // Warden's whole payoff — absorb, then spend what you absorbed across the crowd — so a
                // Warden with no trigger here would have read exactly like the Reaver did before today:
                // working perfectly, saying nothing.
                //
                // ⚠️ `soaked` IS WHAT THE POOL ATE THIS BLOW, and it is the number Bastion pays out. Passed
                // as `dealt` so the nova scales off what was actually absorbed rather than off a swing.
                if (guard.blocked) 
                // ⚠️ w.shield IS THE POOL, not w.ward. Both the Warden's guard and the Runecaller's ward
                // share ONE absorb pool by design (see the note at the top of the guard block) — there is no
                // separate w.ward and a check against one would never have fired, which is the quietest
                // possible way for a headline skill to do nothing.
                if (soaked > 0 && (w.shield || 0) <= 0) {
                    
                }
                if (guard.blocked || soaked > 0) {
                    // Steel off the shield arm, thrown back toward whatever swung. A block that only
                    // prints a smaller number is a block nobody feels.

                    playBlock();
                    procCall(guard.blocked && soaked > 0 ? "GUARDED" : guard.blocked ? "BLOCK" : "GUARDED",
                        "block", null, 1.1);
                }

                w.hp -= dealt;
                // ── THE CLASS ANSWERS BEING HIT ─────────────────────────────────────────────────
                // Thornmail hits EVERY attacker rather than the one that connected, Rimeguard sets off a
                // frost nova, Bloodscent turns you below half. `foe` is whatever swung, so a nova centred
                // on it catches the crowd that closed in with it.
                
                w.hurtAt = now;
                w.clock.stop(now, HITSTOP_MS.hurt);
                w.shake.add(TRAUMA.hurt);
                w.combo = 0;
                impulse(w.hero, Math.sign(w.hero.x - tel.x || 1) * 0.42, 0.2);
                // ⚠️ WHAT REACHED HEALTH, NOT WHAT WAS SWUNG. A blocked-and-soaked blow that took four
                // off you must not print the thirty it started as, or the defence reads as broken.
                // ⚠️ A BLOCKED BLOW AND A WEAK BLOW PRINTED THE SAME NUMBER. Taking fifty percent off
                // and showing a smaller figure tells the player nothing -- they cannot tell their shield
                // worked from the creature having hit softly, which is the whole feedback a defensive
                // build is buying. The number wears the block's own steel when it was turned aside.
                if (dealt > 0) {
                    addPop(guard.blocked || soaked > 0 ? "warded" : "took",
                        `-${dealt}`, w.hero.x, w.hero.y + HERO_UNITS * 0.9);
                }

                playHurt();

                // ── ✂️ THE BELT'S AUTO-EAT WAS HERE ──────────────────────────────────────────
                // "equip food or potions that auto heal you if you get below 60 percent hp" -- the eat
                // at HEAL_AT, the proc call with the poultice's own sprite, the big thrown heal number
                // and the hitstop behind it. It was the only thing you crafted that spent itself.
                //
                // It goes because the food does. Nothing has been able to MAKE a poultice since the
                // bench was deleted on 2026-11-08, so the belt could only ever run down; the four
                // members holding stock were the only ones who would see this fire again, and a new
                // member would have met an empty belt and no way to fill it. Eric, 2026-11-09: remove
                // the moss poultice and the idea of a belt with potions.
                //
                // ⚠️ SO THERE IS NO HEALING INSIDE A ZONE NOW, AND THAT IS THE REAL CHANGE. Not a UI
                // cut -- the hero's only mid-dive recovery is gone, which makes a deep zone strictly
                // harder than it was yesterday. If the Grove wants a heal again it wants a NEW one,
                // designed against the curve as it stands, not this restored from git.
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
                    // ⚠️ TWO WAYS IN, AND KEEPING BOTH IS THE POINT. Walking over a drop still collects it
                    // on the spot, because that is the half of collecting that feels like the player did
                    // something. The timer is the safety net underneath it: once a drop has sat for
                    // LOOT_AUTO_MS it comes to you from anywhere, so nothing is ever stranded on a ledge
                    // you cannot be bothered to climb and nothing has to walk out to get it.
                    const near = now - d.restAt > LOOT_REST_MS && dist < LOOT_DRAW_RANGE;
                    const waited = now - d.restAt > LOOT_AUTO_MS;
                    if (near || waited) {
                        d.state = "draw"; d.dv = 0; d.to = "hero";
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
                        // ── ⚠️ THE THING YOU PICKED UP, NOT THE NAME OF IT ──────────────────────────
                        // Luke: "You should actually see the sprite and the name of it." A drop spends
                        // its whole life as a sprite on the floor and then became a line of text at the
                        // moment of collection, which is the one moment it is a reward. The art rides
                        // the label.
                        //
                        // ⚠️ AND IT POPS AT WHOEVER COLLECTED IT. A drop the pet ran twenty units to
                        // fetch announcing itself over the hero's head says the player picked it up,
                        // and the one thing that has to read is that the PET did — otherwise it looks
                        // like loot teleporting and the whole errand goes unnoticed.
                        addPop("loot", d.label, by.x + (by.face || 1) * 1.5, by.y + by.h * 0.75,
                            null, d.art || null);
                        // ── ✂️ THE TALLY ROW AND THE PICKUP CHIRP WERE BOTH HERE ────────────────────
                        // This was the loot noise Luke named: three things fired on every single
                        // pickup — this pop, a row down the left edge whose count bumped, and a
                        // two-note chirp (higher if the drop was rare).
                        //
                        // ⚠️ THE POP IS THE ONE THAT SURVIVED, and deliberately. The noise was a
                        // volume problem rather than a per-event one: parts arrived in a stream, so
                        // three announcements each were three streams. What is left on the floor is
                        // gear and the odd emblem — one object every forty-odd kills — and announcing
                        // THAT once is not noise, it is the reward being legible.
                        //
                        // ⚠️ playPickup IS STILL IMPORTED AND STILL USED, by the zone-unlock moment
                        // further up this file. Do not remove the import chasing this comment.
                        rerender();
                        continue;
                        playPickup(Boolean(d.rare));
                        rerender();
                        continue;
                    }
                }
            }

            // ── THE DOCK GETS OUT OF THE WAY WHILE YOU FIGHT ────────────────────────────────────
            // ⚠️ WRITTEN ONLY WHEN IT CHANGES, like every other per-frame style in here -- and that
            // matters more than usual because there is a CSS transition on this one. Assigning the same
            // opacity sixty times a second would restart the transition on every frame and it would
            // never actually move.
            if (zdockRef.current) {
                const busy = now - Math.max(w.swingAt || -1e9, w.hurtAt || -1e9) < DOCK_QUIET_MS;
                const want = busy ? DOCK_FIGHT_OPACITY : 1;
                if (w.dockOpacity !== want) {
                    zdockRef.current.style.opacity = String(want);
                    // ⚠️ AND IT STOPS TAKING TAPS WHILE IT IS FAINT. A thumb reaching for a creature in
                    // the bottom of the frame must not open a backpack because a ghost of a button was
                    // still there to be pressed.
                    zdockRef.current.style.pointerEvents = busy ? "none" : "auto";
                    w.dockOpacity = want;
                }
            }

            // ── WHAT IS TRUE OF THE HERO, ON THE HERO ───────────────────────────────────────────
            // Same layer and the same once-only write as every creature. Two states, and they are the
            // two a player needs at a glance in a fight they are losing: something is absorbing for me,
            // and I am nearly dead.
            if (w.hero.statusNode) {
                const low = w.hp > 0 && w.hp <= maxHp * HERO_LOW_SHARE;
                const cls = "gv-status"
                    + ((w.shield || 0) > 0 ? " is-warded" : "")
                    + (low ? " is-low" : "");
                if (w.hero.statusCls !== cls) { w.hero.statusNode.className = cls; w.hero.statusCls = cls; }
            }

            // ── THE CAMERA ──────────────────────────────────────────────────────────────────────
            // Luke: "The camera would trolley and lookahead slightly, common sense. Not jostle the person."
            // So it EASES toward a point ahead of the hero rather than tracking them exactly — a camera
            // locked to the player is what makes a scrolling game feel like it is shaking.
            // Cached for the same reason as the read at the top of the frame -- and these two sit AFTER
            // every body in the scene has had its transform written, which is the worst possible place to
            // ask the browser to lay out.
            const vw = w.hostW || host.clientWidth;
            const vh = w.hostH || host.clientHeight;
            const view = frameView;
            const { unit, skyBoxH, groundPx, tileW, skyBottom } = view;

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
            // ⚠️ AND WHERE ITS BOTTOM SITS. A plate that had to grow for coverage is pushed below the
            // frame by the excess, so the painted horizon still lands on the world's ground line rather
            // than riding up with the clamp. See GROUND_BAND_UNITS.
            if (skyBottom !== w.skyBottom) {
                w.skyBottom = skyBottom;
                host.style.setProperty("--gv-sky-b", `${skyBottom}px`);
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
                // ── THE CONDITION ON THE BODY ──────────────────────────────────────────────────
                // ⚠️ WRITTEN ONLY WHEN IT CHANGES. This runs for every creature every frame -- thirty
                // bodies at sixty hertz -- and assigning className unconditionally would dirty the style
                // of every one of them on every tick for no reason. The cached string is the guard.
                // ── ⚠️ BURNING THROWS EMBERS, IT DOES NOT JUST GLOW ────────────────────────────
                // Luke: "the effects should be cool, not words, or not just words." A flickering tint is
                // a colour; fire is something coming OFF the body. Embers are thrown on a cadence rather
                // than per frame -- at sixty hertz across thirty bodies a per-frame emitter is thousands
                // of nodes a second, and the look does not need them.
                if (f.burn && now >= (f.emberAt || 0)) {
                    f.emberAt = now + EMBER_EVERY_MS;

                }
                if (f.statusNode) {
                    // ⚠️ A STUN IS NOT A FREEZE AND MUST NOT LOOK LIKE ONE. Both hold a creature still
                    // through the same lock, which is right mechanically and wrong visually: one is a
                    // blow to the head and the other is ice. A player reading a fight has to be able to
                    // tell which of their own stats just fired. lock() records which it was.
                    const held = now < (f.stunUntil || 0);
                    const cls = "gv-status"
                        + (f.burn ? " is-burning" : "")
                        + (held ? (f.lockKind === "ice" ? " is-frozen" : " is-stunned") : "")
                        + ((f.chill || 0) > 0 && !held ? " is-chilled" : "");
                    if (f.statusCls !== cls) { f.statusNode.className = cls; f.statusCls = cls; }
                }
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

            // ✂️ THE TELEGRAPH POSITIONER WAS HERE. Worth keeping the reason it existed, because the bug
            // it fixed is in the DATA and still live: a telegraph belongs at the y of the creature that made
            // it, so an attack from a ledge is announced on that ledge. Resolved on x alone at the ground
            // line, a creature a tier up hit you through the floor it stood on — telegraphHits still reads
            // t.y, so that rule survives the band being removed.

            for (const dr of w.doors) {
                if (!dr.node) continue;
                dr.node.style.transform = `translate3d(${(dr.x - cam) * unit}px, ${camY * unit}px, 0)`;
                // ⚠️ THE CLASS IS TOGGLED, NOT REWRITTEN. className = ... here would wipe is-locked and
                // is-opening every frame, which is sixty times a second of the open sprite fighting the
                // unlock animation for the same element.
                const near = Math.abs(w.hero.x - dr.x) < DOOR_NEAR && !dr.node.classList.contains("is-locked");
                dr.node.classList.toggle("is-near", near);
            }

            // ── THE COLISEUM GATE AND ITS MARSHAL ────────────────────────────────────────────────
            // Placed with the doors and by the same maths, because they are the same kind of thing: a
            // fixed point in the zone that the camera slides past. Anything positioned in PERCENTAGES
            // instead would sit still while the world moved underneath it — which is what the quest
            // giver does today, and the reason he reads as part of the HUD rather than part of the room.
            for (const node of [colGateRef.current, colNpcRef.current]) {
                if (!node) continue;
                node.style.transform = `translate3d(${(colX - cam) * unit}px, ${camY * unit}px, 0)`;
            }
            // The quest giver, by the same maths and for the reason the note above gives.
            if (npcRef.current) {
                npcRef.current.style.transform = `translate3d(${(npcX - cam) * unit}px, ${camY * unit}px, 0)`;
            }
            if (colGateRef.current) {
                colGateRef.current.classList.toggle("is-near", Math.abs(w.hero.x - colX) < DOOR_NEAR);
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
                    // ── ⚠️ DRAG, THEN GRAVITY. THIS IS WHAT MAKES IT READ AS AN IMPACT ──────────────
                    // Without the velocity shed a particle keeps its launch speed sideways for its whole
                    // life and reads as drifting. Debris is thrown hard and stopped by the air; the
                    // deceleration IS the force. See SPARK.drag.
                    const drag = s.drag || 0;
                    if (drag) { const keep = Math.max(0, 1 - drag * dt); s.vx *= keep; s.vy *= keep; }
                    s.vy -= s.g * dt;
                    s.x += s.vx * dt;
                    s.y += s.vy * dt;
                    // ── ⚠️ STRETCHED ALONG TRAVEL, WHICH IS WHY IT IS A SPARK AND NOT A BUBBLE ──────
                    // A circle moving across the screen reads as a ball. The same circle stretched along
                    // its own velocity vector reads as a streak of light, and the stretch falling away as
                    // it slows is the particle visibly losing its energy. Only the loop can do this — it
                    // is the only place that knows which way the thing is going.
                    const sp = Math.hypot(s.vx, s.vy);
                    // Screen Y runs downward and the world's runs up, hence the negation.
                    const ang = (Math.atan2(-s.vy, s.vx) * 180) / Math.PI;
                    const stretch = 1 + Math.min(1.8, sp * 1.5);
                    const size = (s.size || 1) * (1 - k * 0.45);
                    s.node.style.transform =
                        `translate3d(${(s.x - cam) * unit}px, ${-(s.y - camY) * unit}px, 0)`
                        + ` rotate(${ang.toFixed(1)}deg) scale(${size.toFixed(3)}) scaleX(${stretch.toFixed(2)})`;
                    // ⚠️ HELD BRIGHT, THEN DROPPED — the same curve the damage numbers use, and for the
                    // same reason written over them: "a number that fades from frame one is never read".
                    // A linear fade spends the whole life being half-there, which is what made these
                    // register as haze rather than as light.
                    s.node.style.opacity = String(k < 0.55 ? 1 : 1 - (k - 0.55) / 0.45);
                    continue;
                } else if (s.flat) {
                    // ⚠️ POSITION ONLY. A shape's whole identity is its own keyframes — a bolt snapping
                    // down, fire growing up — and writing a scale() here every frame would overwrite the
                    // transform those keyframes are animating, flattening all six back into one blob.
                    // Opacity is left alone for the same reason.
                    s.node.style.left = `${(s.x - cam) * unit}px`;
                    s.node.style.bottom = `${(s.y - camY) * unit + (w.groundPx || 0)}px`;
                    continue;
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

            // ── AND THE MUSIC REACTS TOO ────────────────────────────────────────────────────────
            // The same two facts the screen is already drawing — how much health is left, and whether a
            // boss is up — handed to the bed, which turns layers on with them. Four times a second rather
            // than per frame: these are two numbers a scheduler reads at the top of a bar, so sixty writes
            // a second would be fifty-nine thrown away.
            if (now - (w.musicAt || 0) > 250) {
                w.musicAt = now;
                const hpFrac = Math.max(0, w.hp) / maxHp;
                setGroveDanger(w.hp > 0 ? 1 - hpFrac : 1);
                // `noticed` is the boss's own flag, set when it first sees you (see the notice above) and
                // gone with the world when the zone is. Read rather than pushed, so there is no transition
                // to miss: walking out of a zone mid-fight cannot leave the music hunting you.
                setGroveBoss(Boolean(w.boss && w.boss.noticed && w.boss.hp > 0));
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

        // ── ⚠️ THE ONLY PLACE THE HOST'S SIZE IS MEASURED ───────────────────────────────────────────
        // The frame loop used to read host.clientWidth and clientHeight four times a frame, and every one
        // of those reads forces the browser to lay the whole scene out before it can answer -- after the
        // loop has just written a transform onto every body, shadow, particle and floater. The more there
        // is on screen the more that costs, which is why it bit hardest on a multi-kill.
        //
        // A scene host changes size when the window does and at no other time, so it is measured here, on
        // the event that actually means it changed. The loop reads two numbers instead.
        const measureHost = () => {
            const h = hostRef.current;
            if (!h) return;
            w.hostW = h.clientWidth;
            w.hostH = h.clientHeight;
        };
        measureHost();
        // ResizeObserver rather than a window resize listener: it also catches the host changing size when
        // the window does not -- a phone's address bar collapsing, or the keyboard opening over the scene.
        const ro = typeof ResizeObserver === "function" ? new ResizeObserver(measureHost) : null;
        ro?.observe(host);
        window.addEventListener("orientationchange", measureHost);

        return () => {
            cancelAnimationFrame(raf);
            ro?.disconnect();
            window.removeEventListener("orientationchange", measureHost);
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
    }, [mounted, world, spawn, seed, bonuses, stats, onSettle, W, zone.id, zone.boss, labScene, maxHp, onBoss, rerender, worldAt]);

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
        // The persistent condition layer -- frost, flame, stars. The loop writes its class directly.
        body.statusNode = n?.querySelector(".gv-status") || null;
        // The creature's own health bar: the strip, the ghost behind it, the fill, and the white strike.
        // Looked up once here rather than queried in the loop, like everything else on a body.
        body.barNode = n?.querySelector(".gv-ehp") || null;
        body.barGhost = body.barNode?.querySelector("u") || null;
        body.barFill = body.barNode?.querySelector("i") || null;
    }, []);

    // ── ⚠️ ONE REF AND ONE TAP HANDLER PER CREATURE, REUSED FOR ITS WHOLE LIFE ─────────────────────
    // wire(f) and onTapFoe(f.uid) both BUILD A NEW FUNCTION every time they are called. Passed straight
    // into the render that is the end of memoisation: a new closure is a changed prop, so every creature
    // would re-render on every kill no matter how carefully FoeBody is wrapped. It is also a second,
    // quieter bug -- a changed ref callback makes React detach and re-attach the ref, which runs wire()
    // again and re-queries four nodes per body.
    //
    // Cached by uid, and rebuilt only if the creature object itself is replaced or the tap handler's own
    // identity changes (it depends on `dead`).
    const foeCbs = useRef(new Map());
    const foeCbFor = useCallback((f) => {
        const m = foeCbs.current;
        let e = m.get(f.uid);
        if (!e || e.foe !== f || e.tap !== onTapFoe || e.wireFn !== wire) {
            e = { foe: f, tap: onTapFoe, wireFn: wire, ref: wire(f), down: onTapFoe(f.uid) };
            m.set(f.uid, e);
        }
        return e;
    }, [onTapFoe, wire]);
    // Creatures are spawned and killed all session, so the cache has to be swept or it grows for ever.
    // Done after render against the world's own list rather than during it.
    useEffect(() => {
        const m = foeCbs.current;
        if (m.size < 120) return;
        const alive = new Set((worldRef.current?.foes || []).map((f) => f.uid));
        for (const uid of m.keys()) if (!alive.has(uid)) m.delete(uid);
    });

    // A body: shell (position) > shadow + art (facing, squash) > sprite + flash.

    const scene = (
        // ⚠️ THE SLAB IS A VARIABLE ON THE SCENE, NOT A src ON EACH LEDGE. A zone has up to a dozen ledges
        // and they are all made of the same thing, so one custom property inherited down is one declaration
        // and one decoded bitmap — and border-image has no src attribute to set anyway.
        <div className="gv-scene is-full" ref={hostRef} onPointerDown={onTapWorld}
            // ⚠️ THE BIOME IS ON THE ELEMENT so the stylesheet can answer for a whole room rather than each
            // ledge carrying its own correction. See the note on the char slab in grove-css.
            data-biome={groveBiome(sceneBiome)?.slab || null}
            style={{ "--gv-slab": `url(${slabArt(sceneBiome)})`, "--gv-slab-surface": slabSurface(sceneBiome) }}>
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
                <div className="gv-haze" style={{ "--gv-haze-img": `url(${bgArt})` }} aria-hidden="true" />
                <div className="gv-sky" ref={(n) => { if (worldRef.current) worldRef.current.skyNode = n; }}>
                    {Array.from({ length: SKY_TILE_COUNT }, (_, i) => i).map((i) => (
                        <div key={i} className="gv-sky-t" style={{ backgroundImage: `url(${bgArt})` }} />
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
                {/* ── ✂️ THE TELEGRAPH BAND IS GONE, 2026-11-08 ────────────────────────────────────────
                    Luke: "Remove the orange circle attack animation." This was it — a pulsing orange ellipse
                    on the ground at the attack's real reach, with a fill sweeping across it over the
                    wind-up, so what was on screen WAS the window you had to move.

                    ⚠️ THE ATTACK ITSELF IS UNTOUCHED. w.tels still exists, still resolves on its own clock
                    and still hit-tests against the hero through telegraphHits — only the picture is gone.
                    What announces a blow now is the creature's own wind-up (see `wind` in the body pass),
                    which is a pose rather than a ground marker.

                    ⚠️ SO AN ATTACK IS NOW HARDER TO DODGE, AND THAT IS THE TRADE. The band was built
                    because "a telegraph must be dodgeable" and it showed reach as well as timing; a leaning
                    sprite shows timing alone. If dodging stops feeling fair, this is the thing to put back,
                    and it is one JSX block plus its positioner. */}

                {/* Loot on the floor: the item's own sprite and a name you can read, per Luke's note.
                    The drawn tier-stone stays as the fallback for anything with no art yet — a new part
                    added without a sprite should land on the floor looking like loot, not like a hole. */}
                {world.drops.map((d) => (
                    <span key={d.uid} className={`gv-drop t${d.tier || 1}${d.emblem ? " is-emblem" : ""}${d.rare ? " is-rare" : ""}${d.band ? ` is-${d.band}` : ""}${d.rareRow ? " is-rarerow" : ""}`}
                        ref={(n) => { const dd = d; dd.node = n; dd.labelNode = n?.querySelector("b") || null; }}
                        aria-hidden="true">
                        {/* ⚠️ AN EMBLEM DROP IS A CARD, NOT A SPRITE. Everything else in the pile is one
                            picture of one object, so it renders as an <img> and the drawn tier-stone is
                            the fallback for anything with no art yet. A Monster Card is a composed thing
                            -- creature, frame, seal -- and the floor shows the same object the reveal
                            did, at the size you can recognise from across the zone. */}
                        {d.emblem && d.face ? (
                            <span className="gv-drop-card">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={d.face} alt="" />
                                {d.seal ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img className="gv-drop-seal" src={d.seal} alt="" />
                                ) : null}
                            </span>
                        ) : d.art ? <img src={d.art} alt="" /> : <i />}
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

                {/* ── ⚠️ A QUEST-GIVER IS SCENERY YOU CAN TOUCH, NOT A CREATURE ────────────────────
                    Deliberately NOT a .gv-foe: the scene's tap handler resolves a world coordinate into
                    "walk there" or "attack that", and an NPC inside that set would be a body the hero
                    tries to kill. It sits in the same layer as the doors, which is the other thing in a
                    zone you touch without fighting.

                    The badge is the whole reason this is worth drawing at all — a figure standing in a
                    room says nothing, and a figure with "ready" over their head is a reason to cross
                    the room. */}
                {/* ── ⚠️ A CHEST IS A THING YOU TAP ONCE, SO IT MUST LOOK SPENT THE INSTANT YOU DO ──
                    The open is a round trip, and a chest that still looks shut while that is in flight
                    is a chest somebody taps again — which the server refuses, correctly, and which
                    reads to the player as the first tap not working. `is-opening` lands on the frame
                    of the tap; the row disappearing is what confirms it.

                    Spread along the floor rather than stacked: four boxes in one spot is one box as
                    far as a thumb is concerned. */}
                {/* ── THE CARD, DEALT ──────────────────────────────────────────────────────────
                    Rises, holds, and goes. Deliberately NOT a modal: the fight continues underneath and
                    nothing waits for a tap, because a rare drop that interrupts you is a rare drop you
                    start to resent on the four-hundredth kill. Pointer-transparent for the same reason —
                    an overlay over the creature you were about to hit must never eat the tap.

                    ⚠️ THE CREATURE IS THE FACE OF THE CARD. Luke: "its supposed to be a card of the enemy
                    you are collecting. So i want it to be a card of the enemy as a sprite for each one."
                    An earlier cut of this showed `emblem-em_*.webp` — the carved amulet — at full size and
                    called the thing a trophy, on the reasoning that the art should name the object. That
                    had it backwards: the object was always a card of a monster, and the amulet is the mark
                    that stands for that monster. So the amulet is the seal in the corner and the creature's
                    own sprite is the picture.

                    No art was drawn for this. Every creature in the Grove already has a sprite and
                    emblemFace indexes them by the card they drop. */}
                {trophy ? (
                    <div className="gv-mc" key={trophy.at} aria-hidden="true">
                        <i className="gv-mc-rays" />
                        <div className="gv-mc-card">
                            <div className="gv-mc-art">
                                {trophy.face ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={trophy.face} alt="" draggable={false} />
                                ) : null}
                                {trophy.seal ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img className="gv-mc-seal" src={trophy.seal} alt="" draggable={false} />
                                ) : null}
                            </div>
                            <b>{trophy.name}</b>
                            {/* ⚠️ THE EFFECT IS PART OF THE MOMENT, not something to go and look up. A card
                                whose whole point is a permanent passive, revealed without saying what it
                                does, teaches nothing — and teaching is the job here, because the player
                                holding their first one has no idea what they caught. */}
                            {trophy.stat ? (
                                <u>{trophy.kind === "pct" ? `+${trophy.per}%` : `+${trophy.per}`}{" "}
                                    {String(trophy.stat).replace(/_/g, " ")}</u>
                            ) : null}
                        </div>
                        {/* The one word that stops this being filed under the card game. It is not decoration: a
                            player who never opens a panel still learns from this line that the card is a
                            monster they collected, not a card they play. */}
                        <span className="gv-mc-tag">Monster Card</span>
                    </div>
                ) : null}

                {(groundChests || []).map((c, i) => (
                    <button key={c.id} type="button"
                        // ⚠️ gv-zchest, NOT gv-chest. The bench's chest SHELF already owned .gv-chest — a
                        // list of rows with art, a name and an Open button — and this rule set, being
                        // later in the same stylesheet, was absolutely positioning every one of those
                        // rows at 26% / 7% in a 58x52 box at z-index 250. Luke saw the result as "this
                        // random open button just hanging out over text". Same stylesheet, same name,
                        // two completely different objects: [[grep-the-class-name-before-taking-it]].
                        className={`gv-zchest${c.opening ? " is-opening" : ""}`}
                        style={{ "--gv-zchest-i": i }}
                        onPointerDown={(e) => { e.stopPropagation(); if (!c.opening) onOpenChest?.(c.id); }}
                        aria-label={`Open the ${c.tier} chest`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/images/grove/chest-${c.tier}.webp`} alt="" draggable={false} />
                    </button>
                ))}

                {/* ── ⚠️ THE COLISEUM, STANDING IN THE ZONE THAT CLAIMS TO HOLD IT ─────────────────
                    Two touchable things, not one: the gate is the destination and the marshal is the
                    person who explains it and hands over the daily key. Tapping either does the right
                    thing for the state you are in — take the free key when one is waiting, otherwise
                    go in — because a gate that refuses you with "no key" while a free key sits
                    unclaimed on the other sprite is a puzzle nobody asked for. */}
                {coliseumHere ? (
                    <>
                        <button type="button" ref={colGateRef}
                            /* Height is the constant; width follows the building's own measured aspect, so
                               all seven stand the same height instead of six different ones. */
                            style={{ "--col-h": COLISEUM_H, "--col-ar": coliseumArt(coliseumHere.map).ar }}
                            className={`gv-colgate${coliseumHere.keys > 0 || coliseumHere.dailyReady ? " is-open" : " is-shut"}`}
                            onPointerDown={(e) => { e.stopPropagation(); onColiseum?.(); }}
                            aria-label={coliseumHere.keys > 0
                                ? "Enter the Coliseum"
                                : coliseumHere.dailyReady
                                    ? "Coliseum — take today's key"
                                    : "Coliseum — no key"}>
                            {/* ⚠️ THE MAP'S OWN BUILDING, NOT ONE SPRITE RECOLOURED SEVEN TIMES. Each
                                front is built from what its map HAS — roots, bone, basalt — so walking in
                                is not a change of world. See COLISEUM_ART in grove-arena.js. */}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={coliseumArt(coliseumHere.map).src} alt="" draggable={false} />
                            {/* ⚠️ NO FLOATING LABEL. "Coliseum" and the key count used to hang over and
                                under the building in HUD type. Everything else in the frame is painted into
                                the world, so two pieces of interface stapled on top turned a landmark back
                                into a map marker — the exact thing building it was meant to stop. The
                                building says what it is by being one; the key count lives on the marshal's
                                card, which is where you go to decide anything. */}
                        </button>
                        {coliseumHere.marshal ? (
                            <button type="button" ref={colNpcRef}
                                className={`gv-colnpc${coliseumHere.dailyReady ? " is-ready" : ""}`}
                                onPointerDown={(e) => { e.stopPropagation(); onMarshal?.(); }}
                                aria-label={`${coliseumHere.marshal.name} — ${coliseumHere.marshal.line}`}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={`/images/grove/npc-${coliseumHere.marshal.id}.webp`} alt="" draggable={false} />
                                {coliseumHere.dailyReady ? <span className="gv-npc-pip">!</span> : null}
                            </button>
                        ) : null}
                    </>
                ) : null}

                {/* ── ✂️ THE QUEST GIVER STOOD HERE ──────────────────────────────────────────────────
                    A tappable figure, drawn only in the zone he was hidden in, with three states and
                    three marks — the convention every player already knows: "!" he wants something,
                    the count while you are doing it, "✓" when it is done and he is waiting for you.

                    ⚠️ AND NO FRACTION ON A STEP NOBODY HAD AGREED TO. Luke: "0 of 5 doesnt make
                    sense." It did not: an untaken step rendered `0/5` over his head, which reads as
                    five things you have somehow already failed to do, for a job you had not been
                    offered. Worth keeping written down — it is a rule about progress marks, not
                    about quests, and the next thing with a pip over it will have the same choice. */}

                {world.foes.map((f) => {
                    const cb = foeCbFor(f);
                    return (
                        <FoeBody key={f.uid} art={f.art} h={f.h} rare={f.rare} isBoss={f.isBoss}
                            big={f.big} name={f.name}
                            onDown={cb.down} refCb={cb.ref} />
                    );
                })}

                {/* ⚠️ THE PET IS RENDERED BEFORE THE HERO, SO IT PAINTS BEHIND HIM. These are absolutely
                    positioned siblings with no z-index, so document order is the entire stacking rule — and
                    with the pet last it was drawing OVER the hero's sword arm every time it caught up,
                    which made the two of them read as one lumpy object. The player's own character is the
                    one thing on screen that must never be occluded by anything friendly. */}
                <div className="gv-pet" style={{ "--gv-h": PET_UNITS }} ref={wire(world.pet)}>
                    {bodyArt(petArt, { claw: true })}
                </div>
                <div className="gv-hero"
                    style={{ "--gv-h": HERO_UNITS, "--gv-art-url": heroArt ? `url(${heroArt})` : undefined }}
                    ref={wire(world.hero)}>
                    {bodyArt(heroArt, { swipe: true })}
                    {/* ── ⚠️ THE HERO NEVER CHANGED, WHATEVER WAS TRUE OF HIM ─────────────────────
                        Warded, guarded, hasted, or four hit points from the floor, he was the same
                        sprite -- a shield that had just eaten 120 damage was invisible, and so was
                        being about to die. The creature layer above solved exactly this problem for
                        creatures; the hero had the same hole and it matters more, because he is the
                        one body the player is actually watching. */}
                    <i className="gv-status" aria-hidden="true" />
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

            {/* ── THE KILL BAR ─────────────────────────────────────────────────────────────────────
                Luke: "You kill enemies in an area. A bar fills. It reaches full. You get a reward."

                Stands where the haul list used to, which is the one part of the frame that is neither
                the boss bar at the top nor the dock and the note at the bottom.

                ⚠️ IT NAMES THE REWARD. `bar.next` is resolved server-side — the next tool in TOOL_SLOTS
                order that this map still owes, or the chest ceiling once all twelve are held — so the
                meter fills toward a named, drawn object rather than toward "a reward".

                ⚠️ NOT aria-hidden, UNLIKE THE HAUL IT REPLACED. The haul was hidden because every row
                had already been announced twice over; this is the only place the bar exists, so hiding
                it would make the feature invisible to a screen reader rather than merely quieter.
                role="progressbar" with the real numbers, because that is exactly what it is. */}
            {bar?.need ? (() => {
                // ── ⚠️ IT FILLS AS YOU KILL, NOT WHEN THE SERVER NOTICES ────────────────────────────
                // Luke: "Killing enemies doesn't make the bar fill."
                //
                // It only ever moved on a settle, and SETTLE_EVERY_MS is 45 SECONDS. So the honest reading
                // of a bar that is supposed to answer "how close am I" was: kill thirty things, watch
                // nothing happen, and conclude it is broken. It was not broken, it was asleep.
                //
                // ⚠️ THE LIVE VALUE NEEDS NO NEW STATE, AND THAT IS WHY THIS IS THE RIGHT SUM. `killLog`
                // holds exactly the kills the server has NOT been told about yet, and `bar.kills` is the
                // server's count of everything it HAS. Adding them is the whole answer, it cannot drift,
                // and it resets itself the instant the log is spliced into a settle — no second counter to
                // keep in step, and no window where the bar ticks backwards because two tallies disagree.
                //
                // ⚠️ AND IT SUMS CREDIT, NOT ROWS. One entry can be eight bodies (`c`), which is the same
                // mistake the server was making until this commit — see the note on slainTotal in grove.js.
                const pending = (world.killLog || []).reduce((a, k) => a + (Number(k?.c) || 1), 0);
                const shown = Math.min(bar.need, (bar.kills || 0) + pending);
                return (
                <div className={`gv-bar${bar.next?.kind === "chest" ? " is-chest" : ""}`}
                    role="progressbar" aria-valuemin={0} aria-valuemax={bar.need}
                    aria-valuenow={shown}
                    aria-label={bar.next?.kind === "chest"
                        ? `${bar.need - shown} kills to a chest`
                        : `${bar.need - shown} kills to ${bar.next?.name || "a tool"}`}>
                    {/* ⚠️ THE CHEST, NOT THE PRIZE. It used to draw bar.next's own sprite and name — which
                        told you exactly what 250 kills was going to hand over before you had earned any of
                        it. The strip shows a closed chest now and the reveal does the telling. */}
                    {bar.chestArt ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={bar.chestArt} alt="" width={30} height={30} draggable={false} />
                    ) : null}
                    <span className="gv-bar-txt">
                        <b className="gv-bar-name">Next chest</b>
                        <span className="gv-bar-track">
                            {/* ⚠️ CLAMPED AT 100%. The remainder carries across a fill, so a settle that
                                crossed two rewards can hand back a kills value the width maths would
                                otherwise render as 180% — which paints outside the track. */}
                            <i className="gv-bar-fill" style={{
                                width: `${Math.min(100, Math.round((100 * shown) / bar.need))}%`,
                            }} />
                            {/* ── ⚠️ ONE KILL IS 0.4% OF THE BAR, WHICH IS ABOUT A PIXEL AND A HALF ──────
                                Luke: "Killed 1 enemy, didnt see the bar raise." The live fill was by then
                                working correctly — the problem is arithmetic. A 250-kill bar cannot show a
                                single kill by getting longer, at any width, ever.

                                So the increment is announced instead of measured: a bright tick at the
                                leading edge, flashed on each advance.

                                ⚠️ KEYED ON `shown`, WHICH IS THE ENTIRE TRICK. Mutating the style of a live
                                element does not restart a CSS animation — the deleted haul counter carried
                                this exact note for the same reason. The key makes React replace the node,
                                and a fresh node runs its animation from frame zero. */}
                            <i className="gv-bar-tick" key={shown} style={{
                                left: `${Math.min(100, Math.round((100 * shown) / bar.need))}%`,
                            }} />
                        </span>
                    </span>
                    {/* ⚠️ CLAMPED, LIKE THE WIDTH ABOVE. BAR_MAX_FILLS defers rewards rather than
                        destroying them, so a single enormous settle can leave MORE than a full bar on the
                        clock — 2,600 kills pays eight and leaves 600 sitting on a 250 bar. Nothing is lost
                        (the next kill pays it out), but "600/250" reads as a bug. */}
                    {/* Keyed for the same reason as the tick: the number is the only thing on this strip
                        that can show a single kill, so it has to be seen to change. */}
                    <span className="gv-bar-n"><b key={shown}>{shown}</b>/{bar.need}</span>
                </div>
                );
            })() : null}

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
                {/* ── ⚠️ IN THE ARENA THIS SLOT ANSWERS A DIFFERENT QUESTION ─────────────────────
                    The zone's kill count is meaningless during a Coliseum run — the door it counts
                    toward is not the thing you are doing. What a player needs for two minutes is the
                    clock and which wave they are on, and this is already the top-middle slot the eye
                    goes to. Reusing it rather than adding a second HUD keeps one place for "the number
                    that matters right now", which is what it was built to be. */}
                {arena && waves ? (
                    <>
                        <b ref={clockRef} className="gv-clock">2:00</b>
                        <span>{waveNow > 0 ? `Wave ${Math.min(waveNow, waves.length)} of ${waves.length}` : `${waves.length} waves`}</span>
                    </>
                ) : killsHere < zone.toUnlock ? (
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
                {/* ✂️ THE BELT CHIP WAS HERE -- the poultice's sprite, its name and the count left,
                    flashing as it dropped, and an empty state that sent you to the bench for more.
                    It went with the belt on 2026-11-09; there is no food to count. */}
                {canNative ? (
                    <button type="button" className="gv-leave" onClick={toggleNative}
                        aria-label={isNative ? "Leave full screen" : "Full screen"}>
                        {isNative ? "⇲" : "⇱"}
                    </button>
                ) : null}
                <button type="button" className="gv-leave" onClick={onLeave}>Leave</button>
            </div>

            {/* ── ⚠️ THE MENU, AND IT BANKS THE KILLS BEFORE IT OPENS ANYTHING ───────────────────
                It lives in the SCENE rather than in GroveClient for one reason: kills are settled in
                batches every 45 seconds, so at any moment there can be most of a minute of drops that the
                server has never heard about. Opening a backpack that is missing the last forty creatures
                you killed is worse than not having the button — and crafting off that stale bag would ask
                the workbench to spend parts the server does not yet know you own. The scene is the only
                thing holding that list, so it is the thing that flushes it. openPanel does that, and the
                drawer calls it exactly as the old dock did.

                ⚠️ THE HANDLE KEEPS zdockRef. The loop fades these controls back mid-swing and switches
                off their pointer events (see DOCK_QUIET_MS), which was written for the old row sitting in
                the middle of the fight. A handle up the left edge needs it far less — but a thumb that
                brushes the edge while chasing something should still not open a menu, so the behaviour
                stays and simply has one element to write to instead of seven. */}
            {onPanel ? (
                <GroveMenu
                    open={menuOpen}
                    onOpen={() => setMenuOpen(true)}
                    onClose={() => setMenuOpen(false)}
                    handleRef={zdockRef}
                    // ── ✂️ THE BADGE MAPPING IS GONE, SO THE FAMILIES PASS STRAIGHT THROUGH ──────────
                    // All three of its arms went: the quest row's ready-to-hand-in count, the bench row's
                    // craftable count, and before those a FULL warning on the bag. With nothing left to
                    // decorate, the .map() it ran in was an identity over ZONE_FAMILIES.
                    //
                    // ⚠️ TWO RULES IT ENCODED, FOR WHATEVER GETS A BADGE NEXT. Ready-to-hand-in was the
                    // BADGE and in-progress was only a NOTE, because a number on the closed menu means
                    // "there is something to collect in here" — true of a finished step and a lie about one
                    // you are halfway through, and a badge that is always lit is a badge nobody reads. And
                    // the bag's FULL warning came out when the ceiling did, because a badge that can never
                    // fire is one somebody maintains for ever for nothing.
                    families={ZONE_FAMILIES}
                    onPick={(k) => openPanel(k)}
                    footer={(
                        /* ── ⚠️ THE SOUND SWITCH IS A SETTING AND NOW IT LOOKS LIKE ONE ──────────
                           Luke: "the mute button is like conflicting with the kill count thing. And I
                           feel like the mute button can be put somewhere else." It went into the dock,
                           where it was a seventh circle among six doors — a setting drawing the eye as
                           hard as the workbench. In a drawer it can sit in a footer, below the
                           destinations, which is where a setting belongs. */
                        <button type="button" className="gv-mmenu-sound"
                            aria-pressed={soundOff}
                            onClick={toggleSound}>
                            {soundOff ? <GiSoundOff aria-hidden="true" /> : <GiSoundOn aria-hidden="true" />}
                            <span>{soundOff ? "Sound off" : "Sound on"}</span>
                        </button>
                    )}
                />
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
function setUpLabScene(w, scene, blow = 400) {
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
    } else if (scene === "loot" || scene === "gear") {
        // ⚠️ "gear" SHARES THE LOOT STAGING ON PURPOSE. What it changes is one roll, not the scene: the
        // forced gear above needs a kill to ride on, and this is the arrangement that already produces one
        // inside the first second of film. A separate staging would be a second thing to keep in step.
        // One hit point, so the first swing kills and the spill, the rest and the draw-in all land inside
        // three seconds of film.
        // ⚠️ THE WHOLE POPULATION, NOT FOUR OF THEM. Four creatures at one hit point die inside the first
        // second and every sheet of this scene was a picture of the aftermath — loot already resting, hero
        // already idle, and not one frame of the kill itself. A scene for filming a kill has to be able to
        // produce a kill for as long as the camera is running.
        const weak = w.foes.filter((x) => !x.isBoss);
        weak.forEach((f, i) => {
            // ⚠️ THE GEAR SCENE CANNOT USE ONE HIT POINT. At 1hp the first creature dies during mount, before
            // a camera is running — so the forced gear drop had already been spilled, landed and collected
            // by frame zero, and the sheet showed the tally with a Battle Staff in it and no picture of the
            // staff. The thing being reviewed is the ARC and the LANDING, which means the kill has to happen
            // on camera. Three swings at the bench kit puts it about a second in, with the camera rolling.
            f.hp = scene === "gear" ? 150 : 1;
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
    } else if (scene === "aoe") {
        // ── A CROWD, AND ONE OF THEM ABOUT TO DIE ────────────────────────────────────────────────────
        // ⚠️ THE WHOLE POINT IS THE SECOND RING, NOT THE FIRST. A corpse bursting is one circle; a corpse
        // bursting and taking three neighbours with it, each of those bursting in turn, is the thing Luke
        // is describing — and it only reads if the bodies are standing close enough to be inside each
        // other's radius. Eight of them, packed within a Bloodletting radius of the first, the nearest on
        // one hit point so the chain starts on the opening swing.
        const mob = w.foes.filter((f) => !f.isBoss).slice(0, 8);
        mob.forEach((f, i) => {
            f.x = Math.max(6, w.hero.x + 3 + (i % 4) * 2.6 + (i > 3 ? 1.3 : 0));
            f.y = w.hero.y;
            f.vx = 0; f.vy = 0;
            f.grounded = true;
            f.face = -1;
            f.passive = false;
            f.hit = true;
            // Enough health that the BURST is what kills them, not the sword — otherwise the sheet shows
            // eight ordinary kills in a row and no chain at all.
            f.hp = i === 0 ? 1 : Math.max(2, Math.round(f.maxHp * 0.3));
            f.dmg = [0, 0];
        });
        if (mob[0]) w.target = mob[0];
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
    } else if (scene === "multi") {
        // ── MULTI-KILL, ON DEMAND ───────────────────────────────────────────────────────────────────
        // ⚠️ UNFILMABLE ANY OTHER WAY, WHICH IS THE WHOLE POINT OF THIS BENCH. An overkill needs a blow
        // worth twice a creature's FULL health, and at your own frontier you are roughly matched — so the
        // only way to see one in real play is to walk a geared account back into a zone it left behind.
        // A moment that needs an hour of the right kind of play to reach is a moment nobody reviews.
        //
        // Four of them, each sized so the SAME swing lands on a different rung: x1, x2, x4 and the x8 cap.
        // Four pops in one sheet is the only way to judge whether the number reads at a glance and whether
        // it tangles with the damage number thrown off the same body on the same frame.
        const marks = w.foes.filter((f) => !f.isBoss).slice(0, 4);
        marks.forEach((f, i) => {
            f.x = Math.max(6, w.hero.x + [3.0, -3.0, 6.2, -6.2][i]);
            f.y = w.hero.y;
            f.vx = 0; f.vy = 0;
            f.grounded = true;
            f.face = f.x > w.hero.x ? -1 : 1;
            f.passive = false;
            f.hit = true;
            // ⚠️ maxHp IS WHAT killCredit READS, so it is the thing being set — hp just has to be at or
            // below it. The last one is far over the cap on purpose: "does the cap hold" is half of what
            // this scene is for.
            //
            // ⚠️ AND THE DIVISORS ARE 2.5 AND 5, NOT 2 AND 4. Sized exactly on the rung, an ordinary
            // non-crit blow lands a hair UNDER it — the first cut of this fixture used 4 and filmed an x2,
            // because 34 damage into a 9hp creature is 3.78x and the rule is a floor, correctly. Sitting
            // each one between its rung and the next makes the scene show what it says it shows.
            const ratio = [1, 2.5, 5, 20][i];
            f.maxHp = Math.max(1, Math.round(Math.max(8, blow) / ratio));
            f.hp = f.maxHp;
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
        // ✂️ AND IT USED TO HAVE TO DISARM THE BELT TOO, or a hero dropped to 14 hit points healed
        // himself back up on the next frame and the scene filmed a man strolling away from three
        // creatures. Nothing heals mid-zone any more, so the staging is just the health.
        w.hp = 14;
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
    } else if (scene === "burn") {
        // ── ⚠️ A SPREAD NEEDS A CROWD, AND WANDER DOES NOT MAKE ONE ────────────────────────────
        // Fire catches the nearest body within BURN_SPREAD_UNITS, and a zone's population wanders far
        // enough apart that filming it off ordinary play is waiting for two creatures to drift together
        // while a burn happens to be running. Three of them shoulder to shoulder, fat enough to outlive
        // the ticks, and the hero already swinging at the middle one.
        const row = w.foes.filter((f) => !f.isBoss).slice(0, 3);
        row.forEach((f, i) => {
            f.x = w.hero.x + 7 + i * 3.4;
            f.y = 0;
            f.vx = 0; f.vy = 0; f.grounded = true; f.face = -1;
            f.hit = true; f.passive = false;
            f.hp = 4000; f.maxHp = 4000;
        });
        if (row[0]) w.target = row[0];
    } else if (scene === "kit") {
        // One creature with a great deal of health, angry and targeted, and hitting back -- half of what
        // is being proved here only fires when the hero is STRUCK.
        const [one] = w.foes.filter((f) => !f.isBoss);
        if (one) {
            one.x = w.hero.x + 6;
            one.y = 0;
            one.vx = 0; one.vy = 0; one.grounded = true; one.face = -1;
            one.hit = true; one.passive = false;
            one.hp = 60000; one.maxHp = 60000;
            w.target = one;
        }
    } else if (scene === "cold") {
        // One creature with enough health to outlive the film, angry and targeted, so the hero keeps
        // landing the blows every cold effect is rolled on.
        const [one] = w.foes.filter((f) => !f.isBoss);
        if (one) {
            one.x = w.hero.x + 6;
            one.y = 0;
            one.vx = 0; one.vy = 0; one.grounded = true; one.face = -1;
            one.hit = true; one.passive = false;
            one.hp = 20000; one.maxHp = 20000;
            w.target = one;
        }
    } else if (scene === "stun") {
        // One creature, fat enough to outlive the film, already angry and already targeted -- a stun is
        // rolled on the hero's LANDED blow, so the scene has to make him land one.
        const [one] = w.foes.filter((f) => !f.isBoss);
        if (one) {
            one.x = w.hero.x + 6;
            one.y = 0;
            one.vx = 0; one.vy = 0; one.grounded = true; one.face = -1;
            one.hit = true; one.passive = false;
            one.hp = 9000; one.maxHp = 9000;
            w.target = one;
        }
    } else if (scene === "warden") {
        // Surrounded and being hit, which is the only state a Warden's tree has anything to say about.
        // Fat creatures so the exchange outlives the film, and the hero already swinging so the guard
        // roll (which rides his own blow) actually happens.
        const two = w.foes.filter((f) => !f.isBoss).slice(0, 2);
        two.forEach((f, i) => {
            f.x = w.hero.x + (i % 2 ? 3.6 : -3.6);
            f.y = 0;
            f.vx = 0; f.vy = 0; f.grounded = true;
            f.hit = true; f.passive = false;
            f.hp = 9000; f.maxHp = 9000;
        });
        if (two[0]) w.target = two[0];
    // ✂️ THE "eat" LAB SCENE WAS HERE -- hurt, surrounded and carrying food, staged just under the
    // 60% line so the first bite triggered the swallow. It was the one beat the bench could not
    // produce on demand. It goes with the belt it existed to film.
    } else if (scene === "emblem") {
        // One creature at the hero's elbow, dying.
        //
        // ⚠️ 420 HEALTH WAS TWELVE SWINGS AND THE FILM IS TWO SECONDS. Every other scene here is staged to
        // SURVIVE the camera, and this one was written to the same instinct -- "enough health to still be
        // dying when the camera starts" -- but the moment this scene exists to photograph begins at the
        // KILL, so health is the one thing it must not have. Two full sheets came back as twenty-four
        // frames of an ordinary fight, counter stuck on 0/40, no trophy in any of them, and the scene
        // looked broken when it was only mis-staged.
        //
        // 160 is a handful of swings -- about a second and a half. Deliberately not fewer: at 40 the kill
        // landed ~300ms after mount, which is faster than a cold image fetch, so every film showed the ray
        // fan spinning around an empty hole and made the art preload look like it had not worked. In real
        // play a trophy arrives minutes into a zone and the preload finished long before. A lab scene that
        // is harsher than anything the game can produce tests the rig, not the feature.
        const victim = w.foes.filter((f) => !f.isBoss)[0];
        if (victim) {
            victim.x = w.hero.x + 2.5;
            victim.y = 0;
            victim.vx = 0; victim.vy = 0; victim.grounded = true; victim.face = -1;
            victim.hp = 160; victim.maxHp = 160;
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
