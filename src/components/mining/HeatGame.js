"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { PHASE_LABELS, PHASE_SWEEP_MS, SMELT_PHASES, smeltGrade } from "@/lib/marketplace/smelt-heat.js";
import { bandPct, GRADE_COLOR } from "@/lib/marketplace/timing.js";

// ── THE SMELT ────────────────────────────────────────────────────────────────────────────────────────────────
// The same bar as the kitchen, the anvil and the rock face — but until now it was the same bar with none of the
// FEELING. Cooking pops sparks, kicks the card, flashes a colour wash, blips a note that climbs with your chain
// and rides a spoon sprite along the marker. The smelt did none of that: one flat pop, a 200ms nudge, silence.
// Same maths, none of the payoff, and it read as the cheap one.
//
// It plays at the kitchen's level now, dressed as a forge instead of a pan: embers instead of sparks, an anvil
// strike instead of a blip, the furnace flaring on every hit and burning hotter with each phase.
//
// The other thing cooking got right and this did not: the marker is written STRAIGHT TO THE DOM, never through
// state. This used to call setMarker() on every animation frame, re-rendering the whole dialog sixty times a
// second — the grading read markerRef (correct) but the bar you could SEE lagged behind it, so a tap that
// looked dead centre scored late and the game felt broken rather than hard.

const BAND_LABEL = { good: "GOOD", great: "CLEAN", perfect: "PERFECT", pixel: "FLAWLESS" };
const BANDS = ["good", "great", "perfect", "pixel"].map((key) => ({
    key, pct: bandPct(key), label: BAND_LABEL[key], color: GRADE_COLOR[key],
}));
// Grade → impact score, the one number the juice scales off.
const SCORE = { pixel: 4, perfect: 3, great: 2, good: 1, miss: 0 };
const CHAIN_KEEPS = 2; // CLEAN or better keeps the chain alive

export default function HeatGame({ stack, furnace, onPour }) {
    const [phase, setPhase] = useState(0);
    const [locked, setLocked] = useState([]);   // the grade banked on each finished phase
    const [chain, setChain] = useState(0);
    const [pop, setPop] = useState(null);
    const [embers, setEmbers] = useState([]);
    const [shake, setShake] = useState(0);
    const [flash, setFlash] = useState(null);
    const [done, setDone] = useState(false);

    const markerRef = useRef(0);
    const markerEl = useRef(null);
    const riderEl = useRef(null);
    const raf = useRef(0);
    const t0 = useRef(0);
    const chainRef = useRef(0);
    const lastTap = useRef(0);
    const doneRef = useRef(false);
    const dists = useRef([]);
    const audio = useRef(null);

    // One sweep per phase, at that phase's speed. Restarting on `phase` is deliberate — each pour is its own
    // run. Position goes to the DOM directly so the picture and the maths land on the same frame.
    useEffect(() => {
        if (done) return undefined;
        const ms = PHASE_SWEEP_MS[Math.min(phase, PHASE_SWEEP_MS.length - 1)];
        const loop = (ts) => {
            if (!t0.current) t0.current = ts;
            const cycle = (((ts - t0.current) % (ms * 2)) / ms);
            const pos = cycle <= 1 ? cycle : 2 - cycle;   // bounce, never a jump back to 0
            markerRef.current = pos;
            const left = `${pos * 100}%`;
            if (markerEl.current) markerEl.current.style.left = left;
            if (riderEl.current) riderEl.current.style.left = left;
            raf.current = requestAnimationFrame(loop);
        };
        raf.current = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf.current);
    }, [phase, done]);

    // AN ANVIL, NOT A BLIP. Two detuned oscillators with a fast metallic decay so it rings like struck steel;
    // the pitch climbs with the grade and again with the chain. A miss is a dull, detuned thud instead — you
    // should hear that you fumbled before you read the word. Built on the fly, so there is no asset to load,
    // and wrapped so a browser that blocks audio can never break the tap.
    const strike = useCallback((score, chainN) => {
        try {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return;
            if (!audio.current) audio.current = new Ctx();
            const ac = audio.current;
            if (ac.state === "suspended") ac.resume();
            const now = ac.currentTime;
            const miss = score === 0;
            const base = miss ? 110 : 300 + score * 130 + Math.min(6, chainN) * 45;
            const gain = ac.createGain();
            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.exponentialRampToValueAtTime(miss ? 0.11 : 0.06 + score * 0.028, now + 0.006);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + (miss ? 0.26 : 0.42));
            gain.connect(ac.destination);
            // The ring: a fundamental plus a sharp detuned partial, which is what makes metal sound like metal.
            for (const [mult, type, level] of [[1, "triangle", 1], [miss ? 1.4 : 2.76, "square", 0.34]]) {
                const o = ac.createOscillator();
                const g = ac.createGain();
                o.type = type;
                o.frequency.setValueAtTime(base * mult, now);
                if (!miss) o.frequency.exponentialRampToValueAtTime(base * mult * 0.86, now + 0.4);
                g.gain.value = level;
                o.connect(g); g.connect(gain);
                o.start(now); o.stop(now + 0.46);
            }
            // A flawless pour gets a rising third on top — the "you nailed it" note.
            if (score >= 4) {
                const o = ac.createOscillator(); const g = ac.createGain();
                o.type = "sine"; o.frequency.setValueAtTime(base * 1.5, now + 0.05);
                o.frequency.exponentialRampToValueAtTime(base * 2.25, now + 0.3);
                g.gain.setValueAtTime(0.0001, now + 0.05);
                g.gain.exponentialRampToValueAtTime(0.09, now + 0.09);
                g.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
                o.connect(g); g.connect(ac.destination);
                o.start(now + 0.05); o.stop(now + 0.44);
            }
        } catch { /* audio is a bonus, never a requirement */ }
    }, []);

    const tap = useCallback(() => {
        if (done || doneRef.current) return;
        const now = typeof performance !== "undefined" ? performance.now() : Date.now();
        if (now - lastTap.current < 150) return; // a finger landing twice is one tap
        lastTap.current = now;

        const dist = Math.abs(markerRef.current - 0.5);
        const grade = smeltGrade(dist);
        const score = SCORE[grade.key] ?? 0;
        const color = grade.color || GRADE_COLOR[grade.key] || "#fff";
        dists.current = [...dists.current, dist];
        chainRef.current = score >= CHAIN_KEEPS ? chainRef.current + 1 : 0;
        setChain(chainRef.current);
        setLocked((l) => [...l, grade]);
        setPop({ k: now, label: grade.label, color, chain: chainRef.current });

        // More embers, thrown further, the better the pour — a FLAWLESS should look different from a GOOD at a
        // glance, before you have read a single word.
        setEmbers(Array.from({ length: score >= 4 ? 34 : score >= 3 ? 24 : score >= 2 ? 14 : 6 }, (_, i) => ({
            id: now + i, a: Math.random() * 360, d: 34 + Math.random() * (score >= 3 ? 130 : 70),
            c: score === 0 ? "#7a6a5a" : ["#ffd75e", "#ff9f1c", "#ffe9a8"][i % 3],
        })));
        setTimeout(() => setEmbers([]), 720);
        strike(score, chainRef.current);
        setShake(score);
        setTimeout(() => setShake(0), 280);
        if (score >= 3) { setFlash({ c: color, k: now }); setTimeout(() => setFlash(null), 340); }
        try {
            navigator.vibrate?.(score >= 4 ? [26, 30, 26, 30, 60] : score >= 3 ? [20, 30, 40] : [12]);
        } catch { /* no haptics */ }

        if (dists.current.length >= SMELT_PHASES) {
            doneRef.current = true;
            setDone(true);
            cancelAnimationFrame(raf.current);
            setTimeout(() => onPour(dists.current), 620);
        } else {
            // The marker used to be yanked back to its origin (t0 = 0) after a 260ms freeze, so every tap was
            // followed by a dead beat and a line that teleported. Nothing else in the game does that — the
            // arena ring and the forge both resolve on the frame you tap. The sweep now runs straight through
            // to the next phase; only the grade pop is cleared, and on its own timer so it never gates play.
            setPhase((p) => p + 1);
            setTimeout(() => setPop(null), 420);
        }
    }, [done, onPour, strike]);

    useEffect(() => {
        const h = (e) => { if ((e.key === " " || e.key === "Enter") && !done) { e.preventDefault(); tap(); } };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [tap, done]);

    const sweep = PHASE_SWEEP_MS[Math.min(phase, PHASE_SWEEP_MS.length - 1)];
    // Running quality, so the bottom row means something while you play rather than only at the end.
    const heat = locked.length ? Math.round((locked.reduce((n, g) => n + (SCORE[g.key] ?? 0), 0) / (locked.length * 4)) * 100) : 0;

    return (
        <div className="smb-scrim" role="dialog" aria-label="Working the heat">
            <div className={`smb${shake ? ` is-shake-${shake}` : ""}`} onClick={(e) => e.stopPropagation()}>
                {flash ? <span key={flash.k} className="smb-flash" style={{ "--fc": flash.c }} aria-hidden="true" /> : null}

                <div className="smb-head">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {furnace?.sprite ? <img src={furnace.sprite} alt="" className={`smb-furnace${shake >= 3 ? " is-flare" : ""}`} draggable="false" /> : null}
                    {/* The fire banks up as the phases go — by the pour it is roaring. */}
                    <span className="smb-fire" style={{ opacity: 0.3 + phase * 0.17 }} aria-hidden="true" />
                    <div className="smb-head-txt">
                        <div className="smb-title">Work the heat</div>
                        <div className="smb-sub">{stack.smeltCost} {stack.name} &rarr; 1 part</div>
                    </div>
                </div>

                <div className="smb-steps">
                    {PHASE_LABELS.map((label, i) => (
                        <span key={label} className={`smb-step${i < phase ? " is-done" : ""}${i === phase ? " is-now" : ""}`}
                            style={i < phase && locked[i] ? { background: `${locked[i].color || GRADE_COLOR[locked[i].key]}28`, color: locked[i].color || GRADE_COLOR[locked[i].key] } : undefined}>
                            {label}
                        </span>
                    ))}
                </div>

                {/* THE BAR — nested bands, widest first, so each narrower one paints on top. */}
                <div className="smb-bar" aria-hidden="true">
                    {BANDS.map((b) => <span key={b.key} className={`smb-zone is-${b.key}`} style={{ width: `${b.pct}%` }} />)}
                    <span ref={markerEl} className="smb-marker" />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img ref={riderEl} className="smb-rider" src="/images/mining/track-crucible.png" alt="" draggable="false" />
                    {embers.map((e) => (
                        <span key={e.id} className="smb-ember" style={{ "--a": `${e.a}deg`, "--d": `${e.d}px`, background: e.c }} />
                    ))}
                    {pop ? (
                        <span key={pop.k} className="smb-pop" style={{ color: pop.color }}>
                            {pop.label}{pop.chain > 1 ? <b> &times;{pop.chain}</b> : null}
                        </span>
                    ) : null}
                </div>

                <button type="button" className="smb-tap" onPointerDown={(e) => { e.preventDefault(); tap(); }} disabled={done}>
                    {done ? "Pouring…" : PHASE_LABELS[Math.min(phase, PHASE_LABELS.length - 1)].toUpperCase()}
                </button>

                <div className="smb-meta">
                    <span>Pour <b>{Math.min(phase + 1, SMELT_PHASES)}</b>/{SMELT_PHASES}</span>
                    <span className={chain >= 3 ? "smb-chain-hot" : undefined}>Chain <b>&times;{chain}</b></span>
                    <span>Heat <b>{heat}%</b></span>
                </div>
                <div className="smb-key">
                    <span className="is-miss">SPILLED</span>
                    {BANDS.map((b) => <span key={b.key} className={`is-${b.key}`}>{b.label}</span>)}
                </div>
                {/* No way out. Once the crucible is up you pour it — same as the kitchen, which has never had a
                    bail-out button either. Nothing is spent until the run finishes, so an escape hatch bought
                    the player nothing except a reason to abandon a bad first pour and re-roll. */}
            </div>
            <style>{SMB_CSS}</style>
        </div>
    );
}

const SMB_CSS = `
.smb-scrim { position: fixed; inset: 0; z-index: 220; display: grid; place-items: center; padding: 18px;
    background: rgba(10,6,3,0.84); backdrop-filter: blur(3px); }
.smb { position: relative; overflow: hidden; width: min(440px, 100%); padding: 18px 18px 14px; border-radius: 20px;
    background: linear-gradient(180deg, #2a1c10, #170f08); border: 2px solid #b3762c;
    box-shadow: 0 20px 60px rgba(0,0,0,0.75); }
.smb-head { position: relative; display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.smb-furnace { width: 64px; height: 64px; object-fit: contain; position: relative; z-index: 1;
    filter: drop-shadow(0 0 10px rgba(255,150,40,0.5)); transition: filter .18s ease; }
.smb-furnace.is-flare { filter: drop-shadow(0 0 22px rgba(255,190,70,0.95)) brightness(1.25); }
.smb-fire { position: absolute; left: 6px; top: 4px; width: 62px; height: 62px; border-radius: 50%; pointer-events: none;
    background: radial-gradient(circle, rgba(255,160,40,0.75), transparent 68%); filter: blur(8px); transition: opacity .3s ease; }
.smb-head-txt { min-width: 0; }
.smb-title { font-weight: 900; font-size: 1.06rem; color: #ffd08a; }
.smb-sub { font-size: 0.76rem; color: #baa387; }
.smb-steps { display: flex; gap: 5px; margin-bottom: 12px; }
.smb-step { flex: 1 1 0; text-align: center; font-size: 0.64rem; font-weight: 800; padding: 5px 2px; border-radius: 7px;
    background: rgba(255,255,255,0.05); color: #8a7c6c; text-transform: uppercase; letter-spacing: .04em; }
.smb-step.is-now { background: #f0a93a; color: #170f08; }

.smb-bar { position: relative; display: block; width: 100%; height: 26px; border-radius: 999px; overflow: visible;
    background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.14); pointer-events: none; }
.smb-zone { position: absolute; top: 0; bottom: 0; left: 50%; transform: translateX(-50%); border-radius: 999px; }
.smb-zone.is-good { background: rgba(154,160,166,0.20); }
.smb-zone.is-great { background: rgba(126,200,255,0.26); }
.smb-zone.is-perfect { background: rgba(255,215,94,0.32); }
.smb-zone.is-pixel { background: rgba(255,158,196,0.62); box-shadow: 0 0 14px rgba(255,158,196,0.7); }
.smb-marker { position: absolute; top: -4px; bottom: -4px; width: 4px; margin-left: -2px; border-radius: 3px;
    background: linear-gradient(180deg, #fff, #ffd7a6); box-shadow: 0 0 12px #ffbf6a, 0 0 4px #fff; }
.smb-rider { position: absolute; top: -28px; transform: translateX(-50%); width: 26px; height: 26px;
    object-fit: contain; pointer-events: none; filter: drop-shadow(0 2px 3px rgba(0,0,0,0.6)); }
.smb-pop { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%); font-weight: 900; font-size: 1.05rem;
    letter-spacing: .04em; pointer-events: none; animation: smbPop .62s ease-out both; text-shadow: 0 2px 6px rgba(0,0,0,.85); }
.smb-pop b { font-size: 0.85em; }
@keyframes smbPop { 0% { opacity: 0; transform: translate(-50%,-30%) scale(.7); } 22% { opacity: 1; transform: translate(-50%,-58%) scale(1.16); } 100% { opacity: 0; transform: translate(-50%,-96%) scale(1); } }
.smb-ember { position: absolute; left: 50%; top: 50%; width: 5px; height: 5px; border-radius: 50%; pointer-events: none;
    animation: smbEmber .68s ease-out both; }
@keyframes smbEmber { 0% { opacity: 1; transform: translate(-50%,-50%) rotate(var(--a)) translateX(0) scale(1); }
                      100% { opacity: 0; transform: translate(-50%,-50%) rotate(var(--a)) translateX(var(--d)) scale(.2); } }

.smb-tap { display: block; width: 100%; margin-top: 12px; padding: 18px 16px; border-radius: 14px; cursor: pointer;
    font-size: 1.05rem; font-weight: 900; letter-spacing: 0.1em; color: #22160b; border: 0;
    background: linear-gradient(180deg, #ffd79a, #ef9f34);
    box-shadow: 0 6px 0 rgba(0,0,0,0.4), 0 10px 24px rgba(239,159,52,0.3);
    -webkit-tap-highlight-color: transparent; touch-action: manipulation; user-select: none; }
.smb-tap:active { transform: translateY(3px); box-shadow: 0 3px 0 rgba(0,0,0,0.4), 0 6px 14px rgba(239,159,52,0.24); }
.smb-tap:disabled { opacity: 0.55; cursor: default; transform: none; }
.smb-meta { display: flex; justify-content: space-between; gap: 8px; margin-top: 11px; font-size: 0.78rem; color: #bfae97; }
.smb-meta b { color: #ffd75e; }
.smb-chain-hot { animation: smbChain 0.9s ease-in-out infinite; }
.smb-chain-hot b { text-shadow: 0 0 10px rgba(255,215,94,0.75); }
@keyframes smbChain { 0%,100% { transform: scale(1) } 50% { transform: scale(1.13) } }
.smb-key { display: flex; justify-content: center; gap: 9px; margin-top: 8px; font-size: 9.5px; font-weight: 800; letter-spacing: .04em; }
.smb-key .is-miss { color: #ff8f9a; } .smb-key .is-good { color: #9aa0a6; } .smb-key .is-great { color: #7ec8ff; }
.smb-key .is-perfect { color: #ffd75e; } .smb-key .is-pixel { color: #ff9ec4; }

/* ── JUICE — impact scales with the grade, so the pour LOOKS as good as it scored ──────────────────────── */
.smb.is-shake-1 { animation: smbShake 0.16s ease-out; }
.smb.is-shake-2 { animation: smbShake 0.2s ease-out; --amp: 4px; }
.smb.is-shake-3 { animation: smbShake 0.24s ease-out; --amp: 7px; }
.smb.is-shake-4 { animation: smbShake 0.28s ease-out; --amp: 11px; }
@keyframes smbShake {
    0% { transform: translate(0,0) }
    20% { transform: translate(calc(var(--amp,2px) * -1), calc(var(--amp,2px) * 0.4)) rotate(-0.5deg) }
    45% { transform: translate(var(--amp,2px), calc(var(--amp,2px) * -0.3)) rotate(0.4deg) }
    70% { transform: translate(calc(var(--amp,2px) * -0.5), 0) rotate(-0.2deg) }
    100% { transform: translate(0,0) }
}
.smb-flash { position: absolute; inset: 0; pointer-events: none; z-index: 3; border-radius: 20px;
    background: radial-gradient(circle at 50% 45%, var(--fc), transparent 62%); animation: smbFlash 0.34s ease-out forwards; }
@keyframes smbFlash { 0% { opacity: 0.5 } 100% { opacity: 0 } }
`;
