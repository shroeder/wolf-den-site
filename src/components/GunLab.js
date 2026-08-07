"use client";

import { useMemo, useState } from "react";

import { FLEET } from "@/lib/marketplace/fleet.js";
import { fleetDeck, boatDeck, BOAT_DECK } from "@/lib/marketplace/deck-lines.js";
import { GUN_PORTS, gunPortsFor } from "@/lib/marketplace/gun-ports.js";

// ── THE GUN PLACEMENT TOOL ───────────────────────────────────────────────────────────────────────────────────
// Every gun a ship owns is drawn on its deck now, and no two hulls put their gun deck in the same place — a
// sloop has one open well, a man-o'-war has three tiers of ports. Guessing those coordinates from a screenshot
// is exactly the loop that wasted a morning on the crew's deck line, so this is the tool instead: click the
// hull where a gun belongs, drag nothing, and copy the table out.
//
// It edits NOTHING at runtime. It prints the object you paste into gun-ports.js, so the data stays in source
// where it can be reviewed, and a bad afternoon of clicking cannot reach anybody.

const BOAT_TIERS = Object.keys(BOAT_DECK).map(Number);

export default function GunLab() {
    const [artKey, setArtKey] = useState(FLEET[0].art);
    const [draft, setDraft] = useState(() => ({ ...GUN_PORTS }));
    const [showFallback, setShowFallback] = useState(true);

    const isBoat = artKey.startsWith("boat:");
    const tier = isBoat ? Number(artKey.slice(5)) : null;
    const src = isBoat ? `/images/sailing/boat-tier${tier}-${["wood", "cutter", "brig", "schooner", "galleon", "manowar", "arcane", "dragon", "ghost", "leviathan", "celestial"][tier - 1]}.png`
        : `/images/fleet/${artKey}.png`;
    const deck = isBoat ? boatDeck(tier) : fleetDeck(artKey);
    const placed = draft[artKey] || [];
    // What the game would actually draw right now — hand-placed if there are any, the even spread if not.
    const effective = useMemo(
        () => (placed.length ? placed : (showFallback ? gunPortsFor(artKey, deck, 8) : [])),
        [placed, showFallback, artKey, deck]
    );

    const add = (e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const x = Math.round(((e.clientX - r.left) / r.width) * 1000) / 1000;
        const y = Math.round(((e.clientY - r.top) / r.height) * 1000) / 1000;
        setDraft((d) => ({ ...d, [artKey]: [...(d[artKey] || []), { x, y }] }));
    };
    const removeAt = (i) => setDraft((d) => ({ ...d, [artKey]: (d[artKey] || []).filter((_, j) => j !== i) }));
    const clear = () => setDraft((d) => { const n = { ...d }; delete n[artKey]; return n; });

    // Only hulls you actually placed something on — pasting back a table full of empty arrays would bury the
    // fallback for every ship you did not touch.
    const json = useMemo(() => {
        const out = {};
        for (const [k, v] of Object.entries(draft)) if (v?.length) out[k] = v;
        return `export const GUN_PORTS = ${JSON.stringify(out, null, 4)};`;
    }, [draft]);

    return (
        <div className="stack">
            <section className="card">
                <h1 style={{ margin: 0, fontSize: "1.25rem" }}>Gun placement</h1>
                <p className="muted" style={{ margin: "4px 0 10px", fontSize: "0.85rem", lineHeight: 1.5 }}>
                    Click the hull where a cannon belongs — order matters, the first ones you place are the ones a
                    low-gun ship shows. Click a marker to remove it. Nothing here saves; copy the table at the
                    bottom into <code>src/lib/marketplace/gun-ports.js</code>.
                </p>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
                    {FLEET.map((f) => (
                        <button key={f.art} type="button" className={`sby-mini${artKey === f.art ? " is-load" : ""}`}
                            onClick={() => setArtKey(f.art)} title={f.name}>
                            {f.rank}{f.boss ? "★" : ""}
                        </button>
                    ))}
                </div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {BOAT_TIERS.map((t) => (
                        <button key={t} type="button" className={`sby-mini${artKey === `boat:${t}` ? " is-load" : ""}`}
                            onClick={() => setArtKey(`boat:${t}`)}>yours {t}</button>
                    ))}
                </div>
            </section>

            <section className="card">
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                    <b style={{ fontSize: "0.95rem" }}>{artKey}</b>
                    <span className="muted" style={{ fontSize: "0.78rem" }}>deck {deck}% · {placed.length} placed</span>
                    <button type="button" className="sby-mini" onClick={clear} style={{ marginLeft: "auto" }}>Clear this hull</button>
                    <button type="button" className="sby-mini" onClick={() => setShowFallback((v) => !v)}>
                        {showFallback ? "Hide" : "Show"} fallback
                    </button>
                </div>
                {/* The hull at a workable size with a deck-line guide, because "on the deck" is the thing you are
                    actually aiming for and it is invisible otherwise. */}
                <div style={{ position: "relative", width: "100%", maxWidth: 520, margin: "0 auto", aspectRatio: "1", background: "radial-gradient(70% 70% at 50% 75%, rgba(70,140,190,0.25), rgba(4,12,20,0.6))", borderRadius: 14, cursor: "crosshair" }}
                    onClick={add}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" draggable="false" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none" }} />
                    <span style={{ position: "absolute", left: 0, right: 0, top: `${100 - deck}%`, height: 1, background: "rgba(255,215,94,0.55)", pointerEvents: "none" }} />
                    {effective.map((g, i) => (
                        <button key={i} type="button" title={`${g.x}, ${g.y} — click to remove`}
                            onClick={(e) => { e.stopPropagation(); if (placed.length) removeAt(i); }}
                            style={{ position: "absolute", left: `${g.x * 100}%`, top: `${g.y * 100}%`, width: 26, height: 18,
                                transform: "translate(-50%, -70%)", border: placed.length ? "1px solid #ffd75e" : "1px dashed rgba(255,255,255,0.4)",
                                borderRadius: 4, background: `url("/images/sailing/deck-cannon.png") center/contain no-repeat`,
                                cursor: placed.length ? "pointer" : "crosshair", padding: 0 }} />
                    ))}
                </div>
            </section>

            <section className="card">
                <b style={{ fontSize: "0.9rem" }}>Paste into gun-ports.js</b>
                <textarea readOnly value={json} rows={12}
                    style={{ width: "100%", marginTop: 8, fontFamily: "ui-monospace, monospace", fontSize: 12, background: "rgba(0,0,0,0.4)", color: "#cdd3d8", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: 10 }} />
                <button type="button" className="sail-cta" style={{ marginTop: 8 }}
                    onClick={() => { try { navigator.clipboard.writeText(json); } catch { /* no clipboard */ } }}>
                    Copy
                </button>
            </section>
        </div>
    );
}
