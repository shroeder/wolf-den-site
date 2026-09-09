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
            {/* ── THE PART THAT IS JUST FEELING ──────────────────────────────────
                Luke, on the chest: "needs a result modal that shows the sprite and juicy dopamine effects
                and the description." The glow behind the object was the whole of it — a still warm circle,
                which is light to READ something in rather than a payout.
                A slow wheel of rays behind the object and twelve sparks thrown out of it on the first beat.
                Both are aria-hidden and neither can be pressed: they are decoration over a control that
                covers the whole panel, so nothing here can eat the tap that dismisses it.
                Not on the card path — a card you already chose does not get a fanfare, see the note above. */}
            {isCard ? null : <span className="got-rays" aria-hidden="true" />}
            {isCard ? null : (
                <span className="got-sparks" aria-hidden="true">
                    {Array.from({ length: 12 }, (_, i) => (
                        <span key={i} className="got-spark" style={{ "--a": `${i * 30}deg`, "--d": `${(i % 3) * 60}ms` }} />
                    ))}
                </span>
            )}

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
                /* A WHEEL, NOT A FLASH. Sixteen rays turning once every twenty seconds: at that speed
                   you never catch it moving, you only notice that the light is alive. A fast spin reads as
                   a loading spinner, which is the one thing a reward must not look like. */
                /* Measured by eye at 369x700: the first cut was 0.16 alpha over 7deg spokes and it read as
                   a printed sunburst behind the object rather than as light coming off it. Half the
                   opacity and a third of the width, and it is a shimmer you notice without looking at. */
                .got-rays { position: absolute; width: 460px; height: 460px; pointer-events: none;
                    background: repeating-conic-gradient(from 0deg,
                        rgba(255,226,164,0.085) 0deg 2.4deg, rgba(255,226,164,0) 2.4deg 22.5deg);
                    -webkit-mask-image: radial-gradient(circle, transparent 12%, #000 28%, transparent 60%);
                    mask-image: radial-gradient(circle, transparent 12%, #000 28%, transparent 60%);
                    animation: got-rays-in 0.6s ease-out both, got-spin 20s linear infinite; }
                @keyframes got-rays-in { from { opacity: 0; transform: scale(0.7); } to { opacity: 1; transform: scale(1); } }
                @keyframes got-spin { to { transform: rotate(360deg); } }

                /* Thrown once, on the beat the object lands. --a is the angle each one leaves on and --d
                   staggers them so it reads as a burst rather than as a ring expanding. */
                /* ⚠️ CENTRED EXPLICITLY. A zero-size absolute box with no inset falls back to its STATIC
                   position — which in this column is above the object, so the burst went off in the empty
                   air over its head. It has to be pinned to the middle of the panel, which is where the
                   thing it is coming out of is. */
                .got-sparks { position: absolute; top: 50%; left: 50%; width: 0; height: 0;
                    pointer-events: none; }
                /* ⚠️ THEY HAVE TO LEAVE THE GLOW OR THEY ARE NOT THERE. The first cut threw 7px gold dots
                   at 0.85s out to 124px — which is INSIDE the 190px glow, so they were warm dots on a warm
                   circle and photographed as nothing at all at 250ms and at 500ms both. White-hot, bigger,
                   drawn as a streak rather than a dot, and thrown past the glow's own edge, which is the
                   only place on this panel where a moving highlight has anything to move against. */
                .got-spark { position: absolute; width: 5px; height: 14px; margin: -7px 0 0 -2.5px;
                    border-radius: 999px;
                    background: linear-gradient(180deg, #fffdf2, #ffd07a 55%, rgba(255,150,40,0));
                    box-shadow: 0 0 10px rgba(255,225,160,0.9);
                    transform: rotate(var(--a)) translateY(0) scale(0);
                    animation: got-spark-out 1s cubic-bezier(.12,.7,.25,1) var(--d) both; }
                @keyframes got-spark-out {
                    0% { transform: rotate(var(--a)) translateY(-16px) scaleY(0.4) scaleX(0.6); opacity: 0; }
                    18% { opacity: 1; }
                    70% { opacity: 1; }
                    100% { transform: rotate(var(--a)) translateY(-208px) scaleY(1.6) scaleX(0.7); opacity: 0; }
                }

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
