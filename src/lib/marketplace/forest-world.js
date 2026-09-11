// ── THE WOOD ITSELF ──────────────────────────────────────────────────────────────────────────────────────────
// Luke: "we want our character to be able to walk through the forest like in town, and you just have trees you
// can touch and start chopping ... you're going through this never ending forest, chopping trees, picking up
// mushrooms, and scavenging other resources."
//
// NEVER ENDING, so the wood cannot be a list of six patches on a row. It is GENERATED: every node in it —
// every tree, every mushroom — is a pure function of the member's seed and the node's own index. Walk far
// enough and you can come back to find the same Ironwood standing in the same place, because nothing was
// stored to make that true.
//
// ⚠️ AND THAT IS THE ANTI-CHEAT, NOT A CONVENIENCE. The browser has to own the walk — a tap-to-step world that
// asks the server where the trees are is a request per footfall, which is the single most expensive shape this
// codebase can adopt (round trips ARE the bill; see CLAUDE.md). So the client generates the wood and plays it,
// and a claim of "I felled node 1423" is checked by the server generating node 1423 for itself and asking
// whether that is a tree, what kind, and how many swings it could possibly have taken. A forged node number
// produces a different tree than the cheater expected, or no tree at all.
//
// PURE — no database, no imports with side effects — so the whole wood can be walked in a simulator.

import { MUSHROOMS, MUSHROOM_IDS, TREES, TREE_IDS, treeById, weighted } from "@/lib/marketplace/forest.js";

// ── HOW BIG THE WOOD IS ──────────────────────────────────────────────────────────────────────────────────────
// Node spacing in world pixels. Wide enough that two trees are never touching at the sizes they are drawn, and
// close enough that there is always something in shot — an empty screen is a walk, not a forest.
export const NODE_GAP = 190;
// How many nodes a segment holds. Segments exist only so the client can build the wood in chunks as it walks
// rather than generating ten thousand nodes at once.
export const SEGMENT = 24;

// ── THE HASH ─────────────────────────────────────────────────────────────────────────────────────────────────
// One integer in, one in [0,1) out, stable across machines. Not Math.random: the whole point is that the server
// can reproduce it. xorshift-ish mix — cheap, well-spread, and it does not need to be cryptographic because
// the thing it protects is "which mushroom", not anybody's money.
export function hash(a, b = 0) {
    let h = (Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x165667b1, 0xc2b2ae35)) >>> 0;
    h ^= h >>> 15; h = Math.imul(h, 0x2545f491) >>> 0; h ^= h >>> 13;
    return (h >>> 0) / 4294967296;
}

// ── WHAT GROWS WHERE ─────────────────────────────────────────────────────────────────────────────────────────
// ⚠️ THE WOOD GETS RARER AS YOU GO, AND THAT IS THE ONLY REASON TO WALK. A forest with the same odds at node
// 10 and node 10,000 is a treadmill with scenery. `depth` shifts the weights toward the rare trees — slowly,
// so the first hour is birches and the fifth is where a Heartwood stops being a story.
export const DEPTH_FULL = 4000;          // nodes walked for the curve to finish opening
export const depthOf = (index) => Math.min(1, Math.max(0, index) / DEPTH_FULL);

/** Tree weights at a given depth: commons fall away, rares climb, and the Moonash only ever creeps. */
export function treeWeights(depth = 0) {
    const out = {};
    for (const id of TREE_IDS) {
        const base = TREES[id].weight;
        // Rarity rank drives the tilt: rank 0 loses up to 65% of its weight, the top gains several times over.
        const rank = ["common", "uncommon", "rare", "epic", "legendary"].indexOf(TREES[id].rarity);
        out[id] = base === 0
            // The Moonash is weight 0 in the flat table — it exists only out here, and only deep.
            ? depth * depth * 0.9
            : base * (1 - depth * 0.65 * Math.max(0, 2 - rank) / 2) * (1 + depth * rank * 1.1);
    }
    return out;
}

/** Mushroom weights: the same tilt, gentler, so a Mooncrown stays a thing that happens to you. */
export function shroomWeights(depth = 0) {
    const out = {};
    for (const id of MUSHROOM_IDS) {
        const rank = ["common", "uncommon", "rare", "epic", "legendary"].indexOf(MUSHROOMS[id].rarity);
        out[id] = MUSHROOMS[id].weight * (1 - depth * 0.5 * Math.max(0, 1 - rank)) * (1 + depth * rank * 0.8);
    }
    return out;
}

// Roughly one node in four is mushrooms rather than a tree — enough that the floor is worth looking at, not so
// much that the wood stops being a wood.
export const SHROOM_SHARE = 0.26;
// And a few nodes are simply empty, because a forest with something in every single slot reads as a corridor.
export const EMPTY_SHARE = 0.12;

/**
 * What stands at node `index` for this member. Deterministic, pure, and the server's copy of the truth.
 */
export function nodeAt(seed, index) {
    const i = Math.max(0, Math.floor(index));
    const kindRoll = hash(seed ^ 0x51ed, i);
    const x = i * NODE_GAP;
    // The lane a thing stands in, so the wood has depth: further back is smaller and dimmer, and the walk
    // does not read as a single flat row of cut-outs.
    const lane = hash(seed ^ 0x7ab3, i);
    if (kindRoll < EMPTY_SHARE) return { i, x, kind: "empty", lane };
    const depth = depthOf(i);
    if (kindRoll < EMPTY_SHARE + SHROOM_SHARE) {
        const id = weighted(MUSHROOM_IDS, MUSHROOMS, hash(seed ^ 0x2c91, i));
        return { i, x, kind: "shroom", id, lane, n: 1 + Math.floor(hash(seed ^ 0x3f77, i) * 3) };
    }
    const weights = treeWeights(depth);
    const id = weighted(TREE_IDS, Object.fromEntries(TREE_IDS.map((k) => [k, { weight: weights[k] }])), hash(seed ^ 0x1d4b, i));
    return { i, x, kind: "tree", id, lane, hp: treeById(id).bites };
}

/** A run of nodes, for the client to draw. */
export function segmentNodes(seed, from, to) {
    const out = [];
    for (let i = Math.max(0, from); i <= to; i += 1) out.push(nodeAt(seed, i));
    return out;
}
