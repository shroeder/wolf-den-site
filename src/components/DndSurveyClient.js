"use client";

import { useState } from "react";
import { GiCheckMark, GiDiceTwentyFacesTwenty } from "react-icons/gi";

import { DND_QUESTIONS, validateAnswers } from "@/lib/dnd-survey";

// The public D&D interest survey. Every question renders from DND_QUESTIONS — nothing about the wording or the
// stored values is repeated here, so a reworded option cannot silently stop matching what the API accepts.
//
// Chips rather than a <select>: this arrives from a phone, off a Facebook post, and a native select on mobile
// costs a tap and a scroll wheel for what should be one thumb press.

const EMPTY = Object.fromEntries(DND_QUESTIONS.map((q) => [q.id, q.multi ? [] : null]));

export default function DndSurveyClient() {
    const [answers, setAnswers] = useState(EMPTY);
    const [name, setName] = useState("");
    const [contact, setContact] = useState("");
    const [notes, setNotes] = useState("");
    const [sending, setSending] = useState(false);
    const [error, setError] = useState("");
    const [done, setDone] = useState(false);

    function pick(question, value) {
        setError("");
        setAnswers((prev) => {
            if (!question.multi) {
                return { ...prev, [question.id]: value };
            }
            const current = prev[question.id] || [];
            const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
            return { ...prev, [question.id]: next };
        });
    }

    function isPicked(question, value) {
        const current = answers[question.id];
        return question.multi ? (current || []).includes(value) : current === value;
    }

    async function submit(event) {
        event.preventDefault();
        setError("");

        const check = validateAnswers(answers);
        if (!check.ok) {
            setError(check.error);
            return;
        }

        setSending(true);
        try {
            const response = await fetch("/api/dnd-survey", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ ...check.answers, name, contact, notes }),
            });
            const data = await response.json().catch(() => null);
            if (!response.ok) {
                // A 400 names the question that still needs an answer, and that is worth showing. Anything
                // else is ours, and "Internal Server Error" tells the person at the phone nothing they can act
                // on — they get the retry line instead, and the request id is already in our logs.
                throw new Error((response.status === 400 && data?.error) || "Could not send your answers. Please try again.");
            }
            setDone(true);
        } catch (err) {
            setError(err?.message || "Could not send your answers. Please try again.");
            setSending(false);
        }
    }

    if (done) {
        return (
            <section className="card dnd-done">
                <GiCheckMark aria-hidden="true" className="dnd-done-icon" />
                <h2>Answers received — thank you!</h2>
                <p className="secondary">
                    We&apos;ll use these to pick a night, a length and a format that suits the most people, then post
                    the details. Watch our Facebook page or ask us in the shop.
                </p>
            </section>
        );
    }

    const answeredCount = DND_QUESTIONS.filter((q) => (q.multi ? (answers[q.id] || []).length > 0 : answers[q.id])).length;

    return (
        <form className="contact-form dnd-form" onSubmit={submit}>
            {DND_QUESTIONS.map((question, index) => (
                <fieldset key={question.id} className="dnd-question">
                    <legend>
                        <span className="dnd-question-number">{index + 1}</span>
                        {question.prompt}
                    </legend>
                    {question.note ? <p className="muted dnd-question-note">{question.note}</p> : null}
                    <div className={`dnd-options${question.options.length > 4 ? " dnd-options-tight" : ""}`}>
                        {question.options.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                className={`dnd-option${isPicked(question, option.value) ? " dnd-option-active" : ""}`}
                                aria-pressed={isPicked(question, option.value)}
                                onClick={() => pick(question, option.value)}
                            >
                                <strong>{option.label}</strong>
                                {option.hint ? <span>{option.hint}</span> : null}
                            </button>
                        ))}
                    </div>
                </fieldset>
            ))}

            <fieldset className="dnd-question">
                <legend>
                    <span className="dnd-question-number">{DND_QUESTIONS.length + 1}</span>
                    How do we reach you? <span className="muted">(optional)</span>
                </legend>
                <p className="muted dnd-question-note">
                    Only so we can tell you when a table is forming. Leave it blank and your answers still count.
                </p>
                <label htmlFor="dnd-name">Your name</label>
                <input id="dnd-name" type="text" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                <label htmlFor="dnd-contact">Email, phone or Discord</label>
                <input id="dnd-contact" type="text" value={contact} onChange={(e) => setContact(e.target.value)} autoComplete="email" />
                <label htmlFor="dnd-notes">Anything else we should know?</label>
                <textarea id="dnd-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional — a night that never works, a class you want to play, whatever you like" />
            </fieldset>

            <div className="dnd-send-row">
                <button className="button primary" type="submit" disabled={sending}>
                    <GiDiceTwentyFacesTwenty aria-hidden="true" />
                    {sending ? "Sending…" : "Send my answers"}
                </button>
                <span className="muted dnd-send-note">
                    {answeredCount}/{DND_QUESTIONS.length} questions answered · takes about a minute
                </span>
            </div>
            {error ? <p className="dnd-error" role="alert">{error}</p> : null}
        </form>
    );
}
