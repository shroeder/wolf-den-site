import "server-only";

import { db } from "@/lib/db";
import { buyBackCents } from "@/lib/marketplace/buyback.js";
import { PACK_TIERS } from "@/lib/marketplace/pack-rarity.js";

// ── HOW A WEIGHTED PULL WORKS ────────────────────────────────────────────────────────────────────────────────
// docs: scripts/pack-weights.mjs is the model this came out of and the thing to run before retuning anything.
//
//     weight(card) ∝ quantity / (value_in_dollars ^ alpha)
//
// alpha = 0 is a uniform draw — every unit equally likely, which is what the pools did before tiers. Raising
// alpha makes expensive cards rarer in proportion to how expensive they are, and because no weight is ever
// zero, EVERY card stays reachable in EVERY pack.
//
// That last property is the whole argument for weighting over banding. Banding by ceiling also holds a margin,
// but to do it the $5 pack's ceiling lands around $11 — its best possible pull is $10, so there is nothing in
// it to chase. Weighted, the same $279 card sits in the $5 pack at 1 in 46,605 and in the $15 pack at 1 in
// 930. Same shelf, same dream, different odds.
//
// ⚠️ QUANTITY MULTIPLIES THE WEIGHT. Four copies of a card really are four chances at it. Dropping that would
// make a line the shop happens to hold one of artificially rare purely because of how we bought it.

/** What a card actually costs us to hand back, which is what the EV has to be measured against. */
const payoutFor = (marketCents) => buyBackCents(marketCents);

/**
 * EV of a weighted draw over `cards` ([{cents, qty}]), in cents.
 *
 * ⚠️ MEASURED AGAINST THE PAYOUT, NOT RAW MARKET. The quarter round-up and the $1 floor in buyback.js both
 * run in the member's favour, so an EV built on raw market flatters the house by a few cents a pack — which
 * is a material slice of a $0.75 margin.
 */
export function weightedEvCents(cards, alpha) {
    let wsum = 0;
    let esum = 0;
    for (const c of cards) {
        const dollars = Math.max(0.01, c.cents / 100);
        const w = c.qty * Math.pow(dollars, -alpha);
        wsum += w;
        esum += w * payoutFor(c.cents);
    }
    return wsum > 0 ? esum / wsum : 0;
}

/**
 * The alpha that lands the weighted EV on `targetCents`, or null when even a brutal curve cannot get there.
 *
 * EV is monotonically decreasing in alpha, so plain bisection is exact enough and cheap. Returns 0 when the
 * pool already clears the target uniformly — a tier that needs no weighting should not get any, because every
 * point of alpha thins the tail that makes the pack worth opening.
 */
export function solveAlpha(cards, targetCents) {
    if (!cards.length) return null;
    if (weightedEvCents(cards, 0) <= targetCents) return 0;
    const HI = 6;
    if (weightedEvCents(cards, HI) > targetCents) return null;
    let lo = 0;
    let hi = HI;
    for (let i = 0; i < 48; i += 1) {
        const mid = (lo + hi) / 2;
        if (weightedEvCents(cards, mid) > targetCents) lo = mid;
        else hi = mid;
    }
    return Math.round(((lo + hi) / 2) * 10000) / 10000;
}

/** Chance of drawing a card worth at least `cents` under these weights — for the odds the screen shows. */
export function chanceAtLeast(cards, alpha, cents) {
    let wsum = 0;
    let hit = 0;
    for (const c of cards) {
        const w = c.qty * Math.pow(Math.max(0.01, c.cents / 100), -alpha);
        wsum += w;
        if (c.cents >= cents) hit += w;
    }
    return wsum > 0 ? hit / wsum : 0;
}

/**
 * Every unit in a pool, as the weighter wants it.
 *
 * ⚠️ THE SAME FILTER THE CLAIM USES — in_stock, quantity > 0, NOT consigned. A pool modelled on a different
 * population than the one it draws from is a model of nothing, and `NOT consigned` in particular is the
 * difference between pricing off our own stock and pulling from a consignor's.
 */
export async function poolUnits(pool) {
    if (!pool?.category) return [];
    const rows = await db
        .query(
            `SELECT price, quantity
               FROM inventory_feed
              WHERE in_stock AND quantity > 0 AND NOT consigned
                AND category_names = $1`,
            [pool.category]
        )
        .catch(() => []);
    return (rows || [])
        .map((r) => ({ cents: Math.round(Number(r.price || 0) * 100), qty: Math.min(Number(r.quantity) || 0, 50) }))
        .filter((c) => c.cents > 0 && c.qty > 0);
}

/**
 * ── PICK ONE, WEIGHTED ───────────────────────────────────────────────────────────────────────────────────────
 * Returns the chosen variation_id, or null.
 *
 * ⚠️ THE ROLL HAPPENS IN POSTGRES, NOT HERE, AND THAT IS NOT AN OPTIMISATION. Pulling 900 rows into the
 * handler to roll locally would mean the candidate set is a snapshot taken before the roll, and the shop
 * counter sells out of this same shelf while a member is mid-animation. Rolling in the query makes the
 * population and the draw the same instant.
 *
 * The expression is the standard weighted-random trick: order by random()^(1/weight) descending, take one.
 * It is exactly equivalent to cumulative-sum sampling and needs no second pass.
 *
 * ⚠️ AND `floorCents` IS THE FIRST-OPEN MAGIC. It drops the duds from the candidate set entirely; the caller
 * must pass the matching first_open_alpha, which was solved against the SAME filtered set. Passing one
 * without the other quietly changes the EV of the pack.
 */
export async function pickWeightedVariation({ pool, alpha, floorCents = 0, ceilCents = 0 }) {
    if (!pool?.category) return null;
    const a = Number.isFinite(Number(alpha)) ? Number(alpha) : 0;
    const row = await db
        .queryOne(
            `SELECT variation_id, name, price, image_url
               FROM inventory_feed
              WHERE in_stock AND quantity > 0 AND NOT consigned
                AND category_names = $1
                AND price * 100 >= $2
                -- ⚠️ 0 MEANS NO CEILING, not a ceiling of zero. A tier with ceilMult unset must still be
                --    able to draw the top of the shelf; writing this as a plain <= would empty the pool.
                AND ($4 <= 0 OR price * 100 <= $4)
              ORDER BY power(random(), 1.0 / GREATEST(quantity * power(GREATEST(price, 0.01), -$3::float), 1e-9)) DESC
              LIMIT 1`,
            [pool.category, Math.max(0, Math.round(floorCents)), a, Math.max(0, Math.round(ceilCents))]
        )
        .catch(() => null);
    return row || null;
}

/**
 * Has this member had their first open yet?
 *
 * ⚠️ PER MEMBER, ACROSS ALL POOLS — never per pool. Per-pool would hand the magic out six times over, which
 * is six times the exposure and an obvious thing to work: open the cheap tier in every pool, sell back,
 * repeat. The first open is the first open.
 */
export async function hasOpenedBefore(buyerId) {
    if (!buyerId) return true;
    const row = await db
        .queryOne(`SELECT 1 AS yes FROM mkt_pack_first_open WHERE buyer_id = $1`, [buyerId])
        .catch(() => ({ yes: 1 }));   // ⚠️ on error assume they HAVE — never hand out magic on a failed read
    return Boolean(row);
}

/** Record that the magic has been spent. Called when a reveal COMPLETES, not when an open starts. */
export async function markFirstOpen({ buyerId, packOpenId, pool }) {
    if (!buyerId) return;
    await db
        .query(
            `INSERT INTO mkt_pack_first_open (buyer_id, pack_open_id, pool) VALUES ($1, $2, $3)
             ON CONFLICT (buyer_id) DO NOTHING`,
            [buyerId, packOpenId || null, pool || null]
        )
        .catch(() => {});
}

/**
 * The median of a WEIGHTED draw — the card a member of this tier typically walks away with.
 *
 * ⚠️ WITHOUT THIS THE THREE TIERS ARE INDISTINGUISHABLE ON THE CAROUSEL. They share one shelf, so unit
 * count, max pull and the flat median are identical across all three — the face would show the same three
 * numbers over a $5, a $10 and a $15 pack and look like a pricing mistake. The weighted median is the one
 * headline figure that honestly separates them, and it separates them in the direction a buyer expects:
 * pay more, typically get more.
 *
 * ⚠️ AND IT IS NOT THE EV. The EV is dragged upward by a tail almost nobody experiences; the median is what
 * the pack usually does. Printing EV on the face would be a true number that over-promises every time.
 */
export function weightedMedianCents(cards, alpha) {
    if (!cards.length) return 0;
    const sorted = [...cards].sort((a, b) => a.cents - b.cents);
    let total = 0;
    for (const c of sorted) total += c.qty * Math.pow(Math.max(0.01, c.cents / 100), -alpha);
    let run = 0;
    for (const c of sorted) {
        run += c.qty * Math.pow(Math.max(0.01, c.cents / 100), -alpha);
        if (run >= total / 2) return c.cents;
    }
    return sorted[sorted.length - 1].cents;
}

/**
 * ── WHAT THIS PACK ACTUALLY PAYS, BY RARITY BAND ─────────────────────────────────────────────────────────────
 * The probability of landing in each pack-rarity tier under these weights, plus the value range that tier
 * covers IN THIS POOL.
 *
 * ⚠️ THIS IS THE ONLY HONEST DIFFERENCE BETWEEN THE TIERS. All three Pokémon packs draw from one shelf, so
 * their unit count, their best card and their card list are identical — a screen without these numbers shows
 * three identical packs at three prices and looks like a pricing mistake. Luke, seeing a competitor do it:
 * "otherwise all the packs seem the same."
 *
 * ⚠️ THE BANDS ARE pack-rarity.js AND THE COLOURS COME WITH THEM. The house already teaches those six names
 * and colours through the reveal flash and the vault; a second vocabulary here would mean the colour a
 * member learns while choosing is not the colour that flashes when the card lands.
 *
 * ⚠️ AND THE RANGE IS THE REAL ONE, not the band's definition. A tier whose table says "$60+" but whose
 * richest card in this pool is $114 should say $60–$114. Printing the open-ended definition invites a
 * member to imagine a ceiling the shelf does not have.
 */
export function bandOdds(cards, alpha) {
    if (!cards.length) return [];
    let wsum = 0;
    for (const c of cards) wsum += c.qty * Math.pow(Math.max(0.01, c.cents / 100), -alpha);
    if (!wsum) return [];

    return PACK_TIERS.map((tier, i) => {
        const next = PACK_TIERS[i + 1];
        const lo = tier.min;
        const hi = next ? next.min - 1 : Infinity;
        let w = 0;
        let min = Infinity;
        let max = 0;
        for (const c of cards) {
            if (c.cents < lo || c.cents > hi) continue;
            w += c.qty * Math.pow(Math.max(0.01, c.cents / 100), -alpha);
            if (c.cents < min) min = c.cents;
            if (c.cents > max) max = c.cents;
        }
        return {
            key: tier.key,
            label: tier.label,
            glow: tier.glow,
            // Basis points, so a 1-in-900 band is not rounded away to "0%".
            bp: Math.round((w / wsum) * 10000),
            minCents: Number.isFinite(min) ? min : 0,
            maxCents: max,
        };
    // ⚠️ EMPTY BANDS ARE DROPPED, not shown at 0%. A row reading "Mythic 0%" is a promise the pool cannot
    //    keep, and it is the row a member's eye goes to first.
    }).filter((b) => b.bp > 0);
}
