"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { GROVE_ENEMIES, GROVE_RARE, GROVE_POP, scaledFoe, groveBoss } from "@/lib/marketplace/grove-catalog.js";
import { rngFrom, rollKill, rollRareSpawn } from "@/lib/marketplace/grove-roll.js";
import {
    UNITS_PER_SCREEN, zoneWidth, platformsFor, floorUnder, stepBody, stepWander,
    swing, makeTelegraph, telegraphHits, mitigate, HOP, GRAVITY,
} from "@/lib/marketplace/grove-world.js";
import { HEAL_AT } from "@/lib/marketplace/grove-catalog.js";

// ── THE ZONE, ON SCREEN ──────────────────────────────────────────────────────────────────────────────────────
// The whole scene runs here. Nothing about movement, wandering, swinging, dying or looting touches the server
// — see grove-roll.js for why. The server issued a seed; this plays it, and sends back only what it killed.
//
// ⚠️ THE SIMULATION WRITES TRANSFORMS, NEVER REACT STATE. Thirty enemies at 60fps is 1,800 state updates a
// second, which would re-render the whole zone thirty times a frame. Positions live in refs and are pushed
// onto DOM nodes; React renders each body ONCE and never touches it again. Same rule as the gachapon's
// physics, for the same reason.
//
// React state here is only ever things a human reads: your health, the kill count, a floating number.

// ── ⚠️ 45s, AND A BEACON ON THE WAY OUT ─────────────────────────────────────────────────────────────────────
// This was 90s, which meant up to a minute and a half of killing was thrown away if the tab died — and a
// phone browser kills a backgrounded tab without ceremony. 45s is one respawn window, so a settle lines up
// with the rhythm of the zone, and it is still only about thirteen requests in a ten-minute session.
//
// The React cleanup covers walking away. It does NOT cover the tab being closed or the phone swallowing the
// page, because a fetch started during teardown is cancelled with the document. sendBeacon is the one thing
// the browser promises to deliver after the page is gone.
// ── ⚠️ THE PLATE'S OWN SHAPE, WHICH THE GROUND LINE DEPENDS ON ──────────────────────────────────────
// Every backdrop is generated at 1536x1024, and the painted ground sits about an eighth of the way up THAT
// image. The scene used to be locked to 16/10, so "an eighth of the frame" and "an eighth of the plate" were
// near enough the same thing and a flat 13% worked.
//
// Full screen breaks that. background-size: cover scales the plate to the LARGER of the two ratios, so on any
// viewport wider than 3:2 the plate renders taller than the scene and is cropped at the top — the painted
// grass ends up above where the bodies are standing. The ground line has to be computed from what the plate
// actually renders as, not assumed. See grove-css.js, which carried the old 13% and the warning about it.
const PLATE_W = 1536;
const PLATE_H = 1024;
const GROUND_OF_PLATE = 0.13;

// How much sky a zone needs above the ground: its highest ledge, plus room to stand on it and hop.
const HEADROOM_UNITS = 16;

// ⚠️ AND HOW MUCH OF A TALL SCREEN THE ACTION SHOULD FILL. Scaling purely by width is right on a
// landscape screen and wrong on a portrait one: at 390px wide the unit is under 4px, so the whole playable
// band sits in the bottom fifth of the phone under an enormous empty canopy, with everything in it tiny.
// On a tall screen we zoom in instead — fewer units across, bigger everything — until the band occupies
// a reasonable share of the height. On a landscape or desktop screen the width already wins and this does
// nothing at all.
const PLAY_BAND = 0.45;

const SETTLE_EVERY_MS = 45_000;
const PICKUP_RANGE = 7;           // world units — "The player must walk near the loot for it to get picked up"
const ATTACK_RANGE = 9;
// ⚠️ A BOSS IS TWICE AS WIDE AS THE THING THE REACH WAS WRITTEN FOR. The wandering foes are 8% of the
// screen and a 9-unit reach stops the hero just clear of them; a boss is 17%, so the same number walked the
// hero into the middle of the sprite and the fight read as the two of them standing in the same place. Reach
// has to account for how much of the target is between its centre and its edge.
const BOSS_STANDOFF = 9;
const reachTo = (foe) => ATTACK_RANGE + (foe?.isBoss ? BOSS_STANDOFF : 0);
const SWING_MS = 620;

export default function GroveScene({ zone, seed, bonuses, stats, heroArt, petArt, belt, onSettle, onBoss, onLeave, onDeath }) {
    const hostRef = useRef(null);
    const worldRef = useRef(null);
    const camRef = useRef(0);

    // What a human reads. Everything else is in refs.
    const [hp, setHp] = useState(stats?.maxHp || 100);
    const [kills, setKills] = useState(0);
    const [floats, setFloats] = useState([]);
    const [dead, setDead] = useState(false);
    const [bossBar, setBossBar] = useState(null);
    // ── ⚠️ THE LIST IS STATE; THE POSITIONS ARE NOT ─────────────────────────────────────────────────
    // The first version pushed foes into world.foes imperatively and React was never told, so the zone
    // rendered with zero enemies in it while the simulation happily ran thirty of them. The split that
    // works is by FREQUENCY: the population changes on a spawn or a death — a few times a minute — so it
    // is state; a position changes sixty times a second per body, so it stays a ref and is written
    // straight onto the node. Putting positions in state would be 1,800 renders a second.
    const [gen, setGen] = useState(0);

    // ── ⚠️ DYING DID NOTHING AT ALL ──────────────────────────────────────────────────────────
    // setDead(true) only made the tap handlers return early, so a dead player sat on a frozen zone at 0 HP
    // with the enemies still wandering around them and no indication anything had happened. The only way out
    // was to notice the Leave button.
    //
    // Luke: "when you die it should send you back to town." A beat to read the words, then out — and the
    // unmount settles the session's kills on the way, so dying costs you the walk back and not the loot.
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

    useEffect(() => {
        if (!dead) return undefined;
        const t = setTimeout(() => onDeath?.(), 2200);
        return () => clearTimeout(t);
    }, [dead, onDeath]);

    const W = zoneWidth(zone.n) * UNITS_PER_SCREEN;

    // ── THE WORLD ───────────────────────────────────────────────────────────────────────────────────
    const world = useMemo(() => {
        const rand = rngFrom(seed);
        const platforms = platformsFor(zone.n, rand);
        return {
            platforms,
            // The zone's highest ledge, so the scale below knows how much sky this particular zone needs.
            // Zone 1 has one tier and zone 12 has three; making them all reserve room for three would shrink
            // the shallow zones for nothing.
            topY: platforms.reduce((m, p) => Math.max(m, p.y), 0),
            groundPx: 0,
            unitPx: 0,
            rand,
            hero: { x: 12, y: 0, vx: 0, vy: 0, face: 1, grounded: true, speed: 1 + (stats?.moveSpeed || 0) / 100 },
            pet: { x: 6, y: 0, vx: 0, vy: 0, face: 1, grounded: true, speed: 0.95 },
            foes: [],
            drops: [],
            tels: [],
            killLog: [],
            killIndex: 0,
            target: null,
            moveTo: null,
            lastSwing: 0,
            nextRespawn: 0,
            eaten: {},
            foodLeft: Number(belt?.count) || 0,
            boss: null,
            bossClaimed: false,
        };
    }, [zone.n, seed, stats?.moveSpeed]);

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
            const x = 20 + w.rand() * (W - 40);
            const plat = floorUnder(w.platforms, x, 999);
            w.foes.push({
                uid: `f${i}-${Math.floor(w.rand() * 1e6)}`,
                id: isRare ? GROVE_RARE.id : pickId,
                rare: isRare,
                art: base.art,
                name: base.name,
                hp: base.hp, maxHp: base.hp,
                dmg: base.dmg, telegraph: base.telegraph, passive: base.passive,
                x, y: plat.y, vx: 0, vy: 0, face: -1, grounded: true, speed: 0.55,
                t: w.rand() * 90, goal: null, nextAttack: now + 1200 + w.rand() * 2000,
                node: null,
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
            const bx = W - 16;
            const bplat = floorUnder(w.platforms, bx, 999);
            w.boss = {
                uid: `boss-${bd.id}`, id: bd.id, name: bd.name, art: bd.art,
                isBoss: true, big: true,
                hp: bd.hp, maxHp: bd.hp, dmg: bd.dmg, attacks: bd.attacks, passive: true,
                x: bx, y: bplat.y, vx: 0, vy: 0, face: -1, grounded: true, speed: 0.42,
                t: 0, goal: null, nextAttack: now + 1500, atk: 0, node: null,
            };
            w.foes.push(w.boss);
        }

        w.nextRespawn = now + GROVE_POP.respawnMs;
        setGen((g) => g + 1);
    }, [zone, seed, bonuses, W]);

    const float = useCallback((text, kind, x, y) => {
        const id = Math.random().toString(36).slice(2);
        setFloats((f) => [...f.slice(-14), { id, text, kind, x, y }]);
        setTimeout(() => setFloats((f) => f.filter((z) => z.id !== id)), 900);
    }, []);

    // ── THE LOOP ────────────────────────────────────────────────────────────────────────────────────
    useEffect(() => {
        const host = hostRef.current;
        const w = worldRef.current;
        if (!host || !w) return undefined;

        let raf = 0;
        let last = performance.now();
        let lastSettle = performance.now();
        spawn(w, last);

        const step = (now) => {
            // Clamped: a backgrounded tab resumes with a multi-second frame, and a multi-second step would
            // fire every body through the floor.
            const dt = Math.min(34, now - last) / 16.67;
            last = now;

            if (now >= w.nextRespawn) spawn(w, now);

            // ── HERO ────────────────────────────────────────────────────────────────────────────
            const tgt = w.target && w.target.hp > 0 ? w.target : null;
            if (tgt) {
                const range = reachTo(tgt);
                const want = tgt.x - Math.sign(tgt.x - w.hero.x) * (range - 2);
                stepBody(w.hero, w.platforms, dt, Math.abs(tgt.x - w.hero.x) > range ? want : null);
                // Auto-attack: "makes them auto attack until you tap away or the enemy perishes."
                if (Math.abs(tgt.x - w.hero.x) <= range && now - w.lastSwing > SWING_MS / (1 + (stats?.attackSpeed || 0) / 100)) {
                    w.lastSwing = now;
                    const hit = swing({
                        power: stats?.power || 10,
                        critRate: stats?.critRate || 0,
                        critDamage: stats?.critDamage || 0,
                        lifeSteal: stats?.lifeSteal || 0,
                    }, 0, w.rand);
                    tgt.hp -= hit.dealt;
                    float(`${hit.dealt}${hit.crit ? "!" : ""}`, hit.crit ? "crit" : "hit", tgt.x, tgt.y + 14);
                    if (hit.healed > 0) {
                        setHp((h) => Math.min(stats?.maxHp || 100, h + hit.healed));
                        float(`+${hit.healed}`, "heal", w.hero.x, w.hero.y + 16);
                    }
                    if (tgt.big || tgt.rare) setBossBar({ name: tgt.name, hp: Math.max(0, tgt.hp), maxHp: tgt.maxHp });
                    if (tgt.hp <= 0) killFoe(w, tgt, now);
                }
            } else {
                stepBody(w.hero, w.platforms, dt, w.moveTo);
                if (w.moveTo != null && Math.abs(w.moveTo - w.hero.x) < 1.5) w.moveTo = null;
            }

            // The pet trails the hero and fights what the hero fights.
            const petWant = w.hero.x - w.hero.face * 9;
            stepBody(w.pet, w.platforms, dt, Math.abs(petWant - w.pet.x) > 3 ? petWant : null);

            // ── FOES ────────────────────────────────────────────────────────────────────────────
            for (const f of w.foes) {
                if (f.hp <= 0) continue;
                // Passive early enemies never initiate — Luke: "the ones earlier in the game being fully
                // passive. And later in the game attacking when they are attacked."
                // A boss is passive until you reach it and then never stops — it does not need to be struck
                // first and it does not lose interest. Everything else follows Luke's rule: early enemies
                // ignore you entirely, later ones hit back once struck.
                const angry = f.isBoss ? (f === tgt || f.hit) : (!f.passive && (f === tgt || f.hit));
                if (angry && now >= f.nextAttack && Math.abs(f.x - w.hero.x) < (f.isBoss ? 46 : 26)) {
                    if (f.isBoss && f.attacks?.length) {
                        // ⚠️ CYCLED IN ORDER, NOT PICKED AT RANDOM. A boss you can learn is the whole point of
                        // telegraphing; a random pick from three shapes is just noise with a wind-up on it.
                        const atk = f.attacks[f.atk % f.attacks.length];
                        f.atk += 1;
                        w.tels.push(...makeTelegraph(f, w.hero.x, now, atk));
                        f.nextAttack = now + atk.telegraph + 900 + w.rand() * 700;
                    } else {
                        w.tels.push(...makeTelegraph(f, w.hero.x, now));
                        f.nextAttack = now + 1800 + w.rand() * 1600;
                    }
                    setGen((g) => g + 1);
                }
                if (angry) stepBody(f, w.platforms, dt, w.hero.x - Math.sign(w.hero.x - f.x) * 7);
                else if (!f.isBoss) stepWander(f, w.platforms, dt, w.rand);
            }

            // ── TELEGRAPHS RESOLVE ──────────────────────────────────────────────────────────────
            for (let i = w.tels.length - 1; i >= 0; i -= 1) {
                const tel = w.tels[i];
                if (now < tel.fires) continue;
                w.tels.splice(i, 1);
                setGen((g) => g + 1);
                if (!telegraphHits(tel, w.hero.x)) continue;
                // ⚠️ MATCHED ON uid. This read tel.foeId against f.uid, which never matched, so every attack
                // in the Grove fell through to a hardcoded 5 damage and the whole difficulty curve was dead.
                const foe = w.foes.find((f) => f.uid === tel.foeUid) || null;
                const base = foe ? foe.dmg[0] + Math.round(w.rand() * (foe.dmg[1] - foe.dmg[0])) : 5;
                // A sweep is wide and weak, a slam is narrow and hard. The multiplier is what makes them
                // read differently rather than just look different.
                const raw = Math.max(1, Math.round(base * (Number(tel.mult) || 1)));
                // ⚠️ mitigate(), NOT A SECOND COPY OF IT. This was the 60/(60+armour) formula written out by
                // hand, next to a module that exports exactly that rule as ARMOUR_K. Two copies is two games.
                const dealt = mitigate(raw, stats?.armour || 0);
                setHp((h) => {
                    let next = h - dealt;
                    // ── ⚠️ EATING IS DECIDED HERE, INSIDE THE SETTER ────────────────────────────
                    // Luke: "equip food or potions that auto heal you if you get below 60 percent hp."
                    //
                    // It has to read the hp that is actually about to be committed, not the `hp` captured
                    // when this frame started — two hits landing in one frame against a stale value would
                    // either eat twice or not at all. React hands the true current value here and nowhere
                    // else.
                    const max = stats?.maxHp || 100;
                    if (next > 0 && next < max * HEAL_AT && w.foodLeft > 0 && belt?.id) {
                        w.foodLeft -= 1;
                        w.eaten[belt.id] = (w.eaten[belt.id] || 0) + 1;
                        const healed = Math.round(max * (Number(belt.heals) || 0));
                        next = Math.min(max, next + healed);
                        float(`+${healed}`, "heal", w.hero.x, w.hero.y + 20);
                    }
                    if (next <= 0) setDead(true);
                    return Math.max(0, next);
                });
                float(`-${dealt}`, "took", w.hero.x, w.hero.y + 18);
            }

            // ── LOOT PICKUP ─────────────────────────────────────────────────────────────────────
            // "The player must walk near the loot for it to get picked up."
            for (let i = w.drops.length - 1; i >= 0; i -= 1) {
                const d = w.drops[i];
                d.vy -= GRAVITY * dt;
                d.y += d.vy * dt;
                const fl = floorUnder(w.platforms, d.x, d.y);
                if (d.y <= fl.y) { d.y = fl.y; d.vy = 0; }
                if (Math.abs(d.x - w.hero.x) < PICKUP_RANGE && Math.abs(d.y - w.hero.y) < 14) {
                    w.drops.splice(i, 1);
                    if (d.node) d.node.remove();
                    float(d.label, "loot", d.x, d.y + 12);
                }
            }

            // ── THE CAMERA ──────────────────────────────────────────────────────────────────────
            // Luke: "The camera would trolley and lookahead slightly, common sense. Not jostle the person."
            // So it EASES toward a point ahead of the hero rather than tracking them exactly — a camera
            // locked to the player is what makes a scrolling game feel like it is shaking.
            const vw = host.clientWidth;
            const vh = host.clientHeight;

            // ── THE GROUND LINE, FROM WHAT THE PLATE ACTUALLY RENDERS AS ────────────────────────
            // ⚠️ NOT A FIXED 13%. cover scales by max(w-ratio, h-ratio), so on anything wider than the
            // plate's own 3:2 the image is taller than the scene and cropped at the top. Thirteen percent of
            // the SCENE is then a different line from thirteen percent of the PLATE, and the whole population
            // stands below the painted grass. Written as a CSS variable so one number moves every body, the
            // ledges and the telegraph bands together.
            const plateH = Math.max(vh, vw * (PLATE_H / PLATE_W));
            const groundPx = GROUND_OF_PLATE * plateH;
            if (groundPx !== w.groundPx) {
                w.groundPx = groundPx;
                host.style.setProperty("--gv-ground", `${groundPx}px`);
            }

            // ── THE SCALE ───────────────────────────────────────────────────────────────────────
            // ⚠️ A WIDE SHORT VIEWPORT CANNOT FIT THE LEDGES. unit was vw/100 whatever the height, and the
            // top ledge of a deep zone sits 78 units up — 0.78 of the WIDTH, which on a desktop full-screen
            // is well past the top of the frame. The ledge is reachable in the simulation and invisible on
            // screen, which is the worst of both. So the scale also has to fit the zone's own height.
            const sky = Math.max(40, vh - groundPx);
            const needed = w.topY + HEADROOM_UNITS;
            const byWidth = vw / UNITS_PER_SCREEN;
            // Zoom in on a tall screen so the action is not a strip along the bottom, then never exceed what
            // the sky can actually hold.
            const byHeight = needed > 0 ? (PLAY_BAND * vh) / needed : 0;
            const unit = needed > 0
                ? Math.min(Math.max(byWidth, byHeight), sky / needed)
                : byWidth;

            // ⚠️ THE SPRITES HAVE TO SCALE WITH IT. Every body is sized as a PERCENTAGE OF THE SCENE WIDTH
            // (a foe is 8%) while every distance is in world units — which only agree while unit is exactly
            // vw/100. The moment the scale zooms, bodies stay the same pixel size and simply spread further
            // apart, which is the opposite of what zooming is for. Published as a variable so the stylesheet
            // can express a body in UNITS: calc(8 * var(--gv-unit)) is the same 8% at the default scale and
            // stays 8 units wide at every other one.
            if (unit !== w.unitPx) {
                w.unitPx = unit;
                host.style.setProperty("--gv-unit", `${unit}px`);
            }

            // How much of the zone is actually on screen at this scale. ⚠️ THE CAMERA CLAMP USES THIS, NOT
            // UNITS_PER_SCREEN — when the scale shrinks to fit the ledges you see MORE than 100 units across,
            // and a clamp still built on 100 would stop the camera short and let the zone's right-hand edge
            // scroll into view.
            const visibleUnits = vw / unit;
            const lookahead = w.hero.face * 14;
            const wantCam = Math.max(0, Math.min(W - visibleUnits, w.hero.x + lookahead - visibleUnits / 2));
            camRef.current += (wantCam - camRef.current) * Math.min(1, 0.055 * dt);

            // ── PAINT ───────────────────────────────────────────────────────────────────────────
            const cam = camRef.current;
            const place = (node, x, y, face) => {
                if (!node) return;
                node.style.transform = `translate3d(${(x - cam) * unit}px, ${-y * unit}px, 0) scaleX(${face || 1})`;
            };
            place(w.hero.node, w.hero.x, w.hero.y, w.hero.face);
            place(w.pet.node, w.pet.x, w.pet.y, w.pet.face);
            for (const f of w.foes) if (f.hp > 0) place(f.node, f.x, f.y, f.face);
            // The ledges. Placed rather than scaled, same as the telegraph bands, so a wide one does not get
            // a stretched edge.
            for (const pf of w.platforms) {
                if (!pf.node) continue;
                pf.node.style.transform = `translate3d(${(pf.x - cam) * unit}px, ${-pf.y * unit}px, 0)`;
                pf.node.style.width = `${pf.w * unit}px`;
            }
            for (const d of w.drops) place(d.node, d.x, d.y, 1);
            // Telegraphs are bands on the ground, so they are placed by width rather than scaled — a
            // scaleX on a 2r-wide box would stretch its border with it.
            for (const t of w.tels) {
                if (!t.node) continue;
                t.node.style.transform = `translate3d(${(t.x - cam - t.r) * unit}px, 0, 0)`;
                t.node.style.width = `${t.r * 2 * unit}px`;
            }
            if (w.layerNode) w.layerNode.style.transform = `translate3d(${-cam * unit * 0.35}px,0,0)`;

            // ── AUTOSAVE ────────────────────────────────────────────────────────────────────────
            if (now - lastSettle > SETTLE_EVERY_MS && w.killLog.length) {
                lastSettle = now;
                const batch = w.killLog.splice(0, w.killLog.length);
                const ate = w.eaten; w.eaten = {};
                onSettle?.(batch, ate);
            }

            raf = requestAnimationFrame(step);
        };

        const killFoe = (wd, foe, now) => {
            if (foe.big || foe.rare) setBossBar(null);

            // ── ⚠️ A BOSS IS NOT ADDED TO THE KILL LOG ────────────────────────────────────────────────
            // It has its own request (action: "boss") because it has its own authority: the server checks the
            // zone was cleared and that the thirty-minute cooldown elapsed. Put it in the batch and those two
            // checks would be bypassed by a settle that claims it two hundred times.
            //
            // bossClaimed also stops the respawn pass from standing it back up the moment it falls.
            if (foe.isBoss) {
                wd.bossClaimed = true;
                wd.boss = null;
                if (foe.node) { foe.node.classList.add("is-dead"); const n = foe.node; setTimeout(() => n.remove(), 420); }
                const bi = wd.foes.indexOf(foe);
                if (bi >= 0) wd.foes.splice(bi, 1);
                if (wd.target === foe) wd.target = null;
                setGen((g) => g + 1);
                onBoss?.();
                return;
            }

            const i = wd.killIndex;
            wd.killIndex += 1;
            wd.killLog.push({ id: foe.id, i });
            setKills((k) => k + 1);

            // The client rolls the SAME answer the server will, so the loot can spill immediately.
            const got = rollKill(foe.rare ? GROVE_RARE : GROVE_ENEMIES[foe.id], seed, i, bonuses);
            for (const [part, n] of Object.entries(got.parts)) {
                wd.drops.push({
                    uid: `d${i}-${part}`, part, label: `${n}× ${part.replace(/_/g, " ")}`,
                    x: foe.x + (wd.rand() - 0.5) * 6, y: foe.y + 8, vy: 0.55, node: null,
                });
            }
            if (got.emblem) {
                wd.drops.push({ uid: `e${i}`, part: got.emblem, label: "emblem", emblem: true, x: foe.x, y: foe.y + 10, vy: 0.7, node: null });
            }
            // A simple shared death animation, then the body goes.
            if (foe.node) {
                foe.node.classList.add("is-dead");
                const n = foe.node;
                setTimeout(() => n.remove(), 420);
            }
            const idx = wd.foes.indexOf(foe);
            if (idx >= 0) wd.foes.splice(idx, 1);
            if (wd.target === foe) wd.target = null;
            setGen((g) => g + 1);
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
    }, [mounted, world, spawn, seed, bonuses, stats, float, onSettle, W, zone.id]);

    // ── INPUT ───────────────────────────────────────────────────────────────────────────────────────
    const onTapWorld = useCallback((e) => {
        const w = worldRef.current;
        const host = hostRef.current;
        if (!w || !host || dead) return;
        const rect = host.getBoundingClientRect();
        const unit = rect.width / UNITS_PER_SCREEN;
        const x = camRef.current + (e.clientX - rect.left) / unit;
        // Tapping the ground clears the target — "until you tap away".
        w.target = null;
        w.moveTo = Math.max(2, Math.min(W - 2, x));
    }, [dead, W]);

    const onTapFoe = useCallback((uid) => (e) => {
        e.stopPropagation();
        const w = worldRef.current;
        if (!w || dead) return;
        const foe = w.foes.find((f) => f.uid === uid);
        if (!foe) return;
        foe.hit = true;        // retaliating enemies wake on being struck
        w.target = foe;
        w.moveTo = null;
        if (foe.big || foe.rare) setBossBar({ name: foe.name, hp: foe.hp, maxHp: foe.maxHp });
    }, [dead]);

    const scene = (
        <div className="gv-scene is-full" ref={hostRef} onPointerDown={onTapWorld}>
            <div className="gv-plate" style={{ backgroundImage: `url(${zone.bg})` }} />
            <div className="gv-layer" ref={(n) => { if (worldRef.current) worldRef.current.layerNode = n; }} />

            {/* ⚠️ RENDERED ONCE, THEN NEVER RE-RENDERED. The loop writes transforms onto these nodes
                directly; React is not told when anything moves. */}
            {/* `gen` is in the dependency of this render only through being state — the array itself is
                the live one the loop mutates. Keys are stable per body so React keeps the node it already
                placed rather than rebuilding it every spawn. */}
            {/* ── ⚠️ THE LEDGES, WHICH ALSO NOTHING DREW ──────────────────────────────────────────
                platformsFor() has built a ladder of ledges per zone since the first version and no element
                was ever rendered for one, so a creature standing on a ledge was a creature hanging in mid-air
                against the trees. It reads as a bug rather than as a platform, which is the opposite of what
                Luke asked for: "the hero and pet can navigate left and right and hop platforms making the
                zone vertical."

                The ground plank (y === 0) is skipped: the plate already paints a floor, and a bar drawn over
                the whole width of it would hide it. */}
            {world.platforms.filter((pf) => pf.y > 0).map((pf, i) => (
                <span key={`pf${i}`} className="gv-ledge" ref={(n) => { pf.node = n; }} aria-hidden="true" />
            ))}

            {/* ── ⚠️ THE TELEGRAPHS, WHICH NOTHING DREW ────────────────────────────────────────────
                The wind-up was simulated from the first version and never rendered: the damage landed after
                a delay and the player saw no reason why. Luke asked for attacks that "telecast where they
                will damage", and an invisible telegraph is not a telegraph, it is just a slow hit.

                Keyed on the telegraph uid so each band animates its own fill from zero; the animation
                duration is the attack's own wind-up, so what you see IS the window you have. */}
            {world.tels.map((t) => (
                <span key={t.uid} className={`gv-tel is-${t.kind}`} ref={(n) => { t.node = n; }}
                    style={{ animationDuration: `${t.ms}ms` }} aria-hidden="true" />
            ))}

            {world.foes.map((f) => (
                <button key={f.uid} type="button"
                    className={`gv-foe${f.rare ? " is-rare" : ""}${f.isBoss ? " is-boss" : ""}`}
                    ref={(n) => { f.node = n; }}
                    onPointerDown={onTapFoe(f.uid)} aria-label={f.name}>
                    {f.art ? <img src={f.art} alt="" draggable={false} /> : <i />}
                </button>
            ))}
            {/* ⚠️ NO <img> AT ALL WHEN THERE IS NO URL, rather than an img that 404s. An SSR-rendered
                broken src fires onError before React has hydrated, so a fallback wired to onError never
                runs and the player gets the browser's broken-image glyph — which is exactly how every card
                in the game ended up wearing one. See img-onerror-fires-before-hydration. The gradient disc
                is a CSS background, so the fallback cannot fail. */}
            <div className="gv-hero" ref={(n) => { world.hero.node = n; }}>
                {heroArt ? <img src={heroArt} alt="" draggable={false} /> : null}
            </div>
            <div className="gv-pet" ref={(n) => { world.pet.node = n; }}>
                {petArt ? <img src={petArt} alt="" draggable={false} /> : null}
            </div>

            {floats.map((f) => <span key={f.id} className={`gv-float is-${f.kind}`}>{f.text}</span>)}

            {bossBar ? (
                <div className="gv-boss">
                    <b>{bossBar.name}</b>
                    <span><i style={{ width: `${Math.max(0, (bossBar.hp / bossBar.maxHp) * 100)}%` }} /></span>
                </div>
            ) : null}

            <div className="gv-hud">
                <span className="gv-hp"><i style={{ width: `${Math.max(0, (hp / (stats?.maxHp || 100)) * 100)}%` }} /></span>
                <b>{kills} killed</b>
                {belt?.id ? <b className="gv-belt">{belt.name} ×{Math.max(0, (Number(belt.count) || 0) - Object.values(world.eaten || {}).reduce((a, b) => a + b, 0))}</b> : null}
                {canNative ? (
                    <button type="button" className="gv-leave" onClick={toggleNative}
                        aria-label={isNative ? "Leave full screen" : "Full screen"}>
                        {isNative ? "\u21F2" : "\u21F1"}
                    </button>
                ) : null}
                <button type="button" className="gv-leave" onClick={onLeave}>Leave</button>
            </div>

            {/* ── ⚠️ DYING NOW SAYS SO ──────────────────────────────────────────────────────────
                It used to do nothing visible at all: the flag only made the tap handlers return early, so
                the zone carried on wandering around a motionless player at 0 HP. Luke: "when you die it
                should send you back to town." This is the two seconds of reading before that happens, and
                the unmount settles the session on the way out, so a death costs the walk back rather than
                the loot. */}
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
    return mounted ? createPortal(scene, document.body) : null;
}
