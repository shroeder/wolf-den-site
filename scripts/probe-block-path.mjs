import { CLASSES, treeFor } from "../src/lib/marketplace/arena-classes.js";
import { kitFor } from "../src/lib/marketplace/arena.js";
import { autoRing } from "../src/lib/marketplace/arena-ring.js";
import { skillsForClass } from "../src/lib/marketplace/arena-skills.js";
import { db } from "../src/lib/db.js";
const who = await db.queryOne(`SELECT id FROM mkt_buyer WHERE display_name = 'The Wolf Den'`);
const seeded = (n) => { let x = n >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };
function spendTree(clsId, points) { const t = {}; let l = points;
  for (const n of treeFor(clsId)) { if (l <= 0) break; const p = Math.min(n.ranks, l); t[n.id] = p; l -= p; } return t; }
const built = {};
for (const c of CLASSES) built[c.id] = { kit: await kitFor(who.id, { skillTree: spendTree(c.id, 25), classId: c.id }),
  skills: Object.fromEntries(skillsForClass(c.id).map((s) => [s.id, []])) };
// Warden defending against Reaver: does the block path fire at all?
let blows = 0, blocked = 0, counters = 0, bouts = 0;
for (let s = 0; s < 60; s += 1) {
  const r = autoRing({ ...built.warden.kit }, { ...built.reaver.kit }, { rng: seeded(4242 + s * 7919), mySkills: built.warden.skills, foeSkills: built.reaver.skills });
  bouts += 1;
  for (const l of (r.log || [])) {
    if (typeof l.hits === "number") blows += l.hits;
    if (l.blocked) blocked += l.blocked;
    if (l.kind === "counter" || l.counter) counters += 1;
  }
}
console.log();
console.log(`  Warden vs Reaver, ${bouts} bouts`);
console.log(`  blows landed on someone : ${blows}`);
console.log(`  blows BLOCKED           : ${blocked}`);
console.log(`  counters                : ${counters}`);
console.log(`  Warden blockChance      : ${built.warden.kit.blockChance}`);
console.log();