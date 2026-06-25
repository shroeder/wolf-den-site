import "server-only";

import { db } from "@/lib/db";

// The public "Just In" feed mirrors the Discord broadcast's gating: a scanned single (TCG-<id>
// SKU, persisted as is_single) only appears at/above this dollar value, so the feed isn't buried
// in bulk commons. Sealed product, supplies, etc. always appear. Higher than the Discord
// threshold (DISCORD_SINGLE_MIN_PRICE) by request.
const FEED_SINGLE_MIN_PRICE = 50;
// Default history shown on the /just-in page. The shop "Just In" tab uses a tighter 24h window
// against live Square stock; this feed is the running record of scan-ins, including restocks and
// items that may have since sold, so a wider window keeps it populated.
const DEFAULT_WINDOW_HOURS = 24 * 7;

/**
 * Recent arrivals (new + restock) from the product_alert_arrivals table — the same table the
 * Discord broadcast reads — deduped to one entry per product, newest first, with low-value singles
 * gated out. Returns plain objects safe to pass to a server component.
 */
export async function listRecentArrivals({
    windowHours = DEFAULT_WINDOW_HOURS,
    singleMinPrice = FEED_SINGLE_MIN_PRICE,
    limit = 120,
} = {}) {
    const rows = await db.query(
        `SELECT a.variation_id, a.item_name, a.kind, a.image_url, a.price, a.is_single,
                a.created_at, cat.name AS category_name
         FROM product_alert_arrivals a
         JOIN product_alert_categories cat ON cat.square_category_id = a.square_category_id
         WHERE a.created_at > NOW() - ($1 || ' hours')::interval
         ORDER BY a.created_at DESC, a.item_name ASC`,
        [String(windowHours)]
    );

    // Dedup to one entry per product. Rows arrive newest-first, so the first row seen for a
    // variation carries its most recent arrival time. A product counts as "new" if any of its
    // arrivals were new (matching the Discord dedup), otherwise "restock".
    const byVariation = new Map();

    for (const row of rows) {
        let entry = byVariation.get(row.variation_id);

        if (!entry) {
            entry = {
                id: row.variation_id,
                name: row.item_name,
                imageUrl: row.image_url || null,
                price: row.price === null ? null : Number(row.price),
                isSingle: row.is_single === true,
                kind: row.kind,
                categoryNames: new Set(),
                createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
            };
            byVariation.set(row.variation_id, entry);
        }

        entry.categoryNames.add(row.category_name);

        if (row.kind === "new") {
            entry.kind = "new";
        }
    }

    // Gate low-value singles: a single only appears at/above the threshold (an unpriced single is
    // treated as below it). Everything else always appears.
    const items = [];

    for (const entry of byVariation.values()) {
        const gatedSingle = entry.isSingle && !(entry.price !== null && entry.price >= singleMinPrice);

        if (gatedSingle) {
            continue;
        }

        items.push({
            id: entry.id,
            name: entry.name,
            imageUrl: entry.imageUrl,
            price: entry.price,
            isSingle: entry.isSingle,
            kind: entry.kind,
            categoryNames: Array.from(entry.categoryNames),
            createdAt: entry.createdAt,
        });

        if (items.length >= limit) {
            break;
        }
    }

    return items;
}

/**
 * Count of distinct recent arrivals after gating — used for the homepage call-to-action. Returns 0
 * on any error so the homepage never breaks on a transient DB hiccup.
 */
export async function countRecentArrivals(options = {}) {
    try {
        const items = await listRecentArrivals(options);

        return items.length;
    } catch {
        return 0;
    }
}
