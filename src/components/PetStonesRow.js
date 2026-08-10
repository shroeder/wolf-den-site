"use client";

import { useState } from "react";

// ── THE STONES YOU ARE HOLDING ───────────────────────────────────────────────────────────────────────────────
// Sits at the top of the pets page. Before this there was nowhere in the game to SEE a stone: the count only
// appeared inside the enshrine panel of a pet that had already reached level six, which is weeks away from when
// you find your first one. So the rarest item in the game existed only as a number you could not look at.
//
// It answers the three questions in order, because they are the order you ask them in:
//   WHAT HAVE I GOT      the two counts, with the stones drawn
//   WHAT IS IT FOR       one line each, and they are not comparable by arithmetic on purpose
//   WHAT DO I DO NOW     which of YOUR pets is ready, or how far the closest one has to go
//
// That last part is the one that matters. A currency with no visible use is a mystery, and the answer here is
// specific to you: either a name you can tap, or an honest "nothing yet, and here is what's closest".
const META = {
    light: {
        name: "Lightstone", color: "#ffe08a", art: "/images/pets/stone-light.png",
        line: "Keeps a pet's ability forever and brightens the whole pack — every pet you own gives more of its passive.",
        best: "Worth more the more pets you own.",
    },
    dark: {
        name: "Darkstone", color: "#b061ff", art: "/images/pets/stone-dark.png",
        line: "Keeps a pet's ability forever and raises it to 150% — the strongest a pet ability gets.",
        best: "Worth more the better the ability.",
    },
};

export default function PetStonesRow({ stones, prices, ready = [], closest = null, enshrined = [], onPick }) {
    const [open, setOpen] = useState(null);
    const held = { light: Number(stones?.light) || 0, dark: Number(stones?.dark) || 0 };
    const any = held.light > 0 || held.dark > 0;

    // Nothing held and nothing enshrined: this is a member who has never met a stone, and a panel explaining an
    // item they do not have is clutter on the page they visit most. It appears when it becomes relevant.
    if (!any && !enshrined.length) return null;

    return (
        <div className="pstr">
            <div className="pstr-head">
                <b className="pstr-h">Stones</b>
                {enshrined.length ? <span className="pstr-count">{enshrined.length} pet{enshrined.length === 1 ? "" : "s"} enshrined</span> : null}
            </div>

            <div className="pstr-row">
                {["light", "dark"].map((id) => {
                    const m = META[id];
                    return (
                        <button key={id} type="button" style={{ "--stone": m.color }}
                            className={`pstr-card${held[id] ? "" : " is-empty"}${open === id ? " is-open" : ""}`}
                            onClick={() => setOpen(open === id ? null : id)}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img className="pstr-art" src={m.art} alt="" draggable="false" />
                            <span className="pstr-n">{held[id]}</span>
                            <span className="pstr-name">{m.name}</span>
                        </button>
                    );
                })}
            </div>

            {open ? (
                <div className="pstr-detail" style={{ "--stone": META[open].color }}>
                    <p className="pstr-line">{META[open].line}</p>
                    <em className="pstr-best">{META[open].best}</em>

                    {/* WHAT DO I DO NOW. Named pets you can tap, or the honest distance to the nearest one. */}
                    {ready.length ? (
                        <div className="pstr-ready">
                            <span className="pstr-ready-h">Ready to enshrine</span>
                            <div className="pstr-ready-list">
                                {ready.map((p) => (
                                    <button key={p.id} type="button" className="pstr-pet" onClick={() => onPick?.(p.id)}>
                                        {p.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : closest ? (
                        <p className="pstr-closest">
                            No pet is at level six yet. Closest is <b>{closest.name}</b> — {closest.pct}% of the way
                            there. Only your <em>equipped</em> pet earns, so it has to be the one you carry.
                        </p>
                    ) : (
                        <p className="pstr-closest">
                            Take one pet all the way to level six and a stone makes its ability permanent.
                        </p>
                    )}

                    {!held[open] ? (
                        <p className="pstr-get">
                            None in hand. They turn up in a deep seam, on a dig, off a boss kill and in the
                            dungeons — or the Quartermaster takes {(prices?.doubloons || 900).toLocaleString()} doubloons
                            and the Armoury {(prices?.laurels || 6000).toLocaleString()} laurels.
                        </p>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
