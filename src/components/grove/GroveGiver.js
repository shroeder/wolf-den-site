"use client";

import { useCallback, useEffect, useState } from "react";

import QuestSpeech from "@/components/QuestSpeech";

import { GROVE_NPCS } from "@/lib/marketplace/grove-npcs.js";

// ── TALKING TO THE PERSON WHO ASKED ─────────────────────────────────────────────────────────────────────────
// Luke: "Needs to feel like an mmo where you turn in next to them, not a panel ui form game." And later, on
// the quests themselves: "I was hoping for like dialogue where they tell you about the problem they're having
// and then the solution, and then you get the quest and there's like a big thing in the middle saying like
// quest received."
//
// The first half was already done — the Claim button used to live on the quest PANEL, which made the giver
// standing in zone 9 decoration: you could finish her chain from anywhere on the map without ever walking
// back. The panel became a tracker that says WHERE, and this became the place a step is handed over.
//
// This is the second half. What stood here was a portrait, ONE line of flavour reused for every step of a
// five-step chain, and the ask rendered as "Defeat 37 · urchin_roller · zone 44" — a form with a face on it.
// Now each step has its own four beats (grove-npc-dialogue.js, 426 lines across 71 steps) and the
// conversation runs:
//
//   1. the greeting        who they are and that they have something
//   2. the problem         why they are asking, this time, naming the real creature
//   3. the ask             the job as a card, with what it pays
//   4. QUEST RECEIVED      the plate, centre screen
//   5. their send-off      one line, then it closes itself
//
// Come back mid-step and you get the nudge over a bar. Come back finished and you get the payoff lines, then
// QUEST COMPLETE and what changed hands.
//
// ⚠️ ONE LINE AT A TIME. A whole step's dialogue on screen at once is a paragraph, and a paragraph is a thing
// people skim past to find the button. Metering it by tap is what makes the ask land as a sentence somebody
// said. Same decision, and the same component shape, as the town's QuestDialogue.
//
// ⚠️ SAME .qd-* STYLES AS THE MARSHAL'S CARD, still. Two people you walk up to and talk to should not be two
// different kinds of object; the difference is what they offer, not how they look.

export default function GroveGiver({ npcHere, busy = false, onAccept, onClaim, onClose }) {
    const [i, setI] = useState(0);
    const [typed, setTyped] = useState(false);
    const [plate, setPlate] = useState(null);       // null | "received" | "complete"
    const [sendoff, setSendoff] = useState(false);
    const [note, setNote] = useState(null);

    const a = npcHere?.active || null;
    const who = GROVE_NPCS.find((n) => n.id === npcHere?.npc);
    const state = !a ? "spent" : !a.started ? "offered" : a.ready ? "ready" : "active";

    // ── ⚠️ A CONVERSATION YOU HAVE ALREADY HAD IS NOT A CONVERSATION ────────────────────────────────
    // Luke: "Interacting with an npc you have a quest for should simply show the quest progress with
    // them. I dont want to see their dialogue if I already saw it."
    //
    // Two of the four states are NEW writing and worth metering out a line at a time — the problem he is
    // asking you to solve, and the payoff when you bring it back. The middle state is not: you took the
    // job, you are doing the job, and walking past him should answer "how far along am I" in one look.
    // It was costing two taps through a greeting and a nudge you had both read before.
    //
    // So an ACTIVE step opens straight on the card. His nudge still appears, as a line UNDER the
    // progress rather than a gate in front of it, because the one-liner is the bit with the character
    // in it and it costs nothing to read.
    const say = a?.say || {};
    const open = state === "active";
    const lines = open ? [] : [npcHere?.greet || who?.line].filter(Boolean);
    if (state === "offered") lines.push(...(say.problem || []));
    if (state === "ready") lines.push(...(say.done || []));

    const last = i >= lines.length - 1;
    // Whether the job itself is on screen yet: immediately when there is nothing to read, otherwise once
    // the last line has finished typing.
    const shown = open || (last && typed);
    const advance = useCallback(() => {
        if (!typed) { setTyped(true); return; }
        if (!last) { setI((n) => n + 1); setTyped(false); }
    }, [typed, last]);

    useEffect(() => {
        if (!plate) return undefined;
        const t = setTimeout(() => { setPlate(null); setSendoff(true); }, 1900);
        return () => clearTimeout(t);
    }, [plate]);
    useEffect(() => {
        if (!sendoff) return undefined;
        const t = setTimeout(() => onClose?.(), 2600);
        return () => clearTimeout(t);
    }, [sendoff, onClose]);

    if (!npcHere) return null;

    const take = async () => {
        if (!a || busy) return;
        const ok = await onAccept?.(a.id);
        if (!ok) { setNote("They change their mind."); return; }
        setPlate("received");
    };
    const handIn = async () => {
        if (!a?.ready || busy) return;
        const r = await onClaim?.(a.id);
        if (!r?.ok) {
            // ⚠️ NAME WHAT WENT WRONG. The old version of this said "paid" and nothing else; standing in
            // front of somebody who says nothing is worse here than it was on a panel.
            setNote(r?.error === "not_finished" ? "Not yet." : "They cannot take that right now.");
            return;
        }
        setNote(r.token ? "They press a Coliseum token in with the rest." : null);
        setPlate("complete");
    };

    const pct = a && a.need > 0 ? Math.min(100, (100 * a.progress) / a.need) : 0;

    return (
        /* ── ⚠️ THE SCENE UNDERNEATH IS LIVE, SO THE SCRIM HAS TO SWALLOW THE POINTER ──────────
            GroveScene's root carries onPointerDown={onTapWorld}, which sets the hero's moveTo. This
            card renders inside that subtree, so without this every tap to advance dialogue ALSO walked
            the hero — measured at 167.7px -> 168.6px across four taps. Luke hit the identical bug in
            the town: "When I tap to continue dialogue, my character moves in the background."

            ⚠️ ON THE SCRIM, NOT ON THE PANEL. The panel is only part of what is covered; a tap on the
           dimmed area either side of it reached the world just the same. */
        <div className="qd-scrim" role="dialog" aria-modal="true" aria-label={npcHere.name}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}>
            <button type="button" className="qd-dismiss" aria-label="Close" onClick={onClose} />
            <div className="qd-panel" onClick={() => { if (!plate && !sendoff) advance(); }}>
                <div className="qd-top">
                    <div className="qd-portrait">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/images/grove/npc-${npcHere.npc}.webp`} alt="" draggable={false} />
                    </div>
                    <div className="qd-id">
                        <b>{npcHere.name}</b>
                        <span>{who?.role || "Of the Grove"}</span>
                    </div>
                    <span className="qd-steps">{npcHere.done}/{npcHere.steps}</span>
                </div>

                {/* ⚠️ THE KEY IS THE LINE, AND `complete` IS THE PARENT'S OWN FLAG. Both matter — see
                    the note in QuestSpeech. The old version keyed partly on `typed`, so finishing a
                    line remounted the typewriter and it started again. */}
                {sendoff
                    ? <QuestSpeech key="sendoff" text={npcHere.sendoff} />
                    : open ? null : (
                        <QuestSpeech
                            key={`${state}-${i}`}
                            text={lines[i]}
                            complete={typed}
                            onComplete={() => setTyped(true)}
                        />
                    )}

                {/* ── THE ASK ──────────────────────────────────────────────────────────────────────────
                    Only once the talking is done, so the job is the last thing on screen when the
                    player decides. The ask is their SENTENCE now, not "Defeat 37 · urchin_roller". */}
                {!sendoff && shown && a ? (
                    <div className={`qd-block${a.ready ? " is-ready" : ""}`}>
                        <span className="qd-label">
                            {state === "offered" ? "What they want" : a.ready ? "Ready to hand in" : "What they asked for"}
                        </span>
                        <p className="qd-task">{a.title}</p>
                        <p className="qd-ask">&ldquo;{say.ask}&rdquo;</p>
                        {/* ⚠️ NO BAR ON AN UNTAKEN STEP. A 0/37 under a job nobody has agreed to reads as
                            progress already lost, and it was the thing that made the old card feel like
                            a form: the counter existed before the conversation did. */}
                        {/* ⚠️ A BAR IS ONLY HONEST WHEN `need` IS A QUANTITY. On a delve it is the
                            ZONE INDEX, so this drew "0/6" directly under "go to the 6th chamber" -- the
                            same number twice, and neither of them a thing you can collect. Luke: "I don't
                            understand what go to the sixth chamber means." Those steps say where to go and
                            whether you have been, which is all there is to say about them. */}
                        {state !== "offered" && !a.counts ? (
                            <span className="qd-place">
                                {a.ready ? "You've been. Tell them." : `Go to ${a.zoneName || "the place they named"}`}
                            </span>
                        ) : null}
                        {state !== "offered" && a.counts ? (
                            <>
                                <span className="qd-bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></span>
                                <span className="qd-count">{a.progress}/{a.need}</span>
                                {/* Which link of the chain this is, so a five-step chain reads as one. */}
                                <span className="qd-step">Step {npcHere.step || npcHere.done + 1} of {npcHere.steps}</span>
                            </>
                        ) : null}
                        {/* His one line, UNDER the bar on a step already in hand — see the note above the
                            `open` flag. It is the bit with the character in it; it is just no longer a gate. */}
                        {open && say.nudge ? <p className="qd-nudge">&ldquo;{say.nudge}&rdquo;</p> : null}
                    </div>
                ) : null}

                {!a && shown ? (
                    <div className="qd-block">
                        <span className="qd-label">Nothing more to ask</span>
                        <p>You have done everything they had. {npcHere.steps} of {npcHere.steps}.</p>
                    </div>
                ) : null}

                {note ? <p className="qd-note">{note}</p> : null}

                <div className="qd-acts">
                    {/* ⚠️ `state === "offered"` IS `!a.started`, AND THAT NOW MEANS SOMETHING. Luke: "When
                        I tall to the npc after already having their quest I can re accept it which is
                        wrong." The gate was always right — what was wrong is that the payload behind it
                        was written once on entering the zone and never updated, so `started` stayed false
                        for the whole visit and this button came back every time. Fixed where it broke, in
                        GroveClient's refreshBoard. */}
                    {!sendoff && shown && state === "offered" ? (
                        <button type="button" className="qd-btn qd-accept" disabled={busy} onClick={(e) => { e.stopPropagation(); take(); }}>
                            I&rsquo;ll do it
                        </button>
                    ) : null}
                    {!sendoff && shown && state === "ready" ? (
                        <button type="button" className="qd-btn qd-accept" disabled={busy} onClick={(e) => { e.stopPropagation(); handIn(); }}>
                            Hand it in
                        </button>
                    ) : null}
                    {!sendoff ? (
                        <button type="button" className="qd-walk" onClick={(e) => { e.stopPropagation(); onClose?.(); }}>
                            {state === "offered" ? "Not now" : state === "ready" ? "Not yet" : "Leave them to it"}
                        </button>
                    ) : null}
                </div>

                {!sendoff && !shown ? <span className="qd-more" aria-hidden="true">tap</span> : null}
            </div>

            {plate ? (
                <div className="qd-plate" role="status">
                    <div className="qd-plate-in">
                        <b>{plate === "received" ? "QUEST RECEIVED" : "QUEST COMPLETE"}</b>
                        <span>{a?.title}</span>
                        {plate === "complete" && a?.reward ? (
                            <em>
                                {a.reward.gold ? `${a.reward.gold} gold` : null}
                                {a.reward.xp ? ` · ${a.reward.xp} xp` : null}
                                {a.reward.token ? " · a Coliseum token" : null}
                            </em>
                        ) : null}
                    </div>
                </div>
            ) : null}
        </div>
    );
}
