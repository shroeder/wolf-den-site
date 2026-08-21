// ── WHAT DOES THIS TABLE ACTUALLY RETURN? ────────────────────────────────────────────────────────────────────
// check-casino enumerates its machines exactly, because a slot has 216 outcomes and there is no excuse for
// estimating a number you can compute. Blackjack has no such luxury: the return depends on how the hand is
// PLAYED, so the only honest way to price it is to play it — a lot, well, and with the table's own code.
//
// So this is a simulation, and it says so. It plays perfect basic strategy (imported from the kit, not
// re-implemented here) against the table's own settle function, over enough hands that the answer is stable
// to a tenth of a percent.
//
// WHY BASIC STRATEGY AND NOT AVERAGE PLAY: the question the ceiling asks is whether this table can be BEATEN,
// not what a careless player gives back. Simulating a careless player would report a flattering number and
// prove nothing about the risk.
//
// Run:  node scripts/check-blackjack.mjs   (or npm run check:blackjack)
import {
    freshShoe, handValue, isBlackjack, playDealer, settleHand, basicStrategy,
    BLACKJACK_RAKE, DECKS, DEALER_STANDS_ON, BLACKJACK_PAYS,
} from "../src/lib/marketplace/blackjack-kit.js";
import { RTP_CEILING, RTP_TARGET } from "../src/lib/marketplace/casino.js";

const HANDS = Number(process.env.HANDS || 2_000_000);
const STAKE = 100;

// A seeded generator, so a run that finds a problem can be re-run and produce the same problem. Math.random
// would make every failure a story about a number nobody can get back.
let seed = 20260821;
const rng = () => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0;
    return seed / 4294967296;
};

const pct = (n) => `${(n * 100).toFixed(2)}%`;
const problems = [];

let staked = 0;
let returned = 0;
let rakeTaken = 0;
const tally = {};

for (let i = 0; i < HANDS; i += 1) {
    const shoe = freshShoe(rng);
    const player = [shoe.pop(), shoe.pop()];
    const dealer = [shoe.pop(), shoe.pop()];
    let doubled = false;

    // The player's turn, unless somebody already has twenty-one.
    if (!isBlackjack(player) && !isBlackjack(dealer)) {
        for (;;) {
            const canDouble = player.length === 2 && !doubled;
            const move = basicStrategy(player, dealer[0], canDouble);
            if (move === "stand") break;
            player.push(shoe.pop());
            if (move === "double") { doubled = true; break; }
            if (handValue(player).bust) break;
        }
    }

    // The dealer only plays if there is still a hand to beat.
    const finalDealer = handValue(player).bust || isBlackjack(player) || isBlackjack(dealer)
        ? dealer
        : playDealer(dealer, shoe);

    const r = settleHand({ player, dealer: finalDealer, stake: STAKE, doubled });
    staked += r.bet;
    returned += r.back;
    rakeTaken += r.rake;
    tally[r.outcome] = (tally[r.outcome] || 0) + 1;
}

const rtp = returned / staked;

console.log("THE TABLE");
console.log(`  rules        ${DECKS} decks, dealer stands on ${DEALER_STANDS_ON}, blackjack pays ${BLACKJACK_PAYS}:1, double on two, no split`);
console.log(`  the rake     ${pct(BLACKJACK_RAKE)} of winnings — never of the stake`);
console.log(`  hands        ${HANDS.toLocaleString()}, perfect basic strategy (SIMULATED, not enumerated)`);
console.log(`  return       ${pct(rtp)}   target ${pct(RTP_TARGET)}   ceiling ${pct(RTP_CEILING)}`);
console.log(`  house edge   ${pct(1 - rtp)}`);
console.log(`  of which rake ${pct(rakeTaken / staked)} — the rest is the game's own small edge`);

console.log("\n  how hands ended");
for (const [k, n] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${k.padEnd(18)} ${pct(n / HANDS).padStart(7)}`);
}

if (rtp > RTP_CEILING) {
    problems.push(`the table returns ${pct(rtp)} to a basic-strategy player, above the ${pct(RTP_CEILING)} ceiling — raise BLACKJACK_RAKE`);
}
if (rtp >= 1) problems.push(`the table returns ${pct(rtp)} — it pays people to play it`);
// A floor whose games all sit near 88% and one that sits at 70% is a floor with a trap on it. Blackjack is
// the game people arrive knowing, so it being the WORST value on the floor would be the meanest possible
// version of that.
if (rtp < 0.82) {
    problems.push(`the table returns ${pct(rtp)}, well under the ${pct(RTP_TARGET)} the rest of the floor pays — the game everybody already knows should not be the trap`);
}

if (problems.length) {
    console.log(`\ncheck:blackjack FAILED — ${problems.length} problem(s):\n`);
    for (const p of problems) console.log(`  ✗ ${p}`);
    process.exit(1);
}
console.log(`\ncheck:blackjack — a perfect player gets ${pct(rtp)} back. The house keeps ${pct(1 - rtp)}.`);
