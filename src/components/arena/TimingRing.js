"use client";

import { useEffect, useRef, useState } from "react";

// ── THE RING ─────────────────────────────────────────────────────────────────────────────────────────────────
// One ring, closing fast, one window. Tap when it meets the line — not too early, not too late.
//
// It appears over whoever is ACTING: over your opponent when you swing, over you when they do. That single
// rule is what makes an asynchronous fight honest. The other player is asleep; you play both halves, and their
// gear decides how hard your windows are. You lose by executing badly against a strong loadout, not by losing
// a dice roll to a bot pretending to be a person.
//
// Driven by rAF against a real clock rather than a CSS animation, because we need the OFFSET at the moment of
// the tap, and reading a transform mid-animation is not something you can do reliably.
export default function TimingRing({ ringMs, onResult, label, tone = "attack" }) {
    const [t, setT] = useState(0);          // 0 → 1, where 1 is the line
    const startedAt = useRef(0);
    const done = useRef(false);
    const raf = useRef(0);

    useEffect(() => {
        done.current = false;
        startedAt.current = performance.now();
        const tick = () => {
            const p = (performance.now() - startedAt.current) / ringMs;
            setT(p);
            // Overshoot a little past the line before calling it — tapping fractionally late is a grade, not a
            // disqualification, and cutting it off exactly at 1 would make late taps impossible to register.
            if (p >= 1.34) {
                if (!done.current) { done.current = true; onResult(1); }
                return;
            }
            raf.current = requestAnimationFrame(tick);
        };
        raf.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf.current);
    }, [ringMs, onResult]);

    const fire = () => {
        if (done.current) return;
        done.current = true;
        cancelAnimationFrame(raf.current);
        onResult(t - 1);                    // signed: negative early, positive late
    };

    // The closing ring is scaled from 2.6× down to 1×; the target sits at 1×.
    const scale = Math.max(0.9, 2.6 - 1.6 * Math.min(t, 1.35));
    const near = Math.abs(t - 1) <= 0.16;

    return (
        <button type="button" className={`tr is-${tone}${near ? " is-near" : ""}`} onPointerDown={fire} aria-label={label || "Time your strike"}>
            <span className="tr-target" />
            <span className="tr-ring" style={{ transform: `translate(-50%, -50%) scale(${scale})`, opacity: t > 1.3 ? 0 : 1 }} />
            <span className="tr-label">{label}</span>

            <style jsx>{`
                .tr { position: absolute; inset: 0; z-index: 20; display: grid; place-items: center;
                    background: none; border: 0; padding: 0; cursor: pointer; touch-action: manipulation; }
                /* The line you are aiming for. */
                .tr-target { position: absolute; left: 50%; top: 50%; width: 84px; height: 84px; margin: -42px 0 0 -42px;
                    border-radius: 50%; border: 3px solid rgba(255,255,255,0.85); box-shadow: 0 0 18px rgba(0,0,0,0.7); }
                .tr-ring { position: absolute; left: 50%; top: 50%; width: 84px; height: 84px; border-radius: 50%;
                    border: 5px solid var(--c); box-shadow: 0 0 24px var(--c), inset 0 0 14px var(--c); will-change: transform; }
                .tr.is-attack { --c: #ffd75e; }
                .tr.is-defend { --c: #6fd0ff; }
                /* It brightens as it lands, so the moment is felt as well as seen. */
                .tr.is-near .tr-target { border-color: #fff; box-shadow: 0 0 26px var(--c), inset 0 0 12px var(--c); }
                .tr-label { position: absolute; bottom: 12%; font-size: 11px; font-weight: 900; letter-spacing: .14em;
                    text-transform: uppercase; color: #fff; text-shadow: 0 2px 8px #000; }
            `}</style>
        </button>
    );
}
