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
// ── WHAT THE SKILL BEATS DO, AND WHAT THEY DELIBERATELY DO NOT ──────────────────────────────────────────────
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

// ── THE SET: THE BOARD ───────────────────────────────────────────────────────────────────────────────────────
// Luke: "one is just rng, la plinko ball hitting pegs on itd way down. With varying buckets."
//
// ⚠️ THE FLOOR IS A BAR OF FIVE REGIONS WITH EXACT WIDTHS, AND THE BALL LANDS UNIFORMLY ALONG IT. That is the
// third version of this and the first honest one, so the two that failed are worth recording.
//
// The first drew thirteen discrete slots and let a binomial walk choose one. Contiguous bands over a
// binomial cannot be given arbitrary widths — the centre slot alone is a fifth of every fall — so the board
// could only take a handful of shapes. The gate caught it at once: levels 4, 12 and 25 produced the IDENTICAL
// floor, and Rough played 22.6% where the curve asked for 36.4%.
//
// The second widened it to seventeen slots and walked the cumulative boundaries instead of filling band by
// band, which halved the error and left the fatal part untouched: at levels 10 and 25 a perfect act changed
// the board NOT AT ALL. A beat that cannot be played well at the cap is the dead-ladder bug the quality
// curve already had once, arriving by a different road.
//
// Both failed for one reason: a quantised floor cannot express a continuous curve. So the floor stops being
// quantised. Each band owns a span of the bar exactly as wide as its share, the ball lands at a uniform
// position along the bar, and the chance of finishing in a band IS its share — not approximately, exactly,
// and at every level and act and temper state. The pegs are still there and the ball still rattles through
// them; what the pegs no longer do is decide anything.
//
// It is also the more legible object. A wider bucket is more likely, which is what anybody looking at it
// would already assume — where a binomial board is a thing you have to know is centre-weighted before it
// tells you the truth.

/** How many rows of pegs the ball rattles through. Purely how long the fall LOOKS; it decides nothing. */
export const PEG_ROWS = 9;

/**
 * The floor: one span per band, in bar order, each exactly as wide as that band share.
 *
 * ⚠️ RAREST AT THE EDGES, COMMONEST IN THE MIDDLE. Nothing forces this now that the landing is uniform — it
 * is a reading decision. The eye finds the middle of a bar first, so the band you will usually get belongs
 * there, and the thin gold slivers at the two ends are the ones worth hunting for. Masterwork is split
 * across both edges so the board stays symmetric and neither end is the lucky one.
 */
export function boardFor(level, { temper = false, act = null } = {}) {
    // ⚠️ THE ACT IS ITS OWN TERM IN THE CURVE, NOT EXTRA LEVELS. Expressing it as levels was the first
    // attempt and it silently did nothing at the cap, because qualityOdds clamps the level to 25: a maxed
    // crafter would have played the beats perfectly and watched the board refuse to move. The gate caught
    // it; nobody playing it would have, because the board would simply have looked normal.
    const odds = qualityOdds(level, temper, act ? actBias(act) : 0);
    const share = Object.fromEntries(odds.map((o) => [o.id, o.share]));
    // masterwork is halved and mirrored; the rest nest inward in rarity order.
    const half = ["masterwork", "pristine", "fine", "sound"];
    const spans = [];
    let x = 0;
    const push = (id, w) => { if (w > 0) { spans.push({ id, from: x, to: x + w }); x += w; } };
    for (const id of half) push(id, (share[id] || 0) / 2);
    push("rough", share.rough || 0);
    for (let i = half.length - 1; i >= 0; i -= 1) push(half[i], (share[half[i]] || 0) / 2);
    // ⚠️ THE LAST SPAN IS STRETCHED TO EXACTLY 1. Floating point leaves a sliver at the end otherwise, and a
    // ball landing in that sliver would land in no band at all.
    if (spans.length) spans[spans.length - 1].to = 1;
    return spans;
}

/** What each band is worth on a given floor — what every screen that quotes odds must quote. */
export function boardOdds(spans) {
    const out = {};
    for (const s of spans || []) out[s.id] = (out[s.id] || 0) + (s.to - s.from);
    return QUALITY_BANDS.map((b) => ({ id: b.id, name: b.name, mult: b.mult, share: out[b.id] || 0 }));
}

/** Where the ball lands, 0..1 along the bar. Uniform, so a band share IS its width. */
export function dropAt(seed) {
    let x = ((Math.floor(Number(seed) || 1) + 101) * 2654435761) >>> 0;
    x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0;
    return Math.min(0.999999, x / 4294967296);
}

/** The band a landing position falls in. */
export function bandAt(spans, at) {
    const p = Math.max(0, Math.min(0.999999, Number(at) || 0));
    for (const s of spans || []) if (p >= s.from && p < s.to) return s.id;
    return "rough";
}

/**
 * The rattle: one horizontal offset per peg row, ENDING at the landing position.
 *
 * ⚠️ IT DECIDES NOTHING AND IT IS NOT ALLOWED TO. The landing comes from dropAt and the fall is then drawn
 * to agree with it, rather than the client bouncing a ball wherever its own physics takes it and the server
 * being asked to believe where it stopped. Every offset is scaled so the last one is exactly the landing.
 *
 * The deflections shrink as the ball falls, which is both how a real board behaves and what stops the last
 * row from being a visible jump sideways into the right bucket.
 */
export function rattle(at, seed) {
    const end = Math.max(0, Math.min(1, Number(at) || 0));
    let x = ((Math.floor(Number(seed) || 1) + 17) * 2246822519) >>> 0;
    const rnd = () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
    const out = [];
    for (let r = 0; r < PEG_ROWS; r += 1) {
        const t = (r + 1) / PEG_ROWS;
        // Lerp from the centre toward the landing, with a wobble that fades out as it arrives.
        const wobble = (rnd() - 0.5) * 0.26 * (1 - t) ** 1.4;
        out.push(Math.max(0.02, Math.min(0.98, 0.5 + (end - 0.5) * t + wobble)));
    }
    out[out.length - 1] = end;
    return out;
}

/**
 * A quality score inside a band, so the 0-100 number on a tool and in the craft log stays a real value
 * rather than a band id in disguise.
 *
 * ⚠️ THE BAND IS DECIDED FIRST AND THIS ONLY FILLS IN A SCORE. Rolling a score and reading its band back
 * would be a second roll free to disagree with where the ball landed — the player watching it stop in
 * Pristine and being handed a Fine tool.
 */
export function qualityInBand(bandId, seed) {
    const i = QUALITY_BANDS.findIndex((b) => b.id === bandId);
    const band = QUALITY_BANDS[i] || QUALITY_BANDS[QUALITY_BANDS.length - 1];
    const top = i <= 0 ? 100 : QUALITY_BANDS[i - 1].at - 1;
    let x = ((Math.floor(Number(seed) || 1) + 31) * 2246822519) >>> 0;
    x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0;
    return Math.max(0, Math.min(100, band.at + Math.floor((x / 4294967296) * (top - band.at + 1))));
}

