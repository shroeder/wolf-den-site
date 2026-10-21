// ── THE RACK HAS TO BE A REAL GAMBLE ─────────────────────────────────────────────────────────────────────────
// The craft act ends with the player aiming a piece at a rack of five buckets running worst to best, and
// where it stops IS the craft. Luke asked for the aim; an aim is only a decision if reaching for the gold can
// cost you, so most of this file exists to prove that it can.
//
//   node --import ./scripts/lib/register-loader.mjs scripts/check-craft-act.mjs
//
//   1  the rack is whole — the spans tile 0..1, worst to best, no gap and no overlap
//   2  the rack is cut from the curve — a higher crafting level means a wider gold end
//   3  THE QUOTED ODDS ARE THE REAL ODDS for the aim being quoted, against a live simulation
//   4  AIMING AT THE GOLD IS A GAMBLE — the far end carries a real chance of missing the rack entirely
//   5  SKILL BUYS GREED — a good act makes the gold end worth reaching for and a bad one does not
//   6  nothing is a free win — slamming the aim to the edge must not be optimal regardless of skill
//   7  the rattle always ends exactly on the landing, so the fall can never contradict the grant
//   8  a quality score always reads back as the band it was drawn for
import {
    rackFor, scatterFor, landingFor, bandAt, missedRack, oddsForAim, rattle, qualityInBand,
    actScore, actBias, strikeGrade, heatScore, PEG_ROWS, SCATTER_BEST, SCATTER_WORST,
} from "@/lib/marketplace/grove-craft-act.js";
import { QUALITY_BANDS, qualityOdds, qualityBand } from "@/lib/marketplace/grove-forge.js";

let bad = 0;
const fail = (msg) => { console.error("  FAIL  " + msg); bad += 1; };
const ACTS = {
    fumbled: { heat: 0, strikes: [0, 0, 0] },
    decent: { heat: 0.7, strikes: [0.55, 0.55, 1] },
    flawless: { heat: 1, strikes: [1, 1, 1] },
};
const LEVELS = [1, 4, 12, 25];
const value = (id) => QUALITY_BANDS.find((b) => b.id === id)?.mult || 1;

// ── 1 + 2 ───────────────────────────────────────────────────────────────────────────────────────────────────
console.log("the rack, worst to best, cut from the crafting curve");
for (const lv of LEVELS) {
    const rack = rackFor(lv);
    let cursor = 0;
    for (const s of rack) {
        if (Math.abs(s.from - cursor) > 1e-12) fail(`level ${lv}: a gap or overlap at ${s.from}`);
        cursor = s.to;
    }
    if (Math.abs(cursor - 1) > 1e-12) fail(`level ${lv}: the rack ends at ${cursor}, not 1`);
    const order = rack.map((s) => value(s.id));
    for (let i = 1; i < order.length; i += 1) {
        if (order[i] < order[i - 1]) fail(`level ${lv}: the rack is not worst-to-best at span ${i}`);
    }
    const design = Object.fromEntries(qualityOdds(lv).map((o) => [o.id, o.share]));
    for (const s of rack) {
        if (Math.abs((s.to - s.from) - design[s.id]) > 1e-9) {
            fail(`level ${lv}: ${s.name} is ${((s.to - s.from) * 100).toFixed(2)}% wide against a share of ${(design[s.id] * 100).toFixed(2)}%`);
        }
    }
    console.log(`  lvl ${String(lv).padStart(2)}  ` + rack.map((s) => `${s.name} ${((s.to - s.from) * 100).toFixed(1)}%`).join("  "));
}
const gold1 = rackFor(1).find((s) => s.id === "masterwork");
const gold25 = rackFor(25).find((s) => s.id === "masterwork");
if (!(gold25.to - gold25.from > gold1.to - gold1.from)) fail("the gold end does not grow with the crafting level");

// ── 3: THE QUOTED ODDS ARE THE REAL ODDS ────────────────────────────────────────────────────────────────────
// The screen shows the odds for wherever the player is aiming right now. If the integration and the actual
// seeded landing disagree, the bench is printing one game and playing another — the defect fixed in
// qualityOdds two days ago, arriving by a new road.
console.log("\nquoted odds against 120,000 real drops, per aim:");
const rack4 = rackFor(4);
let worstOdds = 0;
for (const [name, act] of Object.entries(ACTS)) {
    const sd = scatterFor(act);
    for (const aim of [0.2, 0.5, 0.8, 0.97]) {
        const quoted = oddsForAim(rack4, aim, sd);
        const hit = {};
        let missed = 0;
        const N = 120000;
        for (let s = 1; s <= N; s += 1) {
            const at = landingFor(aim, sd, s);
            if (missedRack(at)) missed += 1;
            const b = bandAt(rack4, at);
            hit[b] = (hit[b] || 0) + 1;
        }
        for (const b of quoted.bands) {
            const gap = Math.abs((hit[b.id] || 0) / N - b.share);
            worstOdds = Math.max(worstOdds, gap);
            if (gap > 0.008) {
                fail(`${name} aiming ${aim}: ${b.name} quoted ${(b.share * 100).toFixed(2)}% but landed ${(((hit[b.id] || 0) / N) * 100).toFixed(2)}%`);
            }
        }
        if (Math.abs(missed / N - quoted.miss) > 0.008) {
            fail(`${name} aiming ${aim}: miss quoted ${(quoted.miss * 100).toFixed(2)}% but was ${((missed / N) * 100).toFixed(2)}%`);
        }
    }
}
console.log(`  worst gap between quoted and played: ${(worstOdds * 100).toFixed(3)} points`);

// ── 4: THE GOLD END IS A GAMBLE ─────────────────────────────────────────────────────────────────────────────
console.log("\naiming at the very end — the chance of missing the rack altogether:");
for (const [name, act] of Object.entries(ACTS)) {
    const sd = scatterFor(act);
    const o = oddsForAim(rack4, 0.99, sd);
    const mw = o.bands.find((b) => b.id === "masterwork").share;
    console.log(`  ${name.padEnd(9)} scatter ${sd.toFixed(3)}   miss ${(o.miss * 100).toFixed(1)}%   masterwork ${(mw * 100).toFixed(1)}%`);
    // ⚠️ EVEN A FLAWLESS ACT MUST RISK IT. A scatter tight enough to make the end safe turns the beat into
    // arithmetic: stand one cap-width from the edge and the decision is gone.
    if (o.miss < 0.04) fail(`${name}: aiming at the very end misses only ${(o.miss * 100).toFixed(1)}% of the time — the edge carries no risk`);
}

// ── 5 + 6: SKILL BUYS GREED, AND GREED ALONE DOES NOT PAY ───────────────────────────────────────────────────
console.log("\nthe aim a player should actually pick, per act:");
const bestAim = (act) => {
    const sd = scatterFor(act);
    let best = { aim: 0, ev: -1 };
    for (let aim = 0.02; aim <= 1.0001; aim += 0.02) {
        const o = oddsForAim(rack4, aim, sd);
        const ev = o.bands.reduce((a, b) => a + b.share * b.mult, 0);
        if (ev > best.ev) best = { aim, ev };
    }
    return best;
};
const picks = Object.fromEntries(Object.entries(ACTS).map(([n, a]) => [n, bestAim(a)]));
for (const [name, b] of Object.entries(picks)) {
    console.log(`  ${name.padEnd(9)} aim ${b.aim.toFixed(2)}   expected multiplier ${b.ev.toFixed(3)}`);
}
if (!(picks.flawless.aim > picks.fumbled.aim + 0.05)) {
    fail(`skill does not buy greed — fumbled aims at ${picks.fumbled.aim.toFixed(2)} and flawless at ${picks.flawless.aim.toFixed(2)}`);
}
if (!(picks.flawless.ev > picks.fumbled.ev + 0.02)) fail("a flawless act is worth no more than a fumbled one");

const edgeEv = (act) => {
    const o = oddsForAim(rack4, 0.995, scatterFor(act));
    return o.bands.reduce((a, b) => a + b.share * b.mult, 0);
};
if (edgeEv(ACTS.fumbled) >= picks.fumbled.ev - 1e-9) {
    fail("with a fumbled act, slamming the aim to the far edge is still optimal — the risk is not biting");
}
console.log(`  fumbled: the far edge is worth ${edgeEv(ACTS.fumbled).toFixed(3)} against ${picks.fumbled.ev.toFixed(3)} played sensibly — greed is punished.`);

// ── 7 ───────────────────────────────────────────────────────────────────────────────────────────────────────
let rattled = 0;
for (let seed = 1; seed <= 4000; seed += 1) {
    const at = landingFor(0.5, 0.12, seed);
    const path = rattle(at, seed);
    if (path.length !== PEG_ROWS) fail(`rattle seed ${seed}: ${path.length} rows`);
    if (Math.abs(path[path.length - 1] - at) > 1e-12) fail(`rattle seed ${seed} ends at ${path[path.length - 1]}, landing is ${at}`);
    rattled += 1;
}
console.log(`\n${rattled.toLocaleString()} falls drawn, every one ending exactly on its landing.`);

// ── 8 + THE BEATS ───────────────────────────────────────────────────────────────────────────────────────────
for (const b of QUALITY_BANDS) {
    for (let seed = 1; seed <= 500; seed += 1) {
        const q = qualityInBand(b.id, seed);
        if (qualityBand(q).id !== b.id) fail(`qualityInBand gave ${q} for ${b.name}, which reads back as ${qualityBand(q).id}`);
    }
}
// ⚠️ A TOLERANCE, BECAUSE THIS IS A LERP. SCATTER_WORST - (SCATTER_WORST - SCATTER_BEST) * 1 is 0.055
// to every digit that matters and not to the last bit of a double. Asserting exact equality here failed
// twice and both times the maths was right — a float comparison dressed as a logic check.
const near = (a, b) => Math.abs(a - b) < 1e-12;
if (!near(scatterFor(ACTS.flawless), SCATTER_BEST)) fail("a flawless act does not reach the tightest scatter");
if (!near(scatterFor(ACTS.fumbled), SCATTER_WORST)) fail("a fumbled act is not the widest scatter");
if (!near(scatterFor({ heat: 9, strikes: [9, 9, 9] }), SCATTER_BEST)) fail("scatter is not clamped — a lying client would be paid");
if (heatScore(9999) !== 1) fail("heat is not capped at 1");
if (strikeGrade(0).id !== "perfect") fail("dead centre is not a perfect strike");
if (strikeGrade(-0.02).id !== "perfect") fail("the perfect window is not symmetric");
if (actScore({ heat: 9, strikes: [9, 9, 9] }) !== 1) fail("act score is not clamped");
if (actBias({ heat: 0, strikes: [0, 0, 0] }) !== 0) fail("a fumbled act is not worth zero");

console.log(bad
    ? `\ncheck:craft-act — ${bad} problem(s).`
    : "\ncheck:craft-act — the quoted odds are the played odds, the gold end is a real gamble, "
      + "and skill is what buys the right to reach for it.");
process.exit(bad ? 1 : 0);
