// ── WHERE IS XP ACTUALLY COMING FROM? ───────────────────────────────────────────────────────────────────────
// Luke: "I think the grove probably gives a little too much EXP, including the bosses and enemies."
//
// ⚠️ MEASURED, NOT MODELLED. The per-kill formula can be read off grove-roll.js in a second, but a formula
// does not tell you what a player earns in an evening -- that depends on how fast they clear, how long they
// stay and how deep they are, none of which a model gets right. See [[balance-real-bouts-not-sims]]: three
// sims gave three answers here before and all of them were contradicted by what members actually did.
//
// And per [[economy-nerf-measure-daily-total]], the question is the DAILY TOTAL, not the per-event number.
// A small per-kill award on a loop with no cap is a different animal from a large one on a daily.
//
//   node scripts/xp-by-source.mjs [--days 7]
//
// Reads production Neon. Writes NOTHING.
import { readFileSync } from "node:fs";

const pick = (file, key) => {
    const line = readFileSync(file, "utf8").split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
    if (!line) throw new Error(`${key} not found in ${file}`);
    return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, "");
};
process.env.DATABASE_URL = pick("C:/Users/Luke/Projects/accounting_app/.env", "DATABASE_URL");

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const DAYS = Number(arg("days", 7));

const { db } = await import("../src/lib/db.js");
const num = (n) => Number(n || 0).toLocaleString("en-US");

// ── EVERY SOURCE, RANKED ────────────────────────────────────────────────────────────────────────────────────
const bySource = await db.query(
    `SELECT action,
            COUNT(*)::int                      AS events,
            SUM(points)::int                   AS points,
            COUNT(DISTINCT buyer_id)::int      AS players
       FROM mkt_xp_event
      WHERE created_at >= NOW() - ($1 || ' days')::interval
      GROUP BY action
      ORDER BY SUM(points) DESC`,
    [String(DAYS)],
).catch((e) => { console.error(e.message); return []; });

const total = bySource.reduce((a, r) => a + Number(r.points || 0), 0);

console.log();
console.log("=".repeat(92));
console.log(`  XP BY SOURCE — last ${DAYS} days`);
console.log("=".repeat(92));
console.log(`  ${"source".padEnd(26)}${"points".padStart(12)}${"share".padStart(9)}${"events".padStart(10)}${"players".padStart(9)}${"per event".padStart(11)}`);
for (const r of bySource) {
    const pts = Number(r.points || 0);
    const ev = Number(r.events || 0);
    console.log(
        `  ${String(r.action).padEnd(26)}${num(pts).padStart(12)}`
        + `${(total ? ((pts / total) * 100).toFixed(1) + "%" : "—").padStart(9)}`
        + `${num(ev).padStart(10)}${num(r.players).padStart(9)}`
        + `${(ev ? (pts / ev).toFixed(1) : "—").padStart(11)}`,
    );
}
console.log(`  ${"TOTAL".padEnd(26)}${num(total).padStart(12)}`);

// ── THE HEAVIEST EARNERS, AND HOW MUCH OF IT WAS THE GROVE ──────────────────────────────────────────────────
// A share-of-total hides the shape: if the Grove is 40% of all XP but one player is 90% Grove, the loop is
// doing something to THEM that the average does not show.
const perPlayer = await db.query(
    `SELECT b.alias, b.display_name,
            SUM(x.points)::int                                               AS total,
            SUM(CASE WHEN x.action = 'grove' THEN x.points ELSE 0 END)::int  AS grove,
            COUNT(CASE WHEN x.action = 'grove' THEN 1 END)::int              AS grove_events
       FROM mkt_xp_event x JOIN mkt_buyer b ON b.id = x.buyer_id
      WHERE x.created_at >= NOW() - ($1 || ' days')::interval
      GROUP BY b.alias, b.display_name
      ORDER BY SUM(x.points) DESC
      LIMIT 12`,
    [String(DAYS)],
).catch(() => []);

console.log();
console.log("-".repeat(92));
console.log("  TOP EARNERS");
console.log("-".repeat(92));
console.log(`  ${"player".padEnd(22)}${"total xp".padStart(11)}${"from grove".padStart(12)}${"grove %".padStart(10)}${"settles".padStart(9)}`);
for (const r of perPlayer) {
    const t = Number(r.total || 0);
    const g = Number(r.grove || 0);
    console.log(
        `  ${String(r.alias || r.display_name || "?").slice(0, 20).padEnd(22)}${num(t).padStart(11)}`
        + `${num(g).padStart(12)}${(t ? ((g / t) * 100).toFixed(0) + "%" : "—").padStart(10)}`
        + `${num(r.grove_events).padStart(9)}`,
    );
}

// ── THE GROVE'S OWN DAILY SHAPE ─────────────────────────────────────────────────────────────────────────────
const daily = await db.query(
    `SELECT (created_at AT TIME ZONE 'America/Chicago')::date AS day,
            SUM(points)::int                  AS points,
            COUNT(*)::int                     AS settles,
            COUNT(DISTINCT buyer_id)::int     AS players
       FROM mkt_xp_event
      WHERE action = 'grove' AND created_at >= NOW() - ($1 || ' days')::interval
      GROUP BY 1 ORDER BY 1`,
    [String(DAYS)],
).catch(() => []);

console.log();
console.log("-".repeat(92));
console.log("  GROVE XP PER DAY");
console.log("-".repeat(92));
console.log(`  ${"day".padEnd(14)}${"points".padStart(10)}${"settles".padStart(10)}${"players".padStart(9)}${"per player".padStart(12)}`);
for (const d of daily) {
    const pts = Number(d.points || 0);
    const pl = Number(d.players || 0);
    console.log(
        `  ${String(d.day).slice(0, 10).padEnd(14)}${num(pts).padStart(10)}${num(d.settles).padStart(10)}`
        + `${num(pl).padStart(9)}${(pl ? Math.round(pts / pl) : 0).toString().padStart(12)}`,
    );
}

// ── WHAT A LEVEL COSTS, SO THE NUMBERS MEAN SOMETHING ───────────────────────────────────────────────────────
const lv = await db.query(
    `SELECT level, COUNT(*)::int AS n FROM mkt_buyer GROUP BY level ORDER BY level DESC LIMIT 8`,
).catch(() => []);
if (lv.length) {
    console.log();
    console.log("-".repeat(92));
    console.log("  WHERE PLAYERS ARE (top levels)");
    console.log("-".repeat(92));
    for (const r of lv) console.log(`  level ${String(r.level).padEnd(5)} ${num(r.n)} player(s)`);
}
console.log();
