// ── THE ONE HASH BOTH SIDES AGREE ON ─────────────────────────────────────────────────────────────────────────
// One integer in, one number in [0,1) out, stable across machines. Not Math.random: the whole point is that
// the SERVER can reproduce exactly what the browser generated.
//
// That is the anti-cheat for every tap-to-step world in this codebase. A walkable place that asks the server
// where the next thing is costs one request per footfall, which is the single most expensive shape we can
// adopt (round trips ARE the bill — see CLAUDE.md). So the client generates the world and plays it, and a
// claim of "I took node 1423" is checked by the server generating node 1423 for itself and asking whether
// that is a thing, what kind, and what it could possibly have been worth. A forged node number produces a
// different node than the cheater expected, or nothing at all.
//
// ⚠️ IT LIVES ALONE BECAUSE TWO WORLDS NOW USE IT — the endless wood (forest-world.js) and the twenty-five
// islands (island-world.js). A second copy of these four lines is a second thing to get subtly wrong, and the
// failure mode is not an error: it is a server that quietly disagrees with every honest player about what is
// standing in front of them. See [[reuse-the-rule-never-restate-it]].
//
// ⚠️ AND IT MUST NEVER CHANGE. It is not a detail of an implementation, it is a WIRE FORMAT between the
// browser and the server, and it is also the reason walking back the way you came shows you the same tree.
// Touch the mix and every world in the game silently re-rolls under everyone standing in it.
//
// PURE. No imports at all, deliberately, so nothing can ever drag a server-only module into a client bundle
// through this file.

export function hash(a, b = 0) {
    let h = (Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x165667b1, 0xc2b2ae35)) >>> 0;
    h ^= h >>> 15; h = Math.imul(h, 0x2545f491) >>> 0; h ^= h >>> 13;
    return (h >>> 0) / 4294967296;
}

/**
 * Weighted pick from a plain {key: weight} map, driven by ONE roll in [0,1).
 *
 * Takes the roll rather than making it, for the same reason `hash` exists: the caller decides which stream of
 * the seed this draw comes from, so the server can ask for that exact draw again. A weights map that sums to
 * zero returns the first key rather than undefined — an island with nothing on it is a bug, not a crash.
 */
export function pickWeighted(weights, roll) {
    const keys = Object.keys(weights || {});
    if (!keys.length) return null;
    let total = 0;
    for (const k of keys) total += Math.max(0, Number(weights[k]) || 0);
    if (total <= 0) return keys[0];
    let n = Math.max(0, Math.min(0.9999999, Number(roll) || 0)) * total;
    for (const k of keys) {
        n -= Math.max(0, Number(weights[k]) || 0);
        if (n < 0) return k;
    }
    return keys[keys.length - 1];
}
