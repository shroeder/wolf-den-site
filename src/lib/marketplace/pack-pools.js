import "server-only";

import { db } from "@/lib/db";
import { createServerLogger } from "@/lib/server-logger";

const logger = createServerLogger({ source: "api", subsystem: "pack-pools" });

// ── WHAT A PACK IS DRAWN FROM ────────────────────────────────────────────────────────────────────────────────
// docs/category-packs.md. A pool is a CATEGORY of the shop's own singles — not a band, not a curated list.
// Luke, 2026-10-27, having read the case for cutting each category into price bands: one pack per category.
//
// The numbers backed him. Unbanded, a $15 Pokémon pack has a $6 median — 40% of its price — and Magic is 53%.
// The bags already on sale are $25 against a $4 median, which is 16%. Both new pools are two to three times
// kinder than the product that is already shipping.
//
// ── ⚠️ A POOL CARRIES NO PRICE AND NO CARD LIST ──────────────────────────────────────────────────────────────
// Both are derived, and deriving them is the entire job of this file:
//
//   · MEMBERSHIP is a live query against `inventory_feed`. A copied list of variation ids would be a second
//     source of truth about what is on the shelf, and it is wrong the moment the register sells one.
//   · PRICE is ceil(EV / $5) * $5 off that query, computed on a SCHEDULE and stored — never at open time.
//     See recomputePools().
//
// ⚠️ AND THERE IS NO `band` FIELD. Bands were considered and rejected; a vestigial range sitting unused in
// here is the kind of thing somebody fills in later assuming it was meant to be used.

/**
 * ⚠️ `category` IS SQUARE'S `reporting_category` AND NOTHING ELSE.
 *
 * `category_id` stores nothing that reaches a sale — this house has already been bitten by it — so a pool
 * keyed off that would match no inventory at all while looking perfectly correct in the diff. The strings
 * below are exactly what `inventory_feed.category_names` holds, which is the reporting category.
 */
export const PACK_POOLS = [
    {
        key: "bags",
        brand: "Wolf Den Mystery Bag",
        channel: "bagged",
        // The bags price themselves off Square's own bag SKU (see packPrice) rather than off an EV, because
        // they are a real product with a real shelf price. They are in this registry to be LISTED, not to be
        // priced by it.
        pricedBySquare: true,
        public: true,
    },
    { key: "pkmn", brand: "Pokémon Singles", channel: "shelf", category: "Pokemon Single Card" },
    { key: "mtg", brand: "Magic Singles", channel: "shelf", category: "Magic Single Card" },
    // Defined and expected to be CLOSED on concentration — one Ancient Fairy Dragon is a third of this pool's
    // value. It is here rather than omitted so that it opens by itself the day the shelf allows, instead of
    // waiting for somebody to remember it exists.
    { key: "ygo", brand: "Yu-Gi-Oh Singles", channel: "shelf", category: "Yu-Gi-Oh Single" },
];

export const poolByKey = (key) => PACK_POOLS.find((p) => p.key === key) || null;
export const shelfPools = () => PACK_POOLS.filter((p) => p.channel === "shelf");

// ── THE PRICE RULE ───────────────────────────────────────────────────────────────────────────────────────────
// Luke: "the expected value average is probably going to dictate what we charge, rounding up to the nearest
// $5, so that we ensure we make money."
const ROUND_TO_CENTS = 500;

/** ⚠️ ceil, never round — the whole point of the rule is that the price is never under the EV. */
export const priceForEvCents = (evCents) =>
    Math.max(ROUND_TO_CENTS, Math.ceil(Math.max(0, Math.round(evCents)) / ROUND_TO_CENTS) * ROUND_TO_CENTS);

// ── WHEN A POOL IS ALLOWED TO BE OPEN ────────────────────────────────────────────────────────────────────────
// ⚠️ CONCENTRATION, NOT DEPTH. With whole categories as pools, unit count stopped being the interesting test —
// 910 units is plenty and the shelf refills every time we buy a collection. What bites is one card carrying
// the pool: a third of the Yu-Gi-Oh pool's value is a single $157 card, and its EV only clears $5 because
// that card is in it. Take it out and the other fifty average $6.66.
//
// So the pack would be priced on one card, and the first member to pull it leaves a materially worse product
// behind at the same price until the next recompute. Pokémon is 2.2% and Magic 5.5%; both would have to
// change a great deal to stop passing.
export const MAX_TOP_SHARE_BP = 1500;   // 15.00%
// Below this a pool is not a mystery, it is a short list somebody can memorise.
export const MIN_UNITS = 25;

/**
 * The pool as it stands right now, straight from the shelf mirror.
 *
 * ⚠️ `NOT consigned` LIVES HERE AND NOWHERE ELSE. Four of the deepest categories on the shelf are consignors
 * rather than products — Eric D, Pedro Painting, Josh comics, Justin's cards — and selling a consigned card
 * through a pack would owe that consignor a payout against a price that has nothing to do with their deal.
 * Putting the filter in each caller is how one caller eventually does not have it.
 */
export async function shelfPoolStats(pool) {
    if (!pool?.category) return null;
    const row = await db.queryOne(
        `SELECT COALESCE(SUM(quantity), 0)::int                                  AS units,
                COUNT(*)::int                                                    AS lines,
                COALESCE(AVG(price), 0)                                          AS ev,
                COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price), 0)  AS median,
                COALESCE(MIN(price), 0)                                          AS lo,
                COALESCE(MAX(price), 0)                                          AS hi,
                COALESCE(SUM(price * quantity), 0)                               AS total,
                COALESCE(MAX(price * quantity), 0)                               AS top
           FROM inventory_feed
          WHERE in_stock AND quantity > 0 AND NOT consigned
            AND category_names = $1`,
        [pool.category]
    );
    if (!row) return null;

    const cents = (v) => Math.round(Number(v || 0) * 100);
    const total = Number(row.total || 0);
    const topShareBp = total > 0 ? Math.round((Number(row.top || 0) / total) * 10000) : 0;

    return {
        units: row.units || 0,
        lines: row.lines || 0,
        evCents: cents(row.ev),
        medianCents: cents(row.median),
        minCents: cents(row.lo),
        maxCents: cents(row.hi),
        totalCents: cents(total),
        topShareBp,
    };
}

/**
 * What is actually in a shelf pool, best first — the "what's inside" sheet.
 *
 * ⚠️ IT IS A REAL LIST OFF THE REAL POOL, NOT A SAMPLE AND NOT A BRAG. Luke's whole reason for the carousel
 * was that "you can still evaluate what's inside", and the bags' sheet has listed every card in the pool
 * since the day it shipped. Capped only because 910 rows is a scroll nobody finishes — the cap is on the
 * SHEET, and the cards below it are still in the pool and still pullable.
 */
export async function shelfPoolCards(pool, { limit = 40 } = {}) {
    if (!pool?.category) return [];
    const rows = await db
        .query(
            `SELECT name, price, image_url
               FROM inventory_feed
              WHERE in_stock AND quantity > 0 AND NOT consigned
                AND category_names = $1
              ORDER BY price DESC
              LIMIT $2`,
            [pool.category, limit]
        )
        .catch(() => []);
    return rows.map((r) => ({
        id: r.name,
        name: r.name,
        valueCents: Math.round(Number(r.price || 0) * 100),
        imageUrl: r.image_url || null,
    }));
}

/** Why a pool is shut, in words a screen can show — or null when it is open. */
export function closedReason(stats) {
    if (!stats || !stats.units) return "empty";
    if (stats.units < MIN_UNITS) return "too_few";
    if (stats.topShareBp > MAX_TOP_SHARE_BP) return "concentrated";
    return null;
}

/**
 * ── THE NIGHTLY RECOMPUTE ────────────────────────────────────────────────────────────────────────────────────
 * Reads every shelf pool, prices it, and writes the answer where the screens and the open path read it.
 *
 * ⚠️ A PRICE MAY FALL AT ANY TIME AND MAY ONLY RISE AFTER ITS HOLD EXPIRES, which is the only reason this
 * table has a `held_until` at all. Pokémon's EV sits fifteen cents under the $15 boundary — an ordinary
 * week's buying pushes that pack to $20, a third more, with nothing announcing it. Letting it float means a
 * member can watch the price of the thing they are deciding about change under them.
 *
 * Falling immediately is deliberate and asymmetric: a pool that got cheaper should say so at once, because
 * the only person a stale high price protects is us.
 */
export const PRICE_HOLD_DAYS = 7;

export async function recomputePools({ now = null } = {}) {
    const out = [];
    for (const pool of shelfPools()) {
        const stats = await shelfPoolStats(pool).catch((error) => {
            logger.error("pack_pools.stats_failed", error, { pool: pool.key });
            return null;
        });
        if (!stats) continue;

        const reason = closedReason(stats);
        const wanted = priceForEvCents(stats.evCents);
        const prior = await db
            .queryOne(`SELECT price_cents, held_until FROM mkt_pack_pool_state WHERE pool = $1`, [pool.key])
            .catch(() => null);

        // The hold only ever blocks an INCREASE. See the note above.
        const held = prior?.held_until && new Date(prior.held_until) > (now || new Date());
        const rising = prior && wanted > prior.price_cents;
        const priceCents = held && rising ? prior.price_cents : wanted;
        // A price that actually moved starts a fresh hold; one that did not keeps the clock it was on, so a
        // pool hovering on a boundary cannot reset its own hold every night and float anyway.
        const moved = !prior || priceCents !== prior.price_cents;

        await db
            .query(
                `INSERT INTO mkt_pack_pool_state
                    (pool, price_cents, ev_cents, units, lines, median_cents, min_cents, max_cents,
                     top_share_bp, open, closed_reason, held_until, computed_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
                         CASE WHEN $12 THEN NOW() + INTERVAL '${PRICE_HOLD_DAYS} days' ELSE $13 END, NOW())
                 ON CONFLICT (pool) DO UPDATE SET
                     price_cents = EXCLUDED.price_cents, ev_cents = EXCLUDED.ev_cents,
                     units = EXCLUDED.units, lines = EXCLUDED.lines, median_cents = EXCLUDED.median_cents,
                     min_cents = EXCLUDED.min_cents, max_cents = EXCLUDED.max_cents,
                     top_share_bp = EXCLUDED.top_share_bp, open = EXCLUDED.open,
                     closed_reason = EXCLUDED.closed_reason, held_until = EXCLUDED.held_until,
                     computed_at = NOW()`,
                [
                    pool.key, priceCents, stats.evCents, stats.units, stats.lines, stats.medianCents,
                    stats.minCents, stats.maxCents, stats.topShareBp, !reason, reason,
                    moved, prior?.held_until || null,
                ]
            )
            .catch((error) => logger.error("pack_pools.write_failed", error, { pool: pool.key }));

        out.push({ pool: pool.key, priceCents, open: !reason, reason, ...stats });
    }
    logger.info("pack_pools.recomputed", { pools: out.length });
    return out;
}

/**
 * What the screens and the open path read. Never recomputes — see the note on recomputePools.
 *
 * ⚠️ A POOL WITH NO STATE ROW IS CLOSED, NOT FREE. Reading a missing row as "price 0, open" is how a pack
 * ships at no charge the first night a new pool is added and before the cron has run once.
 */
export async function poolStates() {
    const rows = await db.query(`SELECT * FROM mkt_pack_pool_state`).catch(() => []);
    const byKey = new Map(rows.map((r) => [r.pool, r]));
    return shelfPools().map((pool) => {
        const s = byKey.get(pool.key);
        return {
            key: pool.key,
            brand: pool.brand,
            channel: pool.channel,
            priceCents: s?.price_cents ?? 0,
            evCents: s?.ev_cents ?? 0,
            units: s?.units ?? 0,
            lines: s?.lines ?? 0,
            medianCents: s?.median_cents ?? 0,
            minCents: s?.min_cents ?? 0,
            maxCents: s?.max_cents ?? 0,
            topShareBp: s?.top_share_bp ?? 0,
            open: Boolean(s?.open) && (s?.price_cents ?? 0) > 0,
            closedReason: s ? s.closed_reason : "not_computed",
            computedAt: s?.computed_at || null,
        };
    });
}
