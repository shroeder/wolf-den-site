import "server-only";

import { db } from "@/lib/db";
import { petsState } from "@/lib/marketplace/pets.js";
import { collectibleById } from "@/lib/marketplace/collectibles.js";
import { getPetSpriteData } from "@/lib/marketplace/pet-sprite.js";
import { petLevelInfo, petMaxXp } from "@/lib/marketplace/pet-level.js";

// The Farm: a member's owned pets roam a little pasture. On your OWN farm you can pet each pet once a day for a
// small XP bump; other members' farms are view-only. (mkt_pet_level.buyer_id is TEXT — always cast ::text.)
const DAY = "(NOW() AT TIME ZONE 'America/Chicago')::date"; // store-local day, matches the rest of the game
export const PET_PET_XP = 20; // pet XP granted per pet, once per day, when you pet it

// Resolve a farm owner by @alias (for inspecting someone else's farm). Returns { id, name, alias } or null.
export async function resolveFarmOwner(alias) {
    if (!alias) return null;
    const row = await db.queryOne(`SELECT id, display_name, alias FROM mkt_buyer WHERE alias = $1`, [String(alias)]).catch(() => null);
    return row ? { id: row.id, name: row.display_name || row.alias || "Member", alias: row.alias } : null;
}

// A member's farm state. viewerId === ownerId ⟺ it's your farm (petting enabled + per-pet "petted today" flags).
export async function getFarm(ownerId, viewerId) {
    if (!ownerId) return null;
    const [owner, state, sprites, pettedRows] = await Promise.all([
        db.queryOne(`SELECT id, display_name, alias FROM mkt_buyer WHERE id = $1`, [ownerId]).catch(() => null),
        petsState(ownerId).catch(() => null),
        getPetSpriteData().catch(() => ({})),
        db.query(`SELECT pet_id FROM mkt_pet_level WHERE buyer_id = $1::text AND petted_day = ${DAY}`, [ownerId]).catch(() => []),
    ]);
    if (!owner || !state) return null;
    const pettedToday = new Set(pettedRows.map((r) => r.pet_id));
    const mine = String(viewerId) === String(ownerId);
    const pets = (state.ownedIds || [])
        .map((id) => {
            const def = collectibleById(id);
            const sp = sprites[id];
            const lvl = state.petLevels?.[id];
            return {
                id,
                name: def?.name || id,
                rarity: def?.rarity || "common",
                level: lvl?.level || 1,
                spriteUrl: sp?.url || null,
                flip: sp?.flip === true,
                petted: pettedToday.has(id), // only meaningful on your own farm
            };
        })
        .filter((p) => p.spriteUrl); // only pets that have art can roam the pasture
    return {
        owner: { id: owner.id, name: owner.display_name || owner.alias || "Member", alias: owner.alias || null },
        mine,
        canPet: mine,
        petXp: PET_PET_XP,
        pets,
    };
}

// Pet one of YOUR pets: +PET_PET_XP, once per store-local day. Replay/race-safe via the petted_day guard in the
// conditional upsert (a second pet the same day returns no row → "already_petted").
export async function petPet(buyerId, petId) {
    if (!buyerId || !petId) return { ok: false, error: "bad_request" };
    const state = await petsState(buyerId).catch(() => null);
    if (!state || !(state.ownedIds || []).includes(petId)) return { ok: false, error: "not_owned" };
    const def = collectibleById(petId);
    const maxXp = petMaxXp(def?.rarity || "common");
    const row = await db
        .queryOne(
            `INSERT INTO mkt_pet_level (buyer_id, pet_id, xp, petted_day, last_tick_at, updated_at)
             VALUES ($1::text, $2, LEAST($3, $4), ${DAY}, NOW(), NOW())
             ON CONFLICT (buyer_id, pet_id)
             DO UPDATE SET xp = LEAST(mkt_pet_level.xp + $3, $4), petted_day = ${DAY}, updated_at = NOW()
              WHERE mkt_pet_level.petted_day IS DISTINCT FROM ${DAY}
             RETURNING xp`,
            [buyerId, petId, PET_PET_XP, maxXp]
        )
        .catch(() => null);
    if (!row) return { ok: false, error: "already_petted" };
    const info = petLevelInfo(row.xp, def?.rarity || "common");
    return { ok: true, petId, xpGained: PET_PET_XP, level: info.level, xp: row.xp, maxed: info.maxed };
}
