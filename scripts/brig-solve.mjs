// ── CAN THE BRIG BE BEATEN, AND BY WHOM ──────────────────────────────────────────────────────────────
// Exhaustive search over every interrogation, per disposition, per star band, with and without a second
// captive in the brig. Prints the CHEAPEST winning line and whether one exists at all.
//   node scripts/brig-solve.mjs
import { DISPOSITION_IDS, TACTIC_IDS, TACTICS, MAX_STARS, willFor, NERVE, NERVE_COST,
         outcomeOf, newCaptive, interrogate } from "@/lib/marketplace/captains.js";

const DULL = { crack: "read", read: "harden", harden: "harden" };
// Cheapest line to break him: Dijkstra over (will, lastTactic) with nerve as the cost.
function best(disposition, stars, others) {
    const start = { will: willFor(stars), last: null, nerve: NERVE, line: [] };
    let frontier = [start], seen = new Map(), win = null;
    while (frontier.length) {
        const next = [];
        for (const s of frontier) {
            for (const t of TACTIC_IDS) {
                if (TACTICS[t].needsOther && others < 1) continue;
                const raw = outcomeOf(disposition, t);
                const out = s.last === t ? DULL[raw] : raw;
                const nerve = s.nerve - (NERVE_COST[out] || 1);
                if (nerve < 0) continue;
                const will = out === "crack" ? s.will - 1 : s.will;
                const line = [...s.line, t];
                if (will <= 0) { if (!win || line.length < win.length) win = line; continue; }
                const key = `${will}:${t}`;
                if ((seen.get(key) ?? -1) >= nerve) continue;
                seen.set(key, nerve);
                next.push({ will, last: t, nerve, line });
            }
        }
        frontier = next;
    }
    return win;
}
console.log("cheapest winning line — ALONE in the brig / with ANOTHER captive\n");
for (const d of DISPOSITION_IDS) {
    for (let stars = 1; stars <= MAX_STARS; stars++) {
        const solo = best(d, stars, 0), pair = best(d, stars, 1);
        const f = (w) => w ? `${String(w.length).padStart(2)} moves  ${w.join(" ")}` : "IMPOSSIBLE";
        console.log(`${d.padEnd(11)} ${stars}★ will ${willFor(stars)} | alone: ${f(solo).padEnd(46)} | +1: ${f(pair)}`);
    }
    console.log("");
}
// And how a player who does NOT know the table fares: random legal moves.
let tot = {}, n = 4000;
for (const d of DISPOSITION_IDS) for (let stars = 1; stars <= MAX_STARS; stars++) {
    let won = 0;
    for (let i = 0; i < n; i++) {
        let c = newCaptive({ rank: stars * 8, art: "x", name: "x", stars, disposition: d, tell: "" });
        while (c.status === "held") {
            const legal = TACTIC_IDS.filter((t) => !TACTICS[t].needsOther || true);
            const r = interrogate(c, legal[Math.floor(Math.random() * legal.length)], 1);
            if (r.error) break;
            c = r.captive;
        }
        if (c.status === "broken") won++;
    }
    tot[stars] = (tot[stars] || 0) + won / n / DISPOSITION_IDS.length;
}
console.log("random play (knows nothing), with a populated brig:");
for (const s of Object.keys(tot)) console.log(`  ${s}★  ${(tot[s] * 100).toFixed(0)}% broken`);
