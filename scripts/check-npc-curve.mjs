// ── HOW HARD IS EACH RUNG, TO THE PEOPLE WHO WILL WALK IT? ───────────────────────────────────────────────────
// Every PvE opponent in the game is now a made-up player: the same stat vocabulary, the same converter, the
// same engine. Which means difficulty can be asked the only way that means anything — put real members, in
// their real gear, against each tier and count.
//
// It replaces check-arena.mjs, which hand-copied the formulas as a "second opinion" and then outlived them:
// it still computes health as `200 + ferocity x 2.5` and a swing as `8 x (1 + might/100)`, neither of which
// has been true since the rewrite. A second opinion that has stopped tracking the thing it audits does not
// disagree usefully, it just lies quietly.
//
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/check-npc-curve.mjs [maxTier=60] [days=12]
import { npcFor } from "../src/lib/marketplace/arena-npc.js";
import { fighterFrom, combatStats } from "../src/lib/marketplace/arena.js";
// ⚠️ THE RING, NOT THE OLD TURN-BASED RESOLVER. autoBout took turns; the game hands them to whoever's
// BAR FILLS FIRST, and the two disagree about which stats matter — moving check-passives across flipped
// four nodes from idle to live and two the other way. A projection measured in a resolver nobody plays
// is a number about a different game. autoRing drives the real openRing/act path headlessly.
import { autoRing } from "../src/lib/marketplace/arena-ring.js";
import { getEquippedStats, getEquippedIds } from "../src/lib/marketplace/inventory.js";
import { db } from "../src/lib/db.js";

const MAX_TIER = Number(process.argv[2]) || 60;
const DAYS = Number(process.argv[3]) || 12;

const rows = await db.query(`
    SELECT b.id, b.display_name
      FROM mkt_buyer b JOIN mkt_activity_event e ON e.buyer_id = b.id
     WHERE e.created_at > NOW() - INTERVAL '14 days' AND b.display_name IS NOT NULL
     GROUP BY b.id, b.display_name
    HAVING COUNT(DISTINCT (e.created_at AT TIME ZONE 'America/Chicago')::date) >= $1`, [DAYS]);

const members = [];
for (const r of rows) {
    const bySlot = await getEquippedIds(r.id).catch(() => ({}));
    const ids = Object.values(bySlot || {}).filter(Boolean);
    if (!ids.length) continue;
    const stats = await combatStats(r.id, await getEquippedStats(r.id).catch(() => ({})), ids).catch(() => null);
    if (stats) members.push({ who: r.display_name, f: fighterFrom(stats, {}, null) });
}
members.sort((a, z) => z.f.damage - a.f.damage);
const seeded = (n) => { let x = n >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };

// Three real reference points rather than an average: the field is not one player and a curve tuned to the
// mean is wrong for everybody at both ends.
const REF = [members[0], members[Math.floor(members.length / 2)], members[members.length - 1]].filter(Boolean);
console.log(`\n  ${members.length} daily members. Reference fighters:`);
for (const m of REF) console.log(`    ${m.who.padEnd(20)} damage ${String(Math.round(m.f.damage)).padStart(5)}  health ${String(m.f.health).padStart(5)}  armour ${String(m.f.armor).padStart(4)}`);

const rate = (me, foe) => {
    let w = 0;
    for (let s = 0; s < 40; s += 1) if (autoRing({ ...me }, { ...foe }, { rng: seeded(701 + s * 7919) }).won) w += 1;
    return w / 40;
};

console.log(`\n  tier  archetype    ${REF.map((m) => m.who.slice(0, 10).padStart(11)).join("")}   the whole field`);
const firstWall = {};
for (let t = 1; t <= MAX_TIER; t += 1) {
    const n = npcFor(t);
    const foe = fighterFrom(n, {}, null);
    const each = REF.map((m) => rate(m.f, foe));
    const all = members.reduce((a, m) => a + rate(m.f, foe), 0) / members.length;
    REF.forEach((m, i) => { if (firstWall[m.who] == null && each[i] < 0.5) firstWall[m.who] = t; });
    // Sampling every fifth tier hid the archetypes — they cycle on t % 5, so a multiple of five is ALWAYS
    // balanced and the column read as though the game had one shape in it. Stepped so the cycle shows.
    if (t <= 6 || t % 7 === 0 || (t >= 38 && t <= 52)) {
        console.log(`   ${String(t).padStart(3)}  ${n.archetype.padEnd(11)} ${each.map((x) => `${(x * 100).toFixed(0)}%`.padStart(11)).join("")}   ${String((all * 100).toFixed(0)).padStart(4)}%   foe ${String(Math.round(foe.damage)).padStart(5)}dmg ${String(foe.health).padStart(6)}hp ${String(foe.armor).padStart(5)}arm`);
    }
}
console.log("\n  where each of them stops winning half the time:");
for (const m of REF) console.log(`    ${m.who.padEnd(20)} tier ${firstWall[m.who] ?? `beyond ${MAX_TIER}`}`);
process.exit(0);
