"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Cas } from "@/components/casino/casino-audio.js";
import { Haptic } from "@/components/arena/arena-audio.js";

// ── HOLD AND SPIN ────────────────────────────────────────────────────────────────────────────────────────────
// The Wagon on The Harvest, the Stampede on The Menagerie — and the reason those two cabinets do not simply
// have The Hunt's pick.
//
// A PICK AND A HOLD ARE OPPOSITE TENSIONS, which is the whole point of giving two machines each. A pick is
// "how long can I keep going before I turn over the wrong one" — every tap is a decision and the round ends
// because you chose badly. A hold is "please, one more": nothing is chosen at all, every coin that lands
// resets the counter to three, and the round ends because luck ran out. One is nerve, the other is hope.
//
// So this screen takes the whole board like the pen does, but it plays ITSELF. There is nothing to tap, and
// that is correct — a button here would be a lie about who is deciding.

const CELLS = 15;

export default function HoldAndSpin({ hold, onDone }) {
    const [step, setStep] = useState(0);
    const [flash, setFlash] = useState([]);      // cells that landed on this step
    const timers = useRef([]);
    useEffect(() => () => timers.current.forEach(clearTimeout), []);

    const steps = useMemo(() => hold?.steps || [], [hold]);
    const cur = steps[step] || steps[0] || { held: new Array(CELLS).fill(0), left: 3 };
    const done = step >= steps.length - 1;

    // ── IT PLAYS ITSELF, ONE RESPIN AT A TIME ────────────────────────────────────────────────────────────
    // Paced so a respin that catches nothing is quick and one that lands a coin gets a moment. A round where
    // every beat takes the same time has no shape, and the shape is the only thing happening.
    useEffect(() => {
        if (done) return undefined;
        const next = steps[step + 1];
        const caught = next?.got > 0;
        const t = setTimeout(() => {
            setStep((n) => n + 1);
            if (caught) {
                const was = steps[step].held;
                setFlash(next.held.map((v, i) => (v && !was[i] ? i : -1)).filter((i) => i >= 0));
                Cas.coins(Math.min(1, next.got / 4));
                Haptic.hit(0.5);
            } else {
                setFlash([]);
                Cas.reelStop(1, 0.3);
                Haptic.hit(0.18);
            }
        }, caught ? 900 : 620);
        return () => clearTimeout(t);
    }, [step, steps, done]);

    // The horns when the board fills, which is the thing people tell each other about.
    const shouted = useRef(false);
    useEffect(() => {
        if (!done || shouted.current) return;
        shouted.current = true;
        if (hold?.full) { Cas.jackpot(); Haptic.crit(); } else { Cas.pot(); }
    }, [done, hold]);

    const finish = useCallback(() => onDone(), [onDone]);
    const filled = cur.held.filter(Boolean).length;

    return (
        <div className={`hs${hold?.full ? " is-full" : ""}`}>
            <div className="hs-head">
                <i>{hold?.label || "Hold and Spin"}</i>
                <b>{Number(hold?.chips || 0).toLocaleString()}</b>
                <em>chips if it stops here</em>
            </div>

            {/* THE RESPINS LEFT ARE THE WHOLE GAME. Three lamps, and every coin that lands puts them all
                back — which is the mechanic stated as an object rather than as a sentence. */}
            <div className="hs-left" aria-label={`${cur.left} respins left`}>
                {[0, 1, 2].map((i) => <span key={i} className={i < cur.left ? "is-on" : ""} />)}
                <u>{done ? (hold?.full ? "the board is full" : "no more coins") : "respins"}</u>
            </div>

            <div className="hs-grid">
                {Array.from({ length: CELLS }, (_, i) => {
                    const v = cur.held[i];
                    const chips = hold?.cellChips?.[i] || 0;
                    return (
                        <span key={i} className={`hs-cell${v ? " is-held" : ""}${flash.includes(i) ? " is-new" : ""}`}>
                            {v ? <b>{chips.toLocaleString()}</b> : <i aria-hidden="true" />}
                        </span>
                    );
                })}
            </div>

            <p className="hs-say">
                {done
                    ? (hold?.full ? "Every cell. That does not happen often." : `${filled} of ${CELLS} held.`)
                    : "Every coin that lands puts the respins back to three."}
            </p>

            {done ? (
                <button type="button" className="hs-go" onClick={finish}>
                    Take {Number(hold?.chips || 0).toLocaleString()} chips
                </button>
            ) : null}
        </div>
    );
}
