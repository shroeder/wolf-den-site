// ── PAY THE DIFFERENCE ON RUNGS ALREADY WALKED ───────────────────────────────────────────────────────────────
// The Road now pays by how high the rung is, compounding, instead of a flat rate off the power ratio. A rung
// can only be beaten ONCE — so everyone who walked one before this change earned the old rate and has no way
// to earn the new one. Left alone that is a permanent, invisible gap between members who did the same thing,
// decided by nothing but when they happened to play. Luke raised exactly that and was willing to accept it;
// it is cheap enough to simply not have.
//
// `ladder_beaten` records WHICH rungs each member took, so the difference is computable per rung rather than
// estimated. The old rate is taken as the flat 44 a rung paid at an even power ratio — which is what walking
// the Road in order produces, every rung sitting a few percent above you.
//
// Written to mkt_activity_event first, so it is reversible and auditable. --apply to write.
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

import { roadArenaXp } from "../src/lib/marketplace/arena-classes.js";

const APPLY = process.argv.includes("--apply");
const OLD_RATE = 44;   // (26 + 48 x 1.0) x the old 0.6 road multiplier
const url = readFileSync("../accounting_app/.env", "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim();
const sql = neon(url);

const done = await sql`SELECT 1 FROM mkt_activity_event WHERE event = 'road_xp_backfill' LIMIT 1`;
if (done.length && APPLY) { console.log("already run — marker present."); process.exit(0); }

const rows = await sql`
    SELECT a.buyer_id, b.display_name, a.ladder_beaten, a.arena_xp
      FROM mkt_arena a JOIN mkt_buyer b ON b.id = a.buyer_id
     WHERE a.ladder_beaten IS NOT NULL`;

const owed = [];
for (const r of rows) {
    const beaten = Array.isArray(r.ladder_beaten) ? r.ladder_beaten
        : (r.ladder_beaten && typeof r.ladder_beaten === "object" ? Object.keys(r.ladder_beaten) : []);
    const rungs = beaten.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
    if (!rungs.length) continue;
    const now = rungs.reduce((n, x) => n + roadArenaXp(x), 0);
    const then = rungs.length * OLD_RATE;
    const delta = now - then;
    if (delta > 0) owed.push({ id: r.buyer_id, who: r.display_name, rungs: rungs.length, delta, xp: Number(r.arena_xp) || 0 });
}
owed.sort((a, z) => z.delta - a.delta);

console.log(`\n  ${owed.length} members walked rungs before the Road paid by height.\n`);
console.log("  member               rungs   owed   arena xp now  ->  after");
for (const o of owed) {
    console.log(`  ${o.who.slice(0, 18).padEnd(20)} ${String(o.rungs).padStart(5)} ${String(o.delta).padStart(6)} ${String(o.xp).padStart(14)}  ->  ${o.xp + o.delta}`);
}
console.log(`\n  ${owed.reduce((n, o) => n + o.delta, 0).toLocaleString()} arena xp in total.`);

if (!APPLY) { console.log("\n  dry run — pass --apply to write\n"); process.exit(0); }

await sql`
    INSERT INTO mkt_activity_event (buyer_id, event, meta)
    VALUES (NULL, 'road_xp_backfill', ${JSON.stringify({ oldRate: OLD_RATE, total: owed.reduce((n, o) => n + o.delta, 0),
        members: owed.map((o) => ({ id: o.id, rungs: o.rungs, delta: o.delta })) })}::jsonb)`;
for (const o of owed) {
    await sql`UPDATE mkt_arena SET arena_xp = COALESCE(arena_xp, 0) + ${o.delta} WHERE buyer_id = ${o.id}`;
}
console.log(`\n  applied — ${owed.length} members topped up.\n`);
