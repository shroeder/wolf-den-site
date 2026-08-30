// Six members onto one chieftain, concurrently. The event row is inserted with status 'closed' — NOT 'active'
// — so getActiveTownEvent can never pick it up and nothing appears in Town while this runs. Deleted at the end
// either way.
import fs from "node:fs";
process.env.DATABASE_URL = fs.readFileSync("scripts/_venv", "utf8").match(/^DATABASE_URL="?([^"\n]+)"?$/m)[1];
const { db } = await import("@/lib/db.js");
const { CHIEFTAIN_WAVE, spawnWave, engageEnemy, strikeEnemy, accrueSharedFoePassive, partyOn, swarmState, sharedHitFor } =
    await import("@/lib/marketplace/town-swarm.js");

const FIGHTERS = 6;
let eventId = null;
const ok = (label, cond, extra = "") => console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${extra ? "  — " + extra : ""}`);

try {
    const members = await db.query(
        `SELECT id, COALESCE(NULLIF(display_name,''), alias) AS name FROM mkt_buyer
          WHERE COALESCE(xp,0) > 0 ORDER BY xp DESC LIMIT ${FIGHTERS}`);
    const row = await db.queryOne(
        `INSERT INTO mkt_town_event (kind, name, status, hp_max, hp, reward_gold, ends_at, meta)
         VALUES ('goblin_swarm','SIM (not visible)','closed',1,1,0, NOW() + interval '5 minutes', '{"sim":true}'::jsonb)
         RETURNING id`);
    eventId = Number(row.id);
    console.log(`\n  sim event #${eventId}, status 'closed' so Town cannot see it · ${members.length} fighters\n`);

    await spawnWave(eventId, CHIEFTAIN_WAVE, FIGHTERS);
    const boss = await db.queryOne(
        `SELECT id, kind, hp, hp_max, engaged_by FROM mkt_town_enemy WHERE event_id = $1 AND wave = $2`,
        [eventId, CHIEFTAIN_WAVE]);
    const unit = sharedHitFor("chieftain");
    console.log(`  chieftain hp ${boss.hp_max} · one won bout takes ${unit} · needs ${Math.ceil(boss.hp_max / unit)} wins\n`);
    ok("HP scaled with turnout", Number(boss.hp_max) > 260, `${boss.hp_max} vs a solo 260`);

    // ── EVERYONE CLAIMS IT AT ONCE ──────────────────────────────────────────────────────────────────────
    const claims = await Promise.all(members.map((m) => engageEnemy(m.id, boss.id)));
    ok("every member could engage it", claims.every((c) => c?.ok), `${claims.filter((c) => c?.ok).length}/${members.length}`);
    ok("nobody was told it was taken", !claims.some((c) => c?.error === "taken"));
    ok("it reports itself as shared", claims.every((c) => c?.shared === true));
    const after = await db.queryOne(`SELECT engaged_by FROM mkt_town_enemy WHERE id = $1`, [boss.id]);
    ok("no owner was recorded", after.engaged_by == null);

    // ── STANDING THERE COUNTS (while it is still up) ────────────────────────────────────────────────────
    await db.query(`INSERT INTO mkt_town_event_hit (event_id, buyer_id, damage, hits, last_passive_at)
                    SELECT $1, x, 0, 0, NOW() - interval '10 seconds' FROM unnest($2::uuid[]) x
                    ON CONFLICT (event_id, buyer_id) DO UPDATE SET last_passive_at = NOW() - interval '10 seconds'`,
        [eventId, members.slice(0, 2).map((m) => m.id)]);
    const beforeHp = Number((await db.queryOne(`SELECT hp FROM mkt_town_enemy WHERE id = $1`, [boss.id])).hp);
    const passives = await Promise.all(members.slice(0, 2).map((m) => accrueSharedFoePassive(m.id, eventId, 40)));
    const afterHp = Number((await db.queryOne(`SELECT hp FROM mkt_town_enemy WHERE id = $1`, [boss.id])).hp);
    ok("presence chipped the boss", passives.every((p) => p && p.damage > 0) && afterHp < beforeHp, `${beforeHp} -> ${afterHp}`);

    const stAlive = await swarmState(eventId, members[0].id, "goblin_swarm");
    const bossRow = (stAlive?.enemies || []).find((x) => x.shared);
    ok("plaza sees it as shared + tappable", Boolean(bossRow) && bossRow.takeable !== false);

    // ── EVERYONE LANDS A WIN AT ONCE ────────────────────────────────────────────────────────────────────
    const hits = await Promise.all(members.map((m) => strikeEnemy(m.id, boss.id, unit)));
    const landed = hits.filter((h) => h?.ok).length;
    const kills = hits.filter((h) => h?.killed).length;
    const now = await db.queryOne(`SELECT hp, hp_max, died_at, killed_by FROM mkt_town_enemy WHERE id = $1`, [boss.id]);
    ok("every strike landed", landed === members.length, `${landed}/${members.length}`);
    ok("nobody got 'not_yours'", !hits.some((h) => h?.error === "not_yours"));
    ok("HP reached zero", Number(now.hp) === 0, `${now.hp}/${now.hp_max}`);
    // The kill is SHARED — everyone whose blow landed on a foe that is now down helped bring it down. What
    // must be singular is the consequence: exactly one caller may advance the wave.
    ok("the kill is shared", kills >= 1, `${kills} of ${members.length} share it`);
    ok("exactly one caller resolves it", hits.filter((h) => h?.resolved).length === 1,
        `${hits.filter((h) => h?.resolved).length} resolved`);
    ok("only that caller clears the wave", hits.filter((h) => h?.waveCleared).length <= 1);

    const party = await partyOn(eventId, members[0].id);
    ok("the party is visible", party.length >= 1, `${party.length} shown, you flagged ${party.filter((p) => p.isYou).length}`);

    const ledger = await db.query(`SELECT buyer_id, damage FROM mkt_town_event_hit WHERE event_id = $1 AND damage > 0`, [eventId]);
    ok("contribution recorded for rewards", ledger.length >= members.length, `${ledger.length} members credited`);
} finally {
    if (eventId) {
        await db.query(`DELETE FROM mkt_town_enemy WHERE event_id = $1`, [eventId]).catch(() => {});
        await db.query(`DELETE FROM mkt_town_event_hit WHERE event_id = $1`, [eventId]).catch(() => {});
        await db.query(`DELETE FROM mkt_town_event WHERE id = $1`, [eventId]).catch(() => {});
        console.log(`\n  cleaned up sim event #${eventId}`);
    }
}
process.exit(0);
