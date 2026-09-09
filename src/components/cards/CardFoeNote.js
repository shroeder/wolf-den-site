"use client";

import { KEYWORD_TEXT, intentSay } from "@/lib/marketplace/cards-kit.js";

// ── WHAT IS THAT, AND WHAT IS IT ABOUT TO DO ─────────────────────────────────────────────────────────────
// The board tells you a creature's next move in glyphs — crossed swords and a number, a shield, a bicep, a
// blob. That is Spire's shorthand and it is right for reading a room at a glance. It is also the whole of
// what the screen says about the thing trying to kill you, and the creatures do not carry their names any
// more: they hung under the health bars, pushed the four gauges out of line, and Luke asked for them to go.
//
// So a fight can open with two things you cannot name doing something you cannot read, and the only way to
// learn what a blob over a body meant was to end your turn and find out. This is the other half — tap a
// creature and it tells you what it is, how much of it is left, what it is about to do in a sentence, and
// what every mark it is carrying does.
//
// Tapping a foe was already a no-op unless a card was raised (onFoeTap only commits a target), so this costs
// nothing that existed: with a card in hand a tap still aims it, and with an empty hand a tap now explains.
const MARKS = [
    ["strength", "Strength"], ["weak", "Weak"], ["vulnerable", "Vulnerable"], ["frail", "Frail"],
    ["poison", "Poison"], ["artifact", "Artifact"], ["regen", "Regeneration"], ["intangible", "Intangible"],
];

export default function CardFoeNote({ fight, index, onClose, onKey }) {
    const foe = index == null ? null : fight?.foes?.[index];
    if (!foe || foe.hp <= 0) return null;
    const marks = MARKS.filter(([k]) => (foe[k] || 0) > 0);
    const pct = Math.max(0, Math.min(100, Math.round((foe.hp / (foe.hpMax || foe.hp || 1)) * 100)));

    return (
        <div className="cfn-over" role="presentation" onClick={onClose}>
            <div className="cfn" role="dialog" aria-label={`${foe.name || "This creature"}`}
                onClick={(e) => e.stopPropagation()}>
                <p className="cfn-name">{foe.name || "Something"}</p>

                <div className="cfn-bar" role="presentation"><i style={{ width: `${pct}%` }} /></div>
                <p className="cfn-hp">
                    <b>{foe.hp}</b> of {foe.hpMax || foe.hp} health
                    {foe.block > 0 ? <> · <b>{foe.block}</b> Block</> : null}
                </p>

                <p className="cfn-head">About to</p>
                <p className="cfn-say">{intentSay(fight, index)}</p>

                {marks.length ? (
                    <>
                        <p className="cfn-head">Carrying</p>
                        <ul className="cfn-marks">
                            {marks.map(([k, word]) => (
                                <li key={k}>
                                    {/* The same note the card faces open, so one wording answers the word
                                        wherever a player meets it. */}
                                    <button type="button" className="cfn-word" onClick={() => onKey?.(word)}>
                                        {word} {foe[k]}
                                    </button>
                                    <i>{KEYWORD_TEXT[word]}</i>
                                </li>
                            ))}
                        </ul>
                    </>
                ) : null}

                <button type="button" className="cfn-out" onClick={onClose}>Close</button>
            </div>

            <style jsx global>{`
                .cfn-over { position: fixed; inset: 0; z-index: 8500; display: grid; place-items: center;
                    padding: 16px; background: rgba(4,5,8,0.78); }
                .cfn { width: min(340px, 100%); max-height: 86dvh; overflow-y: auto; padding: 16px 16px 12px;
                    border-radius: 14px; background: linear-gradient(180deg, #1b1d25, #12141a);
                    border: 1px solid rgba(255,143,122,0.32); box-shadow: 0 18px 40px rgba(0,0,0,0.7);
                    text-align: center; font-family: var(--cf-card-font); }
                .cfn-name { margin: 0 0 10px; font-size: 19px; font-weight: 800; letter-spacing: 0.05em;
                    color: #ffb9a6; text-shadow: 0 0 16px rgba(255,143,122,0.24); }
                .cfn-bar { height: 9px; border-radius: 999px; background: rgba(10,9,12,0.8);
                    box-shadow: inset 0 0 0 1px rgba(255,143,122,0.22); overflow: hidden; }
                .cfn-bar i { display: block; height: 100%; border-radius: 999px;
                    background: linear-gradient(90deg, #a8322b, #ff6a5a); }
                .cfn-hp { margin: 6px 0 2px; font-size: 12px; color: #b3a68f; }
                .cfn-hp b { color: #e8dcc6; font-variant-numeric: tabular-nums; }
                .cfn-head { margin: 12px 0 4px; font-size: 10.5px; letter-spacing: 0.18em;
                    text-transform: uppercase; color: #8e8371; }
                .cfn-say { margin: 0; font-size: 13.5px; line-height: 1.45; color: #f0e2c6; }
                .cfn-marks { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column;
                    gap: 7px; text-align: left; }
                .cfn-marks li { padding: 7px 9px; border-radius: 8px; background: rgba(18,16,20,0.6); }
                .cfn-word { display: block; font: inherit; font-size: 12.5px; font-weight: 800;
                    letter-spacing: 0.03em; color: #ffd75e; background: none; border: 0; padding: 0;
                    cursor: pointer; text-decoration: underline dotted rgba(255,215,94,0.5);
                    text-underline-offset: 2px; }
                .cfn-marks i { display: block; margin-top: 2px; font-style: normal; font-size: 11.5px;
                    line-height: 1.4; color: #b3a68f; }
                .cfn-out { margin-top: 14px; font: inherit; font-size: 13px; letter-spacing: 0.04em;
                    color: #14161d; background: linear-gradient(180deg, #ffcdbe, #e08e78); border: 0;
                    border-radius: 999px; padding: 8px 22px; cursor: pointer; font-weight: 700; }
            `}</style>
        </div>
    );
}
