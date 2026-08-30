// ── HOW HARD IS EACH BUILD, ACTUALLY ─────────────────────────────────────────────────────────────────────────
// The target curve normalises a rung's stat TOTAL. It does not normalise how hard the rung is to beat, and
// those turned out to be very different things. Measured against a real member at identical totals, the
// twenty-eight builds ranged from an 83% win rate to 0% — so which build a rung happened to draw mattered far
// more than how high the rung was, and the ladder came out looking like this:
//
//     rung  40   45   50   55   60   65   70   80   90  100  105
//     win  2.8%  59%  69%  33%  35%  11% 0.3% 0.9% 0.2%  16%  18%
//
// Rung 100 easier than rung 70, because rung 100 drew a Runecaller Duelist and rung 70 drew a Warden.
//
// Luke: "we need to keep the unique challenges and challenge grows each rung" — and those pull against each
// other exactly here. The answer is not fewer builds, it is knowing what each one is WORTH: a build that wins
// too often needs to be worth more stats, one that never loses needs fewer.
//
// So this measures it and writes the number down. `weight` scales that build's slice of the target curve, and
// every number in BUILDS comes from this script rather than from taste.
//
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/calibrate-builds.mjs [member] [rounds]
//
// ⚠️ IT MUTATES THE SOURCE FILE. Run it, read the diff, and keep it only if the spread actually narrowed —
// the summary at the end prints the before and after so that is a decision and not a hope.
import fs from "node:fs";
import { npcBuild } from "../src/lib/marketplace/arena-npc.js";
import { BUILDS_BY_ID, BUILD_IDS, buildForTier } from "../src/lib/marketplace/arena-npc-build.js";
import { fighterFrom, kitFor } from "../src/lib/marketplace/arena.js";
import { autoRing } from "../src/lib/marketplace/arena-ring.js";
import { db } from "../src/lib/db.js";

const WHO = process.argv[2] || "The Wolf Den";
const ROUNDS = Number(process.argv[3]) || 4;
const SAMPLES = Number(process.env.CAL_SAMPLES) || 24;
const RUNGS_PER_BUILD = 6;
// How hard the whole ladder should sit at the rungs we calibrate over. The band either side of the wall, so
// "as hard as each other" is measured where it is actually decided rather than where everything is 0% or 100%.
// Overridable, because the band that matters is wherever the member actually plays. Calibrating over rungs
// they cannot reach measures nothing — every build reads 0% and the weights barely move.
const BAND = [Number(process.env.CAL_FROM) || 45, Number(process.env.CAL_TO) || 85];
// Damped, because win rate against stats is steep: a full correction overshoots and the next round undoes it.
const DAMP = 0.55;

const me = await db.queryOne(`SELECT id, display_name FROM mkt_buyer WHERE display_name = $1`, [WHO]);
if (!me) throw new Error(`no member called ${WHO}`);
const kit = await kitFor(me.id);

const seeded = (n) => { let x = n >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };
const winRate = (foe, n = SAMPLES) => {
    let w = 0;
    for (let s = 0; s < n; s += 1) if (autoRing({ ...kit }, { ...foe }, { rng: seeded(9001 + s * 7919) }).won) w += 1;
    return w / n;
};

// Which rungs draw which build. Spread across the band so a build is judged over a range of heights rather
// than at one, and no build is measured only where the ladder is trivially easy or already impossible.
const rungsOf = new Map(BUILD_IDS.map((id) => [id, []]));
for (let t = BAND[0]; t <= BAND[1]; t += 1) {
    const b = buildForTier(t);
    const id = BUILD_IDS.find((k) => BUILDS_BY_ID[k] === b);
    if (id) rungsOf.get(id).push(t);
}
const sampleRungs = (list) => {
    if (list.length <= RUNGS_PER_BUILD) return list;
    const step = list.length / RUNGS_PER_BUILD;
    return Array.from({ length: RUNGS_PER_BUILD }, (_, i) => list[Math.floor(i * step)]);
};

// Every (build, rung) pair, kept apart rather than averaged, because a build's rungs are not all the same
// height and the whole question is how it compares to its NEIGHBOURS.
const measure = () => {
    const out = [];
    for (const id of BUILD_IDS) {
        const rungs = sampleRungs(rungsOf.get(id) || []);
        if (!rungs.length) { out.push({ id, rate: null, n: 0, at: [] }); continue; }
        const at = rungs.map((t) => {
            const b = npcBuild(t, 0);
            return { rung: t, rate: winRate(fighterFrom(b.stats, b.perks, null)) };
        });
        out.push({ id, rate: at.reduce((a, x) => a + x.rate, 0) / at.length, n: at.length, at });
    }
    return out;
};

// ── THE TARGET IS THE LOCAL TREND, NOT ONE NUMBER FOR THE WHOLE BAND ─────────────────────────────────────────
// The first version compared every build to the band's mean, which equalises builds AND flattens the ladder:
// run against a real member over rungs 36-70 it made rung 36 as hard as rung 63 — every rung a coin flip and
// the climb gone. Luke had walked rungs 1-35 without losing; afterwards he was at 32% on rung 38.
//
// A build is only mis-weighted if it is out of step with the rungs AROUND it. So the expectation for a build
// measured at rung r is what every OTHER build scores near r, and the correction is the gap between them.
// Equalises the draw, leaves the trend alone.
const NEAR = 6;
const expectedAt = (rows, rung, selfId) => {
    const near = [];
    for (const r of rows) {
        if (r.id === selfId) continue;
        for (const x of r.at || []) if (Math.abs(x.rung - rung) <= NEAR) near.push(x.rate);
    }
    return near.length ? near.reduce((a, b) => a + b, 0) / near.length : null;
};

const spread = (rows) => {
    const r = rows.filter((x) => x.rate != null).map((x) => x.rate);
    return { lo: Math.min(...r), hi: Math.max(...r), mean: r.reduce((a, b) => a + b, 0) / r.length };
};

console.log(`\n  calibrating ${BUILD_IDS.length} builds against ${me.display_name}, rungs ${BAND[0]}-${BAND[1]}\n`);
const first = measure();
const s0 = spread(first);
console.log(`  before: ${(s0.lo * 100).toFixed(0)}% to ${(s0.hi * 100).toFixed(0)}%, mean ${(s0.mean * 100).toFixed(0)}%`);

let rows = first;
for (let round = 1; round <= ROUNDS; round += 1) {
    for (const r of rows) {
        if (r.rate == null) continue;
        // How far out of step with its neighbours this build is, averaged over the rungs it holds.
        const gaps = (r.at || []).map((x) => {
            const exp = expectedAt(rows, x.rung, r.id);
            return exp == null ? 0 : x.rate - exp;
        });
        if (!gaps.length) continue;
        const gap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
        const b = BUILDS_BY_ID[r.id];
        // Wins more than its neighbours -> it is too weak for its rung -> it should be worth MORE.
        b.weight = Math.max(0.35, Math.min(3.0, (b.weight || 1) * (1 + DAMP * gap)));
    }
    rows = measure();
    const s = spread(rows);
    console.log(`  round ${round}: ${(s.lo * 100).toFixed(0)}% to ${(s.hi * 100).toFixed(0)}%, mean ${(s.mean * 100).toFixed(0)}%`);
}

console.log("\n  build             weight   win rate");
for (const r of [...rows].sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0))) {
    console.log(`  ${r.id.padEnd(16)} ${(BUILDS_BY_ID[r.id].weight || 1).toFixed(2).padStart(6)}   ${r.rate == null ? "  n/a" : (r.rate * 100).toFixed(0).padStart(4) + "%"}`);
}

// Write the weights back into the source, so the calibration is a fact in the file rather than a run nobody
// kept. Only the weight literal on each build's own line is touched.
const P = "src/lib/marketplace/arena-npc-build.js";
let src = fs.readFileSync(P, "utf8");
for (const id of BUILD_IDS) {
    const w = (BUILDS_BY_ID[id].weight || 1).toFixed(2);
    const re = new RegExp(`(\\n    ${id}: \\{ cls: "\\w+", shape: "\\w+", pet: "\\w+", weight: )[\\d.]+`);
    if (!re.test(src)) { console.log(`  ! could not write weight for ${id}`); continue; }
    src = src.replace(re, `$1${w}`);
}
fs.writeFileSync(P, src);
const sN = spread(rows);
console.log(`\n  spread ${((s0.hi - s0.lo) * 100).toFixed(0)} points -> ${((sN.hi - sN.lo) * 100).toFixed(0)} points. Weights written to ${P}.\n`);
process.exit(0);
