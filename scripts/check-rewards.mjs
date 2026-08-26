// ── DOES EVERYTHING YOU CAN EARN ACTUALLY GIVE YOU SOMETHING? ────────────────────────────────────────────────
// Luke: "Badges should always give something. Same with pets."
//
// Both had holes and both holes were silent, because the fallback in each case LOOKS like a value:
//
//   · A pet with no PET_PERKS entry gets `{ name: "Companion", key: activeStat }` — a real object, a real
//     number, and a signature ability called Companion. The casino's five exclusive pets sat like that, three
//     of them sharing one key, and nothing anywhere said so.
//   · A badge with no BADGE_BONUSES entry simply has none. All eight casino badges were like that — the only
//     family of 275 that paid nothing for being earned.
//
// Neither is the kind of mistake a person finds by reading the file. So it gets a check.
//
// Run:  npm run check:rewards
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { COLLECTIBLES } from "../src/lib/marketplace/collectibles.js";
import { PET_PERKS, petPerk } from "../src/lib/marketplace/pet-perks.js";
import { BADGE_BONUSES } from "../src/lib/marketplace/badges.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// ── BADGES THAT ARE MEANT TO PAY NOTHING ─────────────────────────────────────────────────────────────────────
// One, and it is a punishment rather than an award: the Stockade's mark. A shame badge that came with a combat
// bonus would be a reward for being caught. Listed by name so it is a decision, not a gap.
const NO_BONUS_BY_DESIGN = new Set(["mark_of_shame"]);

const problems = [];

// ── EVERY PET HAS AN AUTHORED ABILITY ────────────────────────────────────────────────────────────────────────
const unauthored = COLLECTIBLES.filter((c) => !PET_PERKS[c.id]);
if (unauthored.length) {
    problems.push({
        head: `${unauthored.length} pet${unauthored.length === 1 ? "" : "s"} have no authored ability`,
        why: 'They fall back to `{ name: "Companion", key: activeStat }` — a generic name on a pet somebody worked for.',
        lines: unauthored.map((c) => `${c.id.padEnd(22)} ${c.name} (${c.rarity}, ${c.source || "?"})`),
        fix: "Add an entry to PET_PERKS in src/lib/marketplace/pet-perks.js.",
    });
}

// ── EVERY BADGE PAYS SOMETHING ───────────────────────────────────────────────────────────────────────────────
// Read from the SQL that seeds the badge table rather than the database, so this runs without a connection.
// Slugs come from the migrations that seed mkt_badge, so this runs with no database.
//
// The FIRST version of this read a scripts/seed-badges.sql that does not exist, found zero slugs, and printed
// "every badge pays something" — a green check that had checked nothing at all, which is worse than no check.
// Hence the guard: finding almost no badges is itself a failure, because it means the parser has lost track
// of where badges are seeded rather than that the game has no badges.
// ── AND A BADGE THAT WAS LATER RETIRED IS NOT AN UNPAID BADGE ────────────────────────────────────────────
// The migrations are a HISTORY, not a snapshot. Reading only the INSERTs reported six badges as paying
// nothing — top_dog, three leaderboard placings, and two others — every one of which a later migration had
// already DELETEd. None of them exists in the live table. So the deletes are replayed too, in filename
// order, which is the order they actually ran in.
const slugSet = new Set();
for (const f of readdirSync(join(root, "migrations")).filter((x) => x.endsWith(".sql")).sort()) {
    const sql = readFileSync(join(root, "migrations", f), "utf8");
    for (const stmt of sql.matchAll(/INSERT INTO mkt_badge\b[\s\S]*?;/g)) {
        for (const v of stmt[0].matchAll(/\(\s*'([a-z0-9_]+)'\s*,/g)) slugSet.add(v[1]);
    }
    for (const stmt of sql.matchAll(/DELETE FROM mkt_badge\b[\s\S]*?;/g)) {
        for (const v of stmt[0].matchAll(/'([a-z0-9_]+)'/g)) slugSet.delete(v[1]);
    }
}
const slugs = [...slugSet];
if (slugs.length < 100) {
    console.error(`\n✗ Only ${slugs.length} badge slugs found in the migrations — the parser has lost track of`);
    console.error("  where badges are seeded, so the badge half of this check is not checking anything.");
    process.exit(1);
}
const known = new Set(Object.keys(BADGE_BONUSES));
const unpaid = slugs.filter((s) => !known.has(s) && !NO_BONUS_BY_DESIGN.has(s));
if (unpaid.length) {
    problems.push({
        head: `${unpaid.length} badge${unpaid.length === 1 ? "" : "s"} carry no bonus`,
        why: "A badge that pays nothing is a picture. Every other family in the game pays something for being earned.",
        lines: [...new Set(unpaid)],
        fix: "Add to BADGE_BONUSES in src/lib/marketplace/badges.js, or to NO_BONUS_BY_DESIGN here if it is a punishment.",
    });
}

// ── AND A COUNT OF NUMERIC TWINS, REPORTED BUT NOT FAILED ────────────────────────────────────────────────────
// A pet's value comes from petPerkValue(rarity, key), so two pets given the same key at the same rarity are
// identical by construction — same base, same ceiling, different picture. That is worth KNOWING before a new
// pet ships (Sable's first two shipped as copies of the Stormcrow and the Unicorn) but it is not a failure:
// 38 of the existing pets are twins, they are owned by members, and retuning them is a game decision rather
// than a lint rule.
//
// NOTE THE TEST IS KEY + VALUE, NOT KEY + RARITY. Some keys are flat across every rarity — extra_strike pays 1
// at all six — so rarity cannot make them unique, and a rarity-based check says "free" when it is not. That
// mistake was made twice while authoring the casino five.
const twins = [];
for (const c of COLLECTIBLES) {
    const k = (PET_PERKS[c.id] || {}).key;
    if (!k) continue;
    const v = petPerk(c).value;
    if (typeof v !== "number") continue;
    const t = COLLECTIBLES.filter((o) => o.id !== c.id && (PET_PERKS[o.id] || {}).key === k && petPerk(o).value === v);
    if (t.length) twins.push(c.name);
}

if (problems.length) {
    for (const p of problems) {
        console.error(`\n✗ ${p.head}`);
        console.error(`  ${p.why}\n`);
        for (const l of p.lines) console.error(`    ${l}`);
        console.error(`\n  ${p.fix}`);
    }
    process.exit(1);
}

console.log(`check:rewards — ${COLLECTIBLES.length} pets all have an authored ability; every badge pays something`
    + ` (${NO_BONUS_BY_DESIGN.size} exempt by design).`);
console.log(`  ${twins.length} pets share an exact key+value with another pet. Not a failure — but check a NEW`);
console.log("  pet against this before shipping it, or it is a copy with a different picture.");
