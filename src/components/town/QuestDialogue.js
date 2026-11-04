"use client";

import { useCallback, useEffect, useMemo, useState } from "react";


import { PERK_SYSTEM } from "@/lib/marketplace/acts.js";

// ── THE QUEST CARD IN A GROVE TOWN ───────────────────────────────────────────────────────────────────────────
// Luke: "I don't want no dialogie in grove town npcs."
//
// This was a five-beat conversation: a hail, the problem in the giver's own register, the ask, a QUEST
// RECEIVED plate centre-screen, and a send-off that closed the sheet itself — typed out a line at a time and
// remembered per step in localStorage so no beat ever played twice. All of it is gone, with the typewriter,
// both timers and the tap-to-advance.
//
// What is left is the card: who is asking, how far through the act you are, the rung's own title and ask,
// a bar, and one button.
//
// ⚠️ GROVE TOWNS ONLY — THE DEFAULT STREET DOES NOT COME THROUGH HERE. Luke: "There is a difference
// between grove towns and the default town, which we shouldn't touch." The quest giver in TownClient
// branches on `town`:
//
//     onClick={() => { if (town) { openActBoard(); } else { setQuestOpen(true); } }}
//
// A Grove town takes the first branch and lands in this component; the ungated street takes the second and
// opens the older quest panel, which is untouched. That branch is the whole of the separation, so anything
// added here must stay behind it.
//
// ⚠️ SAME .qd-* CLASSES AS THE GROVE'S OWN CARD, still. Two people you walk up to should not be two
// kinds of object, and that was true when both had dialogue and is true now that neither does.

export default function QuestDialogue({ board, portrait, busy, onAccept, onClaim, onClose }) {
    // ⚠️ WHAT THE CARD SAYS AFTER YOU PRESS SOMETHING. The plate and the send-off said it with a
    // full-screen moment and two timers; this is one line in the card.
    const [note, setNote] = useState(null);

    const focus = useMemo(
        () => (board?.rungs || []).find((r) => r.key === board?.focusKey) || null,
        [board],
    );
    const state = focus?.state || (board?.done ? "finished" : null);

    // ⚠️ "EACH BEAT IS SAID ONCE" LIVED HERE, with a localStorage key per step so a line you had
    // already read never played again. Luke: "You s[houldn't] have to go through an npc dialogue every
    // time. Its annoying." That fix is now moot in the only way that fully solves it — there is no beat
    // left to remember, so there is nothing to skip and no key to keep.

    const take = async () => {
        const ok = await onAccept?.(focus.key);
        if (ok === false) return;
        setNote("Taken.");
    };
    const turnIn = async () => {
        const ok = await onClaim?.(focus.key);
        if (ok === false) return;
        setNote("Handed in.");
    };

    if (!board) {
        return (
            <div className="qd-wrap" role="dialog" aria-label="Quest">
                <div className="qd-panel"><p className="qd-line">&hellip;</p></div>
                <style>{QD_CSS}</style>
            </div>
        );
    }

    const ladder = board.rungs || [];
    const claimedN = ladder.filter((r) => r.state === "claimed").length;

    return (
        <div className="qd-wrap" role="dialog" aria-label={`${board.giver || "Quest"}`} onClick={onClose}>
            <div className="qd-panel" onClick={(e) => e.stopPropagation()}>
                <button type="button" className="qd-x" onClick={(e) => { e.stopPropagation(); onClose?.(); }} aria-label="Close">✕</button>

                <div className="qd-who">
                    {portrait ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className="qd-face" src={portrait} alt="" draggable={false} />
                    ) : null}
                    <div className="qd-name">
                        <b>{board.giver || "Quest Giver"}</b>
                        <i>{board.name}</i>
                    </div>
                    {/* Where you are in the act, always visible. Awareness is half of what was missing. */}
                    <span className="qd-prog" aria-label={`${claimedN} of ${ladder.length} done`}>{claimedN}/{ladder.length}</span>
                </div>

                {note ? <p className="qd-line">{note}</p> : null}

                {/* ── THE JOB ─────────────────────────────────────────────────────────────────────────
                    This used to wait for the talking to finish, so the job was the last thing on screen
                    when the player decided. There is no talking now, so it is simply the card. */}
                {focus ? (
                    <div className={`qd-card is-${state}`}>
                        <div className="qd-card-top">
                            <b>{focus.title}</b>
                            {focus.perk ? <i>+{focus.perk.pct}% {PERK_SYSTEM[focus.perk.slot] || focus.perk.slot}</i> : null}
                        </div>
                        {/* ⚠️ THE ASK IS STILL THE STEP'S OWN SENTENCE, because the act board authors
                            one per rung and it is the job, not narration. What went is everything AROUND
                            it. */}
                        <p className="qd-ask">{focus.say?.ask}</p>
                        {state !== "offered" ? (
                            <>
                                <div className="qd-bar"><span style={{ width: `${Math.round((focus.have / focus.need) * 100)}%` }} /></div>
                                <div className="qd-count">{focus.have} / {focus.need}</div>
                            </>
                        ) : null}
                        <div className="qd-acts">
                            {state === "offered" ? (
                                <button type="button" className="qd-go" disabled={busy} onClick={(e) => { e.stopPropagation(); take(); }}>
                                    {busy ? "…" : "I'll do it"}
                                </button>
                            ) : state === "ready" ? (
                                <button type="button" className="qd-go" disabled={busy} onClick={(e) => { e.stopPropagation(); turnIn(); }}>
                                    {busy ? "…" : "Hand it in"}
                                </button>
                            ) : (
                                <button type="button" className="qd-later" onClick={(e) => { e.stopPropagation(); onClose?.(); }}>On my way</button>
                            )}
                        </div>
                    </div>
                ) : null}

                {/* ── ⚠️ NO SECOND QUEST BOARD UNDER THE CONVERSATION ──────────────────────────
                    Luke: "its odd that they have another quest board under an[y]thing else going on. I
                    dont think they should have another flat quest board. Just a chain of quests."

                    What stood here was the rest of the ladder as a list — every later rung, with the
                    locked ones drawn as "— — —". The whole point of replacing the bounty board was that
                    a list cannot want anything; posting the same list underneath the person asking put
                    the board straight back, just smaller and in worse company.

                    A chain does not need to show its links. How far along you are is already on the
                    header as {claimed}/{total}, and the next rung arrives the way the first one did:
                    somebody asks you for it. */}
                {/* ── ⚠️ NO SECOND QUEST BOARD BEHIND THIS PERSON ─────────────────────────────
                    Luke: "its odd that they have another quest board under 'anything else going on'. I
                    dont think they should have another flat quest board. Just a chain of quests."

                    What stood here was "Anything else going?" — one line in the giver's voice that
                    opened the OLD sheet: the daily bounties and the Grove hunts, as a list with Claim
                    buttons. It was demoted rather than deleted when the conversation replaced the board,
                    on the grounds that a feature with no door left in the building is a mistake this
                    repo has made before. But it is still a flat quest board, and hanging it off the back
                    of the one person who was supposed to replace it is the worst place for it to be: ask
                    a man for work and get a spreadsheet.

                    ⚠️ AND IT STRANDS NOTHING, which is the only reason this can go. The dailies keep
                    their own door and a better one — GameNav carries a "Quests" entry with a badge for
                    how many are ready to claim, and PlayHub and the pets screen both link it too. The
                    door this removes was the fourth, not the only.

                    A quest giver offers a chain. That is all he offers. */}
            </div>

            {/* ⚠️ THE QUEST RECEIVED PLATE STOOD HERE, centre screen, over everything. It was the beat
                Luke asked for by name in August, and it goes with the rest of the conversation. The card
                says "Taken." now, which is the same fact without the ceremony. */}
            <style>{QD_CSS}</style>
        </div>
    );
}

// ⚠️ A PLAIN <style>, like TownClient's own TOWN_CSS, rather than styled-jsx. Four of this repo's styled-jsx
// scars are in memory and every one of them is a rule that silently applied to nothing; a plain tag with a
// template string cannot do that. ⚠️ AND NO BACKTICKS IN THESE COMMENTS — that breaks the build.
const QD_CSS = `
.qd-wrap { position: fixed; inset: 0; z-index: 1400; display: grid; place-items: center;
    background: rgba(6,4,10,0.78); backdrop-filter: blur(3px); padding: 16px; }
.qd-panel { position: relative; width: min(560px, 100%); max-height: 86vh; overflow-y: auto; cursor: pointer;
    background: linear-gradient(180deg, #1d1710, #130e0a); border: 1px solid rgba(255,215,110,0.28);
    border-radius: 16px; padding: 16px 16px 18px; box-shadow: 0 18px 50px rgba(0,0,0,0.65); }
.qd-x { position: absolute; top: 8px; right: 8px; width: 30px; height: 30px; border-radius: 999px;
    border: 1px solid rgba(255,255,255,0.14); background: rgba(255,255,255,0.05); color: #e8dcc6; cursor: pointer; }
.qd-who { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; padding-right: 34px; }
.qd-face { width: 64px; height: 64px; object-fit: contain; flex: 0 0 64px;
    filter: drop-shadow(0 3px 6px rgba(0,0,0,0.6)); }
.qd-name { display: flex; flex-direction: column; min-width: 0; }
.qd-name b { color: #ffd75e; font-size: 1rem; }
.qd-name i { color: #a99f88; font-size: 0.74rem; font-style: normal; }
.qd-prog { margin-left: auto; font-size: 0.72rem; font-weight: 800; color: #a99f88; }
/* ⚠️ THE PLATE'S RULES WENT WITH THE PLATE. A rule for a shape that no longer exists is how a later
   element with a reused class name inherits a look nobody meant it to have.
   [[stale-css-rule-on-reshape]] */
.qd-line { margin: 0 0 10px; color: #f2ead9; font-size: 0.96rem; line-height: 1.5; min-height: 2.9em; }
.qd-caret { display: inline-block; width: 7px; height: 1em; margin-left: 2px; vertical-align: -2px;
    background: rgba(255,215,110,0.7); animation: qdBlink 1s steps(1) infinite; }
@keyframes qdBlink { 50% { opacity: 0; } }
.qd-more { position: absolute; right: 14px; bottom: 10px; font-size: 0.68rem; color: #7d7465;
    animation: qdNudge 1.4s ease-in-out infinite; }
@keyframes qdNudge { 50% { transform: translateX(3px); opacity: 0.5; } }

.qd-card { border: 1px solid rgba(255,215,110,0.3); border-radius: 12px; padding: 11px 12px;
    background: rgba(255,215,110,0.06); animation: qdRise .28s ease both; }
@keyframes qdRise { from { opacity: 0; transform: translateY(8px); } }
.qd-card-top { display: flex; align-items: baseline; gap: 8px; }
.qd-card-top b { color: #f3ecda; font-size: 0.95rem; }
.qd-card-top i { margin-left: auto; font-style: normal; font-size: 0.74rem; font-weight: 800; color: #8fe39a; }
.qd-ask { margin: 6px 0 8px; color: #cfc3ad; font-size: 0.86rem; font-style: italic; line-height: 1.45; }
.qd-bar { height: 8px; border-radius: 999px; background: rgba(255,255,255,0.1); overflow: hidden; }
.qd-bar span { display: block; height: 100%; border-radius: 999px; transition: width .5s ease;
    background: linear-gradient(90deg,#ffd75e,#f3b23a); }
.qd-count { margin-top: 4px; font-size: 0.74rem; color: #a99f88; text-align: right; }
.qd-acts { display: flex; gap: 8px; margin-top: 10px; }
.qd-go { flex: 1 1 auto; padding: 10px 14px; border: none; border-radius: 10px; cursor: pointer;
    font-weight: 800; font-size: 0.9rem; color: #2a1a06; background: linear-gradient(180deg,#ffe488,#f3b23a); }
.qd-go:disabled { opacity: .55; cursor: default; }
.qd-later { flex: 0 0 auto; padding: 10px 14px; border-radius: 10px; cursor: pointer;
    border: 1px solid rgba(255,255,255,0.16); background: transparent; color: #cfc3ad; font-weight: 700; }

/* .qd-odd's rules went with its markup. [[stale-css-rule-on-reshape]] */
/* The ladder's rules went with its markup — a rule left behind for a deleted element is what
   restyles the next thing to take the class name. [[stale-css-rule-on-reshape]] */
/* ⚠️ THE PLATE'S RULES WENT WITH THE PLATE — .qd-plate, .qd-plate-in and the qdPlate keyframe. A rule for
   a shape that no longer exists is how a later element with a reused class name inherits a look nobody
   meant it to have. [[stale-css-rule-on-reshape]] */
@media (prefers-reduced-motion: reduce) { .qd-card { animation: none; } }
`;
