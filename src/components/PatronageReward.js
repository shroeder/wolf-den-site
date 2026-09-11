"use client";

// ── WHAT THE COUNTER PAID ────────────────────────────────────────────────────────────────────────────────────
// The haul and the ladder, drawn on the one screen where the shop has a member's full attention: standing at
// the counter, phone out, holding the thing they just bought.
//
// ⚠️ THE LINES ARRIVE ONE AT A TIME. Eleven rewards rendered in a single frame is a list, and a list is
// something you skim; the same eleven landing a beat apart is an opening, and an opening is something you
// watch. The stagger is the entire difference between "you got some stuff" and Luke's "feel like a baller",
// and it costs one CSS delay per row.

import { useEffect, useState } from "react";
import {
    GiTwoCoins, GiCoins, GiGears, GiChest, GiPlantSeed, GiWheat, GiCrossedSwords, GiPawPrint,
} from "react-icons/gi";

const RARITY = { common: "#9aa0a6", rare: "#4aa3d4", epic: "#a855f7", legendary: "#f59e0b", mythic: "#ff5cc8" };

// One row of the hand. Icons rather than emoji, per the house rule — see [[no-emoji-in-ui]].
function line(sp) {
    if (sp.kind === "gold") return { Icon: GiTwoCoins, col: "#ffd75e", text: `${sp.n.toLocaleString()} gold` };
    if (sp.kind === "doubloons") return { Icon: GiCoins, col: "#e8c07a", text: `${sp.n.toLocaleString()} doubloons` };
    if (sp.kind === "parts") return { Icon: GiGears, col: "#c8d6bd", text: `${sp.n} forge part${sp.n === 1 ? "" : "s"} · tier ${sp.tier}` };
    if (sp.kind === "chest") return { Icon: GiChest, col: "#ffcf87", text: `a ${sp.tier} chest` };
    if (sp.kind === "seed") return { Icon: GiPlantSeed, col: RARITY[sp.rarity] || "#9ede7a", text: `${sp.n}x ${sp.name || "seed"}` };
    if (sp.kind === "crop") return { Icon: GiWheat, col: RARITY[sp.rarity] || "#d9c07a", text: `${sp.n}x ${sp.name || "crop"}` };
    if (sp.kind === "gear") return { Icon: GiCrossedSwords, col: RARITY[sp.rarity] || "#cdd9c6", text: sp.name + (sp.isNew ? "" : " (dupe)") };
    return null;
}

export default function PatronageReward({ patronage }) {
    const [shown, setShown] = useState(0);
    const hand = patronage?.hand || [];
    const pets = [...(patronage?.pets || []), ...(patronage?.alsoGranted || [])];

    // Reveal a line at a time. An interval rather than per-row CSS delays because the pets land AFTER the
    // hand and need to know when it has finished.
    useEffect(() => {
        if (!hand.length) { setShown(0); return undefined; }
        const t = setInterval(() => setShown((n) => (n >= hand.length ? n : n + 1)), 260);
        return () => clearInterval(t);
    }, [hand.length]);

    if (!patronage || (!hand.length && !pets.length)) return null;
    const allIn = shown >= hand.length;

    return (
        <div className="pat">
            {hand.length ? (
                <>
                    <p className="pat-head">The counter threw in{patronage.rolls > 1 ? ` ${patronage.rolls} things` : " something"}</p>
                    <ul className="pat-list">
                        {hand.slice(0, shown).map((sp, i) => {
                            const l = line(sp);
                            if (!l) return null;
                            return (
                                <li key={i} className="pat-row" style={{ "--c": l.col }}>
                                    <l.Icon aria-hidden="true" />
                                    <span>{l.text}</span>
                                </li>
                            );
                        })}
                    </ul>
                </>
            ) : null}

            {/* The ladder. Held back until the hand has finished landing, because a mythic pet should not share
                a frame with two iron ingots. */}
            {allIn && pets.length ? (
                <div className="pat-pets">
                    {pets.map((p) => (
                        <div key={p.id} className="pat-pet" style={{ "--c": RARITY[p.rarity] || "#cdd9c6" }}>
                            <GiPawPrint aria-hidden="true" />
                            <b>{p.name}</b>
                            <i>unlocked at ${Number(p.spend || 0).toLocaleString()} lifetime spend</i>
                        </div>
                    ))}
                </div>
            ) : null}

            {/* Where the next one is. A ladder whose next rung nobody can see is not a ladder. */}
            {allIn && patronage.next ? (
                <p className="pat-next">
                    <b>${Number(patronage.next.need).toLocaleString()}</b> more lifetime spend unlocks <b>{patronage.next.name}</b>
                </p>
            ) : null}

            <style jsx>{`
                .pat { width: 100%; max-width: 340px; margin: 4px auto 0; text-align: left; }
                .pat-head { margin: 0 0 7px; text-align: center; font-size: 12px; font-weight: 800;
                    letter-spacing: .1em; text-transform: uppercase; color: #8a9384; }
                .pat-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 5px; }
                .pat-row { display: flex; align-items: center; gap: 9px; padding: 8px 11px; border-radius: 10px;
                    background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1);
                    font-size: 14px; font-weight: 700; color: var(--c);
                    animation: patIn .34s cubic-bezier(.2,1.3,.35,1) both; }
                .pat-row :global(svg) { width: 20px; height: 20px; flex-shrink: 0; }
                @keyframes patIn {
                    0% { opacity: 0; transform: translateX(-14px) scale(.94); }
                    100% { opacity: 1; transform: translateX(0) scale(1); }
                }
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
                .pat-next { margin: 11px 0 0; text-align: center; font-size: 12.5px; color: #8a9384; }
                .pat-next b { color: #cdd9c6; }
            `}</style>
        </div>
    );
}
