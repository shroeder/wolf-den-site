"use client";

import { useState } from "react";

import { GROVE_NPCS } from "@/lib/marketplace/grove-npcs.js";

// ── HANDING A STEP IN, TO THE PERSON WHO ASKED FOR IT ───────────────────────────────────────────────────────
// Luke: "Needs to feel like an mmo where you turn in next to them, not a panel ui form game."
//
// Until now the Claim button lived on the quest PANEL, which meant the giver standing in zone 9 was
// decoration: you could finish her chain from anywhere on the map without ever walking back. The `!` over
// her head pointed at nothing. Every MMO worth the comparison makes the turn-in a place you stand, and that
// is the whole difference between a quest and a checklist row.
//
// So the panel is a tracker now — it says WHERE, which its own header comment always said was its real job —
// and this is where a step is actually handed over.
//
// ⚠️ SAME SHAPE AS THE MARSHAL'S CARD ON PURPOSE. Two people you walk up to and talk to should not be two
// different kinds of object; the .qd-* styles are shared so the Coliseum and the quest chain feel like one
// game. The difference is what they offer, not how they look.
export default function GroveGiver({ npcHere, busy = false, onClaim, onClose }) {
    const [note, setNote] = useState(null);
    const [sent, setSent] = useState(false);
    if (!npcHere) return null;

    const who = GROVE_NPCS.find((n) => n.id === npcHere.npc);
    const a = npcHere.active;
    const done = !a;

    // ⚠️ is-ready IS A CLASS BELOW, NOT AN INLINE-STYLE SNIFF. The gold "full" state was first written as
    // .qd-bar i[style*="width: 100%"] and silently never matched: React emits width:100% with NO space
    // after the colon, so a finished step kept a green bar and a grey label. Never ask CSS to parse a style
    // attribute it did not write — say the state out loud and key off that.
    async function handIn() {
        if (!a?.ready || sent) return;
        setSent(true);
        const r = await onClaim?.(a.id);
        // ⚠️ NAME WHAT CHANGED HANDS. The panel's version of this said "paid" and nothing else, back when
        // nothing was actually being paid. Standing in front of someone and having them say nothing is
        // worse here than it was there.
        setNote(r?.ok
            ? `${r.token ? "She presses a Coliseum token in with the rest." : "Paid."}`
            : (r?.error === "not_finished" ? "Not yet." : "She cannot take that right now."));
    }

    return (
        <div className="qd-scrim" role="dialog" aria-modal="true" aria-label={npcHere.name}>
            <button type="button" className="qd-dismiss" aria-label="Close" onClick={onClose} />
            <div className="qd-panel">
                <div className="qd-top">
                    <div className="qd-portrait">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/images/grove/npc-${npcHere.npc}.webp`} alt="" draggable={false} />
                    </div>
                    <div className="qd-id">
                        <b>{npcHere.name}</b>
                        <span>{who?.role || "Of the Grove"}</span>
                    </div>
                </div>

                {who?.line ? <p className="qd-say">&ldquo;{who.line}&rdquo;</p> : null}

                {done ? (
                    <div className="qd-block">
                        <span className="qd-label">Nothing more to ask</span>
                        <p>You have done everything they had. {npcHere.steps} of {npcHere.steps}.</p>
                    </div>
                ) : (
                    <div className={`qd-block${a.ready ? " is-ready" : ""}`}>
                        <span className="qd-label">{a.ready ? "Ready to hand in" : "What they asked for"}</span>
                        <p className="qd-task">{a.title}</p>
                        <p className="qd-ask">
                            {ASK[a.kind] || "Do"} {a.need > 1 ? a.need : ""}
                            {a.foe ? ` · ${a.foe.replace(/_/g, " ")}` : ""}
                            {a.part ? ` · ${a.part.replace(/_/g, " ")}` : ""}
                            {a.zone ? ` · zone ${a.zone}` : ""}
                        </p>
                        {/* The bar stays even when it is full — seeing 12/12 under your own hand is the
                            moment the walk back was for. */}
                        <span className="qd-bar" aria-hidden="true">
                            <i style={{ width: `${a.need > 0 ? Math.min(100, (100 * a.progress) / a.need) : 0}%` }} />
                        </span>
                        <span className="qd-count">{a.progress}/{a.need}</span>
                    </div>
                )}

                <p className="qd-chain">Step {Math.min(npcHere.done + 1, npcHere.steps)} of {npcHere.steps}</p>
                {note ? <p className="qd-note">{note}</p> : null}

                <div className="qd-acts">
                    {a?.ready ? (
                        <button type="button" className="qd-btn qd-accept" disabled={busy || sent} onClick={handIn}>
                            Hand it in
                        </button>
                    ) : null}
                    <button type="button" className="qd-walk" onClick={onClose}>
                        {a?.ready ? "Not yet" : "Leave them to it"}
                    </button>
                </div>
            </div>
        </div>
    );
}

const ASK = {
    cull: "Defeat", hunt: "Hunt", harvest: "Gather", forge: "Craft",
    delve: "Reach", survive: "Clear", ticket: "Reach wave",
};
