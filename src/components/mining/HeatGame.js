"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Img } from "@/components/mining/kit";
import { PHASE_LABELS, PHASE_SWEEP_MS, SMELT_PHASES, smeltGrade } from "@/lib/marketplace/smelt-heat.js";
import { bandPct, GRADE_COLOR } from "@/lib/marketplace/timing.js";

// ── THE SMELT ────────────────────────────────────────────────────────────────────────────────────────────────
// The same bar as the anvil, the kitchen and the rock face: a marker sweeping nested bands, graded on how close
// to dead centre you stopped it. It used to be a fill creeping cold-to-burnt with two lit zones and one slow
// tap — a different, much easier game wearing the same hat.
//
// THREE pours, each faster: 1100ms → 820ms → 600ms for a full sweep. By the last one the PIXEL band is on
// screen for about 27ms.
const BAND_LABEL = { good: "GOOD", great: "CLEAN", perfect: "PERFECT", pixel: "FLAWLESS" };
const BANDS = ["good", "great", "perfect", "pixel"].map((key) => ({
    key, pct: bandPct(key), label: BAND_LABEL[key], color: GRADE_COLOR[key],
}));

export default function HeatGame({ stack, furnace, onPour, onCancel }) {
    const [phase, setPhase] = useState(0);
    const [marker, setMarker] = useState(0);
    const [locked, setLocked] = useState([]);   // the grade banked on each finished phase
    const [pop, setPop] = useState(null);
    const [shake, setShake] = useState(false);
    const markerRef = useRef(0);
    const doneRef = useRef(false);
    const dists = useRef([]);

    // One sweep per phase, at that phase's speed. Restarting on `phase` is deliberate — each pour is its own
    // run, and the marker should snap back to the left when the next one starts.
    useEffect(() => {
        if (doneRef.current) return undefined;
        const ms = PHASE_SWEEP_MS[Math.min(phase, PHASE_SWEEP_MS.length - 1)];
        let raf = 0;
        const t0 = performance.now();
        const loop = (t) => {
            const cycle = ((t - t0) % (ms * 2)) / ms;
            const pos = cycle <= 1 ? cycle : 2 - cycle;   // bounce, never a jump back to 0
            markerRef.current = pos;
            setMarker(pos);
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, [phase]);

    const tap = useCallback(() => {
        if (doneRef.current) return;
        const dist = Math.abs(markerRef.current - 0.5);
        const grade = smeltGrade(dist);
        dists.current = [...dists.current, dist];
        setLocked((l) => [...l, grade]);
        setPop({ k: Date.now(), label: grade.label, color: grade.color || GRADE_COLOR[grade.key] || "#fff" });
        setShake(true);
        setTimeout(() => setShake(false), 200);
        try {
            navigator.vibrate?.(grade.key === "pixel" ? [26, 30, 26, 30, 60] : grade.key === "perfect" ? [20, 30, 40] : [12]);
        } catch { /* no haptics */ }

        if (dists.current.length >= SMELT_PHASES) {
            doneRef.current = true;
            setTimeout(() => onPour(dists.current), 260);
        } else {
            setTimeout(() => { setPop(null); setPhase((p) => p + 1); }, 240);
        }
    }, [onPour]);

    const sweep = PHASE_SWEEP_MS[Math.min(phase, PHASE_SWEEP_MS.length - 1)];

    return (
        <div className="mine-modal" role="dialog" aria-label="Working the heat">
            <div className={`mine-modal-card${shake ? " is-hit" : ""}`} onClick={(e) => e.stopPropagation()}>
                <h3 style={{ color: "#ffd08a", marginTop: 0 }}>Work the heat</h3>
                <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>
                    {stack.smeltCost} {stack.name} &rarr; 1 part. Three pours, and the bar is faster every time.
                </p>

                <div className="mine-heat-steps">
                    {PHASE_LABELS.map((label, i) => (
                        <span key={label} className={`mine-heat-step${i < phase ? ` is-done is-${locked[i]?.key || "good"}` : ""}${i === phase ? " is-now" : ""}`}>
                            {label}
                            {locked[i] ? <em>{locked[i].label}</em> : null}
                        </span>
                    ))}
                </div>

                <div className="mine-heat-stage">
                    <Img src={furnace?.sprite} className="mine-heat-furnace" fallback="" />
                    <span className="mine-heat-glow" style={{ opacity: 0.35 + phase * 0.22 }} aria-hidden="true" />
                </div>

                {/* THE BAR — nested bands, widest first, so each narrower one paints on top. */}
                <div className="smb-bar" aria-hidden="true">
                    {BANDS.map((b) => <span key={b.key} className={`smb-zone is-${b.key}`} style={{ width: `${b.pct}%` }} />)}
                    <span className="smb-marker" style={{ left: `${marker * 100}%` }} />
                    {pop ? <span key={pop.k} className="smb-pop" style={{ color: pop.color }}>{pop.label}</span> : null}
                </div>
                <div className="smb-key">
                    <span className="is-miss">MISS</span>
                    {BANDS.map((b) => <span key={b.key} className={`is-${b.key}`}>{b.label}</span>)}
                </div>

                <button type="button" className="mine-prospect" onPointerDown={(e) => { e.preventDefault(); tap(); }}>
                    <Img src="/images/mining/track-crucible.png" className="mine-btn-ico" fallback="" />
                    {PHASE_LABELS[Math.min(phase, PHASE_LABELS.length - 1)].toUpperCase()}
                    <em>{phase + 1} of {SMELT_PHASES} &middot; {(sweep / 1000).toFixed(2)}s sweep</em>
                </button>
                <button type="button" className="mine-prospect is-ghost" onClick={onCancel}>Back off the fire</button>
            </div>
        </div>
    );
}
