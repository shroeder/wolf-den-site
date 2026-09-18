// ── ONE EXPEDITION ROW, TURNED INTO A SCREEN ─────────────────────────────────────────────────────────────────
// Split out of expedition.js and PURE on purpose, for two reasons:
//
//   1. it is the shape the API promises, and the dev lab has to be able to build that exact shape against
//      handcrafted state — a lab that constructs its own lookalike is a lab that passes while the real screen
//      is broken. See [[visual-rigs]]: the fixture lab must mount the REAL client against the REAL shape.
//   2. it touches no database, so there is no reason for it to sit in a server-only file.
//
// ⚠️ THE ANSWER IS WITHHELD WHILE THE PLOT IS OPEN. In phase "plot" this returns the three soundings and NOT
// the fix. A browser that has been told where the island is has been told the answer, and the whole puzzle
// would live in the DOM one inspector away. The fix is revealed the instant the pin is committed.

import { ISLANDS, islandById, islandCard, nodeArt } from "@/lib/marketplace/islands.js";
import { bearingBand, bearingFace, bearingScore, chartFace, plotBand, readingFor } from "@/lib/marketplace/chart-plot.js";
import { HUNT_MS } from "@/lib/marketplace/hunt.js";
import { NODE_GAP, STEP_MS, layout } from "@/lib/marketplace/island-world.js";

// ── THE THIRTY SECONDS ───────────────────────────────────────────────────────────────────────────────────────
// Luke: "it would only take 30 seconds to get there." A real clock, not a stored timer you come back to — the
// run is played through in one sitting, which is the entire difference between this and the sixteen-hour
// charted voyage it replaces. The server stamps `ran_at`; the marks are FRACTIONS of the run.
export const RUN_MS = 30_000;

const asArr = (v) => (Array.isArray(v) ? v : (() => { try { return JSON.parse(v || "[]"); } catch { return []; } })());
const asObj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : (() => { try { return JSON.parse(v || "{}") || {}; } catch { return {}; } })());

// ⚠️ THE ORDER OF THE BEATS, IN ONE PLACE. The client renders on phase equality and the server writes phase
// strings; without a list somewhere, "which screen comes after this one" is knowledge split across two files
// that nothing checks. `phaseAfter` is what the server's own transitions are written against, so adding a
// beat means adding it here and the two ends cannot disagree about the order.
export const JOURNEY = ["hunt", "spoils", "bearings", "course", "run", "landing", "ashore"];
export const phaseAfter = (phase) => JOURNEY[JOURNEY.indexOf(phase) + 1] || null;

// ── ONE SKY FOR THE WHOLE JOURNEY ────────────────────────────────────────────────────────────────────────────
// The ten painted horizons the sea already owns. Picked off the expedition's own seed rather than rolled per
// screen, so the weather you set out in is the weather you make landfall in — a journey that changes sky
// between the hunt and the run is three separate afternoons, not one voyage. The ordinary voyage picks its own
// per app-open and keeps it in a cookie; this one belongs to the expedition, so it rides on the row.
// ⚠️ NO `night`, AND THAT IS NOT A TASTE CALL. The night horizon is not a painting — it is `.sail-nightsky`,
// a pure-CSS gradient plus a starfield, drawn that way because the painted night plate put a moon on every
// mirrored copy. It has no WATERLINE. In a 400px panel at the helm that is fine because the boat and the
// voyage bar carry the frame; full-screen it is a flat blue wall with two ships hanging in the middle of
// nothing, and on the hunt that is the entire composition. The other nine all paint their own horizon.
const SKIES = ["sunset", "sunrise", "storm", "fog", "clearday", "goldenhour", "dusk", "overcast", "aurora"];
export const skyFor = (seed) => `/images/sailing/sky-${SKIES[Math.abs(Math.floor(Number(seed) || 0)) % SKIES.length]}.png`;

/** One expedition row, turned into everything a screen needs and nothing it does not. */
export function viewOf(row) {
    const face = chartFace(Number(row.seed), Number(row.grade));
    const isle = islandById(row.island) || ISLANDS[0];
    const card = islandCard(isle.id);
    const taken = asArr(row.taken);
    const marks = asArr(row.marks);

    const j = asObj(row.journey);
    const base = {
        id: Number(row.id), phase: row.phase, grade: Number(row.grade), seed: Number(row.seed),
        purse: Number(row.purse) || 0, sky: skyFor(row.seed),
        // The chart face. The THREE SOUNDINGS AND NOT THE FIX — the answer never crosses the wire while the
        // plot is still open, because a browser that has been told where the island is has been told the
        // answer, and the whole puzzle lives in the DOM.
        chart: {
            grade: Number(row.grade),
            read: readingFor(row.grade),
            soundings: face.soundings.map((s) => ({ k: s.k, mark: s.mark, x: s.x, y: s.y, r: s.r, slop: s.slop, exact: s.exact, says: s.says })),
        },
    };

    // ── THE HUNT ─────────────────────────────────────────────────────────────────────────────────────────
    // ⚠️ THE QUARRY GOES OVER THE WIRE, HER CAPTAIN DOES NOT. You are meant to see a sail and not know whose
    // it is until she strikes — being told in advance what a fight is worth is the whole tension of going
    // looking for one. Same rule the plot has always followed with the fix.
    if (row.phase === "hunt") {
        const since = row.ran_at ? Date.now() - new Date(row.ran_at).getTime() : 0;
        const ms = Number(j.huntMs) || HUNT_MS;
        return {
            ...base,
            hunt: {
                ms, elapsed: Math.max(0, Math.min(ms, since)),
                foe: j.foe ? { name: j.foe.name, cls: j.foe.cls, blurb: j.foe.blurb, art: j.foe.art, tier: j.foe.tier } : null,
            },
        };
    }

    // ── SHE IS TAKEN ─────────────────────────────────────────────────────────────────────────────────────
    // The beat. Everything it needs to say what you got and why it matters: the man, his stars, the words he
    // said handing it over, and what a chart of that grade is — WITHOUT naming the island, which is the thing
    // the bearings are for.
    if (row.phase === "spoils") {
        return {
            ...base,
            spoils: {
                captain: j.captain || null,
                ship: j.foe ? { name: j.foe.name, cls: j.foe.cls, art: j.foe.art } : null,
                stars: Number(row.grade) || 1,
            },
        };
    }

    // ── THE GLASS ────────────────────────────────────────────────────────────────────────────────────────
    // ⚠️ THIS ONE DOES SEND THE ANSWER, AND THAT IS THE DESIGN RATHER THAN AN OVERSIGHT.
    //
    // The old plot hid the fix, and had to: knowing where it was WAS solving it, so a browser that had been
    // told had been given the answer. Taking a bearing is not that. You are meant to SEE the headland — that
    // is what a horizon is for — and the difficulty is motor, not informational: the glass rides the swell,
    // so centring a mark you can plainly see is a matter of timing your call. Hiding the marks would not make
    // it harder, it would make it a screen of empty water.
    //
    // What that costs: a crafted POST can send three perfect bearings. What that buys a cheat is SLACK — a
    // few more steps of tide to search with — and never the prize, because `landfall()` guarantees the mark
    // is reachable from the worst reading in the game. The ceiling on the exploit is the same ceiling the
    // whole feature was built around, which is why it is acceptable here and was not acceptable there.
    if (row.phase === "bearings") {
        const face = bearingFace(Number(row.seed), Number(row.grade));
        return {
            ...base,
            bearings: {
                window: face.window,
                // ⚠️ EACH MARK CARRIES ITS OWN WINDOW. `bearingScore(mark, got)` divides by `mark.window`,
                // and when the client started calling that shared scorer instead of its hand-copied formula,
                // the window was not on the mark — so the divide produced NaN, every comparison against NaN
                // was false, and every bearing came back "Lost it" while the wire was plainly showing LOCKED.
                // Caught by playing the one-star glass end to end; a screenshot would never have shown it.
                marks: face.marks.map((m) => ({ k: m.k, mark: m.mark, says: m.says, exact: m.exact, at: m.at, window: m.window })),
            },
        };
    }

    // (There is no `plot` branch any more: the ring-and-pin screen is gone, nothing writes that phase, and a
    // branch for a phase nothing can reach is a claim that it can.)

    // From here the plot is committed, so the truth can be shown: this is the reveal.
    const plot = { x: Number(row.plot_x), y: Number(row.plot_y) };
    const accuracy = Number(row.accuracy) || 0;
    const solved = {
        plot, fix: face.fix, accuracy, band: plotBand(accuracy),
        span: Number(row.span), entry: Number(row.entry), fixIndex: Number(row.fix_index), tide: Number(row.tide),
    };

    // ── THE COURSE ───────────────────────────────────────────────────────────────────────────────────────
    // The second beat: where you are going, how well you read him, and what is supposed to be there. This is
    // the first moment the island is named, and it carries the per-bearing marks so the screen can show which
    // of the three you fluffed rather than handing over one number with no story.
    if (row.phase === "course") {
        const face = bearingFace(Number(row.seed), Number(row.grade));
        const taken = Array.isArray(j.bearings) ? j.bearings : [];
        return {
            ...base, ...solved,
            island: card,
            course: {
                marks: face.marks.map((m, i) => {
                    const sc = bearingScore(m, taken[i]);
                    return { mark: m.mark, says: m.says, score: sc, band: bearingBand(sc) };
                }),
            },
        };
    }

    if (row.phase === "run" || row.phase === "landing") {
        const since = row.ran_at ? Date.now() - new Date(row.ran_at).getTime() : 0;
        return {
            ...base, ...solved,
            island: card,
            run: {
                ms: RUN_MS, elapsed: Math.max(0, Math.min(RUN_MS, since)),
                marks: marks.map((m) => ({ at: m.at, done: Boolean(m.done), name: m.name, art: m.art })),
                landing: row.phase === "landing",
            },
        };
    }

    // Ashore. The island itself goes over the wire ONCE, whole — it is at most fifty-four nodes, so paging it
    // would be more round trips than it saves, and round trips are the bill (see CLAUDE.md).
    const nodes = layout(Number(row.seed), isle.id, Number(row.fix_index)).map((n) => ({
        ...n,
        taken: taken.includes(n.i),
        art: n.kind === "empty" ? null : n.kind === "fix" ? card.prize.art : nodeArt(isle.biome, n.kind),
    }));

    return {
        ...base, ...solved,
        island: card,
        ashore: {
            at: row.at_node == null ? Number(row.entry) : Number(row.at_node),
            spent: Number(row.spent) || 0,
            tide: Number(row.tide),
            left: Math.max(0, Number(row.tide) - (Number(row.spent) || 0)),
            gap: NODE_GAP, stepMs: STEP_MS,
            nodes,
        },
        done: row.phase === "done",
    };
}
