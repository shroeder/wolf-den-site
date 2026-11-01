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

// ── ⚠️ THE MINIMUM ROW SIZE IS FOR BROWSING AND IS WRONG FOR SEARCHING ──────────────────────────────────────
// Six is right for the unfiltered deck: a category holding two cards is a dead end two swipes in, and
// offering it promises depth the shelf does not have.
//
// It is exactly backwards the moment somebody filters. Luke typed "perfect order" and saw NOTHING — it
// matches one booster pack, and a one-item row was dropped on the floor by a rule written for a different
// situation. "charizard" was worse, because it looked like it worked: 20 matches across four categories,
// of which only the 16-item Pokémon row survived, so the Plush, the Accessories and the Sealed quietly
// vanished and nobody could tell.
//
// Narrowing to a handful IS the point of a search. When any filter is on, one match is a row.
const MIN_ITEMS_BROWSE = 6;
const MIN_ITEMS_FILTERED = 1;

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
    vintage: `NULLIF(substring(f.name from '/([0-9]{2,3})'), '')::int <= ${VINTAGE_MAX_DENOM}`,
    modern: `NULLIF(substring(f.name from '/([0-9]{2,3})'), '')::int > ${VINTAGE_MAX_DENOM}`,
};

export const DISCOVER_ERAS = [
    { key: "any", label: "Any era" },
    { key: "vintage", label: "Older sets" },
    { key: "modern", label: "Modern" },
];

export const DISCOVER_PREORDERS = [
    { key: "any", label: "Everything" },
    { key: "only", label: "Pre-orders only" },
];

export const DISCOVER_PRICES = [
    { key: "any", label: "Any price" },
    { key: "under5", label: "Under $5", max: 5 },
    { key: "5to25", label: "$5–$25", min: 5, max: 25 },
    { key: "25to100", label: "$25–$100", min: 25, max: 100 },
    { key: "over100", label: "$100+", min: 100 },
];

// -- THE PRE-ORDER JOIN ----------------------------------------------------------------------------------
// Luke: "the shop should have a skew of looking at pre-orders as well... I want them to be in the right
// square category under Pokemon Sealed and Magic Sealed. But I wonder if there's a way to also flag them."
//
// They ARE flagged, and have been since the mechanic shipped: shop_item_rules.preorder_arrives_on, set
// from the Restocking screen. Not a Square category and not a Square custom attribute -- one column, five
// consumers, nothing to keep in step. Discover joins it so a box that is not in the building yet cannot
// sit in the deck looking exactly like one that is.
//
// LEFT JOIN, because most items have no rules row at all.
const FROM_SQL = `inventory_feed f
       LEFT JOIN shop_item_rules r
              ON r.variation_id = f.variation_id
             AND r.preorder_arrives_on IS NOT NULL
             AND r.preorder_arrived_at IS NULL`;

/** Build the shared WHERE for a deck query. Returns [sqlFragments, params]. */
function baseWhere({ category = null, era = "any", price = "any", q = "", preorder = "any" } = {}) {
    const where = [
        "f.in_stock", "f.quantity > 0", "NOT f.consigned",
        "f.image_url IS NOT NULL", "f.price > 0",
        "f.category_names IS NOT NULL", "f.category_names <> ''",
    ];
    // "only" is a filter; "any" deliberately leaves pre-orders IN the deck rather than hiding them. They
    // are real stock you can really buy -- they are just not here yet, and the card says so.
    if (preorder === "only") where.push("r.preorder_arrives_on IS NOT NULL");
    const params = [];
    if (category) { params.push(category); where.push(`f.category_names = $${params.length}`); }
    if (ERA_SQL[era]) where.push(ERA_SQL[era]);
    const band = DISCOVER_PRICES.find((p) => p.key === price);
    if (band?.min) { params.push(band.min); where.push(`f.price >= $${params.length}`); }
    if (band?.max) { params.push(band.max); where.push(`f.price < $${params.length}`); }
    // ⚠️ ILIKE on a contains-pattern, which cannot use an index — acceptable because the row is already
    //    narrowed to one category (a few hundred rows), and wrong to copy onto an unfiltered table.
    const term = String(q || "").trim().slice(0, 40);
    if (term) { params.push(`%${term}%`); where.push(`f.name ILIKE $${params.length}`); }
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
    // null for ordinary stock; a YYYY-MM-DD string for something not in the building yet.
    preorder: r.preorder_arrives_on
        ? (r.preorder_arrives_on instanceof Date
            ? r.preorder_arrives_on.toISOString().slice(0, 10)
            : String(r.preorder_arrives_on).slice(0, 10))
        : null,
});

/**
 * Categories worth their own row, best-stocked first, each with its first page of items.
 *
 * ⚠️ BUILT FROM WHAT IS ACTUALLY ON THE SHELF, never a hand-written list. A fixed set shows an empty row
 * the week we sell out and misses the category that arrives with a collection.
 */
export async function discoverRows(filters = {}) {
    const [where, params] = baseWhere(filters);
    const filtering = Boolean(
        (filters.q && String(filters.q).trim())
        || (filters.era && filters.era !== "any")
        || (filters.price && filters.price !== "any")
        // AND THE PRE-ORDER FILTER COUNTS. MIN_ITEMS_BROWSE is 6 and there will almost never be six
        // pre-orders in one category, so without this the "Pre-orders only" chip would reliably hand
        // back an empty deck while the shelf had three boxes on it.
        || (filters.preorder && filters.preorder !== "any")
    );
    const minItems = filtering ? MIN_ITEMS_FILTERED : MIN_ITEMS_BROWSE;
    const rows = await db
        .query(
            `WITH pool AS (
                 SELECT f.variation_id, f.name, f.price, f.image_url, f.category_names, f.quantity,
                        r.preorder_arrives_on,
                        COALESCE(f.last_change_at, f.updated_at) AS seen_at
                   FROM ${FROM_SQL}
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
             SELECT variation_id, name, price, image_url, category_names, quantity,
                    preorder_arrives_on, n
               FROM ranked
              WHERE rn <= ${PAGE} AND n >= ${minItems}
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
            `SELECT f.variation_id, f.name, f.price, f.image_url, f.category_names, f.quantity,
                    r.preorder_arrives_on
               FROM ${FROM_SQL}
              WHERE ${where.join(" AND ")}
              ORDER BY COALESCE(f.last_change_at, f.updated_at) DESC NULLS LAST, f.variation_id
              LIMIT $${params.length - 1} OFFSET $${params.length}`,
            params
        )
        .catch(() => []);
    return (rows || []).map(toItem);
}
