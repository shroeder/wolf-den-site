"use client";

import { KEYWORD_TEXT } from "@/lib/marketplace/cards-kit.js";

// ── WHAT THAT GOLD WORD MEANS ────────────────────────────────────────────────────────────────────────────
// Luke: "we need a system to let players inspect key words to understand what they do."
//
// The face has painted eleven words gold since the day it was written, which tells a player the word MATTERS
// and not one thing about what it does — and four of them (Poison, Artifact, Regeneration, Intangible) were
// added recently enough that nothing anywhere on the site has ever explained them. Spire puts the definition
// one tap from every card that is sitting still, and so does this.
//
// The text comes from KEYWORD_TEXT in the rules, beside the functions that enforce it, rather than from a
// copy here — the whole reason a card's own sentence is a template over its fields is that two places to say
// what a number is means one of them is wrong by next week.
export default function CardKeyNote({ word, onClose }) {
    if (!word) return null;
    return (
        <div className="ck-over" role="presentation" onClick={onClose}>
            <div className="ck" role="dialog" aria-label={`What ${word} does`}
                onClick={(e) => e.stopPropagation()}>
                <p className="ck-word">{word}</p>
                <p className="ck-say">{KEYWORD_TEXT[word] || "No note for this one yet."}</p>
                <button type="button" className="ck-out" onClick={onClose}>Got it</button>
            </div>

            <style jsx global>{`
                /* Above every other dialog in the game on purpose: this one is opened FROM the card preview,
                   the deck list and the fight's card peek, so it has to sit over whichever of them called
                   it rather than under the one with the highest number. */
                .ck-over { position: fixed; inset: 0; z-index: 9000; display: grid; place-items: center;
                    padding: 18px; background: rgba(4,5,8,0.78); }
                .ck { width: min(340px, 100%); padding: 16px 16px 12px; border-radius: 14px;
                    background: linear-gradient(180deg, #1b1d25, #12141a);
                    border: 1px solid rgba(255,215,94,0.3);
                    box-shadow: 0 18px 40px rgba(0,0,0,0.7); text-align: center; }
                .ck-word { margin: 0 0 8px; font-size: 19px; font-weight: 800; letter-spacing: 0.05em;
                    color: #ffd75e; text-shadow: 0 0 16px rgba(255,215,94,0.28); }
                .ck-say { margin: 0 0 14px; font-size: 13.5px; line-height: 1.5; color: #d9d2c4; }
                .ck-out { font: inherit; font-size: 13px; letter-spacing: 0.04em; color: #14161d;
                    background: linear-gradient(180deg, #ffd88a, #e0a94e); border: 0; border-radius: 999px;
                    padding: 8px 22px; cursor: pointer; font-weight: 700; }
            `}</style>
        </div>
    );
}
