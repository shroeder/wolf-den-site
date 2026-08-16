import "server-only";

import { db } from "@/lib/db";
import { logCoin } from "@/lib/marketplace/coins.js";
import { trackActivity } from "@/lib/marketplace/activity.js";
import {
    arenaLevelFor, classById, FREE_REFUNDS_PER_DAY, nodeById, pointsSpent, RESPEC_CLASS, RESPEC_ONE, RESPEC_TREE,
    TIER_GATE, treeFor,
} from "@/lib/marketplace/arena-classes.js";
import { ARENA_UPGRADES, upgradeCost } from "@/lib/marketplace/arena-upgrades.js";
import { crateById, rollCrate } from "@/lib/marketplace/armoury.js";
import { GEM_KINDS, gemId } from "@/lib/marketplace/gems.js";

// ── SPENDING WHAT THE ARENA PAYS ─────────────────────────────────────────────────────────────────────────────
// Every mutation in here re-reads the row, re-derives what is legal from the SAME pure functions the screen
// renders from, and only then writes. Nothing trusts a number that arrived from a client: a skill point is
// worth gold, and a tree that can be posted into is a tree that will be.

// `free_used` is computed in SQL against the STORE-LOCAL day, so a count stamped yesterday reads as zero
// without anything having to reset it at midnight — the same trick the daily raid counter uses.
const row = (buyerId) =>
    db.queryOne(
        `SELECT arena_xp, arena_class, skill_tree, upgrades, respecs, class_respecs,
                CASE WHEN free_respec_day = (NOW() AT TIME ZONE 'America/Chicago')::date
                     THEN COALESCE(free_respecs, 0) ELSE 0 END AS free_used
           FROM mkt_arena WHERE buyer_id = $1`, [buyerId]
    ).catch(() => null);

/** How many free point-refunds are left today. */
export const freeRefundsLeft = (r) => Math.max(0, FREE_REFUNDS_PER_DAY - (Number(r?.free_used) || 0));

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

    // THE FIRST THREE OF THE DAY ARE FREE. Charged only once the allowance is gone, and the counter moves in
    // the same statement that spends it — two taps at once must not both read "one left".
    const free = freeRefundsLeft(r) > 0;
    const cost = free ? 0 : RESPEC_ONE(pointsSpent(taken));
    if (free) {
        const took = await db.queryOne(
            `UPDATE mkt_arena
                SET free_respec_day = (NOW() AT TIME ZONE 'America/Chicago')::date,
                    free_respecs = CASE WHEN free_respec_day = (NOW() AT TIME ZONE 'America/Chicago')::date
                                        THEN COALESCE(free_respecs, 0) + 1 ELSE 1 END
              WHERE buyer_id = $1
                AND CASE WHEN free_respec_day = (NOW() AT TIME ZONE 'America/Chicago')::date
                         THEN COALESCE(free_respecs, 0) ELSE 0 END < $2
              RETURNING free_respecs`,
            [buyerId, FREE_REFUNDS_PER_DAY]
        ).catch(() => null);
        // Lost the race for the last free one — fall through and charge for it rather than refusing.
        if (!took) {
            const paidNow = await spendGold(buyerId, RESPEC_ONE(pointsSpent(taken)), "arena_respec_one", { nodeId });
            if (!paidNow.ok) return { ...paidNow, cost: RESPEC_ONE(pointsSpent(taken)) };
        }
    } else {
        const paid = await spendGold(buyerId, cost, "arena_respec_one", { nodeId });
        if (!paid.ok) return { ...paid, cost };
    }

    taken[nodeId] = Number(taken[nodeId]) - 1;
    if (taken[nodeId] <= 0) delete taken[nodeId];
    const cleaned = prune(r.arena_class, taken);

    await db.query(`UPDATE mkt_arena SET skill_tree = $2::jsonb, respecs = respecs + 1 WHERE buyer_id = $1`,
        [buyerId, JSON.stringify(cleaned)]).catch(() => {});
    return { ok: true, cost, free, orphaned: pointsSpent(taken) - pointsSpent(cleaned) };
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


// ── OPENING A CRATE ──────────────────────────────────────────────────────────────────────────────────────────
// The Armoury was a price list: eleven rows, each a known thing for a known number, so spending laurels was an
// arithmetic exercise you did once and repeated forever. It is three crates now and the contents are rolled —
// the decision is which crate, not which item.
//
// The roll happens HERE, after the laurels are taken and against the table the player can actually roll (a
// member without the bench gets the stand-in rows, not a shorter table). Nothing about the outcome comes from
// the client.
export async function buyArmoury(buyerId, id) {
    const crate = crateById(String(id || ""));
    if (!buyerId || !crate) return { ok: false, error: "bad_item" };


    // Spent conditionally inside the UPDATE — neon() has no transactions, so a balance read followed by a
    // spend is two taps both passing a check only one of them can afford.
    const paid = await db.queryOne(
        `UPDATE mkt_arena SET laurels = laurels - $2 WHERE buyer_id = $1 AND laurels >= $2 RETURNING laurels`,
        [buyerId, crate.cost]
    ).catch(() => null);
    if (!paid) return { ok: false, error: "not_enough_laurels", cost: crate.cost };

    const won = rollCrate(crate);

    // Hand it over. Anything that throws here has already been paid for, so each grant is best-effort and the
    // log below is the record — a member charged and given nothing is the one outcome worth avoiding above all.
    let got = { kind: won.kind, label: won.label, art: null };
    try {
        if (won.kind === "gold") {
            const g = await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`, [buyerId, won.n]).catch(() => null);
            await logCoin(buyerId, won.n, "arena_armoury", { balanceAfter: g?.gold, meta: { crate: crate.id } });
            got.art = "/images/ui/coin.png";
        } else if (won.kind === "chest") {
            const { addChests, CHEST_TIERS } = await import("@/lib/marketplace/chests.js");
            await addChests(buyerId, { [won.tier]: won.n || 1 }, { source: "arena_armoury" });
            got.art = CHEST_TIERS?.[won.tier]?.art || null;
            got.color = CHEST_TIERS?.[won.tier]?.color || null;
        } else if (won.kind === "parts") {
            const { addParts } = await import("@/lib/marketplace/crafting.js");
            const { partSprite } = await import("@/lib/marketplace/forge-parts.js");
            await addParts(buyerId, won.tier, won.n);
            got.art = partSprite(won.tier);
        } else if (won.kind === "doubloons") {
            // This branch belongs to the ARMOURY CRATE, not the ladder — the ladder has no shard prize at all.
            // So it must not pay laurels: the crate is bought with laurels, and handing them back is a wash.
            const { grantDoubloons } = await import("@/lib/marketplace/sailing.js");
            await grantDoubloons(buyerId, won.n || 1);
            got.art = "/images/sailing/doubloon.png";
        } else if (won.kind === "consumable") {
            const { grantConsumable } = await import("@/lib/marketplace/consumables.js");
            const { consumableSpriteMap } = await import("@/lib/marketplace/consumable-sprites.js");
            await grantConsumable(buyerId, won.consumable, won.n || 1);
            got.art = (await consumableSpriteMap().catch(() => ({})))[won.consumable] || null;
        } else if (won.kind === "gem") {
            // The KIND is the house's choice, the tier is what the crate promised — a crate that hands you
            // exactly the colour you wanted makes the mine pointless.
            const { grantGem } = await import("@/lib/marketplace/jeweller.js");
            const { gemArt } = await import("@/lib/marketplace/gems.js");
            const kind = GEM_KINDS[Math.floor(Math.random() * GEM_KINDS.length)].id;
            const gid = gemId(kind, won.gemTier);
            const g = await grantGem(buyerId, gid, 1, "bought");
            got.label = g?.gem?.name || won.label;
            got.art = gemArt(gid);
            got.color = g?.gem?.color || null;
        } else if (won.kind === "fights") {
            // Today only, stored as a reduction of today's used count so it expires with the day.
            await db.query(
                `UPDATE mkt_arena
                    SET fights_today = GREATEST(0, CASE WHEN fights_day = (NOW() AT TIME ZONE 'America/Chicago')::date
                                                        THEN COALESCE(fights_today, 0) ELSE 0 END - $2),
                        fights_day = (NOW() AT TIME ZONE 'America/Chicago')::date
                  WHERE buyer_id = $1`,
                [buyerId, won.n]
            );
        }
    } catch { /* paid for; the log is the record */ }

    await trackActivity(buyerId, "arena_armoury", { crate: crate.id, cost: crate.cost, won: won.label }).catch(() => {});
    return { ok: true, opened: { crate: { id: crate.id, name: crate.name, art: crate.art }, ...got, worth: won.worth },
        laurels: Number(paid.laurels) || 0 };
}

// ── THE PURSER'S EXCHANGE ────────────────────────────────────────────────────────────────────────────────────
// "Doubloons and laurels convert freely into one another. Gold stays out of it."
//
// The two currencies are otherwise sealed: doubloons only come out of a won sea fight and only the
// Quartermaster takes them; laurels only come out of the ring and only the Armoury takes them. So a member
// who lives in one of those two places has a full purse of something they can never spend on the other, and
// this power is the only bridge between them.
//
// GOLD IS DELIBERATELY OUT. Gold is the currency everything else in the game mints — the farm, the boss, the
// wheel, cooking — and a rate into either of these would turn two earned currencies into a shop you can farm.
// That is the whole reason the card says so out loud.
//
// ONE-FOR-ONE, and the same rate both ways. A spread would make the power a tax on using it, and an uneven
// rate would make one direction the only correct direction, which is not a decision.
export const PURSER_RATE = 1;
export const PURSER_MAX = 5000;   // per conversion, so a slip of the thumb is never the whole purse

export async function purserExchange(buyerId, from, amount) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const { hasPower } = await import("@/lib/marketplace/ascension-powers.js");
    if (!(await hasPower(buyerId, "purser_s_exchange"))) return { ok: false, error: "no_power" };
    const dir = from === "laurels" ? "laurels" : "doubloons";
    const n = Math.floor(Number(amount) || 0);
    if (n <= 0 || n > PURSER_MAX) return { ok: false, error: "bad_amount" };
    const paid = n * PURSER_RATE;

    if (dir === "doubloons") {
        // Taken CONDITIONALLY, so a purse that is short simply refuses rather than going negative.
        const took = await db.queryOne(
            `UPDATE mkt_sailing SET doubloons = COALESCE(doubloons,0) - $2 WHERE buyer_id = $1 AND COALESCE(doubloons,0) >= $2 RETURNING doubloons`,
            [buyerId, n]
        ).catch(() => null);
        if (!took) return { ok: false, error: "not_enough_doubloons" };
        await db.query(`INSERT INTO mkt_arena (buyer_id) VALUES ($1) ON CONFLICT (buyer_id) DO NOTHING`, [buyerId]).catch(() => {});
        await db.query(`UPDATE mkt_arena SET laurels = COALESCE(laurels,0) + $2 WHERE buyer_id = $1`, [buyerId, paid]).catch(() => {});
    } else {
        const took = await db.queryOne(
            `UPDATE mkt_arena SET laurels = COALESCE(laurels,0) - $2 WHERE buyer_id = $1 AND COALESCE(laurels,0) >= $2 RETURNING laurels`,
            [buyerId, n]
        ).catch(() => null);
        if (!took) return { ok: false, error: "not_enough_laurels" };
        await db.query(`INSERT INTO mkt_sailing (buyer_id) VALUES ($1) ON CONFLICT (buyer_id) DO NOTHING`, [buyerId]).catch(() => {});
        await db.query(`UPDATE mkt_sailing SET doubloons = COALESCE(doubloons,0) + $2 WHERE buyer_id = $1`, [buyerId, paid]).catch(() => {});
    }
    await trackActivity(buyerId, "purser_exchange", { from: dir, n, paid }).catch(() => {});
    return { ok: true, from: dir, spent: n, gained: paid };
}

// ── A RECIPE OFF THE ARMOURY, for laurels ────────────────────────────────────────────────────────────────────
// The doubloon twin of this lives on the Quartermaster (buyRecipe in sailing.js) and they share the roll, the
// odds and the price ratio — so neither counter is the obviously correct one to walk up to. Laurels are
// otherwise spent only on crates and stones, and a permanent unlock is a better sink than a fourth gamble.
export async function buyArmouryRecipe(buyerId) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const { hasUnknownRecipe, grantBoughtRecipe, RECIPE_PRICE_LAURELS } = await import("@/lib/marketplace/cooking.js");
    if (!(await hasUnknownRecipe(buyerId, "shop"))) return { ok: false, error: "knows_them_all" };

    const paid = await db.queryOne(
        `UPDATE mkt_arena SET laurels = laurels - $2 WHERE buyer_id = $1 AND laurels >= $2 RETURNING laurels`,
        [buyerId, RECIPE_PRICE_LAURELS]
    ).catch(() => null);
    if (!paid) return { ok: false, error: "not_enough_laurels", cost: RECIPE_PRICE_LAURELS };

    const got = await grantBoughtRecipe(buyerId).catch(() => null);
    if (!got) {
        await db.query(`UPDATE mkt_arena SET laurels = laurels + $2 WHERE buyer_id = $1`, [buyerId, RECIPE_PRICE_LAURELS]).catch(() => {});
        return { ok: false, error: "knows_them_all" };
    }
    await trackActivity(buyerId, "buy_recipe", { currency: "laurels", cost: RECIPE_PRICE_LAURELS, recipe: got.id }).catch(() => {});
    // No reveal payload on purpose — the site-wide watcher shows the same card a found recipe gets.
    return { ok: true, bought: got.name, laurels: Number(paid.laurels) || 0 };
}
