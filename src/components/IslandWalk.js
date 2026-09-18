"use client";

// ── ASHORE ───────────────────────────────────────────────────────────────────────────────────────────────────
// Luke: "the idea of our boat landing ashore and being able to walk on unique islands."
//
// A side-on strip you walk along. Tap something up ahead and you walk to it and take it; the camera follows;
// the tide runs down a step at a time and when it is out the boat has to go.
//
// ⚠️ THE WALK IS A rAF LOOP, NOT A CSS TRANSITION — the same call ForestClient made next door, for the same
// reason: the walk has to be INSPECTABLE every frame, because arriving somewhere is what triggers taking the
// thing there. A transition cannot be asked where it currently is without reading layout back every frame.
//
// ⚠️ AND THE BROWSER OWNS THE WALK. Nothing here posts per footfall — see island-world.js. One request when
// something is picked up, carrying where we are standing and what it cost, and the server regenerates the
// island to check the claim. A request per step is the most expensive shape in this codebase (CLAUDE.md).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// ⚠️ PAINTED ART, NOT GLYPHS. Everything on this screen is drawn — the props, the prize, the walker, the
// island behind them — so a line-art icon standing in the same row reads as something nobody finished. The
// purse is the doubloon the whole game already pays in, the tide is an hourglass drawn for it, and the boat
// is the member's OWN hull, one of eleven forms, handed down from the server.
const DOUBLOON = "/images/sailing/doubloon.png";
const TIDEGLASS = "/images/islands/chrome/tideglass.png";

// ⚠️ VERSIONED. Every one of these will be redrawn at least once and static art is served with max-age=86400,
// so anybody who has opened an island keeps the old picture for a day unless this moves. Bump it on any
// redraw. See [[redrawn-art-must-be-versioned]].
// ⚠️ BUMPED because every backdrop was rewritten in place to mirror-tile it (same path, new bytes). Static
// art is served with max-age=86400, so without this anybody who had already opened an island would keep the
// seamed picture for a day. See [[redrawn-art-must-be-versioned]].
const ART_V = "2";
const v = (p) => (p ? `${p}${p.includes("?") ? "&" : "?"}v=${ART_V}` : null);

// How near, in nodes, you have to be for a thing to be in reach. One, because a strip of nodes is not a room:
// standing next to something and not being able to touch it reads as a bug.
const REACH = 0.35;

export default function IslandWalk({ view, hero, boat, busy, onTake, onLeave }) {
    const isle = view?.island || {};
    const ashore = view?.ashore || {};
    const nodes = useMemo(() => ashore.nodes || [], [ashore.nodes]);
    const gap = Number(ashore.gap) || 190;
    const stepMs = Number(ashore.stepMs) || 850;

    // Where the walker actually is, in NODE units, owned as a number rather than by the DOM.
    const posRef = useRef(Number(ashore.at) || 0);
    const [pos, setPos] = useState(Number(ashore.at) || 0);
    const targetRef = useRef(null);
    const [facing, setFacing] = useState(1);
    const rafRef = useRef(0);
    const lastRef = useRef(0);
    // Steps spent, tracked as total absolute distance walked. The server takes the GREATEST of what it has and
    // what we send, and independently checks it is at least the straight-line distance from the beach — so
    // this can only ever cost us, never cheat. See reachable() in island-world.js.
    const spentRef = useRef(Number(ashore.spent) || 0);
    const [spent, setSpent] = useState(Number(ashore.spent) || 0);
    const takingRef = useRef(false);
    const [flash, setFlash] = useState(null);

    const tide = Number(ashore.tide) || 0;
    const left = Math.max(0, tide - spent);
    const out = left <= 0;

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
            if (res?.took?.reward?.length) setFlash({ i, reward: res.took.reward });
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
            if (target == null) return;

            const cur = posRef.current;
            const dir = Math.sign(target - cur);
            if (dir === 0 || Math.abs(target - cur) < 0.02) {
                posRef.current = target; setPos(target); targetRef.current = null;
                arrive(Math.round(target));
                return;
            }
            // Nodes per millisecond. One node takes stepMs.
            const move = Math.min(Math.abs(target - cur), (dt / stepMs));
            const next = cur + move * dir;
            // The tide is spent as you walk, not when you arrive — stopping halfway still cost you the walking.
            spentRef.current += move;
            posRef.current = next;
            setPos(next);
            setSpent(spentRef.current);
            // Out of tide mid-stride: stop where you stand.
            if (spentRef.current >= tide) targetRef.current = null;
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafRef.current);
    }, [arrive, stepMs, tide]);

    const walkTo = (i) => {
        if (out || busy) return;
        // Never set off on a walk the tide cannot pay for — a walker who stops two nodes short of the thing
        // they aimed at has been shown a promise and then had it taken away mid-stride.
        const cost = Math.abs(i - posRef.current);
        if (spentRef.current + cost > tide) return;
        setFacing(i >= posRef.current ? 1 : -1);
        targetRef.current = i;
    };

    // The camera. The walker sits at 38% of the viewport so there is more island ahead than behind.
    const [vw, setVw] = useState(360);
    useEffect(() => {
        const read = () => setVw(Math.min(620, window.innerWidth));
        read();
        window.addEventListener("resize", read);
        return () => window.removeEventListener("resize", read);
    }, []);
    // ── ⚠️ THE CAMERA LOOKS TOWARD THE MARK, NOT ALWAYS THE SAME WAY ─────────────────────────────────────
    // A fixed anchor at 38% means you always see more of what is to your RIGHT. Beach at the far end of the
    // island — which is exactly what a wild guess does — and the whole island is behind you, so the first
    // thing a bad plot shows you is an empty screen and a button that says go home. Filmed it, and that is
    // precisely what came back. The anchor flips with the direction the mark lies in, so landfall always
    // opens looking at the island you came for.
    const anchor = (Number(view?.fixIndex) || 0) >= (Number(view?.entry) || 0) ? 0.3 : 0.7;
    const camera = -(pos * gap) + vw * anchor;

    // ── ⚠️ THE BACKDROP HAS TO MOVE, SLOWER, AND WITHOUT BEING STRETCHED ─────────────────────────────────
    // A still backdrop behind a moving strip reads as a painted flat you are sliding a cut-out across — the
    // island stops being a place and becomes wallpaper. So it travels at a fraction of the camera.
    //
    // ⚠️ THE FIRST ATTEMPT STRETCHED ONE PLATE ACROSS THE WHOLE PARALLAX TRAVEL to avoid a tiling seam, and
    // that was far worse than the seam: a 1536x1024 painting pulled to 2677x300 is a SIX-TIMES horizontal
    // stretch, and the headland on Ember Hold came out smeared. Caught by looking at it.
    //
    // So the plate keeps its own aspect — drawn at 150% of the stage height and anchored to the BOTTOM, so
    // the beach and the horizon are what survive the crop — and it repeats. Slow parallax keeps the number of
    // repeats down to one or two across a whole island, which is one seam crossing a hazy distance, not the
    // "repeat bg sucks" wallpaper the Forest had to answer with three separate grove paintings.
    const PARALLAX = 0.14;

    return (
        <div className="iw">
            <div className="iw-bar">
                <span className="iw-name">{isle.name}</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <span className="iw-chip"><img className="iw-chipico" src={v(DOUBLOON)} alt="" draggable="false" />{view?.purse || 0}</span>
                <span className={`iw-chip${left <= 6 ? " is-low" : ""}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="iw-chipico" src={v(TIDEGLASS)} alt="" draggable="false" />{left}
                </span>
            </div>

            <div className="iw-stage" style={{
                backgroundImage: `url(${v(isle.art)})`,
                backgroundSize: "auto 150%",
                backgroundPosition: `${camera * PARALLAX}px bottom`,
                backgroundRepeat: "repeat-x",
            }}>
                <div className="iw-haze" style={{ background: `linear-gradient(180deg, transparent 42%, ${isle.tint || "#7fd6c8"}22 100%)` }} />

                <div className="iw-strip" style={{ transform: `translate3d(${camera}px,0,0)` }}>
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
                                    bottom: `${16 + lane * 46}px`,
                                    transform: `scale(${scale})`,
                                    zIndex: Math.round((1 - lane) * 50) + 5,
                                    opacity: n.taken ? 0.4 : 0.55 + (1 - lane) * 0.45,
                                }}
                                onClick={() => walkTo(n.i)}
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
                    <div className="iw-you" style={{ left: `${pos * gap}px`, transform: `translateX(-50%) scaleX(${facing * (hero?.flip ? -1 : 1)})` }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {hero?.art ? <img className="iw-youart" src={hero.art} alt="" draggable="false" />
                            : <span className="iw-youdot" />}
                    </div>
                </div>

                <div className="iw-ground" />
            </div>

            {flash ? (
                <div className="iw-flash" onClick={() => setFlash(null)}>
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

            <div className="iw-foot">
                {out ? <p className="iw-tideout">The tide is out. The boat cannot wait.</p> : null}
                <button className="iw-leave" disabled={busy} onClick={onLeave}>
                    {out ? "Put to sea" : "Back to the boat"}
                </button>
            </div>

            <style jsx>{`
                .iw { display: flex; flex-direction: column; gap: 8px; }
                .iw-bar { display: flex; align-items: center; gap: 8px; }
                .iw-name { font-weight: 700; color: #f2e4c6; font-size: 0.98rem; flex: 1 1 auto; min-width: 0;
                    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                .iw-chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 9px; border-radius: 999px;
                    background: rgba(0, 0, 0, 0.42); color: #e9dcbb; font-size: 0.8rem; font-weight: 700;
                    border: 1px solid rgba(255, 255, 255, 0.1); }
                .iw-chip.is-low { color: #ffb4a0; border-color: rgba(255, 120, 90, 0.5); }
                .iw-chipico { width: 16px; height: 16px; object-fit: contain; display: block;
                    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6)); }

                .iw-stage {
                    position: relative; width: 100%; height: 340px; border-radius: 12px; overflow: hidden;
                    background-color: #16222b;
                    box-shadow: inset 0 -30px 50px rgba(0, 0, 0, 0.5), 0 6px 22px rgba(0, 0, 0, 0.45);
                    touch-action: pan-y;
                }
                .iw-haze { position: absolute; inset: 0; pointer-events: none; }
                .iw-ground { position: absolute; left: 0; right: 0; bottom: 0; height: 14px;
                    background: linear-gradient(180deg, rgba(0, 0, 0, 0.15), rgba(0, 0, 0, 0.55)); pointer-events: none; }

                .iw-strip { position: absolute; inset: 0; will-change: transform; }

                .iw-node { position: absolute; width: 92px; height: 92px; margin-left: -46px; padding: 0;
                    background: none; border: 0; cursor: pointer; transform-origin: 50% 100%; }
                .iw-node.is-taken { cursor: default; filter: grayscale(0.7); }
                .iw-tile { position: absolute; left: 50%; bottom: 0; width: 54px; height: 18px; margin-left: -27px;
                    border-radius: 50%; background: rgba(0, 0, 0, 0.34); filter: blur(3px); }
                /* A contact shadow, always painted. Without one a sprite reads as pasted onto the picture
                   rather than standing on the ground. See sprite-floats-object-fit-contain. */
                .iw-art { position: absolute; inset: 0; pointer-events: none;
                    background-repeat: no-repeat; background-position: 50% 100%; background-size: contain; }
                .iw-node.is-near .iw-art { filter: drop-shadow(0 0 9px rgba(255, 226, 150, 0.75)); }

                .iw-xmark { position: absolute; left: 50%; top: -8px; width: 20px; height: 20px; margin-left: -10px; }
                .iw-xmark::before, .iw-xmark::after { content: ""; position: absolute; left: 0; top: 9px;
                    width: 20px; height: 3px; border-radius: 2px; background: #d8323c;
                    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.6); }
                .iw-xmark::before { transform: rotate(45deg); }
                .iw-xmark::after { transform: rotate(-45deg); }

                .iw-take { position: absolute; left: 50%; top: -30px; transform: translateX(-50%);
                    padding: 3px 9px; border-radius: 999px; white-space: nowrap;
                    background: rgba(18, 14, 8, 0.9); border: 1px solid rgba(232, 192, 105, 0.55);
                    color: #f0dfb6; font-size: 0.72rem; font-weight: 700; }

                /* ⚠️ BEACHED, AND IT HAS TO FIT ON THE STAGE AT LANDFALL. The camera holds the walker at
                   the anchor fraction of the viewport (0.3 or 0.7, whichever way the mark lies), so the
                   boat's own half-width plus its offset from the walker must stay inside that — 0.28 of a
                   node gap is ~53px, plus 50px of hull, against 112px of room on a 375px phone. The first
                   cut sat it 0.6 of a gap out at 112px wide and the bow was sliced clean off by the stage
                   edge on every landfall. See [[sprite-amputation-vs-clipping]].
                   Set a little higher and a little smaller than the walker so it reads as standing further
                   back at the water's edge, the same depth cue the node lanes use, and BEHIND everything in
                   z-order because you have already stepped off it. */
                .iw-boat { position: absolute; bottom: 26px; margin-left: -50px; z-index: 4; opacity: 0.95; }
                .iw-boattile { position: absolute; left: 50%; bottom: 8px; width: 78px; height: 18px;
                    margin-left: -39px; border-radius: 50%; background: rgba(0, 0, 0, 0.34); filter: blur(4px); }
                .iw-boatimg { position: relative; display: block; width: 100px; height: 100px;
                    object-fit: contain; object-position: 50% 100%;
                    filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.55)); }

                .iw-you { position: absolute; bottom: 14px; z-index: 60; }
                .iw-youart { display: block; width: 86px; height: 86px; object-fit: contain; object-position: 50% 100%;
                    filter: drop-shadow(0 4px 7px rgba(0, 0, 0, 0.65)); }
                .iw-youdot { display: block; width: 18px; height: 30px; border-radius: 9px 9px 5px 5px;
                    background: linear-gradient(180deg, #f0cb79, #b5822f);
                    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.6); }

                .iw-flash { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; }
                .iw-got { padding: 4px 10px; border-radius: 999px; font-size: 0.8rem; font-weight: 700;
                    color: #2a1c06; background: linear-gradient(180deg, #f0cb79, #d5a445); }

                .iw-foot { display: flex; flex-direction: column; gap: 6px; }
                .iw-tideout { margin: 0; text-align: center; color: #ffb4a0; font-size: 0.85rem; font-weight: 700; }
                .iw-leave { width: 100%; padding: 12px 16px; border-radius: 10px; cursor: pointer;
                    border: 1px solid rgba(255, 255, 255, 0.14); background: rgba(0, 0, 0, 0.42);
                    color: #e9dcbb; font-size: 0.95rem; font-weight: 700; }
                .iw-leave:disabled { opacity: 0.6; cursor: default; }

                @media (min-width: 720px) { .iw-stage { height: 420px; } }
            `}</style>
        </div>
    );
}
