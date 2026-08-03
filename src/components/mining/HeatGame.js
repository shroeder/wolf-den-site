"use client";

import { useEffect, useRef, useState } from "react";

import { Img } from "@/components/mining/kit";
import { heatBand, heatZone, HEAT_MAX, PHASE_LABELS, PHASE_RISE_MS, SMELT_PHASES } from "@/lib/marketplace/smelt-heat.js";

// ── THE SMELT ────────────────────────────────────────────────────────────────────────────────────────────────
// THREE pours, each faster than the last.
//
// It was one tap on a slow bar that melted your entire stack — twenty-four ore and eight parts for a single
// easy press, which is why the minigame did not matter. Now it is a hand: Charge, Melt, Pour, with the bar
// running 2600ms → 1900ms → 1350ms, so the window to hit PERFECT narrows from 260ms to 135ms as you go. The
// kitchen speeds up per step and the mine's bar tightens per swing; this is the same idea in a furnace.
//
// And it smelts ONE batch — whatever the row says, 3 ore into 1 part — so the game is played per part rather
// than once a day.
//
// The zones are drawn from the same bands the server grades against, so what's lit is what pays.
const HOT = heatZone("hot");
const PERFECT = heatZone("perfect");

export default function HeatGame({ stack, furnace, onPour, onCancel }) {
    const [phase, setPhase] = useState(0);
    const [heat, setHeat] = useState(0);
    const [locked, setLocked] = useState([]);   // the band you got on each finished phase
    const heatRef = useRef(0);
    const doneRef = useRef(false);
    const readings = useRef([]);

    // One rising bar per phase. Restarting on `phase` is deliberate: each phase is its own run at its own
    // speed, and the bar should visibly snap back to cold when the next one starts.
    useEffect(() => {
        if (doneRef.current) return undefined;
        const rise = PHASE_RISE_MS[Math.min(phase, PHASE_RISE_MS.length - 1)];
        let raf = 0;
        const t0 = performance.now();
        const loop = (t) => {
            const h = (t - t0) / rise;
            heatRef.current = h;
            setHeat(h);
            // Let it run away and it's cooked — the pour still happens, just badly.
            if (h >= HEAT_MAX) { commit(HEAT_MAX); return; }
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase]);

    // Bank this phase's reading and move on — or finish the smelt.
    const commit = (h) => {
        if (doneRef.current) return;
        readings.current = [...readings.current, h];
        setLocked((l) => [...l, heatBand(h)]);
        if (readings.current.length >= SMELT_PHASES) {
            doneRef.current = true;
            onPour(readings.current);
        } else {
            heatRef.current = 0;
            setHeat(0);
            setPhase((p) => p + 1);
        }
    };

    const pct = Math.min(100, (heat / HEAT_MAX) * 100);
    const band = heatBand(heat);
    const rise = PHASE_RISE_MS[Math.min(phase, PHASE_RISE_MS.length - 1)];

    return (
        <div className="mine-modal" role="dialog" aria-label="Working the heat">
            <div className="mine-modal-card" onClick={(e) => e.stopPropagation()}>
                <h3 style={{ color: "#ffd08a", marginTop: 0 }}>Work the heat</h3>
                <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>
                    {stack.smeltCost} {stack.name} in the crucible &rarr; 1 part. Three pours, and the bar runs
                    faster each time.
                </p>

                {/* The three phases, so you can see what's left and what you've already banked. */}
                <div className="mine-heat-steps">
                    {PHASE_LABELS.map((label, i) => (
                        <span key={label} className={`mine-heat-step${i < phase ? ` is-done is-${locked[i]?.key || "warm"}` : ""}${i === phase ? " is-now" : ""}`}>
                            {label}
                            {locked[i] ? <em>{locked[i].short}</em> : null}
                        </span>
                    ))}
                </div>

                <div className="mine-heat-stage">
                    <Img src={furnace?.sprite} className="mine-heat-furnace" fallback="" />
                    <span className="mine-heat-glow" style={{ opacity: Math.min(1, heat) }} aria-hidden="true" />
                </div>
                <div className="mine-heat-bar" aria-hidden="true">
                    <span className="mine-heat-zone is-hot" style={{ left: `${HOT.left}%`, width: `${HOT.width}%` }} />
                    <span className="mine-heat-zone is-perfect" style={{ left: `${PERFECT.left}%`, width: `${PERFECT.width}%` }} />
                    <span className="mine-heat-fill" style={{ width: `${pct}%` }} />
                </div>
                <div className={`mine-heat-read is-${band.key}`}>{band.short}</div>

                <button type="button" className="mine-prospect" onPointerDown={(e) => { e.preventDefault(); commit(heatRef.current); }}>
                    <Img src="/images/mining/track-crucible.png" className="mine-btn-ico" fallback="" />
                    {phase < SMELT_PHASES - 1 ? PHASE_LABELS[phase] : "Pour"}
                    <em>{(rise / 1000).toFixed(1)}s bar &middot; {phase + 1} of {SMELT_PHASES}</em>
                </button>
                <button type="button" className="mine-prospect is-ghost" onClick={onCancel}>Back off the fire</button>
            </div>
        </div>
    );
}
