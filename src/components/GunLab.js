"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { ENCOUNTERS } from "@/lib/marketplace/encounters.js";
import { FLEET } from "@/lib/marketplace/fleet.js";
import { fleetDeck, boatDeck, BOAT_DECK } from "@/lib/marketplace/deck-lines.js";
import { GUN_PORTS, gunPortsFor } from "@/lib/marketplace/gun-ports.js";

// ── THE GUN PLACEMENT TOOL ───────────────────────────────────────────────────────────────────────────────────
// Every gun a ship owns is drawn on its deck, and no two hulls put their gun deck in the same place — a sloop
// has one open well, a man-o'-war has three tiers of ports. Guessing those coordinates from a screenshot is
// exactly the loop that wasted a morning on the crew's deck line, so this is the tool instead: tap the hull
// where a gun belongs, tap a marker to remove it, Save.
//
// It SAVES now, to mkt_gun_port, and the battle reads that first. It used to only print a table to paste into
// gun-ports.js, which was fine while it was a dev tool on localhost and useless the moment the person doing
// the placing was holding a phone. The copy box is still here, because settled values belong in source where
// they can be reviewed and where they survive a wiped table — save to work, promote when happy.

const BOAT_TIERS = Object.keys(BOAT_DECK).map(Number);
const BOAT_ART = ["wood", "cutter", "brig", "schooner", "galleon", "manowar", "arcane", "dragon", "ghost", "leviathan", "celestial"];

export default function GunLab() {
    const [artKey, setArtKey] = useState(FLEET[0].art);
    const [draft, setDraft] = useState(() => ({ ...GUN_PORTS }));
    const [showFallback, setShowFallback] = useState(true);
    // How many guns to preview. A hull is placed once and then serves every gun count, so the thing you are
    // really deciding is where barrels one through N sit — and the only way to see that is to change N.
    // Defaults to the CAP: place the full battery first and the smaller counts are just its opening subset.
    const [preview, setPreview] = useState(7);
    // ── WHICH WAY IS IT FACING ───────────────────────────────────────────────────────────────────────────
    // The lab drew every hull in its raw orientation, and the hulls do not agree: your boats face one way and
    // several encounter ships face the other. So you place a battery along what looks like the near rail and
    // it comes out on the far side in the fight. The flip is a VIEW — it never changes what is stored, it
    // just shows the hull the way the battle will draw it so you can aim at the right rail.
    const [flip, setFlip] = useState(false);
    const [status, setStatus] = useState("");
    const [busy, setBusy] = useState(false);
    const [loaded, setLoaded] = useState(false);

    // Saved placements win over the source table on load, so reopening the lab shows the work you did last time
    // rather than silently reverting to whatever was last promoted into gun-ports.js.
    useEffect(() => {
        let alive = true;
        fetch("/api/marketplace/gun-ports")
            .then((r) => (r.ok ? r.json() : null))
            .then((j) => { if (alive && j?.saved) setDraft((d) => ({ ...d, ...j.saved })); })
            .catch(() => {})
            .finally(() => { if (alive) setLoaded(true); });
        return () => { alive = false; };
    }, []);

    const isBoat = artKey.startsWith("boat:");
    const isEnc = artKey.startsWith("enc:");
    const tier = isBoat ? Number(artKey.slice(5)) : null;
    const src = isBoat ? `/images/sailing/boat-tier${tier}-${BOAT_ART[tier - 1]}.png`
        : isEnc ? `/images/sailing/enc/${artKey.slice(4)}.png`
        : `/images/fleet/${artKey}.png`;
    // Encounter hulls have no measured deck line of their own; 42% is what the battle already assumes for
    // them, so the fallback spread the lab draws underneath matches what the fight would draw.
    const deck = isBoat ? boatDeck(tier) : isEnc ? 42 : fleetDeck(artKey);
    const placed = useMemo(() => draft[artKey] || [], [draft, artKey]);
    // What the game would actually draw right now — hand-placed if there are any, the even spread if not.
    const effective = useMemo(
        () => (placed.length ? placed.slice(0, preview) : (showFallback ? gunPortsFor(artKey, deck, preview) : [])),
        [placed, showFallback, artKey, deck, preview]
    );

    const add = (e) => {
        const r = e.currentTarget.getBoundingClientRect();
        // STORED IN ART SPACE, ALWAYS. The flip is a view; if a tap while flipped were saved as-is, every
        // placement made in that mode would come out mirrored in the fight — which is the exact bug the flip
        // exists to help you avoid, reintroduced by the tool meant to prevent it.
        const raw = Math.round(((e.clientX - r.left) / r.width) * 1000) / 1000;
        const x = flip ? Math.round((1 - raw) * 1000) / 1000 : raw;
        const y = Math.round(((e.clientY - r.top) / r.height) * 1000) / 1000;
        setDraft((d) => ({ ...d, [artKey]: [...(d[artKey] || []), { x, y }] }));
        setStatus("");
    };
    const removeAt = (i) => { setDraft((d) => ({ ...d, [artKey]: (d[artKey] || []).filter((_, j) => j !== i) })); setStatus(""); };
    const clear = () => { setDraft((d) => { const n = { ...d }; delete n[artKey]; return n; }); setStatus(""); };

    const save = useCallback(async () => {
        setBusy(true);
        setStatus("Saving…");
        try {
            const res = await fetch("/api/marketplace/gun-ports", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ art: artKey, ports: placed }),
            });
            const j = await res.json().catch(() => ({}));
            // An empty save is a real edit — it puts the hull back on the even spread — so say which happened.
            setStatus(res.ok ? (j.cleared ? "Cleared — back to the even spread." : `Saved ${j.ports?.length ?? placed.length} port(s). Live now.`) : `Failed: ${j.error || res.status}`);
        } catch {
            setStatus("Failed — no connection.");
        } finally {
            setBusy(false);
        }
    }, [artKey, placed]);

    // Only hulls you actually placed something on — pasting back a table full of empty arrays would bury the
    // fallback for every ship you did not touch.
    const json = useMemo(() => {
        const out = {};
        for (const [k, v] of Object.entries(draft)) if (v?.length) out[k] = v;
        return `export const GUN_PORTS = ${JSON.stringify(out, null, 4)};`;
    }, [draft]);

    const doneCount = Object.values(draft).filter((v) => v?.length).length;
    // Encounter ships count too. Adding ten hulls to the picker without adding them here left the readout
    // saying "23 of 26" while there were 36 to place — a progress number that stops counting part of its own
    // job is worse than no number, because it reads as finished.
    const ENC_SHIPS = ENCOUNTERS.filter((e) => e.kind === "ship");
    const total = FLEET.length + BOAT_TIERS.length + ENC_SHIPS.length;

    return (
        <div className="stack">
            <section className="card">
                <h1 style={{ margin: 0, fontSize: "1.25rem" }}>Gun placement</h1>
                <p className="muted" style={{ margin: "4px 0 10px", fontSize: "0.85rem", lineHeight: 1.5 }}>
                    Tap the hull where a cannon belongs — order matters, the first ones you place are the ones a
                    low-gun ship shows. Tap a marker to remove it. <b>Save</b> writes it live for everyone.
                </p>
                <div className="muted" style={{ fontSize: "0.8rem", marginBottom: 8 }}>
                    {loaded ? <><b style={{ color: doneCount ? "#7ce8a4" : undefined }}>{doneCount}</b> of {total} hulls placed — the rest use the even spread.</> : "Loading saved placements…"}
                </div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
                    {FLEET.map((f) => (
                        <button key={f.art} type="button" className={`sby-mini${artKey === f.art ? " is-load" : ""}`}
                            onClick={() => { setArtKey(f.art); setStatus(""); }} title={f.name}
                            style={draft[f.art]?.length ? { borderColor: "#7ce8a4", color: "#7ce8a4" } : undefined}>
                            {f.rank}{f.boss ? "★" : ""}
                        </button>
                    ))}
                </div>
                {/* ── ENCOUNTER SHIPS ── the ones you meet mid-voyage. They were absent from this picker
                    entirely, which is half of why their guns look wrong: nobody could place them. Monsters
                    are excluded — a kraken has limbs, not a gun deck (see monster-parts.js). */}
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {ENC_SHIPS.map((e) => (
                        <button key={e.id} type="button" className={`sby-mini${artKey === `enc:${e.id}` ? " is-load" : ""}`}
                            onClick={() => { setArtKey(`enc:${e.id}`); setStatus(""); }} title={e.name}
                            style={draft[`enc:${e.id}`]?.length ? { borderColor: "#7ce8a4", color: "#7ce8a4" } : undefined}>
                            {e.name.split(" ").pop()}
                        </button>
                    ))}
                </div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {BOAT_TIERS.map((t) => (
                        <button key={t} type="button" className={`sby-mini${artKey === `boat:${t}` ? " is-load" : ""}`}
                            onClick={() => { setArtKey(`boat:${t}`); setStatus(""); }}
                            style={draft[`boat:${t}`]?.length ? { borderColor: "#7ce8a4", color: "#7ce8a4" } : undefined}>
                            yours {t}
                        </button>
                    ))}
                </div>
            </section>

            <section className="card">
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                    <b style={{ fontSize: "0.95rem" }}>{artKey}</b>
                    <span className="muted" style={{ fontSize: "0.78rem" }}>deck {deck}% · {placed.length} placed</span>
                    <button type="button" className="sby-mini" onClick={clear} style={{ marginLeft: "auto" }}>Clear</button>
                    <button type="button" className="sby-mini" onClick={() => setShowFallback((v) => !v)}>
                        {showFallback ? "Hide" : "Show"} fallback
                    </button>
                    <button type="button" className={`sby-mini${flip ? " is-load" : ""}`} onClick={() => setFlip((v) => !v)}
                        title="Show the hull the way the battle draws it. A view only — placements are stored unflipped.">
                        {flip ? "Flipped" : "Flip view"}
                    </button>
                </div>
                {/* Preview count. Ships carry 1 to 13 guns off the Cannons track, and a battery that looks right
                    at six can look absurd at one — the lone starting gun is the one most members will ever see. */}
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
                    <span className="muted" style={{ fontSize: "0.78rem" }}>preview guns</span>
                    {/* Seven is the cap on a PLAYER's boat (COMBAT_TRACKS.guns.max is 6, plus the free one) —
                        and the enemy is not bound by it: the Dread Corsair and the Drowned Admiral both field
                        NINE. Stopping at seven meant their last two barrels could not be previewed or placed,
                        which is two guns firing at you from wherever the fallback happened to put them. */}
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                        <button key={n} type="button" className={`sby-mini${preview === n ? " is-load" : ""}`} onClick={() => setPreview(n)}>{n}</button>
                    ))}
                </div>
                {/* The hull at a workable size with a deck-line guide, because "on the deck" is the thing you are
                    actually aiming for and it is invisible otherwise. */}
                <div style={{ position: "relative", width: "100%", maxWidth: 520, margin: "0 auto", aspectRatio: "1", background: "radial-gradient(70% 70% at 50% 75%, rgba(70,140,190,0.25), rgba(4,12,20,0.6))", borderRadius: 14, cursor: "crosshair", touchAction: "manipulation" }}
                    onClick={add}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" draggable="false" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none", transform: flip ? "scaleX(-1)" : "none" }} />
                    <span style={{ position: "absolute", left: 0, right: 0, top: `${100 - deck}%`, height: 1, background: "rgba(255,215,94,0.55)", pointerEvents: "none" }} />
                    {effective.map((g, i) => (
                        <button key={i} type="button" title={`${g.x}, ${g.y} — tap to remove`}
                            onClick={(e) => { e.stopPropagation(); if (placed.length) removeAt(i); }}
                            style={{ position: "absolute", left: `${(flip ? 1 - g.x : g.x) * 100}%`, top: `${g.y * 100}%`, width: 34, height: 24,
                                border: placed.length ? "1px solid #ffd75e" : "1px dashed rgba(255,255,255,0.4)",
                                borderRadius: 4, background: `url("/images/sailing/deck-cannon.png") center/contain no-repeat`,
                                // FLEET HULLS FACE LEFT (fleet.js draws them that way on purpose — the enemy
                                // stands on the right of the battle stage) and the battle mirrors their guns
                                // to match. The lab did not, so you were placing right-facing cannons along a
                                // left-facing ship: the preview disagreed with the thing it is previewing,
                                // which makes judging a position almost impossible.
                                transform: isBoat ? "translate(-50%, -70%)" : "translate(-50%, -70%) scaleX(-1)",
                                cursor: placed.length ? "pointer" : "crosshair", padding: 0 }} />
                    ))}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
                    <button type="button" className="sail-cta" onClick={save} disabled={busy || !loaded}>
                        {busy ? "Saving…" : "Save this hull"}
                    </button>
                    {status ? <span className="muted" style={{ fontSize: "0.8rem" }}>{status}</span> : null}
                </div>
            </section>

            <section className="card">
                <b style={{ fontSize: "0.9rem" }}>Promote to source (optional)</b>
                <p className="muted" style={{ margin: "4px 0 8px", fontSize: "0.8rem", lineHeight: 1.5 }}>
                    Saving is enough — this is only for pasting settled placements into
                    {" "}<code>src/lib/marketplace/gun-ports.js</code> so they survive independently of the table.
                </p>
                <textarea readOnly value={json} rows={10}
                    style={{ width: "100%", fontFamily: "ui-monospace, monospace", fontSize: 12, background: "rgba(0,0,0,0.4)", color: "#cdd3d8", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: 10 }} />
                <button type="button" className="sby-mini" style={{ marginTop: 8 }}
                    onClick={() => { try { navigator.clipboard.writeText(json); setStatus("Copied."); } catch { /* no clipboard */ } }}>
                    Copy
                </button>
            </section>
        </div>
    );
}
