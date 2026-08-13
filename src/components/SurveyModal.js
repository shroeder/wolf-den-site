"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import useScrollLock from "@/lib/useScrollLock";

// ── THE MEMBER SURVEY ────────────────────────────────────────────────────────────────────────────────────────
// Three questions: which system you like most, which least, and anything you want built. Telemetry already says
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
const SNOOZE_KEY = "wolfden-survey-snooze-v2";
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
    const [step, setStep] = useState(0);          // 0 favourite · 1 least · 2 wish · 3 thanks
    const [favorite, setFavorite] = useState(null);
    const [least, setLeast] = useState(null);
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
        fetch("/api/marketplace/survey", { cache: "no-store", credentials: "same-origin" })
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => { if (alive && d?.ask && d.systems?.length) setSystems(d.systems); })
            .catch(() => { /* never let a survey break a page */ });
        return () => { alive = false; };
    }, []);

    const close = () => {
        try { localStorage.setItem(SNOOZE_KEY, "1"); } catch { /* ignore */ }
        setSystems(null);
    };

    const submit = async (finalWish) => {
        setBusy(true);
        await fetch("/api/marketplace/survey", {
            method: "POST", credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ favorite, least, wish: finalWish ?? wish }),
        }).catch(() => { /* the answer is nice-to-have; never block the UI on it */ });
        setBusy(false);
        setStep(3);
    };

    if (!open) return null;

    const QUESTIONS = [
        { title: "Which part of the Den do you like most?", sub: "Pick one — this is the bit we'll build on.", value: favorite, set: setFavorite, exclude: null },
        { title: "And which one grabs you least?", sub: "Honestly. Knowing what to fix is worth more than a compliment.", value: least, set: setLeast, exclude: favorite },
    ];
    const q = QUESTIONS[step];

    return (
        <Portal>
            <div className="svy-wrap" role="dialog" aria-modal="true" aria-label="Quick survey">
                <button type="button" className="svy-scrim" aria-label="Close" onClick={close} />
                <div className="svy">
                    {step < 3 ? (
                        <div className="svy-steps" aria-hidden="true">
                            {[0, 1, 2].map((i) => <span key={i} className={i <= step ? "is-on" : ""} />)}
                        </div>
                    ) : null}

                    {step < 2 ? (
                        <>
                            <h2>{q.title}</h2>
                            <p className="svy-sub">{q.sub}</p>
                            <div className="svy-grid">
                                {systems.map((s) => {
                                    // You can't call the same system your favourite AND your least favourite.
                                    const blocked = q.exclude === s.key;
                                    const on = q.value === s.key;
                                    return (
                                        <button key={s.key} type="button" disabled={blocked}
                                            className={`svy-opt${on ? " is-on" : ""}${blocked ? " is-blocked" : ""}`}
                                            title={blocked ? "You picked this as your favourite" : s.blurb}
                                            onClick={() => q.set(on ? null : s.key)}>
                                            <b>{s.label}</b>
                                            <em>{blocked ? "your favourite" : s.blurb}</em>
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="svy-actions">
                                <button type="button" className="svy-go" disabled={!q.value} onClick={() => setStep(step + 1)}>
                                    {step === 0 ? "Next" : "Almost done"}
                                </button>
                                <button type="button" className="svy-skip" onClick={() => setStep(step + 1)}>Skip this one</button>
                            </div>
                        </>
                    ) : step === 2 ? (
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
                .svy { position: relative; width: min(440px, 100%); max-height: 88vh; overflow-y: auto;
                    padding: 20px 20px 16px; border-radius: 20px; text-align: center;
                    background: linear-gradient(180deg, #1e1b2c, #12101a); border: 1px solid rgba(160,140,255,0.4);
                    box-shadow: 0 24px 70px rgba(0,0,0,0.7); }
                .svy-steps { display: flex; gap: 5px; justify-content: center; margin-bottom: 14px; }
                .svy-steps span { width: 34px; height: 4px; border-radius: 999px; background: rgba(255,255,255,0.13); }
                .svy-steps span.is-on { background: #a08cff; }
                .svy h2 { margin: 0 0 5px; font-size: 1.16rem; font-weight: 900; color: #e9e3ff; }
                .svy-sub { margin: 0 0 13px; font-size: 0.8rem; line-height: 1.45; color: #9a93b5; }
                .svy-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; text-align: left; }
                .svy-opt { display: block; padding: 9px 10px; border-radius: 11px; cursor: pointer; color: inherit;
                    background: rgba(255,255,255,0.04); border: 1.5px solid rgba(255,255,255,0.1); transition: border-color .14s ease, background .14s ease, transform .14s ease; }
                .svy-opt:hover:not(:disabled) { border-color: rgba(160,140,255,0.5); }
                .svy-opt.is-on { border-color: #a08cff; background: rgba(160,140,255,0.16); transform: translateY(-1px); }
                .svy-opt.is-blocked { opacity: 0.35; cursor: default; }
                .svy-opt b { display: block; font-size: 0.83rem; color: #e9e3ff; }
                .svy-opt em { display: block; font-size: 0.68rem; font-style: normal; color: #8f88ab; margin-top: 1px; line-height: 1.3; }
                .svy-text { width: 100%; resize: none; border-radius: 12px; padding: 10px 12px; font-family: inherit; font-size: 0.85rem;
                    color: #e9e3ff; background: rgba(0,0,0,0.3); border: 1px solid rgba(160,140,255,0.35); }
                .svy-actions { margin-top: 13px; }
                .svy-go { display: block; width: 100%; padding: 13px 16px; border-radius: 13px; border: 0; cursor: pointer;
                    font-size: 0.95rem; font-weight: 900; letter-spacing: 0.04em; color: #17121f;
                    background: linear-gradient(180deg, #cdbcff, #a08cff); box-shadow: 0 4px 0 rgba(0,0,0,0.35); }
                .svy-go:disabled { opacity: 0.45; cursor: default; box-shadow: none; }
                .svy-skip { display: block; width: 100%; margin-top: 8px; padding: 8px; border: 0; background: transparent;
                    cursor: pointer; font-size: 0.78rem; font-weight: 800; color: #8f88ab; }
                .svy-done { width: 54px; height: 54px; margin: 2px auto 8px; border-radius: 50%; display: grid; place-items: center;
                    font-size: 26px; font-weight: 900; color: #17121f; background: linear-gradient(180deg, #b9ffd0, #4ad07f); }
                @media (max-width: 380px) { .svy-grid { grid-template-columns: 1fr; } }
            `}</style>
        </Portal>
    );
}
