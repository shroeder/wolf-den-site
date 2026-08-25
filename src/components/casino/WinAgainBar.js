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
const BLOW_MS = 2200;       // the explosion, on top of everything, before the round carries on

// No `bet` any more: the row arrives in chips, so there is nothing left here to convert — and a
// prop the component does not read is a second opinion about units waiting to disagree with the first.
export default function WinAgainBar({ meter, firing, onFired }) {
    const slots = meter?.slots || 5;
    const recent = meter?.recent || [];
    const [lit, setLit] = useState(-1);
    const [total, setTotal] = useState(null);
    const [blown, setBlown] = useState(false);   // the explosion is up
    const timers = useRef([]);
    useEffect(() => () => timers.current.forEach(clearTimeout), []);

    useEffect(() => {
        // Not reset with setState here — the lights are DERIVED from `firing` further down, so an idle bar
        // needs no state change to look idle. Setting it synchronously in an effect is a cascading render
        // for a value the render can already work out.
        if (!firing) { return undefined; }
        // ── LEFT TO RIGHT, ONE AT A TIME ─────────────────────────────────────────────────────────────
        // The whole feeling of the reference is that it counts them off rather than flashing the row. Each
        // one is its own beat with its own note, climbing, so five slots sound like a build and not a loop.
        let i = 0;
        const step = () => {
            if (i >= recent.length) {
                // ── AND THEN IT GOES OFF ─────────────────────────────────────────────────────────────
                // Luke: "if you win it again it needs to pop off and explode to let you know."
                //
                // It was a cell that scaled up and glowed, which is a state change, not an event. The row
                // counting itself off is the BUILD; this is the thing the build was for, and it has to be
                // loud enough that you could not possibly miss it while looking somewhere else on the
                // cabinet — which, since the row lives above the reels, is exactly where you are looking.
                setTotal(firing.total);
                setBlown(true);
                Cas.jackpot();
                Haptic.crit();
                timers.current.push(setTimeout(() => onFired?.(), BLOW_MS));
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
        <div className={`wa${firing ? " is-firing" : ""}${firing && blown ? " is-blown" : ""}`}>
            {/* Chrome stars bolted to each end, one sprite mirrored — see gen-vault-art.mjs. */}
            <div className="wa-title"><i aria-hidden="true" />{meter?.label || "WIN IT AGAIN"}<i aria-hidden="true" /></div>
            <div className="wa-row">
                {Array.from({ length: slots }).map((_, i) => {
                    // A ZERO IS A BLANK, not the digit 0. Every manual spin advances the row now, including
                    // a losing one — see the note in playSpin — and a column of "0"s would read as five wins
                    // of nothing rather than as your good spins being pushed toward the edge.
                    const v = recent[i];
                    const won = Number(v) > 0;
                    return (
                        <div key={i} className={`wa-slot${won ? " is-full" : ""}${firing && lit >= i ? " is-lit" : ""}`}>
                            <b>{won ? Math.round(v).toLocaleString() : ""}</b>
                            {/* Numbers, not "RECENT WIN 2". The reference has a cabinet's width to spend and
                                this has 375px — the words were the widest thing in the row and the row is
                                what has to fit. */}
                            <em>{i + 1}</em>
                        </div>
                    );
                })}
                {/* The divider before it — a rule in the rack, so the sum cannot be counted as a sixth win. */}
                <i className="wa-div" aria-hidden="true" />
                <div className={`wa-total${firing && total != null ? " is-paid" : ""}`}>
                    {/* The row arrives in chips now (see the meter payload), so the total is a plain sum —
                        it used to multiply by the bet a second time, which is where the four-times-too-big
                        numbers came from. */}
                    <b>{Math.round(firing && total != null ? total : recent.reduce((a, n) => a + n, 0)).toLocaleString()}</b>
                    <em>total</em>
                </div>
            </div>

            {/* ── THE EXPLOSION ───────────────────────────────────────────────────────────────────────
                Sits over the whole bar rather than inside a cell, because the thing that just happened is
                the ROW emptying, not one window lighting. Sixteen shards thrown from the middle, a shock
                ring, and the number slammed in over the top of both. */}
            {firing && blown ? (
                <div className="wa-blow" aria-live="polite">
                    <i className="wa-blow-ring" aria-hidden="true" />
                    <span className="wa-blow-shards" aria-hidden="true">
                        {Array.from({ length: 16 }, (_, k) => <i key={k} style={{ "--k": k }} />)}
                    </span>
                    <b className="wa-blow-kick">{meter?.label || "WIN IT AGAIN"}</b>
                    <b className="wa-blow-n">{(firing.total || 0).toLocaleString()}</b>
                </div>
            ) : null}
        </div>
    );
}
