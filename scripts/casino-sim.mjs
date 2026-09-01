// ── WHAT THE FLOOR ACTUALLY RETURNS, AND WHAT IT FEELS LIKE TO PLAY IT ────────────────────────────────────────
// Luke: "we would have to find an effective way to test. also, what would be the point for players? would they
// ever get lucky and be able to buy any upgrades?"
//
// Two questions, one answer: an RTP number cannot tell you whether a floor is worth playing. 0.90x can mean
// "you drift down 10% and nothing ever happens" or "you drift down 10% and one spin in four hundred buys a
// pet", and those are opposite games with the same average. So this reports the DISTRIBUTION as well as the
// mean — how often a session doubles, how often it busts, and how often somebody walks to the Counter.
//
// It drives the REAL engine. playSpin() is the same pure function spinSlot5 calls in production, so this is
// not a model of the paytable — it is the paytable. Nothing here re-implements a rule.
//
//   node --import ./scripts/lib/register-loader.mjs scripts/casino-sim.mjs [--spins 200000] [--rtp 1]
import { SLOTS5, playSpin } from "@/lib/marketplace/casino-slot5.js";

const arg = (f, d) => { const i = process.argv.indexOf(f); return i > 0 ? Number(process.argv[i + 1]) : d; };
const SPINS = arg("--spins", 200000);
const HOUSE = arg("--rtp", 1);        // multiply every payout by this to model a house edge
const BET = 100;

const pct = (n) => (100 * n).toFixed(2) + "%";
console.log(`\n${SPINS.toLocaleString()} spins per cabinet, ${BET} a spin, payouts x${HOUSE}\n`);
console.log("cabinet        RTP      hit%   max win   1000x+   100x+    10x+");

const perMachine = {};
for (const [id, m] of Object.entries(SLOTS5)) {
    let staked = 0, paid = 0, hits = 0, max = 0;
    const buckets = { k: 0, c: 0, x: 0 };
    let meter = [];
    for (let i = 0; i < SPINS; i++) {
        const r = playSpin(m, { bet: BET, meter });
        meter = r.meter || [];
        const win = (r.total || 0) * HOUSE;
        staked += BET; paid += win;
        if (win > 0) hits += 1;
        const mult = win / BET;
        if (mult > max) max = mult;
        if (mult >= 1000) buckets.k += 1;
        if (mult >= 100) buckets.c += 1;
        if (mult >= 10) buckets.x += 1;
    }
    perMachine[id] = { rtp: paid / staked, hit: hits / SPINS };
    console.log(
        (m.label || id).slice(0, 13).padEnd(14) +
        pct(paid / staked).padStart(7) + pct(hits / SPINS).padStart(9) +
        (max.toFixed(0) + "x").padStart(10) +
        String(buckets.k).padStart(9) + String(buckets.c).padStart(8) + String(buckets.x).padStart(8));
}

// ── AND THE PART AN AVERAGE CANNOT ANSWER ────────────────────────────────────────────────────────────────────
// A player does not experience RTP. They experience a bankroll going up or down until one of them runs out.
// So: buy in, play until broke or until you can afford the thing you came for, and count how often each
// happens. This is gambler's ruin against the real paytable.
const GOAL = arg("--goal", 20000);    // a Counter pet
const BANK = arg("--bank", 5000);     // what you bought in with
const RUNS = arg("--runs", 3000);
const m = SLOTS5.slot;
console.log(`
Buy in ${BANK.toLocaleString()} chips, play ${m.label} at ${BET} a spin until broke or ${GOAL.toLocaleString()} (a Counter pet).`);
console.log("This is the question an RTP cannot answer: does anybody ever actually get there?");
console.log("payout x   reached goal   went broke   median spins");
for (const edge of [1, 0.97, 0.95, 0.92, 0.90, 0.85]) {
    let won = 0, spinsTotal = 0;
    for (let r = 0; r < RUNS; r++) {
        let bank = BANK, meter = [], n = 0;
        while (bank >= BET && bank < GOAL && n < 200000) {
            bank -= BET;
            const sp = playSpin(m, { bet: BET, meter });
            meter = sp.meter || [];
            bank += (sp.total || 0) * edge;
            n += 1;
        }
        spinsTotal += n;
        if (bank >= GOAL) won += 1;
    }
    console.log(edge.toFixed(2).padStart(8) + pct(won / RUNS).padStart(15)
        + pct(1 - won / RUNS).padStart(13) + Math.round(spinsTotal / RUNS).toLocaleString().padStart(15));
}
