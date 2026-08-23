import "server-only";

import { db } from "@/lib/db";
import { chipItem, moveChips, chipShelf } from "@/lib/marketplace/chips.js";

// ── THE COUNTER ──────────────────────────────────────────────────────────────────────────────────────────────
// Where chips turn into things. This is the half of the casino that decides what a chip is WORTH — the
// machines only decide how many of them you get — so it is also the only place in the new casino where a bug
// can hand out something real.
//
// THREE RULES, and they are the whole file:
//
//   1. THE PRICE COMES FROM THE CATALOG, never from the request. `item` is a key and nothing else.
//   2. THE CHIPS COME OUT FIRST, guarded inside the UPDATE, and the goods are granted after. Granting first
//      and charging second is how a failed charge becomes a free item, and a double-tap becomes two.
//   3. IF THE GRANT FAILS, THE CHIPS GO BACK. Every branch below either delivers or refunds; none of them
//      may return an error while the member is down the price.
//
// And the standing rule from the design: nothing on this shelf converts back to GOLD. Chips are a one-way
// door out of the gold economy, which is the entire reason the machines can pay what they pay.

/** One purchase. Returns the updated shelf so the screen never has to re-ask. */
export async function buyWithChips(buyerId, itemId) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const item = chipItem(itemId);
    if (!item) return { ok: false, error: "no_such_item" };

    // ── ONCE MEANS ONCE ──────────────────────────────────────────────────────────────────────────────────
    // Checked here for the message, and enforced by a partial UNIQUE index in the migration for the truth —
    // two taps arriving together both pass this read, and only the index stops the second one.
    if (item.once) {
        const had = await db.queryOne(
            `SELECT 1 FROM mkt_chip_purchase WHERE buyer_id = $1 AND item_id = $2 AND once LIMIT 1`,
            [buyerId, item.id]).catch(() => null);
        if (had) return { ok: false, error: "already_owned" };
    }

    // Charged first. `moveChips` guards the balance inside the UPDATE and returns null if it could not.
    const after = await moveChips(buyerId, -item.price, "store", { ref: item.id, meta: { name: item.name } });
    if (after === null) return { ok: false, error: "not_enough_chips" };

    // The receipt, and the second half of the once-only guard. If THIS is the write that loses the race, the
    // member has paid for something they already own — so the refund is not optional and not best-effort.
    const receipt = await db.queryOne(
        `INSERT INTO mkt_chip_purchase (buyer_id, item_id, price, once)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (buyer_id, item_id) WHERE once DO NOTHING
         RETURNING id`,
        [buyerId, item.id, item.price, Boolean(item.once)]).catch(() => null);
    if (item.once && !receipt) {
        await moveChips(buyerId, item.price, "store_refund", { ref: item.id, meta: { why: "already owned" } });
        return { ok: false, error: "already_owned" };
    }

    const granted = await grant(buyerId, item).catch(() => false);
    if (!granted) {
        // Put it back, and take the receipt with it — otherwise a once-only item is marked owned and was
        // never delivered, which is the worst outcome available and the hardest to notice.
        await moveChips(buyerId, item.price, "store_refund", { ref: item.id, meta: { why: "grant failed" } });
        if (receipt) await db.query(`DELETE FROM mkt_chip_purchase WHERE id = $1`, [receipt.id]).catch(() => {});
        return { ok: false, error: "grant_failed" };
    }

    return { ok: true, bought: item.id, name: item.name, ...(await chipShelf(buyerId)) };
}

// ── DELIVERING THE GOODS ─────────────────────────────────────────────────────────────────────────────────────
// One branch per `kind`. Each returns true only if the thing actually landed, because the caller refunds on
// false — a branch that returns true optimistically turns a failed grant into a silent theft.
//
// Everything here writes through the table the owning feature already uses, rather than inventing a
// casino-shaped copy of it: a decoration bought with chips must be the same row as a decoration bought with
// gold, or the farm has two kinds of decoration and only one of them works.
async function grant(buyerId, item) {
    switch (item.kind) {
        // Cosmetic unlocks — decorations, farm backdrops and pets — all live in one table keyed by category
        // and ref. A conflict means they already had it, which is still "delivered": the once-only index is
        // what stops a second sale, not this.
        case "decoration":
        case "pet": {
            const cat = item.kind;
            const r = await db.query(
                `INSERT INTO mkt_cosmetic_unlock (buyer_id, category, ref)
                 VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
                [buyerId, cat, item.ref]);
            return r !== null && r !== undefined;
        }
        // Forge parts are per TIER, so `ref` is [tier, count] rather than a bare number — a "handful of
        // parts" with no tier is not a thing the forge can hold.
        case "parts": {
            const [tier, count] = item.ref;
            const r = await db.queryOne(
                `INSERT INTO mkt_salvage_part (buyer_id, tier, count) VALUES ($1, $2, $3)
                 ON CONFLICT (buyer_id, tier) DO UPDATE SET count = mkt_salvage_part.count + EXCLUDED.count
                 RETURNING count`,
                [buyerId, tier, count]);
            return Boolean(r);
        }
        case "gems": {
            const r = await db.queryOne(
                `INSERT INTO mkt_gem (buyer_id, gem_id, count) VALUES ($1, $2, 1)
                 ON CONFLICT (buyer_id, gem_id) DO UPDATE SET count = mkt_gem.count + 1
                 RETURNING count`,
                [buyerId, item.ref]);
            return Boolean(r);
        }
        case "consumables": {
            // `ref` is a list of consumable ids, because the House Pack is three things rather than one.
            // Every one of them has to land or the whole grant is a failure and the chips go back — a pack
            // that delivers two thirds of itself is worse than one that fails.
            for (const id of item.ref) {
                const r = await db.queryOne(
                    `INSERT INTO mkt_user_consumable (buyer_id, consumable_id, count) VALUES ($1, $2, 1)
                     ON CONFLICT (buyer_id, consumable_id) DO UPDATE SET count = mkt_user_consumable.count + 1
                     RETURNING count`,
                    [buyerId, id]);
                if (!r) return false;
            }
            return true;
        }
        default:
            // An item whose kind nothing here handles must NOT report success. This is the branch that
            // catches a shelf entry added without its delivery, which is exactly the mistake that ships.
            return false;
    }
}
