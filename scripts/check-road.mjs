// ── WALK THE LADDER WITH A REAL BUILD ────────────────────────────────────────────────────────────────────────
// Every rung, one to fifty, against a member's actual loadout: what the fight is, what the foe is carrying, how
// often you win it, and — separately — how far you could GRIND to, because a ladder with free retries is
// climbed by persistence and not by power. Mistaking those two is how the Long Road shipped mis-measured.
//
// The rung is built by npcBuild, which is the whole character: class, tree, gear, affixes and the tells that
// go on its card. Resolved by autoBout through fighterFrom, the same two functions a live bout uses.
//
// MONOTONICITY IS THE THING TO WATCH. A ladder must never get easier as you climb it. The check at the bottom
// names every rung that is winnable when a lower one was not, because that is the failure a member reads as
// the game being broken — and it is invisible from any single fight.
//
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/check-road.mjs [name] [maxTier=50] [tries=100]
import { npcBuild } from "../src/lib/marketplace/arena-npc.js";
import { fighterFrom } from "../src/lib/marketplace/arena.js";
// ⚠️ THE RING, NOT THE OLD TURN-BASED RESOLVER. autoBout took turns; the game hands them to whoever's
// BAR FILLS FIRST, and the two disagree about which stats matter — moving check-passives across flipped
// four nodes from idle to live and two the other way. A projection measured in a resolver nobody plays
// is a number about a different game. autoRing drives the real openRing/act path headlessly.
import { autoRing } from "../src/lib/marketplace/arena-ring.js";
import { db } from "../src/lib/db.js";

const WHO = process.argv[2] || "The Wolf Den";
// 50 until a rung became its wardrobe. The reference member now wins every one of the first fifty outright,
// so a gate stopping there was measuring a stretch where nothing happens — the wall moved from rung 54 to 89
// and the interesting band with it.
const MAX = Number(process.argv[3]) || 120;
const TRIES = Number(process.argv[4]) || 100;

const me = await db.queryOne(`SELECT id, display_name FROM mkt_buyer WHERE display_name = $1`, [WHO]);
if (!me) throw new Error(`no member called ${WHO}`);
const { kitFor } = await import("../src/lib/marketplace/arena.js");
const kit = await kitFor(me.id);

const seeded = (n) => { let x = n >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };
const winRate = (foe, samples) => {
    let w = 0;
    for (let s = 0; s < samples; s += 1) if (autoRing({ ...kit }, { ...foe }, { rng: seeded(9001 + s * 7919) }).won) w += 1;
    return w / samples;
};
const reach = (p, n) => 1 - Math.pow(1 - p, n);

console.log(`\n  ${me.display_name} — ${kit.classId || "no class"}, ${Object.values(kit.taken || {}).reduce((a, n) => a + n, 0)} points`);
// `speed` was on this line and there is no speed — it went with the clock when turn order became a coin flip
// at the bell, and this gate has crashed on `kit.speed.toFixed` ever since. A check that throws before its
// first assertion is a check nobody is running. The stat that replaced it is printed instead.
console.log(`  damage ${Math.round(kit.damage)}  health ${kit.health}  armour ${kit.armor}  extra turn ${((kit.extra || 0) * 100).toFixed(0)}%  crit ${(kit.critChance * 100).toFixed(0)}%\n`);
console.log("  rung  class       shape       pts   win     100 tries   what it carries");

const rows = [];
for (let t = 1; t <= MAX; t += 1) {
    const b = npcBuild(t);
    const foe = fighterFrom(b.stats, b.perks, b.classId);
    let p = winRate(foe, 80);
    if (p <= 0.06) p = winRate(foe, 2500);          // resolve the small ones properly — 100 tries reads them
    rows.push({ t, p, b });
    const tells = b.tells.length ? b.tells.map((x) => x.text).join(", ") : "nothing special";
    console.log(`  ${String(t).padStart(4)}  ${b.className.padEnd(11)} ${b.archetype.padEnd(11)} ${String(b.points).padStart(3)}  ${`${(p * 100).toFixed(p < 1 && p > 0 ? 2 : 0)}%`.padStart(6)}  ${`${(reach(p, TRIES) * 100).toFixed(0)}%`.padStart(9)}   ${tells.slice(0, 46)}`);
}

const fair = rows.filter((r) => r.p >= 0.5).map((r) => r.t);
const grind = rows.filter((r) => reach(r.p, TRIES) >= 0.5).map((r) => r.t);
console.log(`\n  Beats outright (50%+ in one go):   rung ${fair.length ? Math.max(...fair) : 0}`);
console.log(`  Reaches with ${TRIES} attempts:        rung ${grind.length ? Math.max(...grind) : 0}`);

// ── DOES IT EVER GET EASIER? ─────────────────────────────────────────────────────────────────────────────────
const breaks = [];
for (let i = 1; i < rows.length; i += 1) {
    if (rows[i].p > rows[i - 1].p + 0.05) breaks.push(`${rows[i - 1].t}→${rows[i].t} (${(rows[i - 1].p * 100).toFixed(0)}% → ${(rows[i].p * 100).toFixed(0)}%)`);
}
console.log(`\n  Rungs that got EASIER than the one below: ${breaks.length}`);
if (breaks.length) console.log(`    ${breaks.join("   ")}`);
process.exit(0);
