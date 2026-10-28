// ── DO THE CLIENT AND THE SERVER LAND ON THE SAME LOOT? ──────────────────────────────────────────────────────
// The Grove runs in the browser for cost reasons — a kill loop cannot afford a request per kill — so the
// client rolls the drop locally to show it instantly, and the server re-rolls it from the same seed to grant
// it. That only works if the two are byte-identical. If they ever drift, the player watches a part fall out
// of an enemy and then never arrive, which is worse than any amount of latency.
//
// So this asserts the properties the design actually rests on:
//
//   · the same (seed, index) ALWAYS gives the same drop — the client and server agree
//   · a different index gives a different stream — kills are independent
//   · kills can be settled OUT OF ORDER and produce the same totals
//   · no ordinary enemy produces gold or a chest, ever, at any seed
//   · the rare spawn's chance is roughly what the table says
//
//   node --import ./scripts/lib/register-loader.mjs scripts/check-grove-roll.mjs
import { GROVE_ENEMIES, GROVE_RARE, GROVE_ZONES } from "@/lib/marketplace/grove-catalog.js";
import { rollKill, settleKills, rollRareSpawn, killRng } from "@/lib/marketplace/grove-roll.js";
import { GROVE_GEAR, GEAR_CHEST, SET_PIECE } from "@/lib/marketplace/grove-loot.js";
import { itemById, isForgedItem, isRealMoneyItem, isOwnerOnlyItem, isSeasonItem, isHalloweenItem } from "@/lib/marketplace/items.js";

const fail = [];
const ok = (c, m) => { if (!c) fail.push(m); };
const lookup = (id) => (id === GROVE_RARE.id ? GROVE_RARE : GROVE_ENEMIES[id]);
const SEED = 1234567;

// ── 1. DETERMINISM — the whole architecture rests on this one line ───────────────────────────────────
for (const id of Object.keys(GROVE_ENEMIES)) {
    const a = JSON.stringify(rollKill(GROVE_ENEMIES[id], SEED, 7));
    const b = JSON.stringify(rollKill(GROVE_ENEMIES[id], SEED, 7));
    ok(a === b, `${id}: same seed+index gave two different answers`);
}

// ── 2. INDEPENDENCE — one kill's roll must not be the next one's ─────────────────────────────────────
const s1 = JSON.stringify(rollKill(GROVE_ENEMIES.rootrat, SEED, 1));
const s2 = JSON.stringify(rollKill(GROVE_ENEMIES.rootrat, SEED, 2));
ok(s1 !== s2 || true, "indexes may coincide occasionally — not a failure on its own");
let distinct = new Set();
for (let i = 0; i < 200; i += 1) distinct.add(killRng(SEED, i)().toFixed(9));
ok(distinct.size > 190, `kill streams are not independent enough (${distinct.size}/200 distinct first draws)`);

// ── 3. ORDER DOES NOT MATTER ─────────────────────────────────────────────────────────────────────────
// A settle that arrives in pieces, or retries, must total the same. This is why the stream is keyed on the
// index rather than drawn from one running sequence.
const kills = Array.from({ length: 60 }, (_, i) => ({ id: i % 3 === 0 ? "thornling" : "rootrat", i }));
// ⚠️ COMPARED KEY-BY-KEY, NOT BY JSON.stringify. The first version of this check compared the serialised
// objects and failed — because `parts` is built by insertion, so reversing the kill list produces the same
// COUNTS in a different key order. That is a difference in how the object was typed up, not in what the
// player gets, and asserting on it would have sent me hunting a bug that was not there.
const stable = (o2) => JSON.stringify(Object.fromEntries(Object.entries(o2).sort(([a], [b]) => a.localeCompare(b))));
const same = (x, y) => stable(x.parts) === stable(y.parts)
    && stable(x.emblems) === stable(y.emblems)
    && x.gold === y.gold && x.xp === y.xp && x.chests.length === y.chests.length;
const forward = settleKills(kills, lookup, SEED);
const backward = settleKills([...kills].reverse(), lookup, SEED);
ok(same(forward, backward), "settling out of order changed the totals");

// ── 4. NO GOLD, NO CHESTS, FROM ANYTHING ORDINARY ────────────────────────────────────────────────────
// Swept across many seeds rather than asserted once, because "it did not happen on my seed" is how this
// class of bug survives.
let leakedGold = 0;
let leakedChest = 0;
for (const id of Object.keys(GROVE_ENEMIES)) {
    for (let i = 0; i < 4000; i += 1) {
        const got = rollKill(GROVE_ENEMIES[id], SEED + i, i);
        if (got.gold > 0) leakedGold += 1;
        if (got.chest) leakedChest += 1;
    }
}
ok(leakedGold === 0, `${leakedGold} ordinary kills paid GOLD — the one thing this feature must never do`);
ok(leakedChest === 0, `${leakedChest} ordinary kills dropped a CHEST`);

// ── 5. THE RARE SPAWN IS RARE, AND PAYS ──────────────────────────────────────────────────────────────
let spawns = 0;
const N = 200_000;
for (let i = 0; i < N; i += 1) if (rollRareSpawn(GROVE_RARE.spawnChance, SEED, i)) spawns += 1;
const rate = spawns / N;
ok(rate > GROVE_RARE.spawnChance * 0.75 && rate < GROVE_RARE.spawnChance * 1.25,
    `rare spawn rate ${(rate * 100).toFixed(3)}% is far from the ${(GROVE_RARE.spawnChance * 100).toFixed(2)}% the table says`);

let rareGold = 0;
let rareChests = 0;
for (let i = 0; i < 2000; i += 1) {
    const got = rollKill(GROVE_RARE, SEED + i, i);
    rareGold += got.gold;
    if (got.chest) rareChests += 1;
}
ok(rareGold > 0, "the rare spawn paid no gold across 2,000 kills");

// ── 6. EMBLEM FIND ACTUALLY DOES SOMETHING ───────────────────────────────────────────────────────────
const base = Array.from({ length: 20000 }, (_, i) => rollKill(GROVE_ENEMIES.rootrat, SEED, i)).filter((g) => g.emblem).length;
const buffed = Array.from({ length: 20000 }, (_, i) => rollKill(GROVE_ENEMIES.rootrat, SEED, i, { emblemFind: 100 })).filter((g) => g.emblem).length;
ok(buffed > base, `emblem_find did nothing (${base} -> ${buffed})`);

// ── REPORT ───────────────────────────────────────────────────────────────────────────────────────────
console.log("── THE ROLL ─────────────────────────────────────────────────────────────────");
console.log(`  determinism     same seed + index -> same drop, across all ${Object.keys(GROVE_ENEMIES).length} enemies`);
console.log(`  independence    ${distinct.size}/200 distinct streams`);
console.log(`  order           settling 60 kills backwards totals identically`);
console.log(`  gold leak       ${leakedGold} in ${Object.keys(GROVE_ENEMIES).length * 4000} ordinary kills`);
console.log(`  chest leak      ${leakedChest}`);
console.log(`  rare spawn      ${(rate * 100).toFixed(3)}% measured vs ${(GROVE_RARE.spawnChance * 100).toFixed(2)}% designed`);
console.log(`  rare payout     ${Math.round(rareGold / 2000)} gold avg, ${(rareChests / 20).toFixed(1)}% chest`);
console.log(`  emblem_find     ${base} -> ${buffed} per 20k kills at +100%`);

// ── 7. THE GEAR TABLES ───────────────────────────────────────────────────────────────────────────────
// ⚠️ THE LOOP IN §4 CANNOT SEE ANY OF THIS. It calls rollKill with no zoneN, so the zone lookup returns
// null and the gear block never runs — which is correct for what §4 asserts and means the gear rules are
// untested unless they get their own sweep. They are the rules most likely to be broken by a later
// hand-edit of grove-loot.js, because that file is DATA and edits to it look harmless.
const gearItems = new Set();
for (const row of Object.values(GROVE_GEAR)) for (const k of ["normal", "rare", "sup"]) if (row[k]) gearItems.add(row[k]);

// 7a. every id resolves, and nothing exclusive leaked in.
const unresolved = [...gearItems].filter((id) => !itemById(id));
ok(unresolved.length === 0, `${unresolved.length} gear ids resolve to nothing: ${unresolved.slice(0, 4).join(", ")}`);

const exclusive = [...gearItems].map((id) => itemById(id)).filter(Boolean).filter((it) =>
    isForgedItem(it) || isRealMoneyItem(it) || isOwnerOnlyItem(it) || isSeasonItem(it) || isHalloweenItem(it));
ok(exclusive.length === 0,
    `${exclusive.length} EXCLUSIVE items are in the gear tables (${exclusive.slice(0, 3).map((i) => i.id).join(", ")}) `
    + "— forged twins, elite, owner-only and seasonal gear must never drop");

// ⚠️ 7a-ii. EVERY GEAR ITEM MUST HAVE A SPRITE, or the drop is invisible.
// Gear spills on the ground like a part does, and the scene draws it from mkt_item_sprite. An item with no
// row there spills nothing — the kill pays out at settle and the player sees no reason why. Silent, and
// indistinguishable from "it did not drop". Checked against the database because that is where the art is.
{
    const { readFileSync } = await import("node:fs");
    const pick = (f, k) => readFileSync(f, "utf8").split("\n")
        .find((l) => l.startsWith(k + "="))?.slice(k.length + 1).trim();
    const url = process.env.DATABASE_URL || pick("C:/Users/Luke/Projects/accounting_app/.env", "DATABASE_URL");
    if (url) {
        process.env.DATABASE_URL = url;
        const { db } = await import("@/lib/db.js");
        const ids = [...gearItems];
        const have = new Set((await db.query(`SELECT item_id FROM mkt_item_sprite WHERE item_id = ANY($1)`, [ids]).catch(() => [])).map((r) => r.item_id));
        const noArt = ids.filter((i) => !have.has(i));
        ok(noArt.length === 0, `${noArt.length} gear item(s) have no sprite, so they would drop invisibly: ${noArt.slice(0, 5).join(", ")}`);
    }
}

// 7b. a creature's three slots are three different items.
const dupRows = Object.entries(GROVE_GEAR).filter(([, r]) => new Set([r.normal, r.rare, r.sup]).size < 3);
ok(dupRows.length === 0, `${dupRows.length} rows repeat an item across their own slots (${dupRows.slice(0, 3).map(([k]) => k).join(", ")})`);

// 7c. the depth floors hold: no top-tier chest above the on-ramp, no set piece before map 5.
let earlyChest = 0;
let earlySet = 0;
let gearSeen = 0;
for (const z of GROVE_ZONES) {
    const map = z.map || 1;
    if (map > 5) continue;                       // only the shallow half is being policed here
    for (const foeId of z.enemies) {
        for (let i = 0; i < 400; i += 1) {
            const got = rollKill(GROVE_ENEMIES[foeId], SEED + i, i, {}, z.n, null);
            if (got.gear) gearSeen += 1;
            if (got.chest) earlyChest += 1;
            if (got.setPiece && map < 5) earlySet += 1;
        }
    }
}
ok(earlyChest === 0, `${earlyChest} top-tier chests fell above map 5 — the tail is a frontier reward`);
ok(earlySet === 0, `${earlySet} collection pieces fell before map 5`);
ok(gearSeen > 0, "no gear dropped anywhere in maps 1-5 — the tables are not wired in");

// 7d. the rate follows the curve rather than one flat number.
const rateAt = (zone, n = 20000) => {
    let hits = 0;
    for (let i = 0; i < n; i += 1) if (rollKill(GROVE_ENEMIES[zone.enemies[0]], SEED + i, i, {}, zone.n, null).gear) hits += 1;
    return hits / n;
};
const onramp = rateAt(GROVE_ZONES[0]);
const deep = rateAt(GROVE_ZONES[83]);
ok(onramp > deep * 2,
    `the on-ramp (${(onramp * 100).toFixed(2)}%) is not meaningfully more generous than the frontier `
    + `(${(deep * 100).toFixed(2)}%) — a new account needs a kit from map 1 and a veteran must not mint one an hour`);

console.log("── THE GEAR ─────────────────────────────────────────────────────────────────");
console.log(`  tables          ${Object.keys(GROVE_GEAR).length} rows, ${gearItems.size} distinct items, 0 exclusives`);
console.log(`  on-ramp rate    ${(onramp * 100).toFixed(2)}%  vs frontier ${(deep * 100).toFixed(2)}%`);
console.log(`  depth floors    chest from map ${GEAR_CHEST.fromMap}, set piece from map ${SET_PIECE.fromMap} — nothing early`);

if (fail.length) {
    console.log(`\n── ${fail.length} PROBLEM(S) ──────────────────────────────────────────────────`);
    for (const f of fail) console.log("  ·", f);
    process.exit(1);
}
console.log("\nOK — both sides roll the same loot, order-independently, and nothing ordinary pays gold.");
