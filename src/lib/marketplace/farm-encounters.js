import "server-only";

import { db } from "@/lib/db";
import { logCoin } from "@/lib/marketplace/coins.js";
import { addChests, CHEST_TIERS } from "@/lib/marketplace/chests.js";
import { getChestArt } from "@/lib/marketplace/chest-art.js";
import { grantSeed, SEEDS } from "@/lib/marketplace/farm-crops.js";
import { awardXp } from "@/lib/marketplace/xp.js";
import { PART_TIERS } from "@/lib/marketplace/crafting.js";

// ── HARVEST CRITTER ENCOUNTERS ────────────────────────────────────────────────────────────────────────────
// A chance a friendly garden critter scurries over at harvest with a GIFT. Encounters are PURE UPSIDE — they
// never punish, there's no fight and no flee. You just shake the loot out of the critter: always XP + gold, plus
// one bonus reward (usually a seed, with a fair shot at a low-tier chest or some low-to-mid salvage parts). The
// reward is pre-rolled server-side at harvest time and parked on mkt_buyer.farm_encounter so it can't be faked;
// resolve reads+clears it atomically and grants exactly what was rolled.

// Base chance a harvest turns up a critter (before the plot's Warding Totem + a small rarer-crop bump). Modest
// so it feels like a treat, not every harvest.
const BASE_ENCOUNTER_CHANCE = 0.1;
const RARITY_BUMP = { common: 0, rare: 0.03, epic: 0.06, legendary: 0.1, mythic: 0.14 };

// Critters — weighted spawn. Rarer critters bring more XP + gold and better loot. `art` is the mkt_town_art key
// for its sprite. Loot is rolled from three buckets (seed / chest / parts) weighted by `loot`; the tiers/bands
// below scale the payout by critter.
const CREATURES = {
    rat: { name: "Field Mouse", emoji: "🐭", art: "enc_rat", weight: 40, xp: 8, gold: 90, seedBand: ["common"], chestTier: "wooden", partsTier: 1, partsMin: 1, partsMax: 2, loot: { seed: 70, chest: 10, parts: 20 } },
    crow: { name: "Crop Crow", emoji: "🐦", art: "enc_crow", weight: 28, xp: 12, gold: 150, seedBand: ["common"], chestTier: "wooden", partsTier: 1, partsMin: 1, partsMax: 2, loot: { seed: 69, chest: 11, parts: 20 } },
    raccoon: { name: "Masked Raccoon", emoji: "🦝", art: "enc_raccoon", weight: 18, xp: 18, gold: 210, seedBand: ["common", "rare"], chestTier: "iron", partsTier: 2, partsMin: 1, partsMax: 3, loot: { seed: 66, chest: 12, parts: 22 } },
    boar: { name: "Truffle Boar", emoji: "🐗", art: "enc_boar", weight: 10, xp: 26, gold: 340, seedBand: ["rare", "epic"], chestTier: "iron", partsTier: 2, partsMin: 2, partsMax: 3, loot: { seed: 63, chest: 13, parts: 24 } },
    scarecrow: { name: "Merry Scarecrow", emoji: "🎃", art: "enc_scarecrow", weight: 4, xp: 45, gold: 640, seedBand: ["rare", "epic"], chestTier: "gold", partsTier: 3, partsMin: 2, partsMax: 3, loot: { seed: 60, chest: 14, parts: 26 } },
    // ── Rarer critters — much scarcer, much richer. A real thrill when one shows up. ──
    fox: { name: "Sly Fox", emoji: "🦊", art: "enc_fox", weight: 3, xp: 65, gold: 900, seedBand: ["epic"], chestTier: "gold", partsTier: 3, partsMin: 2, partsMax: 4, loot: { seed: 58, chest: 14, parts: 28 } },
    owl: { name: "Wise Owl", emoji: "🦉", art: "enc_owl", weight: 2, xp: 95, gold: 1300, seedBand: ["epic", "legendary"], chestTier: "gold", partsTier: 4, partsMin: 2, partsMax: 4, loot: { seed: 57, chest: 15, parts: 28 } },
    stag: { name: "Golden Stag", emoji: "🦌", art: "enc_stag", weight: 1.2, xp: 140, gold: 1900, seedBand: ["legendary"], chestTier: "mythic", partsTier: 4, partsMin: 3, partsMax: 5, loot: { seed: 56, chest: 16, parts: 28 } },
    dragon: { name: "Garden Dragonling", emoji: "🐉", art: "enc_dragon", weight: 0.6, xp: 210, gold: 2800, seedBand: ["legendary", "mythic"], chestTier: "mythic", partsTier: 5, partsMin: 3, partsMax: 5, loot: { seed: 55, chest: 17, parts: 28 } },
    unicorn: { name: "Meadow Unicorn", emoji: "🦄", art: "enc_unicorn", weight: 0.3, xp: 320, gold: 4200, seedBand: ["mythic"], chestTier: "ascendant", partsTier: 5, partsMin: 4, partsMax: 6, loot: { seed: 54, chest: 18, parts: 28 } },
};
const CREATURE_KEYS = Object.keys(CREATURES);
// Public list (key + name + emoji) so the owner-debug UI can cycle through every critter to test each.
export const ENCOUNTER_CREATURES = CREATURE_KEYS.map((k) => ({ key: k, name: CREATURES[k].name, emoji: CREATURES[k].emoji }));

function weightedPick(weights) {
    const total = Object.values(weights).reduce((s, w) => s + w, 0);
    let r = Math.random() * total;
    for (const [k, w] of Object.entries(weights)) { if ((r -= w) < 0) return k; }
    return Object.keys(weights)[0];
}
function weightedCreature() {
    return weightedPick(Object.fromEntries(CREATURE_KEYS.map((k) => [k, CREATURES[k].weight])));
}

// One critter's sprite URL from mkt_town_art (best-effort → emoji fallback client-side).
async function critterSprite(art) {
    if (!art) return null;
    const row = await db.queryOne(`SELECT url FROM mkt_town_art WHERE art_key = $1`, [art]).catch(() => null);
    return row?.url || null;
}

// Actually grant a critter's reward (XP + gold + the one bonus). Returns the new gold balance.
async function grantEncounterReward(buyerId, key, xp, gold, loot) {
    const g = Math.max(0, Number(gold) || 0);
    const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`, [buyerId, g]).catch(() => null);
    await logCoin(buyerId, g, "farm_encounter", { balanceAfter: paid?.gold, meta: { creature: key } }).catch(() => {});
    if ((Number(xp) || 0) > 0) await awardXp(buyerId, "farm_encounter", { points: Math.max(0, Number(xp) || 0), gold: 0 }).catch(() => {});
    if (loot?.type === "seed" && loot.seed) await grantSeed(buyerId, loot.seed).catch(() => {});
    else if (loot?.type === "chest" && loot.chestTier) await addChests(buyerId, { [loot.chestTier]: 1 }, { source: "farm_encounter" }).catch(() => {});
    else if (loot?.type === "parts" && loot.partsTier) {
        await db.query(
            `INSERT INTO mkt_salvage_part (buyer_id, tier, count) VALUES ($1, $2, $3)
             ON CONFLICT (buyer_id, tier) DO UPDATE SET count = mkt_salvage_part.count + $3`,
            [buyerId, loot.partsTier, loot.partsN || 1]
        ).catch(() => {});
    }
    return { goldAfter: paid?.gold ?? null };
}

// Roll whether a harvest turns up a critter; if so PARK the pending encounter (critter + pre-rolled reward) on
// the member and return the public info the client needs to show it. `wardChance` is the plot's Warding Totem
// bonus (a fraction). Returns null when nothing shows up.
export async function maybeStartEncounter(buyerId, { rarity = "common", wardChance = 0, seedId = null, force = false, creature = null } = {}) {
    if (!buyerId) return null;
    const chance = Math.min(0.6, BASE_ENCOUNTER_CHANCE + (RARITY_BUMP[rarity] || 0) + (Number(wardChance) || 0));
    if (!force && Math.random() >= chance) return null;
    const key = (creature && CREATURES[creature]) ? creature : weightedCreature(); // owner debug can force a specific critter
    const c = CREATURES[key];
    // Pre-roll the bonus loot NOW (one bucket) so it can't be faked at resolve.
    const bucket = weightedPick(c.loot);
    let loot = null;
    if (bucket === "seed") {
        const band = c.seedBand[Math.floor(Math.random() * c.seedBand.length)];
        const pool = Object.keys(SEEDS).filter((id) => SEEDS[id].rarity === band);
        const sid = pool.length ? pool[Math.floor(Math.random() * pool.length)] : "wheat";
        loot = { type: "seed", seed: sid, label: `a ${SEEDS[sid]?.name || "mystery"} seed`, emoji: "🌱" };
    } else if (bucket === "chest") {
        // The tier's label already ENDS in "Chest" — appending the word again produced "a Wooden Chest chest".
        // And the chest has real painted art, so show the chest rather than a cardboard-box emoji.
        const art = await getChestArt().catch(() => ({}));
        loot = { type: "chest", chestTier: c.chestTier, label: `a ${CHEST_TIERS[c.chestTier]?.label || `${c.chestTier} chest`}`,
            emoji: CHEST_TIERS[c.chestTier]?.emoji || "🧰", sprite: art?.[c.chestTier] || null };
    } else {
        const n = c.partsMin + Math.floor(Math.random() * (c.partsMax - c.partsMin + 1));
        const pt = PART_TIERS.find((p) => p.tier === c.partsTier) || PART_TIERS[0];
        loot = { type: "parts", partsTier: c.partsTier, partsN: n, label: `${n}× ${pt.name}`, emoji: "⚙️", sprite: pt.sprite || null };
    }
    // GRANT the reward NOW (pure upside, pre-rolled) so it can NEVER be lost to a claim-call race — the modal is
    // purely the reveal. Park it flagged `granted` so resolve only clears it (no double-grant), and expose the
    // reward preview so the recap always shows exactly what landed.
    const grant = await grantEncounterReward(buyerId, key, c.xp, c.gold, loot);
    await db.query(`UPDATE mkt_buyer SET farm_encounter = $2::jsonb WHERE id = $1`, [buyerId, JSON.stringify({ key, xp: c.xp, gold: c.gold, loot, granted: true })]).catch(() => {});
    return { key, name: c.name, emoji: c.emoji, sprite: await critterSprite(c.art), crop: seedId ? (SEEDS[seedId]?.name || null) : null, reward: { xp: c.xp, gold: c.gold, loot, goldAfter: grant.goldAfter } };
}

// Dismiss the critter (the reward was already granted at spawn). Atomically clears the parked encounter and
// returns what was in it so the recap can echo it. Legacy pendings (parked before grant-at-spawn) are granted
// here as a fallback, so nothing is ever lost either way.
export async function resolveEncounter(buyerId) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const row = await db.queryOne(
        `UPDATE mkt_buyer SET farm_encounter = NULL WHERE id = $1 AND farm_encounter IS NOT NULL RETURNING farm_encounter`,
        [buyerId]
    ).catch(() => null);
    const pend = row?.farm_encounter;
    if (!pend) {
        // Already dismissed — the reward was granted at spawn, so this is fine. Hand back the current balance.
        const g = await db.queryOne(`SELECT COALESCE(gold, 0) AS gold FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
        return { ok: true, alreadyClaimed: true, goldAfter: g?.gold ?? null };
    }
    const c = CREATURES[pend.key] || CREATURES.rat;
    let goldAfter = null;
    if (!pend.granted) { // legacy pending → grant it now (one-time, transition safety)
        goldAfter = (await grantEncounterReward(buyerId, pend.key, pend.xp, pend.gold, pend.loot)).goldAfter;
    } else {
        const g = await db.queryOne(`SELECT COALESCE(gold, 0) AS gold FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
        goldAfter = g?.gold ?? null;
    }
    return { ok: true, creature: c.name, emoji: c.emoji, xp: pend.xp, gold: pend.gold, loot: pend.loot || null, goldAfter };
}
