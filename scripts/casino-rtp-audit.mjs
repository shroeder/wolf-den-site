// ── WHAT THE FLOOR ACTUALLY RETURNS, FROM THE LEDGER ─────────────────────────────────────────────────────
// Luke: "the win rates will need a slight nerf. But bit crazy your simulation is aggressive. I think most
// people dont win that much but u can audit history to see if your simulation matches telemetry."
//
// He was right to ask. The simulation in check:slots validates the PAYTABLE — what the maths says a machine
// returns over infinite play — and the tables are tuned to RTP_TARGET 0.88. This reads what the floor has
// actually done, and the two do not agree.
//
// ⚠️ SAME CURRENCY ON BOTH SIDES, WHICH IS THE WHOLE POINT. The floor is staked in CHIPS and pays CHIPS, both
// through moveChips into mkt_chip_event. An earlier version of this read the bets out of mkt_coin_event (gold)
// and the wins out of the chip ledger and produced "7.7x", which is not a return, it is two quantities
// divided. casino-report.js has the same warning at the top of it and it was still easy to do.
//
//   node scripts/casino-rtp-audit.mjs
import fs from "node:fs";
import { neon } from "@neondatabase/serverless";

const env = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/.env", "utf8");
const sql = neon(env.match(/^DATABASE_URL=["']?([^"'\r\n]+)/m)[1]);
// The owner is not a customer of this casino, he is the person testing it — see casino-report.js.
const OWNER = (await sql`SELECT id FROM mkt_buyer WHERE display_name='The Wolf Den'`)[0].id;
const TARGET = 0.88;

const PAIRS = [
    ["slot (3-reel)", "casino_slot_bet", ["casino_slot_win"]],
    ["slot5", "casino_slot5_bet", ["slot5"]],
    ["bingo", "casino_bingo_bet", ["casino_bingo_win"]],
    ["blackjack", "casino_blackjack_bet", ["casino_blackjack_win"]],
    ["keno", "casino_keno_bet", ["casino_keno_win"]],
];

console.log("machine         chips in     chips out      RTP     vs the 88% the tables are tuned to");
let ti = 0; let to = 0;
for (const [name, bet, wins] of PAIRS) {
    const i = Number((await sql`SELECT COALESCE(-SUM(delta),0)::bigint d FROM mkt_chip_event
                                 WHERE buyer_id <> ${OWNER} AND reason = ${bet} AND delta < 0`)[0].d);
    const o = Number((await sql`SELECT COALESCE(SUM(delta),0)::bigint d FROM mkt_chip_event
                                 WHERE buyer_id <> ${OWNER} AND reason = ANY(${wins}) AND delta > 0`)[0].d);
    ti += i; to += o;
    const rtp = i ? o / i : 0;
    const gap = i ? `${rtp > TARGET ? "+" : ""}${((rtp - TARGET) * 100).toFixed(1)} pts` : "—";
    console.log(`${name.padEnd(15)} ${i.toLocaleString().padStart(10)} ${o.toLocaleString().padStart(13)}   ${i ? (rtp * 100).toFixed(1) + "%" : "—"}   ${gap}`);
}
console.log(`${"TOTAL".padEnd(15)} ${ti.toLocaleString().padStart(10)} ${to.toLocaleString().padStart(13)}   ${((to / ti) * 100).toFixed(1)}%`);

console.log("\n── EVERY FAUCET AND DRAIN, SO NOTHING IS MISSED ─────────────────────────────");
const all = await sql`SELECT reason, COUNT(*)::int n, SUM(delta)::bigint d FROM mkt_chip_event
                       WHERE buyer_id <> ${OWNER} GROUP BY reason ORDER BY ABS(SUM(delta)) DESC LIMIT 20`;
for (const r of all) console.log(`  ${String(r.reason).padEnd(26)} ${String(r.n).padStart(5)}  ${Number(r.d).toLocaleString().padStart(12)}`);

const d = (await sql`SELECT MIN(created_at) a, MAX(created_at) b, COUNT(*)::int n FROM mkt_chip_event
                      WHERE reason = 'casino_chips_daily' AND buyer_id <> ${OWNER}`)[0];
const days = Math.max(1, Math.round((new Date(d.b) - new Date(d.a)) / 86400000));
console.log(`\nthe free 1,000 a day: ${d.n} claims over ${days} days — ${Math.round(d.n / days * 1000).toLocaleString()} chips a day minted for nothing.`);
