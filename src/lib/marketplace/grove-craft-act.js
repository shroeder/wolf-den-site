import { QUALITY_BANDS, qualityOdds } from "@/lib/marketplace/grove-forge.js";

// ── THE ACT OF CRAFTING ──────────────────────────────────────────────────────────────────────────────────────
// Luke: "Let's make it fun." And, on what that means: "3 interactive steps, thematically fitting, one is timing
// based, one is tap frequency based. And one is just rng, la plinko ball hitting pegs on itd way down. With
// varying buckets."
//
// The bench had a decision (tempering) and no ACT. Pressing Craft was still a press — you chose a row, the game
// rolled a number, a card told you what happened. These are the three beats that happen instead:
//
//   1  THE HEAT     tap frequency.  Work the bellows. The coals come up to temperature.
//   2  THE STRIKE   timing.         Three hammer blows, each into a moving window.
//   3  THE SET      pure rng.       The piece drops through the pegs and lands in a band.
//
// ⚠️ PURE. No db, no server-only. The overlay plays this and the server re-computes it, exactly like
// grove-roll.js and grove-recipes.js. Two copies of this arithmetic would be two different games.
//
// ── ⚠️ THE WHOLE POINT: THE PLINKO IS THE QUALITY CURVE, NOT A SECOND ONE ───────────────────────────────────
// The buckets ARE the five quality bands, and each bucket is sized so the chance of the ball finishing in it
// is that band's real share at this crafting level. The board a player looks at is therefore a picture of
// qualityOdds — the same percentages printed on the banner over the recipe list, drawn as a physical object.
//
// That is what keeps this from being decoration bolted onto a random number. A minigame whose result is
// decided elsewhere and then animated is a cutscene; this one has the real distribution in its geometry. The
// bug fixed the day before this shipped — printed odds not matching the roll — would now be VISIBLE, as a
// board whose buckets were the wrong size.
//
// ── WHAT THE SKILL BEATS DO: THEY TIGHTEN THE SCATTER ───────────────────────────────────────────────────────
// They do not widen the buckets and they do not aim the piece. They decide how closely it lands to where
// the PLAYER aimed it, which is what makes the narrow middle of the rack worth going for at all.
//
// ⚠️ AND THE BIAS IS CAPPED AT ROUGHLY WHAT TEMPERING BUYS. Two reasons, and the second is the real one.
// First, a thumb should not out-earn the crafting LADDER — twenty-five levels would mean nothing against a
// player with fast hands. Second, this is the one number in the Grove the server cannot verify: it can
// replay a kill from a seed, but it cannot replay whether somebody actually hit the window. A claim taken on
// trust must be worth little enough that lying about it is not worth the trouble. See clampAct.
export const ACT_MAX_BIAS = 0.52;     // same units as TEMPER_BONUS, which is 0.5

// ── THE HEAT: TAP FREQUENCY ──────────────────────────────────────────────────────────────────────────────────
// The opener, because it is the one beat nobody can fail. No window to miss, nothing to learn: tap and the
// coals brighten. A player meeting this screen for the first time does the obvious thing and it works, which
// is what the first of three beats is for.
export const HEAT_MS = 2600;
// ── ⚠️ A BEAT BETWEEN THE BELLOWS AND THE ANVIL ─────────────────────────────────────────────────────────────
// Luke: "there should be like a delay between the tapping phase and then the timing phase, because after
// you're done tapping, you waste one of your timing swings."
//
// The heat phase ends on a clock while the player is still mid-flurry -- seven taps a second is the whole
// point of it -- so the first strike window opened underneath a thumb that was already coming down. The
// opening swing was not a decision, it was the tail of the previous phase, and three strikes is few enough
// that losing one to a hand-off is most of the beat.
//
// 650ms: long enough for a flurry to stop and an eye to find the new window, short enough that it reads as
// the piece being moved to the anvil rather than as the game pausing.
export const HAND_OFF_MS = 650;

export const HEAT_TARGET = 18;        // taps for a full bar — about seven a second, brisk but not a drum roll
/** 0..1. Over-tapping is capped: there is no prize for a hundred, so nobody has to find that out. */
export const heatScore = (taps) => Math.max(0, Math.min(1, (Number(taps) || 0) / HEAT_TARGET));

// ── THE STRIKE: TIMING ───────────────────────────────────────────────────────────────────────────────────────
// ⚠️ A TIMING BEAT IS A SHAPE THIS GAME HAS REMOVED THREE TIMES — all three from combat, and Luke asked for
// one here with that history on the table. The difference that makes it survivable is that combat's version
// gated something you had to do over and over to progress, and this gates a bonus on an act you choose to
// start. Keeping that true is what the forgiving numbers below are for.
//
// THREE strikes: long enough to have a rhythm, short enough that the whole act stays under ten seconds. The
// window is generous on purpose — HIT is most of the bar and PERFECT is a real but unhurried target. Missing
// all three is still a craft; it is a craft with a narrower board.
export const STRIKES = 3;
export const STRIKE_MS = 1150;        // one sweep of the marker, per strike
export const STRIKE_HIT = 0.30;       // half-width of the hit zone, as a share of the bar
export const STRIKE_PERFECT = 0.09;   // half-width of the perfect core

/** Grade one strike from how far off centre it landed. 0 is dead centre, 1 is the end of the bar. */
export function strikeGrade(offset) {
    const d = Math.abs(Number(offset) || 0);
    if (d <= STRIKE_PERFECT) return { id: "perfect", label: "Perfect", score: 1 };
    if (d <= STRIKE_HIT) return { id: "hit", label: "Hit", score: 0.55 };
    return { id: "miss", label: "Miss", score: 0 };
}

// Weighted toward the strikes, because they are the beat with something to learn. The heat is a floor: turn
// up and tap and you already hold most of a third of it.
export const HEAT_WEIGHT = 0.35;
export const STRIKE_WEIGHT = 0.65;

/** 0..1 across both skill beats. */
export function actScore({ heat = 0, strikes = [] } = {}) {
    const h = Math.max(0, Math.min(1, Number(heat) || 0));
    const list = Array.isArray(strikes) ? strikes.slice(0, STRIKES) : [];
    const s = list.reduce((a, x) => a + Math.max(0, Math.min(1, Number(x) || 0)), 0) / STRIKES;
    return Math.max(0, Math.min(1, h * HEAT_WEIGHT + s * STRIKE_WEIGHT));
}

/**
 * ⚠️ THE SERVER VIEW OF A CLAIM IT CANNOT CHECK.
 *
 * The client plays the beats and reports two numbers. There is no seed that replays a thumb, so unlike a kill
 * — which the server re-rolls from its own seed and grants what IT computes — this is genuinely taken on the
 * client word. The posture is therefore not "detect the lie", it is "make the lie not worth telling":
 *
 *   · every input is clamped into range, so a claim of heat 900 is a claim of heat 1
 *   · the whole act is worth about what tempering is worth, and tempering costs real parts
 *   · nothing here reaches a band that was unreachable; it widens the odds and stops
 *
 * A perfect act is therefore worth having and not worth cheating for, which is the only stable place to put
 * a number the server cannot see.
 */
export function clampAct(act) {
    const strikes = Array.isArray(act?.strikes) ? act.strikes : [];
    return {
        heat: Math.max(0, Math.min(1, Number(act?.heat) || 0)),
        strikes: Array.from({ length: STRIKES }, (_, i) => Math.max(0, Math.min(1, Number(strikes[i]) || 0))),
    };
}

/** The bias the act adds, in the same units the level and the temper feed. */
export const actBias = (act) => actScore(clampAct(act)) * ACT_MAX_BIAS;

// ── THE SET: THE RACK ────────────────────────────────────────────────────────────────────────────────────────
// Luke: "one is just rng, la plinko ball hitting pegs on itd way down. With varying buckets." Then: "User
// should be able to pick where to drop the thing also." Then, on the version that ran worst-to-best with a
// cliff at one end: "I don't know if you know anything about Plinko, but the best thing is small and in the
// middle, and then it goes out from there."
//
// ⚠️ HE IS DESCRIBING THE ACTUAL OBJECT AND I HAD BUILT SOMETHING ELSE. A plinko rack is symmetric with the
// jackpot a narrow slot dead centre and the value falling away to both edges. A left-to-right gradient with
// a drop at one end is a pachinko chute; it reads as a progress bar and it has no middle to aim at.
//
//            ROUGH   SOUND   FINE  PRIS [MW] PRIS  FINE   SOUND   ROUGH
//            wide ...................... narrow ...................... wide
//
// Everything good about the beat survives the change and one thing improves: the aim is now a question of
// NERVE AND PRECISION rather than of picking a point on a ramp. The middle is worth the most and is the
// hardest to hold; the skill beats decide how tightly the piece tracks where you put it, so a clean heat
// and three good strikes are what make the centre worth going for at all.
//
// ⚠️ AND THE CLIFF IS GONE WITH IT. It existed because a one-way ramp needed a downside at the rich end.
// A symmetric rack has its own: miss the middle and you slide outward through every worse band in turn,
// which is a far more legible punishment than a hole. Anything that scatters off either edge is a Rough,
// the same as the band it was next to.

/** How many rows of pegs the piece rattles through. Purely how long the fall LOOKS; it decides nothing. */
export const PEG_ROWS = 9;

/**
 * The rack: symmetric, jackpot in the middle, value falling away to both edges.
 *
 * ⚠️ EACH BAND IS SPLIT ACROSS TWO SIDES so the two halves together are exactly its share — a Pristine
 * worth 9.8% is two 4.9% slots, one either side of the middle. Masterwork is the exception and the point:
 * it is a single undivided slot at dead centre, so the narrowest thing on the rack is also the only one
 * you can aim straight at.
 */
export function rackFor(level, { temper = false } = {}) {
    const share = Object.fromEntries(qualityOdds(level, temper).map((o) => [o.id, o.share]));
    const outward = QUALITY_BANDS.filter((b) => b.id !== "masterwork");   // pristine, fine, sound, rough
    const spans = [];
    let x = 0;
    const push = (b, w) => { if (w > 0) { spans.push({ id: b.id, name: b.name, mult: b.mult, from: x, to: x + w }); x += w; } };

    // worst outermost, working in
    for (let i = outward.length - 1; i >= 0; i -= 1) push(outward[i], (share[outward[i].id] || 0) / 2);
    push(QUALITY_BANDS[0], share.masterwork || 0);
    for (let i = 0; i < outward.length; i += 1) push(outward[i], (share[outward[i].id] || 0) / 2);

    // ⚠️ THE LAST SPAN IS STRETCHED TO EXACTLY 1, or floating point leaves a sliver at the end of the rack
    // that belongs to no band and a piece landing there lands in nothing.
    if (spans.length) spans[spans.length - 1].to = 1;
    return spans;
}

/** Where the middle is, so the screen can mark it and a keyboard can snap to it. */
export const RACK_MIDDLE = 0.5;

/** What each band is worth across the whole rack — both halves of it. */
export function rackOdds(spans) {
    const out = {};
    for (const s of spans || []) out[s.id] = (out[s.id] || 0) + (s.to - s.from);
    return QUALITY_BANDS.map((b) => ({ id: b.id, name: b.name, mult: b.mult, share: out[b.id] || 0 }));
}

// ── THE SCATTER ──────────────────────────────────────────────────────────────────────────────────────────────
// How far the piece strays from where it was aimed. A fumbled act is most of a quarter of the rack either
// way, which puts the middle out of reach; a flawless one is tight enough to hold it.
//
// ⚠️ A STANDARD DEVIATION, NOT A HARD LIMIT. A cap would make the centre a sure thing above some skill
// threshold, and a jackpot you can guarantee is not a jackpot.
export const SCATTER_WORST = 0.26;
export const SCATTER_BEST = 0.052;
export const scatterFor = (act) => SCATTER_WORST - (SCATTER_WORST - SCATTER_BEST) * actScore(clampAct(act));

/**
 * Where the piece lands, given an aim and a scatter. May be off either end of the rack; the caller treats
 * that as the outermost band, which is Rough on both sides anyway.
 *
 * Box-Muller from a seeded stream, so the server and the replay agree and nothing can be retried.
 */
export function landingFor(aim, scatter, seed) {
    let x = ((Math.floor(Number(seed) || 1) + 101) * 2654435761) >>> 0;
    const rnd = () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return (x >>> 0) / 4294967296; };
    const u1 = Math.max(1e-9, rnd());
    const u2 = rnd();
    const g = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return (Number(aim) || 0) + g * (Number(scatter) || 0);
}

/** The band a landing falls in. Off either edge is Rough, which is also what both edges hold. */
export function bandAt(spans, at) {
    const p = Number(at);
    if (!Number.isFinite(p) || p < 0 || p >= 1) return "rough";
    for (const s of spans || []) if (p >= s.from && p < s.to) return s.id;
    return "rough";
}

/**
 * ⚠️ THE ODDS FOR THIS AIM, WHICH IS WHAT THE SCREEN MUST SHOW.
 *
 * Band width stopped being band chance the moment the player got to choose where to drop — the chance now
 * depends on the aim and the scatter, and a screen still quoting widths would be quoting a game nobody is
 * playing. That is the printed-odds defect from qualityOdds wearing a different hat, so it gets the same
 * treatment: computed from the real distribution, live, as the aim moves.
 *
 * Numerically integrated rather than solved with an error function: the spans are arbitrary, a grid of a
 * thousand slices is exact to far under a tenth of a point, and it cannot be subtly wrong the way a
 * hand-rolled erf can.
 */
export function oddsForAim(spans, aim, scatter) {
    const SLICES = 1200;
    const sd = Math.max(1e-4, Number(scatter) || 0);
    const a = Number(aim) || 0;
    const out = {};
    const lo = a - sd * 4;
    const hi = a + sd * 4;
    const step = (hi - lo) / SLICES;
    let total = 0;
    for (let i = 0; i < SLICES; i += 1) {
        const x = lo + step * (i + 0.5);
        const z = (x - a) / sd;
        const w = Math.exp(-0.5 * z * z);
        total += w;
        const band = bandAt(spans, x);
        out[band] = (out[band] || 0) + w;
    }
    return {
        bands: QUALITY_BANDS.map((b) => ({ id: b.id, name: b.name, mult: b.mult, share: (out[b.id] || 0) / total })),
    };
}

/**
 * The rattle: one horizontal position per peg row, ENDING where the piece landed.
 *
 * ⚠️ IT DECIDES NOTHING. The landing comes from landingFor and the fall is drawn to agree with it, rather
 * than the client bouncing a piece wherever its own physics takes it and the server being asked to believe
 * where it stopped. The deflections shrink as it falls, which is how a real rack behaves and is what stops
 * the last row being a visible sideways jump into the right bucket.
 */
export function rattle(at, seed) {
    const end = Math.max(-0.04, Math.min(1.04, Number(at) || 0));
    const start = 0.5;
    let x = ((Math.floor(Number(seed) || 1) + 17) * 2246822519) >>> 0;
    const rnd = () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
    const out = [];
    for (let r = 0; r < PEG_ROWS; r += 1) {
        const t = (r + 1) / PEG_ROWS;
        const wobble = (rnd() - 0.5) * 0.2 * (1 - t) ** 1.25;
        out.push(end * t + start * (1 - t) + wobble);
    }
    out[out.length - 1] = end;
    return out;
}

/**
 * A quality score inside a band, so the 0-100 number on a tool and in the craft log stays a real value
 * rather than a band id in disguise.
 *
 * ⚠️ THE BAND IS DECIDED FIRST AND THIS ONLY FILLS IN A SCORE. Rolling a score and reading its band back
 * would be a second roll free to disagree with where the piece landed — the player watching it stop in the
 * middle and being handed a Fine tool.
 */
export function qualityInBand(bandId, seed) {
    const i = QUALITY_BANDS.findIndex((b) => b.id === bandId);
    const band = QUALITY_BANDS[i] || QUALITY_BANDS[QUALITY_BANDS.length - 1];
    const top = i <= 0 ? 100 : QUALITY_BANDS[i - 1].at - 1;
    let x = ((Math.floor(Number(seed) || 1) + 31) * 2246822519) >>> 0;
    x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0;
    return Math.max(0, Math.min(100, band.at + Math.floor((x / 4294967296) * (top - band.at + 1))));
}
