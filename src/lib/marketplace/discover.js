import "server-only";

import { db } from "@/lib/db";

// ── THE DECK ─────────────────────────────────────────────────────────────────────────────────────────────────
// docs/shop-discover-view.md. Luke, 2026-10-27, after the first build:
//
//   "I want the new view to be horizontally scrollable, just like mystery packs where you quickly swipe left
//    and right. Also it's putting me in a category before I even get a chance to say what I'm into. You
//    should be able to switch category by just scrolling up and down."
//
// ── ⚠️ TWO AXES, AND THEY MEAN DIFFERENT THINGS ──────────────────────────────────────────────────────────────
//
//     ←  →   move between ITEMS inside a category   (the mystery-pack picker's gesture, applied to real stock)
//     ↑  ↓   move between CATEGORIES
//
// ⚠️ WHICH IS WHY THE QUIZ IS GONE. The first build asked two questions before showing anything, and the
// answer decided which category you landed in — so a member who had not answered got dropped somewhere
// arbitrary and had no way out. With vertical navigation the categories ARE the chooser: you are never
// trapped in one, so there is nothing to ask. A question whose answer the interface can discover by being
// used is a question that should not be asked.
//
// ⚠️ A PHOTO IS A HARD REQUIREMENT, NOT A RANKING SIGNAL. An item with no image is a blank screen with a
// price on it, so it is filtered out rather than demoted. The ordinary shop still lists those.
//
// ⚠️ AND `NOT consigned`, same as every other pool query: consigned stock is somebody else's, sold under a
// deal that has nothing to do with our pricing.

/** How many categories the deck offers, and how deep each one goes. */
const MAX_ROWS = 10;
const PER_ROW = 24;

/**
 * Categories worth their own row, best-stocked first, each with its items.
 *
 * ⚠️ BUILT FROM WHAT IS ACTUALLY ON THE SHELF, never a hand-written list. A fixed set of rows is a set that
 * shows an empty "Yu-Gi-Oh Sealed" the week we sell out of it, and misses the category that arrives when
 * somebody buys a collection. The shop's own `category_names` is the truth.
 *
 * ⚠️ AND A ROW NEEDS ENOUGH ITEMS TO BE WORTH SWIPING. A category holding two cards is a dead end the
 * member hits two swipes in; MIN_ITEMS keeps those out of the deck rather than letting the format promise
 * depth it does not have.
 */
const MIN_ITEMS = 6;

export async function discoverRows({ skipIds = [] } = {}) {
    const skips = (skipIds || []).filter(Boolean).slice(0, 400);

    const rows = await db
        .query(
            `WITH pool AS (
                 SELECT variation_id, name, price, image_url, category_names, quantity,
                        COALESCE(last_change_at, updated_at) AS seen_at
                   FROM inventory_feed
                  WHERE in_stock AND quantity > 0 AND NOT consigned
                    AND image_url IS NOT NULL AND price > 0
                    AND category_names IS NOT NULL AND category_names <> ''
                    ${skips.length ? "AND variation_id <> ALL($1)" : ""}
             ),
             ranked AS (
                 SELECT *,
                        -- Newest first INSIDE a category: random reads as having no opinion, and
                        -- price-descending makes every row open on things most people are not buying.
                        ROW_NUMBER() OVER (PARTITION BY category_names ORDER BY seen_at DESC NULLS LAST) AS rn,
                        COUNT(*)    OVER (PARTITION BY category_names) AS n
                   FROM pool
             )
             SELECT variation_id, name, price, image_url, category_names, quantity, n
               FROM ranked
              WHERE rn <= ${PER_ROW} AND n >= ${MIN_ITEMS}
              ORDER BY n DESC, category_names, rn`,
            skips.length ? [skips] : []
        )
        .catch(() => []);

    const byCat = new Map();
    for (const r of rows || []) {
        const key = r.category_names;
        if (!byCat.has(key)) {
            if (byCat.size >= MAX_ROWS) continue;
            byCat.set(key, { key, label: key, total: Number(r.n) || 0, items: [] });
        }
        byCat.get(key).items.push({
            id: r.variation_id,
            name: r.name,
            priceCents: Math.round(Number(r.price || 0) * 100),
            imageUrl: r.image_url,
            category: r.category_names,
            // ⚠️ SHOWN ONLY WHEN IT IS LOW. "12 in stock" is noise; "last one" is a reason to decide now,
            //    and on a shelf of singles it is true far more often than not.
            last: Number(r.quantity) === 1,
        });
    }
    return [...byCat.values()];
}
