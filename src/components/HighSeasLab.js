"use client";

// ── THE HIGH SEAS · LAB ──────────────────────────────────────────────────────────────────────────────────────
// The question this is here to answer is narrow: what does it feel like to set sail ACTIVELY rather than
// setting a timer and leaving? So it is the approach, and only the approach — you are underway, a sail comes
// up on the horizon, your lookout calls it, and you decide whether to take the glass.
//
// ⚠️ THE FIRST CUT OF THIS WAS A SIMULATION AND THAT WAS THE WHOLE PROBLEM. Luke: "I really wanted to feel
// less like a simulation. I also wanted to use the ship battle system that we already have." It had its own
// combat — three bars, a target picker, a Fire button — which is a spreadsheet wearing a hat, and it also
// quietly forked the fight away from ship-battle.js. Both are gone. The lab now ENDS at the moment the
// existing battle would open, because everything after that point is already built.
//
// ⚠️ AND THE SEA IS THE REAL SEA. Every class in here starting `sail-` belongs to globals.css and is the same
// markup SailingClient renders: the scrolling horizon, the drifting clouds, the light column, the glints, the
// near-water parallax, the gulls, your own boat rocking at its cruise. Nothing is re-styled and nothing new is
// drawn — an encounter has to arrive in the world the player is already looking at, or it is a popup.
//
// The enemy arrives through the SAME door another sailor does: `sail-ambient-boat`, the drift that already
// carries other players across your horizon. She just does not pass.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GiSpyglass } from "react-icons/gi";

import { spot, waterline } from "@/lib/marketplace/highseas.js";

const SKIES = ["sky-clearday", "sky-goldenhour", "sky-dusk", "sky-overcast", "sky-sunrise"];

export default function HighSeasLab() {
    const [seed, setSeed] = useState(41);
    const [leg, setLeg] = useState(0);
    const [phase, setPhase] = useState("open");   // open | called | glass | handoff | passed
    const timers = useRef([]);

    const ship = useMemo(() => spot(seed, leg), [seed, leg]);
    const sky = useMemo(() => SKIES[(seed + leg) % SKIES.length], [seed, leg]);

    // ── SHE COMES UP ON YOU ──────────────────────────────────────────────────────────────────────────
    // Nothing is asked of the player for the first few seconds. You are sailing; a shape appears astern of
    // the horizon and grows. The lookout calls it only once it is worth calling, which is what makes it an
    // encounter rather than a dialog that opened.
    useEffect(() => {
        timers.current.forEach(clearTimeout);
        timers.current = [];
        if (phase !== "open") return undefined;
        timers.current.push(setTimeout(() => setPhase("called"), 2600));
        return () => timers.current.forEach(clearTimeout);
    }, [phase, leg]);

    const again = useCallback(() => {
        setLeg((n) => n + 1); setPhase("open");
    }, []);

    // ⚠️ FUNCTIONAL UPDATE, OR A DOUBLE TAP IS ONE STEP. Reading `range` out of the closure meant two quick
    // presses both computed from the same stale value and both landed on the same range — which on a phone,
    // where "tap it twice to get a proper look" is the obvious thing to do, reads as the button being broken.
    return (
        <div className="seax">
            <div className="seax-top">
                <b>The High Seas</b>
                <span className="seax-lab">lab · the approach only</span>
                <label className="seax-seed">seed
                    <input type="number" value={seed} onChange={(e) => { setSeed(Number(e.target.value) || 0); setPhase("open"); }} />
                </label>
            </div>

            {/* ── THE SEA, EXACTLY AS SAILING DRAWS IT ────────────────────────────────────────────── */}
            <div className="sail-sea sail-mood-calm" style={{ borderRadius: 14, overflow: "hidden" }}>
                <div className="sail-sky-scroll is-scrolling" aria-hidden="true">
                    {[0, 1, 2, 3].map((n) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={n} src={`/images/sailing/${sky}.png`} alt="" />
                    ))}
                </div>
                <div className="sail-clouds is-fast" aria-hidden="true"><i /><i /><i /></div>
                <div className="sail-reflection" aria-hidden="true" />
                <div className="sail-glints is-fast" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
                <div className="sail-nearwater is-scrolling" aria-hidden="true"><i /><i /><i /></div>
                <div className="sail-depth" aria-hidden="true" />
                <div className="sail-wildlife" aria-hidden="true">
                    <svg className="sail-gull g1" viewBox="0 0 40 14"><path d="M2 12 Q11 2 20 11 Q29 2 38 12" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    <svg className="sail-gull g2" viewBox="0 0 40 14"><path d="M2 12 Q11 2 20 11 Q29 2 38 12" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>

                {/* ⚠️ SHE IS NOT ON THE WATER, AND THAT IS THE POINT. She used to close on you visibly, which
                    spoiled the only thing the telescope is for: seeing her. Luke: "maybe you don't come up on
                    the ship, but as you're sailing you see a message on your boat that says you've encountered
                    something off in the distance." So the sea stays empty, the crew tell you there is
                    SOMETHING out there, and the glass is the first look anybody gets. */}

                {/* Your own boat, rocking at its cruise — the same element, the same animation. */}
                <div className="sail-boat is-underway">
                    <div className="sail-boat-inner is-sailing">
                        <span className="sail-wake" aria-hidden="true"><i /><i /><i /><i /></span>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img className="sail-boat-img" src="/images/sailing/boat-tier6-manowar.png" alt="" />
                    </div>
                </div>

                {/* ── THE LOOKOUT ──────────────────────────────────────────────────────────────────
                    A crewman calling down from the masthead, in the scene, over the water — not a modal.
                    It is the only thing that interrupts you, and it interrupts you with a choice. */}
                {phase === "called" ? (
                    <div className="seax-hail">
                        <span className="seax-hail-tail" aria-hidden="true" />
                        <span className="seax-hail-who">Masthead</span>
                        <b>&ldquo;Something off the starboard bow, a long way out!&rdquo;</b>
                        <div className="seax-hail-acts">
                            <button type="button" className="seax-go" onClick={() => setPhase("glass")}>
                                <GiSpyglass aria-hidden="true" /> Open the telescope
                            </button>
                            <button type="button" className="seax-pass" onClick={() => { setPhase("passed"); setTimeout(again, 900); }}>
                                Leave them alone
                            </button>
                        </div>
                    </div>
                ) : null}

                {/* ── THE GLASS ────────────────────────────────────────────────────────────────────
                    Over the live sea rather than on a screen of its own — you are looking THROUGH something
                    while still standing on your own deck, and the water is still moving behind the tube. */}
                {phase === "glass" ? (
                    <div className="seax-scope">
                        <div className="seax-lens">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={ship.art} alt="" className="seax-lens-ship" draggable="false" />
                            <span className="seax-lens-vig" aria-hidden="true" />
                            <span className="seax-cross" aria-hidden="true" />
                        </div>
                    </div>
                ) : null}
            </div>

            {/* ── WHAT THE GLASS TELLS YOU ────────────────────────────────────────────────────────── */}
            {phase === "glass" ? (
                <>
                    <dl className="seax-read">
                        <Row label="Shape" value={`${ship.label} — ${ship.silhouette}`} />
                        <Row label="Waterline" value={waterline(ship)} />
                        <Row label="Colours" value={ship.name} />
                        {/* The two the whole decision weighs against each other: what is in her, and who is
                            on her. Side by side, both plain, before you have spent anything. */}
                        <Row label="Her hold" value={`${ship.hold} crates · ${ship.cargo}`} good />
                        <Row label="Quarterdeck" value={`${ship.captain} · infamy ${ship.infamy}`} good />
                    </dl>
                    <div className="seax-acts">
                        <button type="button" className="seax-btn seax-ghost" onClick={() => { setPhase("passed"); setTimeout(again, 900); }}>Let her pass</button>
                        <button type="button" className="seax-btn seax-go" onClick={() => setPhase("handoff")}>Run her down</button>
                    </div>
                </>
            ) : null}

            {/* ── AND HERE THE EXISTING GAME TAKES OVER ───────────────────────────────────────────── */}
            {phase === "handoff" ? (
                <div className="seax-handoff">
                    <b>This is where the ship battle opens.</b>
                    <p>
                        The fight itself is already built — <code>ship-battle.js</code>, the one the fleet uses,
                        with her rigging and her gun deck as things you can shoot at instead of only her hull.
                        Nothing new is needed for it; what was missing was the minute in front of it.
                    </p>
                    <button type="button" className="seax-btn seax-go" onClick={again}>Sail on</button>
                </div>
            ) : null}

            <Style />
        </div>
    );
}

function Row({ label, value, dim, good }) {
    return (
        <div className={`seax-drow${dim ? " is-dim" : ""}${good ? " is-good" : ""}`}>
            <dt>{label}</dt><dd>{value}</dd>
        </div>
    );
}

function Style() {
    return (
        <style jsx global>{`
            .seax { max-width: 460px; margin: 0 auto; color: #eae3d6; }
            .seax-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
            .seax-top b { font-size: 1.05rem; color: #ffd75e; }
            .seax-lab { font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: #8a9384;
                border: 1px solid rgba(255,255,255,.16); border-radius: 999px; padding: 2px 7px; }
            .seax-seed { margin-left: auto; font-size: 11px; color: #8a9384; display: flex; align-items: center; gap: 5px; }
            .seax-seed input { width: 62px; padding: 3px 6px; border-radius: 7px; background: rgba(255,255,255,.06);
                border: 1px solid rgba(255,255,255,.16); color: #eae3d6; font-size: 12px; }

            /* The lab gives the sea more room than the voyage page does, because here the scene IS the
               subject. Scoped under .seax so the real sailing screen is untouched. */
            .seax .sail-sea { min-height: 340px; }

            /* ── A VOICE FROM YOUR OWN DECK ───────────────────────────────────────────────────────
               Anchored over the boat with a tail pointing down at it, so it reads as somebody aboard
               speaking rather than as a bar that appeared at the bottom of the screen. */
            .seax-hail { position: absolute; left: 10px; right: 10px; bottom: 38%; z-index: 6;
                display: flex; flex-direction: column; gap: 5px; padding: 10px 12px; border-radius: 13px;
                background: linear-gradient(180deg, rgba(10,18,26,.9), rgba(6,12,18,.95));
                border: 1px solid rgba(255,215,94,.4); backdrop-filter: blur(3px);
                box-shadow: 0 8px 20px rgba(0,0,0,.5);
                animation: seaxHail .45s cubic-bezier(.2,1.3,.35,1) both; }
            .seax-hail-tail { position: absolute; left: 50%; bottom: -7px; width: 14px; height: 14px;
                margin-left: -7px; transform: rotate(45deg);
                background: rgba(6,12,18,.95); border-right: 1px solid rgba(255,215,94,.4);
                border-bottom: 1px solid rgba(255,215,94,.4); }
            @keyframes seaxHail { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
            .seax-hail-who { font-size: 9.5px; letter-spacing: .2em; text-transform: uppercase; color: #ffd75e; }
            .seax-hail b { font-size: 13.5px; line-height: 1.35; color: #f6efdf; }
            .seax-hail-acts { display: flex; gap: 7px; margin-top: 2px; }
            .seax-pass { flex: 0 0 auto; padding: 9px 12px; border-radius: 10px; cursor: pointer; font-size: 13px;
                font-weight: 700; color: #9bb0c2; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.16); }

            /* ── THE GLASS, OVER THE LIVE SEA ─────────────────────────────────────────────────────
               The tube darkens the whole scene and the circle is the hole you look through, so the water
               keeps moving behind it. */
            .seax-scope { position: absolute; inset: 0; z-index: 7; display: grid; place-items: center;
                background: rgba(3,8,12,.72); animation: seaxScope .35s ease-out both; }
            @keyframes seaxScope { from { opacity: 0; } to { opacity: 1; } }
            .seax-lens { position: relative; width: 62%; aspect-ratio: 1; max-width: 250px; border-radius: 50%;
                overflow: hidden; display: grid; place-items: center;
                /* ⚠️ OPAQUE. It was translucent, so the scene BEHIND the tube showed through the circle —
                   and the biggest thing behind the tube is your own hull. You raised a telescope and looked
                   at your own ship through it. Whatever is in the glass has to be the only thing in it. */
                background: radial-gradient(circle at 50% 38%, #3a668c, #0b1722 74%);
                border: 3px solid #6b5836; box-shadow: 0 0 0 6px rgba(20,14,8,.9), 0 10px 26px rgba(0,0,0,.6); }
            .seax-lens-ship { width: 62%; height: 62%; object-fit: contain;
                filter: drop-shadow(0 6px 10px rgba(0,0,0,.6)); animation: seaxBob 4.2s ease-in-out infinite; }
            @keyframes seaxBob { 0%,100% { transform: translateY(0) rotate(-1.5deg); } 50% { transform: translateY(-6px) rotate(1.5deg); } }
            .seax-lens-vig { position: absolute; inset: 0; pointer-events: none;
                background: radial-gradient(circle, rgba(0,0,0,0) 54%, rgba(4,10,16,.9) 84%); }
            .seax-cross { position: absolute; left: 50%; top: 50%; width: 72%; height: 1px; margin-left: -36%;
                background: rgba(255,255,255,.16); }
            .seax-cross::after { content: ""; position: absolute; left: 50%; top: -52px; width: 1px; height: 104px;
                background: rgba(255,255,255,.16); }

            .seax-read { margin: 10px 0 0; display: flex; flex-direction: column; gap: 4px; }
            .seax-drow { display: flex; justify-content: space-between; gap: 12px; padding: 7px 10px;
                border-radius: 9px; background: rgba(255,255,255,.04); font-size: 13px; }
            .seax-drow dt { color: #8a9384; margin: 0; }
            .seax-drow dd { margin: 0; text-align: right; color: #f2ead9; }
            .seax-drow.is-good { background: rgba(255,215,94,.08); border: 1px solid rgba(255,215,94,.22); }
            .seax-drow.is-good dd { color: #ffd75e; font-weight: 700; }
            .seax-drow.is-dim dd { color: #5f6a72; }

            .seax-acts { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
            .seax-btn { flex: 1 1 auto; padding: 11px 12px; border-radius: 11px; font-weight: 800; font-size: 14px;
                cursor: pointer; border: 1px solid rgba(255,255,255,.18); background: rgba(255,255,255,.06); color: #eae3d6; }
            .seax-ghost { color: #9bb0c2; }
            .seax-go, .seax-btn.seax-go { display: inline-flex; align-items: center; justify-content: center; gap: 7px;
                padding: 9px 14px; border-radius: 10px; font-weight: 800; font-size: 13.5px; cursor: pointer;
                border: none; color: #2a1f07; background: linear-gradient(180deg, #ffe488, #f3b23a); box-shadow: 0 3px 0 #b07d1e; }
            .seax-go svg { width: 17px; height: 17px; }

            .seax-handoff { margin-top: 12px; padding: 16px; border-radius: 14px; text-align: center;
                background: rgba(255,255,255,.04); border: 1px dashed rgba(255,215,94,.4); }
            .seax-handoff b { display: block; font-size: 1.05rem; color: #ffd75e; margin-bottom: 6px; }
            .seax-handoff p { margin: 0 0 12px; font-size: 13px; line-height: 1.55; color: #a99c88; }
            .seax-handoff code { color: #cdd9c6; font-size: 12.5px; }
        `}</style>
    );
}
