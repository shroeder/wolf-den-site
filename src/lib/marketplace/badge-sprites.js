import "server-only";

import { db } from "@/lib/db";
import { generateImage } from "@/lib/marketplace/openai-image.js";

// AI-generated badge art (one small sprite per badge slug), stored in mkt_badge_sprite. Mirrors the item
// sprite system: sprites are STATIC, so the {slug → url} map is cached in memory for a few minutes and any
// failure returns an empty map (renderers fall back to the badge emoji — art is purely additive).
let cache = null;
let cachedAt = 0;
const TTL_MS = 5 * 60 * 1000;

export async function badgeSpriteMap() {
    if (cache && Date.now() - cachedAt < TTL_MS) return cache;
    try {
        const rows = await db.query(`SELECT slug, url FROM mkt_badge_sprite`);
        cache = Object.fromEntries(rows.map((r) => [r.slug, r.url]));
        cachedAt = Date.now();
    } catch {
        cache = cache || {};
    }
    return cache;
}

// Build a compact, size-appropriate prompt from a badge's own theme. Badges are ALWAYS rendered small, so we
// ask for a bold, simple, centered emblem that reads at ~24px — which also keeps them on-brand and cheap.
function buildBadgePrompt(badge) {
    const theme = [badge.label, badge.description].filter(Boolean).join(" — ");
    return (
        `A small game achievement badge icon representing: "${theme}". ` +
        `Style: a single bold emblem / medallion, clean flat vector look with a subtle metallic sheen, ` +
        `strong simple silhouette, thick readable shapes, centered, filling the frame. ` +
        `Fantasy trading-card-game / RPG achievement aesthetic. Dominant accent color ${badge.color || "#c8a24a"}. ` +
        `Transparent background. NO text, NO letters, NO numbers, NO border ring. Must stay legible shrunk to 24 pixels.`
    );
}

// Generate + store a single badge's sprite. Cheap settings (low quality) since it renders tiny. Best-effort:
// returns the url or null. Clears the map cache so the new art shows on the next read.
export async function generateBadgeSprite(slug) {
    const badge = await db.queryOne(`SELECT slug, label, description, icon, color FROM mkt_badge WHERE slug = $1`, [slug]).catch(() => null);
    if (!badge) return null;
    const prompt = buildBadgePrompt(badge);
    try {
        const url = await generateImage(prompt, { size: "1024x1024", quality: "low", pathPrefix: "marketplace/badges" });
        if (!url) return null;
        await db.query(
            `INSERT INTO mkt_badge_sprite (slug, url, prompt, updated_at) VALUES ($1, $2, $3, NOW())
             ON CONFLICT (slug) DO UPDATE SET url = EXCLUDED.url, prompt = EXCLUDED.prompt, updated_at = NOW()`,
            [slug, url, prompt]
        );
        cache = null; // bust the map cache
        return url;
    } catch {
        return null;
    }
}

// Fill in sprites for badges that don't have one yet, up to `limit` per call (so a run stays small + cheap and
// can be repeated to back-fill the rest). Returns { generated:[slugs], remaining:int }.
export async function generateMissingBadgeSprites(limit = 8) {
    const rows = await db
        .query(
            `SELECT b.slug FROM mkt_badge b
               LEFT JOIN mkt_badge_sprite s ON s.slug = b.slug
              WHERE s.slug IS NULL
              ORDER BY b.sort_order NULLS LAST, b.slug
              LIMIT $1`,
            [Math.max(1, Math.min(50, Number(limit) || 8))]
        )
        .catch(() => []);
    const generated = [];
    for (const r of rows) {
        // Serialize so we never fan out a burst of image calls (cost + rate-limit control).
        const url = await generateBadgeSprite(r.slug);
        if (url) generated.push(r.slug);
    }
    const remainingRow = await db
        .queryOne(`SELECT COUNT(*)::int AS n FROM mkt_badge b LEFT JOIN mkt_badge_sprite s ON s.slug = b.slug WHERE s.slug IS NULL`)
        .catch(() => null);
    return { generated, remaining: remainingRow?.n || 0 };
}
