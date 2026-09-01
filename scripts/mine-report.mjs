// ── HOW DEEP THE DEN ACTUALLY GETS ───────────────────────────────────────────────────────────────────────────
// The descent is a push-your-luck game, so the only honest question about it is where runs END — and the mine
// has recorded that all along: mine_surface and mine_collapse each store the depth they happened at. Read them
// before touching the roof. A simulator will tell you what a curve does; this tells you what the Den does with
// it, and the two have disagreed here before (a maxed miner was rolling 2.44% a step, and still nobody in the
// Den had ever been past twelve — the curve was not what stopped them, the reward for pushing was).
//
// The second table is the one that matters when tuning: every miner's real loadout, run through the real
// collapseChanceAt, as the odds of REACHING a depth rather than as a per-step percentage. "3.8% a step" reads
// as nothing; "you get to twelve two times in five" is the game.
//
// Usage:
//   npm run mine:report                the last 30 days
//   npm run mine:report -- --days 3    the window a nerf should be judged on
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { safeDepthFor, perDepthFor, collapseChanceAt, equippedDepthAffinity, depthEffects } from "../src/lib/marketplace/mining.js";

// db.js reads process.env, so the URL has to land THERE and not only in a local client — the affinity
// read below goes through the app's own modules, and a missing URL fails it silently to zero rather than
// loudly. Every miner reading "nerve 0" was this, not a Den with no depth gear in it.
process.env.DATABASE_URL = process.env.DATABASE_URL
    || readFileSync("../accounting_app/.env", "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim();
const sql = neon(process.env.DATABASE_URL);
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const DAYS = Number(arg("--days", 30));
const MIN_STEPS = Number(arg("--min-steps", 100));   // who counts as a miner worth a line

const runs = await sql`
    SELECT event, meta FROM mkt_activity_event
     WHERE event IN ('mine_surface', 'mine_collapse')
       AND created_at > now() - (${DAYS} || ' days')::interval`;
const depth = (r) => Number((typeof r.meta === "string" ? JSON.parse(r.meta) : r.meta || {}).depth) || 0;
const banked = runs.filter((r) => r.event === "mine_surface").map(depth);
const lost = runs.filter((r) => r.event === "mine_collapse").map(depth);
const all = [...banked, ...lost];

const stat = (a) => {
    if (!a.length) return "(none)";
    const s = [...a].sort((x, y) => x - y); const p = (q) => s[Math.floor((s.length - 1) * q)];
    return `n=${String(s.length).padStart(4)}  med ${p(0.5)}   p75 ${p(0.75)}   p90 ${p(0.9)}   max ${s[s.length - 1]}   mean ${(s.reduce((x, y) => x + y, 0) / s.length).toFixed(1)}`;
};
console.log(`\n── WHERE RUNS ENDED, last ${DAYS} days ${"─".repeat(40)}`);
console.log(`   walked out  ${stat(banked)}`);
console.log(`   roof came in${stat(lost)}`);
console.log(`   every run   ${stat(all)}`);
console.log(`   collapse rate ${((lost.length / (all.length || 1)) * 100).toFixed(1)}% of ${all.length} runs`);
const hist = {}; for (const d of all) hist[d] = (hist[d] || 0) + 1;
const top = Math.max(1, ...Object.values(hist));
for (const k of Object.keys(hist).map(Number).sort((a, b) => a - b)) {
    console.log(`   ${String(k).padStart(3)}  ${"█".repeat(Math.round((hist[k] / top) * 46)).padEnd(46)} ${hist[k]}`);
}

// ── AND WHAT THE ROOF IS DOING TO THEM ───────────────────────────────────────────────────────────────────
// Through the same collapseChanceAt the descent rolls, with the same affinity and the same powers, so this
// cannot drift from the game the way a transcribed formula does.
const miners = await sql`
    SELECT m.buyer_id, m.assay_level, m.brace_level, m.steps_taken,
           COALESCE(NULLIF(b.display_name, ''), b.alias) AS name
      FROM mkt_mining m JOIN mkt_buyer b ON b.id = m.buyer_id
     WHERE COALESCE(m.steps_taken, 0) >= ${MIN_STEPS} ORDER BY m.steps_taken DESC`;
console.log(`\n── THE ODDS EACH MINER IS PLAYING ${"─".repeat(41)}`);
console.log("   name               sh/br  nerve  safe   a step   reach 8  reach 10  reach 12  reach 15");
for (const m of miners) {
    const points = await equippedDepthAffinity(m.buyer_id).catch(() => ({}));
    const cut = depthEffects(points).collapseCut;
    const reach = (to) => { let p = 1; for (let d = 1; d <= to; d += 1) p *= 1 - collapseChanceAt(d, m.assay_level, m.brace_level, false, cut); return `${(p * 100).toFixed(0)}%`; };
    console.log(`   ${m.name.padEnd(18)} ${String(m.assay_level || 0).padStart(2)}/${String(m.brace_level || 0).padStart(2)}  ${String(Number(points.nerve) || 0).padStart(4)}   ${String(safeDepthFor(m.assay_level)).padStart(2)}   ${(perDepthFor(m.brace_level, cut) * 100).toFixed(1).padStart(5)}%   ${reach(8).padStart(6)}  ${reach(10).padStart(7)}  ${reach(12).padStart(7)}  ${reach(15).padStart(7)}`);
}
console.log();
process.exit(0);
