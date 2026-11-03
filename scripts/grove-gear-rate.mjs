// Does a gear drop ever actually come out of rollKill, and at the rate the table claims?
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/grove-gear-rate.mjs
import { GROVE_ZONES, GROVE_ENEMIES } from "@/lib/marketplace/grove-catalog.js";
import { rollKill } from "@/lib/marketplace/grove-roll.js";
import { GROVE_GEAR, gearChanceFor } from "@/lib/marketplace/grove-loot.js";

// 1. Does index-1 addressing agree with the zone's own n?
let mismatched = 0;
for (let i = 0; i < GROVE_ZONES.length; i += 1) {
    if (Number(GROVE_ZONES[i].n) !== i + 1) mismatched += 1;
}
console.log(`GROVE_ZONES length ${GROVE_ZONES.length}; zones where [n-1] is NOT the zone with that n: ${mismatched}`);
if (mismatched) {
    for (let i = 0; i < GROVE_ZONES.length && i < 10; i += 1) {
        console.log(`  index ${i} -> id ${GROVE_ZONES[i].id} n=${GROVE_ZONES[i].n}`);
    }
}

// 2. Roll a lot of kills in a few zones and count the gear.
const N = 200000;
for (const probe of [1, 2, 13, 40, 80]) {
    const zone = GROVE_ZONES[probe - 1];
    if (!zone) { console.log(`zone ${probe}: absent`); continue; }
    const foes = [...new Set((zone.enemies || []).map((e) => (typeof e === "object" ? e.id : e)))];
    const foeId = foes.find((f) => GROVE_GEAR[`${zone.id}|${f}`]) || foes[0];
    const foe = GROVE_ENEMIES[foeId];
    let gear = 0;
    for (let i = 0; i < N; i += 1) {
        const got = rollKill(foe, `probe-${probe}`, i, {}, zone.n, null);
        if (got.gear) gear += 1;
    }
    const map = zone.map || Math.ceil(zone.n / 12);
    console.log(`zone ${String(probe).padStart(3)} ${String(zone.id).padEnd(12)} foe ${String(foeId).padEnd(14)}`
        + ` table:${GROVE_GEAR[`${zone.id}|${foeId}`] ? "yes" : "NO "}`
        + ` gear ${gear}/${N} = ${(100 * gear / N).toFixed(3)}%  (expected ${(100 * gearChanceFor(map)).toFixed(3)}%)`);
}
