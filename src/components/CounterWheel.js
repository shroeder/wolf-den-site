"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { COUNTER_DISCOUNTS, rollDiscount } from "@/lib/marketplace/counter-discounts.js";
import { ICON_R, WEDGE_DEG, WEDGE_OFFSET, landingRotation, spokePos } from "@/lib/marketplace/wheel-geometry.js";

// ── THE WHEEL ON THE COUNTER ────────────────────────────────────────────────────────────────────
// Luke: "just make a wheel you can spin. and it says the reward. and then shows a qr code to scan. that takes
// them to the sign up." And then: "rewards are in store discounts, all different kinds."
//
// It replaces a three-panel slideshow that explained the game in prose to people who were not reading it. A
// stranger will put a finger on a prize wheel without being asked to, and the discount they land on is a
// reason to buy something today — with the QR under it as the reason to come back.
//
// ── THE WEDGES ARE OFFERS, NOT GAME PRIZES ────────────────────────────────────────────────────────
// Every number lives in counter-discounts.js — that is the file to edit, and it is the only one. This drew
// the member wheel's prize table for its first hour of life, which was the wrong wheel for a shop window: gold
// and Farm Seeds mean nothing to somebody who has never had an account, and everything on it was a thing they
// could not have without making one first.
//
// The faces are TEXT, not sprites, and that is the point: a discount is a number, and a number at six feet is
// the only thing on a counter screen a passer-by can read. The full offer and its qualifier land on the card
// beside the wheel once it stops, so the wedge never has to carry the small print.

const SPIN_MS = 5200;
// How long a result stands before the screen invites the next person. Long enough to read it, take it to the
// counter, and talk about it; short enough that nobody walks up to a stranger's result and tries to claim it.
// (The D&D kiosk had exactly this bug: it sat on one person's thank-you screen until somebody reloaded it.)
const HOLD_MS = 45000;
// The idle disc turns slowly on its own. A dead wheel reads as a picture of a wheel; a moving one reads as a
// machine that is waiting for you.
const DRIFT_DEG_PER_S = 3;
// ── WHERE A TEXT FACE SITS, AND WHY IT IS NOT ICON_R ─────────────────────────────────────────────────────────
// ICON_R (34) is the centre of a round sprite, pushed out to the fat end of the slice. A radial text box is
// 25 units LONG, and in the same units as ICON_R the usable band runs from the hub at 15.4 to the frame's
// inner rim at 40.6 — 25.2 units, near enough exactly the length of the box. So the face is centred on the
// MIDDLE of that band, at 28, and reaches 15.5 to 40.5: hub to rim, touching neither.
const FACE_R = (15.4 + 40.6) / 2;

export default function CounterWheel({ signupQr, pointsRate }) {
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
        const idx = rollDiscount();
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
    }, [spinning]);

    const won = wonIdx != null ? COUNTER_DISCOUNTS[wonIdx] : null;

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
                            {COUNTER_DISCOUNTS.map((d, i) => (
                                <div
                                    key={d.label}
                                    className={`cq-ico tier-${d.tier || "normal"}${wonIdx === i && !spinning ? " is-won" : ""}`}
                                    style={spokePos(i, WEDGE_OFFSET, WEDGE_DEG, FACE_R)}
                                >
                                    <b className="cq-face">{d.face}</b>
                                    <span className="cq-face-sub">{d.sub}</span>
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
                    <div className={`cq-won tier-${won.tier || "normal"}`} key={wonIdx}>
                        <span className="cq-kick">You won</span>
                        <strong className="cq-won-name">{won.label}</strong>
                        <p className="cq-won-desc">{won.fine}</p>
                        {/* The only thing standing between this wheel and somebody tapping it eight times is
                            a sentence, because Luke's call is that the counter honours whatever is on screen
                            — no code, no token. So the sentence is on the card, where staff can see it too. */}
                        <span className="cq-claim">Show this screen at the counter · one spin per customer</span>

                        <div className="cq-ask">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            {signupQr ? <img className="cq-qr" src={signupQr} alt="" /> : <div className="cq-qr cq-qr-wait" />}
                            <b className="cq-scan">There is a whole game too</b>
                            <span className="cq-sub">
                                Scan to join — free, about ten seconds. {pointsRate} points per $1 you spend here, and a
                                free spin of our prize wheel every day.
                            </span>
                        </div>
                    </div>
                ) : (
                    <div className="cq-invite">
                        <span className="cq-kick">The Wolf Den</span>
                        <strong className="cq-invite-head">{spinning ? "Good luck…" : "Spin for a discount"}</strong>
                        <p className="cq-invite-sub">
                            {spinning
                                ? "Every wedge is money off, today."
                                : "Touch the wheel. Every wedge is money off something in this shop — and nobody walks away with nothing."}
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
                /* --cqw is the wheel's own width, so the wedge type scales with the disc rather than with the
                   viewport. A vw-sized face grows when the screen gets wider even though the wheel does not,
                   and "off everything" starts falling off its slice. */
                .cq-stage { position: relative; display: grid; place-items: center;
                    --cqw: min(94vh, 46vw); width: var(--cqw); height: var(--cqw); margin: 0 auto; }
                .cq-stage::before { content: ""; position: absolute; inset: 4%; border-radius: 50%;
                    background: radial-gradient(circle, rgba(255,190,70,0.18), transparent 68%); filter: blur(10px); }
                .cq-ring { position: relative; width: 100%; height: 100%; }
                .cq-rotor { position: absolute; top: 50%; left: 50%; width: 82%; height: 82%;
                    transform-origin: center; will-change: transform; }
                .cq-disc { position: absolute; inset: 0; width: 100%; height: 100%; border-radius: 50%;
                    box-shadow: 0 8px 30px rgba(0,0,0,0.6); }
                .cq-icons { position: absolute; inset: 0; }
                /* ── A TEXT FACE IS A SPOKE, NOT A DOT ────────────────────────────────────────────────────
                   spokePos turns the box a further quarter turn, so its WIDTH runs hub-to-rim and its two
                   stacked lines sit side by side across the slice. 25% of the rotor's width is the whole
                   usable band (see FACE_R), and 11% of height is two lines against the ~13% a slice spans at
                   that radius — the type is sized in cqw units off the stage, never vw, so it scales with the
                   wheel and not with the screen. The dark lozenge behind it is what makes white type readable
                   over six different wedge colours. */
                .cq-ico { position: absolute; width: 25%; height: 11%; display: grid; align-content: center;
                    justify-items: center; gap: 0.05em; text-align: center; line-height: 1.02;
                    border-radius: 999px; white-space: nowrap;
                    background: radial-gradient(ellipse, rgba(8,5,2,0.66) 38%, rgba(8,5,2,0) 78%); }
                .cq-face { font-size: calc(var(--cqw) * 0.042); font-weight: 900; color: #fff; letter-spacing: -0.015em;
                    text-shadow: 0 1px 3px rgba(0,0,0,0.95), 0 0 12px rgba(0,0,0,0.7); }
                .cq-face-sub { font-size: calc(var(--cqw) * 0.019); font-weight: 800; color: #f2e3c4;
                    letter-spacing: 0.01em; text-shadow: 0 1px 3px rgba(0,0,0,0.95), 0 0 8px rgba(0,0,0,0.8); }
                .cq-ico.tier-good .cq-face { color: #ffe9b8; }
                .cq-ico.tier-rare .cq-face { color: #ffd75e; }
                .cq-ico.tier-top .cq-face { color: #ffd75e; text-shadow: 0 1px 3px rgba(0,0,0,0.9), 0 0 14px rgba(255,190,60,0.9); }
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
                .cq-ico.is-won .cq-face { animation: cqWon 1.1s ease-in-out infinite alternate; }
                @keyframes cqHalo { from { opacity: 0.5; transform: scale(0.84); } to { opacity: 1; transform: scale(1.14); } }
                /* The pulse lives on the FACE, never on .cq-ico — the ico's transform is its polar position
                   (translate + the wedge's own rotation), set inline, and an animation on it would overwrite
                   that and walk the winner off its slice while it celebrated. */
                @keyframes cqWon { from { transform: scale(1); color: #ffd75e; }
                    to { transform: scale(1.16); color: #fff3c8; } }
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
                /* The offer IS the picture — it is the biggest thing on the screen, because a discount read
                   from across the shop is what gets somebody to walk over. */
                .cq-won-name { max-width: 15ch; font-size: clamp(30px, 7.4vh, 96px); font-weight: 900;
                    line-height: 1.03; color: #fff; text-wrap: balance; text-shadow: 0 4px 24px rgba(0,0,0,0.6); }
                .cq-won-desc { margin: 0; max-width: 28ch; font-size: clamp(13px, 2.2vh, 28px); color: #aab2bb; line-height: 1.3; }
                .cq-claim { max-width: 30ch; font-size: clamp(12px, 1.7vh, 21px); font-weight: 700; color: #c9a253;
                    letter-spacing: 0.03em; }
                .cq-won.tier-good .cq-kick, .cq-won.tier-rare .cq-kick { color: #ffd75e; }
                .cq-won.tier-top .cq-kick { color: #ffe28a; }
                .cq-won.tier-rare .cq-won-name, .cq-won.tier-top .cq-won-name { color: #ffe9b8;
                    text-shadow: 0 0 40px rgba(255,190,60,0.5); }

                .cq-ask { display: grid; justify-items: center; gap: 0.7vh; margin-top: 1vh;
                    padding: 1.6vh 1.6vw; border-radius: 18px; background: rgba(255,255,255,0.045);
                    border: 1px solid rgba(255,255,255,0.12); }
                .cq-qr { width: clamp(120px, 24vh, 300px); height: clamp(120px, 24vh, 300px);
                    border-radius: 12px; background: #fff; }
                .cq-qr-wait { opacity: 0.15; }
                .cq-scan { font-size: clamp(16px, 2.6vh, 34px); font-weight: 900; color: #ffcf6a; }
                .cq-sub { max-width: 30ch; font-size: clamp(12px, 1.7vh, 21px); color: #9aa2ab; line-height: 1.35; }

                /* A counter screen is landscape, but the same page gets opened on a phone to check it. */
                @media (max-aspect-ratio: 1/1) {
                    .cq { grid-template-columns: 1fr; grid-template-rows: auto auto; align-content: center; }
                    .cq-stage { --cqw: min(86vw, 52vh); }
                    .cq-side { padding-right: 0; }
                    .cq-invite-head { font-size: clamp(30px, 6vh, 60px); }
                    .cq-invite-sub { font-size: clamp(14px, 2.2vh, 24px); }
                }
            `}</style>
        </div>
    );
}
