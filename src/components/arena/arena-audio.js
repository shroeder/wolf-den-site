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

    /** Flesh-and-steel contact. */
    impact(weight = 0.3, at = 0) {
        const w = Math.max(0, Math.min(1, weight));
        tone({ at, freq: 150 - w * 55, to: 42, type: "sine", dur: 0.16 + w * 0.16, gain: 0.3 + w * 0.26 });
        noise({ at, dur: 0.1 + w * 0.1, gain: 0.16 + w * 0.2, type: "lowpass", freq: 2600, sweepTo: 300 });
        if (w > 0.45) noise({ at: at + 0.012, dur: 0.1, gain: 0.1, type: "highpass", freq: 3200 });
    },

    /** A crit: the impact, plus a bright metallic ring on top so it is unmistakable. */
    crit(weight = 0.6, at = 0) {
        Sfx.impact(Math.max(0.65, weight), at);
        tone({ at: at + 0.01, freq: 1180, type: "square", dur: 0.34, gain: 0.13, to: 2360 });
        tone({ at: at + 0.03, freq: 1760, type: "triangle", dur: 0.4, gain: 0.1 });
        noise({ at: at + 0.01, dur: 0.3, gain: 0.1, type: "highpass", freq: 4200 });
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
// A procedural battle theme, scheduled a beat ahead so it stays locked regardless of what React is doing. Four
// layers that come in and out with INTENSITY, which the fight drives: at full vigour you get the ostinato and a
// pulse; as the bar empties the drums push and a tremolo string layer arrives underneath, so the music tells you
// you are losing before the number does.
//
// It is in A Phrygian dominant — the mode with a flat second and a major third. It is the sound every gladiator
// pit in every game has used for thirty years, and it is the right one.
const ROOT = 110;                                   // A2
const SCALE = [0, 1, 4, 5, 7, 8, 11];               // Phrygian dominant, semitones
const step = (deg, oct = 0) => ROOT * Math.pow(2, (SCALE[((deg % 7) + 7) % 7] + 12 * (oct + Math.floor(deg / 7))) / 12);

const BPM = 132;
const SPB = 60 / BPM;
const STEPS = 16;                                   // sixteenth notes per bar
const SPS = SPB / 4;

let musicTimer = null;
let nextStepTime = 0;
let stepIndex = 0;
let intensity = 0.35;
let musicOn = false;

const OSTINATO = [0, 0, 2, 0, 4, 0, 2, 3, 0, 0, 2, 0, 5, 4, 2, 1];
const BASS = [0, null, null, 0, null, 0, null, null, 3, null, null, 3, null, 2, null, null];

function scheduleStep(i, t) {
    if (!ctx || !musicBus) return;
    const beat = i % STEPS;
    const barLevel = intensity;

    // KICK — the floor of the whole thing.
    if (beat % 4 === 0 || (barLevel > 0.6 && beat === 14)) {
        const g = ctx.createGain();
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.setValueAtTime(150, t);
        o.frequency.exponentialRampToValueAtTime(42, t + 0.11);
        g.gain.setValueAtTime(0.34, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
        o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 0.22);
    }

    // SNARE on the backbeat.
    if (beat === 4 || beat === 12) {
        const s = ctx.createBufferSource();
        s.buffer = noiseBuf; s.loop = true;
        const f = ctx.createBiquadFilter();
        f.type = "bandpass"; f.frequency.value = 1900; f.Q.value = 0.8;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.17, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
        s.connect(f); f.connect(g); g.connect(musicBus);
        s.start(t); s.stop(t + 0.17);
    }

    // HATS — the layer that tells you the fight is getting away from you.
    if (barLevel > 0.5 && beat % 2 === 1) {
        const s = ctx.createBufferSource();
        s.buffer = noiseBuf; s.loop = true;
        const f = ctx.createBiquadFilter();
        f.type = "highpass"; f.frequency.value = 7000;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.045 * barLevel, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
        s.connect(f); f.connect(g); g.connect(musicBus);
        s.start(t); s.stop(t + 0.06);
    }

    // BASS.
    const b = BASS[beat];
    if (b !== null && b !== undefined) {
        const o = ctx.createOscillator();
        const f = ctx.createBiquadFilter();
        const g = ctx.createGain();
        o.type = "sawtooth";
        o.frequency.value = step(b, -1);
        f.type = "lowpass";
        f.frequency.setValueAtTime(240 + barLevel * 500, t);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + SPS * 3);
        o.connect(f); f.connect(g); g.connect(musicBus);
        o.start(t); o.stop(t + SPS * 3.2);
    }

    // OSTINATO — the tune. Plucked, dry, relentless.
    if (barLevel > 0.25) {
        const deg = OSTINATO[beat];
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "triangle";
        o.frequency.value = step(deg, 1);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.075 * barLevel, t + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t + SPS * 1.6);
        o.connect(g); g.connect(musicBus);
        o.start(t); o.stop(t + SPS * 1.7);
    }

    // TREMOLO STRINGS — arrive only when it is going badly.
    if (barLevel > 0.72 && beat === 0) {
        [step(0, 0), step(2, 0), step(4, 0)].forEach((fr) => {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            const lfo = ctx.createOscillator();
            const lg = ctx.createGain();
            o.type = "sawtooth"; o.frequency.value = fr;
            lfo.type = "sine"; lfo.frequency.value = 11;
            lg.gain.value = 0.03;
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(0.05, t + 0.25);
            g.gain.exponentialRampToValueAtTime(0.0001, t + SPS * 15);
            lfo.connect(lg); lg.connect(g.gain);
            o.connect(g); g.connect(musicBus);
            o.start(t); lfo.start(t);
            o.stop(t + SPS * 16); lfo.stop(t + SPS * 16);
        });
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
