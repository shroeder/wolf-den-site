import "server-only";

import { db } from "@/lib/db";
import { COLLECTIBLES } from "@/lib/marketplace/collectibles.js";
import { generateImage } from "@/lib/marketplace/openai-image.js";

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
    const url = await generateImage(buildPetSpritePrompt(pet), { size: "1024x1024", pathPrefix: "marketplace/pet" });
    await db.query(
        `INSERT INTO mkt_pet_sprite (pet_id, url, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (pet_id) DO UPDATE SET url = $2, updated_at = NOW()`,
        [petId, url]
    );
    return url;
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
