"use client";

import { useEffect, useRef } from "react";

// ── THE RING ─────────────────────────────────────────────────────────────────────────────────────────────────
// One ring, closing fast, one window. Tap when it meets the line — not too early, not too late.
//
// It appears over whoever is ACTING: over your opponent when you swing, over you when they do. That single
// rule is what makes an asynchronous fight honest. The other player is asleep; you play both halves, and their
// gear decides how hard your windows are. You lose by executing badly against a strong loadout, not by losing
// a dice roll to a bot pretending to be a person.
//
// ── WHY THERE IS NO STATE IN HERE ───────────────────────────────────────────────────────────────────────────
// The first version held the ring's progress in useState and set it every frame. That re-rendered this whole
// component sixty times a second and it stuttered visibly. Worse, `onResult` is an inline arrow in the parent,
// so it got a fresh identity on every parent render — which meant arming an ability RESTARTED the ring
// mid-close, and the circle appeared to jump backwards.
//
// So: the animation writes to the node directly through a ref and React never re-renders during a beat, and
// the callback lives in a ref so the effect depends on nothing that changes while the ring is closing.
export default function TimingRing({ ringMs, onResult, label, tone = "attack" }) {
    const rootRef = useRef(null);
    const ringRef = useRef(null);
    const startedAt = useRef(0);
    const done = useRef(false);
    const raf = useRef(0);
    const near = useRef(false);

    // Held in a ref precisely so a changing callback identity cannot restart the animation.
    const cb = useRef(onResult);
    cb.current = onResult;

    useEffect(() => {
        done.current = false;
        near.current = false;
        startedAt.current = performance.now();

        const tick = (now) => {
            const p = (now - startedAt.current) / ringMs;
            const el = ringRef.current;
            if (el) {
                // Linear, so the closing speed is honest and learnable — an eased ring would arrive at a
                // different rate than it looks like it will, which is exactly the wrong lesson to teach.
                // No floor on the scale. It used to clamp at 0.9, which meant the ring reached its smallest
                // size just past the line and then SAT there at full opacity for another third of the
                // duration — a dead hang at the exact moment the beat was supposed to feel decided. It now
                // keeps collapsing through the target and fades as it goes, so a miss looks like a miss.
                el.style.transform = `translate(-50%, -50%) scale(${2.6 - 1.6 * p})`;
                // Fades in over the first sliver rather than popping into existence at full size, and clears
                // out quickly once it is past the line.
                el.style.opacity = p < 0.07 ? String(p / 0.07) : p > 1 ? String(Math.max(0, 1 - (p - 1) * 6)) : "1";
            }
            const isNear = Math.abs(p - 1) <= 0.16;
            if (isNear !== near.current) {
                near.current = isNear;
                rootRef.current?.classList.toggle("is-near", isNear);
            }
            // Overshoot a little past the line before calling it — tapping fractionally late is a grade, not a
            // disqualification, and cutting off exactly at 1 would make late taps impossible to register.
            if (p >= 1.18) {
                if (!done.current) { done.current = true; cb.current(1); }
                return;
            }
            raf.current = requestAnimationFrame(tick);
        };
        raf.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf.current);
    }, [ringMs]);

    const fire = () => {
        if (done.current) return;
        done.current = true;
        cancelAnimationFrame(raf.current);
        // Read the offset off the clock at the instant of the tap rather than off the last painted frame —
        // at 60fps that alone was up to 16ms of avoidable error on a window measured in tens of ms.
        cb.current((performance.now() - startedAt.current) / ringMs - 1);
    };

    return (
        <button ref={rootRef} type="button" className={`tr is-${tone}`} onPointerDown={fire}
            aria-label={label || "Time your strike"}>
            <span className="tr-target" />
            <span className="tr-sweet" />
            <span ref={ringRef} className="tr-ring" style={{ transform: "translate(-50%, -50%) scale(2.6)", opacity: 0 }} />
            <span className="tr-label">{label}</span>

            <style jsx>{`
                .tr { position: absolute; inset: 0; z-index: 20; display: grid; place-items: center;
                    background: none; border: 0; padding: 0; cursor: pointer; touch-action: manipulation; }
                /* The line you are aiming for. */
                .tr-target { position: absolute; left: 50%; top: 50%; width: var(--tr); height: var(--tr);
                    transform: translate(-50%, -50%); border-radius: 50%;
                    border: 3px solid rgba(255,255,255,0.85); box-shadow: 0 0 18px rgba(0,0,0,0.7); }
                /* A faint band showing how much slop the window actually allows, so the tolerance is
                   something you can see rather than something you infer from being told you missed. */
                .tr-sweet { position: absolute; left: 50%; top: 50%; width: calc(var(--tr) * 1.32);
                    height: calc(var(--tr) * 1.32); transform: translate(-50%, -50%); border-radius: 50%;
                    border: calc(var(--tr) * 0.17) solid var(--c); opacity: .13; }
                .tr-ring { position: absolute; left: 50%; top: 50%; width: var(--tr); height: var(--tr);
                    border-radius: 50%; border: 5px solid var(--c);
                    box-shadow: 0 0 24px var(--c), inset 0 0 14px var(--c); will-change: transform, opacity; }
                .tr.is-attack { --c: #ffd75e; }
                .tr.is-defend { --c: #6fd0ff; }
                /* It brightens as it lands, so the moment is felt as well as seen. */
                .tr.is-near .tr-target { border-color: #fff; box-shadow: 0 0 26px var(--c), inset 0 0 12px var(--c); }
                .tr.is-near .tr-sweet { opacity: .3; }
                .tr-label { position: absolute; bottom: 9%; font-size: 11px; font-weight: 900; letter-spacing: .14em;
                    text-transform: uppercase; color: #fff; text-shadow: 0 2px 8px #000; }
            `}</style>
        </button>
    );
}
