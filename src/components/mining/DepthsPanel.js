"use client";

import { useState } from "react";

import { DEPTH_META } from "@/lib/marketplace/items.js";

// ── WHAT YOUR LOADOUT IS DOING DOWN HERE ─────────────────────────────────────────────────────────────────────
// Depths affinity was live on every roll in the mine — the collapse, the seam, the furnace — and completely
// invisible. A piece showed "⛏️ +6 Hew" on its gear card and nothing anywhere added the six up, so there was no
// way to tell whether the thing you just equipped changed anything.
//
// Points AND the effect they buy, side by side. "+9 Hew" is not a number anyone can act on; "+27% ore" is. The
// three groups are the three tabs — Delving, Mining, Smelting — so the panel reads as "what each half of this
// screen is getting from my gear" rather than a stat dump.
const GROUPS = [
    { title: "Delving", rows: [["nerve", "collapseCut", "less collapse risk"], ["lodesense", "seamTierBonus", "better seams"]] },
    { title: "Mining", rows: [["hew", "oreBonus", "more ore per seam"], ["prospect", "findBonus", "better find odds"]] },
    { title: "Smelting", rows: [["bellows", "extraPartChance", "extra-part odds"], ["crucible", "curioBonus", "slag curio odds"]] },
];

export default function DepthsPanel({ depths }) {
    const [open, setOpen] = useState(false);
    if (!depths) return null;
    const { points = {}, effects = {}, capstones = {}, secondWindUsed } = depths;
    const total = Object.values(points).reduce((a, b) => a + (Number(b) || 0), 0);
    const caps = [
        capstones.secondWind ? { key: "sw", label: "Second Wind", desc: secondWindUsed ? "Used today — back tomorrow." : "Your next collapse today leaves your haul intact.", spent: secondWindUsed } : null,
        capstones.richSeam > 0 ? { key: "rs", label: "Rich Seam", desc: `${Math.round(capstones.richSeam * 100)}% chance a seam pays its ore twice.` } : null,
        capstones.freeSmelt > 0 ? { key: "cc", label: "Cold Crucible", desc: `${Math.round(capstones.freeSmelt * 100)}% chance a smelt costs no ore.` } : null,
    ].filter(Boolean);

    return (
        <div className={`dep-panel${open ? " is-open" : ""}`}>
            <button type="button" className="dep-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
                <span className="dep-title">Depths affinity</span>
                {/* The headline number is the one worth seeing collapsed. Zero is information too — it says
                    "nothing you are wearing helps down here", which is the nudge to go find something. */}
                <span className={`dep-total${total ? "" : " is-none"}`}>{total ? `${total} pts` : "none equipped"}</span>
                <span className="dep-chev" aria-hidden="true">{open ? "▾" : "▸"}</span>
            </button>

            {open ? (
                <div className="dep-body">
                    {total === 0 ? (
                        <p className="dep-empty">
                            Nothing you have equipped helps underground yet. Depths affinity comes from mine gear,
                            a mine pet, your earned mining badges and rare Forge attunements.
                        </p>
                    ) : null}
                    {GROUPS.map((g) => (
                        <div key={g.title} className="dep-group">
                            <div className="dep-group-title">{g.title}</div>
                            {g.rows.map(([stat, effKey, blurb]) => {
                                const pts = Number(points[stat]) || 0;
                                const pct = Number(effects[effKey]) || 0;
                                return (
                                    <div key={stat} className={`dep-row${pts ? "" : " is-zero"}`}>
                                        <span className="dep-ico" aria-hidden="true">{DEPTH_META[stat]?.icon}</span>
                                        <span className="dep-name">{DEPTH_META[stat]?.label}</span>
                                        <span className="dep-pts">{pts ? `+${pts}` : "—"}</span>
                                        <span className="dep-eff">{pct ? `+${pct}% ${blurb}` : blurb}</span>
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                    {caps.length ? (
                        <div className="dep-caps">
                            {caps.map((c) => (
                                <div key={c.key} className={`dep-cap${c.spent ? " is-spent" : ""}`}>
                                    <b>{c.label}</b>
                                    <em>{c.desc}</em>
                                </div>
                            ))}
                        </div>
                    ) : null}
                </div>
            ) : null}

            <style jsx>{`
                .dep-panel { margin: 10px 0 12px; border-radius: 12px; overflow: hidden;
                    background: rgba(255,180,94,0.07); border: 1px solid rgba(255,180,94,0.28); }
                .dep-head { display: flex; align-items: center; gap: 8px; width: 100%; padding: 9px 12px;
                    background: transparent; border: 0; cursor: pointer; text-align: left; color: inherit; }
                .dep-title { flex: 1; font-size: 12.5px; font-weight: 900; color: #ffb45e; letter-spacing: .02em; }
                .dep-total { font-size: 11.5px; font-weight: 900; color: #ffd75e; font-variant-numeric: tabular-nums; }
                .dep-total.is-none { color: #8a8f96; font-weight: 700; }
                .dep-chev { font-size: 10px; color: #b08c5e; }
                .dep-body { padding: 2px 12px 11px; }
                .dep-empty { margin: 2px 0 10px; font-size: 11.5px; line-height: 1.45; color: #9aa2ab; }
                .dep-group { margin-top: 8px; }
                .dep-group-title { font-size: 9.5px; font-weight: 900; letter-spacing: .09em; text-transform: uppercase;
                    color: #b08c5e; margin-bottom: 3px; }
                .dep-row { display: grid; grid-template-columns: 18px 84px 34px 1fr; align-items: center; gap: 6px;
                    padding: 2px 0; font-size: 11.5px; }
                .dep-row.is-zero { opacity: 0.45; }
                .dep-ico { font-size: 12px; }
                .dep-name { font-weight: 800; color: #e8dccb; }
                .dep-pts { font-weight: 900; color: #ffd75e; font-variant-numeric: tabular-nums; text-align: right; }
                .dep-eff { color: #9aa2ab; }
                .dep-caps { margin-top: 10px; display: flex; flex-direction: column; gap: 6px; }
                .dep-cap { padding: 7px 9px; border-radius: 9px; background: rgba(255,215,94,0.12);
                    border: 1px solid rgba(255,215,94,0.4); }
                .dep-cap.is-spent { opacity: 0.55; }
                .dep-cap b { display: block; font-size: 11.5px; color: #ffe28a; }
                .dep-cap em { font-size: 10.5px; font-style: normal; color: #cdb894; }
            `}</style>
        </div>
    );
}
