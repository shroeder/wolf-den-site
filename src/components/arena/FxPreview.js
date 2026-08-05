"use client";

import { useEffect, useState } from "react";

import SpriteFx from "@/components/arena/SpriteFx";

// ── THE VFX BENCH ────────────────────────────────────────────────────────────────────────────────────────────
// Every effect, playing at the size it plays at in a real bout, over the real arena plate, side by side.
//
// This exists because "do the effects look good" is not answerable by the checks that were being run. Reading
// the DOM tells you WHICH sheet is mounted, which is correctness, not quality; and watching one skill in a
// filmstrip tells you about that skill. Neither one catches an eight-frame sequence that steps unevenly, an
// effect that is invisible against warm sand, or one that plays so small it reads as a smudge.
//
// Looping on a fixed cadence so a screenshot at any moment catches every effect at the SAME point in its own
// animation — which is what makes ten of them comparable in one picture.
const KINDS = ["strike", "flurry", "spell", "execute", "rend", "drain", "sunder", "ward", "surge", "riposte", "gamble"];
const CYCLE = 1400;

export default function FxPreview() {
    const [n, setN] = useState(0);
    // ?frame=N PAUSES every effect on frame N. Racing a 560ms animation with a screenshot is not a test —
    // it caught the blank held state after the animation finished and reported "nothing renders" for all
    // eleven. A negative animation-delay seeks; paused holds. Deterministic, and comparable across effects.
    const [frame, setFrame] = useState(null);
    useEffect(() => {
        const q = new URLSearchParams(window.location.search);
        const f = q.get("frame");
        if (f !== null) { setFrame(Math.max(0, Math.min(7, Number(f) || 0))); return undefined; }
        const t = setInterval(() => setN((x) => x + 1), CYCLE);
        return () => clearInterval(t);
    }, []);
    return (
        <div className={`fxb${frame !== null ? " is-paused" : ""}`}
            style={frame !== null ? { "--seek": `-${(frame * 560) / 8 + 8}ms` } : undefined}>
            {KINDS.map((k) => (
                <div key={k} className="fxb-cell">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="fxb-bg" src="/images/arena/arena-bg.webp" alt="" draggable="false" />
                    <span className="fxb-scrim" aria-hidden="true" />
                    {/* A stand-in for a fighter, so an effect is judged against a body rather than empty sand. */}
                    <span className="fxb-body" aria-hidden="true" />
                    <SpriteFx key={`${k}-${n}-${frame ?? "live"}`} kind={k} side="right" />
                    <b className="fxb-lab">{k}</b>
                </div>
            ))}
            <style jsx global>{`
                /* CELL SIZE MATTERS AND THE FIRST VERSION GOT IT WRONG. At 150x190 a cell was smaller than
                   the 210px effect it was supposed to be showing, and .sfx is only 52% of its parent — so
                   most of every effect fell outside the cell and was cut off by overflow:hidden. Seven of
                   eleven effects looked "invisible" and the sheets were fine; the BENCH was broken.
                   These now match the real ring's proportions (~310 wide), so what is shown here is what
                   plays in a bout. */
                .fxb { display: grid; grid-template-columns: repeat(auto-fit, minmax(310px, 1fr)); gap: 10px; padding: 10px; }
                .fxb-cell { position: relative; height: 330px; border-radius: 12px; overflow: hidden;
                    border: 1px solid rgba(255,190,110,0.3); background: #150f0c; }
                .fxb-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
                    object-position: 38% 100%; transform: scale(1.25); transform-origin: 50% 100%; }
                .fxb-scrim { position: absolute; inset: 0;
                    background: radial-gradient(58% 30% at 50% 84%, rgba(255,186,92,0.18), transparent 72%),
                                radial-gradient(95% 80% at 50% 56%, transparent, rgba(10,6,4,0.5)); }
                .fxb-body { position: absolute; right: 20%; bottom: 6%; width: 92px; height: 150px;
                    border-radius: 40% 40% 22% 22%; background: linear-gradient(180deg, #6b5330, #2a2018);
                    box-shadow: 0 8px 14px rgba(0,0,0,.6); }
                /* Seek-and-hold, so a screenshot lands on a KNOWN frame instead of racing a 560ms animation
                   — which is how "nothing renders" got reported for all eleven when the capture simply
                   landed after they had finished. */
                .fxb.is-paused .sfx > i { animation-play-state: paused !important;
                    animation-delay: var(--seek) !important; }
                .fxb-lab { position: absolute; left: 7px; top: 6px; z-index: 30; font-size: 10px; font-weight: 900;
                    letter-spacing: .14em; text-transform: uppercase; color: #ffe0b0; text-shadow: 0 2px 6px #000; }
            `}</style>
        </div>
    );
}
