// ── EVERY SKILL HAS A LOOK, AND EVERY LOOK EXISTS ───────────────────────────────────────────────────────────
// Luke counted the tree before I did: "Should be at least 9 effects right? Since isnt there 9 primary skills?"
// He was right — 36 nodes in four tiers of nine, and my first mapping named 29 of them, leaving seven on the
// fallback ring. The ring is the thing being replaced, so a skill landing on it is the defect.
//
// Two ways that rots, and neither of them errors:
//   · a skill is added to grove-skills.js and nobody gives it a shape -> it silently draws the old ring
//   · a shape is renamed in grove-css.js and the map still points at the old class -> it draws NOTHING
//
//   npm run check:sfx
import { existsSync, readFileSync } from "node:fs";

import { GROVE_SKILLS } from "@/lib/marketplace/grove-skills.js";

const scene = readFileSync("src/components/grove/GroveScene.js", "utf8");
const css = readFileSync("src/components/grove/grove-css.js", "utf8");

const mapBlock = (scene.match(/const SFX_BY_ID = \{([\s\S]*?)\n        \};/) || [])[1] || "";
const mapped = Object.fromEntries([...mapBlock.matchAll(/([a-z_]+):\s*"([a-z]+)"/g)].map((m) => [m[1], m[2]]));
const drawn = new Set([...css.matchAll(/\.gv-sfx\.is-([a-z]+)\s*\{/g)].map((m) => m[1]));

let bad = 0;
const skills = Object.values(GROVE_SKILLS);
console.log(`${skills.length} skills · ${Object.keys(mapped).length} mapped · ${drawn.size} shapes drawn in CSS\n`);

for (const s of skills) {
    const shape = mapped[s.id];
    if (!shape) { console.log(`  ✗ ${s.id.padEnd(14)} ${String(s.name).padEnd(18)} has no shape — falls back to the ring`); bad += 1; continue; }
    if (!drawn.has(shape)) { console.log(`  ✗ ${s.id.padEnd(14)} maps to "${shape}", which has no .gv-sfx.is-${shape} rule — draws nothing`); bad += 1; }
}
for (const [id, shape] of Object.entries(mapped)) {
    if (!skills.some((s) => s.id === id)) { console.log(`  ✗ "${id}" is mapped to ${shape} but is not a skill any more`); bad += 1; }
}

// ── ⚠️ AND THE PAINTED ART MUST BE ON DISK ──────────────────────────────────────────────────────────────────
// A background-image at a path that does not exist is the quietest failure in the browser: no error, no
// warning, no console line, and the element is still there taking up its box. It draws NOTHING. I nearly
// shipped exactly that by reading a filename out of the arena's map instead of off the disk.
const artBlock = (scene.match(/const ART_BY_SHAPE = \{([\s\S]*?)\n        \};/) || [])[1] || "";
const art = Object.fromEntries([...artBlock.matchAll(/([a-z]+):\s*"([^"]+)"/g)].map((m) => [m[1], m[2]]));
// ⚠️ A SILENT ZERO IS THE FAILURE MODE OF THIS WHOLE FILE. Both blocks are read out of the source with a
// regex, so a reindent or a rename makes the map parse as EMPTY and every loop below passes vacuously — the
// gate goes green by checking nothing, which is worse than not having it. So the counts are printed and an
// empty parse is an outright failure.
if (!Object.keys(mapped).length) { console.log("  ✗ SFX_BY_ID did not parse — the gate would pass by checking nothing"); bad += 1; }
if (!Object.keys(art).length) { console.log("  ✗ ART_BY_SHAPE did not parse — the gate would pass by checking nothing"); bad += 1; }
console.log(`  painted art backs ${Object.keys(art).length} of ${drawn.size} shapes: ${Object.keys(art).sort().join(", ")}`);
for (const [shape, file] of Object.entries(art)) {
    if (!drawn.has(shape)) { console.log(`  ✗ art is mapped for "${shape}", which is not a shape in grove-css.js`); bad += 1; }
    if (!existsSync(`public${file}`)) { console.log(`  ✗ ${shape.padEnd(8)} names ${file}, which is NOT on disk — it would draw nothing`); bad += 1; }
}

// How many DISTINCT looks a player actually meets, and how the nine primaries are covered.
const used = new Set(Object.values(mapped));
console.log(`  distinct looks in play: ${used.size} — ${[...used].sort().join(", ")}`);
for (const sh of drawn) {
    if (!used.has(sh)) console.log(`  · shape "${sh}" is drawn in CSS but no skill uses it`);
}

console.log(bad
    ? `\ncheck:sfx — ${bad} problem(s). A skill with no shape draws the ring it was meant to replace.`
    : "\ncheck:sfx — every skill has a shape, and every shape it names exists.");
process.exit(bad ? 1 : 0);
