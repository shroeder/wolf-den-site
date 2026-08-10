import "server-only";

import { db } from "@/lib/db";
import { collectibleById, isCollectibleUnlocked } from "@/lib/marketplace/collectibles.js";
import { levelForXp } from "@/lib/marketplace/xp-curve.js";
import { petLevelForXp, PET_MAX_LEVEL } from "@/lib/marketplace/pet-level.js";
import { STONES, STONE_IDS, stoneById, STONE_PRICE_DOUBLOONS, STONE_PRICE_LAURELS } from "@/lib/marketplace/pet-stones.js";

// ── ENSHRINING A PET ─────────────────────────────────────────────────────────────────────────────────────────
// The state and the writes. The catalogue, the numbers and the reasoning all live in pet-stones.js, which is
// pure — this file is only the part that talks to the database.

/** What stones this member is holding, as { light: n, dark: n }. */
export async function getStones(buyerId) {
    const out = Object.fromEntries(STONE_IDS.map((k) => [k, 0]));
    if (!buyerId) return out;
    const rows = await db.query(`SELECT stone, count FROM mkt_pet_stone WHERE buyer_id = $1`, [buyerId]).catch(() => []);
    for (const r of rows) if (r.stone in out) out[r.stone] = Math.max(0, Number(r.count) || 0);
    return out;
}

/** Every pet this member has enshrined, with the stone that did it and the pet's catalogue entry. */
export async function getEnshrined(buyerId) {
    if (!buyerId) return [];
    const rows = await db.query(
        `SELECT pet_id, stone, enshrined_at FROM mkt_pet_enshrined WHERE buyer_id = $1 ORDER BY enshrined_at ASC`, [buyerId]
    ).catch(() => []);
    return rows
        .map((r) => ({ petId: r.pet_id, stone: r.stone, at: r.enshrined_at, pet: collectibleById(r.pet_id) }))
        .filter((e) => e.pet);
}

/** Hand over a stone. `source` is only for the ledger; the count is the whole state. */
export async function grantStone(buyerId, stone, n = 1, source = "drop") {
    const def = stoneById(stone);
    if (!buyerId || !def || n <= 0) return { ok: false, error: "bad_stone" };
    await db.query(
        `INSERT INTO mkt_pet_stone (buyer_id, stone, count) VALUES ($1, $2, $3)
         ON CONFLICT (buyer_id, stone) DO UPDATE SET count = mkt_pet_stone.count + $3, updated_at = NOW()`,
        [buyerId, def.id, n]
    ).catch(() => {});
    await trackStone(buyerId, def.id, n, source);
    return { ok: true, stone: def.id, n, name: def.name, art: def.art, color: def.color };
}

async function trackStone(buyerId, stone, n, source) {
    const { trackActivity } = await import("@/lib/marketplace/activity.js").catch(() => ({ trackActivity: null }));
    if (trackActivity) await trackActivity(buyerId, "pet_stone_found", { stone, n, source }).catch(() => {});
}

// ── THE ROLL ─────────────────────────────────────────────────────────────────────────────────────────────────
// Called by the four systems that can turn one up. WHICH stone is the house's choice, not the finder's: being
// able to pick would collapse the decision this whole feature is built on, because you would simply farm the
// one you wanted next. You find a rock; what you do with it is the choice.
export async function rollStone(buyerId, chance, source) {
    if (!buyerId || !(chance > 0) || Math.random() >= chance) return null;
    const stone = STONE_IDS[Math.floor(Math.random() * STONE_IDS.length)];
    const got = await grantStone(buyerId, stone, 1, source);
    return got.ok ? got : null;
}

// ── ENSHRINE ─────────────────────────────────────────────────────────────────────────────────────────────────
// A pet at the ceiling, plus a stone, forever. There is no undo and no re-stoning: see the migration.
export async function enshrinePet(buyerId, petId, stone) {
    const def = stoneById(stone);
    const pet = collectibleById(petId);
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    if (!pet || !def) return { ok: false, error: "bad_request" };

    // Ownership is DERIVED, not a row: a pet is yours if it was granted OR your level unlocks it. Asking a
    // `mkt_user_collectible` table would have been wrong on every level-unlocked pet in the game — there is no
    // such table, and the level pets have no grant row at all.
    const [buyer, grants] = await Promise.all([
        db.queryOne(`SELECT COALESCE(xp,0) AS xp FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null),
        db.query(`SELECT ref FROM mkt_cosmetic_unlock WHERE buyer_id = $1 AND category = 'pet'`, [buyerId]).catch(() => []),
    ]);
    const owned = new Set((grants || []).map((r) => r.ref));
    if (!isCollectibleUnlocked(pet, levelForXp(Number(buyer?.xp) || 0).level, { owned })) {
        return { ok: false, error: "not_owned" };
    }

    const already = await db.queryOne(`SELECT stone FROM mkt_pet_enshrined WHERE buyer_id = $1 AND pet_id = $2`, [buyerId, petId]).catch(() => null);
    if (already) return { ok: false, error: "already_enshrined", stone: already.stone };

    const xpRow = await db.queryOne(`SELECT xp FROM mkt_pet_level WHERE buyer_id = $1 AND pet_id = $2`, [buyerId, petId]).catch(() => null);
    const level = petLevelForXp(Number(xpRow?.xp) || 0, pet.rarity);
    if (level < PET_MAX_LEVEL) return { ok: false, error: "not_max_level", level, need: PET_MAX_LEVEL };

    // SPEND THE STONE CONDITIONALLY, inside the UPDATE. neon() has no transactions, so a read-then-write would
    // let two taps both pass a check only one of them can afford — and a stone is a month of somebody's luck.
    const paid = await db.queryOne(
        `UPDATE mkt_pet_stone SET count = count - 1, updated_at = NOW()
          WHERE buyer_id = $1 AND stone = $2 AND count >= 1 RETURNING count`,
        [buyerId, def.id]
    ).catch(() => null);
    if (!paid) return { ok: false, error: "no_stone", stone: def.id };

    // The insert is guarded too. If it loses a race the stone goes straight back — the one outcome worth
    // avoiding above all others is a member paying a chase item and receiving nothing.
    const done = await db.queryOne(
        `INSERT INTO mkt_pet_enshrined (buyer_id, pet_id, stone) VALUES ($1, $2, $3)
         ON CONFLICT (buyer_id, pet_id) DO NOTHING RETURNING pet_id`,
        [buyerId, petId, def.id]
    ).catch(() => null);
    if (!done) {
        await db.query(
            `UPDATE mkt_pet_stone SET count = count + 1 WHERE buyer_id = $1 AND stone = $2`, [buyerId, def.id]
        ).catch(() => {});
        return { ok: false, error: "already_enshrined" };
    }

    const { trackActivity } = await import("@/lib/marketplace/activity.js").catch(() => ({ trackActivity: null }));
    if (trackActivity) await trackActivity(buyerId, "pet_enshrined", { petId, stone: def.id, rarity: pet.rarity }).catch(() => {});

    return {
        ok: true,
        petId, stone: def.id, stoneName: def.name, color: def.color,
        pet: { id: pet.id, name: pet.name, rarity: pet.rarity },
        stonesLeft: Math.max(0, Number(paid.count) || 0),
    };
}

// ── BUYING ONE ───────────────────────────────────────────────────────────────────────────────────────────────
// The floor under the randomness. Same conditional-spend shape as everything else that takes a currency.
export async function buyStone(buyerId, stone, currency) {
    const def = stoneById(stone);
    if (!buyerId || !def) return { ok: false, error: "bad_request" };

    if (currency === "doubloons") {
        const paid = await db.queryOne(
            `UPDATE mkt_sailing SET doubloons = doubloons - $2 WHERE buyer_id = $1 AND doubloons >= $2 RETURNING doubloons`,
            [buyerId, STONE_PRICE_DOUBLOONS]
        ).catch(() => null);
        if (!paid) return { ok: false, error: "not_enough_doubloons", cost: STONE_PRICE_DOUBLOONS };
        await grantStone(buyerId, def.id, 1, "quartermaster");
        return { ok: true, stone: def.id, spent: STONE_PRICE_DOUBLOONS, left: Number(paid.doubloons) || 0 };
    }

    if (currency === "laurels") {
        const paid = await db.queryOne(
            `UPDATE mkt_arena SET laurels = laurels - $2 WHERE buyer_id = $1 AND laurels >= $2 RETURNING laurels`,
            [buyerId, STONE_PRICE_LAURELS]
        ).catch(() => null);
        if (!paid) return { ok: false, error: "not_enough_laurels", cost: STONE_PRICE_LAURELS };
        await grantStone(buyerId, def.id, 1, "armoury");
        return { ok: true, stone: def.id, spent: STONE_PRICE_LAURELS, left: Number(paid.laurels) || 0 };
    }

    return { ok: false, error: "bad_currency" };
}

/** { petId: stone } for one member — what art each of their pets should be wearing. */
export async function stoneMapFor(buyerId) {
    if (!buyerId) return {};
    const rows = await db.query(`SELECT pet_id, stone FROM mkt_pet_enshrined WHERE buyer_id = $1`, [buyerId]).catch(() => []);
    return Object.fromEntries(rows.map((r) => [r.pet_id, r.stone]));
}

/** The same thing for a crowd, in ONE query — the plaza and the boss fight draw dozens of heroes at once. */
export async function stoneMapForMembers(buyerIds = []) {
    const out = new Map();
    if (!buyerIds.length) return out;
    const rows = await db.query(
        `SELECT buyer_id, pet_id, stone FROM mkt_pet_enshrined WHERE buyer_id = ANY($1)`, [buyerIds]
    ).catch(() => []);
    for (const r of rows) {
        if (!out.has(r.buyer_id)) out.set(r.buyer_id, {});
        out.get(r.buyer_id)[r.pet_id] = r.stone;
    }
    return out;
}

/** Everything the pets page needs to draw the ascension panel. */
export async function ascensionState(buyerId) {
    if (!buyerId) return { stones: Object.fromEntries(STONE_IDS.map((k) => [k, 0])), enshrined: [], stoneDefs: STONES };
    const [stones, enshrined] = await Promise.all([getStones(buyerId), getEnshrined(buyerId)]);
    return {
        stones,
        enshrined: enshrined.map((e) => ({ petId: e.petId, stone: e.stone, name: e.pet.name, rarity: e.pet.rarity })),
        stoneDefs: STONES,
        prices: { doubloons: STONE_PRICE_DOUBLOONS, laurels: STONE_PRICE_LAURELS },
    };
}
