"use client";

// ── THE PLAZA'S EARS ─────────────────────────────────────────────────────────────────────────────────────────
// Luke, on the trick-or-treat pails: "collecting candy in town the bowl tap should be a dopamine inducing
// event. Id expect a noise vibration and vfx, maybe a candy explosion."
//
// A knock is three things arriving in the same tenth of a second: the knuckles on the wood, the wrappers, and
// the little flourish that says it paid. Separately they are sound effects; together they are the reward, and
// the gap between them is what makes a tap feel like it landed rather than like it registered.
//
// ⚠️ ON THE ARENA'S CONTEXT, THROUGH THE ARENA'S COMPRESSOR. Chrome allows about six AudioContexts per
// document and the arena already learned that lesson expensively — a module that made its own would re-earn
// it, and the Town can have the arena, the casino slots and this all alive on one page. `subBus` exists for
// exactly this; see the note at the top of arena-audio.js.
//
// ⚠️ AND NOTHING HERE EXISTS UNTIL A TAP. Browsers refuse to start audio without a gesture, so the context is
// built inside the knock handler and never before. There is nothing to block and nothing to warn about.
import { Haptic, killBus, noise, subBus, tone, unlock } from "@/components/arena/arena-audio.js";

// The pentatonic the casino is tuned to, an octave down. No semitone in it, so the sweets can land on random
// notes and still sound like one happy thing rather than like a mistake — that property is the entire reason
// an arbitrary number of overlapping pitches works here.
const PENT = [392.0, 440.0, 493.88, 587.33, 659.25];

let bus = null;
function ensureBus() {
    if (bus) return bus;
    unlock();
    bus = subBus(0.9);
    return bus;
}

/** Drop the bus when the plaza unmounts, so a long session does not accumulate gain nodes. */
export function stopTownAudio() {
    if (bus) { killBus(bus); bus = null; }
}

/**
 * A door answering, and paying.
 *
 * `n` is how much candy came out — it scales the handful, not the volume. A big night should sound BUSIER
 * rather than louder, because louder is the one axis a phone speaker cannot actually give you.
 */
export function knockSound({ candy = 5, trick = false, sweet = false, chest = false } = {}) {
    const b = ensureBus();
    if (!b) return;

    // ── THE KNOCK ────────────────────────────────────────────────────────────────────────────────────────
    // Two knuckles on a wooden door: a short low thud with almost no tail, twice, 90ms apart. The body is a
    // steep pitch drop rather than a fixed note — that fall is what makes wood sound like wood.
    tone({ freq: 190, to: 70, type: "sine", dur: 0.09, gain: 0.22, bus: b });
    noise({ at: 0, dur: 0.06, gain: 0.1, type: "lowpass", freq: 900, sweepTo: 260, bus: b });
    tone({ freq: 175, to: 65, type: "sine", at: 0.09, dur: 0.09, gain: 0.19, bus: b });
    noise({ at: 0.09, dur: 0.06, gain: 0.09, type: "lowpass", freq: 900, sweepTo: 260, bus: b });

    if (trick) {
        // ── THE JOKE ─────────────────────────────────────────────────────────────────────────────────────
        // A descending slide on a reedy square — the sound of somebody pretending the bowl is empty. It runs
        // UNDER the sweets rather than instead of them, because a trick still pays: the gag is the payload,
        // and a sound that replaced the reward would be telling the player they lost.
        tone({ freq: 440, to: 150, type: "square", at: 0.16, dur: 0.3, gain: 0.07, bus: b });
    }

    // ── THE WRAPPERS ─────────────────────────────────────────────────────────────────────────────────────
    // A short bright hiss, high-passed so it is all crinkle and no body. This is the sound doing the heavy
    // lifting: it is what "a handful of sweets going into a bag" is made of, and without it the pitched notes
    // below read as a UI chime.
    noise({ at: 0.2, dur: 0.26, gain: 0.085, type: "highpass", freq: 2600, sweepTo: 5200, bus: b });

    // ── THE HANDFUL ──────────────────────────────────────────────────────────────────────────────────────
    // One blip per sweet, scattered across 220ms with the gaps getting shorter — a cascade, not a metronome.
    // Six at the top: past that they stop being countable and the ear just hears "lots", so more would cost
    // CPU for nothing.
    const bits = Math.max(3, Math.min(6, Math.round(candy / 1.6)));
    for (let i = 0; i < bits; i += 1) {
        const at = 0.22 + (i / bits) ** 1.35 * 0.22;
        tone({
            freq: PENT[(i * 2 + bits) % PENT.length] * (i > bits - 3 ? 2 : 1),
            type: "triangle", at, dur: 0.1, gain: 0.075, bus: b,
        });
    }

    // ── AND THE FLOURISH ─────────────────────────────────────────────────────────────────────────────────
    // Only when something better than candy came out, so it stays rare enough to mean something. A rising
    // third for a sweet; the same plus the octave for a sealed box, which is the best thing a door can do.
    if (sweet || chest) {
        tone({ freq: 659.25, type: "triangle", at: 0.46, dur: 0.16, gain: 0.09, bus: b });
        tone({ freq: 880.0, type: "triangle", at: 0.55, dur: 0.2, gain: 0.09, bus: b });
        if (chest) tone({ freq: 1318.5, type: "triangle", at: 0.64, dur: 0.3, gain: 0.08, bus: b });
    }
}

// ── THE SKELETON COMING OUT OF THE BUCKET ────────────────────────────────────────────────────────────────
// ⚠️ IT CANNOT BE THE KNOCK SOUND. The rarest thing in the event was playing the same two knuckles on wood as
// the other seventeen porches, which is the audio version of the thing the seasonal-reskin rule is about: the
// moment is only a moment if it does not sound like the ordinary case with more of it.
//
// Three parts, in the order the eye sees them: the pail rattling as something inside realises it is caught,
// the CLATTER of a skeleton coming out of a bucket, and a scatter of bones receding as he bolts.
//
// The clatter is woodblock, not noise. A burst of filtered noise is a crash — a box being dropped — whereas
// bones are a handful of short, dry, pitched knocks landing on top of each other at slightly wrong intervals.
// Hence the prime-ish spacing and the detune: anything evenly spaced reads as a drum roll.
export function snatcherSound() {
    const b = ensureBus();
    if (!b) return;
    // The pail, rocking harder. Low, hollow, two bumps.
    tone({ freq: 150, to: 60, type: "sine", at: 0, dur: 0.1, gain: 0.2, bus: b });
    tone({ freq: 170, to: 70, type: "sine", at: 0.09, dur: 0.1, gain: 0.22, bus: b });
    // OUT. A short upward whoop under the clatter so the burst has a direction — up.
    tone({ freq: 220, to: 760, type: "triangle", at: 0.19, dur: 0.22, gain: 0.12, bus: b });
    const BONES = [0.2, 0.237, 0.268, 0.311, 0.344, 0.392, 0.431, 0.49];
    BONES.forEach((at, i) => {
        tone({ freq: 740 + (i % 4) * 180, type: "square", at, dur: 0.035, gain: 0.055, detune: (i * 37) % 90, bus: b });
        noise({ at, dur: 0.03, gain: 0.03, type: "highpass", freq: 3200, bus: b });
    });
}

/** He gives up and dumps the sack: a soft thud, then an avalanche of wrappers that keeps going. */
export function snatcherDropSound() {
    const b = ensureBus();
    if (!b) return;
    tone({ freq: 120, to: 48, type: "sine", at: 0, dur: 0.16, gain: 0.26, bus: b });
    // The avalanche. Longer and wider than a doorstep handful, because this IS the difference between four
    // sweets and a thousand — the ear counts duration, not volume.
    noise({ at: 0.04, dur: 0.72, gain: 0.1, type: "highpass", freq: 2200, sweepTo: 5600, bus: b });
    for (let i = 0; i < 14; i += 1) {
        const at = 0.06 + (i / 14) ** 1.25 * 0.62;
        tone({ freq: PENT[(i * 3 + 1) % PENT.length] * (i > 8 ? 2 : 1), type: "triangle", at, dur: 0.12, gain: 0.07, bus: b });
    }
    // And the flourish, an octave apart, which every other payout in the plaza only gets a third of.
    tone({ freq: 659.25, type: "triangle", at: 0.6, dur: 0.18, gain: 0.1, bus: b });
    tone({ freq: 987.77, type: "triangle", at: 0.7, dur: 0.22, gain: 0.1, bus: b });
    tone({ freq: 1318.5, type: "triangle", at: 0.8, dur: 0.34, gain: 0.09, bus: b });
}

/** A skeleton exploding out of a bucket, in your hand: one hard hit, then bones. */
export function snatcherHaptic() {
    Haptic.fire([0, 26, 40, 12, 30, 12, 26, 10, 22, 10, 60, 40]);
}

/**
 * The same event in your hand. Two taps for the knock, then a flutter for the sweets landing — so the pattern
 * has the SHAPE of the sound rather than being a single buzz pinned to it.
 *
 * navigator.vibrate is a no-op on desktop and on iOS Safari, so this is best-effort everywhere; Haptic.fire
 * already swallows the unsupported case.
 */
export function knockHaptic({ candy = 5, chest = false } = {}) {
    if (chest) { Haptic.fire([0, 18, 70, 18, 60, 30, 40, 55]); return; }
    const big = candy >= 6;
    Haptic.fire(big ? [0, 16, 80, 16, 70, 26, 40, 20] : [0, 14, 80, 14, 70, 22]);
}
