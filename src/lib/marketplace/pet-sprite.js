import "server-only";

import { db } from "@/lib/db";
import { COLLECTIBLES } from "@/lib/marketplace/collectibles.js";
import { faceBufferRight, generateImage, storePng } from "@/lib/marketplace/openai-image.js";

// Each pet gets ONE shared 2D battle sprite (not per-member) so the member's active pet can fight beside
// them in the boss scene. Same art universe as the member/boss sprites (transparent, full-body).
const STYLE =
    "2D video-game creature companion sprite, full body, cute but fierce, facing and looking toward the RIGHT side of the image (a right-facing three-quarter view, turned toward the enemy), bold stylized illustration, clean confident outlines, cel-shaded flat vibrant colors, strong readable silhouette, centered, polished RPG game-art style, transparent background, no text, no logo, no watermark, no border.";

export function buildPetSpritePrompt(pet) {
    return `${pet.spritePrompt} — a loyal battle companion. ${STYLE}`;
}

// Map of pet_id -> sprite url for every pet that has one.
export async function getPetSpriteMap() {
    const rows = await db.query(`SELECT pet_id, url FROM mkt_pet_sprite`).catch(() => []);
    return Object.fromEntries(rows.map((r) => [r.pet_id, r.url]));
}

// Generate (or regenerate) one pet's sprite and store it.
export async function generatePetSprite(petId) {
    const pet = COLLECTIBLES.find((p) => p.id === petId);
    if (!pet) throw new Error("Unknown pet");
    const url = await generateImage(buildPetSpritePrompt(pet), { size: "1024x1024", pathPrefix: "marketplace/pet", faceRight: true });
    // Freshly generated art is already right-facing, so stamp it oriented — the repair sweep skips it.
    await db.query(
        `INSERT INTO mkt_pet_sprite (pet_id, url, updated_at, oriented_at) VALUES ($1, $2, NOW(), NOW())
         ON CONFLICT (pet_id) DO UPDATE SET url = $2, updated_at = NOW(), oriented_at = NOW()`,
        [petId, url]
    );
    return url;
}

// One-time repair: flip EXISTING pet sprites that face left so they face right, WITHOUT regenerating the
// art (keeps the exact pets you already like). Resumable — processes un-checked sprites in small batches;
// call repeatedly until `remaining` is 0. Each sprite is stamped oriented_at whether or not it needed a
// flip, so it's never re-checked.
export async function fixPetSpriteOrientations(limit = 6) {
    const batch = await db
        .query(`SELECT pet_id, url FROM mkt_pet_sprite WHERE oriented_at IS NULL ORDER BY updated_at ASC LIMIT $1`, [Math.max(1, Math.min(12, limit))])
        .catch(() => []);
    const results = [];
    for (const row of batch) {
        try {
            const resp = await fetch(row.url);
            if (!resp.ok) { results.push({ id: row.pet_id, error: "fetch_failed" }); continue; }
            const { buffer, flipped } = await faceBufferRight(Buffer.from(await resp.arrayBuffer()));
            let url = row.url;
            if (flipped) url = await storePng(buffer, "marketplace/pet");
            await db.query(`UPDATE mkt_pet_sprite SET url = $2, oriented_at = NOW(), updated_at = NOW() WHERE pet_id = $1`, [row.pet_id, url]);
            results.push({ id: row.pet_id, flipped, url });
        } catch (error) {
            results.push({ id: row.pet_id, error: error?.message || "failed" });
        }
    }
    const remaining = await db.queryOne(`SELECT COUNT(*)::int AS n FROM mkt_pet_sprite WHERE oriented_at IS NULL`).catch(() => null);
    return {
        checked: results.length,
        flipped: results.filter((r) => r.flipped).length,
        remaining: remaining?.n || 0,
        results,
    };
}

// Which pets have a sprite yet (for the admin view).
export async function petSpriteStatus() {
    const have = await getPetSpriteMap();
    return {
        total: COLLECTIBLES.length,
        done: COLLECTIBLES.filter((p) => have[p.id]).length,
        pets: COLLECTIBLES.map((p) => ({ id: p.id, name: p.name, level: p.level, rarity: p.rarity, url: have[p.id] || null })),
    };
}

// Generate up to `limit` MISSING pet sprites (one OpenAI call each). Call repeatedly to fill the set —
// keeps each request short so it never times out. Returns what it did + how many remain.
export async function generateMissingPetSprites(limit = 4) {
    const have = await getPetSpriteMap();
    const missing = COLLECTIBLES.filter((p) => !have[p.id]).slice(0, Math.max(1, Math.min(10, limit)));
    const generated = [];
    for (const p of missing) {
        try {
            const url = await generatePetSprite(p.id);
            generated.push({ id: p.id, url });
        } catch (error) {
            generated.push({ id: p.id, error: error?.message || "failed" });
        }
    }
    const nowHave = Object.keys(have).length + generated.filter((g) => g.url).length;
    return { generated, done: nowHave, total: COLLECTIBLES.length, remaining: Math.max(0, COLLECTIBLES.length - nowHave) };
}
