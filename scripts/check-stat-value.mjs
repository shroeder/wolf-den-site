// ── WHAT IS A POINT OF ANYTHING WORTH? ───────────────────────────────────────────────────────────────────────
// "Damage correlates with winning at 0.84 and health at 0.54" is not an answer to "should I build defence". A
// correlation across a field measures what the people who happen to have high health also happen to have; it
// cannot tell you what happens if YOU add some. Those are different questions and only the second one is a
// decision.
//
// So this asks the second one directly. Take every member in the daily cohort, in the gear they are actually
// wearing. Hand them a fixed budget of ONE stat. Re-run them against the whole unmodified field and see what
// the win rate does. Repeat per stat, same budget, same opponents, same seeds — so the numbers are directly
// comparable and the only thing that changed is which stat the points went into.
//
// The shape of the answer matters as much as the order. Armour is subtracted FLAT from every blow, so its value
// depends entirely on how close it already is to the attacker's damage: worth almost nothing against someone
// who hits for ten times it, and worth everything one point below their swing. A stat like that cannot be
// summarised by a single number, so the per-member spread is printed alongside the average.
//
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/check-stat-value.mjs [budget=25] [days=12]
import { fighterFrom, combatStats } from "../src/lib/marketplace/arena.js";
// ⚠️ THE RING, NOT THE OLD TURN-BASED RESOLVER. autoBout took turns; the game hands them to whoever's
// BAR FILLS FIRST, and the two disagree about which stats matter — moving check-passives across flipped
// four nodes from idle to live and two the other way. A projection measured in a resolver nobody plays
// is a number about a different game. autoRing drives the real openRing/act path headlessly.
import { autoRing } from "../src/lib/marketplace/arena-ring.js";
import { getEquippedStats, getEquippedIds } from "../src/lib/marketplace/inventory.js";
import { mergeStats } from "../src/lib/marketplace/items.js";
import { db } from "../src/lib/db.js";

const BUDGET = Number(process.argv[2]) || 25;
const DAYS = Number(process.argv[3]) || 12;

const rows = await db.query(`
    SELECT b.id, b.display_name
      FROM mkt_buyer b
      JOIN mkt_activity_event e ON e.buyer_id = b.id
     WHERE e.created_at > NOW() - INTERVAL '14 days' AND b.display_name IS NOT NULL
     GROUP BY b.id, b.display_name
    HAVING COUNT(DISTINCT (e.created_at AT TIME ZONE 'America/Chicago')::date) >= $1`, [DAYS]);

const members = [];
for (const r of rows) {
    const bySlot = await getEquippedIds(r.id).catch(() => ({}));
    const ids = Object.values(bySlot || {}).filter(Boolean);
    if (!ids.length) continue;
    const gear = await getEquippedStats(r.id).catch(() => ({}));
    const stats = await combatStats(r.id, gear, ids).catch(() => null);
    if (stats) members.push({ who: r.display_name, stats });
}
// The two hardest hitters are held out of the FIELD as well as the test: nobody beats them with 25 points of
// anything, so leaving them in adds a constant loss to every row and compresses the differences being measured.
members.sort((a, z) => (Number(z.stats.base_damage) || 0) * (Number(z.stats.might) || 0) - (Number(a.stats.base_damage) || 0) * (Number(a.stats.might) || 0));
const held = members.splice(0, 2).map((m) => m.who);

const baseline = members.map((m) => fighterFrom(m.stats, {}, null));
const seeded = (n) => () => { let x = n >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };

// One fighter against the whole field, both ways, on fixed seeds.
//
// SKIP BY INDEX, NOT BY IDENTITY. A boosted fighter is a new object, so an identity check does not recognise
// its own baseline self and it ends up fighting a weaker copy of itself — a free win the un-boosted row never
// got, which inflates every stat's gain by a matchup nobody will ever have.
function winRate(me, selfIndex) {
    let w = 0;
    let n = 0;
    for (let i = 0; i < baseline.length; i += 1) {
        if (i === selfIndex) continue;
        const foe = baseline[i];
        for (const [a, b] of [[me, foe], [foe, me]]) {
            const r = autoRing({ ...a }, { ...b }, { rng: seeded(1013 + i * 7919)() });
            n += 1;
            if (a === me ? r.won : !r.won && !r.unresolved) w += 1;
        }
    }
    return n ? w / n : 0;
}

// Every stat a member could actually put a point into, plus the two that are not stats but are what the
// defensive ones BUY, so the comparison is like for like.
const STATS = ["might", "vitality", "armor", "tenacity", "ferocity", "crit_chance", "crit_power",
    "pierce", "lifesteal", "counter", "doublestrike", "stun", "haste", "block_chance"];

console.log(`\n+${BUDGET} of one stat, handed to each of ${members.length} daily members in their real gear`);
console.log(`(${held.join(" and ")} held out — no 25 points answers their wardrobe)\n`);

const base = members.map((m, i) => winRate(baseline[i], i));
const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
console.log(`  the field wins ${(avg(base) * 100).toFixed(1)}% on average before anything is added\n`);

const results = [];
for (const stat of STATS) {
    const deltas = members.map((m, i) => {
        // block_chance is a share, not a point count — a whole point of it would be +100%. Scaled to the
        // budget the same way the others are, as a share of the ceiling a shield can reach.
        const add = stat === "block_chance" ? BUDGET / 100 : BUDGET;
        const boosted = fighterFrom(mergeStats(m.stats, { [stat]: add }), {}, null);
        return winRate(boosted, i) - base[i];
    });
    results.push({ stat, avg: avg(deltas), best: Math.max(...deltas), worst: Math.min(...deltas) });
}
results.sort((a, z) => z.avg - a.avg);

console.log("  stat            win rate gained     best member    worst member");
for (const r of results) {
    const f = (x) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;
    console.log(`  ${r.stat.padEnd(15)} ${f(r.avg).padStart(10)}        ${f(r.best).padStart(7)}        ${f(r.worst).padStart(7)}`);
}

// ── WHY ARMOUR IS NOT ONE NUMBER ─────────────────────────────────────────────────────────────────────────────
// It is subtracted flat, so a point of it is worth what it removes as a SHARE of the blow — nothing against a
// swing ten times its size, everything against one just above it. Printed per member against the field they
// actually face, because that ratio is the whole of whether defence is a real choice for them.
console.log("\n── ARMOUR AGAINST THE FIELD THEY FACE ──────────────────────────");
console.log("  member               armour   typical incoming swing   what armour stops");
const swings = baseline.map((f) => f.damage);
const median = [...swings].sort((a, b) => a - b)[Math.floor(swings.length / 2)];
for (let i = 0; i < members.length; i += 1) {
    const arm = baseline[i].armor;
    console.log(`  ${members[i].who.slice(0, 18).padEnd(20)} ${String(arm).padStart(6)} ${String(Math.round(median)).padStart(24)}   ${((Math.min(arm, median) / median) * 100).toFixed(0)}% of it`);
}
process.exit(0);
