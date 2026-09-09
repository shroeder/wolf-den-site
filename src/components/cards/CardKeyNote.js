"use client";

import { Sprite } from "@/components/cards/CardFace";
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
// ⚠️ IT IS OPENED FROM TWO PLACES THAT KNOW DIFFERENT AMOUNTS. A gold word on a card face is a rule
// with no number attached — "Weak" means the same thing wherever it is printed. A tag under a fighter is
// that rule with a quantity ON somebody, and "how much Weak am I carrying" is most of what the player is
// asking when they press it. So `word` takes either: a plain string from a card, or {word, n, src} from a
// tag, which also hands over the emblem so the thing you tapped is the thing that opens.
export default function CardKeyNote({ word, onClose }) {
    const it = typeof word === "string" ? { word } : (word || {});
    if (!it.word) return null;
    return (
        <div className="ck-over" role="presentation" onClick={onClose}>
            <div className="ck" role="dialog" aria-label={`What ${it.word} does`}
                onClick={(e) => e.stopPropagation()}>
                {it.src ? <Sprite src={it.src} className="ck-mark" /> : null}
                <p className="ck-word">{it.word}{Number.isFinite(it.n) ? <em className="ck-n">{it.n}</em> : null}</p>
                <p className="ck-say">{KEYWORD_TEXT[it.word] || "No note for this one yet."}</p>
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
                /* Big, because at this size the emblem is being LEARNED rather than read — the whole
                   point of tapping one is to find out what that little picture over the health bar was. */
                .ck-mark { display: block; width: 62px; height: 62px; margin: 2px auto 8px;
                    object-fit: contain; filter: drop-shadow(0 4px 8px rgba(0,0,0,0.6)); }
                .ck-word { margin: 0 0 8px; font-size: 19px; font-weight: 800; letter-spacing: 0.05em;
                    color: #ffd75e; text-shadow: 0 0 16px rgba(255,215,94,0.28); }
                /* The amount, in the same slate the cost diamond and the pile counts are painted in, so a
                   number on this screen always looks like a number this game printed. */
                .ck-n { display: inline-block; margin-left: 8px; padding: 1px 9px; border-radius: 999px;
                    font-style: normal; font-size: 15px; font-weight: 900; font-variant-numeric: tabular-nums;
                    color: #f2f5f8; background: linear-gradient(180deg, #6b7280, #2b3038);
                    border: 1px solid #10131a; vertical-align: 2px;
                    box-shadow: inset 0 1px 0 rgba(255,255,255,0.22); }
                .ck-say { margin: 0 0 14px; font-size: 13.5px; line-height: 1.5; color: #d9d2c4; }
                .ck-out { font: inherit; font-size: 13px; letter-spacing: 0.04em; color: #14161d;
                    background: linear-gradient(180deg, #ffd88a, #e0a94e); border: 0; border-radius: 999px;
                    padding: 8px 22px; cursor: pointer; font-weight: 700; }
            `}</style>
        </div>
    );
}
