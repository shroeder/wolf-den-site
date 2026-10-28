// ── WHAT WOULD GEAR DROPS ACTUALLY BUY A NEW PLAYER? ─────────────────────────────────────────────────────────
// Luke: "I think enemies should drop gear then."
//
// The Grove's design says parts are the payload and gear is not a drop. Adding gear is the other way to fix
// the floor — instead of lowering the curve to meet a 7 dps account, raise the account to meet the curve.
// This measures how far it actually gets you, by building a fighter out of real item rows and running the
// real swing() against the shipped zone 1.
//
// ⚠️ IT ASKS THE QUESTION IN BOTH DIRECTIONS. How much dps does each gear tier buy, and — the one that
// decides whether this is safe — what does that same drop do in the hands of somebody who already has
// everything.
//
//   node scripts/grove-gear-floor.mjs
import { readFileSync } from "node:fs";
import { register } from "node:module";

register("./lib/app-loader.mjs", import.meta.url);
const pick = (f, k) => readFileSync(f, "utf8").split(/\r?\n/).find((l) => l.startsWith(`${k}=`)).slice(k.length + 1).trim();
process.env.DATABASE_URL = pick("C:/Users/Luke/Projects/accounting_app/.env", "DATABASE_URL");

const { fighterFrom } = await import("@/lib/marketplace/arena.js");
const { swing, BLEED_TICKS } = await import("@/lib/marketplace/grove-world.js");
const { drFrom } = await import("@/lib/marketplace/arena-kit.js");
const itemsMod = await import("@/lib/marketplace/items.js");
const { GROVE_ZONES, GROVE_BOSSES, scaledFoe } = await import("@/lib/marketplace/grove-catalog.js");

const ALL = (() => {
    const m = itemsMod.ALL_ITEMS || itemsMod.ITEMS || {};
    return Array.isArray(m) ? m : Object.values(m);
})();

// One piece per slot at a given rarity — the best the pool offers at that tier, which is what a player
// ends up wearing once a few have dropped.
function kitFor(rarity) {
    const bySlot = {};
    for (const it of ALL) {
        if (it.rarity !== rarity || !it.slot) continue;
        const cur = bySlot[it.slot];
        const score = (s) => Object.values(s?.stats || {}).reduce((a, b) => a + (Number(b) || 0), 0);
        if (!cur || score(it) > score(cur)) bySlot[it.slot] = it;
    }
    return Object.values(bySlot);
}

function statsOf(kit) {
    const out = {};
    for (const it of kit) for (const [k, v] of Object.entries(it.stats || {})) out[k] = (out[k] || 0) + (Number(v) || 0);
    return out;
}

function rate(f) {
    let st = 7; const rand = () => (st = (st * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    let tot = 0, bl = 0; const n = 4000;
    for (let i = 0; i < n; i += 1) { const h = swing(f, 0, rand); tot += h.dealt; if (h.bleed) bl += h.bleed.dmg * BLEED_TICKS; }
    const cd = 410 / Math.max(0.2, f.tempo);
    return { dps: ((tot + bl) / n) / (cd / 1000), hp: f.health, ehp: f.health / (1 - drFrom(f.armor, 0)) };
}

const z1 = GROVE_ZONES[0];
const ratHp = scaledFoe(z1.enemies[0], 1).hp;
const ratDmg = scaledFoe(z1.enemies[0], 1).dmg;
const boss = GROVE_BOSSES[z1.boss];

console.log(`zone 1 as shipped — rootrat ${ratHp} hp / ${ratDmg[0]}-${ratDmg[1]} dmg · ${z1.boss} ${boss.hp} hp / ${boss.dmg[0]}-${boss.dmg[1]} dmg\n`);
console.log("kit            pieces   dps      hp    s/rat   rat hits   boss time   boss hits");

const rows = [["nothing", []]];
for (const r of ["common", "rare", "epic", "legendary"]) rows.push([r, kitFor(r)]);

for (const [label, kit] of rows) {
    const f = fighterFrom(statsOf(kit), {}, null);
    const { dps, hp } = rate(f);
    const avgRat = (ratDmg[0] + ratDmg[1]) / 2;
    const avgBoss = (boss.dmg[0] + boss.dmg[1]) / 2;
    console.log(
        label.padEnd(14),
        String(kit.length).padStart(5),
        String(Math.round(dps)).padStart(7),
        String(Math.round(hp)).padStart(7),
        (ratHp / dps).toFixed(1).padStart(7) + "s",
        (hp / avgRat).toFixed(1).padStart(9),
        (Math.round(boss.hp / dps) + "s").padStart(11),
        (hp / avgBoss).toFixed(1).padStart(11),
    );
}

console.log("\n(rat hits / boss hits = how many of ITS hits the player survives. Under 2 is a one- or two-shot.)");
