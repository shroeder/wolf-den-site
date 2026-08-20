"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import useScrollLock from "@/lib/useScrollLock";

// ── ASKING THE DEN A DESIGN QUESTION ─────────────────────────────────────────────────────────────────────────
// The survey asks the same three questions every round. This asks whatever is genuinely undecided right now —
// see polls.js, where the questions live.
//
// Everything about the SHAPE is copied from SurveyModal on purpose, because that shape works: the server
// decides whether to ask (answering on your phone must not ask you again on your laptop), the snooze is local
// (a "not now" is a per-device mood), and it is one question per card rather than one long form, because a
// screen of twelve radio buttons reads as homework and a dismissed poll tells you nothing at all.
//
// Bumped with the poll id: waving away August's poll must not silence somebody for every poll the Den ever
// runs. A new poll is a new ask, including for the people who waved the last one away.
const SNOOZE_PREFIX = "wolfden-poll-snooze:";

// Launch cards that must be seen and dismissed before a poll may appear — never stack on top of an
// announcement. If a launch component is retired from the nav its key must come OUT of this list, or the poll
// waits forever on a card that can no longer be shown.
const LAUNCH_KEYS = [
    "wolfden-arena-reopen-v1",
    "wolfden-mining-announce-v2",
    "wolfden-dungeons-announce-v1",
    "wolfden-fishing-announce-v1",
    "wolfden-forge-announce-v1",
    "wolfden-market-announce-v1",
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

export default function PollModal() {
    const [poll, setPoll] = useState(null);
    const [step, setStep] = useState(0);
    const [answers, setAnswers] = useState({});
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(false);
    useScrollLock(Boolean(poll));

    useEffect(() => {
        let alive = true;
        (async () => {
            const r = await fetch("/api/marketplace/poll", { cache: "no-store" }).catch(() => null);
            const d = r?.ok ? await r.json().catch(() => null) : null;
            if (!alive || !d?.ask || !d.poll) return;
            try {
                if (localStorage.getItem(SNOOZE_PREFIX + d.poll.id)) return;
                // Never on top of an announcement somebody has not read yet.
                if (LAUNCH_KEYS.some((k) => !localStorage.getItem(k))) return;
            } catch { return; }
            // Let the page settle before asking for anything.
            setTimeout(() => alive && setPoll(d.poll), 1400);
        })();
        return () => { alive = false; };
    }, []);

    const snooze = () => {
        try { if (poll) localStorage.setItem(SNOOZE_PREFIX + poll.id, "1"); } catch { /* private mode */ }
        setPoll(null);
    };

    const pick = (qid, cid) => {
        const next = { ...answers, [qid]: cid };
        setAnswers(next);
        // Straight on to the next question — a "continue" button under a list of radio buttons is a second tap
        // for a decision already made.
        if (step < poll.questions.length) setTimeout(() => setStep((n) => n + 1), 180);
    };

    const send = async () => {
        if (busy) return;
        setBusy(true);
        try {
            await fetch("/api/marketplace/poll", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ pollId: poll.id, answers, note: note.trim() || null }),
            }).catch(() => {});
            // Snoozed as well as saved, so a failed write cannot re-ask somebody who has answered.
            try { localStorage.setItem(SNOOZE_PREFIX + poll.id, "1"); } catch { /* ignore */ }
            setDone(true);
        } finally { setBusy(false); }
    };

    if (!poll) return null;
    const q = poll.questions[step] || null;
    const onNote = step >= poll.questions.length;

    return (
        <Portal>
            <div className="poll-wrap" role="dialog" aria-modal="true" aria-label={poll.title}>
                <button type="button" className="poll-scrim" aria-label="Close" onClick={snooze} />
                <div className="poll">
                    {done ? (
                        <>
                            <span className="poll-kick">Thank you</span>
                            <h2>That is genuinely useful</h2>
                            <p>It decides what gets built next. You can see what everyone else said once the poll closes.</p>
                            <button type="button" className="poll-go" onClick={() => setPoll(null)}>Back to it</button>
                        </>
                    ) : (
                        <>
                            <span className="poll-kick">{poll.title}</span>
                            {step === 0 && !onNote ? <p className="poll-intro">{poll.intro}</p> : null}

                            {q ? (
                                <>
                                    <h2>{q.text}</h2>
                                    <div className="poll-choices">
                                        {q.choices.map((c) => (
                                            <button type="button" key={c.id}
                                                className={`poll-choice${answers[q.id] === c.id ? " is-on" : ""}`}
                                                onClick={() => pick(q.id, c.id)}>
                                                <b>{c.label}</b>
                                                {c.blurb ? <span>{c.blurb}</span> : null}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            ) : (
                                <>
                                    <h2>{poll.note || "Anything else?"}</h2>
                                    <textarea className="poll-note" rows={4} value={note} maxLength={400}
                                        onChange={(e) => setNote(e.target.value)}
                                        placeholder="Optional — but this is the part that gets read closest." />
                                    <button type="button" className="poll-go" disabled={busy} onClick={send}>
                                        {busy ? "Sending…" : "Send it"}
                                    </button>
                                </>
                            )}

                            <div className="poll-foot">
                                <span className="poll-dots" aria-hidden="true">
                                    {poll.questions.map((x, i) => (
                                        <i key={x.id} className={i === step ? "is-on" : i < step ? "is-done" : ""} />
                                    ))}
                                    <i className={onNote ? "is-on" : ""} />
                                </span>
                                {step > 0 && !onNote ? (
                                    <button type="button" className="poll-later" onClick={() => setStep((n) => n - 1)}>Back</button>
                                ) : null}
                                {/* Skippable at every step. A poll you cannot get out of is one people learn to
                                    dismiss on sight, and the next one goes unanswered too. */}
                                <button type="button" className="poll-later" onClick={onNote ? send : snooze}>
                                    {onNote ? "Skip this bit" : "Not right now"}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>

            <style jsx>{`
                .poll-wrap { position: fixed; inset: 0; z-index: 10088; display: flex; align-items: center; justify-content: center; padding: 18px; }
                .poll-scrim { position: absolute; inset: 0; border: 0; padding: 0; cursor: pointer;
                    background: rgba(5,6,12,0.86); backdrop-filter: blur(3px); }
                .poll { position: relative; width: min(420px, 100%); max-height: 88dvh; overflow-y: auto;
                    padding: 22px 22px 16px; border-radius: 20px; text-align: center;
                    background: linear-gradient(180deg, #1b2030, #0e1119); border: 2px solid #5a7fd4;
                    box-shadow: 0 24px 70px rgba(0,0,0,0.78), 0 0 60px rgba(90,127,212,0.2); }
                .poll-kick { display: block; font-size: 10.5px; font-weight: 900; letter-spacing: 0.16em;
                    text-transform: uppercase; color: #9fb6ee; }
                .poll h2 { margin: 8px 0 12px; font-size: 1.2rem; font-weight: 900; color: #e8eeff; line-height: 1.3; }
                .poll-intro { margin: 8px 0 14px; font-size: 0.84rem; line-height: 1.5; color: #a8b4cc; }
                .poll-choices { display: grid; gap: 7px; text-align: left; }
                .poll-choice { padding: 11px 13px; border-radius: 12px; cursor: pointer; text-align: left;
                    background: rgba(255,255,255,0.05); border: 1px solid rgba(150,180,255,0.25); }
                .poll-choice:hover { background: rgba(255,255,255,0.09); }
                .poll-choice.is-on { border-color: #7ea2ff; background: rgba(126,162,255,0.16); }
                .poll-choice b { display: block; font-size: 0.92rem; color: #dfe8ff; }
                .poll-choice span { display: block; margin-top: 2px; font-size: 0.75rem; line-height: 1.4; color: #97a3bc; }
                .poll-note { width: 100%; padding: 10px 12px; border-radius: 12px; font: inherit; font-size: 0.85rem;
                    color: #e8eeff; background: rgba(255,255,255,0.05); border: 1px solid rgba(150,180,255,0.25); resize: vertical; }
                /* Stated on the anchor-shaped control too: the site link colour would paint this label blue. */
                .poll-go { display: block; width: 100%; margin-top: 12px; padding: 12px; border-radius: 13px; cursor: pointer;
                    font-size: 0.92rem; font-weight: 900; color: #0d1018;
                    background: linear-gradient(180deg, #b9cdff, #6f92e8); border: 1px solid rgba(200,220,255,0.5); }
                .poll-go:disabled { opacity: .5; cursor: default; }
                .poll p { margin: 0 0 12px; font-size: 0.86rem; line-height: 1.5; color: #a8b4cc; }
                .poll-foot { display: flex; align-items: center; gap: 10px; margin-top: 12px; }
                .poll-dots { display: inline-flex; gap: 4px; margin-right: auto; }
                .poll-dots i { width: 6px; height: 6px; border-radius: 50%; background: rgba(255,255,255,0.18); }
                .poll-dots i.is-on { background: #7ea2ff; }
                .poll-dots i.is-done { background: rgba(126,162,255,0.5); }
                .poll-later { background: none; border: 0; padding: 6px 4px; cursor: pointer;
                    font-size: 0.78rem; font-weight: 800; color: rgba(255,255,255,0.45); }
                .poll-later:hover { color: rgba(255,255,255,0.8); }
            `}</style>
        </Portal>
    );
}
