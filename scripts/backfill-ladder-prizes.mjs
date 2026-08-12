// Pay out every Long Road rung that was beaten and never recorded.
//
// THE BUG. `finishBout` gates the entire road payout on `b.foe.ladder`, but `buildBout` rebuilds `bout.foe`
// from an explicit field ALLOWLIST before the bout is written to `bout_json` — and `ladder`, `rung` and
// `reward` were never on it. So the flag was `undefined` on every rung ever fought and that branch has not run
// once since the feature shipped: no laurels, no chest, no rung marked down. `ladder_beaten` is `{}` for every
// member in the database.
//
// What members saw is exactly what was reported in global chat: the road "not progressing", every opponent
// still standing after being beaten (so it looks like you may skip freely — you may, but a beaten rung was
// supposed to go grey), and a champion paying no chest.
//
// WHAT THIS PAYS. Reconstructed from `mkt_activity_event` — the win is logged with `meta.foe = 'ladder:<n>'`,
// which is the one field that DID survive the allowlist. Distinct rungs only: several members re-fought a rung
// precisely because it never went down, and a rung pays once by design.
//
// Idempotent twice over: rungs already in `ladder_beaten` are skipped, and the write is guarded by the same
// `ANY()` check the live payout uses, so running this after the fix has deployed pays nobody a second time.
//
// --apply to write; default is a dry run.
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const APPLY = process.argv.includes("--apply");
const url = readFileSync("../accounting_app/.env", "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim();
const sql = neon(url);

// ── THE PRIZE TABLE ──────────────────────────────────────────────────────────────────────────────────────────
// Mirrored from `ladderReward` in src/lib/marketplace/arena-ladder.js, which cannot be imported here: it pulls
// ARCHETYPES through the `@/` alias and plain node has no idea what that is. A mirrored formula is a formula
// that can drift, so the source is checked for the two lines this copies before a single row is written — if
// the curve has been retuned since, this script stops rather than paying yesterday's numbers.
const SRC = readFileSync("src/lib/marketplace/arena-ladder.js", "utf8");
for (const probe of ["Math.round(60 * Math.pow(1.055, rung - 1))", 'rung >= 80 ? "mythic" : rung >= 50 ? "gold" : rung >= 20 ? "iron" : "wooden"']) {
    if (!SRC.includes(probe)) throw new Error(`arena-ladder.js no longer matches this script's copy of the prize table:\n  ${probe}`);
}
const LADDER_SIZE = 100;
const ladderReward = (rung) => {
    const laurels = Math.round(60 * Math.pow(1.055, rung - 1));
    if (rung === LADDER_SIZE) return { laurels, chest: "primordial" };
    if (rung % 10 === 0) return { laurels, chest: rung >= 80 ? "mythic" : rung >= 50 ? "gold" : rung >= 20 ? "iron" : "wooden" };
    return { laurels };
};

const wins = await sql`
    SELECT e.buyer_id, COALESCE(b.display_name, b.alias) AS who,
           (e.meta->>'foe') AS foe
      FROM mkt_activity_event e JOIN mkt_buyer b ON b.id = e.buyer_id
     WHERE e.event = 'arena_win' AND e.meta->>'foe' LIKE 'ladder:%'`;

const already = new Map((await sql`SELECT buyer_id, ladder_beaten FROM mkt_arena`)
    .map((r) => [r.buyer_id, new Set((r.ladder_beaten || []).map(Number))]));

// buyer -> the set of rungs they actually put down and were never paid for
const owed = new Map();
for (const w of wins) {
    const rung = Number(String(w.foe).slice(7));
    if (!Number.isInteger(rung) || rung < 1 || rung > LADDER_SIZE) continue;
    if (already.get(w.buyer_id)?.has(rung)) continue;              // paid already; leave it alone
    if (!owed.has(w.buyer_id)) owed.set(w.buyer_id, { who: w.who, rungs: new Set() });
    owed.get(w.buyer_id).rungs.add(rung);
}

let totalLaurels = 0; const totalChests = {};
for (const [, o] of owed) {
    const rungs = [...o.rungs].sort((a, b) => a - b);
    const laurels = rungs.reduce((s, r) => s + ladderReward(r).laurels, 0);
    const chests = rungs.map((r) => ladderReward(r).chest).filter(Boolean);
    totalLaurels += laurels;
    for (const c of chests) totalChests[c] = (totalChests[c] || 0) + 1;
    console.log(`${o.who.padEnd(20)} rungs ${rungs.join(",").padEnd(24)} → ${String(laurels).padStart(5)} laurels${chests.length ? ` + ${chests.join(", ")} chest` : ""}`);
}
console.log(`\n${owed.size} members · ${totalLaurels} laurels · chests ${JSON.stringify(totalChests)}`);

if (!APPLY) { console.log("\nDRY RUN — pass --apply to write"); process.exit(0); }

for (const [buyerId, o] of owed) {
    for (const rung of [...o.rungs].sort((a, b) => a - b)) {
        // Same guard the live payout uses, so this cannot double-pay a rung that landed between the read above
        // and this write.
        const marked = await sql`
            UPDATE mkt_arena SET ladder_beaten = array_append(ladder_beaten, ${rung}::int)
             WHERE buyer_id = ${buyerId}::uuid AND NOT (${rung}::int = ANY(ladder_beaten))
             RETURNING ${rung}::int AS rung`;
        if (!marked.length) continue;
        const prize = ladderReward(rung);
        await sql`UPDATE mkt_arena SET laurels = laurels + ${prize.laurels}, laurels_earned = laurels_earned + ${prize.laurels}
                   WHERE buyer_id = ${buyerId}::uuid`;
        if (prize.chest) {
            await sql`INSERT INTO mkt_user_chest (buyer_id, tier, count) VALUES (${buyerId}::uuid, ${prize.chest}, 1)
                      ON CONFLICT (buyer_id, tier) DO UPDATE SET count = mkt_user_chest.count + 1`;
            await sql`INSERT INTO mkt_chest_grant (buyer_id, tier, count, source, meta)
                      VALUES (${buyerId}::uuid, ${prize.chest}, 1, 'arena_ladder', ${JSON.stringify({ rung, backfill: true })}::jsonb)`;
        }
    }
    console.log(`paid ${o.who}`);
}
console.log("\ndone");
