"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import useScrollLock from "@/lib/useScrollLock";
import { claimLaunchCard, releaseLaunchCard } from "@/lib/marketplace/launch-modals.js";

// ── THE MEMBER SURVEY ────────────────────────────────────────────────────────────────────────────────────────
// Four questions: which system you like most, which you want MORE of, whether you want something you
// actively play rather than check on, and anything you want built. Telemetry already says
// what gets USED — this is the only way to learn what people would drop, which is a different question and the
// more useful one.
//
// Whether to ask is decided by the SERVER (one row per member), not by localStorage, so answering on your phone
// doesn't ask you again on your laptop. The dismiss marker is local, though: "not right now" is a per-device
// mood, and someone who closes it should still be able to answer later from another session.
//
// Deliberately steps rather than one long form. A single screen with twelve radio buttons twice over reads as
// homework; one question at a time with a progress line reads as thirty seconds.
// Bumped with the round. "Not right now" was an answer to being asked in AUGUST about round 1 — it must not
// silence a member for every survey the Den ever runs. A new round is a new ask, including for the people who
// waved the last one away.
const SNOOZE_KEY = "wolfden-survey-snooze-v3";
// Launch announcements that must be seen and dismissed before the survey may appear.
// EVERY launch card currently mounted in GameNav, not just the newest — the rule is "never stack on top of an
// announcement", and a member who has seen the dungeon card but not the mining one still has a modal waiting.
// If a launch component is retired from the nav its key must come OUT of this list, or the survey waits
// forever on a card that can no longer be shown.
const LAUNCH_KEYS = [
    "wolfden-mining-announce-v2",
    "wolfden-dungeons-announce-v1",
    "wolfden-fishing-announce-v1",
    "wolfden-forge-announce-v1",
];

function Portal({ children }) {
    const [el] = useState(() => (typeof document === "undefined" ? null : document.createElement("div")));
    useEffect(() => {
        if (!el) return undefined;
        document.body.appendChild(el);
        return () => { document.body.removeChild(el); };
    }, [el]);
    if (!el) return null;
    return createPortal(children, el);
}

export default function SurveyModal() {
    const [systems, setSystems] = useState(null);
    const [paceOpts, setPaceOpts] = useState([]);
    const [step, setStep] = useState(0);          // 0 favourite · 1 more · 2 pace · 3 wish · 4 thanks
    const [favorite, setFavorite] = useState(null);
    const [more, setMore] = useState(null);
    const [pace, setPace] = useState(null);
    const [wish, setWish] = useState("");
    const [busy, setBusy] = useState(false);
    const open = Boolean(systems);
    useScrollLock(open);

    useEffect(() => {
        let alive = true;
        let snoozed = false;
        try {
            snoozed = Boolean(localStorage.getItem(SNOOZE_KEY));
            // Never stack on top of a launch announcement. Two modals fighting for the same screen is worse
            // than either one, and "rate the systems" landing before someone has even opened the newest one is
            // a survey answered without the information. Wait until the launch card has been dismissed.
            for (const k of LAUNCH_KEYS) if (!localStorage.getItem(k)) snoozed = true;
        } catch { /* private mode — just don't ask */ }
        if (snoozed) return undefined;
        // ⚠️ AND NOT IF SOMETHING ELSE IS ALREADY ASKING. The poll uses the same claim, so whichever
        // resolves first gets the screen and the other waits for the next visit.
        if (!claimLaunchCard(SNOOZE_KEY)) return undefined;
        fetch("/api/marketplace/survey", { cache: "no-store", credentials: "same-origin" })
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => { if (alive && d?.ask && d.systems?.length) { setSystems(d.systems); setPaceOpts(d.pace || []); } })
            .catch(() => { /* never let a survey break a page */ });
        return () => { alive = false; releaseLaunchCard(SNOOZE_KEY); };
    }, []);

    const close = () => {
        try { localStorage.setItem(SNOOZE_KEY, "1"); } catch { /* ignore */ }
        setSystems(null);
    };

    const [paid, setPaid] = useState(false);
    const submit = async (finalWish) => {
        setBusy(true);
        const res = await fetch("/api/marketplace/survey", {
            method: "POST", credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ favorite, more, pace, wish: finalWish ?? wish }),
        }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
        // Only claimed when the server says it actually granted one — a member who is answering a second
        // time has already been paid, and promising them a chest they will not find is worse than silence.
        setPaid(Boolean(res?.chest));
        setBusy(false);
        setStep(4);
    };

    if (!open) return null;

    // ── THE THIRD ONE IS WHY THE ROUND EXISTS ───────────────────────────────────────────────────────────
    // The first two are about the Den as it stands. The third asks what KIND of thing people want to spend
    // their time on, and it deliberately describes no feature — naming one would be asking people to be
    // polite about a thing rather than telling us whether they want it at all.
    const QUESTIONS = [
        { title: "Which of these do you like most?", sub: "Not which you play most — which one you would miss. Same question as the last two rounds, so we can see what moved.", value: favorite, set: setFavorite, exclude: null, opts: systems },
        { title: "Which would you like MORE of?", sub: "If the next few months only deepened one of these, which should it be? This is the question that decides what gets built.", value: more, set: setMore, exclude: null, opts: systems },
        { title: "How do you want to spend the time?", sub: "Most of the Den is something you set going and come back to. Some games are the other way round — you are in there with your hands on it, moving and reacting, and the time you put in IS the playing.", value: pace, set: setPace, exclude: null, opts: paceOpts, wide: true },
    ];
    const q = QUESTIONS[step];

    return (
        <Portal>
            <div className="svy-wrap" role="dialog" aria-modal="true" aria-label="Quick survey">
                <button type="button" className="svy-scrim" aria-label="Close" onClick={close} />
                <div className="svy">
                    {step < 4 ? (
                        <div className="svy-steps" aria-hidden="true">
                            {[0, 1, 2, 3].map((i) => <span key={i} className={i <= step ? "is-on" : ""} />)}
                        </div>
                    ) : null}

                    {step < 3 ? (
                        <>
                            <h2>{q.title}</h2>
                            <p className="svy-sub">{q.sub}</p>
                            {/* ⚠️ THE LAST QUESTION HAS NO FEATURE ART, AND SHOULD NOT PRETEND TO. The first
                                two pick a system and every system owns a painted icon; the third picks a WAY
                                OF PLAYING, which is not a place and has no picture. It gets a single wide
                                column instead, so the difference in kind is visible before a word is read. */}
                            <div className={`svy-grid${q.wide ? " is-wide" : ""}`}>
                                {(q.opts || []).map((o) => {
                                    const blocked = q.exclude === o.key;
                                    const on = q.value === o.key;
                                    return (
                                        <button key={o.key} type="button" disabled={blocked}
                                            className={`svy-opt${on ? " is-on" : ""}${blocked ? " is-blocked" : ""}`}
                                            title={o.blurb}
                                            onClick={() => q.set(on ? null : o.key)}>
                                            {/* The nav's own icons and the Pathfinder's chapter art — already
                                                drawn, already paid for, and the same hand as everything else
                                                in the Den. eslint: a plain img is right for a blob-free
                                                local sprite at a fixed 34px. */}
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            {o.art ? <img src={o.art} alt="" className="svy-art" /> : null}
                                            <span className="svy-opt-body">
                                                <b>{o.label}</b>
                                                <em>{o.blurb}</em>
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="svy-actions">
                                <button type="button" className="svy-go" disabled={!q.value} onClick={() => setStep(step + 1)}>
                                    {step === 2 ? "Almost done" : "Next"}
                                </button>
                                <button type="button" className="svy-skip" onClick={() => setStep(step + 1)}>Skip this one</button>
                            </div>
                        </>
                    ) : step === 3 ? (
                        <>
                            <h2>Anything you want built?</h2>
                            <p className="svy-sub">Optional. One line is plenty — it comes straight to Luke.</p>
                            <textarea className="svy-text" rows={4} maxLength={400} value={wish}
                                onChange={(e) => setWish(e.target.value)}
                                placeholder="A thing you wish the Den had, or something that annoys you…" />
                            <div className="svy-actions">
                                <button type="button" className="svy-go" disabled={busy} onClick={() => submit()}>
                                    {busy ? "Sending…" : "Send it"}
                                </button>
                                <button type="button" className="svy-skip" disabled={busy} onClick={() => submit("")}>Just the picks</button>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="svy-done" aria-hidden="true">✓</div>
                            <h2>Thanks — that genuinely helps</h2>
                            {paid ? (
                                <p className="svy-chest">A <b>Mythic Chest</b> is on your account.</p>
                            ) : null}
                            <p className="svy-sub">
                                You can change your mind any time; answering again just replaces what you said.
                            </p>
                            <div className="svy-actions">
                                <button type="button" className="svy-go" onClick={() => setSystems(null)}>Back to it</button>
                            </div>
                        </>
                    )}
                </div>
            </div>

            <style jsx>{`
                .svy-wrap { position: fixed; inset: 0; z-index: 10088; display: flex; align-items: center; justify-content: center; padding: 18px; }
                .svy-scrim { position: absolute; inset: 0; border: 0; padding: 0; cursor: pointer; background: rgba(6,5,12,0.82); backdrop-filter: blur(3px); }
                /* ── THE DEN'S OWN COLOURS ────────────────────────────────────────────────────────
                   Luke: "I hate the colors." This dialog was the one screen in the game wearing purple,
                   and against gold-on-near-black everywhere else it read as somebody else's software
                   borrowed for an afternoon. Same tokens as the game hub and the shop's own print. */
                .svy { position: relative; width: min(452px, 100%); max-height: 88vh; overflow-y: auto;
                    padding: 20px 18px 16px; border-radius: 20px; text-align: center;
                    background: linear-gradient(180deg, #1a1524, #0f0c16); border: 1px solid rgba(214,176,92,0.42);
                    box-shadow: 0 24px 70px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,222,150,0.1); }
                .svy-steps { display: flex; gap: 5px; justify-content: center; margin-bottom: 14px; }
                .svy-steps span { width: 34px; height: 4px; border-radius: 999px; background: rgba(255,255,255,0.13); }
                .svy-steps span.is-on { background: #ffd75e; }
                .svy h2 { margin: 0 0 5px; font-size: 1.18rem; font-weight: 900; color: #ffffff; }
                .svy-sub { margin: 0 0 13px; font-size: 0.8rem; line-height: 1.45; color: #9a93a8; }
                .svy-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; text-align: left; }
                .svy-opt { display: flex; align-items: center; gap: 9px; text-align: left; padding: 8px 9px;
                    border-radius: 12px; cursor: pointer; color: inherit;
                    background: rgba(255,255,255,0.035); border: 1.5px solid rgba(255,255,255,0.09); transition: border-color .14s ease, background .14s ease, transform .14s ease; }
                .svy-art { width: 34px; height: 34px; flex: none; object-fit: contain; display: block; }
                .svy-opt-body { min-width: 0; }
                .svy-grid.is-wide { grid-template-columns: 1fr; }
                .svy-grid.is-wide .svy-opt { padding: 11px 13px; }
                .svy-opt:hover:not(:disabled) { border-color: rgba(255,215,94,0.5); }
                .svy-opt.is-on { border-color: #ffd75e; background: rgba(255,215,94,0.13); transform: translateY(-1px); }
                .svy-opt.is-blocked { opacity: 0.35; cursor: default; }
                .svy-opt b { display: block; font-size: 0.8rem; color: #ffffff; line-height: 1.2; }
                .svy-opt em { display: block; font-size: 0.66rem; font-style: normal; color: #8f88a0; margin-top: 2px; line-height: 1.25; }
                .svy-text { width: 100%; resize: none; border-radius: 12px; padding: 10px 12px; font-family: inherit; font-size: 0.85rem;
                    color: #f3ead6; background: rgba(0,0,0,0.35); border: 1px solid rgba(214,176,92,0.4); }
                .svy-actions { margin-top: 13px; }
                .svy-go { display: block; width: 100%; padding: 13px 16px; border-radius: 13px; border: 0; cursor: pointer;
                    font-size: 0.95rem; font-weight: 900; letter-spacing: 0.04em; color: #1a1208;
                    background: linear-gradient(180deg, #ffe9a8, #ffd75e); box-shadow: 0 4px 0 rgba(0,0,0,0.4); }
                .svy-go:disabled { opacity: 0.45; cursor: default; box-shadow: none; }
                .svy-skip { display: block; width: 100%; margin-top: 8px; padding: 8px; border: 0; background: transparent;
                    cursor: pointer; font-size: 0.78rem; font-weight: 800; color: #8f88a0; }
                .svy-chest { margin: 0 0 10px; font-size: 0.92rem; color: #ffd75e; font-weight: 800; }
                .svy-done { width: 54px; height: 54px; margin: 2px auto 8px; border-radius: 50%; display: grid; place-items: center;
                    font-size: 26px; font-weight: 900; color: #06240f; background: linear-gradient(180deg, #b9ffd0, #4ad07f); }
                @media (max-width: 380px) { .svy-grid { grid-template-columns: 1fr; } }
            `}</style>
        </Portal>
    );
}
