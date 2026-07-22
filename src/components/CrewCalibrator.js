"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

// Owner-only crew-position calibrator. Renders each boat FORM at PRODUCTION scale (reusing the exact
// .sail-boat-img / .sail-crew / .sail-hero / .sail-pet classes, so the hero-to-boat ratio matches what
// ships) with a live "feet line" guide + nudge controls. Dial every form in one sitting, hit Copy, and
// paste the map into DECK in SailingClient.js. This replaces the reactive screenshot-and-correct loop.
const BOAT_ART = {
    1: "/images/sailing/boat-tier1-wood.png",
    2: "/images/sailing/boat-tier2-cutter.png",
    3: "/images/sailing/boat-tier3-brig.png",
    4: "/images/sailing/boat-tier4-schooner.png",
    5: "/images/sailing/boat-tier5-galleon.png",
    6: "/images/sailing/boat-tier6-manowar.png",
    7: "/images/sailing/boat-tier7-arcane.png",
    8: "/images/sailing/boat-tier8-dragon.png",
    9: "/images/sailing/boat-tier9-ghost.png",
};
const NAMES = { 1: "Wood", 2: "Cutter", 3: "Brig", 4: "Schooner", 5: "Galleon", 6: "Man-o'-war", 7: "Arcane", 8: "Dragon", 9: "Ghost" };
const TIERS = Object.keys(BOAT_ART).map(Number);
const clampPct = (n) => Math.max(0, Math.min(100, Math.round(n * 10) / 10));

export default function CrewCalibrator({ initial = {}, heroImg, heroFlip, petImg, petFlip, onClose }) {
    const [deck, setDeck] = useState(() => ({ ...initial }));
    const [tier, setTier] = useState(1);
    const [copied, setCopied] = useState(false);

    const v = deck[tier] ?? 30;
    const nudge = (delta) => setDeck((d) => ({ ...d, [tier]: clampPct((d[tier] ?? 30) + delta) }));
    const mapStr = `const DECK = { ${TIERS.map((t) => `${t}: ${deck[t] ?? 30}`).join(", ")} };`;
    const copy = () => {
        navigator.clipboard?.writeText(mapStr)
            .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })
            .catch(() => {});
    };

    return createPortal((
        <div className="cal-cine">
            <button type="button" className="fb-close" aria-label="Close" onClick={onClose}>×</button>
            <div className="cal-inner">
                <h3 style={{ margin: "0 0 2px" }}>🎯 Crew calibration</h3>
                <p className="muted" style={{ margin: "0 0 10px", fontSize: "0.8rem" }}>
                    Pick a form, nudge until the feet sit on the deck (the dashed line is the feet line). Then <b>Copy map</b> and paste it into <code>DECK</code> in SailingClient.js.
                </p>
                <div className="cal-tiers">
                    {TIERS.map((t) => (
                        <button key={t} type="button" className={`cal-tier${t === tier ? " is-on" : ""}`} onClick={() => setTier(t)}>{t}</button>
                    ))}
                </div>
                <div className="cal-stage">
                    <div className="sail-boat-inner">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img className="sail-boat-img" src={BOAT_ART[tier]} alt="" />
                        <span className="cal-guide" style={{ bottom: `${v}%` }} />
                        <span className="sail-crew" style={{ "--crew-bottom": `${v}%` }}>
                            {petImg ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img className="sail-pet" src={petImg} alt="" style={petFlip ? { transform: "scaleX(-1)" } : undefined} />
                            ) : null}
                            {heroImg ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img className="sail-hero" src={heroImg} alt="" style={heroFlip ? { transform: "scaleX(-1)" } : undefined} />
                            ) : <span className="cal-hero-fallback">🧍</span>}
                        </span>
                    </div>
                </div>
                <div className="cal-controls">
                    <span className="cal-name">{NAMES[tier]} · form {tier}</span>
                    <div className="cal-nudge">
                        <button type="button" onClick={() => nudge(-1)}>−1</button>
                        <button type="button" onClick={() => nudge(-0.5)}>−½</button>
                        <strong className="cal-val">{v}%</strong>
                        <button type="button" onClick={() => nudge(0.5)}>+½</button>
                        <button type="button" onClick={() => nudge(1)}>+1</button>
                    </div>
                </div>
                <div className="cal-out">
                    <input readOnly value={mapStr} onFocus={(e) => e.target.select()} />
                    <button type="button" className="btn-gold" onClick={copy}>{copied ? "Copied ✓" : "Copy map"}</button>
                </div>
            </div>
        </div>
    ), document.body);
}
