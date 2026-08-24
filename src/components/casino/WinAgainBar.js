"use client";

import { useEffect, useRef, useState } from "react";

import { Cas } from "@/components/casino/casino-audio.js";
import { Haptic } from "@/components/arena/arena-audio.js";

// ── WIN IT AGAIN ─────────────────────────────────────────────────────────────────────────────────────────────
// Luke, with the reference cabinet in hand: "every time you win an amount, that goes up top. And then if you
// get three cascades in a row it does this animation where it goes boom boom boom and it highlights each of
// the things across the top from left to right, and does a win-it-again sound effect, and you win all the
// amount in the top right."
//
// The row is the point of the machine, and it is the point precisely because it is on screen while nothing is
// happening. Five slots holding your last five wins means an ordinary spin — the kind every other cabinet
// throws away — is now worth something to a spin you have not taken yet. Nothing else on this floor does that.
//
// It draws only. The row's contents and whether it fired are both decided server-side (mkt_casino_meter, and
// the note on playSpin's `meter` parameter); this walks the lights left to right and hands back.
const STEP_MS = 260;        // one slot lighting — the "boom"
const HOLD_MS = 900;        // the total sitting there before the round carries on

export default function WinAgainBar({ meter, bet, firing, onFired }) {
    const slots = meter?.slots || 5;
    const recent = meter?.recent || [];
    const [lit, setLit] = useState(-1);
    const [total, setTotal] = useState(null);
    const timers = useRef([]);
    useEffect(() => () => timers.current.forEach(clearTimeout), []);

    useEffect(() => {
        // Not reset with setState here — the lights are DERIVED from `firing` further down, so an idle bar
        // needs no state change to look idle. Setting it synchronously in an effect is a cascading render
        // for a value the render can already work out.
        if (!firing) return undefined;
        // ── LEFT TO RIGHT, ONE AT A TIME ─────────────────────────────────────────────────────────────
        // The whole feeling of the reference is that it counts them off rather than flashing the row. Each
        // one is its own beat with its own note, climbing, so five slots sound like a build and not a loop.
        let i = 0;
        const step = () => {
            if (i >= recent.length) {
                setTotal(firing.total);
                Cas.jackpot();
                Haptic.crit();
                timers.current.push(setTimeout(() => onFired?.(), HOLD_MS));
                return;
            }
            setLit(i);
            Cas.coin(Math.min(4, i));
            Haptic.hit(0.3 + Math.min(0.5, i * 0.1));
            i += 1;
            timers.current.push(setTimeout(step, STEP_MS));
        };
        step();
        const mine = timers.current;
        return () => mine.forEach(clearTimeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [firing]);

    // Nothing in the row and nothing firing is a bar with nothing to say — but it still draws, empty,
    // because a meter that appears only once it has something in it never teaches anybody it exists.
    return (
        <div className={`wa${firing ? " is-firing" : ""}`}>
            <div className="wa-title">{meter?.label || "WIN IT AGAIN"}</div>
            <div className="wa-row">
                {Array.from({ length: slots }).map((_, i) => {
                    const v = recent[i];
                    return (
                        <div key={i} className={`wa-slot${v != null ? " is-full" : ""}${firing && lit >= i ? " is-lit" : ""}`}>
                            <b>{v != null ? Math.round(v * (bet || 0)).toLocaleString() : ""}</b>
                            {/* Numbers, not "RECENT WIN 2". The reference has a cabinet's width to spend and
                                this has 375px — the words were the widest thing in the row and the row is
                                what has to fit. */}
                            <em>{i + 1}</em>
                        </div>
                    );
                })}
                <div className={`wa-total${firing && total != null ? " is-paid" : ""}`}>
                    <b>{(firing && total != null ? total : recent.reduce((a, n) => a + n, 0) * (bet || 0)).toLocaleString(undefined, { maximumFractionDigits: 0 })}</b>
                    <em>total</em>
                </div>
            </div>
        </div>
    );
}
