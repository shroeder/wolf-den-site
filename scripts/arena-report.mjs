// ── WHAT THE FIGHTS ACTUALLY DID ─────────────────────────────────────────────────────────────────────────────
// Reads the telemetry every finished bout stores (mkt_arena_bout.telemetry, written by boutTelemetry() in
// arena.js) and prints it. There is deliberately no screen for this: the only reader is whoever is diagnosing
// a balance complaint, and a terminal table is a better tool for that than a page nobody visits.
//
// Usage:
//   node scripts/arena-report.mjs                 rooms, the Road, class matchups
//   node scripts/arena-report.mjs --bouts 20      the last N bouts, one line each
//   node scripts/arena-report.mjs --bout 524      one bout, everything kept about it
//   node scripts/arena-report.mjs --who "JT"      filter the bout list to one member
//   node scripts/arena-report.mjs --hours 6       narrow the window (default 48h / 14d)
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const sql = neon(readFileSync("../accounting_app/.env", "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim());
const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes(k);
const HOURS = Number(arg("--hours", 48));
const DAYS = Number(arg("--days", 14));
const pc = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : "—");

function table(title, rows, cols) {
    console.log(`\n── ${title} ${"─".repeat(Math.max(0, 74 - title.length))}`);
    if (!rows.length) { console.log("   (nothing recorded)"); return; }
    const w = cols.map((c) => Math.max(c.h.length, ...rows.map((r) => String(c.f(r) ?? "").length)));
    console.log("   " + cols.map((c, i) => c.h.padEnd(w[i])).join("  "));
    for (const r of rows) console.log("   " + cols.map((c, i) => String(c.f(r) ?? "").padEnd(w[i])).join("  "));
    // ── A COLUMN OF ZEROS IS A BROKEN COLUMN, NOT A FINDING ──────────────────────────────────────────────────
    // Every bout resolved by the ring stored `dealt` as zeros, because boutTelemetry split the log on
    // `who === "you"` and the ring writes "me". Six hundred and seventy nine bouts in one 48h window all read
    // "0 dealt per round", which is not a balance signal, it is an empty field — and a table that prints it
    // without comment is how a wrong number gets tuned against.
    const dmgCol = cols.findIndex((c) => /dealt/.test(c.h));
    if (dmgCol >= 0 && rows.length && rows.every((r) => Number(cols[dmgCol].f(r)) === 0)) {
        console.log(`   ⚠  every row reads 0 in "${cols[dmgCol].h}" — these bouts predate the telemetry`);
        console.log("      side-split fix; the field was never written. Not a real zero.");
    }
}

// ── ONE BOUT, IN FULL ────────────────────────────────────────────────────────────────────────────────────────
if (arg("--bout")) {
    const id = Number(arg("--bout"));
    const [r] = await sql`
        SELECT ab.*, coalesce(c.display_name,c.alias) AS challenger, coalesce(d.display_name,d.alias) AS defender
          FROM mkt_arena_bout ab
          JOIN mkt_buyer c ON c.id = ab.challenger_id
          LEFT JOIN mkt_buyer d ON d.id = ab.defender_id
         WHERE ab.id = ${id}`;
    if (!r) { console.log("no such bout"); process.exit(0); }
    const t = r.telemetry;
    console.log(`\nbout ${id} · ${r.created_at.toISOString()} · ${r.rounds} rounds`);
    console.log(`${r.challenger} ${r.challenger_won ? "BEAT" : "LOST TO"} ${r.defender || (t?.rung ? `rung ${t.rung}` : `tier ${r.npc_tier}`)}`);
    if (!t) { console.log("\n(no telemetry — bout predates mig 369)"); process.exit(0); }
    // ── A ROW FROM BEFORE THE SIDE-SPLIT WAS FIXED IS NOT A ZERO, IT IS A BLANK ────────────────────
    // boutTelemetry split the log with `who === "you"` while the ring has only ever written "me" and "foe",
    // so every bout it resolved stored dealt = all zeros and taken = BOTH fighters added together. Averaging
    // those in would drag every figure this report exists to produce toward nonsense, quietly. A fight with
    // rounds in it and nothing dealt did not happen; it was mis-recorded.
    if (r.rounds > 0 && !(Number(t.dealt?.dealt) > 0) && Number(t.taken?.dealt) > 0) {
        console.log("");
        console.log("⚠️  Recorded before the telemetry side-split was fixed.");
        console.log("   `dealt` is empty and `taken` holds BOTH fighters. These numbers are not usable.");
    }
    const line = (label, s, f) => console.log(`  ${label.padEnd(9)} ${f.damage} dmg · ${f.critChance}% crit x${f.critMult} · ${f.health} hp · ${f.dr}% reduction · ${f.accuracy}% accuracy · ${f.element}
             dealt ${s.dealt} over ${s.swings} swings (${s.perSwing}/swing, ${s.crits} crits)
             ${s.turnedAside} turned aside · ${s.shieldEaten} eaten by shield · ${s.returned} came back
             ${s.guards} guards · ${s.wards} wards · ${s.abilities} skills (${s.blows ?? "?"} blows${
        s.missed ? `, ${s.missed} missed` : ""}) · ${s.items} items · healed ${s.healed}`);
    console.log();
    line("CHALLENGER", t.dealt, t.me || {});
    line("OPPONENT", t.taken, t.foe || {});
    console.log(`\n  ${t.clashNote || "no clash"} (x${t.clash}) · underdog x${t.underdog}`);
    console.log(`  per round: dealt ${t.perRoundDealt}, taken ${t.perRoundTaken} · ended ${t.hpLeft} hp to ${t.foeHpLeft}`);
    process.exit(0);
}

// ── THE LAST N BOUTS ─────────────────────────────────────────────────────────────────────────────────────────
if (has("--bouts") || arg("--who")) {
    const n = Number(arg("--bouts", 20));
    const who = arg("--who");
    const rows = await sql`
        SELECT ab.id, ab.created_at, ab.rounds, ab.challenger_won, ab.npc_tier, ab.kind, ab.rung, ab.telemetry AS t,
               coalesce(c.display_name,c.alias) AS challenger, coalesce(d.display_name,d.alias) AS defender
          FROM mkt_arena_bout ab
          JOIN mkt_buyer c ON c.id = ab.challenger_id
          LEFT JOIN mkt_buyer d ON d.id = ab.defender_id
         WHERE (${who}::text IS NULL
                OR coalesce(c.display_name,c.alias) = ${who} OR coalesce(d.display_name,d.alias) = ${who})
         ORDER BY ab.created_at DESC LIMIT ${n}`;
    table(`last ${rows.length} bouts${who ? ` involving ${who}` : ""}`, rows, [
        { h: "id", f: (r) => r.id },
        { h: "when", f: (r) => r.created_at.toISOString().slice(5, 16).replace("T", " ") },
        { h: "challenger", f: (r) => r.challenger },
        { h: "", f: (r) => (r.challenger_won ? "beat" : "LOST") },
        { h: "opponent", f: (r) => r.defender || (r.rung ? `rung ${r.rung}` : r.npc_tier ? `tier ${r.npc_tier}` : r.kind === "town" ? "plaza" : "?") },
        { h: "rds", f: (r) => r.rounds },
        { h: "dealt/rd", f: (r) => r.t?.perRoundDealt ?? "—" },
        { h: "taken/rd", f: (r) => r.t?.perRoundTaken ?? "—" },
        { h: "hp left", f: (r) => (r.t ? `${r.t.hpLeft} v ${r.t.foeHpLeft}` : "—") },
    ]);
    process.exit(0);
}

// ── THE THREE STANDING QUESTIONS ─────────────────────────────────────────────────────────────────────────────
table(`is each room a fight? (last ${HOURS}h)`, await sql`
    SELECT kind, COUNT(*)::int AS bouts,
           COUNT(*) FILTER (WHERE challenger_won)::int AS wins,
           ROUND(AVG(rounds)::numeric, 1) AS rds,
           ROUND(AVG((telemetry->>'perRoundDealt')::numeric), 0) AS dealt,
           ROUND(AVG((telemetry->>'perRoundTaken')::numeric), 0) AS taken
      FROM mkt_arena_bout
     WHERE kind IS NOT NULL AND created_at > NOW() - (${String(HOURS)} || ' hours')::interval
     GROUP BY 1 ORDER BY 2 DESC`, [
    { h: "room", f: (r) => r.kind },
    { h: "bouts", f: (r) => r.bouts },
    { h: "win%", f: (r) => pc(r.wins, r.bouts) },
    { h: "rounds", f: (r) => r.rds },
    { h: "dealt/rd", f: (r) => r.dealt },
    { h: "taken/rd", f: (r) => r.taken },
]);

table(`where is the wall on the Road? (last ${DAYS}d)`, await sql`
    SELECT rung, COUNT(*)::int AS tries,
           COUNT(*) FILTER (WHERE challenger_won)::int AS wins, ROUND(AVG(rounds)::numeric, 1) AS rds
      FROM mkt_arena_bout
     WHERE kind = 'ladder' AND rung IS NOT NULL
       AND created_at > NOW() - (${String(DAYS)} || ' days')::interval
     GROUP BY 1 ORDER BY 1`, [
    { h: "rung", f: (r) => r.rung },
    { h: "tries", f: (r) => r.tries },
    { h: "win%", f: (r) => pc(r.wins, r.tries) },
    { h: "rounds", f: (r) => r.rds },
]);

// Needs no telemetry — it reads class off mkt_arena, so it works on every bout ever fought.
table(`is a class food? (member duels, last ${DAYS}d)`, await sql`
    SELECT ca.arena_class AS ch, da.arena_class AS df, COUNT(*)::int AS bouts,
           COUNT(*) FILTER (WHERE ab.challenger_won)::int AS wins, ROUND(AVG(ab.rounds)::numeric, 1) AS rds
      FROM mkt_arena_bout ab
      JOIN mkt_arena ca ON ca.buyer_id = ab.challenger_id
      JOIN mkt_arena da ON da.buyer_id = ab.defender_id
     WHERE ab.defender_id IS NOT NULL AND ab.npc_tier IS NULL
       AND ca.arena_class IS NOT NULL AND da.arena_class IS NOT NULL
       AND ab.created_at > NOW() - (${String(DAYS)} || ' days')::interval
     GROUP BY 1,2 ORDER BY 3 DESC`, [
    { h: "challenger", f: (r) => r.ch },
    { h: "defender", f: (r) => r.df },
    { h: "bouts", f: (r) => r.bouts },
    { h: "chal win%", f: (r) => pc(r.wins, r.bouts) },
    { h: "rounds", f: (r) => r.rds },
]);
console.log();
