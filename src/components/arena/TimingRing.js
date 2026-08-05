"use client";

import { useEffect, useRef } from "react";

import { gradeFor } from "@/lib/marketplace/arena-kit.js";

// ── THE RING ─────────────────────────────────────────────────────────────────────────────────────────────────
// One ring, closing fast, one window. Tap when it meets the line — not too early, not too late.
//
// It appears over whoever is ACTING: over your opponent when you swing, over you when they do. That single
// rule is what makes an asynchronous fight honest. The other player is asleep; you play both halves, and their
// gear decides how hard your windows are. You lose by executing badly against a strong loadout, not by losing
// a dice roll to a bot pretending to be a person.
//
// ── YOU CAN TAP ANYWHERE ────────────────────────────────────────────────────────────────────────────────────
// The hit area used to be the same element as the artwork, which sat on ONE HALF of the floor — so half of
// every tap aimed at the middle of the fight did nothing at all, with no way to know why. The button is now
// the whole pane and the ring is just a picture drawn inside it, positioned over whoever is acting.
//
// ── WHY THERE IS NO STATE IN HERE ───────────────────────────────────────────────────────────────────────────
// The first version held the ring's progress in useState and set it every frame. That re-rendered this whole
// component sixty times a second and it stuttered visibly. Worse, `onResult` is an inline arrow in the parent,
// so it got a fresh identity on every parent render — which meant arming an ability RESTARTED the ring
// mid-close, and the circle appeared to jump backwards.
//
// So: the animation writes to the node directly through a ref and React never re-renders during a beat, and
// the callback lives in a ref so the effect depends on nothing that changes while the ring is closing.
export default function TimingRing({ ringMs, onResult, label, tone = "attack", side = "right", hint = false }) {
    const rootRef = useRef(null);
    const ringRef = useRef(null);
    const echoRef = useRef(null);
    const burstRef = useRef(null);
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
                // No floor on the scale: it used to clamp at 0.9, which meant the ring reached its smallest
                // size just past the line and then SAT there at full opacity for another third of the
                // duration — a dead hang at the moment the beat was supposed to feel decided.
                el.style.transform = `translate(-50%, -50%) scale(${2.6 - 1.6 * p})`;
                el.style.opacity = p < 0.07 ? String(p / 0.07) : p > 1 ? String(Math.max(0, 1 - (p - 1) * 6)) : "1";
            }
            // A second ring a few frames behind the first. Costs nothing and gives the close a sense of
            // weight — one circle shrinking on its own reads like a loading spinner.
            const echo = echoRef.current;
            if (echo) {
                const q = Math.max(0, p - 0.07);
                echo.style.transform = `translate(-50%, -50%) scale(${2.6 - 1.6 * q})`;
                echo.style.opacity = String(Math.max(0, 0.34 * (1 - Math.max(0, p - 0.9) * 8)));
            }
            const isNear = Math.abs(p - 1) <= 0.21;
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
        const off = (performance.now() - startedAt.current) / ringMs - 1;

        // Grade it HERE too, purely for the feel. arena-kit is pure, so the client can use the same table the
        // server will — the burst fires on the same frame as your finger instead of after a round trip. The
        // server still decides the damage; this only decides the colour of the flash.
        const g = gradeFor(Math.min(1, Math.abs(off)));
        const b = burstRef.current;
        if (b) {
            b.className = `tr-burst is-${g.key}`;
            b.style.animation = "none";
            void b.offsetWidth;      // reflow, so the animation replays on a repeat grade
            b.style.animation = "";
        }
        if (ringRef.current) ringRef.current.style.opacity = "0";
        try {
            navigator.vibrate?.(g.key === "miss" ? 10 : g.key === "flawless" ? [0, 16, 26, 16] : g.key === "perfect" ? 26 : 16);
        } catch { /* haptics are a bonus */ }

        cb.current(off);
    };

    return (
        <button ref={rootRef} type="button" className={`tr is-${tone}`} onPointerDown={fire}
            aria-label={label || "Time your strike"}>
            <span className={`tr-eye is-${side}`}>
                {/* A faint band showing how much slop the window actually allows, so the tolerance is
                    something you can see rather than something you infer from being told you missed. */}
                <span className="tr-sweet" />
                <span className="tr-target" />
                {/* The tightest slice. If you land inside this, it's FLAWLESS — so the best grade in the game
                    is a thing you can aim at rather than a surprise. */}
                <span className="tr-core" />
                <span ref={echoRef} className="tr-echo" />
                <span ref={ringRef} className="tr-ring" />
                <span ref={burstRef} className="tr-burst" />
                <span className="tr-label">{label}</span>
                {hint ? <span className="tr-hint">tap anywhere</span> : null}
            </span>

            <style jsx>{`
                /* The whole pane is the button. */
                .tr { position: absolute; inset: 0; z-index: 20; background: none; border: 0; padding: 0;
                    cursor: pointer; touch-action: manipulation; }
                /* ...and the artwork is drawn over whoever is acting. */
                .tr-eye { position: absolute; top: 0; bottom: 0; width: 50%; display: grid; place-items: center; }
                .tr-eye.is-right { right: 0; }
                .tr-eye.is-left { left: 0; }

                .tr-target { position: absolute; left: 50%; top: 50%; width: var(--tr); height: var(--tr);
                    transform: translate(-50%, -50%); border-radius: 50%;
                    border: 3px solid rgba(255,255,255,0.85); box-shadow: 0 0 18px rgba(0,0,0,0.7);
                    transition: border-color .12s ease, box-shadow .12s ease; }
                .tr-sweet { position: absolute; left: 50%; top: 50%; width: calc(var(--tr) * 1.34);
                    height: calc(var(--tr) * 1.34); transform: translate(-50%, -50%); border-radius: 50%;
                    border: calc(var(--tr) * 0.17) solid var(--c); opacity: .13; transition: opacity .12s ease; }
                .tr-core { position: absolute; left: 50%; top: 50%; width: calc(var(--tr) * 0.82);
                    height: calc(var(--tr) * 0.82); transform: translate(-50%, -50%); border-radius: 50%;
                    border: 1px dashed rgba(255,255,255,0.4); opacity: .5; }

                .tr-ring, .tr-echo { position: absolute; left: 50%; top: 50%; width: var(--tr); height: var(--tr);
                    border-radius: 50%; will-change: transform, opacity; }
                .tr-ring { border: 5px solid var(--c); box-shadow: 0 0 24px var(--c), inset 0 0 14px var(--c); }
                .tr-echo { border: 2px solid var(--c); opacity: 0; }

                .tr.is-attack { --c: #ffd75e; }
                .tr.is-defend { --c: #6fd0ff; }

                /* It brightens as it lands, so the moment is felt as well as seen. */
                .tr.is-near .tr-target { border-color: #fff;
                    box-shadow: 0 0 30px var(--c), inset 0 0 14px var(--c); }
                .tr.is-near .tr-sweet { opacity: .32; }

                /* ── THE HIT ── fires on the same frame as your finger. */
                .tr-burst { position: absolute; left: 50%; top: 50%; width: var(--tr); height: var(--tr);
                    margin: calc(var(--tr) / -2) 0 0 calc(var(--tr) / -2); border-radius: 50%;
                    opacity: 0; pointer-events: none; }
                .tr-burst.is-flawless { border: 4px solid #fff5c2;
                    box-shadow: 0 0 40px #ffe28a, inset 0 0 26px #ffe28a; animation: trBurst .5s ease-out; }
                .tr-burst.is-perfect { border: 4px solid #ffe28a;
                    box-shadow: 0 0 30px #ffc94a; animation: trBurst .45s ease-out; }
                .tr-burst.is-great { border: 3px solid #8bf0b4; box-shadow: 0 0 22px #8bf0b4;
                    animation: trBurst .4s ease-out; }
                .tr-burst.is-good { border: 3px solid #cbd3dc; animation: trBurst .35s ease-out; }
                .tr-burst.is-miss { border: 2px solid #ff8f9a; animation: trMiss .35s ease-out; }
                @keyframes trBurst {
                    from { opacity: 1; transform: scale(.62); }
                    to { opacity: 0; transform: scale(2.5); } }
                @keyframes trMiss {
                    from { opacity: .9; transform: scale(1); }
                    to { opacity: 0; transform: scale(.5); } }

                .tr-label { position: absolute; bottom: 8%; font-size: 11px; font-weight: 900; letter-spacing: .14em;
                    text-transform: uppercase; color: #fff; text-shadow: 0 2px 8px #000; }
                .tr-hint { position: absolute; bottom: 2%; font-size: 9.5px; letter-spacing: .1em;
                    text-transform: uppercase; color: rgba(255,255,255,0.62); text-shadow: 0 2px 8px #000; }
            `}</style>
        </button>
    );
}
