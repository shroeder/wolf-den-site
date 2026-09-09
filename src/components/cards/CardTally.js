"use client";

import { useEffect, useRef, useState } from "react";

import { scoreParts } from "@/lib/marketplace/cards-kit.js";

// ── HOW THE RUN ADDED UP ─────────────────────────────────────────────────────────────────────────────────
// Luke, on the screen that ends every run: "hate the recap screen. lacks all juice."
//
// It printed one number. A run of his had just scored 176 and there was no way to see that the 176 was
// eighty for the rooms, forty-eight for the six trinkets he found and forty-eight for a deck he had built to
// sixteen cards — which is the whole story of the run, sitting one line away and never told. A single total
// is a receipt. The same total arriving a row at a time, each row naming a thing you DID, is the run being
// read back to you.
//
// The arithmetic is scoreParts in the rules and this only draws it. Re-adding the terms here is how a screen
// ends up showing 176 over a scoreboard that recorded 180.
const REVEAL = 300;   // between rows — slow enough to read one before the next lands
const COUNT = 760;    // the total's roll

export default function CardTally({ run }) {
    const parts = scoreParts(run);
    const rows = parts.rows;
    const [shown, setShown] = useState(0);
    const [count, setCount] = useState(0);
    const raf = useRef(0);

    useEffect(() => {
        const timers = [];
        rows.forEach((_, i) => timers.push(setTimeout(() => setShown(i + 1), 240 + i * REVEAL)));
        // The total starts rolling as the last row lands, so the two motions overlap rather than queue.
        timers.push(setTimeout(() => {
            const start = performance.now();
            const tick = (now) => {
                const t = Math.min(1, (now - start) / COUNT);
                // Eased out: it sprints and then settles, which is what makes a number feel like it LANDED.
                setCount(Math.round(parts.total * (1 - (1 - t) ** 3)));
                if (t < 1) raf.current = requestAnimationFrame(tick);
            };
            raf.current = requestAnimationFrame(tick);
        }, 240 + rows.length * REVEAL));
        return () => { timers.forEach(clearTimeout); cancelAnimationFrame(raf.current); };
        // Deliberately once: the tally plays when the run ends and never replays under it.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="ctl">
            <ul className="ctl-rows">
                {rows.map((r, i) => (
                    <li key={r.key} className={i < shown ? "is-in" : ""}>
                        <span className="ctl-say">{r.say}</span>
                        <i className="ctl-at">{r.at}</i>
                        <b className="ctl-n">+{(r.at * r.each).toLocaleString()}</b>
                    </li>
                ))}
            </ul>

            {/* The ladder MULTIPLIES — see the note over runScore — so it is shown as the multiplier it is
                rather than folded silently into the total a player is trying to understand. */}
            {parts.asc > 0 ? (
                <p className={`ctl-mult${shown >= rows.length ? " is-in" : ""}`}>
                    Rung {parts.asc}<b>x{parts.mult.toFixed(2)}</b>
                </p>
            ) : null}

            <p className={`ctl-total${count > 0 ? " is-in" : ""}`}>
                <b>{count.toLocaleString()}</b>
                <span>points</span>
            </p>

            <style jsx global>{`
                .ctl { width: min(300px, 86vw); margin: 2px auto 0; }
                .ctl-rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
                /* Each row starts low and dim and arrives. The transform is what sells it as a thing being
                   TALLIED rather than a list that was already there. */
                .ctl-rows li { display: grid; grid-template-columns: 1fr auto auto; align-items: baseline;
                    gap: 10px; padding: 4px 10px; border-radius: 7px; background: rgba(18,16,20,0.5);
                    opacity: 0; transform: translateY(7px);
                    transition: opacity 260ms ease, transform 260ms cubic-bezier(.2,1.4,.35,1); }
                .ctl-rows li.is-in { opacity: 1; transform: none; }
                .ctl-say { font-size: 12px; color: #b3a68f; }
                .ctl-at { font-style: normal; font-size: 11px; color: #7d7263; font-variant-numeric: tabular-nums; }
                .ctl-n { font-size: 12.5px; color: #ffd9a6; font-variant-numeric: tabular-nums; }

                .ctl-mult { margin: 5px 0 0; text-align: center; font-size: 11.5px; color: #b3a68f;
                    letter-spacing: 0.04em; opacity: 0; transition: opacity 300ms ease; }
                .ctl-mult.is-in { opacity: 1; }
                .ctl-mult b { margin-left: 7px; color: #ffb45e; font-size: 13px; }

                .ctl-total { display: flex; align-items: baseline; justify-content: center; gap: 8px;
                    margin: 8px 0 0; }
                .ctl-total b { font-size: 40px; line-height: 1; color: #ffd9a6;
                    font-variant-numeric: tabular-nums;
                    text-shadow: 0 0 22px rgba(255,190,110,0.4), 0 3px 8px rgba(0,0,0,0.9); }
                .ctl-total span { font-size: 10.5px; letter-spacing: 0.18em; text-transform: uppercase;
                    color: #8e8371; }
                /* One pop as the roll starts. Animations here always play — this game does not sit still. */
                .ctl-total.is-in b { animation: ctlPop 420ms cubic-bezier(.2,1.5,.3,1) both; }
                @keyframes ctlPop { from { transform: scale(0.72); } to { transform: scale(1); } }
            `}</style>
        </div>
    );
}
