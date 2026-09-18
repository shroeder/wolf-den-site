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

const STARS = 5;

// ⚠️ TWO DIFFERENT KINDS OF PICTURE ON THIS SCREEN, AND THEY MUST NOT BE THE SAME KIND.
// The chart and the spyglass are OBJECTS ON THE TABLE — painted props in the house style, drawn by
// scripts/gen-expedition-chrome.mjs, sitting outside the paper. What is drawn ON the paper is INK: the
// rings are SVG, the pin is an inked cross, and so the three landmarks are inked station marks in the same
// SVG at the same ink colour. Dropping a painted, rim-lit sprite onto sepia parchment would read as a
// sticker on a chart rather than as something the captain drew there — which is exactly what the compass
// glyph that used to sit here read as.
const CHART_ART = "/images/islands/chrome/chart.png";
const SPYGLASS_ART = "/images/islands/chrome/spyglass.png";
// ⚠️ VERSIONED — static art is served max-age=86400, so a redraw at the same path leaves everybody who has
// opened a chart looking at the old picture for a day. See [[redrawn-art-must-be-versioned]].
const ART_V = "1";
const v = (p) => `${p}?v=${ART_V}`;

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
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="ct-ico" src={v(CHART_ART)} alt="" draggable="false" />
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
                            {/* ⚠️ THE STATION IS DRAWN HERE, NOT IN THE SVG, AND THAT IS ABOUT SIZE.
                                The paper's viewBox is 100x100 with preserveAspectRatio="none", so anything
                                drawn in it is a FRACTION of the paper: a cross that is a comfortable 12px
                                across on a 375px phone is 31px across on a desktop, where it swallows its
                                own label. Drawn here it is the same ink at the same size at every width,
                                the way the pin's cross already is. */}
                            <span className="ct-station" aria-hidden="true" />
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
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="ct-hintico" src={v(SPYGLASS_ART)} alt="" draggable="false" />
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
                .ct-ico { width: 38px; height: 38px; object-fit: contain; flex: 0 0 auto; display: block;
                    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5)); }
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


                /* A ZERO-SIZED ANCHOR ON THE SPOT. The station pins to it and the label hangs off it —
                   which is the whole difference from the compass glyph that used to sit here: that was
                   CENTRED WITH its label, so the pair straddled the point and neither was actually on it.
                   A landmark is the centre of its own ring; if it is not drawn at the centre, the rings are
                   telling you one thing and the picture another. */
                .ct-mark { position: absolute; pointer-events: none; }
                /* The surveyor's station: a ringed dot with the cross through it — "the bearing was taken
                   from HERE". Ink, the same brown as the rings and a shade darker so it reads against its
                   own band. The white hairline is the paper showing through, not a sticker rim. */
                .ct-station { position: absolute; left: 0; top: 0; width: 15px; height: 15px;
                    margin: -7.5px 0 0 -7.5px; border-radius: 50%;
                    border: 1.5px solid rgba(58, 34, 8, 0.78);
                    box-shadow: 0 0 0 1px rgba(247, 236, 210, 0.45); }
                .ct-station::before, .ct-station::after { content: ""; position: absolute; left: 50%; top: 50%;
                    background: rgba(58, 34, 8, 0.78); }
                .ct-station::before { width: 25px; height: 1.5px; margin: -0.75px 0 0 -12.5px; }
                .ct-station::after { width: 1.5px; height: 25px; margin: -12.5px 0 0 -0.75px; }

                /* The label picks its side so it never runs off the paper, and clears the station's arms
                   (12.5px of them) whichever side it lands on. */
                .ct-marklabel {
                    position: absolute; left: 50%; top: 15px; transform: translateX(-50%);
                    display: flex; flex-direction: column; align-items: center; gap: 0;
                    padding: 2px 6px; border-radius: 5px; white-space: nowrap;
                    background: rgba(247, 236, 210, 0.82); border: 1px solid rgba(74, 44, 12, 0.3);
                }
                .ct-mark.is-above .ct-marklabel { top: auto; bottom: 15px; }
                .ct-mark.is-end .ct-marklabel { left: auto; right: 15px; top: 50%; transform: translateY(-50%); }
                .ct-mark.is-start .ct-marklabel { left: 15px; top: 50%; transform: translateY(-50%); }
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
                .ct-hintico { width: 26px; height: 26px; object-fit: contain; flex: 0 0 auto; display: block;
                    filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.5)); }
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
