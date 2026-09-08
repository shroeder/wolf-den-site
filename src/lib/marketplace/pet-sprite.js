import "server-only";

import { db } from "@/lib/db";
import { COLLECTIBLES, collectibleById } from "@/lib/marketplace/collectibles.js";
import { faceBufferRight, generateImage, editImage, storePng, detectFacing } from "@/lib/marketplace/openai-image.js";

// The wording moved to pet-sprite-prompt.js so generators outside Next can import it instead of copying
// it (which is how the fishing set got the pre-rewrite text). Re-exported so every existing caller of
// this module is untouched.
import {
    PET_SPRITE_LEVELS, buildPetSpritePrompt, buildPetSpriteLevelPrompt, buildPetSpriteLevelEditPrompt,
} from "@/lib/marketplace/pet-sprite-prompt.js";
// Imported for this module's own use AND re-exported, because every existing caller imports these from here.
export { PET_SPRITE_LEVELS, buildPetSpritePrompt, buildPetSpriteLevelPrompt, buildPetSpriteLevelEditPrompt };

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
    const rows = await db.query(`SELECT pet_id, level, variant, url, flip FROM mkt_pet_sprite_level WHERE url IS NOT NULL`).catch(() => []);
    const out = {};
    for (const r of rows) {
        if (!out[r.pet_id]) out[r.pet_id] = {};
        // Levels 1-5 have one sprite and an empty variant, so they key on the number exactly as before. LEVEL 6
        // HAS TWO — one per stone — and they key as "6:light" / "6:dark", because which rock you spent is
        // written on the animal for the rest of its life.
        const key = r.variant ? `${r.level}:${r.variant}` : String(r.level);
        out[r.pet_id][key] = { url: r.url, flip: r.flip === true };
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
export function pickPetSpriteForLevel(base, levelMap, level, stone = null) {
    const lv = Math.max(1, Math.min(6, Math.floor(Number(level) || 1)));
    // ENSHRINED FIRST. A level-6 pet wears the form of the stone that enshrined it, and that is the whole
    // visible payoff of the climb — so it wins over every other rung. A level-6 pet with NO stone (the climb
    // finished, the ritual not yet performed) correctly falls through to its level-5 art: the transfiguration
    // belongs to the stone, not to the level.
    if (lv >= 6 && stone && levelMap?.[`6:${stone}`]?.url) return levelMap[`6:${stone}`];
    for (let n = Math.min(5, lv); n >= 2; n -= 1) {
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
            // faceRight + deHalo must be passed here too. The text branch below has always set them; this one
            // never did, so an evolved sprite kept the die-cut rim every other sprite has cleaned off and had
            // nothing enforcing which way it faced.
            url = await editImage(buf, buildPetSpriteLevelEditPrompt(pet, lv), {
                size: "1024x1024", pathPrefix: "marketplace/pet", quality: "high", faceRight: true, deHalo: true,
                meta: { ...meta, label: `${meta.label} (from Lv1)` },
            });
        } catch { url = null; }
    }
    if (!url) {
        url = await generateImage(buildPetSpriteLevelPrompt(pet, lv), { size: "1024x1024", pathPrefix: "marketplace/pet", quality: "high", faceRight: true, deHalo: true, meta });
    }
    // ── THE CONFLICT TARGET IS THREE COLUMNS, NOT TWO ────────────────────────────────────────────────
    // The primary key on this table is (pet_id, level, VARIANT) -- variant arrived later and this upsert was
    // never moved with it. Postgres does not treat a conflict target as a prefix: naming two of the three
    // columns is not "close enough", it is error 42P10, "there is no unique or exclusion constraint matching
    // the ON CONFLICT specification", and this one has no .catch() so it threw. Every attempt to generate an
    // evolved pet sprite has been failing outright.
    //
    // Found by a generator script hitting the same wall while drawing Sable’s three new pets. It is the same
    // shape as the bug that quietly lost two weeks of writes elsewhere in this repo -- there the .catch() hid
    // it, here it was loud, and nobody had run it since variant landed.
    await db.query(
        `INSERT INTO mkt_pet_sprite_level (pet_id, level, url, updated_at) VALUES ($1, $2, $3, NOW())
         ON CONFLICT (pet_id, level, variant) DO UPDATE SET url = $3, updated_at = NOW(), flip = FALSE, facing_checked_at = NULL`,
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
