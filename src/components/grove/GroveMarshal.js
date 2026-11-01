"use client";

import { useMemo, useState } from "react";

import { chestsFor } from "@/lib/marketplace/grove-coliseum-plan.js";
import { GROVE_CHESTS } from "@/lib/marketplace/grove-forge.js";

// ── TALKING TO THE MARSHAL ──────────────────────────────────────────────────────────────────────────────────
// Luke, asked what interacting with the NPC looked like: it looked like nothing. Tapping him either claimed
// the daily key with no acknowledgement at all — the only visible change was a pip disappearing — or spent a
// key and dropped you into a two-minute timed fight with no confirmation. His written line was shown nowhere.
//
// ⚠️ THE CARD IS THE POINT, NOT THE BUTTONS. A person standing outside a building has something to say, and
// the whole reason to put him in the world rather than in a menu was that a menu could not say it. So the
// line leads, and the two things you can do sit under it where a choice belongs.
//
// ⚠️ AND IT IS A CHOICE, NOT A TOLL BOOTH. "Take today's key" and "Enter" are separate buttons that do
// exactly what they say. The old single handler decided for you — free key first, otherwise spend one — which
// is the correct ORDER and the wrong shape: a tap that silently spends currency is a tap people stop making.
export default function GroveMarshal({ coliseum, busy = false, onTakeKey, onEnter, onClose }) {
    const [note, setNote] = useState(null);

    // ⚠️ DESTRUCTURE AND MEMOISE BEFORE ANY EARLY RETURN. The guard used to sit on the line above and the
    // useMemo below it, which is a conditionally-called hook — React throws the moment the component renders
    // once with a marshal and once without. Hooks first, bail after.
    const { marshal, keys = 0, dailyReady, bestWave = 0, zone, map } = coliseum || {};

    // ── ⚠️ WHAT YOU WIN, BEFORE YOU SPEND THE KEY ───────────────────────────────────────────────────
    // The card used to say "Two minutes. Waves until the clock runs out" and nothing else, so a player was
    // asked to spend a scarce daily key on an unstated reward. Nobody does that twice.
    //
    // Read from chestsFor, the same function the settle actually pays out of — a hand-written list here
    // would be a second description of the rules, and the one that goes stale. [[reuse-the-rule-never-restate-it]]
    const rungs = useMemo(() => {
        const name = (id) => GROVE_CHESTS[id]?.name || id;
        const at = (n, cleared) => chestsFor({ map, wavesCleared: n, totalWaves: 4, cleared });
        const tally = (list) => {
            const by = new Map();
            for (const id of list) by.set(id, (by.get(id) || 0) + 1);
            return [...by].map(([id, n]) => (n > 1 ? `${n} × ${name(id)}` : name(id))).join(" + ");
        };
        return [
            { when: "A quarter in", pays: tally(at(1, false)) },
            { when: "Three quarters", pays: tally(at(3, false)) },
            { when: "Cleared, inside the clock", pays: tally(at(4, true)), best: true },
        ].filter((r) => r.pays);
    }, [map]);

    if (!marshal) return null;

    async function takeKey() {
        setNote(null);
        const ok = await onTakeKey?.();
        // ⚠️ SAY SOMETHING EITHER WAY. The silent version of this is the bug being fixed; a failed claim that
        // also says nothing is the same bug with a different cause.
        setNote(ok === false ? "You already took today's key." : "The marshal hands you a key.");
    }

    return (
        <div className="gm-scrim" role="dialog" aria-modal="true" aria-label={marshal.name}>
            {/* The scrim closes it. A world card with no way out but a small X is a trap on a phone. */}
            <button type="button" className="gm-dismiss" aria-label="Close" onClick={onClose} />
            <div className="gm-card">
                <div className="gm-head">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="gm-face" src={`/images/grove/npc-${marshal.id}.webp`} alt="" draggable={false} />
                    <div className="gm-who">
                        <b>{marshal.name}</b>
                        <span>Coliseum{zone ? ` · zone ${zone}` : ""}</span>
                    </div>
                </div>

                <p className="gm-line">{marshal.line}</p>

                <div className="gm-stats">
                    <div><b>{keys}</b><span>key{keys === 1 ? "" : "s"}</span></div>
                    {/* Only once there is one. A row of zeroes on a first visit reads as a locked feature. */}
                    {bestWave > 0 ? <div><b>{bestWave}</b><span>best wave</span></div> : null}
                </div>

                {note ? <p className="gm-note">{note}</p> : null}

                <div className="gm-pays">
                    <span className="gm-pays-head">What it pays</span>
                    {rungs.map((r) => (
                        <div key={r.when} className={`gm-rung${r.best ? " is-best" : ""}`}>
                            <span>{r.when}</span><b>{r.pays}</b>
                        </div>
                    ))}
                </div>

                <div className="gm-acts">
                    {dailyReady ? (
                        <button type="button" className="gm-btn gm-take" disabled={busy} onClick={takeKey}>
                            Take today&rsquo;s key
                        </button>
                    ) : null}
                    <button type="button" className="gm-btn gm-enter" disabled={busy || keys < 1}
                        onClick={() => onEnter?.()}>
                        {keys < 1 ? "No key" : "Enter the Coliseum"}
                    </button>
                </div>

                <p className="gm-fine">Two minutes. Waves until the clock runs out.</p>
            </div>
        </div>
    );
}
