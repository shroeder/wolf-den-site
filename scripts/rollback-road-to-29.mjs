// Take the Long Road back to rung 29 — the top of the ramp — for everybody.
//
// WHY. The Road's balance was validated with sim-road-progress.mjs / sim-road-me.mjs, both of which define a
// member's wall as "the highest rung this fighter still takes AT LEAST HALF THE TIME". That threshold is only
// a wall if losing costs something, and a rung costs nothing: startBout exempts the Road from the ten-a-day
// arena allowance on purpose. So a rung you win one attempt in five is a rung you clear in five attempts, and
// every number the curve was tuned against was measuring a wall the game does not have.
//
// In one night Nicholas went from rung 24 to rung 56 on 33 wins and 32 losses — one win per rung, the losses
// stacking as he climbed. His simulated wall was 43. Thirteen rungs were bought with retries, not with power.
//
// WHY 29. Rung 30 is the knee: below it the curve climbs 10.9% a rung (the ramp out of nothing), above it
// 1.39% (the long haul that was mis-tuned). The ramp is not what broke, so the ramp is not what is taken.
//
// WHAT IS NOT TAKEN. The spoils. Laurels, chests and VP already paid stay paid — the mistake was ours, and
// clawing back a chest somebody has already opened is a second punishment for it. The consequence, stated
// plainly rather than discovered later: because `ladder_beaten` is also what makes a rung payable once, a
// re-climbed rung WILL pay a second time. That is the price of not clawing back, and it is the right way
// round.
//
// The removed rungs are written to mkt_activity_event first, so this is reversible: every member's exact list
// is recorded under `road_rollback` before a single row is changed.
//
// --apply to write; default is a dry run.
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const APPLY = process.argv.includes("--apply");
const KEEP_TO = 29;
const url = readFileSync("../accounting_app/.env", "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim();
const sql = neon(url);

// The prize table, mirrored from arena-ladder.js only to PRINT what a re-climb would re-pay. Checked against
// the source so a retuned curve stops this rather than quoting yesterday's numbers.
const SRC = readFileSync("src/lib/marketplace/arena-ladder.js", "utf8");
const PROBE = "Math.round(60 * Math.pow(1.055, rung - 1))";
if (!SRC.includes(PROBE)) throw new Error(`arena-ladder.js no longer matches this script's copy of the prize table:\n  ${PROBE}`);
const laurelsAt = (rung) => Math.round(60 * Math.pow(1.055, rung - 1));
const chestAt = (rung) => (rung >= 80 ? "mythic" : rung >= 50 ? "gold" : rung >= 20 ? "iron" : "wooden");

const done = await sql`SELECT 1 FROM mkt_activity_event WHERE event = 'road_rollback' LIMIT 1`;
if (done.length && APPLY) {
    console.log("already run — mkt_activity_event carries a road_rollback marker. Nothing to do.");
    process.exit(0);
}

const rows = await sql`
    SELECT a.buyer_id, b.display_name, a.ladder_beaten
      FROM mkt_arena a JOIN mkt_buyer b ON b.id = a.buyer_id
     WHERE array_length(a.ladder_beaten, 1) > 0`;

const hit = [];
let rungs = 0, laurels = 0;
const chests = {};
for (const r of rows) {
    const all = (r.ladder_beaten || []).map(Number);
    const lost = all.filter((n) => n > KEEP_TO).sort((a, z) => a - z);
    if (!lost.length) continue;
    const kept = all.filter((n) => n <= KEEP_TO).sort((a, z) => a - z);
    hit.push({ id: r.buyer_id, name: r.display_name, lost, kept });
    rungs += lost.length;
    for (const n of lost) { laurels += laurelsAt(n); chests[chestAt(n)] = (chests[chestAt(n)] || 0) + 1; }
}

console.log(`${hit.length} members hold ${rungs} rungs above ${KEEP_TO}\n`);
for (const h of hit.sort((a, z) => z.lost.length - a.lost.length)) {
    console.log(`  ${(h.name || h.id).padEnd(20)} keeps ${h.kept.length} (to rung ${h.kept[h.kept.length - 1] ?? 0}) · loses ${h.lost.length} (${h.lost[0]}–${h.lost[h.lost.length - 1]})`);
}
console.log(`\nif every one of those rungs is re-climbed it re-pays ${laurels} laurels and ${JSON.stringify(chests)}`);

if (!APPLY) { console.log("\ndry run — pass --apply to write"); process.exit(0); }

// Record BEFORE changing anything, so the exact lists survive even if the loop below dies halfway.
await sql`
    INSERT INTO mkt_activity_event (buyer_id, event, meta)
    VALUES (NULL, 'road_rollback', ${JSON.stringify({ keepTo: KEEP_TO, rungs, laurels, chests,
        members: hit.map((h) => ({ id: h.id, name: h.name, lost: h.lost })) })}::jsonb)`;

for (const h of hit) {
    await sql`UPDATE mkt_arena SET ladder_beaten = ${h.kept}::int[] WHERE buyer_id = ${h.id}`;
}
console.log(`\napplied — ${hit.length} members rolled back to rung ${KEEP_TO}. The removed lists are in mkt_activity_event under road_rollback.`);
