"use client";

// ── WHAT THE COUNTER PAID ────────────────────────────────────────────────────────────────────────────────────
// The haul and the ladder, drawn on the one screen where the shop has a member's full attention: standing at
// the counter, phone out, holding the thing they just bought.
//
// ⚠️ EVERY REWARD IS AN ITEM CARD WITH ITS OWN ARTWORK, and it was a list of react-icons glyphs. Luke, looking
// at a real $180 receipt: "Show actual sprites ... And it should always use full sprites and item cards."
// A Legendary ring and five Tempered Steel and a Gold Chest all arrived as the same grey 20px svg beside a
// string, while the painted sprite for every one of them was already generated and already on the shelf
// somewhere else in the Den. A reward you cannot recognise is a receipt line.
//
// The art is resolved SERVER-SIDE, in one pass, by dressHaul in patronage-store.js — this component does not
// fetch anything. See the note there for why, and [[check-existing-sprites-first]] for where the sprites live.
//
// ⚠️ THE CARDS ARRIVE ONE AT A TIME. Eleven rewards rendered in a single frame is a list, and a list is
// something you skim; the same eleven landing a beat apart is an opening, and an opening is something you
// watch. The stagger is the entire difference between "you got some stuff" and Luke's "feel like a baller",
// and it costs one interval.

import { useEffect, useState } from "react";
import { GiPawPrint } from "react-icons/gi";

import ChestIcon from "@/components/ChestIcon";

// The shared ladder from globals.css, plus one tone the rarity scale does not have a word for: currency.
// Kept local rather than reading the `.rar-*` classes so a card can be tinted by its OWN colour — a Forge
// part is Tempered Steel blue and a Wooden Chest is brown, neither of which is a rarity.
const RARITY = {
    common: "#9aa7b5", rare: "#4a90d9", epic: "#a855f7", legendary: "#f5a623",
    mythic: "#5affaf", ascendant: "#ff7a3c", eternal: "#ff5cc8", coin: "#ffd75e",
};
const toneOf = (c) => c.tone || RARITY[c.rarity] || RARITY.common;

// Rarities worth shouting about. A card at these tiers gets the glow the gear screen gives them, because
// pulling a Legendary out of a card purchase should not look like pulling a turnip.
const LOUD = new Set(["legendary", "mythic", "ascendant", "eternal"]);

export default function PatronageReward({ patronage }) {
    const [shown, setShown] = useState(0);
    const hand = patronage?.hand || [];
    const pets = [...(patronage?.pets || []), ...(patronage?.alsoGranted || [])];

    // Reveal a card at a time. An interval rather than per-card CSS delays because the pets land AFTER the
    // hand and need to know when it has finished.
    useEffect(() => {
        if (!hand.length) { setShown(0); return undefined; }
        const t = setInterval(() => setShown((n) => (n >= hand.length ? n : n + 1)), 240);
        return () => clearInterval(t);
    }, [hand.length]);

    if (!patronage || (!hand.length && !pets.length)) return null;
    const allIn = shown >= hand.length;

    return (
        <div className="pat">
            {hand.length ? (
                <>
                    <p className="pat-head">The counter threw in{patronage.rolls > 1 ? ` ${patronage.rolls} things` : " something"}</p>
                    <div className="pat-grid">
                        {hand.slice(0, shown).map((c, i) => (
                            <div key={`${c.kind}-${c.id || c.tier || i}`}
                                className={`pat-card${LOUD.has(c.rarity) ? " is-loud" : ""}`}
                                style={{ "--rar": toneOf(c) }}>
                                <span className="pat-art">
                                    {/* A chest whose painted art the cron has not made yet still gets a chest:
                                        ChestIcon draws one per tier. Every other kind has a generic sprite
                                        behind it, so `fallback` is never a broken image. */}
                                    {c.kind === "chest" && !c.sprite
                                        ? <ChestIcon tier={c.tier} size={44} />
                                        /* eslint-disable-next-line @next/next/no-img-element */
                                        : <img src={c.sprite || c.fallback} alt="" draggable="false" />}
                                </span>
                                {/* A pile of coin is a NUMBER; three chests are a multiplier. "×574 gold" reads
                                    as 574 separate golds. */}
                                {c.n > 1 ? <b className="pat-n">{c.rarity === "coin" && c.kind !== "parts" ? c.n.toLocaleString() : `×${c.n}`}</b> : null}
                                <b className="pat-name">{c.name}</b>
                                {c.sub ? <em className="pat-sub">{c.sub}</em> : null}
                            </div>
                        ))}
                    </div>
                </>
            ) : null}

            {/* The ladder. Held back until the hand has finished landing, because a mythic pet should not share
                a frame with two iron ingots. */}
            {allIn && pets.length ? (
                <div className="pat-pets">
                    {pets.map((p) => (
                        <div key={p.id} className="pat-pet" style={{ "--c": RARITY[p.rarity] || "#cdd9c6" }}>
                            {/* The ANIMAL. Raw img rather than a wrapper, because styled-jsx only stamps its
                                scope class onto DOM elements — see [[styled-jsx-landmines]]. */}
                            {p.art?.url ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img src={p.art.url} alt="" className="pat-pet-art" draggable="false"
                                    style={p.art.flip ? { transform: "scaleX(-1)" } : undefined} />
                            ) : <GiPawPrint aria-hidden="true" />}
                            <b>{p.name}</b>
                            {p.hint ? <em>{p.hint}</em> : null}
                            <i>unlocked at ${Number(p.spend || 0).toLocaleString()} lifetime spend</i>
                        </div>
                    ))}
                </div>
            ) : null}

            {/* Where the next one is. A ladder whose next rung nobody can see is not a ladder. */}
            {allIn && patronage.next ? (
                <div className="pat-next">
                    {/* ⚠️ THE NEXT RUNG IS DRAWN, NOT DESCRIBED. It was one grey sentence, which is the least
                        persuasive form the best argument in this whole system could take: a member is thirty
                        dollars from an animal nobody else has and could not see it. Shown dimmed and
                        desaturated — the silhouette of a thing you do not own yet. */}
                    {patronage.next.art?.url ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={patronage.next.art.url} alt="" className="pat-next-art" draggable="false" />
                    ) : null}
                    <p>
                        <b>${Number(patronage.next.need).toLocaleString()}</b> more lifetime spend unlocks{" "}
                        <b style={{ color: RARITY[patronage.next.rarity] || "#cdd9c6" }}>{patronage.next.name}</b>
                    </p>
                </div>
            ) : null}

            <style jsx>{`
                .pat { width: 100%; max-width: 360px; margin: 4px auto 0; text-align: left; }
                .pat-head { margin: 0 0 9px; text-align: center; font-size: 12px; font-weight: 800;
                    letter-spacing: .1em; text-transform: uppercase; color: #8a9384; }

                /* ── THE LOOT CARD ────────────────────────────────────────────────────────────────────
                   Same shape the bag and the chest reveal use: a rarity-tinted plate, the art on a
                   backplate of its own colour, the name under it. Two across on a phone, because a
                   full-width row wastes the frame the art needs to read at all. */
                .pat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(108px, 1fr)); gap: 8px; }
                .pat-card { position: relative; display: flex; flex-direction: column; align-items: center;
                    gap: 3px; text-align: center; padding: 10px 7px 9px; border-radius: 13px;
                    background: linear-gradient(180deg, color-mix(in srgb, var(--rar) 16%, transparent), rgba(0,0,0,.3));
                    border: 1.5px solid color-mix(in srgb, var(--rar) 55%, transparent);
                    box-shadow: 0 0 12px -5px var(--rar), inset 0 0 18px -13px var(--rar);
                    animation: patIn .4s cubic-bezier(.2,1.35,.35,1) both; }
                .pat-card.is-loud { box-shadow: 0 0 18px -3px var(--rar), inset 0 0 20px -10px var(--rar);
                    animation: patIn .4s cubic-bezier(.2,1.35,.35,1) both, patGlow 2.4s ease-in-out .4s infinite; }
                @keyframes patIn {
                    0% { opacity: 0; transform: translateY(10px) scale(.86); }
                    100% { opacity: 1; transform: none; }
                }
                @keyframes patGlow {
                    0%, 100% { box-shadow: 0 0 18px -3px var(--rar), inset 0 0 20px -10px var(--rar); }
                    50% { box-shadow: 0 0 26px 0 var(--rar), inset 0 0 22px -8px var(--rar); }
                }

                /* The backplate. It is what makes a die-cut sprite read as an ITEM rather than a picture
                   floating on the page — same trick .equip-card-glyph plays in globals.css. */
                .pat-art { width: 54px; height: 54px; border-radius: 13px; display: grid; place-items: center;
                    flex: none;
                    background: radial-gradient(circle at 50% 36%, color-mix(in srgb, var(--rar) 38%, transparent), rgba(0,0,0,.22));
                    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--rar) 50%, transparent), 0 2px 6px rgba(0,0,0,.4); }
                .pat-art img { width: 44px; height: 44px; object-fit: contain; display: block;
                    filter: drop-shadow(0 1px 4px rgba(0,0,0,.55)); }
                .pat-art :global(svg) { width: 44px; height: 44px; }

                /* How many. A corner badge rather than a prefix, so "Tempered Steel" stays readable at 12px
                   and the number is the thing the eye finds first. */
                .pat-n { position: absolute; top: -6px; right: -4px; min-width: 24px; padding: 2px 6px;
                    border-radius: 999px; font-size: 11.5px; font-weight: 900; color: #14100a;
                    background: linear-gradient(180deg, #ffe488, #f3b23a); box-shadow: 0 2px 5px rgba(0,0,0,.5); }
                .pat-name { font-size: 12.5px; line-height: 1.2; font-weight: 800; color: #f2ead9; }
                .pat-sub { font-style: normal; font-size: 10.5px; line-height: 1.25; color: #8a9384; }

                .pat-pets { margin-top: 12px; display: flex; flex-direction: column; gap: 8px; }
                .pat-pet { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 13px 12px;
                    border-radius: 13px; text-align: center;
                    background: radial-gradient(120% 100% at 50% 0%, color-mix(in srgb, var(--c) 22%, transparent), transparent 70%);
                    border: 1px solid color-mix(in srgb, var(--c) 50%, transparent);
                    animation: patPet .6s cubic-bezier(.2,1.3,.35,1) both; }
                .pat-pet :global(svg) { width: 30px; height: 30px; color: var(--c); }
                .pat-pet b { font-size: 17px; font-weight: 900; color: var(--c); }
                .pat-pet i { font-style: normal; font-size: 11.5px; color: #8a9384; }
                @keyframes patPet {
                    0% { opacity: 0; transform: scale(.6); }
                    60% { transform: scale(1.06); }
                    100% { opacity: 1; transform: scale(1); }
                }
                .pat-pet-art { width: 92px; height: 92px; object-fit: contain; margin-bottom: 2px;
                    filter: drop-shadow(0 8px 11px rgba(0, 0, 0, .55));
                    animation: patBob 3.4s ease-in-out infinite; }
                @keyframes patBob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
                .pat-pet em { font-style: normal; font-size: 11.5px; line-height: 1.3; color: #a99c88; }

                .pat-next { margin: 12px 0 0; display: flex; flex-direction: column; align-items: center; gap: 2px; }
                .pat-next p { margin: 0; text-align: center; font-size: 12.5px; color: #8a9384; }
                .pat-next b { color: #cdd9c6; }
                .pat-next-art { width: 54px; height: 54px; object-fit: contain; opacity: .38;
                    filter: grayscale(.75) brightness(.85); }
            `}</style>
        </div>
    );
}
