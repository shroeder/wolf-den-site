// ── WHAT DOES DAY ONE ACTUALLY MEET? ─────────────────────────────────────────────────────────────────────────
// Luke, for about a week: the Grove's curve has to be rethought, and the opening is where it is wrong.
//
// grove-reach.mjs walks a REAL member down the curve until it stops being winnable. That answers "how far
// does Littlewolf get". It cannot answer the question the on-ramp turns on, because the lowest real account
// on the server is a dormant one with no xp at all — which measures a corpse, not a beginner.
//
// This one builds the fighter a brand-new account actually has, from the same groveFighter the game uses, and
// prints what the first few zones cost that fighter in SWINGS and SECONDS. Swings is the honest unit: "three
// swings and it dies" is a feel you can hold in your head, and 180 seconds is not a hard fight, it is a
// person closing the tab.
//
//   node scripts/grove-floor.mjs            the first map, zone by zone
//   node scripts/grove-floor.mjs 1 2 3      those maps
import { readFileSync } from "node:fs";
import { register } from "node:module";

register("./lib/app-loader.mjs", import.meta.url);
const pick = (f, k) => readFileSync(f, "utf8").split("\n").find((l) => l.startsWith(k + "="))?.slice(k.length + 1).trim();
process.env.DATABASE_URL = pick("C:/Users/Luke/Projects/accounting_app/.env", "DATABASE_URL");

const { swing, BLEED_TICKS } = await import("@/lib/marketplace/grove-world.js");
const { drFrom } = await import("@/lib/marketplace/arena-kit.js");
const { GROVE_ZONES, GROVE_BOSSES, scaledFoe } = await import("@/lib/marketplace/grove-catalog.js");
const { groveFighter } = await import("@/lib/marketplace/grove-kit.js");

const SWING_MS = 410;

// ⚠️ THE FIGHTER A NEW ACCOUNT HAS, ASKED FOR RATHER THAN RETYPED. groveFighter(null) is the game's own
// answer to "no gear, no pets, no badges, no xp" — which is exactly what signing up gives you. A literal with
// the fields zeroed would read the same today and drift the first time any of those systems moves, and it
// would drift SILENTLY, in the one measurement the whole on-ramp is being tuned against.
const FRESH = await groveFighter(null);

function rate(f) {
    let st = 7; const rand = () => (st = (st * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    let tot = 0; const n = 4000;
    for (let i = 0; i < n; i += 1) { const h = swing(f, 0, rand); tot += h.dealt + (h.bleed ? h.bleed.dmg * BLEED_TICKS : 0); }
    const cd = SWING_MS / Math.max(0.2, f.tempo);
    return { per: tot / n, dps: (tot / n) / (cd / 1000), cd, ehp: f.health / (1 - drFrom(f.armor, 0)) };
}

const maps = process.argv.slice(2).map(Number).filter(Boolean);
const want = maps.length ? maps : [1];
const r = rate(FRESH);
console.log(`\nDAY ONE  ${r.dps.toFixed(1)} dps · ${FRESH.health} hp · ${Math.round(r.ehp)} effective`);
console.log(`         ${r.per.toFixed(1)} per swing, one swing every ${Math.round(r.cd)}ms\n`);

for (const mapN of want) {
    const zones = GROVE_ZONES.filter((z) => z.map === mapN);
    if (!zones.length) { console.log(`map ${mapN}: no zones`); continue; }
    console.log(`── MAP ${mapN} ${"─".repeat(60)}`);
    console.log("  zone                 wanderer                    boss");
    for (const z of zones) {
        // ⚠️ scaledFoe TAKES AN ID AND A GLOBAL DEPTH. Handing it the enemy OBJECT and the within-map zone
        // number returns nothing, and nothing prints as a dash — which reads as "this zone has no creatures"
        // rather than as "the measurement is broken". The first cut of this script did exactly that and
        // printed a clean, confident table of empty wanderers.
        const fid = (z.enemies || [])[0];
        const foe = fid ? scaledFoe(fid, z.n) : null;
        const boss = GROVE_BOSSES[z.boss] || null;
        const fs = foe ? Math.ceil(foe.hp / r.per) : 0;
        const bs = boss ? Math.ceil(boss.hp / r.per) : 0;
        const fSec = (fs * r.cd) / 1000;
        const bSec = (bs * r.cd) / 1000;
        // How many of ITS swings you survive — the other half of a fight, and the half that decides whether
        // a long fight is a grind or a death.
        const hit = foe ? (Array.isArray(foe.dmg) ? (foe.dmg[0] + foe.dmg[1]) / 2 : foe.dmg) : 0;
        const live = hit ? Math.ceil(r.ehp / hit) : 0;
        console.log(
            `  ${String(z.n).padStart(2)} ${(z.name || z.id).padEnd(16)}`
            + ` ${String(foe?.hp ?? "-").padStart(7)}hp ${String(fs).padStart(4)} sw ${fSec.toFixed(1).padStart(6)}s`
            + `  survives ${String(live).padStart(2)} hits`
            + ` │ ${String(boss?.hp ?? "-").padStart(8)}hp ${String(bs).padStart(5)} sw ${bSec.toFixed(0).padStart(6)}s`,
        );
    }
    console.log("");
}
