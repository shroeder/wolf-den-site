// ── IS IT ACTUALLY A GOOD MACHINE? ───────────────────────────────────────────────────────────────────────────
// Five reels cannot be enumerated — the strips give about 2.6 x 10^11 grids — so this is Monte Carlo, and it
// prints the things a PLAYER feels rather than the one number a spreadsheet likes:
//
//   how often anything happens at all, how big the wins actually are, how long the dry spells run, how often
//   the features come, and how much of the money is in them.
//
// ── WHAT THIS GATE IS ACTUALLY FOR, AND WHAT IT IS NOT ───────────────────────────────────────────────────────
// It used to demand that every machine return 1.00x in chips, and I spent a day serving that: every time a
// new feature was added — cascades, the universal retrigger, the Warren, the Hoard loop — the machine came out
// over 100% and I scaled the payouts back DOWN to hold the number. Luke, watching it happen: "are you trying
// to balance the slots or what, don't do that please... when you do that you really kind of make everything
// boring."
//
// He is right, and the old comment right here said why without noticing: CHIPS ARE TICKETS, NOT MONEY. You
// stake gold, you are paid chips, and chips never convert back — chips.js has no path from chips to gold. So
// 100% was an arbitrary constant. Holding it bought nothing, and it cost real features: the Deep Warren's
// critters went from 84 to 44 and the geode from 560 to 430 purely to keep a number that protects nothing.
//
// WHAT THE RULE WAS ALWAYS FOR is the second half of its own error message — "so none is the smart pick".
// That is about the five cabinets being level WITH EACH OTHER, not about where the floor sits. So that is
// what it checks now: the SPREAD between the best and worst machine. The level itself is printed and left
// alone, and raising the whole floor is a decision for Luke with one number, not something a gate can force
// out of me a nerf at a time.
//
// The real sink was never the return anyway. It is what chips COST in the store, which is priced by hand.
const SPREAD_TOLERANCE = 0.08;
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
// Every cabinet's return, collected as it is measured, so the spread can be judged at the end.
const returns = [];

for (const m of Object.values(SLOTS5)) {
    const rng = mulberry(20260823);
    let paid = 0; let hits = 0;
    let basePaid = 0; let freePaid = 0; let pickPaid = 0;
    let freeRounds = 0; let pickRounds = 0;
    const buckets = { "under 1x": 0, "1-2x": 0, "2-5x": 0, "5-20x": 0, "20-100x": 0, "over 100x": 0 };
    let best = 0; let dry = 0; let worstDry = 0;

    // ── THE METER RIDES ACROSS SPINS, SO THE SIMULATION HAS TO CARRY IT ──────────────────────────────
    // The Vault's Win It Again row is state BETWEEN pulls (mkt_casino_meter). Simulating each spin from an
    // empty meter would have reported a feature that pays nothing, which is exactly what the first run of
    // this gate said. Carried here the same way the real play path carries it.
    let meter = [];
    for (let i = 0; i < N; i += 1) {
        const r = playSpin(m, { bet: BET, rng, offerId: "mid", meter });
        meter = r.meter || [];
        paid += r.total;
        basePaid += r.base.total;
        if (r.free) { freePaid += r.free.total; freeRounds += 1; }
        // A cabinet has EITHER a pick or a hold-and-spin, never both — counted together, because what
        // matters is how much of the machine lives in its second feature rather than which shape it is.
        if (r.pick) { pickPaid += r.pick.total; pickRounds += 1; }
        if (r.hold) { pickPaid += r.hold.total; pickRounds += 1; }
        // The Vault's two, which are neither a free round nor a hold: the gem collection off its scatter,
        // and the meter emptying. Both are "the money in the features" by any reading a player would use.
        if (r.gems) { pickPaid += r.gems.total; pickRounds += 1; }
        if (r.winAgain) { freePaid += r.winAgain.paid * BET; freeRounds += 1; }
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
    console.log(`    free spins       ${pct(freePaid / paid)}   (1 in ${Math.round(N / freeRounds).toLocaleString()} spins)  ${m.free?.kind}`);
    console.log(`    ${String(m.second?.label || "second").padEnd(16)} ${pct(pickPaid / paid)}   (1 in ${Math.round(N / pickRounds).toLocaleString()} spins)`);
    console.log(`\n  of the wins you SEE`);
    for (const [k, v] of Object.entries(buckets)) {
        if (!v) continue;
        console.log(`    ${k.padEnd(10)} ${pct(v / hits).padStart(7)}   (1 in ${Math.round(N / v).toLocaleString()} spins)`);
    }

    // ── ONLY ONE CABINET OFFERS A CHOICE ─────────────────────────────────────────────────────────────────
    // The other four have a single shape of free round, and that shape IS the machine's identity rather than
    // a setting. There is nothing to keep level, so there is nothing to check.
    // GUARDS THE OFFERS BLOCK ONLY. It was a `continue`, which skipped the hard rules below it as well — so
    // four of the five cabinets were never checked at all and the gate reported green with The Harvest
    // returning 170%. A gate that skips its own assertions is worse than no gate.
    if (m.free?.kind === "deals") {

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

    }

    // The level is REPORTED, not policed — see the note at the top. What is policed is the spread, below.
    returns.push({ label: m.label, rtp });
    if (hits / N < 0.25) {
        failures += 1;
        console.log(`  ✗ only ${pct(hits / N)} of spins do anything — the whole point of twenty lines is that the screen stays alive`);
    }
    if ((freePaid + pickPaid) / paid < 0.25) {
        failures += 1;
        console.log(`  ✗ only ${pct((freePaid + pickPaid) / paid)} of the money is in the features — real machines put 30-50% there, and it is what people chase`);
    }
}

// ── THE ONE HARD RULE: LEVEL WITH EACH OTHER ─────────────────────────────────────────
// Not "at 100%". See the note at the top of this file. The floor can sit wherever Luke wants it; what it may
// not do is make one cabinet the obviously correct place to stand.
const lo = Math.min(...returns.map((r) => r.rtp));
const hi = Math.max(...returns.map((r) => r.rtp));
const mid = returns.reduce((a, r) => a + r.rtp, 0) / returns.length;
const spread = hi / lo - 1;
console.log(`
══ THE FLOOR ═══════════════════════════════════════`);
for (const r of returns) console.log(`  ${r.label.padEnd(16)} ${pct(r.rtp)}`);
console.log(`  ${"the floor".padEnd(16)} ${pct(mid)} on average`);
if (spread > SPREAD_TOLERANCE) {
    failures += 1;
    console.log(`
  ✗ the best cabinet pays ${pct(spread)} more than the worst — that makes one of them the smart pick.`);
    console.log(`    Level them WITH EACH OTHER. Do NOT level them down to a target: the height of the floor is`);
    console.log(`    a design decision, and chips are tickets rather than money.`);
} else {
    console.log(`  spread ${pct(spread)} — no cabinet is the smart pick (tolerance ${pct(SPREAD_TOLERANCE)}).`);
}

console.log(failures
    ? `\ncheck:slot5 — ${failures} problem(s).`
    : `\ncheck:slot5 — the five cabinets are level with each other, the screen stays alive, and the money is in the features.`);
process.exit(failures ? 1 : 0);
