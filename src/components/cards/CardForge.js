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
 * ── AND THE OTHER THING A FIRE DOES TO A CARD ────────────────────────────────────────────────────────────
 * Removal is the strongest purchase in their game and ours had it happening in silence: you fed a card to the
 * merchant's brazier and the modal simply closed. It is the ONE irreversible thing the shop does — the deck
 * you walk out with is smaller for the rest of the run — and an irreversible act with no moment attached
 * reads as a misclick.
 *
 * Same rise, same size, opposite ending: the card catches from the bottom, chars, and goes up as embers. It
 * deliberately does NOT flash white — a flash is the language of a card becoming better, and these two must
 * never be mistaken for one another at a glance.
 *
 * `card` is the id going in; the upgraded id is derived, so a caller cannot hand this two unrelated faces.
 * `art` is the same pet-art map every other card render is given.
 */
export default function CardForge({ card, art = {}, mode = "sharpen" }) {
    const burning = mode === "burn";
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
        <div className={`frg${burning ? " is-burn" : ""}`} role="status" aria-live="polite">
            <span className="frg-glow" aria-hidden="true" />
            <span className={`frg-card${turned ? (burning ? " is-burning" : " is-turned") : ""}`}>
                <span className="cf-card">
                    {/* A burning card never changes face — it is the card you chose, right up until it is
                        not there. Swapping it for anything would be the game editing your decision. */}
                    <CardFace card={!burning && turned ? sharp : base} art={art[base.pet]} />
                </span>
            </span>
            {/* Six embers off the coals, staggered so they do not read as one puff. */}
            <span className="frg-sparks" aria-hidden="true">
                {[0, 1, 2, 3, 4, 5].map((n) => <i key={n} style={{ "--n": n }} />)}
            </span>
            <span className={`frg-say${turned ? (burning ? " is-ash" : " is-turned") : ""}`}>
                {burning
                    ? (turned ? "Gone." : "Into the fire…")
                    : (turned ? "Sharper." : "Into the coals…")}
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
                .frg-say.is-ash { color: #b9a08a; }

                /* ── THE BURN ──────────────────────────────────────────────────────────────────────────
                   Deeper and redder than the smith's heat, and it never blows out to white: a white flash
                   means a card got better, and the two acts must not be confusable in a glance. */
                .frg.is-burn .frg-glow { background: radial-gradient(circle, rgba(255,150,60,0.75),
                    rgba(220,60,10,0.45) 40%, rgba(120,20,0,0) 72%); }
                .frg-card.is-burning { animation: frg-rise ${FORGE_MS}ms cubic-bezier(.2,.9,.25,1) both,
                    frg-ash 1s cubic-bezier(.4,0,.7,1) both; }
                /* Chars from the bottom, lifts, and goes. The mask is what makes it burn AWAY rather than
                   simply fade: the transparent edge climbs the card as the sweep moves. */
                @keyframes frg-ash {
                    0% { filter: none; -webkit-mask-image: linear-gradient(to top, #000 0%, #000 100%);
                        mask-image: linear-gradient(to top, #000 0%, #000 100%); opacity: 1; }
                    25% { filter: brightness(1.25) sepia(0.35) drop-shadow(0 -6px 14px rgba(255,120,30,0.85)); }
                    60% { filter: brightness(0.6) sepia(0.8) drop-shadow(0 -10px 18px rgba(255,90,20,0.7));
                        -webkit-mask-image: linear-gradient(to top, transparent 45%, #000 62%);
                        mask-image: linear-gradient(to top, transparent 45%, #000 62%); }
                    100% { filter: brightness(0.25) sepia(1); opacity: 0;
                        -webkit-mask-image: linear-gradient(to top, transparent 96%, #000 100%);
                        mask-image: linear-gradient(to top, transparent 96%, #000 100%); }
                }
                /* More of them, and they carry on after the card has gone. */
                .frg.is-burn .frg-sparks i { background: #ff9c4a; animation-duration: 1.9s;
                    animation-delay: calc(0.5s + var(--n) * 0.09s); }

                /* The card is drawn at its usual size and scaled, so this only has to exist because the two
                   screens that host it namespace their own .cf-card rules. */
                .frg .cf-card { position: relative; width: var(--cf-w, 96px); height: var(--cf-h, 138px); padding: 0 0 8px; }

                @media (min-width: 720px) { .frg-sparks { width: 260px; height: 320px; } }
            `}</style>
        </div>
    );
}
