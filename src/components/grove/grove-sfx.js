"use client";

// ── THE UNLOCK ───────────────────────────────────────────────────────────────────────────────────────────────
// Luke: "When you unlock its a dopamine pop middle of the screen for a duration letting you know you unlocked
// the next area with vibration and a satisfying noise."
//
// ⚠️ SYNTHESISED, NOT A FILE. A chime is an oscillator and an envelope, so there is nothing to host, nothing to
// preload, nothing to go 404 on a phone with one bar, and nothing to add to the bundle. It also cannot be the
// thing that delays the celebration: the sound starts on the same frame the panel appears rather than whenever
// a download finishes.
//
// ⚠️ AND IT NEVER THROWS. Audio and vibration are both permission-gated and both differ per browser — iOS
// ignores navigator.vibrate entirely, and an AudioContext created before any user gesture starts suspended.
// Every call here is wrapped, because a silent celebration is a small disappointment and a thrown error in a
// render path is a broken screen.

let ctx = null;

function audio() {
    if (typeof window === "undefined") return null;
    try {
        if (!ctx) {
            const C = window.AudioContext || window.webkitAudioContext;
            if (!C) return null;
            ctx = new C();
        }
        // Autoplay policy parks the context until a gesture. Unlocking an area always follows taps, so by
        // the time this runs there has been one — resume is just insurance.
        if (ctx.state === "suspended") ctx.resume().catch(() => {});
        return ctx;
    } catch {
        return null;
    }
}

/** One note. `at` is an offset in seconds so a caller can lay out a phrase. */
function note(a, freq, at, dur, peak = 0.16, type = "triangle") {
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, a.currentTime + at);
    // A hard start clicks; a short ramp in and a long ramp out is what makes it read as a chime rather
    // than a beep.
    gain.gain.setValueAtTime(0.0001, a.currentTime + at);
    gain.gain.exponentialRampToValueAtTime(peak, a.currentTime + at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + at + dur);
    osc.connect(gain).connect(a.destination);
    osc.start(a.currentTime + at);
    osc.stop(a.currentTime + at + dur + 0.02);
}

/**
 * The area-unlocked flourish: a rising major triad with the root doubled an octave up on the last note,
 * which is the shape every "you got it" sound in every game has, because it works.
 */
export function playUnlock() {
    const a = audio();
    if (!a) return;
    try {
        note(a, 523.25, 0.00, 0.26);   // C5
        note(a, 659.25, 0.09, 0.26);   // E5
        note(a, 783.99, 0.18, 0.34);   // G5
        note(a, 1046.50, 0.27, 0.70, 0.13);           // C6, held
        note(a, 1567.98, 0.29, 0.55, 0.05, "sine");   // G6 shimmer under it
    } catch { /* a missing chime must never break the screen */ }
}

/** A short double pulse. No-ops on iOS, which does not implement the API at all. */
export function buzzUnlock() {
    try {
        if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
            navigator.vibrate([24, 60, 90]);
        }
    } catch { /* ignore */ }
}

export function celebrateUnlock() {
    playUnlock();
    buzzUnlock();
}
