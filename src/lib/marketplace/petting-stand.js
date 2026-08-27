import "server-only";

import { db } from "@/lib/db";
import { collectibleById } from "@/lib/marketplace/collectibles.js";
import { xpForLevel } from "@/lib/marketplace/xp-curve.js";
import { petLevelForXp } from "@/lib/marketplace/pet-level.js";
import { trackActivity } from "@/lib/marketplace/activity.js";

// ── THE PETTING STAND ────────────────────────────────────────────────────────────────────────────────────────
// A farm decoration that holds THREE pets, and the only decoration in the game you cannot win, find, or be
// given — it comes out of the $5 package and nowhere else (see decorations.js for the five hand-out paths it is
// deliberately invisible to).
//
// What standing on it does, and why each part exists:
//
//   PASSIVE, exactly as if equipped. The pets on it earn the daily trickle and the same share of your XP the
//   featured pet gets. That is the paid part of the package and it is deliberately not a fraction — "like your
//   equipped pet" has to mean it, or the card is selling something it does not deliver.
//
//   DOUBLE PETTING. Anyone who pets a stand pet gives it twice the usual XP, the owner included. This is the
//   social half: it is worth more to a visitor to pet what you put on display than what you did not.
//
//   AN OWNER COUNT. Each tier says how many members hold that companion, which turns the stand into the thing
//   the Den had no way to say before — "this is the rare one" — and gives a visitor a reason to look twice.
//
// The stand only DOES any of this while it is actually placed on the farm. Owning it and leaving it in the
// drawer earns nothing; that is what makes it a decoration rather than a passive upgrade you buy and forget.

// Imported AND re-exported: `export … from` alone creates no local binding, so every use below would be an
// undefined reference. lint:undef is what catches that class of mistake and it caught this one.
import { STAND_DECO_ID, STAND_SLOTS } from "@/lib/marketplace/petting-stand-const.js";

export { STAND_DECO_ID, STAND_SLOTS };
// What a petting is worth on the stand, as a multiplier on PET_PET_XP. Named here rather than written as a `2`
// inside farm.js so the number and the reason live together.
export const STAND_PET_MULT = 2;

/** Is the stand actually standing? Everything the stand does is gated on this, not on ownership. */
export async function standIsPlaced(buyerId) {
    if (!buyerId) return false;
    const r = await db.queryOne(
        `SELECT 1 FROM mkt_deco_placement WHERE buyer_id = $1 AND deco_id = $2 LIMIT 1`, [buyerId, STAND_DECO_ID]
    ).catch(() => null);
    return Boolean(r);
}

/**
 * The pet ids currently on a member's stand — the hot path, called by the XP credit on every award and by the
 * petting handler. Returns [] when the stand is not placed, so an unplaced stand cannot pay anything.
 */
export async function standPetIds(buyerId) {
    if (!buyerId) return [];
    if (!(await standIsPlaced(buyerId))) return [];
    const rows = await db.query(
        `SELECT pet_id FROM mkt_petting_stand WHERE buyer_id = $1 ORDER BY slot`, [buyerId]
    ).catch(() => []);
    return (rows || []).map((r) => r.pet_id).filter(Boolean);
}

/** Is this specific pet on this member's stand? Drives the doubled petting. */
export async function isOnStand(buyerId, petId) {
    if (!buyerId || !petId) return false;
    const ids = await standPetIds(buyerId);
    return ids.includes(String(petId));
}

// ── HOW MANY MEMBERS HOLD EACH COMPANION ─────────────────────────────────────────────────────────────────────
// Counted across the whole Den, not just friends, because "one of four people has this" is only interesting as
// a global fact. Cached per request by the caller rather than here — it is one grouped count over a table that
// is small and will stay small.
export async function petOwnerCounts(petIds = []) {
    const ids = [...new Set((petIds || []).map(String).filter(Boolean))];
    if (!ids.length) return {};
    // Pets are unlocks, not inventory: mkt_cosmetic_unlock rows with category 'pet' and the pet id in `ref`.
    const rows = await db.query(
        `SELECT ref AS pet_id, COUNT(DISTINCT buyer_id)::int AS n
           FROM mkt_cosmetic_unlock WHERE category = 'pet' AND ref = ANY($1::text[]) GROUP BY 1`, [ids]
    ).catch(() => []);
    const out = {};
    for (const r of rows || []) out[r.pet_id] = Number(r.n) || 0;
    // ── AND THE ONES NOBODY HAS A ROW FOR ────────────────────────────────────────────────────────────────
    // A level pet is unlocked by reaching a level, so it has NO unlock row for anybody. Counting rows alone
    // reported 0 for it — and the panel reads `owners <= 1` as "the only one in the Den", so a Bunny that
    // every member at level 2 already owns would have been announced as the rarest thing on the farm. The
    // count for those is simply how many members are at or past that level.
    // ── ⚠️ "AT MOST THREE IDS REACH HERE" WAS NOT TRUE ───────────────────────────────────────────────────
    // That is what this comment used to say, and on it rested "so a query each is cheaper than the SQL to
    // fuse them". `ids` is whatever the stand is holding, not one per cushion: counted against a real farm,
    // ONE getFarm ran this exact COUNT twelve times. Twelve TLS handshakes to ask twelve variations of a
    // question about a table with about thirty rows in it.
    //
    // The whole membership's XP is one small read, and the counting is a comparison. One round trip however
    // many level pets are on the stand, and it cannot go back to twelve when somebody adds a fourth cushion.
    const levelIds = ids.filter((id) => collectibleById(id)?.source === "level");
    if (levelIds.length) {
        const xps = await db.query(`SELECT COALESCE(xp, 0) AS xp FROM mkt_buyer`).catch(() => []);
        const all = (xps || []).map((r) => Number(r.xp) || 0);
        for (const id of levelIds) {
            const need = xpForLevel(collectibleById(id).level);
            const n = all.reduce((acc, xp) => acc + (xp >= need ? 1 : 0), 0);
            // Granted rows and level-unlocks can overlap, so take whichever is larger rather than summing.
            out[id] = Math.max(out[id] || 0, n);
        }
    }
    return out;
}

/**
 * The stand as the farm draws it — for the owner AND for a visitor, which is why it takes the farm's owner id
 * rather than the viewer's. `placed` false means there is nothing to draw at all.
 */
export async function getStandState(ownerId) {
    if (!ownerId) return { placed: false, slots: [] };
    const placed = await standIsPlaced(ownerId);
    if (!placed) return { placed: false, slots: [] };
    const rows = await db.query(
        `SELECT s.slot, s.pet_id, COALESCE(l.xp, 0) AS xp
           FROM mkt_petting_stand s
           -- WARNING: the ::text cast is load-bearing. mkt_petting_stand.buyer_id is UUID (FK to mkt_buyer);
           -- mkt_pet_level.buyer_id is TEXT. Without the cast Postgres refuses the whole statement with
           -- 42883 "operator does not exist: text = uuid" — and the .catch(() => []) below turned that into
           -- an empty result, so every seated pet silently read back as an empty tier. The feature looked
           -- like it did nothing at all.
           LEFT JOIN mkt_pet_level l ON l.buyer_id = s.buyer_id::text AND l.pet_id = s.pet_id
          WHERE s.buyer_id = $1 ORDER BY s.slot`, [ownerId]
    ).catch(() => []);
    const counts = await petOwnerCounts((rows || []).map((r) => r.pet_id));
    const slots = [];
    for (let i = 0; i < STAND_SLOTS; i += 1) {
        const row = (rows || []).find((r) => Number(r.slot) === i);
        if (!row) { slots.push({ slot: i, pet: null }); continue; }
        const def = collectibleById(row.pet_id);
        if (!def) { slots.push({ slot: i, pet: null }); continue; }
        slots.push({
            slot: i,
            pet: {
                id: def.id, name: def.name, rarity: def.rarity,
                level: petLevelForXp(Number(row.xp) || 0, def.rarity),
                owners: counts[def.id] ?? 0,
            },
        });
    }
    return { placed: true, slots, petMult: STAND_PET_MULT };
}

/**
 * Seat a pet on a tier. Guarded on three things, all of which a POST body could otherwise lie about: the stand
 * has to be placed, the pet has to be one you actually own, and the same animal cannot sit on two tiers (the
 * unique index is the real enforcement — this check is only so the error is a sentence rather than a 500).
 */
export async function setStandPet(buyerId, slot, petId) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const s = Math.floor(Number(slot));
    if (!(s >= 0 && s < STAND_SLOTS)) return { ok: false, error: "bad_slot" };
    if (!(await standIsPlaced(buyerId))) return { ok: false, error: "no_stand" };
    const def = collectibleById(petId);
    if (!def) return { ok: false, error: "bad_pet" };
    // ⚠️ NOT a mkt_cosmetic_unlock lookup. That table only holds GRANTED pets; level-unlocked ones have no row,
    // so the raw check refused 15 of the 52 pets showing on the farm — you could pick one and nothing happened.
    const { ownsPet } = await import("@/lib/marketplace/pets.js");
    if (!(await ownsPet(buyerId, def.id))) return { ok: false, error: "not_owned" };
    const elsewhere = await db.queryOne(
        `SELECT slot FROM mkt_petting_stand WHERE buyer_id = $1 AND pet_id = $2 AND slot <> $3`, [buyerId, def.id, s]
    ).catch(() => null);
    if (elsewhere) return { ok: false, error: "already_on_stand" };
    await db.query(
        `INSERT INTO mkt_petting_stand (buyer_id, slot, pet_id) VALUES ($1, $2, $3)
         ON CONFLICT (buyer_id, slot) DO UPDATE SET pet_id = EXCLUDED.pet_id, placed_at = NOW()`,
        [buyerId, s, def.id]
    ).catch(() => {});
    // Start its passive clock the moment it is seated, exactly as equipping does — otherwise the first read
    // would hand it every hour since the row was created, or nothing at all.
    await db.query(
        `INSERT INTO mkt_pet_level (buyer_id, pet_id, xp, last_tick_at, updated_at) VALUES ($1, $2, 0, NOW(), NOW())
         ON CONFLICT (buyer_id, pet_id) DO UPDATE SET last_tick_at = NOW(), updated_at = NOW()`,
        [buyerId, def.id]
    ).catch(() => {});
    await trackActivity(buyerId, "stand_seat", { petId: def.id, slot: s }).catch(() => {});
    return { ok: true, ...(await getStandState(buyerId)) };
}

/** Take a tier's pet down. Its XP stays on mkt_pet_level — only the seat is cleared. */
export async function clearStandPet(buyerId, slot) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const s = Math.floor(Number(slot));
    if (!(s >= 0 && s < STAND_SLOTS)) return { ok: false, error: "bad_slot" };
    await db.query(`DELETE FROM mkt_petting_stand WHERE buyer_id = $1 AND slot = $2`, [buyerId, s]).catch(() => {});
    return { ok: true, ...(await getStandState(buyerId)) };
}
