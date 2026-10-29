// ── WHAT POWER DOES A PLAYER ACTUALLY HAVE, AT EACH POINT OF THE CLIMB? ──────────────────────────────────────
// A difficulty curve is a claim about the player on the other side of it. The Grove's current one was fitted
// between two real members — Littlewolf at the bottom, Eric at the top — and under the town plan the Grove
// becomes the FIRST thing a new account touches, so the bottom of that fit is nowhere near the bottom of the
// real population. This prints the real distribution so the next curve is fitted to people who exist.
//
//   node scripts/grove-power.mjs
import { readFileSync } from "node:fs";
import { register } from "node:module";

register("./lib/app-loader.mjs", import.meta.url);
const pick = (f, k) => readFileSync(f, "utf8").split("\n").find((l) => l.startsWith(k + "="))?.slice(k.length + 1).trim();
process.env.DATABASE_URL = pick("C:/Users/Luke/Projects/accounting_app/.env", "DATABASE_URL");

const { db } = await import("@/lib/db.js");
const { groveFighter } = await import("@/lib/marketplace/grove-kit.js");
const { swing, BLEED_TICKS } = await import("@/lib/marketplace/grove-world.js");
const { drFrom } = await import("@/lib/marketplace/arena-kit.js");

const SWING_MS = 410;
function rate(f) {
    let st = 7; const rand = () => (st = (st * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    let tot = 0; const n = 3000;
    for (let i = 0; i < n; i += 1) { const h = swing(f, 0, rand); tot += h.dealt + (h.bleed ? h.bleed.dmg * BLEED_TICKS : 0); }
    const cd = SWING_MS / Math.max(0.2, f.tempo);
    return { per: tot / n, dps: (tot / n) / (cd / 1000), ehp: (f.health || 1) / (1 - drFrom(f.armor || 0, 0)) };
}

// Everyone who has actually played, by xp. xp is the one number that orders the whole population and is also
// what the gating plan advances on, so it is the x-axis the curve has to be a function of.
const rows = await db.query(
    `SELECT id, display_name, COALESCE(xp, 0)::int AS xp
       FROM mkt_buyer
      WHERE alias IS NOT NULL
      ORDER BY xp ASC`,
).catch(() => []);

console.log(`\n${rows.length} members with an alias (i.e. who have actually played)\n`);

// ⚠️ MEASURED, NOT SAMPLED AT THE ENDS. The existing curve's problem is precisely that it was fitted between
// two people; the shape in the middle was assumed. Every member is profiled.
const out = [];
for (const r of rows) {
    const f = await groveFighter(r.id).catch(() => null);
    if (!f) continue;
    const m = rate(f);
    out.push({ name: r.display_name, xp: r.xp, dps: m.dps, per: m.per, ehp: m.ehp });
}
out.sort((a, b) => a.dps - b.dps);

const pct = (p) => out[Math.min(out.length - 1, Math.floor((out.length - 1) * p))];
console.log("  percentile      dps        per swing     effective hp   xp");
for (const p of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
    const o = pct(p);
    console.log(
        `  p${String(Math.round(p * 100)).padStart(3)}  ${Math.round(o.dps).toLocaleString().padStart(10)}`
        + `  ${Math.round(o.per).toLocaleString().padStart(11)}  ${Math.round(o.ehp).toLocaleString().padStart(12)}`
        + `  ${o.xp.toLocaleString().padStart(9)}  ${o.name}`,
    );
}

// The bottom of the real population, in full — this is the group the on-ramp is for, and it is the group the
// current curve has never been measured against.
console.log("\n  the ten weakest fighters on the server:");
for (const o of out.slice(0, 10)) {
    console.log(`    ${Math.round(o.dps).toLocaleString().padStart(8)} dps  ${Math.round(o.ehp).toLocaleString().padStart(7)} ehp  ${String(o.xp).padStart(8)} xp  ${o.name}`);
}
console.log("");
