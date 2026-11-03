"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import QuestSpeech from "@/components/QuestSpeech";

import { PERK_SYSTEM } from "@/lib/marketplace/acts.js";

// ── A PERSON ASKING YOU FOR SOMETHING ────────────────────────────────────────────────────────────────────────
// Luke: "why did you elect to use a bounty board? I thought we were going to use NPCs for all of this... I was
// hoping for like dialogue where they tell you about the problem they're having and then the solution, and
// then you get the quest and there's like a big thing in the middle saying like quest received."
//
// What this replaces was an ordered list with Claim buttons down the side. Everything about the ladder was
// already right — one rung open at a time, one-time, paying passive perks rather than gold — and none of it
// READ as a quest, because a list cannot want anything.
//
// The beats, in order, and each one is a tap:
//
//   1. the hail            they notice you
//   2. the problem         1-2 lines. Why they are asking, in their own register.
//   3. the ask             the job, as a card: title, what it needs, what it pays.
//   4. QUEST RECEIVED      the plate, centre screen, over everything.
//   5. their send-off      one line, and the sheet closes itself.
//
// Come back mid-job and you get the nudge and a progress bar. Come back finished and you get the payoff
// lines, then QUEST COMPLETE and the perk.
//
// ⚠️ ONE LINE AT A TIME, AND TAPPING IS THE WHOLE INTERACTION. The first draft put all of a rung's dialogue
// on screen together, which is a paragraph — and a paragraph is a thing you skim and dismiss. Metering it
// makes the player set the pace, and it is the only reason the ask lands as a sentence somebody said rather
// than as a row in a table.

export default function QuestDialogue({ board, portrait, busy, onAccept, onClaim, onOddJobs, onClose }) {
    // Which beat we are on. `i` walks the current state's line list; `card` is the ask; `plate` is the moment.
    const [i, setI] = useState(0);
    const [typed, setTyped] = useState(false);
    const [plate, setPlate] = useState(null);     // null | "received" | "complete"
    const [sendoff, setSendoff] = useState(false);

    const focus = useMemo(
        () => (board?.rungs || []).find((r) => r.key === board?.focusKey) || null,
        [board],
    );
    const state = focus?.state || (board?.done ? "finished" : null);

    // ── ⚠️ EACH BEAT IS SAID ONCE, NOT EVERY TIME YOU WALK PAST ────────────────────────────────────
    // Luke: "You s[houldn't] have to go through an npc dialogue every time. Its annoying."
    //
    // He is right, and the first version got this exactly backwards. Dialogue is worth tapping through
    // the first time a person tells you something, and it is an obstacle every time after that — and the
    // most common visit to a quest giver is not the first, it is walking back mid-job to check a number
    // or hand a thing in. Metering a line you have already read is just a door you have to open twice.
    //
    // So a beat is keyed by WHICH STEP and WHICH STATE, and heard once it is never played again: come
    // back to an active job and the card is simply there. The conversation still happens in full every
    // time it has something NEW to say — a new rung, or a job that has just turned ready — which is the
    // half of it that was always the point.
    const stepKey = focus ? `wd-quest-heard:${board?.townId || board?.giver || "town"}:${focus.key}:${state}` : null;
    const [heard, setHeard] = useState(false);
    useEffect(() => {
        if (!stepKey) { setHeard(false); return; }
        let was = false;
        try { was = window.localStorage.getItem(stepKey) === "1"; } catch { was = false; }
        setHeard(was);
        // Reset the walk-through whenever the beat changes, or a remembered step would open mid-line.
        setI(0);
        setTyped(was);
    }, [stepKey]);

    // The lines for this visit, in order: the hail, then whatever the state has to say.
    const lines = useMemo(() => {
        if (!board || heard) return [];
        const say = focus?.say || {};
        const out = [board.hail].filter(Boolean);
        if (state === "offered") out.push(...(say.problem || []));
        if (state === "active") out.push(say.nudge);
        if (state === "ready") out.push(...(say.done || []));
        return out.filter(Boolean);
    }, [board, focus, state, heard]);

    // Remembered the moment the last line is on screen, so a player who closes the sheet early is not made
    // to sit through it again — they already read it.
    useEffect(() => {
        if (!stepKey || heard) return;
        if (i >= lines.length - 1 && typed) {
            try { window.localStorage.setItem(stepKey, "1"); } catch { /* private mode: it just repeats */ }
        }
    }, [stepKey, heard, i, lines.length, typed]);

    const last = i >= lines.length - 1;
    const advance = useCallback(() => {
        if (!typed) { setTyped(true); return; }          // first tap finishes the line
        if (!last) { setI((n) => n + 1); setTyped(false); }
    }, [typed, last]);

    // ⚠️ THE PLATE IS THE POINT, so it gets its own beat rather than being a toast beside the button. It
    // covers the sheet, it cannot be missed, and it is the thing Luke asked for by name.
    const take = async () => {
        const ok = await onAccept?.(focus.key);
        if (ok === false) return;
        setPlate("received");
    };
    const turnIn = async () => {
        const ok = await onClaim?.(focus.key);
        if (ok === false) return;
        setPlate("complete");
    };
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
            <div className="qd-panel" onClick={(e) => { e.stopPropagation(); if (!plate && !sendoff) advance(); }}>
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

                {/* ⚠️ KEYED ON THE LINE ONLY. This keyed on `typed` as well, so the moment a line
                    finished the whole typewriter remounted and retyped it — on top of the callback-in-
                    deps loop described in QuestSpeech. (The text prop was also `typed ? lines[i] :
                    lines[i]`, which is the same thing twice and did nothing.) */}
                {sendoff ? (
                    <QuestSpeech key="sendoff" text={board.accepted} className="qd-line" />
                ) : (
                    <QuestSpeech
                        key={`${state}-${i}`}
                        text={lines[i]}
                        complete={typed}
                        onComplete={() => setTyped(true)}
                        className="qd-line"
                    />
                )}

                {/* ── THE ASK, AS A CARD ───────────────────────────────────────────────────────────────
                    It appears only once the talking is finished, so the job is the LAST thing on screen
                    when the player decides. A card that is up from the first line is a form with a story
                    above it. */}
                {!sendoff && last && typed && focus ? (
                    <div className={`qd-card is-${state}`}>
                        <div className="qd-card-top">
                            <b>{focus.title}</b>
                            {focus.perk ? <i>+{focus.perk.pct}% {PERK_SYSTEM[focus.perk.slot] || focus.perk.slot}</i> : null}
                        </div>
                        <p className="qd-ask">&ldquo;{focus.say?.ask}&rdquo;</p>
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
                {/* ── ⚠️ THE DAILIES ARE STILL HERE, AND THEY ARE NOT THE POINT ANY MORE ──────────
                    Luke on the old sheet: "this one big modal with a bunch of irrelevant rewards,
                    it's all gold." It is demoted rather than deleted, for two reasons. The Grove
                    HUNTS live in the same sheet and are genuinely tied to the forest; and a feature
                    with no door left in the building is the mistake this repo has made twice in one
                    day. One line, under the conversation, in his voice rather than as a tab. */}
                {!sendoff && last && typed && onOddJobs ? (
                    <button type="button" className="qd-odd" onClick={(e) => { e.stopPropagation(); onOddJobs(); }}>
                        &ldquo;Anything else going?&rdquo;
                    </button>
                ) : null}

                {!sendoff && !(last && typed) ? <span className="qd-more" aria-hidden="true">tap</span> : null}
            </div>

            {/* ── THE MOMENT ───────────────────────────────────────────────────────────────────────────── */}
            {plate ? (
                <div className="qd-plate" role="status">
                    <div className="qd-plate-in">
                        <b>{plate === "received" ? "QUEST RECEIVED" : "QUEST COMPLETE"}</b>
                        <span>{focus?.title}</span>
                        {plate === "complete" && focus?.perk ? (
                            <em>+{focus.perk.pct}% {PERK_SYSTEM[focus.perk.slot] || focus.perk.slot}</em>
                        ) : null}
                    </div>
                </div>
            ) : null}
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

.qd-odd { display: block; width: 100%; margin-top: 10px; padding: 8px; border-radius: 10px; cursor: pointer;
    border: 1px dashed rgba(255,255,255,0.18); background: transparent; color: #a99f88;
    font-size: 0.8rem; font-style: italic; }
.qd-odd:hover { color: #cfc3ad; border-color: rgba(255,255,255,0.3); }
/* The ladder's rules went with its markup — a rule left behind for a deleted element is what
   restyles the next thing to take the class name. [[stale-css-rule-on-reshape]] */

.qd-plate { position: fixed; inset: 0; z-index: 1500; display: grid; place-items: center; pointer-events: none; }
.qd-plate-in { text-align: center; padding: 18px 30px; border-radius: 14px;
    background: linear-gradient(180deg, rgba(32,24,12,0.97), rgba(18,13,8,0.97));
    border: 1px solid rgba(255,215,110,0.55); box-shadow: 0 0 60px rgba(255,200,80,0.35), 0 20px 60px rgba(0,0,0,0.7);
    animation: qdPlate .5s cubic-bezier(.2,1.4,.4,1) both; }
.qd-plate-in b { display: block; font-size: 1.25rem; letter-spacing: 3px; color: #ffd75e; }
.qd-plate-in span { display: block; margin-top: 4px; font-size: 0.92rem; color: #f2ead9; }
.qd-plate-in em { display: block; margin-top: 8px; font-size: 0.86rem; font-style: normal; font-weight: 800; color: #8fe39a; }
@keyframes qdPlate { from { opacity: 0; transform: scale(.82); } }
@media (prefers-reduced-motion: reduce) { .qd-plate-in, .qd-card { animation: none; } }
`;
