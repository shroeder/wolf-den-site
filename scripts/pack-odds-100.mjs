// ── WILL THIS MAKE MONEY AT 100% SELL-BACK? ──────────────────────────────────────────────────────────────────
// Luke, 2026-10-27: "I really need to know mathematically how likely we are to make money doing this."
//
// At 60% the pack had two margins. At 100% it has one:
//
//     expected margin per open = price − EV(pool)
//
// So this does three things against the REAL pools, quantity-weighted exactly the way the pull is:
//   1. EV, median, and the margin each pool actually earns at its current price
//   2. the VARIANCE — the chance of being down after N opens, by exact convolution, not a guess
//   3. what price-banding by floor/ceiling would do to all of the above
//
// Read-only. Run: node scripts/pack-odds-100.mjs
import fs from "node:fs";
import { neon } from "@neondatabase/serverless";

const sql = neon(fs.readFileSync("C:/Users/Luke/Projects/wolf den site/.env.local", "utf8")
    .match(/^DATABASE_URL=["']?([^"'\r\n]+)/m)[1]);

const usd = (c) => `$${(c / 100).toFixed(2)}`;

// ⚠️ THE SAME FILTER THE PULL USES. in_stock, quantity > 0, NOT consigned. A model built on a different
// population than the one the pull draws from is a model of nothing.
async function poolCards(category) {
    const rows = await sql`SELECT price, quantity FROM inventory_feed
                            WHERE in_stock AND quantity > 0 AND NOT consigned AND category_names = ${category}`;
    // Quantity-weighted: four copies of a card are four chances at it.
    const out = [];
    for (const r of rows) {
        const cents = Math.round(Number(r.price) * 100);
        for (let i = 0; i < Math.min(Number(r.quantity) || 0, 50); i += 1) out.push(cents);
    }
    return out.sort((a, b) => a - b);
}

/** What we PAY a member for a card at 100%: round up to a quarter, floor of $1. Matches buyback.js. */
const payout = (market) => (market <= 0 ? 0 : Math.max(100, Math.ceil(market / 25) * 25));

function stats(cards, priceCents) {
    const n = cards.length;
    if (!n) return null;
    const ev = cards.reduce((s, c) => s + c, 0) / n;
    // ⚠️ MARGIN IS AGAINST WHAT WE PAY OUT, NOT AGAINST RAW MARKET. The quarter round-up and the $1 floor
    //    both run in the member's favour, so modelling raw market flatters us by a few cents a pack.
    const evPaid = cards.reduce((s, c) => s + payout(c), 0) / n;
    const margin = priceCents - evPaid;
    const sorted = cards;
    const median = sorted[Math.floor(n / 2)];
    const variance = cards.reduce((s, c) => s + (priceCents - payout(c) - margin) ** 2, 0) / n;
    const sd = Math.sqrt(variance);
    const loseChance = cards.filter((c) => payout(c) > priceCents).length / n;
    return { n, ev, evPaid, margin, median, sd, loseChance, max: sorted[n - 1], min: sorted[0] };
}

/**
 * Exact probability the house is DOWN after k opens, by convolving the per-open distribution.
 *
 * ⚠️ NOT a normal approximation. The payout distribution has a long right tail — one $258 card against a
 * floor of $1 — and the normal curve badly understates the chance of a single pull wiping out fifty good
 * ones. Binned to the dollar so the convolution stays tractable.
 */
function ruinCurve(cards, priceCents, maxOpens) {
    const dollars = cards.map((c) => Math.round((priceCents - payout(c)) / 100));
    const lo = Math.min(...dollars), hi = Math.max(...dollars);
    const counts = new Map();
    for (const d of dollars) counts.set(d, (counts.get(d) || 0) + 1);
    const p = [...counts.entries()].map(([d, n]) => [d, n / dollars.length]);

    const OFF = Math.abs(lo) * maxOpens + 10;
    const SIZE = OFF + hi * maxOpens + 10;
    let dist = new Float64Array(SIZE);
    dist[OFF] = 1;
    const out = [];
    for (let k = 1; k <= maxOpens; k += 1) {
        const next = new Float64Array(SIZE);
        for (let i = 0; i < SIZE; i += 1) {
            const v = dist[i];
            if (v < 1e-15) continue;
            for (const [d, prob] of p) {
                const j = i + d;
                if (j >= 0 && j < SIZE) next[j] += v * prob;
            }
        }
        dist = next;
        let down = 0;
        for (let i = 0; i < OFF; i += 1) down += dist[i];
        out.push({ k, down });
    }
    return out;
}

const POOLS = [
    { key: "pkmn", label: "Pokémon Singles", category: "Pokemon Single Card" },
    { key: "mtg", label: "Magic Singles", category: "Magic Single Card" },
    { key: "ygo", label: "Yu-Gi-Oh Singles", category: "Yu-Gi-Oh Single" },
];

console.log("\n══ 1. THE POOLS AS THEY STAND, AT 100% SELL-BACK ═══════════════════════════════════════════\n");
const loaded = [];
for (const p of POOLS) {
    const cards = await poolCards(p.category);
    const [state] = await sql`SELECT price_cents FROM mkt_pack_pool_state WHERE pool = ${p.key}`;
    const price = state?.price_cents || 0;
    const s = stats(cards, price);
    loaded.push({ ...p, cards, price, s });
    if (!s) { console.log(`  ${p.label}: no stock`); continue; }
    console.log(`  ${p.label.padEnd(18)} price ${usd(price)}   units ${String(s.n).padStart(4)}`);
    console.log(`     EV(market) ${usd(s.ev).padStart(9)}   EV(we pay) ${usd(s.evPaid).padStart(9)}   median ${usd(s.median).padStart(8)}   max ${usd(s.max)}`);
    console.log(`     margin/open ${usd(s.margin).padStart(8)}  (${((s.margin / price) * 100).toFixed(1)}% of price)   sd ${usd(s.sd)}`);
    console.log(`     chance ONE open loses money: ${(s.loseChance * 100).toFixed(1)}%\n`);
}

console.log("══ 2. HOW LIKELY ARE WE TO BE DOWN AFTER N OPENS ═══════════════════════════════════════════\n");
console.log("   (exact convolution, not a normal approximation — the tail is the whole story)\n");
console.log("   pool                 10 opens   50 opens  100 opens  250 opens  500 opens");
for (const p of loaded) {
    if (!p.s) continue;
    const curve = ruinCurve(p.cards, p.price, 500);
    const at = (k) => `${(curve[k - 1].down * 100).toFixed(1)}%`.padStart(9);
    console.log(`   ${p.label.padEnd(18)} ${at(10)} ${at(50)} ${at(100)} ${at(250)} ${at(500)}`);
}

console.log("\n══ 3. WHAT BANDING BY FLOOR/CEILING WOULD DO ═══════════════════════════════════════════════\n");
console.log("   Luke: \"one at 5 bucks and one at 10 bucks and one at 15, tiering them based on floor");
console.log("   and ceiling so the EV makes sense.\"\n");
// A band is a [floor, ceiling) on card market value. The pack price has to clear EV(paid) inside the band.
const BANDS = [
    { price: 500, lo: 0, hi: 1200 },
    { price: 1000, lo: 800, hi: 3000 },
    { price: 1500, lo: 1500, hi: 100000 },
];
for (const p of loaded) {
    if (!p.s) continue;
    console.log(`   ${p.label}`);
    for (const b of BANDS) {
        const inBand = p.cards.filter((c) => c >= b.lo && c < b.hi);
        if (inBand.length < 25) { console.log(`     ${usd(b.price)} band  ${usd(b.lo)}-${usd(b.hi)}:  only ${inBand.length} units — too thin to float`); continue; }
        const s = stats(inBand, b.price);
        const flag = s.margin <= 0 ? "  ⚠️ LOSES MONEY" : s.margin / b.price < 0.08 ? "  ⚠️ thin" : "";
        console.log(`     ${usd(b.price)} band  ${usd(b.lo)}-${usd(b.hi)}:  ${String(s.n).padStart(4)} units`
            + `   EV(paid) ${usd(s.evPaid).padStart(8)}   margin ${usd(s.margin).padStart(7)}`
            + ` (${((s.margin / b.price) * 100).toFixed(1)}%)   1-open loss ${(s.loseChance * 100).toFixed(0)}%${flag}`);
    }
    console.log("");
}

console.log("══ 4. THE BANDS THAT ACTUALLY WORK ═════════════════════════════════════════════════════════\n");
console.log("   ⚠️ YOU CANNOT PRICE A PACK AT ITS FLOOR. A band floored at $15 averages ~$40, so a $15");
console.log("   pack guaranteeing $15+ pays out nearly three times what it takes. The floor is a PROMISE");
console.log("   and the ceiling is the DREAM; the price has to clear the AVERAGE, which sits between them.\n");
console.log("   So: solve for the ceiling that lands each price on a 15% margin.\n");

const TARGET_MARGIN = 0.15;
for (const p of loaded) {
    if (!p.s) continue;
    console.log(`   ${p.label}  (${p.s.n} units, max ${usd(p.s.max)})`);
    for (const price of [500, 1000, 1500]) {
        let best = null;
        for (const floor of [0, 100, 200, 300, 500, 800]) {
            // Largest ceiling whose banded EV still clears the margin — the ceiling IS the headline.
            let lo = floor + 100, hi = 50000, found = null;
            for (let i = 0; i < 24; i += 1) {
                const mid = Math.round((lo + hi) / 2);
                const inBand = p.cards.filter((c) => c >= floor && c <= mid);
                if (inBand.length < 25) { lo = mid; continue; }
                const evPaid = inBand.reduce((s, c) => s + payout(c), 0) / inBand.length;
                if (price - evPaid >= price * TARGET_MARGIN) { found = { mid, inBand, evPaid }; lo = mid; }
                else hi = mid;
            }
            if (found && (!best || found.mid > best.mid)) best = { ...found, floor };
        }
        if (!best) { console.log(`     ${usd(price)}:  no band clears 15% — pool too rich or too thin`); continue; }
        const s = stats(best.inBand, price);
        console.log(`     ${usd(price).padStart(6)} pack:  cards ${usd(best.floor)}–${usd(best.mid)}`
            + `   ${String(s.n).padStart(4)} units   EV ${usd(s.evPaid)}   margin ${usd(s.margin)} (${((s.margin / price) * 100).toFixed(0)}%)`
            + `   best pull ${usd(s.max)}`);
    }
    console.log("");
}
