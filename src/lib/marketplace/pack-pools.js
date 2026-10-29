import "server-only";

import { db } from "@/lib/db";
import { buyBackCents } from "@/lib/marketplace/buyback.js";
import { packCardSubtitle, parsePackCardName } from "@/lib/marketplace/pack-card-name.js";
import { tierForCents } from "@/lib/marketplace/pack-rarity.js";
import { bandOdds, poolUnits, solveAlpha, weightedEvCents, weightedMedianCents } from "@/lib/marketplace/pack-weights.js";
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
        // The house bag, untouched. Every other art below is a RECOLOUR of this file — same crest,
        // different foil — made by scripts/gen-pack-bag-colours.mjs rather than drawn again.
        art: "/images/packs/mystery-bag-drawn-600.webp",
    },
    // ── ⚠️ ONE SHELF, THREE PRICES, AND THE DRAW IS WHAT DIFFERS ────────────────────────────────────────
    // All three Pokémon tiers pull from the SAME 900-odd cards. They are not three bands of stock; they
    // are three sets of ODDS over one set of stock, which is the entire reason this beat banding.
    //
    // Banding by ceiling was modelled first (scripts/pack-odds-100.mjs §4) and it works on paper and is a
    // bad product: to hold a margin, the $5 pack's ceiling lands at $11, so its best possible pull is $10
    // and there is nothing in it to chase. Weighted, the $279 Tyranitar sits in the $5 pack at 1 in 46,605
    // and in the $15 pack at 1 in 930 — same card, same promise, different odds.
    //
    // ⚠️ priceCents IS FIXED HERE AND alpha IS DERIVED. That is the inverse of how this file worked
    // yesterday, when price came from EV. Do not reintroduce priceForEvCents for a tiered pool: it would
    // quietly move a $5 pack to $15 the week a collection comes in.
    //
    // ── ⚠️ floorMult / ceilMult: THE BAND, ON TOP OF THE WEIGHTING ──────────────────────────────────────
    // Luke, 2026-10-27: "for the 5 and 10 dollar respectively their ceiling should be much lower relative
    // to the spend. And the 10 and 15 floor should be slightly higher respectively."
    //
    // Weighting alone left every card in every pack, which is lovely for the dream and wrong for the
    // product: a $5 pack could hand over a $279 Tyranitar. That is not a nice surprise, it is a $5 pack
    // that occasionally costs us $279 — all of the variance measured in pack-odds-100.mjs lives in exactly
    // those pulls — and it makes the $15 tier pointless, because the cheap one could already do everything.
    //
    // So each tier is a BAND as well as a curve. Multiples of the pack price rather than fixed dollars, so
    // the ladder keeps its shape if prices ever move:
    //
    //   $5   floor 0.00x   ceiling  5x  ($25)   — cheap, capped, the volume pack
    //   $10  floor 0.20x   ceiling  6x  ($60)   — a real minimum, a bigger roof
    //   $15  floor 0.25x   ceiling 20x  ($300)  — the only pack that can hit the top of the shelf
    //
    // ⚠️ THE CEILING IS WHAT MAKES THE TIERS WORTH DIFFERENT MONEY, and the floor is what makes the dearer
    // ones feel safe. Alpha still does the EV work INSIDE the band; the band decides what is reachable at
    // all. Both are solved together in recomputePools — change one and the other re-solves.
    // ── ⚠️ THE ART IS KEYED ON PRICE, NOT ON GAME ───────────────────────────────────────────────────────
    // Luke: "the pack color should differ using rarity colors to easily understand which ones are awesome
    // and which are a little less awesome." So Pokémon $5 and Magic $5 share a bag, and the two $15s share
    // a different one. That looks like a loss of distinction and is not: the brand name sits in large type
    // directly under the bag, so the game was never the ambiguous part — which of six packs is the GOOD one
    // was. The colour is spent on the question the screen could not already answer.
    //
    // Green / blue / purple is the uncommon-rare-epic ramp from pack-rarity.js. It deliberately stops short
    // of legendary gold: the crest is gold, and a gold bag turns the wolf into a sticker.
    { key: "pkmn5", brand: "Pokémon $5", channel: "shelf", category: "Pokemon Single Card",
        priceCents: 500, floorMult: 0, ceilMult: 5, art: "/images/packs/mystery-bag-t5-600.webp" },
    { key: "pkmn10", brand: "Pokémon $10", channel: "shelf", category: "Pokemon Single Card",
        priceCents: 1000, floorMult: 0.2, ceilMult: 6, art: "/images/packs/mystery-bag-t10-600.webp" },
    { key: "pkmn15", brand: "Pokémon $15", channel: "shelf", category: "Pokemon Single Card",
        priceCents: 1500, floorMult: 0.25, ceilMult: 20, art: "/images/packs/mystery-bag-t15-600.webp" },
    { key: "mtg5", brand: "Magic $5", channel: "shelf", category: "Magic Single Card",
        priceCents: 500, floorMult: 0, ceilMult: 5, art: "/images/packs/mystery-bag-t5-600.webp" },
    { key: "mtg10", brand: "Magic $10", channel: "shelf", category: "Magic Single Card",
        priceCents: 1000, floorMult: 0.2, ceilMult: 6, art: "/images/packs/mystery-bag-t10-600.webp" },
    { key: "mtg15", brand: "Magic $15", channel: "shelf", category: "Magic Single Card",
        priceCents: 1500, floorMult: 0.25, ceilMult: 20, art: "/images/packs/mystery-bag-t15-600.webp" },
    // ⚠️ YU-GI-OH IS DELIBERATELY ABSENT, AND NOT BECAUSE IT BROKE. Luke, 2026-10-27: "3 for pokemon and
    // magic lets remove yu gi oh." The numbers agree: 52 units averaging $6.58, so a $15 Yu-Gi-Oh pack
    // clears a 56% margin — not a win, a figure somebody works out and resents. It returns when the shelf
    // is deep enough to float a ladder, and since a pool carries no copied card list that is one entry here
    // plus a recompute. Its retired state row is kept (migration 487) so past opens still report.
];

// ── THE MARGIN THE LADDER IS TUNED TO ────────────────────────────────────────────────────────────────────────
// Every tier solves its alpha against this. 15% is not a guess: at 100% sell-back the ONLY margin left is
// price − EV, so this number IS the business. Raising it makes packs meaner; lowering it eats the only
// cushion there is. Model any change with scripts/pack-weights.mjs before touching it.
export const TARGET_MARGIN_BP = 1500;

// ⚠️ THE FIRST OPEN RESHAPES THE DRAW BUT NEVER THE MEAN. Cards below this fraction of the pack price are
// dropped from a member's FIRST open and alpha is re-solved on what remains, landing on the same EV. See the
// long note on solveAlpha — the constraint is alt-farming, which this game has already lived through.
export const FIRST_OPEN_FLOOR_BP = 2500;

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
    // ── ⚠️ A CARD SOMEBODY ALREADY PULLED IS NOT STILL ON THE SHELF ─────────────────────────────────────
    // A member, 2026-10-28: "only the featured $20 pack removes the pulled cards from its list. The others
    // still show the mythic and legendary cards below but doesn't say which ones were pulled and which ones
    // are still available. That info would change my mind about which pack I buy and convince me NOT to buy
    // if I can't tell if something I want is still in there."
    //
    // He is right, and the cause is where the two kinds of pool read from. The featured pool is
    // mystery_bag_cards, whose status flips to 'sold' inside the pull transaction — instantly honest. The
    // $5/$10/$15 ladder reads inventory_feed, which mirrors SQUARE, and Square still counts a pulled card
    // because the physical card is still in the box until a staff member works the pull queue
    // (mkt_pack_pull_task). So between the pull and the shelf-work, the ladder advertises a card that is
    // already in someone's vault.
    //
    // ⚠️ SUBTRACTED, NOT FILTERED. The obvious fix — drop any card that appears in a vault — is wrong, for
    // two reasons the data shows plainly:
    //   · a line can hold more than one copy. Cyndaquil is held by a member AND has 2 on the shelf; one is
    //     spoken for and two are genuinely still pullable.
    //   · a card SOLD BACK returns to the shop on purpose. Four of the five vault cards currently matching
    //     the shelf are sold_back, with reshelve tasks open against them. Filtering on "has ever been in a
    //     vault" would quietly delete cards the shop is deliberately selling again.
    // Only a HELD copy is unavailable, and only that copy.
    const rows = await db
        .query(
            `SELECT f.name, f.price, f.image_url,
                    f.quantity::int AS quantity,
                    COALESCE(v.held, 0)::int AS held
               FROM inventory_feed f
               LEFT JOIN (
                    SELECT square_variation_id, COUNT(*)::int AS held
                      FROM mkt_vault_card
                     WHERE status = 'held'
                     GROUP BY square_variation_id
               ) v ON v.square_variation_id = f.variation_id
              WHERE f.in_stock AND f.quantity > 0 AND NOT f.consigned
                AND f.category_names = $1
              ORDER BY f.price DESC
              LIMIT $2`,
            [pool.category, limit]
        )
        .catch(() => []);
    // ── ⚠️ SHAPE THIS THE SAME WAY A BAG'S CARD IS SHAPED ───────────────────────────────────────────────
    // This used to return name/value/image and nothing else, while a bag's card came out of toPoolCard with
    // a `tier` and a `subtitle` as well. The sheet reads `tierByKey(card.tier)` to colour each row, and
    // tierByKey falls back to COMMON when it is handed undefined — so every card in a shelf pool rendered
    // grey slate, a $258 Jirachi and a $1 bulk rare side by side in the same dead colour, under a blank
    // second line. No error anywhere; the rarity colours simply never applied to the new pools.
    //
    // ⚠️ SO IF YOU ADD A THIRD KIND OF POOL, SHAPE ITS CARDS HERE OR IN toPoolCard — not a third time.
    return rows.map((r) => {
        const valueCents = Math.round(Number(r.price || 0) * 100);
        const parsed = parsePackCardName(r.name || "");
        const left = Math.max(0, (Number(r.quantity) || 0) - (Number(r.held) || 0));
        return {
            id: r.name,
            name: parsed.name || r.name,
            subtitle: packCardSubtitle(r.name || ""),
            valueCents,
            tier: tierForCents(valueCents).key,
            // ⚠️ SHOWN AS CLAIMED, NOT HIDDEN. The member asked for exactly this — "adding an 'All Claimed'
            // tag to the rarities when they are claimed would be great" — and it is the better answer than
            // dropping the row: a pack whose chase card is gone should SAY so, because the whole point of
            // reading the list is deciding whether the thing you want is still in there. A row that silently
            // disappears teaches a member nothing; a row that says CLAIMED answers the question they came
            // with, and answers it against them, which is how a shop earns being believed.
            claimed: left <= 0,
            left,
            // ⚠️ SENT, NOT DERIVED — the same rule toPoolCard states at length. The card detail sheet shows
            //    what a member would actually be paid, and the moment a client multiplies a price by a rate
            //    there are two implementations of one number, one of them in a bundle somebody is still
            //    running from cache. The rate lives in buyback.js and the answer travels with the card.
            sellBackCents: buyBackCents(valueCents),
            imageUrl: r.image_url || null,
        };
    });
}

/**
 * What share of this pool's cards are worth at least what the pack costs, in basis points.
 *
 * ⚠️ IT IS WEIGHTED BY QUANTITY, NOT BY LINE, because that is how the pull works. Four copies of a $20 card
 * are four chances at beating a $15 pack, and counting the LINE once would quietly under-report exactly the
 * cards a member most wants to know about.
 *
 * ⚠️ AND IT COMES OFF THE SAME QUERY THE PULL DOES. The house settled where a real number belongs when it
 * built the chest inspect card: "asked for, on the way to spending, off the same table the roll uses". A
 * hand-maintained odds figure is a figure that drifts from the thing it describes; this one cannot.
 */
export async function beatsPriceBp(pool, priceCents, alpha = 0) {
    if (!pool?.category || !(priceCents > 0)) return null;
    const row = await db
        .queryOne(
            // ── ⚠️ WEIGHTED BY THE DRAW, NOT BY STOCK ───────────────────────────────────────────────────
            // This counted units: "what share of the cards on the shelf beat the price". That was exactly
            // right while every unit was equally likely. It is WRONG the moment a tier has an alpha —
            // the $5 pack and the $15 pack share one shelf, so an unweighted count would print the SAME
            // odds on both, and the figure it printed would be the $15 pack's. On the $5 pack that is a
            // member-facing claim that overstates their chances by roughly a factor of three.
            //
            // The weight here is the same expression the claim rolls on (pack-weights.js). If one of them
            // ever changes, change both — a shown probability that does not match the draw is the worst
            // kind of wrong, because it is checkable.
            `SELECT COALESCE(SUM(quantity * power(GREATEST(price, 0.01), -$3::float)), 0)::float AS wsum,
                    COALESCE(SUM(quantity * power(GREATEST(price, 0.01), -$3::float))
                             FILTER (WHERE price * 100 >= $2), 0)::float AS beats
               FROM inventory_feed
              WHERE in_stock AND quantity > 0 AND NOT consigned
                AND category_names = $1`,
            [pool.category, priceCents, alpha]
        )
        .catch(() => null);
    if (!row || !row.wsum) return null;
    return Math.round((row.beats / row.wsum) * 10000);
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

export async function recomputePools({ now = null, source = "cron" } = {}) {
    const out = [];
    for (const pool of shelfPools()) {
        const stats = await shelfPoolStats(pool).catch((error) => {
            logger.error("pack_pools.stats_failed", error, { pool: pool.key });
            return null;
        });
        if (!stats) continue;

        const reason = closedReason(stats);

        // ── ⚠️ THE PRICE IS GIVEN; alpha IS WHAT THIS FUNCTION SOLVES FOR ──────────────────────────────
        // This used to be the other way round — price = ceil(EV / $5) * $5, with a hold so it could not
        // climb on a member mid-session. A tiered pool has a FIXED price, so the hold has nothing to hold
        // and the lever moved to the draw. If you ever see priceForEvCents() reappear on a tiered pool it
        // will silently reprice a $5 pack to $15 the week a collection lands.
        const priceCents = Number(pool.priceCents) || 0;
        if (!priceCents) { logger.error("pack_pools.no_price", new Error("tiered pool without priceCents"), { pool: pool.key }); continue; }
        const targetEv = Math.round((priceCents * (10000 - TARGET_MARGIN_BP)) / 10000);

        // ⚠️ THE BAND IS APPLIED BEFORE ANYTHING ELSE. alpha, the EV, the median, the odds board and the
        //    claim all have to describe the SAME population, and that population is the banded one. Solving
        //    alpha on the full shelf and then drawing from a band would put the EV off by the whole weight
        //    of everything the band excluded.
        const allUnits = await poolUnits(pool);
        const bandLo = Math.round(priceCents * (Number(pool.floorMult) || 0));
        const bandHi = pool.ceilMult ? Math.round(priceCents * Number(pool.ceilMult)) : Infinity;
        const units = allUnits.filter((u) => u.cents >= bandLo && u.cents <= bandHi);
        const alpha = solveAlpha(units, targetEv);
        // ⚠️ null means even alpha 6 cannot hold the margin — the pool is too rich for this price point.
        //    That CLOSES the tier rather than selling it at a loss, and says so.
        const unreachable = alpha === null;
        const evCents = unreachable ? stats.evCents : Math.round(weightedEvCents(units, alpha));

        // ── THE FIRST-OPEN MAGIC, SOLVED THE SAME WAY ─────────────────────────────────────────────────
        // Drop the duds, re-solve on what is left, land on the SAME EV. The pack is not more generous on
        // the first open, it is less disappointing — which is the only version of this that cannot be
        // farmed, because the mean never moves. See the long note in pack-weights.js.
        // The first-open floor stacks ON the band floor — whichever is higher wins, so a tier that already
        // guarantees $2.00 does not get a "no duds" promise that is weaker than its ordinary pack.
        const floorCents = Math.max(bandLo, Math.round((priceCents * FIRST_OPEN_FLOOR_BP) / 10000));
        const noDuds = units.filter((u) => u.cents >= floorCents);
        const firstAlpha = noDuds.length >= MIN_UNITS ? solveAlpha(noDuds, targetEv) : null;
        // ⚠️ BOTH OR NEITHER. A floor without its matching alpha is a straight EV giveaway; storing 0/0
        //    turns the magic off cleanly and the first open just behaves like any other.
        const firstOk = firstAlpha !== null;

        // ⚠️ THE MEDIAN STORED IS THE WEIGHTED ONE, overwriting the pool-wide flat median. It is a DISPLAY
        //    figure, and the flat version is the same number for all three tiers off one shelf — which on
        //    the carousel face reads as a pricing mistake rather than a ladder.
        const medianCents = unreachable ? stats.medianCents : weightedMedianCents(units, alpha);
        // The odds board. Computed here because recomputePools already holds every unit in memory to solve
        // alpha; doing it per request would be a 900-row scan on the busiest screen in the feature.
        const bands = unreachable ? [] : bandOdds(units, alpha);
        // ⚠️ AND THE BOARD A FIRST-TIMER WILL ACTUALLY PLAY. Same computation, over the population their
        //    draw really uses: the no-duds set, weighted by the first-open alpha. Without this the shelf
        //    served one board to everyone while first opens drew on another — on mtg10 that advertised
        //    "common, 35.1%" to somebody who could not draw a common at all.
        //
        //    Empty when the first-open shape is off, which is also how the reader tells the two cases
        //    apart: no first-open board means there is nothing different to describe.
        const firstBands = (unreachable || !firstOk) ? [] : bandOdds(noDuds, firstAlpha);

        // ⚠️ max/min DESCRIBE THE BAND, NOT THE SHELF. stats comes from shelfPoolStats, which measures the
        //    whole category — so a $5 pack capped at $25 was advertising "MAX PULL $279" on the carousel
        //    face. That is not a stretch, it is a number the pack cannot produce, printed in the largest
        //    type on the screen. The band is the product; the band's extremes are what may be claimed.
        const bandMaxCents = units.length ? Math.max(...units.map((u) => u.cents)) : 0;
        const bandMinCents = units.length ? Math.min(...units.map((u) => u.cents)) : 0;

        await db
            .query(
                `INSERT INTO mkt_pack_pool_state
                    (pool, price_cents, ev_cents, uniform_ev_cents, alpha, first_open_floor_cents,
                     first_open_alpha, units, lines, median_cents, min_cents, max_cents,
                     top_share_bp, open, closed_reason, band_odds, first_open_band_odds, band_lo_cents, band_hi_cents,
                     computed_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19, NOW())
                 ON CONFLICT (pool) DO UPDATE SET
                     price_cents = EXCLUDED.price_cents, ev_cents = EXCLUDED.ev_cents,
                     uniform_ev_cents = EXCLUDED.uniform_ev_cents, alpha = EXCLUDED.alpha,
                     first_open_floor_cents = EXCLUDED.first_open_floor_cents,
                     first_open_alpha = EXCLUDED.first_open_alpha,
                     units = EXCLUDED.units, lines = EXCLUDED.lines, median_cents = EXCLUDED.median_cents,
                     min_cents = EXCLUDED.min_cents, max_cents = EXCLUDED.max_cents,
                     top_share_bp = EXCLUDED.top_share_bp, open = EXCLUDED.open,
                     closed_reason = EXCLUDED.closed_reason, band_odds = EXCLUDED.band_odds,
                     first_open_band_odds = EXCLUDED.first_open_band_odds,
                     band_lo_cents = EXCLUDED.band_lo_cents, band_hi_cents = EXCLUDED.band_hi_cents,
                     computed_at = NOW()`,
                [
                    pool.key, priceCents, evCents, stats.evCents, unreachable ? 0 : alpha,
                    firstOk ? floorCents : 0, firstOk ? firstAlpha : 0,
                    stats.units, stats.lines, medianCents,
                    unreachable ? stats.minCents : bandMinCents, unreachable ? stats.maxCents : bandMaxCents, stats.topShareBp,
                    !reason && !unreachable, unreachable ? "too_rich_for_price" : reason,
                    JSON.stringify(bands),
                    // ⚠️ KEEP THIS IN STEP WITH THE COLUMN LIST. Adding first_open_band_odds to the columns
                    // without a placeholder here made the whole upsert fail with a column/expression count
                    // mismatch — and the .catch below turned that into one log line while recomputePools
                    // reported success and wrote NOTHING for any pool. Pool state would have silently frozen.
                    JSON.stringify(firstBands),
                    bandLo, Number.isFinite(bandHi) ? bandHi : 0,
                ]
            )
            .catch((error) => logger.error("pack_pools.write_failed", error, { pool: pool.key }));

        // ── ⚠️ AND THE SAME NUMBERS, APPENDED RATHER THAN OVERWRITTEN ─────────────────────────────
        // The upsert above is STATE and loses yesterday every night. alpha is derived and moves on its
        // own — pkmn10 has travelled 0.53 -> 0.15 since its first open — and it cannot be recomputed
        // after the fact, because it depends on the exact shelf composition at this instant and nothing
        // snapshots that. A day not written here is a day gone for good.
        //
        // Deliberately UNCONDITIONAL. A row identical to yesterday's is a real observation; writing only
        // on change would make a flat stretch indistinguishable from a recompute that never ran, and the
        // whole table is about six rows a night.
        //
        // margin_bp is stored, not derived on read: TARGET_MARGIN_BP may change, and a margin recomputed
        // from whatever that constant says later would silently rewrite history to agree with it.
        const marginBp = priceCents > 0 ? Math.round(((priceCents - evCents) * 10000) / priceCents) : null;
        await db
            .query(
                `INSERT INTO mkt_pack_pool_history
                    (pool, alpha, first_open_alpha, first_open_floor_cents,
                     price_cents, ev_cents, uniform_ev_cents, margin_bp,
                     units, lines, median_cents, band_lo_cents, band_hi_cents,
                     open, closed_reason, source)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
                [
                    pool.key, unreachable ? 0 : alpha, firstOk ? firstAlpha : 0, firstOk ? floorCents : 0,
                    priceCents, evCents, stats.evCents, marginBp,
                    stats.units, stats.lines, medianCents, bandLo, Number.isFinite(bandHi) ? bandHi : 0,
                    !reason && !unreachable, unreachable ? "too_rich_for_price" : reason, source,
                ]
            )
            // ⚠️ History failing must never take the recompute down with it. The state write above is what
            // the shelf serves from; this is the record of it. Logged loudly, because a silent stop here
            // is exactly the kind of gap that cannot be filled in later.
            .catch((error) => logger.error("pack_pools.history_write_failed", error, { pool: pool.key }));

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
            art: pool.art || null,
            priceCents: s?.price_cents ?? 0,
            evCents: s?.ev_cents ?? 0,
            // ⚠️ THE ODDS LINE NEEDS THIS. Three tiers share one shelf, so alpha is the ONLY thing that
            //    distinguishes them — any figure computed without it describes the $15 pack.
            alpha: Number(s?.alpha ?? 0),
            // The odds board the picker shows. Already JSON in the column; never recomputed per request.
            bandOdds: Array.isArray(s?.band_odds) ? s.band_odds : [],
            firstOpenBandOdds: Array.isArray(s?.first_open_band_odds) ? s.first_open_band_odds : [],
            firstOpenFloorCents: Number(s?.first_open_floor_cents) || 0,
            bandLoCents: Number(s?.band_lo_cents ?? 0),
            bandHiCents: Number(s?.band_hi_cents ?? 0),
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

/**
 * The lowest price on the shelf right now, in cents — what "from $X" on the entry button must say.
 *
 * ⚠️ IT IS NOT pool.priceCents. That is the BAGS pool and it is $20, which is the most expensive thing on
 * offer — so the entry button was advertising the ladder's ceiling as its floor. A member deciding whether to
 * tap was being quoted four times the real entry price, which is the kind of wrong that costs a sale in the
 * direction nobody notices: they do not complain, they just never go in.
 *
 * Open pools only, because a closed pool is not a price anyone can pay.
 */
export async function cheapestOpenPackCents() {
    const row = await db
        .queryOne(`SELECT MIN(price_cents)::int AS cents FROM mkt_pack_pool_state WHERE open`)
        .catch(() => null);
    return Number(row?.cents) > 0 ? Number(row.cents) : null;
}

/**
 * How a pool's curve has moved, newest first.
 *
 * The point of the table is the SHAPE over time, so this returns the raw series and leaves the
 * interpretation to the caller — alpha climbing while units fall is a shelf being picked clean; alpha
 * climbing while units rise is expensive stock arriving. Those are different stories and only the two
 * columns together tell them apart.
 */
export async function poolAlphaHistory({ pool = null, days = 90, limit = 500 } = {}) {
    const rows = await db.query(
        `SELECT pool, computed_at, alpha, first_open_alpha, price_cents, ev_cents, margin_bp,
                units, lines, median_cents, open, closed_reason, source
           FROM mkt_pack_pool_history
          WHERE computed_at > NOW() - ($2 || ' days')::interval
            AND ($1::text IS NULL OR pool = $1)
          ORDER BY computed_at DESC, pool
          LIMIT $3`,
        [pool, String(Math.max(1, Math.min(730, Number(days) || 90))), Math.max(1, Math.min(2000, Number(limit) || 500))],
    ).catch(() => []);
    return (rows || []).map((r) => ({
        pool: r.pool,
        at: r.computed_at,
        alpha: r.alpha == null ? null : Number(r.alpha),
        firstOpenAlpha: r.first_open_alpha == null ? null : Number(r.first_open_alpha),
        priceCents: Number(r.price_cents) || 0,
        evCents: Number(r.ev_cents) || 0,
        // The number the ladder is tuned to, as it stood that day.
        marginBp: r.margin_bp == null ? null : Number(r.margin_bp),
        units: Number(r.units) || 0,
        lines: Number(r.lines) || 0,
        medianCents: Number(r.median_cents) || 0,
        open: Boolean(r.open),
        closedReason: r.closed_reason || null,
        source: r.source || "cron",
    }));
}
