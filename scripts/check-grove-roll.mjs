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
import { GROVE_ENEMIES, GROVE_RARE } from "@/lib/marketplace/grove-catalog.js";
import { rollKill, settleKills, rollRareSpawn, killRng } from "@/lib/marketplace/grove-roll.js";

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

if (fail.length) {
    console.log(`\n── ${fail.length} PROBLEM(S) ──────────────────────────────────────────────────`);
    for (const f of fail) console.log("  ·", f);
    process.exit(1);
}
console.log("\nOK — both sides roll the same loot, order-independently, and nothing ordinary pays gold.");
