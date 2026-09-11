import "server-only";

// ── THE DB HALF OF THE WOOD ──────────────────────────────────────────────────────────────────────────────────
// forest.js holds the rules, forest-world.js generates the wood, and this holds the three things a seed cannot
// know: which seed is yours, how far you have walked, and what is in your pouch.
//
// ⚠️ THE SERVER NEVER SEES A FOOTSTEP AND MUST NOT. A tap-to-walk world that asks the server where the trees
// are is a request per footfall — the single most expensive shape this codebase can adopt (round trips ARE the
// bill; see CLAUDE.md). The browser generates the wood from the same pure function the server has, walks it,
// and posts only when something LEAVES the world: a tree felled, mushrooms gathered. Every one of those posts
// names a NODE, and the server regenerates that node for itself to see whether the claim is even possible.

import { db } from "@/lib/db";
import {
    STREAK_CAP, TREES, axeTotal, biteFor, dropChanceFor, dropsFor,
    leafOf, materialById, streakWindow, treeById, weighted, TREE_DROPS, woodFor,
} from "@/lib/marketplace/forest.js";
import { nodeAt } from "@/lib/marketplace/forest-world.js";
import { trackActivity } from "@/lib/marketplace/activity.js";

const COLS = "buyer_id, wood, edge_level, haft_level, heft_level, felled, swings, best_streak, "
    + "seed, at_node, deepest_node, cut, taken";

const readMap = (raw) => {
    const v = typeof raw === "string" ? JSON.parse(raw || "{}") : (raw || {});
    return (v && typeof v === "object" && !Array.isArray(v)) ? v : {};
};

const axeOf = (row) => ({
    edge: Number(row?.edge_level) || 0,
    haft: Number(row?.haft_level) || 0,
    heft: Number(row?.heft_level) || 0,
});

// ── PRUNING ──────────────────────────────────────────────────────────────────────────────────────────────────
// ⚠️ AN ENDLESS WOOD CANNOT KEEP AN ENDLESS LIST OF STUMPS. A felled node only needs remembering while it is
// still regrowing; the moment it is back, FORGETTING it is what restores the tree the seed says is there. And
// a gathered mushroom never comes back, so that list is pruned by DISTANCE instead — nodes far behind the
// player are dropped, because the only cost of a forgotten one is that a mushroom the player already took
// reappears somewhere they have no reason to return to.
const KEEP_BEHIND = 400;   // nodes

function prune(seed, cut, taken, atNode, now) {
    const c = {};
    for (const [k, at] of Object.entries(cut)) {
        const felledAt = Number(at) || 0;
        const node = nodeAt(seed, Number(k));
        // Kept only while it is still coming back. Once the regrow window passes, dropping the entry IS the
        // regrowth -- the seed puts the tree back the moment nothing says it is gone.
        if (node.kind === "tree" && now - felledAt < treeById(node.id).regrow * 60000) c[k] = felledAt;
    }
    const t = {};
    for (const [k, v] of Object.entries(taken)) if (Number(k) >= atNode - KEEP_BEHIND) t[k] = v;
    return { cut: c, taken: t };
}

/** Read the member's wood, minting a seed on the first walk into it. */
export async function forestState(buyerId) {
    let row = await db.queryOne(`SELECT ${COLS} FROM mkt_forest WHERE buyer_id = $1`, [buyerId]).catch(() => null);
    if (!row || row.seed == null) {
        // ⚠️ THE SEED IS MINTED ONCE AND NEVER CHANGES. It IS the member's forest — every tree they will ever
        // walk past is already decided by it. Re-rolling one would silently replace somebody's wood.
        const seed = Math.floor(Math.random() * 2147483647) + 1;
        row = await db.queryOne(
            `INSERT INTO mkt_forest (buyer_id, seed) VALUES ($1, $2)
             ON CONFLICT (buyer_id) DO UPDATE SET seed = COALESCE(mkt_forest.seed, EXCLUDED.seed), updated_at = NOW()
             RETURNING ${COLS}`,
            [buyerId, seed]
        ).catch(() => null);
        if (!row) return null;
    }
    const mats = await db.query(
        `SELECT material_id, count FROM mkt_forest_material WHERE buyer_id = $1 AND count > 0`, [buyerId]
    ).catch(() => []);
    return view(row, mats);
}

function view(row, mats = []) {
    const axe = axeOf(row);
    return {
        seed: Number(row.seed) || 1,
        atNode: Number(row.at_node) || 0,
        deepest: Number(row.deepest_node) || 0,
        wood: Number(row.wood) || 0,
        axe,
        total: axeTotal(axe),
        bite: Math.round(biteFor(axe.edge) * 100) / 100,
        window: streakWindow(axe.haft),
        streakCap: STREAK_CAP,
        felled: Number(row.felled) || 0,
        swings: Number(row.swings) || 0,
        bestStreak: Number(row.best_streak) || 0,
        cut: readMap(row.cut),
        taken: readMap(row.taken),
        materials: (mats || []).map((m) => ({
            id: m.material_id, n: Number(m.count) || 0,
            name: materialById(m.material_id)?.name || m.material_id,
            rarity: materialById(m.material_id)?.rarity || "common",
        })),
    };
}

/** Put materials in the pouch. One statement for the lot. */
export async function addMaterials(buyerId, list) {
    const rows = (list || []).filter((m) => m && materialById(m.id) && Number(m.n) > 0);
    if (!rows.length) return [];
    for (const m of rows) {
        await db.query(
            `INSERT INTO mkt_forest_material (buyer_id, material_id, count) VALUES ($1, $2, $3)
             ON CONFLICT (buyer_id, material_id) DO UPDATE SET count = mkt_forest_material.count + $3, updated_at = NOW()`,
            [buyerId, m.id, Math.floor(Number(m.n))]
        ).catch(() => {});
    }
    return rows;
}

// ── FELLING ONE ──────────────────────────────────────────────────────────────────────────────────────────────
/**
 * A tree comes down at `node`.
 *
 * ⚠️ THE CLAIM IS CHECKED BY REGENERATING THE NODE, NOT BY TRUSTING IT. The client says "node 1423, 27 swings,
 * 5 leaves". The server asks its own copy of the wood what stands at 1423 — if that is not a tree, or it is
 * already cut, the claim dies. If it IS a tree, the swing count is checked against the only bound that
 * matters: the BEST case. A swing cannot do more than the axe's bite times the streak ceiling times two for a
 * double, so a tree cannot come down in fewer swings than that allows. The worst cheat left is "felled it
 * slightly faster than I really did", which costs the Den nothing and needs no per-tap policing.
 */
export async function fellNode(buyerId, node, swings, leaves = 0) {
    const row = await db.queryOne(`SELECT ${COLS} FROM mkt_forest WHERE buyer_id = $1`, [buyerId]).catch(() => null);
    if (!row || row.seed == null) return { ok: false, error: "no_forest" };
    const seed = Number(row.seed);
    const now = Date.now();
    const i = Math.max(0, Math.floor(Number(node) || 0));
    const here = nodeAt(seed, i);
    if (here.kind !== "tree") return { ok: false, error: "nothing_there" };

    const cutMap = readMap(row.cut);
    const was = Number(cutMap[String(i)]) || 0;
    if (was && now - was < treeById(here.id).regrow * 60000) return { ok: false, error: "already_cut" };

    const axe = axeOf(row);
    const took = Math.max(1, Math.floor(Number(swings) || 0));
    const floor = Math.ceil(treeById(here.id).bites / (biteFor(axe.edge) * STREAK_CAP * 2));
    if (took < floor) return { ok: false, error: "too_fast" };

    const wood = woodFor(here.id);
    const gained = [];
    // Leaves come off during the chop, so the client counts them — bounded by the swings it took, which is
    // itself bounded below. A forged leaf count can only ever claim one per swing.
    const leaf = leafOf(here.id);
    const leafN = Math.max(0, Math.min(Math.floor(Number(leaves) || 0), took));
    if (leaf && leafN > 0) gained.push({ id: leaf, n: leafN });
    // ⚠️ THE RARE THING IS ROLLED HERE, NOT IN THE BROWSER. It is the only part of the wood worth lying about,
    // so it is the only part the client does not get to decide.
    if (Math.random() < dropChanceFor(here.id)) {
        const id = weighted(dropsFor(here.id), TREE_DROPS, Math.random());
        if (id) gained.push({ id, n: 1 });
    }
    await addMaterials(buyerId, gained).catch(() => {});

    cutMap[String(i)] = now;
    const pruned = prune(seed, cutMap, readMap(row.taken), Number(row.at_node) || 0, now);
    const saved = await db.queryOne(
        `UPDATE mkt_forest SET wood = wood + $2, felled = felled + 1, swings = swings + $3,
                cut = $4::jsonb, taken = $5::jsonb, updated_at = NOW()
          WHERE buyer_id = $1 RETURNING ${COLS}`,
        [buyerId, wood, took, JSON.stringify(pruned.cut), JSON.stringify(pruned.taken)]
    ).catch(() => null);
    if (!saved) return { ok: false, error: "failed" };
    await trackActivity(buyerId, "forest_fell", { tree: here.id, wood, swings: took, node: i }).catch(() => {});
    return {
        ok: true, node: i, tree: here.id, name: TREES[here.id]?.name || here.id, wood,
        gained: gained.map((g) => ({ ...g, name: materialById(g.id)?.name, rarity: materialById(g.id)?.rarity })),
        forest: view(saved, await pouch(buyerId)),
    };
}

const pouch = (buyerId) => db.query(
    `SELECT material_id, count FROM mkt_forest_material WHERE buyer_id = $1 AND count > 0`, [buyerId]
).catch(() => []);

// ── PICKING UP ───────────────────────────────────────────────────────────────────────────────────────────────
/**
 * Mushrooms, in a batch.
 *
 * ⚠️ BATCHED ON PURPOSE. Walking past twenty mushrooms is twenty pickups, and twenty pickups sent one at a
 * time is twenty round trips for a handful of fungus. The client collects them as it walks and flushes the
 * list; every node in it is still regenerated and checked on its own, so batching costs no trust at all.
 */
export async function gatherNodes(buyerId, nodes) {
    const row = await db.queryOne(`SELECT ${COLS} FROM mkt_forest WHERE buyer_id = $1`, [buyerId]).catch(() => null);
    if (!row || row.seed == null) return { ok: false, error: "no_forest" };
    const seed = Number(row.seed);
    const taken = readMap(row.taken);
    const want = [...new Set((nodes || []).map((n) => Math.max(0, Math.floor(Number(n) || 0))))].slice(0, 200);
    const found = [];
    for (const i of want) {
        if (taken[String(i)]) continue;
        const here = nodeAt(seed, i);
        if (here.kind !== "shroom") continue;
        taken[String(i)] = 1;
        found.push({ id: here.id, n: here.n || 1 });
    }
    if (!found.length) return { ok: true, gained: [], forest: view(row, await pouch(buyerId)) };
    // The same mushroom can come up more than once in a batch; the pouch takes one row per material.
    const merged = [];
    for (const g of found) {
        const at = merged.find((m) => m.id === g.id);
        if (at) at.n += g.n; else merged.push({ ...g });
    }
    await addMaterials(buyerId, merged).catch(() => {});
    const pruned = prune(seed, readMap(row.cut), taken, Number(row.at_node) || 0, Date.now());
    const saved = await db.queryOne(
        `UPDATE mkt_forest SET taken = $2::jsonb, cut = $3::jsonb, updated_at = NOW() WHERE buyer_id = $1 RETURNING ${COLS}`,
        [buyerId, JSON.stringify(pruned.taken), JSON.stringify(pruned.cut)]
    ).catch(() => null);
    return {
        ok: true,
        gained: merged.map((g) => ({ ...g, name: materialById(g.id)?.name, rarity: materialById(g.id)?.rarity })),
        forest: view(saved || row, await pouch(buyerId)),
    };
}

/** Where the player is standing. Debounced by the client, exactly as Town debounces its own walk. */
export async function walkTo(buyerId, node) {
    const i = Math.max(0, Math.floor(Number(node) || 0));
    await db.query(
        `UPDATE mkt_forest SET at_node = $2, deepest_node = GREATEST(COALESCE(deepest_node, 0), $2), updated_at = NOW()
          WHERE buyer_id = $1`, [buyerId, i]
    ).catch(() => {});
}

/** Remember the longest rhythm anybody has held. Written only when it improves, so it is rarely a write. */
export async function noteStreak(buyerId, streak) {
    const n = Math.max(0, Math.floor(Number(streak) || 0));
    if (!n) return;
    await db.query(
        `UPDATE mkt_forest SET best_streak = GREATEST(best_streak, $2) WHERE buyer_id = $1 AND best_streak < $2`,
        [buyerId, n]
    ).catch(() => {});
}

/** Spend wood on the axe. One statement carries the condition, because there is no transaction here. */
export async function upgradeAxe(buyerId, track) {
    const { AXE_TRACKS, trackCost } = await import("@/lib/marketplace/forest.js");
    const t = AXE_TRACKS[track];
    if (!t) return { ok: false, error: "no_track" };
    const col = { edge: "edge_level", haft: "haft_level", heft: "heft_level" }[track];
    const row = await db.queryOne(`SELECT ${COLS} FROM mkt_forest WHERE buyer_id = $1`, [buyerId]).catch(() => null);
    if (!row) return { ok: false, error: "no_forest" };
    const level = Number(row[col]) || 0;
    if (level >= t.max) return { ok: false, error: "maxed" };
    const cost = trackCost(track, level);
    // ⚠️ THE PRICE IS IN THE WHERE. A double-tapped upgrade button must not be able to buy two levels for one
    // purse, and there is no transaction on this driver to lean on.
    const saved = await db.queryOne(
        `UPDATE mkt_forest SET ${col} = ${col} + 1, wood = wood - $2, updated_at = NOW()
          WHERE buyer_id = $1 AND wood >= $2 AND ${col} = $3 RETURNING ${COLS}`,
        [buyerId, cost, level]
    ).catch(() => null);
    if (!saved) return { ok: false, error: "not_enough_wood", cost };
    await trackActivity(buyerId, "forest_axe", { track, level: level + 1, cost }).catch(() => {});
    return { ok: true, track, level: level + 1, cost, forest: view(saved, await pouch(buyerId)) };
}
