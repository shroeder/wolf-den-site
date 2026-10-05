"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { clunk, coinIn, crack, land, ratchet, reveal, roll, stopGachaAudio } from "@/components/casino/gacha-audio.js";

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

// How many capsules are visible in the globe. Enough to read as "full" and few enough that the layout is
// cheap — 48 absolutely positioned spans, laid out once, is nothing; three hundred would be a jank.
const GLOBE_N = 48;

// The shell colours, matched to the server's CAPSULES. Repeated here because this is a client component and
// gachapon.js is server-only — the server sends `tone` with every prize and every result, so the two can only
// disagree about the DECORATIVE globe, never about what you actually won.
const SHELLS = ["#ff9a2e", "#ff9a2e", "#ff9a2e", "#54a8ff", "#54a8ff", "#b878ff", "#ffcf3a"];

// A deterministic jumble. Math.random() in a render would reshuffle the whole globe on every state change —
// the capsules would twitch every time the ticket count changed — so the layout is built once from an index.
function globeLayout() {
    const out = [];
    let seed = 1337;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < GLOBE_N; i += 1) {
        // Rejection-sample into a disc so they pile in a circle rather than in a square with bald corners.
        let x = 0; let y = 0;
        do { x = rnd() * 2 - 1; y = rnd() * 2 - 1; } while (x * x + y * y > 0.86);
        out.push({
            i,
            // Pulled downward, because capsules sit in the bottom of a globe rather than floating in it.
            x: 50 + x * 42,
            y: 46 + (y * 0.5 + 0.34) * 46,
            size: 13 + rnd() * 7,
            tone: SHELLS[Math.floor(rnd() * SHELLS.length)],
            spin: rnd() * 360,
            // Each one settles on its own clock, so the pile breathes instead of pulsing as a block.
            delay: rnd() * 2.4,
        });
    }
    return out;
}

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

    const capsules = useMemo(globeLayout, []);
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
        setGone((g) => [...g, (g.length * 7) % GLOBE_N]);
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
                    {/* ── THE GLOBE ──────────────────────────────────────────────────────────────────── */}
                    <div className="gx-globe" aria-hidden="true">
                        <span className="gx-glass" />
                        {capsules.map((c) => (
                            <span
                                key={c.i}
                                className={`gx-cap${gone.includes(c.i) ? " is-gone" : ""}`}
                                style={{
                                    left: `${c.x}%`, top: `${c.y}%`, width: c.size, height: c.size,
                                    background: c.tone, animationDelay: `${c.delay}s`,
                                    transform: `translate(-50%, -50%) rotate(${c.spin}deg)`,
                                }}
                            />
                        ))}
                        <span className="gx-shine" />
                    </div>

                    {/* ── THE CHUTE AND THE TRAY ─────────────────────────────────────────────────────── */}
                    <div className="gx-lower">
                        <div
                            ref={dialRef}
                            className={`gx-dial${step === STEP.cranking ? " is-live" : ""}`}
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
                            <span className="gx-dial-face" />
                            <span className="gx-handle" />
                        </div>

                        <div className="gx-tray">
                            {step === STEP.dropping ? (
                                <span className="gx-falling" style={{ background: liveTone }} aria-hidden="true" />
                            ) : null}
                            {step === STEP.tray ? (
                                <button type="button" className="gx-prize-cap" style={{ background: liveTone }} onClick={openIt} aria-label="Twist it open">
                                    <span className="gx-seam" />
                                </button>
                            ) : null}
                        </div>
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

/* ── THE GLOBE ────────────────────────────────────────────────────────────────────────────────────────
   A real globe is a sphere of clear plastic with a pile of capsules in the bottom of it, lit from the front.
   The three layers here are that: the capsules, a glass sheen OVER them, and a bright spot where the light
   is. Painting the glass under the capsules was the first attempt and it read as a plate of sweets. */
.gx-globe { position: relative; width: min(74vw, 260px); aspect-ratio: 1; border-radius: 50%;
    background: radial-gradient(circle at 36% 28%, rgba(255,255,255,0.16), rgba(20,12,34,0.6) 62%, rgba(8,4,16,0.86));
    border: 3px solid rgba(255,255,255,0.14); overflow: hidden;
    box-shadow: inset 0 -18px 34px rgba(0,0,0,0.6), 0 14px 32px rgba(0,0,0,0.55); }
.gx-glass { position: absolute; inset: 0; border-radius: 50%; pointer-events: none;
    background: linear-gradient(145deg, rgba(255,255,255,0.14) 0%, transparent 38%); }
.gx-cap { position: absolute; border-radius: 50%; pointer-events: none;
    box-shadow: inset -2px -3px 5px rgba(0,0,0,0.42), inset 2px 3px 4px rgba(255,255,255,0.4);
    animation: gxSettle 3.6s ease-in-out infinite; }
/* The pile breathing. A capsule in a full globe is never quite still — the machine hums, people lean on it,
   and the ones underneath are taking the weight. Tiny, and on its own clock per capsule. */
@keyframes gxSettle {
    0%, 100% { margin-top: 0; }
    50% { margin-top: -1.5px; }
}
/* ⚠️ A DISPENSED CAPSULE FALLS OUT OF THE BOTTOM, it does not fade. The globe is glass — a capsule that
   dissolved in mid-pile would be the one moment the whole illusion was being asked to carry weight and
   quietly refused. */
.gx-cap.is-gone { animation: gxDispense .5s cubic-bezier(.5,0,.9,.4) forwards; }
@keyframes gxDispense {
    to { transform: translate(-50%, 160px) scale(0.6); opacity: 0; }
}
.gx-shine { position: absolute; left: 22%; top: 14%; width: 26%; height: 18%; border-radius: 50%;
    background: radial-gradient(ellipse, rgba(255,255,255,0.5), transparent 70%); pointer-events: none; }

.gx-lower { display: flex; align-items: flex-end; gap: 16px; }

/* ── THE CRANK ────────────────────────────────────────────────────────────────────────────────────────
   touch-action: none is load-bearing, not tidiness: without it the browser claims the drag as a page scroll
   on the first vertical pixel and the handle simply stops following your thumb halfway round. */
.gx-dial { position: relative; width: 86px; height: 86px; border-radius: 50%; touch-action: none;
    background: radial-gradient(circle at 40% 34%, #4a4252, #241c30 70%);
    border: 3px solid rgba(255,215,110,0.3); cursor: grab; flex: 0 0 auto; }
.gx-dial.is-live { border-color: #ffcf6a; box-shadow: 0 0 20px rgba(255,200,80,0.55); cursor: grab; }
.gx-dial.is-live:active { cursor: grabbing; }
.gx-dial:focus-visible { outline: 2px solid #ffcf6a; outline-offset: 3px; }
.gx-dial-face { position: absolute; inset: 11px; border-radius: 50%;
    background: repeating-conic-gradient(rgba(255,255,255,0.07) 0 8deg, transparent 8deg 16deg); }
/* The handle, which is the part that turns. Rotated off --turn so the angle IS the state — no second source
   of truth to drift from the number the drag is accumulating. */
.gx-handle { position: absolute; left: 50%; top: 50%; width: 11px; height: 38px; border-radius: 6px;
    background: linear-gradient(180deg, #ffe9b0, #c9922a); transform-origin: 50% 100%;
    transform: translate(-50%, -100%) rotate(var(--turn, 0deg)); transition: transform .06s linear;
    box-shadow: 0 2px 5px rgba(0,0,0,0.6); }
.gx-dial.is-live .gx-handle { background: linear-gradient(180deg, #fff3cf, #e8a81c); }

.gx-tray { position: relative; width: 108px; height: 74px; border-radius: 8px 8px 12px 12px;
    background: linear-gradient(180deg, rgba(0,0,0,0.55), rgba(255,255,255,0.05));
    border: 2px solid rgba(255,255,255,0.12); border-top: none; overflow: hidden; }
.gx-falling { position: absolute; left: 50%; top: -26px; width: 30px; height: 30px; border-radius: 50%;
    box-shadow: inset -3px -4px 7px rgba(0,0,0,0.45), inset 3px 4px 6px rgba(255,255,255,0.4);
    animation: gxFall .56s cubic-bezier(.45,0,.7,1) forwards; }
@keyframes gxFall {
    0% { transform: translate(-50%, 0) scale(.9); }
    62% { transform: translate(-50%, 40px) scale(1); }
    78% { transform: translate(-60%, 28px) scale(1); }
    100% { transform: translate(-50%, 38px) scale(1); }
}
/* The capsule sitting in the tray, waiting. It wobbles, because a ball in a plastic tray does, and because
   a thing that moves is a thing you understand you can touch. */
.gx-prize-cap { position: absolute; left: 50%; bottom: 10px; width: 46px; height: 46px; border-radius: 50%;
    transform: translateX(-50%); border: none; cursor: pointer; padding: 0;
    box-shadow: inset -4px -5px 9px rgba(0,0,0,0.45), inset 4px 5px 8px rgba(255,255,255,0.45), 0 0 18px rgba(255,220,140,0.6);
    animation: gxWobble 1.9s ease-in-out infinite; }
@keyframes gxWobble {
    0%, 100% { transform: translateX(-50%) rotate(-5deg); }
    50% { transform: translateX(-50%) rotate(5deg); }
}
.gx-seam { position: absolute; left: 4%; right: 4%; top: 50%; height: 2px; transform: translateY(-50%);
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
