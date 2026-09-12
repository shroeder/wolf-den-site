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

import { SKIES, spot } from "@/lib/marketplace/highseas.js";

const CREW = ["fleet_court", "fleet_blockade", "fleet_choir", "fleet_corvette", "fleet_assize"];
const BEATS = ["sail", "scope", "fight", "brig", "told", "run", "land", "dig", "done"];

export default function HighSeasLab() {
    const [seed, setSeed] = useState(41);
    const [beat, setBeat] = useState("sail");
    const [hits, setHits] = useState(0);       // the fight: three broadsides and she is done
    const [digs, setDigs] = useState(0);       // the dig: three turns of the spade
    // ⚠️ A COUNTER, BECAUSE CSS ANIMATIONS DO NOT RESTART ON A CLASS THAT IS ALREADY THERE. A tap has to kick
    // the same shake every time, and re-applying a class whose computed animation-name is unchanged does
    // nothing. So each tap flips between two identically-shaped animations and the browser sees a new one.
    const [shock, setShock] = useState(0);
    const timers = useRef([]);
    const kick = shock ? (shock % 2 ? " sh-a" : " sh-b") : "";

    const ship = useMemo(() => spot(seed, 0), [seed]);
    const sky = useMemo(() => SKIES[seed % SKIES.length], [seed]);
    const captain = useMemo(() => `/images/fleet/crew/${CREW[seed % CREW.length]}.png`, [seed]);

    const go = useCallback((next) => setBeat(next), []);
    const restart = useCallback(() => { setBeat("sail"); setHits(0); setDigs(0); setShock(0); }, []);

    // The only two beats that move on their own: she comes up out of the horizon, and the island does.
    useEffect(() => {
        timers.current.forEach(clearTimeout);
        timers.current = [];
        if (beat === "sail") timers.current.push(setTimeout(() => setBeat("scope"), 2400));
        if (beat === "run") timers.current.push(setTimeout(() => setBeat("land"), 2600));
        return () => timers.current.forEach(clearTimeout);
    }, [beat]);

    const fire = useCallback(() => {
        setShock((s) => s + 1);
        setHits((n) => {
            const at = n + 1;
            if (at >= 3) timers.current.push(setTimeout(() => setBeat("brig"), 1300));
            return at;
        });
    }, []);

    const dig = useCallback(() => {
        setShock((s) => s + 1);
        setDigs((n) => {
            const at = n + 1;
            if (at >= 3) timers.current.push(setTimeout(() => setBeat("done"), 900));
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
            {/* --sea is where this sky's painted horizon falls, as a fraction of the frame. Everything that
                floats is placed against it rather than against the frame — see SKIES in highseas.js. */}
            <div className={`seax-stage${kick}`} style={{ "--sea": sky.horizon }}>
                {/* THE SEA — the same markup and the same globals.css classes SailingClient renders. */}
                {atSea ? (
                    <div className="sail-sea sail-mood-calm seax-fill">
                        <div className="sail-sky-scroll is-scrolling" aria-hidden="true">
                            {[0, 1, 2, 3].map((n) => (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img key={n} src={`/images/sailing/${sky.id}.png`} alt="" />
                            ))}
                        </div>
                        <div className="sail-clouds is-fast" aria-hidden="true"><i /><i /><i /></div>
                        <div className="sail-reflection" aria-hidden="true" />
                        <div className="sail-glints is-fast" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
                        <div className="sail-nearwater is-scrolling" aria-hidden="true"><i /><i /><i /></div>
                        <div className="sail-depth" aria-hidden="true" />

                        {/* HER SAIL — a speck that grows while you are underway, then holds alongside. */}
                        {beat !== "run" ? (
                            <span className={`seax-her${beat === "sail" ? " is-closing" : " is-close"}${hits ? ` hit-${hits}${kick}` : ""}`}
                                style={{ "--keel": ship.keel }} aria-hidden="true">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={ship.art} alt="" />
                                {hits > 0 ? <span className="seax-smoke" /> : null}
                                {hits > 1 ? <span className="seax-smoke s2" /> : null}
                                {hits > 2 ? <span className="seax-smoke s3" /> : null}
                                {hits > 0 ? <span className={`seax-splash${kick}`} /> : null}
                            </span>
                        ) : null}

                        {/* YOUR BROADSIDE — the gun flash on the side she is on. Three taps used to move a
                            counter; this is the tap having a muzzle. */}
                        {beat === "fight" && hits > 0 ? (
                            <span className={`seax-flash${kick}`} aria-hidden="true" />
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
                        <span className="seax-floor" aria-hidden="true" />
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img className="seax-cap" src={captain} alt="" draggable="false" />
                    </div>
                ) : null}

                {/* THE ISLAND, ashore. */}
                {beat === "land" || beat === "dig" || beat === "done" ? (
                    <div className="seax-fill seax-room">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img className="seax-bg is-sand" src="/images/sailing/dig-bg.png" alt="" aria-hidden="true" />
                        {beat === "done" ? <span className="seax-vig" aria-hidden="true" /> : null}
                        {/* ⚠️ NO DRAWN HOLE. There was a CSS ellipse here and it fought the art: dig-bg already
                            has an excavation, crates and a shovel painted into it, so a black oval laid on top
                            read as a hole in the SCREEN. The chest rises out of the sand instead — real art,
                            and "uncovering" is what digging actually looks like. */}
                        {beat === "dig" || beat === "done" ? (
                            <span className={`seax-dug${beat === "done" ? " is-open" : ""}`} aria-hidden="true">
                                {/* The payoff. It only exists on the last frame of the loop, because a burst
                                    that has been on screen since the first spadeful is wallpaper. */}
                                {beat === "done" ? (
                                    <span className="seax-sparks">
                                        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <i key={i} style={{ "--i": i }} />)}
                                    </span>
                                ) : null}
                                {/* The window the chest slides up through. ⚠️ NOTHING WITH A DROP-SHADOW MAY LIVE
                                    IN HERE — overflow:hidden cuts a filter's shadow into a hard rectangle, which
                                    is exactly the grey box that was floating over the beach. The chest's shadow
                                    is the mound below instead, and that sits outside the clip. */}
                                <span className="seax-dug-win">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img className="seax-chest" src="/images/sailing/dig-chest.png" alt=""
                                        draggable="false" style={{ "--up": `${Math.min(3, beat === "done" ? 3 : digs)}` }} />
                                </span>
                                {/* The sand it is coming out of — in FRONT, so the straight edge of the window
                                    is buried instead of being a razor line across a painted beach. */}
                                <span className="seax-mound" />
                                {digs > 0 ? (
                                    <span className={`seax-grit${kick}`}>
                                        {[0, 1, 2, 3, 4, 5, 6].map((i) => <i key={i} style={{ "--i": i }} />)}
                                    </span>
                                ) : null}
                            </span>
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
            /* ⚠️ MEASURED AGAIN AFTER THE FIRST PASS: 52dvh left 214px of empty page under the stage on an
               880px viewport and still only gave the scene 330px once the dialogue had its share. The header
               and the nav together cost about 250px, so take what is left and cap it, rather than guessing a
               fraction — the box grows on a tall phone and still clears the fold on a short one. */
            .seax-stage { position: relative; width: 100%;
                height: min(540px, max(300px, calc(100dvh - 256px)));
                border-radius: 16px; overflow: hidden;
                background: #0a1420; border: 1px solid rgba(159,216,255,.18); }
            .seax-fill { position: absolute; inset: 0; }
            .seax .sail-sea { height: 100%; }
            /* ── YOUR HULL, SIZED FOR A BOX AND NOT FOR A SCREEN ──────────────────────────────────
               ⚠️ MEASURED: on a 355px stage the shipped boat came out 244px wide and 244 tall — it ran
               23px off the bottom of the frame, sat under the dialogue, and its bowsprit reached across
               to touch the ship it was supposed to be fighting. SailingClient draws it on a full-screen
               sea where that scale is the point; in here it left no water. Smaller, and pushed to port,
               so the duel reads left-to-right: you, open water, her. */
            .seax .sail-boat, .seax .sail-boat.is-underway { left: 31%; bottom: calc((1 - var(--sea, .5)) * 22%); }
            .seax .sail-boat-img { width: clamp(118px, 36vw, 158px); }
            /* The sun's glare belongs on the water, so it starts at the horizon too. */
            .seax .sail-reflection { top: calc(var(--sea, .5) * 100%); height: calc((1 - var(--sea, .5)) * 74%); }
            .seax-room { background: #0a0804; }
            .seax-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
            /* The beach is a wide painting and the frame is tall, so cover fits it by height and leaves the
               top half as empty sky. Pushed in and anchored low: you are AT the dig, not looking at a postcard
               of one. */
            .seax-bg.is-sand { transform: scale(1.34); transform-origin: 50% 88%; }

            /* ── SHE SITS ON THE WATER ────────────────────────────────────────────────────────────
               ⚠️ SHE WAS FLYING. Positioned from the TOP edge, she hung in the clouds well above the horizon, and
               growing her only made the problem bigger because the top edge stayed pinned while the hull
               climbed. Anchored by BOTTOM instead, so her waterline is the fixed thing and the masts rise
               out of it — which is what a ship actually does as it gets closer. She also comes DOWN the
               frame as she closes, because nearer is lower. See [[sprite-floats-object-fit-contain]]. */
            .seax-her { position: absolute; right: 7%; bottom: calc((1 - var(--sea, .5)) * 70%); z-index: 2;
                display: flex; flex-direction: column; align-items: center;
                transition: bottom .5s ease, right .5s ease; }
            .seax-her img { display: block; width: 104px; height: auto; }
            .seax-her.is-closing { animation: seaxClose 2.4s cubic-bezier(.3,.7,.4,1) forwards; }
            .seax-her.is-closing img { animation: seaxGrow 2.4s cubic-bezier(.3,.7,.4,1) forwards; }
            @keyframes seaxClose {
                from { bottom: calc((1 - var(--sea, .5)) * 97%); right: 3%; }
                to { bottom: calc((1 - var(--sea, .5)) * 70%); right: 7%; }
            }
            @keyframes seaxGrow { from { width: 24px; } to { width: 104px; } }
            .seax-her.is-close { bottom: calc((1 - var(--sea, .5)) * 70%); }
            /* ── HER SHADOW, AT HER KEEL AND NOT AT THE EDGE OF THE FILE ──────────────────────────
               A hull with nothing under it reads as pasted on, and one whose shadow lands in open water below
               it reads as FLYING. The sprites are square with a different amount of transparent margin under
               each keel, so the shadow is placed at --keel (see KEEL in highseas.js) rather than at the
               bottom of the box. Percentages, so it tracks while she grows. */
            .seax-her::after { content: ""; position: absolute; left: 50%; bottom: calc(var(--keel, .08) * 100%);
                width: 72%; height: 8%; margin-left: -36%; border-radius: 50%;
                background: radial-gradient(ellipse, rgba(4, 26, 38, .62), rgba(4, 26, 38, 0) 74%); }

            /* ── AND SHE COMES APART AS YOU HIT HER ───────────────────────────────────────────────
               Three taps used to change nothing but a puff of smoke, which made the fight a counter rather
               than a scene. Each hit leans her further over, darkens her and adds smoke. */
            /* ⚠️ MEASURED, THEN PUSHED. The first pass applied correctly — hit-2 really was -9deg at 82%
               brightness with two smoke puffs — and still read as a pristine ship, because a small hull
               against a bright sky hides a nine-degree lean. Verified in the DOM before assuming it was
               broken; it was not broken, it was too quiet. */
            .seax-her.hit-1 img { transform: rotate(-7deg) translateY(2px); filter: brightness(.86) saturate(.9); width: 116px; }
            .seax-her.hit-2 img { transform: rotate(-16deg) translateY(7px); filter: brightness(.72) saturate(.7); width: 128px; }
            .seax-her.hit-3 img { transform: rotate(-26deg) translateY(14px); filter: brightness(.58) saturate(.5); width: 140px; }
            /* AND SHE COMES CLOSER WITH EVERY BROADSIDE. Three taps that only darkened a sprite were a counter
               wearing a picture; a hull that fills more of the glass each time is the fight being WON, and it
               is what makes the word "board" at the end of it mean anything. */
            .seax-her.hit-1 { right: 6%; bottom: calc((1 - var(--sea, .5)) * 63%); }
            .seax-her.hit-2 { right: 5%; bottom: calc((1 - var(--sea, .5)) * 56%); }
            .seax-her.hit-3 { right: 4%; bottom: calc((1 - var(--sea, .5)) * 49%); }
            .seax-her img { transition: transform .45s cubic-bezier(.2,1.2,.4,1), filter .45s ease, width .5s ease; }
            /* She takes the hit. Two identical animations because the class has to CHANGE for one to restart. */
            .seax-her.sh-a { animation: seaxHurtA .5s ease-out; }
            .seax-her.sh-b { animation: seaxHurtB .5s ease-out; }
            @keyframes seaxHurtA { 30% { transform: translateX(9px) translateY(-3px); } }
            @keyframes seaxHurtB { 30% { transform: translateX(9px) translateY(-3px); } }
            /* Water going up where the shot went in. */
            .seax-splash { position: absolute; left: 6%; bottom: -4px; width: 34px; height: 34px; border-radius: 50%;
                background: radial-gradient(circle at 50% 70%, rgba(233,250,255,.95), rgba(160,215,235,.45) 55%, rgba(160,215,235,0) 75%); }
            .seax-splash.sh-a { animation: seaxSplashA .55s ease-out both; }
            .seax-splash.sh-b { animation: seaxSplashB .55s ease-out both; }
            @keyframes seaxSplashA { from { transform: scale(.3) translateY(6px); opacity: 1; } to { transform: scale(1.5) translateY(-22px); opacity: 0; } }
            @keyframes seaxSplashB { from { transform: scale(.3) translateY(6px); opacity: 1; } to { transform: scale(1.5) translateY(-22px); opacity: 0; } }
            /* Your gun deck, on the side she is on. */
            .seax-flash { position: absolute; left: 44%; bottom: calc((1 - var(--sea, .5)) * 34%);
                width: 96px; height: 46px; z-index: 4;
                border-radius: 50%; pointer-events: none;
                background: radial-gradient(ellipse at 20% 50%, rgba(255,249,214,.98), rgba(255,196,72,.72) 38%, rgba(255,140,40,0) 72%); }
            .seax-flash.sh-a { animation: seaxFlashA .34s ease-out both; }
            .seax-flash.sh-b { animation: seaxFlashB .34s ease-out both; }
            @keyframes seaxFlashA { from { transform: scaleX(.35); opacity: 1; } to { transform: scaleX(1.25) translateX(24px); opacity: 0; } }
            @keyframes seaxFlashB { from { transform: scaleX(.35); opacity: 1; } to { transform: scaleX(1.25) translateX(24px); opacity: 0; } }
            /* And the whole scene feels it. */
            .seax-stage.sh-a { animation: seaxKickA .3s ease-out; }
            .seax-stage.sh-b { animation: seaxKickB .3s ease-out; }
            @keyframes seaxKickA { 22% { transform: translate(-5px, 3px); } 60% { transform: translate(3px, -2px); } }
            @keyframes seaxKickB { 22% { transform: translate(-5px, 3px); } 60% { transform: translate(3px, -2px); } }
            .seax-smoke { position: absolute; left: 42%; bottom: 42%; width: 52px; height: 52px; border-radius: 50%;
                background: radial-gradient(circle, rgba(38,38,38,.95), rgba(48,48,48,.35) 45%, rgba(58,58,58,0) 72%);
                animation: seaxSmoke 2.6s ease-out infinite; }
            .seax-smoke.s2 { left: 24%; animation-delay: .5s; }
            .seax-smoke.s3 { left: 60%; animation-delay: 1s; }
            @keyframes seaxSmoke { from { transform: scale(.4) translateY(0); opacity: .9; } to { transform: scale(1.7) translateY(-34px); opacity: 0; } }

            /* Anchored to the waterline for the same reason she is — an island in the sky is worse. */
            .seax-isle { position: absolute; left: 50%; bottom: calc((1 - var(--sea, .5)) * 62%); z-index: 1;
                animation: seaxNear 2.6s ease-out forwards; }
            @keyframes seaxNear {
                from { width: 74px; margin-left: -37px; bottom: calc((1 - var(--sea, .5)) * 98%); opacity: .6; }
                to { width: 236px; margin-left: -118px; bottom: calc((1 - var(--sea, .5)) * 62%); opacity: 1; }
            }

            /* ⚠️ ABOVE THE DIALOGUE, NOT BEHIND IT. At bottom 22% the box covered him from the chest down —
               the one thing the beat is about, half hidden by the words he is saying. The HUD occupies roughly
               the bottom 30% of the stage, so he starts above it. */
            /* ⚠️ AND BIG ENOUGH TO BE A PERSON. At 156px in a 540px frame he was a figurine pinned to a wall
               with nothing under his boots — the beat is a man refusing to talk, and you could not read his
               face. Scaled up and given a floor shadow, which is the whole difference between standing in a
               room and being pasted onto one. */
            .seax-cap { position: absolute; left: 50%; bottom: 31%; width: 218px; margin-left: -109px; z-index: 2;
                filter: drop-shadow(0 14px 20px rgba(0,0,0,.8));
                animation: seaxIn .5s cubic-bezier(.2,1.3,.35,1) both; }
            .seax-room .seax-floor { position: absolute; left: 50%; bottom: calc(31% - 9px); width: 168px; height: 26px;
                margin-left: -84px; border-radius: 50%; z-index: 1;
                background: radial-gradient(ellipse, rgba(0,0,0,.62), rgba(0,0,0,0) 72%); }
            @keyframes seaxIn { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
            /* The chest comes UP out of the sand as you dig — a window with the art sliding through it, so
               what you see is the real chest being uncovered rather than a shape drawn over a painting. */
            /* ⚠️ THE WINDOW IS EXACTLY AS TALL AS THE ART. The chest is a square sprite, so at 132px wide it is
               132px tall; a shorter window looked right for the first two spadefuls and then clipped the base
               off the fully-uncovered chest, which is the one frame that has to be perfect. */
            .seax-dug { position: absolute; left: 50%; bottom: 31%; width: 132px; height: 132px;
                margin-left: -66px; z-index: 2; }
            .seax-dug-win { position: absolute; inset: 0; overflow: hidden; }
            .seax-chest { display: block; width: 132px; height: auto;
                transform: translateY(calc((3 - var(--up, 0)) * 33%));
                transition: transform .5s cubic-bezier(.2, 1.15, .4, 1); }
            /* ⚠️ THE MOUND IS THE SHADOW. It sits OUTSIDE the clipping window and in front of the chest, so it
               does two jobs at once: it hides the window's straight bottom edge, and it gives the chest
               something to sit in. A sprite with nothing under it reads as pasted on, and a drop-shadow is not
               available in here — see the note on the window above. Colours sampled off dig-bg's own sand. */
            /* ⚠️ A SHADOW, NOT A SPOTLIGHT. The first cut of this was a pale sand-coloured ellipse and it read
               as a puddle of light on the beach — a disc under the chest rather than sand around it. What sells
               weight is the DARK under a thing; the two spoil heaps either side are what sell digging. */
            .seax-mound { position: absolute; left: 50%; bottom: -7px; width: 150px; height: 28px;
                margin-left: -75px; border-radius: 50%; z-index: 3;
                background: radial-gradient(ellipse at 50% 46%, rgba(62,34,6,.6) 0%, rgba(62,34,6,.3) 44%, rgba(62,34,6,0) 74%); }
            /* ⚠️ AND NO DRAWN SPOIL HEAPS EITHER. Two sand-coloured ovals either side of the chest read as
               yellow pancakes lying on the beach. The backdrop already has a dug pit painted into it and the
               chest now rises out of THAT, which is the disturbed sand — nothing needed adding. */
            /* ── THE PAYOFF ───────────────────────────────────────────────────────────────────────
               ⚠️ GOLD LIGHT DOES NOT SHOW ON A SUNLIT BEACH. The first cut was a rotating conic ray burst and
               it was invisible against bright sand — everything in frame was already brighter than it. So the
               scene DIMS around the chest instead, which is the only way to make gold read at noon, and the
               chest pops as the lid comes clear. */
            .seax-vig { position: absolute; inset: 0; z-index: 1; pointer-events: none;
                background: radial-gradient(circle at 50% 44%, rgba(8,6,2,0) 16%, rgba(8,6,2,.34) 44%, rgba(8,6,2,.62) 88%);
                animation: seaxIn .55s ease-out both; }
            .seax-dug.is-open .seax-chest { animation: seaxPop .55s cubic-bezier(.2,1.5,.35,1) both; }
            @keyframes seaxPop {
                0% { transform: translateY(12%) scale(.84); }
                60% { transform: translateY(-4%) scale(1.07); }
                100% { transform: translateY(0) scale(1); }
            }
            .seax-sparks { position: absolute; left: 50%; bottom: 74%; width: 0; height: 0; z-index: 5; }
            .seax-sparks i { position: absolute; width: 15px; height: 15px; border-radius: 50%; left: 0; bottom: 0;
                background: radial-gradient(circle, #fff8d0, #ffd75e 52%, rgba(255,215,94,0) 72%);
                box-shadow: 0 0 10px rgba(255,215,94,.9);
                animation: seaxSpark 2.1s ease-out infinite; animation-delay: calc(var(--i) * 240ms); }
            @keyframes seaxSpark {
                0% { opacity: 0; transform: translate(calc((var(--i) - 3.5) * 14px), 8px) scale(.4); }
                20% { opacity: 1; }
                100% { opacity: 0; transform: translate(calc((var(--i) - 3.5) * 26px), -74px) scale(1); }
            }
            /* Sand off the spade. */
            .seax-grit { position: absolute; left: 50%; bottom: 4px; width: 0; height: 0; z-index: 4; }
            .seax-grit i { position: absolute; width: 7px; height: 7px; border-radius: 50%; background: #e3a63a;
                left: 0; bottom: 0; opacity: 0; }
            .seax-grit.sh-a i { animation: seaxGritA .62s ease-out both; animation-delay: calc(var(--i) * 22ms); }
            .seax-grit.sh-b i { animation: seaxGritB .62s ease-out both; animation-delay: calc(var(--i) * 22ms); }
            @keyframes seaxGritA {
                from { opacity: 1; transform: translate(0, 0) scale(1); }
                to { opacity: 0; transform: translate(calc((var(--i) - 3) * 21px), calc(-38px + var(--i) * 4px)) scale(.5); }
            }
            @keyframes seaxGritB {
                from { opacity: 1; transform: translate(0, 0) scale(1); }
                to { opacity: 0; transform: translate(calc((var(--i) - 3) * 21px), calc(-38px + var(--i) * 4px)) scale(.5); }
            }

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
