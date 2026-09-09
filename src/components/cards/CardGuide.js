"use client";

import { KEYWORD_TEXT } from "@/lib/marketplace/cards-kit.js";
import { STATUS_ART } from "@/components/cards/status-art.js";
import { Sprite } from "@/components/cards/CardFace";

// ── THE ONE PLACE THAT EXPLAINS THE GAME ─────────────────────────────────────────────────────────────────
// Luke: "make a game guide button so I can read about status effects."
//
// Everything in here was already answerable one tap at a time — press a gold word on a card, press a mark
// under a health bar, press a creature's intent — but all of those need you to be LOOKING AT the thing you
// do not understand, and holding a card you cannot read is the moment you least want to go hunting. This is
// the same wording, gathered, readable before a run rather than during one.
//
// ⚠️ THE TEXT IS KEYWORD_TEXT AND THE PICTURES ARE STATUS_ART. Not a word of it is written here. A guide
// that keeps its own copy of the rules is a guide that is wrong by the end of the month, and this game has
// already had that bug in three other places.
const CARRIED = ["Strength", "Dexterity", "Block", "Artifact", "Regeneration", "Intangible"];
const AGAINST = ["Weak", "Vulnerable", "Frail", "Poison", "Curse"];

// The marks that are not keywords: they are things a creature DOES on its turn, and the pill above its head
// is the only place they appear.
const INTENTS = [
    ["attack", "It is going to hit you. The number beside the blades is what it will land for, after "
        + "everything currently on both of you."],
    ["block", "It is going to guard itself. Damage you deal this turn comes off that first."],
    ["strength", "It is going to get stronger, and stay that way for the rest of the fight."],
    ["heal", "It is going to close some of its own wounds."],
    ["weak", "It is going to weaken you, so your attacks land for less."],
    ["vulnerable", "It is going to open you up, so everything hits you harder."],
    ["status", "It is going to shuffle something useless into your deck. It stays there for the fight."],
    ["summon", "It is going to call in more of them."],
];

export default function CardGuide({ open, onClose }) {
    if (!open) return null;
    const row = (word) => {
        const art = Object.values(STATUS_ART).find((a) => a.word === word);
        return (
            <li key={word}>
                {art ? <Sprite src={art.src} className="cg-mark" /> : <span className="cg-mark" />}
                <span><b>{word}</b><i>{KEYWORD_TEXT[word]}</i></span>
            </li>
        );
    };

    return (
        <div className="cg-over" role="presentation" onClick={onClose}>
            <div className="cg" role="dialog" aria-label="How the game works" onClick={(e) => e.stopPropagation()}>
                <p className="cg-head">How this works</p>

                <p className="cg-lead">
                    A run is three acts of fifteen rooms. You pick the route, one room at a time, and every
                    card you take stays in the deck for the whole climb.
                </p>

                <p className="cg-sub">What you can carry</p>
                <ul className="cg-list">{CARRIED.map(row)}</ul>

                <p className="cg-sub">What can be put on you</p>
                <ul className="cg-list">{AGAINST.map(row)}</ul>

                <p className="cg-sub">What the mark above a creature means</p>
                <ul className="cg-list">
                    {INTENTS.map(([k, says]) => (
                        <li key={k}>
                            <Sprite src={STATUS_ART[k].src} className="cg-mark" />
                            <span><b>{STATUS_ART[k].label}</b><i>{says}</i></span>
                        </li>
                    ))}
                </ul>

                <p className="cg-sub">Two things worth knowing</p>
                <ul className="cg-notes">
                    <li>Block is gone at the start of your next turn. Spend it or waste it.</li>
                    <li>Tap anything you do not recognise — a gold word on a card, a mark under a health
                        bar, the pill above a creature. All of them answer.</li>
                </ul>

                <button type="button" className="cg-out" onClick={onClose}>Close</button>
            </div>

            <style jsx global>{`
                .cg-over { position: fixed; inset: 0; z-index: 8800; display: grid; place-items: center;
                    padding: 14px; background: rgba(4,5,8,0.84); }
                .cg { width: min(380px, 100%); max-height: 88dvh; overflow-y: auto; padding: 16px 16px 12px;
                    border-radius: 14px; background: linear-gradient(180deg, #1b1d25, #12141a);
                    border: 1px solid rgba(226,199,143,0.28); box-shadow: 0 18px 40px rgba(0,0,0,0.7); }
                .cg-head { margin: 0 0 8px; text-align: center; font-size: 18px; font-weight: 800;
                    letter-spacing: 0.05em; color: #ffd9a6; }
                .cg-lead { margin: 0 0 14px; font-size: 12.5px; line-height: 1.5; color: #b3a68f;
                    text-align: center; }
                .cg-sub { margin: 14px 0 6px; font-size: 10.5px; letter-spacing: 0.16em;
                    text-transform: uppercase; color: #8e8371; }
                .cg-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
                .cg-list li { display: flex; align-items: flex-start; gap: 10px; padding: 8px 9px;
                    border-radius: 9px; background: rgba(18,16,20,0.6); }
                .cg-mark { width: 26px; height: 26px; object-fit: contain; flex: 0 0 auto; }
                .cg-list b { display: block; font-size: 12.5px; color: #ffd75e; letter-spacing: 0.02em; }
                .cg-list i { display: block; margin-top: 2px; font-style: normal; font-size: 11.5px;
                    line-height: 1.45; color: #b3a68f; }
                .cg-notes { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 6px; }
                .cg-notes li { font-size: 11.5px; line-height: 1.45; color: #b3a68f; }
                .cg-out { display: block; margin: 16px auto 0; font: inherit; font-size: 13px;
                    letter-spacing: 0.04em; color: #14161d; font-weight: 700;
                    background: linear-gradient(180deg, #ffd88a, #e0a94e); border: 0;
                    border-radius: 999px; padding: 8px 24px; cursor: pointer; }
            `}</style>
        </div>
    );
}
