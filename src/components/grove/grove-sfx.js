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

/**
 * The run ending. Falls further and lands harder than the boss notice, and holds — the boss sound is a
 * warning and has to leave room for a fight to start over it, while this one has nothing after it.
 */
export function playDeath() {
    const a = audio();
    if (!a) return;
    try {
        note(a, 146.83, 0.00, 0.30, 0.24);              // D3, the blow
        note(a, 73.42, 0.10, 1.60, 0.26);               // D2 under it, long
        note(a, 49.00, 0.22, 2.00, 0.20);               // G1, the floor dropping out
    } catch { /* a missing chime must never break the screen */ }
    try {
        if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
            navigator.vibrate(320);
        }
    } catch { /* ignore */ }
}

/**
 * Something very large noticing you. A low pair of notes falling rather than rising, which is the whole
 * trick: every reward sound in this file climbs, so a sound that DESCENDS reads as a threat before the
 * player has worked out what made it. Long and quiet enough to sit under a fight that is about to start.
 */
export function playBossNotice() {
    const a = audio();
    if (!a) return;
    try {
        note(a, 110.00, 0.00, 1.10, 0.22);              // A2
        note(a, 82.41, 0.16, 1.30, 0.20);               // E2, under it
        note(a, 164.81, 0.06, 0.90, 0.09, "sine");      // E3 body
    } catch { /* a missing chime must never break the screen */ }
    try {
        if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
            navigator.vibrate([40, 50, 40, 50, 120]);
        }
    } catch { /* ignore */ }
}

/**
 * An emblem falling. ⚠️ DELIBERATELY NOT THE UNLOCK TRIAD. An emblem is about one kill in four hundred and
 * the way on opens twelve times in the whole map, so they are both "you got it" — and giving them the same
 * chime means the rarest thing in the Grove announces itself with a sound the player already associates with
 * a door. Two rare events that sound identical are one event as far as memory is concerned.
 *
 * So: a low struck note with a long tail and a shimmer climbing out of it, rather than a rising triad. It
 * reads as something LANDING and then ringing, which is what an emblem does — it is an object that fell, not
 * a gate that opened.
 */
export function playEmblemDrop() {
    const a = audio();
    if (!a) return;
    try {
        note(a, 196.00, 0.00, 0.55, 0.20);              // G3, the weight of it hitting
        note(a, 392.00, 0.04, 0.80, 0.10, "sine");      // G4 ringing under
        note(a, 1174.66, 0.14, 0.95, 0.07, "sine");     // D6 shimmer
        note(a, 1760.00, 0.24, 1.10, 0.05, "sine");     // A6, the tail nobody consciously hears
    } catch { /* a missing chime must never break the screen */ }
    try {
        if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
            // One long pulse rather than the unlock's double tap, so even the phone says something different.
            navigator.vibrate(150);
        }
    } catch { /* ignore */ }
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

/**
 * Drinking something off the belt.
 *
 * ⚠️ IT RISES, AND EVERY HURT SOUND IN THIS FILE FALLS. The quaff lands inside the same half second as
 * playHurt (the hit that drops you under the line is what triggers the eat), so the two have to be telling
 * the player opposite things or the heal is heard as more damage. A swallow, then three notes climbing a
 * fifth -- short enough that a run of them in a bad fight does not turn into a melody.
 */
export function playQuaff() {
    const a = audio();
    if (!a) return;
    try {
        // The swallow: a soft low body, nothing like the sharp thud of a blow.
        thud(a, { freq: 300, dur: 0.1, peak: 0.16, q: 1.1, type: "lowpass" });
        note(a, 523.25, 0.02, 0.1, 0.085, "sine");
        note(a, 659.25, 0.08, 0.1, 0.085, "sine");
        note(a, 783.99, 0.14, 0.16, 0.075, "sine");
    } catch { /* ignore */ }
}

// ── ⚠️ A SOUND PER ABILITY, AND NOT ONE OF THEM IS A FILE ───────────────────────────────────────────────────
// Luke: "every ability should have effects that are unique. Visual. And sound."
//
// Everything audible in the Grove is built from an oscillator and a noise burst -- there is not one .mp3 in
// the feature, which is why adding a dozen sounds costs nothing to serve and nothing to download. That is
// also the constraint worth respecting: these have to be CHARACTER rather than production, so each one is
// built from the shape of the thing it describes.
//
// ⚠️ AND THEY HAVE TO SURVIVE EACH OTHER. Half of these fire in the same half-second as playHit, which is
// already playing, and as whatever the creature is doing -- so every one of them is short, and none sits in
// the same register as a landed blow (which is a mid thud at 200-900Hz). Cold is glass at the top, a stun is
// a dull knock underneath, magic is a bell between them.

/** A freeze: glass forming, then cracking. The one sound in here that goes UP and then stops dead. */
export function playFreeze() {
    const a = audio();
    if (!a) return;
    try {
        note(a, 1318.5, 0.00, 0.10, 0.07, "sine");
        note(a, 1760.0, 0.04, 0.12, 0.06, "sine");
        note(a, 2093.0, 0.08, 0.16, 0.05, "sine");
        // The crack. Bright, short, and filtered high so it never muddies the blow underneath it.
        thud(a, { freq: 3200, dur: 0.05, peak: 0.1, q: 3.2, at: 0.1 });
    } catch { /* ignore */ }
}

/** A stun: a knock on something hollow, and the ring it leaves behind. */
export function playStun() {
    const a = audio();
    if (!a) return;
    try {
        thud(a, { freq: 240, dur: 0.1, peak: 0.26, q: 0.9, type: "lowpass" });
        note(a, 880, 0.03, 0.18, 0.05, "sine");
        note(a, 660, 0.07, 0.22, 0.04, "sine");
    } catch { /* ignore */ }
}

/** A chill: cold arriving, with nothing hard in it. Quietest sound in the feature, because it stacks. */
export function playChill() {
    const a = audio();
    if (!a) return;
    try {
        note(a, 1046.5, 0.00, 0.2, 0.035, "sine");
        note(a, 784.0, 0.05, 0.24, 0.03, "sine");
    } catch { /* ignore */ }
}

/** Cataclysm: both halves at once, so it is the only sound here with a floor AND a ceiling. */
export function playCataclysm() {
    const a = audio();
    if (!a) return;
    try {
        thud(a, { freq: 150, dur: 0.3, peak: 0.34, q: 0.7, type: "lowpass" });
        thud(a, { freq: 3400, dur: 0.14, peak: 0.14, q: 2.6, at: 0.02 });
        note(a, 196.0, 0.00, 0.34, 0.1, "sawtooth");
        note(a, 1567.98, 0.06, 0.26, 0.06, "sine");
        note(a, 2093.0, 0.12, 0.3, 0.05, "sine");
    } catch { /* ignore */ }
}

/** Soulfire: a struck bell with no attack on it, because it is not a blow. */
export function playSoulfire() {
    const a = audio();
    if (!a) return;
    try {
        note(a, 1174.66, 0.00, 0.26, 0.055, "sine");
        note(a, 1760.0, 0.03, 0.3, 0.04, "sine");
    } catch { /* ignore */ }
}

/** A surge: counted, not rolled, so it is the one proc that gets to sound like it was coming. */
export function playSurge() {
    const a = audio();
    if (!a) return;
    try {
        note(a, 261.63, 0.00, 0.1, 0.08, "sawtooth");
        note(a, 392.00, 0.05, 0.1, 0.09, "sawtooth");
        note(a, 523.25, 0.10, 0.14, 0.1, "sawtooth");
        note(a, 783.99, 0.15, 0.2, 0.09, "square");
        thud(a, { freq: 900, dur: 0.1, peak: 0.16, q: 1.4, at: 0.15 });
    } catch { /* ignore */ }
}

/** A guard going up: metal seating, not metal struck. */
export function playGuard() {
    const a = audio();
    if (!a) return;
    try {
        thud(a, { freq: 700, dur: 0.11, peak: 0.2, q: 2.2 });
        note(a, 329.63, 0.02, 0.16, 0.07, "triangle");
        note(a, 493.88, 0.07, 0.2, 0.06, "triangle");
    } catch { /* ignore */ }
}

/** A block: one bright tick off the shield. It fires often, so it is the shortest sound in the file. */
export function playBlock() {
    const a = audio();
    if (!a) return;
    try { thud(a, { freq: 2100, dur: 0.045, peak: 0.13, q: 3.4 }); } catch { /* ignore */ }
}

/** A riposte: the answer, so it is a blow that arrives a beat late and sharper than yours. */
export function playRiposte() {
    const a = audio();
    if (!a) return;
    try {
        thud(a, { freq: 1500, dur: 0.07, peak: 0.2, q: 2.6 });
        note(a, 1318.5, 0.02, 0.1, 0.07, "square");
        note(a, 1975.5, 0.06, 0.12, 0.05, "square");
    } catch { /* ignore */ }
}

/** A grudge paid: everything they did to you, coming back at once. Low, and the only one that growls. */
export function playGrudge() {
    const a = audio();
    if (!a) return;
    try {
        note(a, 110, 0.00, 0.2, 0.12, "sawtooth");
        note(a, 146.83, 0.05, 0.22, 0.1, "sawtooth");
        thud(a, { freq: 320, dur: 0.16, peak: 0.24, q: 0.8, type: "lowpass", at: 0.04 });
    } catch { /* ignore */ }
}

/** Something catching fire. A hiss, and nothing tonal at all -- fire is the one effect with no note in it. */
export function playIgnite() {
    const a = audio();
    if (!a) return;
    try {
        thud(a, { freq: 1800, dur: 0.22, peak: 0.12, q: 0.6, type: "bandpass" });
        thud(a, { freq: 900, dur: 0.16, peak: 0.09, q: 0.5, at: 0.05 });
    } catch { /* ignore */ }
}

/** The wild proc: it picks one of three at random, so the sound is the only one here that is unstable. */
export function playWild(pick = 0) {
    const a = audio();
    if (!a) return;
    try {
        const base = [587.33, 698.46, 880.0][pick % 3];
        note(a, base, 0.00, 0.08, 0.08, "square");
        note(a, base * 1.5, 0.04, 0.1, 0.07, "square");
        note(a, base * 2, 0.08, 0.12, 0.06, "square");
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

/**
 * The pet's bite. Deliberately NOT playHit at a lower volume.
 *
 * ⚠️ A DIFFERENT TIMBRE, NOT A QUIETER COPY. The hero's hit is a low filtered thud with a semitone ladder
 * climbing through the combo; the same sample at half volume underneath it does not read as a second
 * attacker, it reads as the first one's sound being inconsistent — and at half a second apart the ear
 * reliably hears a quiet copy of a loud thing as an echo or a fault.
 *
 * So this is short, dry and HIGH, with a tiny bit of noise in it: a snap rather than an impact. It sits in
 * a band the hero's blows do not occupy, which is what lets both be audible at once without either having
 * to get out of the way.
 *
 * ⚠️ AND IT TAKES NO COMBO STEP. The ladder is the player's streak — it is the sound of THEIR run going
 * well, and a companion walking up the same scale on its own schedule turns a rising line into noise.
 */
export function playPetHit(crit = false) {
    const a = audio();
    if (!a) return;
    try {
        thud(a, { freq: crit ? 1480 : 1180, dur: 0.045, peak: crit ? 0.15 : 0.1, q: 2.2, type: "highpass" });
        // One short high note on a crit, a fifth above the snap — the pet's equivalent of the hero's glint,
        // and the only thing that separates its crit from its ordinary bite by ear.
        if (crit) note(a, 1760, 0.015, 0.05, 0.055, "triangle");
    } catch { /* silence must never break a fight */ }
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
