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

const WHO = process.argv[2] || "The Wolf Den";
const MAX = Number(process.argv[3]) || 70;
const TRIES = Number(process.argv[4]) || 30;

const me = await db.queryOne(`SELECT id, display_name FROM mkt_buyer WHERE display_name = $1`, [WHO]);
if (!me) throw new Error(`no member called ${WHO}`);
const kit = await kitFor(me.id);
const seeded = (n) => { let x = n >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };

// What a beat was worth: damage taken off them, less damage taken by me, with their death counted as the win
// it is. Health is measured as a SHARE so a big foe and a small one are scored on the same scale.
const score = (before, after) => {
    const theirs = (before.B.hp - after.B.hp) / Math.max(1, before.B.maxHp);
    const mine = (before.A.hp - after.A.hp) / Math.max(1, before.A.maxHp);
    return theirs - mine + (after.B.hp <= 0 ? 10 : 0) - (after.A.hp <= 0 ? 10 : 0);
};

function playedBout(foe, seed) {
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

console.log(`\n  ${me.display_name} — ${kit.classId}, damage ${Math.round(kit.damage)}, health ${kit.health}, armour ${kit.armor}`);
console.log(`  auto = both sides on housePick (what check:road reports) · played = your side choosing properly\n`);
console.log("  rung  build                    auto    played");
let autoWall = 0;
let playedWall = 0;
let autoBest = 0;
let playedBest = 0;
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
    let a = 0;
    let p = 0;
    for (let s = 0; s < TRIES; s += 1) {
        if (autoRing({ ...kit }, { ...foe }, { rng: seeded(9001 + s * 7919) }).won) a += 1;
        if (playedBout(foe, 9001 + s * 7919)) p += 1;
    }
    const ar = a / TRIES;
    const pr = p / TRIES;
    // ── HOW FAR YOU GET IS WHERE YOU STOP, NOT THE LAST RUNG YOU EVER CLEAR ──────────────────────────
    // These were `if (rate >= 0.5) wall = t`, overwritten every time — so the headline reported the HIGHEST
    // rung anywhere above 50%, not how far you can actually walk. One lucky rung at 96 printed "you beat
    // outright to rung 96" over a road that was 0% at 60, 70 and 75. That is almost certainly where "me and
    // Eric could get to rung 100" came from: the number was never measuring a run.
    //
    // The wall is the FIRST rung you fail and do not recover from — tracked as the last rung of an unbroken
    // run from the bottom. `best` keeps the old meaning alongside it, named honestly.
    if (ar >= 0.5 && autoWall === t - 1) autoWall = t;
    if (pr >= 0.5 && playedWall === t - 1) playedWall = t;
    if (ar >= 0.5) autoBest = t;
    if (pr >= 0.5) playedBest = t;
    if (t % 5 === 0 || t > MAX - 6) {
        console.log(`  ${String(t).padStart(4)}  ${`${foeClass}:${f.archetype}`.padEnd(22)} ${(ar * 100).toFixed(0).padStart(5)}%  ${(pr * 100).toFixed(0).padStart(7)}%`);
    }
}
console.log("");
console.log(`  auto-resolved  walk to rung ${autoWall} unbroken   (highest above 50% anywhere: ${autoBest})`);
console.log(`  PLAYED         walk to rung ${playedWall} unbroken   (highest above 50% anywhere: ${playedBest})`);
console.log("  walk = last rung of an unbroken run from 1. The two differ when the Road goes back up");
console.log("  after a wall, which it does — read the column, not the headline.");
console.log("");
process.exit(0);
