// ── MULTIPLY THE BOSS THAT IS ALREADY ON THE BOARD ───────────────────────────────────────────────────────────
//   node --import ./scripts/lib/register-loader.mjs scripts/scale-live-boss-hp.mjs           report only
//   node --import ./scripts/lib/register-loader.mjs scripts/scale-live-boss-hp.mjs --apply   write it
//
// Luke: "Boss hp needs to be 10x, current and future." BOSS_HP_MULT handles future ones at the moment they
// are sized; this is the one already being fought, which no amount of sizing will reach.
//
// ⚠️ BOTH COLUMNS, BY THE SAME FACTOR, AND THAT IS A CHOICE WITH A LOSER. There are two honest readings:
//
//   scale hp AND max_hp      the bar stays exactly where it is (86% left). Every ratio the game reads is
//                            preserved — the execute and onslaught pet procs fire at 30% and 75% of max_hp,
//                            and prepareNextBoss triggers off hp/max_hp. What breaks is an invariant nothing
//                            reads: `max_hp - hp` currently equals SUM(boss_hit.damage) to the byte, and
//                            afterwards it will not. The pack's real 93M of damage gets credited as 934M.
//
//   scale max_hp, keep hp    preserves that invariant, at the cost of snapping the bar from 86% back to
//                            98.6% — which reads to 142 members as two days of their work being deleted.
//
// The first is chosen. The invariant is internal (checked: the leaderboard, the rewards and the ticket maths
// all read SUM(damage) directly, and nothing recomputes hp from hits — hp is only ever decremented), while
// the bar is the thing a hundred and forty-two people are looking at.
//
// ⚠️ AND THE HITS ARE NOT TOUCHED, which matters more than it looks: sizeNextBossHp reads SUM(damage)/days as
// the pack's observed pace. Scaling the damage rows to "fix" the invariant would feed a tenfold pace into the
// sizer, which then applies BOSS_HP_MULT on top — a hundredfold boss, one cycle later.
import fs from "node:fs";

process.env.DATABASE_URL = process.env.DATABASE_URL
    || fs.readFileSync(".env.local", "utf8").match(/^DATABASE_URL=["']?([^"'\r\n]+)/m)[1];

const { db } = await import("@/lib/db");
const { BOSS_HP_MULT } = await import("@/lib/marketplace/boss.js");

const APPLY = process.argv.includes("--apply");
const n = (v) => Number(v).toLocaleString();

const rows = await db.query(
    `SELECT id, name, status, hp, max_hp,
            (SELECT COALESCE(SUM(damage), 0) FROM boss_hit WHERE boss_id = boss_event.id) AS dmg
       FROM boss_event WHERE status IN ('live', 'draft') ORDER BY status`,
    [],
);
if (!rows.length) { console.log("no live or draft boss to scale."); process.exit(0); }

for (const r of rows) {
    const pct = Number(r.max_hp) > 0 ? (100 * Number(r.hp)) / Number(r.max_hp) : 100;
    console.log(`\n[${r.status}] ${r.name}`);
    console.log(`  now   ${n(r.hp)} / ${n(r.max_hp)}   ${pct.toFixed(1)}% left`);
    console.log(`  after ${n(Number(r.hp) * BOSS_HP_MULT)} / ${n(Number(r.max_hp) * BOSS_HP_MULT)}   ${pct.toFixed(1)}% left (unchanged)`);
    console.log(`  ${n(r.dmg)} damage on the board stays exactly as it is`);
}

if (!APPLY) { console.log(`\nx${BOSS_HP_MULT}. Nothing written — pass --apply.\n`); process.exit(0); }

for (const r of rows) {
    await db.query(`UPDATE boss_event SET hp = hp * $2, max_hp = max_hp * $2 WHERE id = $1`, [r.id, BOSS_HP_MULT]);
}
const after = await db.query(`SELECT name, status, hp, max_hp, ROUND(100.0 * hp / NULLIF(max_hp, 0), 1) AS pct FROM boss_event WHERE status IN ('live','draft')`, []);
console.log("");
for (const r of after) console.log(`  ${r.name}: ${n(r.hp)} / ${n(r.max_hp)}  (${r.pct}% left)`);
console.log(`\nscaled ${rows.length} boss row(s) by ${BOSS_HP_MULT}.\n`);
