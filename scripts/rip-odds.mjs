// ── WHAT THE RIP POOLS ARE ACTUALLY PAYING ──────────────────────────────────────────────────────────────────
//   node scripts/rip-odds.mjs
//
// Luke, 2026-11-13, after playing competitors' pack openers: "I'm finding that even in the ranges, it's
// weighted on the low end... I'm a little worried about our risk exposure there."
//
// The weighting he wanted already exists — pack-weights.js orders by `quantity * price^(-alpha)`, with alpha
// solved per tier by recomputePools — so the question was never "should we add it", it was "is it working".
// That is a measurement, and he was reading it off memories of people at the counter. Memories over-sample
// the $112 pull; this script does not.
//
// ⚠️ IT REPORTS MARGIN TWO WAYS AND BOTH MATTER. Against SHELF value is what the player experiences and what
// the EV target is solved in. Against COGS is what actually happened to the shop's money, and the two are
// nowhere near each other: on the first 217 opens, 28% and 64%. Quoting only one of them makes the pools look
// either stingier or more generous than they are. [[unit-cost-is-exact-fifo-never-averaged]]
//
// ⚠️ AND THE TAIL IS THE WHOLE RISK, SO IT IS PRINTED SEPARATELY. Realised margin sits ABOVE target precisely
// while the big pull has not landed yet; a $15 pack whose band reaches $300 gives that back in one event. A
// report that showed only the average would read "we are winning" right up until it did not.
import fs from "node:fs";

const read = (p) => { try { return fs.readFileSync(p, "utf8"); } catch { return ""; } };
const env = [".env.local", "C:/Users/Luke/Projects/accounting_app/.env"].map(read).join("\n");
const url = env.match(/^DATABASE_URL=["']?([^"'\r\n]+)/m)?.[1];
if (!url) { console.error("no DATABASE_URL"); process.exit(1); }

const { neon } = await import("@neondatabase/serverless");
const sql = neon(url);
const q = (t, p = []) => sql.query(t, p);
const d = (c) => "$" + (Number(c || 0) / 100).toFixed(2);
const pct = (n) => (Number.isFinite(n) ? n.toFixed(1) : "—").padStart(6) + "%";

const TARGET_MARGIN_PCT = 15;   // TARGET_MARGIN_BP in pack-pools.js

const all = (await q(`
    SELECT COUNT(*)::int n, SUM(price_cents)::bigint paid, SUM(card_value_cents)::bigint shelf,
           SUM(cogs_cents)::bigint cogs, SUM(buy_back_cents)::bigint buyback
      FROM mkt_pack_open WHERE price_cents > 0`))[0];
if (!all.n) { console.log("no opens yet."); process.exit(0); }

const shelfMargin = (100 * (Number(all.paid) - Number(all.shelf))) / Number(all.paid);
const cogsMargin = (100 * (Number(all.paid) - Number(all.cogs))) / Number(all.paid);

console.log(`\n${all.n} opens · taken in ${d(all.paid)}\n`);
console.log(`  shelf value handed out   ${d(all.shelf).padStart(10)}   margin ${pct(shelfMargin)}   (target ${TARGET_MARGIN_PCT}%)`);
console.log(`  what those cards cost    ${d(all.cogs).padStart(10)}   margin ${pct(cogsMargin)}   <- the shop's actual money`);
console.log(`  buy-back liability       ${d(all.buyback).padStart(10)}   if every card held were sold back`);

console.log("\nOUTCOME SPREAD — what a player got for what they paid");
for (const r of await q(`
    SELECT CASE WHEN card_value_cents < price_cents * 0.5 THEN '1. under 0.5x'
                WHEN card_value_cents < price_cents       THEN '2. 0.5x - 1x'
                WHEN card_value_cents < price_cents * 1.5 THEN '3. 1x - 1.5x'
                WHEN card_value_cents < price_cents * 2   THEN '4. 1.5x - 2x'
                WHEN card_value_cents < price_cents * 3   THEN '5. 2x - 3x'
                WHEN card_value_cents < price_cents * 5   THEN '6. 3x - 5x'
                ELSE '7. 5x+' END AS band, COUNT(*)::int n
      FROM mkt_pack_open WHERE price_cents > 0 GROUP BY 1 ORDER BY 1`)) {
    const share = (100 * r.n) / all.n;
    console.log(`  ${r.band.padEnd(15)}${String(r.n).padStart(5)}  ${share.toFixed(1).padStart(5)}%  ${"#".repeat(Math.round(share / 2))}`);
}
const under = (await q(`SELECT COUNT(*)::int n FROM mkt_pack_open WHERE price_cents > 0 AND card_value_cents < price_cents`))[0].n;
console.log(`  ${((100 * under) / all.n).toFixed(1)}% of opens returned less than they cost.`);

console.log("\nBY POOL");
console.log("  pool      opens      taken     shelf out    margin   alpha   worst single open");
for (const r of await q(`
    SELECT o.pool, COUNT(*)::int n, SUM(o.price_cents)::bigint paid, SUM(o.card_value_cents)::bigint shelf,
           MAX(o.card_value_cents - o.price_cents)::bigint worst, s.alpha
      FROM mkt_pack_open o LEFT JOIN mkt_pack_pool_state s ON s.pool = o.pool
     WHERE o.price_cents > 0 GROUP BY o.pool, s.alpha ORDER BY n DESC`)) {
    const m = (100 * (Number(r.paid) - Number(r.shelf))) / Number(r.paid);
    const flag = m < 0 ? "  <- UNDERWATER" : "";
    // `worst` is the biggest single open measured as value-out minus price-in, so it is only a LOSS to the
    // shop when positive. Printing a minus sign in front of it unconditionally produced "-$-4.00" for a pool
    // whose best open still went the shop's way.
    const worst = Number(r.worst) > 0 ? "-" + d(r.worst) : "none yet";
    console.log(`  ${String(r.pool || "?").padEnd(9)}${String(r.n).padStart(5)}  ${d(r.paid).padStart(10)}  ${d(r.shelf).padStart(11)}  ${pct(m)}  ${String(r.alpha ?? "—").slice(0, 6).padStart(6)}   ${worst.padStart(10)}${flag}`);
}

// ── THE EXPOSURE THAT HAS NOT HAPPENED YET ─────────────────────────────────────────────────────────────────
// Every open pool's band ceiling, against what it costs to take a shot at it. This is the number that moves
// realised margin back toward target in one event, and the only honest way to size the risk.
console.log("\nWORST CASE STILL SITTING IN EACH OPEN POOL");
for (const r of await q(`
    SELECT pool, price_cents, band_hi_cents, units FROM mkt_pack_pool_state WHERE open ORDER BY price_cents, pool`)) {
    const loss = Number(r.band_hi_cents) - Number(r.price_cents);
    console.log(`  ${String(r.pool).padEnd(9)} ${d(r.price_cents).padStart(7)} a pack · ceiling ${d(r.band_hi_cents).padStart(9)} · one such pull is ${("-" + d(loss)).padStart(10)} in a single open`);
}
console.log("");
