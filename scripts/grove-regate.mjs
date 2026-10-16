// ── WHAT DOES EACH SAVE LOOK LIKE UNDER THE NEW RULE? ────────────────────────────────────────────────────
// The way on used to open on a zone's KILL COUNT, so the boss at the end of it was scenery. Littlewolf
// walked to zone ten past ten living bosses. The gate now hangs on the boss kill — but that only governs
// unlocks from here on. Two saves already hold `unlocked_n` values the new rule would never have granted.
//
// ⚠️ THIS IS A DRY RUN AND IT MUST STAY ONE UNTIL LUKE SAYS OTHERWISE. Rolling a zone back is taking
// progress off a real person; it is his call, not a tidy-up. Pass --apply to write, and a mode to pick the
// rule:
//
//   --mode=ladder   (strict)    unlocked_n = 1 + the run of boss kills from zone ONE, unbroken.
//                               A zone you walked past is a zone you have not finished, so everything
//                               beyond the first skipped boss closes.
//
//   --mode=earned   (lenient)   unlocked_n = the deepest zone whose OWN boss is down, plus one.
//                               Every door you opened with a kill stays open; only the ones you opened
//                               with a kill count close.
//
// NOTHING ELSE IS TOUCHED. Kills, parts, merits, emblems, armour and chests all stay exactly as they are —
// so a rolled-back player walks back through zones already cleared, meets each boss immediately (the kill
// count is already banked, so every one of them is fightable on arrival) and fights the content that was
// skipped rather than re-grinding it.
//
//   node --import ./scripts/lib/register-loader.mjs scripts/grove-regate.mjs
//   node --import ./scripts/lib/register-loader.mjs scripts/grove-regate.mjs --mode=ladder --apply
import fs from "node:fs";

process.env.DATABASE_URL = process.env.DATABASE_URL
    || fs.readFileSync(".env.local", "utf8").match(/^DATABASE_URL=["']?([^"'\r\n]+)/m)[1];

const { db } = await import("@/lib/db");
const { GROVE_ZONES } = await import("@/lib/marketplace/grove-catalog.js");

const APPLY = process.argv.includes("--apply");
const MODE = (process.argv.find((a) => a.startsWith("--mode=")) || "--mode=ladder").split("=")[1];
if (!["ladder", "earned"].includes(MODE)) { console.error(`unknown mode "${MODE}"`); process.exit(1); }

const players = await db.query(
    `SELECT p.buyer_id, p.unlocked_n, b.alias
       FROM mkt_grove_player p JOIN mkt_buyer b ON b.id = p.buyer_id
      ORDER BY b.alias`,
);
const zones = await db.query(`SELECT buyer_id, zone_id, kills, boss_done FROM mkt_grove_zone`);

const byPlayer = new Map();
for (const z of zones) {
    if (!byPlayer.has(z.buyer_id)) byPlayer.set(z.buyer_id, new Map());
    byPlayer.get(z.buyer_id).set(z.zone_id, z);
}

console.log(`\nmode: ${MODE}${APPLY ? "   ⚠️ APPLYING" : "   (dry run — nothing is written)"}\n`);

let moved = 0;
for (const p of players) {
    const rows = byPlayer.get(p.buyer_id) || new Map();
    const done = (z) => Boolean(rows.get(z.id)?.boss_done);

    let want = 1;
    if (MODE === "ladder") {
        // The unbroken run from zone one. Stop at the first boss still standing.
        for (const z of GROVE_ZONES) {
            if (!done(z)) break;
            want = Math.min(GROVE_ZONES.length, z.n + 1);
        }
    } else {
        // The deepest boss actually killed, wherever it sits.
        for (const z of GROVE_ZONES) if (done(z)) want = Math.max(want, Math.min(GROVE_ZONES.length, z.n + 1));
    }

    const now = Number(p.unlocked_n) || 1;
    const kills = GROVE_ZONES.filter((z) => Number(rows.get(z.id)?.kills) || 0).length;
    const bosses = GROVE_ZONES.filter(done);
    const line = `${p.alias.padEnd(14)} unlocked_n ${String(now).padStart(2)} → ${String(want).padStart(2)}`
        + `   zones walked: ${String(kills).padStart(2)}   bosses killed: ${bosses.length ? bosses.map((z) => z.n).join(",") : "none"}`;

    if (want === now) { console.log(`  =   ${line}`); continue; }
    moved += 1;
    console.log(`  ${want < now ? "↓" : "↑"}   ${line}`);
    // What they would have to do to stand where they stand now.
    if (want < now) {
        const owe = GROVE_ZONES.filter((z) => z.n >= want && z.n < now && !done(z));
        console.log(`      to get back: ${owe.map((z) => z.name).join(" → ") || "nothing"}`);
        const notReady = owe.filter((z) => (Number(rows.get(z.id)?.kills) || 0) < z.toUnlock);
        console.log(`      bosses fightable on arrival: ${owe.length - notReady.length}/${owe.length}`
            + (notReady.length ? `   (still owes kills in: ${notReady.map((z) => z.name).join(", ")})` : ""));
    }

    if (APPLY) {
        await db.query(`UPDATE mkt_grove_player SET unlocked_n = $2, updated_at = NOW() WHERE buyer_id = $1`,
            [p.buyer_id, want]);
        console.log(`      written.`);
    }
}

console.log(`\n${moved} of ${players.length} saves would move.`);
if (!APPLY && moved) console.log("Nothing was written. Re-run with --apply to commit.");
process.exit(0);
