"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { STRIKE_MAX, TIMING_BANDS } from "@/lib/marketplace/arena-kit.js";

// ── THE TWO THINGS A MEMBER DOES IN A FIGHT ──────────────────────────────────────────────────────────────────
// Pick what to throw, and time it. Then time their answer. That is the whole loop, and this is the whole
// interface to it.
//
// ── WHY A SWEEP AND NOT A CLOSING RING ───────────────────────────────────────────────────────────────────────
// The last timing mechanic this game had was a ring that closed on a target, and it was removed twice. A ring
// asks you to judge a RADIUS, which is a comparison between two curved edges — hard to read at a glance, worse
// on a phone held at arm's length in a shop. A marker crossing a lit zone is a position, and a position is the
// easiest thing an eye can judge. It is also the shape every rhythm game settled on for the same reason.
//
// ── AND WHY MISSING IS FREE ──────────────────────────────────────────────────────────────────────────────────
// The sweep runs out on its own and commits for you. Both removals of the old timing game were because it
// GATED things — a bad run of taps locked members out of gear they had paid for. Here the floor is a competent
// hand (see betterHand), so a member who looks away, loses the window, or is holding the phone in one hand
// while ringing somebody up fights exactly the fight the auto-resolver would have fought for them. Every tap
// is upside.
//
// The bands are read off the engine's own table rather than redrawn here, so the lit zone on screen is the
// window the server actually grades against — a bar that lies about where Perfect is would be worse than no
// bar at all.

const SWEEP_MS = 1400;          // one pass of the marker, edge to edge
const PERFECT = TIMING_BANDS.find((b) => b.id === "perfect");
const GOOD = TIMING_BANDS.find((b) => b.id === "good");

// closeness is 1 dead centre and 0 at either edge — the same 0..1 gradeTiming clamps and grades.
const closenessAt = (t) => Math.max(0, 1 - Math.abs(t - 0.5) * 2);

/** Where a band's window sits on the bar, as a percentage span. A band reaching `at` closeness occupies the
 *  middle (1 - at) of the sweep, so it can be drawn straight off the same number that grades it. */
const zone = (band) => {
    const half = (1 - band.at) / 2;
    return { left: `${(0.5 - half) * 100}%`, width: `${half * 200}%` };
};

export default function FightInput({ bout, busy, onAct, onBrace }) {
    const awaiting = bout?.awaiting || null;
    const [picked, setPicked] = useState(null);      // the command chosen, waiting on the tap
    const [pos, setPos] = useState(0);               // 0..1 along the bar
    const [flash, setFlash] = useState(null);        // the grade just landed, for the callout
    const raf = useRef(0);
    const started = useRef(0);
    const fired = useRef(false);

    const running = awaiting === "brace" || (awaiting === "act" && picked !== null);

    // ── THE COMMIT ───────────────────────────────────────────────────────────────────────────────────────
    // Guarded by a ref rather than by state: the sweep's own expiry and a real tap can land in the same frame,
    // and a double-commit would spend two beats for one press. A ref is the only thing that has already
    // changed by the time the second caller reads it.
    const commit = useCallback((t) => {
        if (fired.current) return;
        fired.current = true;
        cancelAnimationFrame(raf.current);
        const closeness = closenessAt(t);
        const band = TIMING_BANDS.find((b) => closeness >= b.at) || TIMING_BANDS[TIMING_BANDS.length - 1];
        setFlash({ id: band.id, label: band.label, brace: awaiting === "brace" });
        if (awaiting === "brace") onBrace(closeness);
        else onAct(picked === "attack" ? null : picked, closeness);
        setPicked(null);
    }, [awaiting, picked, onAct, onBrace]);

    // The sweep itself. It runs on wall time rather than frame count so a slow phone gets the same window a
    // fast one does — a timing test that is easier on better hardware is a timing test measuring hardware.
    useEffect(() => {
        if (!running) return undefined;
        fired.current = false;
        started.current = performance.now();
        const step = (now) => {
            const t = (now - started.current) / SWEEP_MS;
            if (t >= 1) { setPos(1); commit(1); return; }   // ran out: commits at the far edge, closeness 0
            setPos(t);
            raf.current = requestAnimationFrame(step);
        };
        raf.current = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf.current);
    }, [running, commit]);

    // The callout clears itself; it is a flash, not a state.
    useEffect(() => {
        if (!flash) return undefined;
        const t = setTimeout(() => setFlash(null), 900);
        return () => clearTimeout(t);
    }, [flash]);

    // A fight that is over, or a transcript from before any of this existed, has nothing to ask for.
    if (!awaiting) return null;

    const deck = bout?.deck || [];
    const cd = bout?.cd || {};

    return (
        <div className={`fin${running ? " is-live" : ""}`}>
            {flash ? <b className={`fin-flash is-${flash.id}`}>{flash.label}</b> : null}

            {running ? (
                <button type="button" className="fin-bar" onPointerDown={(e) => { e.preventDefault(); commit(pos); }}
                    aria-label="Tap on the beat">
                    {/* Drawn from the engine's own bands, widest first, so the lit zone IS the graded window. */}
                    <span className="fin-zone is-good" style={zone(GOOD)} />
                    <span className="fin-zone is-perfect" style={zone(PERFECT)} />
                    <span className="fin-mark" style={{ left: `${pos * 100}%` }} />
                    <em className="fin-hint">
                        {awaiting === "brace" ? "Tap to brace" : "Tap on the beat"}
                    </em>
                </button>
            ) : (
                <>
                    <div className="fin-lab">
                        <span>Your beat</span>
                        <em>+{Math.round(STRIKE_MAX * 100)}% on a perfect tap</em>
                    </div>
                    <div className="fin-deck">
                        <button type="button" className="fin-cmd is-attack" disabled={busy}
                            onClick={() => setPicked("attack")}>
                            <b>Attack</b>
                            <span>your plain swing</span>
                        </button>
                        {deck.map((k) => {
                            const cooling = Number(cd[k.id]) || 0;
                            return (
                                <button key={k.id} type="button" className="fin-cmd" disabled={busy || cooling > 0}
                                    onClick={() => setPicked(k.id)}>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={k.sprite} alt="" draggable="false" />
                                    <b>{k.name}</b>
                                    {cooling > 0
                                        ? <i className="fin-cd">{cooling}</i>
                                        : <span>{k.power > 0 ? `${k.power.toFixed(2)}x` : "no blow"}{k.free ? " · free" : ""}</span>}
                                </button>
                            );
                        })}
                    </div>
                </>
            )}


            <style jsx global>{`
                /* ── IT MUST NOT BE SOMETHING YOU SCROLL TO ──────────────────────────────────────────
                   The arena field is tall — background, two fighters, the telegraph — and on a 390px phone
                   the deck and the sweep both landed below the fold. A timing window you have to scroll to
                   find is not a timing window; the sweep is 1400ms and it would be over before a thumb
                   arrived. Stuck to the bottom of the viewport for the whole beat, on its own ground so the
                   marker never has to be read against a fighter sprite. */
                .fin { position: sticky; bottom: 0; z-index: 4; display: grid; gap: 8px;
                    padding: 9px 9px calc(9px + env(safe-area-inset-bottom, 0px));
                    margin: 0 -9px -9px; border-radius: 16px 16px 0 0;
                    background: linear-gradient(to top, rgba(8,6,12,.97) 72%, rgba(8,6,12,.82));
                    border-top: 1px solid rgba(255,255,255,.12); }
                .fin-lab { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
                .fin-lab span { font-size: 9.5px; font-weight: 900; letter-spacing: .16em;
                    text-transform: uppercase; color: #9aa2ab; }
                .fin-lab em { font-style: normal; font-size: 9.5px; color: #7d858f; }

                /* ── THE DECK ── three or four buttons, one row, thumb-sized. */
                .fin-deck { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 6px; }
                .fin-cmd { display: grid; justify-items: center; gap: 3px; padding: 10px 5px 8px;
                    border-radius: 14px; cursor: pointer; min-height: 62px;
                    background: rgba(10,8,14,.55); border: 1px solid rgba(255,255,255,.12); }
                .fin-cmd.is-attack { background: rgba(255,255,255,.06); }
                .fin-cmd img { width: 26px; height: 26px; object-fit: contain; }
                .fin-cmd b { font-size: 11px; font-weight: 900; color: #e8ecf1; line-height: 1.1; }
                .fin-cmd span { font-size: 9px; color: #8b93a0; }
                .fin-cmd:disabled { opacity: .42; cursor: default; }
                .fin-cd { font-style: normal; font-size: 12px; font-weight: 900; color: #ffb35c;
                    font-variant-numeric: tabular-nums; }

                /* ── THE SWEEP ── one tall target. It is deliberately the full width of the card and 64px
                   high: this is the thing being hit under time pressure on a phone, and a small target is a
                   timing test measuring thumbs rather than rhythm. */
                .fin-bar { position: relative; display: block; width: 100%; height: 64px; padding: 0;
                    border-radius: 14px; overflow: hidden; cursor: pointer;
                    background: rgba(0,0,0,.55); border: 1px solid rgba(255,255,255,.14);
                    touch-action: none; }
                .fin-zone { position: absolute; top: 0; bottom: 0; }
                .fin-zone.is-good { background: rgba(111,208,255,.16); }
                .fin-zone.is-perfect { background: rgba(111,208,255,.34);
                    box-shadow: inset 0 0 22px -6px rgba(111,208,255,.9); }
                .fin-mark { position: absolute; top: 0; bottom: 0; width: 3px; margin-left: -1.5px;
                    background: #fff; box-shadow: 0 0 14px 2px rgba(255,255,255,.75); }
                .fin-hint { position: absolute; left: 0; right: 0; bottom: 7px; text-align: center;
                    font-style: normal; font-size: 10px; font-weight: 900; letter-spacing: .14em;
                    text-transform: uppercase; color: rgba(255,255,255,.62); pointer-events: none; }

                /* ── THE CALLOUT ── it says which band landed, because a multiplier folded into a damage
                   number teaches nobody when to tap. */
                .fin-flash { display: block; text-align: center; font-size: 15px; font-weight: 900;
                    letter-spacing: .1em; text-transform: uppercase;
                    animation: fin-pop .9s ease-out forwards; }
                .fin-flash.is-perfect { color: #7ee2a8; text-shadow: 0 0 18px rgba(126,226,168,.8); }
                .fin-flash.is-good { color: #6fd0ff; }
                .fin-flash.is-early { color: #ffb35c; }
                .fin-flash.is-miss { color: #8b93a0; }
                @keyframes fin-pop {
                    0% { opacity: 0; transform: scale(.8); }
                    22% { opacity: 1; transform: scale(1.06); }
                    70% { opacity: 1; transform: scale(1); }
                    100% { opacity: 0; transform: scale(1); }
                }
            `}</style>
        </div>
    );
}
