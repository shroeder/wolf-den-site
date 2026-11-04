// ── WHAT QUESTING PAYS IN CHESTS, OVER A WHOLE GAME ─────────────────────────────────────────────────────────
// Luke: "I want the grove quests to rewards typical loot chest, you know iron wooden etc."
//
// A chest faucet needs a number before it ships, and this is the one that matters: a quest step can be
// claimed ONCE, EVER, and there are 71 in the game. So the lifetime supply per account is fixed and
// countable rather than a rate that compounds — which is the whole reason a coin flip is safe here and
// would not be on a kill loop.
//
// ⚠️ IT MIRRORS THE RULE IN claimStep RATHER THAN IMPORTING IT, because that rule lives inside an async
// function that writes to the database. If the two drift, this file is wrong and the game is right —
// keep them in step by hand, the tier table is five lines.
//
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/grove-quest-chests.mjs
import { npcsOnMap, questsFor } from "@/lib/marketplace/grove-npcs.js";
const rollFor = (seedStr) => { let h = 2166136261;
  for (const ch of String(seedStr)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h ^= h >>> 13; return (h >>> 0) / 4294967296; }; };
const CHEST_BY_MAP = ["wooden","wooden","iron","iron","gold","gold","mythic"];
const UP = { wooden:"iron", iron:"gold", gold:"mythic", mythic:"mythic" };
const BUYER = "6857d67e-3dd0-46b6-aad7-b91699155ff6";

const tally = {}; let steps = 0, withChest = 0;
const byMap = {};
for (let map = 1; map <= 7; map++) {
  byMap[map] = { steps: 0, chests: 0, tiers: {} };
  for (const npc of npcsOnMap(map)) {
    const chain = questsFor(npc.id);
    for (const step of chain) {
      steps++; byMap[map].steps++;
      const base = CHEST_BY_MAP[Math.min(6, map - 1)];
      const last = chain[chain.length - 1].id === step.id;
      const rnd = rollFor(`${BUYER}|${step.id}|chest`);
      let chest = null;
      if (last) chest = UP[base] || base; else if (rnd() < 0.5) chest = base;
      if (chest) { withChest++; byMap[map].chests++; tally[chest] = (tally[chest]||0)+1; byMap[map].tiers[chest]=(byMap[map].tiers[chest]||0)+1; }
    }
  }
}
console.log(`${steps} quest steps in the whole game; ${withChest} pay a chest (${(100*withChest/steps).toFixed(0)}%)\n`);
console.log("lifetime supply per account, by tier:");
for (const t of ["wooden","iron","gold","mythic"]) console.log(`   ${t.padEnd(8)} ${tally[t] || 0}`);
console.log("\nper map:");
for (let m = 1; m <= 7; m++) {
  const b = byMap[m];
  console.log(`  map ${m}: ${String(b.chests).padStart(2)} chests from ${String(b.steps).padStart(2)} steps  — `
    + Object.entries(b.tiers).map(([k,v]) => `${v} ${k}`).join(", "));
}
console.log("\nnothing above mythic:", !Object.keys(tally).some(t => ["ascendant","eternal","celestial","primordial"].includes(t)));
