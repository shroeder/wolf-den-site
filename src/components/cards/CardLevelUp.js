"use client";

// ── CROSSING A RUNG ──────────────────────────────────────────────────────────────────────────────────────────
// ⚠️ THIS WAS COMPUTED AND NEVER DRAWN. The server has worked out every level a run crossed since the day the
// ladder went in — `run.levelled`, an entry per rung with the cards, trinkets and pet it opens — and it grants
// the pets too. Nothing in the client ever read it. So a player crossed a rank, was silently handed a pet they
// had no idea existed, and saw a score screen. The one moment the ladder exists to produce was happening in
// the database and nowhere else. See [[declared-but-never-read]].
//
// It lands AFTER the tally, because the score is what earns the rung — the run reads itself back, the total
// rolls, and then the thing the total bought arrives on top of it.

import { useEffect, useState } from "react";
import { GiPawPrint, GiCardPlay, GiGlassBall } from "react-icons/gi";

import { ALL_CARDS, PERKS } from "@/lib/marketplace/cards-kit.js";
import { collectibleById } from "@/lib/marketplace/collectibles.js";

const STEP = 900;      // between rungs, when a run crossed more than one
const ROW = 420;       // between the lines inside a rung

export default function CardLevelUp({ levelled, petArt = {}, onDone }) {
    const list = Array.isArray(levelled) ? levelled : [];
    const [at, setAt] = useState(0);
    const [rows, setRows] = useState(0);

    useEffect(() => {
        if (!list.length) return undefined;
        const timers = [];
        const step = list[at];
        const lines = (step?.cards?.length ? 1 : 0) + (step?.perks?.length ? 1 : 0) + (step?.pet ? 1 : 0);
        for (let i = 0; i < lines; i += 1) timers.push(setTimeout(() => setRows(i + 1), 520 + i * ROW));
        if (at < list.length - 1) {
            timers.push(setTimeout(() => { setRows(0); setAt(at + 1); }, 520 + lines * ROW + STEP));
        } else {
            timers.push(setTimeout(() => onDone?.(), 520 + lines * ROW + STEP));
        }
        return () => timers.forEach(clearTimeout);
    }, [at, list, onDone]);

    if (!list.length) return null;
    const step = list[at];
    const pet = step.pet ? collectibleById(step.pet) : null;
    const shown = [];
    if (step.cards?.length) shown.push({ k: "cards", Icon: GiCardPlay, label: "New cards in the pool",
        what: step.cards.map((id) => ALL_CARDS[id]?.name || id) });
    if (step.perks?.length) shown.push({ k: "perks", Icon: GiGlassBall, label: "New trinkets",
        what: step.perks.map((id) => PERKS[id]?.name || id) });
    if (pet) shown.push({ k: "pet", Icon: GiPawPrint, label: "A companion joins you", what: [pet.name], pet });

    return (
        <div className="clv" key={step.level}>
            <span className="clv-rung">Rank {step.level}</span>
            {step.name ? <b className="clv-name">{step.name}</b> : null}
            {list.length > 1 ? <i className="clv-of">{at + 1} of {list.length}</i> : null}

            <ul className="clv-list">
                {shown.slice(0, rows).map((r) => (
                    <li key={r.k} className={`clv-row is-${r.k}`}>
                        {/* ⚠️ `.url`, BECAUSE petArt HOLDS OBJECTS. fixture.petArt[id] is { url, flip } —
                            every other reader in the fight client says `?.url` and this one nearly shipped
                            handing an object to src, which renders nothing and logs nothing. */}
                        {r.pet && petArt[r.pet.id]?.url ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={petArt[r.pet.id].url} alt="" className="clv-pet" draggable="false" />
                        ) : <r.Icon aria-hidden="true" />}
                        <span>
                            <em>{r.label}</em>
                            <b>{r.what.join(" · ")}</b>
                        </span>
                    </li>
                ))}
            </ul>

            <style jsx>{`
                .clv { position: relative; margin: 14px auto 0; max-width: 360px; padding: 18px 16px 16px;
                    border-radius: 16px; text-align: center; overflow: hidden;
                    background: radial-gradient(120% 90% at 50% 0%, rgba(255,207,135,.18), rgba(12,10,16,.9) 62%);
                    border: 1px solid rgba(255,207,135,.42);
                    animation: clvIn .62s cubic-bezier(.2,1.25,.35,1) both; }
                @keyframes clvIn {
                    0% { opacity: 0; transform: scale(.82) translateY(14px); }
                    60% { transform: scale(1.03) translateY(0); }
                    100% { opacity: 1; transform: scale(1); }
                }
                /* A slow sweep across the card, so the moment has light moving in it rather than sitting still. */
                .clv::after { content: ""; position: absolute; inset: -40% -60%; pointer-events: none;
                    background: linear-gradient(74deg, transparent 42%, rgba(255,232,190,.16) 50%, transparent 58%);
                    animation: clvSweep 2.6s ease-in-out infinite; }
                @keyframes clvSweep { 0% { transform: translateX(-38%); } 100% { transform: translateX(38%); } }

                .clv-rung { display: block; font-size: 11px; font-weight: 800; letter-spacing: .22em;
                    text-transform: uppercase; color: #ffcf87; }
                .clv-name { display: block; margin-top: 2px; font-size: 25px; font-weight: 900; color: #fff3dd;
                    text-shadow: 0 3px 16px rgba(255,207,135,.45); }
                .clv-of { display: block; margin-top: 3px; font-style: normal; font-size: 11px; color: #8a8496; }

                .clv-list { list-style: none; margin: 13px 0 0; padding: 0; display: flex;
                    flex-direction: column; gap: 8px; }
                .clv-row { display: flex; align-items: center; gap: 11px; padding: 9px 12px; border-radius: 12px;
                    text-align: left; background: rgba(255,255,255,.055); border: 1px solid rgba(255,255,255,.11);
                    animation: clvRow .5s cubic-bezier(.2,1.25,.35,1) both; }
                @keyframes clvRow {
                    0% { opacity: 0; transform: translateX(-16px); }
                    100% { opacity: 1; transform: translateX(0); }
                }
                .clv-row :global(svg) { width: 24px; height: 24px; flex-shrink: 0; color: #ffcf87; }
                .clv-row span { min-width: 0; }
                .clv-row em { display: block; font-style: normal; font-size: 10.5px; letter-spacing: .1em;
                    text-transform: uppercase; color: #8a8496; }
                .clv-row b { display: block; font-size: 14.5px; font-weight: 800; color: #f2e9dc; }
                /* The pet is the biggest thing a rung hands over, so it is the only row that shows a picture. */
                .clv-row.is-pet { background: rgba(255,207,135,.1); border-color: rgba(255,207,135,.36); }
                .clv-row.is-pet b { color: #ffcf87; }
                .clv-pet { width: 46px; height: 46px; object-fit: contain; flex-shrink: 0;
                    filter: drop-shadow(0 3px 8px rgba(0,0,0,.6)); }
            `}</style>
        </div>
    );
}
