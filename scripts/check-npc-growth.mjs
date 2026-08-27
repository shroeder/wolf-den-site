// ── HOW WIDE IS A FIGHT WORTH HAVING? ────────────────────────────────────────────────────────────────────────
// A ladder is only interesting where the answer is in doubt. Below that it is a chore and above it a wall, and
// both are rungs nobody plays. So the number that matters is not "how hard is tier 40", it is how much POWER
// separates a fight you always win from one you never do.
//
// Do NOT measure that by walking tier by tier: consecutive rungs are different ARCHETYPES, so the sequence is
// not monotonic and "the first rung you never win" can be a Wall sitting between two Brutes you beat. Measured
// that way every growth rate looks identical and one rung wide, which is a fact about the rotation.
//
// Hold the archetype still and binary-search instead. The ratio between the 90% power and the 10% power is the
// real width, and it converts to rungs for any growth: rungs = log(ratio) / log(growth). That ratio belongs to
// the ENGINE — to how much a bout can swing — and no choice of curve can widen it.
//
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/check-npc-growth.mjs [days=12]
import { ARCHETYPES, statsForPower, archetypeForTier } from "../src/lib/marketplace/arena-npc.js";
import { fighterFrom, combatStats } from "../src/lib/marketplace/arena.js";
// ⚠️ THE RING, NOT THE OLD TURN-BASED RESOLVER. autoBout took turns; the game hands them to whoever's
// BAR FILLS FIRST, and the two disagree about which stats matter — moving check-passives across flipped
// four nodes from idle to live and two the other way. A projection measured in a resolver nobody plays
// is a number about a different game. autoRing drives the real openRing/act path headlessly.
import { autoRing } from "../src/lib/marketplace/arena-ring.js";
import { getEquippedStats, getEquippedIds } from "../src/lib/marketplace/inventory.js";
import { db } from "../src/lib/db.js";

const DAYS = Number(process.argv[2]) || 12;
const BASE_POWER = 34;                       // unchanged — this sweeps the RATE, not the floor
const GROWTHS = [1.07, 1.055, 1.045, 1.035, 1.03];

const rows = await db.query(`
    SELECT b.id, b.display_name FROM mkt_buyer b JOIN mkt_activity_event e ON e.buyer_id = b.id
     WHERE e.created_at > NOW() - INTERVAL '14 days' AND b.display_name IS NOT NULL
     GROUP BY b.id, b.display_name
    HAVING COUNT(DISTINCT (e.created_at AT TIME ZONE 'America/Chicago')::date) >= $1`, [DAYS]);

const members = [];
for (const r of rows) {
    const ids = Object.values(await getEquippedIds(r.id).catch(() => ({}))).filter(Boolean);
    if (!ids.length) continue;
    const stats = await combatStats(r.id, await getEquippedStats(r.id).catch(() => ({})), ids).catch(() => null);
    if (stats) members.push({ who: r.display_name, f: fighterFrom(stats, {}, null) });
}
members.sort((a, z) => z.f.damage - a.f.damage);
const REF = [members[0], members[Math.floor(members.length / 4)], members[Math.floor(members.length / 2)], members[members.length - 1]].filter(Boolean);

const seeded = (n) => { let x = n >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };
const rate = (me, foe) => {
    let w = 0;
    for (let s = 0; s < 24; s += 1) if (autoRing({ ...me }, { ...foe }, { rng: seeded(4211 + s * 7919) }).won) w += 1;
    return w / 24;
};
// ── THE BAND, MEASURED IN POWER RATHER THAN RUNGS ────────────────────────────────────────────────────────────
// Walking tier by tier conflates two things: the ladder getting harder, and the ARCHETYPE rotating underneath
// it. Consecutive rungs are different shapes, so the sequence is not monotonic and "the first rung you never
// win" can be a Wall sitting between two Brutes you beat. Measured that way every growth rate came out one
// rung wide — which is a fact about the rotation, not about the curve.
//
// So: hold the archetype STILL and binary-search the power where the fight goes 90% and where it goes 10%.
// The RATIO between those powers is the real width, and it converts to rungs for any growth rate:
// rungs = log(ratio) / log(growth). That ratio is a property of the ENGINE — of how much a bout can swing —
// and no choice of curve can widen it.
function powerAt(fighter, archKey, target) {
    let lo = 10;
    let hi = 400000;
    for (let i = 0; i < 24; i += 1) {
        const mid = Math.round((lo + hi) / 2);
        const foe = fighterFrom(statsForPower(mid, archKey, null, 40), {}, null);
        if (rate(fighter, foe) >= target) lo = mid; else hi = mid;
    }
    return lo;
}

console.log(`
  ${members.length} daily members. How much POWER separates a fight you always win from one you never do.
`);
console.log("  member        archetype     90% win at   10% win at   ratio    rungs @1.07 / @1.035");
for (const m of REF) {
    for (const a of ARCHETYPES) {
        const easy = powerAt(m.f, a.key, 0.9);
        const wall = powerAt(m.f, a.key, 0.1);
        const ratio = wall / Math.max(1, easy);
        const r07 = Math.log(ratio) / Math.log(1.07);
        const r035 = Math.log(ratio) / Math.log(1.035);
        console.log(`  ${m.who.slice(0, 12).padEnd(13)} ${a.key.padEnd(11)} ${String(easy).padStart(11)} ${String(wall).padStart(12)}   ${ratio.toFixed(2)}x   ${r07.toFixed(1).padStart(5)} / ${r035.toFixed(1)}`);
    }
}
console.log("\n  The ratio belongs to the ENGINE, not the ladder. A wider band needs more variance in a bout —");
console.log("  at 1.0x, no growth rate can produce a fight anyone would call close.");
process.exit(0);
