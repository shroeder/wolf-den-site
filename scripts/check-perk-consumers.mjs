// ── DOES ANYTHING ACTUALLY READ THESE? ───────────────────────────────────────────────────────────────────────
// check-ascension.mjs proves an effect changes what combinePetBonuses RETURNS. That is not the same as the
// effect doing anything: a perk key can be produced perfectly and land in a bucket no system ever opens, which
// is the Den's most common bug by a distance and the reason this file exists.
//
// So this walks the other half of the wire. For every ability key any pet can carry — its own or one grafted on
// by a stone — it looks for a CONSUMER in src/ that is not the file declaring it. Same for the proc outputs,
// which are named differently from the keys that produce them (`chain_strike` becomes `chainChance`), and that
// rename is exactly where a dead effect hides.
//
// Run:  node --experimental-loader ./scripts/lib/alias-loader.mjs scripts/check-perk-consumers.mjs
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { PET_PERKS } from "../src/lib/marketplace/pet-perks.js";
import { ASCENSION_EFFECTS } from "../src/lib/marketplace/pet-ascension-effects.js";

// The files that DECLARE perks. A mention here is not a consumer, it is the definition, and counting it would
// make this check pass by looking at itself.
const DECLARERS = new Set(["pet-perks.js", "pet-ascension-effects.js", "collectibles.js", "pet-stones.js"]);

// A key produces one of these, and the consumer reads the OUTPUT name rather than the key. Every one of these
// renames is a place an effect can be produced and never read.
const PROC_OUTPUT = {
    first_hit: ["firstHitMult"],
    erupt: ["eruptChance", "eruptMult"],
    chain_strike: ["chainChance"],
    execute: ["executePct"],
    onslaught: ["onslaughtPct"],
    first_blood: ["firstBloodPct"],
    extra_strike: ["extraStrikeChance", "extra_strike"],
};

function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        const s = statSync(p);
        if (s.isDirectory()) walk(p, out);
        else if (name.endsWith(".js")) out.push(p);
    }
    return out;
}

const files = walk("src").filter((p) => !DECLARERS.has(p.split(/[\\/]/).pop()));
const text = new Map(files.map((p) => [p, readFileSync(p, "utf8")]));

const keys = new Set();
for (const d of Object.values(PET_PERKS)) keys.add(d.key);
for (const pair of Object.values(ASCENSION_EFFECTS)) {
    for (const e of Object.values(pair)) if (e.kind === "graft" && e.key) keys.add(e.key);
}

let bad = 0;
const consumersOf = (key) => {
    const names = PROC_OUTPUT[key] || [key];
    const hits = [];
    for (const [p, src] of text) {
        if (names.some((n) => src.includes(n))) hits.push(p.split(/[\\/]/).pop());
    }
    return [...new Set(hits)];
};

console.log(`${keys.size} ability keys in play across ${Object.keys(PET_PERKS).length} pets.\n`);
for (const key of [...keys].sort()) {
    const hits = consumersOf(key);
    if (!hits.length) {
        bad += 1;
        console.log(`  DEAD  ${key.padEnd(16)} nothing outside the declaring files reads this`);
    }
}

console.log(bad
    ? `\n${bad} ability key(s) are produced and never read.`
    : "\nEvery ability a pet can carry is read by something.");
process.exit(bad ? 1 : 0);
