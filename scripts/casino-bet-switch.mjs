// ── CAN YOU BANK CHEAP AND CASH DEAR? ────────────────────────────────────────────────────────────────────
// Luke: "He basically is building his bonus up with low gambles on the vault and then goes max... its way
// too rewarding and hes exploiting it."
//
// He was right. WIN IT AGAIN banked each spin as `spinWin / bet` — a MULTIPLE — and paid out
// `sum(multiples) * CURRENT bet`. So five wins banked at a 100 stake, fired at a 2,500 stake, paid
// twenty-five times what they were worth when they were earned. The row also survives its own payout by
// design, so a full row could be cashed repeatedly at max bet.
//
// The ledger showed it plainly before this script existed: one member, one machine, 72.6% return at a 100
// stake and 159.6% at 2,500.
//
// ⚠️ THE SWEEP THAT CLEARED THIS FEATURE COULD NOT HAVE FOUND IT. casino-sim.mjs measures 300k spins at a
// CONSTANT bet, and an arbitrage that only exists when the stake CHANGES mid-row is invisible to every one
// of those runs. That is the lesson worth keeping: if a feature banks anything across spins, the harness has
// to VARY THE BET, or it is not testing the thing that can be exploited.
//
// This drives the real playSpin, same as casino-sim. It reports the switcher's return beside a flat player's
// and prints what the OLD formula would have paid on the very same rows, so the gap is visible rather than
// asserted.
//
//   node --import ./scripts/lib/register-loader.mjs scripts/casino-bet-switch.mjs [--rounds 4000]
import { SLOTS5, playSpin } from "@/lib/marketplace/casino-slot5.js";

const arg = (f, d) => { const i = process.argv.indexOf(f); return i > 0 ? Number(process.argv[i + 1]) : d; };
const ROUNDS = arg("--rounds", 4000);

const LOW = 100;
const MAX = 2500;
const m = SLOTS5.slot5;
const OFFER = "mid";

/**
 * One switcher round: bank at the LOW stake until the row is full, then cash at MAX until it fires.
 *
 * Returns what was staked and what came back, plus what the OLD formula would have paid for the same fire.
 */
function switcherRound() {
    let meter = [];
    let staked = 0;
    let won = 0;
    let oldWouldPay = null;

    // ── bank cheap ───────────────────────────────────────────────────────────────────────────────
    for (let i = 0; i < 400 && meter.filter((n) => n > 0).length < (m.winAgain?.slots || 5); i += 1) {
        const r = playSpin(m, { bet: LOW, offerId: OFFER, meter });
        staked += LOW;
        won += r.total;
        meter = r.meter || [];
        // A fire during the banking phase is ordinary play; keep going.
    }

    // ── cash dear ────────────────────────────────────────────────────────────────────────────────
    const bankedRow = [...meter];
    for (let i = 0; i < 2000; i += 1) {
        const r = playSpin(m, { bet: MAX, offerId: OFFER, meter });
        staked += MAX;
        won += r.total;
        meter = r.meter || [];
        if (r.winAgain) {
            // What the row was worth when EARNED, against what the old code would have paid for it.
            const bankedValue = bankedRow.reduce((a, n) => a + n, 0);
            oldWouldPay = (bankedValue / LOW) * MAX;   // the exact arbitrage: multiples re-valued at MAX
            break;
        }
    }
    return { staked, won, oldWouldPay, bankedValue: bankedRow.reduce((a, n) => a + n, 0) };
}

function flatRound(bet, spins) {
    let meter = [];
    let staked = 0;
    let won = 0;
    for (let i = 0; i < spins; i += 1) {
        const r = playSpin(m, { bet, offerId: OFFER, meter });
        staked += bet;
        won += r.total;
        meter = r.meter || [];
    }
    return { staked, won };
}

let sw = { staked: 0, won: 0 };
let oldTotal = 0;
let newTotal = 0;
let fires = 0;
let spinsUsed = 0;

for (let i = 0; i < ROUNDS; i += 1) {
    const r = switcherRound();
    sw.staked += r.staked;
    sw.won += r.won;
    spinsUsed += r.staked;
    if (r.oldWouldPay != null) {
        fires += 1;
        oldTotal += r.oldWouldPay;
        newTotal += r.bankedValue;
    }
}

// A flat player staking a comparable amount at each tier, for reference.
const flatLow = flatRound(LOW, Math.round(sw.staked / LOW / 2));
const flatMax = flatRound(MAX, Math.round(sw.staked / MAX / 2));

const pct = (w, s) => (s > 0 ? ((100 * w) / s).toFixed(1) + "%" : "—");

console.log(`rounds: ${ROUNDS}   fires measured: ${fires}\n`);
console.log(`bank-at-${LOW}-cash-at-${MAX}   staked ${sw.staked.toLocaleString()}   returned ${Math.round(sw.won).toLocaleString()}   RTP ${pct(sw.won, sw.staked)}`);
console.log(`flat ${LOW}                      staked ${flatLow.staked.toLocaleString()}   returned ${Math.round(flatLow.won).toLocaleString()}   RTP ${pct(flatLow.won, flatLow.staked)}`);
console.log(`flat ${MAX}                     staked ${flatMax.staked.toLocaleString()}   returned ${Math.round(flatMax.won).toLocaleString()}   RTP ${pct(flatMax.won, flatMax.staked)}`);

console.log(`\nwhat the banked rows paid:`);
console.log(`  now (value banked)        ${Math.round(newTotal).toLocaleString()}`);
console.log(`  old formula (× ${MAX / LOW} leverage) ${Math.round(oldTotal).toLocaleString()}`);
const edge = newTotal > 0 ? oldTotal / newTotal : 0;
console.log(`  the arbitrage that was    ${edge.toFixed(1)}×`);

// The switcher must not beat a flat player by more than ordinary noise.
const swRtp = sw.won / sw.staked;
const flatRtp = (flatLow.won + flatMax.won) / (flatLow.staked + flatMax.staked);
const gap = swRtp - flatRtp;
console.log(`\nswitcher minus flat: ${(100 * gap).toFixed(1)} points`);
if (gap > 0.05) {
    console.log("FAIL — switching stakes still pays. The row is still carrying leverage across bets.");
    process.exit(1);
}
console.log("ok — switching stakes buys nothing; the row pays what it banked.");
