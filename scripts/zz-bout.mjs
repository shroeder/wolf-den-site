import { db } from "../src/lib/db.js";
const me = await db.queryOne(`SELECT id FROM mkt_buyer WHERE display_name = 'The Wolf Den'`);
const jt = await db.queryOne(`SELECT id FROM mkt_buyer WHERE display_name = 'JT' OR alias = 'jt'`);
const r = await db.queryOne(
  `SELECT telemetry, rounds, challenger_id, challenger_won, created_at FROM mkt_arena_bout
    WHERE (challenger_id = $1 AND defender_id = $2) OR (challenger_id = $2 AND defender_id = $1)
    ORDER BY created_at DESC LIMIT 1`, [me.id, jt.id]);
const t = r.telemetry || {};
console.log();
console.log(`  JT bout ${r.created_at.toISOString()}  rounds=${r.rounds}  iChallenged=${r.challenger_id === me.id}  challengerWon=${r.challenger_won}`);
console.log(`  THE CARD SAID:  dealt 1,985   taken 4,365   23 rounds`);
console.log();
console.log(`  telemetry.dealt.dealt = ${t.dealt?.dealt}`);
console.log(`  telemetry.taken.dealt = ${t.taken?.dealt}`);
console.log(`  hpLeft=${t.hpLeft}  foeHpLeft=${t.foeHpLeft}  won=${t.won}`);
console.log(`  me.health=${t.me?.health}  foe.health=${t.foe?.health}`);
console.log();