import "server-only";

import { db } from "@/lib/db";
import { grantItem } from "@/lib/marketplace/inventory.js";
import { ITEMS } from "@/lib/marketplace/items.js";
import { CONSUMABLES, grantConsumable } from "@/lib/marketplace/consumables.js";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { maybeGrantChestPet } from "@/lib/marketplace/pet-drops.js";
import { signatureFor } from "@/lib/marketplace/signatures.js";
import { levelForXp } from "@/lib/marketplace/xp.js";
import { getChestArt } from "@/lib/marketplace/chest-art.js";

// Loot chests: earned on level-up, opened for random gear. Higher tiers weight toward rarer loot.
export const CHEST_TIERS = {
    wooden: { label: "Wooden Chest", emoji: "📦", color: "#b08a52", weights: { common: 68, rare: 27, epic: 5 } },
    iron: { label: "Iron Chest", emoji: "🧰", color: "#9fb3c8", weights: { common: 34, rare: 42, epic: 21, legendary: 3 } },
    gold: { label: "Gold Chest", emoji: "💰", color: "#ffd75e", weights: { rare: 30, epic: 47, legendary: 20, mythic: 3 } },
    mythic: { label: "Mythic Chest", emoji: "💎", color: "#5affaf", weights: { epic: 36, legendary: 48, mythic: 16 } },
    // Elite chests — the ONLY source of Ascendant/Eternal gear. Never from level-ups; awarded for elite
    // boss performance (tiny chance) or by the owner. Each opens to a guaranteed elite-tier item.
    ascendant: { label: "Ascendant Chest", emoji: "🌟", color: "#ff7a3c", weights: { ascendant: 100 } },
    eternal: { label: "Eternal Chest", emoji: "👑", color: "#ff5cc8", weights: { eternal: 100 } },
    // The two rarest chests in the game — top-tier gear PLUS the best shot at ultra-rare relic consumables.
    celestial: { label: "Celestial Chest", emoji: "🌌", color: "#7c5cff", weights: { ascendant: 55, eternal: 45 } },
    primordial: { label: "Primordial Chest", emoji: "☀️", color: "#ffe9b0", weights: { eternal: 100 } },
};
export const CHEST_ORDER = ["wooden", "iron", "gold", "mythic", "ascendant", "eternal", "celestial", "primordial"];

// Gold consolation ("dust") when you already own every eligible item of the rolled rarity.
const DUST = { common: 25, rare: 60, epic: 140, legendary: 350, mythic: 900, ascendant: 3000, eternal: 8000, celestial: 15000, primordial: 40000 };

// Items a chest can produce (all non-charged loot gear). Charged/perk + level/shop items stay off the table.
const CHEST_POOL = ITEMS.filter((i) => (i.source === "chest" || i.source === "boss_drop") && !i.charged);
// Elite pool — the Ascendant/Eternal gear (charged, so it's excluded from the normal pool above). Only
// reachable by opening an elite chest.
const ELITE_POOL = ITEMS.filter((i) => i.source === "elite");
const ELITE_TIERS = new Set(["ascendant", "eternal", "celestial", "primordial"]);

// Chance a high-tier chest yields a CONSUMABLE instead of gear (+ which pool). The ultra relics
// (Elixir of Renewal / Sands of Time) only appear from Eternal chests and up.
const CHEST_CONSUMABLES = {
    wooden: { chance: 0.06, pool: ["treat_bone", "treat_wild"] },
    iron: { chance: 0.08, pool: ["treat_wild", "treat_bone", "treat_snack"] },
    gold: { chance: 0.1, pool: ["treat_wild", "treat_marrow", "treat_snack", "spin_rewind"] },
    mythic: { chance: 0.12, pool: ["pot_berserker", "stone_ember", "pot_secondwind", "treat_marrow", "treat_mythic", "spin_golden_ticket"] },
    ascendant: { chance: 0.2, pool: ["pot_fury", "pot_berserker", "stone_storm", "scroll_ancient", "treat_mythic", "spin_golden_ticket"] },
    eternal: { chance: 0.32, pool: ["pot_fury", "scroll_ancient", "elixir_renewal", "sands_of_time", "treat_mythic", "treat_ambrosia", "spin_golden_ticket"] },
    celestial: { chance: 0.55, pool: ["elixir_renewal", "sands_of_time", "pot_fury", "scroll_ancient", "treat_ambrosia"] },
    primordial: { chance: 0.75, pool: ["elixir_renewal", "sands_of_time", "treat_ambrosia"] },
};

// Level-up chests are deliberately CAPPED at Gold (never Mythic) and reach the higher tiers later, so
// leveling doesn't firehose legendary/mythic gear. Rarer loot comes from OPENING those chests, the boss,
// and elite grants — not from the level-up cadence itself.
function tierForLevel(level) {
    if (level >= 35) return "gold"; // cap — no Mythic chests from level-ups
    if (level >= 15) return "iron";
    return "wooden";
}

function rollRarity(weights) {
    const total = Object.values(weights).reduce((s, w) => s + w, 0);
    let r = Math.random() * total;
    for (const [rarity, w] of Object.entries(weights)) { r -= w; if (r <= 0) return rarity; }
    return Object.keys(weights)[0];
}

export async function addChests(buyerId, tally) {
    for (const [t, n] of Object.entries(tally)) {
        if (!n) continue;
        await db.query(
            `INSERT INTO mkt_user_chest (buyer_id, tier, count) VALUES ($1, $2, $3)
             ON CONFLICT (buyer_id, tier) DO UPDATE SET count = mkt_user_chest.count + $3`,
            [buyerId, t, n]
        ).catch(() => {});
    }
}

// Grant loot chests for level-ups. CONSERVATIVE: no retroactive flood — the first time we see a member we
// seed chest_level to their current level and give a single welcome chest; from then on each NEW level-up
// grants one chest (tier scales with the level reached).
export async function syncLevelChests(buyerId) {
    if (!buyerId) return {};
    const row = await db.queryOne(`SELECT COALESCE(xp,0) AS xp, COALESCE(chest_level,0) AS chest_level FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    if (!row) return {};
    const level = levelForXp(row.xp).level;

    // First encounter: seed to current level, one welcome chest, NO back-fill.
    if (row.chest_level === 0) {
        const tally = { [tierForLevel(level)]: 1 };
        await addChests(buyerId, tally);
        await db.query(`UPDATE mkt_buyer SET chest_level = $2 WHERE id = $1`, [buyerId, level]).catch(() => {});
        return tally;
    }

    if (level <= row.chest_level) return {};
    const tally = {};
    for (let L = row.chest_level + 1; L <= level; L++) {
        const t = tierForLevel(L);
        tally[t] = (tally[t] || 0) + 1;
    }
    await addChests(buyerId, tally);
    await db.query(`UPDATE mkt_buyer SET chest_level = $2 WHERE id = $1`, [buyerId, level]).catch(() => {});
    return tally;
}

// Current chest counts by tier (syncs owed chests first).
export async function getChests(buyerId) {
    if (!buyerId) return [];
    await syncLevelChests(buyerId).catch(() => {});
    const [rows, art] = await Promise.all([
        db.query(`SELECT tier, count FROM mkt_user_chest WHERE buyer_id = $1 AND count > 0`, [buyerId]).catch(() => []),
        getChestArt().catch(() => ({})),
    ]);
    const counts = Object.fromEntries(rows.map((r) => [r.tier, r.count]));
    return CHEST_ORDER.filter((t) => counts[t]).map((t) => ({ tier: t, count: counts[t], ...CHEST_TIERS[t], image: art[t] || null }));
}

// Open one chest of a tier: roll a rarity, grant a random un-owned item of it (or gold dust if you own
// them all). Returns the reveal for the animation.
export async function openChest(buyerId, tier) {
    const def = CHEST_TIERS[tier];
    if (!def) return { ok: false, error: "unknown_tier" };
    const dec = await db.queryOne(`UPDATE mkt_user_chest SET count = count - 1 WHERE buyer_id = $1 AND tier = $2 AND count > 0 RETURNING count`, [buyerId, tier]).catch(() => null);
    if (!dec) return { ok: false, error: "no_chest" };
    await trackActivity(buyerId, "open_chest", { tier });

    // A chance at a companion PET from this chest tier — the standout reveal.
    const petDrop = await maybeGrantChestPet(buyerId, tier).catch(() => null);
    if (petDrop) return { ok: true, remaining: dec.count, pet: petDrop };

    // High-tier chests can cough up a consumable instead of gear (this is the main way to get relics).
    const cc = CHEST_CONSUMABLES[tier];
    if (cc && Math.random() < cc.chance) {
        const cid = cc.pool[Math.floor(Math.random() * cc.pool.length)];
        await grantConsumable(buyerId, cid);
        const c = CONSUMABLES[cid];
        return { ok: true, remaining: dec.count, consumable: { id: cid, name: c.name, emoji: c.emoji, kind: c.kind, desc: c.desc } };
    }

    const ownedRows = await db.query(`SELECT item_id FROM mkt_user_item WHERE buyer_id = $1`, [buyerId]).catch(() => []);
    const owned = new Set(ownedRows.map((r) => r.item_id));
    const rarity = rollRarity(def.weights);
    // Elite chests draw from the elite (charged) pool; everything else from the normal loot pool.
    const pool = ELITE_TIERS.has(tier) ? ELITE_POOL : CHEST_POOL;
    // Prefer the rolled rarity; if you own them all, widen to any un-owned pool item before falling to dust.
    let candidates = pool.filter((i) => i.rarity === rarity && !owned.has(i.id));
    if (!candidates.length) candidates = pool.filter((i) => !owned.has(i.id));
    if (candidates.length) {
        const item = candidates[Math.floor(Math.random() * candidates.length)];
        await grantItem(buyerId, item.id, ELITE_TIERS.has(tier) ? "elite" : "chest");
        return { ok: true, remaining: dec.count, item: { id: item.id, name: item.name, rarity: item.rarity, slot: item.slot, icon: item.icon, stats: item.stats, reqLevel: item.reqLevel, signature: signatureFor(item.id), charged: Boolean(item.charged), chargeReward: item.chargeRewardLabel || null } };
    }
    const gold = DUST[rarity] || 25;
    await db.query(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1`, [buyerId, gold]).catch(() => {});
    return { ok: true, remaining: dec.count, gold, rarity };
}
