// ── A PLINKO RACK HAS TO BEHAVE LIKE ONE ─────────────────────────────────────────────────────────────────────
// Luke: "the best thing is small and in the middle, and then it goes out from there." The craft act ends by
// throwing the piece at a symmetric rack whose jackpot is a narrow slot dead centre, and where it stops IS
// the craft. This proves the shape, the honesty and the difficulty.
//
//   node --import ./scripts/lib/register-loader.mjs scripts/check-craft-act.mjs
//
//   1  the rack is whole, SYMMETRIC, and gets better toward the middle from both directions
//   2  the jackpot is the NARROWEST thing on it, and it is one undivided slot at dead centre
//   3  a band total across both halves is exactly its share from the crafting curve
//   4  THE QUOTED ODDS ARE THE REAL ODDS for the aim being quoted, against a live simulation
//   5  THE MIDDLE IS HARD TO HOLD — a fumbled act cannot reliably hit it, a flawless one can try
//   6  SKILL IS WHAT PAYS: a better act is worth more at every level
//   7  the rattle always ends exactly on the landing, so the fall can never contradict the grant
//   8  a quality score always reads back as the band it was drawn for
import {
    rackFor, rackOdds, scatterFor, landingFor, bandAt, oddsForAim, rattle, qualityInBand, RACK_MIDDLE,
    actScore, actBias, strikeGrade, heatScore, PEG_ROWS, SCATTER_BEST, SCATTER_WORST,
} from "@/lib/marketplace/grove-craft-act.js";
import { QUALITY_BANDS, qualityOdds, qualityBand, bandTint } from "@/lib/marketplace/grove-forge.js";
import { GEAR_RARITY_COLOR } from "@/lib/marketplace/rarity.js";

let bad = 0;
const fail = (msg) => { console.error("  FAIL  " + msg); bad += 1; };
const ACTS = {
    fumbled: { heat: 0, strikes: [0, 0, 0] },
    decent: { heat: 0.7, strikes: [0.55, 0.55, 1] },
    flawless: { heat: 1, strikes: [1, 1, 1] },
};
const LEVELS = [1, 4, 12, 25];
const value = (id) => QUALITY_BANDS.find((b) => b.id === id)?.mult || 1;

// ── 1 + 2 + 3: THE SHAPE ────────────────────────────────────────────────────────────────────────────────────
console.log("the rack — worst at the edges, jackpot narrow and dead centre");
for (const lv of LEVELS) {
    const rack = rackFor(lv);
    let cursor = 0;
    for (const s of rack) {
        if (Math.abs(s.from - cursor) > 1e-12) fail(`level ${lv}: a gap or overlap at ${s.from}`);
        cursor = s.to;
    }
    if (Math.abs(cursor - 1) > 1e-12) fail(`level ${lv}: the rack ends at ${cursor}, not 1`);

    // value must climb to the middle and fall away again — never dip and rise
    const mid = rack.findIndex((s) => s.id === "masterwork");
    if (mid < 0) fail(`level ${lv}: there is no jackpot slot on the rack`);
    for (let i = 1; i <= mid; i += 1) {
        if (value(rack[i].id) < value(rack[i - 1].id)) fail(`level ${lv}: value drops on the way in, at span ${i}`);
    }
    for (let i = mid + 1; i < rack.length; i += 1) {
        if (value(rack[i].id) > value(rack[i - 1].id)) fail(`level ${lv}: value rises on the way out, at span ${i}`);
    }
    // symmetric about the centre
    const jack = rack[mid];
    if (Math.abs((jack.from + jack.to) / 2 - RACK_MIDDLE) > 1e-9) {
        fail(`level ${lv}: the jackpot is centred on ${((jack.from + jack.to) / 2).toFixed(4)}, not the middle`);
    }
    if (rack.filter((s) => s.id === "masterwork").length !== 1) fail(`level ${lv}: the jackpot is split in two`);
    // and it is the narrowest slot there is
    const widths = rack.map((s) => s.to - s.from);
    if (Math.min(...widths) !== jack.to - jack.from) {
        fail(`level ${lv}: the jackpot is not the narrowest slot on the rack`);
    }
    // each band across both halves is exactly its share
    const played = Object.fromEntries(rackOdds(rack).map((o) => [o.id, o.share]));
    const design = Object.fromEntries(qualityOdds(lv).map((o) => [o.id, o.share]));
    for (const b of QUALITY_BANDS) {
        if (Math.abs((played[b.id] || 0) - design[b.id]) > 1e-9) {
            fail(`level ${lv}: ${b.name} covers ${((played[b.id] || 0) * 100).toFixed(2)}% of the rack against a share of ${(design[b.id] * 100).toFixed(2)}%`);
        }
    }
    console.log(`  lvl ${String(lv).padStart(2)}  ` + rack.map((s) => `${s.name.slice(0, 4)} ${((s.to - s.from) * 100).toFixed(1)}`).join(" | "));
}

// ── THE PALETTE IS THE GEAR PALETTE ─────────────────────────────────────────────────────────────────────────
// Three invented palettes were rejected before this one. Luke: "use rarity of gear colors". So the check is
// that the bands carry no colour of their own at all — they carry GEAR_RARITY_COLOR, which is what the chest
// opener, the auction and the boss loot actually render.
//
// ⚠️ GEAR_RARITY_COLOR, NOT RARITY_META. The two disagree, and that disagreement is why this gate exists:
// RARITY_META calls mythic hot pink while every screen showing a real item renders it MINT. Pointing the
// bands at the generic table produced a jackpot in the wrong colour and read as another invention.
const LADDER = { rough: "common", sound: "rare", fine: "epic", pristine: "legendary", masterwork: "mythic" };
for (const [band, rarity] of Object.entries(LADDER)) {
    if (bandTint(band) !== GEAR_RARITY_COLOR[rarity]) {
        fail(`${band} is ${bandTint(band)}, not the gear ${rarity} colour ${GEAR_RARITY_COLOR[rarity]} — another palette has crept in`);
    }
}
console.log("\n  colours: " + Object.entries(LADDER).map(([b, r]) => `${b}=${r}`).join("  "));

// ── 4: THE QUOTED ODDS ARE THE REAL ODDS ────────────────────────────────────────────────────────────────────
console.log("\nquoted odds against 120,000 real throws, per aim:");
const rack4 = rackFor(4);
let worstOdds = 0;
for (const [name, act] of Object.entries(ACTS)) {
    const sd = scatterFor(act);
    for (const aim of [0.14, 0.33, 0.5, 0.72]) {
        const quoted = oddsForAim(rack4, aim, sd);
        const hit = {};
        const N = 120000;
        for (let s = 1; s <= N; s += 1) hit[bandAt(rack4, landingFor(aim, sd, s))] = (hit[bandAt(rack4, landingFor(aim, sd, s))] || 0) + 1;
        for (const b of quoted.bands) {
            const gap = Math.abs((hit[b.id] || 0) / N - b.share);
            worstOdds = Math.max(worstOdds, gap);
            if (gap > 0.008) {
                fail(`${name} aiming ${aim}: ${b.name} quoted ${(b.share * 100).toFixed(2)}% but landed ${(((hit[b.id] || 0) / N) * 100).toFixed(2)}%`);
            }
        }
    }
}
console.log(`  worst gap between quoted and played: ${(worstOdds * 100).toFixed(3)} points`);

// ── 5: THE MIDDLE IS HARD TO HOLD ───────────────────────────────────────────────────────────────────────────
// A jackpot you can simply decide to take is not a jackpot. Aiming dead centre with a perfect act must
// still mostly miss, and with a fumbled one it must be close to hopeless.
console.log("\naiming dead centre — the chance of actually holding it:");
const centre = {};
for (const [name, act] of Object.entries(ACTS)) {
    const o = oddsForAim(rack4, RACK_MIDDLE, scatterFor(act));
    const mw = o.bands.find((b) => b.id === "masterwork").share;
    const good = o.bands.filter((b) => ["masterwork", "pristine"].includes(b.id)).reduce((a, b) => a + b.share, 0);
    centre[name] = mw;
    console.log(`  ${name.padEnd(9)} scatter ${scatterFor(act).toFixed(3)}   masterwork ${(mw * 100).toFixed(1)}%   pristine+ ${(good * 100).toFixed(1)}%`);
    if (mw > 0.45) fail(`${name}: the jackpot lands ${(mw * 100).toFixed(1)}% of the time from the middle — it is not a jackpot`);
}
if (!(centre.flawless > centre.fumbled * 1.5)) {
    fail(`skill does not make the middle reachable — fumbled ${(centre.fumbled * 100).toFixed(1)}% against flawless ${(centre.flawless * 100).toFixed(1)}%`);
}

// ── 6: SKILL PAYS, AT EVERY LEVEL ───────────────────────────────────────────────────────────────────────────
console.log("\nbest expected multiplier, played properly, per act:");
const bestAim = (act, lv) => {
    const rack = rackFor(lv);
    const sd = scatterFor(act);
    let best = -1;
    for (let aim = 0.02; aim <= 1.0001; aim += 0.02) {
        const ev = oddsForAim(rack, aim, sd).bands.reduce((a, b) => a + b.share * b.mult, 0);
        if (ev > best) best = ev;
    }
    return best;
};
for (const lv of LEVELS) {
    const f = bestAim(ACTS.fumbled, lv);
    const d = bestAim(ACTS.decent, lv);
    const g = bestAim(ACTS.flawless, lv);
    console.log(`  lvl ${String(lv).padStart(2)}   fumbled ${f.toFixed(3)}   decent ${d.toFixed(3)}   flawless ${g.toFixed(3)}`);
    if (!(g > d + 0.005)) fail(`level ${lv}: a flawless act is worth no more than a decent one`);
    if (!(d > f + 0.005)) fail(`level ${lv}: a decent act is worth no more than a fumbled one`);
}

// ── 7 ───────────────────────────────────────────────────────────────────────────────────────────────────────
let rattled = 0;
for (let seed = 1; seed <= 4000; seed += 1) {
    const at = landingFor(0.5, 0.12, seed);
    const path = rattle(at, seed);
    if (path.length !== PEG_ROWS) fail(`rattle seed ${seed}: ${path.length} rows`);
    const want = Math.max(-0.04, Math.min(1.04, at));
    if (Math.abs(path[path.length - 1] - want) > 1e-12) fail(`rattle seed ${seed} ends at ${path[path.length - 1]}, landing is ${want}`);
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
    : "\ncheck:craft-act — the jackpot is the narrowest slot and sits dead centre, the quoted odds are the "
      + "played odds, and skill is what makes the middle worth going for.");
process.exit(bad ? 1 : 0);
