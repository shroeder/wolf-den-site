// ── CAN THE SET ACTUALLY BE WORN? ────────────────────────────────────────────────────────────────────────────
// A gear set pays for pieces you are WEARING. So a set holding two pieces that compete for the same slot has a
// top bonus nobody can ever reach — and nothing anywhere says so. Dragonlord's Aspect shipped like that: the
// Dragoncape was catalogued as a chest piece alongside Dragonplate, so four of its five pieces was the ceiling
// and its capstone was dead on arrival. It took a member pulling the cape and reading the set screen to find it
// (ValkyrieSylve: "it has 2 chest pieces of the 5 pieces. How are we able to equip all 5?").
//
// That is a data mistake a person cannot see and a type system cannot catch, so it gets a check.
//
// COLLECTION SETS ARE EXEMPT, and it matters that the exemption is explicit rather than an oversight: a
// collection pays for being OWNED and is never equipped, so ten pieces in one slot would be perfectly fine.
// See the collections contract in sets.js.
//
// It reads the two files as TEXT rather than importing them — sets.js pulls in `server-only`, which throws
// outside a Next runtime, and this needs to run as a bare script in CI and on a laptop.
//
// Run:  node scripts/check-sets.mjs     (or npm run check:sets)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const LIB = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "lib", "marketplace");
const items = readFileSync(join(LIB, "items.js"), "utf8");
const sets = readFileSync(join(LIB, "sets.js"), "utf8");

// id -> slot, straight off the catalog lines.
const slotOf = new Map();
for (const m of items.matchAll(/\{\s*id:\s*"([a-z0-9_]+)"[^\n]*?slot:\s*"([a-z_]+)"/g)) slotOf.set(m[1], m[2]);
if (slotOf.size < 100) {
    console.error(`check:sets — only parsed ${slotOf.size} items out of items.js; the catalog shape moved and this check is blind. Fix the parse before trusting a pass.`);
    process.exit(1);
}

// Ring is the one slot the game deliberately gives you twice, so two rings in a set is legal.
const CAPACITY = { ring: 2 };

let checked = 0;
let broken = 0;
let skipped = 0;

// Each set entry, from its `id:` to the closing brace of the entry.
for (const m of sets.matchAll(/id:\s*"([a-z0-9_]+)",([\s\S]*?)(?=\n    \},)/g)) {
    const [, id, body] = m;
    const nameMatch = body.match(/name:\s*"([^"]+)"/);
    const itemsMatch = body.match(/items:\s*\[([^\]]*)\]/);
    if (!itemsMatch) continue;

    if (/collection:\s*true/.test(body)) { skipped += 1; continue; }
    checked += 1;

    const name = nameMatch?.[1] || id;
    const ids = [...itemsMatch[1].matchAll(/"([a-z0-9_]+)"/g)].map((x) => x[1]);

    const counts = {};
    const missing = [];
    for (const itemId of ids) {
        const slot = slotOf.get(itemId);
        if (!slot) { missing.push(itemId); continue; }
        counts[slot] = (counts[slot] || 0) + 1;
    }

    // How many of this set's pieces can be on your body at one time.
    const wearable = Object.entries(counts).reduce((n, [slot, c]) => n + Math.min(c, CAPACITY[slot] || 1), 0);
    // The most demanding thing the set asks for. A capstone means the whole set.
    const needs = [...body.matchAll(/need:\s*(\d+)/g)].map((x) => Number(x[1]));
    const top = /capstone:/.test(body) ? ids.length : Math.max(0, ...needs);

    if (missing.length) {
        broken += 1;
        console.error(`\n${id} — ${name}: ${missing.length} piece(s) not in the catalog: ${missing.join(", ")}`);
    }
    if (top > wearable) {
        broken += 1;
        const over = Object.entries(counts).filter(([slot, c]) => c > (CAPACITY[slot] || 1));
        console.error(`\n${id} — ${name}: asks for ${top} pieces worn, but only ${wearable} can be worn at once.`);
        for (const [slot, c] of over) {
            const which = ids.filter((i) => slotOf.get(i) === slot);
            console.error(`    ${c} pieces compete for "${slot}": ${which.join(", ")}`);
        }
        console.error("    Give one of them a different slot, or lower what the set asks for.");
    }
}

if (broken) {
    console.error(`\ncheck:sets — ${broken} problem(s) across ${checked} worn sets. A set nobody can complete is worse than no set.`);
    process.exit(1);
}
console.log(`check:sets — ${checked} worn sets, every bonus reachable (${skipped} collection sets exempt: they pay for being owned).`);
