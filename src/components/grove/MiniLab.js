"use client";

import { useCallback, useState } from "react";

import GroveMini from "@/components/grove/GroveMinis.js";
import { GROVE_MINI_CSS } from "@/components/grove/grove-mini-css.js";
import { MINIGAMES, drawPhases } from "@/lib/marketplace/grove-minigames.js";
import { actScore, clampAct } from "@/lib/marketplace/grove-craft-act.js";

// ── THE BENCH ───────────────────────────────────────────────────────────────────────────────────────────────
// Two things, because there are two questions.
//
//   ONE OF EACH   — is this game clear, does it look right, does it score what it should?
//   A REAL DRAW   — do three of them in a row feel like a craft, or like three unrelated screens?
//
// The second is the one a list of ten cannot answer and the reason the pool exists at all.
export default function MiniLab() {
    // ── ⚠️ ?hold=1 STRETCHES EVERY PHASE'S CLOCK, FOR THE CAMERA ────────────────────────────────────
    // These are 2.4 to 4 seconds long, which is right to play and useless to photograph: the screenshot
    // rig settles, clicks, waits for the thing to mount and by then the phase has expired and reported.
    // The first attempt at filming all ten produced ten identical pictures of the menu.
    //
    // It only stretches the CLOCK. Every game still plays exactly as it plays — the bar still drains,
    // the dial still spins, scoring is untouched — so what gets photographed is the real thing, just
    // held still long enough to look at. Not available anywhere but this owner-only bench.
    const hold = typeof window !== "undefined" && window.location.search.includes("hold=1");
    const held = useCallback((g) => (g && hold ? { ...g, ms: 60000 } : g), [hold]);
    const [now, setNow] = useState(null);          // the game being played, if any
    const [last, setLast] = useState({});          // id -> last score
    const [run, setRun] = useState(null);          // a drawn line-up of three
    const [runScores, setRunScores] = useState([]);

    const finishOne = useCallback((score) => {
        setLast((l) => ({ ...l, [now.id]: score }));
        setNow(null);
    }, [now]);

    const finishRun = useCallback((score) => {
        setRunScores((s) => {
            const next = [...s, score];
            if (next.length >= (run?.length || 3)) setRun(null);
            return next;
        });
    }, [run]);

    const playing = run && runScores.length < run.length ? run[runScores.length] : null;
    const runDone = run === null && runScores.length > 0;

    return (
        <div className="ml">
            <header className="ml-top">
                <h1>The forge&apos;s ten</h1>
                <p>Every phase a craft can draw. Tap one to play it; the score it reports is what the act
                    would have been handed.</p>
            </header>

            {/* ── A REAL DRAW ─────────────────────────────────────────────────────────────── */}
            <section className="ml-draw">
                <button type="button" className="ml-go" onClick={() => { setRunScores([]); setRun(drawPhases()); }}>
                    Draw three and play them
                </button>
                {runDone ? (
                    <p className="ml-verdict">
                        {runScores.map((s) => s.toFixed(2)).join("  ·  ")}
                        <b>act {actScore(clampAct({ phases: runScores })).toFixed(3)}</b>
                    </p>
                ) : null}
            </section>

            {playing ? (
                <div className="ml-stage">
                    <p className="ml-phase">Phase {runScores.length + 1} of {run.length}</p>
                    <GroveMini key={`run-${runScores.length}`} game={held(playing)} onDone={finishRun} />
                </div>
            ) : null}

            {now ? (
                <div className="ml-stage">
                    <GroveMini key={now.id + Math.random()} game={held(now)} onDone={finishOne} />
                </div>
            ) : null}

            {/* ── ONE OF EACH ─────────────────────────────────────────────────────────────── */}
            <ul className="ml-grid">
                {MINIGAMES.map((g) => (
                    <li key={g.id} style={{ "--tint": g.tint }}>
                        <button type="button" onClick={() => setNow(g)}>
                            <b>{g.name}</b>
                            <i>{g.verb}</i>
                            <span>{g.reads}</span>
                            <em>{(g.ms / 1000).toFixed(1)}s{last[g.id] != null ? ` · scored ${last[g.id].toFixed(2)}` : ""}</em>
                        </button>
                    </li>
                ))}
            </ul>

            <style>{GROVE_MINI_CSS}</style>
            <style>{LAB_CSS}</style>
        </div>
    );
}

const LAB_CSS = `
.ml { max-width: 1040px; margin: 0 auto; padding: 18px 14px 70px; color: #e8e2d2; }
.ml-top h1 { font-size: clamp(1.5rem, 5vw, 2.2rem); margin: 0 0 6px; }
.ml-top p { margin: 0 0 18px; max-width: 62ch; color: rgba(232,226,210,0.6); font-size: 0.92rem; }
.ml-draw { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin: 0 0 16px; }
.ml-go { cursor: pointer; font: inherit; font-weight: 900; letter-spacing: 0.06em;
    padding: 11px 18px; border-radius: 999px; color: #0d0f10; border: 0;
    background: linear-gradient(180deg, #a8e38c, #74c257); box-shadow: 0 5px 0 #3f7a2c; }
.ml-go:active { transform: translateY(2px); box-shadow: 0 3px 0 #3f7a2c; }
.ml-verdict { margin: 0; font-family: ui-monospace, monospace; font-size: 0.84rem;
    color: rgba(232,226,210,0.65); display: flex; gap: 14px; align-items: baseline; }
.ml-verdict b { color: #a8e38c; font-size: 1rem; }
.ml-stage { max-width: 440px; margin: 0 0 20px; }
.ml-phase { margin: 0 0 8px; font-family: ui-monospace, monospace; font-size: 0.74rem;
    letter-spacing: 0.18em; text-transform: uppercase; color: rgba(232,226,210,0.5); }
.ml-grid { list-style: none; margin: 10px 0 0; padding: 0; display: grid; gap: 12px;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
.ml-grid button { width: 100%; text-align: left; cursor: pointer; font: inherit; color: inherit;
    display: grid; gap: 4px; padding: 14px; border-radius: 12px;
    background: rgba(255,255,255,0.04);
    border: 1px solid color-mix(in srgb, var(--tint) 34%, transparent);
    border-left: 4px solid var(--tint); }
.ml-grid button:hover { background: rgba(255,255,255,0.07); }
.ml-grid b { font-size: 1rem; color: var(--tint); }
.ml-grid i { font-style: normal; font-family: ui-monospace, monospace; font-size: 0.66rem;
    letter-spacing: 0.12em; text-transform: uppercase; color: rgba(232,226,210,0.45); }
.ml-grid span { font-size: 0.82rem; color: rgba(232,226,210,0.72); line-height: 1.45; }
.ml-grid em { font-style: normal; font-family: ui-monospace, monospace; font-size: 0.7rem;
    color: rgba(232,226,210,0.5); }
`;
