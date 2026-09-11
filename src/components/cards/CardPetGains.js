"use client";

// ── WHAT THE RUN FED ─────────────────────────────────────────────────────────────────────────────────────────
// The card pool is pet-gated — you are only offered a card if you own the pet behind it — and that gate only
// ever ran one way: owning pets got you cards, playing cards got the pets nothing. A run now feeds the pets it
// was BUILT FROM, split by how much of the deck each one wrote, and this is where that is said.
//
// Sorted biggest first, so the pet the deck was actually about is the top line rather than something buried
// under four one-card also-rans.

import { useEffect, useState } from "react";
import { GiPawPrint } from "react-icons/gi";

import { collectibleById } from "@/lib/marketplace/collectibles.js";

const ROW = 260;

export default function CardPetGains({ gains, petArt = {} }) {
    const list = Array.isArray(gains) ? gains.slice(0, 6) : [];
    const [shown, setShown] = useState(0);

    useEffect(() => {
        if (!list.length) return undefined;
        const timers = list.map((_, i) => setTimeout(() => setShown(i + 1), 300 + i * ROW));
        return () => timers.forEach(clearTimeout);
    }, [list]);

    if (!list.length) return null;

    return (
        <div className="cpg">
            <p className="cpg-h"><GiPawPrint aria-hidden="true" /> The deck fed its pets</p>
            <ul className="cpg-list">
                {list.slice(0, shown).map((g) => {
                    const pet = collectibleById(g.pet);
                    return (
                        <li key={g.pet} className={`cpg-row${g.leveled ? " is-up" : ""}`}>
                            {petArt[g.pet]?.url ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img src={petArt[g.pet].url} alt="" className="cpg-art" draggable="false" />
                            ) : <GiPawPrint aria-hidden="true" />}
                            <span className="cpg-who">
                                <b>{pet?.name || g.pet}</b>
                                <em>{g.cards} card{g.cards === 1 ? "" : "s"} in the deck</em>
                            </span>
                            <span className="cpg-n">
                                +{g.n.toLocaleString()}<i>xp</i>
                                {g.leveled ? <u>Level {g.level}</u> : null}
                            </span>
                        </li>
                    );
                })}
            </ul>

            <style jsx>{`
                .cpg { margin: 12px auto 0; max-width: 360px; padding: 13px 14px 12px; border-radius: 14px;
                    background: rgba(255,255,255,.045); border: 1px solid rgba(255,255,255,.1); }
                .cpg-h { margin: 0 0 9px; display: flex; align-items: center; gap: 7px;
                    font-size: 11px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase;
                    color: #8a8496; }
                .cpg-h :global(svg) { width: 16px; height: 16px; color: #b6d06a; }
                .cpg-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
                .cpg-row { display: flex; align-items: center; gap: 10px; padding: 7px 9px; border-radius: 10px;
                    background: rgba(255,255,255,.04);
                    animation: cpgIn .42s cubic-bezier(.2,1.25,.35,1) both; }
                @keyframes cpgIn {
                    0% { opacity: 0; transform: translateX(-12px); }
                    100% { opacity: 1; transform: translateX(0); }
                }
                .cpg-row :global(svg) { width: 26px; height: 26px; color: #8a8496; flex-shrink: 0; }
                .cpg-art { width: 34px; height: 34px; object-fit: contain; flex-shrink: 0; }
                .cpg-who { flex: 1; min-width: 0; }
                .cpg-who b { display: block; font-size: 13.5px; font-weight: 800; color: #f2e9dc;
                    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .cpg-who em { display: block; font-style: normal; font-size: 10.5px; color: #8a8496; }
                .cpg-n { text-align: right; font-size: 14px; font-weight: 800; color: #b6d06a; white-space: nowrap; }
                .cpg-n i { margin-left: 3px; font-style: normal; font-size: 9.5px; letter-spacing: .1em;
                    text-transform: uppercase; color: #6f7a68; }
                /* A pet that actually crossed a level is the only row worth shouting about. */
                .cpg-n u { display: block; text-decoration: none; font-size: 11px; color: #ffcf87; }
                .cpg-row.is-up { background: rgba(255,207,135,.11); box-shadow: inset 0 0 0 1px rgba(255,207,135,.3); }
            `}</style>
        </div>
    );
}
