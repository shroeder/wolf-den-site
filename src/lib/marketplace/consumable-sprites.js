import "server-only";

import { db } from "@/lib/db";

// Cached {consumableId → url} map of AI consumable sprites (static art). Mirrors item-sprites.js.
let cache = null;
let cachedAt = 0;
const TTL_MS = 5 * 60 * 1000;

export async function consumableSpriteMap() {
    if (cache && Date.now() - cachedAt < TTL_MS) return cache;
    try {
        const rows = await db.query(`SELECT consumable_id, url FROM mkt_consumable_sprite`);
        cache = Object.fromEntries(rows.map((r) => [r.consumable_id, r.url]));
        cachedAt = Date.now();
    } catch {
        cache = cache || {};
    }
    return cache;
}
