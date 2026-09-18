import "server-only";

import { db } from "@/lib/db";
import { ascendedIdOf } from "@/lib/marketplace/items.js";

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
        // ── A RAISED PIECE WEARS ITS PARENT'S ART ────────────────────────────────────────────────────
        // An Ascended twin is a distinct item id with no sprite row of its own, and every gear card in the
        // game falls back to a react-icons glyph when the map misses — so without this a member who spent
        // the rarest drop in the game would watch their painted sword turn into a line drawing.
        //
        // Done here rather than by copying 260 rows into mkt_item_sprite, because copies go stale: repaint a
        // base item's art and the copy still points at the old picture. Mapped at read time, the twin simply
        // shows whatever its parent shows today. `||` so a real row always wins, leaving room to paint
        // bespoke ascended art later without touching this.
        for (const [id, url] of Object.entries({ ...cache })) {
            const twin = ascendedIdOf(id);
            if (!cache[twin]) cache[twin] = url;
        }
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
