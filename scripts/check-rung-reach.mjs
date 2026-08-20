// ── HOW FAR CAN YOU GET IF YOU KEEP THROWING YOURSELF AT IT? ─────────────────────────────────────────────────
// The wall a member can BEAT and the wall they can REACH are different numbers, and mistaking the first for the
// second is exactly how the Long Road shipped mis-measured: it was checked by asking "what is the hardest
// fighter this person beats at least half the time", which is only a wall if losing costs you something. On a
// ladder with free retries, a rung you win one time in five is simply a rung you win — on the fifth try.
//
// So this asks the honest question instead: with N attempts at each rung, how far up does the ladder actually
// go? P(at least one win in N) = 1 - (1 - p)^N, which turns a 0.7% rung into a coin flip at a hundred tries.
//
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/check-rung-reach.mjs [name] [tries=100]
import { npcFor } from "../src/lib/marketplace/arena-npc.js";
import { fighterFrom } from "../src/lib/marketplace/arena.js";
import { autoBout } from "../src/lib/marketplace/arena-engine.js";
import { db } from "../src/lib/db.js";

const WHO = process.argv[2] || "The Wolf Den";
const TRIES = Number(process.argv[3]) || 100;

const me = await db.queryOne(`SELECT id, display_name FROM mkt_buyer WHERE display_name = $1`, [WHO]);
if (!me) throw new Error(`no member called ${WHO}`);
const { kitFor } = await import("../src/lib/marketplace/arena.js");
const kit = await kitFor(me.id);

console.log(`\n  ${me.display_name} — ${kit.classId || "no class"}, ${Object.values(kit.taken || {}).reduce((a, n) => a + n, 0)} points spent`);
console.log(`  damage ${Math.round(kit.damage)}  health ${kit.health}  armour ${kit.armor}  speed ${kit.speed.toFixed(2)}  crit ${(kit.critChance * 100).toFixed(0)}% x${kit.critMult.toFixed(2)}`);
console.log(`  ${TRIES} attempts at every rung.\n`);

// Enough bouts to resolve a probability small enough to matter: at 100 tries a 0.7% rung is already a coin
// flip, so a sample that cannot see below 1% cannot answer the question being asked.
const SAMPLES = 3000;
const seeded = (n) => { let x = n >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };
const winRate = (foe, samples) => {
    let w = 0;
    for (let s = 0; s < samples; s += 1) if (autoBout({ ...kit }, { ...foe }, { rng: seeded(9001 + s * 7919) }).won) w += 1;
    return w / samples;
};
const reach = (p, n) => 1 - Math.pow(1 - p, n);

console.log("  rung  archetype     win rate   in 100 tries   verdict");
let lastFair = 0;      // still a fair fight on its own (>=50%)
let lastLikely = 0;    // you get there with TRIES attempts, more likely than not
let lastPossible = 0;  // you get there with TRIES attempts one time in twenty
for (let t = 1; t <= 200; t += 1) {
    const foe = fighterFrom(npcFor(t), {}, null);
    // Cheap sample first; only spend the big one where the answer is close to the interesting thresholds.
    let p = winRate(foe, 60);
    if (p <= 0.05) p = winRate(foe, SAMPLES);
    const r = reach(p, TRIES);
    if (p >= 0.5) lastFair = t;
    if (r >= 0.5) lastLikely = t;
    if (r >= 0.05) lastPossible = t;
    if (p === 0 && t > lastPossible + 6) break;
    if (t >= lastFair - 1 && (p > 0 || t <= lastPossible + 4)) {
        const verdict = p >= 0.5 ? "a fair fight" : r >= 0.5 ? "reachable by grinding" : r >= 0.05 ? "a long shot" : "no";
        console.log(`  ${String(t).padStart(4)}  ${npcFor(t).archetype.padEnd(11)} ${`${(p * 100).toFixed(p < 1 ? 2 : 1)}%`.padStart(9)} ${`${(r * 100).toFixed(0)}%`.padStart(14)}   ${verdict}`);
    }
}
console.log(`\n  Beats it outright (50%+ on one attempt):      rung ${lastFair}`);
console.log(`  Gets there with ${TRIES} attempts (50%+):        rung ${lastLikely}   ${lastLikely > lastFair ? `— ${lastLikely - lastFair} rungs of pure persistence` : ""}`);
console.log(`  Gets there with ${TRIES} attempts (1 in 20):     rung ${lastPossible}`);
process.exit(0);
