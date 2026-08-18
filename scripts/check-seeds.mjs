// ── DOES EVERY SEED SOURCE ACTUALLY DROP SEEDS? ──────────────────────────────────────────────────────────────
// The seed table once declared ten sources with tuned odds and NINE of them had no caller anywhere: the wheel,
// the boss, all three chest tiers, digs, raids, harvests. Four other callers asked for source names the table
// never declared and silently returned null every time — so a member could fish, win a ship battle, rate a
// farm or run a companion perk and be paid nothing while the config insisted otherwise.
//
// Both halves are the same bug wearing different clothes, and this fails on either:
//
//   DECLARED, NEVER CALLED   a band nobody draws from. Tuned odds that are decoration.
//   CALLED, NEVER DECLARED   a feature asking for a source that does not exist. Pays null, silently.
//
// It reads the call sites as text, so a band passed through a variable is resolved by looking at the few lines
// above the call for the string literals it could hold. That is enough for the shapes actually used here (a
// literal, or a tier ternary) and it fails LOUD rather than quiet if it cannot resolve one.
//
// Run:  node scripts/check-seeds.mjs   (or npm run check:seeds)
import { readFileSync, readdirSync } from "node:fs";

const LIB = "src/lib/marketplace";
const crops = readFileSync(`${LIB}/farm-crops.js`, "utf8");

function declared(name) {
    const block = crops.match(new RegExp(name + " = \\{([\\s\\S]*?)\\n\\};"));
    if (!block) {
        console.error(`check:seeds — could not find ${name}; the table moved and this check is blind.`);
        process.exit(1);
    }
    return [...block[1].matchAll(/^\s{4}([a-z_]+):/gm)].map((m) => m[1]);
}

const bands = declared("SEED_BANDS");
const trickle = declared("SEED_TRICKLE");
const known = new Set([...bands, ...trickle]);

// Every call to the two seed entry points, with the source it asks for.
const called = new Map();
const unresolved = [];
// farm-crops.js is scanned too: the trickle's own callers live in it (harvestPlot finds a seed, a companion
// perk drops one), and excluding the file reported both as dead config.
for (const file of readdirSync(LIB).filter((f) => f.endsWith(".js"))) {
    const text = readFileSync(`${LIB}/${file}`, "utf8");
    const lines = text.split("\n");
    lines.forEach((line, i) => {
        const call = line.match(/(?:dropSeedFrom|grantSeedFromBand)\(\s*[^,]+,\s*([^)]+)\)/);
        if (call) {
            const arg = call[1].trim();
            const literal = arg.match(/^"([a-z_]+)"$/);
            if (literal) { called.set(literal[1], file); return; }
            // A variable or a ternary: take every source-shaped string from the call line and the three above
            // it, which is where `const band = tier === "wooden" ? "chest_wooden" : ...` lives.
            const near = lines.slice(Math.max(0, i - 3), i + 1).join(" ");
            const found = [...near.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]).filter((x) => known.has(x));
            if (found.length) found.forEach((f) => called.set(f, file));
            // farm-crops.js DEFINES both functions, so its own `(buyerId, source)` and `(buyerId, cfg.band)`
            // are the implementation rather than a feature asking for a source. Its real callers pass string
            // literals and are caught above, everywhere.
            else if (file !== "farm-crops.js") unresolved.push(`${file}:${i + 1} — ${arg}`);
        }
        // A reward-table row naming its band: the wheel's wedges, the Armoury's crate rows.
        for (const m of line.matchAll(/band:\s*"([a-z_]+)"/g)) called.set(m[1], file);
    });
}

const deadConfig = [...known].filter((b) => !called.has(b));
const undeclared = [...called.keys()].filter((c) => !known.has(c));

console.log(`${bands.length} bands · ${trickle.length} trickle sources · ${called.size} wired.\n`);
if (deadConfig.length) console.log(`DECLARED, NEVER CALLED (${deadConfig.length}): ${deadConfig.join(", ")}`);
if (undeclared.length) console.log(`CALLED, NEVER DECLARED (${undeclared.length}): ${undeclared.join(", ")} — these return null every time.`);
if (unresolved.length) console.log(`COULD NOT RESOLVE (${unresolved.length}):\n  ${unresolved.join("\n  ")}`);
if (deadConfig.length || undeclared.length || unresolved.length) process.exit(1);

for (const [source, file] of [...called].sort()) console.log(`  ${source.padEnd(16)} ${file}`);
console.log("\nEvery seed source is declared and drawn, and every caller has a band.");
