// ── THE THREE-SLOT LOOT TABLE, DRAFTED FOR ALL 84 ZONES ──────────────────────────────────────────────────────
// Luke: "every enemy still has a loot table of items that it can drop... manicured by you to ensure that every
// enemy has something different to drop, but its power is relative to the zone and enemy you're facing. Maybe
// every enemy has, like, a normal drop or a rare drop and a super rare drop — 3 assigned pieces you elect."
//
// And the curve he set: map 1 zone 1's best is "a magic item"; by map 3 the super-rare is the third or fourth
// tier; by maps 6-7 it is legendary and maybe a mythic or two.
//
// ⚠️ THIS DRAFTS, IT DOES NOT SHIP. It prints a table to read and argue with. The assignment is the design
// work — what it automates is the bookkeeping that makes a hand-made table possible at all: 252 picks that
// have to stay distinct, stay on the curve, and stay in character for the creature dropping them.
//
// Three rules it holds to:
//   1. every enemy's three picks are DISTINCT, and reuse across enemies is minimised
//   2. each pick's rarity comes from the depth curve, never from the item being nice
//   3. each pick leans toward the creature's OWN stat — the one its emblem already names — so the table
//      answers "why farm here" rather than being 84 rolls of the same dice
//
//   node scripts/grove-loot-draft.mjs            the whole draft
//   node scripts/grove-loot-draft.mjs --map 1    one map
import { register } from "node:module";

register("./lib/app-loader.mjs", import.meta.url);

const items = await import("@/lib/marketplace/items.js");
const sets = await import("@/lib/marketplace/sets.js");
const cat = await import("@/lib/marketplace/grove-catalog.js");

const onlyMap = (() => { const i = process.argv.indexOf("--map"); return i > 0 ? Number(process.argv[i + 1]) : null; })();

// Collection pieces are excluded from the three slots entirely — they have their own rate and their own
// depth floor (§3e), and mixing them in would make the manicured table the thing that sets their frequency.
const csRaw = sets.COLLECTION_SETS;
const csList = Array.isArray(csRaw) ? csRaw : Object.entries(csRaw).map(([k, v]) => ({ id: k, ...v }));
const SET_IDS = new Set(csList.flatMap((s) => sets.itemsOfSet(s.id) || []));

// ⚠️ AND THE FORGED TWINS ARE NOT DROPS. 260 of the 297 "ascendant" items are __ascended twins — the thing
// a player MAKES by spending a Prismatic Stone on a base item. Dropping them hands out the forge's whole
// reason to exist, for free, and the pool is 88% twins so an unfiltered draw at depth hits one almost every
// time. The catalogue ships isForgedItem() for exactly this; exclusive filters have to restate it.
const POOL = {};
for (const it of Object.values(items.ALL_ITEMS || items.ITEMS || {})) {
    if (!it.slot || SET_IDS.has(it.id)) continue;
    // ⚠️ SIX PREDICATES, NOT ONE, AND THEY TAKE THE ITEM NOT THE ID. items.js says it in as many words:
    // "every random reward path builds its pool by filtering ITEMS, so an exclusive that is merely 'not
    // granted anywhere else' is an exclusive the fishing rod hands out." The Grove is a new random reward
    // path, so it has to restate all of them.
    if (items.isForgedItem(it) || items.isRealMoneyItem(it) || items.isOwnerOnlyItem(it)
        || items.isSeasonItem(it) || items.isHalloweenItem(it) || items.isGourdfatherItem?.(it)) continue;
    (POOL[it.rarity] ||= []).push(it);
}

// ── THE CURVE ───────────────────────────────────────────────────────────────────────────────────────────────
// Luke's shape, written as the rarity each of the three slots holds at each map, shifting at the halfway
// point of the map so the climb is a curve rather than seven steps.
const L = ["common", "rare", "epic", "legendary", "mythic", "ascendant"];
const CURVE = {
    //        first half of the map        second half
    1: [["common", "common", "rare"], ["common", "rare", "rare"]],
    2: [["common", "rare", "rare"], ["rare", "rare", "epic"]],
    3: [["rare", "epic", "epic"], ["rare", "epic", "legendary"]],
    4: [["rare", "epic", "legendary"], ["epic", "legendary", "legendary"]],
    5: [["epic", "legendary", "legendary"], ["epic", "legendary", "mythic"]],
    6: [["epic", "legendary", "mythic"], ["legendary", "legendary", "mythic"]],
    7: [["legendary", "mythic", "mythic"], ["legendary", "mythic", "ascendant"]],
};
const slotsAt = (map, zone) => CURVE[map][zone <= 6 ? 0 : 1];

// Which stat a creature stands for — already authored, one per enemy, via its emblem.
const EMB = cat.GROVE_EMBLEMS;
const statOf = (foe) => EMB[foe?.emblem]?.stat || null;

// Map the Grove's stat vocabulary onto the stat keys items actually carry.
const STAT_ALIAS = {
    might: ["might", "base_damage"], vitality: ["vitality", "health"], armour: ["armor", "armour"],
    attack_speed: ["haste", "speed", "attack_speed"], life_steal: ["life_steal", "lifesteal"],
    crit_rate: ["crit_chance", "crit_rate"], crit_damage: ["crit_power", "crit_damage"],
    ferocity: ["ferocity"], tenacity: ["tenacity"], move_speed: ["speed", "haste"],
    rarity_find: ["fortune", "rarity_find"], emblem_find: ["fortune"], rare_spawn: ["fortune"],
};
const leansToward = (item, stat) => {
    const keys = STAT_ALIAS[stat] || [stat];
    const total = Object.values(item.stats || {}).reduce((a, b) => a + (Number(b) || 0), 0) || 1;
    const mine = keys.reduce((a, k) => a + (Number(item.stats?.[k]) || 0), 0);
    return mine / total;
};

const used = new Set();
function pick(rarity, stat) {
    const pool = POOL[rarity] || [];
    // Prefer an unused item that leans toward this creature's stat; fall back to unused, then to anything.
    const fresh = pool.filter((i) => !used.has(i.id));
    const ranked = (fresh.length ? fresh : pool)
        .map((i) => ({ i, score: leansToward(i, stat) }))
        .sort((a, b) => b.score - a.score);
    const chosen = ranked[0]?.i;
    if (chosen) used.add(chosen.id);
    return chosen;
}

const ZONES = cat.GROVE_ZONES;
let reuse = 0;
console.log("zone                         creature        stat          NORMAL                RARE                  SUPER-RARE");
for (const z of ZONES) {
    const map = z.map || 1;
    if (onlyMap && map !== onlyMap) continue;
    const zoneN = ((z.n - 1) % 12) + 1;
    const [r1, r2, r3] = slotsAt(map, zoneN);
    for (const foeId of z.enemies) {
        const foe = cat.GROVE_ENEMIES[foeId];
        const stat = statOf(foe);
        const a = pick(r1, stat), b = pick(r2, stat), c = pick(r3, stat);
        const seen = new Set([a?.id, b?.id, c?.id]);
        if (seen.size < 3) reuse += 1;
        const cell = (it, r) => `${(it?.name || "—").slice(0, 19).padEnd(20)}`;
        console.log(
            `m${map} z${String(zoneN).padStart(2)} ${String(z.name).slice(0, 18).padEnd(19)}`,
            String(foe?.name || foeId).slice(0, 15).padEnd(15),
            String(stat || "—").padEnd(13),
            cell(a), cell(b), cell(c),
        );
    }
}
console.log(`\n${used.size} distinct items assigned · ${reuse} rows where a slot had to repeat`);
console.log(`pool drawn from: ${Object.entries(POOL).map(([r, v]) => `${r} ${v.length}`).join(", ")}`);
console.log(`\ncollection pieces are NOT in these tables — they have their own 0.135% roll from map 5 on.`);
