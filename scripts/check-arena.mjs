// ── ARENA CONSISTENCY CHECKS ─────────────────────────────────────────────────────────────────────────────────
// The arena states the same fact in three places on purpose, and a build cannot catch them disagreeing:
//
//   arena-kit.js       FREE_KINDS — the engine's rule, imported by arena.js's fightRound.
//   arena-classes.js   a literal `free:` on every tree ability, because that module is deliberately pure
//                      (no imports at all) so the tree screen never drags the item catalog in behind it.
//   sim-arena.mjs      its own copy of FREE_KINDS, because the simulator is a separate implementation — if
//                      its constants drift, every balance number it prints is a lie.
//
// A skill that is free in the engine and not free on its card teaches the player the wrong rule; a simulator
// that disagrees with the engine is worse, because it disagrees quietly. This asserts all three match.
//
// Usage: node scripts/check-arena.mjs
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const fail = [];

// arena-kit.js: export const FREE_KINDS = new Set(["ward", "riposte"]);
const kitSrc = read("src/lib/marketplace/arena-kit.js");
const kitMatch = kitSrc.match(/export const FREE_KINDS = new Set\(\[([^\]]*)\]\)/);
if (!kitMatch) {
    fail.push("arena-kit.js: could not find `export const FREE_KINDS = new Set([...])`");
} else {
    const kinds = [...kitMatch[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]).sort();

    // arena-classes.js: free: n.ability === "ward" || n.ability === "riposte",
    const clsSrc = read("src/lib/marketplace/arena-classes.js");
    const clsMatch = clsSrc.match(/free: ((?:n\.ability === "[a-z_]+"(?: \|\| )?)+),/);
    if (!clsMatch) {
        fail.push('arena-classes.js: could not find the `free: n.ability === "..."` literal');
    } else {
        const clsKinds = [...clsMatch[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]).sort();
        if (clsKinds.join(",") !== kinds.join(",")) {
            fail.push(`arena-classes.js free: [${clsKinds}] does not match arena-kit FREE_KINDS [${kinds}]`);
        }
    }

    // sim-arena.mjs: const FREE_KINDS = new Set(["ward", "riposte"]);
    const simSrc = read("scripts/sim-arena.mjs");
    const simMatch = simSrc.match(/const FREE_KINDS = new Set\(\[([^\]]*)\]\)/);
    if (!simMatch) {
        fail.push("sim-arena.mjs: could not find its FREE_KINDS copy");
    } else {
        const simKinds = [...simMatch[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]).sort();
        if (simKinds.join(",") !== kinds.join(",")) {
            fail.push(`sim-arena.mjs FREE_KINDS [${simKinds}] does not match arena-kit FREE_KINDS [${kinds}]`);
        }
    }

    // The engine must actually branch on the set rather than re-listing the kinds by hand.
    const engineSrc = read("src/lib/marketplace/arena.js");
    if (!/FREE_KINDS\.has\(ability\.kind\)/.test(engineSrc)) {
        fail.push("arena.js: fightRound no longer branches on FREE_KINDS.has(ability.kind)");
    }
    if (!fail.length) console.log(`arena: FREE_KINDS agree in all three places — [${kinds.join(", ")}]`);
}

if (fail.length) {
    for (const f of fail) console.error(`FAIL  ${f}`);
    process.exit(1);
}
