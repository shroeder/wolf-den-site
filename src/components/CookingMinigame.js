"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── THE COOK ─────────────────────────────────────────────────────────────────────────────────────────────────
// The same shape as the forge's temper, because that one works and consistency is worth more here than novelty:
// a marker sweeps a bar, you tap near the middle, and how close you land grades the hit. Five taps, a chain
// multiplier that survives Great-or-better, and a 0..1 quality out the other end.
//
// What's different is the fiction. The forge is five hammer STRIKES on one piece; a cook is five STEPS of a
// recipe, and the sweep gets faster as the pan gets hotter — so the last step is the one that decides whether
// the run was flawless. The server treats the returned quality as untrusted and only ever lets it improve the
// odds, never hand out a result directly.

const STEPS = ["Prep", "Heat", "Combine", "Season", "Plate"];
const BASE_PERIOD = 1.55;   // seconds for a full sweep on step 1
const SPEEDUP = 0.13;       // each step tightens it by this much

const GRADES = [
    { max: 0.045, key: "flawless", label: "FLAWLESS", score: 4, color: "#ff9ec4" },
    { max: 0.11,  key: "perfect",  label: "Perfect",  score: 3, color: "#ffd75e" },
    { max: 0.22,  key: "great",    label: "Great",    score: 2, color: "#7ec8ff" },
    { max: 0.36,  key: "good",     label: "Good",     score: 1, color: "#9aa0a6" },
    { max: 1,     key: "burnt",    label: "Burnt",    score: 0, color: "#e0685c" },
];
const gradeFor = (dist) => GRADES.find((g) => dist <= g.max) || GRADES[GRADES.length - 1];

export default function CookingMinigame({ recipe, onDone, onCancel }) {
    const [step, setStep] = useState(0);
    const [marker, setMarker] = useState(0);
    const [chain, setChain] = useState(0);
    const [pop, setPop] = useState(null);
    const [sparks, setSparks] = useState([]);
    const [done, setDone] = useState(false);

    const markerRef = useRef(0);
    const raf = useRef(0);
    const t0 = useRef(0);
    const scoreRef = useRef(0);
    const maxRef = useRef(0);
    const chainRef = useRef(0);
    const bestChainRef = useRef(0);
    const lastTap = useRef(0);
    const finished = useRef(false);

    useEffect(() => {
        if (done) return undefined;
        const period = Math.max(0.6, BASE_PERIOD - step * SPEEDUP);
        const loop = (ts) => {
            if (!t0.current) t0.current = ts;
            const phase = (((ts - t0.current) / 1000) % period) / period;
            const pos = phase < 0.5 ? phase * 2 : 2 - phase * 2; // triangle, 0→1→0
            markerRef.current = pos;
            setMarker(pos);
            raf.current = requestAnimationFrame(loop);
        };
        raf.current = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf.current);
    }, [step, done]);

    const tap = useCallback(() => {
        if (done || finished.current) return;
        const now = typeof performance !== "undefined" ? performance.now() : Date.now();
        if (now - lastTap.current < 150) return; // a finger landing twice is one tap
        lastTap.current = now;

        const dist = Math.abs(markerRef.current - 0.5);
        const g = gradeFor(dist);
        const keep = g.score >= 2;
        const mult = 1 + chainRef.current * 0.2;
        scoreRef.current += g.score * mult;
        maxRef.current += 4 * mult;
        chainRef.current = keep ? chainRef.current + 1 : 0;
        bestChainRef.current = Math.max(bestChainRef.current, chainRef.current);
        setChain(chainRef.current);
        setPop({ label: g.label, color: g.color, k: now, chain: chainRef.current });
        setSparks(Array.from({ length: g.score >= 3 ? 18 : g.score >= 2 ? 11 : 5 }, (_, i) => ({
            id: now + i, a: Math.random() * 360, d: 30 + Math.random() * 70, c: g.color,
        })));
        setTimeout(() => setSparks([]), 600);

        const next = step + 1;
        if (next >= STEPS.length) {
            finished.current = true;
            setDone(true);
            cancelAnimationFrame(raf.current);
            const q = maxRef.current > 0 ? Math.max(0, Math.min(1, scoreRef.current / maxRef.current)) : 0;
            setTimeout(() => onDone({ quality: q, chain: bestChainRef.current }), 620);
        } else {
            t0.current = 0;
            setStep(next);
        }
    }, [done, step, onDone]);

    useEffect(() => {
        const h = (e) => { if ((e.key === " " || e.key === "Enter") && !done) { e.preventDefault(); tap(); } };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [tap, done]);

    const quality = maxRef.current > 0 ? scoreRef.current / maxRef.current : 0;

    return (
        <div className="ckmg-scrim" role="dialog" aria-label={`Cooking ${recipe.name}`}>
            <div className="ckmg" style={{ "--rt": recipe.tierColor }}>
                <div className="ckmg-head">
                    {recipe.sprite ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={recipe.sprite} alt="" className="ckmg-art" />
                    ) : null}
                    <div>
                        <div className="ckmg-name">{recipe.name}</div>
                        <div className="ckmg-tier">{recipe.tierName}</div>
                    </div>
                </div>

                <div className="ckmg-steps">
                    {STEPS.map((sName, i) => (
                        <span key={sName} className={`ckmg-step${i < step ? " is-done" : ""}${i === step ? " is-now" : ""}`}>{sName}</span>
                    ))}
                </div>

                <button type="button" className="ckmg-bar" onClick={tap} disabled={done} aria-label="Time it">
                    <span className="ckmg-zone ckmg-zone-good" />
                    <span className="ckmg-zone ckmg-zone-great" />
                    <span className="ckmg-zone ckmg-zone-perfect" />
                    <span className="ckmg-marker" style={{ left: `${marker * 100}%` }} />
                    {sparks.map((sp) => (
                        <span key={sp.id} className="ckmg-spark" style={{ "--a": `${sp.a}deg`, "--d": `${sp.d}px`, background: sp.c }} />
                    ))}
                    {pop ? (
                        <span key={pop.k} className="ckmg-pop" style={{ color: pop.color }}>
                            {pop.label}{pop.chain > 1 ? <b> ×{pop.chain}</b> : null}
                        </span>
                    ) : null}
                </button>

                <div className="ckmg-meta">
                    <span>Step <b>{Math.min(step + 1, STEPS.length)}</b>/{STEPS.length}</span>
                    <span>Chain <b>×{chain}</b></span>
                    <span>Quality <b>{Math.round(quality * 100)}%</b></span>
                </div>
                <p className="ckmg-hint">Tap when the marker is dead centre. A clean run cooks a better dish — and can push it a whole tier.</p>
                {!done ? <button type="button" className="ckmg-cancel" onClick={onCancel}>Back out</button> : null}
            </div>
            <style>{MG_CSS}</style>
        </div>
    );
}

const MG_CSS = `
.ckmg-scrim { position: fixed; inset: 0; z-index: 220; display: grid; place-items: center; padding: 18px;
    background: rgba(8,6,12,0.82); backdrop-filter: blur(3px); }
.ckmg { width: min(440px, 100%); padding: 20px 18px 16px; border-radius: 20px;
    background: linear-gradient(180deg, #241c33, #17121f); border: 2px solid var(--rt);
    box-shadow: 0 20px 60px rgba(0,0,0,0.7); }
.ckmg-head { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.ckmg-art { width: 56px; height: 56px; object-fit: contain; }
.ckmg-name { font-weight: 900; font-size: 1.06rem; }
.ckmg-tier { font-size: 0.74rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--rt); }
.ckmg-steps { display: flex; gap: 5px; margin-bottom: 12px; }
.ckmg-step { flex: 1 1 0; text-align: center; font-size: 0.66rem; font-weight: 800; padding: 5px 2px; border-radius: 7px;
    background: rgba(255,255,255,0.05); color: #7a828c; text-transform: uppercase; letter-spacing: .04em; }
.ckmg-step.is-done { background: rgba(74,208,127,0.16); color: #6fe0a0; }
.ckmg-step.is-now { background: var(--rt); color: #17121f; }
.ckmg-bar { position: relative; display: block; width: 100%; height: 62px; border-radius: 14px; cursor: pointer; overflow: hidden;
    background: rgba(0,0,0,0.42); border: 1px solid rgba(255,255,255,0.14); padding: 0; }
.ckmg-bar:disabled { cursor: default; }
.ckmg-zone { position: absolute; top: 0; bottom: 0; left: 50%; transform: translateX(-50%); border-radius: 4px; }
.ckmg-zone-good { width: 72%; background: rgba(154,160,166,0.14); }
.ckmg-zone-great { width: 44%; background: rgba(126,200,255,0.18); }
.ckmg-zone-perfect { width: 22%; background: rgba(255,215,94,0.24); box-shadow: inset 0 0 0 1px rgba(255,215,94,0.5); }
.ckmg-marker { position: absolute; top: 4px; bottom: 4px; width: 4px; margin-left: -2px; border-radius: 3px;
    background: #fff; box-shadow: 0 0 10px rgba(255,255,255,0.85); }
.ckmg-pop { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%); font-weight: 900; font-size: 1.05rem;
    letter-spacing: .04em; pointer-events: none; animation: ckmgPop .62s ease-out both; text-shadow: 0 2px 6px rgba(0,0,0,.8); }
.ckmg-pop b { font-size: 0.85em; }
@keyframes ckmgPop { 0% { opacity: 0; transform: translate(-50%,-30%) scale(.7); } 22% { opacity: 1; transform: translate(-50%,-58%) scale(1.16); } 100% { opacity: 0; transform: translate(-50%,-96%) scale(1); } }
.ckmg-spark { position: absolute; left: 50%; top: 50%; width: 5px; height: 5px; border-radius: 50%; pointer-events: none;
    animation: ckmgSpark .6s ease-out both; }
@keyframes ckmgSpark { 0% { opacity: 1; transform: translate(-50%,-50%) rotate(var(--a)) translateX(0) scale(1); }
                       100% { opacity: 0; transform: translate(-50%,-50%) rotate(var(--a)) translateX(var(--d)) scale(.2); } }
.ckmg-meta { display: flex; justify-content: space-between; gap: 8px; margin-top: 11px; font-size: 0.78rem; color: #b9c2cc; }
.ckmg-meta b { color: #ffd75e; }
.ckmg-hint { margin: 9px 0 0; font-size: 0.76rem; color: #8b93a0; line-height: 1.35; text-align: center; }
.ckmg-cancel { display: block; margin: 12px auto 0; padding: 7px 16px; border-radius: 9px; font-size: 0.78rem; font-weight: 700;
    background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.16); color: #b9c2cc; cursor: pointer; }
`;
