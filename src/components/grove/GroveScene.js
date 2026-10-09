"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
    GROVE_ENEMIES, GROVE_RARE, GROVE_POP, HEAL_AT, scaledFoe, groveBoss, groveSize, grovePart,
} from "@/lib/marketplace/grove-catalog.js";
import { rngFrom, rollKill, rollRareSpawn } from "@/lib/marketplace/grove-roll.js";
import {
    UNITS_PER_SCREEN, zoneWidth, platformsFor, swing, makeTelegraph, telegraphHits, mitigate,
} from "@/lib/marketplace/grove-world.js";
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
    HITSTOP_MS, TRAUMA, SWING, SWING_TOTAL_MS, KNOCK, RECOIL, FLASH_MS, DEATH_MS, SPAWN_FADE_MS,
    SPARK, DUST, VIGNETTE, COMBO_WINDOW_MS, COMBO_PITCH_STEPS, LOOT_BOUNCE, LOOT_REST_MS,
    LOOT_LABEL_MS, LOOT_DRAW_ACCEL, LOOT_DRAW_MAX, LOOT_EAT_DIST,
} from "@/lib/marketplace/grove-juice.js";
import {
    playHit, playKill, playHurt, playDrop, playPickup, playWhiff, playTell,
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
// How far above or below a creature the hero will still swing at it. A body one tier up is not in reach.
const SWING_V_REACH = 6;
// A pet that falls this far behind has lost the plot — see the rescue in the loop.
const PET_LOST = 30;

export default function GroveScene({
    zone, seed, bonuses, stats, heroArt, petArt, belt, labScene,
    onSettle, onBoss, onLeave, onDeath,
}) {
    const hostRef = useRef(null);
    const worldLayerRef = useRef(null);
    const fxRef = useRef(null);
    const hpRef = useRef(null);
    const hpGhostRef = useRef(null);
    const bossFillRef = useRef(null);
    const bossGhostRef = useRef(null);
    const comboRef = useRef(null);
    const vignRef = useRef(null);
    const worldRef = useRef(null);
    const camRef = useRef(0);
    const camYRef = useRef(0);

    // What a human reads, and only what changes a few times a minute.
    const [kills, setKills] = useState(0);
    const [dead, setDead] = useState(false);
    const [bossName, setBossName] = useState(null);
    const [beltLeft, setBeltLeft] = useState(Number(belt?.count) || 0);
    // ── ⚠️ THE LIST IS STATE; THE POSITIONS ARE NOT ─────────────────────────────────────────────────
    // The first version pushed foes into world.foes imperatively and React was never told, so the zone
    // rendered with zero enemies in it while the simulation happily ran thirty of them. The split that
    // works is by FREQUENCY: the population changes on a spawn or a death — a few times a minute — so it
    // is state; a position changes sixty times a second per body, so it stays a ref and is written
    // straight onto the node.
    const [gen, bumpGen] = useState(0);
    const rerender = useCallback(() => bumpGen((g) => g + 1), []);

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

    const W = zoneWidth(zone.n) * UNITS_PER_SCREEN;
    const maxHp = stats?.maxHp || 100;

    // ── THE WORLD ───────────────────────────────────────────────────────────────────────────────────
    const world = useMemo(() => {
        const rand = rngFrom(seed);
        const platforms = platformsFor(zone.n, rand);
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
            // Replaced by the real figure at the end of the first camera pass; this is only what the pet
            // follow reads on frame one, before anything has been measured.
            visibleUnits: UNITS_PER_SCREEN,
            foes: [],
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
            eaten: {},
            foodLeft: Number(belt?.count) || 0,
            boss: null,
            bossClaimed: false,
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

    // ── SPAWNING ────────────────────────────────────────────────────────────────────────────────────
    // Luke: "15 to 30 enemies, fully replenishing every 45 seconds."
    const spawn = useCallback((w, now) => {
        const want = GROVE_POP.min + Math.floor(w.rand() * (GROVE_POP.max - GROVE_POP.min + 1));
        while (w.foes.length < want) {
            const i = w.killIndex + w.foes.length;
            const isRare = rollRareSpawn(GROVE_RARE.spawnChance, seed, i, bonuses);
            const pickId = zone.enemies[Math.floor(w.rand() * zone.enemies.length)];
            const base = isRare ? GROVE_RARE : scaledFoe(pickId, zone.n);
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
        if (bd && zone.bossReady && !w.boss && !w.bossClaimed) {
            const bsz = groveSize(bd.id, { boss: true });
            const spot = { x: W - 20, y: 0 };
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

        w.nextRespawn = now + GROVE_POP.respawnMs;
        rerender();
    }, [zone, seed, bonuses, W, rerender]);

    // ── THE LOOP ────────────────────────────────────────────────────────────────────────────────────
    useEffect(() => {
        const host = hostRef.current;
        const w = worldRef.current;
        if (!host || !w) return undefined;

        let raf = 0;
        let last = performance.now();
        let lastSettle = performance.now();
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
                if (named) setBossName(named);
            }
        }

        const place = (b, cam, camY, unit, extraDx = 0) => {
            if (!b.node) return;
            // ⚠️ POSITION ONLY. The facing flip and every squash go on the inner node — see the header.
            b.node.style.transform =
                `translate3d(${(b.x + extraDx - cam) * unit}px, ${-(b.y - camY) * unit}px, 0)`;
        };

        // The visible sprite: facing, breath, landing squash, swing pose, and the measured foot nudge.
        const pose = (b, nowMs, unit, { sx = 1, sy = 1, moving = false } = {}) => {
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
                const down = (b.foot || 0) * 100;
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

        // ── POPS AND PARTICLES ARE BUILT BY HAND, NOT BY REACT ──────────────────────────────────────
        // ⚠️ AND THAT IS THE EXCEPTION TO THE RULE AT THE TOP OF THIS FILE, ON PURPOSE. A damage number, a
        // spark and a dust mote are born and dead inside half a second, several per swing — rendering them
        // through state would re-render the entire zone a few times a second to draw things that never need
        // reconciling, because nothing ever updates one: it is created, it moves, it is removed.
        const addPop = (kind, text, x, y) => {
            const layer = fxRef.current;
            if (!layer) return;
            const p = makePop(kind, x, y, w.rand);
            p.born = performance.now();
            const el = document.createElement("span");
            el.className = `gv-num is-${kind}`;
            el.textContent = text;
            layer.appendChild(el);
            p.node = el;
            w.pops.push(p);
        };
        const burst = (x, y, { crit = false, dir = 0, kind = "spark" } = {}) => {
            const layer = fxRef.current;
            if (!layer) return;
            const dust = kind === "dust";
            const n = dust ? DUST.n : crit ? SPARK.nCrit : SPARK.n;
            for (let i = 0; i < n; i += 1) {
                const s = makeSpark(i, n, x, y, {
                    speed: dust ? DUST.speed : crit ? SPARK.speedCrit : SPARK.speed,
                    life: dust ? DUST.life : crit ? SPARK.lifeCrit : SPARK.life,
                    dir, rand: w.rand,
                });
                s.born = performance.now();
                s.g = dust ? DUST.gravity : SPARK.gravity;
                const el = document.createElement("i");
                el.className = `gv-spark is-${kind}${crit ? " is-crit" : ""}`;
                layer.appendChild(el);
                s.node = el;
                w.sparks.push(s);
            }
        };
        const shockwave = (x, y, kind) => {
            const layer = fxRef.current;
            if (!layer) return;
            const el = document.createElement("i");
            el.className = `gv-boom is-${kind}`;
            layer.appendChild(el);
            w.sparks.push({ x, y, vx: 0, vy: 0, g: 0, born: performance.now(), life: 380, node: el, ring: true });
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
            impulse(foe, (foe.face || 1) * -0.75, 0.75);
            foe.dying = now;
            foe.flash = 1;
            burst(foe.x, foe.y + foe.h * 0.45, { crit: true, dir: -(foe.face || 1), kind: "spark" });
            burst(foe.x, foe.y, { kind: "dust" });

            if (foe.big || foe.rare) { wd.bossBar = null; setBossName(null); }

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
            setKills((k) => k + 1);

            // ── THE STREAK ──────────────────────────────────────────────────────────────────────
            // ⚠️ PRESENTATION ONLY. It pays nothing — see COMBO_WINDOW_MS in grove-juice.js for why a kill
            // loop with no daily cap must never have a reward multiplier bolted to how fast you clear it.
            wd.combo = now < wd.comboUntil ? wd.combo + 1 : 1;
            wd.comboUntil = now + COMBO_WINDOW_MS;
            playKill(Math.min(COMBO_PITCH_STEPS, wd.combo));

            // The client rolls the SAME answer the server will, so the loot can spill immediately.
            const got = rollKill(foe.rare ? GROVE_RARE : GROVE_ENEMIES[foe.id], seed, i, bonuses);
            const rows = Object.entries(got.parts);
            const total = rows.length + (got.emblem ? 1 : 0);
            let n = 0;
            const spill = (uid, part, label, opts = {}) => {
                const v = spillVelocity(n, total, wd.rand);
                n += 1;
                wd.drops.push({
                    ...makeBody({ x: foe.x, y: foe.y + foe.h * 0.4, h: 2.4, halfW: 1.2 }),
                    uid, part, label, state: "spill", restAt: 0, born: now, node: null,
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
                spill(`d${i}-${part}`, part, `${count}x ${meta?.name || part.replace(/_/g, " ")}`,
                    { tier: meta?.tier || 1, rare: Boolean(meta?.rare) });
            }
            // Luke: "Emblems are rare." So when one does fall it is not a line of text among four others.
            if (got.emblem) spill(`e${i}`, got.emblem, "Emblem", { emblem: true, tier: 6, rare: true });
            rerender();
        };

        const step = (now) => {
            // ⚠️ REAL MILLISECONDS AND SIMULATION dt ARE DIFFERENT CLOCKS, AND MIXING THEM DEADLOCKS.
            // Hit-stop scales dt toward zero; anything measured in simulation frames would itself be frozen
            // by the hit-stop and never end. So: dt drives the world, realMs drives every timer.
            const realMs = Math.min(60, now - last);
            const dt = w.clock.dt(now, last);
            last = now;

            if (now >= w.nextRespawn) spawn(w, now);

            const plats = w.platforms;
            // Walkable bounds, inset by a body so nothing can stand with half of itself outside the zone.
            const bounds = [HERO_UNITS * 0.6, W - HERO_UNITS * 0.6];

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
                const cd = SWING_TOTAL_MS / (1 + (stats?.attackSpeed || 0) / 100);
                if (inReach && w.swingDone && now - (w.swingAt || -1e9) > cd) {
                    w.swingAt = now;
                    w.swingFoe = tgt;
                    w.swingDone = false;
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
            if (!w.swingDone && w.swingAt != null && now - w.swingAt >= SWING.windMs) {
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
                    const hit = swing({
                        power: stats?.power || 10,
                        critRate: stats?.critRate || 0,
                        critDamage: stats?.critDamage || 0,
                        lifeSteal: stats?.lifeSteal || 0,
                    }, 0, w.rand);
                    foe.hp -= hit.dealt;
                    foe.hit = true;
                    foe.lastCrit = hit.crit;
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
                    addPop(hit.crit ? "crit" : "hit", `${hit.dealt}${hit.crit ? "!" : ""}`, px, py);
                    playHit(Math.min(COMBO_PITCH_STEPS, w.combo), hit.crit);
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
                    if (foe.hp <= 0) killFoe(w, foe, now);
                }
            }

            // ── THE PET ─────────────────────────────────────────────────────────────────────────
            // ⚠️ IT TRAILS BY A SHARE OF THE FRAME, NOT BY A FLAT 9 UNITS — nine units is 9% of a
            // 100-unit frame and THIRTY-FIVE PERCENT of a 26-unit one, which parked the pet on the left
            // bezel and then off it entirely. See grove-view.js.
            const pf = petFollow(w.visibleUnits || UNITS_PER_SCREEN);
            const petWant = w.hero.x - w.hero.face * pf.trail;
            if (Math.abs(petWant - w.pet.x) > pf.slack || Math.abs(w.hero.y - w.pet.y) > 4) {
                const nav = navigate(plats, w.pet, petWant, w.hero.y);
                drive(w.pet, nav.dir);
                if (nav.hop) hop(w.pet, HOP);
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
                    // Spinning, fading, and still falling — the solver keeps it honest.
                    f.spin = (f.spin || 0) + dt * 14 * (f.face || 1);
                    continue;
                }
                if (f.hp <= 0) continue;
                // Passive early enemies never initiate — Luke: "the ones earlier in the game being fully
                // passive. And later in the game attacking when they are attacked." A boss is passive until
                // you reach it and then never stops.
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
                if (w.hp <= 0) { w.hp = 0; setDead(true); }
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
                    if (now - d.restAt > LOOT_REST_MS && dist < LOOT_DRAW_RANGE) { d.state = "draw"; d.dv = 0; }
                } else {
                    // ⚠️ EASING IN, NOT A CONSTANT GLIDE. A magnet that commits is the whole feeling; a
                    // piece of loot sliding over at a fixed speed reads as a UI element animating.
                    d.dv = Math.min(LOOT_DRAW_MAX, (d.dv || 0) + LOOT_DRAW_ACCEL * dt);
                    const hx = w.hero.x;
                    const hy = w.hero.y + HERO_UNITS * 0.45;
                    const dist = Math.hypot(hx - d.x, hy - d.y) || 1;
                    d.x += ((hx - d.x) / dist) * d.dv * dt;
                    d.y += ((hy - d.y) / dist) * d.dv * dt;
                    if (dist < LOOT_EAT_DIST) {
                        // Hidden rather than removed, for the same reason as a dying foe above.
                        if (d.node) d.node.style.display = "none";
                        w.drops.splice(i, 1);
                        addPop("loot", d.label, w.hero.x + w.hero.face * 1.5, w.hero.y + HERO_UNITS * 0.75);
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
            const sp = swingPose(w.swingAt == null ? null : now - w.swingAt, w.hero.face);
            place(w.hero, cam, camY, unit, sp.dx);
            pose(w.hero, now, unit, { sx: sp.sx, sy: sp.sy, moving: Math.abs(w.hero.vx) > 0.04 });
            if (w.hero.swipeNode) {
                // The arc only exists during the strike — 70ms. The shortest phase of the swing is the one
                // that is supposed to look fast.
                w.hero.swipeNode.style.opacity = sp.t === "strike" ? "1" : "0";
            }
            place(w.pet, cam, camY, unit);
            pose(w.pet, now, unit, { moving: Math.abs(w.pet.vx) > 0.04 });

            for (let i = w.foes.length - 1; i >= 0; i -= 1) {
                const f = w.foes[i];
                place(f, cam, camY, unit);
                if (f.dying) {
                    const k = Math.min(1, (now - f.dying) / DEATH_MS);
                    if (f.node) {
                        f.node.style.opacity = String(1 - k);
                        f.node.style.pointerEvents = "none";
                    }
                    if (f.art0) f.art0.style.transform =
                        `translateY(${(f.foot || 0) * 100}%) rotate(${f.spin || 0}deg) scale(${1 - k * 0.3}) scaleX(${f.face || 1})`;
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
                p.node.style.transform = `translate3d(${(p.x - cam) * unit}px, ${-(p.y - camY) * unit}px, 0)`;
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
            if (w.skyNode) {
                const period = tileW * 2;
                const offX = period > 0 ? (cam * unit * SKY_PX) % period : 0;
                w.skyNode.style.transform = `translate3d(${-offX}px, ${camY * unit * SKY_PY}px, 0)`;
            }

            // ── THE BARS ────────────────────────────────────────────────────────────────────────
            // Luke: "how it shows their health plummeting with their like intermediate red lerp bar."
            // ⚠️ WRITTEN STRAIGHT ONTO THE NODES. A chase bar moves every frame; through state it would be
            // sixty re-renders a second of the whole zone to animate a strip of colour.
            stepChase(w.hpBar, now, Math.max(0, w.hp) / maxHp);
            if (hpRef.current) hpRef.current.style.width = `${w.hpBar.shown * 100}%`;
            if (hpGhostRef.current) hpGhostRef.current.style.width = `${w.hpBar.ghost * 100}%`;
            if (w.bossBar && bossFillRef.current) {
                stepChase(w.bossChase, now, Math.max(0, w.bossBar.hp) / w.bossBar.maxHp);
                bossFillRef.current.style.width = `${w.bossChase.shown * 100}%`;
                if (bossGhostRef.current) bossGhostRef.current.style.width = `${w.bossChase.ghost * 100}%`;
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
            else if (!raf) { last = performance.now(); raf = requestAnimationFrame(step); }
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
    }, [mounted, world, spawn, seed, bonuses, stats, onSettle, W, zone.id, zone.boss, labScene, maxHp, belt?.id, belt?.heals, onBoss, rerender]);

    // ── INPUT ───────────────────────────────────────────────────────────────────────────────────────
    const onTapWorld = useCallback((e) => {
        const w = worldRef.current;
        const host = hostRef.current;
        if (!w || !host || dead) return;
        const rect = host.getBoundingClientRect();
        // ── ⚠️ THE SAME SCALE THE LOOP IS DRAWING AT, WHICH THIS WAS NEVER USING ────────────
        // This read rect.width / UNITS_PER_SCREEN — a SECOND, independent idea of how big a world unit is,
        // which never agreed with the one on screen: a tap at the right-hand edge asked the hero to walk
        // about half as far as the spot that was tapped, and he stopped short of it with no indication why.
        // A scale must be PUBLISHED, never recomputed.
        const unit = w.unitPx || rect.width / UNITS_PER_SCREEN;
        const ground = w.groundPx || rect.height * 0.13;
        const x = camRef.current + (e.clientX - rect.left) / unit;
        // ── ⚠️ AND THE TAP HAS A HEIGHT NOW ────────────────────────────────────────────────
        // It only ever read clientX, so every tap meant "walk along the floor" and there was no way to ask
        // to go UP. The zones have had three tiers of ledges since the first version and no input that
        // could reach them. Snapped to the surface under the point, so tapping the air over a ledge means
        // that ledge rather than a spot in mid-air the hero can never stand on.
        const yRaw = camYRef.current + (rect.height - (e.clientY - rect.top) - ground) / unit;
        const surf = w.platforms.reduce((best, p) => {
            if (x < p.x || x > p.x + p.w) return best;
            if (p.y > yRaw + 6) return best;
            return !best || p.y > best.y ? p : best;
        }, null);
        // Tapping the ground clears the target — "until you tap away".
        w.target = null;
        w.moveTo = { x: Math.max(2, Math.min(W - 2, x)), y: surf ? surf.y : 0 };
    }, [dead, W]);

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
            setBossName(foe.name);
        }
    }, [dead]);

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
    }, []);

    // A body: shell (position) > shadow + art (facing, squash) > sprite + flash.
    const bodyArt = (art, { swipe = false } = {}) => (
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
            </span>
        </>
    );

    const scene = (
        <div className="gv-scene is-full" ref={hostRef} onPointerDown={onTapWorld}>
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
                <div className="gv-sky" ref={(n) => { if (worldRef.current) worldRef.current.skyNode = n; }}>
                    {Array.from({ length: SKY_TILE_COUNT }, (_, i) => i).map((i) => (
                        <div key={i} className="gv-sky-t" style={{ backgroundImage: `url(${zone.bg})` }} />
                    ))}
                </div>

                {/* ── THE LEDGES ────────────────────────────────────────────────────────────────
                    The ground plank (y === 0) is skipped: the plate already paints a floor, and a bar drawn
                    over the whole width of it would hide it. */}
                {world.platforms.filter((pf) => pf.y > 0).map((pf) => (
                    <span key={`pf${pf.i}`} className="gv-ledge" ref={(n) => { pf.node = n; }} aria-hidden="true" />
                ))}

                {/* ── THE TELEGRAPHS ───────────────────────────────────────────────────────────
                    Luke asked for attacks that "telecast where they will damage". The fill sweeps over the
                    attack's own wind-up, so what is on screen IS the window you have — the duration is set
                    inline from the attack rather than guessed at in the stylesheet. */}
                {world.tels.map((t) => (
                    <span key={t.uid} className={`gv-tel is-${t.kind}`} ref={(n) => { t.node = n; }}
                        style={{ animationDuration: `${t.ms}ms` }} aria-hidden="true" />
                ))}

                {/* Loot on the floor: a token you can see and a name you can read, per Luke's note. */}
                {world.drops.map((d) => (
                    <span key={d.uid} className={`gv-drop t${d.tier || 1}${d.emblem ? " is-emblem" : ""}${d.rare ? " is-rare" : ""}`}
                        ref={(n) => { const dd = d; dd.node = n; dd.labelNode = n?.querySelector("b") || null; }}
                        aria-hidden="true">
                        <i />
                        <b>{d.label}</b>
                    </span>
                ))}

                {world.foes.map((f) => (
                    <button key={f.uid} type="button"
                        className={`gv-foe${f.rare ? " is-rare" : ""}${f.isBoss ? " is-boss" : ""}`}
                        style={{ "--gv-h": f.h }}
                        ref={wire(f)}
                        onPointerDown={onTapFoe(f.uid)} aria-label={f.name}>
                        {bodyArt(f.art)}
                    </button>
                ))}

                {/* ⚠️ THE PET IS RENDERED BEFORE THE HERO, SO IT PAINTS BEHIND HIM. These are absolutely
                    positioned siblings with no z-index, so document order is the entire stacking rule — and
                    with the pet last it was drawing OVER the hero's sword arm every time it caught up,
                    which made the two of them read as one lumpy object. The player's own character is the
                    one thing on screen that must never be occluded by anything friendly. */}
                <div className="gv-pet" style={{ "--gv-h": PET_UNITS }} ref={wire(world.pet)}>
                    {bodyArt(petArt)}
                </div>
                <div className="gv-hero" style={{ "--gv-h": HERO_UNITS }} ref={wire(world.hero)}>
                    {bodyArt(heroArt, { swipe: true })}
                </div>

                {/* Damage numbers, sparks, dust and shockwaves are created by hand into this layer. */}
                <div className="gv-fx" ref={fxRef} aria-hidden="true" />
            </div>

            {/* The screen's own reaction. Outside the world layer so it does not shake with it. */}
            <div className="gv-vign" ref={vignRef} aria-hidden="true" />

            {bossName ? (
                <div className="gv-boss">
                    <b>{bossName}</b>
                    <span>
                        <u ref={bossGhostRef} />
                        <i ref={bossFillRef} />
                    </span>
                </div>
            ) : null}

            <div className="gv-hud">
                <span className="gv-hp">
                    {/* The ghost sits behind the fill and catches up, so the chunk just taken off is a
                        visible SHAPE rather than something inferred from two numbers. */}
                    <u ref={hpGhostRef} />
                    <i ref={hpRef} />
                </span>
                <b>{kills} killed</b>
                {belt?.id ? <b className="gv-belt">{belt.name} x{Math.max(0, beltLeft)}</b> : null}
                {canNative ? (
                    <button type="button" className="gv-leave" onClick={toggleNative}
                        aria-label={isNative ? "Leave full screen" : "Full screen"}>
                        {isNative ? "⇲" : "⇱"}
                    </button>
                ) : null}
                <button type="button" className="gv-leave" onClick={onLeave}>Leave</button>
            </div>

            <b className="gv-combo" ref={comboRef} aria-hidden="true" />

            {dead ? (
                <div className="gv-dead">
                    <div>
                        <b>You were overcome</b>
                        <span>Patched up back in town. The Grove keeps what you carried out.</span>
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
