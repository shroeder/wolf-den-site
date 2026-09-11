"use client";

// ── WHAT THE RUN FED ─────────────────────────────────────────────────────────────────────────────────────────
// The card pool is pet-gated — you are only offered a card if you own the pet behind it — and that gate only
// ever ran one way: owning pets got you cards, playing cards got the pets nothing. A run now feeds the pets it
// was BUILT FROM, split by how much of the deck each one wrote, and this is where that is said.
//
// Sorted biggest first, so the pet the deck was actually about is the top line rather than something buried
// under four one-card also-rans.

import { useMemo } from "react";
import { GiPawPrint } from "react-icons/gi";

import { collectibleById } from "@/lib/marketplace/collectibles.js";

const ROW = 200;   // ms between one row arriving and the next
const LEAD = 240;  // ms before the first

export default function CardPetGains({ gains, petArt = {} }) {
    // ⚠️ NO TIMERS AND NO STATE. This used to reveal rows on setTimeout off a `gains.slice(0, 6)` computed in
    // the render body -- a NEW ARRAY every render, so the effect saw a changed dependency every time, cleared
    // its timers and restarted from zero. The first row survived because its timer is short; the rest appeared
    // and vanished on a loop. Luke: "the 2nd pet the sloth keeps popping up and going away."
    //
    // Memoising the list fixed that instance, but the SHAPE is the bug: anything re-rendering on an interval
    // inside a results panel fights the panel's own scroll, and this panel is scrolled. So every row renders at
    // once and the cascade is pure CSS animation-delay. Nothing here can appear and then leave.
    const list = useMemo(() => (Array.isArray(gains) ? gains.slice(0, 6) : []), [gains]);

    if (!list.length) return null;

    return (
        <div className="cpg">
            <p className="cpg-h"><GiPawPrint aria-hidden="true" /> The deck fed its pets</p>
            <ul className="cpg-list">
                {list.map((g, i) => {
                    const pet = collectibleById(g.pet);
                    // THE BAR MOVES. A pet that took 240xp and a pet that took 12 look identical as text, and
                    // the run that finally pushes one over a rung is the run you want somebody to feel. Both
                    // ends come from the server (petLevelInfo, one owner of the thresholds); the fill animates
                    // from where the pet WAS to where it ended.
                    const from = g.from?.span > 0 ? Math.min(100, (g.from.into / g.from.span) * 100) : (g.from?.maxed ? 100 : 0);
                    const to = g.to?.span > 0 ? Math.min(100, (g.to.into / g.to.span) * 100) : (g.to?.maxed ? 100 : 0);
                    // Crossing a rung resets the bar to zero, so a levelling row would animate BACKWARDS. It
                    // runs to full instead, which is what actually happened.
                    const end = g.leveled ? 100 : to;
                    const at = { animationDelay: `${LEAD + i * ROW}ms` };
                    return (
                        <li key={g.pet} className={`cpg-row${g.leveled ? " is-up" : ""}`} style={at}>
                            {g.leveled ? <span className="cpg-burst" aria-hidden="true" /> : null}
                            <span className="cpg-pic">
                                {petArt[g.pet]?.url ? (
                                    /* eslint-disable-next-line @next/next/no-img-element */
                                    <img src={petArt[g.pet].url} alt="" className="cpg-art" draggable="false" />
                                ) : <GiPawPrint aria-hidden="true" />}
                            </span>
                            <span className="cpg-who">
                                <b>{pet?.name || g.pet}</b>
                                <span className="cpg-bar">
                                    <i style={{ "--from": `${from}%`, "--to": `${end}%`, animationDelay: `${LEAD + i * ROW + 180}ms` }} />
                                </span>
                                <em>
                                    {/* A LEVELLED ROW MUST NOT SHOW THE NEXT LEVEL'S FRACTION. The bar runs to
                                        full because that is what the run did -- it finished the rung -- and
                                        pairing a full bar with "430 / 2,250" reads as a broken number. The
                                        remainder is on the pet's own shelf; here the news is the rung. */}
                                    {g.leveled
                                        ? `Grew to Level ${g.level}`
                                        : g.to?.maxed
                                            ? "Fully grown"
                                            : g.to?.span > 0
                                                ? `${g.to.into.toLocaleString()} / ${g.to.span.toLocaleString()} to Level ${g.to.level + 1}`
                                                : `${g.cards} card${g.cards === 1 ? "" : "s"} in the deck`}
                                </em>
                            </span>
                            <span className="cpg-n">
                                +{g.n.toLocaleString()}<i>xp</i>
                                {g.leveled ? <u>Level {g.level}</u> : null}
                            </span>
                        </li>
                    );
                })}
            </ul>

            <style jsx>{`
                .cpg { margin: 12px auto 0; max-width: 360px; padding: 13px 14px 12px; border-radius: 14px;
                    background: rgba(255,255,255,.045); border: 1px solid rgba(255,255,255,.1); }
                .cpg-h { margin: 0 0 9px; display: flex; align-items: center; gap: 7px;
                    font-size: 11px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase;
                    color: #8a8496; }
                .cpg-h :global(svg) { width: 16px; height: 16px; color: #b6d06a; }
                .cpg-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
                .cpg-row { position: relative; display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 10px;
                    background: rgba(255,255,255,.04);
                    animation: cpgIn .42s cubic-bezier(.2,1.25,.35,1) both; }
                @keyframes cpgIn {
                    0% { opacity: 0; transform: translateX(-12px); }
                    100% { opacity: 1; transform: translateX(0); }
                }
                .cpg-row :global(svg) { width: 26px; height: 26px; color: #8a8496; }
                /* THE ANIMAL, BIGGER. At 34px it was a bullet point; the pets are the subject of this panel. */
                .cpg-pic { position: relative; display: flex; align-items: center; justify-content: center;
                    width: 48px; height: 48px; flex-shrink: 0; }
                .cpg-pic::before { content: ""; position: absolute; inset: -4px; border-radius: 50%;
                    background: radial-gradient(circle, rgba(182, 208, 106, .22), rgba(182, 208, 106, 0) 68%); }
                .cpg-row.is-up .cpg-pic::before { background: radial-gradient(circle, rgba(255, 207, 135, .42), rgba(255, 207, 135, 0) 68%);
                    animation: cpgPulse 1.8s ease-in-out infinite; }
                @keyframes cpgPulse { 0%, 100% { transform: scale(.9); opacity: .7; } 50% { transform: scale(1.1); opacity: 1; } }
                .cpg-art { position: relative; width: 46px; height: 46px; object-fit: contain;
                    filter: drop-shadow(0 4px 6px rgba(0, 0, 0, .5)); }
                .cpg-row.is-up .cpg-art { animation: cpgHop .7s cubic-bezier(.2, 1.5, .4, 1) 420ms 2 both; }
                @keyframes cpgHop { 0%, 100% { transform: translateY(0); } 40% { transform: translateY(-9px) scale(1.06); } }

                /* A run that pushes a pet over a rung is the best thing on this screen; it gets a burst. */
                .cpg-burst { position: absolute; left: 34px; top: 50%; width: 0; height: 0; pointer-events: none; }
                .cpg-burst::before, .cpg-burst::after { content: ""; position: absolute; left: 50%; top: 50%;
                    width: 66px; height: 66px; margin: -33px 0 0 -33px; border-radius: 50%;
                    border: 1px solid rgba(255, 207, 135, .55); opacity: 0;
                    animation: cpgRing 1.5s ease-out 520ms 2 both; }
                .cpg-burst::after { animation-delay: 760ms; }
                @keyframes cpgRing {
                    0% { transform: scale(.35); opacity: .9; }
                    100% { transform: scale(1.25); opacity: 0; }
                }

                .cpg-who { flex: 1; min-width: 0; }
                /* The two ends are inline custom properties, NOT interpolated into this template -- a JS interpolation in a
                   styled-jsx block can be dropped outright, which compiles an animation to duration auto and
                   snaps it to its last frame. */
                .cpg-bar { display: block; height: 5px; margin: 4px 0 3px; border-radius: 3px; overflow: hidden;
                    background: rgba(255, 255, 255, .08); }
                .cpg-bar i { display: block; height: 100%; border-radius: 3px; width: 0;
                    background: linear-gradient(90deg, #7f9a44, #b6d06a);
                    animation: cpgFill 900ms cubic-bezier(.25, .9, .3, 1) both; }
                .cpg-row.is-up .cpg-bar i { background: linear-gradient(90deg, #c08f3a, #ffcf87); }
                @keyframes cpgFill { 0% { width: var(--from); } 100% { width: var(--to); } }
                .cpg-who b { display: block; font-size: 13.5px; font-weight: 800; color: #f2e9dc;
                    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .cpg-who em { display: block; font-style: normal; font-size: 10px; color: #8a8496; }
                .cpg-n { text-align: right; font-size: 14px; font-weight: 800; color: #b6d06a; white-space: nowrap; }
                .cpg-n i { margin-left: 3px; font-style: normal; font-size: 9.5px; letter-spacing: .1em;
                    text-transform: uppercase; color: #6f7a68; }
                /* A pet that actually crossed a level is the only row worth shouting about. */
                .cpg-n u { display: block; text-decoration: none; font-size: 11px; color: #ffcf87; }
                .cpg-row.is-up { background: rgba(255,207,135,.11); box-shadow: inset 0 0 0 1px rgba(255,207,135,.3); }
            `}</style>
        </div>
    );
}
