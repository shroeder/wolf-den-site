"use client";

// ── THE FOREST ───────────────────────────────────────────────────────────────────────────────────────────────
// Luke: "we want our character to be able to walk through the forest like in town, and you just have trees you
// can touch and start chopping ... you're going through this never ending forest, chopping trees, picking up
// mushrooms, and scavenging other resources."
//
// So it is Town's shape, not a minigame's: a strip of world, your own hero standing in it, a camera that
// follows, and things you walk up to. What was here before was six tree cards and a camera that slid between
// them, which is a picker wearing a forest's clothes.
//
// ⚠️ THE WOOD IS GENERATED, NOT FETCHED. Every tree and mushroom is a pure function of (seed, node index) —
// see forest-world.js — so the browser can build as much of it as the screen needs, forever, without asking.
// A world that asked the server what was ahead would be a request per footstep, which is the most expensive
// shape this codebase has (round trips ARE the bill; see CLAUDE.md). The server holds the same function, so a
// claim about node 1423 is checked by generating node 1423 rather than by trusting the browser.
//
// ⚠️ AND THE WALK IS A rAF LOOP, NOT A CSS TRANSITION. Town can transition, because Town knows where it is
// going before it sets off. Here the walk has to be INSPECTED every frame — a mushroom you pass is picked up
// because you passed it, and a tree is in reach when you are near it — and a transition cannot be asked where
// it currently is without reading layout back every frame, which is worse than owning the number.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GiWoodAxe, GiLogging, GiSwapBag } from "react-icons/gi";
import { playMusic, sfx, stopMusic, wake } from "@/lib/marketplace/cards-sound.js";
import {
    AXE_TRACKS, AXE_TRACK_IDS, LEAF_CHANCE, STREAK_CAP, STREAK_STEP,
    axeForm, swing, trackCost, trackReadout, treeById, MUSHROOMS,
} from "@/lib/marketplace/forest.js";
import { NODE_GAP, nodeAt } from "@/lib/marketplace/forest-world.js";

const TREE_ART = (id) => `/images/forest/trees/${id}.webp`;
const SHROOM_ART = (id) => `/images/forest/shrooms/${id}.webp`;
const AXE_ART = (id) => `/images/forest/axes/${id}.webp`;
const GROVE = "/images/forest/grove.webp";
const FLOOR = "/images/forest/floor.webp";
const STUMP = "/images/forest/stump.webp";

const RARITY = { common: "#b9b2a4", uncommon: "#7fc98a", rare: "#7fb0ff", epic: "#d98ae8", legendary: "#ffc861" };

// ── HOW THE WALK FEELS ───────────────────────────────────────────────────────────────────────────────────────
const WALK_PX = 300;      // world pixels a second
const CHOP_REACH = 110;   // how close you must be for a tree to be choppable
const PICK_REACH = 80;    // and for a mushroom to be picked up as you pass
const PAD = 2;            // nodes generated beyond each edge of the screen
const WORLD_H = 400;      // how tall the wood is drawn, in real pixels — see the note where it is applied

const errorText = (e) => ({
    too_fast: "That tree did not come down that fast.",
    nothing_there: "There is nothing standing there.",
    already_cut: "That one is still growing back.",
    not_enough_wood: "Not enough wood for that yet.",
    maxed: "That is as far as it sharpens.",
    no_forest: "The forest has not grown for you yet.",
}[e] || "That did not go through.");

export default function ForestClient() {
    const [st, setSt] = useState(null);
    const [viewW, setViewW] = useState(360);
    const [heroX, setHeroX] = useState(0);
    const [facing, setFacing] = useState(1);
    const [walking, setWalking] = useState(false);
    const [chop, setChop] = useState(null);   // { node, id, hp, max, swings, streak, leaves }
    const [fx, setFx] = useState([]);
    const [shake, setShake] = useState(0);
    const [fell, setFell] = useState(null);
    const [got, setGot] = useState([]);       // little "+1 Inkcap" flyups
    const [bag, setBag] = useState(false);
    const [shop, setShop] = useState(false);
    const [err, setErr] = useState("");
    const [busy, setBusy] = useState(false);

    const wrapRef = useRef(null);
    const targetRef = useRef(null);
    const heroRef = useRef(0);
    const rafRef = useRef(0);
    const lastTick = useRef(0);
    const armed = useRef(false);
    const lastSwing = useRef(0);
    const fxId = useRef(0);
    const pending = useRef(new Set());   // mushroom nodes picked but not yet flushed
    const flushTimer = useRef(null);
    const walkTimer = useRef(null);
    const timers = useRef([]);

    const later = useCallback((fn, ms) => { const t = setTimeout(fn, ms); timers.current.push(t); return t; }, []);
    useEffect(() => () => { timers.current.forEach(clearTimeout); cancelAnimationFrame(rafRef.current); stopMusic(); }, []);

    const load = useCallback(async () => {
        const r = await fetch("/api/marketplace/forest", { cache: "no-store" }).catch(() => null);
        const d = r && r.ok ? await r.json().catch(() => null) : null;
        if (d && !d.error) {
            setSt(d);
            const x = (Number(d.atNode) || 0) * NODE_GAP;
            heroRef.current = x;
            setHeroX(x);
        }
    }, []);
    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        const el = wrapRef.current;
        if (!el) return undefined;
        const ro = new ResizeObserver(() => setViewW(el.clientWidth || 360));
        ro.observe(el);
        setViewW(el.clientWidth || 360);
        return () => ro.disconnect();
    }, [st]);

    const arm = useCallback(() => {
        if (armed.current) return;
        armed.current = true;
        wake();
        playMusic("forest");
    }, []);

    // ── THE POUCH FLUSH ──────────────────────────────────────────────────────────────────────────────
    // Mushrooms are picked up by walking past them and sent in a BATCH. Twenty pickups sent one at a time is
    // twenty round trips for a handful of fungus; the server still checks every node in the list on its own.
    const flush = useCallback(async () => {
        const nodes = [...pending.current];
        if (!nodes.length) return;
        pending.current.clear();
        const r = await fetch("/api/marketplace/forest", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "gather", nodes, at: Math.round(heroRef.current / NODE_GAP) }),
        }).catch(() => null);
        const d = r ? await r.json().catch(() => null) : null;
        if (d?.ok) setSt(d.forest);
    }, []);
    useEffect(() => () => { flush(); }, [flush]);

    // ── WALKING ──────────────────────────────────────────────────────────────────────────────────────
    // One loop. It moves the hero toward the target, notices what it passes, and stops when it arrives —
    // which is three things that all need the SAME position, so they belong in one place rather than three
    // effects arguing about where the player is.
    const step = useCallback((now) => {
        const dt = Math.min(0.05, (now - (lastTick.current || now)) / 1000);
        lastTick.current = now;
        const target = targetRef.current;
        let x = heroRef.current;
        if (target != null) {
            const dir = Math.sign(target - x);
            const nx = x + dir * WALK_PX * dt;
            // Overshot? Then we are there.
            if ((dir > 0 && nx >= target) || (dir < 0 && nx <= target) || Math.abs(target - x) < 2) {
                x = target;
                targetRef.current = null;
                setWalking(false);
                // Tell the server where we stopped, once, after the walk settles — the way Town does.
                clearTimeout(walkTimer.current);
                walkTimer.current = setTimeout(() => {
                    fetch("/api/marketplace/forest", {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "walk", node: Math.round(x / NODE_GAP) }),
                    }).catch(() => {});
                }, 600);
            } else x = nx;
            heroRef.current = Math.max(0, x);
            setHeroX(heroRef.current);
        }
        // ── AND WHAT YOU WALKED PAST ─────────────────────────────────────────────────────────────
        // Checked every frame rather than on arrival, because the mushrooms you pass are the ones BETWEEN
        // here and where you tapped — picking up only what is under your feet when you stop would mean
        // walking the same stretch twice to clear it.
        const here = heroRef.current;
        const from = Math.max(0, Math.floor((here - PICK_REACH) / NODE_GAP));
        const to = Math.ceil((here + PICK_REACH) / NODE_GAP);
        for (let i = from; i <= to; i += 1) {
            const n = nodeAt(st?.seed || 1, i);
            if (n.kind !== "shroom") continue;
            if (pending.current.has(i) || st?.taken?.[String(i)]) continue;
            if (Math.abs(n.x - here) > PICK_REACH) continue;
            pending.current.add(i);
            sfx("forestWood");
            const id = fxId.current++;
            setGot((g) => [...g.slice(-4), { id, name: MUSHROOMS[n.id]?.name || n.id, rarity: MUSHROOMS[n.id]?.rarity, n: n.n || 1 }]);
            later(() => setGot((g) => g.filter((x2) => x2.id !== id)), 1800);
            clearTimeout(flushTimer.current);
            flushTimer.current = setTimeout(flush, 1200);
        }
        rafRef.current = requestAnimationFrame(step);
    }, [st, flush, later]);

    useEffect(() => {
        if (!st) return undefined;
        lastTick.current = 0;
        rafRef.current = requestAnimationFrame(step);
        return () => cancelAnimationFrame(rafRef.current);
    }, [st, step]);

    const walkTo = useCallback((worldX) => {
        arm();
        const x = Math.max(0, worldX);
        targetRef.current = x;
        setFacing(x < heroRef.current ? -1 : 1);
        setWalking(true);
        setChop(null);
    }, [arm]);

    // ── CHOPPING ─────────────────────────────────────────────────────────────────────────────────────
    // Tap a tree. If you are not near it you walk to it; if you are, that is a swing. There is no "enter the
    // chop screen" any more — the thing you are standing next to is the thing you are hitting.
    const hitTree = useCallback((n) => {
        arm();
        const near = Math.abs(n.x - heroRef.current) <= CHOP_REACH;
        if (!near) {
            // Stand just short of it, on the side you came from, so the hero never covers the trunk.
            walkTo(n.x + (heroRef.current < n.x ? -CHOP_REACH * 0.65 : CHOP_REACH * 0.65));
            return;
        }
        if (busy || fell) return;
        const cur = chop && chop.node === n.i
            ? chop
            : { node: n.i, id: n.id, hp: treeById(n.id).bites, max: treeById(n.id).bites, swings: 0, streak: 0, leaves: 0 };
        const now = Date.now();
        const res = swing({ hp: cur.hp, tree: cur.id, felled: false }, st.axe,
            { now, last: lastSwing.current, streak: cur.streak });
        lastSwing.current = now;
        sfx(res.mult >= 1.4 ? "forestBite" : "forestChop");
        setShake(Math.min(9, 3 + res.streak * 0.3 + (res.doubled ? 3 : 0)));
        later(() => setShake(0), 110);

        // Leaves come off as you hit it. Counted here and posted with the fell; the server clamps the count
        // to the swings it took, so the browser can never claim a shower it did not earn.
        let leaves = cur.leaves;
        const burst = [];
        if (Math.random() < LEAF_CHANCE) {
            leaves += 1;
            burst.push({ kind: "leaf", dx: (Math.random() < 0.5 ? -1 : 1) * (30 + Math.random() * 70), dy: 60 + Math.random() * 60, rot: (Math.random() - 0.5) * 720 });
        }
        burst.push({ kind: "chip", dx: (Math.random() < 0.5 ? -1 : 1) * (25 + Math.random() * 60), dy: 30 + Math.random() * 50, rot: (Math.random() - 0.5) * 540 });
        burst.push({ kind: "num", text: res.doubled ? `${res.hit}!` : `${res.hit}`, hot: res.mult >= 1.5 });
        const ids = burst.map((b) => ({ ...b, id: fxId.current++, at: n.x }));
        setFx((f) => [...f.slice(-30), ...ids]);
        const idSet = new Set(ids.map((x) => x.id));
        later(() => setFx((f) => f.filter((x) => !idSet.has(x.id))), 900);

        const next = { ...cur, hp: res.patch.hp, swings: cur.swings + 1, streak: res.streak, leaves };
        setChop(next);
        if (!res.felled) return;

        // ── TIMBER ───────────────────────────────────────────────────────────────────────────────
        sfx("forestTimber");
        setBusy(true);
        setFell({ node: n.i, id: n.id, at: n.x });
        later(() => { sfx("forestCrash"); setShake(16); later(() => setShake(0), 320); }, 620);
        (async () => {
            const r = await fetch("/api/marketplace/forest", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "fell", node: n.i, swings: next.swings, streak: res.streak,
                    leaves: next.leaves, at: Math.round(heroRef.current / NODE_GAP) }),
            }).catch(() => null);
            const d = r ? await r.json().catch(() => null) : null;
            setBusy(false);
            setChop(null);
            if (!d?.ok) { setErr(errorText(d?.error)); setFell(null); return; }
            later(() => {
                setSt(d.forest);
                sfx(d.gained?.some((g) => ["rare", "epic", "legendary"].includes(g.rarity)) ? "forestRare" : "forestWood");
                setFell({ node: n.i, id: n.id, at: n.x, wood: d.wood, name: d.name, gained: d.gained || [], swings: next.swings });
                later(() => setFell(null), 2800);
            }, 760);
        })();
    }, [arm, walkTo, busy, fell, chop, st, later]);

    const buy = useCallback(async (track) => {
        setBusy(true); setErr("");
        const r = await fetch("/api/marketplace/forest", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "axe", track }),
        }).catch(() => null);
        const d = r ? await r.json().catch(() => null) : null;
        setBusy(false);
        if (!d?.ok) { setErr(errorText(d?.error)); sfx("denied"); return; }
        setSt(d.forest);
        sfx("forestAxe");
    }, []);

    const form = useMemo(() => axeForm(st?.total || 0), [st?.total]);
    // ⚠️ NOT CLAMPED AT ZERO. Clamping it meant that at node 0 the camera could not centre you, so you stood
    // on the very left edge with half your body off the screen and the first tree pinned to the corner. The
    // wood has a start but the CAMERA does not need one — letting it run negative just shows empty backdrop
    // to the left of the first tree, which is what the edge of a forest looks like.
    const camX = heroX - viewW / 2;

    // ── WHAT IS ON SCREEN ────────────────────────────────────────────────────────────────────────────
    // Only the nodes the camera can see, plus a couple either side so nothing pops in at the edge. This is
    // the whole reason the wood can be endless: standing at node 40,000 costs exactly what node 4 costs.
    const nodes = useMemo(() => {
        if (!st) return [];
        const from = Math.max(0, Math.floor(camX / NODE_GAP) - PAD);
        const to = Math.ceil((camX + viewW) / NODE_GAP) + PAD;
        const out = [];
        for (let i = from; i <= to; i += 1) {
            const n = nodeAt(st.seed, i);
            if (n.kind === "empty") continue;
            if (n.kind === "shroom" && (st.taken?.[String(i)] || pending.current.has(i))) continue;
            out.push(n);
        }
        return out;
    }, [st, camX, viewW]);

    if (!st) return <p className="fw-wait">Walking out to the tree line…</p>;

    const atNode = Math.round(heroX / NODE_GAP);
    const streakPct = chop ? Math.min(100, Math.round((chop.streak * STREAK_STEP) / (STREAK_CAP - 1) * 100)) : 0;
    const mult = chop ? 1 + Math.min(STREAK_CAP - 1, chop.streak * STREAK_STEP) : 1;

    return (
        <section className="fw" onPointerDown={arm}>
            <header className="fw-top">
                <GiLogging aria-hidden="true" />
                <b>The Forest</b>
                <span className="fw-depth">node {atNode.toLocaleString()}</span>
                <span className="fw-wood">{st.wood.toLocaleString()}<i>wood</i></span>
                <button type="button" className="fw-bag" onClick={() => { sfx("open"); setBag(true); }} aria-label="Your pouch">
                    <GiSwapBag aria-hidden="true" />
                    {st.materials?.length ? <em>{st.materials.length}</em> : null}
                </button>
            </header>

            {err ? <p className="fw-err" role="alert">{err}</p> : null}

            {/* ⚠️ THE HEIGHT IS INLINE, NOT IN THE STYLE BLOCK. Through the stylesheet this box reported a
                computed height of 400px to two different rigs and PAINTED at 189px in the screenshots from
                both of them — and everything inside is positioned against it by percentage, so the trees,
                the floor and the hero all landed outside the box that was actually drawn. An inline height
                is the one value nothing can disagree about: no cascade, no stale chunk, no scoping. */}
            <div className="fw-world" ref={wrapRef} style={{ height: WORLD_H }}
                onPointerDown={(e) => {
                    if (e.target.closest("[data-node]")) return;   // a tree handles its own tap
                    const rect = e.currentTarget.getBoundingClientRect();
                    walkTo(camX + (e.clientX - rect.left));
                }}>
                {/* Parallax. Two copies of one FLAT backdrop at different rates — the far wall barely moves,
                    the near one sweeps, and that difference is the whole feeling of walking. Flat is why it
                    can tile forever: a vanishing point would be right from one spot and wrong from the rest. */}
                <span className="fw-far" aria-hidden="true"
                    style={{ backgroundImage: `url(${GROVE})`, backgroundPositionX: `${-camX * 0.18}px` }} />
                <span className="fw-near" aria-hidden="true"
                    style={{ backgroundImage: `url(${GROVE})`, backgroundPositionX: `${-camX * 0.45}px` }} />
                <span className="fw-haze" aria-hidden="true" />
                <span className="fw-floor" aria-hidden="true"
                    style={{ backgroundImage: `url(${FLOOR})`, backgroundPositionX: `${-camX}px` }} />

                <div className="fw-stage" style={{ transform: shake ? `translate3d(${(Math.random() - 0.5) * shake}px, ${(Math.random() - 0.5) * shake * 0.6}px, 0)` : undefined }}>
                    {nodes.map((n) => {
                        const left = n.x - camX;
                        // The LANE it stands in. Further back is smaller, dimmer and sits higher up the
                        // frame — which is what stops a side-on wood reading as a single row of cut-outs.
                        const back = n.lane;
                        // ⚠️ SMALL. The first pass drew these at 170px in a 360px-wide wood — 56% of the screen for one
                        // tree, which is the same "takes up the whole screen" in a new costume. A tree you walk past
                        // should be a thing in the scene, not the scene.
                        const scale = 0.62 + (1 - back) * 0.42;
                        const bottom = 7 + back * 12;
                        const z = Math.round(100 - back * 40);
                        if (n.kind === "shroom") {
                            /* eslint-disable-next-line @next/next/no-img-element */
                            return <img key={n.i} src={SHROOM_ART(n.id)} alt="" draggable="false" data-node={n.i}
                                className="fw-shroom" style={{ left, bottom: `${bottom}%`, width: `${34 * scale}px`, zIndex: z }} />;
                        }
                        const down = Number(st.cut?.[String(n.i)]) > 0;
                        const isChop = chop && chop.node === n.i;
                        const going = fell && fell.node === n.i;
                        return (
                            <button key={n.i} type="button" data-node={n.i} className="fw-node"
                                style={{ left, bottom: `${bottom}%`, zIndex: z }}
                                onPointerDown={(e) => { e.stopPropagation(); if (!down) hitTree(n); }}
                                aria-label={down ? "A cut stump" : `${treeById(n.id).name} — chop`}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={STUMP} alt="" draggable="false" className="fw-stump" style={{ width: `${40 * scale}px` }} />
                                {!down ? (
                                    /* eslint-disable-next-line @next/next/no-img-element */
                                    <img src={TREE_ART(n.id)} alt="" draggable="false"
                                        className={`fw-tree${isChop && shake ? " is-struck" : ""}${going ? " is-down" : ""}`}
                                        style={{ width: `${112 * scale}px`, filter: `brightness(${(0.6 + (1 - back) * 0.45).toFixed(2)})` }} />
                                ) : null}
                                {isChop && !down ? (
                                    <span className="fw-hp" style={{ "--r": RARITY[treeById(n.id).rarity] }}>
                                        <b>{treeById(n.id).name}</b>
                                        <i><u style={{ width: `${Math.max(0, Math.round((chop.hp / chop.max) * 100))}%` }} /></i>
                                    </span>
                                ) : null}
                            </button>
                        );
                    })}

                    {fx.map((f) => (
                        <i key={f.id} className={`fw-p is-${f.kind}${f.hot ? " is-hot" : ""}`}
                            style={{ left: f.at - camX, "--dx": `${f.dx || 0}px`, "--dy": `${f.dy || 0}px`, "--rot": `${f.rot || 0}deg` }}>
                            {f.kind === "num" ? f.text : null}
                        </i>
                    ))}

                    <div className={`fw-hero${walking ? " is-walking" : ""}`}
                        style={{ left: heroX - camX, transform: `translateX(-50%) scaleX(${facing})` }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={AXE_ART(form.id)} alt="" draggable="false" className={`fw-axe${shake ? " is-swing" : ""}`} />
                    </div>
                </div>

                {chop ? (
                    <span className={`fw-streak${chop.streak > 0 ? "" : " is-cold"}`} aria-hidden="true">
                        <i style={{ width: `${streakPct}%` }} />
                        <em>{chop.streak > 0 ? `×${mult.toFixed(2)}` : "tap the tree — as fast as you can"}</em>
                    </span>
                ) : (
                    <span className="fw-hint" aria-hidden="true">tap the ground to walk · tap a tree to chop</span>
                )}

                <span className="fw-got" aria-hidden="true">
                    {got.map((g) => <em key={g.id} style={{ "--r": RARITY[g.rarity] || "#b9b2a4" }}>+{g.n} {g.name}</em>)}
                </span>

                {fell?.wood ? (
                    <span className="fw-fell" style={{ left: fell.at - camX }}>
                        <b>+{fell.wood} wood</b>
                        {(fell.gained || []).map((g, k) => (
                            <i key={k} style={{ "--r": RARITY[g.rarity] || "#b9b2a4" }}>+{g.n} {g.name}</i>
                        ))}
                    </span>
                ) : null}
            </div>

            <button type="button" className="fw-btn fw-wide" onClick={() => { arm(); sfx("open"); setShop(true); }}>
                <GiWoodAxe aria-hidden="true" /> {form.name} <em>· tune the axe</em>
            </button>

            {/* ── THE POUCH ── leaves, mushrooms and what the trees gave up. Not gear, so not the armoury. */}
            {bag ? (
                <div className="fw-over" role="presentation" onClick={() => setBag(false)}>
                    <div className="fw-sheet" role="dialog" aria-label="Your pouch" onClick={(e) => e.stopPropagation()}>
                        <button type="button" className="fw-x" onClick={() => setBag(false)} aria-label="Close">✕</button>
                        <p className="fw-sheet-h">The Pouch</p>
                        <p className="fw-sheet-sub">Gathered from the wood. Alchemy will want all of it.</p>
                        {st.materials?.length ? (
                            <ul className="fw-mats">
                                {[...st.materials].sort((a, b) => a.name.localeCompare(b.name)).map((m) => (
                                    <li key={m.id} style={{ "--r": RARITY[m.rarity] || "#b9b2a4" }}>
                                        <b>{m.name}</b><em>{m.n.toLocaleString()}</em>
                                    </li>
                                ))}
                            </ul>
                        ) : <p className="fw-empty">Nothing yet. Hit a tree and watch the leaves come down.</p>}
                    </div>
                </div>
            ) : null}

            {/* ── THE AXE ── */}
            {shop ? (
                <div className="fw-over" role="presentation" onClick={() => setShop(false)}>
                    <div className="fw-sheet" role="dialog" aria-label="The axe" onClick={(e) => e.stopPropagation()}>
                        <button type="button" className="fw-x" onClick={() => setShop(false)} aria-label="Close">✕</button>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={AXE_ART(form.id)} alt="" className="fw-sheet-axe" draggable="false" />
                        <p className="fw-sheet-h">{form.name}</p>
                        <p className="fw-sheet-sub">{st.wood.toLocaleString()} wood in the pile</p>
                        {AXE_TRACK_IDS.map((id) => {
                            const t = AXE_TRACKS[id];
                            const lvl = st.axe[id] || 0;
                            const cost = trackCost(id, lvl);
                            const read = trackReadout(id, lvl);
                            const short = cost != null && st.wood < cost;
                            return (
                                <div key={id} className={`fw-track${short ? " is-short" : ""}`}>
                                    <span className="fw-track-top"><b>{t.name}</b><em>{lvl} / {t.max}</em></span>
                                    <span className="fw-pips" aria-hidden="true">
                                        {Array.from({ length: t.max }, (_, k) => <i key={k} className={k < lvl ? "is-on" : ""} />)}
                                    </span>
                                    <span className="fw-track-num">
                                        <b>{read.now}</b>
                                        {read.next ? <><s aria-hidden="true">→</s><u>{read.next}</u></> : null}
                                        <i>{read.unit}</i>
                                    </span>
                                    <i className="fw-track-blurb">{t.blurb}</i>
                                    <button type="button" className="fw-btn is-go" disabled={busy || cost == null || short}
                                        onClick={() => buy(id)}>
                                        {cost == null ? "Maxed" : <>{t.verb} <em>{cost.toLocaleString()} wood</em></>}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : null}

            <style jsx>{`
                .fw { display: block; }
                .fw-wait { padding: 26px; text-align: center; color: #8a9384; }
                .fw-top { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
                .fw-top :global(svg) { width: 22px; height: 22px; color: #8fbf5f; }
                .fw-top b { font-size: 17px; font-weight: 800; color: #e8f0e4; }
                .fw-depth { font-size: 11px; color: #6f7a68; letter-spacing: .06em; }
                .fw-wood { margin-left: auto; font-size: 17px; font-weight: 800; color: #ffcf87; }
                .fw-wood i { margin-left: 5px; font-style: normal; font-size: 10.5px; letter-spacing: .1em;
                    text-transform: uppercase; color: #8a9384; }
                .fw-bag { position: relative; width: 38px; height: 38px; display: grid; place-items: center;
                    border-radius: 11px; background: #18221a; border: 1px solid #34402f; cursor: pointer; }
                .fw-bag :global(svg) { width: 20px; height: 20px; color: #b6d06a; }
                .fw-bag em { position: absolute; top: -5px; right: -5px; min-width: 17px; padding: 0 4px;
                    border-radius: 999px; font-style: normal; font-size: 10px; font-weight: 800;
                    color: #16200f; background: #b6d06a; }
                .fw-err { margin: 0 0 8px; padding: 8px 11px; border-radius: 9px; font-size: 13px;
                    color: #ffb9a8; background: rgba(120,40,30,.28); border: 1px solid rgba(220,110,90,.3); }

                /* ── THE WOOD ────────────────────────────────────────────────────────────────────── */
                /* ⚠️ A FIXED HEIGHT, NOT vh. Sized as 58vh this box measured 440px when the DOM was asked and
                   rendered 178px when the frame was actually captured — the same rule, the same rig, two
                   answers — and everything positioned against it by percentage (the trees at bottom 7%, the
                   floor strip at 22%) landed wherever the disagreement put it. A world whose height depends on
                   which tool is looking at it cannot be judged from a picture, which is the only way this
                   screen can be judged at all. Fixed px here, and the media query below steps it up. */
                .fw-world { position: relative; width: 100%; height: 400px; overflow: hidden;
                    border-radius: 14px; background: #070d10; touch-action: manipulation; cursor: pointer;
                    box-shadow: inset 0 0 80px rgba(0,0,0,.8); }
                /* The two backdrop walls. repeat-x with a moving background-position is how a flat picture
                   becomes an endless one: no elements are created, nothing is measured, and the wood can run
                   to node forty thousand for the price of a number changing. */
                .fw-far, .fw-near { position: absolute; left: 0; right: 0; top: 0; bottom: 0;
                    background-repeat: repeat-x; background-size: auto 100%; pointer-events: none; }
                .fw-far { filter: brightness(.34) blur(2px) saturate(.7); }
                .fw-near { filter: brightness(.52) blur(1px); opacity: .8;
                    -webkit-mask-image: linear-gradient(180deg, #000 0, #000 64%, transparent 92%);
                    mask-image: linear-gradient(180deg, #000 0, #000 64%, transparent 92%); }
                .fw-haze { position: absolute; inset: 0; pointer-events: none;
                    background: linear-gradient(101deg, transparent 14%, rgba(168,214,236,.09) 19%, transparent 25%),
                                linear-gradient(97deg, transparent 56%, rgba(168,214,236,.07) 61%, transparent 67%),
                                radial-gradient(120% 62% at 50% 0%, rgba(150,200,230,.11), transparent 64%),
                                linear-gradient(180deg, transparent 52%, rgba(3,7,9,.6)); }
                /* The floor is its own repeating strip at 1:1 with the camera, so what you walk on moves at
                   exactly your speed and the parallax above it reads as distance rather than as drift. */
                .fw-floor { position: absolute; left: 0; right: 0; bottom: 0; height: 22%;
                    background-repeat: repeat-x; background-size: auto 100%; pointer-events: none;
                    box-shadow: inset 0 14px 22px -10px rgba(0,0,0,.85); }
                .fw-stage { position: absolute; inset: 0; will-change: transform; }

                /* ── WHAT STANDS IN IT ───────────────────────────────────────────────────────────── */
                .fw-node { position: absolute; padding: 0; border: 0; background: none; cursor: pointer;
                    transform: translateX(-50%); -webkit-tap-highlight-color: transparent;
                    display: flex; flex-direction: column; align-items: center; }
                .fw-tree { display: block; transform-origin: 50% 100%;
                    filter: drop-shadow(0 8px 14px rgba(0,0,0,.65)); }
                .fw-stump { position: absolute; bottom: 0; left: 50%; transform: translateX(-50%);
                    filter: drop-shadow(0 5px 10px rgba(0,0,0,.7)); }
                .fw-shroom { position: absolute; transform: translateX(-50%); pointer-events: none;
                    filter: drop-shadow(0 4px 7px rgba(0,0,0,.6)); animation: fwShroom 3.4s ease-in-out infinite; }
                @keyframes fwShroom {
                    0%,100% { transform: translateX(-50%) translateY(0); }
                    50% { transform: translateX(-50%) translateY(-2px); }
                }
                /* ⚠️ EVERY TRANSFORM RESTATES translateX(-50%) — a keyframe that animates the transform
                   property and forgets the centring snaps the thing half a frame sideways the moment it
                   plays. It has happened twice in this codebase already. */
                .fw-tree.is-struck { animation: fwStruck 110ms ease-out; }
                @keyframes fwStruck {
                    0% { transform: rotate(0deg); }
                    40% { transform: rotate(-1.4deg) scaleY(.985); }
                    100% { transform: rotate(0deg); }
                }
                .fw-tree.is-down { animation: fwFall 900ms cubic-bezier(.55,.02,.72,.35) forwards; }
                @keyframes fwFall {
                    0% { transform: rotate(0deg); opacity: 1; }
                    14% { transform: rotate(-4deg); opacity: 1; }
                    72% { transform: rotate(78deg); opacity: 1; }
                    80% { transform: rotate(73deg); opacity: 1; }
                    100% { transform: rotate(76deg); opacity: 0; }
                }
                .fw-hp { position: absolute; bottom: 100%; margin-bottom: 6px; width: 116px;
                    display: flex; flex-direction: column; align-items: center; gap: 3px; pointer-events: none; }
                .fw-hp b { font-size: 12px; font-weight: 800; color: var(--r); text-shadow: 0 2px 6px rgba(0,0,0,.95); }
                .fw-hp i { display: block; width: 100%; height: 6px; border-radius: 999px; overflow: hidden;
                    background: rgba(4,8,10,.85); box-shadow: inset 0 0 0 1px rgba(180,200,170,.22); }
                .fw-hp u { display: block; height: 100%; text-decoration: none; border-radius: 999px;
                    background: linear-gradient(90deg, #6f9440, #b6d06a); transition: width 70ms linear; }

                /* ── YOU ──────────────────────────────────────────────────────────────────────────── */
                .fw-hero { position: absolute; bottom: 9%; width: 54px; height: 78px; z-index: 120;
                    display: flex; align-items: flex-end; justify-content: center; pointer-events: none; }
                .fw-hero.is-walking { animation: fwBob 420ms ease-in-out infinite; }
                @keyframes fwBob {
                    0%,100% { margin-bottom: 0; }
                    50% { margin-bottom: 4px; }
                }
                .fw-axe { width: 44px; transform-origin: 50% 88%;
                    filter: drop-shadow(0 4px 8px rgba(0,0,0,.8)); }
                .fw-axe.is-swing { animation: fwSwing 120ms ease-in; }
                @keyframes fwSwing {
                    0% { transform: rotate(-58deg) translate(8px, -14px); }
                    70% { transform: rotate(14deg) translate(-3px, 3px); }
                    100% { transform: rotate(0deg) translate(0, 0); }
                }

                /* ── CHIPS, LEAVES, NUMBERS ──────────────────────────────────────────────────────── */
                .fw-p { position: absolute; bottom: 16%; display: block; pointer-events: none; z-index: 130;
                    animation: fwFly 800ms cubic-bezier(.25,.6,.4,1) forwards; }
                @keyframes fwFly {
                    0% { transform: translate(-50%, 0) rotate(0deg); opacity: 1; }
                    45% { transform: translate(calc(-50% + var(--dx) * .55), calc(var(--dy) * -.7)) rotate(calc(var(--rot) * .5)); opacity: 1; }
                    100% { transform: translate(calc(-50% + var(--dx)), var(--dy)) rotate(var(--rot)); opacity: 0; }
                }
                .fw-p.is-chip { width: 7px; height: 4px; border-radius: 2px;
                    background: linear-gradient(160deg, #e0c489, #9a6b38); }
                /* A leaf is a leaf shape, not a brown rectangle — it is the thing the pouch is about. */
                .fw-p.is-leaf { width: 11px; height: 7px; border-radius: 60% 10% 60% 10%;
                    background: linear-gradient(150deg, #8fd06a, #3f7a33); box-shadow: 0 1px 2px rgba(0,0,0,.5); }
                .fw-p.is-num { font-style: normal; font-size: 15px; font-weight: 900; color: #dfe9d6;
                    text-shadow: 0 2px 6px rgba(0,0,0,.95); }
                .fw-p.is-num.is-hot { color: #ffcf87; font-size: 18px; }

                /* ── THE HUD ─────────────────────────────────────────────────────────────────────── */
                .fw-streak { position: absolute; left: 12px; right: 12px; bottom: 10px; height: 17px; z-index: 140;
                    display: block; border-radius: 999px; background: rgba(6,10,12,.74);
                    box-shadow: inset 0 0 0 1px rgba(255,180,90,.18); pointer-events: none; }
                .fw-streak i { display: block; height: 100%; border-radius: 999px;
                    background: linear-gradient(90deg, #c8873f, #ffcf87); transition: width 90ms linear; }
                .fw-streak em { position: absolute; inset: 0; display: grid; place-items: center;
                    font-style: normal; font-size: 10.5px; font-weight: 800; letter-spacing: .06em;
                    color: #1a140c; text-shadow: 0 1px 0 rgba(255,255,255,.25); }
                .fw-streak.is-cold em { color: #ffe3b4; text-shadow: 0 1px 4px rgba(0,0,0,.95); }
                .fw-hint { position: absolute; left: 0; right: 0; bottom: 12px; text-align: center; z-index: 140;
                    font-size: 11px; letter-spacing: .04em; color: rgba(223,233,214,.55); pointer-events: none; }
                .fw-got { position: absolute; right: 10px; top: 10px; z-index: 150; display: flex;
                    flex-direction: column; align-items: flex-end; gap: 4px; pointer-events: none; }
                .fw-got em { font-style: normal; font-size: 12.5px; font-weight: 800; color: var(--r);
                    text-shadow: 0 2px 6px rgba(0,0,0,.95); animation: fwGot 1.8s ease-out forwards; }
                @keyframes fwGot {
                    0% { opacity: 0; transform: translateX(14px); }
                    16% { opacity: 1; transform: translateX(0); }
                    75% { opacity: 1; }
                    100% { opacity: 0; transform: translateY(-12px); }
                }
                .fw-fell { position: absolute; bottom: 34%; transform: translateX(-50%); z-index: 150;
                    display: flex; flex-direction: column; align-items: center; gap: 2px; pointer-events: none;
                    animation: fwFell 2.8s ease-out forwards; }
                .fw-fell b { font-size: 23px; font-weight: 900; color: #ffcf87; text-shadow: 0 3px 12px rgba(0,0,0,.95); }
                .fw-fell i { font-style: normal; font-size: 12.5px; font-weight: 800; color: var(--r);
                    text-shadow: 0 2px 6px rgba(0,0,0,.95); }
                @keyframes fwFell {
                    0% { opacity: 0; transform: translate(-50%, 18px) scale(.7); }
                    12% { opacity: 1; transform: translate(-50%, 0) scale(1.08); }
                    22% { transform: translate(-50%, 0) scale(1); }
                    80% { opacity: 1; }
                    100% { opacity: 0; transform: translate(-50%, -34px); }
                }

                /* ── BUTTONS AND SHEETS ──────────────────────────────────────────────────────────── */
                .fw-btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px;
                    padding: 12px 15px; border-radius: 11px; font-size: 14.5px; font-weight: 800;
                    color: #dfe9d6; background: #18221a; border: 1px solid #34402f; cursor: pointer; }
                .fw-btn :global(svg) { width: 19px; height: 19px; color: #b6d06a; }
                .fw-btn em { font-style: normal; font-weight: 700; color: #ffcf87; }
                .fw-btn.is-go { background: linear-gradient(180deg, #26351f, #1b2617); border-color: #4c6b3c; }
                .fw-btn:disabled { opacity: .45; cursor: default; }
                .fw-wide { width: 100%; margin-top: 10px; }
                .fw-x { position: absolute; top: 10px; right: 12px; z-index: 9; width: 34px; height: 34px;
                    border-radius: 999px; font-size: 16px; color: #cfd8c8; background: rgba(6,11,13,.66);
                    border: 1px solid rgba(180,200,170,.2); cursor: pointer; }
                .fw-over { position: fixed; inset: 0; z-index: 4500; display: flex; align-items: flex-end;
                    justify-content: center; background: rgba(3,6,8,.72); backdrop-filter: blur(3px); }
                .fw-sheet { position: relative; width: min(520px, 100%); max-height: 92vh; overflow-y: auto;
                    padding: 18px 14px 20px; border-radius: 16px 16px 0 0; background: #10160f;
                    border-top: 1px solid #34402f; }
                .fw-sheet-axe { display: block; width: 84px; margin: 0 auto 6px; }
                .fw-sheet-h { margin: 0; text-align: center; font-size: 19px; font-weight: 800; color: #e8f0e4; }
                .fw-sheet-sub { margin: 2px 0 14px; text-align: center; font-size: 12.5px; color: #8a9384; }
                .fw-empty { margin: 18px 0; text-align: center; font-size: 13px; color: #6f7a68; }
                .fw-mats { list-style: none; margin: 0; padding: 0; display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 6px; }
                .fw-mats li { display: flex; align-items: baseline; gap: 8px; padding: 9px 11px;
                    border-radius: 10px; background: #141c12; border: 1px solid #2a3626; }
                .fw-mats b { flex: 1; font-size: 13px; font-weight: 700; color: var(--r); }
                .fw-mats em { font-style: normal; font-size: 14px; font-weight: 800; color: #dfe9d6;
                    font-variant-numeric: tabular-nums; }
                .fw-track { padding: 11px 12px; margin-bottom: 8px; border-radius: 11px;
                    background: #141c12; border: 1px solid #2a3626; }
                .fw-track-top { display: flex; align-items: baseline; gap: 8px; }
                .fw-track-top b { font-size: 15px; font-weight: 800; color: #e8f0e4; }
                .fw-track-top em { margin-left: auto; font-style: normal; font-size: 12px; color: #8a9384; }
                .fw-pips { display: flex; gap: 3px; margin: 7px 0 0; }
                .fw-pips i { flex: 1; height: 4px; border-radius: 999px; background: #2a3626; }
                .fw-pips i.is-on { background: linear-gradient(90deg, #6f9440, #b6d06a); }
                .fw-track-num { display: flex; align-items: baseline; gap: 6px; margin: 7px 0 5px; }
                .fw-track-num b { font-size: 17px; font-weight: 800; color: #cfd8c8; font-variant-numeric: tabular-nums; }
                .fw-track-num s { text-decoration: none; color: #6f7a68; font-size: 13px; }
                .fw-track-num u { text-decoration: none; font-size: 17px; font-weight: 800; color: #9ede7a;
                    font-variant-numeric: tabular-nums; }
                .fw-track-num i { margin-left: 4px; font-style: normal; font-size: 11.5px; color: #7d876f; }
                .fw-track.is-short .fw-track-num u { color: #6f7a68; }
                .fw-track-blurb { display: block; margin-bottom: 9px; font-style: normal;
                    font-size: 12.5px; line-height: 1.45; color: #8a9384; }
                .fw-track .fw-btn { width: 100%; }

                @media (min-width: 700px) {
                    .fw-world { height: 520px; }
                    .fw-sheet { align-self: center; border-radius: 16px; border: 1px solid #34402f; }
                    .fw-over { align-items: center; }
                }
            `}</style>
        </section>
    );
}
