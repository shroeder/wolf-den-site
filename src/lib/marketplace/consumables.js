import "server-only";

import { db } from "@/lib/db";
import { awardXp } from "@/lib/marketplace/xp.js";
import { itemById } from "@/lib/marketplace/items.js";
import { collectibleById } from "@/lib/marketplace/collectibles.js";
import { addPetXp, levelUpPet } from "@/lib/marketplace/pet-level.js";
import { getPetLevelSprite } from "@/lib/marketplace/pet-sprite.js";
import { previewShopCoupon, consumeShopCoupon, getShopCoupon, couponedPrice } from "@/lib/marketplace/shop-coupon.js";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { logCoin } from "@/lib/marketplace/coins.js";
import { applyGrowthTonic, grantSeedBundle, grantFarmFertilizer, grantHarvestLuckCharges, grantExtraPettings, grantExtraRatings } from "@/lib/marketplace/farm-consumables.js";
import { SEED_PACKS } from "@/lib/marketplace/seed-packs.js";

// CONSUMABLES — one-shot, SELF-USE boosts (the player uses them from their stash; no admin involvement).
// Three buyable flavors (potions/scrolls/stones) plus two ultra-rare "relics" that only drop from the top
// chests. Effect types the boss fight / gear system understand:
//   xp             → instant XP
//   strikes        → +N boss attacks TODAY (expires end of day)
//   damage         → ×mult boss damage for `hours` (your manual strikes)
//   recharge       → refill ALL charges on a chosen charged item (target)
//   reset_cooldown → clear the cooldown on a chosen charged item that still has a charge (target)
//   pet_xp         → feed the EQUIPPED pet a flat amount of pet-XP (levels it toward Lv5)
//   pet_level      → instantly bump the equipped pet up one level
//   spin_token     → grant N daily-wheel spins
//   spin_reset     → refresh the free daily spin (spin again today)
// Non-combat ACTIVITY effects (farming / petting / liking / sailing) — applied via the helpers in
// farm-consumables.js and the sail_* block:
//   farm_grow         → speed up your slowest-growing crop by `cut`
//   farm_seed         → grant `count` random crop seeds (weighted common)
//   farm_harvest_luck → bank `charges` harvest-luck charges (better harvest loot for the next N harvests)
//   farm_fertilizer   → grant `count` fertilizer
//   farm_petting      → +`amount` EXTRA own-pet pettings today
//   farm_rating       → +`amount` EXTRA farm-rating charges today
//   sail_tailwind     → buyable gust: shave `hours` off your current voyage
export const CONSUMABLES = {
    scroll_wisdom: { name: "Tome of Wisdom", emoji: "📜", kind: "scroll", desc: "Instantly gain 500 XP.", price: 1500, effect: { type: "xp", amount: 500 } },
    scroll_ancient: { name: "Ancient Codex", emoji: "📖", kind: "scroll", desc: "Instantly gain 2,000 XP.", price: 5000, effect: { type: "xp", amount: 2000 } },
    pot_adrenaline: { name: "Adrenaline Vial", emoji: "🧪", kind: "potion", desc: "Gain +2 manual daily strikes today.", price: 1200, effect: { type: "strikes", amount: 2 } },
    pot_secondwind: { name: "Second Wind", emoji: "🌀", kind: "potion", desc: "Gain +5 manual daily strikes today.", price: 3200, effect: { type: "strikes", amount: 5 } },
    pot_berserker: { name: "Berserker's Brew", emoji: "🍺", kind: "potion", desc: "DOUBLE your daily strike damage for 24 hours.", price: 4000, effect: { type: "damage", mult: 2, hours: 24 } },
    pot_fury: { name: "Bottled Fury", emoji: "🔥", kind: "potion", desc: "TRIPLE your daily strike damage for 6 hours.", price: 6500, effect: { type: "damage", mult: 3, hours: 6 } },
    stone_ember: { name: "Ember Stone", emoji: "🔴", kind: "stone", desc: "DOUBLE your daily strike damage for 12 hours.", price: 3500, effect: { type: "damage", mult: 2, hours: 12 } },
    stone_storm: { name: "Storm Crystal", emoji: "🔷", kind: "stone", desc: "Gain +3 manual daily strikes today.", price: 2000, effect: { type: "strikes", amount: 3 } },
    // ULTRA relics — no gold price (drop only from the highest chests). Applied to a charged item you pick.
    elixir_renewal: { name: "Elixir of Renewal", emoji: "⚗️", kind: "relic", price: null, target: "recharge", desc: "Fully RECHARGE all charges on one of your charged items.", effect: { type: "recharge" } },
    sands_of_time: { name: "Sands of Time", emoji: "⏳", kind: "relic", price: null, target: "cooldown", desc: "Instantly RESET the cooldown on a charged item that still has a charge left.", effect: { type: "reset_cooldown" } },
    // FORGE SCROLLS — used AT the Forge (not the generic use screen). The Power Scroll is a free enhancement (no
    // salvaged parts). The rarer Enchantment Scroll permanently adds an elemental affinity you pick (can exceed two).
    forge_power_scroll: { name: "Power Scroll", emoji: "📜", kind: "scroll", price: null, target: "forge", desc: "A free enhancement at the Forge — enhance a piece WITHOUT spending salvaged parts.", effect: { type: "forge_enhance" } },
    forge_enchant_scroll: { name: "Enchantment Scroll", emoji: "🪄", kind: "scroll", price: null, target: "forge", desc: "Permanently add an elemental affinity of your choice to a piece of gear (can extend it past two).", effect: { type: "forge_enchant" } },
    // PET TREATS — feed your EQUIPPED pet to level it up. Six buyable tiers + four drop-only.
    treat_bone: { name: "Pet Treat", emoji: "🦴", kind: "treat", desc: "Feed your equipped pet +25 pet XP.", price: 400, effect: { type: "pet_xp", amount: 25 } },
    treat_snack: { name: "Hearty Snack", emoji: "🍖", kind: "treat", desc: "Feed your equipped pet +75 pet XP.", price: 1000, effect: { type: "pet_xp", amount: 75 } },
    treat_toy: { name: "Chew Toy", emoji: "🧸", kind: "treat", desc: "Feed your equipped pet +150 pet XP.", price: 1800, effect: { type: "pet_xp", amount: 150 } },
    treat_feast: { name: "Pet Feast", emoji: "🍲", kind: "treat", desc: "Feed your equipped pet +300 pet XP.", price: 3200, effect: { type: "pet_xp", amount: 300 } },
    treat_golden: { name: "Golden Bone", emoji: "✨", kind: "treat", desc: "Feed your equipped pet +600 pet XP.", price: 6000, effect: { type: "pet_xp", amount: 600 } },
    treat_kibble: { name: "Legendary Kibble", emoji: "🥩", kind: "treat", desc: "Feed your equipped pet +1,200 pet XP.", price: 10000, effect: { type: "pet_xp", amount: 1200 } },
    // Drop-only pet treats (chests / boss).
    treat_wild: { name: "Wild Rations", emoji: "🌿", kind: "treat", price: null, desc: "Feed your equipped pet +400 pet XP.", effect: { type: "pet_xp", amount: 400 } },
    treat_marrow: { name: "Ancient Marrow", emoji: "🍥", kind: "treat", price: null, desc: "Feed your equipped pet +800 pet XP.", effect: { type: "pet_xp", amount: 800 } },
    treat_mythic: { name: "Mythic Morsel", emoji: "💎", kind: "treat", price: null, desc: "Feed your equipped pet +1,500 pet XP.", effect: { type: "pet_xp", amount: 1500 } },
    treat_ambrosia: { name: "Ambrosia", emoji: "🍯", kind: "treat", price: null, desc: "Instantly LEVEL UP your equipped pet.", effect: { type: "pet_level" } },
    // SAILING relics — drop-only one-shots that bend the sailing systems. Used from your stash; effects land on
    // your next voyage / dig / raid (see the sail_* handlers in useConsumable).
    sail_war_drum: { name: "War Drum", emoji: "🥁", kind: "relic", price: null, desc: "Beat the drums to regain one spent daily raid.", effect: { type: "sail_raid" } },
    sail_treasure_map: { name: "Treasure Map", emoji: "🗺️", kind: "relic", price: null, desc: "Your next voyage is guaranteed to meet the Gold Merchant.", effect: { type: "sail_merchant" } },
    sail_lucky_lure: { name: "Lucky Lure", emoji: "🎣", kind: "relic", price: null, desc: "Your next dig unearths +50% more fragments.", effect: { type: "sail_lure" } },
    sail_storm_bottle: { name: "Storm in a Bottle", emoji: "🌪️", kind: "relic", price: null, desc: "Uncork mid-voyage to HALVE the remaining sail time.", effect: { type: "sail_storm" } },
    sail_kraken_bait: { name: "Kraken Bait", emoji: "🦑", kind: "relic", price: null, desc: "Your next voyage is guaranteed a marine encounter.", effect: { type: "sail_encounter" } },
    // SPIN charges — feed the daily wheel. Tokens = extra spins; a rewind refreshes your free daily spin.
    spin_lucky_coin: { name: "Lucky Coin", emoji: "🎟️", kind: "spin", desc: "Gain +2 wheel spins.", price: 1500, effect: { type: "spin_token", amount: 2 } },
    spin_golden_ticket: { name: "Golden Ticket", emoji: "🎫", kind: "spin", price: null, desc: "Gain +5 wheel spins.", effect: { type: "spin_token", amount: 5 } },
    spin_rewind: { name: "Wheel Rewind", emoji: "⏪", kind: "spin", price: null, desc: "Refresh your FREE daily spin — spin again now.", effect: { type: "spin_reset" } },
    // FARM supplies — buyable boosts for the garden loop. Growth Tonic / Fertilizer Crate speed crops; Seed
    // Packet restocks the seed bag; Harvest Charm sweetens the next few harvests' loot rolls.
    farm_growth_tonic: { name: "Growth Tonic", emoji: "🧴", kind: "farm", desc: "Speed up your slowest-growing crop by 60%.", price: 600, effect: { type: "farm_grow", cut: 0.6 } },
    // Seed packs (farm_seed_packet / _crate / _vault) are injected below from SEED_PACKS — the tiered bags are
    // the only way to get seeds now.
    farm_harvest_charm: { name: "Harvest Charm", emoji: "🍀", kind: "farm", desc: "Your next 5 harvests roll for better loot.", price: 1200, effect: { type: "farm_harvest_luck", charges: 5 } },
    farm_fertilizer_crate: { name: "Fertilizer Crate", emoji: "📦", kind: "farm", desc: "A crate of 5 fertilizer for your crops.", price: 1500, effect: { type: "farm_fertilizer", count: 5 } },
    // Drop-only bumper crate — a bigger fertilizer haul from the better chests.
    farm_fertilizer_haul: { name: "Bumper Fertilizer Haul", emoji: "🚜", kind: "farm", price: null, desc: "A haul of 12 fertilizer for your crops.", effect: { type: "farm_fertilizer", count: 12 } },
    // PETTING & LIKING — small daily top-ups for the social farm loops.
    farm_pet_whistle: { name: "Pettin' Whistle", emoji: "🐕", kind: "farm", desc: "Grants +2 EXTRA pettings on your own pets today.", price: 400, effect: { type: "farm_petting", amount: 2 } },
    farm_kindness_token: { name: "Kindness Token", emoji: "💝", kind: "farm", desc: "Grants +2 EXTRA farm ratings you can give today.", price: 300, effect: { type: "farm_rating", amount: 2 } },
    // SAILING — BUYABLE so players can actually purchase into the sailing/dig/raid loops (the relics above are
    // all drop-only). Tailwind Charm speeds the current voyage; Prospector's Charm is a buyable dig-luck;
    // Raiding Horn a buyable raid restore.
    sail_tailwind_charm: { name: "Tailwind Charm", emoji: "🌬️", kind: "sail", desc: "Summon a gust — shave 2 hours off your current voyage.", price: 700, effect: { type: "sail_tailwind", hours: 2 } },
    sail_prospectors_charm: { name: "Prospector's Charm", emoji: "⛏️", kind: "sail", desc: "Your next dig unearths +50% more fragments.", price: 600, effect: { type: "sail_lure" } },
    sail_raiding_horn: { name: "Raiding Horn", emoji: "📯", kind: "sail", desc: "Sound the horn to regain one spent daily raid.", price: 900, effect: { type: "sail_raid" } },
};

// Inject the tiered seed packs from the shared catalog (single source of truth for tiers/weights/prices).
for (const p of SEED_PACKS) {
    CONSUMABLES[p.id] = { name: p.name, emoji: p.emoji, kind: "farm", desc: p.desc, price: p.price, effect: { type: "farm_seed", count: p.count, weights: p.weights } };
}

// Buyable order (shop). Relics + drop-only treats are intentionally excluded — they're chest/boss-only.
const SHOP_ORDER = [
    "scroll_wisdom", "scroll_ancient", "pot_adrenaline", "pot_secondwind", "pot_berserker", "pot_fury", "stone_ember", "stone_storm",
    "treat_bone", "treat_snack", "treat_toy", "treat_feast", "treat_golden", "treat_kibble",
    "spin_lucky_coin",
    // Non-combat activity supplies.
    "farm_growth_tonic", "farm_seed_packet", "farm_seed_crate", "farm_seed_vault", "farm_harvest_charm", "farm_fertilizer_crate", "farm_pet_whistle", "farm_kindness_token",
    "sail_tailwind_charm", "sail_prospectors_charm", "sail_raiding_horn",
];

// --- Boss-fight hooks (read by boss.js) -------------------------------------------------------------

export async function memberDamageMult(buyerId) {
    if (!buyerId) return 1;
    const rows = await db.query(`SELECT magnitude FROM mkt_user_boost WHERE buyer_id = $1 AND kind = 'damage' AND expires_at > NOW()`, [buyerId]).catch(() => []);
    return rows.reduce((m, r) => m * (Number(r.magnitude) || 1), 1);
}

export async function memberBonusStrikes(buyerId) {
    if (!buyerId) return 0;
    const row = await db.queryOne(`SELECT COALESCE(SUM(magnitude), 0)::int AS n FROM mkt_user_boost WHERE buyer_id = $1 AND kind = 'strikes' AND expires_at > NOW()`, [buyerId]).catch(() => null);
    return row?.n || 0;
}

export async function activeBoosts(buyerId) {
    if (!buyerId) return [];
    const rows = await db.query(`SELECT kind, magnitude, expires_at FROM mkt_user_boost WHERE buyer_id = $1 AND expires_at > NOW() ORDER BY expires_at ASC`, [buyerId]).catch(() => []);
    // Combine same-effect boosts into ONE line so multiple of the same thing read cleanly (e.g. two "+5
    // attacks" show as "+10 attacks today", not two identical badges).
    let strikeTotal = 0; let strikeExpiry = null;
    const damage = new Map(); // magnitude → { count, expiresAt }
    for (const r of rows) {
        if (r.kind === "strikes") { strikeTotal += Number(r.magnitude) || 0; strikeExpiry = r.expires_at; }
        else if (r.kind === "damage") { const m = Number(r.magnitude); const cur = damage.get(m) || { count: 0, expiresAt: r.expires_at }; cur.count += 1; cur.expiresAt = r.expires_at; damage.set(m, cur); }
    }
    const out = [];
    if (strikeTotal > 0) out.push({ kind: "strikes", magnitude: strikeTotal, expiresAt: strikeExpiry, label: `+${strikeTotal} attacks today` });
    for (const [m, info] of damage) out.push({ kind: "damage", magnitude: m, expiresAt: info.expiresAt, label: `${m}× damage${info.count > 1 ? ` (×${info.count})` : ""}` });
    return out;
}

// --- Stash + shop -----------------------------------------------------------------------------------

export async function listConsumables(buyerId) {
    if (!buyerId) return { gold: 0, shop: [], stash: [], chargedItems: [], active: [] };
    const [goldRow, ownRows, chargedRows, active, coupon] = await Promise.all([
        db.queryOne(`SELECT COALESCE(gold, 0) AS gold FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null),
        db.query(`SELECT consumable_id, count FROM mkt_user_consumable WHERE buyer_id = $1 AND count > 0`, [buyerId]).catch(() => []),
        db.query(`SELECT item_id, charges_left, last_charge_at FROM mkt_user_item WHERE buyer_id = $1`, [buyerId]).catch(() => []),
        activeBoosts(buyerId),
        getShopCoupon(buyerId).catch(() => null),
    ]);
    const gold = goldRow?.gold || 0;
    const shop = SHOP_ORDER.filter((id) => CONSUMABLES[id]?.price != null).map((id) => {
        const c = CONSUMABLES[id];
        // effectivePrice folds in an active coupon so the shown price + affordability match the actual charge.
        const effectivePrice = couponedPrice(coupon, c.price);
        return { id, name: c.name, emoji: c.emoji, kind: c.kind, desc: c.desc, price: c.price, effectivePrice, discounted: effectivePrice < c.price, canAfford: gold >= effectivePrice };
    });
    const stash = ownRows.map((r) => {
        const c = CONSUMABLES[r.consumable_id];
        if (!c) return null;
        return { id: r.consumable_id, name: c.name, emoji: c.emoji, kind: c.kind, desc: c.desc, count: r.count, target: c.target || null };
    }).filter(Boolean);
    // The member's charged gear, for the recharge / cooldown-reset target pickers.
    const now = Date.now();
    const chargedItems = chargedRows.map((r) => {
        const def = itemById(r.item_id);
        if (!def?.charged) return null;
        const left = Math.max(0, r.charges_left ?? 0);
        const cd = Math.max(0, def.cooldownDays || 0);
        const readyAt = r.last_charge_at ? new Date(r.last_charge_at).getTime() + cd * 86400000 : 0;
        const onCooldown = left > 0 && readyAt > now;
        return { id: def.id, name: def.name, icon: def.icon, rarity: def.rarity, chargesLeft: left, maxCharges: def.charges || 0, full: left >= (def.charges || 0), onCooldown, cooldownUntil: onCooldown ? new Date(readyAt).toISOString() : null };
    }).filter(Boolean);
    return { gold, shop, stash, chargedItems, active, coupon };
}

// Grant a consumable (chest drop / owner). Best-effort.
export async function grantConsumable(buyerId, id, n = 1) {
    if (!buyerId || !CONSUMABLES[id]) return;
    await db.query(
        `INSERT INTO mkt_user_consumable (buyer_id, consumable_id, count) VALUES ($1, $2, $3)
         ON CONFLICT (buyer_id, consumable_id) DO UPDATE SET count = mkt_user_consumable.count + $3`,
        [buyerId, id, n]
    ).catch(() => {});
}

export async function buyConsumable(buyerId, id) {
    const c = CONSUMABLES[id];
    if (!buyerId || !c || c.price == null) return { ok: false, error: "not_for_sale" };
    const cp = await previewShopCoupon(buyerId, c.price); // apply a login coupon if one's active
    const row = await db.queryOne(`UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`, [buyerId, cp.price]).catch(() => null);
    if (!row) return { ok: false, error: "not_enough_gold" };
    await logCoin(buyerId, -cp.price, "buy_consumable", { meta: { name: c.name }, balanceAfter: row.gold }).catch(() => {});
    if (cp.pct > 0) await consumeShopCoupon(buyerId);
    await grantConsumable(buyerId, id, 1);
    await trackActivity(buyerId, "buy_consumable", { id, name: c.name, couponPct: cp.pct || 0 });
    return { ok: true, gold: row.gold, couponPct: cp.pct || 0 };
}

// Use one from the stash. Targeted relics (recharge / reset) take a charged item id; validated BEFORE the
// consumable is spent so a bad target never wastes it.
export async function useConsumable(buyerId, id, targetItemId = null, targetPetId = null) {
    const c = CONSUMABLES[id];
    if (!buyerId || !c) return { ok: false, error: "unknown" };
    const e = c.effect;

    // Forge scrolls are consumed at the Forge (they need the enhance flow / an item+element picker), not here.
    if (e.type === "forge_enhance" || e.type === "forge_enchant") return { ok: false, error: "use_at_forge" };

    if (e.type === "recharge" || e.type === "reset_cooldown") {
        const def = itemById(targetItemId);
        if (!def?.charged) return { ok: false, error: "bad_target" };
        const row = await db.queryOne(`SELECT charges_left, last_charge_at FROM mkt_user_item WHERE buyer_id = $1 AND item_id = $2`, [buyerId, targetItemId]).catch(() => null);
        if (!row) return { ok: false, error: "target_not_owned" };
        if (e.type === "recharge") {
            if ((row.charges_left ?? 0) >= (def.charges || 0)) return { ok: false, error: "already_full" };
        } else {
            const cd = Math.max(0, def.cooldownDays || 0);
            const readyAt = row.last_charge_at ? new Date(row.last_charge_at).getTime() + cd * 86400000 : 0;
            if (!((row.charges_left ?? 0) > 0 && readyAt > Date.now())) return { ok: false, error: "not_on_cooldown" };
        }
        const dec = await db.queryOne(`UPDATE mkt_user_consumable SET count = count - 1 WHERE buyer_id = $1 AND consumable_id = $2 AND count > 0 RETURNING count`, [buyerId, id]).catch(() => null);
        if (!dec) return { ok: false, error: "none_owned" };
        await trackActivity(buyerId, "use_consumable", { id, name: c.name });
        if (e.type === "recharge") {
            await db.query(`UPDATE mkt_user_item SET charges_left = $3 WHERE buyer_id = $1 AND item_id = $2`, [buyerId, targetItemId, def.charges || 0]).catch(() => {});
            return { ok: true, remaining: dec.count, name: c.name, emoji: c.emoji, applied: `${def.name} fully recharged — ${def.charges} charges` };
        }
        await db.query(`UPDATE mkt_user_item SET last_charge_at = NULL WHERE buyer_id = $1 AND item_id = $2`, [buyerId, targetItemId]).catch(() => {});
        return { ok: true, remaining: dec.count, name: c.name, emoji: c.emoji, applied: `${def.name} cooldown reset — ready to redeem now` };
    }

    // Pet treats feed a pet — the EQUIPPED one by default, or a specific `targetPetId` (e.g. fed from the
    // farm). Validate a pet is chosen BEFORE spending so a treat is never wasted. (The caller is responsible
    // for verifying the target pet is owned.)
    if (e.type === "pet_xp" || e.type === "pet_level") {
        let petId = targetPetId || null;
        if (!petId) {
            const buyer = await db.queryOne(`SELECT featured_collectible FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
            petId = buyer?.featured_collectible;
        }
        if (!petId) return { ok: false, error: "no_pet_equipped" };
        const petName = collectibleById(petId)?.name || "your pet";
        const dec = await db.queryOne(`UPDATE mkt_user_consumable SET count = count - 1 WHERE buyer_id = $1 AND consumable_id = $2 AND count > 0 RETURNING count`, [buyerId, id]).catch(() => null);
        if (!dec) return { ok: false, error: "none_owned" };
        let res;
        if (e.type === "pet_level") {
            res = await levelUpPet(buyerId, petId).catch(() => ({ ok: false }));
        } else {
            res = await addPetXp(buyerId, petId, e.amount).catch(() => ({ ok: false }));
        }
        await trackActivity(buyerId, "use_consumable", { id, name: c.name, petId }).catch(() => {});
        const leveled = e.type === "pet_level" ? Boolean(res?.ok) : Boolean(res?.leveled);
        const applied = e.type === "pet_level"
            ? (res?.ok ? `${petName} leveled up to Lv ${res.level}! ⬆️` : `${petName} is already max level`)
            : `+${e.amount.toLocaleString()} pet XP to ${petName}${res?.leveled ? ` — Lv ${res.level}! ⬆️` : ""}`;
        // Structured level-up payload so the client can fire the full celebration (not a tiny text line).
        // Include the LEVEL-appropriate sprite so the reveal shows the pet you just evolved into, not the Lv1 base.
        let petLevelUp = null;
        if (leveled) {
            const art = await getPetLevelSprite(petId, res.level).catch(() => null);
            petLevelUp = { petId, petName, level: res.level, rarity: collectibleById(petId)?.rarity || "common", maxed: res.level >= 5, spriteUrl: art?.url || null, spriteFlip: Boolean(art?.flip) };
        }
        return { ok: true, remaining: dec.count, name: c.name, emoji: c.emoji, applied, petLevelUp, petXpGain: e.type === "pet_xp" ? e.amount : null };
    }

    // Sailing relics — effects land on the sailing row. Validate context BEFORE spending so a relic is never wasted.
    if (e.type?.startsWith("sail_")) {
        await db.query(`INSERT INTO mkt_sailing (buyer_id) VALUES ($1) ON CONFLICT (buyer_id) DO NOTHING`, [buyerId]).catch(() => {});
        const s = await db.queryOne(`SELECT returns_at, dig_state, raid_count, (raid_day = (NOW() AT TIME ZONE 'America/Chicago')::date) AS raid_today FROM mkt_sailing WHERE buyer_id = $1`, [buyerId]).catch(() => null);
        if (e.type === "sail_raid" && !(s?.raid_today && (s?.raid_count || 0) > 0)) return { ok: false, error: "no_raid_used" };
        const midVoyage = s?.returns_at && !s?.dig_state && new Date(s.returns_at).getTime() > Date.now();
        if (e.type === "sail_storm" && !midVoyage) return { ok: false, error: "not_sailing" };
        if (e.type === "sail_tailwind" && !midVoyage) return { ok: false, error: "not_sailing" };
        const dec = await db.queryOne(`UPDATE mkt_user_consumable SET count = count - 1 WHERE buyer_id = $1 AND consumable_id = $2 AND count > 0 RETURNING count`, [buyerId, id]).catch(() => null);
        if (!dec) return { ok: false, error: "none_owned" };
        let applied = "";
        if (e.type === "sail_raid") { await db.query(`UPDATE mkt_sailing SET raid_count = GREATEST(0, raid_count - 1) WHERE buyer_id = $1`, [buyerId]).catch(() => {}); applied = "One daily raid restored — go raiding!"; }
        else if (e.type === "sail_merchant") { await db.query(`UPDATE mkt_sailing SET force_merchant = TRUE WHERE buyer_id = $1`, [buyerId]).catch(() => {}); applied = "Your next voyage will meet the Gold Merchant."; }
        else if (e.type === "sail_lure") { await db.query(`UPDATE mkt_sailing SET dig_lure = TRUE WHERE buyer_id = $1`, [buyerId]).catch(() => {}); applied = "Your next dig will turn up +50% fragments."; }
        else if (e.type === "sail_storm") { await db.query(`UPDATE mkt_sailing SET returns_at = NOW() + (returns_at - NOW()) / 2 WHERE buyer_id = $1 AND returns_at > NOW()`, [buyerId]).catch(() => {}); applied = "The storm hurls you homeward — sail time halved!"; }
        else if (e.type === "sail_tailwind") { const h = Math.max(1, Number(e.hours) || 2); await db.query(`UPDATE mkt_sailing SET returns_at = GREATEST(NOW(), returns_at - ($2 || ' hours')::interval) WHERE buyer_id = $1 AND dig_state IS NULL AND returns_at > NOW()`, [buyerId, String(h)]).catch(() => {}); applied = `A strong gust fills your sails — ${h} hours shaved off the voyage!`; }
        else if (e.type === "sail_encounter") { await db.query(`UPDATE mkt_sailing SET force_encounter = TRUE WHERE buyer_id = $1`, [buyerId]).catch(() => {}); applied = "Something stirs the deep — your next voyage brings an encounter."; }
        await trackActivity(buyerId, "use_consumable", { id, name: c.name }).catch(() => {});
        return { ok: true, remaining: dec.count, name: c.name, emoji: c.emoji, applied };
    }

    // Non-combat ACTIVITY consumables (farming / petting / liking). All self-use, no target picker — Growth
    // Tonic auto-picks your slowest crop; the rest grant supplies or extra daily charges. Validate context
    // (only Growth Tonic needs a growing crop) BEFORE spending so an item is never wasted.
    if (e.type?.startsWith("farm_")) {
        if (e.type === "farm_grow") {
            const growing = await db.queryOne(`SELECT 1 AS ok FROM mkt_farm_plot WHERE buyer_id = $1 AND ready_at > NOW() LIMIT 1`, [buyerId]).catch(() => null);
            if (!growing) return { ok: false, error: "no_growing_crop" };
        }
        const decF = await db.queryOne(`UPDATE mkt_user_consumable SET count = count - 1 WHERE buyer_id = $1 AND consumable_id = $2 AND count > 0 RETURNING count`, [buyerId, id]).catch(() => null);
        if (!decF) return { ok: false, error: "none_owned" };
        let appliedF = "";
        if (e.type === "farm_grow") {
            const pct = Math.round((e.cut ?? 0.6) * 100);
            const res = await applyGrowthTonic(buyerId, e.cut ?? 0.6).catch(() => null);
            appliedF = res ? `${res.emoji} ${res.name} surges ahead — ${pct}% of its grow time gone!` : "Crop growth sped up!";
        } else if (e.type === "farm_seed") {
            const res = await grantSeedBundle(buyerId, e.count ?? 3, e.weights).catch(() => null);
            const list = res?.got?.map((g) => `${g.emoji} ${g.name}${g.count > 1 ? ` ×${g.count}` : ""}`).join(", ");
            appliedF = list ? `Seeds added: ${list}` : `+${e.count ?? 3} seeds added to your bag`;
        } else if (e.type === "farm_fertilizer") {
            const res = await grantFarmFertilizer(buyerId, e.count ?? 5).catch(() => null);
            appliedF = `+${res?.count ?? e.count ?? 5} fertilizer added to your stock 📦`;
        } else if (e.type === "farm_harvest_luck") {
            const res = await grantHarvestLuckCharges(buyerId, e.charges ?? 5).catch(() => null);
            appliedF = `🍀 Your next ${res?.count ?? e.charges ?? 5} harvests will roll for better loot`;
        } else if (e.type === "farm_petting") {
            const res = await grantExtraPettings(buyerId, e.amount ?? 2).catch(() => null);
            appliedF = `+${res?.count ?? e.amount ?? 2} extra pettings today 🐾`;
        } else if (e.type === "farm_rating") {
            const res = await grantExtraRatings(buyerId, e.amount ?? 2).catch(() => null);
            appliedF = `+${res?.count ?? e.amount ?? 2} extra farm ratings today 💝`;
        }
        await trackActivity(buyerId, "use_consumable", { id, name: c.name }).catch(() => {});
        return { ok: true, remaining: decF.count, name: c.name, emoji: c.emoji, applied: appliedF };
    }

    const dec = await db.queryOne(`UPDATE mkt_user_consumable SET count = count - 1 WHERE buyer_id = $1 AND consumable_id = $2 AND count > 0 RETURNING count`, [buyerId, id]).catch(() => null);
    if (!dec) return { ok: false, error: "none_owned" };
    let applied = "";
    if (e.type === "spin_token") {
        await db.query(`UPDATE mkt_buyer SET spin_tokens = spin_tokens + $2 WHERE id = $1`, [buyerId, e.amount]).catch(() => {});
        applied = `+${e.amount} wheel spin${e.amount > 1 ? "s" : ""}`;
    } else if (e.type === "spin_reset") {
        await db.query(`UPDATE mkt_buyer SET free_spin_day = NULL WHERE id = $1`, [buyerId]).catch(() => {});
        applied = "free daily spin refreshed — spin again!";
    } else if (e.type === "xp") {
        // gold: 0 — XP ONLY. awardXp defaults gold to track XP 1:1, so an XP scroll paid GOLD back on top of
        // the XP, and with the town/market/hangout multipliers it paid back more than the scroll cost:
        //
        //     Ancient Codex — costs 5,000 gold, grants 2,000 XP, refunded ~8,000 gold. Net +3,000 a use.
        //     Tome of Wisdom — costs 1,500, grants 500 XP, refunded ~2,000. Net +500 a use.
        //
        // Both were an unbounded money printer at roughly one use per second. One member reached 9.5M XP and
        // 3.5M gold this way — 270x the next player — which is not a clever exploit so much as us paying people
        // to press a button.
        //
        // This is exactly the case the `gold` parameter already exists for: trades pass gold: 0 "so we don't
        // hand out spendable currency for a payout we already paid the customer for". A scroll is the same
        // shape — they PAID gold for it; handing gold back is refunding the purchase and then some.
        await awardXp(buyerId, "consumable", { points: e.amount, gold: 0, meta: { consumable: id } }).catch(() => {});
        applied = `+${e.amount.toLocaleString()} XP`;
    } else if (e.type === "strikes") {
        // Expire at the next STORE-LOCAL (America/Chicago) midnight — the same boundary the boss swing counter
        // resets on. Using UTC midnight let an evening-bought potion stay active past the Chicago-day rollover,
        // so its bonus strikes counted toward TWO days ("+N today" applied twice). Align them so it's one day.
        await db.query(
            `INSERT INTO mkt_user_boost (buyer_id, kind, magnitude, expires_at)
             VALUES ($1, 'strikes', $2, (date_trunc('day', NOW() AT TIME ZONE 'America/Chicago') + interval '1 day') AT TIME ZONE 'America/Chicago')`,
            [buyerId, e.amount]
        ).catch(() => {});
        applied = `+${e.amount} manual daily strikes today`;
    } else if (e.type === "damage") {
        await db.query(`INSERT INTO mkt_user_boost (buyer_id, kind, magnitude, expires_at) VALUES ($1, 'damage', $2, NOW() + ($3 || ' hours')::interval)`, [buyerId, e.mult, String(e.hours)]).catch(() => {});
        applied = `${e.mult}× boss damage for ${e.hours}h`;
    }
    // Every other branch above tracks its use; this one never did, so spin tokens, XP scrolls, strike potions
    // and damage potions were all invisible to telemetry. That's how 1,213 XP-scroll uses in 90 minutes left no
    // trace on the admin screens — the only record was the coin ledger, and you had to already suspect
    // something to go looking there. An action that moves currency should always be visible as an action.
    await trackActivity(buyerId, "use_consumable", { id, name: c.name }).catch(() => {});
    return { ok: true, remaining: dec.count, name: c.name, emoji: c.emoji, applied };
}
