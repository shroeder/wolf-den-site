// ── DOES THE FLOOR PAY WHAT THE GATE PRICED? ─────────────────────────────────────────────────────────────────
// check:casino prices the six slot bonuses with ARITHMETIC — closed-form expected values, one per feature. It
// is exact, and it is also a description of what the features are SUPPOSED to do. This script checks the
// other thing: that the code which actually runs on the floor pays what that arithmetic says.
//
// It does it by playing millions of pulls through `applyBonuses` — not a copy of it, the same exported
// function `spinSlot` calls on every pull — with a meter that persists across pulls exactly as the database
// row does, and measuring what comes back.
//
// WHY THIS IS THE CHECK THAT MATTERS. A gate that prices one implementation while the floor runs another is a
// gate that passes right up until the money is gone. Every stateful bonus here (the tray filling, the streak
// climbing, free pulls spanning requests) is a place where the arithmetic and the code can quietly disagree,
// and none of them would show up in a single hand.
//
// Run:  node scripts/check-slot-bonus.mjs   (or npm run check:slot-bonus)
import { SLOT_MACHINES, slotPayout, slotRtp, slotHitRate, RTP_CEILING } from "../src/lib/marketplace/casino.js";
import { SLOT_BONUSES, applyBonuses, bonusEv, emptyMeter, slotSigma } from "../src/lib/marketplace/slot-bonus.js";

const PULLS = Number(process.env.PULLS || 3_000_000);
const pct = (n) => `${(n * 100).toFixed(2)}%`;
const problems = [];

// Seeded, so a run that finds a problem can be re-run and produce the same problem.
let seed = 20260822;
const rng = () => {
    seed ^= seed << 13; seed >>>= 0;
    seed ^= seed >>> 17;
    seed ^= seed << 5; seed >>>= 0;
    return seed / 4294967296;
};

console.log(`Playing ${PULLS.toLocaleString()} pulls per cabinet through the floor's own applyBonuses.\n`);

for (const m of Object.values(SLOT_MACHINES)) {
    const bonuses = SLOT_BONUSES[m.id] || [];
    if (!bonuses.length) continue;

    const total = m.symbols.reduce((n, s) => n + s.weight, 0);
    const rollSymbol = () => {
        let r = rng() * total;
        for (const s of m.symbols) { r -= s.weight; if (r <= 0) return s.id; }
        return m.symbols[m.symbols.length - 1].id;
    };

    const meter = emptyMeter();
    let staked = 0;      // only PAID pulls cost anything — that is the whole point of a free pull
    let returned = 0;
    let freePulls = 0;
    let nudges = 0, nudgeHits = 0, tips = 0, tipTotal = 0, triggers = 0, struckPulls = 0;
    const bursts = {}; const burstPaid = {};

    for (let i = 0; i < PULLS; i += 1) {
        const free = meter.freePulls > 0;
        if (free) { meter.freePulls -= 1; freePulls += 1; } else { staked += 1; }

        const reels = [rollSymbol(), rollSymbol(), rollSymbol()];
        const fx = applyBonuses({
            machineId: m.id, machine: m, reels, meter, free,
            payout: (r) => slotPayout(r, m.id),
            rollSymbol,
        });
        returned += fx.mult;

        if (fx.nudged) { nudges += 1; if (fx.nudged.hit) nudgeHits += 1; }
        if (fx.tipped) { tips += 1; tipTotal += fx.tipped; }
        if (fx.awarded) triggers += 1;
        for (const b of fx.burst || []) { bursts[b.id] = (bursts[b.id] || 0) + 1; burstPaid[b.id] = (burstPaid[b.id] || 0) + b.paid; }
        if (fx.struck > 1) struckPulls += 1;
    }

    // The measured return is against what was PAID FOR, which is the only meaningful denominator: free pulls
    // are the feature, so counting them as stake would price the feature as if the player bought it.
    const measured = returned / staked;
    const paytable = slotRtp(m.id);
    // THE POT IS EXCLUDED from this comparison, deliberately. Its return is exactly its contribution rate by
    // construction — everything paid in is eventually paid out — and it is a SHARED row that this simulation
    // does not have and could not model with one player. What is being checked here is the code that runs per
    // pull; the pot's correctness is an accounting identity, not a sampling question.
    const ev = bonusEv(m.id, m, paytable, slotHitRate(m.id));
    const priced = paytable + ev.total - (ev.pot || 0);
    const drift = measured - priced;

    // THE BAND COMES FROM THE MACHINE, not from a number somebody picked — see the note where it is used.
    const sigma = slotSigma(m, (r) => slotPayout(r, m.id)) / Math.sqrt(staked);
    const band = 4 * sigma;
    // The top prize is what drives the uncertainty: it is the rarest thing that pays, so it is the thing
    // this many pulls has seen fewest of.
    const top = Math.max(...Object.values(m.pays.three));

    console.log(`${m.label.toUpperCase()}`);
    console.log(`  priced       ${pct(priced)}   (paytable ${pct(paytable)} + features, excluding the shared Pot)`);
    console.log(`  measured     ${pct(measured)}   over ${staked.toLocaleString()} paid pulls`);
    console.log(`  drift        ${(drift >= 0 ? "+" : "") + pct(drift)}  against a ±${pct(band)} band (four sigma — mostly this machine's ${top.toLocaleString()}x tail)`);
    if (freePulls) console.log(`  free pulls   ${freePulls.toLocaleString()} awarded and played (${pct(freePulls / PULLS)} of all pulls)`);
    if (nudges) console.log(`  nudges       ${nudges.toLocaleString()}, of which ${nudgeHits.toLocaleString()} landed the jackpot`);
    if (tips) console.log(`  tray tipped  ${tips.toLocaleString()} times, ${(tipTotal / tips).toFixed(2)}x average`);
    if (struckPulls) console.log(`  moonstruck   ${struckPulls.toLocaleString()} wins paid at a raised multiplier`);
    if (triggers) console.log(`  triggers     ${triggers.toLocaleString()}`);
    for (const [id, n] of Object.entries(bursts)) {
        console.log(`  ${id.padEnd(11)}  burst ${n.toLocaleString()} times, ${(burstPaid[id] / n).toFixed(2)}x average, once every ${Math.round(staked / n).toLocaleString()} pulls`);
    }
    console.log("");

    // ── THE TWO WAYS THIS CAN BE WRONG ───────────────────────────────────────────────────────────────────
    // Over the ceiling is the one that costs money. Drifting from the priced number is the one that means
    // the gate has stopped describing the machine — which is worse, because it is what would let the next
    // change through unnoticed.
    if (measured > RTP_CEILING) {
        problems.push(`${m.label} actually pays ${pct(measured)}, above the ${pct(RTP_CEILING)} ceiling`);
    }

    // Moonrise pays 4,000x once in ninety-one thousand pulls, so three million pulls still leave more than
    // a point of honest uncertainty in its measured return — a fixed half-point tolerance would fail forever
    // on a machine that is perfectly correct. Four sigma of the mean instead: wide enough that a right
    // machine passes, narrow enough that a feature paying the wrong thing does not fit inside it.
    if (Math.abs(drift) > band) {
        problems.push(`${m.label} pays ${pct(measured)} but check:casino prices it at ${pct(priced)} — a drift of ${pct(drift)}, outside the ±${pct(band)} this many pulls can resolve. The arithmetic and the code disagree.`);
    }
}

if (problems.length) {
    console.log(`check:slot-bonus FAILED — ${problems.length} problem(s):\n`);
    for (const p of problems) console.log(`  ✗ ${p}`);
    process.exit(1);
}
console.log("check:slot-bonus — every cabinet pays what check:casino says it pays.");
