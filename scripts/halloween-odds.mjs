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
const deco = table(SRC, "HW_DECO_CHANCE");
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
console.log("  chest              exclusive gear      pet     decoration   candy");
console.log("  " + "-".repeat(70));
const rows = [];
for (const t of HALLOWEEN_CHESTS) {
    // First match wins, so each rung's real share is what is left after the ones above it.
    const g = gear[t] || 0;
    const p = (1 - g) * (pet[t] || 0);
    const d = (1 - g - p) * (deco[t] || 0);
    const c = 1 - g - p - d;
    rows.push({ t, g, p, d, c });
    console.log(`  ${t.padEnd(18)} ${(g * 100).toFixed(1).padStart(6)}%        ${(p * 100).toFixed(1).padStart(5)}%    ${(d * 100).toFixed(1).padStart(6)}%   ${(c * 100).toFixed(1).padStart(5)}%`);
}

// ── THE TWO THINGS THAT MUST BE TRUE ─────────────────────────────────────────────────────────────────────
let bad = 0;
console.log("\n");
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

// ── THE SETS ─────────────────────────────────────────────────────────────────────────────────────────────
// ⚠️ CHECKED HERE BECAUSE NOTHING ELSE CHECKS IT. Two pieces of one set on the same slot is a set nobody can
// finish on a body, and the gate that used to catch that is gone. It is cheap to assert and impossible to
// spot by reading a list of fifteen ids.
// ⚠️ READ FROM THE MODULES, NOT SCRAPED OUT OF THE SOURCE. The first cut matched `id: "...", name: "..."`
// with a regex and reported all fifteen pieces as orphans the moment the sets gained `collection: true` —
// the field order changed and the pattern stopped matching, so a passing check turned into a false alarm
// about a thing that was fine. The rates above have to be scraped (they are local consts), but ITEM_SETS and
// ITEMS are exported, and an exported value is never worth pattern-matching for.
const S = await import("../src/lib/marketplace/sets.js");
const I = await import("../src/lib/marketplace/items.js");
const slotOf = (id) => I.ITEMS.find((x) => x.id === id)?.slot || null;

console.log("\n  THE SETS\n");
const hwSets = S.ITEM_SETS.filter((x) => x.id.startsWith("hw_"));
const inSets = new Set();
for (const set of hwSets) {
    set.items.forEach((id) => inSets.add(id));
    const slots = set.items.map(slotOf);
    const dupes = slots.filter((x, i) => slots.indexOf(x) !== i);
    const unknown = set.items.filter((id) => !slotOf(id));
    console.log(`  ${set.name.padEnd(20)} ${set.items.length} pieces  ${String(set.feature || "combat").padEnd(7)} ${slots.join(", ")}`);
    if (unknown.length) { console.log(`     ⚠️  not in ITEMS: ${unknown.join(", ")}`); bad += 1; }
    if (dupes.length) { console.log(`     ⚠️  TWO PIECES ON THE SAME SLOT (${dupes.join(", ")}) — this set cannot be worn complete`); bad += 1; }
}
// Every Halloween piece should belong to a set. One that does not is a piece with no chase attached to it.
const allHw = I.ITEMS.filter(I.isHalloweenItem).map((x) => x.id);
const orphans = allHw.filter((id) => !inSets.has(id));
const setCount = hwSets.length;
console.log(`\n  ${allHw.length} pieces across ${setCount} sets`
    + (orphans.length ? `  ⚠️  ${orphans.length} in no set: ${orphans.join(", ")}` : "  — every piece belongs to one"));
if (orphans.length) bad += 1;

// ── AND NONE OF IT TOUCHES A BOSS FIGHT ──────────────────────────────────────────────────────────────────
// Luke: "Don't affect boss fights in any meaningful way." The three sets are collection sets, so the promise
// is structural rather than a matter of tuning — but "structural" is what everyone says right up until a
// capstone key gets added back. So it is measured: every piece equipped, a full set of all three, a crit, at
// every boss-HP fraction any capstone in the game keys off. The answer has to be exactly x1.
const allPieces = hwSets.flatMap((x) => x.items);
console.log("\n  BOSS IMPACT\n");
for (const frac of [1.0, 0.8, 0.5, 0.2, 0.1]) {
    const r = S.setCombatMult(allPieces, { crit: true, hitIndex: 0, bossHpFrac: frac,
        bossMaxHp: 9_000_000, hittersToday: 12, bossWeakness: "shadow" });
    const clean = Math.abs(r.mult - 1) < 1e-9;
    if (!clean) { console.log(`  ⚠️  boss at ${Math.round(frac * 100)}% HP → x${r.mult.toFixed(3)} (${(r.fired || []).join(", ")})`); bad += 1; }
}
const withStats = hwSets.filter((x) => (x.bonuses || []).some((b) => b.stats));
if (withStats.length) { console.log(`  ⚠️  ${withStats.map((x) => x.name).join(", ")} grant raw combat stats`); bad += 1; }
if (!withStats.length) console.log("  All three are collection sets — x1.000 at every boss HP fraction, with every piece equipped and a crit.");

// ── AND WHAT THAT MEANS IN CHESTS ────────────────────────────────────────────────────────────────────────
// ⚠️ THE UNIT IS ONE SET, NOT THE WHOLE CATALOGUE. Nobody chases fifteen pieces; they chase the build they
// want. And the draw is over every un-owned Halloween piece, so the chests needed for five SPECIFIC ones
// scale with the size of the whole pool — which is exactly the thing that changed when the catalogue went
// from eight pieces to fifteen, and exactly the thing that would otherwise be noticed in November.
console.log("\n  Roughly, to finish ONE five-piece set from a given chest alone:");
for (const r of rows) console.log(`    ${r.t.padEnd(18)} ${Math.round(allHw.length / r.g)} chests`);
console.log(`\n  ${bad ? `${bad} problem(s).` : "No problems."}\n`);
