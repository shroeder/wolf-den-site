import "server-only";

import { db } from "@/lib/db";

// Tag in-stock shop singles with their catalog set name, resolved from the "TCG-<id>" SKU that scanned
// singles carry (id = tcgplayer product id = tcg_cards.id). Lets the shop be filtered by set. Sealed
// product and accessories have no TCG SKU, so they're left untagged (and excluded from the set filter).

const TCG_SKU = /^TCG-(\d+)$/i;

export async function attachSetNames(categories) {
    if (!Array.isArray(categories) || categories.length === 0) {
        return categories;
    }

    const ids = new Set();
    for (const category of categories) {
        for (const item of category.items || []) {
            const match = TCG_SKU.exec(item.sku || "");
            if (match) ids.add(Number(match[1]));
        }
    }
    if (ids.size === 0) {
        return categories;
    }

    const rows = await db.query(
        `SELECT c.id, s.name AS set_name
         FROM tcg_cards c
         JOIN tcg_sets s ON s.id = c.set_id
         WHERE c.id = ANY($1::bigint[])`,
        [Array.from(ids)]
    );
    const setById = new Map(rows.map((row) => [Number(row.id), row.set_name]));

    for (const category of categories) {
        for (const item of category.items || []) {
            const match = TCG_SKU.exec(item.sku || "");
            if (match) {
                const setName = setById.get(Number(match[1]));
                if (setName) item.setName = setName;
            }
        }
    }

    return categories;
}
