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

// ── THE FIGHT, AS SOUND ──────────────────────────────────────────────────────────────────────────────────────
// Luke: "it doesn't feel like you're hitting them."
//
// Half of "it feels like a hit" is not visual at all, and no amount of hit-stop replaces it. But a grind
// soundtrack has a constraint nothing else in this game has: THE PLAYER WILL HEAR THE HIT SOUND TEN THOUSAND
// TIMES. So three rules, and every one of them is a rule because the obvious version is unbearable:
//
//   ⚠️ SHORT. Under about 90ms. A hit sound with a tail overlaps the next hit at any real attack speed and
//      turns the fight into a drone. The chime at the top of this file is 700ms and plays once an hour;
//      nothing down here may be built like it.
//   ⚠️ IT MUST MOVE. An identical sample on repeat stops registering within seconds — the ear filters it
//      out and the hits stop landing again, with the audio technically working. Pitch WALKS UP WITH THE
//      STREAK (see COMBO_PITCH_STEPS), which is the oldest trick in the genre and the reason a Vampire
//      Survivors run gets more exciting while nothing on screen has changed.
//   ⚠️ NOISE, NOT TONES, FOR IMPACT. A pure oscillator is a beep and reads as UI. A short burst of filtered
//      noise reads as two things colliding. The tone is reserved for rewards, where UI is what you want.
//
// Same safety rules as above: every call wrapped, nothing hosted, nothing preloaded, nothing that can 404.

let noiseBuf = null;
function noise(a) {
    if (!noiseBuf) {
        noiseBuf = a.createBuffer(1, Math.floor(a.sampleRate * 0.4), a.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i += 1) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
}

/** A filtered noise burst — the impact primitive. `freq` is where the band sits, `dur` in seconds. */
function thud(a, { freq = 420, dur = 0.07, peak = 0.22, q = 1.1, type = "bandpass", at = 0 } = {}) {
    const srcN = a.createBufferSource();
    srcN.buffer = noise(a);
    const f = a.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, a.currentTime + at);
    // Sweeping the band DOWN through the burst is what makes it read as a weight landing rather than a hiss.
    f.frequency.exponentialRampToValueAtTime(Math.max(60, freq * 0.45), a.currentTime + at + dur);
    f.Q.value = q;
    const g = a.createGain();
    g.gain.setValueAtTime(peak, a.currentTime + at);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + at + dur);
    srcN.connect(f).connect(g).connect(a.destination);
    srcN.start(a.currentTime + at);
    srcN.stop(a.currentTime + at + dur + 0.01);
}

// A semitone ladder for the streak. Twelve steps is one octave, which is as far as this can go before the
// hit stops sounding like a hit.
const semi = (n) => 2 ** (n / 12);

/** A landed blow. `step` is how deep into the streak it is; `crit` makes it brighter and adds a tone edge. */
export function playHit(step = 0, crit = false) {
    const a = audio();
    if (!a) return;
    try {
        const k = semi(Math.max(0, Math.min(12, step)));
        thud(a, { freq: (crit ? 900 : 480) * k, dur: crit ? 0.085 : 0.06, peak: crit ? 0.3 : 0.2, q: crit ? 1.6 : 1 });
        // The crit gets one short tone on top — a glint, not a chord. It is the only thing that separates a
        // crit from a hit by ear, and at 22% crit rate it has to stay small.
        if (crit) note(a, 1180 * k, 0, 0.07, 0.085, "square");
    } catch { /* silence must never break a fight */ }
}

/** A kill. The one beat in the loop that is allowed to be a tiny bit satisfying on its own. */
export function playKill(step = 0) {
    const a = audio();
    if (!a) return;
    try {
        const k = semi(Math.max(0, Math.min(12, step)));
        thud(a, { freq: 260, dur: 0.13, peak: 0.3, q: 0.8, type: "lowpass" });
        note(a, 740 * k, 0.02, 0.09, 0.1, "triangle");
        note(a, 1110 * k, 0.07, 0.11, 0.07, "sine");
    } catch { /* ignore */ }
}

/** Taking a hit. Low, dull and a little ugly — it is not meant to be enjoyed. */
export function playHurt() {
    const a = audio();
    if (!a) return;
    try {
        thud(a, { freq: 190, dur: 0.16, peak: 0.34, q: 0.6, type: "lowpass" });
        note(a, 118, 0, 0.1, 0.09, "sawtooth");
    } catch { /* ignore */ }
}

/** Loot hitting the ground. Tiny — it fires several times per kill. */
export function playDrop() {
    const a = audio();
    if (!a) return;
    try { thud(a, { freq: 1500, dur: 0.035, peak: 0.07, q: 2.4 }); } catch { /* ignore */ }
}

/** Loot being drawn in and collected. The little reward blip; two notes up, always the same, deliberately. */
export function playPickup(rare = false) {
    const a = audio();
    if (!a) return;
    try {
        note(a, rare ? 1046 : 784, 0, 0.07, 0.1, "triangle");
        note(a, rare ? 1568 : 1046, 0.05, 0.1, 0.08, "triangle");
    } catch { /* ignore */ }
}

/** A telegraph resolving on empty ground — the sound of having got out of the way, which deserves one. */
export function playWhiff() {
    const a = audio();
    if (!a) return;
    try { thud(a, { freq: 760, dur: 0.1, peak: 0.1, q: 0.7, type: "highpass" }); } catch { /* ignore */ }
}

/** A boss winding up. Longer, because a boss telegraph is the one wind-up worth announcing by ear. */
export function playTell(kind = "slam") {
    const a = audio();
    if (!a) return;
    try {
        const f = kind === "sweep" ? 150 : kind === "volley" ? 330 : 220;
        note(a, f, 0, 0.26, 0.085, "sawtooth");
    } catch { /* ignore */ }
}
