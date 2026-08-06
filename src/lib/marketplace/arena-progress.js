import "server-only";

import { db } from "@/lib/db";
import { logCoin } from "@/lib/marketplace/coins.js";
import { trackActivity } from "@/lib/marketplace/activity.js";
import {
    arenaLevelFor, classById, nodeById, pointsSpent, RESPEC_CLASS, RESPEC_ONE, RESPEC_TREE,
    TIER_GATE, treeFor,
} from "@/lib/marketplace/arena-classes.js";
import { ARENA_UPGRADES, upgradeCost } from "@/lib/marketplace/arena-upgrades.js";

// ── SPENDING WHAT THE ARENA PAYS ─────────────────────────────────────────────────────────────────────────────
// Every mutation in here re-reads the row, re-derives what is legal from the SAME pure functions the screen
// renders from, and only then writes. Nothing trusts a number that arrived from a client: a skill point is
// worth gold, and a tree that can be posted into is a tree that will be.

const row = (buyerId) =>
    db.queryOne(
        `SELECT arena_xp, arena_class, skill_tree, upgrades, respecs, class_respecs
           FROM mkt_arena WHERE buyer_id = $1`, [buyerId]
    ).catch(() => null);

const gold = (buyerId) =>
    db.queryOne(`SELECT gold FROM mkt_buyer WHERE id = $1`, [buyerId]).then((r) => Number(r?.gold) || 0).catch(() => 0);

/** Points earned (one a level) minus points spent. */
export function pointsFor(r) {
    const { level } = arenaLevelFor(Number(r?.arena_xp) || 0);
    const spent = pointsSpent(r?.skill_tree || {});
    return { level, spent, available: Math.max(0, level - spent) };
}

async function spendGold(buyerId, amount, reason, meta) {
    const have = await gold(buyerId);
    if (have < amount) return { ok: false, error: "poor", need: amount - have };
    const g = await db.queryOne(
        `UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`, [buyerId, amount]
    ).catch(() => null);
    if (!g) return { ok: false, error: "poor" };
    await logCoin(buyerId, -amount, reason, { balanceAfter: g.gold, meta }).catch(() => {});
    return { ok: true };
}

/** Choose a class. Only possible once, and only while the tree is empty — changing later is a class respec. */
export async function pickClass(buyerId, classId) {
    const r = await row(buyerId);
    if (!r) return { ok: false, error: "no_row" };
    if (r.arena_class) return { ok: false, error: "already_chosen" };
    if (!classById(classId)) return { ok: false, error: "bad_class" };
    const { level } = pointsFor(r);
    if (level < 1) return { ok: false, error: "too_low" };
    await db.query(`UPDATE mkt_arena SET arena_class = $2, skill_tree = '{}'::jsonb WHERE buyer_id = $1`,
        [buyerId, classId]).catch(() => {});
    await trackActivity(buyerId, "arena_class", { classId }).catch(() => {});
    return { ok: true };
}

/** Put one point into a node. */
export async function takeNode(buyerId, nodeId) {
    const r = await row(buyerId);
    if (!r?.arena_class) return { ok: false, error: "no_class" };
    const node = nodeById(r.arena_class, nodeId);
    if (!node) return { ok: false, error: "bad_node" };

    const taken = { ...(r.skill_tree || {}) };
    const { available, spent } = pointsFor(r);
    if (available <= 0) return { ok: false, error: "no_points" };

    const rank = Number(taken[nodeId]) || 0;
    if (rank >= (node.ranks || 1)) return { ok: false, error: "maxed" };
    // The tier gate is checked HERE and not only in the UI — it is the only thing stopping a crafted POST
    // from putting the first point of the game into a tier-four node.
    if (spent < (TIER_GATE[node.tier] ?? 0)) return { ok: false, error: "locked" };

    taken[nodeId] = rank + 1;
    await db.query(`UPDATE mkt_arena SET skill_tree = $2::jsonb WHERE buyer_id = $1`,
        [buyerId, JSON.stringify(taken)]).catch(() => {});
    return { ok: true };
}

/**
 * Refund a single rank, for gold.
 *
 * REFUNDING CAN ORPHAN A TIER. Pull a point out of tier one and a tier-three node you already own may no
 * longer meet its gate — so the whole allocation is re-validated afterwards and anything now unreachable is
 * refunded too, rather than being left as a node you own but could not have bought.
 */
export async function refundNode(buyerId, nodeId) {
    const r = await row(buyerId);
    if (!r?.arena_class) return { ok: false, error: "no_class" };
    const taken = { ...(r.skill_tree || {}) };
    if (!(Number(taken[nodeId]) > 0)) return { ok: false, error: "not_taken" };

    const cost = RESPEC_ONE(pointsSpent(taken));
    const paid = await spendGold(buyerId, cost, "arena_respec_one", { nodeId });
    if (!paid.ok) return { ...paid, cost };

    taken[nodeId] = Number(taken[nodeId]) - 1;
    if (taken[nodeId] <= 0) delete taken[nodeId];
    const cleaned = prune(r.arena_class, taken);

    await db.query(`UPDATE mkt_arena SET skill_tree = $2::jsonb, respecs = respecs + 1 WHERE buyer_id = $1`,
        [buyerId, JSON.stringify(cleaned)]).catch(() => {});
    return { ok: true, cost, orphaned: pointsSpent(taken) - pointsSpent(cleaned) };
}

/** Drop anything whose tier gate is no longer met, repeatedly, until the allocation is self-consistent. */
function prune(classId, taken) {
    const out = { ...taken };
    for (let pass = 0; pass < 8; pass += 1) {
        const spent = pointsSpent(out);
        let changed = false;
        for (const n of treeFor(classId)) {
            if (!(Number(out[n.id]) > 0)) continue;
            // A node's own points do not count toward its own gate, or a tier could bootstrap itself.
            const others = spent - (Number(out[n.id]) || 0);
            if (others < (TIER_GATE[n.tier] ?? 0)) { delete out[n.id]; changed = true; }
        }
        if (!changed) break;
    }
    return out;
}

/** Empty the tree for gold. Points come back; the class stays. */
export async function respecTree(buyerId) {
    const r = await row(buyerId);
    if (!r?.arena_class) return { ok: false, error: "no_class" };
    const spent = pointsSpent(r.skill_tree || {});
    if (spent <= 0) return { ok: false, error: "nothing_spent" };
    const cost = RESPEC_TREE(spent);
    const paid = await spendGold(buyerId, cost, "arena_respec_tree", { spent });
    if (!paid.ok) return { ...paid, cost };
    await db.query(`UPDATE mkt_arena SET skill_tree = '{}'::jsonb, respecs = respecs + 1 WHERE buyer_id = $1`,
        [buyerId]).catch(() => {});
    await trackActivity(buyerId, "arena_respec", { spent, cost }).catch(() => {});
    return { ok: true, cost, refunded: spent };
}

/** Change class for gold. Every point comes back, because none of them mean anything in the new tree. */
export async function respecClass(buyerId, classId) {
    const r = await row(buyerId);
    if (!r?.arena_class) return { ok: false, error: "no_class" };
    if (!classById(classId)) return { ok: false, error: "bad_class" };
    if (classId === r.arena_class) return { ok: false, error: "same_class" };
    const spent = pointsSpent(r.skill_tree || {});
    const cost = RESPEC_CLASS(spent);
    const paid = await spendGold(buyerId, cost, "arena_respec_class", { from: r.arena_class, to: classId });
    if (!paid.ok) return { ...paid, cost };
    await db.query(
        `UPDATE mkt_arena SET arena_class = $2, skill_tree = '{}'::jsonb, class_respecs = class_respecs + 1
          WHERE buyer_id = $1`, [buyerId, classId]
    ).catch(() => {});
    await trackActivity(buyerId, "arena_class_respec", { from: r.arena_class, to: classId, cost }).catch(() => {});
    return { ok: true, cost, refunded: spent };
}

/** Buy a level of an arena upgrade track. Same shape as the boat/dig/rail tracks. */
export async function buyArenaUpgrade(buyerId, trackId) {
    const def = ARENA_UPGRADES.find((u) => u.id === trackId);
    if (!def) return { ok: false, error: "bad_track" };
    const r = await row(buyerId);
    if (!r) return { ok: false, error: "no_row" };
    const ups = { ...(r.upgrades || {}) };
    const level = Number(ups[trackId]) || 0;
    if (level >= def.max) return { ok: false, error: "maxed" };
    const cost = upgradeCost(def, level);
    const paid = await spendGold(buyerId, cost, "arena_upgrade", { trackId, to: level + 1 });
    if (!paid.ok) return { ...paid, cost };
    ups[trackId] = level + 1;
    await db.query(`UPDATE mkt_arena SET upgrades = $2::jsonb WHERE buyer_id = $1`,
        [buyerId, JSON.stringify(ups)]).catch(() => {});
    return { ok: true, cost, level: level + 1 };
}
