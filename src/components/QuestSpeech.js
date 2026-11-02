"use client";

import { useEffect, useRef, useState } from "react";

// ── ONE LINE OF SPEECH THAT TYPES ITSELF IN ─────────────────────────────────────────────────────────────────
// Luke: "The npc quest text is really weird it like keeps retriggering."
//
// It did, and in both givers. This is the bug, and it is worth writing down because it is the most ordinary
// React mistake there is:
//
//     useEffect(() => { ...type it out...; onDone?.(); }, [full, onDone]);   // ⚠️ WRONG
//
// with the parent passing `onDone={() => setTyped(true)}`. That arrow is a NEW FUNCTION on every render, so:
// the line finishes → onDone fires → the parent re-renders → a fresh arrow identity arrives → the dependency
// array has "changed" → the effect tears down and runs again → the line types itself from the beginning.
// Forever. Every completed line immediately restarted, which is exactly what "keeps retriggering" looks like.
//
// Two rules, and both are general:
//
//   ⚠️ A CALLBACK PROP MUST NOT BE AN EFFECT DEPENDENCY unless the caller memoised it. Hold it in a ref,
//     refreshed on every render, and read it inside the effect. The effect then depends on the DATA (the
//     text) and nothing else, which is the only thing that should restart it.
//
//   ⚠️ AND THE PARENT, NOT THE TIMER, OWNS "IS IT FINISHED". `complete` is the parent's own state, so a tap
//     genuinely completes the line — the old version set a flag the typewriter could not see, so tapping
//     through appeared to work only because the re-render restarted the animation and it looked different.
//
// Shared by both givers on purpose. Two copies of a typewriter is two copies of this bug.
const LETTER_MS = 16;   // fast enough not to be a wait, slow enough to read as speech

export default function QuestSpeech({ text, complete = false, onComplete, className = "qd-say" }) {
    const full = text || "";
    const [n, setN] = useState(0);
    // ⚠️ THE CALLBACK LIVES IN A REF, refreshed every render, so it is always current WITHOUT being a
    // dependency. This single line is the fix.
    const cb = useRef(onComplete);
    cb.current = onComplete;

    useEffect(() => {
        // The parent already says show all of it — nothing to animate, and no timer to leak.
        if (complete) return undefined;
        setN(0);
        if (!full) { cb.current?.(); return undefined; }
        let i = 0;
        const t = setInterval(() => {
            i += 1;
            setN(i);
            if (i >= full.length) { clearInterval(t); cb.current?.(); }
        }, LETTER_MS);
        return () => clearInterval(t);
    }, [full, complete]);

    const shown = complete ? full : full.slice(0, n);
    return (
        <p className={className}>
            {shown}
            {!complete && n < full.length ? <span className="qd-caret" aria-hidden="true" /> : null}
        </p>
    );
}
