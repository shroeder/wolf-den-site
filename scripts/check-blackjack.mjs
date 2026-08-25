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
    freshShoe, handValue, isBlackjack, playDealer, settleHand, basicStrategy, canSplit, pairValue,
    BLACKJACK_RAKE, DECKS, DEALER_STANDS_ON, BLACKJACK_PAYS,
} from "../src/lib/marketplace/blackjack-kit.js";
import { CHIP_RATE } from "../src/lib/marketplace/chips.js";

// ── AND THIS TABLE IS NOT A GOLD GAME ANY MORE ───────────────────────────────────────────────────────────────
// It used to be measured against RTP_CEILING, and the rake existed to hold it under that. Both are gone: the
// table pays CHIPS (Luke: "convert blackjack, keno and bingo to give out chips, not gold") and takes no rake
// (Luke: "remove rake from this, we don't want to rake anything"), which are the same decision. See the long
// note at the top of blackjack-kit.js — the edge on a chip game is the CONVERSION, not a cut of a win.
//
// So the question is the one check:slot5 asks of the five-reel floor: is this cabinet a different deal from
// the ones next to it? The five-reel machines return 97.6% to 108.5% in chips. A basic-strategy blackjack
// player against these rules gets about 99.5%, which lands in the middle of them without anything being tuned
// — which is the nicest possible answer, because it means the rules everybody already knows are the rules.
const CHIP_FLOOR_LO = 0.90;
const CHIP_FLOOR_HI = 1.12;

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

// One hand's worth of decisions, played to a stop. Split hands come back through here too, with `fromSplit`
// set — which is what stops them being offered another split and what makes a 21 on them just a 21.
function playOut(cards, up, shoe, { fromSplit = false, splitAces = false } = {}) {
    let doubled = false;
    // Split aces get exactly one card and the turn is over. It is the single most valuable rule in the game
    // and leaving it out would price a table nobody would build.
    if (fromSplit && splitAces) return { cards, doubled };
    for (;;) {
        const canDouble = cards.length === 2 && !doubled;
        const move = basicStrategy(cards, up, canDouble, false);
        if (move === "stand") break;
        cards.push(shoe.pop());
        if (move === "double") { doubled = true; break; }
        if (handValue(cards).bust) break;
    }
    return { cards, doubled };
}

let splits = 0;
for (let i = 0; i < HANDS; i += 1) {
    const shoe = freshShoe(rng);
    const opening = [shoe.pop(), shoe.pop()];
    const dealer = [shoe.pop(), shoe.pop()];
    const up = dealer[0];

    // A natural on either side ends it before anybody chooses anything.
    if (isBlackjack(opening) || isBlackjack(dealer)) {
        const r = settleHand({ player: opening, dealer, stake: STAKE });
        staked += r.bet; returned += r.back; rakeTaken += r.rake;
        tally[r.outcome] = (tally[r.outcome] || 0) + 1;
        continue;
    }

    // ── SPLIT OR NOT ────────────────────────────────────────────────────────────────────────────────────
    // The split decision is taken first because it forks everything after it. Once, never twice: the table
    // allows one split, so the simulation must too, or it prices a game the floor does not run.
    const hands = [];
    if (canSplit(opening) && basicStrategy(opening, up, true, true) === "split") {
        splits += 1;
        const splitAces = pairValue(opening[0]) === 11;
        for (const card of opening) {
            const h = [card, shoe.pop()];
            hands.push({ ...playOut(h, up, shoe, { fromSplit: true, splitAces }), fromSplit: true });
        }
    } else {
        hands.push({ ...playOut([...opening], up, shoe), fromSplit: false });
    }

    // The dealer plays ONCE against however many hands are on the table, and only if any of them survived.
    const alive = hands.some((h) => !handValue(h.cards).bust);
    const finalDealer = alive ? playDealer(dealer, shoe) : dealer;

    for (const h of hands) {
        const r = settleHand({ player: h.cards, dealer: finalDealer, stake: STAKE, doubled: h.doubled, fromSplit: h.fromSplit });
        staked += r.bet;
        returned += r.back;
        rakeTaken += r.rake;
        const key = h.fromSplit ? `${r.outcome} (split)` : r.outcome;
        tally[key] = (tally[key] || 0) + 1;
    }
}

const rtp = returned / staked;

console.log("THE TABLE");
console.log(`  rules        ${DECKS} decks, dealer stands on ${DEALER_STANDS_ON}, blackjack pays ${BLACKJACK_PAYS}:1, double on two, split once, double after split`);
console.log(`  the rake     ${pct(BLACKJACK_RAKE)} — the table takes none`);
console.log(`  paid in      CHIPS at ${CHIP_RATE} per gold staked — the gold does not come back`);
console.log(`  hands        ${HANDS.toLocaleString()}, perfect basic strategy including pairs (SIMULATED, not enumerated)`);
console.log(`  split        ${(splits / HANDS * 100).toFixed(2)}% of hands were split`);
console.log(`  return       ${pct(rtp)}   the five-reel chip floor pays ${pct(CHIP_FLOOR_LO)}-${pct(CHIP_FLOOR_HI)}`);
console.log(`  of which rake ${pct(rakeTaken / staked)} — the rest is the game's own small edge`);

console.log("\n  how hands ended");
for (const [k, n] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${k.padEnd(18)} ${pct(n / HANDS).padStart(7)}`);
}

if (rtp > CHIP_FLOOR_HI) {
    problems.push(`the table returns ${pct(rtp)} in chips to a basic-strategy player, above the ${pct(CHIP_FLOOR_HI)} the five-reel floor pays — it is the smart pick on the floor`);
}
// Deliberately NOT "rtp >= 1 is a money printer". Chips never convert back to gold, so a chip cabinet a
// point over 100% hands out slightly more tickets and nothing more — two of the five-reel machines are
// already above it. The band above is what matters.
// A floor whose games all sit near 88% and one that sits at 70% is a floor with a trap on it. Blackjack is
// the game people arrive knowing, so it being the WORST value on the floor would be the meanest possible
// version of that.
if (rtp < CHIP_FLOOR_LO) {
    problems.push(`the table returns ${pct(rtp)} in chips, under the ${pct(CHIP_FLOOR_LO)} the five-reel floor pays — the game everybody already knows should not be the trap`);
}

if (problems.length) {
    console.log(`\ncheck:blackjack FAILED — ${problems.length} problem(s):\n`);
    for (const p of problems) console.log(`  ✗ ${p}`);
    process.exit(1);
}
console.log(`\ncheck:blackjack — a perfect player gets ${pct(rtp)} back. The house keeps ${pct(1 - rtp)}.`);
console.log("Splitting correctly is worth roughly half a point to the player, and the table lets them keep it.");
