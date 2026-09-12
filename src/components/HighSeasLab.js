"use client";

// ── THE HIGH SEAS · THE WHOLE LOOP, END TO END ───────────────────────────────────────────────────────────────
// Luke, after two passes that got stuck in the details: "we're gonna encounter a ship. We're gonna fight it.
// Once we defeat it, it doesn't sink ever. And then we interrogate the captain. He tells us where the treasure
// is, and then we go get the treasure ... the player should never fail. They should just always succeed."
//
// So this is the SHAPE, not the rules. Eight beats, one after another, no branches:
//
//     sailing → she comes up → the scope → the fight → the brig → she talks → sailing → the island → the dig
//
// ⚠️ EVERY DECISION IS GONE ON PURPOSE, and that is the whole change. There was a telescope you read five
// lines off and a choice to let her pass — "it never makes sense to pass up on them" — and a fight you could
// be driven off from. All removed. One button a beat, and it always works. You cannot lose, you cannot skip,
// and there is nothing to get wrong. What is being prototyped is whether the SEQUENCE feels good, and a branch
// is noise in that measurement.
//
// ⚠️ AND IT FITS ONE SCREEN. Luke: "I don't like having to click buttons and scroll up and down." The stage is
// a fixed box, every button sits inside the scene on top of the art, and nothing is ever below the fold.
//
// ⚠️ THE SCOPE IS A LOOK, NOT A READ. It shows you her and gives you one button — no stat list, no ranges.
//
// Art is all existing: the sea SailingClient draws, the boat tiers, the fleet's crew sprites for the captain,
// the brig room, the island, the dig ground and the chest. Nothing was generated for this.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GiCannon, GiTalk, GiSailboat, GiTreasureMap, GiTrenchSpade } from "react-icons/gi";

import { spot } from "@/lib/marketplace/highseas.js";

const SKIES = ["sky-goldenhour", "sky-clearday", "sky-dusk", "sky-sunrise"];
const CREW = ["fleet_court", "fleet_blockade", "fleet_choir", "fleet_corvette", "fleet_assize"];
const BEATS = ["sail", "scope", "fight", "brig", "told", "run", "land", "dig", "done"];

export default function HighSeasLab() {
    const [seed, setSeed] = useState(41);
    const [beat, setBeat] = useState("sail");
    const [hits, setHits] = useState(0);       // the fight: three broadsides and she is done
    const [digs, setDigs] = useState(0);       // the dig: three turns of the spade
    const timers = useRef([]);

    const ship = useMemo(() => spot(seed, 0), [seed]);
    const sky = useMemo(() => SKIES[seed % SKIES.length], [seed]);
    const captain = useMemo(() => `/images/fleet/crew/${CREW[seed % CREW.length]}.png`, [seed]);

    const go = useCallback((next) => setBeat(next), []);
    const restart = useCallback(() => { setBeat("sail"); setHits(0); setDigs(0); }, []);

    // The only two beats that move on their own: she comes up out of the horizon, and the island does.
    useEffect(() => {
        timers.current.forEach(clearTimeout);
        timers.current = [];
        if (beat === "sail") timers.current.push(setTimeout(() => setBeat("scope"), 2400));
        if (beat === "run") timers.current.push(setTimeout(() => setBeat("land"), 2600));
        return () => timers.current.forEach(clearTimeout);
    }, [beat]);

    const fire = useCallback(() => {
        setHits((n) => {
            const at = n + 1;
            if (at >= 3) timers.current.push(setTimeout(() => setBeat("brig"), 800));
            return at;
        });
    }, []);

    const dig = useCallback(() => {
        setDigs((n) => {
            const at = n + 1;
            if (at >= 3) timers.current.push(setTimeout(() => setBeat("done"), 800));
            return at;
        });
    }, []);

    const atSea = beat === "sail" || beat === "scope" || beat === "fight" || beat === "run";
    const step = BEATS.indexOf(beat);

    return (
        <div className="seax">
            <div className="seax-top">
                <b>The High Seas</b>
                <span className="seax-lab">lab · the whole loop</span>
                <label className="seax-seed">seed
                    <input type="number" value={seed} onChange={(e) => { setSeed(Number(e.target.value) || 0); restart(); }} />
                </label>
            </div>

            {/* ── THE STAGE ───────────────────────────────────────────────────────────────────────────
                One fixed box for every beat. The scene changes underneath it; the box never moves, and
                nothing ever needs scrolling to reach. */}
            <div className="seax-stage">
                {/* THE SEA — the same markup and the same globals.css classes SailingClient renders. */}
                {atSea ? (
                    <div className="sail-sea sail-mood-calm seax-fill">
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

                        {/* HER SAIL — a speck that grows while you are underway, then holds alongside. */}
                        {beat !== "run" ? (
                            <span className={`seax-her${beat === "sail" ? " is-closing" : " is-close"}${beat === "fight" && hits > 0 ? " is-hurt" : ""}`} aria-hidden="true">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={ship.art} alt="" />
                                {beat === "fight" && hits > 0 ? <span className="seax-smoke" /> : null}
                            </span>
                        ) : null}

                        {/* THE ISLAND, coming up on the way back. */}
                        {beat === "run" ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img className="seax-isle" src="/images/sailing/island.png" alt="" aria-hidden="true" />
                        ) : null}

                        {/* YOUR HULL — the same element and the same rock SailingClient uses. */}
                        <div className="sail-boat is-underway">
                            <div className="sail-boat-inner is-sailing">
                                <span className="sail-wake" aria-hidden="true"><i /><i /><i /><i /></span>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img className="sail-boat-img" src="/images/sailing/boat-tier6-manowar.png" alt="" />
                            </div>
                        </div>
                    </div>
                ) : null}

                {/* THE BRIG — her captain, below decks. */}
                {beat === "brig" || beat === "told" ? (
                    <div className="seax-fill seax-room">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img className="seax-bg" src="/images/sailing/brig/room.png" alt="" aria-hidden="true" />
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img className="seax-cap" src={captain} alt="" draggable="false" />
                    </div>
                ) : null}

                {/* THE ISLAND, ashore. */}
                {beat === "land" || beat === "dig" || beat === "done" ? (
                    <div className="seax-fill seax-room">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img className="seax-bg" src="/images/sailing/dig-bg.png" alt="" aria-hidden="true" />
                        {beat === "dig" ? <span className="seax-hole" style={{ "--n": digs }} aria-hidden="true" /> : null}
                        {beat === "done" ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img className="seax-chest" src="/images/sailing/dig-chest.png" alt="" draggable="false" />
                        ) : null}
                    </div>
                ) : null}

                {/* ── THE SCOPE ───────────────────────────────────────────────────────────────────────
                    A look, and a button. Nothing in it has to be read. */}
                {beat === "scope" ? (
                    <div className="seax-scope">
                        <div className="seax-lens">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={ship.art} alt="" className="seax-lens-ship" draggable="false" />
                            <span className="seax-cross" aria-hidden="true" />
                        </div>
                        <b className="seax-her-name">{ship.name}</b>
                    </div>
                ) : null}

                {/* ── ONE LINE, ONE BUTTON, ALWAYS IN THE SAME PLACE ─────────────────────────────── */}
                <div className="seax-hud">
                    {beat === "sail" ? <Say who="Masthead" line="Sail ho — off the starboard bow!" /> : null}
                    {beat === "scope" ? (
                        <Say line="She is alone, and she is heavy in the water."
                            icon={GiCannon} label="Run her down" onClick={() => go("fight")} />
                    ) : null}
                    {beat === "fight" ? (
                        <Say line={["Lay it into her rigging.", "Her canvas is coming down.", "Her guns are silenced. She is ours."][Math.min(2, hits)]}
                            icon={GiCannon} label={hits >= 2 ? "Board her" : "Fire a broadside"} onClick={fire} />
                    ) : null}
                    {beat === "brig" ? (
                        <Say who="The brig" line={`${ship.captain} will not look at you.`}
                            icon={GiTalk} label="Put it to him" onClick={() => go("told")} />
                    ) : null}
                    {beat === "told" ? (
                        <Say who={ship.captain} line="Three days west. A bay shaped like a hook. Under the black rock."
                            icon={GiTreasureMap} label="Back to your ship" onClick={() => go("run")} />
                    ) : null}
                    {beat === "run" ? <Say who="Masthead" line="Land ho — the bay, dead ahead." /> : null}
                    {beat === "land" ? (
                        <Say line="The black rock is exactly where he said it was."
                            icon={GiTrenchSpade} label="Go ashore" onClick={() => go("dig")} />
                    ) : null}
                    {beat === "dig" ? (
                        <Say line={["Sand, and more sand.", "Something hard under the spade.", "Timber. A lid."][Math.min(2, digs)]}
                            icon={GiTrenchSpade} label={digs >= 2 ? "Open it" : "Dig"} onClick={dig} />
                    ) : null}
                    {beat === "done" ? (
                        <Say line="Hers, now yours — and the sea is still out there."
                            icon={GiSailboat} label="Sail on" onClick={restart} />
                    ) : null}
                </div>

                {/* Where you are in the loop. The only chrome, because a prototype has to be readable. */}
                <div className="seax-beads" aria-hidden="true">
                    {BEATS.slice(0, 8).map((b, i) => <span key={b} className={i <= step ? "on" : undefined} />)}
                </div>
            </div>

            <Style />
        </div>
    );
}

// One line of voice and at most one button. Every beat uses this, so the eye never hunts for the next tap.
function Say({ who, line, icon: Icon, label, onClick }) {
    return (
        <div className="seax-say">
            {who ? <span className="seax-who">{who}</span> : null}
            <b>{who ? `“${line}”` : line}</b>
            {onClick ? (
                <button type="button" className="seax-go" onClick={onClick}>
                    {Icon ? <Icon aria-hidden="true" /> : null} {label}
                </button>
            ) : null}
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

            /* ONE BOX FOR EVERY BEAT. Nothing below the fold, ever. */
            /* ⚠️ SIZED AGAINST A REAL PHONE, NOT A DESIGN CANVAS. "I don't like having to scroll up and down"
               is a constraint on the WHOLE page, and this stage sits under the site header and the nav bar,
               which together eat about 200px before it starts. A fixed 470 pushed the button below the fold on
               a 667pt phone — the one place it must never be. dvh so it also survives a browser's address bar
               growing and shrinking. */
            .seax-stage { position: relative; width: 100%; height: clamp(300px, 52dvh, 440px);
                border-radius: 16px; overflow: hidden;
                background: #0a1420; border: 1px solid rgba(159,216,255,.18); }
            .seax-fill { position: absolute; inset: 0; }
            .seax .sail-sea { height: 100%; }
            .seax-room { background: #0a0804; }
            .seax-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }

            .seax-her { position: absolute; right: 6%; top: 22%; z-index: 2; }
            .seax-her img { display: block; width: 110px; height: auto; filter: drop-shadow(0 4px 7px rgba(0,0,0,.45)); }
            .seax-her.is-closing img { animation: seaxGrow 2.4s cubic-bezier(.3,.7,.4,1) forwards; }
            @keyframes seaxGrow { from { width: 34px; } to { width: 110px; } }
            .seax-her.is-hurt { animation: seaxHurt .45s ease-out; }
            @keyframes seaxHurt { 40% { transform: translateX(-7px) rotate(-3deg); } }
            .seax-smoke { position: absolute; left: 38%; top: 8%; width: 46px; height: 46px; border-radius: 50%;
                background: radial-gradient(circle, rgba(70,70,70,.85), rgba(70,70,70,0) 70%);
                animation: seaxSmoke 2.2s ease-out infinite; }
            @keyframes seaxSmoke { from { transform: scale(.4) translateY(0); opacity: .9; } to { transform: scale(1.6) translateY(-30px); opacity: 0; } }

            .seax-isle { position: absolute; left: 50%; top: 24%; z-index: 1;
                animation: seaxNear 2.6s ease-out forwards; }
            @keyframes seaxNear { from { width: 90px; margin-left: -45px; opacity: .7; } to { width: 250px; margin-left: -125px; opacity: 1; } }

            .seax-cap { position: absolute; left: 50%; bottom: 22%; width: 170px; margin-left: -85px; z-index: 2;
                filter: drop-shadow(0 10px 16px rgba(0,0,0,.7));
                animation: seaxIn .5s cubic-bezier(.2,1.3,.35,1) both; }
            @keyframes seaxIn { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
            .seax-hole { position: absolute; left: 50%; bottom: 30%; width: calc(54px + var(--n) * 28px);
                height: calc(24px + var(--n) * 10px); margin-left: calc(-27px - var(--n) * 14px); border-radius: 50%;
                background: radial-gradient(ellipse, #2b1d10, #130d06); box-shadow: inset 0 6px 14px rgba(0,0,0,.85);
                transition: width .3s ease, height .3s ease, margin-left .3s ease; }
            .seax-chest { position: absolute; left: 50%; bottom: 28%; width: 132px; margin-left: -66px; z-index: 2;
                filter: drop-shadow(0 10px 16px rgba(0,0,0,.7));
                animation: seaxIn .55s cubic-bezier(.2,1.4,.35,1) both; }

            /* THE SCOPE — opaque, so the only thing in the glass is her. */
            .seax-scope { position: absolute; inset: 0; z-index: 7; display: flex; flex-direction: column;
                align-items: center; justify-content: center; gap: 10px; padding-bottom: 96px;
                background: rgba(3,8,12,.74); animation: seaxIn .3s ease-out both; }
            .seax-lens { position: relative; width: 204px; height: 204px; border-radius: 50%; overflow: hidden;
                display: grid; place-items: center;
                background: radial-gradient(circle at 50% 38%, #3a668c, #0b1722 74%);
                border: 3px solid #6b5836; box-shadow: 0 0 0 6px rgba(20,14,8,.9), 0 10px 26px rgba(0,0,0,.6); }
            .seax-lens-ship { width: 62%; height: 62%; object-fit: contain;
                filter: drop-shadow(0 6px 10px rgba(0,0,0,.6)); animation: seaxBob 4s ease-in-out infinite; }
            @keyframes seaxBob { 0%,100% { transform: translateY(0) rotate(-1.5deg); } 50% { transform: translateY(-6px) rotate(1.5deg); } }
            .seax-cross { position: absolute; left: 50%; top: 50%; width: 72%; height: 1px; margin-left: -36%;
                background: rgba(255,255,255,.16); }
            .seax-cross::after { content: ""; position: absolute; left: 50%; top: -46px; width: 1px; height: 92px;
                background: rgba(255,255,255,.16); }
            .seax-her-name { font-size: 15px; color: #f6efdf; text-shadow: 0 2px 6px rgba(0,0,0,.8); }

            /* THE ONE LINE AND THE ONE BUTTON, always in the same place at the foot of the scene. */
            .seax-hud { position: absolute; left: 10px; right: 10px; bottom: 24px; z-index: 8; }
            .seax-say { display: flex; flex-direction: column; gap: 7px; padding: 10px 12px; border-radius: 13px;
                background: linear-gradient(180deg, rgba(10,18,26,.88), rgba(6,12,18,.96));
                border: 1px solid rgba(255,215,94,.38);
                animation: seaxIn .4s cubic-bezier(.2,1.3,.35,1) both; }
            .seax-who { font-size: 9.5px; letter-spacing: .2em; text-transform: uppercase; color: #ffd75e; }
            .seax-say b { font-size: 13.5px; line-height: 1.35; color: #f6efdf; font-weight: 600; }
            .seax-go { display: inline-flex; align-items: center; justify-content: center; gap: 7px; width: 100%;
                padding: 11px 14px; border-radius: 11px; font-weight: 900; font-size: 14.5px; cursor: pointer;
                border: none; color: #2a1f07; background: linear-gradient(180deg, #ffe488, #f3b23a);
                box-shadow: 0 3px 0 #b07d1e; }
            .seax-go svg { width: 18px; height: 18px; }

            .seax-beads { position: absolute; left: 0; right: 0; bottom: 9px; z-index: 8;
                display: flex; gap: 6px; justify-content: center; }
            .seax-beads span { width: 6px; height: 6px; border-radius: 50%; background: rgba(255,255,255,.22); }
            .seax-beads span.on { background: #ffd75e; }
        `}</style>
    );
}
