import "server-only";

import { db } from "@/lib/db";
import { housePrompt } from "@/lib/marketplace/art-style.js";
import { COLLECTIBLES, collectibleById } from "@/lib/marketplace/collectibles.js";
import { faceBufferRight, generateImage, storePng, detectFacing } from "@/lib/marketplace/openai-image.js";

// Each pet gets ONE shared 2D battle sprite (not per-member) so the member's active pet can fight beside
// them in the boss scene. Same art universe as the member/boss sprites (transparent, full-body).
// Pose/framing direction only — the LOOK comes from the shared house style, so pets, gear and decorations all
// read as one set. Facing right matters mechanically: the sprite fights beside you toward the enemy.
const POSE =
    "Full body, cute but fierce, facing and looking toward the RIGHT side of the image — a right-facing " +
    "three-quarter view, turned toward the enemy.";

export function buildPetSpritePrompt(pet) {
    return housePrompt(`${pet.spritePrompt} — a loyal battle companion.`, { extra: POSE });
}

// Per-LEVEL evolution flavor (Lv1 = the plain base prompt above). Each tier tells the model to make the SAME
// creature look progressively more powerful/awesome, so a member watches their pet visibly evolve 1→5.
export const PET_SPRITE_LEVELS = [2, 3, 4, 5];
const LEVEL_EVOLUTION = {
    2: "It has grown a little stronger — a faint magical aura and a more confident, battle-ready stance.",
    3: "It is battle-hardened and clearly more powerful — glowing energy, subtle magical runes or markings, a fiercer posture.",
    4: "It has reached an EPIC evolved form — radiant energy swirling around it, dramatic elemental effects, a larger imposing heroic silhouette.",
    5: "It has reached its ULTIMATE LEGENDARY form — a blazing powerful aura, crackling energy, maximum intensity, awe-inspiring and majestic.",
};
export function buildPetSpriteLevelPrompt(pet, level) {
    const evo = LEVEL_EVOLUTION[level] || "";
    return housePrompt(
        `${pet.spritePrompt} — a loyal battle companion, power level ${level} of 5. ${evo} Keep it recognizably the SAME creature, just more powerful.`,
        { extra: POSE }
    );
}

// Map of pet_id -> sprite url for every pet that has one.
export async function getPetSpriteMap() {
    const rows = await db.query(`SELECT pet_id, url FROM mkt_pet_sprite`).catch(() => []);
    return Object.fromEntries(rows.map((r) => [r.pet_id, r.url]));
}

// Map of pet_id -> { url, flip }. flip=true means the sprite faces the wrong way and should be mirrored at
// render time (scaleX(-1)). Used everywhere a pet sprite is shown so they all face right.
export async function getPetSpriteData() {
    const rows = await db.query(`SELECT pet_id, url, flip FROM mkt_pet_sprite`).catch(() => []);
    return Object.fromEntries(rows.map((r) => [r.pet_id, { url: r.url, flip: r.flip === true }]));
}

// Owner override: hand-set a pet sprite's flip flag (marks it checked so the AI pass won't overwrite it).
export async function setPetSpriteFlip(petId, flip) {
    await db.query(`UPDATE mkt_pet_sprite SET flip = $2, facing_checked_at = NOW() WHERE pet_id = $1`, [petId, Boolean(flip)]).catch(() => {});
    return { ok: true };
}

// AI read-pass: for pets whose sprite hasn't been facing-checked, look at the stored art and set flip=true
// if it faces LEFT (we want everyone facing right, toward the boss). Doesn't touch the image. Small batches.
export async function detectPetSpriteFacings(limit = 6) {
    const rows = await db
        .query(`SELECT pet_id, url FROM mkt_pet_sprite WHERE facing_checked_at IS NULL AND url IS NOT NULL ORDER BY updated_at ASC LIMIT $1`, [Math.max(1, Math.min(12, limit))])
        .catch(() => []);
    const results = [];
    for (const r of rows) {
        const facing = await detectFacing(r.url).catch(() => "unknown");
        const flip = facing === "left";
        await db.query(`UPDATE mkt_pet_sprite SET flip = $2, facing_checked_at = NOW() WHERE pet_id = $1`, [r.pet_id, flip]).catch(() => {});
        results.push({ id: r.pet_id, facing, flip });
    }
    const remaining = await db.queryOne(`SELECT COUNT(*)::int AS n FROM mkt_pet_sprite WHERE facing_checked_at IS NULL AND url IS NOT NULL`).catch(() => null);
    return { checked: results.length, flipped: results.filter((r) => r.flip).length, remaining: remaining?.n || 0, results };
}

// Generate (or regenerate) one pet's sprite and store it.
export async function generatePetSprite(petId) {
    const pet = COLLECTIBLES.find((p) => p.id === petId);
    if (!pet) throw new Error("Unknown pet");
    const url = await generateImage(buildPetSpritePrompt(pet), { size: "1024x1024", pathPrefix: "marketplace/pet", faceRight: true, deHalo: true, meta: { origin: "cron", subject: pet?.id || null, label: `Pet sprite — ${pet?.name || pet?.id || "?"}` } });
    // Freshly generated art is already right-facing, so stamp it oriented — the repair sweep skips it.
    await db.query(
        `INSERT INTO mkt_pet_sprite (pet_id, url, updated_at, oriented_at) VALUES ($1, $2, NOW(), NOW())
         ON CONFLICT (pet_id) DO UPDATE SET url = $2, updated_at = NOW(), oriented_at = NOW(), flip = FALSE, facing_checked_at = NULL`,
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
    const have = await getPetSpriteData();
    return {
        total: COLLECTIBLES.length,
        done: COLLECTIBLES.filter((p) => have[p.id]).length,
        pets: COLLECTIBLES.map((p) => ({ id: p.id, name: p.name, level: p.level, rarity: p.rarity, url: have[p.id]?.url || null, flip: have[p.id]?.flip || false })),
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

// ── Per-level sprites (Lv2–5) ──────────────────────────────────────────────────────────────────────

// pet_id -> { 2: {url,flip}, 3: {...}, ... } for the evolved (Lv2–5) sprites that exist.
export async function getPetSpriteLevelData() {
    const rows = await db.query(`SELECT pet_id, level, url, flip FROM mkt_pet_sprite_level WHERE url IS NOT NULL`).catch(() => []);
    const out = {};
    for (const r of rows) {
        if (!out[r.pet_id]) out[r.pet_id] = {};
        out[r.pet_id][r.level] = { url: r.url, flip: r.flip === true };
    }
    return out;
}

// Full sprite set for ONE pet (admin drill-in): the base (Lv1) plus every evolved Lv2–5 sprite it has,
// each with its own flip flag. Missing levels come back with url:null so the UI can show a gap.
export async function petSpriteSet(petId) {
    const id = String(petId || "").trim();
    if (!id) return { petId: id, name: id, rarity: null, levels: [] };
    const def = collectibleById(id);
    const [base, evo] = await Promise.all([
        db.queryOne(`SELECT url, flip FROM mkt_pet_sprite WHERE pet_id = $1`, [id]).catch(() => null),
        db.query(`SELECT level, url, flip FROM mkt_pet_sprite_level WHERE pet_id = $1`, [id]).catch(() => []),
    ]);
    const byLevel = new Map((evo || []).map((r) => [Number(r.level), r]));
    const levels = [1, 2, 3, 4, 5].map((n) => {
        const row = n === 1 ? base : byLevel.get(n);
        return { level: n, url: row?.url || null, flip: row?.flip === true };
    });
    return { petId: id, name: def?.name || id, rarity: def?.rarity || null, levels };
}

// Pure: given a pet's base sprite ({url,flip}) + its level map, pick the art for `level` — the highest
// evolved sprite at or below `level`, falling back to the base (Lv1). Used by every render site.
export function pickPetSpriteForLevel(base, levelMap, level) {
    const lv = Math.max(1, Math.min(5, Math.floor(Number(level) || 1)));
    for (let n = lv; n >= 2; n -= 1) {
        if (levelMap && levelMap[n]?.url) return levelMap[n];
    }
    return base || null;
}

// The level-appropriate sprite {url, flip} for ONE pet at a given level (base Lv1 → evolved 2–5). Used by the
// level-up celebration so it shows the sprite you JUST evolved into, not the Lv1 base.
export async function getPetLevelSprite(petId, level) {
    const [base, levels] = await Promise.all([getPetSpriteData(), getPetSpriteLevelData()]);
    return pickPetSpriteForLevel(base[petId], levels[petId], level) || null;
}

// Generate one (pet, level) evolved sprite (level 2–5) and store it.
export async function generatePetSpriteLevel(petId, level) {
    const lv = Math.floor(Number(level) || 0);
    if (!PET_SPRITE_LEVELS.includes(lv)) throw new Error("Level must be 2–5");
    const pet = COLLECTIBLES.find((p) => p.id === petId);
    if (!pet) throw new Error("Unknown pet");
    const url = await generateImage(buildPetSpriteLevelPrompt(pet, lv), { size: "1024x1024", pathPrefix: "marketplace/pet", faceRight: true, deHalo: true, meta: { origin: "cron", subject: pet?.id || null, label: `Pet level art — ${pet?.name || pet?.id || "?"} lv${lv}` } });
    await db.query(
        `INSERT INTO mkt_pet_sprite_level (pet_id, level, url, updated_at) VALUES ($1, $2, $3, NOW())
         ON CONFLICT (pet_id, level) DO UPDATE SET url = $3, updated_at = NOW(), flip = FALSE, facing_checked_at = NULL`,
        [petId, lv, url]
    );
    return url;
}

// Owner override: hand-set an evolved sprite's flip flag.
export async function setPetSpriteLevelFlip(petId, level, flip) {
    await db.query(`UPDATE mkt_pet_sprite_level SET flip = $3, facing_checked_at = NOW() WHERE pet_id = $1 AND level = $2`, [petId, Math.floor(Number(level) || 0), Boolean(flip)]).catch(() => {});
    return { ok: true };
}

// Generate up to `limit` MISSING evolved sprites (Lv2–5), across all pets that already have a base sprite.
// One OpenAI call each; call repeatedly (bulk backfill) until remaining hits 0.
export async function generateMissingPetSpriteLevels(limit = 4) {
    const [base, levels] = await Promise.all([getPetSpriteMap(), getPetSpriteLevelData()]);
    // Only pets that HAVE a base (Lv1) sprite get evolved tiers — the base is the starting point.
    const wanted = [];
    for (const p of COLLECTIBLES) {
        if (!base[p.id]) continue;
        for (const lv of PET_SPRITE_LEVELS) {
            if (!levels[p.id]?.[lv]?.url) wanted.push({ petId: p.id, level: lv });
        }
    }
    const totalWanted = COLLECTIBLES.filter((p) => base[p.id]).length * PET_SPRITE_LEVELS.length;
    const batch = wanted.slice(0, Math.max(1, Math.min(8, limit)));
    const generated = [];
    for (const w of batch) {
        try {
            const url = await generatePetSpriteLevel(w.petId, w.level);
            generated.push({ id: w.petId, level: w.level, url });
        } catch (error) {
            generated.push({ id: w.petId, level: w.level, error: error?.message || "failed" });
        }
    }
    const remaining = Math.max(0, wanted.length - generated.filter((g) => g.url).length);
    return { generated, done: totalWanted - remaining, total: totalWanted, remaining };
}

// AI read-pass: mark left-facing evolved sprites so they render mirrored. Small batches; resumable.
export async function detectPetSpriteLevelFacings(limit = 6) {
    const rows = await db
        .query(`SELECT pet_id, level, url FROM mkt_pet_sprite_level WHERE facing_checked_at IS NULL AND url IS NOT NULL ORDER BY updated_at ASC LIMIT $1`, [Math.max(1, Math.min(12, limit))])
        .catch(() => []);
    for (const r of rows) {
        const facing = await detectFacing(r.url).catch(() => "unknown");
        await db.query(`UPDATE mkt_pet_sprite_level SET flip = $3, facing_checked_at = NOW() WHERE pet_id = $1 AND level = $2`, [r.pet_id, r.level, facing === "left"]).catch(() => {});
    }
    const remaining = await db.queryOne(`SELECT COUNT(*)::int AS n FROM mkt_pet_sprite_level WHERE facing_checked_at IS NULL AND url IS NOT NULL`).catch(() => null);
    return { checked: rows.length, remaining: remaining?.n || 0 };
}

// Per-level status for the admin screen: each pet with which of its Lv2–5 sprites exist (+ flip).
export async function petSpriteLevelStatus() {
    const [base, levels] = await Promise.all([getPetSpriteData(), getPetSpriteLevelData()]);
    const withBase = COLLECTIBLES.filter((p) => base[p.id]);
    const totalWanted = withBase.length * PET_SPRITE_LEVELS.length;
    let done = 0;
    const pets = COLLECTIBLES.map((p) => {
        const lv = {};
        for (const n of PET_SPRITE_LEVELS) {
            const e = levels[p.id]?.[n] || null;
            if (e?.url) done += 1;
            lv[n] = e ? { url: e.url, flip: e.flip } : null;
        }
        return { id: p.id, name: p.name, rarity: p.rarity, baseUrl: base[p.id]?.url || null, levels: lv };
    });
    return { total: totalWanted, done, remaining: Math.max(0, totalWanted - done), pets };
}
