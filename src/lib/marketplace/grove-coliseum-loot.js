import "server-only";

// ── WHAT COMES OUT OF A COLISEUM CHEST ───────────────────────────────────────────────────────────────────────
// Luke: "the actual loot that pops out of these chests is different. It's not actually the loot table that the
// chests use. It's going to spawn like a bunch of parts, definitely some gear, and depending on like the
// rarity of the chest... I'll let you decide what's fair."
//
// ⚠️ SAME SPRITE, SAME TIER NAMES, DIFFERENT TABLE. The tier here is a LOOK and a weight; it does not reach
// into GROVE_CHESTS' own contents. Pointing a new payout at an existing reward row is how a shared table
// quietly decays for everything else that reads it.
//
// ⚠️ AND PARTS COME FROM THE MAP THE RUN WAS ON. A heartwrought chest from the Ashen Reach paying Rootwood
// moss would be a reward that tells you nothing about where you earned it — and worse, a way to farm map
// one's crafting inputs from map seven.

import { db } from "@/lib/db";
import { GROVE_PARTS } from "@/lib/marketplace/grove-catalog.js";
import { GROVE_CHEST_ORDER } from "@/lib/marketplace/grove-forge.js";
import { storeParts } from "@/lib/marketplace/grove.js";

/**
 * What one tier is worth.
 *
 * `parts` is how many separate part stacks fall out, `each` how deep a stack is, and `gear` the chance of a
 * gear piece riding along. Luke asked for "definitely some gear" — so the top two tiers are a certainty and
 * the bottom two are a real chance rather than a tease.
 */
const TIER = {
    mossbound:   { parts: 3, each: [2, 4], gear: 0.35 },
    barrowed:    { parts: 4, each: [3, 6], gear: 0.6 },
    warrenspun:  { parts: 5, each: [4, 9], gear: 1 },
    heartwrought:{ parts: 6, each: [6, 14], gear: 1 },
};

const pick = (list, rng) => list[Math.floor(rng() * list.length) % list.length];
const between = ([lo, hi], rng) => lo + Math.floor(rng() * (hi - lo + 1));

/** Parts belonging to the map this chest was won on. */
function partsOfMap(mapN) {
    return Object.entries(GROVE_PARTS)
        .filter(([, p]) => Number(p.map) === Number(mapN))
        .map(([id]) => id);
}

/**
 * Open one chest.
 *
 * ⚠️ THE ROW IS THE LOCK. Marking it opened is conditional on it not already being open, so two taps on the
 * same chest — which is exactly what a chest you tap in a platformer invites — cannot both pay.
 */
export async function openColiseumChest(buyerId, chestId) {
    if (!buyerId || !chestId) return { ok: false, error: "bad_request" };

    const row = await db.queryOne(
        `UPDATE mkt_grove_coliseum_chest SET opened_at = NOW()
          WHERE id = $1 AND buyer_id = $2 AND opened_at IS NULL
          RETURNING id, map_n, tier`,
        [chestId, buyerId],
    ).catch(() => null);
    if (!row) return { ok: false, error: "already_open" };

    const tier = TIER[row.tier] || TIER[GROVE_CHEST_ORDER[0]];
    const pool = partsOfMap(row.map_n);
    if (!pool.length) return { ok: true, tier: row.tier, parts: {}, gear: null };

    // Seeded off the chest's own id so re-reading a result cannot re-roll it. The row is already spent by
    // the update above; this only decides what was in it.
    let seed = Number(row.id) * 2654435761 % 2147483647;
    const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

    const parts = {};
    for (let i = 0; i < tier.parts; i += 1) {
        const id = pick(pool, rng);
        parts[id] = (parts[id] || 0) + between(tier.each, rng);
    }

    const p = await db.queryOne(`SELECT pack_slots FROM mkt_grove_player WHERE buyer_id = $1`, [buyerId]).catch(() => null);
    const { stored, overflow } = await storeParts(buyerId, parts, Number(p?.pack_slots) || 16);

    return {
        ok: true,
        tier: row.tier,
        map: Number(row.map_n),
        parts: stored,
        // Overflow is REPORTED rather than silently dropped — a full pack is a thing the player can act on,
        // and a chest that eats its own contents without saying so is the worst kind of reward.
        overflow,
        gear: rng() < tier.gear ? { tier: row.tier } : null,
    };
}
