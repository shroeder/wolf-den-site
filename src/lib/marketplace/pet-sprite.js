import "server-only";

import { db } from "@/lib/db";
import { housePrompt } from "@/lib/marketplace/art-style.js";
import { COLLECTIBLES, collectibleById } from "@/lib/marketplace/collectibles.js";
import { faceBufferRight, generateImage, editImage, storePng, detectFacing } from "@/lib/marketplace/openai-image.js";

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

// Per-LEVEL evolution (Lv1 = the plain base prompt above). Each tier makes the SAME creature read as more
// powerful, so a member watches their companion visibly evolve 1→5.
//
// ── WHY THESE WERE REWRITTEN ─────────────────────────────────────────────────────────────────────────────
// The Lv1 sprite was consistently the strongest and most on-style, Lv2 often came back WEAKER than the base,
// and the creature's identity drifted from there. Three causes, all in the prompt:
//
//   1. Every level was generated INDEPENDENTLY from the same text description. Five independent readings of
//      "a fluffy grey wolf pup" produce five different wolf pups, not one wolf pup at five ages. Nothing
//      carried the actual look forward. Fixed structurally below by anchoring levels to the Lv1 IMAGE.
//   2. Lv2's instruction was "a faint magical aura and a more confident stance" — so weak it gave the model
//      nothing to hold on to, and a vague instruction is an invitation to reinterpret the whole subject.
//      Every rung now names a CONCRETE, additive change.
//   3. The escalation was entirely VFX — aura, runes, energy, swirling. By Lv4 the creature was buried in
//      effects. The escalation now grows the CREATURE first and treats effects as trim.
const IDENTITY = "CRITICAL: it must remain unmistakably the same individual creature — identical species, "
    + "identical colour palette, identical markings, identical silhouette and proportions. This is the same "
    + "character at a later stage, NOT a different creature of the same type. Do not restyle it.";

export const PET_SPRITE_LEVELS = [2, 3, 4, 5];
const LEVEL_EVOLUTION = {
    2: "It has visibly matured: slightly larger and sturdier, fur/scales/feathers fuller and better groomed, "
       + "posture squared and alert, eyes sharper and more determined. No magical effects yet — this rung is "
       + "about the creature itself looking healthier and stronger, and it must NOT look softer or younger "
       + "than the base form.",
    3: "It is battle-hardened: noticeably bigger and more muscular, a few honest marks of experience (a nicked "
       + "ear, a scar, weathered plating), stance widened and braced. A faint warm glow at the eyes only.",
    4: "It has reached an EPIC evolved form: substantially larger and more imposing, with ONE dramatic new "
       + "physical feature that suits this species (heavier horns, a longer mane, spreading wings, armoured "
       + "plates). Any aura must hug the creature's own outline — no background, no scenery, no filled "
       + "backdrop. The background stays fully transparent.",
    5: "It has reached its ULTIMATE LEGENDARY form: the largest and most majestic version of itself, its "
       + "signature feature fully realised, bearing regal and awe-inspiring. Any glow or energy must CLING "
       + "TIGHTLY to the creature's own silhouette — absolutely no background, no scenery, no filled backdrop, "
       + "no glowing plate behind it. The background stays fully transparent.",
};
export function buildPetSpriteLevelPrompt(pet, level) {
    const evo = LEVEL_EVOLUTION[level] || "";
    // The creature's own description is restated FIRST and the identity clause comes last, so the thing the
    // model reads going in and the thing it reads last are both "this exact creature" rather than the effects.
    return housePrompt(
        `${pet.spritePrompt} — a loyal battle companion at power level ${level} of 5. ${evo} ${IDENTITY}`,
        { extra: POSE }
    );
}

/**
 * The level prompt used when we can anchor on the Lv1 sprite as a reference image.
 *
 * This is the structural fix for identity drift: an edit carries the actual pixels of the base form forward,
 * so "the same creature, later" stops being something the model has to infer from a sentence.
 */
export function buildPetSpriteLevelEditPrompt(pet, level) {
    const evo = LEVEL_EVOLUTION[level] || "";
    return `Evolve THIS EXACT creature to power level ${level} of 5. ${evo} ${IDENTITY} `
        + `Keep the same art style, the same transparent background, and the same right-facing three-quarter `
        + `full-body pose as the reference image.`;
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
    const url = await generateImage(buildPetSpritePrompt(pet), { size: "1024x1024", pathPrefix: "marketplace/pet", quality: "high", faceRight: true, deHalo: true, meta: { origin: "cron", subject: pet?.id || null, label: `Pet sprite — ${pet?.name || pet?.id || "?"}` } });
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
    // ── ANCHOR ON THE Lv1 ART ────────────────────────────────────────────────────────────────────────────
    // Levels used to be generated from the text description alone, independently of each other and of the base
    // sprite — five separate readings of "a fluffy grey wolf pup", not one wolf pup at five ages. That is why
    // Lv1 looked iconic and everything after it drifted.
    //
    // Editing FROM the Lv1 image carries the actual pixels forward, so identity is a fact rather than something
    // the model has to infer from a sentence. If the base can't be fetched we fall back to the text prompt,
    // which is the old behaviour — degraded, but never a failed generation.
    const meta = { origin: "cron", subject: pet?.id || null, label: `Pet level art — ${pet?.name || pet?.id || "?"} lv${lv}` };
    const baseRow = await db.queryOne(`SELECT url FROM mkt_pet_sprite WHERE pet_id = $1`, [petId]).catch(() => null);
    let url = null;
    if (baseRow?.url) {
        try {
            const buf = Buffer.from(await (await fetch(baseRow.url)).arrayBuffer());
            url = await editImage(buf, buildPetSpriteLevelEditPrompt(pet, lv), {
                size: "1024x1024", pathPrefix: "marketplace/pet", quality: "high", meta: { ...meta, label: `${meta.label} (from Lv1)` },
            });
        } catch { url = null; }
    }
    if (!url) {
        url = await generateImage(buildPetSpriteLevelPrompt(pet, lv), { size: "1024x1024", pathPrefix: "marketplace/pet", quality: "high", faceRight: true, deHalo: true, meta });
    }
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
