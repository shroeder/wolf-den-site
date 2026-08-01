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

// Distances from centre, IDENTICAL to the forge's BANDS (0.022 / 0.055 / 0.10 / 0.16). Cooking used to run at
// exactly double these — good was 0.36, so 72% of the bar scored — which is why it never felt like a skill
// check. Worse, the tightest tier had no band drawn at all, so the thing you were aiming for was invisible.
// The bar and these numbers are the same fact twice: band width on screen is max * 2, so they cannot drift.
const GRADES = [
    { max: 0.022, key: "flawless", label: "FLAWLESS", score: 4, color: "#ff9ec4" },
    { max: 0.055, key: "perfect",  label: "Perfect",  score: 3, color: "#ffd75e" },
    { max: 0.10,  key: "great",    label: "Great",    score: 2, color: "#7ec8ff" },
    { max: 0.16,  key: "good",     label: "Good",     score: 1, color: "#9aa0a6" },
    { max: 1,     key: "burnt",    label: "Burnt",    score: 0, color: "#e0685c" },
];
const gradeFor = (dist) => GRADES.find((g) => dist <= g.max) || GRADES[GRADES.length - 1];

export default function CookingMinigame({ recipe, onDone }) {
    const [step, setStep] = useState(0);
    const [chain, setChain] = useState(0);
    const [pop, setPop] = useState(null);
    const [sparks, setSparks] = useState([]);
    const [done, setDone] = useState(false);
    const [shake, setShake] = useState(0);   // grade-scaled kick on the whole dialog
    const [flash, setFlash] = useState(null); // full-card colour wash on a big hit
    const audio = useRef(null);

    const markerRef = useRef(0);
    const markerEl = useRef(null);
    const spoonEl = useRef(null); // the DOM node — moved directly, never through React
    const raf = useRef(0);
    const t0 = useRef(0);
    const scoreRef = useRef(0);
    const maxRef = useRef(0);
    const chainRef = useRef(0);
    const bestChainRef = useRef(0);
    const lastTap = useRef(0);
    const finished = useRef(false);

    // The marker is positioned by writing to the DOM node directly rather than by setting state.
    //
    // It used to call setMarker() on EVERY frame, which re-rendered the whole dialog sixty times a second. The
    // grading was always read from markerRef (correct), but the marker you could SEE lagged behind it — so a tap
    // that looked dead centre scored as if it were late, and the game felt delayed rather than hard. Writing
    // style.left keeps the picture and the maths on the same frame.
    useEffect(() => {
        if (done) return undefined;
        const period = Math.max(0.6, BASE_PERIOD - step * SPEEDUP);
        const loop = (ts) => {
            if (!t0.current) t0.current = ts;
            const phase = (((ts - t0.current) / 1000) % period) / period;
            const pos = phase < 0.5 ? phase * 2 : 2 - phase * 2; // triangle, 0→1→0
            markerRef.current = pos;
            // Written straight to style, never through state — this runs 60x a second and re-rendering the
            // dialog that often made the marker stutter on exactly the frames the timing depends on. The spoon
            // rides off the same write, so it can never drift a frame away from the line it represents.
            const left = `${pos * 100}%`;
            if (markerEl.current) markerEl.current.style.left = left;
            if (spoonEl.current) spoonEl.current.style.left = left;
            raf.current = requestAnimationFrame(loop);
        };
        raf.current = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf.current);
    }, [step, done]);

    // A short blip whose pitch climbs with the chain. Built on the fly so there's no asset to load and nothing
    // to go stale; wrapped so a browser that blocks audio can never break the tap.
    const blip = useCallback((score, chainN) => {
        try {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return;
            if (!audio.current) audio.current = new Ctx();
            const ac = audio.current;
            if (ac.state === "suspended") ac.resume();
            const osc = ac.createOscillator();
            const gain = ac.createGain();
            osc.type = score >= 3 ? "triangle" : "sine";
            const base = score === 0 ? 150 : 380 + score * 90;
            osc.frequency.setValueAtTime(base + Math.min(6, chainN) * 55, ac.currentTime);
            if (score >= 2) osc.frequency.exponentialRampToValueAtTime(base * 1.7, ac.currentTime + 0.11);
            gain.gain.setValueAtTime(0.0001, ac.currentTime);
            gain.gain.exponentialRampToValueAtTime(score >= 3 ? 0.16 : 0.09, ac.currentTime + 0.012);
            gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.2);
            osc.connect(gain); gain.connect(ac.destination);
            osc.start(); osc.stop(ac.currentTime + 0.22);
        } catch { /* audio is a bonus, never a requirement */ }
    }, []);

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
        // More, faster, further the better the hit — a flawless tap should look obviously different from a good
        // one at a glance, not just read differently.
        setSparks(Array.from({ length: g.score >= 4 ? 30 : g.score >= 3 ? 22 : g.score >= 2 ? 13 : 5 }, (_, i) => ({
            id: now + i, a: Math.random() * 360, d: 34 + Math.random() * (g.score >= 3 ? 120 : 70), c: g.color,
        })));
        setTimeout(() => setSparks([]), 700);
        blip(g.score, chainRef.current);
        setShake(g.score);
        setTimeout(() => setShake(0), 260);
        if (g.score >= 3) { setFlash({ c: g.color, k: now }); setTimeout(() => setFlash(null), 320); }

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
    }, [done, step, onDone, blip]);

    useEffect(() => {
        const h = (e) => { if ((e.key === " " || e.key === "Enter") && !done) { e.preventDefault(); tap(); } };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [tap, done]);

    const quality = maxRef.current > 0 ? scoreRef.current / maxRef.current : 0;

    return (
        <div className="ckmg-scrim" role="dialog" aria-label={`Cooking ${recipe.name}`}>
            <div className={`ckmg${shake ? ` is-shake-${shake}` : ""}`} style={{ "--rt": recipe.tierColor }}>
                {flash ? <span key={flash.k} className="ckmg-flash" style={{ "--fc": flash.c }} aria-hidden="true" /> : null}
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

                <div className="ckmg-bar" aria-hidden="true">
                    <span className="ckmg-zone ckmg-zone-good" />
                    <span className="ckmg-zone ckmg-zone-great" />
                    <span className="ckmg-zone ckmg-zone-perfect" />
                    <span className="ckmg-zone ckmg-zone-flawless" />
                    <span ref={markerEl} className="ckmg-marker" />
                    <span ref={spoonEl} className="ckmg-rider" aria-hidden="true">🥄</span>
                    {sparks.map((sp) => (
                        <span key={sp.id} className="ckmg-spark" style={{ "--a": `${sp.a}deg`, "--d": `${sp.d}px`, background: sp.c }} />
                    ))}
                    {pop ? (
                        <span key={pop.k} className="ckmg-pop" style={{ color: pop.color }}>
                            {pop.label}{pop.chain > 1 ? <b> ×{pop.chain}</b> : null}
                        </span>
                    ) : null}
                </div>

                {/* The tap target is its own button under the bar. Tapping the bar itself meant a thumb covering
                    the exact thing being timed, on the one screen where you need to see it. */}
                <button type="button" className="ckmg-tap" onPointerDown={tap} disabled={done} aria-label="Time it">
                    {done ? "Plating…" : "TAP"}
                </button>

                <div className="ckmg-meta">
                    <span>Step <b>{Math.min(step + 1, STEPS.length)}</b>/{STEPS.length}</span>
                    <span className={chain >= 3 ? "ckmg-chain-hot" : undefined}>Chain <b>×{chain}</b></span>
                    <span>Quality <b>{Math.round(quality * 100)}%</b></span>
                </div>
                <p className="ckmg-hint">Hit the button when the marker is dead centre. A clean run cooks a better dish — and can push it a whole tier.</p>
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
.ckmg-bar { position: relative; display: block; width: 100%; height: 26px; border-radius: 999px; overflow: visible;
    background: rgba(0,0,0,0.42); border: 1px solid rgba(255,255,255,0.14); padding: 0; pointer-events: none; }
/* Widths are GRADES[].max * 2 — the band you see is the band you are scored against. */
.ckmg-zone { position: absolute; top: 0; bottom: 0; left: 50%; transform: translateX(-50%); border-radius: 999px; }
.ckmg-zone-good { width: 32%; background: rgba(154,160,166,0.20); }
.ckmg-zone-great { width: 20%; background: rgba(126,200,255,0.26); }
.ckmg-zone-perfect { width: 11%; background: rgba(255,215,94,0.32); }
.ckmg-zone-flawless { width: 4.4%; background: rgba(255,158,196,0.60); box-shadow: 0 0 14px rgba(255,158,196,0.7); }
.ckmg-rider { position: absolute; top: -26px; transform: translateX(-50%); font-size: 22px; pointer-events: none;
    filter: drop-shadow(0 2px 3px rgba(0,0,0,0.6)); }
/* Overhangs the bar top and bottom like the forge's, so the exact line is readable against a lit band. */
.ckmg-marker { position: absolute; top: -4px; bottom: -4px; width: 4px; margin-left: -2px; border-radius: 3px;
    background: linear-gradient(180deg, #fff, #ffd7e6); box-shadow: 0 0 12px #ffd7e6, 0 0 4px #fff; }
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
/* Big, thumb-sized, and directly under the bar — this is the only control in the dialog. */
.ckmg-tap { display: block; width: 100%; margin-top: 10px; padding: 18px 16px; border-radius: 14px; cursor: pointer;
    font-size: 1.1rem; font-weight: 900; letter-spacing: 0.1em; color: #17121f;
    background: linear-gradient(180deg, #ffe9a8, #f0c14b); border: 0;
    box-shadow: 0 6px 0 rgba(0,0,0,0.35), 0 10px 24px rgba(240,193,75,0.28);
    -webkit-tap-highlight-color: transparent; touch-action: manipulation; user-select: none; }
/* Presses on the DOWN edge, matching onPointerDown — a button that sinks after the tap has already registered
   feels laggy even when the timing was captured correctly. */
.ckmg-tap:active { transform: translateY(3px); box-shadow: 0 3px 0 rgba(0,0,0,0.35), 0 6px 14px rgba(240,193,75,0.22); }
.ckmg-tap:disabled { opacity: 0.55; cursor: default; transform: none; }

/* ── JUICE ──────────────────────────────────────────────────────────────────────────────────────────────
   Impact scales with the grade so a flawless tap LOOKS different from a good one before you read a word. */
.ckmg { position: relative; overflow: hidden; }
.ckmg.is-shake-1 { animation: ckmgShake 0.16s ease-out; }
.ckmg.is-shake-2 { animation: ckmgShake 0.2s ease-out; --amp: 4px; }
.ckmg.is-shake-3 { animation: ckmgShake 0.24s ease-out; --amp: 7px; }
.ckmg.is-shake-4 { animation: ckmgShake 0.28s ease-out; --amp: 11px; }
@keyframes ckmgShake {
    0% { transform: translate(0,0) }
    20% { transform: translate(calc(var(--amp,2px) * -1), calc(var(--amp,2px) * 0.4)) rotate(-0.5deg) }
    45% { transform: translate(var(--amp,2px), calc(var(--amp,2px) * -0.3)) rotate(0.4deg) }
    70% { transform: translate(calc(var(--amp,2px) * -0.5), 0) rotate(-0.2deg) }
    100% { transform: translate(0,0) }
}
/* A wash of the grade's colour across the whole card on Perfect or better. */
.ckmg-flash { position: absolute; inset: 0; pointer-events: none; z-index: 3; border-radius: 20px;
    background: radial-gradient(circle at 50% 45%, var(--fc), transparent 62%); animation: ckmgFlash 0.32s ease-out forwards; }
@keyframes ckmgFlash { 0% { opacity: 0.5 } 100% { opacity: 0 } }
/* The chain is the thing worth protecting, so it starts pulsing once it's worth something. */
.ckmg-chain-hot { animation: ckmgChain 0.9s ease-in-out infinite; }
.ckmg-chain-hot b { color: #ffd75e; text-shadow: 0 0 10px rgba(255,215,94,0.7); }
@keyframes ckmgChain { 0%,100% { transform: scale(1) } 50% { transform: scale(1.13) } }
`;
