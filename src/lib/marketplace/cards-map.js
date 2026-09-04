// ── THE MAP ──────────────────────────────────────────────────────────────────────────────────────────────────
// Slay the Spire's overworld, audited and rebuilt. Luke: "audit Slay the Spire, figure out how they do their
// overworld, and implement that — look at every detail and copy it."
//
// WHAT THEIRS ACTUALLY IS, from the wiki's generation page and from a screenshot of the real thing:
//   · 15 rows of rooms with a boss above them, up to six rooms in a row, laid out on a scrolling parchment.
//   · SIX PATHS are drawn from the bottom row upward. Rooms exist where a path visits; edges are the steps
//     those paths took. Every room therefore has 1-3 ways in and 1-3 ways out.
//   · Fixed floors: row 1 is always a fight, row 9 is always treasure, row 15 is always a rest. Then the boss.
//   · Everything else is rolled: 53% fight, 22% unknown, 12% rest, 8% elite, 5% merchant.
//   · Elites and rests never appear below row 6.
//   · Two rooms reached from the SAME room may not be the same kind, and elite/merchant/rest are not allowed
//     to sit directly above one of their own.
//   · An UNKNOWN is not decided at generation. It resolves when you walk into it, which is why theirs can
//     afford to be 22% of the map — see resolveUnknown.
//
// PURE AND SEEDED, like cards-kit: a map is a seed plus these rules, so the same run always draws the same
// map, and a map can be replayed or handed to somebody without shipping the whole structure around.
import { RUN_LENGTH, nextRand } from "@/lib/marketplace/cards-kit.js";

// One number, defined with the rules rather than here, so the map and the difficulty curve cannot
// disagree about how tall the act is.
export const MAP_ROWS = RUN_LENGTH;
export const MAP_LANES = 7;      // columns a room can sit in — theirs is 7 wide holding up to 6 rooms
export const MAP_PATHS = 6;      // how many routes are drawn up from the bottom

// Their weights exactly. `unknown` is the big one on purpose: it is cheap to place and expensive to read,
// which is what makes their map feel unpredictable without being unfair.
const WEIGHTS = [
    ["fight", 53],
    ["unknown", 22],
    ["rest", 12],
    ["elite", 8],
    ["merchant", 5],
];
const TOTAL = WEIGHTS.reduce((n, [, w]) => n + w, 0);

// Rows are 0-indexed here and 1-indexed in the rules above: row 0 is their floor 1.
const FIXED = { 0: "fight", 8: "treasure", 14: "rest" };
const NOT_BELOW_ROW = 5;                       // elites and rests cannot appear before floor 6
const NEVER_STACKED = ["elite", "merchant", "rest"];

const key = (row, lane) => `${row}:${lane}`;

/** Build the whole map for a seed. Returns { rows, nodes, edges, boss }. */
export function buildMap(seed) {
    let rng = (seed >>> 0) || 1;
    const roll = () => { const [r, next] = nextRand(rng); rng = next; return r; };

    const nodes = new Map();     // "row:lane" -> { row, lane, kind, next: [lane...] }
    const touch = (row, lane) => {
        const k = key(row, lane);
        if (!nodes.has(k)) nodes.set(k, { row, lane, kind: null, next: [] });
        return nodes.get(k);
    };

    // ── SIX WALKS UP THE SHEET ───────────────────────────────────────────────────────────────────────
    // A path starts in a random lane and drifts by at most one lane a row, which is what gives their map
    // its diagonal, hand-drawn look rather than a grid of straight columns. Paths freely share rooms — that
    // sharing IS the branching.
    for (let p = 0; p < MAP_PATHS; p += 1) {
        let lane = Math.floor(roll() * MAP_LANES);
        touch(0, lane);
        for (let row = 0; row < MAP_ROWS - 1; row += 1) {
            // ── DRIFT, WITH A PULL TOWARD THE MIDDLE ─────────────────────────────────────────────
            // A flat -1/0/+1 walk lets a path that starts in lane 6 stay in lanes 5-6 for all fifteen rows
            // and never meet another route — Luke: "there's one path on the right that just completely goes
            // its own way." Theirs converge because six paths over seven lanes keep colliding.
            // The pull grows with the row, so the bottom stays wide and the top gathers: by the last rows a
            // lane out at the edge is twice as likely to step inward as outward.
            const mid = (MAP_LANES - 1) / 2;
            const pull = (row / (MAP_ROWS - 1)) * 0.55;                 // 0 at the floor, 0.55 at the top
            const inward = lane < mid ? 1 : lane > mid ? -1 : 0;
            const r = roll();
            const drift = r < (1 / 3) + pull * (inward === -1 ? 1 : 0) ? -1
                : r < (2 / 3) + pull * (inward === -1 ? 1 : 0) - (inward === 1 ? pull : 0) ? 0
                    : 1;
            const to = Math.max(0, Math.min(MAP_LANES - 1, lane + (inward === 0 ? drift : drift)));
            const here = touch(row, lane);
            touch(row + 1, to);
            if (!here.next.includes(to)) here.next.push(to);
            lane = to;
        }
    }

    // ── THEN THE ROOMS ARE DEALT ─────────────────────────────────────────────────────────────────────
    // In row order, so a room can see what its own parents already are — which is the only way the "not
    // above your own kind" and "siblings differ" rules can be enforced at all.
    const parentsOf = (row, lane) => [...nodes.values()]
        .filter((n) => n.row === row - 1 && n.next.includes(lane));

    for (let row = 0; row < MAP_ROWS; row += 1) {
        const inRow = [...nodes.values()].filter((n) => n.row === row).sort((a, b) => a.lane - b.lane);
        for (const node of inRow) {
            if (FIXED[row]) { node.kind = FIXED[row]; continue; }
            const parents = parentsOf(row, node.lane);
            // What this room may not be: anything a sibling out of the same parent already took, and — for
            // the three "special" kinds — anything a parent already is.
            const banned = new Set();
            for (const parent of parents) {
                if (NEVER_STACKED.includes(parent.kind)) banned.add(parent.kind);
                for (const siblingLane of parent.next) {
                    const sib = nodes.get(key(row, siblingLane));
                    if (sib && sib !== node && sib.kind) banned.add(sib.kind);
                }
            }
            if (row < NOT_BELOW_ROW) { banned.add("elite"); banned.add("rest"); }
            // ── AND NO REST DIRECTLY UNDER THE GUARANTEED ONE ────────────────────────────────────
            // Row 15 is all rest, so a rest rolled on row 14 is always consecutive with it — the "elite,
            // merchant and rest are never consecutive" rule, applied to the one case the fixed floors
            // create on their own. Without this, roughly a third of maps put two campfires in a row at the
            // top and the second one is worth nothing.
            if (row === MAP_ROWS - 2) banned.add("rest");

            // Weighted pick over what is left. A room with everything banned falls back to a fight, which is
            // the one kind with no restrictions on it anywhere.
            const open = WEIGHTS.filter(([k]) => !banned.has(k));
            const total = open.reduce((n, [, w]) => n + w, 0) || TOTAL;
            let r = roll() * total;
            node.kind = "fight";
            for (const [k, w] of open) { r -= w; if (r <= 0) { node.kind = k; break; } }
        }
    }

    // ── AND THE BOSS IS A ROOM, NOT A PICTURE ───────────────────────────────────────────────────────
    // The sheet has always DRAWN a boss above the top row, and it was only ever a drawing: no node, no edge,
    // nothing to walk onto. `reachable()` from the last row returned an empty list, so a run that climbed all
    // fifteen rows arrived at a dead end — no fight, and no win either, because the route only ends a run on
    // `at.kind === "boss"` or `stop > RUN_LENGTH` and neither could happen.
    //
    // It is a real node now, one lane wide, sitting a row above the sheet, and every room on the last row
    // leads to it. That is also how theirs works: the top of an act converges on one door.
    const bossLane = Math.floor((MAP_LANES - 1) / 2);
    const bossRow = MAP_ROWS;
    nodes.set(key(bossRow, bossLane), { row: bossRow, lane: bossLane, kind: "boss", next: [] });
    for (const n of nodes.values()) {
        if (n.row === MAP_ROWS - 1 && !n.next.includes(bossLane)) n.next.push(bossLane);
    }

    return {
        rows: MAP_ROWS,
        lanes: MAP_LANES,
        boss: { row: bossRow, lane: bossLane },
        nodes: [...nodes.values()].map((n) => ({ row: n.row, lane: n.lane, kind: n.kind, next: n.next })),
    };
}

/**
 * What an UNKNOWN turns into, decided when it is entered rather than when the map is drawn.
 *
 * This is the detail that makes their 22% affordable: a question mark that resolved at generation would just
 * be a room with a worse label on it. Deciding late is what makes walking into one a real moment.
 *
 * ⚠️ IT USED TO BE HALF FIGHTS, AND THAT IS THE NUMBER THAT WAS WRONG. Luke: "did we do the map like Slay the
 * Spire in terms of encounters? it feels like it's not quite right, very thin on camp sites." The MAP is
 * theirs to the weight — 53/22/12/8/5, elites and rests held off the first five floors — but a fifth of it is
 * question marks, and half of those were coming back as another fight. Counted properly that made the real
 * mix about 64% fight and 12% rest, which is a harder, more repetitive act than theirs and exactly what a
 * campfire shortage feels like.
 *
 * THE HONEST FIX IS EVENTS, and we do not have them: theirs resolves a "?" to an EVENT about six times in
 * seven — a written room with a choice in it — and a fight barely one time in ten. Until those are authored,
 * a question mark leans the way theirs does, toward the things that are NOT another fight, and the campfire
 * is in the mix because a fire you did not expect is the closest thing we have to a good event.
 */
export function resolveUnknown(seed, row) {
    const [r] = nextRand(((seed >>> 0) + row * 7919) >>> 0);
    if (r < 0.30) return "treasure";
    if (r < 0.55) return "rest";
    if (r < 0.80) return "merchant";
    return "fight";
}

/** The rooms reachable from where you are standing: the ones this room's edges point at. */
export function reachable(map, at) {
    if (!at) return (map.nodes || []).filter((n) => n.row === 0);
    const here = (map.nodes || []).find((n) => n.row === at.row && n.lane === at.lane);
    if (!here) return [];
    return (map.nodes || []).filter((n) => n.row === at.row + 1 && here.next.includes(n.lane));
}
