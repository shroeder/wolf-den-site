"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ICON_R, WEDGES, WEDGE_DEG, WEDGE_OFFSET, iconPos, landingRotation } from "@/lib/marketplace/wheel-geometry.js";

// ── THE WHEEL ON THE COUNTER ─────────────────────────────────────────────────────────────────────────────────
// Luke: "just make a wheel you can spin. and it says the reward. and then shows a qr code to scan. that takes
// them to the sign up."
//
// It replaces a three-panel slideshow that explained the game in prose to people who were not reading it. A
// stranger will put a finger on a prize wheel without being asked to, and that touch is the whole pitch: they
// have now played the game, and the QR is the way to keep playing it.
//
// ── IT IS THE REAL WHEEL, NOT A PROP ─────────────────────────────────────────────────────────────────────────
// The wedges, the art and the odds all come from publicWheelView() — the same table getSpinState hands the
// member's daily spin. Nothing here is a hand-written prize list, because a made-up wedge is a promise the
// counter cannot keep, and a real wedge whose gold figure was copied instead of imported goes stale the first
// time GOLD_MINT_RATE moves. What a customer watches land is what a new account can actually win.
//
// What it deliberately does NOT do is pay out: there is no account behind this screen, so the result card says
// the wheel landed on a thing, never that they have won a thing. The prize is the reason to scan, and it is
// waiting on the other side — every account gets a free spin a day, so a brand-new member has one ready.

const SPIN_MS = 5200;
// How long a result stands before the screen invites the next person. Long enough to read it, scan it, and
// talk about it; short enough that nobody walks up to a stranger's result and thinks the wheel is broken.
// (The D&D kiosk had exactly this bug: it sat on one person's thank-you screen until somebody reloaded it.)
const HOLD_MS = 45000;
// The idle disc turns slowly on its own. A dead wheel reads as a picture of a wheel; a moving one reads as a
// machine that is waiting for you.
const DRIFT_DEG_PER_S = 3;

/** Pick a wedge the way the real spin does — by weight, off the odds the wheel actually ships with. */
function rollIndex(prizes) {
    const total = prizes.reduce((s, p) => s + (Number(p.odds) || 0), 0);
    if (!(total > 0)) return Math.floor(Math.random() * prizes.length);
    let r = Math.random() * total;
    for (let i = 0; i < prizes.length; i += 1) {
        r -= Number(prizes[i].odds) || 0;
        if (r <= 0) return i;
    }
    return prizes.length - 1;
}

export default function CounterWheel({ prizes, signupQr, pointsRate }) {
    const [rot, setRot] = useState(0);
    const [spinning, setSpinning] = useState(false);
    const [wonIdx, setWonIdx] = useState(null);
    const timers = useRef([]);

    const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
    useEffect(() => clearTimers, []);

    // The idle drift, in its own effect so it can't fight the landing transition: it only ever runs while the
    // wheel is at rest with nothing won.
    useEffect(() => {
        if (spinning || wonIdx != null) return undefined;
        const t = setInterval(() => setRot((r) => r + DRIFT_DEG_PER_S), 1000);
        return () => clearInterval(t);
    }, [spinning, wonIdx]);

    const spin = useCallback(() => {
        if (spinning) return;
        clearTimers();
        const idx = rollIndex(prizes);
        setWonIdx(null);
        setSpinning(true);
        // The roll is local, so there is no server round trip to cover and no lead-in phase — the disc goes
        // straight for the wedge it has already picked. (The member's wheel needs the lead-in because it is
        // waiting on a POST; see SpinWheel.)
        const turns = 5 + Math.floor(Math.random() * 4);
        setRot((prev) => landingRotation(prev, idx, turns));
        timers.current.push(setTimeout(() => {
            setSpinning(false);
            setWonIdx(idx);
            timers.current.push(setTimeout(() => setWonIdx(null), HOLD_MS));
        }, SPIN_MS));
    }, [prizes, spinning]);

    const won = wonIdx != null ? prizes[wonIdx] : null;

    return (
        <div className="cq" onClick={spin} role="presentation">
            <div className={`cq-stage${spinning ? " is-spinning" : ""}`}>
                <div className={`cq-ring${won && !spinning ? " has-won" : ""}`}>
                    <div
                        className="cq-rotor"
                        style={{
                            transform: `translate(-50%, -50%) rotate(${rot}deg)`,
                            transition: spinning ? `transform ${SPIN_MS}ms cubic-bezier(0.08,0.72,0.04,1)` : "transform 1s linear",
                        }}
                    >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img className="cq-disc" src="/images/spin/wheel-disc.png" alt="" draggable="false" />
                        <div className="cq-icons">
                            {prizes.slice(0, WEDGES).map((p, i) => (
                                <div
                                    key={p.label + i}
                                    className={`cq-ico tier-${p.tier}${wonIdx === i && !spinning ? " is-won" : ""}`}
                                    style={iconPos(i, WEDGE_OFFSET, WEDGE_DEG, ICON_R)}
                                >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    {p.sprite ? <img className="cq-ico-img" src={p.sprite} alt="" draggable="false" /> : null}
                                </div>
                            ))}
                        </div>
                    </div>
                    {/* The frame's wolf ornament ends in a gold chevron at dead top, and that IS the pointer.
                        See .cq-ring.has-won: the winning sprite lifts over it once the disc stops, because
                        dead top is the one spot on the wheel the ornament covers. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="cq-frame" src="/images/spin/wheel-frame.png" alt="" draggable="false" />
                </div>
            </div>

            <aside className="cq-side">
                {won ? (
                    <div className={`cq-won tier-${won.tier}`} key={`${wonIdx}-${rot}`}>
                        <span className="cq-kick">The wheel landed on</span>
                        <div className="cq-won-face">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            {won.sprite ? <img className="cq-won-img" src={won.sprite} alt="" /> : null}
                            <strong className="cq-won-name">{won.label}</strong>
                        </div>
                        {won.desc ? <p className="cq-won-desc">{won.desc}</p> : null}

                        <div className="cq-ask">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            {signupQr ? <img className="cq-qr" src={signupQr} alt="" /> : <div className="cq-qr cq-qr-wait" />}
                            <b className="cq-scan">Scan to take your own spin</b>
                            <span className="cq-sub">
                                Free to join, about ten seconds. Every account gets a spin a day — then {pointsRate} points
                                per $1 you spend here.
                            </span>
                        </div>
                        <span className="cq-again">Touch the wheel to spin again</span>
                    </div>
                ) : (
                    <div className="cq-invite">
                        <span className="cq-kick">The Wolf Den</span>
                        <strong className="cq-invite-head">{spinning ? "Good luck…" : "Give it a spin"}</strong>
                        <p className="cq-invite-sub">
                            {spinning
                                ? "Every wedge on there is a real prize off the real wheel."
                                : "Touch the wheel. It is the same wheel every member spins for free, every day."}
                        </p>
                    </div>
                )}
            </aside>

            <style jsx>{`
                /* Keyframes are namespaced cq* — a name shared with another styled-jsx block is one of the
                   ways this silently styles nothing (SpinWheel already owns cwWon/cwWonHalo/cwBuzz). */
                .cq { position: fixed; inset: 0; display: grid; grid-template-columns: 1.05fr 0.95fr;
                    align-items: center; gap: 2vw; padding: 3vh 3vw; cursor: pointer; user-select: none;
                    background:
                        radial-gradient(120% 90% at 30% 40%, rgba(255,176,32,0.10), transparent 60%),
                        radial-gradient(90% 80% at 85% 70%, rgba(120,90,255,0.08), transparent 60%),
                        #0a0a0c; }

                /* Square, and sized off BOTH axes so it fills its own column instead of overflowing into the
                   copy beside it — 92vh on a 16:9 screen is wider than the half it has to live in. */
                .cq-stage { position: relative; display: grid; place-items: center;
                    width: min(94vh, 46vw); height: min(94vh, 46vw); margin: 0 auto; }
                .cq-stage::before { content: ""; position: absolute; inset: 4%; border-radius: 50%;
                    background: radial-gradient(circle, rgba(255,190,70,0.18), transparent 68%); filter: blur(10px); }
                .cq-ring { position: relative; width: 100%; height: 100%; }
                .cq-rotor { position: absolute; top: 50%; left: 50%; width: 82%; height: 82%;
                    transform-origin: center; will-change: transform; }
                .cq-disc { position: absolute; inset: 0; width: 100%; height: 100%; border-radius: 50%;
                    box-shadow: 0 8px 30px rgba(0,0,0,0.6); }
                .cq-icons { position: absolute; inset: 0; }
                .cq-ico { position: absolute; width: 9.5%; height: 9.5%; display: grid; place-items: center;
                    border-radius: 50%; background: radial-gradient(circle, rgba(8,5,2,0.62) 48%, rgba(8,5,2,0) 74%); }
                .cq-ico-img { width: 116%; height: 116%; object-fit: contain;
                    filter: drop-shadow(0 1px 2px rgba(0,0,0,0.7)); }
                .cq-ico.tier-jackpot .cq-ico-img { filter: drop-shadow(0 0 6px rgba(255,215,94,0.95)); }
                .cq-ico.tier-mini .cq-ico-img { filter: drop-shadow(0 0 5px rgba(200,150,255,0.8)); }
                .cq-ico.tier-bonus .cq-ico-img { filter: drop-shadow(0 0 5px rgba(255,140,240,0.7)); }
                /* ── THE ROTOR DOES NOT RISE HERE, AND THE MEMBER'S WHEEL IS RIGHT TO ─────────────────────
                   SpinWheel lifts the whole rotor over the frame when it stops, because dead top is behind
                   the wolf's snout and the won sprite is the only readout it has. This screen has a result
                   card the size of a poster next to it, so the same lift buys nothing and costs the wolf:
                   at 900px the disc rides over the ornament and the head loses its face while a prize is up.
                   The winner keeps its halo — that is enough to say which wedge, with the card saying what. */
                .cq-ico.is-won { z-index: 5; }
                .cq-ico.is-won::before { content: ""; position: absolute; inset: -80%; border-radius: 50%; z-index: -1;
                    background: radial-gradient(circle, rgba(255,215,94,0.6), rgba(255,150,30,0.24) 42%, transparent 70%);
                    animation: cqHalo 1.1s ease-in-out infinite alternate; }
                .cq-ico.is-won .cq-ico-img { animation: cqWon 1.1s ease-in-out infinite alternate; }
                @keyframes cqHalo { from { opacity: 0.5; transform: scale(0.84); } to { opacity: 1; transform: scale(1.14); } }
                @keyframes cqWon { from { transform: scale(1.06); filter: drop-shadow(0 0 5px #ffd75e); }
                    to { transform: scale(1.32); filter: drop-shadow(0 0 16px #ffd75e) drop-shadow(0 0 26px #ffb020); } }
                .cq-frame { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none;
                    filter: drop-shadow(0 6px 18px rgba(0,0,0,0.5)); }
                .cq-stage.is-spinning .cq-frame { animation: cqBuzz 0.14s steps(2) infinite; }
                @keyframes cqBuzz { 0% { transform: translate(0,0); } 50% { transform: translate(0,-0.8px); } }

                .cq-side { display: grid; align-content: center; justify-items: center; text-align: center;
                    gap: 1.4vh; padding-right: 1vw; }
                /* Both panels are grids in their own right. As plain blocks their spans and headings were
                   inline boxes running together on one line — the kicker ended up sitting on the headline's
                   baseline rather than above it. */
                .cq-invite { display: grid; justify-items: center; gap: 1.2vh; }
                .cq-kick { font-size: clamp(13px, 1.6vh, 22px); font-weight: 900; letter-spacing: 0.22em;
                    text-transform: uppercase; color: #c9a253; }

                .cq-invite-head { font-size: clamp(34px, 9vh, 120px); font-weight: 900; line-height: 1.02;
                    color: #fff; text-shadow: 0 4px 24px rgba(0,0,0,0.6); }
                .cq-invite-sub { margin: 0; max-width: 26ch; font-size: clamp(15px, 2.8vh, 36px); line-height: 1.3;
                    color: #b9c0c8; text-wrap: balance; }

                .cq-won { display: grid; justify-items: center; gap: 1.2vh; width: 100%;
                    animation: cqPop 0.4s cubic-bezier(.2,1.4,.35,1) both; }
                @keyframes cqPop { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
                .cq-won-face { display: grid; justify-items: center; gap: 0.6vh; }
                .cq-won-img { width: clamp(70px, 15vh, 190px); height: clamp(70px, 15vh, 190px); object-fit: contain;
                    filter: drop-shadow(0 6px 14px rgba(0,0,0,0.6)); }
                .cq-won-name { font-size: clamp(28px, 5.4vh, 70px); font-weight: 900; line-height: 1.05; color: #fff; }
                .cq-won-desc { margin: 0; max-width: 26ch; font-size: clamp(13px, 1.9vh, 24px); color: #aab2bb; line-height: 1.35; }
                .cq-won.tier-rare .cq-kick { color: #8bf5d6; }
                .cq-won.tier-bonus .cq-kick { color: #ffb6f2; }
                .cq-won.tier-mini .cq-kick { color: #d3aaff; }
                .cq-won.tier-jackpot .cq-kick { color: #ffe28a; }
                .cq-won.tier-jackpot .cq-won-name { color: #ffe28a; text-shadow: 0 0 30px rgba(255,190,60,0.55); }

                .cq-ask { display: grid; justify-items: center; gap: 0.7vh; margin-top: 1vh;
                    padding: 1.6vh 1.6vw; border-radius: 18px; background: rgba(255,255,255,0.045);
                    border: 1px solid rgba(255,255,255,0.12); }
                .cq-qr { width: clamp(120px, 24vh, 300px); height: clamp(120px, 24vh, 300px);
                    border-radius: 12px; background: #fff; }
                .cq-qr-wait { opacity: 0.15; }
                .cq-scan { font-size: clamp(16px, 2.6vh, 34px); font-weight: 900; color: #ffcf6a; }
                .cq-sub { max-width: 30ch; font-size: clamp(12px, 1.7vh, 21px); color: #9aa2ab; line-height: 1.35; }
                .cq-again { font-size: clamp(11px, 1.5vh, 18px); color: #6f7681; letter-spacing: 0.04em; }

                /* A counter screen is landscape, but the same page gets opened on a phone to check it. */
                @media (max-aspect-ratio: 1/1) {
                    .cq { grid-template-columns: 1fr; grid-template-rows: auto auto; align-content: center; }
                    .cq-stage { width: min(86vw, 52vh); height: min(86vw, 52vh); }
                    .cq-side { padding-right: 0; }
                    .cq-invite-head { font-size: clamp(30px, 6vh, 60px); }
                    .cq-invite-sub { font-size: clamp(14px, 2.2vh, 24px); }
                }
            `}</style>
        </div>
    );
}
