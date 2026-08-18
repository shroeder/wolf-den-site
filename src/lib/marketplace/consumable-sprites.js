import "server-only";

import { db } from "@/lib/db";
import { RECIPES } from "@/lib/marketplace/cooking-recipes.js";

// The dish ids, straight off the recipe book — the kitchen sprite table also holds preps, baits and
// crops, and none of those are consumables. Read from the book so it cannot fall behind a new recipe.
const DISH_ID_SET = new Set(RECIPES.filter((r) => r.kind === "dish").map((r) => r.id));

// Cached {consumableId → url} map of AI consumable sprites (static art). Mirrors item-sprites.js.
let cache = null;
let cachedAt = 0;
const TTL_MS = 5 * 60 * 1000;

export async function consumableSpriteMap() {
    if (cache && Date.now() - cachedAt < TTL_MS) return cache;
    try {
        // ── DISHES BRING THEIR OWN ART ───────────────────────────────────────────────────────────────────
        // Every cooked dish is a consumable now, and all 64 of them already had a sprite — under the SAME id,
        // in the kitchen's own table, drawn the day the recipe book shipped. So the two maps are merged rather
        // than the art being copied across: one row per picture, and a re-generated dish sprite cannot drift
        // out of sync with the plate in your stash. Cooking rows are read first so a real consumable sprite of
        // the same id would still win, which is the safer way round.
        const [dishes, rows] = await Promise.all([
            db.query(`SELECT ref, url FROM mkt_cooking_sprite`).catch(() => []),
            db.query(`SELECT consumable_id, url FROM mkt_consumable_sprite`),
        ]);
        cache = Object.fromEntries(dishes.filter((r) => DISH_ID_SET.has(r.ref)).map((r) => [r.ref, r.url]));
        for (const r of rows) cache[r.consumable_id] = r.url;
        cachedAt = Date.now();
    } catch {
        cache = cache || {};
    }
    return cache;
}
