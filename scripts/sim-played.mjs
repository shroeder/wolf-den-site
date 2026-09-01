// ── THE ROAD, PLAYED RATHER THAN AUTO-RESOLVED ───────────────────────────────────────────────────────────────
// Luke: "did you simulate it as if I had gone in and fought." No — check:road calls autoRing, which drives
// BOTH sides with housePick. housePick is deliberately not a good player: it does not count beats ahead, does
// not hold a cooldown, and cannot see what a skill will actually do before it spends it. So every number that
// script has ever produced is a member's KIT played by the house, not by the member.
//
// This plays the member's side properly. Each beat it clones the ring, tries every command available — a plain
// swing and each skill that is off cooldown — resolves one beat with a FIXED rng so the candidates are compared
// on the same luck, scores what came back, and then spends the winner on the real ring with the real rng.
//
// That is a strong player, not a perfect one: one beat of lookahead, no baiting, no holding a finisher for a
// kill two beats out. It is the honest upper bracket to check:road's lower one, and the truth is between them.
//
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/sim-played.mjs [member] [maxRung] [tries]
// ── THE FOE IS BUILT THE WAY THE GAME BUILDS IT ──────────────────────────────────────────────────────────────
// This used npcBuild(rung), and the game does not call npcBuild for a Road fight at all. arena.js builds a rung
// from statsForPower(f.power, f.archetype) + ladderDr(rung) + npcSkills at a kitTier of round(rung*0.9). The two
// disagree badly: at rung 33 npcBuild totals 1,991 stat points and the game fields 3,275 — the sim was fighting
// an opponent about a third weaker than the one members actually meet, at every rung.
//
// That is why this script reported Kaishiern beating rung 40 outright on the night he lost rung 33 five times,
// and why last night's archetype re-derivation did not land. Luke: "I'm guessing we use the one that matches up
// with the state of the game." Exactly this — the game is the truth and the tool follows it.
import { npcAbilities, statsForPower } from "../src/lib/marketplace/arena-npc.js";
import { ladderFoe, ladderDr } from "../src/lib/marketplace/arena-ladder.js";
import { npcClassForArchetype, npcSkills } from "../src/lib/marketplace/arena-skills.js";
import { buildForClass } from "../src/lib/marketplace/arena-npc-build.js";
import { fighterFrom, kitFor } from "../src/lib/marketplace/arena.js";
import { openRing, act, ringResult, autoRing } from "../src/lib/marketplace/arena-ring.js";
import { resolveSkill } from "../src/lib/marketplace/arena-skills.js";
import { db } from "../src/lib/db.js";

// ── ONE TABLE, SEVERAL FIGHTERS ──────────────────────────────────────────────────────────────────────────────
// Luke: "simulated, like, a hundred bouts on each rung for the three fighters... and then you gave me a table
// of where we got, what our success rate was on each rung."
//
// A comma-separated list runs them all and prints one column each, so the three are read against each other on
// the same rungs rather than in three separate outputs nobody can line up.
//
//   npm run sim:road -- "The Wolf Den,Eric D,JT" 100 100
const WHO = (process.argv[2] || "The Wolf Den").split(",").map((w) => w.trim()).filter(Boolean);
const MAX = Number(process.argv[3]) || 70;
const TRIES = Number(process.argv[4]) || 30;
// Every rung, not every fifth, once there is a table to read. `--step N` thins it back out.
const STEP = Number((process.argv.find((a) => a.startsWith("--step")) || "").split("=")[1]) || 1;

const fighters = [];
for (const name of WHO) {
    const row = await db.queryOne(`SELECT id, display_name FROM mkt_buyer WHERE display_name = $1`, [name]);
    if (!row) throw new Error(`no member called ${name}`);
    fighters.push({ name: row.display_name, kit: await kitFor(row.id) });
}
const seeded = (n) => { let x = n >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };

// What a beat was worth: damage taken off them, less damage taken by me, with their death counted as the win
// it is. Health is measured as a SHARE so a big foe and a small one are scored on the same scale.
const score = (before, after) => {
    const theirs = (before.B.hp - after.B.hp) / Math.max(1, before.B.maxHp);
    const mine = (before.A.hp - after.A.hp) / Math.max(1, before.A.maxHp);
    return theirs - mine + (after.B.hp <= 0 ? 10 : 0) - (after.A.hp <= 0 ? 10 : 0);
};

function playedBout(kit, foe, seed) {
    const rng = seeded(seed);
    let ring = openRing({ ...kit }, { ...foe }, { rng, foeSkills: foe.skills || {} });
    for (let guard = 0; guard < 400 && !ring.over && ring.awaiting === "act"; guard += 1) {
        const deck = kit.skills || {};
        const options = [null, ...Object.keys(deck).filter((id) => !(ring.cd?.[id] > 0))];
        let best = null;
        let bestScore = -Infinity;
        for (const id of options) {
            const skill = id ? resolveSkill(id, deck) : null;
            if (id && !skill) continue;
            // Same luck for every candidate, so the comparison is about the choice and not the dice.
            const trial = structuredClone(ring);
            const after = act(trial, { skill, rng: seeded(seed * 31 + guard) });
            const s = score(ring, after);
            if (s > bestScore) { bestScore = s; best = skill; }
        }
        ring = act(ring, { skill: best, rng });
    }
    return ringResult(ring).won;
}

for (const fx of fighters) {
    console.log(`  ${fx.name.padEnd(14)} ${String(fx.kit.classId).padEnd(11)} damage ${String(Math.round(fx.kit.damage)).padStart(4)}  health ${String(fx.kit.health).padStart(5)}  armour ${fx.kit.armor}`);
}
console.log("");
console.log(`  PLAYED — your side choosing properly, ${TRIES} bouts per rung per fighter.`);
console.log("");
console.log("  rung  opponent               " + fighters.map((fx) => fx.name.slice(0, 11).padStart(12)).join(""));

const walk = fighters.map(() => 0);
const best = fighters.map(() => 0);
for (let t = 1; t <= MAX; t += 1) {
    // Mirrors arena.js's ladder branch line for line — statsForPower, the Road's own damage reduction, the
    // kit tier, the class off the ARCHETYPE (never the tier), and the deck drawn from inside that class.
    const f = ladderFoe(t);
    const st = statsForPower(f.power, f.archetype, null, t);
    st.dr = ladderDr(t);
    const kitTier = Math.max(1, Math.round(t * 0.9) + (f.champion ? 8 : 0));
    const foeClass = npcClassForArchetype(f.archetype);
    const foeBuild = buildForClass(kitTier, foeClass);
    const foe = { ...f, ...st, ...fighterFrom(st, {}, null),
        abilities: npcAbilities(kitTier, f.archetype),
        skills: npcSkills(kitTier, f.archetype, foeClass, foeBuild?.branches) };

    const rates = fighters.map((who, idx) => {
        let p = 0;
        for (let s = 0; s < TRIES; s += 1) if (playedBout(who.kit, foe, 9001 + s * 7919)) p += 1;
        const r = p / TRIES;
        // walk = an unbroken run from rung 1. best = the highest rung above 50% ANYWHERE. They differ wildly,
        // and reporting only the second is what made this tool claim rung 100 for a road that walls in the 30s.
        if (r >= 0.5 && walk[idx] === t - 1) walk[idx] = t;
        if (r >= 0.5) best[idx] = t;
        return r;
    });
    if (t % STEP === 0 || t === MAX) {
        console.log(`  ${String(t).padStart(4)}  ${`${foeClass}:${f.archetype}`.padEnd(22)}`
            + rates.map((r) => `${(r * 100).toFixed(0)}%`.padStart(12)).join(""));
    }
}
console.log("");
fighters.forEach((who, idx) => {
    console.log(`  ${who.name.padEnd(14)} walks to rung ${String(walk[idx]).padStart(3)} unbroken   (highest above 50% anywhere: ${best[idx]})`);
});
console.log("");
process.exit(0);
