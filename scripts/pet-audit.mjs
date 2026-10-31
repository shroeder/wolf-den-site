// ── CAN EVERY PET STILL BE GOT? ─────────────────────────────────────────────────────────────────────────────
//   npm run audit:pets
//
// Luke: "there's certain pets that are casino exclusive, or maybe were, that are maybe no longer attainable.
// Can you do an audit on all the pets we have, and if some of them are just not achievable anymore?"
//
// ⚠️ THE `source` FIELD IS A CLAIM, NOT A PATH. Every pet in collectibles.js carries one — "casino", "raid",
// "encounter" — and that string is a label on the card. What decides whether a member can actually get the
// animal is whether some live piece of code hands it over. Those two drift, and the drift is invisible: the
// pet still has a source, a sprite, a rarity and a page to sit on, and nobody notices that the table which
// used to grant it was deleted two features ago. Same shape as
// [[migrating-a-category-strands-its-drop-paths]], where an empty pool read as bad luck for months.
//
// So this walks the opposite way round. For each pet it asks two questions, in order:
//
//   1. IS IT IN A POOL? Some grants are self-driving: pet-drops.js builds its chest, boss and fishing pools
//      by filtering COLLECTIBLES on `source` itself, so every pet carrying that source is in the pool by
//      construction and cannot be stranded. Detected rather than hardcoded — a file that mentions both
//      COLLECTIBLES and `source === "<x>"` is treating that source as a pool.
//
//   2. IS IT NAMED ANYWHERE? If not pooled, some table has to mention the pet's id: a casino counter row, a
//      season prize, an achievement. If the id appears in exactly one file — its own definition — then
//      nothing in the game can hand it over.
//
// ⚠️ A PET THAT PASSES IS NOT PROVEN REACHABLE, only proven to be referenced. A row behind a feature flag
// that is off, or priced in a currency nobody earns, passes here and is still unobtainable. This finds the
// stranded ones; it does not certify the rest.
//
// ⚠️ AND A POOL IS NOT ALWAYS A GRANT. casino.js builds CASINO_PETS by filtering on `casinoExclusive`, which
// looks exactly like a pool and is not one — it reads the pets you ALREADY OWN to apply their perks. That is
// why detection keys on `source` rather than on "any filter over COLLECTIBLES": the looser rule would have
// called the three stranded casino pets reachable and reported a clean run.

import fs from "node:fs";
import path from "node:path";

import { COLLECTIBLES } from "@/lib/marketplace/collectibles.js";

const ROOT = path.resolve("src");
const SELF = "collectibles.js";

/** Every .js/.jsx under src/, except the catalogue itself. */
function walk(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, out);
        else if (/\.(js|jsx|mjs)$/.test(e.name) && e.name !== SELF) out.push(p);
    }
    return out;
}

const files = walk(ROOT).map((p) => ({ p, src: fs.readFileSync(p, "utf8") }));
const rel = (p) => path.relative(process.cwd(), p).replace(/\\/g, "/");

// ── 1. WHICH SOURCES ARE POOLS ──────────────────────────────────────────────────────────────────────────────
const pools = new Map();
for (const { p, src } of files) {
    if (!src.includes("COLLECTIBLES")) continue;
    for (const m of src.matchAll(/source === "([a-z_]+)"/g)) {
        if (!pools.has(m[1])) pools.set(m[1], new Set());
        pools.get(m[1]).add(rel(p));
    }
}

// ── 2. WHERE EACH PET IS NAMED ──────────────────────────────────────────────────────────────────────────────
const namedIn = new Map();
for (const pet of COLLECTIBLES) {
    // Quoted, so "owl" cannot match the middle of "owlbear" and call a stranded pet reachable.
    const re = new RegExp(`["'\`]${pet.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'\`]`);
    const hits = [];
    for (const { p, src } of files) if (re.test(src)) hits.push(rel(p));
    namedIn.set(pet.id, hits);
}

const rows = COLLECTIBLES.map((pet) => {
    const pooled = pools.has(pet.source);
    const named = namedIn.get(pet.id) || [];
    return {
        pet,
        verdict: pooled ? "pool" : named.length ? "named" : "STRANDED",
        where: pooled ? [...pools.get(pet.source)].slice(0, 2) : named.slice(0, 3),
    };
});

// ⚠️ SOME PETS ARE UNOBTAINABLE ON PURPOSE AND THE AUDIT HAS TO KNOW THE DIFFERENCE. The GIFTS block in
// collectibles.js says it outright: "Handed over by name; there is no way to earn one... a source nobody
// filters on is exclusive BY CONSTRUCTION." An audit that reports those as defects on every run is an audit
// people learn to skim, and then it misses the real one — the same reasoning as a badge that can never be
// cleared teaching you to ignore every badge.
const BY_DESIGN = new Set(["gift"]);

const byDesign = rows.filter((r) => r.verdict === "STRANDED" && BY_DESIGN.has(r.pet.source));
const stranded = rows.filter((r) => r.verdict === "STRANDED" && !BY_DESIGN.has(r.pet.source));

const bySource = new Map();
for (const r of rows) {
    if (!bySource.has(r.pet.source)) bySource.set(r.pet.source, { total: 0, stranded: 0, pooled: false });
    const e = bySource.get(r.pet.source);
    e.total += 1;
    e.pooled = pools.has(r.pet.source);
    if (r.verdict === "STRANDED" && !BY_DESIGN.has(r.pet.source)) e.stranded += 1;
}

const NL = "\n";
console.log(`${NL}── PET REACHABILITY ──  ${COLLECTIBLES.length} pets, ${files.length} files scanned${NL}`);
console.log("source        pets  pool?  stranded");
console.log("------------  ----  -----  --------");
for (const [src, e] of [...bySource.entries()].sort((a, b) => b[1].stranded - a[1].stranded || b[1].total - a[1].total)) {
    console.log(`${src.padEnd(12)}  ${String(e.total).padStart(4)}  ${(e.pooled ? "yes" : "no").padStart(5)}  ${String(e.stranded).padStart(8)}`);
}

if (!stranded.length) {
    console.log(`${NL}✓ Every pet is either in a pool or named by something. Nothing is stranded.${NL}`);
} else {
    console.log(`${NL}⚠️  ${stranded.length} pet${stranded.length === 1 ? "" : "s"} nothing can hand over:${NL}`);
    for (const r of stranded) {
        const owner = r.pet.ownerOnly ? "  [ownerOnly]" : "";
        console.log(`  ${r.pet.id.padEnd(20)} ${String(r.pet.name).padEnd(26)} ${String(r.pet.rarity).padEnd(11)} source: ${r.pet.source}${owner}`);
    }
    console.log(`${NL}  Each of these appears in collectibles.js and nowhere else in src/.${NL}`);
}

if (byDesign.length) {
    console.log(`✓ ${byDesign.length} unobtainable on purpose (handed over by name, never earned):`);
    for (const r of byDesign) console.log(`  ${r.pet.id.padEnd(20)} ${String(r.pet.name).padEnd(26)} source: ${r.pet.source}`);
    console.log("");
}

// A pet whose own source IS a pool, but whose gating field puts it outside that pool, is stranded just as
// completely as one no table mentions — and reads as bad luck rather than as a bug.
const CHEST_TIERS = ["wooden", "iron", "gold", "mythic", "ascendant", "eternal", "celestial", "primordial"];
const badGate = rows.filter(({ pet, verdict }) => verdict === "pool" && (
    (pet.source === "chest" && !CHEST_TIERS.includes(pet.chestTier))
    || (pet.source === "level" && !(Number(pet.level) > 0))
));
if (badGate.length) {
    console.log(`⚠️  ${badGate.length} pooled pet(s) whose gate puts them outside their own pool:${NL}`);
    for (const { pet } of badGate) {
        console.log(`  ${pet.id.padEnd(20)} source: ${pet.source}  chestTier: ${pet.chestTier}  level: ${pet.level}`);
    }
    console.log("");
}
