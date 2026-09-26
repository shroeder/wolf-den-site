// ── WHAT THE HALLOWEEN EVENT ACTUALLY PAYS ───────────────────────────────────────────────────────────────
// The companion to chest-odds.mjs, and it exists for the same reason: the event is two compounding curves
// stacked on each other — a substitution rate at the grant door and a three-rung chain at the open — and
// nobody can hold both in their head. Run it before touching either rate.
//
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/halloween-odds.mjs
//
// It reads the tables out of the source rather than restating them, so it cannot drift from what ships.
import { readFileSync } from "node:fs";

import { HALLOWEEN_SUBSTITUTION, HALLOWEEN_CHESTS, HALLOWEEN_PUBLIC } from "../src/lib/marketplace/halloween.js";

const SRC = readFileSync("src/lib/marketplace/chests.js", "utf8");
const HW = readFileSync("src/lib/marketplace/halloween.js", "utf8");

const table = (src, name) => {
    const i = src.indexOf(`const ${name} = `);
    if (i < 0) throw new Error(`no table called ${name}`);
    const open = src.indexOf("{", i);
    let depth = 0, end = open;
    for (let k = open; k < src.length; k += 1) {
        if (src[k] === "{") depth += 1;
        if (src[k] === "}") { depth -= 1; if (!depth) { end = k; break; } }
    }
    // eslint-disable-next-line no-eval
    return eval(`(${src.slice(open, end + 1)})`);
};

const gear = table(SRC, "HW_GEAR_CHANCE");
const pet = table(SRC, "HW_PET_CHANCE");
const ghostShare = Number(HW.match(/const GHOST_SHARE = ([\d.]+);/)?.[1]);
const sub = table(HW, "SUBSTITUTE");

console.log(`\n  HALLOWEEN_PUBLIC = ${HALLOWEEN_PUBLIC}${HALLOWEEN_PUBLIC ? "" : "  (the event is OFF — none of this is reachable yet)"}\n`);

// ── THE FAUCET ───────────────────────────────────────────────────────────────────────────────────────────
console.log("  THE FAUCET — what an ordinary chest becomes on its way in\n");
console.log(`  substitution rate ${(HALLOWEEN_SUBSTITUTION * 100).toFixed(0)}% of sub-mythic chests, of which ${(ghostShare * 100).toFixed(0)}% become the ghost chest\n`);
console.log("  from        stays ordinary   becomes           ghost instead");
console.log("  " + "-".repeat(70));
for (const [from, to] of Object.entries(sub)) {
    const swapped = HALLOWEEN_SUBSTITUTION;
    console.log(`  ${from.padEnd(11)} ${((1 - swapped) * 100).toFixed(1).padStart(6)}%        `
        + `${to.padEnd(14)} ${(swapped * (1 - ghostShare) * 100).toFixed(1).padStart(5)}%   ${(swapped * ghostShare * 100).toFixed(1).padStart(5)}%`);
}
console.log(`  mythic+     100.0%        (never substituted — see the note in halloween.js)`);

// ── THE CHAIN ────────────────────────────────────────────────────────────────────────────────────────────
// First match wins, so each rung's real share is what is left after the ones above it.
console.log("\n\n  THE CHAIN — what is inside one, first match wins\n");
console.log("  chest              exclusive gear      pet      candy");
console.log("  " + "-".repeat(70));
const rows = [];
for (const t of HALLOWEEN_CHESTS) {
    const g = gear[t] || 0;
    const p = (1 - g) * (pet[t] || 0);
    const c = 1 - g - p;
    rows.push({ t, g, p, c });
    console.log(`  ${t.padEnd(18)} ${(g * 100).toFixed(1).padStart(6)}%        ${(p * 100).toFixed(1).padStart(5)}%    ${(c * 100).toFixed(1).padStart(5)}%`);
}

// ── THE TWO THINGS THAT MUST BE TRUE ─────────────────────────────────────────────────────────────────────
console.log("\n");
let bad = 0;
// A ladder has to climb, or the four chests are four names for one object.
for (let i = 1; i < rows.length; i += 1) {
    if (rows[i].g <= rows[i - 1].g || rows[i].p <= rows[i - 1].p) {
        console.log(`  ⚠️  ${rows[i].t} is not better than ${rows[i - 1].t} — the ladder does not climb`);
        bad += 1;
    }
}
if (!bad) console.log(`  The ladder climbs: gear ${(rows[0].g * 100).toFixed(0)}% → ${(rows.at(-1).g * 100).toFixed(0)}%, pet ${(rows[0].p * 100).toFixed(1)}% → ${(rows.at(-1).p * 100).toFixed(1)}%.`);

// Candy is what a member gets MOST times. If it ever fell under half, the commonest outcome would stop being
// the one the chest is written around and every rate above would need re-reading.
const thinnest = rows.reduce((a, b) => (a.c < b.c ? a : b));
if (thinnest.c < 0.5) { console.log(`  ⚠️  ${thinnest.t} pays candy only ${(thinnest.c * 100).toFixed(0)}% of the time`); bad += 1; }
else console.log(`  Candy stays the common outcome everywhere — thinnest is ${thinnest.t} at ${(thinnest.c * 100).toFixed(0)}%.`);

// ── AND WHAT THAT MEANS IN CHESTS ────────────────────────────────────────────────────────────────────────
// The number that actually matters to a member: how many ordinary chests to a full eight-piece set.
console.log("\n  Roughly, to finish the eight-piece set from a given chest alone:");
for (const r of rows) console.log(`    ${r.t.padEnd(18)} ${Math.round(8 / r.g)} chests`);
console.log(`\n  ${bad ? `${bad} problem(s).` : "No problems."}\n`);
