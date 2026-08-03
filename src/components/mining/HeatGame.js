"use client";

import { useEffect, useRef, useState } from "react";

import { Img } from "@/components/mining/kit";
import { heatBand, heatZone, HEAT_MAX } from "@/lib/marketplace/smelt-heat.js";

// ── THE POUR ─────────────────────────────────────────────────────────────────────────────────────────────────
// The furnace climbs from cold to burnt on its own. You tip the crucible when you like. The good band sits near
// the top, so the pour is a nerve game: hold for the perfect window and risk cooking the whole batch.
//
// Deliberately a DIFFERENT hand from the swing — that one is a moving marker you catch, this one is a rising bar
// you have to let run. The zones are drawn from the same bands the server grades against, so what's lit is
// what pays.
const RISE_MS = 2600; // cold → burnt
const HOT = heatZone("hot");
const PERFECT = heatZone("perfect");

export default function HeatGame({ stack, furnace, onPour, onCancel }) {
    const [heat, setHeat] = useState(0);
    const heatRef = useRef(0);
    const doneRef = useRef(false);

    useEffect(() => {
        let raf = 0;
        const t0 = performance.now();
        const loop = (t) => {
            const h = (t - t0) / RISE_MS;
            heatRef.current = h;
            setHeat(h);
            if (h >= HEAT_MAX) { // let it run away and it's cooked — the pour still happens, just badly
                if (!doneRef.current) { doneRef.current = true; onPour(HEAT_MAX); }
                return;
            }
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, [onPour]);

    const tip = () => { if (doneRef.current) return; doneRef.current = true; onPour(heatRef.current); };
    const pct = Math.min(100, (heat / HEAT_MAX) * 100);
    const band = heatBand(heat);

    return (
        <div className="mine-modal" role="dialog" aria-label="Working the heat">
            <div className="mine-modal-card" onClick={(e) => e.stopPropagation()}>
                <h3 style={{ color: "#ffd08a", marginTop: 0 }}>Work the heat</h3>
                <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>
                    {stack.canSmelt * stack.smeltCost} {stack.name} in the crucible. Pour when it&rsquo;s right — the
                    best window is just short of burning it.
                </p>
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
                <button type="button" className="mine-prospect" onPointerDown={(e) => { e.preventDefault(); tip(); }}>
                    <Img src="/images/mining/track-crucible.png" className="mine-btn-ico" fallback="" /> Pour
                </button>
                <button type="button" className="mine-prospect is-ghost" onClick={onCancel}>Back off the fire</button>
            </div>
        </div>
    );
}
