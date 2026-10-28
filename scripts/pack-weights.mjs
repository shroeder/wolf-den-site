// ── WEIGHTED PULLS: A DREAM AT EVERY PRICE, WITHOUT LOSING MONEY ─────────────────────────────────────────────
// Luke, 2026-10-27: "we need the different pack values with weighted pull rates to ensure we make money. With
// a little magic early on to get people hooked."
//
// Banding by ceiling (pack-odds-100.mjs §4) works but kills the dream: a $5 pack whose best possible pull is
// $10 has nothing to chase. Weighting fixes exactly that. Keep EVERY card reachable, make the expensive ones
// rare in proportion to how expensive they are, and tune one exponent until the EV lands where the price
// needs it.
//
//     weight(card) ∝ 1 / value^alpha
//
// alpha = 0 is today's behaviour (uniform — every card equally likely). alpha = 1 makes a $100 card a tenth
// as likely as a $10 one. Between those two there is, for each price point, exactly one alpha that puts EV on
// target — and because no weight is ever zero, the $258 Jirachi stays in every pack at long odds.
//
// Read-only, prints a table. Run: node scripts/pack-weights.mjs
import fs from "node:fs";
import { neon } from "@neondatabase/serverless";

const sql = neon(fs.readFileSync("C:/Users/Luke/Projects/wolf den site/.env.local", "utf8")
    .match(/^DATABASE_URL=["']?([^"'\r\n]+)/m)[1]);

const usd = (c) => `$${(c / 100).toFixed(2)}`;
const pct = (x) => `${(x * 100).toFixed(2)}%`;

/** What we pay at 100%: quarter round-up, $1 floor. Mirrors buyback.js. */
const payout = (market) => (market <= 0 ? 0 : Math.max(100, Math.ceil(market / 25) * 25));

async function poolCards(category) {
    const rows = await sql`SELECT name, price, quantity FROM inventory_feed
                            WHERE in_stock AND quantity > 0 AND NOT consigned AND category_names = ${category}`;
    return rows
        .map((r) => ({ name: r.name, cents: Math.round(Number(r.price) * 100), qty: Math.min(Number(r.quantity) || 0, 50) }))
        .filter((c) => c.cents > 0 && c.qty > 0)
        .sort((a, b) => a.cents - b.cents);
}

/**
 * EV of a weighted draw. `qty` multiplies the weight — four copies really are four chances — which is also
 * what stops a single line being made artificially rare just because the shop happens to hold one of it.
 */
function weightedEv(cards, alpha) {
    let wsum = 0, esum = 0;
    for (const c of cards) {
        const w = (c.qty * Math.pow(c.cents / 100, -alpha));
        wsum += w;
        esum += w * payout(c.cents);
    }
    return { ev: esum / wsum, wsum };
}

/** The alpha that lands EV on `targetCents`. Monotone in alpha, so plain bisection. */
function solveAlpha(cards, targetCents) {
    let lo = 0, hi = 6;
    if (weightedEv(cards, lo).ev <= targetCents) return 0;        // uniform already clears it
    if (weightedEv(cards, hi).ev > targetCents) return null;      // even brutal weighting cannot
    for (let i = 0; i < 60; i += 1) {
        const mid = (lo + hi) / 2;
        if (weightedEv(cards, mid).ev > targetCents) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
}

/** Chance of pulling a card worth at least `cents`, under the weights. */
function chanceAtLeast(cards, alpha, cents) {
    let wsum = 0, hit = 0;
    for (const c of cards) {
        const w = c.qty * Math.pow(c.cents / 100, -alpha);
        wsum += w;
        if (c.cents >= cents) hit += w;
    }
    return hit / wsum;
}

const POOLS = [
    { label: "Pokémon", category: "Pokemon Single Card" },
    { label: "Magic", category: "Magic Single Card" },
    { label: "Yu-Gi-Oh", category: "Yu-Gi-Oh Single" },
];
const PRICES = [500, 1000, 1500];
const TARGET_MARGIN = 0.15;

console.log("\n══ WEIGHTED PULLS — one alpha per price point, every card still reachable ══════════════════\n");

for (const p of POOLS) {
    const cards = await poolCards(p.category);
    if (cards.length < 25) { console.log(`  ${p.label}: only ${cards.length} lines — too thin\n`); continue; }
    const units = cards.reduce((s, c) => s + c.qty, 0);
    const top = cards[cards.length - 1];
    console.log(`  ${p.label}  —  ${cards.length} lines / ${units} units, best card ${usd(top.cents)} (${top.name.slice(0, 40)})`);
    console.log(`     uniform EV would be ${usd(weightedEv(cards, 0).ev)}\n`);
    console.log(`     price    alpha   EV(paid)   margin          odds of >=$50   >=$100   the top card`);
    for (const price of PRICES) {
        const target = price * (1 - TARGET_MARGIN);
        const alpha = solveAlpha(cards, target);
        if (alpha === null) { console.log(`     ${usd(price).padStart(6)}    — cannot reach a 15% margin even at alpha 6`); continue; }
        const { ev } = weightedEv(cards, alpha);
        const margin = price - ev;
        const o50 = chanceAtLeast(cards, alpha, 5000);
        const o100 = chanceAtLeast(cards, alpha, 10000);
        const oTop = chanceAtLeast(cards, alpha, top.cents);
        console.log(`     ${usd(price).padStart(6)}   ${alpha.toFixed(2).padStart(5)}   ${usd(ev).padStart(8)}`
            + `   ${usd(margin).padStart(6)} (${((margin / price) * 100).toFixed(0)}%)`
            + `      ${pct(o50).padStart(7)}  ${pct(o100).padStart(7)}   1 in ${Math.round(1 / oTop).toLocaleString()}`);
    }
    console.log("");
}

console.log("══ THE POINT ═══════════════════════════════════════════════════════════════════════════════\n");
console.log("   Banding by ceiling gave the $5 pack a best-possible pull of $10. Weighting leaves the");
console.log("   SAME best card in every pack at every price — the $5 buyer can still hit the top card,");
console.log("   just far more rarely than the $15 buyer. That is a dream at every price point, and the");
console.log("   EV is pinned wherever we want it.\n");

console.log("══ \"A LITTLE MAGIC EARLY ON\" — WITHOUT BUILDING AN ALT FARM ════════════════════════════════\n");
console.log("   ⚠️ THE CONSTRAINT IS NOT TASTE, IT IS THAT THIS GAME HAS ALREADY BEEN ALT-FARMED.");
console.log("   A first-open bonus on a product that pays out STORE CREDIT is the most farmable thing");
console.log("   we could build: if the boosted pack's EV ever exceeds its price, every new account is");
console.log("   free money and people will make them in bulk. So the first open may reshape the");
console.log("   distribution all it likes, but its EV must still sit BELOW the price.\n");
console.log("   So: magic = DELETING THE DUD, not adding a jackpot. Same money, better first pull.\n");

for (const p of POOLS) {
    const cards = await poolCards(p.category);
    if (cards.length < 25) continue;
    console.log(`   ${p.label}`);
    for (const price of PRICES) {
        const target = price * (1 - TARGET_MARGIN);
        const base = solveAlpha(cards, target);
        if (base === null) continue;
        // The normal pack, for comparison: how often does it hand over something forgettable?
        const dudLine = Math.round(price * 0.25);
        const dudChance = 1 - chanceAtLeast(cards, base, dudLine);

        // FIRST OPEN: drop everything under the dud line, then re-solve alpha on what is left so the EV
        // lands on the SAME target. A richer floor forces a steeper curve — the magic pays for itself.
        const noDuds = cards.filter((c) => c.cents >= dudLine);
        if (noDuds.length < 25) { console.log(`     ${usd(price).padStart(6)}  first-open floor ${usd(dudLine)}: only ${noDuds.length} lines left — too thin`); continue; }
        const firstAlpha = solveAlpha(noDuds, target);
        if (firstAlpha === null) { console.log(`     ${usd(price).padStart(6)}  first-open floor ${usd(dudLine)}: cannot hold EV — would lose money`); continue; }
        const ev = weightedEv(noDuds, firstAlpha).ev;
        console.log(`     ${usd(price).padStart(6)}  normal: ${pct(dudChance)} chance of a sub-${usd(dudLine)} dud`
            + `   →   first open: 0%, EV still ${usd(ev)} (margin ${usd(price - ev)})`);
    }
    console.log("");
}
console.log("   Every line above holds the SAME margin as the normal pack. The first open is not");
console.log("   more generous — it is less disappointing, which is the thing that actually hooks.");
console.log("   And because EV never exceeds price, farming it with alts earns nothing.\n");
