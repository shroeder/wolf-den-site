// ── EMIT src/lib/marketplace/grove-loot.js ───────────────────────────────────────────────────────────────────
// Writes the three-slot gear table for all 84 zones ONCE, as a literal, so it can be hand-edited afterwards.
// The draft script (grove-loot-draft.mjs) prints it to argue with; this one commits it.
//
// ⚠️ RUN IT ONCE. Re-running reassigns every row and throws away any hand-edit — the table is data, not a
// build artefact. It is kept here so the method is readable and so a NEW MAP can be appended, not so the
// file gets regenerated.
//
//   node scripts/gen-grove-loot.mjs
import fs from "node:fs";
import { register } from "node:module";

register("./lib/app-loader.mjs", import.meta.url);

const items = await import("@/lib/marketplace/items.js");
const sets = await import("@/lib/marketplace/sets.js");
const cat = await import("@/lib/marketplace/grove-catalog.js");

const csRaw = sets.COLLECTION_SETS;
const csList = Array.isArray(csRaw) ? csRaw : Object.entries(csRaw).map(([k, v]) => ({ id: k, ...v }));
const SET_IDS = new Set(csList.flatMap((s) => sets.itemsOfSet(s.id) || []));

// All six exclusivity predicates — see the note in the emitted file.
const droppable = (it) => it.slot && !SET_IDS.has(it.id)
    && !items.isForgedItem(it) && !items.isRealMoneyItem(it) && !items.isOwnerOnlyItem(it)
    && !items.isSeasonItem(it) && !items.isHalloweenItem(it) && !(items.isGourdfatherItem?.(it));

const POOL = {};
for (const it of Object.values(items.ALL_ITEMS || items.ITEMS || {})) {
    if (!droppable(it)) continue;
    (POOL[it.rarity] ||= []).push(it);
}

const CURVE = {
    1: [["common", "common", "rare"], ["common", "rare", "rare"]],
    2: [["common", "rare", "rare"], ["rare", "rare", "epic"]],
    3: [["rare", "epic", "epic"], ["rare", "epic", "legendary"]],
    4: [["rare", "epic", "legendary"], ["epic", "legendary", "legendary"]],
    5: [["epic", "legendary", "legendary"], ["epic", "legendary", "mythic"]],
    6: [["epic", "legendary", "mythic"], ["legendary", "legendary", "mythic"]],
    7: [["legendary", "mythic", "mythic"], ["legendary", "mythic", "mythic"]],
};
const slotsAt = (map, zone) => CURVE[map][zone <= 6 ? 0 : 1];

const EMB = cat.GROVE_EMBLEMS;
const STAT_ALIAS = {
    might: ["might", "base_damage"], vitality: ["vitality", "health"], armour: ["armor", "armour"],
    attack_speed: ["haste", "speed", "attack_speed"], life_steal: ["life_steal", "lifesteal"],
    crit_rate: ["crit_chance", "crit_rate"], crit_damage: ["crit_power", "crit_damage"],
    ferocity: ["ferocity"], tenacity: ["tenacity"], move_speed: ["speed", "haste"],
    rarity_find: ["fortune", "rarity_find"], emblem_find: ["fortune"], rare_spawn: ["fortune"],
};
const leans = (item, stat) => {
    const keys = STAT_ALIAS[stat] || [stat];
    const total = Object.values(item.stats || {}).reduce((a, b) => a + (Number(b) || 0), 0) || 1;
    return keys.reduce((a, k) => a + (Number(item.stats?.[k]) || 0), 0) / total;
};

const used = new Set();
// ⚠️ `taken` IS THE ROW'S OWN PICKS, AND IT IS NOT THE SAME GUARD AS `used`. Reuse ACROSS creatures is fine
// and unavoidable — 396 slots against 260 droppable items — but a creature whose rare and super-rare are the
// same item has a two-slot table wearing three labels. Deep rows hit this because the mythic pool is 47.
function pick(rarity, stat, taken) {
    const pool = (POOL[rarity] || []).filter((i) => !taken.has(i.id));
    const fresh = pool.filter((i) => !used.has(i.id));
    const from = fresh.length ? fresh : pool;
    const best = from.map((i) => ({ i, s: leans(i, stat) })).sort((a, b) => b.s - a.s)[0]?.i;
    if (best) { used.add(best.id); taken.add(best.id); }
    return best?.id || null;
}

const rows = [];
let repeats = 0;
for (const z of cat.GROVE_ZONES) {
    const map = z.map || 1;
    const zoneN = ((z.n - 1) % 12) + 1;
    const [r1, r2, r3] = slotsAt(map, zoneN);
    for (const foeId of z.enemies) {
        const foe = cat.GROVE_ENEMIES[foeId];
        const stat = EMB[foe?.emblem]?.stat || null;
        const taken = new Set();
        const normal = pick(r1, stat, taken), rare = pick(r2, stat, taken), sup = pick(r3, stat, taken);
        if (new Set([normal, rare, sup]).size < 3) repeats += 1;
        rows.push({ key: `${z.id}|${foeId}`, zone: z.name, foe: foe?.name || foeId, stat, normal, rare, sup, r1, r2, r3 });
    }
}

const body = rows.map((r) =>
    `    // ${r.zone} · ${r.foe}${r.stat ? ` · ${r.stat}` : ""}  (${r.r1}/${r.r2}/${r.r3})\n`
    + `    "${r.key}": { normal: ${JSON.stringify(r.normal)}, rare: ${JSON.stringify(r.rare)}, sup: ${JSON.stringify(r.sup)} },`
).join("\n");

const out = `// ── THE GROVE'S GEAR TABLES ──────────────────────────────────────────────────────────────────────────────────
// Luke: "every enemy still has a loot table of items that it can drop ... manicured to ensure every enemy has
// something different to drop, but its power is relative to the zone and enemy you're facing. Every enemy has
// a normal drop, a rare drop and a super rare drop — 3 assigned pieces you elect."
//
// One row per (zone, creature) — NOT per creature. The same rootrat standing twelve zones deeper drops better
// gear, because power is relative to the zone as well as the resident.
//
// ⚠️ THIS FILE IS DATA, NOT A BUILD ARTEFACT. scripts/gen-grove-loot.mjs emitted it once; re-running that
// script reassigns every row and throws away any hand-edit. Edit this file directly.
//
// ⚠️ WHAT MAY BE IN HERE, AND WHY IT IS A SHORT LIST. items.js: "every random reward path builds its pool by
// filtering ITEMS, so an exclusive that is merely 'not granted anywhere else' is an exclusive the fishing rod
// hands out." Six predicates were applied when this was generated, and any hand-edit has to respect them:
//   · isForgedItem    — 260 of the 297 ascendant items are __ascended TWINS, made with a Prismatic Stone.
//                        Dropping one gives away the forge's entire reason to exist.
//   · isRealMoneyItem — source admin / elite / chargeReward. This is what puts EVERY tier above mythic out
//                        of reach: ascendant, eternal, celestial and primordial gear is all elite-sourced.
//   · isOwnerOnlyItem · isSeasonItem · isHalloweenItem · isGourdfatherItem
//
// So the Grove's item ladder runs common → mythic and stops. "Rare but possible" above that is handled by the
// super-rare slot occasionally paying a top-tier CHEST instead (see GEAR_CHEST below), which keeps one place
// deciding how often elite gear enters the game.
//
// Collection set pieces are NOT in these tables either — they have their own roll, SET_PIECE below.

/** (zoneId|foeId) → the three pieces that creature drops in that zone. */
export const GROVE_GEAR = {
${body}
};

// ── HOW OFTEN GEAR FALLS ─────────────────────────────────────────────────────────────────────────────────────
// ⚠️ TWO REGIMES, BECAUSE ONE NUMBER CANNOT SERVE BOTH ENDS. A new account needs ~15 pieces across map 1 to
// put a kit together (a full common kit measures 100 dps / 299 hp, which is exactly the floor the Grove
// needs). A veteran at the frontier killing 40 a minute at that same rate would mint 48 pieces an hour —
// against the 82 a day the entire Den currently produces. The on-ramp is passed through ONCE per account,
// which is what makes it safe to be generous there and nowhere else.
export const GEAR_CHANCE = { onramp: 0.025, steady: 0.008, deep: 0.005 };

/** Maps 1-2 are the on-ramp; 3-5 steady; 6-7 lean. */
export const gearChanceFor = (map) => (map <= 2 ? GEAR_CHANCE.onramp : map <= 5 ? GEAR_CHANCE.steady : GEAR_CHANCE.deep);

// Which of the three slots a gear drop pays. Rolled only once gear has already dropped.
export const SLOT_SPLIT = { rare: 0.20, sup: 0.04 };   // the remainder is the normal slot

// ── THE TAIL ─────────────────────────────────────────────────────────────────────────────────────────────────
// Luke, on whether celestial and primordial can come out of the Grove: "No, it's rare, but possible."
//
// They cannot drop as ITEMS — every one of them is elite-sourced. So the super-rare slot can instead pay a
// top-tier CHEST, granted through addChests like the rare spawn's, and the chest grants the gear through the
// path that already meters it. Sized against the chest ladder's own deliberate Den-wide budget of 5 celestial
// and 1 primordial a month: at these odds a player turns up a celestial roughly every 15 hours of frontier
// farming and a primordial every 77.
//
// ⚠️ NOT SET-AND-FORGET. These scale with how much the Den farms — twenty people farming five hours a week
// would put out 28 celestials a month against the ladder's five. Re-measure by daily total once the Grove has
// real traffic; scripts/grove-tail.mjs re-solves them for any target.
export const GEAR_CHEST = { celestial: 0.0034, primordial: 0.00067, fromMap: 6 };

// ── COLLECTION PIECES ────────────────────────────────────────────────────────────────────────────────────────
// Luke: "if you're using [set pieces], make it extremely hard to get in the Grove as well."
//
// Measured first: 13 sets, 71 pieces, 209 grants across the game's history — about 80 a month entering the
// game Den-wide. At this rate the Grove adds two a month, one per ~39 hours of farming: 2.5% of the existing
// flow, which makes it the hardest route to a set piece in the game while keeping it possible.
//
// ⚠️ AND MEASURING IT THE OBVIOUS WAY IS WRONG: collection pieces are not mkt_user_item rows. Inventory
// returns ZERO copies owned, which reads as "nobody has any" and is false. They live in mkt_item_collected.
export const SET_PIECE = { chance: 0.00135, fromMap: 5, pool: ${JSON.stringify([...SET_IDS].sort())} };
`;

const dest = "src/lib/marketplace/grove-loot.js";
fs.writeFileSync(dest, out, "utf8");
console.log(`${dest} — ${rows.length} rows, ${used.size} distinct items, ${repeats} rows with a repeated slot`);
console.log(`pool: ${Object.entries(POOL).map(([r, v]) => `${r} ${v.length}`).join(", ")}`);
