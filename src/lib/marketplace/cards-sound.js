// ── THE CARD GAME MAKES A NOISE NOW ──────────────────────────────────────────────────────────────────────
// Luke: "we need music sound effects and vibrations, run automatically ... for every single detail of the
// card game."
//
// SYNTHESISED, NOT SHIPPED. Every sound here is built out of oscillators and one noise buffer at the moment
// it plays. That is already the house pattern — the forge, the farm and the delve each carry a small
// WebAudio helper — and it is the right one for this game in particular: the card art is 4.8MB and a phone
// on a bad connection already loses pictures to it. A sound pack would be the same problem again, arriving
// late, for a fight that lasts ninety seconds. This costs nothing to fetch, works offline, and has no
// loading state anywhere in it.
//
// ⚠️ ONE MODULE, NOT ONE PER SCREEN. The three helpers that already exist are the same twelve lines copied
// three times and they have already drifted apart. The fight, the map, the shop, the campfire, the events
// and the front room all pull from here, so "what a card sounds like" has exactly one answer.
//
// AUTOPLAY: a browser will not let a page make noise before it has been touched. The context is built
// suspended and wake() resumes it on the first real gesture — see useCardSound.

const isBrowser = () => typeof window !== "undefined";

let ctx = null;
let master = null;
let musicBus = null;

const PREF = "wolfden.cards.sound";
const DEFAULTS = { sfx: true, music: true, haptics: true };
const readPref = () => {
    if (!isBrowser()) return { ...DEFAULTS };
    try {
        const raw = window.localStorage.getItem(PREF);
        return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
    } catch { return { ...DEFAULTS }; }
};
let pref = readPref();

// ⚠️ 0.13 AT 73Hz IS NOT QUIET MUSIC, IT IS NO MUSIC. Luke, in a fight, twice: "no music?"
// It was playing. A phone loudspeaker is a sealed driver about a centimetre across and it rolls off hard
// below roughly 500Hz — and every note here was under it. The fight's drone sat at root/2 = 73Hz and its
// arpeggio at 147-220Hz, all of it at a thirteenth of full volume.
// Rendered arithmetically and pushed through a 4th-order high-pass at 500Hz, which is about what that
// speaker does to a signal:
//     fight   -24.7 dB full band  ->  -59.5 dB out of a phone   (1.8% survives)
//     map     -25.4 dB            ->  -56.2 dB                  (2.9%)
//     boss    -25.0 dB            ->  -47.5 dB                  (7.5%)
// -59 dB is silence. It was correct on headphones and on a laptop, which is where it was written, and it
// has never once been heard on the device the game is played on.
// Three changes, and the two that matter are about PITCH rather than volume: the arpeggio moves up an
// octave and the drone up to the root, so the notes land in a register the speaker can actually move air
// at. The gain then comes up to 0.3 on top of that.
//     fight   -20.8 dB            ->  -41.8 dB                  (9.0%)
//     map     -20.4 dB            ->  -36.1 dB                  (16.5%)
//     boss    -20.5 dB            ->  -37.2 dB                  (14.7%)
// Still well under the effects, which is right — this is the room's hum, not a soundtrack. It is now a
// hum you can hear. If it needs to move again, move the OCTAVE before the gain; eighteen of the twenty
// decibels above came from the octave.
const MUSIC_GAIN = 0.3;   // low on purpose: this sits UNDER a fight, it does not lead one

export const soundPref = () => ({ ...pref });

export function setSoundPref(next) {
    pref = { ...pref, ...next };
    try { window.localStorage.setItem(PREF, JSON.stringify(pref)); } catch { /* private mode */ }
    if (master) master.gain.value = pref.sfx ? 1 : 0;
    if (musicBus) musicBus.gain.value = pref.music ? MUSIC_GAIN : 0;
    if (!pref.music) stopMusic();
    return soundPref();
}

function boot() {
    if (!isBrowser() || ctx) return ctx;
    try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = pref.sfx ? 1 : 0;
        master.connect(ctx.destination);
        musicBus = ctx.createGain();
        musicBus.gain.value = pref.music ? MUSIC_GAIN : 0;
        musicBus.connect(ctx.destination);
    } catch { ctx = null; }
    return ctx;
}

/** Off the first gesture. Until this runs everything below is a no-op that costs nothing. */
export function wake() {
    const a = boot();
    if (!a) return false;
    if (a.state === "suspended") a.resume().catch(() => {});
    return a.state !== "suspended";
}

export const audioAwake = () => Boolean(ctx && ctx.state === "running");
const live = () => { const a = boot(); return a && a.state === "running" ? a : null; };

// ── THE THREE THINGS EVERY SOUND IS MADE OF ──────────────────────────────────────────────────────────────
// A pitched tone with an envelope, a band of noise, and a run of notes. Everything named below is an
// arrangement of these, which is what keeps the palette sounding like one game rather than six afternoons.

/** A pitched note. `to` bends the pitch across its life, which is most of the character. */
function tone({ freq = 440, to = null, dur = 0.14, type = "triangle", gain = 0.16, delay = 0 } = {}) {
    const a = live(); if (!a) return;
    try {
        const t = a.currentTime + delay;
        const o = a.createOscillator();
        const g = a.createGain();
        o.type = type;
        o.frequency.setValueAtTime(freq, t);
        if (to) o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
        // A four-millisecond attack rather than an instant one. A click at the head of a note is the single
        // thing that makes synthesised audio sound cheap, and this is what it costs to avoid.
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(master);
        o.start(t); o.stop(t + dur + 0.02);
    } catch { /* a sound is never worth throwing over */ }
}

let noiseBuf = null;
/** A band of noise — impacts, fire, paper, stone. Filtered, because raw white noise is a hiss and nothing more. */
function noise({ dur = 0.16, gain = 0.14, freq = 900, q = 1.1, type = "bandpass", delay = 0, sweepTo = null } = {}) {
    const a = live(); if (!a) return;
    try {
        if (!noiseBuf) {
            noiseBuf = a.createBuffer(1, Math.floor(a.sampleRate * 1.2), a.sampleRate);
            const d = noiseBuf.getChannelData(0);
            for (let i = 0; i < d.length; i += 1) d[i] = Math.random() * 2 - 1;
        }
        const t = a.currentTime + delay;
        const src = a.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
        const f = a.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
        if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t + dur);
        const g = a.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        src.connect(f); f.connect(g); g.connect(master);
        src.start(t); src.stop(t + dur + 0.02);
    } catch { /* ignore */ }
}

/** Notes in a row. A chord arpeggiated is what good news sounds like. */
const run = (freqs, { step = 0.055, ...rest } = {}) =>
    freqs.forEach((f, i) => tone({ freq: f, delay: i * step, ...rest }));

// ── VIBRATION ────────────────────────────────────────────────────────────────────────────────────────────
// ⚠️ ANDROID ONLY, AND THAT IS FINE. iOS Safari has never implemented navigator.vibrate and is not going to,
// so this is a bonus where it exists rather than something the game leans on. Patterns are deliberately
// short: a phone buzzing for a third of a second on every card is why people turn haptics off.
export function haptic(pattern) {
    if (!isBrowser() || !pref.haptics) return;
    try { navigator.vibrate?.(pattern); } catch { /* ignore */ }
}

// ── EVERY SOUND THE CARD GAME MAKES ──────────────────────────────────────────────────────────────────────
// Named for the EVENT, never for the noise, so a screen asks for "attack" and not for "a sawtooth at 190Hz".
// That is what lets the whole palette be re-tuned here without touching a component.
export const SFX = {
    // the hand
    draw: () => noise({ dur: 0.09, gain: 0.05, freq: 2600, q: 0.7, sweepTo: 1500 }),
    raise: () => tone({ freq: 520, to: 640, dur: 0.07, type: "sine", gain: 0.05 }),
    attack: () => { noise({ dur: 0.11, gain: 0.16, freq: 1500, sweepTo: 420 }); tone({ freq: 190, to: 90, dur: 0.13, type: "sawtooth", gain: 0.13 }); haptic(18); },
    skill: () => { tone({ freq: 430, to: 660, dur: 0.16, type: "sine", gain: 0.11 }); haptic(12); },
    power: () => { run([392, 523, 659], { dur: 0.2, type: "sine", gain: 0.1, step: 0.06 }); haptic([12, 30, 18]); },
    denied: () => { tone({ freq: 150, dur: 0.1, type: "square", gain: 0.07 }); haptic([12, 40, 12]); },
    exhaust: () => noise({ dur: 0.34, gain: 0.09, freq: 1700, sweepTo: 240 }),
    discard: () => noise({ dur: 0.07, gain: 0.05, freq: 1200, q: 0.6 }),

    // what lands
    hit: () => { noise({ dur: 0.1, gain: 0.15, freq: 900, sweepTo: 200 }); tone({ freq: 130, to: 70, dur: 0.11, type: "square", gain: 0.09 }); },
    crit: () => { noise({ dur: 0.15, gain: 0.2, freq: 2200, sweepTo: 300 }); tone({ freq: 260, to: 80, dur: 0.18, type: "sawtooth", gain: 0.15 }); haptic([26, 24, 26]); },
    hurt: () => { tone({ freq: 220, to: 96, dur: 0.2, type: "sawtooth", gain: 0.15 }); noise({ dur: 0.13, gain: 0.1, freq: 500, sweepTo: 160 }); haptic(34); },
    block: () => { tone({ freq: 300, to: 420, dur: 0.13, type: "triangle", gain: 0.1 }); noise({ dur: 0.08, gain: 0.07, freq: 3000, q: 2.2 }); haptic(10); },
    guarded: () => { noise({ dur: 0.1, gain: 0.11, freq: 3400, q: 3, sweepTo: 1800 }); tone({ freq: 520, to: 380, dur: 0.1, type: "sine", gain: 0.07 }); },
    heal: () => run([523, 659, 880], { dur: 0.22, type: "sine", gain: 0.09, step: 0.05 }),
    buff: () => run([330, 415, 494], { dur: 0.2, type: "triangle", gain: 0.08, step: 0.045 }),
    debuff: () => { tone({ freq: 300, to: 170, dur: 0.26, type: "sine", gain: 0.09 }); haptic(16); },
    poison: () => { tone({ freq: 210, to: 150, dur: 0.22, type: "sine", gain: 0.07 }); noise({ dur: 0.18, gain: 0.05, freq: 700, q: 2 }); },
    foeDown: () => { tone({ freq: 300, to: 60, dur: 0.42, type: "sawtooth", gain: 0.13 }); noise({ dur: 0.4, gain: 0.11, freq: 1200, sweepTo: 120 }); haptic([30, 40, 60]); },

    // the turn
    turn: () => { tone({ freq: 300, to: 400, dur: 0.14, type: "sine", gain: 0.07 }); SFX.draw(); },
    endTurn: () => { tone({ freq: 400, to: 260, dur: 0.16, type: "triangle", gain: 0.08 }); haptic(14); },
    energy: () => tone({ freq: 700, to: 900, dur: 0.06, type: "sine", gain: 0.05 }),

    // things you pick up
    potion: () => { tone({ freq: 620, to: 880, dur: 0.2, type: "sine", gain: 0.1 }); noise({ dur: 0.12, gain: 0.05, freq: 2600, q: 1.6, delay: 0.05 }); haptic([14, 26, 14]); },
    trinket: () => { run([523, 784, 1047], { dur: 0.26, type: "sine", gain: 0.1, step: 0.07 }); haptic([16, 30, 16, 30, 40]); },
    card: () => { run([440, 587, 740], { dur: 0.24, type: "triangle", gain: 0.1, step: 0.06 }); haptic([14, 24, 30]); },
    embers: () => run([880, 1170], { dur: 0.12, type: "sine", gain: 0.07, step: 0.05 }),
    curse: () => { tone({ freq: 190, to: 120, dur: 0.5, type: "sawtooth", gain: 0.1 }); noise({ dur: 0.4, gain: 0.07, freq: 420, q: 2.4 }); haptic([40, 60, 40]); },

    // the fire, the anvil, the shelf
    sharpen: () => { noise({ dur: 0.2, gain: 0.14, freq: 3200, q: 1.4, sweepTo: 5200 }); tone({ freq: 660, to: 990, dur: 0.22, type: "triangle", gain: 0.1, delay: 0.06 }); haptic([18, 26, 30]); },
    burn: () => { noise({ dur: 0.5, gain: 0.12, freq: 900, sweepTo: 260, q: 0.8 }); tone({ freq: 240, to: 110, dur: 0.42, type: "sawtooth", gain: 0.08 }); haptic([24, 40, 24]); },
    rest: () => run([392, 494, 587, 784], { dur: 0.5, type: "sine", gain: 0.08, step: 0.13 }),
    buy: () => { run([784, 1047], { dur: 0.14, type: "sine", gain: 0.09, step: 0.06 }); haptic(16); },
    key: () => { run([523, 698, 880, 1175], { dur: 0.5, type: "sine", gain: 0.11, step: 0.1 }); haptic([20, 40, 20, 40, 80]); },
    chest: () => { noise({ dur: 0.24, gain: 0.12, freq: 700, q: 1, sweepTo: 2400 }); run([659, 880, 1175], { dur: 0.3, type: "sine", gain: 0.1, step: 0.08, delay: 0.1 }); haptic([20, 30, 50]); },

    // the room, the map, the run
    tap: () => { tone({ freq: 620, dur: 0.045, type: "sine", gain: 0.05 }); haptic(8); },
    open: () => tone({ freq: 420, to: 620, dur: 0.12, type: "sine", gain: 0.07 }),
    close: () => tone({ freq: 520, to: 340, dur: 0.1, type: "sine", gain: 0.06 }),
    step: () => { noise({ dur: 0.12, gain: 0.08, freq: 600, q: 0.9, sweepTo: 260 }); haptic(12); },
    elite: () => { tone({ freq: 160, to: 110, dur: 0.7, type: "sawtooth", gain: 0.12 }); noise({ dur: 0.6, gain: 0.08, freq: 300, q: 1.4 }); haptic([40, 60, 40]); },
    boss: () => { tone({ freq: 110, to: 70, dur: 1.1, type: "sawtooth", gain: 0.15 }); tone({ freq: 165, to: 105, dur: 1.0, type: "square", gain: 0.07, delay: 0.08 }); noise({ dur: 0.9, gain: 0.09, freq: 240, q: 1.2 }); haptic([60, 80, 60, 80, 120]); },
    win: () => { run([523, 659, 784, 1047], { dur: 0.42, type: "sine", gain: 0.12, step: 0.11 }); haptic([30, 50, 30, 50, 100]); },
    lose: () => { run([392, 330, 262, 196], { dur: 0.6, type: "sine", gain: 0.11, step: 0.16 }); haptic([80, 120, 200]); },
    rank: () => { run([523, 659, 784, 1047, 1319], { dur: 0.5, type: "sine", gain: 0.13, step: 0.1 }); haptic([25, 40, 25, 40, 25, 40, 120]); },
    unlock: () => { run([440, 554, 659, 880], { dur: 0.44, type: "triangle", gain: 0.12, step: 0.09 }); haptic([20, 35, 20, 35, 90]); },

    // ── THE BRIG ─────────────────────────────────────────────────────────────────────────────────────
    // Everything down here is IRON, TIMBER or BREATH — no bells, no chimes, nothing bright. The palette
    // above has plenty of pretty sounds and not one of them belongs in a cell.
    brigDoor: () => { noise({ dur: 0.5, gain: 0.16, freq: 260, q: 0.7, sweepTo: 90 }); tone({ freq: 88, to: 62, dur: 0.5, type: "square", gain: 0.1 }); haptic([50, 30, 70]); },
    brigTake: () => { noise({ dur: 0.22, gain: 0.13, freq: 420, q: 1.1, sweepTo: 160 }); tone({ freq: 120, to: 84, dur: 0.3, type: "sawtooth", gain: 0.1, delay: 0.05 }); haptic([30, 40, 60]); },
    // He gives ground: one link going, and a breath let out under it.
    brigCrack: () => { noise({ dur: 0.13, gain: 0.15, freq: 1900, q: 2.6, sweepTo: 700 }); tone({ freq: 196, to: 262, dur: 0.26, type: "sine", gain: 0.09, delay: 0.04 }); haptic([18, 26, 18]); },
    // He sets himself. A door being put back on its latch.
    brigHarden: () => { tone({ freq: 104, to: 74, dur: 0.34, type: "square", gain: 0.13 }); noise({ dur: 0.2, gain: 0.11, freq: 300, q: 1.6, sweepTo: 120, delay: 0.03 }); haptic([50, 70, 50]); },
    // Nothing moves. The ship does, though — it always does.
    brigRead: () => { noise({ dur: 0.42, gain: 0.06, freq: 340, q: 2.2, sweepTo: 220 }); tone({ freq: 147, dur: 0.3, type: "sine", gain: 0.04 }); haptic(10); },
    // The nerve going down. Deliberately almost nothing: it should be felt more than heard.
    brigNerve: () => noise({ dur: 0.3, gain: 0.045, freq: 620, q: 1.2, sweepTo: 300 }),
    // He talks. The one loud thing in the room, and it is still not a fanfare.
    brigBreak: () => {
        noise({ dur: 0.36, gain: 0.16, freq: 1500, q: 1.2, sweepTo: 300 });
        run([147, 196, 233, 294], { dur: 0.9, type: "sine", gain: 0.12, step: 0.13, delay: 0.1 });
        tone({ freq: 74, to: 58, dur: 1.0, type: "sawtooth", gain: 0.09 });
        haptic([40, 50, 40, 50, 140]);
    },
    // Three confessions laid together and folded into one thing.
    brigChart: () => { noise({ dur: 0.5, gain: 0.09, freq: 2200, q: 0.8, sweepTo: 900 }); run([233, 294, 349, 466], { dur: 0.7, type: "triangle", gain: 0.11, step: 0.11, delay: 0.08 }); haptic([20, 30, 20, 30, 90]); },
    // He buys himself back, and it is coins and a key.
    brigRansom: () => { run([392, 330], { dur: 0.2, type: "triangle", gain: 0.09, step: 0.07 }); noise({ dur: 0.26, gain: 0.1, freq: 1400, q: 2, sweepTo: 500, delay: 0.05 }); haptic([16, 26]); },

    // ── THE FOREST ───────────────────────────────────────────────────────────────────────────────────
    // ⚠️ THE CHOP IS PLAYED TEN TIMES A SECOND, so it has to be SHORT and it has to VARY. A fixed sample at
    // mashing speed becomes a buzz within a second — the pitch is jittered per swing so a run of them reads
    // as chopping rather than as one tone stuttering. Everything here is wood, not metal: the axe is the
    // quiet half of the sound and the trunk is the loud half.
    forestChop: () => {
        const j = 0.86 + Math.random() * 0.3;
        noise({ dur: 0.055, gain: 0.13, freq: 900 * j, q: 1.5, sweepTo: 260 * j });
        tone({ freq: 160 * j, to: 96 * j, dur: 0.07, type: "square", gain: 0.07 });
        haptic(9);
    },
    // The same swing once the rhythm is up: deeper, with the ring of a well-struck haft behind it.
    forestBite: () => {
        const j = 0.9 + Math.random() * 0.22;
        noise({ dur: 0.08, gain: 0.17, freq: 1500 * j, q: 1.1, sweepTo: 300 * j });
        tone({ freq: 210 * j, to: 84 * j, dur: 0.11, type: "sawtooth", gain: 0.1 });
        haptic(16);
    },
    // The trunk giving. One crack, then the long fall.
    forestTimber: () => {
        noise({ dur: 0.22, gain: 0.2, freq: 700, q: 0.8, sweepTo: 150 });
        tone({ freq: 120, to: 44, dur: 0.9, type: "sawtooth", gain: 0.13, delay: 0.06 });
        noise({ dur: 0.7, gain: 0.12, freq: 400, q: 0.7, sweepTo: 90, delay: 0.18 });
        haptic([40, 60, 40, 90]);
    },
    forestWood: () => { run([392, 523, 659], { dur: 0.26, type: "triangle", gain: 0.1, step: 0.07 }); haptic([14, 24, 34]); },
    forestAxe: () => { noise({ dur: 0.3, gain: 0.14, freq: 3400, q: 1.6, sweepTo: 5600 }); run([523, 784, 1047], { dur: 0.34, type: "sine", gain: 0.11, step: 0.08, delay: 0.06 }); haptic([20, 34, 20, 60]); },
};

/** Play by name, ignoring anything this palette has never heard of. */
export const sfx = (name) => { try { SFX[name]?.(); } catch { /* ignore */ } };

// ── MUSIC ────────────────────────────────────────────────────────────────────────────────────────────────
// A slow arpeggio over a held drone, built the same way as everything above and scheduled a note at a time.
// It is NOT a soundtrack — it is the room's own hum at a thirteenth of full volume, and its whole job is to
// stop a fight feeling like a spreadsheet. Each track is a scale and a tempo, and the tension between the
// acts is the SCALE going darker rather than the arrangement getting busier.
const TRACKS = {
    table: { root: 196.00, steps: [0, 3, 7, 10, 7, 3], beat: 0.62, type: "sine", drone: true },
    map: { root: 174.61, steps: [0, 5, 7, 12, 7, 5], beat: 0.55, type: "triangle", drone: true },
    fight: { root: 146.83, steps: [0, 3, 7, 3], beat: 0.36, type: "triangle", drone: true },
    elite: { root: 130.81, steps: [0, 3, 6, 3, 10, 3], beat: 0.30, type: "sawtooth", drone: true },
    boss: { root: 110.00, steps: [0, 1, 5, 6, 5, 1], beat: 0.44, type: "sawtooth", drone: true },
    shop: { root: 220.00, steps: [0, 4, 7, 11, 7, 4], beat: 0.44, type: "sine", drone: false },
    campfire: { root: 164.81, steps: [0, 7, 12, 7], beat: 0.78, type: "sine", drone: true },
    // ── THE FOREST ── open, cold and slow, with a fifth that never resolves. It sits under a lot of tapping.
    forest: { root: 146.83, steps: [0, 7, 5, 7, 0, 3], beat: 1.05, type: "sine", drone: true },
    event: { root: 155.56, steps: [0, 2, 3, 7, 3, 2], beat: 0.50, type: "sine", drone: true },
    // ── BELOW DECKS ──────────────────────────────────────────────────────────────────────────────────
    // The slowest thing in here on purpose. An interrogation is a room where nothing is happening fast
    // and both of you know it — so a beat almost twice the campfire's, a minor second in the phrase to
    // keep it from ever settling, and a sawtooth drone under it for the timber.
    brig: { root: 123.47, steps: [0, 1, 5, 1, 0, 5], beat: 0.92, type: "sawtooth", drone: true },
};

let music = null;

export function stopMusic() {
    if (!music) return;
    clearInterval(music.timer);
    music.voices.forEach((v) => { try { v.stop(); } catch { /* already stopped */ } });
    music = null;
}

/**
 * Start, or switch to, a track.
 *
 * ⚠️ CALLING IT WITH THE TRACK ALREADY PLAYING IS A NO-OP. A component may call this on every render without
 * restarting the music underneath itself, which is the bug every hand-rolled game soundtrack has.
 */
export function playMusic(key) {
    if (!isBrowser() || !pref.music) return;
    const spec = TRACKS[key];
    if (!spec) { stopMusic(); return; }
    if (music && music.key === key) return;
    const a = live(); if (!a) return;
    stopMusic();

    const voices = [];
    // Two oscillators a few cents apart. That beating is what makes a held note breathe instead of sit still.
    if (spec.drone) {
        for (const detune of [-4, 4]) {
            try {
                const o = a.createOscillator(); const g = a.createGain();
                // AT THE ROOT, NOT AN OCTAVE UNDER IT. See MUSIC_GAIN: root/2 put every drone between 55
                // and 110Hz, which a phone speaker cannot reproduce at all.
                o.type = "sine"; o.frequency.value = spec.root; o.detune.value = detune;
                g.gain.value = 0.3;
                o.connect(g); g.connect(musicBus); o.start();
                voices.push(o);
            } catch { /* ignore */ }
        }
    }

    let i = 0;
    // AN OCTAVE UP, for the reason written by MUSIC_GAIN: the tune was pitched under the speaker.
    // The intervals are untouched, so every track is the same tune in the same mode — the scale going
    // darker between the acts is still the whole arrangement.
    const semitone = (n) => spec.root * 2 * (2 ** (n / 12));
    const beat = () => {
        if (!ctx || ctx.state !== "running") return;
        const n = spec.steps[i % spec.steps.length];
        i += 1;
        try {
            const t = ctx.currentTime;
            const o = ctx.createOscillator(); const g = ctx.createGain();
            o.type = spec.type; o.frequency.value = semitone(n);
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
            g.gain.exponentialRampToValueAtTime(0.0001, t + spec.beat * 0.95);
            o.connect(g); g.connect(musicBus);
            o.start(t); o.stop(t + spec.beat);
        } catch { /* ignore */ }
    };
    beat();
    music = { key, timer: setInterval(beat, spec.beat * 1000), voices };
}

export const musicPlaying = () => (music ? music.key : null);
