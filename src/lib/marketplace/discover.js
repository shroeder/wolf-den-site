import "server-only";

import { db } from "@/lib/db";

// ── THE DECK ─────────────────────────────────────────────────────────────────────────────────────────────────
// docs/shop-discover-view.md.
//
//     left/right   ITEMS inside a category   — the mystery-pack picker's gesture, on real stock
//     up/down      CATEGORIES
//
// ⚠️ NO QUIZ AT THE DOOR. An earlier cut asked two questions and used the answers to decide which category
// you landed in, so anyone who had not answered got dropped somewhere arbitrary with no way out. Vertical
// navigation makes the categories the chooser. Filtering is OPT-IN, applied to the row you are already
// looking at — Luke: "it needs to just be an optional filter control, but not ghetto."
//
// ⚠️ A PHOTO IS A HARD REQUIREMENT, NOT A RANKING SIGNAL. An item with no image is a blank screen with a
// price on it. The ordinary shop still lists those; this view cannot render them.
//
// ⚠️ AND `NOT consigned`, same as every other pool query: consigned stock is somebody else's, sold under a
// deal that has nothing to do with our pricing.

const MAX_ROWS = 10;
const MIN_ITEMS = 6;

/** How many items a row ships with, and how many each top-up fetches. */
export const PAGE = 24;

// ── ⚠️ "OLDER SETS" IS A HEURISTIC ON THE PRINTED SET SIZE, AND IT IS LABELLED AS ONE ────────────────────────
// Luke: buyers are "either a collector of old Pokemon cards or not". There is a real set table (tcg_cards +
// tcg_sets) but `inventory_feed` carries no SKU to join on, so the only era signal available here is the
// denominator in the card number: WOTC and e-Card era sets printed small (102, 64, 62, 82, 111, 105, 130),
// and modern sets run to 190-280.
//
// It is therefore approximate, and the UI says "Older sets" rather than "Vintage" so it never claims to be
// a grading. Getting this exact means putting the SKU on the feed — a bigger change than this view, and the
// honest first step is to find out whether anybody uses the filter at all.
const VINTAGE_MAX_DENOM = 165;

/** The era test, as SQL. Pulls the denominator out of "073/113" and compares it. */
const ERA_SQL = {
    // substring() returns NULL when the name has no NNN/NNN at all (promos, sealed) — those fall OUT of
    // both era filters rather than being silently claimed by one.
    vintage: `NULLIF(substring(name from '/([0-9]{2,3})'), '')::int <= ${VINTAGE_MAX_DENOM}`,
    modern: `NULLIF(substring(name from '/([0-9]{2,3})'), '')::int > ${VINTAGE_MAX_DENOM}`,
};

export const DISCOVER_ERAS = [
    { key: "any", label: "Any era" },
    { key: "vintage", label: "Older sets" },
    { key: "modern", label: "Modern" },
];

export const DISCOVER_PRICES = [
    { key: "any", label: "Any price" },
    { key: "under5", label: "Under $5", max: 5 },
    { key: "5to25", label: "$5–$25", min: 5, max: 25 },
    { key: "25to100", label: "$25–$100", min: 25, max: 100 },
    { key: "over100", label: "$100+", min: 100 },
];

/** Build the shared WHERE for a deck query. Returns [sqlFragments, params]. */
function baseWhere({ category = null, era = "any", price = "any", q = "" } = {}) {
    const where = [
        "in_stock", "quantity > 0", "NOT consigned",
        "image_url IS NOT NULL", "price > 0",
        "category_names IS NOT NULL", "category_names <> ''",
    ];
    const params = [];
    if (category) { params.push(category); where.push(`category_names = $${params.length}`); }
    if (ERA_SQL[era]) where.push(ERA_SQL[era]);
    const band = DISCOVER_PRICES.find((p) => p.key === price);
    if (band?.min) { params.push(band.min); where.push(`price >= $${params.length}`); }
    if (band?.max) { params.push(band.max); where.push(`price < $${params.length}`); }
    // ⚠️ ILIKE on a contains-pattern, which cannot use an index — acceptable because the row is already
    //    narrowed to one category (a few hundred rows), and wrong to copy onto an unfiltered table.
    const term = String(q || "").trim().slice(0, 40);
    if (term) { params.push(`%${term}%`); where.push(`name ILIKE $${params.length}`); }
    return [where, params];
}

const toItem = (r) => ({
    id: r.variation_id,
    name: r.name,
    priceCents: Math.round(Number(r.price || 0) * 100),
    imageUrl: r.image_url,
    category: r.category_names,
    // ⚠️ SHOWN ONLY WHEN IT IS LOW. "12 in stock" is noise; "last one" is a reason to decide now.
    last: Number(r.quantity) === 1,
});

/**
 * Categories worth their own row, best-stocked first, each with its first page of items.
 *
 * ⚠️ BUILT FROM WHAT IS ACTUALLY ON THE SHELF, never a hand-written list. A fixed set shows an empty row
 * the week we sell out and misses the category that arrives with a collection.
 */
export async function discoverRows(filters = {}) {
    const [where, params] = baseWhere(filters);
    const rows = await db
        .query(
            `WITH pool AS (
                 SELECT variation_id, name, price, image_url, category_names, quantity,
                        COALESCE(last_change_at, updated_at) AS seen_at
                   FROM inventory_feed
                  WHERE ${where.join(" AND ")}
             ),
             ranked AS (
                 SELECT *,
                        -- Newest first INSIDE a category: random reads as having no opinion, and
                        -- price-descending opens every row on things most people are not buying.
                        ROW_NUMBER() OVER (PARTITION BY category_names ORDER BY seen_at DESC NULLS LAST) AS rn,
                        COUNT(*)    OVER (PARTITION BY category_names) AS n
                   FROM pool
             )
             SELECT variation_id, name, price, image_url, category_names, quantity, n
               FROM ranked
              WHERE rn <= ${PAGE} AND n >= ${MIN_ITEMS}
              ORDER BY n DESC, category_names, rn`,
            params
        )
        .catch(() => []);

    const byCat = new Map();
    for (const r of rows || []) {
        const key = r.category_names;
        if (!byCat.has(key)) {
            if (byCat.size >= MAX_ROWS) continue;
            byCat.set(key, { key, label: key, total: Number(r.n) || 0, items: [] });
        }
        byCat.get(key).items.push(toItem(r));
    }
    return [...byCat.values()];
}

/**
 * The next page of ONE category.
 *
 * ⚠️ THIS EXISTS SO THE MEMBER NEVER SEES A LOADING STATE. Luke: "it needs to be lazy loaded, but the user
 * should never notice it loading. So it should load ahead." The client asks for the next page while there
 * are still several cards to the right of the one on screen, so the fetch finishes long before the swipe
 * that would have needed it. A deck that stalls at the edge is worse than one that loads everything.
 *
 * ⚠️ AND THE ORDER MUST MATCH discoverRows EXACTLY — same seen_at DESC. A different ORDER BY here would
 * duplicate some items and skip others at every page boundary, which looks like the shelf glitching.
 */
export async function discoverPage({ category, offset = 0, ...filters } = {}) {
    if (!category) return [];
    const [where, params] = baseWhere({ ...filters, category });
    params.push(PAGE, Math.max(0, Math.min(2000, Math.round(offset))));
    const rows = await db
        .query(
            `SELECT variation_id, name, price, image_url, category_names, quantity
               FROM inventory_feed
              WHERE ${where.join(" AND ")}
              ORDER BY COALESCE(last_change_at, updated_at) DESC NULLS LAST, variation_id
              LIMIT $${params.length - 1} OFFSET $${params.length}`,
            params
        )
        .catch(() => []);
    return (rows || []).map(toItem);
}
