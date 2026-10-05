"use client";

// ── THE GACHAPON'S EARS ──────────────────────────────────────────────────────────────────────────────────────
// Luke: "it would be awesome if it was like a real simulation so it really felt like a real gachapon machine."
//
// A gachapon is almost entirely a SOUND. The visual is a ball coming down a tube; what makes it the thing
// people queue up for is the ratchet under your hand, the dead clunk at the end of the turn, and the hollow
// plastic knock of the capsule hitting the tray. Take those away and you have a lottery result in a modal.
//
// Everything here is synthesised on the arena's single AudioContext through the arena's compressor — the
// reasons are written out at the top of casino-audio.js and they all still apply. In short: Chrome allows
// about six contexts per document, the casino page can already have the arena's and the slot cabinets' alive
// at once, and a third module making its own would re-earn a lesson that was expensive the first time.
import { killBus, noise, subBus, tone, unlock } from "@/components/arena/arena-audio.js";

let bus = null;
function ensure() {
    if (bus) return bus;
    unlock();
    bus = subBus(1.0);
    return bus;
}

export function stopGachaAudio() {
    if (bus) { killBus(bus); bus = null; }
}

/** The token going in: a small metal object falling into a slot, and the slot swallowing it. */
export function coinIn() {
    const b = ensure();
    if (!b) return;
    tone({ freq: 1760, type: "triangle", dur: 0.05, gain: 0.08, bus: b });
    tone({ freq: 1320, type: "triangle", at: 0.05, dur: 0.07, gain: 0.07, bus: b });
    noise({ at: 0.11, dur: 0.07, gain: 0.05, type: "bandpass", freq: 2400, q: 2, bus: b });
}

/**
 * ONE tooth of the ratchet. The crank is a drag, so this is called repeatedly as the handle turns and the
 * caller decides the spacing — which is why it takes a position rather than a duration: the pitch creeps up
 * across the turn, and that rise is the entire reason a crank feels like it is building to something.
 *
 * ⚠️ IT MUST BE CHEAP. This fires a dozen-plus times inside one gesture, so it is two nodes and no filter;
 * a fuller click would be four or five and would start competing with the drag for the main thread.
 */
export function ratchet(t = 0) {
    const b = ensure();
    if (!b) return;
    const k = Math.max(0, Math.min(1, t));
    tone({ freq: 240 + k * 130, to: 90 + k * 60, type: "square", dur: 0.035, gain: 0.055, bus: b });
}

/** The end of the turn: the mechanism giving, and the ball dropping out of the hopper into the chute. */
export function clunk() {
    const b = ensure();
    if (!b) return;
    // The give — a heavy, dead thud with no ring to it at all. This is the sound that says "it has happened".
    tone({ freq: 150, to: 52, type: "sine", dur: 0.14, gain: 0.3, bus: b });
    noise({ at: 0, dur: 0.1, gain: 0.14, type: "lowpass", freq: 700, sweepTo: 180, bus: b });
    // And the hopper letting go above it — brighter, and a beat later, so the two read as cause and effect
    // rather than as one noise.
    noise({ at: 0.1, dur: 0.12, gain: 0.07, type: "bandpass", freq: 900, q: 1.3, bus: b });
}

/** Hollow plastic tumbling down a steel chute. Three knocks, getting closer together, falling in pitch. */
export function roll() {
    const b = ensure();
    if (!b) return;
    const at = [0, 0.13, 0.22];
    const f = [620, 520, 430];
    for (let i = 0; i < at.length; i += 1) {
        tone({ freq: f[i], to: f[i] * 0.55, type: "triangle", at: at[i], dur: 0.07, gain: 0.1, bus: b });
        noise({ at: at[i], dur: 0.05, gain: 0.04, type: "bandpass", freq: 1800, q: 1.6, bus: b });
    }
}

/** It lands in the tray. One last knock, lower and with a little rattle after it as it settles. */
export function land() {
    const b = ensure();
    if (!b) return;
    tone({ freq: 330, to: 150, type: "triangle", dur: 0.11, gain: 0.14, bus: b });
    noise({ at: 0.02, dur: 0.08, gain: 0.06, type: "bandpass", freq: 1200, q: 1.2, bus: b });
    tone({ freq: 260, to: 170, type: "triangle", at: 0.14, dur: 0.07, gain: 0.06, bus: b });
}

/** The shell coming apart in your hands — a dry plastic crack, then the two halves parting. */
export function crack() {
    const b = ensure();
    if (!b) return;
    noise({ at: 0, dur: 0.05, gain: 0.16, type: "highpass", freq: 2200, sweepTo: 4200, bus: b });
    tone({ freq: 880, to: 420, type: "square", dur: 0.06, gain: 0.07, bus: b });
    noise({ at: 0.07, dur: 0.13, gain: 0.05, type: "bandpass", freq: 1500, q: 0.9, bus: b });
}

/**
 * And what is inside. `rank` is the capsule's own rank (1 orange … 4 gold) — a gold shell has to sound
 * different from an orange one BEFORE the prize is read, because by then the player already knows.
 *
 * The chord is the same major triad every time with notes added as the rank climbs, rather than four
 * unrelated stings: it makes a gold pull sound like a bigger version of the thing you have heard twenty
 * times, which is what "bigger" has to mean to be felt.
 */
export function reveal(rank = 1) {
    const b = ensure();
    if (!b) return;
    const root = 523.25;
    const steps = [1, 1.25, 1.5, 2, 2.5];          // the triad, then its octave and tenth
    const n = Math.max(2, Math.min(5, rank + 1));
    for (let i = 0; i < n; i += 1) {
        tone({ freq: root * steps[i], type: "triangle", at: i * 0.07, dur: 0.5 + i * 0.1, gain: 0.085, bus: b });
    }
    if (rank >= 3) {
        // A shimmer over the top for the two good shells, and a low swell under a gold one so it has weight
        // as well as sparkle.
        noise({ at: 0.1, dur: 0.6, gain: 0.03, type: "highpass", freq: 4200, bus: b });
        if (rank >= 4) tone({ freq: root / 2, type: "sine", at: 0.05, dur: 0.9, gain: 0.1, bus: b });
    }
}
