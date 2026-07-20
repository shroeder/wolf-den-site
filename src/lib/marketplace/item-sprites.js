import "server-only";

import { db } from "@/lib/db";

// AI-generated gear art (one sprite per item id), stored in mkt_item_sprite and generated once directly
// via OpenAI. Sprites are STATIC, so we cache the whole {id → url} map in memory for a few minutes rather
// than hitting the DB on every gear render. Any failure returns an empty map — callers fall back to the
// react-icons glyph, so art is purely additive.
let cache = null;
let cachedAt = 0;
const TTL_MS = 5 * 60 * 1000;

export async function itemSpriteMap() {
    if (cache && Date.now() - cachedAt < TTL_MS) return cache;
    try {
        const rows = await db.query(`SELECT item_id, url FROM mkt_item_sprite`);
        cache = Object.fromEntries(rows.map((r) => [r.item_id, r.url]));
        cachedAt = Date.now();
    } catch {
        cache = cache || {};
    }
    return cache;
}

export async function itemSpriteFor(id) {
    const m = await itemSpriteMap();
    return m[id] || null;
}
