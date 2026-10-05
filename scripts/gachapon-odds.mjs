// ── WHAT THE GACHAPON ACTUALLY COSTS, AND WHAT IT ACTUALLY PAYS ──────────────────────────────────────────
// The machine is the first thing in the game that mints REAL MONEY, so the odds are not allowed to live only
// in a comment. This recomputes them from gachapon.js itself and prints the bill in dollars a month, then
// reconciles what has actually been paid against both ledgers.
//
//   node scripts/gachapon-odds.mjs            the pool, the odds, the monthly cost
//   node scripts/gachapon-odds.mjs --live     ...and what the real machine has paid out so far
//
// ⚠️ RUN IT BEFORE TOUCHING A WEIGHT. Every number in the CREDIT note at the top of gachapon.js is derived
// from the table below; changing one weight silently makes that paragraph a lie, and the paragraph is the
// only place the cost is written in a unit Luke reads.
import "./lib/register-loader.mjs";
import fs from "node:fs";

const env = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/.env", "utf8");
process.env.DATABASE_URL ||= env.match(/^DATABASE_URL=["']?([^"'\r\n]+)/m)[1];

const { POOL, POOL_WEIGHT, CAPSULES, TICKET_ODDS, gachaIndex } = await import("../src/lib/marketplace/gachapon.js");

// Tickets a day across the whole Den, from the measured action counts the odds were sized against. Kept here
// rather than in the module because it is an OBSERVATION, not a rule — re-measure it when the Den grows.
const ACTIONS_A_DAY = {
    boss_strike: 136, delve_clear: 6, arena_win: 111, chest_open: 259, fish: 147,
    harvest: 310, mine: 104, cook: 136, raid: 8, trick_or_treat_door: 60,
};

console.log("── THE POOL ─────────────────────────────────────────────────────────────────");
const byCapsule = {};
for (const p of POOL) byCapsule[p.capsule] = (byCapsule[p.capsule] || 0) + p.w;
for (const row of gachaIndex()) {
    console.log(`  ${row.capsule.padEnd(7)} ${String(row.chance).padStart(5)}%  ${row.name}`);
}
console.log(`  ${POOL.length} prizes, ${POOL_WEIGHT} points of weight`);
console.log("\n  by capsule:");
for (const k of Object.keys(CAPSULES).sort((a, z) => CAPSULES[z].rank - CAPSULES[a].rank)) {
    console.log(`    ${k.padEnd(7)} ${((byCapsule[k] || 0) / POOL_WEIGHT * 100).toFixed(1)}%`);
}

console.log("\n── THE TICKET FAUCET ────────────────────────────────────────────────────────");
let perDay = 0;
for (const [src, p] of Object.entries(TICKET_ODDS)) {
    const n = (ACTIONS_A_DAY[src] || 0) * p;
    perDay += n;
    console.log(`  ${src.padEnd(20)} 1 in ${String(Math.round(1 / p)).padStart(4)}  × ${String(ACTIONS_A_DAY[src] || 0).padStart(4)} a day  = ${n.toFixed(2)} tickets/day`);
}
console.log(`  ≈ ${perDay.toFixed(1)} tickets a day across the Den  (${Math.round(perDay * 30)} pulls a month)`);

console.log("\n── THE BILL ─────────────────────────────────────────────────────────────────");
const credit = POOL.filter((p) => p.kind === "credit");
const pCredit = credit.reduce((n, p) => n + p.w, 0) / POOL_WEIGHT;
const avgWin = credit.reduce((n, p) => n + p.cents * p.w, 0) / credit.reduce((n, p) => n + p.w, 0) / 100;
const perPull = credit.reduce((n, p) => n + (p.cents * p.w) / POOL_WEIGHT, 0) / 100;
const monthly = perPull * perDay * 30;
console.log(`  P(any credit)       ${(pCredit * 100).toFixed(2)}% a pull  (about 1 in ${Math.round(1 / pCredit)})`);
console.log(`  average credit win  $${avgWin.toFixed(2)}`);
console.log(`  expected per pull   $${perPull.toFixed(3)}`);
console.log(`  ⇒ FACE VALUE        $${monthly.toFixed(0)} a month at today's activity`);
console.log(`     ...spent in the shop, so the real cost is COGS on $${monthly.toFixed(0)} of goods, not $${monthly.toFixed(0)}.`);
console.log(`     The one dial is CREDIT_WEIGHT in gachapon.js. Nothing else here costs real money.`);

// ── AND THE SIMULATION, BECAUSE A WEIGHT TABLE IS NOT A GUARANTEE ────────────────────────────────────────
console.log("\n── 200,000 SIMULATED PULLS ──────────────────────────────────────────────────");
const draw = (skip = new Set()) => {
    const bag = POOL.filter((p) => !skip.has(p.id));
    const total = bag.reduce((n, p) => n + p.w, 0);
    let r = Math.random() * total;
    for (const p of bag) { r -= p.w; if (r <= 0) return p; }
    return bag[bag.length - 1];
};
const N = 200000;
const hit = {};
let cents = 0;
for (let i = 0; i < N; i += 1) { const p = draw(); hit[p.id] = (hit[p.id] || 0) + 1; if (p.kind === "credit") cents += p.cents; }
const worst = POOL.map((p) => ({ id: p.id, want: p.w / POOL_WEIGHT * 100, got: (hit[p.id] || 0) / N * 100 }))
    .map((r) => ({ ...r, off: Math.abs(r.got - r.want) / Math.max(0.01, r.want) * 100 }))
    .sort((a, z) => z.off - a.off)[0];
console.log(`  simulated cost  $${(cents / 100 / N).toFixed(3)} a pull  (table says $${perPull.toFixed(3)})`);
console.log(`  worst drift     ${worst.id} wanted ${worst.want.toFixed(2)}% got ${worst.got.toFixed(2)}%`);

// ⚠️ THE ONE FAILURE A GACHAPON CANNOT HAVE. A member holding every own-once prize must still be able to pull
// — the roll re-picks around what they hold, and if that loop were wrong it would either hand out a duplicate
// or spin forever holding their ticket.
const everything = new Set(POOL.filter((p) => p.once).map((p) => p.ref));
let completed = 0;
for (let i = 0; i < 2000; i += 1) {
    const skip = new Set();
    let p = draw();
    for (let g = 0; g < POOL.length && p?.once && everything.has(p.ref); g += 1) { skip.add(p.id); p = draw(skip); }
    if (p && !(p.once && everything.has(p.ref))) completed += 1;
}
console.log(`  a member holding ALL exclusives still pulls cleanly: ${completed}/2000`);

if (process.argv.includes("--live")) {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(process.env.DATABASE_URL);
    console.log("\n── WHAT THE REAL MACHINE HAS DONE ───────────────────────────────────────────");
    const pulls = await sql`SELECT COUNT(*)::int n, COALESCE(SUM(cents),0)::int c FROM mkt_gacha_pull`;
    const ledger = await sql`SELECT COUNT(*)::int n, COALESCE(SUM(delta_cents),0)::int c
                               FROM mkt_store_credit_event WHERE reason = 'gachapon'`;
    console.log(`  pulls           ${pulls[0].n}`);
    console.log(`  game ledger     ${pulls[0].n} pulls, $${(pulls[0].c / 100).toFixed(2)} of credit`);
    console.log(`  money ledger    ${ledger[0].n} grants, $${(ledger[0].c / 100).toFixed(2)}`);
    // ⚠️ THE TWO LEDGERS MUST AGREE. One is the game's record and one is the books'; a gap means a credit was
    // granted that the game does not know about, or vice versa, and both are serious.
    console.log(pulls[0].c === ledger[0].c ? "  ✓ the two ledgers agree" : "  ✗ LEDGERS DISAGREE — investigate before anything else");
}
