// ── HOW HARD IS A SET PIECE TO GET TODAY, AND WHAT RATE MATCHES IT IN THE GROVE? ─────────────────────────────
// Luke, on whether collection pieces should drop in the Grove: "If you're using roles, then make it extremely
// hard to get in the Grove as well."
//
// "Extremely hard" is only a number if you measure what it is already. This reads the real acquisition rate
// of the 71 collection pieces out of production and solves for a Grove drop rate that matches it, so the
// Grove becomes one more place a set piece can turn up rather than the fastest place.
//
//   node scripts/grove-set-rate.mjs
import { readFileSync } from "node:fs";
import { register } from "node:module";

register("./lib/app-loader.mjs", import.meta.url);
const pick = (f, k) => readFileSync(f, "utf8").split(/\r?\n/).find((l) => l.startsWith(`${k}=`)).slice(k.length + 1).trim();
process.env.DATABASE_URL = pick("C:/Users/Luke/Projects/accounting_app/.env", "DATABASE_URL");

const { db } = await import("@/lib/db.js");
const sets = await import("@/lib/marketplace/sets.js");

const cs = sets.COLLECTION_SETS;
const list = Array.isArray(cs) ? cs : Object.entries(cs).map(([k, v]) => ({ id: k, ...v }));
const pieceIds = [...new Set(list.flatMap((s) => (s.items || s.pieces || []).map((p) => (typeof p === "string" ? p : p.id))))].filter(Boolean);

console.log(`${list.length} collection sets, ${pieceIds.length} distinct pieces\n`);

const owned = await db.query(
    `SELECT COUNT(*)::int copies, COUNT(DISTINCT buyer_id)::int owners,
            MIN(acquired_at)::date first, MAX(acquired_at)::date last
       FROM mkt_user_item WHERE item_id = ANY($1)`, [pieceIds]);
const o = owned[0];
console.log(`set pieces in player hands, all time: ${o.copies} copies across ${o.owners} members`);
console.log(`first ${String(o.first).slice(0, 15)} · latest ${String(o.last).slice(0, 15)}`);

const recent = await db.query(
    `SELECT COUNT(*)::int n FROM mkt_user_item WHERE item_id = ANY($1) AND acquired_at > NOW() - INTERVAL '30 days'`,
    [pieceIds]);
const perMonth = recent[0].n;
console.log(`acquired in the last 30 days: ${perMonth}  (~${(perMonth / 30).toFixed(1)} a day, Den-wide)`);

const via = await db.query(
    `SELECT acquired_via, COUNT(*)::int n FROM mkt_user_item WHERE item_id = ANY($1)
      GROUP BY acquired_via ORDER BY n DESC LIMIT 6`, [pieceIds]);
console.log(`where they come from: ${via.map((v) => `${v.acquired_via || "(null)"} ${v.n}`).join(", ")}`);

// ── SOLVE FOR THE GROVE RATE ────────────────────────────────────────────────────────────────────────────────
// The Grove must not become the fastest route. Target: it adds no more than the game already produces — so
// at most the same number again, and the honest reading of "extremely hard" is well under that.
const KPM = 40;
const GEAR_RATE = 0.008;                  // steady-state gearChance at depth (§3e)
const dropsPerHour = KPM * 60 * GEAR_RATE;
const FRONTIER_HOURS_MO = 6 * 3 * 4.3;    // the same model §3e's tail is solved against
const groveDropsMo = FRONTIER_HOURS_MO * dropsPerHour;

console.log(`\nthe Grove, at ${(GEAR_RATE * 100).toFixed(1)}% gear/kill: ${dropsPerHour.toFixed(0)} drops an hour, ~${groveDropsMo.toFixed(0)} a month Den-wide\n`);
console.log("if a set piece is X% of Grove gear drops:");
console.log("    share     set pieces/mo from the Grove     vs the game's current " + perMonth + "/mo");
for (const share of [0.05, 0.02, 0.01, 0.005, 0.002, 0.001]) {
    const n = groveDropsMo * share;
    const rel = perMonth > 0 ? `${(n / perMonth * 100).toFixed(0)}% of today's rate` : "n/a";
    console.log(`  ${(share * 100).toFixed(1).padStart(6)}% ${n.toFixed(1).padStart(28)}     ${rel}`);
}
console.log(`\n(a player's own odds: at 1% of drops, one set piece per ${(1 / (dropsPerHour * 0.01)).toFixed(0)} hours of farming)`);
