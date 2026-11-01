"use client";

import { useMemo, useState } from "react";

import { chestsFor } from "@/lib/marketplace/grove-coliseum-plan.js";
import { GROVE_CHESTS } from "@/lib/marketplace/grove-forge.js";

// ── THE MARSHAL'S OFFER ─────────────────────────────────────────────────────────────────────────────────────
// Luke on the first version: "Just not good enough it doesnt feel like an mmo quest. Its too web forms."
//
// He was right, and the diagnosis is specific. It was a label-and-value panel: a 62px avatar beside a
// heading, a stats row, a three-row table of thresholds with right-aligned values, two stacked buttons.
// Every one of those is a settings-screen idiom. A quest dialogue is a different object:
//
//   · the PERSON is the biggest thing on it, framed, not an avatar next to a title
//   · he SPEAKS — prose in his own voice, as the body of the thing rather than a caption
//   · the job is stated the way a job is offered: what you do, then what you get
//   · the REWARD IS OBJECTS. Chests in slots you can look at, not "2 × Mossbound Cache" spelled out. The
//     art already existed — chest-mossbound/barrowed/warrenspun/heartwrought — and was going unused while
//     the card wrote the names in a table.
//   · you ACCEPT or you WALK AWAY. Not "Enter the Coliseum" / a greyed-out "No key".
//
// ⚠️ THE PRIZE SHOWN IS THE FULL CLEAR, with one honest line under it. The old card listed all three rungs
// as a table: accurate, unreadable, and the single most form-like thing on it. Before spending a token a
// player needs the prize worth chasing and to be told plainly that falling short pays less.
export default function GroveMarshal({ coliseum, busy = false, onTakeKey, onEnter, onClose }) {
    const [note, setNote] = useState(null);
    const { marshal, keys = 0, dailyReady, bestWave = 0, map } = coliseum || {};

    // ⚠️ FROM chestsFor, the function the settle actually pays out of. A hand-written list here would be a
    // second description of the rules, and the one that goes stale. [[reuse-the-rule-never-restate-it]]
    const prize = useMemo(() => {
        const full = chestsFor({ map, wavesCleared: 4, totalWaves: 4, cleared: true });
        const by = new Map();
        for (const id of full) by.set(id, (by.get(id) || 0) + 1);
        return [...by].map(([id, n]) => ({ id, n, name: GROVE_CHESTS[id]?.name || id }));
    }, [map]);

    if (!marshal) return null;

    async function takeKey() {
        setNote(null);
        const ok = await onTakeKey?.();
        setNote(ok === false ? "You already took your token today." : "He presses a token into your hand.");
    }

    const canEnter = keys > 0;

    return (
        <div className="qd-scrim" role="dialog" aria-modal="true" aria-label={marshal.name}>
            <button type="button" className="qd-dismiss" aria-label="Close" onClick={onClose} />
            <div className="qd-panel">
                <div className="qd-top">
                    <div className="qd-portrait">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/images/grove/npc-${marshal.id}.webp`} alt="" draggable={false} />
                    </div>
                    <div className="qd-id">
                        <b>{marshal.name}</b>
                        <span>Coliseum Marshal</span>
                    </div>
                </div>

                {/* He speaks, and it is the body of the thing rather than a caption under a heading. */}
                <p className="qd-say">&ldquo;{marshal.line}&rdquo;</p>

                <div className="qd-block">
                    <span className="qd-label">The run</span>
                    <p>Wave after wave, two minutes on the clock. Last as long as you can &mdash; or clear the lot.</p>
                </div>

                <div className="qd-block">
                    <span className="qd-label">He pays</span>
                    <div className="qd-loot">
                        {prize.map((p) => (
                            <div key={p.id} className="qd-slot" title={p.name}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={`/images/grove/chest-${p.id}.webp`} alt={p.name} draggable={false} />
                                {p.n > 1 ? <span className="qd-n">{p.n}</span> : null}
                            </div>
                        ))}
                    </div>
                    <p className="qd-fine">For clearing it inside the clock. Fall short and he pays less.</p>
                </div>

                {bestWave > 0 ? <p className="qd-record">Your best here &mdash; <b>wave {bestWave}</b></p> : null}
                {note ? <p className="qd-note">{note}</p> : null}

                <div className="qd-acts">
                    {/* ⚠️ THE TOKEN FIRST WHEN ONE IS OWED. Stepping inside spends one, so an accept that
                        quietly skipped the free token would charge somebody for what they were already due. */}
                    {dailyReady ? (
                        <button type="button" className="qd-btn qd-second" disabled={busy} onClick={takeKey}>
                            Take your token
                        </button>
                    ) : null}
                    <button type="button" className="qd-btn qd-accept" disabled={busy || !canEnter}
                        onClick={() => onEnter?.()}>
                        {canEnter ? "Step inside" : "You have no token"}
                    </button>
                    <button type="button" className="qd-walk" onClick={onClose}>Walk away</button>
                </div>
            </div>
        </div>
    );
}
