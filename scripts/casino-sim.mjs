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

// ── THE THREE TABLES ─────────────────────────────────────────────────────────────────────────────────────────
// Luke: "yes" — extend it past the slots. Each one is measured with the game's OWN functions, for the same
// reason the cabinets are: a re-implementation prices a game nobody is playing.
//
// KENO is not simulated at all. Its return is a closed form — five picks out of forty, ten drawn — and
// casino.js already computes it exactly, so sampling it would be a worse answer to a question that has an
// arithmetic one.
const { KENO_PAYS, KENO_PICKS, KENO_DRAWN, KENO_POOL, kenoChance, kenoRtp } =
    await import("@/lib/marketplace/casino.js");
console.log("\n── KENO ──  exact, not sampled");
console.log(`  ${KENO_PICKS} picks from ${KENO_POOL}, ${KENO_DRAWN} drawn`);
for (let k = 0; k <= KENO_PICKS; k += 1) {
    const p = kenoChance(k);
    if (!p) continue;
    console.log(`  hit ${k}: ${(100 * p).toFixed(3).padStart(7)}%  pays ${String(KENO_PAYS[k] || 0).padStart(4)}x` +
        (KENO_PAYS[k] ? `   1 in ${Math.round(1 / p).toLocaleString()}` : ""));
}
console.log(`  RTP ${(100 * kenoRtp()).toFixed(2)}%`);

// ── BLACKJACK ────────────────────────────────────────────────────────────────────────────────────────────────
// Played by basicStrategy(), which lives in the kit rather than here precisely so this can ask "what does the
// table return to somebody who plays it WELL" — a simulation of a bad player flatters the house and proves
// nothing. Six decks, dealer stands on all 17, 3:2 naturals, double after split, no rake.
const bj = await import("@/lib/marketplace/blackjack-kit.js");
const HANDS = arg("--hands", 300000);
{
    let staked = 0, back = 0, shoe = bj.freshShoe();
    const draw = () => { if (shoe.length < 20) shoe = bj.freshShoe(); return shoe.pop(); };
    const STAKE = 100;
    for (let i = 0; i < HANDS; i += 1) {
        const dealer = [draw(), draw()];
        let hands = [{ cards: [draw(), draw()], doubled: false, fromSplit: false }];
        staked += STAKE;
        // One split, matching the table: canSplit refuses a second one.
        for (let h = 0; h < hands.length; h += 1) {
            const hand = hands[h];
            for (;;) {
                const may = bj.canSplit(hand.cards, hand.fromSplit) && hands.length < 2;
                const act = bj.basicStrategy(hand.cards, dealer[0], hand.cards.length === 2, may);
                if (act === "split") {
                    staked += STAKE;
                    const [a, b] = hand.cards;
                    hands[h] = { cards: [a, draw()], doubled: false, fromSplit: true };
                    hands.push({ cards: [b, draw()], doubled: false, fromSplit: true });
                    continue;
                }
                if (act === "double" && hand.cards.length === 2) {
                    staked += STAKE; hand.doubled = true; hand.cards.push(draw()); break;
                }
                if (act === "hit") { hand.cards.push(draw()); if (bj.handValue(hand.cards).bust) break; continue; }
                break;
            }
        }
        const done = bj.playDealer(dealer, shoe);
        const dealerFinal = Array.isArray(done) ? done : (done?.cards || dealer);
        for (const hand of hands) {
            back += bj.settleHand({ player: hand.cards, dealer: dealerFinal, stake: STAKE,
                doubled: hand.doubled, fromSplit: hand.fromSplit }).back;
        }
    }
    console.log(`\n── BLACKJACK ──  ${HANDS.toLocaleString()} hands, basic strategy`);
    console.log(`  staked ${staked.toLocaleString()}  returned ${Math.round(back).toLocaleString()}`);
    console.log(`  RTP ${(100 * back / staked).toFixed(2)}%   rake ${bj.BLACKJACK_RAKE}`);
}

// ── BINGO ────────────────────────────────────────────────────────────────────────────────────────────────────
const bi = await import("@/lib/marketplace/bingo-kit.js");
{
    const CARDS = arg("--cards", 200000);
    let staked = 0, back = 0;
    const tally = {};
    for (let i = 0; i < CARDS; i += 1) {
        const card = bi.makeCard();
        const pool = Array.from({ length: bi.BALLS }, (_, n) => n + 1);
        for (let j = pool.length - 1; j > 0; j -= 1) { const k = Math.floor(Math.random() * (j + 1)); [pool[j], pool[k]] = [pool[k], pool[j]]; }
        const drawn = pool.slice(0, bi.DRAWN);
        const r = bi.scoreCard(card, drawn, []);
        const mult = Number(r?.pays ?? r?.multiple ?? r?.mult ?? 0) || 0;
        staked += 1; back += mult;
        const key = r?.tier ?? r?.pattern ?? (mult ? String(mult) : "nothing");
        tally[key] = (tally[key] || 0) + 1;
    }
    console.log(`\n── BINGO ──  ${CARDS.toLocaleString()} cards, ${bi.DRAWN} of ${bi.BALLS} drawn`);
    console.log(`  RTP ${(100 * back / staked).toFixed(2)}%`);
    console.log("  outcomes " + JSON.stringify(tally));
}
