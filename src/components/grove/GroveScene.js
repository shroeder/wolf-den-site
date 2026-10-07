"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { GROVE_ENEMIES, GROVE_RARE, GROVE_POP, scaledFoe } from "@/lib/marketplace/grove-catalog.js";
import { rngFrom, rollKill, rollRareSpawn } from "@/lib/marketplace/grove-roll.js";
import {
    UNITS_PER_SCREEN, zoneWidth, platformsFor, floorUnder, stepBody, stepWander,
    swing, makeTelegraph, telegraphHits, HOP, GRAVITY,
} from "@/lib/marketplace/grove-world.js";

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
const SETTLE_EVERY_MS = 45_000;
const PICKUP_RANGE = 7;           // world units — "The player must walk near the loot for it to get picked up"
const ATTACK_RANGE = 9;
const SWING_MS = 620;

export default function GroveScene({ zone, seed, bonuses, stats, pet, onSettle, onLeave }) {
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

    const W = zoneWidth(zone.n) * UNITS_PER_SCREEN;

    // ── THE WORLD ───────────────────────────────────────────────────────────────────────────────────
    const world = useMemo(() => {
        const rand = rngFrom(seed);
        const platforms = platformsFor(zone.n, rand);
        return {
            platforms,
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
                const want = tgt.x - Math.sign(tgt.x - w.hero.x) * (ATTACK_RANGE - 2);
                stepBody(w.hero, w.platforms, dt, Math.abs(tgt.x - w.hero.x) > ATTACK_RANGE ? want : null);
                // Auto-attack: "makes them auto attack until you tap away or the enemy perishes."
                if (Math.abs(tgt.x - w.hero.x) <= ATTACK_RANGE && now - w.lastSwing > SWING_MS / (1 + (stats?.attackSpeed || 0) / 100)) {
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
                    if (tgt.rare) setBossBar({ name: tgt.name, hp: Math.max(0, tgt.hp), maxHp: tgt.maxHp });
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
                const angry = !f.passive && (f === tgt || f.hit);
                if (angry && now >= f.nextAttack && Math.abs(f.x - w.hero.x) < 26) {
                    w.tels.push(makeTelegraph(f, w.hero.x, now));
                    f.nextAttack = now + 1800 + w.rand() * 1600;
                }
                if (angry) stepBody(f, w.platforms, dt, w.hero.x - Math.sign(w.hero.x - f.x) * 7);
                else stepWander(f, w.platforms, dt, w.rand);
            }

            // ── TELEGRAPHS RESOLVE ──────────────────────────────────────────────────────────────
            for (let i = w.tels.length - 1; i >= 0; i -= 1) {
                const tel = w.tels[i];
                if (now < tel.fires) continue;
                w.tels.splice(i, 1);
                if (!telegraphHits(tel, w.hero.x)) continue;
                const foe = w.foes.find((f) => f.uid === tel.foeId) || null;
                const raw = foe ? foe.dmg[0] + Math.round(w.rand() * (foe.dmg[1] - foe.dmg[0])) : 5;
                const dealt = Math.max(1, Math.round(raw * (60 / (60 + (stats?.armour || 0)))));
                setHp((h) => {
                    const next = h - dealt;
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
            const unit = vw / UNITS_PER_SCREEN;
            const lookahead = w.hero.face * 14;
            const wantCam = Math.max(0, Math.min(W - UNITS_PER_SCREEN, w.hero.x + lookahead - UNITS_PER_SCREEN / 2));
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
            for (const d of w.drops) place(d.node, d.x, d.y, 1);
            if (w.layerNode) w.layerNode.style.transform = `translate3d(${-cam * unit * 0.35}px,0,0)`;

            // ── AUTOSAVE ────────────────────────────────────────────────────────────────────────
            if (now - lastSettle > SETTLE_EVERY_MS && w.killLog.length) {
                lastSettle = now;
                const batch = w.killLog.splice(0, w.killLog.length);
                onSettle?.(batch);
            }

            raf = requestAnimationFrame(step);
        };

        const killFoe = (wd, foe, now) => {
            const i = wd.killIndex;
            wd.killIndex += 1;
            wd.killLog.push({ id: foe.id, i });
            setKills((k) => k + 1);
            if (foe.rare) setBossBar(null);

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
            const body = JSON.stringify({ action: "settle", zone: zone.id, kills: w2.killLog.splice(0) });
            navigator.sendBeacon("/api/marketplace/grove", new Blob([body], { type: "application/json" }));
        };
        window.addEventListener("pagehide", flush);

        return () => {
            cancelAnimationFrame(raf);
            document.removeEventListener("visibilitychange", onVis);
            window.removeEventListener("pagehide", flush);
            // ⚠️ SETTLE ON THE WAY OUT. Walking away must not throw the session's kills away — the same
            // reason the casino releases a held balance when you stand up.
            if (worldRef.current?.killLog?.length) onSettle?.(worldRef.current.killLog.splice(0));
        };
    }, [world, spawn, seed, bonuses, stats, float, onSettle, W, zone.id]);

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
        if (foe.rare) setBossBar({ name: foe.name, hp: foe.hp, maxHp: foe.maxHp });
    }, [dead]);

    return (
        <div className="gv-scene" ref={hostRef} onPointerDown={onTapWorld}>
            <div className="gv-plate" style={{ backgroundImage: `url(${zone.bg})` }} />
            <div className="gv-layer" ref={(n) => { if (worldRef.current) worldRef.current.layerNode = n; }} />

            {/* ⚠️ RENDERED ONCE, THEN NEVER RE-RENDERED. The loop writes transforms onto these nodes
                directly; React is not told when anything moves. */}
            {/* `gen` is in the dependency of this render only through being state — the array itself is
                the live one the loop mutates. Keys are stable per body so React keeps the node it already
                placed rather than rebuilding it every spawn. */}
            {world.foes.map((f) => (
                <button key={f.uid} type="button" className={`gv-foe${f.rare ? " is-rare" : ""}`}
                    ref={(n) => { f.node = n; }}
                    onPointerDown={onTapFoe(f.uid)} aria-label={f.name}>
                    {f.art ? <img src={f.art} alt="" draggable={false} /> : <i />}
                </button>
            ))}
            <div className="gv-hero" ref={(n) => { world.hero.node = n; }} />
            <div className="gv-pet" ref={(n) => { world.pet.node = n; }} />

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
                <button type="button" className="gv-leave" onClick={onLeave}>Leave</button>
            </div>
        </div>
    );
}
