import "server-only";

import { db } from "@/lib/db";
import { getInventoryCounts } from "@/lib/consignment/square";
import { parsePackCardName } from "@/lib/marketplace/pack-card-name.js";
import { createServerLogger } from "@/lib/server-logger";

const logger = createServerLogger({ source: "api", subsystem: "pack-shelf-claim" });

// ── TAKING A CARD OFF THE SHELF ──────────────────────────────────────────────────────────────────────────────
// docs/category-packs.md §6. A bag is a sealed object in a tub that nobody sells by mistake. A shelf single is
// in a binder in a case and is for sale RIGHT NOW, at the counter, to somebody standing in the shop — so the
// claim has to be real before the member is shown anything.
//
// ── ⚠️ WHY THIS MAKES A `mystery_bag_cards` ROW AT CLAIM TIME ────────────────────────────────────────────────
// The alternative is materialising all 910 Pokémon singles into that table and keeping them in step with the
// register for ever — a sync job whose failure mode is a pool that quietly disagrees with the shelf.
//
// Instead the row is created for the ONE card that was drawn, at the moment it is drawn, and from there it is
// a pool row exactly like a bag: the pending slot, the credit spend, the sold event, the pull task, the
// vault, the sell-back and the trade ledger all read it without knowing where it came from. `channel` and
// `pool` are the only things that say.
//
// ⚠️ SO THE SAME VARIATION APPEARS HERE MANY TIMES OVER ITS LIFE — four copies of a card bought, four members
// pulling one each — and nothing about this may assume uniqueness.

/** How many candidates to try before giving up. Each one costs a live Square read, so this is not generous. */
const MAX_TRIES = 3;

/**
 * Pick a card from the pool and reserve it locally.
 *
 * Returns the same shape the bagged claim returns, so the caller does not branch twice.
 *
 * ⚠️ THE FEED IS A MIRROR, NOT THE TRUTH. `inventory_feed` is refreshed from Square on a schedule and its
 * oldest rows are months old, so "quantity > 0" there means "was in stock when we last looked". The feed
 * picks the CANDIDATE; Square confirms it. Skipping the confirmation would sell cards that left the building
 * at the weekend.
 *
 * ⚠️ AND THE CONFIRM-THEN-ADJUST WINDOW IS REAL AND IS NOT CLOSED HERE. Between reading the live count and
 * the caller's decrement there is roughly a round trip in which the register could take the same card. The
 * consequence is one SKU going to -1 and a member holding a card the case does not have, which the queue's
 * `not_found` path already refunds in full — §6.3 says that stops being an edge case and becomes a normal
 * weekly event, and this is the reason. Closing it properly means holding a lock across a Square write, and
 * Square's catalog writes serialise under load; that trade is worse than the refund.
 */
export async function claimShelfCard({ pool, reservationKey }) {
    if (!pool?.category) return null;

    for (let attempt = 0; attempt < MAX_TRIES; attempt += 1) {
        // ⚠️ `NOT consigned` AGAIN, AND IT IS NOT BELT AND BRACES. This query does not go through
        //    shelfPoolStats, so leaving it out here would mean a pool that is PRICED off our own stock and
        //    PULLS from a consignor's.
        const candidate = await db
            .queryOne(
                `SELECT variation_id, name, price, image_url
                   FROM inventory_feed
                  WHERE in_stock AND quantity > 0 AND NOT consigned
                    AND category_names = $1
                  ORDER BY random()
                  LIMIT 1`,
                [pool.category]
            )
            .catch((error) => {
                logger.error("pack_shelf.candidate_failed", error, { pool: pool.key });
                return null;
            });
        if (!candidate) return null;

        const counts = await getInventoryCounts([candidate.variation_id]).catch((error) => {
            logger.warn("pack_shelf.count_failed", { pool: pool.key, message: error?.message });
            return null;
        });
        // A count we could not read is not a card we may sell. Try another rather than guessing.
        const live = counts ? Number(counts.get(candidate.variation_id) || 0) : 0;
        if (live < 1) {
            logger.info("pack_shelf.candidate_gone", { pool: pool.key, variationId: candidate.variation_id, live });
            continue;
        }

        const parsed = parsePackCardName(candidate.name || "");
        const marketValue = Number(candidate.price || 0);

        // ⚠️ status 'reserved', NOT 'sold'. The caller marks it sold only once the credit is spent and Square
        //    has actually been decremented; if anything between here and there fails, this row is released
        //    exactly like an abandoned bag reservation and the stale-reservation window reclaims it.
        const row = await db
            .queryOne(
                `INSERT INTO mystery_bag_cards
                    (card_id, card_name, set_name, card_number, condition, market_value, image_url,
                     square_variation_id, status, channel, pool, reservation_key, reserved_at, item_type)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'reserved', 'shelf', $9, $10, NOW(), 'card')
                 RETURNING id, card_id, card_name, condition, market_value, image_url, item_type,
                           square_variation_id, packed_variation_id, variation_sku, channel, pool,
                           cost_cents, cost_basis`,
                [
                    candidate.variation_id, candidate.name, parsed.setCode, parsed.number,
                    parsed.condition, marketValue, candidate.image_url, candidate.variation_id,
                    pool.key, reservationKey,
                ]
            )
            .catch((error) => {
                logger.error("pack_shelf.reserve_failed", error, { pool: pool.key });
                return null;
            });
        if (row) return row;
    }

    logger.warn("pack_shelf.no_candidate", { pool: pool.key, tries: MAX_TRIES });
    return null;
}
