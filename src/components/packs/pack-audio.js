"use client";

// ── THE PACK'S EARS ──────────────────────────────────────────────────────────────────────────────────────────
// A pack opening is at least half a sound. The picture is a bag coming apart; what makes it worth
// doing twice is the rattle building, the crack of the bag going, and the glitter settling after it. Take
// those away and it is a database row in a modal.
//
// ⚠️ EVERYTHING GOES THROUGH THE ARENA'S SINGLE SHARED AudioContext, exactly as gacha-audio.js does, and for
// the same reason written at the top of casino-audio.js: Chrome allows roughly six contexts per document, and
// a member can already have the arena's and the casino cabinets' alive at once. A third module making its own
// would re-earn an expensive lesson.
//
// ⚠️ AND NOTHING HERE DECIDES ANYTHING. The tier is handed in. Sound follows the result; it never hints at one
// before the burst — see the identical-shake rule at the top of PackOpenClient.
import { killBus, noise, subBus, tone, unlock } from "@/components/arena/arena-audio.js";

let bus = null;
function ensure() {
    if (bus) return bus;
    unlock();
    bus = subBus(1.0);
    return bus;
}

export function stopPackAudio() {
    if (bus) { killBus(bus); bus = null; }
}

/** Credit leaving the balance. A coin going somewhere, cleanly, with no ceremony — the ceremony comes later. */
export function coinOut() {
    const b = ensure();
    if (!b) return;
    tone({ freq: 880, type: "triangle", dur: 0.06, gain: 0.07, bus: b });
    tone({ freq: 620, to: 440, type: "triangle", at: 0.05, dur: 0.12, gain: 0.06, bus: b });
}

/** Credit arriving. The same gesture inverted and bigger, because this is the one people chase. */
export function coinIn() {
    const b = ensure();
    if (!b) return;
    tone({ freq: 660, to: 990, type: "triangle", dur: 0.1, gain: 0.08, bus: b });
    tone({ freq: 990, type: "sine", at: 0.09, dur: 0.16, gain: 0.07, bus: b });
    tone({ freq: 1320, type: "sine", at: 0.15, dur: 0.2, gain: 0.05, bus: b });
}

/**
 * The balance counting up after a sale. A run of clicks under a number that is climbing, then the landing.
 *
 * ⚠️ THE CLICKS ARE SPACED ON THE DIGITS' EASING, NOT EVENLY. The counter runs on easeOutCubic — fast off the
 * mark, settling at the end — so an evenly spaced tick is already out of step with it by the halfway point
 * and sounds like a second, slower thing happening nearby. Inverting the ease here is what makes the sound
 * feel attached to the number: the ticks crowd where the digits are flying and thin out as they settle.
 */
export function tally(durationMs = 1150, ticks = 18) {
    const b = ensure();
    if (!b) return;
    const d = durationMs / 1000;
    for (let i = 1; i <= ticks; i += 1) {
        const p = i / ticks;
        const at = d * (1 - (1 - p) ** (1 / 3));
        tone({ freq: 1160 + p * 820, type: "triangle", at, dur: 0.03, gain: 0.028, bus: b });
    }
    // It lands. Two notes up, because the number ended higher than it started.
    tone({ freq: 784, to: 1175, type: "triangle", at: d, dur: 0.22, gain: 0.07, bus: b });
    tone({ freq: 1568, type: "sine", at: d + 0.06, dur: 0.28, gain: 0.038, bus: b });
}

/**
 * The bag shaking itself apart. A low rumble that RISES across the whole shake, so the ear knows something
 * is building before the eye is sure — which is the entire job of this phase.
 *
 * ⚠️ It climbs in pitch AND in level, and it is identical for every tier. The shake must not leak the result;
 * that is the colourless-glow rule, and sound breaks it as easily as colour does.
 */
export function rumble(durationMs = 900) {
    const b = ensure();
    if (!b) return;
    const d = durationMs / 1000;
    noise({ dur: d, gain: 0.09, type: "lowpass", freq: 160, sweepTo: 520, bus: b });
    tone({ freq: 42, to: 96, type: "sawtooth", dur: d, gain: 0.07, bus: b });
    // Flutter — the foil rattling against itself as it goes.
    for (let i = 0; i < 7; i += 1) {
        noise({ at: d * (i / 7), dur: 0.05, gain: 0.02 + i * 0.006, type: "bandpass", freq: 1800 + i * 260, q: 3, bus: b });
    }
}

/**
 * The bag going. A real transient: a crack on top for the phone speaker, a sub underneath for anything with
 * bass, and a short bright scatter for the shards leaving.
 */
export function burst(strength = 0.6) {
    const b = ensure();
    if (!b) return;
    const k = Math.max(0, Math.min(1, strength));
    // The crack. Short, wide, loud — this is the bit that actually reads on a handset.
    noise({ dur: 0.08, gain: 0.16 + k * 0.1, type: "highpass", freq: 900, bus: b });
    noise({ dur: 0.22, gain: 0.1 + k * 0.08, type: "bandpass", freq: 2200, q: 0.5, sweepTo: 400, bus: b });
    // The body.
    tone({ freq: 150 + k * 50, to: 34, type: "sine", dur: 0.42 + k * 0.3, gain: 0.16 + k * 0.12, bus: b });
    tone({ freq: 80, to: 28, type: "triangle", dur: 0.3, gain: 0.1, bus: b });
    // Debris, scattering outward for a moment after.
    for (let i = 0; i < 9; i += 1) {
        noise({ at: 0.05 + i * 0.035, dur: 0.07, gain: 0.035, type: "bandpass", freq: 2600 + Math.random() * 3200, q: 4, bus: b });
    }
}

/** Sparkles settling after the burst. High, thin, slightly random — glitter rather than a chime. */
export function shimmer(count = 12) {
    const b = ensure();
    if (!b) return;
    for (let i = 0; i < count; i += 1) {
        tone({
            freq: 2200 + Math.random() * 3400,
            type: "sine",
            at: 0.04 + Math.random() * 0.7,
            dur: 0.1 + Math.random() * 0.14,
            gain: 0.022,
            bus: b,
        });
    }
}

/**
 * The tier, said out loud. A chord whose size IS the news: one note for a common, a full stack for a mythic.
 * Pitches climb with the tier so the ear ranks them without being taught.
 */
export function tierChord(index = 0) {
    const b = ensure();
    if (!b) return;
    const i = Math.max(0, Math.min(5, index));
    const root = [196, 220, 262, 294, 330, 392][i];
    const voices = [1, 1.5, 2, 2.5, 3, 4][i];
    const sustain = 0.25 + i * 0.16;
    for (let v = 0; v < Math.ceil(voices); v += 1) {
        tone({
            freq: root * [1, 1.5, 2, 2.5][v % 4],
            type: v === 0 ? "triangle" : "sine",
            at: v * 0.045,
            dur: sustain,
            gain: 0.07 - v * 0.012,
            bus: b,
        });
    }
}

/** A big hit. Held, and deliberately longer than anything else in the sequence — it is allowed to interrupt. */
export function fanfare() {
    const b = ensure();
    if (!b) return;
    const notes = [392, 494, 587, 784];
    notes.forEach((freq, i) => {
        tone({ freq, type: "triangle", at: i * 0.09, dur: 0.5 - i * 0.05, gain: 0.08, bus: b });
        tone({ freq: freq * 2, type: "sine", at: i * 0.09 + 0.02, dur: 0.3, gain: 0.03, bus: b });
    });
    noise({ at: 0.36, dur: 0.9, gain: 0.03, type: "bandpass", freq: 5000, q: 0.7, bus: b });
}
