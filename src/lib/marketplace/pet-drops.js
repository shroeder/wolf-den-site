import "server-only";

import { db } from "@/lib/db";
import { COLLECTIBLES } from "@/lib/marketplace/collectibles.js";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { isOwner } from "@/lib/marketplace/owner.js";

// Pet DROPS from chests + the boss. Kept in its own dependency-light module (db + collectibles + activity
// only) so chests.js / boss.js can grant pets without an import cycle through pets.js → quests.js → chests.js.
//
// UNLAUNCHED PETS. Every pool here filtered raw COLLECTIBLES rather than PUBLIC_COLLECTIBLES — so a pet marked
// `ownerOnly` (content for a feature that hasn't shipped) could drop from ANY chest for ANY member, which is
// the exact thing the flag exists to prevent. The five mine pets would have gone straight into public hands
// carrying an affinity for a page nobody else can open.
//
// Gating on the unlock rather than excluding them outright is deliberate: it means the owner can collect them
// by playing, down the same chest path the sailing pets already use — art, reveal and notification all for
// free — instead of needing a second bespoke drop route built just for them.
const unlocked = (buyerId) => (p) => !p.ownerOnly || isOwner(buyerId);

const CHEST_TIER_ORDER = ["wooden", "iron", "gold", "mythic", "ascendant", "eternal", "celestial", "primordial"];

async function ownedPetSet(buyerId) {
    const rows = await db.query(`SELECT ref FROM mkt_cosmetic_unlock WHERE buyer_id = $1 AND category = 'pet'`, [buyerId]).catch(() => []);
    return new Set(rows.map((r) => r.ref));
}

async function grantDrop(buyerId, pet, source, meta) {
    await db.query(`INSERT INTO mkt_cosmetic_unlock (buyer_id, category, ref) VALUES ($1, 'pet', $2) ON CONFLICT DO NOTHING`, [buyerId, pet.id]).catch(() => {});
    await trackActivity(buyerId, "pet_drop", { petId: pet.id, source, ...meta });
    return { id: pet.id, name: pet.name, rarity: pet.rarity, color: pet.color, hint: pet.hint || null };
}

// ── A PET OUT OF A CHEST ─────────────────────────────────────────────────────────────────────────────────────
// This was 12% on a WOODEN chest rising to 30% — one pet every three to eight chests. Chests come from the
// wheel, the boss, quests, the mine, digging and the merchant, so that is not a chase, it is a drip: 98 of the
// 103 pets ever obtained in the Den came out of chests, against 3 from fishing, 2 from the boss and 0 from
// raids. Every other pet source is tuned as a prestige trophy and this one was handing them out by the fistful.
//
// Worse, it front-loads. The pool is un-owned pets only, so the chance never falls but the pool empties — you
// get a flood and then permanent silence, which is the least satisfying shape a collection can have.
//
// Now: 2% on a wooden chest, climbing to 12% on a primordial. A pet becomes a reason to save the good chests
// rather than something that falls out of the cheap ones.
const CHEST_PET_BASE = 0.02;   // wooden
const CHEST_PET_STEP = 0.015;  // per tier above wooden
const CHEST_PET_CAP = 0.12;    // primordial

// Pet RARITY was decorative: the picker took a uniform pick over everything eligible, so a legendary Octopus
// was exactly as likely as a common Reef Fish. Weighted now, so the rarity printed on the card means something.
const PET_RARITY_WEIGHT = { common: 100, rare: 45, epic: 18, legendary: 6, mythic: 3, ascendant: 2, eternal: 1 };

export async function maybeGrantChestPet(buyerId, openedTier) {
    if (!buyerId) return null;
    const openedIdx = CHEST_TIER_ORDER.indexOf(openedTier);
    if (openedIdx < 0) return null;
    const chance = Math.min(CHEST_PET_CAP, CHEST_PET_BASE + openedIdx * CHEST_PET_STEP);
    if (Math.random() > chance) return null;
    const owned = await ownedPetSet(buyerId);
    const eligible = COLLECTIBLES.filter(unlocked(buyerId))
        .filter((p) => p.source === "chest" && CHEST_TIER_ORDER.indexOf(p.chestTier) <= openedIdx && !owned.has(p.id));
    if (!eligible.length) return null;
    const pet = pickWeighted(eligible);
    return grantDrop(buyerId, pet, "chest", { tier: openedTier });
}

/** Weighted pick over a pet pool by rarity. Falls back to a uniform pick if every weight is unknown. */
function pickWeighted(pool) {
    const total = pool.reduce((n, p) => n + (PET_RARITY_WEIGHT[p.rarity] || 1), 0);
    if (total <= 0) return pool[Math.floor(Math.random() * pool.length)];
    let roll = Math.random() * total;
    for (const p of pool) {
        roll -= PET_RARITY_WEIGHT[p.rarity] || 1;
        if (roll <= 0) return p;
    }
    return pool[pool.length - 1];
}

// A top boss dealer has a SMALL chance at a boss-only pet. Deliberately stingy (was 60% → too many
// legendaries too fast) and now rolled for the top 3 dealers rather than guaranteed to #1. When it does hit,
// it's almost always a LEGENDARY boss pet; the two MYTHIC boss pets (Fairy, Kraken) only surface on a rare
// sub-roll so the rarest companions stay genuinely rare.
export async function maybeGrantBossPet(buyerId, { chance = 0.12 } = {}) {
    if (!buyerId) return null;
    if (Math.random() > chance) return null;
    const owned = await ownedPetSet(buyerId);
    const eligible = COLLECTIBLES.filter(unlocked(buyerId)).filter((p) => p.source === "boss" && !owned.has(p.id));
    if (!eligible.length) return null;
    const legendary = eligible.filter((p) => p.rarity === "legendary");
    // 90% of drops draw only from legendary boss pets; mythic boss pets need the 10% sub-roll.
    const pool = legendary.length && Math.random() > 0.1 ? legendary : eligible;
    const pet = pool[Math.floor(Math.random() * pool.length)];
    return grantDrop(buyerId, pet, "boss", {});
}

// EXCLUSIVE fishing pets — the ONLY source is landing a fish. Called when fishing's haul table has already
// rolled "pet", so the odds of reaching here are the rare part (see HAUL in fishing.js); this just decides
// WHICH one. `fishTier` ranks the four, and the fish's rarity caps how deep you can reach: a common fish can
// only ever surface the Reef Seahorse, and the Tidecaller effectively needs a mythic on the line. Rarest
// eligible first, so the best pet you qualify for is the one you get.
const FISH_TIER_CAP = { common: 0, rare: 1, epic: 2, legendary: 2, mythic: 3 };
export async function maybeGrantFishingPet(buyerId, fishRarity = "common") {
    if (!buyerId) return null;
    const cap = FISH_TIER_CAP[fishRarity] ?? 0;
    const owned = await ownedPetSet(buyerId);
    const eligible = COLLECTIBLES
        .filter(unlocked(buyerId))
        .filter((p) => p.source === "fishing" && (p.fishTier ?? 0) <= cap && !owned.has(p.id))
        .sort((a, b) => (b.fishTier ?? 0) - (a.fishTier ?? 0));
    if (!eligible.length) return null;
    return grantDrop(buyerId, eligible[0], "fishing", { fishRarity });
}

// EXCLUSIVE raid pets — the ONLY source is completing a live Town raid, so they stay a genuine prestige trophy.
// Each pet has its own ABSOLUTE per-raid-completion drop chance (`raidChance`), tuned to be exceedingly rare:
// the easiest (mythic) ~0.025%, the rarest (eternal Golem's Heart) ~0.0005%. The Golem's Heart can ONLY drop
// from an actual Golem boss KILL. We roll each un-owned pet independently, rarest first, and grant the first hit.
export async function maybeGrantRaidPet(buyerId, { boss = false, killed = false } = {}) {
    if (!buyerId) return null;
    const owned = await ownedPetSet(buyerId);
    let eligible = COLLECTIBLES.filter(unlocked(buyerId)).filter((p) => p.raidExclusive && p.raidChance > 0 && !owned.has(p.id));
    if (!(boss && killed)) eligible = eligible.filter((p) => p.rarity !== "eternal"); // Golem's Heart = kill trophy only
    if (!eligible.length) return null;
    // Rarest first, so on a (near-impossible) double hit the scarcer pet wins.
    eligible.sort((a, b) => a.raidChance - b.raidChance);
    for (const p of eligible) {
        if (Math.random() < p.raidChance) return grantDrop(buyerId, p, "raid", { boss, killed });
    }
    return null;
}

// ── PETS THAT COME OFF A FIGHT AT SEA ────────────────────────────────────────────────────────────────────────
// Every other sailing pet falls out of a chest, which means the whole pet side of sailing rewarded DIGGING —
// you could own the Sea Wyrm without ever having run a gun out. These five are the other half: the only way to
// get one is to win, and the harder the thing you beat, the better your odds.
//
// The multiplier is the tier of what you sank, not your own level. Beating a fishing skiff for the hundredth
// time is not how you find the Bosun; it is 0.4x on a tier-1 and 2.4x on a tier-5, so the chase points at the
// fights people actually avoid.
const SEA_FIGHT_TIER_MULT = [0, 0.4, 0.8, 1.3, 1.8, 2.4];

export async function maybeGrantSeaFightPet(buyerId, { tier = 1 } = {}) {
    if (!buyerId) return null;
    const mult = SEA_FIGHT_TIER_MULT[Math.max(0, Math.min(5, Math.round(tier)))] ?? 1;
    if (mult <= 0) return null;
    const owned = await ownedPetSet(buyerId);
    const eligible = COLLECTIBLES
        .filter(unlocked(buyerId))
        .filter((p) => p.seaFightChance > 0 && !owned.has(p.id))
        // Rarest first, so a lucky roll that clears two thresholds pays the scarcer pet.
        .sort((a, b) => a.seaFightChance - b.seaFightChance);
    for (const p of eligible) {
        if (Math.random() < p.seaFightChance * mult) return grantDrop(buyerId, p, "sea_fight", { tier });
    }
    return null;
}
