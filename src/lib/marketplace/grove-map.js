// ── WHERE THE TWELVE PLACES SIT ON THE PAPER ─────────────────────────────────────────────────────────────────
// Luke: "The map should be nodes on a paper map. The paper map should have color, as if a skilled scribe
// actually drew the map, with families point of interest nodes on it ... If a forest then leads to a cave or
// something, it should look like the trail leads from one thing to another on the map. A forest should look
// like a grouping of trees on the map. A cave should look like a cave."
//
// ⚠️ PURE DATA, AND IT IS AUTHORED AGAINST ONE SPECIFIC PAINTING. These are percentages of
// public/images/grove/map-plate.webp, which is mostly blank parchment with a blue-green river winding from
// the bottom left to the top right and sparse tree and hill marks along it. The route below runs alongside
// that river in the same direction, crossing it where a trail would, because a journey through a wood
// follows the water. Regenerate the plate and these numbers stop meaning anything — the river moves and the
// places end up standing in it.
//
// ⚠️ AND THE TRAIL IS DRAWN FROM THESE, NOT PAINTED INTO THE PLATE. That rule already cost one map: a path
// baked into the art can never line up with nodes positioned by code, and any lettering in a generated map
// comes back as gibberish the moment anyone looks closely. The plate is terrain; this file is the route.
// ⚠️ THE ROUTE SWINGS HARD BETWEEN HIGH AND LOW GROUND, and that is a framing decision rather than a
// drawing one. A phone shows about a quarter of the chart's width at a time — roughly three places — so a
// gently climbing line puts all three of them in the same horizontal band and leaves the rest of the screen
// as blank paper. Alternating up and down between consecutive places means any window onto the map has
// something near the top and something near the bottom of it.
export const MAP_LAYOUT = [
    { id: "thicket", x: 6, y: 76 },
    { id: "hollow", x: 14, y: 44 },
    { id: "fernway", x: 22, y: 72 },
    { id: "oldstand", x: 30, y: 38 },
    { id: "bramble", x: 38, y: 68 },
    { id: "stubble", x: 46, y: 34 },
    { id: "barrows", x: 54, y: 64 },
    { id: "warren", x: 62, y: 30 },
    { id: "mothlight", x: 70, y: 60 },
    { id: "rotwood", x: 78, y: 26 },
    { id: "palisade", x: 86, y: 56 },
    { id: "heartwood", x: 94, y: 22 },
];

export const mapSpot = (id) => MAP_LAYOUT.find((m) => m.id === id) || null;

/** The symbol drawn for a place. Named off the zone id, like every other piece of Grove art. */
export const nodeArt = (id) => `/images/grove/node-${id}.webp`;

/**
 * The trail, as an SVG path through the places in order.
 *
 * ⚠️ A CURVE, NOT A POLYLINE. Straight segments between twelve points read as a circuit diagram; a scribe's
 * route wanders. This is a quadratic through the midpoints, which is the cheapest way to get a hand-drawn
 * looking line that still passes through every place exactly.
 */
export function trailPath(spots = MAP_LAYOUT) {
    if (spots.length < 2) return "";
    const p = spots.map((s) => `${s.x},${s.y}`);
    let d = `M ${p[0]}`;
    for (let i = 1; i < spots.length; i += 1) {
        const a = spots[i - 1];
        const b = spots[i];
        // Control point pushed off the straight line, alternating side, so consecutive legs bow opposite
        // ways and the whole thing snakes instead of bulging one way down the map.
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const bow = i % 2 === 0 ? 3.2 : -3.2;
        d += ` Q ${mx + bow},${my + bow} ${b.x},${b.y}`;
    }
    return d;
}
