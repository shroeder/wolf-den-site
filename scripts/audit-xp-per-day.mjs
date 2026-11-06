// READ-ONLY. Five SELECTs against mkt_xp_event to answer one question: what does a member earn in XP on an
// ordinary day? That is the figure the melt rate in docs/consumable-surplus-design.md needs and the only one
// not derivable from the code. Writes nothing — no INSERT, no UPDATE, no DELETE anywhere in this file.
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const url = readFileSync(".env.local", "utf8").match(/^DATABASE_URL=["']?(.*?)["']?\s*$/m)[1].trim();
const sql = neon(url);

const n = (x) => Number(x || 0).toLocaleString("en-US");

// ── 1. PER-MEMBER PER-DAY XP, over the last 30 days, only on days they actually played ───────────────────
// Median matters more than mean here: a couple of heavy players drag an average somewhere nobody lives.
const dist = await sql`
    WITH per_day AS (
        SELECT buyer_id,
               (created_at AT TIME ZONE 'America/Chicago')::date AS d,
               SUM(points)::int AS pts
          FROM mkt_xp_event
         WHERE created_at >= NOW() - INTERVAL '30 days'
         GROUP BY buyer_id, d
    )
    SELECT COUNT(*)::int                                                  AS member_days,
           COUNT(DISTINCT buyer_id)::int                                  AS members,
           ROUND(AVG(pts))::int                                           AS mean,
           PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY pts)::int          AS p25,
           PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY pts)::int          AS median,
           PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY pts)::int          AS p75,
           PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY pts)::int          AS p90,
           MAX(pts)::int                                                  AS max
      FROM per_day`;

// ── 2. THE SAME, FOR THE LAST 7 DAYS ─────────────────────────────────────────────────────────────────────
const dist7 = await sql`
    WITH per_day AS (
        SELECT buyer_id, (created_at AT TIME ZONE 'America/Chicago')::date AS d, SUM(points)::int AS pts
          FROM mkt_xp_event WHERE created_at >= NOW() - INTERVAL '7 days'
         GROUP BY buyer_id, d
    )
    SELECT COUNT(*)::int AS member_days,
           PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY pts)::int AS median,
           PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY pts)::int AS p90
      FROM per_day`;

// ── 3. WHERE THE XP COMES FROM ───────────────────────────────────────────────────────────────────────────
const bySource = await sql`
    SELECT action, SUM(points)::bigint AS pts, COUNT(*)::int AS events
      FROM mkt_xp_event WHERE created_at >= NOW() - INTERVAL '30 days'
     GROUP BY action ORDER BY pts DESC LIMIT 14`;

// ── 4. WHAT THE EXISTING XP CONSUMABLES ALREADY PAY ──────────────────────────────────────────────────────
// The melt is competing with these, so it matters how much of the Den's XP already comes out of a bottle.
const fromConsumables = await sql`
    SELECT action, SUM(points)::bigint AS pts, COUNT(*)::int AS events
      FROM mkt_xp_event
     WHERE created_at >= NOW() - INTERVAL '30 days' AND action IN ('consumable', 'boss_attack')
     GROUP BY action`;

// ── 5. HOW MANY SPARE STRIKE/DAMAGE POTIONS ARE ACTUALLY SITTING IN STASHES ──────────────────────────────
// The launch-cliff number: what dailyCap is protecting against.
const MELTABLE = [
    "pot_adrenaline", "stone_storm", "pot_secondwind",
    "stone_ember", "pot_berserker", "pot_fury",
    "candy_caramel_apple", "candy_sour_worm",
];
const stash = await sql`
    SELECT consumable_id, SUM(count)::int AS total, COUNT(*)::int AS holders, MAX(count)::int AS biggest
      FROM mkt_user_consumable
     WHERE count > 0 AND consumable_id = ANY(${MELTABLE})
     GROUP BY consumable_id ORDER BY total DESC`;

const perHolder = await sql`
    WITH h AS (
        SELECT buyer_id, SUM(count)::int AS spare
          FROM mkt_user_consumable
         WHERE count > 0 AND consumable_id = ANY(${MELTABLE})
         GROUP BY buyer_id
    )
    SELECT COUNT(*)::int AS holders,
           SUM(spare)::int AS total,
           ROUND(AVG(spare))::int AS mean,
           PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY spare)::int AS median,
           PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY spare)::int AS p90,
           MAX(spare)::int AS biggest
      FROM h`;

// ── REPORT ───────────────────────────────────────────────────────────────────────────────────────────────
const d = dist[0], d7 = dist7[0], ph = perHolder[0];

console.log("\n=== XP PER MEMBER PER ACTIVE DAY ======================================");
console.log(`30 days: ${n(d.member_days)} member-days across ${n(d.members)} members`);
console.log(`   p25 ${n(d.p25)}   MEDIAN ${n(d.median)}   p75 ${n(d.p75)}   p90 ${n(d.p90)}   mean ${n(d.mean)}   max ${n(d.max)}`);
console.log(` 7 days: ${n(d7.member_days)} member-days — median ${n(d7.median)}, p90 ${n(d7.p90)}`);

console.log("\n=== WHERE 30 DAYS OF XP COMES FROM ====================================");
const totalPts = bySource.reduce((a, r) => a + Number(r.pts), 0);
for (const r of bySource) {
    const pct = ((Number(r.pts) / totalPts) * 100).toFixed(1);
    console.log(`  ${String(r.action).padEnd(22)} ${n(r.pts).padStart(12)}  ${String(pct).padStart(5)}%  (${n(r.events)} events)`);
}

console.log("\n=== XP ALREADY COMING OUT OF A BOTTLE =================================");
for (const r of fromConsumables) {
    console.log(`  ${String(r.action).padEnd(22)} ${n(r.pts).padStart(12)}  (${n(r.events)} events, avg ${Math.round(Number(r.pts) / Number(r.events))})`);
}

console.log("\n=== MELTABLE POTIONS SITTING IN STASHES RIGHT NOW =====================");
for (const r of stash) {
    console.log(`  ${String(r.consumable_id).padEnd(22)} ${n(r.total).padStart(7)} held by ${n(r.holders).padStart(4)}  (biggest single stack ${n(r.biggest)})`);
}
console.log(`\n  ${n(ph.holders)} members hold ${n(ph.total)} meltable potions between them`);
console.log(`     median ${n(ph.median)} each, p90 ${n(ph.p90)}, mean ${n(ph.mean)}, biggest hoard ${n(ph.biggest)}`);
console.log("");

// ── 6. WHO THE HOLDERS ACTUALLY ARE ──────────────────────────────────────────────────────────────────────
// The median MEMBER is not the right comparison — most accounts played a little and stopped. The people who
// would use a melt button are by definition the engaged core, so measure them: their level, their lifetime
// XP, and how big a melt is against it.
const holders = await sql`
    WITH h AS (
        SELECT buyer_id, SUM(count)::int AS spare
          FROM mkt_user_consumable
         WHERE count > 0 AND consumable_id = ANY(${MELTABLE})
         GROUP BY buyer_id
    )
    SELECT COUNT(*)::int AS n,
           PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY b.xp)::int AS median_xp,
           PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY b.xp)::int AS p25_xp,
           PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY b.xp)::int AS p75_xp,
           MIN(b.xp)::int AS min_xp, MAX(b.xp)::int AS max_xp
      FROM h JOIN mkt_buyer b ON b.id = h.buyer_id`;

const hd = holders[0];
const KNEE = 20, GROWTH = 0.2, CAP = 8;
const floors = [0, 0];
let cum = 0;
for (let L = 1; L < 200; L += 1) {
    cum += L < KNEE ? 100 * L : 100 * L * Math.min(CAP, 1 + (L - KNEE) * GROWTH);
    floors[L + 1] = Math.round(cum);
}
const levelFor = (xp) => { let L = 1; while (L < 200 && xp >= floors[L + 1]) L += 1; return L; };
const stepAt = (L) => Math.round(L < KNEE ? 100 * L : 100 * L * Math.min(CAP, 1 + (L - KNEE) * GROWTH));

console.log("\n=== THE HOLDERS, BY LIFETIME XP =======================================");
for (const [label, xp] of [["p25", hd.p25_xp], ["median", hd.median_xp], ["p75", hd.p75_xp], ["max", hd.max_xp]]) {
    const L = levelFor(xp);
    console.log(`  ${label.padEnd(7)} ${n(xp).padStart(10)} XP  =  level ${String(L).padStart(3)}   (that level cost ${n(stepAt(L))})`);
}
console.log(`  a 475 XP melt is ${(475 / stepAt(levelFor(hd.median_xp)) * 100).toFixed(0)}% of a level for the median holder`);
console.log("");
