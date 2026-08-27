import { db } from "../src/lib/db.js";
let n = 0;
for (const k of ["query", "queryOne"]) { const real = db[k].bind(db); db[k] = (...a) => { n += 1; return real(...a); }; }
const who = await db.queryOne(`SELECT id FROM mkt_buyer WHERE display_name = 'The Wolf Den'`);
const id = who.id;
const M = await import("../src/lib/marketplace/mining.js");
const D = await import("../src/lib/marketplace/delves.js");
const F = await import("../src/lib/marketplace/farm.js");
const C = await import("../src/lib/marketplace/chests.js");
const S = await import("../src/lib/marketplace/spin.js");
const Q = await import("../src/lib/marketplace/quests.js");
const T = await import("../src/lib/marketplace/town.js");
const FD = await import("../src/lib/marketplace/feature-dailies.js");
const SA = await import("../src/lib/marketplace/sailing.js");
const A = await import("../src/lib/marketplace/arena.js");
const K = await import("../src/lib/marketplace/cooking.js");
const parts = [
  ["getMiningState", () => M.getMiningState(id)],
  ["getDelveState", () => D.getDelveState(id)],
  ["getFarm", () => F.getFarm(id, id)],
  ["getChests", () => C.getChests(id)],
  ["getSpinState", () => S.getSpinState(id)],
  ["getDailyQuests", () => Q.getDailyQuests(id)],
  ["getTownTodo", () => T.getTownTodo(id)],
  ["getFeatureClaimCounts", () => FD.getFeatureClaimCounts(id)],
  ["sailingNeedsAttention", () => SA.sailingNeedsAttention(id)],
  ["unusedCasts", () => SA.unusedCasts(id)],
  ["arenaNav", () => A.arenaNav(id)],
];
console.log();
console.log("  WHAT /api/marketplace/hud DOES, PIECE BY PIECE");
console.log();
let total = 0;
for (const [label, fn] of parts) {
  n = 0; const t = Date.now();
  await fn().catch(() => {});
  const ms = Date.now() - t;
  total += n;
  console.log(`  ${label.padEnd(24)} ${String(n).padStart(3)} round trips  ${String(ms).padStart(5)}ms`);
}
console.log();
console.log(`  hud total: ${total} round trips`);
console.log();
n = 0; let t = Date.now(); await K.getKitchenState(id).catch(() => {});
console.log(`  (for scale) getKitchenState  ${n} round trips  ${Date.now() - t}ms`);
console.log();