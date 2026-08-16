import "server-only";

import { db } from "@/lib/db";

// ── UTILITY AFFIXES ("attunements") ──────────────────────────────────────────────────────────────────────────
// A rare bonus stat the FORGE can roll onto a piece of gear when you enhance it. Unlike combat stat_bonus, an
// attunement helps a SPIN-OFF feature (farm / pet / plaza raids / sailing / the forge itself). Each item holds at
// most ONE attunement; once rolled it becomes an UPGRADEABLE stat — a later lucky enhance bumps its level (up to
// UTIL_MAX) instead of adding a second one. Stored on mkt_item_enhance.util as { key, level }. Read by each
// feature via getEquippedUtilTotals so the affix actually DOES something. Rides with the item on trade/auction.

export const UTIL_MAX = 5;              // an attunement levels 1..5
// Base per-enhance chance to attune; grade + the Attunement forge upgrade raise it. Every contributor was cut
// to 0.4x on 2026-08-08 — stacked up they reached 22.5% a swing (0.04 base + 0.06 pixel + 5x2.5% track), so a
// "rare bonus" landed on roughly one enhance in four and everything ended up attuned. Now it tops out at 9%.
// Nothing else feeds this chance (no pet or badge grants `attune`), so scaling these three is exact.
export const UTIL_BASE_CHANCE = 0.016;

// bucket tells getEquippedUtilTotals where the value goes; `stat` is the sub-key inside farm/sea buckets.
// per = value per level, cap = max value. Farm/pet/raid/forge values are PERCENT; sea values are POINTS.
export const UTIL_AFFIXES = {
    // 🌾 FARM — feeds the unified farm-bonus aggregator (stacks with decorations/gear/pet/greenhouse, still capped)
    farm_harvest: { label: "Harvest Luck", icon: "🎁", per: 2, cap: 10, bucket: "farm", stat: "harvestLuck", blurb: "better harvest loot" },
    farm_grow: { label: "Green Thumb", icon: "🌱", per: 2, cap: 10, bucket: "farm", stat: "growSpeed", blurb: "faster crops" },
    farm_gold: { label: "Rich Soil", icon: "🪙", per: 2, cap: 10, bucket: "farm", stat: "goldHarvest", blurb: "more harvest gold" },
    farm_seed: { label: "Seed Saver", icon: "🍀", per: 2, cap: 10, bucket: "farm", stat: "seedLuck", blurb: "more saved seeds" },
    farm_fert: { label: "Fertile Touch", icon: "💧", per: 2, cap: 10, bucket: "farm", stat: "fertPower", blurb: "stronger fertilizer" },
    // 🐾 PET — a flat % boost to ALL equipped-pet XP gains
    pet_bond: { label: "Pet Bond", icon: "🐾", per: 3, cap: 15, bucket: "petXp", blurb: "more pet XP" },
    // ⚔️ PLAZA RAIDS — bonus % damage on every town raid strike
    raid_fury: { label: "Raid Fury", icon: "⚔️", per: 4, cap: 20, bucket: "raidDmg", blurb: "town-raid damage" },
    // ⛵ SAILING — granted as sea-affinity POINTS, converted to real effects by the sailing system
    dig_dredge: { label: "Dredge", icon: "⛏️", per: 1, cap: 5, bucket: "sea", stat: "dredge", blurb: "dig-tool procs" },
    sea_trove: { label: "Trove", icon: "💎", per: 1, cap: 5, bucket: "sea", stat: "trove", blurb: "more coin from a part-dug chest" },
    sea_wind: { label: "Tailwind", icon: "🌬️", per: 1, cap: 5, bucket: "sea", stat: "tailwind", blurb: "faster voyages + waves" },
    // ⚒️ FORGE — stacks on the Transmuter's Boon double-combine chance
    forge_yield: { label: "Forge Yield", icon: "⚗️", per: 1, cap: 5, bucket: "forgeYield", blurb: "double-combine chance" },
    // ── MINE attunements (DEPTHS affinity — see items.js DEPTH_META) ──
    depth_nerve: { label: "Nerve", icon: "🪨", per: 1, cap: 5, bucket: "depth", stat: "nerve", blurb: "the roof holds longer" },
    depth_hew: { label: "Hew", icon: "⛏️", per: 1, cap: 5, bucket: "depth", stat: "hew", blurb: "more ore per seam" },
    depth_bellows: { label: "Bellows", icon: "🌬️", per: 1, cap: 5, bucket: "depth", stat: "bellows", blurb: "extra parts from the furnace" },
};
export const UTIL_KEYS = Object.keys(UTIL_AFFIXES);

export function affixValue(key, level) {
    const def = UTIL_AFFIXES[key];
    if (!def) return 0;
    return Math.min(def.cap, def.per * Math.max(0, Math.min(UTIL_MAX, Number(level) || 0)));
}

// Parse the jsonb util column → { key, level } | null (drops unknown/retired keys safely).
export function parseUtil(v) {
    if (!v) return null;
    let u = v;
    if (typeof v === "string") { try { u = JSON.parse(v); } catch { return null; } }
    if (!u || !u.key || !UTIL_AFFIXES[u.key]) return null;
    return { key: u.key, level: Math.max(1, Math.min(UTIL_MAX, Number(u.level) || 1)) };
}

// A display shape for one attunement (for the forge reveal + gear cards).
export function describeUtil(u) {
    const p = parseUtil(u);
    if (!p) return null;
    const def = UTIL_AFFIXES[p.key];
    const val = affixValue(p.key, p.level);
    const unit = def.bucket === "sea" || def.bucket === "depth" ? "" : "%";
    return { key: p.key, level: p.level, maxed: p.level >= UTIL_MAX, label: def.label, icon: def.icon, value: val, unit, blurb: def.blurb, text: `${def.icon} +${val}${unit} ${def.label}` };
}

// The forge roll: given the item's current attunement and the total chance, decide the outcome. Returns
// { next: {key,level}|null (what to store), result: {key,level,isNew|upgraded}|null (what to celebrate) }.
export function rollUtil(curUtil, chanceVal) {
    const cur = parseUtil(curUtil);
    if (Math.random() >= chanceVal) return { next: cur, result: null };
    if (cur) {
        if (cur.level >= UTIL_MAX) return { next: cur, result: null }; // already maxed — nothing to gain
        const next = { key: cur.key, level: cur.level + 1 };
        return { next, result: { ...next, upgraded: true } };
    }
    const key = UTIL_KEYS[Math.floor(Math.random() * UTIL_KEYS.length)];
    const next = { key, level: 1 };
    return { next, result: { ...next, isNew: true } };
}

// Sum every EQUIPPED item's attunement into one totals object each feature reads.
//   { farm: {harvestLuck,...}, petXp: %, raidDmg: %, sea: {dredge,trove,tailwind}, forgeYield: % }
export async function getEquippedUtilTotals(buyerId) {
    const out = { farm: {}, petXp: 0, raidDmg: 0, sea: {}, depth: {}, forgeYield: 0 };
    if (!buyerId) return out;
    const eq = await db.query(`SELECT item_id FROM mkt_user_equipment WHERE buyer_id = $1`, [buyerId]).catch(() => []);
    const ids = eq.map((r) => r.item_id);
    if (!ids.length) return out;
    const rows = await db.query(`SELECT item_id, util FROM mkt_item_enhance WHERE buyer_id = $1 AND item_id = ANY($2) AND util IS NOT NULL`, [buyerId, ids]).catch(() => []);
    // The Attuned Bench counts every attunement at double its LEVEL, not double its value — so it runs through
    // affixValue the normal way and still respects each affix's own cap. A level-4 attunement reads as a 5 (the
    // ladder stops there), which is the honest reading of the card: doubling a maxed attunement cannot invent a
    // sixth rung that does not exist.
    const { equippedPowers } = await import("@/lib/marketplace/ascension-powers.js");
    const bench = (await equippedPowers(buyerId).catch(() => new Set())).has("attuned_bench");
    for (const r of rows) {
        const u = parseUtil(r.util);
        if (!u) continue;
        const def = UTIL_AFFIXES[u.key];
        const val = affixValue(u.key, bench ? u.level * 2 : u.level);
        if (def.bucket === "farm") out.farm[def.stat] = (out.farm[def.stat] || 0) + val;
        else if (def.bucket === "sea") out.sea[def.stat] = (out.sea[def.stat] || 0) + val;
        else if (def.bucket === "depth") out.depth[def.stat] = (out.depth[def.stat] || 0) + val;
        else if (def.bucket === "petXp") out.petXp += val;
        else if (def.bucket === "raidDmg") out.raidDmg += val;
        else if (def.bucket === "forgeYield") out.forgeYield += val;
    }
    return out;
}
