"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { clunk, coinIn, crack, land, ratchet, reveal, roll, stopGachaAudio } from "@/components/casino/gacha-audio.js";
import GachaPit from "@/components/casino/GachaPit.js";

// ── THE HALLOWE'EN GACHAPON ──────────────────────────────────────────────────────────────────────────────
// Luke: "it would be awesome if it was like a real simulation so it really felt like a real gachapon machine."
//
// So it is a MACHINE, operated in the order a real one is operated, and every step is a thing you do rather
// than a thing you watch:
//
//   1. the token goes in          — a tap, and it is gone from your count before anything else happens
//   2. YOU TURN THE CRANK         — a drag through 180°, with a ratchet under your thumb the whole way
//   3. the mechanism gives        — one capsule leaves the globe and the rest fall into the gap
//   4. it comes down the chute    — and you hear it before you see it reach the tray
//   5. YOU TWIST IT OPEN          — a second tap, because the capsule in the tray is a held breath
//
// ⚠️ STEP 2 IS THE WHOLE FEATURE AND IT IS NOT A BUTTON. A "Pull" button with an animation after it is a
// slot machine wearing a gachapon costume: the thing that makes a real one worth queueing for is that the
// resistance is in YOUR hand and the machine gives at a moment you caused. The crank is a pointer drag with
// its own ratchet, it can be turned slowly or fast, and the capsule does not drop until the handle is round.
//
// ⚠️ AND THE PRIZE IS ROLLED BY THE SERVER AT THE MOMENT THE TOKEN IS SPENT, not when the capsule opens. The
// animation is theatre over a decided result — anything else would mean the roll could be influenced by how
// the player drags, and a machine that pays real money must not have its outcome anywhere near the client.
// What the client gets to choose is only which capsule in the globe LOOKS like it left.

// ── WHERE THE GLOBE IS IN THE SPRITE ─────────────────────────────────────────────────────────────────────
// Measured off gacha-rig.webp rather than eyeballed: the widest bright run in the top half of the drawing is
// the glass sphere, and it sits with its centre 47.7% across and 27.2% down the machine, 81.9% of the
// machine's width wide. Those three numbers put the ball pit exactly inside the painted glass, and if the
// machine is ever redrawn they are the three things to re-measure.
// ⚠️ THESE ARE PERCENTAGES OF THE WHOLE IMAGE, NOT OF THE DRAWING INSIDE IT. The first set was measured
// against the sprite's CONTENT box — the machine is 199px wide inside a 384px canvas, so the rest is
// transparent padding — and then used as CSS percentages, which resolve against the <img> element. The globe
// came out nearly twice its size and a ring of prizes floated around the outside of the machine.
//
//   content box: x 95-294, y 4-379 of a 384x384 sprite
//   globe centre: 95 + 0.477x199 = 190  ->  49.5% of the image
//                 4  + 0.272x375 = 106  ->  27.6%
//   globe width:  0.819 x 199     = 163  ->  42.4%
// 38 rather than 42.4: a little inside the painted glass, so the sphere's own rim and the brass collar at
// its base frame the prizes instead of being covered by them.
const GLOBE = { x: 49.5, y: 26.5, d: 38 };

const STEP = { idle: "idle", cranking: "cranking", dropping: "dropping", tray: "tray", open: "open" };

export default function Gachapon({ onClose }) {
    const [view, setView] = useState(null);
    const [busy, setBusy] = useState(false);
    const [step, setStep] = useState(STEP.idle);
    const [won, setWon] = useState(null);
    const [turn, setTurn] = useState(0);          // 0..1, how far round the handle is
    const [gone, setGone] = useState([]);         // which globe capsules have been dispensed
    const [showIndex, setShowIndex] = useState(false);
    const [err, setErr] = useState(null);

    // How hard the capsules are being churned, 0..1. Driven by the handle, read by the pit.
    // ⚠️ WHAT GOES IN THE GLOBE IS WHAT HAS A PICTURE. Store credit has no sprite and never will;
    // neither does 'a piece of Harvest's End, drawn at random'. A ball pit with four blank
    // placeholders in it is the circle-full-of-circles problem again, in a smaller way — so the
    // glass holds the twelve things that can actually be recognised through it, and the shelf
    // behind 'see what is in it' is where the complete list lives.
    const ballPrizes = useMemo(() => (view?.prizes || []).filter((p) => p.sprite).slice(0, 12), [view]);
    // How hard the capsules are being churned, 0..1. Driven by the handle, read by the pit.
    const churn = step === STEP.cranking && turn > 0 ? Math.min(1, 0.35 + turn) : 0;
    const drag = useRef({ on: false, last: 0, ticks: 0 });
    const pending = useRef(null);                 // the server's answer, held until the handle is round

    const post = useCallback(async (body) => {
        const r = await fetch("/api/marketplace/casino", {
            method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
        }).catch(() => null);
        return r ? r.json().catch(() => null) : null;
    }, []);

    const load = useCallback(async () => {
        const d = await post({ action: "gacha_view" });
        if (d?.ok) setView(d);
    }, [post]);

    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount (setState is post-await)
    useEffect(() => { load(); }, [load]);
    useEffect(() => () => stopGachaAudio(), []);

    // ── THE TOKEN ────────────────────────────────────────────────────────────────────────────────────────
    // ⚠️ THE PULL HAPPENS HERE, AT THE TOKEN, NOT AT THE END OF THE CRANK. The server spends the ticket and
    // decides the prize the moment the coin goes in — which is also when a real machine takes your money.
    // The result is parked in a ref until the handle is round, so the crank cannot be abandoned to dodge a
    // bad pull: the ticket is already gone, exactly as it would be.
    const insert = useCallback(async () => {
        if (busy || step !== STEP.idle) return;
        if (!view?.tickets) { setErr("You have no tokens. They turn up while you play."); return; }
        setBusy(true);
        setErr(null);
        coinIn();
        const d = await post({ action: "gacha_pull" });
        setBusy(false);
        if (!d?.ok) {
            setErr(d?.error === "no_ticket" ? "That token is already spent." : "The machine did not take it. Try again.");
            return;
        }
        pending.current = d.won;
        setView((v) => (v ? { ...v, tickets: d.tickets } : v));
        setStep(STEP.cranking);
        setTurn(0);
        drag.current = { on: false, last: 0, ticks: 0 };
    }, [busy, step, view, post]);

    // ── THE CRANK ────────────────────────────────────────────────────────────────────────────────────────
    // Angle is measured from the handle's own centre, so the drag works wherever on the dial you grab it and
    // however far out — which is how a real handle behaves and is also the only version that survives a
    // thumb on a phone.
    const dialRef = useRef(null);
    const angleAt = (e) => {
        const r = dialRef.current?.getBoundingClientRect();
        if (!r) return 0;
        return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * (180 / Math.PI);
    };

    const finish = useCallback(() => {
        setStep(STEP.dropping);
        clunk();
        // One capsule leaves the globe — the rest are left to fall into the gap by the CSS, which is the
        // small lie that makes the pile look like it is under gravity.
        // The pit keeps churning for a beat after the handle lands, which is the mechanism
        // settling — capsules do not stop the instant the crank does.
        setTimeout(() => { roll(); }, 150);
        setTimeout(() => { land(); setStep(STEP.tray); }, 560);
    }, []);

    const onDown = (e) => {
        if (step !== STEP.cranking) return;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        drag.current = { on: true, last: angleAt(e), ticks: 0 };
    };
    const onMove = (e) => {
        if (!drag.current.on || step !== STEP.cranking) return;
        const a = angleAt(e);
        let d = a - drag.current.last;
        // Across the ±180 seam the delta jumps a full turn; unwrap it or one flick reads as a whole rotation.
        if (d > 180) d -= 360;
        if (d < -180) d += 360;
        drag.current.last = a;
        if (d <= 0) return;                        // the ratchet only turns one way, like the real one
        setTurn((t) => {
            const next = Math.min(1, t + d / 180);
            // A tooth every 15° of the turn. Tied to distance rather than to time, so turning it slowly
            // gives you slow clicks instead of the same canned sound at a different speed.
            const tick = Math.floor(next * 12);
            if (tick > drag.current.ticks) { drag.current.ticks = tick; ratchet(next); }
            if (next >= 1 && t < 1) { drag.current.on = false; setTimeout(finish, 90); }
            return next;
        });
    };
    const onUp = (e) => {
        drag.current.on = false;
        e.currentTarget.releasePointerCapture?.(e.pointerId);
        // ⚠️ IT SPRINGS BACK. Letting go halfway leaves the handle where you left it on a real machine only
        // if the ratchet holds it — this one does not, and that is deliberate: a crank that keeps your
        // progress turns a gesture into a progress bar you can poke at. The ticket is already spent either
        // way, so nothing is lost but the turn.
        if (step === STEP.cranking) setTurn(0);
    };

    // Desktop keyboard, and the honest escape hatch for anybody who cannot drag.
    const nudge = () => {
        if (step !== STEP.cranking) return;
        setTurn((t) => {
            const next = Math.min(1, t + 0.25);
            ratchet(next);
            if (next >= 1 && t < 1) setTimeout(finish, 90);
            return next;
        });
    };

    const openIt = useCallback(() => {
        if (step !== STEP.tray) return;
        crack();
        const w = pending.current;
        setWon(w);
        setStep(STEP.open);
        const rank = w?.capsule === "gold" ? 4 : w?.capsule === "purple" ? 3 : w?.capsule === "blue" ? 2 : 1;
        setTimeout(() => reveal(rank), 180);
        if (typeof window !== "undefined") window.dispatchEvent(new Event("wolfden-hud-refresh"));
        load();
    }, [step, load]);

    const again = () => { setWon(null); setStep(STEP.idle); setTurn(0); pending.current = null; };

    const tickets = view?.tickets ?? 0;
    const prizes = view?.prizes || [];
    const liveTone = pending.current?.tone || "#ffcf3a";

    return (
        <div className="gx-wrap" role="dialog" aria-label="The Hallowe'en Gachapon">
            <div className="gx-head">
                <b>The Hallowe&apos;en Gachapon</b>
                <span className="gx-tokens">{tickets} {tickets === 1 ? "token" : "tokens"}</span>
                <button type="button" className="gx-x" onClick={onClose} aria-label="Step away">✕</button>
            </div>

            {showIndex ? (
                <div className="gx-index">
                    {/* Luke: "It would be sweet if you could aee all the things in the halloween gachapon
                        machine." Every row, with its real odds — the machine pays money, so being coy about
                        the numbers is the one thing it is not allowed to be. */}
                    <p className="gx-index-note">Everything in the globe, and how often it comes out.</p>
                    {prizes.map((p) => (
                        <div key={p.id} className={`gx-row${p.owned ? " is-owned" : ""}`} style={{ "--t": p.tone }}>
                            <span className="gx-row-cap" />
                            <span className="gx-row-pic">
                                {p.sprite ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={p.sprite} alt="" draggable={false} />
                                ) : (
                                    /* ⚠️ A SHELL, NOT AN EMPTY WELL. Money has no sprite and never will, and
                                       neither does "one of five, drawn at random" — filmed, those four rows
                                       were holes in an otherwise illustrated list and read as art that had
                                       failed to load rather than as prizes with nothing to draw. The capsule
                                       is the honest picture: it is what actually comes out of the machine. */
                                    <span className="gx-row-shell" />
                                )}
                            </span>
                            <span className="gx-row-body">
                                <b>{p.name}</b>
                                {p.blurb ? <i>{p.blurb}</i> : null}
                            </span>
                            <span className="gx-row-odds">{p.chance}%{p.owned ? <em>yours</em> : null}</span>
                        </div>
                    ))}
                    <button type="button" className="gx-flat" onClick={() => setShowIndex(false)}>Back to the machine</button>
                </div>
            ) : (
                <div className="gx-machine">
                    {/* ── THE MACHINE ─────────────────────────────────────────────────────────────────
                        Luke: "I was actually like hoping for actual like interactive sprite of a gachapon
                        machine and seeing the ball roll out and everything like that."

                        So it is one drawn machine, and everything interactive is registered ONTO it rather
                        than drawn beside it: the ball pit sits inside the painted glass at measured
                        coordinates, the crank hit-area is over the painted handle, and the capsule comes out
                        of the painted chute. A row of CSS boxes next to a picture of a machine is a control
                        panel; this is the machine. */}
                    <div className="gx-rig">
                        {/* THE PRIZES, BEHIND THE GLASS. The pit is clipped to a circle laid exactly over
                            the painted sphere — see GLOBE, measured off the sprite. The sheen goes on top of
                            them so they read as being INSIDE the glass rather than stuck to the front of it. */}
                        <span className="gx-globe-box"
                            style={{ left: `${GLOBE.x}%`, top: `${GLOBE.y}%`, width: `${GLOBE.d}%` }}>
                            <GachaPit prizes={ballPrizes} churn={churn} />
                            <span className="gx-sheen" />
                        </span>

                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img className="gx-rig-art" src="/images/casino/gacha-rig.webp" alt="" draggable={false} />

                        {/* THE HANDLE. Invisible, sitting on the painted crank — the brass handle you can
                            see IS the thing you grab, and a second drawn dial beside it would be the machine
                            having two cranks. */}
                        <div
                            ref={dialRef}
                            className={`gx-crank${step === STEP.cranking ? " is-live" : ""}`}
                            style={{ "--turn": `${turn * 180}deg` }}
                            onPointerDown={onDown}
                            onPointerMove={onMove}
                            onPointerUp={onUp}
                            onPointerCancel={onUp}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); nudge(); } }}
                            role="slider"
                            tabIndex={step === STEP.cranking ? 0 : -1}
                            aria-label="Turn the crank"
                            aria-valuenow={Math.round(turn * 100)}
                            aria-valuemin={0}
                            aria-valuemax={100}
                        >
                            <span className="gx-crank-arm" />
                        </div>

                        {/* THE BALL, COMING OUT. It falls down the inside of the machine, turns at the chute
                            and rolls out of the painted mouth — which is why it is one keyframe with a bend
                            in it rather than a straight drop: a capsule that appears in a tray has not come
                            out of anything. */}
                        {step === STEP.dropping ? (
                            <span className="gx-ball-out" style={{ background: liveTone }} aria-hidden="true" />
                        ) : null}
                        {step === STEP.tray ? (
                            <button type="button" className="gx-prize-cap" style={{ background: liveTone }}
                                onClick={openIt} aria-label="Twist it open">
                                <span className="gx-seam" />
                            </button>
                        ) : null}
                    </div>

                    {/* ── WHAT TO DO NEXT, IN ONE LINE ───────────────────────────────────────────────── */}
                    <div className="gx-say">
                        {step === STEP.idle && tickets > 0 ? <>Drop a token in.</> : null}
                        {step === STEP.idle && !tickets ? <>No tokens. They turn up while you play — strikes, chests, catches, harvests.</> : null}
                        {step === STEP.cranking ? <><b>Turn the crank.</b> All the way round.</> : null}
                        {step === STEP.dropping ? <>Something is coming down…</> : null}
                        {step === STEP.tray ? <><b>Twist it open.</b></> : null}
                    </div>

                    {err ? <p className="gx-err">{err}</p> : null}

                    <div className="gx-acts">
                        {step === STEP.idle ? (
                            <button type="button" className="gx-go" disabled={busy || !tickets} onClick={insert}>
                                {busy ? "…" : "Insert a token"}
                            </button>
                        ) : null}
                        <button type="button" className="gx-flat" onClick={() => setShowIndex(true)}>See what is in it</button>
                    </div>
                </div>
            )}

            {/* ── AND WHAT WAS IN IT ─────────────────────────────────────────────────────────────────── */}
            {won ? (
                <div className="gx-won" style={{ "--t": won.tone }} role="status">
                    <span className="gx-won-burst" aria-hidden="true" />
                    <span className="gx-won-pic">
                        {won.sprite ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={won.sprite} alt="" draggable={false} />
                        ) : <span className="gx-won-cap" />}
                    </span>
                    <b>{won.name}</b>
                    {won.cents ? <i className="gx-won-money">On your shop account, in real dollars.</i> : null}
                    {!won.cents && won.blurb ? <i>{won.blurb}</i> : null}
                    <button type="button" className="gx-go" onClick={again}>
                        {tickets > 0 ? `Again — ${tickets} left` : "Done"}
                    </button>
                </div>
            ) : null}
            <style>{CSS}</style>
        </div>
    );
}

const CSS = `
.gx-wrap { position: relative; display: flex; flex-direction: column; gap: 10px; color: #f0e6d6; }
.gx-head { display: flex; align-items: center; gap: 8px; }
.gx-head b { flex: 1; font-size: 1rem; color: #ffd98a; }
.gx-tokens { font-size: 0.78rem; font-weight: 900; color: #2a1403; white-space: nowrap;
    background: linear-gradient(180deg, #ffcf6a, #e89a1c); border-radius: 999px; padding: 3px 11px; }
.gx-x { width: 28px; height: 28px; border-radius: 999px; background: rgba(255,255,255,0.08); border: none;
    color: #e8e2d6; font-size: 14px; cursor: pointer; }
.gx-machine { display: flex; flex-direction: column; align-items: center; gap: 12px; }

/* ── THE MACHINE ──────────────────────────────────────────────────────────────────────────────────────
   One drawn machine, and everything else registered onto it. The art is the only thing that sets the size;
   every overlay below is a percentage OF IT, so the whole rig scales as one object and nothing drifts off
   its painted part when the panel is narrower. */
.gx-rig { position: relative; width: min(72vw, 250px); margin: 0 auto; }
.gx-rig-art { position: relative; z-index: 2; width: 100%; height: auto; display: block;
    filter: drop-shadow(0 10px 18px rgba(0,0,0,0.6)); pointer-events: none; }

/* ⚠️ IN FRONT OF THE ART, NOT BEHIND IT. The plan was prizes at z1 with the painted glass drawing over
   their edges — which needs the sphere to be a HOLE, and the model drew it as frosted white glass. Behind
   it they were simply invisible: a beautiful empty machine.
   So the pit sits on top at z3, clipped to a circle a little inside the painted sphere, and the glass rim
   and brass collar frame it. The sheen above does the rest of the work of putting them inside the bowl. */
.gx-globe-box { position: absolute; z-index: 3; aspect-ratio: 1; transform: translate(-50%, -50%);
    border-radius: 50%; overflow: hidden; }
.gx-pit { position: absolute; inset: 0; display: block; }
.gx-ball { position: absolute; width: 34%; aspect-ratio: 1; display: grid; place-items: center;
    will-change: transform, left, top; }
.gx-ball img { width: 100%; height: 100%; object-fit: contain;
    filter: drop-shadow(0 2px 3px rgba(0,0,0,0.5)); }
.gx-ball i { width: 72%; aspect-ratio: 1; border-radius: 50%; background: var(--t, #ff9a2e);
    box-shadow: inset -3px -4px 7px rgba(0,0,0,0.4), inset 3px 4px 6px rgba(255,255,255,0.4); }
/* The sheen goes on top of the prizes and under the painted frame: curved glass has a highlight and the
   things behind it are dimmed towards the bottom of the bowl. Without it the sprites read as stickers. */
.gx-sheen { position: absolute; inset: 0; border-radius: 50%; pointer-events: none;
    background: linear-gradient(152deg, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0.05) 26%, transparent 46%),
        radial-gradient(circle at 50% 118%, rgba(0,0,0,0.42), transparent 55%); }

/* ── THE CRANK ────────────────────────────────────────────────────────────────────────────────────────
   Invisible, laid over the painted brass handle. touch-action: none is load-bearing, not tidiness: without
   it the browser claims the drag as a page scroll on the first vertical pixel and the handle stops following
   your thumb halfway round. */
.gx-crank { position: absolute; z-index: 3; left: 62%; top: 62%; width: 30%; aspect-ratio: 1;
    transform: translate(-50%, -50%); border-radius: 50%; touch-action: none; cursor: grab;
    -webkit-appearance: none; appearance: none; border: 0; background: none; padding: 0; }
.gx-crank.is-live { cursor: grab; box-shadow: 0 0 0 2px rgba(255,207,106,0.75), 0 0 20px rgba(255,200,80,0.6); }
.gx-crank.is-live:active { cursor: grabbing; }
.gx-crank:focus-visible { outline: 2px solid #ffcf6a; outline-offset: 3px; }
/* The arm that turns. The sprite's own handle is painted at rest; this rides over it so the player can see
   how far round they are, which is the only feedback the gesture has. */
.gx-crank-arm { position: absolute; left: 50%; top: 50%; width: 13%; height: 46%; border-radius: 99px;
    background: linear-gradient(180deg, #ffe9b0, #b8841f); transform-origin: 50% 100%;
    transform: translate(-50%, -100%) rotate(var(--turn, 0deg)); transition: transform .06s linear;
    opacity: 0; }
.gx-crank.is-live .gx-crank-arm { opacity: 1; }

/* ── AND THE BALL COMING OUT ──────────────────────────────────────────────────────────────────────────
   Down the inside of the body, then a turn at the chute and out of the painted mouth. One keyframe with a
   bend in it, because a capsule that simply appears in a tray has not come out of anything. */
.gx-ball-out { position: absolute; z-index: 3; left: 47%; top: 38%; width: 15%; aspect-ratio: 1;
    border-radius: 50%; pointer-events: none;
    box-shadow: inset -3px -4px 7px rgba(0,0,0,0.45), inset 3px 4px 6px rgba(255,255,255,0.4),
        0 2px 6px rgba(0,0,0,0.5);
    animation: gxOut .56s cubic-bezier(.45,0,.7,1) forwards; }
@keyframes gxOut {
    0%   { transform: translate(-50%, -50%) scale(.85); opacity: 0; }
    15%  { opacity: 1; }
    58%  { transform: translate(-50%, 150%) scale(1); }      /* down the body */
    74%  { transform: translate(-50%, 196%) scale(1); }      /* into the chute */
    100% { transform: translate(-50%, 232%) scale(1); }      /* and out of the mouth */
}
/* Sitting in the mouth of the chute, waiting. It wobbles, because a ball in a plastic tray does and because
   a thing that moves is a thing you understand you can touch. */
/* 47%, not 42% — filmed, it was sitting against the left jamb of the painted chute rather than in its
   mouth. The mouth is the dark rectangle at the foot of the body and its centre is the machine's centre. */
.gx-prize-cap { position: absolute; z-index: 4; left: 47%; top: 83%; width: 16%; aspect-ratio: 1;
    border-radius: 50%; border: none; cursor: pointer; padding: 0;
    box-shadow: inset -4px -5px 9px rgba(0,0,0,0.45), inset 4px 5px 8px rgba(255,255,255,0.45),
        0 0 18px rgba(255,220,140,0.75);
    animation: gxWobble 1.9s ease-in-out infinite; }
@keyframes gxWobble {
    0%, 100% { transform: translate(-50%, -50%) rotate(-7deg); }
    50% { transform: translate(-50%, -50%) rotate(7deg); }
}
.gx-seam { position: absolute; left: 6%; right: 6%; top: 50%; height: 2px; transform: translateY(-50%);
    background: rgba(0,0,0,0.35); }

.gx-say { font-size: 0.85rem; color: #d8ccb8; text-align: center; min-height: 2.4em; line-height: 1.4; }
.gx-say b { color: #ffd98a; }
.gx-err { margin: 0; font-size: 0.82rem; color: #ffb3b3; text-align: center; }
.gx-acts { display: flex; flex-direction: column; gap: 7px; width: 100%; max-width: 280px; }
.gx-go { padding: 12px; border-radius: 12px; font-size: 0.94rem; font-weight: 900; cursor: pointer;
    background: linear-gradient(180deg, #ffcf6a, #e89a1c); border: none; color: #2a1403; }
.gx-go:disabled { background: rgba(255,255,255,0.08); color: #8b93a0; cursor: default; }
.gx-flat { padding: 9px; border-radius: 10px; font-size: 0.82rem; font-weight: 800; cursor: pointer;
    background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.14); color: #e2d8c6; }

/* ── THE SHELF ────────────────────────────────────────────────────────────────────────────────────── */
.gx-index { display: flex; flex-direction: column; gap: 6px; }
.gx-index-note { margin: 0 0 2px; font-size: 0.8rem; color: #b6ab9a; }
.gx-row { display: flex; align-items: center; gap: 9px; padding: 7px 10px 7px 7px; border-radius: 10px;
    background: rgba(255,255,255,0.045); border: 1px solid color-mix(in srgb, var(--t) 45%, transparent); }
.gx-row.is-owned { opacity: 0.55; }
.gx-row-cap { flex: 0 0 auto; width: 14px; height: 14px; border-radius: 50%; background: var(--t);
    box-shadow: inset -2px -2px 4px rgba(0,0,0,0.4), inset 2px 2px 3px rgba(255,255,255,0.4); }
.gx-row-pic { flex: 0 0 auto; display: grid; place-items: center; width: 38px; height: 38px; border-radius: 8px;
    background: radial-gradient(circle at 50% 60%, color-mix(in srgb, var(--t) 22%, transparent), rgba(0,0,0,0.2) 70%); }
.gx-row-pic img { max-width: 34px; max-height: 34px; object-fit: contain; }
.gx-row-shell { width: 24px; height: 24px; border-radius: 50%; background: var(--t);
    box-shadow: inset -3px -4px 6px rgba(0,0,0,0.4), inset 3px 4px 5px rgba(255,255,255,0.4); }
.gx-row-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.gx-row-body b { font-size: 0.86rem; color: #fff; }
.gx-row-body i { font-size: 0.72rem; color: #a99f8e; font-style: italic; line-height: 1.3; }
.gx-row-odds { flex: 0 0 auto; font-size: 0.8rem; font-weight: 900; color: var(--t);
    font-variant-numeric: tabular-nums; text-align: right; }
.gx-row-odds em { display: block; font-size: 0.62rem; font-style: normal; color: #9af5c6; letter-spacing: .06em; }

/* ── THE PRIZE ────────────────────────────────────────────────────────────────────────────────────── */
.gx-won { position: absolute; inset: -10px; z-index: 5; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 9px; padding: 20px; text-align: center;
    border-radius: 16px; background: rgba(10,6,18,0.94); animation: gxWonIn .3s cubic-bezier(.2,1,.3,1) both; }
@keyframes gxWonIn { from { opacity: 0; transform: scale(.95); } to { opacity: 1; transform: none; } }
.gx-won b { font-size: 1.14rem; color: #fff; text-wrap: balance; }
.gx-won i { font-size: 0.84rem; color: #c9bda9; font-style: italic; line-height: 1.4; max-width: 30ch; }
.gx-won-money { color: #9af5c6 !important; font-style: normal !important; font-weight: 800; }
.gx-won-pic { position: relative; display: grid; place-items: center; width: 132px; height: 132px;
    border-radius: 50%; background: radial-gradient(circle, color-mix(in srgb, var(--t) 40%, transparent), transparent 68%); }
.gx-won-pic img { max-width: 118px; max-height: 118px; object-fit: contain;
    filter: drop-shadow(0 8px 14px rgba(0,0,0,0.7)); animation: gxRise .5s cubic-bezier(.2,1,.3,1) both; }
@keyframes gxRise { from { opacity: 0; transform: translateY(16px) scale(.8); } to { opacity: 1; transform: none; } }
.gx-won-cap { width: 72px; height: 72px; border-radius: 50%; background: var(--t);
    box-shadow: inset -5px -6px 11px rgba(0,0,0,0.45), inset 5px 6px 10px rgba(255,255,255,0.45); }
/* The light coming out of the open shell. Screen-blended so it adds rather than washing the prize flat. */
.gx-won-burst { position: absolute; width: 230px; aspect-ratio: 1; border-radius: 50%; pointer-events: none;
    mix-blend-mode: screen; background: radial-gradient(circle, color-mix(in srgb, var(--t) 70%, transparent), transparent 62%);
    animation: gxBurst .7s ease-out both; }
@keyframes gxBurst { 0% { opacity: 0; transform: scale(.2); } 30% { opacity: .9; } 100% { opacity: 0; transform: scale(1.5); } }
`;
