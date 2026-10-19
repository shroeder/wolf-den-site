// ── IS EVERY MAP'S ART ACTUALLY THERE? ───────────────────────────────────────────────────────────────────────
// Four families per map — a backdrop per zone, a sprite per creature, a sprite per boss, a sprite per material
// — and a map is only walkable when all forty-eight exist. check-grove.mjs enforces that for BUILT maps; this
// reports it for every map, so the question "what is left to draw" has an answer that is not a guess.
//
// ⚠️ IT ALSO CATCHES THE DOUBLE PREFIX. The writer adds `foe-` for creature art, so a key carrying it too
// lands as foe-foe-*.webp: the file writes, the catalogue 404s, and the player gets a broken-image glyph
// where the creature should be. Nothing throws. This names them.
//
//   node --import ./scripts/lib/register-loader.mjs scripts/grove-art-sweep.mjs
//   node --import ./scripts/lib/register-loader.mjs scripts/grove-art-sweep.mjs --fix   (renames foe-foe-*)
import fs from "node:fs";

import { GROVE_MAPS, MAP_ENEMIES, MAP_BOSSES, MAP_ZONES, MAPS_BUILT } from "@/lib/marketplace/grove-maps.js";

const DIR = "public/images/grove";
const FIX = process.argv.includes("--fix");
const has = (f) => fs.existsSync(`${DIR}/${f}`);

if (FIX) {
    const strays = fs.readdirSync(DIR).filter((f) => f.startsWith("foe-foe-"));
    for (const f of strays) fs.renameSync(`${DIR}/${f}`, `${DIR}/${f.replace(/^foe-foe-/, "foe-")}`);
    if (strays.length) console.log(`renamed ${strays.length} double-prefixed creature sprite(s)`);
}

let totalMissing = 0;
console.log("\n  map                      zones  foes  bosses  parts   missing");
for (const m of GROVE_MAPS) {
    if (!m.zones) continue;
    const zones = m.zones.filter((z) => has(`zone-${z.id}.webp`)).length;
    const bosses = m.zones.filter((z) => has(`boss-${z.bossId}.webp`)).length;
    const foes = m.creatures.filter((c) => has(`foe-${c.id}.webp`)).length;
    const parts = m.parts.filter((p) => has(`part-${p.id}.webp`)).length;
    const missing = (12 - zones) + (12 - bosses) + (12 - foes) + (12 - parts);
    totalMissing += missing;
    const flag = missing === 0 ? (m.n <= MAPS_BUILT ? "  built" : "  READY TO BUILD") : "";
    console.log(`  ${String(m.n).padStart(2)} ${m.name.padEnd(22)} ${String(zones).padStart(2)}/12 ${String(foes).padStart(5)}/12 ${String(bosses).padStart(5)}/12 ${String(parts).padStart(5)}/12 ${String(missing).padStart(8)}${flag}`);
}
console.log(`\n  MAPS_BUILT is ${MAPS_BUILT}. ${totalMissing} image(s) still to draw across the designed maps.`);

// Anything the catalogue points at that is not on disk, for the maps that are live.
const broken = [
    ...MAP_ZONES.filter((z) => z.map <= MAPS_BUILT && !has(`zone-${z.id}.webp`)).map((z) => `zone ${z.id}`),
    ...Object.values(MAP_ENEMIES).filter((e) => e.map <= MAPS_BUILT && !has(`foe-${e.id}.webp`)).map((e) => `foe ${e.id}`),
    ...Object.values(MAP_BOSSES).filter((b) => b.map <= MAPS_BUILT && !has(`boss-${b.id}.webp`)).map((b) => `boss ${b.id}`),
];
if (broken.length) {
    console.log(`\n  ⚠️ ${broken.length} LIVE reference(s) with no file — these are broken images in a zone somebody can walk into:`);
    for (const b of broken.slice(0, 12)) console.log(`     ${b}`);
    process.exit(1);
}
console.log("  no live reference is missing its file.\n");
