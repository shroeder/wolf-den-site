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
const BOUTS = 300;
const rate = (aKit, aSk, dId) => { let w = 0;
  for (let s = 0; s < BOUTS; s += 1) {
    const r = autoRing({ ...aKit }, { ...built[dId].kit }, { rng: seeded(7717 + s * 7919), mySkills: aSk, foeSkills: built[dId].skills });
    if (r.won) w += 1; } return w / BOUTS; };
const avgFor = (kit) => { let s = 0, n = 0;
  for (const d of CLASSES) { if (d.id === "reaver") continue; s += rate(kit, built.reaver.skills, d.id); n += 1; } return s / n; };
const base = built.reaver.kit;
console.log();
console.log(`  Reaver average, all four intact : ${(avgFor(base) * 100).toFixed(1)}%`);
console.log();
const tests = [
  ["crit down to 0.128 (theirs)", { ...base, critChance: 0.128 }],
  ["lifestealBonus 0", { ...base, lifestealBonus: 0 }],
  ["bleed off", { ...base, bleedChance: 0, bleedDamage: 0 }],
  ["extra down to 0.365 (theirs)", { ...base, extra: 0.365 }],
  ["crit AND lifesteal normalised", { ...base, critChance: 0.128, lifestealBonus: 0 }],
  ["all four normalised", { ...base, critChance: 0.128, lifestealBonus: 0, bleedChance: 0, bleedDamage: 0, extra: 0.365 }],
];
for (const [label, kit] of tests) {
  const a = avgFor(kit);
  console.log(`  ${label.padEnd(32)} ${(a * 100).toFixed(1)}%`);
}
console.log();