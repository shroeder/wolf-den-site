// ── IS IT ACTUALLY A GOOD MACHINE? ───────────────────────────────────────────────────────────────────────────
// Five reels cannot be enumerated — the strips give about 2.6 x 10^11 grids — so this is Monte Carlo, and it
// prints the things a PLAYER feels rather than the one number a spreadsheet likes:
//
//   how often anything happens at all, how big the wins actually are, how long the dry spells run, how often
//   the features come, and how much of the money is in them.
//
// The gate itself is one rule, and it is stricter than the RTP ceiling it replaces: every machine returns
// 1.00x in CHIPS on average. There is no gold coming back from these machines — you stake gold and are paid
// chips — so a "house edge" here would be meaningless and a "money printer" impossible. What matters instead
// is that no cabinet is ever the smart pick, and that the wins are shaped like a machine somebody wants to
// play. See the header of casino-slot5.js.
import { SLOTS5, LINES, playSpin, FREE_SPIN_OFFERS, runFreeSpins } from "../src/lib/marketplace/casino-slot5.js";

const N = Number(process.env.SPINS || 400000);
const BET = 100;
const pct = (n) => `${(n * 100).toFixed(2)}%`;

// A deterministic RNG, so a run is reproducible and a tuning change is the only thing that can move a number.
function mulberry(seed) {
    let a = seed >>> 0;
    return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

let failures = 0;

for (const m of Object.values(SLOTS5)) {
    const rng = mulberry(20260823);
    let paid = 0; let hits = 0;
    let basePaid = 0; let freePaid = 0; let pickPaid = 0;
    let freeRounds = 0; let pickRounds = 0;
    const buckets = { "under 1x": 0, "1-2x": 0, "2-5x": 0, "5-20x": 0, "20-100x": 0, "over 100x": 0 };
    let best = 0; let dry = 0; let worstDry = 0;

    for (let i = 0; i < N; i += 1) {
        const r = playSpin(m, { bet: BET, rng, offerId: "mid" });
        paid += r.total;
        basePaid += r.base.total;
        if (r.free) { freePaid += r.free.total; freeRounds += 1; }
        if (r.pick) { pickPaid += r.pick.total; pickRounds += 1; }
        if (r.total > 0) {
            hits += 1;
            dry = 0;
            const x = r.total / BET;
            const k = x < 1 ? "under 1x" : x < 2 ? "1-2x" : x < 5 ? "2-5x" : x < 20 ? "5-20x" : x < 100 ? "20-100x" : "over 100x";
            buckets[k] += 1;
            if (x > best) best = x;
        } else { dry += 1; if (dry > worstDry) worstDry = dry; }
    }

    const rtp = paid / (N * BET);
    console.log(`\n══ ${m.label} ${"═".repeat(Math.max(0, 56 - m.label.length))}`);
    console.log(`  returns            ${pct(rtp)} in chips   (target 100.00% — chips are tickets, not money)`);
    console.log(`  something happens  ${pct(hits / N)} of spins  (1 in ${(N / hits).toFixed(1)})`);
    console.log(`  longest dry spell  ${worstDry} spins in ${N.toLocaleString()}`);
    console.log(`  best single play   ${best.toFixed(0)}x your bet`);
    console.log(`\n  where the money is`);
    console.log(`    base game        ${pct(basePaid / paid)}`);
    console.log(`    free spins       ${pct(freePaid / paid)}   (1 in ${Math.round(N / freeRounds).toLocaleString()} spins)`);
    console.log(`    the chest pick   ${pct(pickPaid / paid)}   (1 in ${Math.round(N / pickRounds).toLocaleString()} spins)`);
    console.log(`\n  of the wins you SEE`);
    for (const [k, v] of Object.entries(buckets)) {
        if (!v) continue;
        console.log(`    ${k.padEnd(10)} ${pct(v / hits).padStart(7)}   (1 in ${Math.round(N / v).toLocaleString()} spins)`);
    }

    // ── THE THREE OFFERS MUST BE A REAL CHOICE ───────────────────────────────────────────────────────────
    // Not "roughly equal" by assertion — measured. If one of them is worth 30% more than the others then it is
    // not a choice, it is a quiz with a right answer, and every player who reads a guide takes the same one.
    console.log(`\n  the free-spin offers (what each is worth, per trigger)`);
    const vals = [];
    for (const offer of FREE_SPIN_OFFERS) {
        const r2 = mulberry(777);
        let sum = 0; const ROUNDS = 30000;
        for (let i = 0; i < ROUNDS; i += 1) {
            sum += runFreeSpins(m, offer, { lineBet: BET / LINES.length, rng: r2 }).total;
        }
        const v = sum / ROUNDS / BET;
        vals.push(v);
        console.log(`    ${offer.label.padEnd(14)} ${v.toFixed(1)}x your bet   — ${offer.sub}`);
    }
    const spread = (Math.max(...vals) - Math.min(...vals)) / Math.min(...vals);
    if (spread > 0.12) {
        failures += 1;
        console.log(`    ✗ the best offer is worth ${pct(spread)} more than the worst — that is a right answer, not a choice`);
    }

    // ── AND THE ONE HARD RULE ────────────────────────────────────────────────────────────────────────────
    if (Math.abs(rtp - 1) > 0.03) {
        failures += 1;
        console.log(`\n  ✗ ${m.label} returns ${pct(rtp)} in chips; every machine must return 1.00x ±3% so none is the smart pick`);
    }
    if (hits / N < 0.25) {
        failures += 1;
        console.log(`  ✗ only ${pct(hits / N)} of spins do anything — the whole point of twenty lines is that the screen stays alive`);
    }
    if ((freePaid + pickPaid) / paid < 0.25) {
        failures += 1;
        console.log(`  ✗ only ${pct((freePaid + pickPaid) / paid)} of the money is in the features — real machines put 30-50% there, and it is what people chase`);
    }
}

console.log(failures
    ? `\ncheck:slot5 — ${failures} problem(s).`
    : `\ncheck:slot5 — every machine returns 1.00x in chips, the screen stays alive, and the money is in the features.`);
process.exit(failures ? 1 : 0);
