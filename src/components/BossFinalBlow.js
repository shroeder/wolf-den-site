"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

// The "FINAL BLOW" cinematic — replays the top-damage member delivering the killing strike: the hero rushes
// in, time slows and the camera zooms as they wind up, then a flash + screen-shake impact shatters the boss
// into a SLAIN payoff. Purely presentational; all data comes from the recap's `mvp` + `boss`.
export default function BossFinalBlow({ mvp, boss }) {
    // runId: 0 = closed. >0 = playing; bumping it remounts the scene (via `key`) so every replay restarts clean.
    const [runId, setRunId] = useState(0);
    const [ended, setEnded] = useState(false); // the sequence finished → reveal Replay / Done

    if (!mvp) return null;
    const heroImg = mvp.spriteUrl || mvp.avatarUrl;
    const heroFlipped = Boolean(mvp.spriteUrl && mvp.spriteFlip);

    const play = () => { setEnded(false); setRunId((n) => n + 1); };
    const close = () => { setRunId(0); setEnded(false); };

    return (
        <>
            <button type="button" className="btn-gold fb-cta" onClick={play}>🎬 Watch the final blow</button>
            {runId > 0 ? createPortal((
                // The caption is the LAST beat — when it finishes animating in, reveal the actions.
                <div className="fb-cine" key={runId} onAnimationEnd={(e) => { if (e.animationName === "fbCaptionIn") setEnded(true); }}>
                    <button type="button" className="fb-close" aria-label="Close" onClick={close}>×</button>
                    <div className="fb-scene">
                        <div className="fb-title">FINAL BLOW</div>
                        <div className="fb-arena">
                            {boss?.imageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={boss.imageUrl} alt={boss?.name || "Boss"} className="fb-boss" />
                            ) : <div className="fb-boss fb-boss-fallback">👹</div>}
                            <div className="fb-shards" aria-hidden="true">{Array.from({ length: 20 }, (_, i) => <span key={i} style={{ "--i": i }} />)}</div>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={heroImg} alt={mvp.name} className={`fb-hero${heroFlipped ? " is-flip" : ""}`} />
                            <div className="fb-flash" aria-hidden="true" />
                            <div className="fb-dmg">{mvp.dmg.toLocaleString()}</div>
                        </div>
                        <div className="fb-slain">☠️ SLAIN</div>
                        <div className="fb-caption">
                            <div className="fb-caption-name">{mvp.you ? "You" : mvp.name} landed the finishing blow</div>
                            <div className="fb-caption-sub">{mvp.dmg.toLocaleString()} damage · the pack&apos;s deadliest</div>
                        </div>
                    </div>
                    <div className={`fb-actions${ended ? " is-on" : ""}`}>
                        <button type="button" className="pill" onClick={play}>↻ Replay</button>
                        <button type="button" className="btn-gold" onClick={close}>Done</button>
                    </div>
                </div>
            ), document.body) : null}
        </>
    );
}
