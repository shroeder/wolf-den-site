"use client";

// ── THE ARENA'S EARS ─────────────────────────────────────────────────────────────────────────────────────────
// One AudioContext for the whole feature, three buses, and every sound synthesised on the fly.
//
// WHY THIS EXISTS. The arena had a function that built a NEW AudioContext for every single blip and never
// closed one. Chrome allows about six per document; from the seventh onward construction throws, and it was
// called inside a try/catch that swallowed the error — so a fight went permanently silent three or four beats
// in and nothing anywhere said why. Everything below hangs off exactly one context.
//
// WHY SYNTHESIS RATHER THAN FILES. A fight needs roughly twenty distinct sounds plus music. As files that is a
// megabyte of assets to draw, host, cache-bust and 404 on; as synthesis it is this module, it costs nothing to
// download, and a new archetype is a few lines rather than a commission. It also lets a sound take ARGUMENTS —
// an impact is scaled by how hard the blow actually was, which sampled audio cannot do without a dozen takes.
//
// AUTOPLAY. Browsers refuse to start audio without a user gesture. Every entry point here is reached from a tap
// (challenging, choosing a command), and `unlock()` is called on the first one; before that the context does not
// exist at all, so nothing is blocked and nothing warns.

let ctx = null;
let master = null;
let sfxBus = null;
let musicBus = null;
let noiseBuf = null;
let muted = false;
let started = false;

const MUTE_KEY = "wolfden.arena.muted";

// ── PLUMBING ─────────────────────────────────────────────────────────────────────────────────────────────────
function ensure() {
    if (ctx) return ctx;
    if (typeof window === "undefined") return null;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = muted ? 0 : 0.9;
        master.connect(ctx.destination);

        // A gentle limiter so a crit landing on top of the music cannot clip. Cheap, and the difference between
        // "loud" and "harsh" on a phone speaker.
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -14;
        comp.knee.value = 22;
        comp.ratio.value = 8;
        comp.attack.value = 0.003;
        comp.release.value = 0.18;
        comp.connect(master);

        sfxBus = ctx.createGain();
        sfxBus.gain.value = 1;
        sfxBus.connect(comp);

        musicBus = ctx.createGain();
        musicBus.gain.value = 0;      // faded in by startMusic
        musicBus.connect(comp);

        // One second of white noise, reused by every percussive sound.
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i += 1) d[i] = Math.random() * 2 - 1;
    } catch {
        ctx = null;
    }
    return ctx;
}

/** Call from a user gesture. Safe to call repeatedly. */
export function unlock() {
    const c = ensure();
    if (!c) return;
    if (c.state === "suspended") c.resume().catch(() => {});
}

export function isMuted() {
    if (typeof window === "undefined") return false;
    try { return window.localStorage.getItem(MUTE_KEY) === "1"; } catch { return false; }
}

export function setMuted(next) {
    muted = Boolean(next);
    try { window.localStorage.setItem(MUTE_KEY, muted ? "1" : "0"); } catch { /* private mode */ }
    if (master && ctx) {
        const t = ctx.currentTime;
        master.gain.cancelScheduledValues(t);
        master.gain.setTargetAtTime(muted ? 0 : 0.9, t, 0.05);
    }
}

// Read the stored preference once, before anything can play.
if (typeof window !== "undefined") muted = isMuted();

// ── VOICE HELPERS ────────────────────────────────────────────────────────────────────────────────────────────
const now = () => (ctx ? ctx.currentTime : 0);

function tone({ freq = 440, type = "sine", at = 0, dur = 0.2, gain = 0.2, to = null, bus = null, detune = 0 }) {
    if (!ctx) return;
    const t = now() + at;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.detune.value = detune;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + Math.min(0.02, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(bus || sfxBus);
    o.start(t);
    o.stop(t + dur + 0.02);
}

function noise({ at = 0, dur = 0.2, gain = 0.2, type = "lowpass", freq = 1200, q = 1, sweepTo = null, bus = null }) {
    if (!ctx || !noiseBuf) return;
    const t = now() + at;
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + Math.min(0.012, dur * 0.25));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(bus || sfxBus);
    s.start(t);
    s.stop(t + dur + 0.02);
}

// Each element gets its own colour so a Fire spell and a Shadow spell are told apart with your eyes shut —
// which is the whole argument for having six of them.
const ELEMENT_VOICE = {
    fire: { type: "sawtooth", base: 320, filt: "lowpass", cut: 2200 },
    water: { type: "sine", base: 420, filt: "lowpass", cut: 1500 },
    earth: { type: "square", base: 180, filt: "lowpass", cut: 900 },
    storm: { type: "sawtooth", base: 640, filt: "highpass", cut: 800 },
    light: { type: "triangle", base: 780, filt: "highpass", cut: 500 },
    shadow: { type: "square", base: 220, filt: "lowpass", cut: 700 },
};

// ── THE SOUNDS ───────────────────────────────────────────────────────────────────────────────────────────────
// `weight` is 0..1 — how much of the target's vigour the blow took. It scales pitch, length and body, so a
// glancing hit and a fight-ending one are audibly different without a second asset.
export const Sfx = {
    ui() { tone({ freq: 660, type: "triangle", dur: 0.05, gain: 0.06 }); },

    /** Something being swung, before it connects. The anticipation half of a hit. */
    whoosh(at = 0) {
        noise({ at, dur: 0.22, gain: 0.1, type: "bandpass", freq: 380, sweepTo: 1900, q: 1.4 });
    },

    /**
     * Flesh-and-steel contact.
     *
     * THREE LAYERS, because a hit that is one layer is a click. The body is the pitch-drop you already hear;
     * under it a SUB that is felt more than heard, and over it the crack of the contact itself. The sub is
     * what a phone speaker cannot reproduce and a pair of headphones turns into weight — which is the point,
     * since the alternative is making the audible layers louder until they distort.
     */
    impact(weight = 0.3, at = 0) {
        const w = Math.max(0, Math.min(1, weight));
        tone({ at, freq: 150 - w * 55, to: 42, type: "sine", dur: 0.16 + w * 0.16, gain: 0.3 + w * 0.26 });
        // The sub. Starts fractionally late so it reads as the follow-through rather than the contact.
        tone({ at: at + 0.008, freq: 74, to: 33, type: "sine", dur: 0.2 + w * 0.24, gain: 0.16 + w * 0.22 });
        noise({ at, dur: 0.1 + w * 0.1, gain: 0.16 + w * 0.2, type: "lowpass", freq: 2600, sweepTo: 300 });
        if (w > 0.45) noise({ at: at + 0.012, dur: 0.1, gain: 0.1, type: "highpass", freq: 3200 });
        // Above half weight the contact gets its own crack — a very short band of noise, high and dry.
        if (w > 0.5) noise({ at, dur: 0.045, gain: 0.12 + w * 0.1, type: "bandpass", freq: 1500, q: 1.1 });
    },

    /** A crit: a rising tell, the impact, and a bright metallic ring on top so it is unmistakable. */
    crit(weight = 0.6, at = 0) {
        // THE RISE IS THE WHOLE TRICK. A crit that only differs after it lands is a louder hit; a crit with
        // 70ms of rising pitch in front of it is an EVENT, because you hear it coming and the ear leans in.
        tone({ at: Math.max(0, at - 0.07), freq: 300, to: 1500, type: "sawtooth", dur: 0.075, gain: 0.07 });
        Sfx.impact(Math.max(0.65, weight), at);
        tone({ at: at + 0.01, freq: 1180, type: "square", dur: 0.34, gain: 0.13, to: 2360 });
        tone({ at: at + 0.03, freq: 1760, type: "triangle", dur: 0.4, gain: 0.1 });
        noise({ at: at + 0.01, dur: 0.3, gain: 0.1, type: "highpass", freq: 4200 });
    },

    // ── THE JEWELCUTTER ──────────────────────────────────────────────────────────────────────────────────
    // This module is the house synth now, not only the arena's: the bench needs three sounds and none of them
    // is worth a second AudioContext, a second mute switch or a second set of buses. Kept here, named for what
    // they are, so the next feature that needs a noise reaches for this file rather than writing its own.

    /** The wheel on the stone: a rising whirr with grit in it, and the bite at the end. */
    cut(at = 0) {
        noise({ at, dur: 0.52, gain: 0.1, type: "bandpass", freq: 900, sweepTo: 2600, q: 3.2 });
        tone({ at, freq: 220, to: 460, type: "sawtooth", dur: 0.5, gain: 0.05 });
        // The moment it breaks through.
        noise({ at: at + 0.5, dur: 0.09, gain: 0.16, type: "highpass", freq: 3800 });
        tone({ at: at + 0.5, freq: 180, to: 60, type: "sine", dur: 0.2, gain: 0.22 });
    },

    /**
     * A jewel going home. Scaled by TIER, because a Chipped Ruby and a Flawless one should not sound alike:
     * the chime climbs the harmonic series as the tier does, and only the good ones get the long shimmering
     * tail. The thunk underneath is the same every time — that is the setting, not the stone.
     */
    gemSet(tier = 1, at = 0) {
        const t = Math.max(1, Math.min(5, Number(tier) || 1));
        const base = 660 * Math.pow(1.12, t - 1);
        // Three partials, struck a hair apart, which is what makes a chime read as glass rather than a beep.
        [1, 1.5, 2.02].forEach((mult, i) => {
            tone({ at: at + i * 0.014, freq: base * mult, type: "triangle", dur: 0.5 + t * 0.12,
                gain: 0.1 / (i + 1) });
        });
        // Seated: low, short, felt.
        tone({ at: at + 0.05, freq: 150, to: 52, type: "sine", dur: 0.22, gain: 0.26 });
        noise({ at: at + 0.05, dur: 0.08, gain: 0.1, type: "lowpass", freq: 1400 });
        // The tail only the top tiers earn.
        if (t >= 3) {
            tone({ at: at + 0.12, freq: base * 3, type: "sine", dur: 0.9 + t * 0.1, gain: 0.05 });
            noise({ at: at + 0.12, dur: 0.7, gain: 0.04, type: "highpass", freq: 5200 });
        }
    },

    /** A stone breaking out of its setting. Deliberately ugly — it is a thing you destroyed. */
    gemBreak(at = 0) {
        noise({ at, dur: 0.26, gain: 0.2, type: "bandpass", freq: 2200, q: 1.2, sweepTo: 700 });
        tone({ at, freq: 420, to: 90, type: "square", dur: 0.2, gain: 0.1 });
        tone({ at: at + 0.04, freq: 130, to: 48, type: "sine", dur: 0.28, gain: 0.2 });
    },

    /** Turning a blow aside — metal, short and hard. */
    block(strength = 0.5, at = 0) {
        const s = Math.max(0, Math.min(1, strength));
        tone({ at, freq: 2100 + s * 500, type: "square", dur: 0.1, gain: 0.12 });
        tone({ at, freq: 3150 + s * 600, type: "square", dur: 0.08, gain: 0.08, detune: 14 });
        noise({ at, dur: 0.11, gain: 0.14, type: "bandpass", freq: 2600, q: 2.6 });
    },

    /** A hit that got through your guard entirely: duller, lower, no ring. */
    hurt(weight = 0.4, at = 0) {
        const w = Math.max(0, Math.min(1, weight));
        tone({ at, freq: 190, to: 70, type: "sawtooth", dur: 0.2 + w * 0.14, gain: 0.2 + w * 0.2 });
        noise({ at, dur: 0.18, gain: 0.14 + w * 0.14, type: "lowpass", freq: 900, sweepTo: 180 });
    },

    /** A spell leaving your hands, coloured by its element. */
    spell(element = null, at = 0) {
        const v = ELEMENT_VOICE[element] || ELEMENT_VOICE.light;
        tone({ at, freq: v.base, to: v.base * 3, type: v.type, dur: 0.42, gain: 0.14 });
        tone({ at: at + 0.06, freq: v.base * 1.5, to: v.base * 4, type: "sine", dur: 0.36, gain: 0.1 });
        noise({ at, dur: 0.44, gain: 0.09, type: v.filt, freq: v.cut, sweepTo: v.cut * 2.2, q: 1.6 });
    },

    /** A committed physical skill. */
    strike(at = 0) {
        Sfx.whoosh(at);
        tone({ at: at + 0.1, freq: 420, to: 150, type: "sawtooth", dur: 0.22, gain: 0.18 });
    },

    /** A finisher, aimed at somebody already hurt. */
    execute(at = 0) {
        tone({ at, freq: 320, to: 60, type: "sawtooth", dur: 0.5, gain: 0.22 });
        tone({ at: at + 0.08, freq: 160, to: 40, type: "square", dur: 0.44, gain: 0.16 });
        noise({ at: at + 0.05, dur: 0.4, gain: 0.12, type: "lowpass", freq: 1400, sweepTo: 150 });
    },

    /** A coin in the air. */
    gamble(at = 0) {
        for (let i = 0; i < 7; i += 1) {
            tone({ at: at + i * 0.055, freq: 900 + ((i * 137) % 500), type: "triangle", dur: 0.07, gain: 0.08 });
        }
    },

    /** Bracing. A low swell that settles rather than strikes. */
    ward(at = 0) {
        tone({ at, freq: 130, to: 260, type: "sine", dur: 0.5, gain: 0.2 });
        tone({ at: at + 0.05, freq: 390, type: "triangle", dur: 0.42, gain: 0.09 });
        noise({ at, dur: 0.44, gain: 0.07, type: "lowpass", freq: 700, sweepTo: 1800 });
    },

    /** Sharpening. Rising, unresolved — it promises the next swing. */
    surge(at = 0) {
        tone({ at, freq: 300, to: 900, type: "sawtooth", dur: 0.36, gain: 0.14 });
        tone({ at: at + 0.09, freq: 450, to: 1350, type: "triangle", dur: 0.3, gain: 0.1 });
    },

    /** Guard: heavier and flatter than a ward — you planted rather than cast. */
    guard(at = 0) {
        tone({ at, freq: 110, to: 82, type: "square", dur: 0.26, gain: 0.2 });
        noise({ at, dur: 0.2, gain: 0.12, type: "lowpass", freq: 600 });
    },

    /** Vigour coming back. */
    heal(at = 0) {
        [523, 659, 784, 1046].forEach((f, i) => {
            tone({ at: at + i * 0.06, freq: f, type: "sine", dur: 0.3, gain: 0.1 });
        });
        noise({ at, dur: 0.4, gain: 0.05, type: "highpass", freq: 2600 });
    },

    /** Cooldowns cleared. */
    refresh(at = 0) {
        [392, 523, 659, 880, 1046].forEach((f, i) => {
            tone({ at: at + i * 0.045, freq: f, type: "triangle", dur: 0.22, gain: 0.09 });
        });
    },

    /** Something is coming at you. Deliberately unpleasant. */
    warn(at = 0) {
        tone({ at, freq: 300, type: "sawtooth", dur: 0.16, gain: 0.12 });
        tone({ at: at + 0.17, freq: 232, type: "sawtooth", dur: 0.2, gain: 0.12 });
    },

    // ── CHESTS ───────────────────────────────────────────────────────────────────────────────────────────────
    // Not arena sounds, but this is the Den's only audio engine — one context, one master, one stored mute — and
    // a second one would be the exact bug the header above describes. Opening a chest is the single most
    // celebratory thing in the game and it was completely silent: a 1.5s shake with no rattle and a full-screen
    // legendary reveal with no payoff at all.

    /** The box straining before it gives. Called once; it lays down its own little rhythm across `secs`. */
    chestRattle(secs = 1.4) {
        for (let i = 0; i < 5; i += 1) {
            // Knocks come faster and climb as the lid gets closer to going — anticipation, not a metronome.
            const at = (i * secs) / 6 + (i * i) * 0.012;
            tone({ at, freq: 96 + i * 13, to: 54, type: "sine", dur: 0.11, gain: 0.16 + i * 0.02 });
            noise({ at, dur: 0.07, gain: 0.05 + i * 0.012, type: "bandpass", freq: 900 + i * 260, q: 1.1 });
        }
    },

    /** The lid goes. A wooden crack, then the haul chiming out — longer and brighter the better it is. */
    chestOpen(rarity = "common", at = 0) {
        const RANK = { common: 0, rare: 1, epic: 2, legendary: 3, mythic: 4, ascendant: 5, eternal: 6 };
        const r = RANK[rarity] ?? 0;
        // The lid: a low thud with a splintery top, the same for every chest — what changes is what comes out.
        tone({ at, freq: 132, to: 44, type: "sine", dur: 0.3, gain: 0.34 });
        noise({ at, dur: 0.22, gain: 0.2, type: "lowpass", freq: 3000, sweepTo: 320 });
        noise({ at: at + 0.02, dur: 0.16, gain: 0.09 + r * 0.012, type: "highpass", freq: 3600 });
        // The haul: a rising figure, one note longer per tier, so an eternal is audibly a bigger deal than a
        // common without anybody having to read the word.
        const SCALE = [523, 659, 784, 988, 1175, 1319, 1568, 1976];
        const notes = Math.min(SCALE.length, 3 + r);
        for (let i = 0; i < notes; i += 1) {
            tone({ at: at + 0.1 + i * 0.062, freq: SCALE[i], type: r >= 3 ? "triangle" : "sine", dur: 0.34, gain: 0.13 });
        }
        // Epic and up get a shimmer over the top and a low swell underneath — the "this one is good" tell.
        if (r >= 2) {
            noise({ at: at + 0.1, dur: 0.5 + r * 0.1, gain: 0.05 + r * 0.008, type: "highpass", freq: 5200 });
            tone({ at: at + 0.08, freq: 82, to: 164, type: "sine", dur: 0.7, gain: 0.16 });
        }
        // The top tiers ring on afterwards rather than just stopping.
        if (r >= 4) [1568, 2093, 2637].forEach((f, i) => tone({ at: at + 0.34 + i * 0.09, freq: f, type: "sine", dur: 0.6, gain: 0.08 }));
    },

    /** A fighter goes down. */
    ko(at = 0) {
        tone({ at, freq: 220, to: 32, type: "sawtooth", dur: 0.9, gain: 0.3 });
        noise({ at, dur: 0.8, gain: 0.22, type: "lowpass", freq: 1800, sweepTo: 90 });
        tone({ at: at + 0.05, freq: 90, to: 28, type: "sine", dur: 0.85, gain: 0.28 });
    },

    /** The ladder counter ticking a rung. */
    tick(i = 0) {
        tone({ freq: 720 + i * 40, type: "triangle", dur: 0.07, gain: 0.11 });
    },

    victory() {
        const notes = [523, 659, 784, 1046];
        notes.forEach((f, i) => {
            tone({ at: i * 0.09, freq: f, type: "triangle", dur: 0.42, gain: 0.16 });
            tone({ at: i * 0.09, freq: f * 2, type: "sine", dur: 0.36, gain: 0.07 });
        });
        // The chord it lands on, held.
        [523, 659, 784, 1046, 1318].forEach((f) => {
            tone({ at: 0.42, freq: f, type: "triangle", dur: 1.5, gain: 0.09 });
        });
    },

    rankUp() {
        [659, 784, 988, 1318, 1568].forEach((f, i) => {
            tone({ at: i * 0.08, freq: f, type: "triangle", dur: 0.6, gain: 0.15 });
        });
        noise({ at: 0, dur: 0.9, gain: 0.06, type: "highpass", freq: 3000 });
    },

    defeat() {
        [440, 392, 330, 262].forEach((f, i) => {
            tone({ at: i * 0.16, freq: f, type: "sawtooth", dur: 0.6, gain: 0.13 });
        });
        tone({ at: 0.6, freq: 131, type: "sine", dur: 1.6, gain: 0.16 });
    },
};

// ── THE MUSIC ────────────────────────────────────────────────────────────────────────────────────────────────
// "THE PIT" — a war-drum processional, scheduled a beat ahead so it stays locked regardless of what React is
// doing. Layers come and go with INTENSITY, which the fight drives, so the music tells you you are losing
// before the number does.
//
// ── WHAT WAS WRONG WITH THE LAST ONE ─────────────────────────────────────────────────────────────────────────
// It was a sawtooth bass and a triangle pluck in A Phrygian dominant at 138bpm, over a four-bar loop that came
// round every seven seconds. Three separate problems, and they compounded:
//
//   1. SEVEN SECONDS. A bout runs a minute or two. You heard that phrase twenty times, and by the fifth you
//      were not hearing music any more, you were hearing a rhythm you had already learned.
//   2. THE MODE. Phrygian dominant is the harmonic-minor-with-a-flat-second sound every game reaches for when
//      it wants "gladiator", and reaching for it is exactly why it no longer says anything.
//   3. THE VOICES. A saw bass and a triangle pluck is a chiptune. It sounds like a menu, not like two people
//      trying to put each other on the floor.
//
// So: 100bpm, an EIGHT-bar phrase (~19 seconds, nearly three times the old loop), D natural minor, and the
// voices are struck and blown rather than plucked — taiko, low brass, an anvil on the backbeat, a choir pad,
// and a melody that only arrives once the fight is actually going. i–i–bVI–bVII–i–bIII–bVII–V: the cadence
// stays in the minor and the V at the end is what makes bar eight feel like a door rather than a splice.
const ROOT = 73.42;                                 // D2
const SCALE = [0, 2, 3, 5, 7, 8, 10];               // D natural minor (Aeolian)
const step = (deg, oct = 0) => ROOT * Math.pow(2, (SCALE[((deg % 7) + 7) % 7] + 12 * (oct + Math.floor(deg / 7))) / 12);
const semi = (n) => ROOT * Math.pow(2, n / 12);

const BPM = 100;
const SPB = 60 / BPM;
const STEPS = 16;                                   // sixteenth notes per bar
const BARS = 8;                                     // ...and a phrase is EIGHT of them
const SPS = SPB / 4;

let musicTimer = null;
let nextStepTime = 0;
let stepIndex = 0;
let intensity = 0.35;
let musicOn = false;

// Roots are semitone offsets from D. `third` is minor (3) or major (4) — the bVI, bVII and V are all major
// triads over a minor tonic, which is where the lift in the second half comes from.
const CHORDS = [
    { root: 0, third: 3 },   // i    Dm
    { root: 0, third: 3 },   // i    Dm
    { root: 8, third: 4 },   // bVI  Bb
    { root: 10, third: 4 },  // bVII C
    { root: 0, third: 3 },   // i    Dm
    { root: 3, third: 4 },   // bIII F
    { root: 10, third: 4 },  // bVII C
    { root: 7, third: 4 },   // V    A  — the turnaround
];

// ── THE DRUMS ── a war rhythm, not a backbeat. Hits on 0-3-6-8-11-14 land ahead of where a kick drum would,
// which is what makes it read as something being STRUCK by a person rather than a machine keeping time.
const TAIKO = [0, 3, 6, 8, 11, 14];
const TAIKO_HARD = [4, 12];                         // added once it is going badly

// ── THE MELODY ── [step, degree, lengthInSteps] per bar, sparse on purpose: it enters in bar two, says one
// thing per bar, and leaves a hole in bars 4 and 8 for the drums to answer it. Degrees are scale steps from D;
// 7 is the octave. This is the part you should be able to hum after two bouts.
const MELODY = [
    [],                                             // 1 — drums and brass alone; let the phrase start
    [[0, 7, 6], [8, 6, 3], [12, 5, 3]],             // 2 — D, C, Bb: down out of the octave
    [[0, 5, 8], [10, 4, 5]],                        // 3 — over the Bb: Bb held, then A
    [[0, 3, 6], [8, 4, 3], [12, 5, 3]],             // 4 — over the C: G, A, Bb climbing back
    [[0, 7, 10]],                                   // 5 — the octave again, held. The arrival.
    [[0, 9, 6], [8, 8, 3], [12, 7, 3]],             // 6 — over the F: F, E, D above
    [[0, 6, 8], [10, 5, 5]],                        // 7 — over the C: C, then Bb
    [[0, 4, 6], [8, 4, 2], [11, 3, 2], [14, 2, 2]], // 8 — over the A: the turnaround walks down to the tonic
];

/** A struck drum: a pitched body that drops fast, plus a noise transient so it has a stick on it. */
function drum(t, { freq = 92, drop = 52, gain = 0.4, dur = 0.34, tone: toneQ = 380 }) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(drop, t + dur * 0.42);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + dur + 0.02);

    // The skin. Without this a taiko is just a sine drop, which is a kick drum from a drum machine.
    const n = ctx.createBufferSource();
    n.buffer = noiseBuf; n.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass"; f.frequency.value = toneQ;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(gain * 0.5, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    n.connect(f); f.connect(ng); ng.connect(musicBus);
    n.start(t); n.stop(t + 0.09);
}

function scheduleStep(i, t) {
    if (!ctx || !musicBus) return;
    const beat = i % STEPS;
    const bar = Math.floor(i / STEPS) % BARS;
    const chord = CHORDS[bar];
    const last = bar === BARS - 1;                  // the turnaround
    const lv = intensity;
    const tr = Math.pow(2, chord.root / 12);        // one ratio, so every voice moves together

    // ── TAIKO ── the spine. Always there, because the drums ARE the arena; everything else is decoration on
    // top of two people and a crowd. Downbeats hit harder and lower.
    if (TAIKO.includes(beat) || (lv > 0.6 && TAIKO_HARD.includes(beat))) {
        const down = beat === 0 || beat === 8;
        drum(t, { freq: down ? 104 : 88, drop: down ? 46 : 56, gain: down ? 0.44 : 0.26, dur: down ? 0.4 : 0.26 });
    }

    // ── THE ANSWER ── a second, higher drum filling the hole the melody leaves in bars 4 and 8. A call and a
    // response is the cheapest way to make eight bars feel composed rather than looped.
    if ((bar === 3 || last) && beat >= 12 && beat % 2 === 0 && lv > 0.3) {
        drum(t, { freq: 170 + (beat - 12) * 26, drop: 96, gain: 0.2, dur: 0.16, tone: 900 });
    }

    // ── LOW BRASS ── the identity of the whole thing. Three detuned saws through a lowpass with a real attack,
    // holding the chord for most of the bar. Slow attack is the entire difference between a horn section and a
    // synth patch: a horn takes time to speak.
    if (beat === 0) {
        const notes = [semi(chord.root) / 2, semi(chord.root + 7) / 2, semi(chord.root + 12) / 2];
        notes.forEach((fr, k) => {
            for (const det of [-6, 6]) {
                const o = ctx.createOscillator();
                const f = ctx.createBiquadFilter();
                const g = ctx.createGain();
                o.type = "sawtooth";
                o.frequency.value = fr;
                o.detune.value = det;
                f.type = "lowpass";
                f.frequency.setValueAtTime(300, t);
                f.frequency.linearRampToValueAtTime(900 + lv * 1500, t + 0.22);
                f.frequency.linearRampToValueAtTime(600, t + SPB * 3);
                g.gain.setValueAtTime(0.0001, t);
                g.gain.linearRampToValueAtTime((k === 0 ? 0.075 : 0.042) * (0.55 + lv * 0.45), t + 0.13);
                g.gain.setValueAtTime((k === 0 ? 0.075 : 0.042) * (0.55 + lv * 0.45), t + SPB * 2.6);
                g.gain.exponentialRampToValueAtTime(0.0001, t + SPB * 3.6);
                o.connect(f); f.connect(g); g.connect(musicBus);
                o.start(t); o.stop(t + SPB * 3.7);
            }
        });
    }

    // ── CHOIR ── detuned triangles with a slow vibrato, sitting an octave up under everything. Quiet enough
    // that you would not name it if asked, loud enough that taking it out makes the track sound like a demo.
    if (beat === 0) {
        [semi(chord.root), semi(chord.root + chord.third), semi(chord.root + 7)].forEach((fr) => {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            const lfo = ctx.createOscillator();
            const lg = ctx.createGain();
            o.type = "triangle"; o.frequency.value = fr * 2;
            lfo.type = "sine"; lfo.frequency.value = 5.2;
            lg.gain.value = 1.6;                    // cents of vibrato, via detune
            g.gain.setValueAtTime(0.0001, t);
            g.gain.linearRampToValueAtTime(0.016 + lv * 0.018, t + SPB * 0.8);
            g.gain.exponentialRampToValueAtTime(0.0001, t + SPB * 3.9);
            lfo.connect(lg); lg.connect(o.detune);
            o.connect(g); g.connect(musicBus);
            o.start(t); lfo.start(t);
            o.stop(t + SPB * 4); lfo.stop(t + SPB * 4);
        });
    }

    // ── THE ANVIL ── a hammer on iron, on the backbeat, once the fight is worth watching. Two inharmonic
    // partials plus a bandpassed crack: a bell rings, an anvil CLANGS, and the difference is that the partials
    // are not whole-number multiples of anything.
    if (lv > 0.5 && beat === 8) {
        [1834, 2731].forEach((fr, k) => {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.type = "square"; o.frequency.value = fr;
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(0.028 * (k ? 0.6 : 1) * lv, t + 0.004);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
            o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 0.52);
        });
        const n = ctx.createBufferSource();
        n.buffer = noiseBuf; n.loop = true;
        const f = ctx.createBiquadFilter();
        f.type = "bandpass"; f.frequency.value = 3200; f.Q.value = 1.4;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.05 * lv, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
        n.connect(f); f.connect(g); g.connect(musicBus);
        n.start(t); n.stop(t + 0.11);
    }

    // ── THE MELODY ── enters once the fight has shape. A filtered square with a per-note envelope, doubled a
    // twelfth up very quietly so it reads as an instrument with a body rather than a bleep.
    if (lv > 0.4) {
        for (const [at, deg, len] of MELODY[bar]) {
            if (at !== beat) continue;
            const fr = step(deg, 1) * tr;
            const hold = SPS * len;
            for (const [mult, vol, wave] of [[1, 0.062, "square"], [3, 0.012, "sine"]]) {
                const o = ctx.createOscillator();
                const f = ctx.createBiquadFilter();
                const g = ctx.createGain();
                o.type = wave;
                o.frequency.value = fr * mult;
                f.type = "lowpass";
                f.frequency.setValueAtTime(1200, t);
                f.frequency.linearRampToValueAtTime(2600 + lv * 1800, t + 0.05);
                f.frequency.linearRampToValueAtTime(1400, t + hold);
                g.gain.setValueAtTime(0.0001, t);
                g.gain.linearRampToValueAtTime(vol * (0.6 + lv * 0.4), t + 0.03);
                g.gain.setValueAtTime(vol * (0.6 + lv * 0.4), t + hold * 0.72);
                g.gain.exponentialRampToValueAtTime(0.0001, t + hold);
                o.connect(f); f.connect(g); g.connect(musicBus);
                o.start(t); o.stop(t + hold + 0.02);
            }
        }
    }

    // ── SHAKER ── the only fast layer, and it is deliberately the LAST thing to arrive. Eighths, then
    // sixteenths when it is nearly over, so the track speeds up without the tempo ever changing.
    if (lv > 0.62 && (lv > 0.85 || beat % 2 === 0)) {
        const n = ctx.createBufferSource();
        n.buffer = noiseBuf; n.loop = true;
        const f = ctx.createBiquadFilter();
        f.type = "highpass"; f.frequency.value = 8200;
        const g = ctx.createGain();
        g.gain.setValueAtTime((beat % 4 === 0 ? 0.03 : 0.017) * lv, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
        n.connect(f); f.connect(g); g.connect(musicBus);
        n.start(t); n.stop(t + 0.055);
    }

    // ── THE RISER ── the back half of bar eight, sweeping up into the downbeat. It is the thing that makes
    // nineteen seconds feel like a phrase that came round rather than a file that started again.
    if (last && beat === 8 && lv > 0.35) {
        const n = ctx.createBufferSource();
        n.buffer = noiseBuf; n.loop = true;
        const f = ctx.createBiquadFilter();
        f.type = "bandpass"; f.Q.value = 2.2;
        f.frequency.setValueAtTime(500, t);
        f.frequency.exponentialRampToValueAtTime(5200, t + SPS * 8);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.05 * lv, t + SPS * 7);
        g.gain.exponentialRampToValueAtTime(0.0001, t + SPS * 8.4);
        n.connect(f); f.connect(g); g.connect(musicBus);
        n.start(t); n.stop(t + SPS * 8.5);
    }
}

function tickScheduler() {
    if (!ctx || !musicOn) return;
    // Schedule everything falling due in the next 120ms. setInterval alone is far too jittery to keep a beat;
    // the timer only decides WHEN to schedule, and the audio clock decides when things actually sound.
    while (nextStepTime < ctx.currentTime + 0.12) {
        scheduleStep(stepIndex, nextStepTime);
        nextStepTime += SPS;
        stepIndex += 1;
    }
}

export function startMusic() {
    const c = ensure();
    if (!c || musicOn) return;
    unlock();
    musicOn = true;
    started = true;
    stepIndex = 0;
    nextStepTime = c.currentTime + 0.08;
    musicBus.gain.cancelScheduledValues(c.currentTime);
    musicBus.gain.setValueAtTime(0.0001, c.currentTime);
    musicBus.gain.linearRampToValueAtTime(0.5, c.currentTime + 1.4);
    musicTimer = setInterval(tickScheduler, 25);
    tickScheduler();
}

export function stopMusic({ fade = 0.9 } = {}) {
    if (!ctx || !musicOn) return;
    const t = ctx.currentTime;
    musicBus.gain.cancelScheduledValues(t);
    musicBus.gain.setValueAtTime(musicBus.gain.value, t);
    musicBus.gain.linearRampToValueAtTime(0.0001, t + fade);
    musicOn = false;
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
}

/** 0 = comfortable, 1 = about to lose. Drives which layers are playing. */
export function setIntensity(v) {
    intensity = Math.max(0, Math.min(1, Number(v) || 0));
}

/** Duck the music briefly so a big moment cuts through it. */
export function duck(amount = 0.4, hold = 0.25) {
    if (!ctx || !musicOn) return;
    const t = ctx.currentTime;
    const g = musicBus.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0.5 * (1 - amount), t + 0.05);
    g.linearRampToValueAtTime(0.5, t + 0.05 + hold);
}

export const audioStarted = () => started;

// ── HAPTICS ──────────────────────────────────────────────────────────────────────────────────────────────────
// Kept beside the sound because they are the same design problem: a pattern per event, scaled by how much the
// blow was worth. navigator.vibrate is a no-op on desktop and on iOS Safari, so every call is best-effort.
export const Haptic = {
    fire(pattern) { try { navigator.vibrate?.(pattern); } catch { /* unsupported */ } },
    tap() { Haptic.fire(8); },
    hit(weight = 0.3) { Haptic.fire(Math.round(12 + Math.max(0, Math.min(1, weight)) * 38)); },
    crit() { Haptic.fire([0, 30, 25, 55]); },
    hurt(weight = 0.3) { Haptic.fire([0, Math.round(18 + weight * 30), 40, Math.round(14 + weight * 20)]); },
    block() { Haptic.fire([0, 14, 30, 10]); },
    cast() { Haptic.fire([0, 12, 20, 26]); },
    warn() { Haptic.fire([0, 26, 30, 14]); },
    ko() { Haptic.fire([0, 60, 50, 90]); },
    win() { Haptic.fire([0, 40, 60, 40, 60, 90]); },
    lose() { Haptic.fire([0, 90, 80, 40]); },
    /** The wheel biting, then breaking through. */
    cut() { Haptic.fire([0, 12, 60, 12, 60, 12, 60, 40]); },
    /** A jewel seating. The better the stone, the longer the game holds onto your hand. */
    gemSet(tier = 1) {
        const t = Math.max(1, Math.min(5, Number(tier) || 1));
        Haptic.fire([0, 18, 40, 30 + t * 12]);
    },
    /** Something you broke on purpose. */
    gemBreak() { Haptic.fire([0, 50, 30, 20, 25, 12]); },
    /** The box straining — a stutter that tightens, matched to chestRattle's knocks. */
    chestShake() { Haptic.fire([0, 18, 170, 22, 150, 26, 130, 34, 110, 44]); },
    /** The lid going, scaled by what came out: a common is a thump, an eternal is a fanfare you can feel. */
    chestOpen(rarity = "common") {
        const RANK = { common: 0, rare: 1, epic: 2, legendary: 3, mythic: 4, ascendant: 5, eternal: 6 };
        const r = RANK[rarity] ?? 0;
        const p = [0, 40 + r * 10];
        for (let i = 0; i < Math.min(4, r); i += 1) p.push(50, 22 + i * 8);
        Haptic.fire(p);
    },
};
