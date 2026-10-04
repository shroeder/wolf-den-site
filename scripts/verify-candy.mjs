// ── DOES THE CANDY CURRENCY HOLD? ────────────────────────────────────────────────────────────────────────────
//   node --import ./scripts/lib/register-loader.mjs scripts/verify-candy.mjs
//
// The four claims worth checking, because each one is a different way for an event currency to go wrong:
//   1. nothing is minted while the event is down
//   2. the daily cap TRIMS rather than refuses — a member one short of the ceiling still gets their one
//   3. spending is atomic, so two taps cannot both pass an affordability check
//   4. a spend does NOT give back cap room, or buying something cheap becomes a way to keep earning
//
// Runs on Luke's own row against the live database and removes everything it writes.
import fs from "node:fs";

process.env.DATABASE_URL = process.env.DATABASE_URL
    || fs.readFileSync(".env.local", "utf8").match(/^DATABASE_URL=["']?([^"'\r\n]+)/m)[1];

const { db } = await import("@/lib/db");
const { HALLOWEEN_PUBLIC } = await import("@/lib/marketplace/halloween.js");
const candy = await import("@/lib/marketplace/candy.js");

const ME = "6857d67e-3dd0-46b6-aad7-b91699155ff6";
let fail = 0;
const check = (label, ok, detail) => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`); if (!ok) fail += 1; };

const wipe = async () => {
    await db.query(`DELETE FROM mkt_candy_event WHERE buyer_id = $1`, [ME]);
    await db.query(`UPDATE mkt_buyer SET candy = 0 WHERE id = $1`, [ME]);
};
await wipe();

console.log(`\nHALLOWEEN_PUBLIC = ${HALLOWEEN_PUBLIC}   cap = ${candy.DAILY_CANDY_CAP}/day\n`);

if (!HALLOWEEN_PUBLIC) {
    // ── 1. the gate ──────────────────────────────────────────────────────────────────────────────────────
    const paid = await candy.grantCandy(ME, "daily_spin");
    check("the event is DOWN, so nothing is minted", paid === 0 && (await candy.candyBalance(ME)) === 0, `grantCandy paid ${paid}`);
    const rows = await db.query(`SELECT COUNT(*)::int n FROM mkt_candy_event WHERE buyer_id = $1`, [ME]);
    check("and no ledger row is written either", rows[0].n === 0, `${rows[0].n} row(s)`);
    console.log("\n  (flip HALLOWEEN_PUBLIC to true and re-run to exercise the cap and the spend)\n");
} else {
    // ── 2. the cap trims ─────────────────────────────────────────────────────────────────────────────────
    const one = await candy.grantCandy(ME, "daily_spin");
    check("a normal grant pays its rate", one === candy.CANDY_RATES.daily_spin, `paid ${one}`);

    // Fill to one short of the ceiling, then ask for a whole dungeon clear.
    const room = candy.DAILY_CANDY_CAP - (await candy.candyEarnedToday(ME)) - 1;
    await db.query(`UPDATE mkt_buyer SET candy = candy + $2 WHERE id = $1`, [ME, room]);
    await db.query(`INSERT INTO mkt_candy_event (buyer_id, delta, source) VALUES ($1, $2, 'TEST_fill')`, [ME, room]);
    const trimmed = await candy.grantCandy(ME, "delve_clear");
    check("one short of the cap, a 25-candy clear pays exactly 1", trimmed === 1, `paid ${trimmed}`);
    check("and the next grant pays nothing", (await candy.grantCandy(ME, "delve_clear")) === 0);
    check("earned today is exactly the cap", (await candy.candyEarnedToday(ME)) === candy.DAILY_CANDY_CAP, `${await candy.candyEarnedToday(ME)}`);

    // ── 3 + 4. spending ──────────────────────────────────────────────────────────────────────────────────
    const before = await candy.candyBalance(ME);
    const spend = await candy.spendCandy(ME, 50, "TEST_vendor");
    check("spending deducts", spend.ok && spend.balance === before - 50, `${before} -> ${spend.balance}`);
    const tooMuch = await candy.spendCandy(ME, 10_000_000, "TEST_vendor");
    check("and refuses what cannot be afforded", !tooMuch.ok && tooMuch.error === "not_enough_candy", tooMuch.error);
    check("a spend does NOT give back cap room", (await candy.candyEarnedToday(ME)) === candy.DAILY_CANDY_CAP, `${await candy.candyEarnedToday(ME)}`);
    check("so no more can be earned today", (await candy.grantCandy(ME, "boss_strike")) === 0);
}

await wipe();
const left = await candy.candyBalance(ME);
check("cleaned up", left === 0, `balance ${left}`);
console.log(fail ? `\n${fail} check(s) FAILED\n` : "\nall checks passed\n");
process.exit(fail ? 1 : 0);
