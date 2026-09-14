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
import { chartFace, plotBand, readingFor } from "@/lib/marketplace/chart-plot.js";
import { NODE_GAP, STEP_MS, layout } from "@/lib/marketplace/island-world.js";

// ── THE THIRTY SECONDS ───────────────────────────────────────────────────────────────────────────────────────
// Luke: "it would only take 30 seconds to get there." A real clock, not a stored timer you come back to — the
// run is played through in one sitting, which is the entire difference between this and the sixteen-hour
// charted voyage it replaces. The server stamps `ran_at`; the marks are FRACTIONS of the run.
export const RUN_MS = 30_000;

const asArr = (v) => (Array.isArray(v) ? v : (() => { try { return JSON.parse(v || "[]"); } catch { return []; } })());

/** One expedition row, turned into everything a screen needs and nothing it does not. */
export function viewOf(row) {
    const face = chartFace(Number(row.seed), Number(row.grade));
    const isle = islandById(row.island) || ISLANDS[0];
    const card = islandCard(isle.id);
    const taken = asArr(row.taken);
    const marks = asArr(row.marks);

    const base = {
        id: Number(row.id), phase: row.phase, grade: Number(row.grade), seed: Number(row.seed),
        purse: Number(row.purse) || 0,
        // The chart face. The THREE SOUNDINGS AND NOT THE FIX — the answer never crosses the wire while the
        // plot is still open, because a browser that has been told where the island is has been told the
        // answer, and the whole puzzle lives in the DOM.
        chart: {
            grade: Number(row.grade),
            read: readingFor(row.grade),
            soundings: face.soundings.map((s) => ({ k: s.k, mark: s.mark, x: s.x, y: s.y, r: s.r, slop: s.slop, exact: s.exact, says: s.says })),
        },
    };

    if (row.phase === "plot") return base;

    // From here the plot is committed, so the truth can be shown: this is the reveal.
    const plot = { x: Number(row.plot_x), y: Number(row.plot_y) };
    const accuracy = Number(row.accuracy) || 0;
    const solved = {
        plot, fix: face.fix, accuracy, band: plotBand(accuracy),
        span: Number(row.span), entry: Number(row.entry), fixIndex: Number(row.fix_index), tide: Number(row.tide),
    };

    if (row.phase === "run") {
        const since = row.ran_at ? Date.now() - new Date(row.ran_at).getTime() : 0;
        return {
            ...base, ...solved,
            island: card,
            run: {
                ms: RUN_MS, elapsed: Math.max(0, Math.min(RUN_MS, since)),
                marks: marks.map((m) => ({ at: m.at, done: Boolean(m.done), name: m.name, art: m.art })),
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
