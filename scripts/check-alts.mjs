// ── WHO IS FEEDING WHOM? ─────────────────────────────────────────────────────────────────────────────────────
// On 2026-08-21 a member turned up with roughly seventy thousand gold that had come, in nine one-way trades,
// from an account created the day before the first of them. Nobody noticed for eleven days. This is the thing
// that would have noticed.
//
// WHAT IT IS ACTUALLY LOOKING FOR, and this matters because it is NOT "alt accounts":
//
//   A ONE-WAY FLOW OF GOLD BETWEEN TWO ACCOUNTS.
//
// Two people who genuinely trade with each other trade BOTH WAYS and roughly evenly over time — that is what
// trading is. A feeder relationship is lopsided by construction: everything goes one way, because the whole
// point is to concentrate two accounts' earnings into one. Lopsidedness is measurable, it does not require
// knowing who anybody is, and it is just as true of a friend gifting a friend as of a second account — which
// is correct, because both of those are things the Den might want to know about.
//
// IT DOES NOT ACCUSE ANYBODY OF ANYTHING. It cannot: the Den stores no device, no IP and no user agent, so
// there is no signal here that separates a second account from a brother on the same sofa. What it produces
// is a ranked list of pairs worth a human look, with the reasons stated, and the reasons are all things a
// person can weigh.
//
// ALL THREE CHANNELS, because closing one would just move the problem: direct trades, the auction house, and
// the Market. An alt can as easily overpay for a junk item at auction as hand the gold over.
//
// Run:  node scripts/check-alts.mjs            the last 30 days
//       DAYS=90 node scripts/check-alts.mjs    a wider window
//       MIN=5000 node scripts/check-alts.mjs   only flows above a size
import { db } from "../src/lib/db.js";

const DAYS = Number(process.env.DAYS || 30);
const MIN = Number(process.env.MIN || 3000);
const g = (n) => Math.round(Number(n) || 0).toLocaleString();

// ── EVERY WAY GOLD CAN GET FROM ONE PLAYER TO ANOTHER ────────────────────────────────────────────────────────
// One query per channel, all reduced to the same shape: from, to, gold, when. Adding a fourth channel later
// means adding it HERE and nothing else changes — which is the point of normalising them.
const flows = [];

// Direct trades. `offered_gold` moves from the poster to the accepter; `requested_gold` moves the other way.
const trades = await db.query(
    `SELECT from_buyer_id, to_buyer_id, offered_gold, requested_gold, resolved_at
       FROM mkt_trade_offer
      WHERE status = 'accepted' AND resolved_at > NOW() - ($1 || ' days')::interval`,
    [String(DAYS)],
).catch(() => []);
for (const t of trades) {
    if (t.offered_gold > 0) flows.push({ from: t.from_buyer_id, to: t.to_buyer_id, gold: Number(t.offered_gold), via: "trade", at: t.resolved_at });
    if (t.requested_gold > 0) flows.push({ from: t.to_buyer_id, to: t.from_buyer_id, gold: Number(t.requested_gold), via: "trade", at: t.resolved_at });
}

// The auction house. The buyer pays the seller; the fee goes to nobody, so it is not a flow.
const auctions = await db.query(
    `SELECT buyer_id, seller_id, price, sold_at FROM mkt_auction
      WHERE status = 'sold' AND buyer_id IS NOT NULL AND sold_at > NOW() - ($1 || ' days')::interval`,
    [String(DAYS)],
).catch(() => []);
for (const a of auctions) flows.push({ from: a.buyer_id, to: a.seller_id, gold: Number(a.price), via: "auction", at: a.sold_at });

// The Market.
const market = await db.query(
    `SELECT buyer_id, seller_id, qty, unit_gold, sold_at FROM mkt_market_listing
      WHERE sold_at IS NOT NULL AND buyer_id IS NOT NULL AND sold_at > NOW() - ($1 || ' days')::interval`,
    [String(DAYS)],
).catch(() => []);
for (const m of market) flows.push({ from: m.buyer_id, to: m.seller_id, gold: Number(m.qty || 1) * Number(m.unit_gold || 0), via: "market", at: m.sold_at });

// ── NET IT OUT, PAIR BY PAIR ─────────────────────────────────────────────────────────────────────────────────
// The pair key is order-independent so that A→B and B→A land in the same bucket. What is being measured is
// the IMBALANCE within a pair, not the volume — two players who move a fortune back and forth are trading.
const pairs = new Map();
for (const f of flows) {
    if (!f.from || !f.to || f.from === f.to || !(f.gold > 0)) continue;
    const [x, y] = [f.from, f.to].sort();
    const key = `${x}|${y}`;
    const p = pairs.get(key) || { x, y, xToY: 0, yToX: 0, n: 0, via: new Set(), first: f.at, last: f.at };
    if (f.from === x) p.xToY += f.gold; else p.yToX += f.gold;
    p.n += 1;
    p.via.add(f.via);
    if (f.at < p.first) p.first = f.at;
    if (f.at > p.last) p.last = f.at;
    pairs.set(key, p);
}

const ids = [...new Set([...pairs.values()].flatMap((p) => [p.x, p.y]))];
const who = new Map();
if (ids.length) {
    const rows = await db.query(
        `SELECT id, alias, display_name, email, created_at, xp FROM mkt_buyer WHERE id = ANY($1)`, [ids],
    ).catch(() => []);
    for (const r of rows) who.set(r.id, r);
}

// How much of everything an account has EVER earned went to one counterparty. A player who hands a single
// other account most of what they have ever made is the shape being looked for; the absolute number is not,
// because a rich player moving 20k is ordinary and a new one moving 20k is their whole life.
const earnedBy = new Map();
if (ids.length) {
    const rows = await db.query(
        `SELECT buyer_id, SUM(delta) FILTER (WHERE delta > 0)::bigint AS earned
           FROM mkt_coin_event WHERE buyer_id = ANY($1) GROUP BY buyer_id`, [ids],
    ).catch(() => []);
    for (const r of rows) earnedBy.set(r.buyer_id, Number(r.earned) || 0);
}

// ── AND HOW SUSPICIOUS IS THAT? ──────────────────────────────────────────────────────────────────────────────
// Reasons, not a score. Every one of these is a sentence a person can agree or disagree with, which is the
// only kind of output worth having when the next step is talking to a member about their account.
const findings = [];
for (const p of pairs.values()) {
    const net = Math.abs(p.xToY - p.yToX);
    const total = p.xToY + p.yToX;
    if (net < MIN) continue;

    const giverId = p.xToY > p.yToX ? p.x : p.y;
    const takerId = p.xToY > p.yToX ? p.y : p.x;
    const giver = who.get(giverId) || {};
    const taker = who.get(takerId) || {};
    const name = (b) => b.alias || b.display_name || "(unknown)";

    // ── THE SIGNAL THAT HAD TO BE REQUIRED, NOT COUNTED ──────────────────────────────────────────────────
    // The first version of this flagged nine pairs and eight of them were people selling things to the shop
    // owner at auction. That is not a bug in the query, it is a fact about auctions: gold goes one way
    // BECAUSE AN ITEM COMES BACK the other. "One-way" means nothing there.
    //
    // What does mean something, in every channel at once, is how much of everything an account has ever
    // earned ended up in one other account. Somebody who sold four items is at a few percent. Somebody
    // funnelling is at eighty-five, because that is what funnelling IS. So this one is a gate rather than a
    // reason: no share, no listing, however lopsided the flow looks.
    const earned = earnedBy.get(giverId) || 0;
    const share = earned > 0 ? net / earned : 0;
    if (share < 0.4) continue;

    const reasons = [`${name(giver)} has given away ${(share * 100).toFixed(0)}% of everything it has ever earned`];

    const lopsided = total > 0 ? net / total : 1;
    if (lopsided > 0.9) reasons.push(`${(lopsided * 100).toFixed(0)}% one-way — almost nothing came back`);

    // A young account feeding an old one. The reverse (an established player helping a newcomer) is common
    // and kind; this direction is the one that pays.
    const giverAge = giver.created_at ? (Date.now() - new Date(giver.created_at)) / 86400000 : null;
    const takerAge = taker.created_at ? (Date.now() - new Date(taker.created_at)) / 86400000 : null;
    if (giverAge != null && giverAge < 21) reasons.push(`the giver is ${giverAge.toFixed(0)} days old`);
    if (giverAge != null && takerAge != null && takerAge - giverAge > 14) {
        reasons.push(`the taker's account is ${(takerAge - giverAge).toFixed(0)} days older`);
    }

    // Shared email stem — weak on its own, and the reason this prints a REASON rather than a verdict: two
    // people in a family share a surname, and that is not evidence of anything.
    const stem = (e) => String(e || "").toLowerCase().replace(/@.*/, "").replace(/[^a-z]/g, "");
    const a = stem(giver.email), b = stem(taker.email);
    if (a && b && (a.includes(b) || b.includes(a) || (a.length > 4 && b.length > 4 && (a.slice(-5) === b.slice(-5) || a.slice(0, 5) === b.slice(0, 5))))) {
        reasons.push(`similar email stems (${a} / ${b}) — could equally be a household`);
    }

    findings.push({ p, giver, taker, giverId, takerId, net, total, reasons, name, share });
}

findings.sort((x, y) => y.net - x.net);

console.log(`Gold flowing between players, last ${DAYS} days, net imbalance over ${g(MIN)}.`);
console.log(`${flows.length} transfers across ${pairs.size} pairs; ${findings.length} pair(s) worth a look.\n`);

for (const f of findings) {
    console.log(`${f.name(f.giver)}  ──${g(f.net)} gold──▶  ${f.name(f.taker)}`);
    console.log(`  ${f.p.n} transfers via ${[...f.p.via].join(", ")}, ${new Date(f.p.first).toISOString().slice(0, 10)} → ${new Date(f.p.last).toISOString().slice(0, 10)}`);
    console.log(`  ${g(f.total)} moved in total, ${g(f.net)} of it net`);
    for (const r of f.reasons) console.log(`    · ${r}`);
    console.log(`  ids: ${f.giverId} → ${f.takerId}`);
    console.log("");
}

if (!findings.length) console.log("Nothing lopsided enough to look at.");
else {
    console.log("These are REASONS, not verdicts. The Den stores no device, no IP and no user agent, so");
    console.log("nothing here can tell a second account from a brother on the same sofa — that part is a");
    console.log("conversation, not a query.");
}
