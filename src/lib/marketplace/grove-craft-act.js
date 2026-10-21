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
// the PLAYER aimed it, which is what makes the far end of the rack reachable at all. See rackFor.
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
// Luke: "one is just rng, la plinko ball hitting pegs on itd way down. With varying buckets." And then:
// "User should be able to pick where to drop the thing also."
//
// ⚠️ A CHOSEN DROP POINT IS ONLY A DECISION IF AIMING HIGH CAN COST YOU. That is the whole design and it is
// worth stating plainly, because the obvious implementation has no decision in it at all: if the ball simply
// scatters around wherever you aimed and the worst case is landing in a slightly poorer band, then aiming at
// the best bucket is correct every single time and the choice is a button that looks like a choice.
//
// So the rack has an END. The bands run worst to best, left to right, and a ball that scatters past the last
// bucket goes off the rack and onto the floor — which is a ROUGH, the same as the cheapest bucket. Aiming at
// the gold therefore means standing close enough to the edge to miss the rack entirely.
//
//   ROUGH ──── SOUND ──────── FINE ────── PRISTINE ── MASTERWORK │ off the end
//     safe                                                 rich │ nothing
//
// ⚠️ AND THE TWO SKILL BEATS BUY THE RIGHT TO BE GREEDY. They no longer widen the buckets; they tighten the
// SCATTER. A sloppy heat and three missed strikes mean the piece lands anywhere within a wide band of your
// aim, so aiming at Masterwork throws most of your chances off the end. A clean act means it lands close to
// where you put it, and the far end becomes worth reaching for. That is a better use of skill than widening:
// it changes what you are ABLE to attempt rather than quietly improving a number.
//
// ⚠️ THE WIDTHS ARE STILL CUT FROM qualityOdds. A band is as wide as its share at your crafting level, so the
// rack is still a picture of the curve — the ladder is visible as Masterwork growing from a sliver into
// something you can actually aim at. What the level no longer does is decide the outcome on its own.

/** How many rows of pegs the piece rattles through. Purely how long the fall LOOKS; it decides nothing. */
export const PEG_ROWS = 9;

/**
 * The rack: one span per band, worst on the left, best on the right, each as wide as its share.
 *
 * ⚠️ A GRADIENT, NOT A SYMMETRIC BOARD. The earlier version mirrored the rare bands to both edges, which was
 * right when the ball landed uniformly and nobody was aiming — it made the board unbiased. The moment the
 * player chooses a drop point, two good edges means two identical correct answers and a board with a mirror
 * line down it. One direction of "better" is what makes an aim mean something.
 */
export function rackFor(level, { temper = false } = {}) {
    const share = Object.fromEntries(qualityOdds(level, temper).map((o) => [o.id, o.share]));
    const worstFirst = [...QUALITY_BANDS].reverse();            // rough ... masterwork
    const spans = [];
    let x = 0;
    for (const b of worstFirst) {
        const w = share[b.id] || 0;
        if (w <= 0) continue;
        spans.push({ id: b.id, name: b.name, from: x, to: x + w });
        x += w;
    }
    // ⚠️ THE LAST SPAN IS STRETCHED TO EXACTLY 1, or floating point leaves a sliver at the end of the rack
    // that is neither a bucket nor off the edge.
    if (spans.length) spans[spans.length - 1].to = 1;
    return spans;
}

// ── THE SCATTER ──────────────────────────────────────────────────────────────────────────────────────────────
// How far the piece can stray from where it was aimed. A fumbled act is nearly a third of the rack either
// way, which makes the gold end unusable; a flawless one is tight enough to pick a bucket.
//
// ⚠️ IT IS A STANDARD DEVIATION, NOT A HARD LIMIT. A cap would let a player aim exactly one cap-width from
// the end and be mathematically safe, which turns the whole beat into arithmetic. A tail means the edge is
// always a risk, and a small one even for a perfect act.
export const SCATTER_WORST = 0.30;
export const SCATTER_BEST = 0.055;
export const scatterFor = (act) => SCATTER_WORST - (SCATTER_WORST - SCATTER_BEST) * actScore(clampAct(act));

/**
 * Where the piece actually lands, given an aim and a scatter. Returns a position along the rack, which may
 * be OFF it — below 0 or above 1 — and the caller treats that as the floor.
 *
 * Box-Muller from a seeded stream, so the server and the replay agree and nothing can be retried for a
 * better number.
 */
export function landingFor(aim, scatter, seed) {
    let x = ((Math.floor(Number(seed) || 1) + 101) * 2654435761) >>> 0;
    const rnd = () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return (x >>> 0) / 4294967296; };
    const u1 = Math.max(1e-9, rnd());
    const u2 = rnd();
    const g = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return (Number(aim) || 0) + g * (Number(scatter) || 0);
}

/** The band a landing falls in. Anything off either end of the rack hit the floor, and that is a Rough. */
export function bandAt(spans, at) {
    const p = Number(at);
    if (!Number.isFinite(p) || p < 0 || p >= 1) return "rough";
    for (const s of spans || []) if (p >= s.from && p < s.to) return s.id;
    return "rough";
}

/** Did it miss the rack altogether? Worth knowing separately: the screen owes the player that sight. */
export const missedRack = (at) => !(Number(at) >= 0 && Number(at) < 1);

/**
 * ⚠️ THE ODDS FOR THIS AIM, WHICH IS WHAT THE SCREEN MUST SHOW.
 *
 * Band width stopped being band chance the moment the player got to choose where to drop — the chance now
 * depends on the aim and the scatter, and a screen still quoting the widths would be telling the player the
 * odds of a game they are no longer playing. That is the same defect as the printed-odds bug in qualityOdds,
 * so it gets the same treatment: computed from the real distribution, live, as the aim moves.
 *
 * Numerically integrated rather than solved with an error function, because the spans are arbitrary and a
 * grid of a thousand slices is exact to well under a tenth of a point — far finer than a percentage shown to
 * the player — and it cannot be subtly wrong in the way a hand-rolled erf can.
 */
export function oddsForAim(spans, aim, scatter) {
    const SLICES = 1200;
    const sd = Math.max(1e-4, Number(scatter) || 0);
    const a = Number(aim) || 0;
    const out = {};
    let off = 0;
    // Integrate over +/- 4 standard deviations, which holds all but about 0.006% of the mass.
    const lo = a - sd * 4;
    const hi = a + sd * 4;
    const step = (hi - lo) / SLICES;
    let total = 0;
    for (let i = 0; i < SLICES; i += 1) {
        const x = lo + step * (i + 0.5);
        const z = (x - a) / sd;
        const w = Math.exp(-0.5 * z * z);
        total += w;
        if (x < 0 || x >= 1) { off += w; continue; }
        const band = bandAt(spans, x);
        out[band] = (out[band] || 0) + w;
    }
    // ⚠️ OFF THE RACK IS ADDED TO ROUGH, because that is what it pays. Reporting it as its own row would be
    // more informative and would also be the only row on the screen that is not a band, so it rides with
    // Rough and `miss` carries the number for the one line that says it out loud.
    out.rough = (out.rough || 0) + off;
    return {
        bands: QUALITY_BANDS.map((b) => ({ id: b.id, name: b.name, mult: b.mult, share: (out[b.id] || 0) / total })),
        miss: off / total,
    };
}

/**
 * The rattle: one horizontal position per peg row, ENDING where the piece landed.
 *
 * ⚠️ IT DECIDES NOTHING. The landing comes from landingFor and the fall is then drawn to agree with it,
 * rather than the client bouncing a ball wherever its own physics takes it and the server being asked to
 * believe where it stopped. The deflections shrink as it falls, which is how a real rack behaves and is also
 * what stops the last row being a visible jump sideways into the right bucket.
 */
export function rattle(at, seed) {
    const end = Number(at) || 0;
    let x = ((Math.floor(Number(seed) || 1) + 17) * 2246822519) >>> 0;
    const rnd = () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
    const out = [];
    for (let r = 0; r < PEG_ROWS; r += 1) {
        const t = (r + 1) / PEG_ROWS;
        const wobble = (rnd() - 0.5) * 0.17 * (1 - t) ** 1.3;
        out.push(end * t + 0.5 * (1 - t) + wobble);
    }
    out[out.length - 1] = end;
    return out;
}

/**
 * A quality score inside a band, so the 0-100 number on a tool and in the craft log stays a real value
 * rather than a band id in disguise.
 *
 * ⚠️ THE BAND IS DECIDED FIRST AND THIS ONLY FILLS IN A SCORE. Rolling a score and reading its band back
 * would be a second roll free to disagree with where the piece landed — the player watching it stop in
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
