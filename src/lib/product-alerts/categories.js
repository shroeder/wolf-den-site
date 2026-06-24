import "server-only";

import { db } from "@/lib/db";

/**
 * Upsert the public category list from a Square categoryId -> name map (as produced by the
 * inventory scan). Existing rows keep their `visible`/`sort` overrides; only the display name and
 * timestamp are refreshed. Categories that disappear from Square are left in place (harmless — they
 * simply stop receiving arrivals) so historical subscriptions don't break.
 */
export async function syncCategoriesFromSquare(categoryMap) {
    for (const [squareCategoryId, name] of categoryMap) {
        if (!squareCategoryId || !name) {
            continue;
        }

        await db.query(
            `INSERT INTO product_alert_categories (square_category_id, name, updated_at)
             VALUES ($1, $2, NOW())
             ON CONFLICT (square_category_id) DO UPDATE SET
                name = EXCLUDED.name,
                updated_at = NOW()`,
            [squareCategoryId, name]
        );
    }
}

/**
 * Categories shown on the public signup form, alphabetical within the staff-controlled sort order.
 */
export async function listVisibleCategories() {
    const rows = await db.query(
        `SELECT square_category_id, name
         FROM product_alert_categories
         WHERE visible = TRUE
         ORDER BY sort ASC, name ASC`
    );

    return rows.map((row) => ({ id: row.square_category_id, name: row.name }));
}

/**
 * Filter an arbitrary list of category ids down to those that currently exist, so a subscriber
 * can't follow a category that was never synced (or was removed).
 */
export async function filterKnownCategoryIds(categoryIds) {
    const ids = Array.from(new Set((categoryIds || []).map((id) => String(id || "").trim()).filter(Boolean)));

    if (!ids.length) {
        return [];
    }

    const rows = await db.query(
        `SELECT square_category_id FROM product_alert_categories WHERE square_category_id = ANY($1::text[])`,
        [ids]
    );

    return rows.map((row) => row.square_category_id);
}
