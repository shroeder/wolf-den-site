// ── THE ACT LADDERS HOLD TO THEIR OWN RULES ─────────────────────────────────────────────────────────────────
// Act quests count rows in mkt_activity_event, which means a quest whose `event` is misspelled does not error
// — it sits at 0/20 forever and the ladder simply never advances. That is the worst kind of bug: silent,
// and indistinguishable from "the player has not done it yet".
//
//   npm run check:acts
import { readFileSync } from "node:fs";
import { register } from "node:module";
register("./lib/app-loader.mjs", import.meta.url);
const pick = (f, k) => readFileSync(f, "utf8").split(/\r?\n/).find((l) => l.startsWith(`${k}=`)).slice(k.length + 1).trim();
process.env.DATABASE_URL = pick("C:/Users/Luke/Projects/accounting_app/.env", "DATABASE_URL");

const { db } = await import("@/lib/db.js");
const { ACTS, QUEST_BY_KEY, PERK_SYSTEM, actProgress } = await import("@/lib/marketplace/acts.js");
const { TOWNS } = await import("@/lib/marketplace/towns.js");

const fail = [];
const ok = (cond, msg) => { if (!cond) fail.push(msg); };

// 1. every event a quest counts must be one the game actually writes
const live = new Set((await db.query(`SELECT DISTINCT event FROM mkt_activity_event`)).map((r) => r.event));
const used = [...new Set(ACTS.flatMap((a) => a.quests.map((q) => q.event)))];
const dead = used.filter((e) => !live.has(e));
ok(dead.length === 0, `${dead.length} quest event(s) are never written by the game: ${dead.join(", ")} — the rung would sit at 0 forever`);

// 2. every act maps to a real town, and every town to at most one act
for (const a of ACTS) ok(TOWNS.some((t) => t.id === a.town), `act ${a.n} points at town "${a.town}", which does not exist`);
const townSeen = new Set();
for (const a of ACTS) { ok(!townSeen.has(a.town), `town "${a.town}" has two acts`); townSeen.add(a.town); }

// 3. perks land in real tool slots
for (const q of Object.values(QUEST_BY_KEY)) {
    if (!q.perk) continue;
    ok(PERK_SYSTEM[q.perk.slot], `${q.key} grants a perk to "${q.perk.slot}", which is not a tool slot`);
    ok(q.perk.pct > 0 && q.perk.pct <= 8, `${q.key} grants ${q.perk.pct}% — outside the 1-8 band these are balanced in`);
}

// 4. keys are unique, and every ladder actually finishes
const keys = ACTS.flatMap((a) => a.quests.map((q) => q.key));
ok(new Set(keys).size === keys.length, "two quests share a key — the claim row is keyed on it, so one would block the other");
for (const a of ACTS) {
    let claimed = [];
    for (let i = 0; i < a.quests.length + 2; i += 1) {
        const { next, done } = actProgress(a, claimed);
        if (done) break;
        ok(next, `act ${a.n} stalls: no rung is open after ${claimed.length} claims`);
        if (!next) break;
        claimed.push(next.key);
    }
    ok(actProgress(a, claimed).done, `act ${a.n} never completes`);
    // exactly one open rung at a time is the whole teaching order
    const openAtStart = actProgress(a, []).rungs.filter((r) => r.open && !r.claimed).length;
    ok(openAtStart === 1, `act ${a.n} opens with ${openAtStart} rungs available — it should be one at a time`);
}

const perkTotal = {};
for (const q of Object.values(QUEST_BY_KEY)) if (q.perk) perkTotal[q.perk.slot] = (perkTotal[q.perk.slot] || 0) + q.perk.pct;

console.log("── THE ACT BOARDS ───────────────────────────────────────────────────────────");
console.log(`  ladders         ${ACTS.length} acts, ${keys.length} rungs, one open at a time`);
console.log(`  events          ${used.length} distinct, all written by the game`);
console.log(`  perks at 100%   ${Object.entries(perkTotal).map(([s, p]) => `${s} +${p}%`).join(", ")}`);
if (fail.length) {
    console.log(`\n── ${fail.length} PROBLEM(S) ──────────────────────────────────────────────────`);
    for (const f of fail) console.log("  ·", f);
    process.exit(1);
}
console.log("\nOK — every rung counts a real event, lands in a real slot, and every ladder finishes.");
