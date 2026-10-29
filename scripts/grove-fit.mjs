// ── FIT THE GROVE'S DIFFICULTY CURVE TO THE PEOPLE WHO ACTUALLY PLAY ─────────────────────────────────────────
// Luke, for about a week: the curve has to be rethought.
//
// grove-power.mjs measured the server and the answer was blunt: the MEDIAN member is 35 dps, and the curve's
// own LOW anchor — Littlewolf, 1,830 dps — sits above the 90th percentile. The curve's idea of a beginner is
// in the top tenth of the server. Everything else follows from that.
//
// Two defects, and only one of them is "too hard":
//
//   1. THE FLOOR. Depth 1 asks 290 hp of a wanderer and 9,000 of a boss. At p25 (3 damage a swing) that is
//      97 swings and 3,000 swings — 40 seconds and twenty minutes — for the first two things you ever meet.
//   2. THE MAP SEAM. Boss health is map-stepped and then ramped WITHIN the map
//      (2.25^(map-1) * 3.05^(i/11)), so the last boss of map one is 27,458 and the first boss of map two is
//      20,000. Difficulty falls off a cliff every time you cross a map. Wanderers do not do this — they are
//      a single exponential in global depth — so the two have disagreed about the shape of the Grove since
//      map two shipped.
//
// This tool fits ONE smooth exponential in global depth to two anchors you choose, and then prints what that
// curve actually feels like for seven real players spread across the real population — in SWINGS, because
// "three swings and it dies" is a feel and "4,200 hp" is not.
//
//   node scripts/grove-fit.mjs                     the shipped curve, judged against the real population
//   node scripts/grove-fit.mjs --boss 420 1170000 --foe 10 17000
import { readFileSync } from "node:fs";
import { register } from "node:module";

register("./lib/app-loader.mjs", import.meta.url);
const pick = (f, k) => readFileSync(f, "utf8").split("\n").find((l) => l.startsWith(k + "="))?.slice(k.length + 1).trim();
process.env.DATABASE_URL = pick("C:/Users/Luke/Projects/accounting_app/.env", "DATABASE_URL");

const { db } = await import("@/lib/db.js");
const { groveFighter } = await import("@/lib/marketplace/grove-kit.js");
const { swing, BLEED_TICKS } = await import("@/lib/marketplace/grove-world.js");
const { drFrom } = await import("@/lib/marketplace/arena-kit.js");
const { GROVE_ZONES, GROVE_BOSSES, scaledFoe } = await import("@/lib/marketplace/grove-catalog.js");

const SWING_MS = 410;
const DEPTHS = 84;              // 7 built maps x 12

const arg = (k, n) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv.slice(i + 1, i + 1 + n).map(Number) : null; };
const BOSS = arg("--boss", 2);
const FOE = arg("--foe", 2);

function rate(f) {
    let st = 7; const rand = () => (st = (st * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    let tot = 0; const n = 3000;
    for (let i = 0; i < n; i += 1) { const h = swing(f, 0, rand); tot += h.dealt + (h.bleed ? h.bleed.dmg * BLEED_TICKS : 0); }
    return { per: tot / n, cd: SWING_MS / Math.max(0.2, f.tempo), ehp: (f.health || 1) / (1 - drFrom(f.armor || 0, 0)) };
}

// ── THE SEVEN THE CURVE HAS TO SERVE ────────────────────────────────────────────────────────────────────────
// Real members at real percentiles, not invented archetypes. A curve judged against two people is how this
// one got into trouble.
const rows = await db.query(
    `SELECT id, display_name, COALESCE(xp, 0)::int AS xp FROM mkt_buyer WHERE alias IS NOT NULL ORDER BY xp ASC`,
).catch(() => []);
const all = [];
for (const r of rows) {
    const f = await groveFighter(r.id).catch(() => null);
    if (!f) continue;
    const m = rate(f);
    all.push({ name: r.display_name, per: m.per, cd: m.cd, ehp: m.ehp, dps: (m.per / (m.cd / 1000)) });
}
all.sort((a, b) => a.dps - b.dps);
const at = (p) => all[Math.min(all.length - 1, Math.floor((all.length - 1) * p))];
const CAST = [0.1, 0.25, 0.5, 0.75, 0.9, 0.98, 1].map((p) => ({ p, ...at(p) }));

// ── THE TWO CURVES ──────────────────────────────────────────────────────────────────────────────────────────
// Shipped: read straight off the catalogue, so this never drifts from what players meet.
const shippedFoe = (d) => scaledFoe(GROVE_ZONES.find((z) => z.n === d)?.enemies?.[0], d)?.hp || 0;
const shippedBoss = (d) => GROVE_BOSSES[GROVE_ZONES.find((z) => z.n === d)?.boss]?.hp || 0;
// ── ⚠️ AND THE OTHER HALF OF A FIGHT ────────────────────────────────────────────────────────────────────────
// Health decides how LONG a fight is; damage decides whether you are in one at all. The floor player has 60
// effective hp and the first wanderer hits for 58, so the opening zone is not merely slow for them — it is
// lethal on the second swing. A curve rebuilt on health alone would have turned a twenty-minute boss into a
// forty-second boss that still one-shots the person it was lowered for.
const mid = (v) => (Array.isArray(v) ? (v[0] + v[1]) / 2 : Number(v) || 0);
const shippedFoeDmg = (d) => mid(scaledFoe(GROVE_ZONES.find((z) => z.n === d)?.enemies?.[0], d)?.dmg);
const shippedBossDmg = (d) => mid(GROVE_BOSSES[GROVE_ZONES.find((z) => z.n === d)?.boss]?.dmg);
// Proposed: one exponential through two anchors. Per-zone rate is derived, never typed — typing both a rate
// and a pair of anchors is how a curve ends up not hitting either.
const fit = (a, b) => { const k = (b / a) ** (1 / (DEPTHS - 1)); return { k, at: (d) => a * k ** (d - 1) }; };
const propFoe = FOE ? fit(FOE[0], FOE[1]) : null;
const propBoss = BOSS ? fit(BOSS[0], BOSS[1]) : null;
const FDMG = arg("--foedmg", 2);
const BDMG = arg("--bossdmg", 2);
const propFoeDmg = FDMG ? fit(FDMG[0], FDMG[1]) : null;
const propBossDmg = BDMG ? fit(BDMG[0], BDMG[1]) : null;

const sw = (hp, c) => Math.max(1, Math.round(hp / c.per));
const sec = (hp, c) => (sw(hp, c) * c.cd) / 1000;
const fmt = (s) => (s >= 600 ? `${Math.round(s / 60)}m` : s >= 60 ? `${Math.round(s)}s` : `${s.toFixed(1)}s`);

if (propBoss) console.log(`\nproposed  boss x${propBoss.k.toFixed(4)}/zone (x${(propBoss.k ** 12).toFixed(2)}/map)   foe x${propFoe.k.toFixed(4)}/zone (x${(propFoe.k ** 12).toFixed(2)}/map)`);

// ── THE MAP SEAM, STATED AS A NUMBER ────────────────────────────────────────────────────────────────────────
console.log("\n── DOES DIFFICULTY EVER GO BACKWARDS? ──────────────────────────────────");
for (let m = 1; m < 7; m += 1) {
    const last = shippedBoss(m * 12), next = shippedBoss(m * 12 + 1);
    const drop = next < last;
    console.log(`  map ${m} z12 boss ${String(Math.round(last)).padStart(9)}  ->  map ${m + 1} z1 boss ${String(Math.round(next)).padStart(9)}`
        + `  ${drop ? `EASIER by ${Math.round((1 - next / last) * 100)}%  <-- seam` : "harder"}`);
}

// ── WHAT IT FEELS LIKE ──────────────────────────────────────────────────────────────────────────────────────
for (const who of CAST) {
    console.log(`\n── p${String(Math.round(who.p * 100)).padStart(3)}  ${who.name}  ${Math.round(who.dps).toLocaleString()} dps · ${Math.round(who.per).toLocaleString()}/swing · ${Math.round(who.ehp).toLocaleString()} ehp`);
    const head = "  map   wanderer now -> new          boss now -> new            hits survived foe/boss";
    console.log(head);
    for (let m = 1; m <= 7; m += 1) {
        const d = (m - 1) * 12 + 1;
        const f0 = shippedFoe(d), b0 = shippedBoss(d);
        let line = `   ${m}    ${String(sw(f0, who)).padStart(5)} sw ${fmt(sec(f0, who)).padStart(6)}`;
        if (propFoe) line += ` ->${String(sw(propFoe.at(d), who)).padStart(5)} sw ${fmt(sec(propFoe.at(d), who)).padStart(6)}`;
        line += `  │ ${String(sw(b0, who)).padStart(6)} sw ${fmt(sec(b0, who)).padStart(6)}`;
        if (propBoss) line += ` ->${String(sw(propBoss.at(d), who)).padStart(6)} sw ${fmt(sec(propBoss.at(d), who)).padStart(6)}`;
        // Hits survived, which is the number that decides whether a long fight is a grind or a death.
        const hits = (dmg) => (dmg > 0 ? Math.max(0, Math.floor(who.ehp / dmg)) : 0);
        line += `  │ lives ${String(hits(shippedFoeDmg(d))).padStart(3)}/${String(hits(shippedBossDmg(d))).padStart(3)}`;
        if (propFoeDmg) line += ` ->${String(hits(propFoeDmg.at(d))).padStart(3)}/${String(hits(propBossDmg.at(d))).padStart(3)}`;
        console.log(line);
    }
}
console.log("");
