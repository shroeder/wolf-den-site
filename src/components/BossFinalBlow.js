"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

import useScrollLock from "@/lib/useScrollLock";

// The boss-hit cinematic. Two flavours from the SAME scene:
//   • variant="kill"   — the FINAL BLOW: the top-damage member's killing strike shatters the boss into a SLAIN
//                        payoff (opened from a button on a defeated boss).
//   • variant="strike" — YOUR own daily whack: the hero rushes in, big flash + your damage number, no shatter
//                        (auto-plays the instant you unleash your strike, then you tap out). Feels personal.
// Purely presentational; all data comes from `mvp` + `boss`.
export default function BossFinalBlow({ mvp, boss, variant = "kill", auto = false, onClose }) {
    const strike = variant === "strike";
    // runId: 0 = closed. >0 = playing; bumping it remounts the scene (via `key`) so every replay restarts clean.
    const [runId, setRunId] = useState(auto ? 1 : 0);
    const [ended, setEnded] = useState(false); // the sequence finished → reveal Replay / Done
    useScrollLock(runId > 0); // lock bg scroll while the cinematic is playing

    if (!mvp) return null;
    const heroImg = mvp.spriteUrl || mvp.avatarUrl;
    const heroFlipped = Boolean(mvp.spriteUrl && mvp.spriteFlip);

    const play = () => { setEnded(false); setRunId((n) => n + 1); };
    const close = () => { setRunId(0); setEnded(false); if (onClose) onClose(); };

    return (
        <>
            {auto ? null : <button type="button" className="btn-gold fb-cta" onClick={play}>🎬 Watch the final blow</button>}
            {runId > 0 ? createPortal((
                // The caption is the LAST beat — when it finishes animating in, reveal the actions.
                <div className={`fb-cine${strike ? " is-strike" : ""}`} key={runId} onAnimationEnd={(e) => { if (e.animationName === "fbCaptionIn") setEnded(true); }}>
                    <button type="button" className="fb-close" aria-label="Close" onClick={close}>×</button>
                    <div className="fb-scene">
                        <div className="fb-title">{strike ? "BIG HIT!" : "FINAL BLOW"}</div>
                        <div className="fb-arena">
                            {boss?.imageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={boss.imageUrl} alt={boss?.name || "Boss"} className="fb-boss" />
                            ) : <div className="fb-boss fb-boss-fallback">👹</div>}
                            {strike ? null : <div className="fb-shards" aria-hidden="true">{Array.from({ length: 20 }, (_, i) => <span key={i} style={{ "--i": i }} />)}</div>}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={heroImg} alt={mvp.name} className={`fb-hero${heroFlipped ? " is-flip" : ""}`} />
                            <div className="fb-flash" aria-hidden="true" />
                            <div className="fb-dmg">{mvp.dmg.toLocaleString()}</div>
                        </div>
                        {strike ? null : <div className="fb-slain">☠️ SLAIN</div>}
                        <div className="fb-caption">
                            <div className="fb-caption-name">{strike ? `You walloped ${boss?.name || "the boss"}!` : `${mvp.you ? "You" : mvp.name} landed the finishing blow`}</div>
                            <div className="fb-caption-sub">{mvp.dmg.toLocaleString()} damage{strike ? "" : " · the pack's deadliest"}</div>
                        </div>
                    </div>
                    <div className={`fb-actions${ended ? " is-on" : ""}`}>
                        {strike ? null : <button type="button" className="pill" onClick={play}>↻ Replay</button>}
                        <button type="button" className="btn-gold" onClick={close}>{strike ? "Take that! 💪" : "Done"}</button>
                    </div>
                </div>
            ), document.body) : null}
        </>
    );
}
