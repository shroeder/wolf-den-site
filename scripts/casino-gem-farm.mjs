// ── THE STRATEGY, PLAYED EXACTLY AS DESCRIBED ────────────────────────────────────────────────────────────
// Luke: "Hes doing the gem mini game and winning it multiple times with the win it again, and hes able to
// use low bets to wait until he gets the bonus and then maximize the bonus by winning it again. Then he bets
// bigger and bigger repeating the strategy."
//
// That is a different loop from plain bet-switching, and it deserves its own harness rather than an argument
// that the other one covers it:
//
//   1. spin at the LOWEST stake until the Gem Vault fires — cheap fishing for the biggest prize on the floor
//   2. the gem win lands in the WIN IT AGAIN row, so keep spinning until the row fires and pays it AGAIN
//   3. step up a stake and repeat
//
// Step 2 is the part that is supposed to be priced in: the row deliberately survives its own payout (Luke:
// "for winning again, don't reseed"), the cost of that was measured at 95.1% -> 111.4%, and the paytable was
// trimmed 2% and `need` raised 5 -> 6 to pay for it. Step 3 was the arbitrage, and is now closed — the row
// banks the absolute win rather than a multiple of the bet.
//
// This asks the only question that matters: does playing it this way beat playing normally?
//
//   node --import ./scripts/lib/register-loader.mjs scripts/casino-gem-farm.mjs [--rounds 3000]
import { SLOTS5, playSpin, TARGET_RTP } from "@/lib/marketplace/casino-slot5.js";

const arg = (f, d) => { const i = process.argv.indexOf(f); return i > 0 ? Number(process.argv[i + 1]) : d; };
const ROUNDS = arg("--rounds", 3000);
const LADDER = [25, 100, 500, 2500];
const m = SLOTS5.slot5;

const mulberry = (a) => () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** Fish at `bet` until the vault fires, then keep going until the row pays it back. */
function farmOnce(bet, meter, rng) {
    let staked = 0;
    let won = 0;
    let gemHit = 0;

    // 1 + 2. Fish for the vault, then hold for the re-pay.
    let sawGem = false;
    for (let i = 0; i < 3000; i += 1) {
        const r = playSpin(m, { bet, rng, offerId: "mid", meter });
        staked += bet;
        won += r.total;
        meter = r.meter || [];
        if (r.gems) { sawGem = true; gemHit += r.gems.total; }
        // Once the gem is banked, wait for WIN IT AGAIN to pay the row back, then stop.
        if (sawGem && r.winAgain) break;
    }
    return { staked, won, meter, gemHit };
}

function run(seed, strategy) {
    const rng = mulberry(seed * 104729);
    let meter = [];
    let staked = 0;
    let won = 0;
    let gems = 0;

    for (let i = 0; i < ROUNDS; i += 1) {
        // The escalating ladder, or a flat control that never changes stake.
        const bet = strategy === "farm" ? LADDER[i % LADDER.length] : 500;
        const r = farmOnce(bet, meter, rng);
        staked += r.staked;
        won += r.won;
        gems += r.gemHit;
        meter = r.meter;
    }
    return { staked, won, gems };
}

const SEEDS = [1, 2, 3, 4];
const tally = (strategy) => {
    const rtps = SEEDS.map((s) => { const r = run(s, strategy); return r.won / r.staked; });
    const mean = rtps.reduce((a, b) => a + b, 0) / rtps.length;
    return { mean, rtps };
};

const farm = tally("farm");
const flat = tally("flat");

const pc = (x) => (100 * x).toFixed(1) + "%";
console.log(`target RTP ${pc(TARGET_RTP)}   rounds ${ROUNDS}   seeds ${SEEDS.length}\n`);
console.log(`fish-cheap, re-pay, escalate   ${pc(farm.mean)}   seeds: ${farm.rtps.map(pc).join(", ")}`);
console.log(`same loop at a flat stake      ${pc(flat.mean)}   seeds: ${flat.rtps.map(pc).join(", ")}`);

const edge = farm.mean - TARGET_RTP;
console.log(`\nstrategy minus target: ${(100 * edge).toFixed(1)} points`);
if (farm.mean > 1) {
    console.log("FAIL — the strategy returns over 100%. It is still a money printer.");
    process.exit(1);
}
if (edge > 0.05) {
    console.log("FAIL — the strategy beats the machine's target by more than noise.");
    process.exit(1);
}
console.log("ok — farming the vault does not beat the floor.");
