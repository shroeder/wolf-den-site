import "server-only";

import { db } from "@/lib/db";
import { logCoin } from "@/lib/marketplace/coins.js";
import { addChests, CHEST_TIERS } from "@/lib/marketplace/chests.js";
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
    rat: { name: "Field Mouse", emoji: "🐭", art: "enc_rat", weight: 40, xp: 8, gold: 90, seedBand: ["common"], chestTier: "wooden", partsTier: 1, partsMin: 1, partsMax: 2, loot: { seed: 60, chest: 20, parts: 20 } },
    crow: { name: "Crop Crow", emoji: "🐦", art: "enc_crow", weight: 28, xp: 12, gold: 150, seedBand: ["common"], chestTier: "wooden", partsTier: 1, partsMin: 1, partsMax: 2, loot: { seed: 58, chest: 22, parts: 20 } },
    raccoon: { name: "Masked Raccoon", emoji: "🦝", art: "enc_raccoon", weight: 18, xp: 18, gold: 210, seedBand: ["common", "rare"], chestTier: "iron", partsTier: 2, partsMin: 1, partsMax: 3, loot: { seed: 54, chest: 24, parts: 22 } },
    boar: { name: "Truffle Boar", emoji: "🐗", art: "enc_boar", weight: 10, xp: 26, gold: 340, seedBand: ["rare", "epic"], chestTier: "iron", partsTier: 2, partsMin: 2, partsMax: 3, loot: { seed: 50, chest: 26, parts: 24 } },
    scarecrow: { name: "Merry Scarecrow", emoji: "🎃", art: "enc_scarecrow", weight: 4, xp: 45, gold: 640, seedBand: ["rare", "epic"], chestTier: "gold", partsTier: 3, partsMin: 2, partsMax: 3, loot: { seed: 46, chest: 28, parts: 26 } },
    // ── Rarer critters — much scarcer, much richer. A real thrill when one shows up. ──
    fox: { name: "Sly Fox", emoji: "🦊", art: "enc_fox", weight: 3, xp: 65, gold: 900, seedBand: ["epic"], chestTier: "gold", partsTier: 3, partsMin: 2, partsMax: 4, loot: { seed: 44, chest: 28, parts: 28 } },
    owl: { name: "Wise Owl", emoji: "🦉", art: "enc_owl", weight: 2, xp: 95, gold: 1300, seedBand: ["epic", "legendary"], chestTier: "gold", partsTier: 4, partsMin: 2, partsMax: 4, loot: { seed: 42, chest: 30, parts: 28 } },
    stag: { name: "Golden Stag", emoji: "🦌", art: "enc_stag", weight: 1.2, xp: 140, gold: 1900, seedBand: ["legendary"], chestTier: "mythic", partsTier: 4, partsMin: 3, partsMax: 5, loot: { seed: 40, chest: 32, parts: 28 } },
    dragon: { name: "Garden Dragonling", emoji: "🐉", art: "enc_dragon", weight: 0.6, xp: 210, gold: 2800, seedBand: ["legendary", "mythic"], chestTier: "mythic", partsTier: 5, partsMin: 3, partsMax: 5, loot: { seed: 38, chest: 34, parts: 28 } },
    unicorn: { name: "Meadow Unicorn", emoji: "🦄", art: "enc_unicorn", weight: 0.3, xp: 320, gold: 4200, seedBand: ["mythic"], chestTier: "ascendant", partsTier: 5, partsMin: 4, partsMax: 6, loot: { seed: 36, chest: 36, parts: 28 } },
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
        loot = { type: "chest", chestTier: c.chestTier, label: `a ${CHEST_TIERS[c.chestTier]?.label || c.chestTier} chest`, emoji: CHEST_TIERS[c.chestTier]?.emoji || "🧰" };
    } else {
        const n = c.partsMin + Math.floor(Math.random() * (c.partsMax - c.partsMin + 1));
        const pt = PART_TIERS.find((p) => p.tier === c.partsTier) || PART_TIERS[0];
        loot = { type: "parts", partsTier: c.partsTier, partsN: n, label: `${n}× ${pt.name}`, emoji: "⚙️", sprite: pt.sprite || null };
    }
    const pending = { key, xp: c.xp, gold: c.gold, loot };
    await db.query(`UPDATE mkt_buyer SET farm_encounter = $2::jsonb WHERE id = $1`, [buyerId, JSON.stringify(pending)]).catch(() => {});
    // Public info — includes the reward PREVIEW so the recap always shows what you got, even if the claim call
    // races (it's pure upside + pre-rolled, so there's nothing to hide). resolveEncounter does the actual grant.
    return { key, name: c.name, emoji: c.emoji, sprite: await critterSprite(c.art), crop: seedId ? (SEEDS[seedId]?.name || null) : null, reward: { xp: c.xp, gold: c.gold, loot } };
}

// Claim the parked critter's gift. Pure upside — always XP + gold + the pre-rolled bonus loot. Atomic claim so
// it pays out at most once. (No timing / perfect-hits: the tapping is just for juice.)
export async function resolveEncounter(buyerId) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const row = await db.queryOne(
        `UPDATE mkt_buyer SET farm_encounter = NULL WHERE id = $1 AND farm_encounter IS NOT NULL RETURNING farm_encounter`,
        [buyerId]
    ).catch(() => null);
    const pend = row?.farm_encounter;
    if (!pend) return { ok: false, error: "no_encounter" };
    const c = CREATURES[pend.key] || CREATURES.rat;
    const gold = Math.max(0, Number(pend.gold) || 0);
    const xp = Math.max(0, Number(pend.xp) || 0);
    const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`, [buyerId, gold]).catch(() => null);
    await logCoin(buyerId, gold, "farm_encounter", { balanceAfter: paid?.gold, meta: { creature: pend.key } }).catch(() => {});
    if (xp > 0) await awardXp(buyerId, "farm_encounter", { points: xp, gold: 0 }).catch(() => {});
    const loot = pend.loot || null;
    if (loot?.type === "seed" && loot.seed) await grantSeed(buyerId, loot.seed).catch(() => {});
    else if (loot?.type === "chest" && loot.chestTier) await addChests(buyerId, { [loot.chestTier]: 1 }, { source: "farm_encounter" }).catch(() => {});
    else if (loot?.type === "parts" && loot.partsTier) {
        await db.query(
            `INSERT INTO mkt_salvage_part (buyer_id, tier, count) VALUES ($1, $2, $3)
             ON CONFLICT (buyer_id, tier) DO UPDATE SET count = mkt_salvage_part.count + $3`,
            [buyerId, loot.partsTier, loot.partsN || 1]
        ).catch(() => {});
    }
    return { ok: true, creature: c.name, emoji: c.emoji, xp, gold, loot, goldAfter: paid?.gold ?? null };
}
