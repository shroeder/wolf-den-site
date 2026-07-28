import "server-only";

import { db } from "@/lib/db";
import { logCoin } from "@/lib/marketplace/coins.js";
import { addChests } from "@/lib/marketplace/chests.js";
import { grantSeed, SEEDS } from "@/lib/marketplace/farm-crops.js";

// ── HARVEST ENCOUNTERS ────────────────────────────────────────────────────────────────────────────────────
// A chance a garden creature RAIDS your harvest. You fight it with a timing meter (client) — landing perfect
// strikes downs it faster and pays more. Server-authoritative: the encounter + its pre-rolled reward are parked
// on mkt_buyer.farm_encounter at harvest time; resolve reads+clears it atomically and grants the loot scaled by
// how many perfect hits the player landed (bounded, so a faked win only ever earns the pre-rolled max).

// Base chance a harvest is raided (before the plot's Warding Totem + a small rarer-crop bump). Kept modest so
// an encounter feels like an event, not every harvest.
const BASE_ENCOUNTER_CHANCE = 0.1;
const RARITY_BUMP = { common: 0, rare: 0.03, epic: 0.06, legendary: 0.1, mythic: 0.14 };

// Creatures — weighted spawn, HP = strikes to down it, and the reward tier if you win. Rarer beasts hit harder
// and pay much more (gold + a chest chance/tier + maybe a seed band).
const CREATURES = {
    rat: { name: "Field Rat", emoji: "🐀", hp: 2, weight: 40, gold: 90, chestChance: 0.12, chestTier: "wooden" },
    crow: { name: "Crop Crow", emoji: "🐦", hp: 3, weight: 28, gold: 150, chestChance: 0.2, chestTier: "wooden" },
    raccoon: { name: "Masked Raccoon", emoji: "🦝", hp: 3, weight: 18, gold: 210, chestChance: 0.28, chestTier: "iron", seedBand: ["common", "rare"] },
    boar: { name: "Wild Boar", emoji: "🐗", hp: 4, weight: 10, gold: 340, chestChance: 0.45, chestTier: "iron", seedBand: ["rare", "epic"] },
    scarecrow: { name: "Wicked Scarecrow", emoji: "🧟", hp: 5, weight: 4, gold: 640, chestChance: 1, chestTier: "gold", seedBand: ["rare", "epic"] },
};
const CREATURE_KEYS = Object.keys(CREATURES);

function weightedCreature() {
    const total = CREATURE_KEYS.reduce((s, k) => s + CREATURES[k].weight, 0);
    let r = Math.random() * total;
    for (const k of CREATURE_KEYS) { if ((r -= CREATURES[k].weight) < 0) return k; }
    return "rat";
}

// Roll whether a harvest is raided; if so, PARK the pending encounter (creature + pre-rolled reward) on the
// member and return the public info the client needs to run the fight. `wardChance` is the plot's Warding Totem
// bonus (a fraction). Returns null when no encounter fires.
export async function maybeStartEncounter(buyerId, { rarity = "common", wardChance = 0, seedId = null } = {}) {
    if (!buyerId) return null;
    const chance = Math.min(0.6, BASE_ENCOUNTER_CHANCE + (RARITY_BUMP[rarity] || 0) + (Number(wardChance) || 0));
    if (Math.random() >= chance) return null;
    const key = weightedCreature();
    const c = CREATURES[key];
    // Pre-roll the reward NOW so it can't be faked at resolve time.
    const chest = Math.random() < c.chestChance ? c.chestTier : null;
    let seed = null;
    if (c.seedBand) {
        const band = c.seedBand[Math.floor(Math.random() * c.seedBand.length)];
        const pool = Object.keys(SEEDS).filter((id) => SEEDS[id].rarity === band);
        seed = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
    }
    const pending = { key, gold: c.gold, chest, seed };
    // Park it (overwrites any stale unresolved one — one encounter at a time).
    await db.query(`UPDATE mkt_buyer SET farm_encounter = $2::jsonb WHERE id = $1`, [buyerId, JSON.stringify(pending)]).catch(() => {});
    // Public fight info (NOT the exact reward — that stays server-side).
    return { key, name: c.name, emoji: c.emoji, hp: c.hp, crop: seedId ? (SEEDS[seedId]?.name || null) : null };
}

// Resolve the parked encounter. `perfectHits` (client-reported, bounded) scales the gold reward; landing all
// perfect also guarantees the chest. Atomic claim so an encounter pays out at most once.
export async function resolveEncounter(buyerId, { perfectHits = 0 } = {}) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const row = await db.queryOne(
        `UPDATE mkt_buyer SET farm_encounter = NULL WHERE id = $1 AND farm_encounter IS NOT NULL RETURNING farm_encounter`,
        [buyerId]
    ).catch(() => null);
    const pend = row?.farm_encounter;
    if (!pend) return { ok: false, error: "no_encounter" };
    const c = CREATURES[pend.key] || CREATURES.rat;
    const hits = Math.max(0, Math.min(c.hp, Number(perfectHits) || 0)); // bounded to the creature's HP
    const perfectAll = hits >= c.hp;
    // Gold: base pre-rolled + up to +50% for perfect timing.
    const goldMult = 1 + 0.1 * hits; // capped by hits<=hp, and hp<=5 → max +50%
    const gold = Math.round((pend.gold || 0) * Math.min(1.5, goldMult));
    const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`, [buyerId, gold]).catch(() => null);
    await logCoin(buyerId, gold, "farm_encounter", { balanceAfter: paid?.gold, meta: { creature: pend.key } }).catch(() => {});
    // Chest: the pre-rolled one, OR a guaranteed wooden if you went flawless and none rolled.
    const chestTier = pend.chest || (perfectAll ? "wooden" : null);
    if (chestTier) await addChests(buyerId, { [chestTier]: 1 }, { source: "farm_encounter" }).catch(() => {});
    let seedName = null;
    if (pend.seed) { await grantSeed(buyerId, pend.seed).catch(() => {}); seedName = SEEDS[pend.seed]?.name || null; }
    return { ok: true, creature: c.name, emoji: c.emoji, gold, chest: chestTier, seed: pend.seed, seedName, perfectAll, goldAfter: paid?.gold ?? null };
}
