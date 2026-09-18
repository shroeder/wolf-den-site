"use client";

// ── ASHORE ───────────────────────────────────────────────────────────────────────────────────────────────────
// Luke: "the idea of our boat landing ashore and being able to walk on unique islands."
//
// ⚠️ WHAT THIS SCREEN WAS, AND WHY IT IS NOT THAT ANY MORE (2026-09-18) ───────────────────────────────────────
// Luke, on playing it: "trying to walk around and stuff wasn't working at all. It also didn't really make
// sense to me, like what the goal was, and it didn't really feel that immersive."
//
// All three were the same screen, and none of them was a broken handler. Measured in the browser before any
// of this was written:
//
//   1. YOU COULD NOT WALK. The only things bound to a tap were the props. Every island is 52-60% empty sand
//      and that sand was bound to nothing — a tap 120px from the walker hit `.iw-stage` and returned. At a
//      good landfall exactly ONE of 22 props was on screen; at a wild-guess landfall, ZERO of 20, with the
//      longest run of untappable ground at 3.5 phone screens. So on most of an island there was nothing a
//      tap could do, and the screen read as dead. Free movement was never built.
//   2. NOTHING SAID WHAT YOU CAME FOR. The mark was one more node, up to 5,227px off screen, with not one
//      pixel pointing at it, and the tide was a bare number with no unit.
//   3. IT WAS A 317x340 LETTERBOX inside the site header and the shop footer, showing 1/28th of the island.
//
// So: the whole thing is one hold-anywhere-to-walk surface, it tells you which way the mark is and how far,
// and it is a full-screen scene with a layer that passes IN FRONT of you rather than a window in a page.
//
// ⚠️ THE WALK IS A rAF LOOP, NOT A CSS TRANSITION — the same call ForestClient made next door, for the same
// reason: the walk has to be INSPECTABLE every frame, because arriving somewhere is what triggers taking the
// thing there. A transition cannot be asked where it currently is without reading layout back every frame.
//
// ⚠️ AND THE BROWSER OWNS THE WALK. Nothing here posts per footfall — see island-world.js. One request when
// something is picked up, carrying where we are standing and what it cost, and the server regenerates the
// island to check the claim. A request per step is the most expensive shape in this codebase (CLAUDE.md).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import Exp from "@/lib/marketplace/expedition-audio.js";

// ⚠️ PAINTED ART, NOT GLYPHS. Everything on this screen is drawn — the props, the prize, the walker, the
// island behind them — so a line-art icon standing in the same row reads as something nobody finished. The
// purse is the doubloon the whole game already pays in, the tide is an hourglass drawn for it, and the boat
// is the member's OWN hull, one of eleven forms, handed down from the server.
const DOUBLOON = "/images/sailing/doubloon.png";
const TIDEGLASS = "/images/islands/chrome/tideglass.png";
// The layer that passes in front of you, one per biome. scripts/gen-island-foreground.mjs.
const fgArt = (biome) => `/images/islands/fg/${biome || "coral"}.webp`;

// ⚠️ VERSIONED. Every one of these will be redrawn at least once and static art is served with max-age=86400,
// so anybody who has opened an island keeps the old picture for a day unless this moves. Bump it on any
// redraw. See [[redrawn-art-must-be-versioned]].
const ART_V = "3";
const v = (p) => (p ? `${p}${p.includes("?") ? "&" : "?"}v=${ART_V}` : null);

// How near, in nodes, you have to be for a thing to be in reach. One, because a strip of nodes is not a room:
// standing next to something and not being able to touch it reads as a bug.
const REACH = 0.35;

// ── THE THREE DEPTHS ─────────────────────────────────────────────────────────────────────────────────────────
// Depth on a side-scroller does not come from the backdrop; it comes from something CLOSE crossing in front of
// the thing you are following, faster than it. The island had one layer and it read as a painting sliding
// behind cut-outs. These are the multipliers on the camera.
const FAR = 0.13;    // sky and the island's own plate, barely moving
const NEAR = 1.42;   // the ferns/ice/coral at your feet, overtaking you

// Where the ground line sits, as a fraction of the screen height measured from the BOTTOM. The walker's feet
// are on it; everything the island stands on is above it; the near layer is below and in front.
//
// ⚠️ 0.19, AND IT IS THE BACKDROPS THAT DECIDE THIS, NOT TASTE. gen-islands.mjs asks every plate for its shore
// "across the BOTTOM third... its top edge at exactly the same height as in any other island scene", and the
// twenty-five obey that loosely rather than exactly — Rime Shoal's ice starts high, Ember Hold's rock starts
// low. At 0.3 the walker stood on Ember Hold's WATER; at 0.24 they still did on a tall desktop, because the
// plate is drawn at 100% of the screen height so its shore band moves with the viewport. This sits low
// enough to be on the shore of the whole set, which is the only line that can be right for all twenty-five
// without repainting them.
const GROUND = 0.19;

// A little weather per water, drawn with nothing but divs — art would be a per-island cost for something that
// only has to move. `n` is how many, `life` is seconds for one to cross.
const AMBIENT = {
    coral: { n: 9, life: 15, cls: "is-gull" },
    ash: { n: 26, life: 7, cls: "is-ember" },
    drowned: { n: 16, life: 13, cls: "is-mote" },
    frost: { n: 34, life: 9, cls: "is-snow" },
    green: { n: 20, life: 12, cls: "is-spore" },
};

// Deterministic scatter — NOT Math.random(). Two renders of the same island should look the same, and a
// filmed frame should be comparable with the one before it.
const scatter = (i, salt) => {
    const x = Math.sin((i + 1) * 12.9898 + salt * 78.233) * 43758.5453;
    return x - Math.floor(x);
};

// ⚠️ THIS DREW ITS OWN PORTAL UNTIL THE JOURNEY EXISTED. It was the only full-screen beat, so it made its own
// fixed surface and took the scroll lock itself. Now every beat is full-screen and the STAGE in
// ExpeditionClient owns both — two nested portals would be two scroll locks, and the inner one restoring
// `overflow` on unmount would hand it back while the outer stage is still up.

export default function IslandWalk({ view, hero, boat, busy, onTake, onLeave }) {
    const isle = view?.island || {};
    const ashore = view?.ashore || {};
    const nodes = useMemo(() => ashore.nodes || [], [ashore.nodes]);
    const gap = Number(ashore.gap) || 190;
    const stepMs = Number(ashore.stepMs) || 850;
    const span = nodes.length || 1;

    // Where the walker actually is, in NODE units, owned as a number rather than by the DOM.
    const posRef = useRef(Number(ashore.at) || 0);
    const [pos, setPos] = useState(Number(ashore.at) || 0);
    const targetRef = useRef(null);
    const [facing, setFacing] = useState(1);
    const [walking, setWalking] = useState(false);
    const rafRef = useRef(0);
    const lastRef = useRef(0);
    // Steps spent, tracked as total absolute distance walked. The server takes the GREATEST of what it has and
    // what we send, and independently checks it is at least the straight-line distance from the beach — so
    // this can only ever cost us, never cheat. See reachable() in island-world.js.
    const spentRef = useRef(Number(ashore.spent) || 0);
    const [spent, setSpent] = useState(Number(ashore.spent) || 0);
    const takingRef = useRef(false);
    const [flash, setFlash] = useState(null);
    // Set the first time a walk is asked for, which is what retires the hint. Not a tutorial: one line, and
    // it is gone the moment the thing it describes has been done. See [[teach-by-showing-not-telling]].
    const [walkedOnce, setWalkedOnce] = useState(false);
    // Pulsed when the tide cannot pay for where you pointed. ⚠️ THE ONE THING THIS SCREEN MUST NEVER DO IS
    // REFUSE IN SILENCE — the old code returned early on exactly this and that is indistinguishable from a
    // dead button, which is half of what Luke reported.
    const [tideBump, setTideBump] = useState(0);

    const tide = Number(ashore.tide) || 0;
    const leftRaw = Math.max(0, tide - spent);
    // ⚠️ THE NUMBER ON THE CHIP IS THE RULE, NOT A ROUNDING OF IT.
    //
    // Two faults, one line. `spent` is a float accumulated an animation frame at a time, so the instant
    // anybody actually walked the chip read "43.60776470588235 steps" — twenty characters wide, which then
    // squeezed the island's name out of the HUD down to "R_". That survived because nothing could move far
    // enough to make a fraction before.
    //
    // Rounding fixed the width and introduced a worse thing: at 0.16 of a step left the chip said 0 and the
    // island still let you walk. A screen that says you are out of tide and then keeps moving is lying in
    // the one place this feature cannot afford to — the tide is the whole budget. So it is a FLOOR: whole
    // steps you can still complete, and out means out. Costs at most 0.99 of a step against the ten spare
    // that landfall() guarantees for reaching the mark, so it can never cost somebody the prize.
    const left = Math.floor(leftRaw);
    const out = left <= 0;

    // ── THE TIDE, OUT LOUD ───────────────────────────────────────────────────────────────────────────────
    // ⚠️ ON THE CROSSING, NOT ON THE CONDITION. `left <= 6` is true for every frame after the sixth-from-last
    // step, so firing on the condition would play the warning sixty times a second until the tide ran out.
    // A ref holds the last value it fired at, so each threshold speaks exactly once per expedition.
    const saidRef = useRef({ low: false, out: false });
    useEffect(() => {
        if (out && !saidRef.current.out) { saidRef.current.out = true; Exp.tideOut(); }
        else if (!out && left <= 6 && !saidRef.current.low) { saidRef.current.low = true; Exp.tideLow(); }
    }, [left, out]);

    // ── THE SERVER IS THE AUTHORITY WHENEVER IT SPEAKS ───────────────────────────────────────────────────
    // A reload, or a take that landed, can move us. But the correction is HANDED TO THE LOOP rather than
    // applied here: calling setState straight out of an effect triggers a cascading render, and the loop is
    // already running every frame and is the one thing that owns this position. It applies the correction on
    // the next tick and clears it.
    const syncRef = useRef(null);
    useEffect(() => { syncRef.current = { at: Number(ashore.at), spent: Number(ashore.spent) }; }, [ashore.at, ashore.spent]);

    const arrive = useCallback(async (i) => {
        if (takingRef.current) return;
        const node = nodes.find((n) => n.i === i);
        if (!node || node.taken || node.kind === "empty") return;
        takingRef.current = true;
        try {
            // ⚠️ CLAMPED INTO THE SERVER'S OWN WINDOW, NOT JUST ROUNDED. reachable() refuses a claim that is
            // below the straight-line distance from the beach OR above the tide, and a bare Math.round of a
            // float that has been accumulated a frame at a time can land a hair outside either end — which
            // would refuse the LAST thing a player walked to, the one they spent their whole tide reaching.
            const straight = Math.abs(i - (Number(view?.entry) || 0));
            const claim = Math.min(tide, Math.max(straight, Math.round(spentRef.current)));
            const res = await onTake?.({ to: i, spent: claim });
            // ⚠️ THE SOUND IS THE ONLY THING THAT SAYS *WHAT* YOU PICKED UP WITHOUT READING. Five node kinds,
            // five voices, and the mark is audibly the best of them — which matters because the reward chip
            // is a line of text that is gone in a second and the prize is the reason the chart was spent.
            if (res?.took?.reward?.length) { setFlash({ i, reward: res.took.reward }); Exp.take(node.kind); }
        } finally {
            takingRef.current = false;
        }
    }, [nodes, onTake, tide, view?.entry]);

    // ── THE LOOP ─────────────────────────────────────────────────────────────────────────────────────────
    useEffect(() => {
        const tick = (t) => {
            rafRef.current = requestAnimationFrame(tick);
            const last = lastRef.current || t;
            lastRef.current = t;
            const dt = Math.min(64, t - last);

            // Take the server's correction first, if there is one waiting.
            const sync = syncRef.current;
            if (sync) {
                syncRef.current = null;
                if (Number.isFinite(sync.at) && Math.abs(sync.at - posRef.current) > 1.5) {
                    posRef.current = sync.at; setPos(sync.at); targetRef.current = null;
                }
                if (Number.isFinite(sync.spent) && sync.spent > spentRef.current) {
                    spentRef.current = sync.spent; setSpent(sync.spent);
                }
            }

            const target = targetRef.current;
            if (target == null) { setWalking(false); return; }

            const cur = posRef.current;
            const dir = Math.sign(target - cur);
            if (dir === 0 || Math.abs(target - cur) < 0.02) {
                posRef.current = target; setPos(target); targetRef.current = null;
                setWalking(false);
                arrive(Math.round(target));
                return;
            }
            setWalking(true);
            // Nodes per millisecond. One node takes stepMs.
            const move = Math.min(Math.abs(target - cur), (dt / stepMs));
            const next = cur + move * dir;
            // The tide is spent as you walk, not when you arrive — stopping halfway still cost you the walking.
            spentRef.current += move;
            posRef.current = next;
            setPos(next);
            setSpent(spentRef.current);
            // Out of tide mid-stride: stop where you stand. ⚠️ AT THE FLOOR, the same boundary the chip
            // shows — stopping at the raw budget let the walker glide another fraction of a step after the
            // counter had already reached 0, which reads as the number being decorative.
            if (tide - spentRef.current < 1) { targetRef.current = null; setWalking(false); }
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafRef.current);
    }, [arrive, stepMs, tide]);

    // ── WALKING ──────────────────────────────────────────────────────────────────────────────────────────
    // ⚠️ IT ALWAYS DOES SOMETHING. The old rule was "never set off on a walk the tide cannot pay for", which
    // is right about not stranding somebody mid-stride and wrong about what to do instead: it returned, so
    // pointing at something out of reach was silence. Now the aim is CLAMPED to the furthest the tide can
    // carry you in that direction and the tide chip is pulsed, so the answer to a tap is always a walk plus
    // the reason it stopped where it did.
    const walkTo = useCallback((want) => {
        if (out || busy) { setTideBump((n) => n + 1); return; }
        const cur = posRef.current;
        // Whole steps, the same number the chip shows, so a clamp never walks you somewhere the HUD says
        // you could not have gone.
        const room = Math.max(0, Math.floor(tide - spentRef.current));
        let t = Math.max(0, Math.min(span - 1, want));
        const dist = Math.abs(t - cur);
        if (dist > room) { t = cur + Math.sign(t - cur) * room; setTideBump((n) => n + 1); }
        if (Math.abs(t - cur) < 0.02) return;
        setFacing(t >= cur ? 1 : -1);
        setWalkedOnce(true);
        targetRef.current = t;
    }, [busy, out, span, tide]);

    // ── THE WHOLE SCENE IS THE CONTROL ───────────────────────────────────────────────────────────────────
    // Point anywhere and the walker goes there; HOLD and they keep going, because the camera moves with them
    // so the world point under a still finger keeps sliding ahead. One mechanism covers tap-to-walk and
    // hold-to-keep-walking, and there is no d-pad on the glass.
    const rootRef = useRef(null);
    const dragRef = useRef(false);
    const [vw, setVw] = useState(390);
    const [vh, setVh] = useState(780);
    useEffect(() => {
        const read = () => { setVw(window.innerWidth); setVh(window.innerHeight); };
        read();
        window.addEventListener("resize", read);
        return () => window.removeEventListener("resize", read);
    }, []);

    // ── ⚠️ THE CAMERA LOOKS TOWARD THE MARK, NOT ALWAYS THE SAME WAY ─────────────────────────────────────
    // A fixed anchor means you always see more of what is to your RIGHT. Beach at the far end of the island —
    // which is exactly what a wild guess does — and the whole island is behind you, so the first thing a bad
    // plot shows you is an empty screen and a button that says go home. Filmed it, and that is precisely what
    // came back. The anchor flips with the direction the mark lies in, so landfall always opens looking at
    // the island you came for.
    const anchor = (Number(view?.fixIndex) || 0) >= (Number(view?.entry) || 0) ? 0.3 : 0.7;

    // ── ⚠️ HOW MUCH ISLAND A PHONE CAN SEE ───────────────────────────────────────────────────────────────
    // NODE_GAP is 190 WORLD pixels and it is a server constant — the island's layout, the reachability check
    // and the simulator all measure in it, so it cannot be different on a phone. But drawn 1:1 it meant a
    // 390px screen showed TWO nodes of a forty-six node island, which is most of why the island read as
    // nothing but sand: at any moment there was almost never a second thing in view to walk toward. A wide
    // screen showed six and felt like a place for exactly that reason.
    // So the STRIP is scaled instead. The world is untouched, the camera works in screen pixels, and a phone
    // sees a little over three nodes with a walker sized for the screen rather than for a desktop.
    // ⚠️ IT SCALES UP AS WELL AS DOWN. The clamp used to top out at 1, so every screen wider than 780px drew
    // the same 96px walker — 7.5% of a 1280 screen and 3.75% of a 2560 one, halving in apparent size exactly
    // as the room to show it doubled. It keeps climbing now, gently, to a ceiling that stops a desktop from
    // becoming a diorama.
    const zoom = Math.max(0.66, Math.min(1.5, vw / 780));
    const camera = -(pos * gap * zoom) + vw * anchor;

    const aimAt = useCallback((clientX) => {
        const box = rootRef.current?.getBoundingClientRect();
        if (!box || !box.width) return;
        const z = Math.max(0.66, Math.min(1.5, box.width / 780));
        const camNow = -(posRef.current * gap * z) + box.width * anchor;
        walkTo((clientX - box.left - camNow) / (gap * z));
    }, [anchor, gap, walkTo]);

    useEffect(() => {
        const move = (e) => { if (dragRef.current) { e.preventDefault(); aimAt(e.clientX); } };
        const up = () => { dragRef.current = false; };
        window.addEventListener("pointermove", move, { passive: false });
        window.addEventListener("pointerup", up);
        window.addEventListener("pointercancel", up);
        return () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
            window.removeEventListener("pointercancel", up);
        };
    }, [aimAt]);

    // ── WHAT YOU CAME FOR ────────────────────────────────────────────────────────────────────────────────
    // The mark is the only reason a chart was spent, and it was indistinguishable from scenery. This is a
    // bearing: which way, how far, and a picture of the thing itself, so the goal is on screen from the
    // moment you beach. It goes away the instant the mark is in view or in hand.
    const fixIndex = Number(view?.fixIndex);
    const fixNode = nodes.find((n) => n.kind === "fix");
    const fixDone = Boolean(fixNode?.taken);
    const fixScreenX = Number.isFinite(fixIndex) ? fixIndex * gap * zoom + camera : null;
    const fixOnScreen = fixScreenX != null && fixScreenX > 40 && fixScreenX < vw - 40;
    const stepsToFix = Number.isFinite(fixIndex) ? Math.round(Math.abs(fixIndex - pos)) : 0;
    const showBearing = !fixDone && Number.isFinite(fixIndex) && !fixOnScreen;
    const bearingLeft = Number.isFinite(fixIndex) && fixIndex < pos;

    // The light going. The tide is a step budget, not a clock, so this does not replace the number — it sits
    // under it as a second channel, and a beach that is visibly running out of day is worth more than a
    // integer dropping by one.
    const dusk = tide > 0 ? Math.max(0, Math.min(1, 1 - left / tide)) : 0;

    const amb = AMBIENT[isle.biome] || AMBIENT.coral;

    return (
        <div ref={rootRef} className="iw"
                style={{ "--ground": `${GROUND * 100}%`, "--tint": isle.tint || "#7fd6c8" }}
                onPointerDown={(e) => {
                    // A press on the HUD or a button is not a walk. Those stop propagation themselves; this
                    // is the ground, and the ground is the whole rest of the screen.
                    e.preventDefault();
                    dragRef.current = true;
                    aimAt(e.clientX);
                }}>

                {/* FAR — the island's own painted plate, barely moving. Anchored so its shore sits just
                    behind the line the walker stands on, and mirror-tiled in the file so its repeats are
                    mirror joins rather than seams. */}
                <div className="iw-far" style={{
                    backgroundImage: `url(${v(isle.art)})`,
                    backgroundPosition: `${camera * FAR}px bottom`,
                }} />
                <div className="iw-haze" style={{
                    background: `linear-gradient(180deg, transparent 38%, ${isle.tint || "#7fd6c8"}33 100%)`,
                }} />
                {/* ⚠️ THERE IS NO GENERIC SURF LINE HERE AND THERE MUST NOT BE ONE. A moving waterline was the
                    obvious way to stop the sea reading as a painting — but this layer cannot know where a
                    given island's shore actually IS. Each of the twenty-five plates puts its waterline
                    somewhere different, so a band at a fixed height landed in the middle of Rime Shoal's ice
                    field and drew two grey rectangles across it. Looked at it, and it was the only thing on
                    the screen that said "bug". The water belongs to the painting. */}

                {/* Weather. Divs, not art — see AMBIENT. */}
                <div className="iw-amb" aria-hidden="true">
                    {Array.from({ length: amb.n }, (_, i) => (
                        <span key={i} className={`iw-mote ${amb.cls}`} style={{
                            left: `${scatter(i, 1) * 100}%`,
                            top: `${scatter(i, 2) * 74}%`,
                            animationDuration: `${amb.life * (0.6 + scatter(i, 3) * 0.8)}s`,
                            animationDelay: `${-scatter(i, 4) * amb.life}s`,
                            transform: `scale(${0.6 + scatter(i, 5) * 0.9})`,
                        }} />
                    ))}
                </div>

                {/* MID — the island itself. Everything in here shares one transform, so the props, the boat
                    and the walker cannot drift apart. */}
                <div className="iw-strip" style={{ transform: `translate3d(${camera}px,0,0) scale(${zoom})` }}>
                    {nodes.map((n) => {
                        if (n.kind === "empty") return null;
                        const near = Math.abs(n.i - pos) <= REACH;
                        // The lane gives the island depth: further back is smaller, higher up and hazier, so a
                        // walk does not read as a flat row of cut-outs.
                        const lane = Number(n.lane) || 0.5;
                        const scale = 0.72 + (1 - lane) * 0.42;
                        return (
                            <button key={n.i} type="button"
                                className={`iw-node${n.taken ? " is-taken" : ""}${near ? " is-near" : ""}${n.kind === "fix" ? " is-fix" : ""}`}
                                style={{
                                    left: `${n.i * gap}px`,
                                    bottom: `${lane * 58}px`,
                                    transform: `scale(${scale})`,
                                    zIndex: Math.round((1 - lane) * 50) + 5,
                                    opacity: n.taken ? 0.4 : 0.62 + (1 - lane) * 0.38,
                                }}
                                onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); dragRef.current = true; walkTo(n.i); }}
                                aria-label={n.kind === "fix" ? "The mark" : n.name || n.kind}>
                                {/* ⚠️ A CSS BACKGROUND, NOT AN <img>, AND THAT IS THE WHOLE POINT.
                                    An onError fallback cannot work here — an SSR 404 fires its error event
                                    before React has hydrated, so the handler never runs and every node wears
                                    the browser's broken-image glyph (see [[img-onerror-fires-before-hydration]]).
                                    My first cut tried to answer that by painting a tile BEHIND the img, which
                                    does nothing: the glyph draws on top. Filming the wide screen with the
                                    props not yet generated showed a row of them, boxes and all.
                                    A background-image that 404s renders NOTHING. The contact shadow is always
                                    painted, so a missing sprite degrades to a shadow on the sand instead of
                                    to an error icon. */}
                                <span className="iw-tile" />
                                {n.art ? <span className="iw-art" style={{ backgroundImage: `url(${v(n.art)})` }} /> : null}
                                {n.kind === "fix" && !n.taken ? <span className="iw-xmark" aria-hidden="true" /> : null}
                                {near && !n.taken ? <span className="iw-take">{n.kind === "fix" ? "The mark" : n.name}</span> : null}
                            </button>
                        );
                    })}

                    {/* THE BOAT, drawn where you beached, so the island always tells you where you came in —
                        and it is the member's own hull, the same picture the helm and the profile draw.
                        ⚠️ NEVER MIRRORED. Every hull in the game is lit from its own upper left and flipping
                        one flips its light with it, which is why the wardens are drawn facing left rather
                        than mirrored (see gen-islands.mjs). It sits bow-right exactly as it does at the helm. */}
                    <div className="iw-boat" style={{ left: `${((Number(view?.entry) || 0) + (anchor > 0.5 ? 0.28 : -0.28)) * gap}px` }}>
                        <span className="iw-boattile" />
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {boat?.art ? <img className="iw-boatimg" src={boat.art} alt={boat.name || ""} draggable="false" /> : null}
                    </div>

                    {/* THE WALKER — the member's own avatar, the same sprite the deck and the arena draw.
                        A coloured capsule is temp scaffolding, and temp scaffolding ships. */}
                    <div className={`iw-you${walking ? " is-walking" : ""}`}
                        style={{ left: `${pos * gap}px`, transform: `translateX(-50%) scaleX(${facing * (hero?.flip ? -1 : 1)})` }}>
                        <span className="iw-youtile" />
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {hero?.art ? <img className="iw-youart" src={hero.art} alt="" draggable="false" />
                            : <span className="iw-youdot" />}
                    </div>
                </div>

                {/* NEAR — the layer that overtakes you. pointer-events:none, because the ground underneath it
                    is the control surface and a fern that ate a tap would be the old bug wearing a costume. */}
                <div className="iw-near" aria-hidden="true" style={{
                    backgroundImage: `url(${v(fgArt(isle.biome))})`,
                    backgroundPosition: `${camera * NEAR}px bottom`,
                }} />

                {/* The day going, over everything. */}
                {/* 0.42, not 0.6: multiplied over the near layer's own darkness it crushed the bottom
                    quarter of the screen to black at low tide — including the line telling you how to walk. */}
                <div className="iw-dusk" style={{ opacity: dusk * 0.42 }} aria-hidden="true" />

                {/* ── THE HUD ─────────────────────────────────────────────────────────────────────────── */}
                <div className="iw-hud" onPointerDown={(e) => e.stopPropagation()}>
                    <span className="iw-name">{isle.name}</span>
                    <span className="iw-chip">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img className="iw-chipico" src={v(DOUBLOON)} alt="" draggable="false" />{view?.purse || 0}
                    </span>
                    <span key={tideBump} className={`iw-chip is-tide${left <= 6 ? " is-low" : ""}${tideBump ? " is-bumped" : ""}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img className="iw-chipico" src={v(TIDEGLASS)} alt="" draggable="false" />
                        <b>{left}</b><i>{left === 1 ? "step" : "steps"}</i>
                        <span className="iw-tidebar"><span style={{ width: `${tide ? (leftRaw / tide) * 100 : 0}%` }} /></span>
                    </span>
                    <button className="iw-leave" disabled={busy} onClick={onLeave}>
                        {out ? "Put to sea" : "To the boat"}
                    </button>
                </div>

                {/* THE BEARING — which way the mark is, how far, and what it is. */}
                {showBearing ? (
                    <div className={`iw-bearing${bearingLeft ? " is-left" : ""}`} aria-live="polite">
                        <span className="iw-bearrow" aria-hidden="true" />
                        {isle.prize?.art ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img className="iw-bearart" src={v(isle.prize.art)} alt="" draggable="false" />
                        ) : null}
                        <span className="iw-bear-text"><b>{stepsToFix}</b><i>steps to the mark</i></span>
                    </div>
                ) : null}

                {flash ? (
                    <div className="iw-flash" onPointerDown={(e) => { e.stopPropagation(); setFlash(null); }}>
                        {flash.reward.map((r, i) => (
                            <span key={i} className="iw-got">
                                {r.kind === "doubloons" ? `+${r.n} doubloons`
                                    : r.kind === "xp" ? `+${r.n} xp`
                                        : r.kind === "chest" ? `${r.tier} chest`
                                            : r.kind === "parts" ? `${r.n}× parts`
                                                : r.prize || r.name || r.kind}
                            </span>
                        ))}
                    </div>
                ) : null}

                {out ? <p className="iw-tideout">The tide is out. The boat cannot wait.</p> : null}
                {!walkedOnce && !out ? <p className="iw-hint">Press and hold anywhere to walk</p> : null}

            <Style />
        </div>
    );
}

function Style() {
    return (
        <style jsx global>{`
            /* ── THE SCENE ────────────────────────────────────────────────────────────────────────────
               Fixed and full-bleed on document.body, above the site header (z-index 10) and everything
               the public layout floats over the page. This is the whole difference between a place and a
               picture of one: the island was a 317x340 box between a nav bar and a shop footer.
               100dvh, not 100vh — on a phone 100vh is the address bar's idea of the screen and the bottom
               of the scene lands under the browser chrome. See [[verify-on-real-phone-sizes]]. */
            .iw {
                position: absolute; inset: 0; z-index: 10; overflow: hidden;
                background: #0a1118;
                touch-action: none; user-select: none; -webkit-user-select: none;
                cursor: crosshair;
            }

            /* FAR. The plate keeps its own aspect and repeats — a 1536x1024 painting stretched across the
               whole parallax travel is a six-times horizontal smear, which is how Ember Hold's headland
               came out looking melted the first time. Bottom-anchored so the shore, not the sky, is what
               survives the crop.
               ⚠️ IT RUNS TO THE BOTTOM OF THE SCREEN, NOT TO THE GROUND LINE. Cutting it off at the line the
               walker stands on left a dark band of nothing under their feet with the foreground below THAT —
               a void across the middle of the island, which is exactly what it looked like. The plate's own
               lower third IS shore, so letting it run to the bottom puts real ground under the walk and the
               near layer laps over it. */
            .iw-far {
                position: absolute; inset: 0;
                background-size: auto 100%; background-repeat: repeat-x; background-color: #16222b;
            }
            /* ⚠️ ON A WIDE SCREEN THE MIRROR SHOWS. The island plates are 3072x1024 — one 1536 panel beside a
               flipped copy of itself, which is what makes the repeat seamless. Drawn at 100% of the height,
               a 2560px screen is wide enough to hold BOTH panels at once, and the join stops being a hidden
               seam and becomes a Rorschach: two identical forts on Ember Hold, a bilateral mountain on Rime
               Shoal. Scaling the plate up on wide screens keeps a single panel wider than the viewport, so
               only one half is ever in frame. */
            @media (min-width: 1100px) { .iw-far { background-size: auto 132%; } }
            @media (min-width: 1800px) { .iw-far { background-size: auto 168%; } }
            /* The tint is built inline from the island's own hex rather than with color-mix(), which is
               Chrome 111 / Safari 16.2 and would silently drop the whole declaration on an older phone —
               leaving the one thing that makes the Cinders look different from the Long Cold missing. */
            .iw-haze { position: absolute; inset: 0; pointer-events: none; }

            /* MID. Its BOTTOM edge is the ground line; everything inside sits on it. */
            /* transform-origin at the BOTTOM LEFT, because the bottom of this box IS the ground line and its
               left is world zero — scaling about the centre would lift the whole island off the ground and
               slide it sideways as the screen narrowed. */
            .iw-strip { position: absolute; left: 0; right: 0; top: 0; bottom: var(--ground);
                will-change: transform; transform-origin: 0 100%; }

            .iw-node { position: absolute; width: 104px; height: 104px; margin-left: -52px; padding: 0;
                background: none; border: 0; cursor: pointer; transform-origin: 50% 100%; touch-action: none; }
            .iw-node.is-taken { cursor: default; filter: grayscale(0.7); }
            /* A contact shadow, always painted. Without one a sprite reads as pasted onto the picture
               rather than standing on the ground. See sprite-floats-object-fit-contain. */
            .iw-tile { position: absolute; left: 50%; bottom: 0; width: 60px; height: 20px; margin-left: -30px;
                border-radius: 50%; background: rgba(0, 0, 0, 0.36); filter: blur(3px); }
            .iw-art { position: absolute; inset: 0; pointer-events: none;
                background-repeat: no-repeat; background-position: 50% 100%; background-size: contain; }
            .iw-node.is-near .iw-art { filter: drop-shadow(0 0 10px rgba(255, 226, 150, 0.8)); }

            .iw-xmark { position: absolute; left: 50%; top: -8px; width: 22px; height: 22px; margin-left: -11px;
                animation: iw-xpulse 1.9s ease-in-out infinite; }
            .iw-xmark::before, .iw-xmark::after { content: ""; position: absolute; left: 0; top: 10px;
                width: 22px; height: 3px; border-radius: 2px; background: #d8323c;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.6); }
            .iw-xmark::before { transform: rotate(45deg); }
            .iw-xmark::after { transform: rotate(-45deg); }
            @keyframes iw-xpulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.22); } }

            .iw-take { position: absolute; left: 50%; top: -32px; transform: translateX(-50%);
                padding: 3px 9px; border-radius: 999px; white-space: nowrap;
                background: rgba(18, 14, 8, 0.9); border: 1px solid rgba(232, 192, 105, 0.55);
                color: #f0dfb6; font-size: 0.72rem; font-weight: 700; }

            /* Beached: a little higher and a little smaller than the walker so it reads as standing further
               back at the water's edge — the same depth cue the node lanes use — and BEHIND everything in
               z-order because you have already stepped off it.
               ⚠️ IT HAS TO FIT ON THE STAGE AT LANDFALL: the camera holds the walker at the anchor fraction
               of the viewport (0.3 or 0.7), so the boat's half-width plus its offset must stay inside that.
               An early cut sat it 0.6 of a node gap out at 112px wide and the bow was sliced off by the
               screen edge on every single landfall. See [[sprite-amputation-vs-clipping]]. */
            .iw-boat { position: absolute; bottom: 14px; margin-left: -46px; z-index: 4; opacity: 0.95; }
            .iw-boattile { position: absolute; left: 50%; bottom: 6px; width: 72px; height: 17px;
                margin-left: -36px; border-radius: 50%; background: rgba(0, 0, 0, 0.34); filter: blur(4px); }
            .iw-boatimg { position: relative; display: block; width: 92px; height: 92px;
                object-fit: contain; object-position: 50% 100%;
                filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.55)); }

            .iw-you { position: absolute; bottom: 0; z-index: 60; }
            .iw-youtile { position: absolute; left: 50%; bottom: 2px; width: 54px; height: 16px;
                margin-left: -27px; border-radius: 50%; background: rgba(0, 0, 0, 0.42); filter: blur(3px); }
            .iw-youart { position: relative; display: block; width: 96px; height: 96px; object-fit: contain;
                object-position: 50% 100%; filter: drop-shadow(0 4px 7px rgba(0, 0, 0, 0.65)); }
            /* A walk cycle out of one still sprite: a small bob and a lean, which is enough for the eye to
               read locomotion and is why the walker no longer slides like a chess piece.
               Deliberately ignores prefers-reduced-motion, per [[animations-always-play]]. */
            .iw-you.is-walking .iw-youart { animation: iw-step 0.42s ease-in-out infinite; }
            @keyframes iw-step {
                0%, 100% { transform: translateY(0) rotate(-1.5deg); }
                50% { transform: translateY(-5px) rotate(1.5deg); }
            }
            .iw-youdot { display: block; width: 18px; height: 30px; border-radius: 9px 9px 5px 5px;
                background: linear-gradient(180deg, #f0cb79, #b5822f);
                box-shadow: 0 3px 8px rgba(0, 0, 0, 0.6); }

            /* NEAR. In front of the walker, moving faster than they do. */
            .iw-near {
                position: absolute; left: 0; right: 0; bottom: 0; height: 20%;
                z-index: 70; pointer-events: none;
                background-size: auto 100%; background-repeat: repeat-x; background-position-y: bottom;
            }

            .iw-dusk {
                position: absolute; inset: 0; z-index: 75; pointer-events: none;
                background: linear-gradient(180deg, rgba(38, 16, 8, 0.75), rgba(6, 8, 16, 0.92));
                mix-blend-mode: multiply; transition: opacity 600ms linear;
            }

            /* ── WEATHER ──────────────────────────────────────────────────────────────────────────────── */
            .iw-amb { position: absolute; inset: 0; z-index: 3; pointer-events: none; overflow: hidden; }
            .iw-mote { position: absolute; display: block; border-radius: 50%; will-change: transform; }
            /* ⚠️ WEATHER, NOT DUST ON THE LENS. The first pass was 34 hard white 5px dots at full opacity
               scattered evenly over the whole frame, which reads as a dirty screen rather than as snow —
               obvious in one shot and invisible in the code. Small, soft, semi-transparent, and the scatter
               puts them in the upper air rather than across the walker's face. */
            .iw-mote.is-ember { width: 4px; height: 4px; background: rgba(255, 178, 87, 0.9);
                box-shadow: 0 0 7px 2px rgba(255, 140, 40, 0.5); animation: iw-rise linear infinite; }
            .iw-mote.is-snow { width: 3px; height: 3px; background: rgba(255, 255, 255, 0.55);
                filter: blur(0.4px); animation: iw-fall linear infinite; }
            .iw-mote.is-spore { width: 4px; height: 4px; background: rgba(214, 255, 190, 0.4);
                box-shadow: 0 0 6px 2px rgba(150, 220, 130, 0.22); animation: iw-drift linear infinite; }
            .iw-mote.is-mote { width: 3px; height: 3px; background: rgba(206, 226, 240, 0.34);
                animation: iw-drift linear infinite; }
            .iw-mote.is-gull { width: 13px; height: 4px; border-radius: 0;
                background: radial-gradient(circle at 50% 120%, transparent 58%, rgba(20, 30, 40, 0.75) 60%);
                animation: iw-glide linear infinite; }
            @keyframes iw-rise { from { transform: translate3d(0, 20vh, 0) scale(1); opacity: 0; }
                14% { opacity: 1; } to { transform: translate3d(34px, -80vh, 0) scale(0.4); opacity: 0; } }
            @keyframes iw-fall { from { transform: translate3d(0, -12vh, 0); }
                to { transform: translate3d(-46px, 88vh, 0); } }
            @keyframes iw-drift { from { transform: translate3d(-8vw, 0, 0); opacity: 0; }
                20%, 80% { opacity: 1; } to { transform: translate3d(108vw, -30px, 0); opacity: 0; } }
            @keyframes iw-glide { from { transform: translate3d(-14vw, 0, 0); }
                50% { transform: translate3d(50vw, -22px, 0); } to { transform: translate3d(114vw, 0, 0); } }

            /* ── THE HUD ──────────────────────────────────────────────────────────────────────────────── */
            /* ⚠️ THE HUD STOPS SPREADING. The island's name is flex:1, so on a 2560 screen it grew to 2272px and
               flung the purse, the tide and the leave button to the far corner — at low tide the red warning
               sat seventeen hundred pixels from the walker it was about to strand. It is a strip with a
               maximum now, centred, like every other piece of chrome in the game.
               ⚠️ AND ITS CURSOR IS NOT THE WALK CURSOR. It inherits crosshair from the stage while its own
               pointerdown calls stopPropagation — a 2560x66 band advertising "walk here" and swallowing the
               press. */
            .iw-hud {
                position: absolute; left: 50%; transform: translateX(-50%); top: 0; z-index: 120;
                width: 100%; max-width: 1100px;
                display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
                padding: calc(10px + env(safe-area-inset-top)) 12px 26px;
                background: linear-gradient(180deg, rgba(6, 10, 15, 0.82), transparent);
                pointer-events: auto; cursor: default;
            }
            /* ⚠️ A FLOOR UNDER THE NAME. A min-width of zero lets an island called The Overgrown Charter be
               squeezed down to "R_" by whatever the chips beside it happen to be that frame — which is
               exactly what a 20-character tide number did. The chips are the ones that give way now. */
            /* ⚠️ THE NAME GETS ITS OWN LINE ON A PHONE, AND THAT FIXES TWO THINGS AT ONCE.
               One row could not hold it: with the name floored at 6.5rem and both chips refusing to shrink,
               the thing that fell off the end was "To the boat" — 9px past the right edge of a 360px screen,
               inside an overflow:hidden stage, which is to say the only way off the island was unreachable.
               (A five-digit purse pushed it 17px over; six digits, 24px.) And on the rows where it did fit,
               "The Overgrown Charter" needed 160px and got 91, so it rendered as "The Overgr…".
               Wrapping gives the name the full width and leaves the chips and the exit a row of their own,
               where none of them has to give way to any of the others. */
            .iw-name { font-weight: 800; color: #f2e4c6; font-size: 1rem; flex: 1 1 100%; min-width: 0;
                overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
                text-shadow: 0 2px 6px rgba(0, 0, 0, 0.8); }
            @media (min-width: 430px) { .iw-name { flex: 1 1 auto; } }
            .iw-chip { position: relative; display: inline-flex; align-items: center; gap: 5px;
                padding: 4px 10px; border-radius: 999px; flex: 0 0 auto;
                background: rgba(0, 0, 0, 0.5); color: #e9dcbb; font-size: 0.82rem; font-weight: 700;
                border: 1px solid rgba(255, 255, 255, 0.12); }
            .iw-chip i { font-style: normal; font-weight: 600; opacity: 0.7; font-size: 0.72rem; }
            .iw-chip.is-low { color: #ffb4a0; border-color: rgba(255, 120, 90, 0.55); }
            .iw-chipico { width: 16px; height: 16px; object-fit: contain; display: block;
                filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6)); }
            /* ⚠️ THE ANSWER TO A WALK THE TIDE CANNOT PAY FOR. It used to be nothing at all. */
            .iw-chip.is-bumped { animation: iw-bump 460ms ease-out; }
            @keyframes iw-bump {
                0% { transform: scale(1); }
                30% { transform: scale(1.18); border-color: #ff8a6a; }
                100% { transform: scale(1); }
            }
            .iw-tidebar { position: absolute; left: 10px; right: 10px; bottom: 2px; height: 2px;
                border-radius: 2px; background: rgba(255, 255, 255, 0.16); overflow: hidden; }
            .iw-tidebar span { display: block; height: 100%; background: #e8c069; transition: width 220ms linear; }
            .iw-chip.is-low .iw-tidebar span { background: #ff7a5a; }

            /* 40px minimum, because this is the only way off the island and it was 26px tall sitting 11px
               from the top edge, where a phone's own gesture bar lives. */
            .iw-leave { flex: 0 0 auto; margin-left: auto; padding: 10px 14px; min-height: 40px;
                border-radius: 999px; cursor: pointer;
                border: 1px solid rgba(255, 255, 255, 0.16); background: rgba(0, 0, 0, 0.5);
                color: #e9dcbb; font-size: 0.82rem; font-weight: 700; }
            .iw-leave:disabled { opacity: 0.6; cursor: default; }

            /* ── THE BEARING ──────────────────────────────────────────────────────────────────────────── */
            .iw-bearing {
                position: absolute; right: 10px; top: 32%; z-index: 110;
                display: flex; align-items: center; gap: 7px; padding: 6px 12px 6px 8px;
                border-radius: 999px; pointer-events: none;
                background: rgba(10, 14, 20, 0.7); border: 1px solid rgba(232, 192, 105, 0.4);
                box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
                animation: iw-bear 2.6s ease-in-out infinite;
            }
            .iw-bearing.is-left { right: auto; left: 10px; flex-direction: row-reverse; padding: 6px 8px 6px 12px; }
            @keyframes iw-bear {
                0%, 100% { transform: translateX(0); }
                50% { transform: translateX(5px); }
            }
            .iw-bearing.is-left { animation-name: iw-bear-l; }
            @keyframes iw-bear-l {
                0%, 100% { transform: translateX(0); }
                50% { transform: translateX(-5px); }
            }
            .iw-bearrow { width: 0; height: 0; flex: 0 0 auto;
                border-top: 7px solid transparent; border-bottom: 7px solid transparent;
                border-left: 10px solid #e8c069; }
            .iw-bearing.is-left .iw-bearrow { border-left: 0; border-right: 10px solid #e8c069; }
            .iw-bearart { width: 30px; height: 30px; object-fit: contain; display: block; }
            .iw-bear-text { display: flex; flex-direction: column; line-height: 1.2; }
            .iw-bear-text b { color: #f2e4c6; font-size: 0.98rem; }
            /* 0.64rem is 8.96px, and a 1.05 line-height on the parent was clipping the descenders off it. */
            .iw-bear-text i { font-style: normal; color: #b9a986; font-size: 0.72rem; line-height: 1.35;
                white-space: nowrap; }

            /* ── THE REST ─────────────────────────────────────────────────────────────────────────────── */
            .iw-flash { position: absolute; left: 0; right: 0; top: 24%; z-index: 130;
                display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; padding: 0 16px; }
            .iw-got { padding: 5px 12px; border-radius: 999px; font-size: 0.86rem; font-weight: 800;
                color: #2a1c06; background: linear-gradient(180deg, #f0cb79, #d5a445);
                box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5);
                animation: iw-got 420ms cubic-bezier(.2, 1.4, .5, 1); }
            @keyframes iw-got { from { transform: translateY(12px) scale(0.85); opacity: 0; } }

            .iw-tideout, .iw-hint {
                position: absolute; left: 0; right: 0; z-index: 115; margin: 0; text-align: center;
                bottom: calc(18px + env(safe-area-inset-bottom)); pointer-events: none;
                text-shadow: 0 2px 8px rgba(0, 0, 0, 0.9);
            }
            .iw-tideout { color: #ffb4a0; font-size: 0.92rem; font-weight: 800; }
            .iw-hint { color: rgba(240, 223, 182, 0.72); font-size: 0.82rem; font-weight: 600;
                animation: iw-hint 2.4s ease-in-out infinite; }
            @keyframes iw-hint { 0%, 100% { opacity: 0.45; } 50% { opacity: 0.95; } }
        `}</style>
    );
}
