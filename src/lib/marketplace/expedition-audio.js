"use client";

// ── THE EXPEDITION'S EARS ────────────────────────────────────────────────────────────────────────────────────
// A charted expedition is nineteen beats long and almost all of them are WAITING. You open the chart, you plot
// a pin, you watch thirty seconds of open water, a sail appears, guns go off, you beach, you walk. Read the
// list in expedition.js and what you have is a sequence of screens that each hold a member's attention for
// somewhere between four and forty seconds with nothing happening on them. Silence is what turns that from a
// voyage into a progress bar, and the single most expensive moment in the feature — the island coming out of
// the chart — had no sound on it at all.
//
// ⚠️ WHY THIS HANGS OFF THE ARENA AND DOES NOT BUILD A CONTEXT ────────────────────────────────────────────────
// Chrome allows roughly SIX AudioContexts per document and the seventh throws. The arena learned that the
// expensive way: it built a new context per blip inside a try/catch that swallowed the error, so a fight went
// permanently silent three beats in and nothing anywhere said why (see the header of arena-audio.js). This
// feature is the one most likely to re-earn that bug, because the sea already spends contexts — SailingClient.js
// carries a private nine-voice kit with its own `_ac`, and ShipBattleScene.js carries another with its own
// `ac()`. A member who sails out, fights a warden and then opens a chart has already walked past two of the six
// before this module plays a single note. A third one here is not a risk, it is the same bug with a different
// file name.
//
// So: no context, no master, no mute switch of its own. `subBus()` hands back a gain node already wired into
// the arena's limiter, and `tone`/`noise` are the arena's own voice helpers. Everything in this file rides the
// one context, the one compressor and the one stored mute preference the whole Den already shares.
//
// WHY NOT JUST USE `Sfx` OR THE SAILING KIT. The arena's kit is a fight and the casino's is a cabinet; neither
// has a ship's horn or the sound of paper in it. SailingClient's nine voices DO — a horn, a gust, bells, a
// hammer — and that is the palette the sea already sounds like, so everything below is deliberately built out
// of the same materials: low sawtooth horns, sine bells around 988/1319, filtered noise for wind and water,
// and short bright metal for anything made of brass. It has to sound like it belongs beside `sfx.depart()`,
// because a member hears both in the same minute.
//
// HAPTICS ARE PART OF THE VOICE, NOT A LAYER OVER IT. Authored inline the way cards-sound.js does it, so a beat
// is one decision rather than two files that drift. `navigator.vibrate` is a no-op on desktop and on iOS
// Safari, so every call is best-effort and guarded.
import { isMuted, noise, subBus, tone, unlock } from "@/components/arena/arena-audio.js";

// ── THE BUS ──────────────────────────────────────────────────────────────────────────────────────────────────
// One gain node for the whole expedition, made lazily on the first voice that actually plays. Lazy because
// `subBus()` is what CONSTRUCTS the shared context, and doing that at import time would build audio hardware on
// a page nobody has touched yet — which is exactly what browsers refuse to allow and warn about. It also
// returns null during SSR and on a browser with no AudioContext, so the result is re-asked for rather than
// cached as a failure.
let bus = null;
function out() {
    if (!bus) bus = subBus(0.9);
    return bus;
}

// ── THE MUTE, CHECKED PER VOICE ──────────────────────────────────────────────────────────────────────────────
// `isMuted()` reads the arena's stored preference, which means a member who mutes from the fight screen is
// muted here too with no plumbing between the two. Read per call rather than cached because arena-audio exposes
// no way to be told the setting changed, and a stale `false` is a phone making noise after somebody asked it
// not to.
//
// AND THE MUTE TAKES THE HAPTICS WITH IT. Deliberate: mute is a member in a card shop saying "not now", and a
// phone buzzing on a glass counter is louder across a room than the speaker is.
function live() {
    if (isMuted()) return null;
    return out();
}

/** Fire a vibration pattern. Exported as `Exp.buzz` so a caller can take the feel without the sound. */
function buzz(pattern) {
    if (!pattern) return;
    try { navigator.vibrate?.(pattern); } catch { /* unsupported, and never worth throwing over */ }
}

const clamp01 = (n) => Math.max(0, Math.min(1, Number(n) || 0));

// ── THE PATTERNS ─────────────────────────────────────────────────────────────────────────────────────────────
// Shapes follow arena-audio's `Haptic`: a bare number is a single tap for UI, an array is [delay, on, off, on…]
// where a long first pulse is an impact and a run of short ones is a build-up. The entries that scale with an
// argument are functions of it, and `take` is a map by node kind — same arguments their voices take.
const H = {
    setSail: [0, 60, 70, 34, 55, 90],
    swell: 6,
    sighted: [0, 10, 70, 14, 60, 24],
    closing: (p) => {
        const c = clamp01(p);
        const n = 3 + Math.round(c * 3);
        const out2 = [0];
        for (let i = 0; i < n; i += 1) out2.push(8 + Math.round(c * 14), Math.round(120 - c * 70));
        return out2;
    },
    broadside: [0, 46, 34, 78],
    captainTaken: [0, 34, 46, 18, 44, 18, 52, 70],
    chartGiven: (stars) => {
        const s = Math.max(1, Math.min(5, Math.round(Number(stars) || 1)));
        const out2 = [0, 18];
        for (let i = 0; i < s; i += 1) out2.push(40, 16 + i * 10);
        return out2;
    },
    spyglass: 8,
    bearingLocked: (k) => [0, 14, 34, 20 + Math.max(0, Math.min(2, k | 0)) * 14],
    bearingMissed: 10,
    chartKnit: (k) => [0, 10, 40, 12 + Math.max(0, Math.min(2, k | 0)) * 8],
    chartSolved: [0, 28, 40, 28, 40, 46, 60, 130],
    courseSet: [0, 12, 55, 12, 55, 12, 60, 46],
    landSighted: [0, 20, 60, 20, 130, 36],
    dock: [0, 58, 40, 26],
    ashore: [0, 10, 70, 10, 76, 12],
    take: {
        wreck: [0, 40, 40, 22],
        cache: [0, 16, 30, 22, 30, 30],
        forage: [0, 12, 34, 14],
        shrine: [0, 20, 60, 34, 60, 50],
        fix: [0, 30, 40, 30, 40, 40, 50, 120],
    },
    tideLow: [0, 16, 90, 16],
    tideOut: [0, 76, 60, 96],
};

// ── THE ISLAND'S FIVE PRIZES ─────────────────────────────────────────────────────────────────────────────────
// Five things you can walk up to and take, and they have to be told apart with your eyes shut — a member walking
// an island is looking at the map, not at the label that just appeared. Separate functions rather than a table of
// parameters because the differences are structural, not numeric: a cache has a latch in it and forage does not,
// and no single set of dials expresses that. `fix` is the chart's marked prize and is deliberately three times
// the length of any of the others.
const TAKE = {
    // Wet timber giving up something that has been in the water a long time. Dull, low, no sparkle anywhere.
    wreck(b) {
        noise({ dur: 0.34, gain: 0.16, type: "bandpass", freq: 340, q: 0.7, sweepTo: 130, bus: b });
        tone({ freq: 138, to: 54, type: "sawtooth", dur: 0.3, gain: 0.16, bus: b });
        tone({ at: 0.14, freq: 196, to: 147, type: "triangle", dur: 0.24, gain: 0.06, bus: b });
    },
    // A latch, a lid, and coin. The only one of the five with a mechanism in it.
    cache(b) {
        noise({ dur: 0.035, gain: 0.11, type: "bandpass", freq: 2600, q: 6, bus: b });
        tone({ freq: 420, to: 220, type: "square", dur: 0.06, gain: 0.07, bus: b });
        tone({ at: 0.07, freq: 132, to: 52, type: "sine", dur: 0.2, gain: 0.16, bus: b });
        [659.25, 880, 1046.5].forEach((f, i) => {
            tone({ at: 0.11 + i * 0.055, freq: f, type: "triangle", dur: 0.26, gain: 0.07, bus: b });
        });
    },
    // Leaves and a stalk. Soft, organic, over almost before it starts — this is the one you do most often.
    forage(b) {
        noise({ dur: 0.1, gain: 0.07, type: "highpass", freq: 3200, sweepTo: 5600, bus: b });
        tone({ at: 0.04, freq: 523.25, type: "sine", dur: 0.14, gain: 0.05, bus: b });
        tone({ at: 0.1, freq: 659.25, type: "sine", dur: 0.26, gain: 0.045, bus: b });
    },
    // Stone, and something older than the island's owners. The only reverent sound in the file: one struck
    // chime left to ring a long way past the thing that struck it.
    shrine(b) {
        tone({ freq: 104, to: 46, type: "sine", dur: 0.26, gain: 0.2, bus: b });
        noise({ dur: 0.12, gain: 0.08, type: "lowpass", freq: 900, sweepTo: 220, bus: b });
        [392, 587.33, 784].forEach((f, i) => {
            tone({ at: 0.05 + i * 0.02, freq: f, type: "sine", dur: 1.5 - i * 0.2, gain: 0.08 / (i + 1), bus: b });
        });
        noise({ at: 0.1, dur: 0.9, gain: 0.03, type: "highpass", freq: 5400, bus: b });
    },
    // ── THE MARK ─────────────────────────────────────────────────────────────────────────────────────────
    // The thing the chart was for. Everything else on the island is a pocketful; this is the reason anybody
    // plotted a pin, and it is the only prize on the ground that gets a run, a held chord and a boom under it.
    fix(b) {
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
            tone({ at: i * 0.07, freq: f, type: "triangle", dur: 0.5, gain: 0.11, bus: b });
        });
        [783.99, 1046.5, 1318.5].forEach((f, i) => {
            tone({ at: 0.28, freq: f, type: "triangle", dur: 1.4 - i * 0.2, gain: 0.09, bus: b });
            tone({ at: 0.28, freq: f * 2, type: "sine", dur: 0.9, gain: 0.03, bus: b });
        });
        tone({ at: 0.24, freq: 98, to: 49, type: "sine", dur: 1.1, gain: 0.24, bus: b });
        noise({ at: 0.28, dur: 1.0, gain: 0.05, type: "highpass", freq: 5200, bus: b });
    },
};

export const Exp = {
    /** Call from a user gesture — the tap that opens the chart. Safe to call repeatedly; delegates to the arena. */
    unlock() { unlock(); return this; },

    /** Fire a pattern from `Exp.haptics` without playing anything. */
    buzz(pattern) { buzz(pattern); return this; },

    /** The patterns, so a caller can take the feel without the sound. See `H` above for the shapes. */
    haptics: H,

    // ── 1. OFF THE QUAY ──────────────────────────────────────────────────────────────────────────────────
    // Feels like: committing. The horn is the loudest thing in the file and it is meant to be — this is the
    // point past which the chart is spent and the island is decided, and it should sound like a door closing
    // behind you rather than a button being pressed.
    setSail() {
        const b = live(); if (!b) return this;
        // The horn: two sawtooths a fifth apart, falling the way a real one settles as the air runs out.
        tone({ freq: 128, to: 92, type: "sawtooth", dur: 0.85, gain: 0.18, bus: b });
        tone({ at: 0.02, freq: 192, to: 138, type: "sawtooth", dur: 0.8, gain: 0.08, bus: b });
        tone({ freq: 64, to: 46, type: "sine", dur: 0.95, gain: 0.2, bus: b });
        // Water breaking away from the bow, under it.
        noise({ at: 0.1, dur: 0.9, gain: 0.09, type: "bandpass", freq: 320, sweepTo: 1600, q: 0.7, bus: b });
        // And the two bells off the quay — the same interval SailingClient's `depart` rings, on purpose.
        tone({ at: 0.36, freq: 987.77, type: "sine", dur: 0.55, gain: 0.1, bus: b });
        tone({ at: 0.5, freq: 1318.5, type: "sine", dur: 0.6, gain: 0.09, bus: b });
        buzz(H.setSail);
        return this;
    },

    // ── 2. OPEN WATER ────────────────────────────────────────────────────────────────────────────────────
    // Feels like: nothing in particular, which is the job. Called every few seconds across the run so it is
    // the quietest voice here by a distance; `n` moves the pitch and the length so two in a row are never the
    // same swell, because a repeating identical wave is a fault noise rather than a sea.
    swell(n = 0.5) {
        const b = live(); if (!b) return this;
        const v = clamp01(n);
        noise({ dur: 1.1 + v * 0.5, gain: 0.05, type: "bandpass", freq: 180 + v * 90,
            sweepTo: 520 + v * 380, q: 0.6, bus: b });
        tone({ freq: 62 + v * 18, to: 44 + v * 10, type: "sine", dur: 1.0 + v * 0.4, gain: 0.07, bus: b });
        // The floor of the kit: it fires every few seconds, and anything a member can actually feel at that
        // rate is a phone they will put face down.
        buzz(H.swell);
        return this;
    },

    // ── 3. A SAIL ON THE HORIZON ─────────────────────────────────────────────────────────────────────────
    // Feels like: the back of your neck. Everything else at sea falls — horns, swells, the wind dropping — so
    // this one RISES, which is the whole tell: a shape the ear has not heard yet in this feature means the
    // thing that just happened is not weather.
    sighted() {
        const b = live(); if (!b) return this;
        // The lookout's call: two rising notes, the second above the first and both unresolved.
        tone({ freq: 523.25, to: 1174.7, type: "triangle", dur: 0.3, gain: 0.1, bus: b });
        tone({ at: 0.16, freq: 783.99, to: 1661.2, type: "sine", dur: 0.34, gain: 0.07, bus: b });
        // Air sucked in behind it.
        noise({ dur: 0.44, gain: 0.07, type: "bandpass", freq: 600, sweepTo: 4200, q: 1.5, bus: b });
        // And a low note left hanging under the whole thing, which is what makes it tense rather than pretty.
        tone({ at: 0.06, freq: 110, to: 116, type: "sawtooth", dur: 0.9, gain: 0.09, bus: b });
        buzz(H.sighted);
        return this;
    },

    // ── 4. SHE IS COMING UP ──────────────────────────────────────────────────────────────────────────────
    // Feels like: a clock speeding up. `p` is 0..1, how close the warden is, and it buys BOTH the pitch and
    // the rate — a bed that only gets louder reads as a volume knob, while one that gets faster reads as
    // something closing. The pulses are laid on the audio clock rather than fired one per call so the
    // acceleration is exact regardless of what React is doing that frame.
    closing(p = 0.5) {
        const b = live(); if (!b) return this;
        const c = clamp01(p);
        const beats = 3 + Math.round(c * 3);
        const gap = 0.2 - c * 0.105;
        const base = 156 * (1 + c * 0.75);
        for (let i = 0; i < beats; i += 1) {
            tone({ at: i * gap, freq: base * (1 + i * 0.045), to: base * 0.62, type: "square",
                dur: gap * 0.8, gain: 0.05 + c * 0.05, bus: b });
            noise({ at: i * gap, dur: 0.05, gain: 0.03 + c * 0.04, type: "lowpass", freq: 700, bus: b });
        }
        // One band sweeping up across the whole figure, so the pulses sit inside something rather than beside it.
        noise({ dur: beats * gap, gain: 0.035 + c * 0.03, type: "bandpass", freq: 300 + c * 300,
            sweepTo: 1800 + c * 2200, q: 1.3, bus: b });
        buzz(H.closing(c));
        return this;
    },

    // ── 5. BROADSIDE ─────────────────────────────────────────────────────────────────────────────────────
    // Feels like: weight. The shape is ShipBattleScene's `sfxGun` for a round shot — a bright crack sweeping
    // hard down into a sine that drops off the bottom — but fired TWICE, twenty milliseconds apart, because a
    // broadside is a row of guns and a single gun is a duel. The second is quieter and lower: the far end of
    // the ship, further away.
    broadside() {
        const b = live(); if (!b) return this;
        noise({ dur: 0.34, gain: 0.16, type: "bandpass", freq: 1500, sweepTo: 180, q: 0.8, bus: b });
        tone({ freq: 120, to: 38, type: "sine", dur: 0.34, gain: 0.26, bus: b });
        noise({ at: 0.022, dur: 0.4, gain: 0.12, type: "bandpass", freq: 1100, sweepTo: 150, q: 0.8, bus: b });
        tone({ at: 0.022, freq: 96, to: 31, type: "sine", dur: 0.44, gain: 0.2, bus: b });
        // The sub that a phone speaker cannot reproduce and a pair of headphones turns into recoil.
        tone({ at: 0.03, freq: 52, to: 27, type: "sine", dur: 0.6, gain: 0.18, bus: b });
        buzz(H.broadside);
        return this;
    },

    // ── 6. A MAN IN THE BRIG ─────────────────────────────────────────────────────────────────────────────
    // Feels like: winning something you are not sure you should enjoy. A short brass FALL rather than a
    // fanfare — three notes down, which no celebration in this codebase does — and then iron, so the last
    // thing in your ear is the hardware rather than the horns.
    captainTaken() {
        const b = live(); if (!b) return this;
        [392, 329.63, 261.63].forEach((f, i) => {
            tone({ at: i * 0.11, freq: f, type: "sawtooth", dur: 0.28, gain: 0.11, bus: b });
            tone({ at: i * 0.11, freq: f * 1.5, type: "triangle", dur: 0.22, gain: 0.05, bus: b });
        });
        // Chain. Deliberately uneven spacing — links do not fall on a grid, and four evenly spaced clinks is
        // a cowbell.
        [0.3, 0.345, 0.42, 0.44, 0.53].forEach((at, i) => {
            noise({ at, dur: 0.035, gain: 0.07 - i * 0.008, type: "bandpass", freq: 2400 + i * 340, q: 7, bus: b });
        });
        // The door of it.
        tone({ at: 0.55, freq: 88, to: 40, type: "square", dur: 0.36, gain: 0.16, bus: b });
        noise({ at: 0.55, dur: 0.3, gain: 0.09, type: "lowpass", freq: 420, sweepTo: 110, bus: b });
        buzz(H.captainTaken);
        return this;
    },

    // ── 7. HE GIVES UP A CHART ───────────────────────────────────────────────────────────────────────────
    // Feels like: being handed something. Paper first, then the sting, and the sting's BRIGHTNESS is what
    // `stars` buys — more partials, higher, held longer — rather than more volume. A one-star chart and a
    // five-star chart are the same gesture at two different qualities, which is what the captain's grade is.
    chartGiven(stars = 1) {
        const b = live(); if (!b) return this;
        const s = Math.max(1, Math.min(5, Math.round(Number(stars) || 1)));
        // Unrolling: a long band of noise climbing, plus the crackle of the sheet fighting it.
        noise({ dur: 0.5, gain: 0.08, type: "highpass", freq: 2000, sweepTo: 6000, bus: b });
        [0, 0.09, 0.17, 0.28].forEach((at, i) => {
            noise({ at, dur: 0.04, gain: 0.05 - i * 0.006, type: "bandpass", freq: 3400 + i * 500, q: 2.4, bus: b });
        });
        // The sting. One note per star, up a major triad and out of it, so five is audibly longer as well as
        // higher and nobody has to read the number.
        const LADDER = [440, 554.37, 659.25, 880, 1108.73, 1318.5];
        for (let i = 0; i < s + 1; i += 1) {
            tone({ at: 0.3 + i * 0.065, freq: LADDER[i], type: "triangle", dur: 0.42, gain: 0.08, bus: b });
        }
        // Three stars and up get a shimmer over the top — the same "this one is good" tell the chests use.
        if (s >= 3) noise({ at: 0.34, dur: 0.5 + s * 0.08, gain: 0.03 + s * 0.006, type: "highpass", freq: 5600, bus: b });
        tone({ at: 0.3, freq: 110, to: 220, type: "sine", dur: 0.5, gain: 0.1, bus: b });
        buzz(H.chartGiven(s));
        return this;
    },

    // ── 8. THE GLASS ─────────────────────────────────────────────────────────────────────────────────────
    // Feels like: brass in your hand. Short and dry, because it fires on a tap and anything with a tail on it
    // grates by the fifth look. The slide up and the click are the whole sound — a spyglass is two noises.
    spyglass() {
        const b = live(); if (!b) return this;
        noise({ dur: 0.12, gain: 0.07, type: "bandpass", freq: 900, sweepTo: 2800, q: 3.4, bus: b });
        tone({ freq: 330, to: 620, type: "triangle", dur: 0.12, gain: 0.05, bus: b });
        noise({ at: 0.13, dur: 0.022, gain: 0.09, type: "bandpass", freq: 3200, q: 8, bus: b });
        tone({ at: 0.13, freq: 880, type: "square", dur: 0.035, gain: 0.05, bus: b });
        buzz(H.spyglass);
        return this;
    },

    // ── 9. A BEARING TAKEN ───────────────────────────────────────────────────────────────────────────────
    // Feels like: a latch dropping into place. `k` is which of the three, and the three are the notes of ONE
    // chord rather than three copies of a click — so the sequence tells you how far through you are without a
    // counter, and the third one resolves what the first two left open. Landing the last rings all three
    // together, which is the only moment the chord exists.
    bearingLocked(k = 0) {
        const b = live(); if (!b) return this;
        const i = Math.max(0, Math.min(2, k | 0));
        const TRIAD = [392, 493.88, 587.33];
        tone({ freq: TRIAD[i], type: "triangle", dur: 0.3, gain: 0.1, bus: b });
        tone({ at: 0.005, freq: TRIAD[i] * 2, type: "sine", dur: 0.2, gain: 0.035, bus: b });
        // The mechanism under the note — low, short, felt.
        tone({ at: 0.005, freq: 150, to: 58, type: "sine", dur: 0.13, gain: 0.16, bus: b });
        noise({ dur: 0.03, gain: 0.06, type: "bandpass", freq: 2200, q: 5, bus: b });
        if (i === 2) TRIAD.forEach((f, j) => tone({ at: 0.1, freq: f, type: "sine", dur: 0.9 - j * 0.12, gain: 0.06, bus: b }));
        buzz(H.bearingLocked(i));
        return this;
    },

    // ── 10. NOT QUITE ────────────────────────────────────────────────────────────────────────────────────
    // Feels like: shrugging. ⚠️ THIS MUST NOT READ AS FAILURE. A bearing is taken by eye against a moving
    // horizon and missing one costs accuracy, not the run — see [[captains-brig]] for what happens when a
    // step between a member and their earned reward sounds like a wall. So: no transient, no noise, no drop
    // to the bottom. Two sine notes a whole tone apart, quieter than anything else in the file, gone in a
    // quarter of a second.
    bearingMissed() {
        const b = live(); if (!b) return this;
        tone({ freq: 440, type: "sine", dur: 0.14, gain: 0.045, bus: b });
        tone({ at: 0.09, freq: 392, type: "sine", dur: 0.22, gain: 0.04, bus: b });
        buzz(H.bearingMissed);
        return this;
    },

    // ── 11. THE PIECES COME TOGETHER ─────────────────────────────────────────────────────────────────────
    // Feels like: paper sliding on paper. `k` 0..2 climbs, so three of these in a row are a build rather than
    // three identical shuffles — and the climb is what makes the fourth beat, `chartSolved`, land on
    // something.
    chartKnit(k = 0) {
        const b = live(); if (!b) return this;
        const i = Math.max(0, Math.min(2, k | 0));
        noise({ dur: 0.16, gain: 0.07, type: "highpass", freq: 2200 + i * 700, sweepTo: 5200 + i * 800, bus: b });
        tone({ at: 0.04, freq: 349.23 * (1 + i * 0.26), type: "triangle", dur: 0.26, gain: 0.06, bus: b });
        tone({ at: 0.04, freq: 116 + i * 22, to: 88 + i * 18, type: "sine", dur: 0.2, gain: 0.08, bus: b });
        buzz(H.chartKnit(i));
        return this;
    },

    // ── 12. THE ISLAND ───────────────────────────────────────────────────────────────────────────────────
    // Feels like: the payoff for everything above it, and it is — this is the single biggest moment in the
    // sequence and it had no sound on it at all. Three layers because one is a chime and two is a chord:
    // the SNAP of the last piece going home (very short, very high, no pitch), the chord over it stacked in
    // thirds — the only stacked-third chord in this file, so nothing else in the feature sounds like this —
    // and a boom underneath that is still ringing after the screen has finished drawing the coastline.
    chartSolved() {
        const b = live(); if (!b) return this;
        // The snap.
        noise({ dur: 0.045, gain: 0.2, type: "highpass", freq: 4400, bus: b });
        noise({ at: 0.005, dur: 0.14, gain: 0.09, type: "bandpass", freq: 2600, sweepTo: 800, q: 2.2, bus: b });
        // The chord, arriving as a run and then held.
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
            tone({ at: 0.04 + i * 0.055, freq: f, type: "triangle", dur: 0.6, gain: 0.12, bus: b });
            tone({ at: 0.04 + i * 0.055, freq: f * 2, type: "sine", dur: 0.4, gain: 0.04, bus: b });
        });
        [783.99, 1046.5, 1318.5, 1567.98].forEach((f, i) => {
            tone({ at: 0.3, freq: f, type: "triangle", dur: 1.8 - i * 0.22, gain: 0.08, bus: b });
        });
        noise({ at: 0.3, dur: 1.4, gain: 0.05, type: "highpass", freq: 5200, bus: b });
        // And the boom. Long, low, and it outlives everything above it on purpose.
        tone({ at: 0.02, freq: 92, to: 34, type: "sine", dur: 1.9, gain: 0.3, bus: b });
        tone({ at: 0.06, freq: 61, to: 30, type: "sine", dur: 2.1, gain: 0.2, bus: b });
        buzz(H.chartSolved);
        return this;
    },

    // ── 13. THE WHEEL ────────────────────────────────────────────────────────────────────────────────────
    // Feels like: a decision you cannot take back. A ratchet — spokes going through your hands — then the
    // bell, then a low note that settles rather than strikes. Same family as `setSail`, one rung quieter,
    // because this is the second commitment of the run and not the first.
    courseSet() {
        const b = live(); if (!b) return this;
        for (let i = 0; i < 6; i += 1) {
            noise({ at: i * 0.048, dur: 0.02, gain: 0.06, type: "bandpass", freq: 1800 + i * 220, q: 6, bus: b });
        }
        tone({ at: 0.3, freq: 987.77, type: "sine", dur: 0.9, gain: 0.11, bus: b });
        tone({ at: 0.31, freq: 1479.98, type: "sine", dur: 0.5, gain: 0.04, detune: 8, bus: b });
        tone({ at: 0.3, freq: 110, to: 146.83, type: "sine", dur: 0.7, gain: 0.14, bus: b });
        buzz(H.courseSet);
        return this;
    },

    // ── 14. LAND HO ──────────────────────────────────────────────────────────────────────────────────────
    // Feels like: relief with something still ahead of it. A ship's bell is struck in PAIRS and that rhythm
    // is the entire recognition — two, a gap, two — so it is a bell being rung at somebody rather than a
    // chime going off. The lift after it is a triad that climbs and does not resolve, because you have seen
    // the island and you are not on it yet.
    landSighted() {
        const b = live(); if (!b) return this;
        [0, 0.13, 0.42, 0.55].forEach((at, i) => {
            tone({ at, freq: 1046.5, type: "sine", dur: 0.55, gain: 0.11, detune: i * 4, bus: b });
            // The inharmonic partial is what makes it a bell rather than a beep.
            tone({ at, freq: 1590, type: "sine", dur: 0.4, gain: 0.035, bus: b });
            noise({ at, dur: 0.05, gain: 0.04, type: "highpass", freq: 6000, bus: b });
        });
        [523.25, 659.25, 830.61].forEach((f, i) => {
            tone({ at: 0.72 + i * 0.075, freq: f, type: "triangle", dur: 0.7, gain: 0.08, bus: b });
        });
        tone({ at: 0.72, freq: 98, to: 196, type: "sine", dur: 0.8, gain: 0.12, bus: b });
        buzz(H.landSighted);
        return this;
    },

    // ── 15. ALONGSIDE ────────────────────────────────────────────────────────────────────────────────────
    // Feels like: something heavy stopping. Hull on timber, a rope taking the strain, and a thunk with no
    // pitch you could name. Nothing bright anywhere in it — arriving is not a reward, it is an arrival.
    dock() {
        const b = live(); if (!b) return this;
        tone({ freq: 118, to: 38, type: "sine", dur: 0.42, gain: 0.32, bus: b });
        tone({ at: 0.006, freq: 59, to: 28, type: "sine", dur: 0.55, gain: 0.22, bus: b });
        noise({ dur: 0.24, gain: 0.18, type: "lowpass", freq: 2000, sweepTo: 240, bus: b });
        // The timber's own knock, a hair late, so it reads as the hull answering the pier.
        tone({ at: 0.07, freq: 196, to: 88, type: "square", dur: 0.13, gain: 0.07, bus: b });
        // Rope under load — a narrow band creaking DOWN.
        noise({ at: 0.11, dur: 0.4, gain: 0.05, type: "bandpass", freq: 1200, sweepTo: 340, q: 5, bus: b });
        buzz(H.dock);
        return this;
    },

    // ── 16. BOOTS ON SHINGLE ─────────────────────────────────────────────────────────────────────────────
    // Feels like: quiet. Three steps, unevenly spaced and each a little different, and nothing else — no
    // note, no chord, nothing announcing the achievement of having walked down a plank. The uneven spacing
    // is the whole thing: three evenly spaced crunches is a machine.
    ashore() {
        const b = live(); if (!b) return this;
        [[0, 1], [0.17, 0.82], [0.31, 0.94]].forEach(([at, v]) => {
            noise({ at, dur: 0.09, gain: 0.08 * v, type: "bandpass", freq: 1500 * v, sweepTo: 420, q: 0.9, bus: b });
            tone({ at, freq: 92 * v, to: 46, type: "sine", dur: 0.08, gain: 0.09 * v, bus: b });
        });
        // Water somewhere behind you, already further away than it was.
        noise({ at: 0.12, dur: 0.7, gain: 0.035, type: "bandpass", freq: 900, sweepTo: 380, q: 0.6, bus: b });
        buzz(H.ashore);
        return this;
    },

    // ── 17. TAKING SOMETHING ─────────────────────────────────────────────────────────────────────────────
    // Feels like: five different things, on purpose. See `TAKE` above for what each one is made of. An
    // unknown kind falls back to forage rather than going silent, because a node-kind typo must not be the
    // reason a member's island has no sound in it.
    take(kind = "forage") {
        const b = live(); if (!b) return this;
        const k = TAKE[kind] ? kind : "forage";
        TAKE[k](b);
        buzz(H.take[k]);
        return this;
    },

    // ── 18. THE WATER IS GOING ───────────────────────────────────────────────────────────────────────────
    // Feels like: noticing something. ⚠️ NOT AN ALARM. The tide is measured so it can never cost a member the
    // prize they plotted for, so a klaxon here would be the game lying about the stakes. It is two low notes
    // a few cents apart left to BEAT against each other — a slow wobble with no transient in it, which the
    // ear reads as wrong without being able to say why — and one bell a long way off.
    tideLow() {
        const b = live(); if (!b) return this;
        tone({ freq: 146.83, type: "sine", dur: 1.6, gain: 0.1, bus: b });
        tone({ freq: 146.83, type: "sine", dur: 1.6, gain: 0.09, detune: 22, bus: b });
        tone({ at: 0.2, freq: 73.42, to: 66, type: "sine", dur: 1.5, gain: 0.1, bus: b });
        // The bell, quiet and late — somebody else's ship, not yours.
        tone({ at: 0.6, freq: 830.61, type: "sine", dur: 1.1, gain: 0.04, bus: b });
        // Water draining off stone.
        noise({ at: 0.1, dur: 1.3, gain: 0.035, type: "bandpass", freq: 1400, sweepTo: 260, q: 0.8, bus: b });
        buzz(H.tideLow);
        return this;
    },

    // ── 19. OUT OF WATER ─────────────────────────────────────────────────────────────────────────────────
    // Feels like: the end of something. The horn from `setSail`, played downwards and without the bells —
    // the same voice that started the run closing it, which is the cheapest way to make nineteen beats read
    // as one journey. The sea comes over the top of it last.
    tideOut() {
        const b = live(); if (!b) return this;
        tone({ freq: 110, to: 58, type: "sawtooth", dur: 1.3, gain: 0.17, bus: b });
        tone({ at: 0.03, freq: 165, to: 87, type: "sawtooth", dur: 1.2, gain: 0.07, bus: b });
        tone({ at: 0.05, freq: 55, to: 29, type: "sine", dur: 1.5, gain: 0.22, bus: b });
        // And the water, sweeping down and closing over it.
        noise({ at: 0.25, dur: 1.1, gain: 0.1, type: "bandpass", freq: 1600, sweepTo: 180, q: 0.7, bus: b });
        noise({ at: 0.9, dur: 0.5, gain: 0.06, type: "lowpass", freq: 500, sweepTo: 90, bus: b });
        buzz(H.tideOut);
        return this;
    },
};

export default Exp;
