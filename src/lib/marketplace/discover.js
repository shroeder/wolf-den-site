import "server-only";

import { db } from "@/lib/db";

// ── THE DECK ─────────────────────────────────────────────────────────────────────────────────────────────────
// docs/shop-discover-view.md §6. One item at a time, full-bleed, swipe for the next. Which makes the ORDER
// the whole feature: a grid forgives a bad sort because the eye skips ahead, and a deck does not — it is
// judged entirely on what it shows third.
//
// ⚠️ A PHOTO IS A HARD REQUIREMENT, NOT A RANKING SIGNAL. An item with no image is unshowable in a full-bleed
// deck — it is a blank screen with a price on it — so it is filtered out rather than demoted. The ordinary
// shop still lists those; this view simply cannot render them.
//
// ⚠️ AND `NOT consigned`, for the same reason every other pool query carries it: consigned stock is somebody
// else's, sold under a deal that has nothing to do with our pricing.

/** The taste answers Discover asks for. Deliberately two — see the doc on why four is a toll. */
export const DISCOVER_GAMES = [
    { key: "pokemon", label: "Pokémon", categories: ["Pokemon Single Card", "Pokemon Sealed"] },
    { key: "magic", label: "Magic", categories: ["Magic Single Card", "Magic Sealed"] },
    { key: "yugioh", label: "Yu-Gi-Oh", categories: ["Yu-Gi-Oh Single", "Yu-Gi-Oh Sealed"] },
];

/**
 * Price bands, as a rough "what do you spend" rather than a filter anybody has to think about.
 *
 * ⚠️ THE TOP BAND HAS NO CEILING AND THE BOTTOM NO FLOOR. A band that excludes the $400 box is a band that
 * makes the shop look smaller than it is to the one member most likely to buy it.
 */
export const DISCOVER_BUDGETS = [
    { key: "cheap", label: "Under $10", maxCents: 1000 },
    { key: "mid", label: "$10 – $50", minCents: 1000, maxCents: 5000 },
    { key: "high", label: "$50+", minCents: 5000 },
    { key: "any", label: "Show me everything" },
];

const gameByKey = (k) => DISCOVER_GAMES.find((g) => g.key === k) || null;
const budgetByKey = (k) => DISCOVER_BUDGETS.find((b) => b.key === k) || null;

/**
 * A page of the deck.
 *
 * `skipIds` is what the session has already swiped past — passed up by the client rather than stored,
 * because a swipe is not a decision worth a database row and a member who reloads should get a fresh deck
 * rather than the tail of yesterday's.
 *
 * ⚠️ ORDERED BY ARRIVAL, NOT BY PRICE OR RANDOM. Random makes the deck feel like it has no opinion and
 * price-descending turns the first ten cards into a wall of things most people are not buying. Newest first
 * is the one order that is both defensible and genuinely what a regular wants — it is the same instinct the
 * Discord drop alerts already serve.
 */
export async function discoverDeck({ games = [], budget = "any", skipIds = [], limit = 30 } = {}) {
    const cats = games.flatMap((k) => gameByKey(k)?.categories || []);
    const band = budgetByKey(budget) || {};

    const where = ["in_stock", "quantity > 0", "NOT consigned", "image_url IS NOT NULL", "price > 0"];
    const params = [];
    if (cats.length) { params.push(cats); where.push(`category_names = ANY($${params.length})`); }
    if (band.minCents) { params.push(band.minCents / 100); where.push(`price >= $${params.length}`); }
    if (band.maxCents) { params.push(band.maxCents / 100); where.push(`price < $${params.length}`); }
    // ⚠️ Capped so a long session cannot grow the parameter into something Postgres refuses to plan.
    const skips = (skipIds || []).filter(Boolean).slice(0, 300);
    if (skips.length) { params.push(skips); where.push(`variation_id <> ALL($${params.length})`); }
    params.push(Math.min(60, Math.max(1, limit)));

    const rows = await db
        .query(
            `SELECT variation_id, name, price, image_url, category_names, quantity
               FROM inventory_feed
              WHERE ${where.join(" AND ")}
              ORDER BY COALESCE(last_change_at, updated_at) DESC NULLS LAST
              LIMIT $${params.length}`,
            params
        )
        .catch(() => []);

    return (rows || []).map((r) => ({
        id: r.variation_id,
        name: r.name,
        priceCents: Math.round(Number(r.price || 0) * 100),
        imageUrl: r.image_url,
        category: r.category_names,
        // ⚠️ SHOWN ONLY WHEN IT IS LOW. "12 in stock" is noise; "last one" is a reason to decide now, and
        //    it is true — these are single-copy singles far more often than not.
        last: Number(r.quantity) === 1,
    }));
}
