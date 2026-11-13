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
import { HERO_UNITS } from "@/lib/marketplace/grove-view.js";

// ── ⚠️ THE EDGE OF A LEDGE HAS TO BE SOMEWHERE A BODY CAN STAND ─────────────────────────────────────────────
// Luke, 2026-11-12: "I cant get down from a platform, I'm clicking below my platform."
//
// The scene clamps every body to `[HERO_UNITS * 0.6, W - HERO_UNITS * 0.6]` so nothing stands half outside
// the world. In a 26-unit arena that is 4.2 to 21.8 — and EVERY first-tier ledge in this file was authored
// wider than that. Map one's ran 3 to 23. So the hero walks toward the lip, hits the world bound at 4.2
// with two units of slab still under his feet, and stops. The floor never runs out, he never falls, and the
// layout's own comment ("the gap at each end is deliberate: it is how you get down") described a gap no
// body could reach.
//
// Measured in the live arena before fixing: tapping the floor from the ledge walked him 13 -> 4.2 and he
// stood there for the rest of the run. All seven arenas were trapped the same way.
//
// So a ledge is clamped to end INSIDE the walkable strip, with a unit of margin past the bound — the hero
// has to be able to stand clear of the lip for the surface under him to run out.
const WALK_INSET = HERO_UNITS * 0.6;
const LIP_MARGIN = 1.3;

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

/**
 * The OUTSIDE of each Coliseum — the building you walk up to in the zone that holds it.
 *
 * ⚠️ NOT ARENA_ART ABOVE, AND NOT THE ZONE PORTAL. Three different things that kept getting confused:
 * ARENA_ART is the backdrop once you are INSIDE; portal-open.webp is the way on to the next zone; this is
 * the facade standing on the level floor. The first cut of the feature recoloured the portal gold and
 * called it a Coliseum, which is how you end up with a door where a building should be.
 *
 * Drawn by scripts/gen-grove-coliseums.mjs, die-cut on transparency so each one composites onto whatever
 * level art it stands on — the backdrops are the levels and are not touched.
 */
/**
 * ⚠️ EACH ONE CARRIES ITS MEASURED ASPECT, AND THAT IS NOT BOOKKEEPING.
 *
 * The fronts are drawn on a square canvas but the BUILDINGS are not square, and not square in the same way:
 * rootwood's content is 1.288 wide-to-tall, gilded's is 1.098. Sized as a square box with object-fit:
 * contain, the wide one shrinks to fit its height and renders visibly smaller than the others — seven
 * buildings at six different scales. Sizing by HEIGHT and deriving width from this ratio makes them all
 * stand the same height, which is what "a row of Coliseums" has to mean.
 *
 * Written by scripts/trim-grove-coliseums.mjs, which prints exactly this object after cropping. Re-run it
 * after drawing a new front and paste the number in; a stale ratio stretches the building.
 */
export const COLISEUM_ART = {
    1: { src: "/images/grove/coliseum-rootwood.webp", ar: 1.288 },
    2: { src: "/images/grove/coliseum-undercave.webp", ar: 1.235 },
    3: { src: "/images/grove/coliseum-fen.webp", ar: 1.063 },
    4: { src: "/images/grove/coliseum-saltwrack.webp", ar: 1.152 },
    5: { src: "/images/grove/coliseum-drowned.webp", ar: 1.154 },
    6: { src: "/images/grove/coliseum-gilded.webp", ar: 1.098 },
    7: { src: "/images/grove/coliseum-ashen.webp", ar: 1.127 },
};

export const coliseumArt = (mapN) => COLISEUM_ART[Number(mapN)] || COLISEUM_ART[1];

/**
 * How tall a Coliseum stands, in world units.
 *
 * ⚠️ A PHONE SEES ABOUT 27 UNITS, AND THE BUILDING HAS TO FIT IN THEM. 30 was tried and is wrong: at
 * rootwood's 1.288 aspect that is 38.6 units wide, so on a 390px phone the doorway itself was off the
 * right-hand edge — a landmark you cannot take in is not a landmark. [[world-constants-sized-against-a-view]].
 *
 * 20 x 1.288 = 25.8 units, which clears the phone with the marshal still beside it. And it is NOT the same
 * 20 as before: the sprites were carrying 8-14% transparent padding until they were trimmed, so the
 * building inside the box is materially bigger at the identical number.
 */
export const COLISEUM_H = 20;

/** One screen, at the narrowest real viewport. */
export const ARENA_W = 26;

/** Minimum share of its parent a ledge must sit over so a straight-up hop lands. Mirrors TIER_OVERLAP. */
const NEED_OVERLAP = 5;

const g = () => ({ x: 0, w: ARENA_W, y: 0, i: 0, parent: -1 });

// Seven floors, each laid out for killing rather than for navigating: short hops, nothing to fall off, and
// no corner the clock can trap you in. The SHAPE is what differs — the fiction is in the backdrop.
const LAYOUTS = {
    // ⚠️ CONTINUOUS TIERS, NOT SCATTERED LEDGES. Luke: "for the platforms i pictured one or two tiers of
    // continuous platforms not teeny little ones." The first cut gave each arena two or three short shelves,
    // which turned a two-minute fight into a navigation puzzle — hopping between islands to reach a body is
    // exactly the wandering this mode removed from the zones, rearranged vertically.
    //
    // A tier now spans almost the whole arena. The gap at each end is deliberate: it is how you get down,
    // and it keeps the ground reachable without a route.
    //
    // 1 Rootwood — one bough across. The first one anyone sees, so it is the simplest thing that can be.
    1: [g(), { x: 3, w: 20, y: 1 }],
    // 2 Undercave — a long shelf with a second one over its middle.
    2: [g(), { x: 2, w: 22, y: 1 }, { x: 7, w: 12, y: 2, parent: 1 }],
    // 3 Sunken Fen — one near-full bank, because the fen is flat and the water is the character.
    3: [g(), { x: 1, w: 24, y: 1 }],
    // 4 Saltwrack — a long deck and a shorter one above, like a ship's tiers.
    4: [g(), { x: 2, w: 21, y: 1 }, { x: 5, w: 13, y: 2, parent: 1 }],
    // 5 Drowned Ruins — the widest floor of the seven, with a gallery over it.
    5: [g(), { x: 1, w: 24, y: 1 }, { x: 8, w: 11, y: 2, parent: 1 }],
    // 6 Gilded Waste — a single dune ridge. The most open arena.
    6: [g(), { x: 4, w: 18, y: 1 }],
    // 7 Ashen Reach — two broad slabs, the upper one wide enough to fight a boss on.
    7: [g(), { x: 2, w: 22, y: 1 }, { x: 6, w: 15, y: 2, parent: 1 }],
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
    const lo = WALK_INSET + LIP_MARGIN;
    const hi = ARENA_W - WALK_INSET - LIP_MARGIN;
    return rows.map((p, i) => {
        // ⚠️ THE GROUND IS NOT CLAMPED. It is the world floor; the body clamp already stops anyone walking
        // off the side of it, and narrowing it would move the walls in rather than make a lip reachable.
        const x = i === 0 ? p.x : Math.max(lo, p.x);
        const right = i === 0 ? p.x + p.w : Math.min(hi, p.x + p.w);
        return {
            x,
            w: Math.max(2, right - x),
            y: (p.y || 0) * TIER_RISE,
            i,
            parent: i === 0 ? -1 : (p.parent ?? 0),
        };
    });
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
            // ⚠️ AND CAN YOU GET OFF IT. This validator checked that a ledge fits the arena and overlaps
            // its parent, and never that a body could leave it — which is how all seven shipped as boxes.
            // arenaFor clamps, so this reads the clamped values and can only fail if the clamp is removed.
            if (p.x < WALK_INSET || p.x + p.w > ARENA_W - WALK_INSET) {
                bad.push(`map ${map} ledge ${p.i} has a lip outside the walkable strip `
                    + `(${p.x}..${p.x + p.w} against ${WALK_INSET}..${ARENA_W - WALK_INSET}) — nobody can walk off it`);
            }
            if (p.parent >= p.i) bad.push(`map ${map} ledge ${p.i} has parent ${p.parent}, which is not below it in the list`);
            const par = plats[p.parent];
            if (!par) { bad.push(`map ${map} ledge ${p.i} has no parent`); continue; }
            const over = Math.min(p.x + p.w, par.x + par.w) - Math.max(p.x, par.x);
            if (over < NEED_OVERLAP) bad.push(`map ${map} ledge ${p.i} overlaps its parent by ${over}, needs ${NEED_OVERLAP}`);
        }
    }
    return bad;
}
