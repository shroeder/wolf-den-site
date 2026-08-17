// ── DOES THE BALANCE SIMULATOR STILL SIMULATE THIS GAME? ─────────────────────────────────────────────────────
// scripts/sim-arena.mjs is a SEPARATE implementation of the engine — deliberately, because arena.js is
// server-only and reaches for the database on every path. Its own header says the quiet part out loud:
//
//     "What matters is that the numbers below are copied from it exactly — if they drift, this lies."
//
// Nothing enforced that. A copied constant is a second, wrong game the moment the first one is retuned, and
// the simulator is what balance decisions are argued from — so a drifted sim does not fail loudly, it just
// produces confident numbers about a game nobody is playing.
//
// This compares every constant the simulator declares against the engine's own value and fails on any
// mismatch. It cannot check the SHAPE of the maths (that a formula still reads the same terms) — for that
// there is no substitute for the engine being importable, which is its own piece of work.
//
// Run:  node scripts/check-sim-drift.mjs   (or npm run check:sim)
import { readFileSync } from "node:fs";

const sim = readFileSync("scripts/sim-arena.mjs", "utf8");
const engine = ["arena-kit.js", "arena.js", "arena-classes.js", "arena-npc.js"]
    .map((f) => {
        try { return readFileSync(`src/lib/marketplace/${f}`, "utf8"); } catch { return ""; }
    })
    .join("\n");

// Only the block the simulator itself labels as copied. Anything it derives on its own is its own business.
const header = sim.split("// ── ")[2] || sim.slice(0, 4000);
const declared = new Map();
for (const m of header.matchAll(/\b([A-Z][A-Z0-9_]{2,})\s*=\s*([0-9.]+)/g)) {
    if (!declared.has(m[1])) declared.set(m[1], m[2]);
}

const drifted = [];
const gone = [];
let matched = 0;
for (const [name, simValue] of declared) {
    const m = engine.match(new RegExp(`const\\s+${name}\\s*=\\s*([0-9.]+)`));
    if (!m) { gone.push(name); continue; }
    if (Number(m[1]) !== Number(simValue)) drifted.push({ constant: name, simulator: simValue, engine: m[1] });
    else matched += 1;
}

console.log(`sim-arena.mjs declares ${declared.size} copied constants: ${matched} still match, ${drifted.length} drifted, ${gone.length} no longer in the engine.\n`);
if (drifted.length) console.table(drifted);
if (gone.length) console.log(`not found in the engine (renamed, moved, or the mechanic was replaced):\n  ${gone.join(", ")}\n`);
if (drifted.length || gone.length) {
    console.log("The simulator is arguing about a different game. Fix the constants, or retire it.");
    process.exit(1);
}
console.log("Every copied constant still matches the engine.");
