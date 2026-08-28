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

// ── AND THE ANSWER THE MATCHUP TABLE HIDES ───────────────────────────────────────────────────────────────────
// The table above splits every pairing by ROLE, and challenging is worth a lot — so a class that is winning
// gets read as two unrelated rows. Warden-vs-Runecaller looks like a coin flip until you notice both sides
// win about 60% when THEY are the challenger. This folds the two directions together: a class's win rate over
// every real duel it fought, whichever end of it that member was standing on.
//
// This replaced check:classes, which fought three synthetic builds on identical gear at 25 tree points and
// reported Reaver at 97% — the exact opposite of what the members' own bouts say. Luke: "I only care about
// real data. not simulated bs. I only care about the real players and their current gear skills passives pets
// badges etc." These rows ARE that: real members, real kit, real fights, whatever they were carrying.
table(`class win rate over every duel, both roles (last ${DAYS}d)`, await sql`
    WITH duel AS (
        SELECT ca.arena_class AS ch, da.arena_class AS df, ab.challenger_won
          FROM mkt_arena_bout ab
          JOIN mkt_arena ca ON ca.buyer_id = ab.challenger_id
          JOIN mkt_arena da ON da.buyer_id = ab.defender_id
         WHERE ab.defender_id IS NOT NULL AND ab.npc_tier IS NULL
           AND ca.arena_class IS NOT NULL AND da.arena_class IS NOT NULL
           AND ab.created_at > NOW() - (${String(DAYS)} || ' days')::interval
    ), sided AS (
        -- One row per FIGHTER per bout, so each side is counted once from its own point of view. A mirror
        -- contributes a win and a loss and therefore cannot flatter its own class.
        SELECT ch AS cls, challenger_won AS won, df AS vs FROM duel
        UNION ALL
        SELECT df AS cls, NOT challenger_won AS won, ch AS vs FROM duel
    )
    SELECT cls, COUNT(*)::int AS bouts, COUNT(*) FILTER (WHERE won)::int AS wins,
           COUNT(*) FILTER (WHERE vs <> cls)::int AS xbouts,
           COUNT(*) FILTER (WHERE won AND vs <> cls)::int AS xwins
      FROM sided GROUP BY 1 ORDER BY 3::numeric / NULLIF(COUNT(*), 0) DESC`, [
    { h: "class", f: (r) => r.cls },
    { h: "duels", f: (r) => r.bouts },
    { h: "win%", f: (r) => pc(r.wins, r.bouts) },
    { h: "vs OTHER classes", f: (r) => `${pc(r.xwins, r.xbouts)} of ${r.xbouts}` },
]);
console.log();

// ── THE TOP TEN, AGAINST EACH OTHER, FOR REAL ────────────────────────────────────────────────────────────────
// Luke: "use top 10 players and have them fight each other." Not a simulation of them — the bouts they have
// actually fought, so every number below already contains their real gear, skills, passives, pets and badges,
// because those are what they were carrying when it happened.
//
// Read a row as "this member's record against that column". Blank means they have never met, which is itself
// worth seeing: a ladder where the top ten have not played each other is not a ladder yet.
const TOP = await sql`
    SELECT a.buyer_id, a.vp, a.arena_class, COALESCE(b.display_name, b.alias) AS name
      FROM mkt_arena a JOIN mkt_buyer b ON b.id = a.buyer_id
     WHERE a.vp IS NOT NULL ORDER BY a.vp DESC NULLS LAST LIMIT 10`;
const ids = TOP.map((r) => r.buyer_id);
const h2h = await sql`
    SELECT ab.challenger_id AS ch, ab.defender_id AS df, ab.challenger_won
      FROM mkt_arena_bout ab
     WHERE ab.npc_tier IS NULL AND ab.challenger_id = ANY(${ids}) AND ab.defender_id = ANY(${ids})
       AND ab.created_at > NOW() - (${String(DAYS)} || ' days')::interval`;

// {me: {them: [wins, bouts]}} — folded across both roles, so challenging often cannot inflate a record.
const rec = {};
for (const id of ids) rec[id] = Object.fromEntries(ids.map((x) => [x, [0, 0]]));
for (const b of h2h) {
    if (b.ch === b.df) continue;
    rec[b.ch][b.df][1] += 1; rec[b.df][b.ch][1] += 1;
    if (b.challenger_won) rec[b.ch][b.df][0] += 1; else rec[b.df][b.ch][0] += 1;
}
const short = (s) => String(s || "?").slice(0, 8);
console.log(`
── the top 10 against each other, real bouts (last ${DAYS}d) ${"─".repeat(20)}`);
console.log("   " + "member".padEnd(17) + "cls".padEnd(5) + TOP.map((t) => short(t.name).padStart(9)).join("") + "   overall");
for (const me of TOP) {
    const cells = TOP.map((them) => {
        if (them.buyer_id === me.buyer_id) return "—".padStart(9);
        const [w, n] = rec[me.buyer_id][them.buyer_id];
        return (n ? `${Math.round((w / n) * 100)}%/${n}` : "·").padStart(9);
    });
    let w = 0; let n = 0;
    for (const them of TOP) { if (them.buyer_id === me.buyer_id) continue; w += rec[me.buyer_id][them.buyer_id][0]; n += rec[me.buyer_id][them.buyer_id][1]; }
    const tot = n ? `${Math.round((w / n) * 100)}% of ${n}` : "never fought";
    console.log("   " + short(me.name).padEnd(17) + String(me.arena_class || "-").slice(0, 4).padEnd(5) + cells.join("") + "   " + tot);
}
console.log();


