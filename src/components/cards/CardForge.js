"use client";

// ── THE HALF-SECOND A CARD IS NEITHER ONE THING NOR THE OTHER ────────────────────────────────────────────
// Their smith flies the chosen card to the middle of the screen, blows a white-gold flash through it and lets
// you WATCH it become the upgraded card — the "+" arrives, the numbers go green. It is a ceremony on purpose:
// a smith is the thing you gave up a heal for, and the only moment in a run where you change a card by hand.
//
// Ours tapped a card, closed a modal with no feedback at all, and then showed a DIFFERENT, already-upgraded
// card at 130px near the floor. The information was right and the moment was missing — and worse, nothing
// tied the card you picked to the card you got.
//
// ⚠️ ONE COMPONENT, BECAUSE AN UPGRADE IS AN UPGRADE WHEREVER IT HAPPENS. A campfire sharpens a card; so do
// the Whetstone Shrine, the Old Wall and the Coal Pit. Two copies of this would have drifted the first time
// one of them was touched, and a player meeting the same action with two different ceremonies reads it as two
// different mechanics.
import { useEffect, useRef, useState } from "react";

import CardFace, { CARD_FONT } from "@/components/cards/CardFace";
import { cardById, upgradedId } from "@/lib/marketplace/cards-kit.js";

/** How long the whole thing takes, and the frame the face turns on. Exported so callers can time their post. */
export const FORGE_MS = 1650;
export const FORGE_TURN_MS = 620;

/**
 * `card` is the id going in; the upgraded id is derived, so a caller cannot hand this two unrelated faces.
 * `art` is the same pet-art map every other card render is given.
 */
export default function CardForge({ card, art = {} }) {
    const [turned, setTurned] = useState(false);
    const timer = useRef(null);
    useEffect(() => {
        setTurned(false);
        timer.current = setTimeout(() => setTurned(true), FORGE_TURN_MS);
        return () => clearTimeout(timer.current);
    }, [card]);

    const base = cardById(card);
    const sharp = cardById(upgradedId(card));
    if (!base) return null;

    return (
        <div className="frg" role="status" aria-live="polite">
            <span className="frg-glow" aria-hidden="true" />
            <span className={`frg-card${turned ? " is-turned" : ""}`}>
                <span className="cf-card">
                    <CardFace card={turned ? sharp : base} art={art[base.pet]} />
                </span>
            </span>
            {/* Six embers off the coals, staggered so they do not read as one puff. */}
            <span className="frg-sparks" aria-hidden="true">
                {[0, 1, 2, 3, 4, 5].map((n) => <i key={n} style={{ "--n": n }} />)}
            </span>
            <span className={`frg-say${turned ? " is-turned" : ""}`}>
                {turned ? "Sharper." : "Into the coals…"}
            </span>

            <style jsx global>{`
                .frg { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center;
                    background: rgba(8, 5, 3, 0.86); animation: frg-in 0.22s ease-out both;
                    --cf-card-font: ${CARD_FONT.style.fontFamily}; }
                @keyframes frg-in { from { opacity: 0; } to { opacity: 1; } }

                /* The heat behind it, which is what sells the flash: it blooms AT the moment the face turns
                   rather than fading in evenly, so the card looks struck rather than lit. */
                .frg-glow { position: absolute; width: 340px; height: 340px; border-radius: 50%;
                    background: radial-gradient(circle, rgba(255,232,190,0.95), rgba(255,150,40,0.5) 38%,
                        rgba(255,90,10,0) 70%);
                    animation: frg-flash ${FORGE_MS}ms ease-out both; }
                @keyframes frg-flash {
                    0% { transform: scale(0.35); opacity: 0.15; }
                    34% { transform: scale(0.75); opacity: 0.55; }
                    38% { transform: scale(1.5); opacity: 1; }
                    52% { transform: scale(1.15); opacity: 0.6; }
                    100% { transform: scale(1); opacity: 0.28; }
                }

                /* WARNING: SCALED, NOT RESIZED. Every screen in this game pins a card to 96x138 and CardFace
                   sets its banner, its body text and its stars in fixed pixels — so widening the box gives a
                   big card with 9px type on it, which reads as a bug rather than as a close-up. A transform
                   scales the whole drawing, type included, which is what a card in your face should look like. */
                .frg-card { position: relative; display: block; transform-origin: center center;
                    animation: frg-rise ${FORGE_MS}ms cubic-bezier(.2,.9,.25,1) both; }
                .frg-card.is-turned { animation: frg-rise ${FORGE_MS}ms cubic-bezier(.2,.9,.25,1) both,
                    frg-struck 0.5s ease-out both; }
                @keyframes frg-rise {
                    0% { transform: scale(1.1) translateY(40px) rotate(-4deg); opacity: 0; }
                    22% { transform: scale(2.25) translateY(0) rotate(0deg); opacity: 1; }
                    38% { transform: scale(2.45); }
                    58% { transform: scale(2.2); }
                    100% { transform: scale(2.2); opacity: 1; }
                }
                /* A hard white blow-out on the frame the face swaps on, so the change is something that
                   HAPPENED rather than something that is simply true in the next screenshot. */
                @keyframes frg-struck {
                    0% { filter: brightness(5) saturate(0) drop-shadow(0 0 30px rgba(255,240,210,1)); }
                    40% { filter: brightness(1.5) saturate(1.1) drop-shadow(0 0 22px rgba(255,190,110,0.9)); }
                    100% { filter: none; }
                }

                /* Embers. Six, staggered, on their own paths — one puff of identical dots reads as a spinner. */
                .frg-sparks { position: absolute; width: 210px; height: 260px; pointer-events: none; }
                .frg-sparks i { position: absolute; left: 50%; bottom: 12%; width: 4px; height: 4px;
                    border-radius: 50%; background: #ffca7a; opacity: 0;
                    box-shadow: 0 0 8px rgba(255,170,60,0.9);
                    animation: frg-spark 1.5s ease-out both;
                    animation-delay: calc(0.42s + var(--n) * 0.075s); }
                @keyframes frg-spark {
                    0% { opacity: 0; transform: translate(0, 0) scale(0.6); }
                    18% { opacity: 1; }
                    100% { opacity: 0; transform: translate(calc((var(--n) - 2.5) * 26px), -180px) scale(0.3); }
                }

                .frg-say { position: absolute; bottom: 20%; font-family: var(--cf-card-font);
                    font-size: 15px; letter-spacing: 0.04em; color: #ffd9a2;
                    text-shadow: 0 2px 6px rgba(0,0,0,0.9); }
                .frg-say.is-turned { color: #9be08a; }

                /* The card is drawn at its usual size and scaled, so this only has to exist because the two
                   screens that host it namespace their own .cf-card rules. */
                .frg .cf-card { position: relative; width: 96px; height: 138px; padding: 0 0 8px; }

                @media (min-width: 720px) { .frg-sparks { width: 260px; height: 320px; } }
            `}</style>
        </div>
    );
}
