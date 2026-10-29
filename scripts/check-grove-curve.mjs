// ── THE GROVE'S DIFFICULTY CURVE HOLDS ITS SHAPE ─────────────────────────────────────────────────────────────
// Three invariants, each of which has already been violated once in this codebase:
//
//   1. MAP ONE'S TWELVE BOSSES ARE THE SHARED CURVE, WRITTEN OUT. A boss carries its final health — scaledFoe
//      deliberately never touches one — so the numbers must be literals. Literals drift. The previous curve
//      had map one hand-authored and maps two-plus generated from a different formula, and the two disagreed
//      so badly that map two's FIRST boss was 27% easier than map one's LAST.
//
//   2. DIFFICULTY NEVER GOES BACKWARDS. That 27% was not a typo, it was structural: boss health was
//      `step ** (map - 1) * ramp ** (i / 11)`, a sawtooth that reset at every map boundary. All six
//      boundaries were downhill. Crossing into new territory should never be a relief.
//
//   3. THE FIRST THING YOU EVER MEET IS KILLABLE BY SOMEONE WHO HAS NOTHING. The curve shipped for a year
//      fitted between two members, the lower of whom measures above the 90th percentile — so depth one asked
//      97 swings of a 25th-percentile member and killed them in two hits. A floor guard is the only thing
//      that would have caught that, because every number in the table looked reasonable on its own.
//
//   npm run check:grove-curve
import { register } from "node:module";

register("./lib/app-loader.mjs", import.meta.url);

const { GROVE_ZONES, GROVE_BOSSES, GROVE_SCALE, scaledFoe } = await import("@/lib/marketplace/grove-catalog.js");
const { bossHpAt, bossDmgAt } = await import("@/lib/marketplace/grove-maps.js");

let bad = 0;
const ok = (cond, msg) => { if (!cond) { bad += 1; console.log(`  ✗ ${msg}`); } };

// ⚠️ THE 25th PERCENTILE, MEASURED. scripts/grove-power.mjs profiled all 192 members with an alias through
// the real groveFighter: p25 swings for 3 and carries 60 effective hp. Written here as a constant rather than
// re-queried so the gate stays pure and runs without a database — but it is a measurement, not a guess, and
// re-measuring it is one command when the population moves.
const P25 = { per: 3, ehp: 60, cd: 410 };
const TARGET = { foeSwings: 8, bossSeconds: 90, bossHits: 4 };

console.log("\n── 1. map one's bosses are the shared curve ──────────────────────────────");
const mapOne = GROVE_ZONES.filter((z) => z.map === 1).sort((a, b) => a.n - b.n);
for (const z of mapOne) {
    const b = GROVE_BOSSES[z.boss];
    if (!b) { ok(false, `zone ${z.n} (${z.id}) has no boss`); continue; }
    const wantHp = Math.round(bossHpAt(z.n));
    const wantLo = Math.round(bossDmgAt(z.n, 0));
    const wantHi = Math.round(bossDmgAt(z.n, 1));
    ok(b.hp === wantHp, `${b.name || z.boss} (depth ${z.n}) hp is ${b.hp}, the curve says ${wantHp}`);
    ok(b.dmg?.[0] === wantLo && b.dmg?.[1] === wantHi,
        `${b.name || z.boss} (depth ${z.n}) dmg is [${b.dmg}], the curve says [${wantLo}, ${wantHi}]`);
}
console.log(`  ${mapOne.length} bosses checked against bossHpAt/bossDmgAt`);

console.log("\n── 2. difficulty never goes backwards ────────────────────────────────────");
const byDepth = [...GROVE_ZONES].sort((a, b) => a.n - b.n);
let seams = 0;
const dips = [];
for (let i = 1; i < byDepth.length; i += 1) {
    const prev = byDepth[i - 1], cur = byDepth[i];
    const a = GROVE_BOSSES[prev.boss]?.hp || 0;
    const c = GROVE_BOSSES[cur.boss]?.hp || 0;
    if (!a || !c) continue;
    if (c < a) {
        seams += 1;
        ok(false, `depth ${prev.n} boss ${a.toLocaleString()} -> depth ${cur.n} boss ${c.toLocaleString()}`
            + `  ${Math.round((1 - c / a) * 100)}% EASIER`);
    }
    // ⚠️ WANDERERS ARE JUDGED ON THE ZONE'S WHOLE ROSTER, AND WITH A TOLERANCE — because archetype variety
    // is a FEATURE and comparing one zone's first creature to the next zone's first creature measures the
    // mix, not the curve. A swarm (9 hp at depth one) following a brute (15) is a zone led by something
    // flimsier, by design. The curve itself cannot go downhill: depthMult is a strictly increasing
    // exponential, so any GIVEN creature is harder deeper, always.
    //
    // What is still worth catching is a roster that dips so far it reads as a mistake, so: the zone's mean,
    // with 20% of slack for texture.
    const meanHp = (z) => {
        const hs = (z.enemies || []).map((e) => scaledFoe(e, z.n)?.hp || 0).filter(Boolean);
        return hs.length ? hs.reduce((a, b) => a + b, 0) / hs.length : 0;
    };
    const fa = meanHp(prev), fc = meanHp(cur);
    // ⚠️ REPORTED, NOT FAILED. A roster dip is a CONTENT question — which creatures were put in which zone —
    // and the answer is sometimes "map one ends on its brutes and map two opens on its swarms", which is a
    // legitimate way to start a new biome. The boss curve above is structural and must never go downhill;
    // this is a note for whoever is authoring zones. Failing on it would make a gate nobody can keep green
    // without re-authoring content, and a gate nobody can keep green gets ignored.
    if (fa && fc && fc < fa * 0.8) {
        dips.push(`depth ${prev.n} roster averages ${Math.round(fa)} hp -> depth ${cur.n} averages ${Math.round(fc)}`
            + `  ${Math.round((1 - fc / fa) * 100)}% easier`);
    }
}
console.log(`  ${byDepth.length - 1} boss boundaries checked, ${seams} downhill`);
if (dips.length) {
    console.log(`
  note — ${dips.length} zone roster(s) open softer than the zone before, worth an author's eye:`);
    for (const d of dips) console.log(`    · ${d}`);
}

console.log("\n── 3. the floor is playable by someone with nothing ──────────────────────");
const z1 = byDepth[0];
const foe = scaledFoe(z1.enemies?.[0], z1.n);
const boss = GROVE_BOSSES[z1.boss];
const foeSw = Math.ceil((foe?.hp || 0) / P25.per);
const bossSec = (Math.ceil((boss?.hp || 0) / P25.per) * P25.cd) / 1000;
const foeHits = Math.floor(P25.ehp / ((foe?.dmg?.[0] + foe?.dmg?.[1]) / 2 || 1));
const bossHits = Math.floor(P25.ehp / ((boss?.dmg?.[0] + boss?.dmg?.[1]) / 2 || 1));
console.log(`  p25 at depth 1:  wanderer ${foeSw} swings, survives ${foeHits} of its hits`);
console.log(`                   boss ${bossSec.toFixed(0)}s, survives ${bossHits} of its hits`);
ok(foeSw <= TARGET.foeSwings, `the first wanderer takes ${foeSw} swings — over ${TARGET.foeSwings}, the opening is a chore`);
ok(bossSec <= TARGET.bossSeconds, `the first boss takes ${bossSec.toFixed(0)}s — over ${TARGET.bossSeconds}s`);
ok(foeHits >= TARGET.bossHits, `the first wanderer kills p25 in ${foeHits} hits — it must take at least ${TARGET.bossHits}`);
ok(bossHits >= TARGET.bossHits, `the first boss kills p25 in ${bossHits} hits — it must take at least ${TARGET.bossHits}`);

console.log(`\n  rates: wanderer hp x${(1 + GROVE_SCALE.hpPerZone).toFixed(4)}/zone, dmg x${(1 + GROVE_SCALE.dmgPerZone).toFixed(4)}/zone`);
if (bad) { console.log(`\n${bad} problem(s) with the curve.\n`); process.exit(1); }
console.log("\nOK — map one matches the curve, nothing is downhill, and the floor is playable.\n");
