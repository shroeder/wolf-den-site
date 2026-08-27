import { CLASSES, treeFor } from "../src/lib/marketplace/arena-classes.js";
import { kitFor } from "../src/lib/marketplace/arena.js";
import { db } from "../src/lib/db.js";
const who = await db.queryOne(`SELECT id FROM mkt_buyer WHERE display_name = 'The Wolf Den'`);
function spendTree(clsId, points) {
  const take = {}; let left = points;
  for (const n of treeFor(clsId)) { if (left <= 0) break; const put = Math.min(n.ranks, left); take[n.id] = put; left -= put; }
  return take;
}
const kits = {};
for (const c of CLASSES) kits[c.id] = await kitFor(who.id, { skillTree: spendTree(c.id, 25), classId: c.id });
const keys = [...new Set(CLASSES.flatMap((c) => Object.keys(kits[c.id])))].sort();
console.log();
console.log(`  ${"stat".padEnd(20)}${CLASSES.map((c) => c.name.padStart(13)).join("")}`);
console.log();
for (const k of keys) {
  const vals = CLASSES.map((c) => kits[c.id][k]);
  if (vals.every((v) => typeof v === "object" || typeof v === "function" || Array.isArray(v))) continue;
  const nums = vals.map((v) => (typeof v === "number" ? v : (v == null ? 0 : NaN)));
  const same = nums.every((v) => v === nums[0]);
  if (same) continue;
  console.log(`  ${k.padEnd(20)}${vals.map((v) => String(typeof v === "number" ? Math.round(v * 1000) / 1000 : v).padStart(13)).join("")}`);
}
console.log();