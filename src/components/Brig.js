"use client";

// ── THE BRIG ─────────────────────────────────────────────────────────────────────────────────────────────────
// ⚠️ THIS WAS A LIST AND THE LIST WAS THE PROBLEM. The first build drew captives as table rows with dot
// ratings and grey pills — a spreadsheet of prisoners. Luke, on seeing it: "that looks terrible rethink it
// entirely immersive sprites music sound animations effects juice clarity immersion."
//
// So it is a ROOM now, and you are standing in it. What that means concretely, because "immersive" on its own
// is not a specification:
//
//   · THE PLACE IS DRAWN. A timber back wall, straw, a chain ring, lit by one lantern. The bars are in FRONT
//     of the men — CSS rather than art, so they are full-bleed at any width and always crisp.
//   · THE NUMBERS ARE OBJECTS. Your nerve IS the lantern and it burns down; his will IS the chain on the wall
//     and its links go one at a time. Nobody reads a stat block down here.
//   · HE REACTS. The captain is a sprite that flinches, squares up or turns away — one animation per outcome,
//     so what happened is legible before a word of it has been read.
//   · IT HAS A VOICE. A slow sawtooth drone and iron-and-timber stings, all of it added to cards-sound.js
//     beside the rest of the game's audio rather than in a second private copy.
//
// The rules are still entirely in captains.js, and the disposition is still not in this payload until he
// breaks. Nothing here knows anything it should not.

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { playMusic, sfx, stopMusic, wake } from "@/lib/marketplace/cards-sound.js";

const ROOM = "/images/sailing/brig/room.png";
const LANTERN = "/images/sailing/brig/lantern.png";
const face = (id) => `/images/fleet/crew/${id}.png`;

const TACTICS = [
    { id: "bluff", name: "Bluff", line: "You already have it. His own crew is why." },
    { id: "offer", name: "Offer", line: "Name a number and let him argue." },
    // No second prisoner to bring in any more — it is his own crew, who you took with the ship.
    { id: "confront", name: "Confront", line: "Walk one of his own crew past the door." },
    { id: "wait", name: "Wait", line: "Say nothing. Leave him with the dark." },
];

// One animation per outcome: the word for what happened, said by his body before the text arrives.
const POSE = { crack: "is-flinch", harden: "is-set", read: "is-turn" };

export default function Brig() {
    const [brig, setBrig] = useState(null);
    const [openId, setOpenId] = useState(null);
    const [busy, setBusy] = useState(false);
    const [beat, setBeat] = useState(null);
    const [broke, setBroke] = useState(null);
    const [err, setErr] = useState("");
    const [shake, setShake] = useState(false);
    const armed = useRef(false);

    const load = useCallback(async () => {
        const r = await fetch("/api/marketplace/sailing/brig", { cache: "no-store" }).catch(() => null);
        const d = r && r.ok ? await r.json().catch(() => null) : null;
        if (d) setBrig(d);
    }, []);
    useEffect(() => { load(); }, [load]);

    // ── IT ONLY MAKES A SOUND ONCE YOU HAVE TOUCHED IT ──────────────────────────────────────────────────
    // Browsers will not start audio without a gesture, and a drone that begins the instant a page loads is
    // the kind of thing people mute for good. It wakes on the first tap down here and stops on the way out.
    const arm = useCallback(() => {
        if (armed.current) return;
        armed.current = true;
        wake();
        playMusic("brig");
    }, []);
    useEffect(() => () => stopMusic(), []);

    const act = useCallback(async (body) => {
        arm(); setBusy(true); setErr("");
        const r = await fetch("/api/marketplace/sailing/brig", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        }).catch(() => null);
        const d = r ? await r.json().catch(() => null) : null;
        setBusy(false);
        if (!d || d.error) { setErr(errorText(d?.error)); sfx("denied"); return null; }
        if (d.brig) setBrig(d.brig);
        return d;
    }, [arm]);

    const ask = useCallback(async (captive, tactic) => {
        setBeat(null);
        const d = await act({ action: "ask", id: captive.id, tactic });
        if (!d) return;
        if (d.broke) {
            sfx("brigBreak");
            setOpenId(null);
            // ⚠️ HELD SEPARATELY BECAUSE HE LEAVES. A broken captain's row ends in the same response that
            // says he cracked, so the cell showing him unmounts before the payoff can be read.
            setBroke({ ...captive, said: d.said, text: d.captive?.broke, chart: d.chart });
            return;
        }
        sfx(d.outcome === "crack" ? "brigCrack" : d.outcome === "harden" ? "brigHarden" : "brigRead");
        if (d.outcome !== "crack") sfx("brigNerve");
        if (d.outcome === "harden") { setShake(true); setTimeout(() => setShake(false), 460); }
        setBeat({ outcome: d.outcome, said: d.said, spent: d.spent });
    }, [act]);

    if (!brig) return <p className="brg-wait">Going below…</p>;

    // ⚠️ ONE MAN, NOT A ROOM OF THEM. Luke: "I dont think we need to collect enemy captains. We just use them
    // as a way to get the location of treasure. Its transient, a stepping stone, not collected." So the berth
    // list, the deck offers, the confession pile and the "lay them side by side" button are all gone — what is
    // left is the room, whoever is standing in it, and the charts he has already given up.
    const held = brig.captain ? [brig.captain] : [];
    const open = held.find((c) => c.id === openId) || null;

    return (
        <section className={`brg${shake ? " is-shook" : ""}`} onPointerDown={arm}>
            {/* ── THE ROOM ── one image, and everything else stands inside it. */}
            <div className="brg-room" style={{ backgroundImage: `url(${ROOM})` }}>
                <span className="brg-dark" aria-hidden="true" />
                {/* Motes in the lantern light — cheap, and the single thing that stops a still image
                    reading as a still image. */}
                <span className="brg-motes" aria-hidden="true">
                    {Array.from({ length: 14 }, (_, i) => (
                        <i key={i} style={{ "--x": `${(i * 37) % 100}%`, "--d": `${9 + (i % 7) * 2.4}s`, "--t": `${-(i * 1.7)}s`, "--s": `${1 + (i % 3) * 0.6}px` }} />
                    ))}
                </span>

                <div className="brg-hang" aria-hidden="true">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={LANTERN} alt="" className="brg-lamp" draggable="false" />
                    <span className="brg-glow" />
                </div>

                {/* ── WHO IS IN HERE ── the men, at size, in the actual room. */}
                <div className="brg-floor">
                    {held.map((c) => (
                        <button key={c.id} type="button" className={`brg-man${c.status === "spent" ? " is-spent" : ""}`}
                            onClick={() => { arm(); sfx("brigDoor"); setBeat(null); setOpenId(c.id); }}
                            aria-label={`${c.name}, ${c.stars} of 5`}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={face(c.art)} alt="" draggable="false" />
                        </button>
                    ))}
                </div>

                {/* ── AND THE IRON, IN FRONT OF ALL OF IT ── */}
                <span className="brg-bars" aria-hidden="true" />
                <span className="brg-brace" aria-hidden="true" />

                {/* ── THE PLATES, ON YOUR SIDE OF THE IRON ─────────────────────────────────────────
                    ⚠️ A SIBLING OF THE BARS AND NOT A CHILD OF THE MEN, WHICH IS NOT A STYLE CHOICE.
                    The name started life inside .brg-floor, which sets a z-index and therefore opens a
                    stacking context — so no z-index on a descendant could ever climb above the bars in
                    the parent context, and every name came out with an iron bar drawn through the
                    middle of it. Out here it is simply above them. Same family as the note on
                    absolutely-positioned children in a grid. */}
                {/* Out here with the nameplates and for the same reason: .brg-floor opens a stacking
                    context, so anything inside it is under the iron no matter what z-index it claims. */}
                {!held.length ? <p className="brg-none">Nobody down here. Beat a ship and her captain comes below with you.</p> : null}

                {held.length ? (
                    <div className="brg-plates-row" aria-hidden="true">
                        {held.map((c) => (
                            <span key={c.id} className="brg-nameplate">
                                <b>{c.name}</b>
                                <Stars n={c.stars} />
                            </span>
                        ))}
                    </div>
                ) : null}
            </div>

            {held.length ? <p className="brg-count">You are not going back out until he talks.</p> : null}
            {err ? <p className="brg-err" role="alert">{err}</p> : null}

            {(brig.charts || []).length ? (
                <div className="brg-charts">
                    {brig.charts.map((ch) => (
                        <div key={ch.id} className="brg-chart">
                            <b>{BANDS[ch.band] || "A Chart"}</b><em>{ch.grade} of 15</em>
                            <span>Set sail from the harbour to spend it.</span>
                        </div>
                    ))}
                </div>
            ) : null}

            {/* ── BOTH OVERLAYS GO TO document.body ────────────────────────────────────────────────────
                ⚠️ position: fixed WAS NOT FIXED TO THE VIEWPORT. The brig is rendered inside a `.card` on the
                sailing page, and that card carries `animation: fade-in-up ... both` — `both` keeps the
                animation's final transform on the element forever, and ANY transform other than `none` makes
                that element the containing block for fixed descendants. So the interrogation panel anchored
                to the card and opened at 1745px down a 1000px screen: you tapped the man and nothing
                appeared. Measured, not guessed — getBoundingClientRect on the open dialog.
                Portalled, which is what five other overlays in this repo already do. The styled-jsx classes
                travel with the markup, so nothing about the look changes. */}
            {/* ── THE INTERROGATION ── the same room, one man, and everything else gone. */}
            {open && typeof document !== "undefined" ? createPortal((
                <div className="brg-over" role="dialog" aria-label={open.name}>
                    <div className="brg-scene" style={{ backgroundImage: `url(${ROOM})` }}>
                        <span className="brg-dark" aria-hidden="true" />
                        <span className="brg-motes" aria-hidden="true">
                            {Array.from({ length: 18 }, (_, i) => (
                                <i key={i} style={{ "--x": `${(i * 29) % 100}%`, "--d": `${8 + (i % 5) * 3}s`, "--t": `${-(i * 1.3)}s`, "--s": `${1 + (i % 3) * 0.7}px` }} />
                            ))}
                        </span>

                        <button type="button" className="brg-x" onClick={() => { sfx("close"); setOpenId(null); }} aria-label="Leave him">✕</button>

                        {/* ── YOUR NERVE IS THE LANTERN, AND IT IS BURNING DOWN ─────────────────────────
                            A number in a box is a number in a box. This is the same information as a fuel
                            gauge you can feel: the room darkens every time you open your mouth, and when it
                            gutters out he has won. */}
                        <div className="brg-hang is-big" style={{ "--fuel": open.nerve / 8 }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={LANTERN} alt="" className="brg-lamp" draggable="false" />
                            <span className="brg-glow" />
                            <em className="brg-fuel">{open.nerve}</em>
                        </div>

                        {/* ── HIS WILL IS THE CHAIN ── one link for each point left in him. */}
                        <div className="brg-chain" aria-label={`${open.will} left in him`}>
                            {Array.from({ length: open.will }, (_, i) => <i key={i} style={{ "--i": i }} />)}
                        </div>

                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={face(open.art)} alt="" draggable="false"
                            key={(open.tried || []).length}
                            className={`brg-him ${beat ? POSE[beat.outcome] || "" : "is-idle"}`} />

                        <span className="brg-bars" aria-hidden="true" />
                        <span className="brg-brace" aria-hidden="true" />

                        <div className="brg-name">
                            <b>{open.name}</b>
                            {open.ship !== open.name ? <i>{open.ship}</i> : null}
                            <Stars n={open.stars} />
                        </div>
                    </div>

                    <div className="brg-below">
                        {/* THE TELL — the one line that lets somebody who reads people skip the probing. */}
                        <p className="brg-tell">{open.tell}</p>

                        {/* ⚠️ CLARITY WITHOUT A STAT BLOCK. The lantern and the chain carry the two numbers
                            that decide this whole screen, and an object nobody has been introduced to is
                            just decoration. Said once, in the room's own words, and only while he is
                            untouched — the moment you have played a move the objects have explained
                            themselves by moving. */}
                        {!(open.tried || []).length ? (
                            <p className="brg-legend">
                                <span><i className="brg-dot is-lamp" />The lantern is your nerve. It burns down.</span>
                                <span><i className="brg-dot is-link" />The chain is what is left in him.</span>
                            </p>
                        ) : null}

                        {beat ? <p className={`brg-said is-${beat.outcome}`} role="status">{beat.said}</p> : null}

                        {(open.tried || []).length ? (
                            <div className="brg-hist">
                                {open.tried.map((t, i) => <span key={i} className={`brg-h is-${t.outcome}`}>{t.tactic}</span>)}
                            </div>
                        ) : null}

                        {open.status === "spent" ? (
                            <div className="brg-done">
                                {/* Ransom and release are gone with the berths — there is nothing left to do
                                    with a man you cannot break, and nothing to keep him in. */}
                                <p>The lantern is out and he has said all he is going to. He goes over the side.</p>
                                <button type="button" className="brg-btn brg-wide" disabled={busy}
                                    onClick={() => { sfx("close"); setOpenId(null); load(); }}>Leave him</button>
                            </div>
                        ) : (
                            <div className="brg-plates">
                                {/* No tactic is locked any more: Confront reaches for his own crew rather than
                                    a second prisoner, and there is never a second prisoner. */}
                                {TACTICS.map((t) => (
                                    <button key={t.id} type="button" className="brg-plate" disabled={busy}
                                        onClick={() => ask(open, t.id)}>
                                        <b>{t.name}</b>
                                        <i>{t.line}</i>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            ), document.body) : null}

            {/* ── HE TALKS ── the one loud moment down here. */}
            {broke && typeof document !== "undefined" ? createPortal((
                <div className="brg-over is-broke" role="dialog" aria-label={`${broke.name} talked`}
                    onClick={() => { sfx("tap"); setBroke(null); }}>
                    <div className="brg-scene is-lit" style={{ backgroundImage: `url(${ROOM})` }}>
                        <span className="brg-flare" aria-hidden="true" />
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={face(broke.art)} alt="" className="brg-him is-broken" draggable="false" />
                        <span className="brg-bars is-fallen" aria-hidden="true" />
                    </div>
                    <div className="brg-below">
                        <p className="brg-kick">He talks</p>
                        <p className="brg-broke-name">{broke.name}</p>
                        <p className="brg-said is-crack">{broke.said}<em>{broke.text}</em></p>
                        <p className="brg-note">{broke.chart
                            ? <>He names the water. <b>{broke.chart.name}</b> — {broke.chart.blurb}</>
                            : <>He names the water, and the chart is in your hold.</>}</p>
                        <button type="button" className="brg-btn is-go brg-wide" onClick={() => setBroke(null)}>Good</button>
                    </div>
                </div>
            ), document.body) : null}

            <style jsx>{`
                .brg { display: block; }
                .brg-wait { padding: 26px; text-align: center; color: #8a7f6d; }
                .brg.is-shook .brg-room { animation: brgShake .44s ease; }
                @keyframes brgShake {
                    0%,100% { transform: none; }
                    18% { transform: translate3d(-5px,2px,0) rotate(-.5deg); }
                    42% { transform: translate3d(4px,-2px,0) rotate(.4deg); }
                    68% { transform: translate3d(-2px,1px,0); }
                }

                .brg-room { position: relative; width: 100%; aspect-ratio: 1 / 1; overflow: hidden;
                    border-radius: 12px; background: #0d0a07 center / cover no-repeat;
                    box-shadow: inset 0 0 70px rgba(0,0,0,.85); }
                .brg-dark { position: absolute; inset: 0; pointer-events: none;
                    background: radial-gradient(120% 90% at 22% 8%, rgba(255,190,110,.20), transparent 55%),
                                radial-gradient(100% 100% at 50% 60%, transparent 30%, rgba(0,0,0,.72) 100%); }

                .brg-motes { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
                .brg-motes i { position: absolute; left: var(--x); bottom: -8px;
                    width: var(--s); height: var(--s); border-radius: 50%;
                    background: rgba(255,214,150,.5);
                    animation: brgMote var(--d) linear infinite; animation-delay: var(--t); }
                @keyframes brgMote {
                    0% { transform: translate(0,0); opacity: 0; }
                    12% { opacity: .8; }
                    100% { transform: translate(26px,-320px); opacity: 0; }
                }

                .brg-hang { position: absolute; top: 0; left: 6%; width: 58px; pointer-events: none; z-index: 5; }
                .brg-hang.is-big { width: 84px; left: 5%; }
                .brg-lamp { display: block; width: 100%; height: auto; transform-origin: 50% 6%;
                    animation: brgSway 6.5s ease-in-out infinite;
                    filter: drop-shadow(0 6px 14px rgba(0,0,0,.7)); }
                @keyframes brgSway { 0%,100% { transform: rotate(-2.2deg); } 50% { transform: rotate(2.2deg); } }
                .brg-glow { position: absolute; left: 50%; top: 58%; width: 340px; height: 340px;
                    transform: translate(-50%,-50%); border-radius: 50%; pointer-events: none;
                    background: radial-gradient(circle, rgba(255,186,92,.42), transparent 62%);
                    opacity: calc(.34 + var(--fuel, 1) * .66);
                    animation: brgFlicker 2.6s ease-in-out infinite; }
                @keyframes brgFlicker { 0%,100% { opacity: .92; } 37% { opacity: .74; } 61% { opacity: 1; } }
                .brg-fuel { position: absolute; left: 50%; top: 104%; transform: translateX(-50%);
                    font-style: normal; font-size: 13px; font-weight: 800; color: #ffca7a;
                    text-shadow: 0 0 10px rgba(255,170,60,.7); }

                /* Links OVERLAP, or it is a column of rings rather than a chain. Iron, lit from the
                   lantern's side, so it belongs to the room rather than sitting on top of it. */
                .brg-chain { position: absolute; top: 20%; right: 5%; z-index: 3;
                    display: flex; flex-direction: column; align-items: center; }
                .brg-chain i { display: block; width: 16px; height: 23px; margin-bottom: -7px;
                    border-radius: 50%; border: 4px solid;
                    border-color: #9b8462 #4a3d2c #3a2f22 #6d5b42;
                    box-shadow: 0 2px 3px rgba(0,0,0,.85), inset 0 0 3px rgba(0,0,0,.6);
                    animation: brgLink .32s ease both; animation-delay: calc(var(--i) * 40ms); }
                .brg-chain i:last-child { margin-bottom: 0; }
                @keyframes brgLink { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }

                /* ⚠️ EACH MAN IS A COLUMN, AND HIS NAME HAS ITS OWN BAND. The first cut hung the name on
                   him absolutely and it came out clipped by the bars on all three - "C..mmodore Ash",
                   "ndertow Van". A label that has to fit between two iron bars is a label that will not. */
                .brg-floor { position: absolute; inset: auto 0 46px 0; z-index: 2; height: 56%;
                    display: flex; align-items: flex-end; justify-content: center; gap: 1%; padding: 0 2%; }
                .brg-man { position: relative; flex: 1 1 0; min-width: 0; height: 100%;
                    display: flex; flex-direction: column; align-items: center; justify-content: flex-end;
                    border: 0; background: none; padding: 0; cursor: pointer;
                    animation: brgBreathe 5.4s ease-in-out infinite; }
                .brg-man:nth-child(2) { animation-delay: -1.6s; }
                .brg-man:nth-child(3) { animation-delay: -3.1s; }
                .brg-man:nth-child(4) { animation-delay: -4.4s; }
                @keyframes brgBreathe { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
                .brg-man img { display: block; width: auto; max-width: 100%; min-height: 0;
                    flex: 1 1 auto; object-fit: contain; object-position: bottom;
                    filter: drop-shadow(0 8px 12px rgba(0,0,0,.75)) brightness(.95) contrast(1.04); }
                .brg-man.is-spent img { filter: drop-shadow(0 8px 12px rgba(0,0,0,.75)) brightness(.6) grayscale(.4); }
                .brg-man:hover img { filter: drop-shadow(0 8px 16px rgba(0,0,0,.8)) brightness(1); }
                .brg-plates-row { position: absolute; inset: auto 0 0 0; z-index: 6;
                    display: flex; align-items: stretch; justify-content: center; gap: 1%;
                    padding: 0 2% 5px; pointer-events: none; }
                /* The plate sizes its own text: four men make each column about eighty pixels wide, and a name like
                   "Cartographer" cannot be set at a fixed size in eighty pixels without breaking mid-word. */
                .brg-nameplate { container-type: inline-size;
                    flex: 1 1 0; min-width: 0; min-height: 44px; justify-content: flex-end;
                    display: flex; flex-direction: column; align-items: center; gap: 3px;
                    padding: 5px 4px 6px; border-radius: 5px;
                    background: linear-gradient(180deg, rgba(14,10,7,.55), rgba(8,6,4,.94));
                    box-shadow: inset 0 1px 0 rgba(255,214,150,.10); }
                .brg-nameplate b { max-width: 100%; font-size: clamp(8.5px, 11cqw, 11px); line-height: 1.22; font-weight: 800;
                    overflow-wrap: break-word;
                    color: #f0e2c8; text-align: center; overflow: hidden;
                    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
                    text-shadow: 0 1px 3px #000; }
                .brg-none { position: absolute; left: 50%; top: 62%; z-index: 6; width: 76%;
                    transform: translate(-50%,-50%); margin: 0; padding: 10px 12px; border-radius: 9px;
                    text-align: center; font-size: 13px; line-height: 1.5; color: #b6a892; background: rgba(8,6,4,.82); }

                /* Drawn rather than painted: full-bleed at any width, crisp at any density, and it can
                   never come back from a generator as something other than bars. */
                .brg-bars { position: absolute; inset: 0; z-index: 4; pointer-events: none;
                    background: repeating-linear-gradient(90deg,
                        transparent 0 calc(12.5% - 7px),
                        #14100c calc(12.5% - 7px) calc(12.5% - 5px),
                        #4b4038 calc(12.5% - 5px) calc(12.5% - 2px),
                        #6d5c4a calc(12.5% - 2px) calc(12.5% + 1px),
                        #33291f calc(12.5% + 1px) calc(12.5% + 4px),
                        #100c09 calc(12.5% + 4px) calc(12.5% + 6px),
                        transparent calc(12.5% + 6px) 25%);
                    filter: drop-shadow(3px 0 5px rgba(0,0,0,.75)); }
                .brg-bars.is-fallen { animation: brgFall .8s ease both; }
                @keyframes brgFall { to { opacity: 0; transform: translateY(14px) scaleY(1.04); } }
                .brg-brace { position: absolute; left: 0; right: 0; top: 17%; height: 8px; z-index: 4;
                    pointer-events: none;
                    background: linear-gradient(180deg, #6d5c4a, #3a2f25 55%, #120e0a);
                    box-shadow: 0 3px 7px rgba(0,0,0,.7); }

                .brg-count { margin: 8px 0 0; text-align: center; font-size: 12px; font-weight: 700;
                    letter-spacing: .1em; text-transform: uppercase; color: #8a7f6d; }
                .brg-err { margin: 8px 0 0; padding: 8px 10px; border-radius: 8px;
                    background: #3a1c20; color: #ffc9cf; font-size: 13px; }


                .brg-head { display: flex; align-items: center; gap: 6px; margin: 18px 0 8px;
                    font-size: 12px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: #8a7f6d; }
                .brg-head :global(svg) { width: 15px; height: 15px; color: #b39355; }

                .brg-chart { display: flex; align-items: baseline; gap: 9px; flex-wrap: wrap; margin-top: 8px;
                    padding: 11px 13px; border: 1px solid #4a6274; border-radius: 10px;
                    background: linear-gradient(180deg, #16222c, #101820); }
                .brg-chart b { font-size: 15px; color: #a9d8ff; }
                .brg-chart em { font-size: 12px; font-style: normal; color: #7f97ad; }
                .brg-chart span { flex-basis: 100%; font-size: 12px; color: #7f97ad; }

                /* Every button states its own colour: the site's global link rules reach in here. */
                .brg-btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px;
                    padding: 10px 14px; border-radius: 9px; cursor: pointer; font: inherit;
                    font-size: 13.5px; font-weight: 800;
                    border: 1px solid #4a4033; background: #221c14; color: #e6dac2; }
                .brg-btn.is-go { border-color: #7a6134; background: linear-gradient(180deg, #3a2f18, #241c0e); color: #ffd89a; }
                .brg-btn:disabled { opacity: .45; cursor: default; }
                .brg-btn em { font-style: normal; color: #ffbe57; }
                .brg-btn :global(svg) { width: 17px; height: 17px; }
                .brg-wide { width: 100%; }

                .brg-over { position: fixed; inset: 0; z-index: 4300; display: flex; flex-direction: column;
                    background: #080604; animation: brgIn .28s ease both; }
                @keyframes brgIn { from { opacity: 0; } to { opacity: 1; } }
                .brg-scene { position: relative; flex: 0 0 auto; height: 46vh; min-height: 250px;
                    background: #0d0a07 center / cover no-repeat; overflow: hidden; }
                .brg-scene.is-lit { filter: brightness(1.25); }
                .brg-x { position: absolute; top: 10px; right: 12px; z-index: 6; width: 38px; height: 38px;
                    border: 0; border-radius: 50%; background: rgba(10,8,6,.72);
                    font-size: 17px; color: #cbbda3; cursor: pointer; }

                .brg-him { position: absolute; left: 50%; bottom: 4%; z-index: 2;
                    height: 74%; width: auto; transform: translateX(-50%);
                    filter: drop-shadow(0 10px 16px rgba(0,0,0,.8)) brightness(.94); }
                /* ⚠️ HIS OWN BREATH, AND NOT THE ONE THE LINE-UP USES. brgBreathe animates the transform
                   property, and .brg-him is centred BY a transform — so borrowing it threw the centring
                   translate away on the first keyframe and he stood shoved off to the right, half of him
                   outside the frame. A shared keyframe is only shareable between elements positioned the
                   same way. */
                .brg-him.is-idle { animation: brgHimBreathe 5.4s ease-in-out infinite; }
                @keyframes brgHimBreathe {
                    0%,100% { transform: translateX(-50%) translateY(0); }
                    50% { transform: translateX(-50%) translateY(-4px); }
                }
                .brg-him.is-flinch { animation: brgFlinch .5s ease both; }
                .brg-him.is-set { animation: brgSet .5s ease both; }
                .brg-him.is-turn { animation: brgTurn .6s ease both; }
                .brg-him.is-broken { animation: brgSag .9s ease both; }
                @keyframes brgFlinch {
                    0% { transform: translateX(-50%); }
                    28% { transform: translateX(-50%) translate3d(9px,3px,0) rotate(2.4deg) scale(.985); }
                    100% { transform: translateX(-50%); }
                }
                @keyframes brgSet {
                    0% { transform: translateX(-50%); }
                    34% { transform: translateX(-50%) translateY(-6px) scale(1.035); }
                    100% { transform: translateX(-50%); }
                }
                @keyframes brgTurn {
                    0%,100% { transform: translateX(-50%) rotateY(0); }
                    50% { transform: translateX(-50%) translateX(-6px) rotateY(26deg); }
                }
                @keyframes brgSag {
                    0% { transform: translateX(-50%); }
                    100% { transform: translateX(-50%) translateY(9px) rotate(-2deg) scale(.97); }
                }
                .brg-flare { position: absolute; inset: 0; z-index: 3; pointer-events: none;
                    background: radial-gradient(circle at 50% 62%, rgba(255,222,160,.75), transparent 60%);
                    animation: brgFlare 1.1s ease both; }
                @keyframes brgFlare { 0% { opacity: 0; } 22% { opacity: 1; } 100% { opacity: .22; } }

                .brg-name { position: absolute; left: 0; right: 0; bottom: 8px; z-index: 5;
                    display: flex; flex-direction: column; align-items: center; gap: 2px; pointer-events: none; }
                .brg-name b { font-size: 19px; font-weight: 800; color: #f6ead2;
                    text-shadow: 0 2px 6px #000, 0 0 16px rgba(0,0,0,.9); }
                .brg-name i { font-size: 12px; font-style: normal; color: #bda98a;
                    text-shadow: 0 1px 4px #000; }

                .brg-below { flex: 1 1 auto; overflow-y: auto; padding: 14px 16px 22px;
                    background: linear-gradient(180deg, #14100b, #0b0906); }
                .brg-tell { margin: 0 0 12px; padding: 11px 13px; border-left: 3px solid #7a6434;
                    border-radius: 0 8px 8px 0; background: rgba(122,100,52,.12);
                    font-size: 14px; line-height: 1.55; color: #dcc98f; font-style: italic; }
                .brg-legend { display: flex; flex-wrap: wrap; gap: 4px 16px; margin: 0 0 13px; }
                .brg-legend span { display: inline-flex; align-items: center; gap: 7px;
                    font-size: 12px; color: #93866f; }
                .brg-dot { width: 9px; height: 9px; border-radius: 50%; flex: 0 0 auto; }
                .brg-dot.is-lamp { background: #ffba5c; box-shadow: 0 0 8px rgba(255,186,92,.8); }
                .brg-dot.is-link { border-radius: 50%; background: none;
                    box-shadow: inset 0 0 0 2px #9b8462; }
                .brg-said { margin: 0 0 12px; padding: 12px 14px; border-radius: 10px;
                    background: #191410; font-size: 14px; line-height: 1.6; color: #d6cab3;
                    animation: brgSay .34s ease both; }
                @keyframes brgSay { from { opacity: 0; transform: translateY(7px); } to { opacity: 1; transform: none; } }
                .brg-said.is-crack { background: #16210f; color: #d3e7b6; box-shadow: inset 3px 0 0 #6f9440; }
                .brg-said.is-harden { background: #24120f; color: #f0bfb2; box-shadow: inset 3px 0 0 #9c4a34; }
                .brg-said em { display: block; margin-top: 8px; font-style: normal; font-weight: 700; color: #ffd48a; }

                .brg-hist { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 13px; }
                .brg-h { padding: 3px 9px; border-radius: 999px; font-size: 11px; font-weight: 700;
                    text-transform: capitalize; background: #241e17; color: #9a8b74; }
                .brg-h.is-crack { background: #22321a; color: #bcd79a; }
                .brg-h.is-harden { background: #3a1d16; color: #eab3a3; }

                .brg-plates { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
                .brg-plate { display: flex; flex-direction: column; align-items: flex-start; gap: 3px;
                    padding: 12px 13px; border-radius: 10px; cursor: pointer; font: inherit; text-align: left;
                    border: 1px solid #5a4a33; color: #f0e3c6;
                    background: linear-gradient(180deg, #2a2318, #1b160e);
                    box-shadow: inset 0 1px 0 rgba(255,214,150,.10), 0 2px 4px rgba(0,0,0,.5); }
                .brg-plate:active { transform: translateY(1px); box-shadow: inset 0 1px 3px rgba(0,0,0,.6); }
                .brg-plate:disabled { opacity: .4; cursor: default; }
                .brg-plate b { font-size: 15px; font-weight: 800; letter-spacing: .02em; }
                .brg-plate i { font-size: 11.5px; font-style: normal; line-height: 1.4; color: #9a8b74; }

                .brg-done p { margin: 0 0 11px; font-size: 14px; line-height: 1.55; color: #d6cab3; }
                .brg-done .brg-btn { margin-bottom: 7px; }

                .brg-kick { margin: 0; text-align: center; font-size: 12px; font-weight: 800;
                    letter-spacing: .2em; text-transform: uppercase; color: #ffbe57; }
                .brg-broke-name { margin: 4px 0 12px; text-align: center; font-size: 21px;
                    font-weight: 800; color: #f6ead2; }
                .brg-note { margin: 0 0 14px; text-align: center; font-size: 13px; color: #9a8b74; }

                /* ── ⚠️ A REAL PHONE IS NOT 900 PIXELS TALL ────────────────────────────────────────────
                   Filmed at 375x440, which is a 667pt phone once the browser chrome is taken off it:
                   the scene ate 46vh, the tell and the legend took the rest, and TWO OF THE FOUR
                   TACTICS were below the fold. The tactics are the entire interaction — a player who
                   has to scroll to find out that Confront exists will not find out that Confront
                   exists. The room gives up the height, because the room is scenery and they are not. */
                @media (max-height: 620px) {
                    .brg-scene { height: 38vh; min-height: 150px; }
                    .brg-below { padding: 10px 12px 16px; }
                    .brg-tell { margin-bottom: 9px; padding: 8px 11px; font-size: 13px; }
                    .brg-legend { gap: 2px 12px; margin-bottom: 9px; }
                    .brg-legend span { font-size: 11px; }
                    .brg-plate { padding: 9px 11px; }
                    .brg-plate b { font-size: 14px; }
                    .brg-plate i { font-size: 11px; }
                    .brg-name b { font-size: 16px; }
                    .brg-name i { font-size: 11px; }
                }

                @media (min-width: 700px) {
                    .brg-room { aspect-ratio: 16 / 9; }
                    .brg-floor { height: 74%; }
                    .brg-scene { height: 52vh; }
                    .brg-plates { grid-template-columns: repeat(4, 1fr); }
                }
            `}</style>
        </section>
    );
}

// ⚠️ ITS OWN STYLE BLOCK, AND IT HAS TO HAVE ONE. styled-jsx scopes a block to the markup of the component
// that DECLARES it — rules living in Brig never reach these dots, because Brig does not render them, this
// does. That is exactly how the first build shipped with the star rating drawing nothing at all.
const Stars = ({ n }) => (
    <span className="brg-stars" aria-label={`${n} of 5`}>
        {[1, 2, 3, 4, 5].map((i) => <i key={i} className={i <= n ? "is-on" : ""} />)}
        <style jsx>{`
            .brg-stars { display: inline-flex; gap: 3px; align-items: center; }
            .brg-stars i { display: block; width: 7px; height: 7px; border-radius: 50%;
                background: rgba(20,16,12,.75); box-shadow: inset 0 0 0 1px rgba(255,220,160,.25); }
            .brg-stars i.is-on { background: #f0b63f;
                box-shadow: 0 0 7px rgba(240,182,63,.75), inset 0 0 0 1px rgba(255,238,200,.6); }
        `}</style>
    </span>
);

const BANDS = { sounding: "A Sounding", bearing: "A Bearing", reckoning: "A Reckoning", certainty: "A Certainty" };

function errorText(code) {
    switch (code) {
        case "brig_full": return "Every iron is full. Break one of them, or put one off at the next port.";
        case "not_enough_doubloons": return "Not enough doubloons to keep him.";
        case "needs_other": return "You are holding nobody else to walk in.";
        case "no_offer": case "gone": return "He is gone — that one waited as long as he was going to.";
        case "spent": return "The lantern is out. There is nothing left to try on him.";
        default: return "That did not go through.";
    }
}
