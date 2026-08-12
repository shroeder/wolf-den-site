// What the windfall actually pays out, measured rather than asserted.
//
// The rare-chest odds are set against the real volume of loot events in the game, and that volume grows every
// time a system ships or the Den gains members. This re-reads the live ledger, applies the exact weights and
// deny-list the server applies, and prints what the current constants will hand out — so "about twice a year"
// stays a number somebody checked rather than a sentence in a comment that was true in August.
//
// Usage:  node scripts/check-windfall.mjs [days]      (default 30)
import fs from "node:fs";

import { neon } from "@neondatabase/serverless";

import { WINDFALL_DENY, WINDFALL_NOT_LOOT, WINDFALL_SOURCES, WINDFALL_TIERS, windfallWeight } from "../src/lib/marketplace/windfall-odds.js";

const env = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/.env", "utf8");
const sql = neon(env.match(/^DATABASE_URL=(.+)$/m)[1].trim());
const DAYS = Math.max(1, Number(process.argv[2]) || 30);

const rows = await sql.query(
    `SELECT reason, COUNT(*) FILTER (WHERE delta > 0) AS earns
       FROM mkt_coin_event WHERE created_at > NOW() - ($1 || ' days')::interval
      GROUP BY reason ORDER BY 2 DESC`, [String(DAYS)]);
const active = Number((await sql.query(
    `SELECT COUNT(*) AS n FROM mkt_buyer WHERE last_seen_at > NOW() - ($1 || ' days')::interval`, [String(DAYS)]))[0].n);

let tickets = 0;
let events = 0;
let denied = 0;
const unwired = [];
let claims = 0;
const bySystem = [];
for (const r of rows) {
    const n = Number(r.earns);
    const w = windfallWeight(r.reason);
    // Split the zero-weight reasons in two: the ones we DECIDED must never roll, and everything else, which
    // is just a reason nobody has wired. Collapsed together, a system that was meant to be a source and got
    // forgotten looks exactly like a spend — and reads as intentional in this output forever.
    if (!w) {
        if (WINDFALL_DENY.has(r.reason)) denied += n;
        else if (WINDFALL_NOT_LOOT.has(r.reason)) claims += n;
        else if (n > 0) unwired.push(`${r.reason} (${n})`);
        continue;
    }
    events += n;
    tickets += n * w;
    bySystem.push({ reason: r.reason, n, w, t: n * w });
}

const perYear = (365 / DAYS);
console.log(`\n── ${DAYS} days of the live ledger ──`);
console.log(`  ${active} members active in the window`);
console.log(`  ${events.toLocaleString()} loot events roll  (+${denied.toLocaleString()} on the deny list: moved gold, idle income, admin)`);
console.log(`  ${claims.toLocaleString()} are CLAIMS — a daily, a badge, a quest. Deliberately do not roll.`);
if (unwired.length) console.log(`  NOT WIRED and not explained — a source somebody forgot? ${unwired.join(", ")}`);
console.log(`  ${tickets.toLocaleString()} weighted tickets → ${Math.round(tickets * perYear).toLocaleString()} a year across the Den`);

console.log(`\n── what that pays, per year ──`);
console.log(`  ${"tier".padEnd(12)}${"community".padStart(10)}${"one every".padStart(14)}${"per member".padStart(16)}`);
for (const t of [...WINDFALL_TIERS].reverse()) {
    const perYr = tickets * perYear * t.chance;
    const everyDays = perYr > 0 ? 365 / perYr : Infinity;
    const memberYears = active && perYr > 0 ? active / perYr : Infinity;
    console.log(`  ${t.tier.padEnd(12)}${perYr.toFixed(1).padStart(10)}${(everyDays > 400 ? `${(everyDays / 365).toFixed(1)} yr` : `${Math.round(everyDays)} days`).padStart(14)}${`1 per ${memberYears.toFixed(0)} yr`.padStart(16)}`);
}

console.log(`\n── where the tickets come from ──`);
const total = tickets || 1;
// Grouped by weight band, because the question this answers is "is one system the whole feature".
const bands = { 1: "taps (crops, fish, ore)", 4: "actions (duels, bouts, spins)", 5: "completions (dailies, quests, badges)", 40: "the big ones (bosses, raids)" };
for (const [w, label] of Object.entries(bands)) {
    const share = bySystem.filter((b) => b.w === Number(w)).reduce((s, b) => s + b.t, 0);
    console.log(`  ${label.padEnd(38)} ${((share / total) * 100).toFixed(1).padStart(5)}%`);
}
// ── AND WHAT THE LEDGER CANNOT SEE ──────────────────────────────────────────────────────────────────────────
// A source only shows up above if the system that owns it also writes a coin event by that name. Sailing pays
// in loot, so its digs are real rolls that this measurement is blind to. Printed rather than ignored: an
// unmeasured source is fine, an unmeasured source nobody mentioned is how a total quietly stops being true.
const seen = new Set(bySystem.map((b) => b.reason));
const unmeasured = Object.keys(WINDFALL_SOURCES).filter((k) => !seen.has(k));
if (unmeasured.length) console.log(`
  unmeasured (no coin event by that name): ${unmeasured.join(", ")}`);

const top = bySystem.sort((a, b) => b.t - a.t)[0];
console.log(`\n  largest single source: ${top.reason} at ${((top.t / total) * 100).toFixed(1)}% of all tickets`);
if (top.t / total > 0.3) console.log(`  ⚠ over 30% — one system is becoming the feature. Re-weight.`);
