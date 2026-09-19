"use client";

// ── THE GLASS ────────────────────────────────────────────────────────────────────────────────────────────────
// Luke, on the chart puzzle that used to be here: *"right now, that makes no sense at all. So that needs a
// complete rework. It needs to make sense, and it has to be fun for the user."*
//
// The old one was trilateration: three translucent bands on paper, find the darkest patch, drop a pin. It was
// not badly built — it was untellable. Nothing on the screen said those bands were DISTANCES, so anyone who
// did not already know what a sounding is saw three smudges and guessed, and a puzzle you can only guess at is
// a dice roll wearing a puzzle's clothes.
//
// So the skill moved from reading an abstraction to doing the thing it stood for. You are at the rail with a
// glass. The captain named three landmarks. Sweep the horizon, find the one he named, and call it when it sits
// under the wire. Three calls is a fix. It needs no explaining because everyone has looked through a tube at a
// distant thing, and it is hand-and-eye rather than reading comprehension.
//
// ⚠️ THE DIFFICULTY IS THE SWELL, NOT THE HIDING. The marks are drawn where they are — you are meant to SEE a
// headland. What makes it a skill is that the glass rides the sea, so the wire drifts across the mark and back
// and the call has to be timed. See the note in expedition-view.js on why sending the positions is safe here
// and was not safe for the old plot: knowing where the fix was WAS solving that one; seeing a cliff is not
// solving this one.
//
// ⚠️ AND THE CHART KNITS AS YOU GO. Luke picked this over either half alone: *"take bearings, then the chart
// draws itself."* Each bearing landed pulls another torn piece into place, so the reward for the navigation is
// watching the thing you are navigating toward assemble itself — and the third piece is the X.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BEARING_WINDOW, GLASS_FOV, GLASS_SWELL, GLASS_SWELL_MS, bearingBand, bearingScore } from "@/lib/marketplace/chart-plot.js";
import { hash } from "@/lib/marketplace/world-hash.js";
import Exp from "@/lib/marketplace/expedition-audio.js";

// The glass's numbers are declared in chart-plot.js, beside the scorer, because the simulator models a hand
// holding this same glass and a second copy of them is a second, wrong game.
const FOV = GLASS_FOV;
const SWELL = GLASS_SWELL;
const SWELL_MS = GLASS_SWELL_MS;
// ⚠️ WHAT "LOCKED" IS WORTH, AND IT IS TUNED AGAINST THE SCORER RATHER THAN BY FEEL. bearingScore falls to
// zero at twice the window, so calling at a fraction f of the window scores 1 - f/2. At 0.85 the bright
// signal was worth 0.58 — which the band words call "Rough, but it will serve", and a screen that lights up
// gold to tell you you did badly is a liar. At 0.6 the worst a locked call can score is 0.7, which is the
// bottom of "A good mark". Measured by playing the one-star glass, which is the tightest window in the game.
const LOCK = 0.6;

// Silhouettes for the horizon. Drawn rather than generated: a headland is a shape, and five shapes read as a
// coastline where one repeated shape reads as wallpaper.
const SHAPES = [
    "M0 30 L14 10 L26 18 L38 4 L52 22 L64 14 L80 30 Z",
    "M0 30 L10 16 L18 20 L30 6 L44 20 L56 12 L70 24 L80 30 Z",
    "M0 30 L12 22 L20 8 L34 18 L46 10 L58 20 L72 16 L80 30 Z",
    "M0 30 L16 26 L24 12 L32 24 L48 8 L60 22 L74 18 L80 30 Z",
    "M0 30 L8 18 L22 24 L36 12 L50 24 L62 8 L76 22 L80 30 Z",
];

export default function Bearings({ view, sky, busy, onCommit }) {
    const marks = useMemo(() => view?.bearings?.marks || [], [view?.bearings?.marks]);
    // ⚠️ NO INVENTED FALLBACK. A hard-coded 0.1 here is a window the server has never heard of — it would
    // draw one band and mark against another. If the server did not send one, the smallest real window is
    // the honest guess, because it is the only one that cannot flatter the player into a worse score.
    const win = Number(view?.bearings?.window) || BEARING_WINDOW[1];
    const seed = Number(view?.seed) || 1;
    const island = view?.island || null;

    const [k, setK] = useState(0);                 // which of the three we are looking for
    const [aim, setAim] = useState(0.5);           // where the glass is pointed, 0..1 of the sweep
    const [taken, setTaken] = useState([]);        // what we called, in order
    const [flash, setFlash] = useState(null);      // the word after a call
    const [sent, setSent] = useState(false);
    const aimRef = useRef(0.5);
    const swellRef = useRef(0);
    const rafRef = useRef(0);
    const wrapRef = useRef(null);
    const dragRef = useRef(null);

    // ── THE SWELL ────────────────────────────────────────────────────────────────────────────────────────
    // A rAF loop rather than a CSS transform, because the value has to be READABLE at the instant of the
    // call — the whole mechanic is "where was the wire when you said now", and a compositor animation cannot
    // be asked where it currently is. Same reason the island walk is a loop.
    const [swell, setSwell] = useState(0);
    useEffect(() => {
        const tick = (t) => {
            rafRef.current = requestAnimationFrame(tick);
            // Two sines at an irrational ratio, so the drift never settles into a countable rhythm you can
            // tap blind. It still has a beat; it just does not have a bar.
            const a = Math.sin((t / SWELL_MS) * Math.PI * 2);
            const b = Math.sin((t / (SWELL_MS * 0.61)) * Math.PI * 2) * 0.45;
            const s = ((a + b) / 1.45) * SWELL;
            swellRef.current = s;
            setSwell(s);
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafRef.current);
    }, []);

    // Where the wire actually is: where you pointed, plus what the sea is doing to you.
    const wire = Math.max(0, Math.min(1, aim + swell));

    // ── POINTING ─────────────────────────────────────────────────────────────────────────────────────────
    // Drag anywhere to sweep. No setPointerCapture — it swallows the click that follows a pointerup on
    // desktop, which is how a draggable marker ends up working with a finger and not with a mouse. See
    // [[pointer-capture-kills-desktop-clicks]].
    const moveTo = useCallback((clientX) => {
        const d = dragRef.current;
        if (!d) return;
        const box = wrapRef.current?.getBoundingClientRect();
        if (!box?.width) return;
        // Dragging RIGHT sweeps the glass right, so the horizon travels left under it — the way it does when
        // you turn your head. The first cut had it inverted and it read as broken rather than as a choice.
        const next = Math.max(0, Math.min(1, d.aim + (d.x - clientX) / box.width * FOV * 1.9));
        aimRef.current = next;
        setAim(next);
    }, []);

    useEffect(() => {
        const move = (e) => { if (dragRef.current) { e.preventDefault(); moveTo(e.clientX); } };
        const up = () => { dragRef.current = null; };
        window.addEventListener("pointermove", move, { passive: false });
        window.addEventListener("pointerup", up);
        window.addEventListener("pointercancel", up);
        return () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
            window.removeEventListener("pointercancel", up);
        };
    }, [moveTo]);

    // ── THE CALL ─────────────────────────────────────────────────────────────────────────────────────────
    const target = marks[k] || null;
    // The wire itself answers, so the "call now" signal is at the thing you are looking at rather than only
    // on a distant hill at the edge of the glass.
    const locked = Boolean(target) && Math.abs(target.at - wire) < win * LOCK;
    const call = useCallback(() => {
        if (!target || sent) return;
        const at = wire;
        // ⚠️ THE SAME FUNCTION THE SERVER MARKS WITH. This was a hand-copied `1 - err / (win * 2)` that
        // happened to agree — until somebody retuned one of them and the glass said DEAD ON while the server
        // paid Rough. chart-plot.js is pure, so there is no reason for a second copy to exist.
        // See [[balance-constants-never-copied]].
        const score = bearingScore(target, at);
        const next = [...taken, at];
        setTaken(next);
        if (score >= 0.4) { Exp.bearingLocked(k); Exp.chartKnit(k); }
        else Exp.bearingMissed();
        setFlash({ k, score });
        if (next.length >= marks.length) {
            // ⚠️ THE LAST CALL COMMITS ITSELF. A "done" button after the third bearing is a button whose only
            // possible answer is yes, and the beat lands harder if the chart simply finishes in front of you.
            setSent(true);
            Exp.chartSolved();
            window.setTimeout(() => onCommit?.(next), 1250);
        } else {
            setK(next.length);
        }
    }, [k, marks.length, onCommit, sent, taken, target, wire]);

    // The horizon: the three real marks plus decoys, so finding the named one is a search. Decoys are derived
    // from the chart's own seed so the same horizon comes back after a reload — a coastline that reshuffles
    // itself between looks is not a place.
    const horizon = useMemo(() => {
        const out = marks.map((m, i) => ({ at: m.at, shape: Math.floor(hash(seed ^ 0x77a1, i) * SHAPES.length), real: i, name: m.mark }));
        for (let i = 0; i < 14; i += 1) {
            const at = hash(seed ^ 0x31c9, i + 40);
            if (marks.some((m) => Math.abs(m.at - at) < 0.07)) continue;   // never hide a real mark behind a decoy
            out.push({ at, shape: Math.floor(hash(seed ^ 0x5b2d, i) * SHAPES.length), real: -1, name: null });
        }
        return out.sort((a, b) => a.at - b.at);
    }, [marks, seed]);

    const done = taken.length;

    return (
        <div className="spy-wrap">
            {/* The sky behind the glass is the same horizon the sea uses, so the rail you are standing at is
                the boat you have been sailing. */}
            <div className="spy-sky" style={{ backgroundImage: `url(${sky})` }} />

            <div className="spy-head">
                <span className="spy-step">Bearing {Math.min(done + 1, marks.length)} of {marks.length}</span>
                {target ? (
                    <>
                        <h2 className="spy-target">{target.mark}</h2>
                        <p className="spy-says">{target.exact ? `He gave it in leagues — ${target.says}.` : `He would only say: ${target.says}.`}</p>
                    </>
                ) : <h2 className="spy-target">The fix is taken</h2>}
            </div>

            {/* ── THE GLASS ──────────────────────────────────────────────────────────────────────────── */}
            <div ref={wrapRef} className="spy-glass"
                onPointerDown={(e) => { e.preventDefault(); dragRef.current = { x: e.clientX, aim: aimRef.current }; Exp.spyglass(); }}>
                <div className="spy-horizon" style={{ transform: `translate3d(${(0.5 - wire) / FOV * 100}%,0,0)` }}>
                    {horizon.map((h, i) => {
                        const isTarget = h.real === k;
                        // ⚠️ HE NAMED IT, SO YOU MUST BE ABLE TO TELL WHICH IT IS. Fourteen silhouettes and
                        // no way to identify the right one is not difficulty, it is a lottery — and the
                        // first shot of this screen was exactly that: two identical grey hills either side
                        // of the wire and nothing to choose between them. The mark names itself once the
                        // glass is near enough that a lookout would recognise it, which turns the puzzle
                        // into the two things it is supposed to be — a sweep to FIND it, then a call to
                        // TIME it — instead of a guess.
                        // TWO STAGES, and the outer one is not a lie. Measured by playing it: calling the
                        // instant the mark lit up scored ZERO every time, because the highlight came on at
                        // 2.4x the window and the score reaches zero at 2x. So the warm state means "this is
                        // the one he named" — the SEARCH is solved — and the bright state means "it will
                        // count now". Spot it, then line it up. One state made the affordance a trap.
                        const off = Math.abs(h.at - wire);
                        const near = isTarget && off < win * 2.4;
                        const on = isTarget && off < win * LOCK;
                        return (
                            <svg key={i} className={`spy-land${near ? " is-near" : ""}${on ? " is-on" : ""}${h.real >= 0 && h.real < k ? " is-taken" : ""}`}
                                viewBox="0 0 80 30" preserveAspectRatio="none"
                                // ⚠️ THE -50/FOV IS NOT A FUDGE, IT IS THE HALF-VIEW OFFSET, AND LEAVING IT
                                // OUT PUT THE WHOLE COASTLINE 142% OF A GLASS-WIDTH TO THE RIGHT. The strip
                                // is translated by (0.5 - wire)/FOV, which already carries a 0.5/FOV term;
                                // a mark's own left has to cancel it or every mark is drawn as though the
                                // glass were pointed at zero. On screen that looked like an empty sea with
                                // one hill in the corner — and it looked like ART, not like arithmetic,
                                // which is why only a screenshot found it.
                                style={{ left: `${(h.at / FOV) * 100 + 50 - 50 / FOV}%`, opacity: h.real >= 0 ? 0.95 : 0.5 }}>
                                <path d={SHAPES[h.shape]} />
                            </svg>
                        );
                    })}
                </div>
                {/* The wire, dead centre, and the window his description buys you either side of it. */}
                {/* His window, drawn true, with no clamp — at a 0.42 field of view the whole grade range fits
                    inside the glass (26% of it at one star, 76% at five), so every star draws a band you can
                    tell from the one below it. It used to be clamped at 92%, which made four stars and five
                    stars the same picture. */}
                <div className="spy-window" style={{ width: `${(win * 2) / FOV * 100}%` }} aria-hidden="true" />
                <div className={`spy-wire${locked ? " is-on" : ""}`} aria-hidden="true" />
                <div className="spy-mask" aria-hidden="true" />
                {/* The word is the server's own band, not a second ladder of thresholds that has to be kept
                    in step with it by hand. */}
                {flash ? <div key={`${flash.k}-${done}`} className={`spy-flash is-${bearingBand(flash.score).id}`}>
                    {bearingBand(flash.score).say}
                </div> : null}
            </div>

            {/* ── THE CHART, KNITTING ────────────────────────────────────────────────────────────────── */}
            {/* ⚠️ THERE IS NOTHING BEHIND THE PIECES, AND THERE MUST NOT BE. The first cut painted the
                island's own backdrop under them — but `island` is deliberately withheld from the bearings
                payload, because naming the place is the COURSE beat's job and the whole point of the glass
                is that you do not know yet where he has sent you. So the conditional never rendered and the
                pieces peeled back to a blank tan rectangle that read as an unloaded image, and the solved
                label fell through to the literal string "The island".
                What is under them now is a chart: ink rules and a compass rose, drawn in CSS, which is what
                a chart looks like before you have read it. */}
            <div className={`spy-chart${sent ? " is-solved" : ""}`}>
                <div className="spy-chart-paper" aria-hidden="true" />
                <div className="spy-chart-grid" aria-hidden="true">
                    {Array.from({ length: 6 }, (_, i) => (
                        <span key={i} className={`spy-piece${i < Math.ceil((done / Math.max(1, marks.length)) * 6) ? " is-in" : ""}`}
                            style={{ transitionDelay: `${(i % 3) * 60}ms` }} />
                    ))}
                </div>
                {sent ? <span className="spy-chart-x" aria-hidden="true" /> : null}
                {/* ── AN EMPTY CHART HAS TO SAY WHAT IT IS ────────────────────────────────────────────
                    Before the first bearing this panel is a blank sheet of paper — the largest thing on the
                    screen, and mute. It reads as a piece of UI that failed to load rather than as the chart
                    you are about to draw. One line turns it from missing into pending. */}
                <span className="spy-chart-label">
                    {sent ? "The fix is made" : done ? `${done} of ${marks.length} taken` : "Every mark you call draws a line here"}
                </span>
            </div>

            <button className="spy-call" disabled={busy || sent || !target} onClick={call}>
                {sent ? "The chart is made" : "Take the bearing"}
            </button>
            <p className="spy-hint">Drag the glass along the horizon. She rides the swell — call it as the wire crosses.</p>
            <Style />
        </div>
    );
}

function Style() {
    return (
        <style jsx global>{`
            .spy-wrap { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center;
                justify-content: center; gap: clamp(8px, 2vh, 16px);
                padding: calc(10px + env(safe-area-inset-top)) 14px calc(14px + env(safe-area-inset-bottom));
                overflow: hidden; background: #08121b; }
            .spy-sky { position: absolute; inset: 0; background-size: cover; background-position: center;
                filter: brightness(0.5) saturate(0.85); }
            .spy-sky::after { content: ""; position: absolute; inset: 0;
                background: linear-gradient(180deg, rgba(6,14,22,0.7), rgba(6,14,22,0.95)); }

            .spy-head { position: relative; text-align: center; max-width: 34rem; }
            .spy-step { display: inline-block; font-size: 0.7rem; font-weight: 800; letter-spacing: 0.14em;
                text-transform: uppercase; color: #8fb2c9; }
            .spy-target { margin: 2px 0 0; font-size: clamp(1.15rem, 5.2vw, 1.6rem); color: #f2e4c6;
                text-shadow: 0 2px 10px rgba(0,0,0,0.8); }
            .spy-says { margin: 3px 0 0; font-size: clamp(0.76rem, 3.2vw, 0.9rem); color: #b9a986; font-style: italic; }

            /* ── THE GLASS ─────────────────────────────────────────────────────────────────────────────
               A round window with the world sliding behind it. The circle is painted as a MASK on top
               rather than as an overflow-clip on a transformed child, which costs a compositor layer per
               frame — and this thing moves every frame. */
            .spy-glass { position: relative; width: min(94vw, 46rem); aspect-ratio: 1.55 / 1;
                border-radius: 999px; overflow: hidden; cursor: ew-resize; touch-action: none;
                background: linear-gradient(180deg, #7fb6d6 0%, #b9d8e8 52%, #2d5f7d 52%, #123449 100%);
                box-shadow: inset 0 0 0 6px rgba(22,16,8,0.92), inset 0 0 40px rgba(0,0,0,0.75),
                    0 10px 30px rgba(0,0,0,0.6); }
            .spy-horizon { position: absolute; left: 0; top: 0; bottom: 0; width: 100%; will-change: transform; }
            .spy-land { position: absolute; bottom: 44%; width: 17%; height: 26%; overflow: visible;
                transform: translateX(-50%); }
            .spy-land path { fill: #16394f; stroke: #0d2635; stroke-width: 0.8; }
            /* The one he named, once the glass is close enough to recognise it. Warm against a cold
               coastline, so it reads at a glance on a phone in daylight. */
            .spy-land.is-near path { fill: #c98a3a; stroke: #6d3f10; }
            .spy-land.is-near { filter: drop-shadow(0 0 10px rgba(255,190,90,0.75)); }
            .spy-land.is-on path { fill: #ffd27a; stroke: #7a4a10; }
            .spy-land.is-on { filter: drop-shadow(0 0 18px rgba(255,214,130,0.95)); }
            .spy-land.is-taken path { fill: #2a6a4a; }
            /* The window his description buys you, centred on the wire. This is the ONE thing on screen that
               makes the captain's stars legible: a Certainty's window is a slot, a Sounding's is a barn door. */
            .spy-window { position: absolute; left: 50%; top: 8%; bottom: 8%; transform: translateX(-50%);
                border-left: 1px dashed rgba(255,226,150,0.45); border-right: 1px dashed rgba(255,226,150,0.45);
                background: rgba(255,226,150,0.07); pointer-events: none; }
            .spy-wire { position: absolute; left: 50%; top: 6%; bottom: 6%; width: 2px; margin-left: -1px;
                background: rgba(255,240,200,0.9); box-shadow: 0 0 8px rgba(255,220,140,0.7); pointer-events: none; }
            .spy-wire::before { content: ""; position: absolute; left: 50%; top: 50%; width: 22px; height: 2px;
                margin-left: -11px; background: rgba(255,240,200,0.9); }
            /* The wire answers too. A signal only at the edge of the glass means looking away from the thing
               you are aiming at, which on a phone is most of the screen. */
            .spy-wire.is-on { background: #ffd27a; box-shadow: 0 0 16px rgba(255,214,130,1); }
            .spy-wire.is-on::before { background: #ffd27a; width: 34px; margin-left: -17px; }
            /* ⚠️ AN ELLIPSE, NOT A CIRCLE. The glass is a lozenge (aspect 1.35-1.55) and the vignette was
               drawn as a circle, so the left and right ends of the tube stayed bright and the thing read as
               a wide rounded rectangle rather than as something you are looking down. */
            .spy-mask { position: absolute; inset: 0; pointer-events: none;
                background: radial-gradient(ellipse 58% 58% at 50% 50%, transparent 40%, rgba(4,10,16,0.94) 100%); }

            .spy-flash { position: absolute; left: 50%; top: 16%; transform: translateX(-50%);
                font-weight: 900; font-size: clamp(0.9rem, 4vw, 1.2rem); letter-spacing: 0.1em;
                text-shadow: 0 2px 10px rgba(0,0,0,0.9); pointer-events: none;
                animation: spyFlash 1100ms ease-out forwards; }
            .spy-flash.is-true { color: #7fe0a8; }
            .spy-flash.is-good { color: #ffe9b8; }
            .spy-flash.is-rough { color: #e8c069; }
            .spy-flash.is-poor { color: #ff9f86; }
            @keyframes spyFlash {
                0% { opacity: 0; transform: translateX(-50%) scale(0.7); }
                18% { opacity: 1; transform: translateX(-50%) scale(1.12); }
                34% { transform: translateX(-50%) scale(1); }
                100% { opacity: 0; transform: translateX(-50%) translateY(-18px) scale(1); }
            }

            /* ── THE CHART KNITTING ────────────────────────────────────────────────────────────────────
               Six torn pieces over the island's own painting. They do not slide in from off screen: they
               fade and settle out of a slight rotation, which reads as paper being laid down rather than
               as tiles loading. */
            .spy-chart { position: relative; width: min(88vw, 40rem); aspect-ratio: 2.4 / 1;
                border-radius: 10px; overflow: hidden; flex: 0 0 auto;
                background: radial-gradient(120% 140% at 30% 20%, #e4d2a8, #bda169);
                box-shadow: inset 0 0 30px rgba(90,62,26,0.6), 0 6px 20px rgba(0,0,0,0.5); }
            /* Paper: a ruled grid, a rhumb line and a compass rose, all gradients. No art, because the one
               picture that would belong here is the island, and the island is the next screen's reveal. */
            .spy-chart-paper { position: absolute; inset: 0; opacity: 0.55;
                background-image:
                    repeating-linear-gradient(90deg, rgba(90,62,26,0.16) 0 1px, transparent 1px 44px),
                    repeating-linear-gradient(0deg, rgba(90,62,26,0.16) 0 1px, transparent 1px 44px),
                    linear-gradient(28deg, transparent 49.6%, rgba(90,62,26,0.3) 49.6%, rgba(90,62,26,0.3) 50.2%, transparent 50.2%),
                    radial-gradient(circle at 78% 70%, transparent 16px, rgba(90,62,26,0.26) 16px, rgba(90,62,26,0.26) 17px, transparent 17px),
                    radial-gradient(circle at 78% 70%, transparent 7px, rgba(90,62,26,0.3) 7px, rgba(90,62,26,0.3) 8px, transparent 8px); }
            .spy-chart-grid { position: absolute; inset: 0; display: grid; gap: 3px;
                grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(2, 1fr); }
            /* ⚠️ THE UNREVEALED PIECES ARE TORN PAPER, NOT TILES. The first cut was six flat tan rectangles
               with a hairline between them, which on screen is indistinguishable from a loading skeleton —
               the one thing a reward animation must never look like. Ragged edges, a little rotation each,
               and the island showing faintly through the gaps so there is visibly something under there. */
            .spy-piece { position: relative; opacity: 0.88;
                background: linear-gradient(168deg, #e0cb9c, #b08f57);
                box-shadow: inset 0 0 0 1px rgba(90,62,26,0.5), inset 0 -8px 14px rgba(90,62,26,0.25),
                    0 2px 6px rgba(0,0,0,0.35);
                transition: opacity 460ms ease, transform 460ms cubic-bezier(.2,1.3,.5,1); }
            /* Enough rotation to read as torn paper at desktop size. At 0.8deg it was invisible and the
               grid read as a loading skeleton — the one thing a reward animation must never look like. */
            .spy-piece:nth-child(2n) { transform: rotate(-2.2deg) scale(1.05); }
            .spy-piece:nth-child(3n) { transform: rotate(2.6deg) scale(1.05); }
            .spy-piece:nth-child(5n) { transform: rotate(-1.4deg) scale(1.04); }
            .spy-piece.is-in { opacity: 0; transform: scale(1.1) rotate(2.4deg); }
            .spy-chart-x { position: absolute; left: 50%; top: 50%; width: 30px; height: 30px; margin: -15px 0 0 -15px;
                animation: spyX 520ms cubic-bezier(.2,1.5,.4,1) both; }
            .spy-chart-x::before, .spy-chart-x::after { content: ""; position: absolute; left: 0; top: 13px;
                width: 30px; height: 4px; border-radius: 2px; background: #b0202a;
                box-shadow: 0 1px 3px rgba(0,0,0,0.6); }
            .spy-chart-x::before { transform: rotate(45deg); }
            .spy-chart-x::after { transform: rotate(-45deg); }
            @keyframes spyX { from { transform: scale(0) rotate(-40deg); opacity: 0; } }
            .spy-chart.is-solved { animation: spySolved 620ms ease-out; }
            @keyframes spySolved {
                0% { box-shadow: inset 0 0 30px rgba(90,62,26,0.6), 0 6px 20px rgba(0,0,0,0.5); }
                40% { box-shadow: inset 0 0 30px rgba(90,62,26,0.6), 0 0 0 4px rgba(255,226,150,0.9), 0 6px 34px rgba(255,190,90,0.6); }
                100% { box-shadow: inset 0 0 30px rgba(90,62,26,0.6), 0 6px 20px rgba(0,0,0,0.5); }
            }
            /* Off the paper and onto its own strip, because dark brown text pinned to the bottom landed on
               the seam between two tiles and was unreadable. */
            .spy-chart-label { position: absolute; left: 0; right: 0; bottom: 0; text-align: center;
                padding: 3px 0 4px; font-size: 0.72rem; font-weight: 800; color: #f0dfb6;
                background: linear-gradient(180deg, transparent, rgba(12,18,26,0.85) 45%); }

            .spy-call { position: relative; width: min(88vw, 28rem); padding: 16px 20px; border-radius: 12px;
                border: 0; cursor: pointer; font-size: 1rem; font-weight: 800; color: #2a1c06;
                background: linear-gradient(180deg, #f0cb79, #d5a445);
                box-shadow: 0 3px 0 #8d6a23, 0 8px 22px rgba(0,0,0,0.5); }
            .spy-call:disabled { opacity: 0.55; cursor: default; }
            .spy-call:active:not(:disabled) { transform: translateY(2px); box-shadow: 0 1px 0 #8d6a23; }
            .spy-hint { position: relative; margin: 0; text-align: center; max-width: 30rem;
                font-size: 0.74rem; color: #8fa6b8; line-height: 1.4; }

            @media (min-height: 780px) { .spy-glass { aspect-ratio: 1.35 / 1; } }
        `}</style>
    );
}
