// ── WHAT EACH CABINET'S `pay` DIAL HAS TO BE ──────────────────────────────────────────
// The dials in casino-slot5.js are SOLVED numbers, not chosen ones, and this is what solves them. Change
// TARGET_RTP there (or SOLVE_TARGET here), run this, write the suggested column back into the file, run it
// again. Two passes is usually enough; it converges because it measures the slope rather than assuming the
// dial and the return are proportional — they are not, because the bonus rounds are a fixed share that the
// dial only partly moves, and the relationship is different on every cabinet.
//
//   node --import ./scripts/lib/register-loader.mjs scripts/casino-solve-dials.mjs
//   SOLVE_TARGET=1.02 SOLVE_SEEDS=6 SOLVE_SPINS=150000 node --import ... scripts/casino-solve-dials.mjs
// ⚠️ SEEDED AND AVERAGED. These cabinets carry big bonus rounds, so a single 150k sweep on Math.random
// swings several points between runs — two consecutive measurements of The Harvest came back 101.7% and
// 95.0% with the dial LOWERED in between. A dial solved off one noisy read is a dial solved off nothing.
import { SLOTS5, playSpin, TARGET_RTP } from "@/lib/marketplace/casino-slot5.js";
const SPINS = Number(process.env.SOLVE_SPINS || 120000);
const SEEDS = Number(process.env.SOLVE_SEEDS || 5);
const TARGET = Number(process.env.SOLVE_TARGET || TARGET_RTP || 0.99);
const BET = 100;
const mulberry = (a) => () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const measure = (m, extra = 1) => {
    const per = [];
    for (let s = 0; s < SEEDS; s += 1) {
        const rng = mulberry(1000 + s * 7919);
        let staked = 0, paid = 0, meter = [];
        for (let i = 0; i < SPINS; i += 1) {
            const r = playSpin(m, { bet: BET, rng, meter });
            meter = r.meter || [];
            staked += BET; paid += (r.total || 0) * extra;
        }
        per.push(paid / staked);
    }
    const mean = per.reduce((a, b) => a + b, 0) / per.length;
    return { mean, lo: Math.min(...per), hi: Math.max(...per) };
};
console.log(`target ${(TARGET * 100).toFixed(1)}%  ·  ${SEEDS} seeds x ${SPINS.toLocaleString()} spins each\n`);
console.log("cabinet          dial     RTP        spread          suggest");
for (const [id, m] of Object.entries(SLOTS5)) {
    const a = measure(m);
    const b = measure(m, 1.1);
    const slope = (b.mean - a.mean) / 0.1;
    const want = (m.pay || 1) * (1 + (TARGET - a.mean) / slope);
    console.log(`${(m.label || id).padEnd(15)} ${String(m.pay || 1).padStart(6)}  ${(a.mean * 100).toFixed(2).padStart(7)}%  `
        + `${(a.lo * 100).toFixed(1)}-${(a.hi * 100).toFixed(1)}%`.padStart(14) + `${want.toFixed(3)}`.padStart(15));
}
