"use client";

import { useState } from "react";

import { GROVE_NPCS } from "@/lib/marketplace/grove-npcs.js";

// ── THE QUEST CARD ───────────────────────────────────────────────────────────────────────────────────────────
// Luke: "Let's remove all dialogue and systems its simply just the quest display."
//
// What stood here was a conversation. Five beats per step — a greeting, the problem in their own words, the
// ask, a QUEST RECEIVED plate centre-screen, a send-off that closed itself — metered out one typed line at a
// time by QuestSpeech, backed by 426 lines of authored dialogue across 71 steps. All of it is gone, with the
// typewriter, the plate, the send-off timers and the tap-to-advance.
//
// ⚠️ SO THE CARD IS A DISPLAY, AND ITS WHOLE JOB IS THE FOUR THINGS A PLAYER ASKS:
//
//   WHO       the face, the name, and how far through their chain you are
//   WHAT      the step's title, and the ask built from the step's own fields
//   WHERE     the place, named — never "the 6th chamber"
//   HOW FAR   a bar when `need` is a quantity, and whether you have been when it is a place
//
// ...and one button. Take it, hand it in, or walk away.
//
// ⚠️ THE SAME SHAPE AS THE QUEST LOG'S ROW, ON PURPOSE. The log and this card answer the same question in
// two places, and two layouts for one fact is how they drift apart. Same .qd-* classes as the marshal's
// card, still — two people you walk up to should not be two kinds of object.

const KIND_WORD = {
    cull: "Defeat", hunt: "Hunt", harvest: "Gather", forge: "Craft",
    delve: "Reach", survive: "Clear", ticket: "Reach wave",
};

/** The ask as a sentence, from the step's fields. There is no authored "ask" line any more. */
function askLine(a) {
    if (!a) return "";
    if (a.kind === "delve") return `Reach ${a.zoneName || "the far room"}`;
    if (a.kind === "survive") return `Clear ${a.zoneName || "it"} without leaving`;
    if (a.kind === "ticket") return `Reach wave ${a.wave} in the Coliseum`;
    const what = a.foeLabel || a.partLabel || null;
    const n = a.need > 1 ? ` ${a.need}` : "";
    const verb = KIND_WORD[a.kind] || "Do";
    return what ? `${verb}${n} ${what}` : `${verb}${n}`;
}

export default function GroveGiver({ npcHere, busy = false, onAccept, onClaim, onClose }) {
    const [note, setNote] = useState(null);

    const a = npcHere?.active || null;
    const who = GROVE_NPCS.find((n) => n.id === npcHere?.npc);
    const state = !a ? "spent" : !a.started ? "offered" : a.ready ? "ready" : "active";

    if (!npcHere) return null;

    const take = async () => {
        if (!a || busy) return;
        const ok = await onAccept?.(a.id);
        setNote(ok ? "Taken." : "They change their mind.");
    };
    const handIn = async () => {
        if (!a?.ready || busy) return;
        const r = await onClaim?.(a.id);
        if (!r?.ok) {
            // ⚠️ NAME WHAT WENT WRONG. A hand-in that fails and says nothing is the bug this line exists
            // to stop; it predates the dialogue and outlives it.
            setNote(r?.error === "not_finished" ? "Not yet." : "They cannot take that right now.");
            return;
        }
        setNote(["Handed in.",
            r.chest ? `A ${r.chest} chest went to your bag.` : null,
            r.token ? "And a Coliseum token." : null].filter(Boolean).join(" "));
    };

    const pct = a && a.need > 0 ? Math.min(100, (100 * a.progress) / a.need) : 0;

    return (
        /* ── ⚠️ THE SCENE UNDERNEATH IS LIVE, SO THE SCRIM HAS TO SWALLOW THE POINTER ──────────
            GroveScene's root carries onPointerDown={onTapWorld}, which sets the hero's moveTo. This
            card renders inside that subtree, so without this a tap on the card ALSO walked the hero —
            measured at 167.7px -> 168.6px across four taps. Luke hit the identical bug in the town:
            "When I tap to continue dialogue, my character moves in the background."

            ⚠️ ON THE SCRIM, NOT ON THE PANEL. The panel is only part of what is covered; a tap on the
            dimmed area either side of it reached the world just the same. */
        <div className="qd-scrim" role="dialog" aria-modal="true" aria-label={npcHere.name}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}>
            <button type="button" className="qd-dismiss" aria-label="Close" onClick={onClose} />
            <div className="qd-panel">
                <div className="qd-top">
                    <div className="qd-portrait">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/images/grove/npc-${npcHere.npc}.webp`} alt="" draggable={false} />
                    </div>
                    <div className="qd-id">
                        <b>{npcHere.name}</b>
                        <span>{who?.role || npcHere.role || "Of the Grove"}</span>
                    </div>
                    <span className="qd-steps">{npcHere.done}/{npcHere.steps}</span>
                </div>

                {a ? (
                    <div className={`qd-block${a.ready ? " is-ready" : ""}`}>
                        <span className="qd-label">
                            {state === "offered" ? "What they want" : a.ready ? "Ready to hand in" : "What they asked for"}
                        </span>
                        <p className="qd-task">{a.title}</p>
                        <p className="qd-ask">{askLine(a)}</p>

                        {/* ⚠️ NO BAR ON AN UNTAKEN STEP. A 0/37 under a job nobody has agreed to reads as
                            progress already lost — the oldest rule on this card, and the one the pip over
                            his head had to learn separately. */}
                        {state !== "offered" && a.counts ? (
                            <>
                                <span className="qd-bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></span>
                                <span className="qd-count">{a.progress}/{a.need}</span>
                            </>
                        ) : null}
                        {/* ⚠️ AND NO BAR AT ALL WHEN `need` IS A PLACE. A delve stores the zone index there,
                            so a gauge under it drew the same number twice and neither was a quantity. */}
                        {state !== "offered" && !a.counts ? (
                            <span className="qd-place">
                                {a.ready ? "You've been. Tell them." : `Go to ${a.zoneName || "the place they named"}`}
                            </span>
                        ) : null}
                        {state !== "offered" ? (
                            <span className="qd-step">Step {npcHere.step || npcHere.done + 1} of {npcHere.steps}</span>
                        ) : null}

                        {a.reward ? (
                            <span className="qd-pay">
                                Pays
                                {a.reward.gold ? ` ${a.reward.gold} gold` : ""}
                                {a.reward.xp ? `${a.reward.gold ? " ·" : ""} ${a.reward.xp} xp` : ""}
                                {a.reward.token ? " · a Coliseum token" : ""}
                            </span>
                        ) : null}
                    </div>
                ) : (
                    <div className="qd-block">
                        <span className="qd-label">Nothing more to ask</span>
                        <p>You have done everything they had. {npcHere.steps} of {npcHere.steps}.</p>
                    </div>
                )}

                {note ? <p className="qd-note">{note}</p> : null}

                <div className="qd-acts">
                    {state === "offered" ? (
                        <button type="button" className="qd-btn qd-accept" disabled={busy}
                            onClick={(e) => { e.stopPropagation(); take(); }}>
                            I&rsquo;ll do it
                        </button>
                    ) : null}
                    {state === "ready" ? (
                        <button type="button" className="qd-btn qd-accept" disabled={busy}
                            onClick={(e) => { e.stopPropagation(); handIn(); }}>
                            Hand it in
                        </button>
                    ) : null}
                    <button type="button" className="qd-walk" onClick={(e) => { e.stopPropagation(); onClose?.(); }}>
                        {state === "offered" ? "Not now" : state === "ready" ? "Not yet" : "Close"}
                    </button>
                </div>
            </div>
        </div>
    );
}
