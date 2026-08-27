// ── WHERE DOES EVERY REGULAR CAP OUT? ────────────────────────────────────────────────────────────────────────
// One member's wall says almost nothing on its own. What tells you whether the ladder fits the Den is the
// SPREAD: where the strongest stops, where the weakest stops, and how much of the ladder is actually being used
// by the people who turn up. A hundred rungs that all resolve between 38 and 44 is not a hundred-rung ladder.
//
// "Regular" here is anyone who plays at least every second or third day — five or more distinct days in the
// last fortnight — because that is who the curve has to fit.
//
// Each of them is walked with their REAL build: kitFor, which is gear, forge levels, gems, sets, pets, badges
// and the tree they have actually spent. No synthetic loadouts.
//
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/check-ladder-spread.mjs [maxTier=60] [days=5]
import { npcBuild } from "../src/lib/marketplace/arena-npc.js";
import { fighterFrom } from "../src/lib/marketplace/arena.js";
// ⚠️ THE RING, NOT THE OLD TURN-BASED RESOLVER. autoBout took turns; the game hands them to whoever's
// BAR FILLS FIRST, and the two disagree about which stats matter — moving check-passives across flipped
// four nodes from idle to live and two the other way. A projection measured in a resolver nobody plays
// is a number about a different game. autoRing drives the real openRing/act path headlessly.
import { autoRing } from "../src/lib/marketplace/arena-ring.js";
import { db } from "../src/lib/db.js";

const MAX = Number(process.argv[2]) || 60;
const DAYS = Number(process.argv[3]) || 5;

const rows = await db.query(`
    SELECT b.id, b.display_name,
           COUNT(DISTINCT (e.created_at AT TIME ZONE 'America/Chicago')::date) AS days
      FROM mkt_buyer b JOIN mkt_activity_event e ON e.buyer_id = b.id
     WHERE e.created_at > NOW() - INTERVAL '14 days' AND b.display_name IS NOT NULL
     GROUP BY b.id, b.display_name
    HAVING COUNT(DISTINCT (e.created_at AT TIME ZONE 'America/Chicago')::date) >= $1
     ORDER BY days DESC`, [DAYS]);

const { kitFor } = await import("../src/lib/marketplace/arena.js");
const seeded = (n) => { let x = n >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };

// Build every rung once — they are the same for everybody, and rebuilding them per member is the slow half.
const RUNGS = [];
for (let t = 1; t <= MAX; t += 1) {
    const b = npcBuild(t);
    RUNGS.push({ t, foe: fighterFrom(b.stats, b.perks, b.classId), b });
}

const people = [];
for (const r of rows) {
    const kit = await kitFor(r.id).catch(() => null);
    if (!kit || !kit.health) continue;
    const rate = (foe, n) => {
        let w = 0;
        for (let s = 0; s < n; s += 1) if (autoRing({ ...kit }, { ...foe }, { rng: seeded(6101 + s * 7919) }).won) w += 1;
        return w / n;
    };
    let fair = 0;        // highest rung won at least half the time
    let last = 0;        // highest rung won at all
    let firstReal = 0;   // FIRST rung that is not a certainty — where the climb actually begins
    for (const R of RUNGS) {
        const p = rate(R.foe, 40);
        if (!firstReal && p < 0.95) firstReal = R.t;
        if (p >= 0.5) fair = R.t;
        if (p > 0) last = R.t;
        if (p === 0 && R.t > fair + 8) break;
    }
    people.push({ who: r.display_name, days: Number(r.days), dmg: Math.round(kit.damage), hp: kit.health,
        arm: kit.armor, pts: Object.values(kit.taken || {}).reduce((a, n) => a + n, 0), fair, last, firstReal });
}
people.sort((a, b) => b.fair - a.fair || b.dmg - a.dmg);

console.log(`\n  ${people.length} members who play at least every 2-3 days (${DAYS}+ of the last 14), on their real builds.\n`);
console.log("  member               days  dmg    hp   arm  pts   climb starts   walls at   last win");
for (const p of people) {
    console.log(`  ${p.who.slice(0, 18).padEnd(20)} ${String(p.days).padStart(4)} ${String(p.dmg).padStart(5)} ${String(p.hp).padStart(5)} ${String(p.arm).padStart(5)} ${String(p.pts).padStart(4)}   ${String(p.firstReal || "-").padStart(11)} ${String(p.fair).padStart(10)} ${String(p.last).padStart(10)}`);
}
const top = people[0];
const bottom = people[people.length - 1];
console.log(`\n  Strongest: ${top.who} — walls at rung ${top.fair}, climb starts at ${top.firstReal}`);
console.log(`  Weakest:   ${bottom.who} — walls at rung ${bottom.fair}, climb starts at ${bottom.firstReal}`);
console.log(`  The whole Den is resolved by rungs ${Math.min(...people.map((p) => p.fair))} to ${Math.max(...people.map((p) => p.fair))} — ${Math.max(...people.map((p) => p.fair)) - Math.min(...people.map((p) => p.fair)) + 1} rungs of the ladder carry everybody.`);
const climbs = people.map((p) => p.fair - (p.firstReal || p.fair));
console.log(`  A member's own climb — first real fight to their wall — averages ${(climbs.reduce((a, b) => a + b, 0) / climbs.length).toFixed(1)} rungs.`);
process.exit(0);
