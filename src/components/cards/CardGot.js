"use client";

// ── THE THING YOU JUST GOT, HELD UP ──────────────────────────────────────────────────────────────────────
// Two of this game's payouts happened in complete silence. Beat an elite and a trinket appeared in the strip
// along the top of the screen — a strip you were not looking at, because you were looking at the three cards
// it dealt you at the same time. Take a card off a reward screen and it was simply gone: no confirmation that
// the one you tapped was the one you got.
//
// Theirs never does this. A relic is its own screen: the object drawn large, its name, what it does, and a
// tap to go on — because a relic is a thing you will carry for the rest of the run and you have to be given a
// second to read it. A card you pick lifts and settles before it goes into the deck.
//
// ⚠️ THE TRINKET WAITS FOR A TAP AND THE CARD DOES NOT, and that difference is the point rather than an
// inconsistency. A card you already chose — you tapped it, you know what it was, so it only needs
// acknowledging. A trinket was chosen FOR you, and a thing you did not pick has to be read before it can be
// dismissed.
import { useEffect, useRef, useState } from "react";

import CardFace, { CARD_FONT, Sprite } from "@/components/cards/CardFace";
import { cardById, perkById } from "@/lib/marketplace/cards-kit.js";

export const GOT_CARD_MS = 1150;

export default function CardGot({ card = null, trinket = null, art = {}, onDone }) {
    const [going, setGoing] = useState(false);
    const timers = useRef([]);
    const isCard = Boolean(card);

    useEffect(() => {
        if (!isCard) return undefined;
        // A card takes itself away; see the note above on why a trinket does not.
        timers.current.push(setTimeout(() => setGoing(true), GOT_CARD_MS - 320));
        timers.current.push(setTimeout(() => onDone?.(), GOT_CARD_MS));
        const held = timers.current;
        return () => held.forEach(clearTimeout);
    }, [isCard, card, onDone]);

    const face = card ? cardById(card) : null;
    const perk = trinket ? perkById(trinket) : null;
    if (!face && !perk) return null;

    return (
        <div className={`got${isCard ? " is-card" : ""}`} role="dialog" aria-live="polite" aria-modal="true">
            <span className="got-glow" aria-hidden="true" />

            {face ? (
                <span className={`got-card${going ? " is-going" : ""}`}>
                    <span className="cf-card"><CardFace card={face} art={art[face.pet]} /></span>
                </span>
            ) : (
                <>
                    <Sprite className="got-item" src={`/images/cards/items/${perk.id}.png`} />
                    <span className="got-name">{perk.name}</span>
                    <p className="got-text">{perk.text}</p>
                    {/* ⚠️ A REAL BUTTON, NOT A DIV THAT LISTENS. The whole panel used to take the click,
                        which reads fine with a thumb and is nothing at all with a keyboard — and a hit-test
                        audit walking the game's controls could not see this screen had any. It covers the
                        panel so tapping anywhere still works, and it is focusable and labelled. */}
                    <button type="button" className="got-go" onClick={() => onDone?.()}
                        aria-label={`${perk.name}. ${perk.text} Tap to go on.`}>
                        Tap to go on
                    </button>
                </>
            )}

            <style jsx global>{`
                .got { position: fixed; inset: 0; z-index: 70; display: flex; flex-direction: column;
                    align-items: center; justify-content: center; gap: 8px; padding: 24px;
                    background: rgba(8, 6, 4, 0.9); animation: got-in 0.2s ease-out both;
                    --cf-card-font: ${CARD_FONT.style.fontFamily}; }
                .got.is-card { background: rgba(8, 6, 4, 0.78); pointer-events: none; }
                @keyframes got-in { from { opacity: 0; } to { opacity: 1; } }

                /* Warm, wide and still — a payout is not a struck anvil, so this does not pulse the way the
                   forge's heat does. It is the light you hold something up in. */
                .got-glow { position: absolute; width: 380px; height: 380px; border-radius: 50%;
                    background: radial-gradient(circle, rgba(255,226,170,0.5), rgba(255,170,70,0.22) 42%,
                        rgba(255,120,20,0) 72%); animation: got-glow-in 0.5s ease-out both; }
                @keyframes got-glow-in { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }

                /* THE TRINKET, drawn at the size its picture was made for. It sits in the strip at 22px for
                   the rest of the run; this is the one time it is ever big enough to actually look at. */
                .got-item { position: relative; width: 132px; height: 132px; object-fit: contain;
                    filter: drop-shadow(0 0 26px rgba(255,180,90,0.55)) drop-shadow(0 10px 18px rgba(0,0,0,0.8));
                    animation: got-rise 0.55s cubic-bezier(.2,.9,.25,1) both; }
                @keyframes got-rise {
                    0% { transform: scale(0.6) translateY(26px); opacity: 0; }
                    70% { transform: scale(1.06) translateY(0); opacity: 1; }
                    100% { transform: scale(1); opacity: 1; }
                }
                .got-name { position: relative; font-family: var(--cf-card-font); font-size: 19px;
                    letter-spacing: 0.04em; color: #ffe0ab; text-shadow: 0 2px 6px rgba(0,0,0,0.9);
                    animation: got-fade 0.5s 0.16s ease-out both; }
                /* Same face as the name above it — see the note on cf-bossperk. A trinket held up with its
                   title in one font and its effect in another reads as two things stuck together. */
                .got-text { position: relative; margin: 0; max-width: 300px; text-align: center;
                    font-family: var(--cf-card-font); font-size: 13.5px; line-height: 1.45; color: #cdbfa6;
                    animation: got-fade 0.5s 0.24s ease-out both; }
                /* It IS the dismiss: the label sits where it always did and the control stretches over the
                   whole panel behind it, so a tap anywhere still works and a keyboard has something to land
                   on. z-index below the art so the object stays the thing you are looking at. */
                .got-go { position: absolute; inset: 0; z-index: 1; display: flex; align-items: flex-end;
                    justify-content: center; padding-bottom: calc(50% - 118px);
                    border: 0; background: none; cursor: pointer;
                    font-family: var(--cf-card-font); font-size: 12px; letter-spacing: 0.08em;
                    text-transform: uppercase; color: #8e8371; animation: got-fade 0.5s 0.6s ease-out both; }
                .got-go:focus-visible { outline: 2px solid rgba(255,214,150,0.8); outline-offset: -6px; }
                @keyframes got-fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

                /* THE CARD YOU TOOK, lifted and then sent down into the deck. Same scale the forge uses, so
                   the two moments read as the same game. */
                .got-card { position: relative; display: block; transform-origin: center center;
                    animation: got-card-in 0.42s cubic-bezier(.2,.9,.25,1) both; }
                .got-card.is-going { animation: got-card-out 0.34s ease-in both; }
                .got .cf-card { position: relative; width: var(--cf-w, 96px); height: var(--cf-h, 138px); padding: 0 0 8px; }
                @keyframes got-card-in {
                    0% { transform: scale(1.2) translateY(30px); opacity: 0; }
                    70% { transform: scale(2.3) translateY(0); opacity: 1; }
                    100% { transform: scale(2.2); opacity: 1; }
                }
                @keyframes got-card-out {
                    0% { transform: scale(2.2) translateY(0); opacity: 1; }
                    100% { transform: scale(0.7) translateY(150px); opacity: 0; }
                }
            `}</style>
        </div>
    );
}
