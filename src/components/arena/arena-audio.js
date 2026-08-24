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
// Held rather than local so other features can hang their OWN bus off the same limiter — see `subBus`.
let comp = null;
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
        comp = ctx.createDynamicsCompressor();
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

// ── A BUS OF YOUR OWN ────────────────────────────────────────────────────────────────────────────────────────
// `tone`/`noise` schedule notes up to a second ahead on the audio clock, and once scheduled they WILL sound —
// clearing the timer that would have scheduled the next batch does nothing about the batch already in flight.
// That is fine for effects, which are meant to ring out, and it is exactly wrong for a music bed: stopping one
// and starting another leaves the tail of the first playing under the second, which is two tracks at once.
//
// So a bed gets a gain node of its own to hang its notes on, and stopping it means ramping that node to
// silence — which cuts the tail no matter how far ahead it was scheduled. Own bus rather than `musicBus`
// because that one belongs to the arena's own track and has its own fades. Both land on the same limiter.
export function subBus(gain = 1) {
    const c = ensure();
    if (!c || !comp) return null;
    const g = c.createGain();
    g.gain.value = gain;
    g.connect(comp);
    return g;
}

/** Silence a sub-bus and let it go. The disconnect is delayed past the fade or it cuts with a click. */
export function killBus(g, fade = 0.14) {
    if (!g || !ctx) return;
    const t = ctx.currentTime;
    try {
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(g.gain.value, t);
        g.gain.linearRampToValueAtTime(0.0001, t + fade);
        setTimeout(() => { try { g.disconnect(); } catch { /* already gone */ } }, (fade + 0.1) * 1000);
    } catch { /* context torn down */ }
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

// Exported so other features can have their OWN voice rather than borrowing the arena's twenty sounds.
// The casino needs a coin cascade, a reel clunk and a near-miss sigh; none of those belong in a fight, and
// bolting them onto `Sfx` would grow one module into everything. See casino/casino-audio.js.
export function tone({ freq = 440, type = "sine", at = 0, dur = 0.2, gain = 0.2, to = null, bus = null, detune = 0 }) {
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

export function noise({ at = 0, dur = 0.2, gain = 0.2, type = "lowpass", freq = 1200, q = 1, sweepTo = null, bus = null }) {
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
// `weight` is 0..1 — how much of the target's health the blow took. It scales pitch, length and body, so a
// glancing hit and a fight-ending one are audibly different without a second asset.
export const Sfx = {
    ui() { tone({ freq: 660, type: "triangle", dur: 0.05, gain: 0.06 }); },
    // ── A FOOTFALL ON CARPET ── not a UI click. Crossing the casino floor is a dozen taps in a row, and
    // `ui()` at that rate is a metronome: it has a clear pitch, so twelve of them is a note being held.
    // This is deliberately pitch-less — a soft low thump and a scuff of filtered noise — and the caller
    // varies the weight slightly so no two steps are identical.
    step(weight = 0.5) {
        const w = Math.max(0, Math.min(1, weight));
        tone({ freq: 98 - w * 22, to: 44, type: "sine", dur: 0.07, gain: 0.1 + w * 0.06 });
        noise({ dur: 0.05, gain: 0.05 + w * 0.04, type: "lowpass", freq: 900, sweepTo: 260 });
    },
    // Walking into reach of a machine: one soft two-note lift. The sound of a cabinet noticing you, and
    // quiet enough that it never competes with what the machine itself does once you are playing it.
    arrive() {
        tone({ freq: 587, type: "triangle", dur: 0.09, gain: 0.045 });
        tone({ at: 0.055, freq: 880, type: "triangle", dur: 0.22, gain: 0.045 });
        noise({ at: 0.055, dur: 0.11, gain: 0.02, type: "highpass", freq: 5200 });
    },

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

    /**
     * A COUNTER. Steel turned back on whoever swung first.
     *
     * It must not be `impact` again — a counter that sounds like every other blow is a number you have to read
     * to notice, which is exactly what it was. The identity is the RING: two short metal partials a semitone
     * apart, struck together and left to beat against each other, over a hit that arrives fractionally late so
     * the parry reads before the answer. Bright and dry, where a crit is bright and long.
     */
    counter(weight = 0.6, at = 0) {
        const w = Math.max(0, Math.min(1, weight));
        // The parry itself — high, short, no body. This is the sound of the block that earns the swing.
        tone({ at, freq: 2400, type: "square", dur: 0.05, gain: 0.05 + w * 0.05 });
        noise({ at, dur: 0.05, gain: 0.07 + w * 0.06, type: "highpass", freq: 5200 });
        // Then the answer, a beat later, with the two ringing partials over it.
        Sfx.impact(0.45 + w * 0.4, at + 0.055);
        tone({ at: at + 0.055, freq: 1480, type: "triangle", dur: 0.26 + w * 0.16, gain: 0.09 + w * 0.05 });
        tone({ at: at + 0.062, freq: 1568, type: "triangle", dur: 0.3 + w * 0.18, gain: 0.07 + w * 0.05 });
        if (w > 0.7) tone({ at: at + 0.07, freq: 2960, type: "sine", dur: 0.4, gain: 0.05 });
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

    /**
     * ── THE FREEZE ── the most expensive sound in the ring, because it is the most expensive event: the
     * other fighter has just lost a turn.
     *
     * Built to be unmistakable with your eyes shut, which is the whole job of this file. Three layers, and
     * each is doing something a burn cannot: a bright shard-glitter UP the register (everything else in the
     * arena sweeps DOWN, so rising alone reads as "not a hit"), a hard crystalline crack for the moment of
     * contact, and a long low sub that keeps ringing after the visuals have finished — the sound of the
     * beat that is about to be skipped.
     */
    freeze(at = 0) {
        // The glitter. High, thin, and the only ascending sweep in the whole kit.
        tone({ at, freq: 1400, to: 3400, type: "triangle", dur: 0.34, gain: 0.11 });
        tone({ at: at + 0.03, freq: 2100, to: 4600, type: "sine", dur: 0.28, gain: 0.07 });
        // The crack of something going solid.
        noise({ at: at + 0.02, dur: 0.09, gain: 0.16, type: "highpass", freq: 4200 });
        noise({ at: at + 0.05, dur: 0.3, gain: 0.09, type: "bandpass", freq: 2600, sweepTo: 900, q: 2.2 });
        // And the weight underneath, held long so the silence after it feels like the lost turn.
        tone({ at: at + 0.04, freq: 96, to: 38, type: "sine", dur: 0.62, gain: 0.2 });
    },

    /** A burn ticking. Deliberately SMALL — it fires every single turn a burn is up, so anything with a
     *  transient would turn a five-turn burn into five clicks in the listener's ear. Breath, not impact. */
    burn(at = 0) {
        noise({ at, dur: 0.26, gain: 0.075, type: "bandpass", freq: 900, sweepTo: 2100, q: 0.9 });
        tone({ at, freq: 240, to: 150, type: "sawtooth", dur: 0.2, gain: 0.05 });
    },

    /** A guard taken away — the same cold family as the freeze, but blunt where the freeze is bright. */
    disarm(at = 0) {
        noise({ at, dur: 0.16, gain: 0.2, type: "highpass", freq: 2400 });
        tone({ at, freq: 300, to: 70, type: "square", dur: 0.28, gain: 0.15 });
        tone({ at: at + 0.03, freq: 1800, to: 700, type: "triangle", dur: 0.22, gain: 0.08 });
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

    /** Health coming back. */
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
// "THE GALLOP" — scheduled a beat ahead against the audio clock, so it stays locked regardless of what React
// is doing, and the layers come and go with INTENSITY, which the fight drives.
//
// ── WHY THIS IS THE SECOND REWRITE ───────────────────────────────────────────────────────────────────────────
// The first pass replaced a seven-second chiptune loop with a war-drum processional: 100bpm, 4/4, D natural
// minor, eight bars. It fixed the loop length and it fixed the voices, and it was still wrong in three ways
// that only show up once you have sat through fifty bouts rather than five.
//
//   1. IT MARCHED. 4/4 at 100 with the weight on the downbeat is a PROCESSION — music for entering an arena,
//      not for being in one. A fight lurches; the track sat still while the screen was frantic.
//   2. THE MODE WAS INERT. D natural minor with a bVI-bVII-V turnaround is the same harmonic furniture as the
//      Phrygian dominant it replaced: correct, expected, and saying nothing.
//   3. NINETEEN SECONDS IS STILL A LOOP. Tripling the phrase moved the moment you notice from the fifth pass
//      to the tenth. It did not remove it, because the phrase came round IDENTICAL every time.
//
// All three are attacked directly:
//
//   6/8, NOT 4/4. A gallop — two pulses a bar, each split in three. It is the meter of something running, it
//   never sits square on the grid, and almost nothing in this genre uses it, which is most of why the old one
//   sounded like every other arena.
//
//   D DORIAN, NOT AEOLIAN. One note different from natural minor — the sixth is natural, so the IV chord is
//   MAJOR over a minor tonic. That one chord is the whole colour: minor enough to be dangerous, bright enough
//   not to be a funeral. Bars 4, 11 and 14 are where you hear it.
//
//   SIXTEEN BARS THAT DO NOT REPEAT IDENTICALLY. An A section that states it and a B section that lifts out
//   of it, ~21 seconds — then the whole thing runs again with its ornaments moved (see `pass`), so the real
//   form is 42 seconds and no two passes match. A bout ends before the track has repeated itself once.
//
//   AND THERE IS A CROWD. New, and the one that makes it a PLACE: a breathing noise bed that swells into every
//   fourth bar and roars on the turnaround when the fight is nearly over. An arena with no crowd in it is a
//   rehearsal room, and no amount of drums fixes that.
const ROOT = 73.42;                                 // D2
const SCALE = [0, 2, 3, 5, 7, 9, 10];               // D DORIAN — the natural 6 is the point
const step = (deg, oct = 0) => ROOT * Math.pow(2, (SCALE[((deg % 7) + 7) % 7] + 12 * (oct + Math.floor(deg / 7))) / 12);
const semi = (n) => ROOT * Math.pow(2, n / 12);

// The felt pulse is the DOTTED quarter — two a bar — so a "step" is a sixteenth and a bar is twelve of them.
const PULSE = 92;
const SPB = 60 / PULSE;                             // one dotted-quarter
const SPS = SPB / 6;                                // ...split into six sixteenths
const STEPS = 12;                                   // twelve to the bar: 6/8
const BARS = 16;                                    // A (1-8) then B (9-16)

let musicTimer = null;
let nextStepTime = 0;
let stepIndex = 0;
let intensity = 0.35;
let musicOn = false;

// Semitone offsets from D. Every `third: 4` over a minor tonic is borrowed brightness; the IV (root 5) is the
// Dorian one, and it is deliberately the chord the melody peaks over.
const CHORDS = [
    { root: 0, third: 3 },   // 1  i    Dm
    { root: 0, third: 3 },   // 2  i    Dm
    { root: 10, third: 4 },  // 3  bVII C
    { root: 5, third: 4 },   // 4  IV   G   <- Dorian
    { root: 0, third: 3 },   // 5  i    Dm
    { root: 3, third: 4 },   // 6  bIII F
    { root: 10, third: 4 },  // 7  bVII C
    { root: 0, third: 3 },   // 8  i    Dm
    { root: 3, third: 4 },   // 9  bIII F   -- B: it lifts
    { root: 10, third: 4 },  // 10 bVII C
    { root: 5, third: 4 },   // 11 IV   G   <- Dorian, and the melody's peak
    { root: 7, third: 3 },   // 12 v    Am
    { root: 3, third: 4 },   // 13 bIII F
    { root: 5, third: 4 },   // 14 IV   G   <- Dorian
    { root: 0, third: 3 },   // 15 i    Dm
    { root: 10, third: 4 },  // 16 bVII C  — the door back to the top
];

// ── THE GALLOP ── 6/8 is two groups of three, so the big drum lands on 0 and 6 and the hand fills 2/4/8/10.
// The missing odd sixteenths are what stop it being a machine: a rider does not hit every subdivision.
const HAND = [0, 2, 4, 6, 8, 10];
const PULSES = [0, 6];
const HARD = [9];                                   // the extra kick, once it is going badly

// The written melody that used to live here is deleted, not commented out — see the note in
// scheduleStep. A tune nobody plays is just a table waiting to be switched back on by accident.

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

/** Filtered noise with an envelope. The crowd, the anvil's crack, the shaker and the riser are all this. */
function air(t, { from = 600, to = 600, peak = 0.04, attack = 0.2, hold = 0.2, release = 0.4, q = 1, type = "bandpass" }) {
    const n = ctx.createBufferSource();
    n.buffer = noiseBuf; n.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(from, t);
    if (to !== from) f.frequency.exponentialRampToValueAtTime(to, t + attack + hold);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.setValueAtTime(peak, t + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
    n.connect(f); f.connect(g); g.connect(musicBus);
    n.start(t); n.stop(t + attack + hold + release + 0.05);
}

function scheduleStep(i, t) {
    if (!ctx || !musicBus) return;
    const beat = i % STEPS;
    const bar = Math.floor(i / STEPS) % BARS;
    // Which time through the sixteen this is. Every ornament keys off it, so the form is 32 bars even though
    // the harmony is 16 — the cheapest possible way to stop a loop announcing itself.
    const pass = Math.floor(i / (STEPS * BARS)) % 2;
    const chord = CHORDS[bar];
    const last = bar === BARS - 1;
    const lv = intensity;
    const tr = Math.pow(2, chord.root / 12);        // one ratio, so every voice moves together

    // ── THE CROWD ── a breath across four bars, swelling into every fourth. Always on, even at zero intensity:
    // the room is full before the fight starts. One noise source a bar for the whole difference between an
    // arena and a rehearsal space.
    if (beat === 0) {
        const swell = bar % 4 === 3;                // the bar BEFORE a section point: anticipation, not applause
        air(t, {
            from: 420, to: swell ? 1500 : 700, q: 0.9,
            peak: (swell ? 0.055 : 0.03) * (0.5 + lv * 0.7),
            attack: SPB * (swell ? 1.4 : 0.9), hold: SPB * 0.2, release: SPB * 0.9,
        });
    }
    // A real roar, on the turnaround only and only when it is nearly over, so it means something when it comes.
    if (last && beat === 6 && lv > 0.72) {
        air(t, { from: 700, to: 2400, q: 0.7, peak: 0.075, attack: SPB * 0.9, hold: SPB * 0.3, release: SPB * 1.1 });
    }

    // ── THE GALLOP ── the spine. Big drum on the two pulses, hand drum filling the triplet underneath, so the
    // bar breathes in three rather than sitting flat.
    if (PULSES.includes(beat)) {
        // DEEPER AND LONGER than they were. At 108Hz through a phone speaker the big drum was a knock; the
        // low end is most of what makes a room sound large, and it is the layer that has to carry the track
        // now that the tune is gone.
        const down = beat === 0;
        drum(t, { freq: down ? 82 : 74, drop: down ? 34 : 40, gain: down ? 0.5 : 0.34, dur: down ? 0.46 : 0.34 });
    } else if (HAND.includes(beat) && lv > 0.12) {
        drum(t, { freq: 190, drop: 120, gain: 0.1 + lv * 0.05, dur: 0.1, tone: 1200 });
    }
    if (lv > 0.62 && HARD.includes(beat)) {
        drum(t, { freq: 84, drop: 48, gain: 0.24, dur: 0.22 });
    }

    // ── THE ANSWER ── drums filling the holes the melody leaves in bars 2 and 8, and MOVED by `pass`, so the
    // second time through the sixteen the fill lands elsewhere and the phrase does not read as a tape.
    if ((bar === 1 || bar === 7) && lv > 0.3 && beat >= (pass ? 6 : 8) && beat % 2 === 0) {
        drum(t, { freq: 168 + beat * 9, drop: 100, gain: 0.17, dur: 0.14, tone: 950 });
    }

    // ── THE BOWED DRONE ── the bass, and it never stops. Two saws a fifth apart under a slow lowpass, bowed in
    // over a third of a bar rather than plucked: an arco string speaks LATE, and that lateness is the whole
    // difference between a string section and a synth bass on a grid.
    if (beat === 0) {
        [semi(chord.root) / 2, semi(chord.root + 7) / 2].forEach((fr, k) => {
            for (const det of [-7, 7]) {
                const o = ctx.createOscillator();
                const f = ctx.createBiquadFilter();
                const g = ctx.createGain();
                o.type = "sawtooth";
                o.frequency.value = fr;
                o.detune.value = det;
                f.type = "lowpass";
                f.frequency.setValueAtTime(260, t);
                f.frequency.linearRampToValueAtTime(780 + lv * 1200, t + SPB * 0.5);
                f.frequency.linearRampToValueAtTime(520, t + SPB * 1.8);
                g.gain.setValueAtTime(0.0001, t);
                g.gain.linearRampToValueAtTime((k === 0 ? 0.07 : 0.038) * (0.6 + lv * 0.4), t + SPB * 0.35);
                g.gain.setValueAtTime((k === 0 ? 0.07 : 0.038) * (0.6 + lv * 0.4), t + SPB * 1.5);
                g.gain.exponentialRampToValueAtTime(0.0001, t + SPB * 2);
                o.connect(f); f.connect(g); g.connect(musicBus);
                o.start(t); o.stop(t + SPB * 2.05);
            }
        });
    }

    // ── THE HORNS ── not a pad. They ANSWER the gallop on the second pulse of alternate bars, short and
    // stopped, the way a hunting horn is played. Held chords are what made the last version a procession.
    if (beat === 6 && bar % 2 === (pass ? 0 : 1) && lv > 0.25) {
        [0, chord.third, 7].forEach((iv, k) => {
            const o = ctx.createOscillator();
            const f = ctx.createBiquadFilter();
            const g = ctx.createGain();
            o.type = "sawtooth";
            o.frequency.value = semi(chord.root + iv);
            f.type = "lowpass";
            f.frequency.setValueAtTime(420, t);
            f.frequency.linearRampToValueAtTime(1600 + lv * 900, t + 0.08);
            f.frequency.linearRampToValueAtTime(700, t + SPB * 0.7);
            g.gain.setValueAtTime(0.0001, t);
            g.gain.linearRampToValueAtTime((k === 0 ? 0.05 : 0.03) * (0.5 + lv * 0.5), t + 0.06);
            g.gain.setValueAtTime((k === 0 ? 0.05 : 0.03) * (0.5 + lv * 0.5), t + SPB * 0.45);
            g.gain.exponentialRampToValueAtTime(0.0001, t + SPB * 0.8);
            o.connect(f); f.connect(g); g.connect(musicBus);
            o.start(t); o.stop(t + SPB * 0.85);
        });
    }

    // ── NO CHOIR EITHER ──────────────────────────────────────────────────────────────────────────────
    // Detuned triangles an octave up with a 5.4Hz vibrato. On paper that is a choir; through a phone speaker
    // it is a theremin, and it was the second half of what made this sound cheap. The B section lifts on the
    // swell, the crowd and the drums now — all texture, none of it pretending to be a voice.

    // ── THE ANVIL ── a hammer on iron, on the second pulse, once the fight is worth watching. Two inharmonic
    // partials plus a bandpassed crack: a bell rings, an anvil CLANGS, and the difference is that the partials
    // are not whole-number multiples of anything.
    if (lv > 0.5 && beat === 6 && bar % 2 === 0) {
        [1834, 2731].forEach((fr, k) => {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.type = "square"; o.frequency.value = fr;
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(0.026 * (k ? 0.6 : 1) * lv, t + 0.004);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
            o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 0.47);
        });
        air(t, { from: 3200, to: 3200, q: 1.4, peak: 0.045 * lv, attack: 0.002, hold: 0.01, release: 0.08 });
    }

    // ── NO MELODY, ON PURPOSE ────────────────────────────────────────────────────────────────────────
    // There WAS one here: a filtered square playing a written tune in Dorian over a 6/8 gallop. Luke: "the
    // arena music is trash, everything else you made sounds great. this one is exceptionally naf."
    //
    // He is right, and the two halves of that sentence are the same observation. Every sound effect in this
    // file is a TRANSIENT or a TEXTURE — an impact, a crack, a breath of noise — and synthesis is superb at
    // those. A square wave playing a TUNE is the one thing synthesis is uniquely bad at: there is no
    // performance in it, every note is identical, and the ear has heard exactly that timbre in a thousand
    // free games. Drums and a drone read as a place. A melody on an oscillator reads as a ringtone.
    //
    // So the tune is gone rather than fixed. What is left is the room: the crowd, the gallop, the bowed
    // drone, the anvil, and the swell below — none of which is trying to be hummable.

    // ── THE SWELL ── low brass, and the only thing carrying pitch now. Two saws a fifth apart under a filter
    // that OPENS across most of a bar, so it arrives like a section leaning in rather than a note being
    // played. Once per half — bar 1 and bar 9 — so the form still has a shape without a tune to carry it.
    if (beat === 0 && (bar === 0 || bar === 8) && lv > 0.22) {
        for (const [mult, det] of [[1, -6], [1, 6], [1.5, 0]]) {
            const o = ctx.createOscillator();
            const f = ctx.createBiquadFilter();
            const g = ctx.createGain();
            o.type = "sawtooth";
            o.frequency.value = semi(chord.root) * mult;
            o.detune.value = det;
            f.type = "lowpass";
            f.frequency.setValueAtTime(180, t);
            f.frequency.linearRampToValueAtTime(900 + lv * 900, t + SPB * 2.2);
            f.frequency.linearRampToValueAtTime(240, t + SPB * 3.6);
            f.Q.value = 3;
            g.gain.setValueAtTime(0.0001, t);
            g.gain.linearRampToValueAtTime(0.05 + lv * 0.045, t + SPB * 1.6);
            g.gain.exponentialRampToValueAtTime(0.0001, t + SPB * 3.8);
            o.connect(f); f.connect(g); g.connect(musicBus);
            o.start(t); o.stop(t + SPB * 4);
        }
    }

    // ── THE SHAKER ── the last layer to arrive and the only fast one. On the triplet at first, then every
    // sixteenth when it is nearly over, so the track accelerates without the tempo moving at all.
    if (lv > 0.66 && (lv > 0.88 || beat % 2 === 0)) {
        air(t, { from: 8600, to: 8600, type: "highpass", peak: (beat % 6 === 0 ? 0.026 : 0.014) * lv,
            attack: 0.002, hold: 0.005, release: 0.04 });
    }

    // ── THE RISER ── the back half of the last bar, sweeping into the downbeat. It is what makes the form come
    // ROUND rather than start again.
    if (last && beat === 6 && lv > 0.35) {
        air(t, { from: 480, to: 5400, q: 2.2, peak: 0.05 * lv, attack: SPS * 5, hold: 0, release: SPS * 1.5 });
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
