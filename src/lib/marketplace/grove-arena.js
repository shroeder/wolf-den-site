// ── THE COLISEUM FLOORS ──────────────────────────────────────────────────────────────────────────────────────
// Luke: "when you go in it, it renders a whole new platformer that's just contained within one screen. So you
// don't do any like wandering left and right... each Coliseum will be a little different in terms of where the
// platform locations are, but for the most part it's a pretty easily traversable scene where you can kill
// enemies as fast as possible."
//
// ⚠️ "ONE SCREEN" IS 26 UNITS, NOT UNITS_PER_SCREEN. That constant is 100 and the camera has never held a
// hundred — viewFor clamps the scale so the hero stays a fixed share of the viewport HEIGHT, and on a
// portrait phone that leaves 27.6 units visible. An arena authored at 100 would be four screens wide, which
// is precisely the wandering this mode exists to remove. Measured, per device:
//
//   phone portrait 390x760   27.6 units      phone landscape 760x390   56 units
//   phone with dock          33.9 units      desktop 1280x800          68 units
//
// 26 fits the tightest of those with a margin. On a wide screen the arena is letterboxed, which is what a
// pit should look like anyway.
//
// ⚠️ AND THE PARENT CHAIN IS THE ROUTE, NOT BOOKKEEPING. Every ledge records the one it is reachable from;
// navigation walks that chain rather than guessing from positions. A platform whose parent it does not
// actually overlap is a shelf the hero will step off, fall from, and try again for ever — see the long note
// on platformsFor. validateArenas() refuses a layout that does it.

import { TIER_RISE } from "@/lib/marketplace/grove-world.js";

/** The backdrop plate for each Coliseum. Drawn by scripts/gen-grove-arenas.mjs. */
export const ARENA_ART = {
    1: "/images/grove/arena-rootwood.webp",
    2: "/images/grove/arena-undercave.webp",
    3: "/images/grove/arena-fen.webp",
    4: "/images/grove/arena-saltwrack.webp",
    5: "/images/grove/arena-drowned.webp",
    6: "/images/grove/arena-gilded.webp",
    7: "/images/grove/arena-ashen.webp",
};

export const arenaArt = (mapN) => ARENA_ART[Number(mapN)] || ARENA_ART[1];

/** One screen, at the narrowest real viewport. */
export const ARENA_W = 26;

/** Minimum share of its parent a ledge must sit over so a straight-up hop lands. Mirrors TIER_OVERLAP. */
const NEED_OVERLAP = 5;

const g = () => ({ x: 0, w: ARENA_W, y: 0, i: 0, parent: -1 });

// Seven floors, each laid out for killing rather than for navigating: short hops, nothing to fall off, and
// no corner the clock can trap you in. The SHAPE is what differs — the fiction is in the backdrop.
const LAYOUTS = {
    // 1 Rootwood — two even boughs. The easiest possible read, because this is the first one anyone sees.
    1: [g(), { x: 3, w: 7, y: 1 }, { x: 16, w: 7, y: 1 }],
    // 2 Undercave — a stepped shelf across, so bodies string out instead of bunching.
    2: [g(), { x: 2, w: 6, y: 1 }, { x: 10, w: 6, y: 1 }, { x: 18, w: 6, y: 1 }],
    // 3 Sunken Fen — two banks and a high reed platform between them.
    // The high reed platform sits at 6 rather than 8: at 8 it cleared its parent by only four units,
    // which validateArenas refuses — a hop that lands half off the edge is the fall loop.
    3: [g(), { x: 4, w: 8, y: 1 }, { x: 15, w: 8, y: 1 }, { x: 6, w: 8, y: 2, parent: 1 }],
    // 4 Saltwrack — a long pier on the left, broken posts to the right.
    4: [g(), { x: 1, w: 9, y: 1 }, { x: 13, w: 5, y: 1 }, { x: 20, w: 5, y: 1 }],
    // 5 Drowned Ruins — a standing column in the middle with low rubble either side.
    5: [g(), { x: 9, w: 8, y: 1 }, { x: 10, w: 6, y: 2, parent: 1 }, { x: 1, w: 6, y: 1 }, { x: 19, w: 6, y: 1 }],
    // 6 Gilded Waste — two wide dunes and nothing else. The most open floor of the seven.
    6: [g(), { x: 2, w: 9, y: 1 }, { x: 15, w: 9, y: 1 }],
    // 7 Ashen Reach — broken ground, three low slabs and one high.
    7: [g(), { x: 3, w: 6, y: 1 }, { x: 12, w: 6, y: 1 }, { x: 19, w: 5, y: 1 }, { x: 13, w: 5, y: 2, parent: 2 }],
};

/**
 * The platform list for one map's Coliseum, in the exact shape platformsFor returns.
 *
 * `y` is authored as a TIER and multiplied up here, so a layout reads as "first tier, second tier" rather
 * than as a pile of elevens. Anything without an explicit parent hangs off the ground, which is right for
 * every first-tier ledge and must be stated for the rest.
 */
export function arenaFor(mapN) {
    const rows = LAYOUTS[Number(mapN)] || LAYOUTS[1];
    return rows.map((p, i) => ({
        x: p.x,
        w: p.w,
        y: (p.y || 0) * TIER_RISE,
        i,
        parent: i === 0 ? -1 : (p.parent ?? 0),
    }));
}

/**
 * Check every arena can actually be walked.
 *
 * Three ways a hand-authored floor goes wrong, all silent: a ledge off the edge of the screen, a ledge that
 * does not overlap the thing it claims to be reachable from, and a parent that comes later in the list than
 * its child. The first strands bodies out of reach while the clock runs; the second is the infinite
 * step-off-and-fall loop; the third makes navigation read an undefined parent.
 */
export function validateArenas() {
    const bad = [];
    for (const map of Object.keys(LAYOUTS)) {
        const plats = arenaFor(map);
        for (const p of plats) {
            if (p.i === 0) continue;
            if (p.x < 0 || p.x + p.w > ARENA_W) bad.push(`map ${map} ledge ${p.i} runs off the arena (${p.x}..${p.x + p.w} of ${ARENA_W})`);
            if (p.parent >= p.i) bad.push(`map ${map} ledge ${p.i} has parent ${p.parent}, which is not below it in the list`);
            const par = plats[p.parent];
            if (!par) { bad.push(`map ${map} ledge ${p.i} has no parent`); continue; }
            const over = Math.min(p.x + p.w, par.x + par.w) - Math.max(p.x, par.x);
            if (over < NEED_OVERLAP) bad.push(`map ${map} ledge ${p.i} overlaps its parent by ${over}, needs ${NEED_OVERLAP}`);
        }
    }
    return bad;
}
