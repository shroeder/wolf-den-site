"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Haptic } from "@/components/arena/arena-audio.js";
import { GROVE_MINI_CSS } from "@/components/grove/grove-mini-css.js";

// ── THE TEN ─────────────────────────────────────────────────────────────────────────────────────────────────
// The playable half of grove-minigames.js, which holds what each one IS. Every component here obeys the same
// contract and nothing else:
//
//     <Game game={spec} onDone={(score) => …} />     score is 0..1, reported exactly once
//
// ⚠️ ONE CONTRACT, TEN GAMES, AND THE RUNNER KNOWS NOTHING ELSE. The act draws three and renders them in
// turn; it cannot ask what a game is or how it was played. That is what makes the pool extensible — an
// eleventh game is a row in the registry and a component here, and the act, the server and the economy are
// all untouched.
//
// ⚠️ EVERY GAME REPORTS EXACTLY ONCE, EVEN IF IT IS NEVER PLAYED. A phase whose clock runs out with no input
// still calls onDone(0) — see useMini. A game that can finish without reporting would hang the whole craft on
// a screen with no way forward, which is a worse bug than any score.

// ── THE SHARED HARNESS ──────────────────────────────────────────────────────────────────────────────────────
/**
 * The clock every phase runs on.
 *
 * ⚠️ ELAPSED IS READ FROM THE CLOCK, NEVER COUNTED IN TICKS, and the first frame is clamped at zero — a
 * backgrounded tab leaves rAF unscheduled and the first frame back can predate the start. See
 * [[negative-dt-first-frame]], which dropped every body in the Grove through the floor for a day.
 *
 * ⚠️ AND `done` IS LATCHED IN A REF, NOT IN STATE. Two taps in the same frame both see the old state and both
 * report, and the act would take the second as the NEXT phase's score.
 */
function useMini(ms, onDone) {
    const [t, setT] = useState(0);              // 0..1 through the phase
    const done = useRef(false);
    const raf = useRef(0);
    const started = useRef(0);

    const finish = useCallback((score) => {
        if (done.current) return;
        done.current = true;
        cancelAnimationFrame(raf.current);
        onDone(Math.max(0, Math.min(1, Number(score) || 0)));
    }, [onDone]);

    useEffect(() => {
        started.current = performance.now();
        const tick = () => {
            const p = Math.min(1, Math.max(0, performance.now() - started.current) / ms);
            setT(p);
            if (p >= 1) { finish(0); return; }        // ran out: see the note above
            raf.current = requestAnimationFrame(tick);
        };
        raf.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf.current);
        // finish is stable; ms never changes for a mounted phase.
    }, [ms, finish]);

    return { t, finish, over: done };
}

/** Pointer position inside an element, 0..1 on both axes. Clamped, so a drag off the edge pins rather than flies. */
const inBox = (el, e) => {
    const b = el?.getBoundingClientRect();
    if (!b || !b.width || !b.height) return { x: 0.5, y: 0.5 };
    return {
        x: Math.max(0, Math.min(1, (e.clientX - b.left) / b.width)),
        y: Math.max(0, Math.min(1, (e.clientY - b.top) / b.height)),
    };
};

/** Shell every game sits in, so the frame, the clock rail and the title are written once. */
function Stage({ game, t, children, hint }) {
    return (
        <div className="gm" style={{ "--tint": game.tint }}>
            {/* ── ⚠️ THE STYLESHEET TRAVELS WITH THE GAME ─────────────────────────────────────────────
                First attempt put this in GroveClient beside GROVE_CSS, on the reasoning that the act has
                always inherited its styles from there. It does — but the copy of that style tag I found
                lives inside the ZONE branch, which is not rendered while you are standing at the hub
                bench, so a craft started from the workbench got no mini styles at all. The first photo of
                the wired act showed The Inlay as an unstyled SVG: a filled black sine wave the height of
                the forge, no card, no channel.

                A game carrying its own CSS cannot be mounted without it. Duplicate tags are deduplicated
                by the browser and cost nothing. */}
            <style>{GROVE_MINI_CSS}</style>
            <div className="gm-head">
                <b>{game.name}</b>
                {hint ? <i>{hint}</i> : null}
            </div>
            <div className="gm-body">{children}</div>
            {/* The phase clock. Drains left to right; the only thing on screen common to all ten. */}
            <span className="gm-clock"><i style={{ width: `${(1 - t) * 100}%` }} /></span>
        </div>
    );
}

// ── 1. THE BELLOWS — tap-fast ───────────────────────────────────────────────────────────────────────────────
const TAP_TARGET = 18;
function Bellows({ game, onDone }) {
    const { t, finish } = useMini(game.ms, onDone);
    const [taps, setTaps] = useState(0);
    const [pump, setPump] = useState(0);
    const n = useRef(0);
    // ⚠️ THE CLOCK IS NOT RESTARTED BY A TAP. This is the whole of the bug Luke reported on the old
    // bellows — "you can just tap forever, it resets the timer" — and useMini makes it structurally
    // impossible now: the clock belongs to the harness and a game can only ever read it.
    useEffect(() => { if (t >= 1) finish(n.current / TAP_TARGET); }, [t, finish]);
    const hit = () => { n.current += 1; setTaps(n.current); setPump((p) => p + 1); Haptic.fire([0, 8]); };
    const heat = Math.min(1, taps / TAP_TARGET);
    return (
        <Stage game={game} t={t}>
            <div className="gm-bellows">
                <div className="gm-gauge"><i style={{ width: `${heat * 100}%` }} /><em>{taps}/{TAP_TARGET}</em></div>
                <button type="button" className="gm-big" onPointerDown={hit}>PUMP</button>
                {pump > 0 ? (
                    <span key={pump} className="gm-sparks" style={{ "--hot": heat.toFixed(3) }}>
                        {Array.from({ length: 9 }, (_, i) => (
                            <i key={i} style={{ "--a": `${-90 + (i - 4) * 13}deg`, "--d": `${34 + ((pump * 13 + i * 17) % 26)}px` }} />
                        ))}
                    </span>
                ) : null}
            </div>
        </Stage>
    );
}

// ── 2. THE ANVIL — timed-stop ───────────────────────────────────────────────────────────────────────────────
const SWINGS = 3;
function Anvil({ game, onDone }) {
    const { t, finish } = useMini(game.ms, onDone);
    const [hits, setHits] = useState([]);
    const [flash, setFlash] = useState(0);
    const hitsRef = useRef([]);
    // A triangle wave: the marker sweeps out and back, so the bright middle is crossed twice a lap.
    const phase = (t * SWINGS * 2) % 2;
    const pos = phase < 1 ? phase : 2 - phase;
    useEffect(() => { if (t >= 1) finish(avg(hitsRef.current)); }, [t, finish]);
    const strike = () => {
        if (hitsRef.current.length >= SWINGS) return;
        const off = Math.abs(pos - 0.5) * 2;                 // 0 dead centre, 1 at an edge
        const score = off < 0.12 ? 1 : off < 0.4 ? 1 - (off - 0.12) * 1.6 : Math.max(0, 0.4 - off * 0.3);
        hitsRef.current = [...hitsRef.current, score];
        setHits(hitsRef.current);
        setFlash((f) => f + 1);
        Haptic.fire(score > 0.9 ? [0, 18, 30, 44] : [0, 26]);
        if (hitsRef.current.length >= SWINGS) finish(avg(hitsRef.current));
    };
    return (
        <Stage game={game} t={t} hint={`${SWINGS - hits.length} left`}>
            <div className="gm-anvil">
                <div className="gm-track">
                    <span className="gm-zone" /><span className="gm-core" />
                    <span className="gm-mark" style={{ left: `${pos * 100}%` }} />
                </div>
                <button type="button" className="gm-big" onPointerDown={strike}>STRIKE</button>
                {flash ? <span key={flash} className="gm-ring" aria-hidden="true" /> : null}
                <ul className="gm-pips">{Array.from({ length: SWINGS }, (_, i) => (
                    <li key={i} className={hits[i] == null ? "" : hits[i] > 0.9 ? "is-perfect" : hits[i] > 0.4 ? "is-ok" : "is-miss"} />
                ))}</ul>
            </div>
        </Stage>
    );
}
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

// ── 3. THE QUENCH — precision-window ────────────────────────────────────────────────────────────────────────
function Quench({ game, onDone }) {
    const { t, finish } = useMini(game.ms, onDone);
    // The needle falls the whole height over the phase; the band sits two thirds down, so waiting is
    // required and overshooting is the common mistake rather than the rare one.
    const BAND = 0.66, HALF = 0.075;
    const y = t;
    useEffect(() => { if (t >= 1) finish(0); }, [t, finish]);
    const tap = () => {
        const off = Math.abs(y - BAND);
        Haptic.fire(off < HALF ? [0, 18, 30, 44] : [0, 60]);
        finish(off < HALF ? 1 - (off / HALF) * 0.25 : Math.max(0, 0.55 - off * 2.2));
    };
    return (
        <Stage game={game} t={t}>
            <button type="button" className="gm-quench" onPointerDown={tap}>
                <span className="gm-col">
                    <i className="gm-band" style={{ top: `${(BAND - HALF) * 100}%`, height: `${HALF * 200}%` }} />
                    {/* The steel cools as it falls — the colour IS the clock, so the band is reachable by eye. */}
                    <i className="gm-steel" style={{ top: `${y * 100}%`, "--c": `hsl(${44 - t * 44} 100% ${78 - t * 34}%)` }} />
                </span>
            </button>
        </Stage>
    );
}

// ── 4. THE DRAW — hold-release ──────────────────────────────────────────────────────────────────────────────
function Draw({ game, onDone }) {
    const { t, finish } = useMini(game.ms, onDone);
    const [held, setHeld] = useState(0);
    const holding = useRef(false);
    const raf = useRef(0);
    const SNAP = 0.88;                                   // past here it tears
    useEffect(() => { if (t >= 1) finish(holding.current ? 0 : held); }, [t, finish, held]);
    const grow = useCallback(() => {
        if (!holding.current) return;
        setHeld((h) => {
            const next = h + 0.012;
            // ⚠️ THE BUST IS CHECKED HERE, NOT ON RELEASE. Holding through the line has to end the phase by
            // itself — if it only failed on release, the safest play would be to hold forever and let the
            // clock run out, which is the opposite of the decision this game is about.
            if (next >= 1) { Haptic.fire([0, 120]); finish(0.05); return 1; }
            return next;
        });
        raf.current = requestAnimationFrame(grow);
    }, [finish]);
    const down = () => { holding.current = true; raf.current = requestAnimationFrame(grow); };
    const up = () => {
        if (!holding.current) return;
        holding.current = false;
        cancelAnimationFrame(raf.current);
        Haptic.fire([0, 24]);
        // Closer to the line is better, and the line itself is the best place to stop.
        finish(held >= SNAP ? 1 : held / SNAP * 0.92);
    };
    return (
        <Stage game={game} t={t}>
            <button type="button" className={`gm-draw${held >= SNAP ? " is-hot" : ""}`}
                onPointerDown={down} onPointerUp={up} onPointerLeave={up} onPointerCancel={up}>
                <span className="gm-bar">
                    <i style={{ width: `${held * 100}%` }} />
                    <em style={{ left: `${SNAP * 100}%` }} />
                </span>
                <b>{held >= 1 ? "SNAPPED" : "HOLD"}</b>
            </button>
        </Stage>
    );
}

// ── 5. THE FOLD — rhythm-alternate ──────────────────────────────────────────────────────────────────────────
function Fold({ game, onDone }) {
    const { t, finish } = useMini(game.ms, onDone);
    const BEAT = 460;
    const beats = Math.max(1, Math.floor(game.ms / BEAT));
    const [got, setGot] = useState([]);
    const gotRef = useRef([]);
    const lastBeat = useRef(-1);
    const idx = Math.min(beats - 1, Math.floor((t * game.ms) / BEAT));
    const want = idx % 2 === 0 ? "l" : "r";               // the lit side this beat
    const sinceBeat = ((t * game.ms) % BEAT) / BEAT;      // 0 at the beat, 1 just before the next
    useEffect(() => { if (t >= 1) finish(gotRef.current.length / beats); }, [t, finish, beats]);
    const press = (side) => {
        if (lastBeat.current === idx) return;             // one press per beat, so mashing earns nothing
        lastBeat.current = idx;
        // On the beat is generous at the start of it and worthless by the end — that is what makes it rhythm
        // rather than alternation.
        if (side !== want || sinceBeat > 0.62) { Haptic.fire([0, 60]); return; }
        gotRef.current = [...gotRef.current, idx];
        setGot(gotRef.current);
        Haptic.fire([0, 16]);
    };
    return (
        <Stage game={game} t={t} hint={`${got.length}/${beats}`}>
            <div className="gm-fold">
                {["l", "r"].map((side) => (
                    <button key={side} type="button"
                        className={`gm-plate${want === side ? " is-on" : ""}`}
                        style={{ "--beat": (1 - Math.min(1, sinceBeat)).toFixed(3) }}
                        onPointerDown={() => press(side)} aria-label={side === "l" ? "Left" : "Right"} />
                ))}
            </div>
        </Stage>
    );
}

// ── 6. THE GRIND — speed-drag ───────────────────────────────────────────────────────────────────────────────
function Grind({ game, onDone }) {
    const { t, finish } = useMini(game.ms, onDone);
    const box = useRef(null);
    const last = useRef(null);
    const good = useRef(0);
    const total = useRef(0);
    const [spd, setSpd] = useState(0);
    const TARGET = 0.9;                                   // screens per second, roughly a steady sweep
    useEffect(() => { if (t >= 1) finish(total.current > 6 ? good.current / total.current : 0); }, [t, finish]);
    const move = (e) => {
        const p = inBox(box.current, e);
        const now = performance.now();
        if (last.current) {
            const dt = Math.max(8, now - last.current.at) / 1000;
            const v = Math.abs(p.x - last.current.x) / dt;
            setSpd(v);
            total.current += 1;
            // A band rather than a point: this is a speed to HOLD, and a knife-edge target would be
            // unplayable with a thumb on glass.
            if (v > TARGET * 0.45 && v < TARGET * 1.75) good.current += 1;
        }
        last.current = { x: p.x, at: now };
    };
    const err = Math.min(1, Math.abs(spd - TARGET) / TARGET);
    return (
        <Stage game={game} t={t}>
            <div ref={box} className="gm-grind" onPointerMove={(e) => e.buttons || e.pointerType !== "mouse" ? move(e) : null}
                onPointerDown={move} style={{ "--err": err.toFixed(3) }}>
                <span className="gm-edge" />
                {/* Sparks fatten with the error, so the picture is the score. */}
                <span className="gm-grit" aria-hidden="true">
                    {Array.from({ length: 7 }, (_, i) => <i key={i} style={{ "--i": i }} />)}
                </span>
            </div>
        </Stage>
    );
}

// ── 7. THE TEMPER — spin-stop ───────────────────────────────────────────────────────────────────────────────
function Temper({ game, onDone }) {
    const { t, finish } = useMini(game.ms, onDone);
    // Accelerates, so hanging on for a cleaner pass costs something.
    const turns = 2.2 + t * 2.6;
    const deg = (t * turns * 360) % 360;
    useEffect(() => { if (t >= 1) finish(0); }, [t, finish]);
    const stop = () => {
        const off = Math.min(deg, 360 - deg) / 180;       // 0 on the mark, 1 opposite it
        Haptic.fire(off < 0.06 ? [0, 18, 30, 44] : [0, 40]);
        finish(off < 0.06 ? 1 : Math.max(0, 1 - off * 2.3));
    };
    return (
        <Stage game={game} t={t}>
            <button type="button" className="gm-temper" onPointerDown={stop}>
                <span className="gm-dial" style={{ "--deg": `${deg}deg` }}>
                    <i className="gm-notch" />
                </span>
                <span className="gm-mark-top" aria-hidden="true" />
            </button>
        </Stage>
    );
}

// ── 8. THE RIVETS — reaction-sequence ───────────────────────────────────────────────────────────────────────
const RIVETS = 5;
function Rivet({ game, onDone }) {
    const { t, finish } = useMini(game.ms, onDone);
    const [i, setI] = useState(0);
    const [born, setBorn] = useState(() => performance.now());
    const scores = useRef([]);
    const LIFE = 620;
    // Deterministic per index so the same craft cannot be re-rolled by remounting.
    const spot = useMemo(() => ({
        x: 14 + ((i * 53) % 72), y: 16 + ((i * 29) % 64),
    }), [i]);
    const age = Math.min(1, (performance.now() - born) / LIFE);
    useEffect(() => { if (t >= 1) finish(scores.current.reduce((a, b) => a + b, 0) / RIVETS); }, [t, finish]);
    useEffect(() => {
        const to = setTimeout(() => {
            scores.current.push(0);
            if (scores.current.length >= RIVETS) finish(scores.current.reduce((a, b) => a + b, 0) / RIVETS);
            else { setI((n) => n + 1); setBorn(performance.now()); }
        }, LIFE);
        return () => clearTimeout(to);
    }, [i, born, finish]);
    const tap = () => {
        const a = Math.min(1, (performance.now() - born) / LIFE);
        scores.current.push(Math.max(0.2, 1 - a));        // sooner is better; late but hit still counts
        Haptic.fire([0, 14]);
        if (scores.current.length >= RIVETS) finish(scores.current.reduce((x, y) => x + y, 0) / RIVETS);
        else { setI((n) => n + 1); setBorn(performance.now()); }
    };
    return (
        <Stage game={game} t={t} hint={`${scores.current.length}/${RIVETS}`}>
            <div className="gm-rivets">
                <button type="button" className="gm-rivet" onPointerDown={tap}
                    style={{ left: `${spot.x}%`, top: `${spot.y}%`, "--age": age.toFixed(3) }}
                    aria-label="Rivet" />
            </div>
        </Stage>
    );
}

// ── 9. THE POLISH — coverage-scrub ──────────────────────────────────────────────────────────────────────────
const CELLS = 24;                                        // 6 x 4
function Polish({ game, onDone }) {
    const { t, finish } = useMini(game.ms, onDone);
    const box = useRef(null);
    const [lit, setLit] = useState(() => new Set());
    const litRef = useRef(new Set());
    useEffect(() => { if (t >= 1) finish(litRef.current.size / CELLS); }, [t, finish]);
    const rub = (e) => {
        const p = inBox(box.current, e);
        const c = Math.min(5, Math.floor(p.x * 6)) + Math.min(3, Math.floor(p.y * 4)) * 6;
        if (litRef.current.has(c)) return;               // scrubbing one spot forever earns nothing
        litRef.current = new Set(litRef.current).add(c);
        setLit(litRef.current);
        Haptic.fire([0, 6]);
        if (litRef.current.size >= CELLS) finish(1);
    };
    return (
        <Stage game={game} t={t} hint={`${lit.size}/${CELLS}`}>
            <div ref={box} className="gm-polish"
                onPointerDown={rub}
                onPointerMove={(e) => (e.buttons || e.pointerType !== "mouse") && rub(e)}>
                {Array.from({ length: CELLS }, (_, c) => (
                    <i key={c} className={lit.has(c) ? "is-lit" : ""} />
                ))}
            </div>
        </Stage>
    );
}

// ── 10. THE INLAY — path-trace ──────────────────────────────────────────────────────────────────────────────
function Inlay({ game, onDone }) {
    const { t, finish } = useMini(game.ms, onDone);
    const box = useRef(null);
    const [at, setAt] = useState(0);                      // how far along the channel, 0..1
    const atRef = useRef(0);
    const strayRef = useRef(0);
    // A sine channel across the frame — one curve, legible at a glance, and the y at any x is arithmetic
    // rather than a path lookup.
    const yAt = (x) => 0.5 + Math.sin(x * Math.PI * 2) * 0.26;
    useEffect(() => { if (t >= 1) finish(Math.max(0, atRef.current - strayRef.current * 0.04)); }, [t, finish]);
    const move = (e) => {
        const p = inBox(box.current, e);
        const off = Math.abs(p.y - yAt(p.x));
        if (off > 0.11) { strayRef.current += 1; return; }    // out of the channel: no progress, a small cost
        if (p.x > atRef.current) {
            atRef.current = p.x;
            setAt(p.x);
            if (p.x > 0.985) { Haptic.fire([0, 18, 30, 44]); finish(Math.max(0, 1 - strayRef.current * 0.04)); }
        }
    };
    const pts = useMemo(() => Array.from({ length: 41 }, (_, i) => {
        const x = i / 40;
        return `${x * 100},${yAt(x) * 100}`;
    }).join(" "), []);
    return (
        <Stage game={game} t={t} hint={`${Math.round(at * 100)}%`}>
            <div ref={box} className="gm-inlay"
                onPointerDown={move}
                onPointerMove={(e) => (e.buttons || e.pointerType !== "mouse") && move(e)}>
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                    <polyline className="gm-chan" points={pts} />
                    <polyline className="gm-gold" points={pts} style={{ strokeDasharray: 400, strokeDashoffset: 400 - at * 400 }} />
                </svg>
                <span className="gm-bead" style={{ left: `${at * 100}%`, top: `${yAt(at) * 100}%` }} />
            </div>
        </Stage>
    );
}

// ⚠️ KEYED BY THE REGISTRY'S id. A game in grove-minigames.js with no component here would render nothing and
// hang the craft, so check-minigames.mjs asserts the two tables agree.
export const MINI_COMPONENTS = {
    bellows: Bellows, anvil: Anvil, quench: Quench, draw: Draw, fold: Fold,
    grind: Grind, temper: Temper, rivet: Rivet, polish: Polish, inlay: Inlay,
};

export default function GroveMini({ game, onDone }) {
    const C = MINI_COMPONENTS[game?.id];
    // ⚠️ NEVER RENDER NOTHING. A missing component has to still report, or the craft stops on a blank panel
    // with no button and the only way out is reloading the page.
    useEffect(() => { if (game && !MINI_COMPONENTS[game.id]) onDone(0); }, [game, onDone]);
    if (!C) return null;
    return <C game={game} onDone={onDone} />;
}
