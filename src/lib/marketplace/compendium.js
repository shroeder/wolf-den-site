import "server-only";

import { db } from "@/lib/db";
import { ITEMS, isOwnerOnlyItem } from "@/lib/marketplace/items.js";

// ── THE COMPENDIUM ───────────────────────────────────────────────────────────────────────────────────────────
// Every piece of gear in the game, and whether you have ever held it.
//
// COLLECTED IS FOREVER. Sell it, salvage it, trade it away, lose it in a wager — it still counts. The whole
// point of a collection is that it records what you FOUND, and a count that goes down the moment you use the
// Forge would punish playing with your own things. That is why this is its own table rather than a read of
// mkt_user_item, which is a live inventory and answers a different question.
//
// ONE WRITE POINT. `markCollected` is called from grantItem — the single door every acquisition already goes
// through — so a new drop source is counted by doing nothing at all.

/**
 * Record that a member has held these items. Idempotent, and cheap enough to call on every grant.
 *
 * Silent on failure like every other bookkeeping write in this codebase: a compendium row losing must never be
 * the reason somebody does not receive the item itself.
 */
export async function markCollected(buyerId, itemIds = []) {
    const ids = (Array.isArray(itemIds) ? itemIds : [itemIds]).filter(Boolean).map(String);
    if (!buyerId || !ids.length) return;
    await db.query(
        `INSERT INTO mkt_item_collected (buyer_id, item_id)
         SELECT $1, UNNEST($2::text[])
         ON CONFLICT (buyer_id, item_id) DO NOTHING`,
        [buyerId, ids]
    ).catch(() => {});
}

/** Every item id this member has ever held. */
export async function collectedIds(buyerId) {
    if (!buyerId) return new Set();
    const rows = await db.query(`SELECT item_id FROM mkt_item_collected WHERE buyer_id = $1`, [buyerId]).catch(() => []);
    return new Set(rows.map((r) => r.item_id));
}

// ── WHAT COLLECTING PAYS ─────────────────────────────────────────────────────────────────────────────────────
// Permanent, passive, and owed to nothing but the count — you do not wear these and you cannot lose them.
//
// THE CURVE IS DELIBERATELY SHALLOW AT THE TOP. Ten items is an afternoon and a thousand is most of the
// catalogue, so the early rungs have to feel like something while the last one cannot be a second character.
// Measured against gear: the best-in-slot loadout is around +202 Might, so the full ladder below is worth
// roughly a third of a whole kit for having played the entire game. That is a reward for breadth, not a
// replacement for building.
export const COMPENDIUM_MILESTONES = [
    { at: 10, stats: { fortune: 2 }, label: "+2 Fortune" },
    { at: 25, stats: { might: 3, fortune: 2 }, label: "+3 Might, +2 Fortune" },
    { at: 50, stats: { might: 5, crit_chance: 2 }, label: "+5 Might, +2 Crit chance" },
    { at: 100, stats: { might: 8, ferocity: 5, fortune: 3 }, label: "+8 Might, +5 Ferocity, +3 Fortune" },
    { at: 250, stats: { might: 12, crit_power: 8, fortune: 5 }, label: "+12 Might, +8 Crit power, +5 Fortune" },
    { at: 500, stats: { might: 18, ferocity: 12, crit_chance: 4 }, label: "+18 Might, +12 Ferocity, +4 Crit chance" },
    { at: 1000, stats: { might: 25, ferocity: 18, crit_power: 15, fortune: 10 }, label: "+25 Might, +18 Ferocity, +15 Crit power, +10 Fortune" },
];

/** The stat total a given collection size has earned. Pure — the same maths the panel prints and the fight uses. */
export function compendiumBonus(count = 0) {
    const total = {};
    for (const m of COMPENDIUM_MILESTONES) {
        if (count < m.at) break;
        for (const [k, v] of Object.entries(m.stats)) total[k] = (total[k] || 0) + v;
    }
    return total;
}

/**
 * The member's compendium bonus, for the stat aggregate.
 *
 * Read straight off a COUNT rather than the id list: the fight does not care which items, only how many, and
 * counting in the database beats shipping a thousand ids to add them up.
 */
export async function compendiumStats(buyerId) {
    if (!buyerId) return {};
    const row = await db.queryOne(`SELECT COUNT(*)::int AS n FROM mkt_item_collected WHERE buyer_id = $1`, [buyerId]).catch(() => null);
    return compendiumBonus(Number(row?.n) || 0);
}

/**
 * The whole catalogue, dressed for the screen.
 *
 * OWNER-ONLY CONTENT IS EXCLUDED, for the same reason it is excluded from every drop pool: an unlaunched item
 * on a completion screen is a slot nobody can ever fill, and the flag exists precisely so members cannot tell
 * it is there. The denominator has to be a number you can actually reach.
 */
export async function getCompendium(buyerId) {
    const have = await collectedIds(buyerId);
    const pool = ITEMS.filter((i) => !isOwnerOnlyItem(i));
    const items = pool.map((i) => ({
        id: i.id, name: i.name, slot: i.slot || null, rarity: i.rarity, icon: i.icon || null,
        flavor: i.flavor || null, stats: i.stats || null, reqLevel: i.reqLevel || null,
        source: i.source || null, signature: i.signature || null,
        collected: have.has(i.id),
    }));
    const count = items.filter((i) => i.collected).length;
    const next = COMPENDIUM_MILESTONES.find((m) => count < m.at) || null;
    return {
        items,
        count,
        total: items.length,
        bonus: compendiumBonus(count),
        milestones: COMPENDIUM_MILESTONES.map((m) => ({ ...m, reached: count >= m.at })),
        next: next ? { ...next, toGo: next.at - count } : null,
    };
}
