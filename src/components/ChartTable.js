"use client";

// ── THE CHART, OPENED ON THE TABLE ───────────────────────────────────────────────────────────────────────────
// Luke: "I would like the chart you get to be something you open and solve."
//
// Three landmarks the captain named, each with a distance off it. Draw a ring round each at that distance and
// the island is where the three cross. Drag the pin to the crossing and push off.
//
// ⚠️ THE RINGS DO THE TEACHING, NOT A TUTORIAL. Each sounding is drawn as a translucent BAND — a stroke as
// thick as the captain's uncertainty — so three of them overlapping make the crossing the darkest patch of
// paper on the table. Nobody has to be told to look for it: the answer is literally the darkest place, and how
// dark and how small it is IS the grade of the chart. A five-star man leaves a dot. A one-star man leaves a
// smudge the size of your thumb. See [[teach-by-showing-not-telling]].
//
// ⚠️ AND THE ANSWER IS NOT IN THIS FILE. The server sends the three soundings and never the fix — a browser
// that has been told where the island is has been told the answer, and the whole puzzle would live in the DOM
// one inspector away. The pin is scored server-side, on commit, against a face it regenerates for itself.

import { useCallback, useEffect, useRef, useState } from "react";
import { GiCompass, GiSpyglass, GiScrollUnfurled } from "react-icons/gi";

const STARS = 5;

export default function ChartTable({ chart, busy, onCommit }) {
    const soundings = chart?.soundings || [];
    const grade = Math.max(1, Math.min(STARS, Number(chart?.grade) || 1));
    const wrapRef = useRef(null);
    // Starts in the middle of the paper rather than nowhere: a pin you have to place before you can move it is
    // one extra thing to work out before the puzzle starts.
    const [pin, setPin] = useState({ x: 0.5, y: 0.5 });
    const [dragging, setDragging] = useState(false);
    const [sent, setSent] = useState(false);

    // ⚠️ POINTER EVENTS, AND NO setPointerCapture. Capturing the pointer on a draggable marker breaks plain
    // MOUSE clicks on desktop — the capture swallows the click that follows the pointerup, so the pin could be
    // dragged with a finger and not with a mouse. See [[pointer-capture-kills-desktop-clicks]]. Tracking on
    // the WRAPPER instead gets both, and has the better behaviour anyway: dragging off the paper and back on
    // keeps hold of the pin.
    const place = useCallback((e) => {
        const box = wrapRef.current?.getBoundingClientRect();
        if (!box || !box.width) return;
        setPin({
            x: Math.max(0, Math.min(1, (e.clientX - box.left) / box.width)),
            y: Math.max(0, Math.min(1, (e.clientY - box.top) / box.height)),
        });
    }, []);

    useEffect(() => {
        if (!dragging) return undefined;
        const move = (e) => { e.preventDefault(); place(e); };
        const up = () => setDragging(false);
        window.addEventListener("pointermove", move, { passive: false });
        window.addEventListener("pointerup", up);
        window.addEventListener("pointercancel", up);
        return () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
            window.removeEventListener("pointercancel", up);
        };
    }, [dragging, place]);

    const commit = async () => {
        if (sent || busy) return;
        setSent(true);
        try { await onCommit?.(pin); } finally { setSent(false); }
    };

    return (
        <div className="ct">
            <div className="ct-head">
                <GiScrollUnfurled className="ct-ico" aria-hidden="true" />
                <div className="ct-headtext">
                    <div className="ct-title">His chart</div>
                    <div className="ct-stars" aria-label={`${grade} of ${STARS} stars`}>
                        {Array.from({ length: STARS }, (_, i) => (
                            <span key={i} className={`ct-star${i < grade ? " on" : ""}`} aria-hidden="true" />
                        ))}
                    </div>
                </div>
            </div>

            {/* THE PAPER. Square, so a ring is a ring — a chart face stretched to the viewport would make
                every distance on it a lie in one axis. */}
            <div ref={wrapRef} className="ct-paper"
                onPointerDown={(e) => { e.preventDefault(); setDragging(true); place(e); }}>

                <svg className="ct-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                    {/* Each sounding is a band as thick as his uncertainty. Where three overlap, the paper
                        goes darkest — and that is the island. */}
                    {soundings.map((s) => (
                        <circle key={`r${s.k}`} className="ct-ring"
                            cx={s.x * 100} cy={s.y * 100} r={s.r * 100}
                            strokeWidth={Math.max(0.6, s.slop * 200)} />
                    ))}
                    {/* ⚠️ ONLY THE EXACT SOUNDINGS GET A CRISP CENTRE-LINE, AND THIS IS THE WHOLE GRADE.
                        The first cut drew this dashed circle at the true radius for ALL THREE — so a
                        one-star chart, whose entire character is that its bands are fat and vague, still
                        handed you three precise curves crossing at a point. The grade was decoration and a
                        Sounding was exactly as solvable as a Certainty. A hedge gets the band and nothing
                        else; a number gets a line you can trust. Caught by looking at plot1 and plot5 side
                        by side — see [[watch-it-run-before-done]]. */}
                    {soundings.filter((s) => s.exact).map((s) => (
                        <circle key={`e${s.k}`} className="ct-edge"
                            cx={s.x * 100} cy={s.y * 100} r={s.r * 100} />
                    ))}
                </svg>

                {/* The landmarks themselves, and what he said about each. */}
                {/* ⚠️ THE LABEL HAS TO STAY ON THE PAPER. A landmark can sit anywhere on the face, and a
                    centred nowrap label under one near an edge runs clean off it — the first shot had
                    "the Fever Coast" reading "e Fever Coast" and "Canopy Gap" sliced off at the bottom.
                    So the label picks its own side: it hangs left of centre near the right edge, right of
                    centre near the left, and flips ABOVE the pin in the bottom fifth. */}
                {soundings.map((s) => {
                    const side = s.x > 0.72 ? "end" : s.x < 0.28 ? "start" : "mid";
                    const above = s.y > 0.8;
                    return (
                        <div key={`m${s.k}`} className={`ct-mark is-${side}${above ? " is-above" : ""}`}
                            style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%` }}>
                            <GiCompass className="ct-markico" aria-hidden="true" />
                            <span className={`ct-marklabel${s.exact ? " exact" : ""}`}>
                                <b>{s.mark}</b>
                                <i>{s.says}</i>
                            </span>
                        </div>
                    );
                })}

                {/* The pin. */}
                <div className={`ct-pin${dragging ? " is-held" : ""}`} style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }}>
                    <span className="ct-pin-x" aria-hidden="true" />
                </div>
            </div>

            <div className="ct-foot">
                <p className="ct-hint">
                    <GiSpyglass className="ct-hintico" aria-hidden="true" />
                    {grade >= 4
                        ? "He gave you leagues. Put the pin where the three rings meet."
                        : grade >= 2
                            ? "Some of it he would only estimate. The island is where all three bands overlap."
                            : "He was vague about all three. Find the darkest patch of paper and commit to it."}
                </p>
                <button className="ct-go" disabled={busy || sent} onClick={commit}>
                    {sent ? "Making sail…" : "Set the course"}
                </button>
                {/* THE ONE PROMISE THIS SCREEN MAKES, AND IT IS TRUE. See chart-plot.js: the tide is measured
                    off the real walk, so a bad plot lands further out and never lands nowhere. A puzzle that
                    could cost somebody an earned reward is the interrogation minigame again. */}
                <p className="ct-safe">A poor reckoning still makes landfall — at the wrong end of the island.</p>
            </div>

            <style jsx>{`
                .ct { display: flex; flex-direction: column; gap: 10px; }
                .ct-head { display: flex; align-items: center; gap: 10px; }
                .ct-ico { width: 26px; height: 26px; color: #d9b878; flex: 0 0 auto; }
                .ct-headtext { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
                .ct-title { font-weight: 700; font-size: 1.02rem; color: #f2e4c6; letter-spacing: 0.01em; }
                .ct-stars { display: flex; gap: 3px; }
                .ct-star {
                    width: 10px; height: 10px; border-radius: 50%;
                    background: rgba(255, 255, 255, 0.14);
                    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.35);
                }
                .ct-star.on { background: #e8c069; box-shadow: 0 0 6px rgba(232, 192, 105, 0.55); }

                .ct-paper {
                    position: relative; width: 100%; aspect-ratio: 1 / 1;
                    border-radius: 10px; overflow: hidden; cursor: crosshair;
                    background:
                        radial-gradient(120% 120% at 30% 20%, #e4d2a8 0%, #d8c290 45%, #bda169 100%);
                    box-shadow: inset 0 0 40px rgba(90, 62, 26, 0.55), 0 6px 22px rgba(0, 0, 0, 0.45);
                    touch-action: none;
                    user-select: none; -webkit-user-select: none;
                }
                .ct-svg { position: absolute; inset: 0; width: 100%; height: 100%; }
                .ct-ring { fill: none; stroke: rgba(74, 44, 12, 0.20); }
                .ct-edge { fill: none; stroke: rgba(74, 44, 12, 0.34); stroke-width: 0.35; stroke-dasharray: 2 2.4; }

                .ct-mark { position: absolute; transform: translate(-50%, -50%); pointer-events: none;
                    display: flex; flex-direction: column; align-items: center; }
                .ct-mark.is-end { align-items: flex-end; transform: translate(-100%, -50%); }
                .ct-mark.is-start { align-items: flex-start; transform: translate(0, -50%); }
                .ct-mark.is-above { flex-direction: column-reverse; }
                .ct-mark.is-above .ct-marklabel { margin: 0 0 2px; }
                .ct-markico { width: 19px; height: 19px; color: #4a2c0c; flex: 0 0 auto;
                    filter: drop-shadow(0 1px 0 rgba(255, 255, 255, 0.35)); }
                .ct-mark.is-end .ct-markico { margin-right: -9px; }
                .ct-mark.is-start .ct-markico { margin-left: -9px; }
                .ct-marklabel {
                    margin-top: 2px; display: flex; flex-direction: column; align-items: center; gap: 0;
                    padding: 2px 6px; border-radius: 5px; white-space: nowrap;
                    background: rgba(247, 236, 210, 0.82); border: 1px solid rgba(74, 44, 12, 0.3);
                }
                .ct-marklabel b { font-size: 0.62rem; color: #40260a; font-weight: 700; letter-spacing: 0.01em; }
                .ct-marklabel i { font-size: 0.58rem; color: #6b4a20; font-style: italic; }
                .ct-marklabel.exact i { font-style: normal; font-weight: 700; color: #3d2a08; }

                .ct-pin { position: absolute; transform: translate(-50%, -50%); pointer-events: none; }
                .ct-pin-x {
                    display: block; width: 26px; height: 26px; position: relative;
                }
                .ct-pin-x::before, .ct-pin-x::after {
                    content: ""; position: absolute; left: 50%; top: 50%;
                    width: 26px; height: 3px; margin: -1.5px 0 0 -13px; border-radius: 2px;
                    background: #b0202a; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
                }
                .ct-pin-x::before { transform: rotate(45deg); }
                .ct-pin-x::after { transform: rotate(-45deg); }
                .ct-pin.is-held .ct-pin-x { transform: scale(1.25); }

                .ct-foot { display: flex; flex-direction: column; gap: 8px; }
                .ct-hint { display: flex; align-items: center; gap: 7px; margin: 0; font-size: 0.82rem; color: #cdbb98; line-height: 1.35; }
                .ct-hintico { width: 17px; height: 17px; color: #d9b878; flex: 0 0 auto; }
                .ct-go {
                    width: 100%; padding: 13px 16px; border-radius: 10px; border: 0; cursor: pointer;
                    font-size: 1rem; font-weight: 700; letter-spacing: 0.02em;
                    color: #2a1c06; background: linear-gradient(180deg, #f0cb79, #d5a445);
                    box-shadow: 0 3px 0 #8d6a23, 0 6px 16px rgba(0, 0, 0, 0.4);
                }
                .ct-go:disabled { opacity: 0.6; cursor: default; }
                .ct-safe { margin: 0; text-align: center; font-size: 0.74rem; color: #8f8367; }

                @media (max-width: 420px) {
                    .ct-marklabel b { font-size: 0.58rem; }
                    .ct-marklabel i { font-size: 0.54rem; }
                }
            `}</style>
        </div>
    );
}
