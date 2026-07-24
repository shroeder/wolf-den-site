import "server-only";

import { db } from "@/lib/db";
import { generateImage } from "@/lib/marketplace/openai-image.js";
import { decorationById, DECORATIONS } from "@/lib/marketplace/decorations.js";

// AI-generated decoration art (one die-cut sprite per catalog decoration), stored in mkt_deco_sprite. Sprites
// are STATIC, so the { deco_id → url } map is cached in memory for a few minutes; any failure returns whatever
// we last had (renderers fall back to the decoration emoji — art is purely additive).
let cache = null;
let cachedAt = 0;
const TTL_MS = 5 * 60 * 1000;

export async function decorationSpriteMap() {
    if (cache && Date.now() - cachedAt < TTL_MS) return cache;
    try {
        const rows = await db.query(`SELECT deco_id, url FROM mkt_deco_sprite`);
        cache = Object.fromEntries(rows.map((r) => [r.deco_id, r.url]));
        cachedAt = Date.now();
    } catch {
        cache = cache || {};
    }
    return cache;
}

// Generate + store one decoration's sprite from its catalog prompt. Medium quality (they render as ~120px scene
// props), resized to 320. Best-effort: returns the url or null. Clears the map cache on success.
export async function generateDecorationSprite(decoId) {
    const def = decorationById(decoId);
    if (!def) return null;
    try {
        const url = await generateImage(def.prompt, { size: "1024x1024", quality: "medium", pathPrefix: "marketplace/decorations", resizeTo: 320 });
        if (!url) return null;
        await db.query(
            `INSERT INTO mkt_deco_sprite (deco_id, url, updated_at) VALUES ($1, $2, NOW())
             ON CONFLICT (deco_id) DO UPDATE SET url = EXCLUDED.url, updated_at = NOW()`,
            [decoId, url]
        );
        cache = null;
        return url;
    } catch {
        return null;
    }
}

// Fill in sprites for catalog decorations that don't have one yet, up to `limit` per call (so a run stays
// bounded + repeatable to back-fill the rest). Returns { generated:[ids], remaining:int, total:int }.
export async function generateMissingDecorationSprites(limit = 6) {
    const have = new Set((await db.query(`SELECT deco_id FROM mkt_deco_sprite`).catch(() => [])).map((r) => r.deco_id));
    const missing = DECORATIONS.map((d) => d.id).filter((id) => !have.has(id));
    const batch = missing.slice(0, Math.max(1, Math.min(25, Number(limit) || 6)));
    const generated = [];
    for (const id of batch) {
        // Serialize so we never fan out a burst of image calls (cost + rate-limit control).
        const url = await generateDecorationSprite(id);
        if (url) generated.push(id);
    }
    return { generated, remaining: Math.max(0, missing.length - generated.length), total: DECORATIONS.length };
}
