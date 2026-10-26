"use client";

// ── THE PACK'S EARS ──────────────────────────────────────────────────────────────────────────────────────────
// A pack opening is at least half a sound. The picture is a rectangle sliding upward; what makes it worth
// doing twice is the foil crinkle, the held breath at the top of the rise, and the weight of the slam. Take
// those away and it is a database row in a modal.
//
// ⚠️ EVERYTHING GOES THROUGH THE ARENA'S SINGLE SHARED AudioContext, exactly as gacha-audio.js does, and for
// the same reason written at the top of casino-audio.js: Chrome allows roughly six contexts per document, and
// a member can already have the arena's and the casino cabinets' alive at once. A third module making its own
// would re-earn an expensive lesson.
//
// ⚠️ AND NOTHING HERE DECIDES ANYTHING. The tier is handed in. Sound follows the result; it never hints at one
// before the flip — see the note about the colourless rise in PackOpenClient.
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

/** The seal coming apart: mylar, which is all high-frequency scrape and no body. */
export function zip() {
    const b = ensure();
    if (!b) return;
    noise({ dur: 0.34, gain: 0.07, type: "bandpass", freq: 2600, q: 1.1, sweepTo: 5200, bus: b });
    noise({ at: 0.12, dur: 0.2, gain: 0.04, type: "highpass", freq: 3400, bus: b });
}

/**
 * The card coming up out of the bag. One long filtered sweep that climbs for the whole rise.
 *
 * ⚠️ IDENTICAL FOR EVERY TIER. This is the colourless-glow rule in sound: the rise must not tell you what you
 * got, or the player learns to read it and every common deflates before the card has even turned over.
 */
export function rise(durationMs = 1600) {
    const b = ensure();
    if (!b) return;
    const d = durationMs / 1000;
    noise({ dur: d, gain: 0.05, type: "bandpass", freq: 300, q: 2.4, sweepTo: 1800, bus: b });
    tone({ freq: 110, to: 220, type: "sine", dur: d, gain: 0.05, bus: b });
}

/** The card turning over. A single paper snap on the half-beat, where the face takes over. */
export function flip() {
    const b = ensure();
    if (!b) return;
    noise({ dur: 0.07, gain: 0.09, type: "bandpass", freq: 1800, q: 0.8, bus: b });
    tone({ freq: 320, to: 180, type: "triangle", dur: 0.08, gain: 0.05, bus: b });
}

/** Contact. Sub for the weight, a transient crack on top so it reads on a phone speaker with no bass at all. */
export function slam(strength = 0.5) {
    const b = ensure();
    if (!b) return;
    const k = Math.max(0, Math.min(1, strength));
    tone({ freq: 90 + k * 40, to: 38, type: "sine", dur: 0.18 + k * 0.3, gain: 0.1 + k * 0.14, bus: b });
    noise({ dur: 0.05, gain: 0.07 + k * 0.08, type: "lowpass", freq: 900 + k * 1800, bus: b });
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
