"use client";

// ── THE CASINO'S EARS ────────────────────────────────────────────────────────────────────────────────────────
// A slot machine is a sound with pictures attached. Strip the audio out of any real cabinet and what is left
// is a spreadsheet that occasionally increments — the reels landing, the coins falling, the near-miss, the
// rising note under the last reel: those ARE the game. The maths was finished weeks ago and gated to a tenth
// of a percent; this file is the half that makes anybody want to pull the handle.
//
// Everything is synthesised, on the arena's single AudioContext, through the arena's compressor. Reasons, in
// order of how much they matter here:
//
//   1. A cabinet needs ~25 distinct sounds and there are NINE cabinets. As files that is a folder of assets to
//      draw, host, cache-bust and 404 on, on a page that has to open on a phone in a card shop.
//   2. Sounds here take ARGUMENTS. The reel clunk is pitched by which reel it is, the coin cascade is as long
//      as the win is big, and the anticipation riser is tuned to how long the third reel still has to run.
//      Sampled audio cannot do that without a dozen takes of each.
//   3. There is exactly one AudioContext in the document. Chrome allows about six; the arena already learned
//      that lesson the expensive way, and a second module making its own would re-earn it.
//
// WHY NOT JUST USE `Sfx`. The arena's kit is a fight: impacts, crits, blocks, hurt. A coin cascade and a
// near-miss sigh are not fight sounds, and bolting them on grows one module into everything. Same plumbing,
// separate voice.
import { noise, tone } from "@/components/arena/arena-audio.js";

// ── THE SCALE EVERYTHING IS TUNED TO ─────────────────────────────────────────────────────────────────────────
// A major pentatonic. Every random pitch in this file — every coin, every ball, every daub — is drawn from
// this one set, which is the entire reason forty coins landing at random sound like money rather than like a
// fault. A pentatonic has no semitone in it, so no two notes drawn from it can clash; that is the property
// being used, and it is why an arbitrary number of these can overlap and still sound deliberate.
const PENT = [523.25, 587.33, 659.25, 783.99, 880.0];
const pent = (o = 0) => PENT[Math.floor(Math.random() * PENT.length)] * (2 ** o);

const clamp01 = (n) => Math.max(0, Math.min(1, Number(n) || 0));

export const Cas = {
    // ── THE HANDLE ───────────────────────────────────────────────────────────────────────────────────────
    // Mechanism, not a UI blip: a spring under tension, a low body, and the reels picking up speed. It has to
    // be long enough to cover the request going out, or the machine feels like it did nothing and then
    // suddenly had an answer.
    pull() {
        noise({ dur: 0.16, gain: 0.13, type: "bandpass", freq: 520, sweepTo: 2400, q: 1.1 });
        tone({ freq: 150, to: 62, type: "sawtooth", dur: 0.2, gain: 0.14 });
        tone({ at: 0.04, freq: 84, to: 200, type: "triangle", dur: 0.5, gain: 0.07 });
        // The reels themselves, coming up to speed underneath.
        noise({ at: 0.05, dur: 0.75, gain: 0.05, type: "bandpass", freq: 240, sweepTo: 900, q: 0.7 });
    },

    // ── A REEL COMING TO REST ────────────────────────────────────────────────────────────────────────────
    // Pitched UP by reel index. This is not decoration: rising pitch is read as rising tension by everybody,
    // with no explanation, and the third reel is where the tension is supposed to be. A flat clunk three
    // times says the machine is finishing; a rising one says it is deciding.
    reelStop(index = 0, weight = 0.5) {
        const w = clamp01(weight);
        const up = 1 + index * 0.16;
        tone({ freq: 190 * up, to: 76 * up, type: "square", dur: 0.075, gain: 0.11 + w * 0.05 });
        tone({ freq: 96 * up, to: 44, type: "sine", dur: 0.14, gain: 0.2 });
        noise({ dur: 0.06, gain: 0.13, type: "lowpass", freq: 2400, sweepTo: 420 });
        // A little metal ring on top, so it is a mechanism stopping rather than a box being shut.
        noise({ at: 0.005, dur: 0.1, gain: 0.045, type: "bandpass", freq: 3200 * up, q: 5 });
    },

    // ── THE RISER ────────────────────────────────────────────────────────────────────────────────────────
    // Two reels match and the third is still going. This is the single most valuable sound in the building
    // and it costs nine lines: a note that climbs for exactly as long as the last reel has left, so the
    // moment it stops climbing is the moment you find out. `ms` is that gap — passed in rather than assumed,
    // because the reel timings are the component's business and a riser that ends early is worse than none.
    anticipate(ms = 340) {
        const d = Math.max(0.12, ms / 1000);
        tone({ freq: 330, to: 990, type: "sawtooth", dur: d, gain: 0.055 });
        tone({ freq: 660, to: 1980, type: "triangle", dur: d, gain: 0.035 });
        noise({ dur: d, gain: 0.03, type: "bandpass", freq: 800, sweepTo: 5200, q: 1.6 });
    },

    // The riser resolved into nothing. A short fall — the sound of the room letting its breath out. Kept
    // QUIET and short: a loss that announces itself as loudly as a win is a machine that nags.
    nearMiss() {
        tone({ freq: 494, to: 262, type: "triangle", dur: 0.26, gain: 0.06 });
        tone({ at: 0.03, freq: 370, to: 196, type: "sine", dur: 0.3, gain: 0.045 });
    },

    // A pull that simply did nothing. Almost inaudible on purpose — most pulls lose, and a machine that
    // makes a noise about every one of them is exhausting by the tenth.
    dud() {
        tone({ freq: 150, to: 92, type: "sine", dur: 0.1, gain: 0.05 });
    },

    // ── MONEY ────────────────────────────────────────────────────────────────────────────────────────────
    // Coins land in a scatter, not a rhythm: the gaps between them are randomised and the whole cascade gets
    // longer as the win gets bigger. `size` is 0..1 and buys both the count and the length, so a 2x and a
    // 700x are told apart with your eyes shut — which is the entire point of scaling a sound by its cause.
    coins(size = 0.4) {
        const s = clamp01(size);
        const n = Math.round(4 + s * 22);
        let t = 0;
        for (let i = 0; i < n; i += 1) {
            const oct = Math.random() < 0.35 ? 1 : 0;
            tone({ at: t, freq: pent(oct), type: "triangle", dur: 0.1 + Math.random() * 0.1, gain: 0.05 });
            noise({ at: t, dur: 0.035, gain: 0.03, type: "highpass", freq: 5200 });
            t += 0.028 + Math.random() * (0.05 - s * 0.03);
        }
        // The body underneath the sparkle — without it a cascade is tinsel with no weight behind it.
        tone({ freq: 132, to: 70, type: "sine", dur: 0.22 + s * 0.2, gain: 0.11 + s * 0.08 });
    },

    // A single coin dropping into a bank.
    coin(pitch = 0) {
        tone({ freq: PENT[pitch % PENT.length] * 2, type: "triangle", dur: 0.11, gain: 0.06 });
        noise({ dur: 0.03, gain: 0.03, type: "highpass", freq: 6000 });
    },

    // ── THE BIG ONES ─────────────────────────────────────────────────────────────────────────────────────
    // A rising major arpeggio with the root doubled underneath. Deliberately the ONLY sound in the casino
    // built on stacked thirds: everything else is pentatonic and pentatonic cannot make a chord that sounds
    // like an announcement. When this plays it is the only thing in the room that sounds like this.
    jackpot() {
        const root = 261.63;
        [0, 4, 7, 12, 16, 19, 24].forEach((semi, i) => {
            const f = root * (2 ** (semi / 12));
            tone({ at: i * 0.075, freq: f, type: "triangle", dur: 0.9 - i * 0.05, gain: 0.075 });
            tone({ at: i * 0.075, freq: f * 2, type: "sine", dur: 0.6, gain: 0.03 });
        });
        tone({ freq: 65.4, to: 130.8, type: "sawtooth", dur: 0.9, gain: 0.09 });
        noise({ at: 0.02, dur: 0.7, gain: 0.05, type: "highpass", freq: 4200 });
        this.coins(0.85);
    },

    // The pot. Bigger than a jackpot and it has to sound it, so it gets the fanfare, a bell, and a cascade
    // that runs on well past the point where the fanfare has finished.
    pot() {
        this.jackpot();
        [0, 0.16, 0.32].forEach((at, i) => {
            tone({ at, freq: 1046.5 * (1 + i * 0.005), type: "sine", dur: 1.8 - i * 0.3, gain: 0.06 });
            tone({ at, freq: 1567.98, type: "sine", dur: 1.2, gain: 0.03, detune: i * 7 });
        });
        for (let i = 0; i < 5; i += 1) {
            setTimeout(() => this.coins(0.7), 500 + i * 260);
        }
    },

    // ── THE BANKS ────────────────────────────────────────────────────────────────────────────────────────
    // Fed: a coin in, pitched by which bank — copper low, gold high — so the three are told apart without
    // looking. `fill` is 0..1 and raises the pitch as the bank gets full, which is the audible version of
    // the pig getting fatter.
    bankFeed(tier = 0, fill = 0) {
        const base = [392, 523.25, 659.25][tier] || 392;
        const f = base * (1 + clamp01(fill) * 0.32);
        tone({ freq: f, type: "triangle", dur: 0.13, gain: 0.07 });
        tone({ at: 0.02, freq: f * 2, type: "sine", dur: 0.2, gain: 0.03 });
        noise({ dur: 0.04, gain: 0.035, type: "highpass", freq: 5600 });
    },

    // Burst: something ceramic gives way, and then the money. The shatter has to come FIRST and be short,
    // because a break that rings is a bell, and a piggy bank is not a bell.
    bankBurst(tier = 0) {
        noise({ dur: 0.12, gain: 0.24, type: "bandpass", freq: 2600, q: 0.8, sweepTo: 900 });
        noise({ at: 0.01, dur: 0.3, gain: 0.09, type: "highpass", freq: 3400 });
        tone({ freq: 220 - tier * 30, to: 60, type: "square", dur: 0.16, gain: 0.14 });
        setTimeout(() => this.coins(0.5 + tier * 0.18), 90);
    },

    // ── THE FEATURES ─────────────────────────────────────────────────────────────────────────────────────
    // The Nudge: a ratchet. A mechanism being wound one more notch, which is exactly what the feature is.
    nudge() {
        for (let i = 0; i < 5; i += 1) {
            noise({ at: i * 0.035, dur: 0.02, gain: 0.07, type: "bandpass", freq: 2200 + i * 260, q: 6 });
        }
        tone({ at: 0.17, freq: 330, to: 494, type: "square", dur: 0.14, gain: 0.06 });
    },

    // Free pulls awarded: a climb that keeps going, so it reads as "and there is more" rather than "done".
    freePulls(n = 8) {
        const steps = Math.min(8, Math.max(3, Math.round(n / 2)));
        for (let i = 0; i < steps; i += 1) {
            tone({ at: i * 0.07, freq: PENT[i % PENT.length] * (i > 4 ? 2 : 1), type: "triangle", dur: 0.3, gain: 0.06 });
        }
        tone({ freq: 98, to: 196, type: "triangle", dur: 0.6, gain: 0.08 });
    },

    // The multiplier ticking up one dead pull at a time. Tiny — it happens on most pulls of that machine.
    multUp(mult = 1) {
        const f = 440 * Math.min(2.2, 1 + (mult - 1) * 0.5);
        tone({ freq: f, type: "sine", dur: 0.07, gain: 0.045 });
    },

    // ── THE WHEEL ────────────────────────────────────────────────────────────────────────────────────────
    // A ball on a track. One tick; the caller spaces them out and slows them down, because a wheel is the
    // deceleration, not the noise.
    wheelTick(rate = 1) {
        noise({ dur: 0.018, gain: 0.05 * rate, type: "bandpass", freq: 3200, q: 8 });
    },

    wheelDrop() {
        tone({ freq: 660, to: 240, type: "square", dur: 0.09, gain: 0.09 });
        noise({ dur: 0.07, gain: 0.09, type: "bandpass", freq: 1400, q: 2, sweepTo: 500 });
    },

    // ── DRAWS AND CARDS ──────────────────────────────────────────────────────────────────────────────────
    // A numbered ball landing. Pitched off the ball's own number, so a draw is a little melody that is
    // different every round instead of the same pop ten times.
    ball(n = 0) {
        tone({ freq: PENT[n % PENT.length] * (n > 20 ? 2 : 1), type: "sine", dur: 0.16, gain: 0.06 });
        noise({ dur: 0.05, gain: 0.05, type: "bandpass", freq: 1800, q: 2.4, sweepTo: 700 });
    },

    daub() {
        noise({ dur: 0.045, gain: 0.07, type: "lowpass", freq: 1600, sweepTo: 500 });
        tone({ freq: 300, to: 180, type: "sine", dur: 0.06, gain: 0.05 });
    },

    // A line completing. Short, bright, and NOT the jackpot fanfare — a bingo card can complete six of these
    // in one round and six fanfares would be absurd.
    line(n = 1) {
        [0, 4, 7].forEach((semi, i) => {
            tone({ at: i * 0.05, freq: 523.25 * (2 ** (semi / 12)) * (n > 3 ? 2 : 1), type: "triangle", dur: 0.35, gain: 0.055 });
        });
    },

    // A card leaving the shoe: paper, not a click.
    card() {
        noise({ dur: 0.075, gain: 0.075, type: "highpass", freq: 2600, sweepTo: 6200 });
        tone({ freq: 900, to: 420, type: "sine", dur: 0.05, gain: 0.025 });
    },

    // Chips going down. Several, because nobody bets one chip.
    chips() {
        for (let i = 0; i < 3; i += 1) {
            noise({ at: i * 0.022, dur: 0.04, gain: 0.06, type: "bandpass", freq: 2400 - i * 300, q: 3 });
            tone({ at: i * 0.022, freq: 520 - i * 40, type: "square", dur: 0.035, gain: 0.035 });
        }
    },

    // Going over 21. A drop, and a bit of noise — the opposite shape to every winning sound in the file.
    bust() {
        tone({ freq: 300, to: 74, type: "sawtooth", dur: 0.42, gain: 0.1 });
        noise({ dur: 0.3, gain: 0.06, type: "lowpass", freq: 900, sweepTo: 180 });
    },

    // The house takes it. One flat note; a loss should be brief and unremarkable.
    lose() {
        tone({ freq: 196, to: 147, type: "triangle", dur: 0.2, gain: 0.06 });
    },

    // Stake back. Neither up nor down, which is what a push is.
    push() {
        tone({ freq: 392, type: "sine", dur: 0.16, gain: 0.05 });
        tone({ at: 0.09, freq: 392, type: "sine", dur: 0.16, gain: 0.04 });
    },

    // ── THE DOUBLE-OR-NOTHING FLIP ───────────────────────────────────────────────────────────────────────
    // A coin actually spinning in the air, then landing. The wobble is a detune that widens as it slows.
    flip(ms = 700) {
        const d = ms / 1000;
        for (let i = 0; i < 9; i += 1) {
            tone({ at: (i * d) / 9, freq: 1200, type: "sine", dur: 0.06, gain: 0.035, detune: (i % 2 ? 1 : -1) * (10 + i * 9) });
        }
        tone({ at: d, freq: 880, to: 440, type: "triangle", dur: 0.14, gain: 0.07 });
    },
};

export default Cas;
