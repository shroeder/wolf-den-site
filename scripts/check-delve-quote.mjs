// ── DOES THE RUN QUOTE THE NUMBER IT PAYS? ───────────────────────────────────────────────────────────────────
// Kaishiern: "The rewards gotten during a dungeon no longer match the end reward screen about what it actually
// gives you." He was right, and nothing was being stolen. Gold was minted ONCE, at the surface, in
// finishDelveRun — so every floor announced "+250 gold", the running tally said "Carrying 1,000", and the card
// paid 400. The halving that made the two numbers diverge shipped weeks after the delve did, which is why it
// "no longer" matched.
//
// The fix moved the mint into bank(), the one place gold enters a run, and hands the caller back what landed.
// This drives a REAL run through the REAL module against prod — not a replica of the arithmetic, which would
// pass while the shipped code was wrong — and checks the only thing a player can see:
//
//     the gold the floors announced  ==  the gold the card pays, minus the clear purse
//
// ⚠️ THIS ONE COSTS SOMETHING, so it is NOT in the build chain — run it deliberately. It plays a real dungeon
// on the STORE's own account against the production database: that consumes one of the store account's daily
// runs and credits it whatever the run pays. It never touches a member, and it refuses to start if a run is
// already in progress, because clearDelveRun would delete somebody's evening.
//
//   npm run check:delve-quote     (needs DATABASE_URL — see the accounting app's .env)
import { startDelve, delveAct, clearDelveRun, getDelveState } from "../src/lib/marketplace/delves.js";
import { DUNGEONS } from "../src/lib/marketplace/delve-catalog.js";
import { mint } from "../src/lib/marketplace/gold-rate.js";
import { db } from "../src/lib/db.js";

const who = await db.queryOne(`SELECT id, display_name FROM mkt_buyer WHERE display_name = 'The Wolf Den'`);
if (!who) { console.error("check:delve-quote — no owner row to run as."); process.exit(1); }

// Every number the run puts in front of a player, pulled back out of its own log.
const GOLD_IN_LINE = /\+([\d,]+) gold|Pocketed ([\d,]+) gold/g;
const announced = (log) => log.reduce((sum, e) => {
    let m; let n = 0;
    GOLD_IN_LINE.lastIndex = 0;
    while ((m = GOLD_IN_LINE.exec(e.text || "")) !== null) n += Number((m[1] || m[2]).replace(/,/g, ""));
    return sum + n;
}, 0);

// Never clear first. A run in progress is somebody's evening, and clearDelveRun deletes it outright — take
// whichever dungeon has not been entered today instead, and if that is none of them, say so and pass.
const live = await getDelveState(who.id);
if (live?.run && !live.run.over) { console.log("check:delve-quote — a run is already in progress; leaving it alone."); process.exit(0); }
let d = null; let start = null;
for (const cand of DUNGEONS) {
    const r = await startDelve(who.id, cand.id);
    if (r?.ok) { d = cand; start = r; break; }
}
if (!start) { console.log("check:delve-quote — every dungeon is spent for today; nothing to check."); process.exit(0); }

let card = null; let carried = null; let log = null;
// Walk it until it ends or we run out of patience. Fight, then take whatever the floor offers, then move on.
let state = start;
for (let step = 0; step < 200 && !state.run?.over; step += 1) {
    const r = state.run || {};
    // Strike a foe, answer a question that has been ASKED, step into a floor that has not, otherwise walk on.
    // "enter" only ever builds the offer — answering it takes any other action name plus the key, so a walker
    // that sends "enter" at a waiting floor rebuilds the same question forever and never leaves the floor.
    // Prefer an option that costs nothing, so the walk is not gated on the account's balance.
    const opts = r.awaiting?.options || [];
    const pick = opts.find((o) => !o.cost) || opts[0];
    const act = r.foe ? "strike" : (opts.length ? "choose" : (r.current?.done ? "onward" : "enter"));
    let next = await delveAct(who.id, act, pick?.key ?? null);
    if (!next?.ok) next = await delveAct(who.id, "onward");
    if (!next?.ok) break;
    // DELVE_TRACE=1 prints the walk floor by floor — the fastest way to see a walker stall.
    if (process.env.DELVE_TRACE) console.log(`  step ${step}: ${act} -> floor ${next.run?.floor} hp ${next.run?.hp} over ${next.run?.over} finished ${Boolean(next.finished)}`);
    // The wrap card is the whole point of the comparison, so the run is FINISHED rather than abandoned — the
    // card only exists once finishDelveRun has paid out. That is a real payout to the store's own account.
    if (next.finished) { card = next.finished; carried = { ...(state.run?.banked || {}) }; log = [...(state.run?.log || [])]; }
    state = next;
}

const said = announced(log || state.run?.log || []);
const carrying = (carried || state.run?.banked || {}).gold || 0;

if (!card) {
    console.log("check:delve-quote — the run never reached a wrap card; nothing to compare.");
    await clearDelveRun(who.id).catch(() => {});
    process.exit(0);
}

console.log(`
  ${d.name} — ${(log || []).length} log lines, ${card.cleared ? "cleared" : "fell on floor " + card.floor}`);
console.log(`  the floors announced    ${said.toLocaleString()} gold`);
console.log(`  the run said it carried ${carrying.toLocaleString()} gold`);
console.log(`  the card paid           ${card.gold.toLocaleString()} gold (purse ${card.bonusGold.toLocaleString()})
`);

await clearDelveRun(who.id).catch(() => {});

if (!said) { console.log("check:delve-quote — this run paid no gold; nothing to compare."); process.exit(0); }

const problems = [];
if (said !== carrying) problems.push(`the floors announced ${said} gold but the run carried ${carrying}`);
if (card.gold - card.bonusGold !== carrying) {
    problems.push(`the run carried ${carrying} gold and the card paid ${card.gold - card.bonusGold} of it (purse aside)`);
}
if (problems.length) {
    console.error("check:delve-quote — a player adding up the floors gets a different number from the card:");
    for (const p of problems) console.error(`  ✗ ${p}`);
    console.error("Gold is minted in bank(), once, as each floor pays. Do not mint the banked total again at the surface.");
    process.exit(1);
}
console.log(`check:delve-quote — the floors, the tally and the card all say ${carrying.toLocaleString()} gold, plus a ${card.bonusGold.toLocaleString()} purse.`);
