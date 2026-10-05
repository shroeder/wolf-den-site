// ── DID THE REWORK LAND? ─────────────────────────────────────────────────────────────────────────────────
// The casino went from chips-in-chips-out with a shop, to gold-in-gold-out with a ladder. That is four
// things at once — a currency, a paytable, a shelf and a daily claim — and three of them can fail silently.
//
//   node --import ./scripts/lib/register-loader.mjs scripts/verify-casino-rework.mjs
import "./lib/register-loader.mjs";
import fs from "node:fs";

const env = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/.env", "utf8");
process.env.DATABASE_URL ||= env.match(/^DATABASE_URL=["']?([^"'\r\n]+)/m)[1];

const { db } = await import("../src/lib/db.js");
const { SLOTS5, playSpin, TARGET_RTP } = await import("../src/lib/marketplace/casino-slot5.js");
const { entitlements } = await import("../src/lib/marketplace/casino-milestones.js");
const { ladder } = await import("../src/lib/marketplace/casino-claim.js");

let fails = 0;
const check = (ok, label, detail = "") => { if (!ok) fails += 1; console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`); };

// ── 1. NO MACHINE MAY RETURN MORE THAN IT TAKES ─────────────────────────────────────────────────────────
// ⚠️ THIS IS THE ONE THAT MATTERS. The floor pays GOLD now; a cabinet above 100% is not a generous machine,
// it is an unbounded gold printer, and that is a different category of bug from every other number here.
const mulberry = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
console.log(`── EVERY CABINET, 3 x 90,000 spins (target ${(TARGET_RTP * 100).toFixed(0)}%) ──`);
for (const [id, m] of Object.entries(SLOTS5)) {
    let staked = 0; let paid = 0;
    for (let seed = 1; seed <= 3; seed += 1) {
        const rng = mulberry(seed * 7919);
        // ⚠️ `total`, NOT `won`, AND THE METER RIDES BETWEEN SPINS. The first cut of this read `.won` (which
        // does not exist, so every cabinet measured 0.0% and PASSED) and dropped the meter, which is where
        // the hold-and-spin cabinets bank. Both are how you measure a machine with its features switched off.
        let meter = [];
        for (let i = 0; i < 90000; i += 1) {
            const r = playSpin(m, { bet: 100, rng, meter });
            meter = r.meter || [];
            staked += 100; paid += r.total || 0;
        }
    }
    const rtp = paid / staked;
    // ⚠️ THIS USED TO BE "no cabinet may return more than it takes", and it cannot be any more. The
    // floor's target is 1.05 — a deliberate net faucet, Luke's call, backed by the tables having
    // REALISED 107.6% for two months without the economy moving. What still has to hold is that no
    // cabinet strays far from the number the whole floor was costed against: one machine quietly at
    // 130% while the rest are at 105% is the bug this catches, and it is invisible from playing.
    //
    // ±8 points, because a 270,000-spin read still swings several on cabinets with bonus rounds this big.
    check(Math.abs(rtp - TARGET_RTP) <= 0.08, `${m.name || id} sits on the floor's target`,
        `${(rtp * 100).toFixed(1)}% vs ${(TARGET_RTP * 100).toFixed(0)}%`);
}

// ── 2. THE LADDER IS A LADDER ───────────────────────────────────────────────────────────────────────────
// Every rung must be reachable, differ from its neighbours, and never go backwards as the number climbs.
const at0 = entitlements(0);
check(at0.every((e) => e.n === 0), "a member who has won nothing is owed nothing");
let prev = 0; let monotone = true;
for (const won of [50000, 150000, 400000, 900000, 1500000, 3000000]) {
    const total = entitlements(won).reduce((s, e) => s + e.n, 0);
    if (total < prev) monotone = false;
    prev = total;
}
check(monotone, "entitlements never go down as the lifetime total goes up");
// ⚠️ THE POINT OF THE REWORK, CHECKED. Luke: "right now a lot of things are thr same price... lets make the
// milestone amount differ." Eight of the fifteen things on the old shelf cost exactly 50,000. The test is
// not "all 24 rungs differ" — two `every X` tracks may legitimately share a first height — it is that no
// GROUP is flat, which is the thing that was wrong.
for (const kind of ["pet", "vip_pet", "unlock", "stat", "chest"]) {
    const hs = entitlements(0).filter((e) => e.kind === kind).map((e) => e.next);
    check(new Set(hs).size === hs.length, `the ${kind} rungs are all at different heights`, hs.join(", "));
}

// ── 3. AND IT NEVER TAKES BACK WHAT SOMEBODY BOUGHT ─────────────────────────────────────────────────────
// Eleven members hold stat levels paid for in chips. The ladder is a FLOOR: it may owe them nothing, but it
// must never show them fewer than they hold.
const holders = await db.query(
    `SELECT p.buyer_id, p.perk, p.level, b.display_name, COALESCE(b.casino_won,0)::bigint AS won
       FROM mkt_casino_perk p JOIN mkt_buyer b ON b.id = p.buyer_id
      WHERE p.level > 0 ORDER BY p.level DESC LIMIT 6`);
let kept = true;
for (const h of holders) {
    const st = await ladder(h.buyer_id);
    const rung = st.rungs.find((r) => r.ref === h.perk);
    if (rung && rung.held < h.level) { kept = false; console.log(`        ${h.display_name} ${h.perk}: holds ${h.level}, ladder says ${rung.held}`); }
}
check(kept, "nobody is shown fewer levels than they already bought");

// ── 4. THE DEAD CURRENCIES ARE GONE ─────────────────────────────────────────────────────────────────────
const left = await db.queryOne(`SELECT COUNT(*)::int n FROM mkt_buyer WHERE COALESCE(chips,0) > 0 OR COALESCE(tokens,0) > 0`);
check(Number(left.n) === 0, "no member is left holding a currency nothing accepts", `${left.n} still do`);
const seeded = await db.queryOne(`SELECT COUNT(*)::int n, MAX(casino_won)::bigint m FROM mkt_buyer WHERE casino_won > 0`);
check(Number(seeded.n) > 20, "lifetime winnings were carried across, not reset", `${seeded.n} members, top ${Number(seeded.m).toLocaleString()}`);

// ── 5. AND WHAT THE FLOOR MINTS, IN GOLD A MONTH ──────────────────────────────────────────
// ⚠️ A FAUCET ABOVE 100% IS BOUNDED BY VOLUME, NOT BY ITS RATE. The RTP says how generous the floor
// is; only the daily stake says how much gold that actually is. This is the number to watch if it ever
// needs reining in, and the one that would move first if somebody worked out how to grind it.
const vol = await db.queryOne(
    `SELECT MIN(created_at) a, MAX(created_at) b, COALESCE(-SUM(delta),0)::bigint staked
       FROM mkt_chip_event WHERE reason LIKE '%_bet' AND delta < 0`);
const days = Math.max(1, Math.round((new Date(vol.b) - new Date(vol.a)) / 86400000));
const perMonth = (TARGET_RTP - 1) * (Number(vol.staked) / days) * 30;
console.log(`
  at ${Math.round(Number(vol.staked) / days).toLocaleString()} gold staked a day, the floor ${perMonth >= 0 ? "MINTS" : "burns"} ${Math.abs(Math.round(perMonth)).toLocaleString()} gold a month.`);

console.log(fails ? `
${fails} FAILED` : `
the floor takes gold, pays gold, and returns ${(TARGET_RTP * 100).toFixed(0)}%.`);
process.exit(fails ? 1 : 0);
