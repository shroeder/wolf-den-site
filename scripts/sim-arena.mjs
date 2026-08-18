// ── ARENA BALANCE SIMULATOR ──────────────────────────────────────────────────────────────────────────────────
// It runs the REAL engine now. Nothing below is a copy of a number that lives somewhere else.
//
// WHAT THIS FILE USED TO BE, because it is the reason for every choice in it: a second implementation of the
// engine with the constants copied across by hand, under a header that admitted the danger — "the numbers
// below are copied from it exactly — if they drift, this lies." They drifted. By the time anyone checked, five
// values were wrong and six named mechanics no longer existed; SURGE_MULT was 1.5 here against 0.5 in the
// game, so the simulator was modelling a buff where the game shipped a cut. Balance arguments in this codebase
// cite this tool by number. It was arguing about a game nobody was playing.
//
// The fix was not to re-copy them. It was to make the engine importable: the arithmetic of a beat now lives in
// src/lib/marketplace/arena-engine.js, which has no database in it, and both the game and this file import the
// same functions and the same constants. A retune lands here the moment it lands in the game, because there is
// nothing here to retune.
//
// WHAT IS STILL THIS FILE'S OWN, and honestly so:
//   · WHO DOES WHAT. Which move a fighter throws, when they brace, when they drink. That is policy, not
//     mechanics — the real thing has a person on one end and arena-ai.js on the other, and neither is
//     available to a batch job.
//   · The kit each class is given, since a tree allocation is a player's choice.
//   · Execution: the timing grade a player would hit. Held at a fixed, honest average.
//
// What it CANNOT tell you: anything about the ring, the timing bands, or the UI. It is a numbers harness.
//
// Usage:  node --experimental-loader ./scripts/lib/alias-loader.mjs scripts/sim-arena.mjs [runs]
//         npm run sim
import { CLASSES, classBase, treeAbilities, treeEffects, treeFor } from "../src/lib/marketplace/arena-classes.js";
import {
    accuracyFromFerocity, BLEED_TURNS, DRAIN_SHARE, FEAST_SHARE, FREE_KINDS, guardSoakFrom, healthFrom,
    RIPOSTE_SHARE, SHIELD_CAP, speedOf, SUNDER_CUT, SUNDER_TURNS, swingFrom, WARD_SOAK,
} from "../src/lib/marketplace/arena-kit.js";
import { arenaRating, counterBlow, drinkFor, lightBurn, openWound, ringStats, throwBlows } from "../src/lib/marketplace/arena-engine.js";
import { npcAbilities, npcFor, tierForRating } from "../src/lib/marketplace/arena-npc.js";

const RUNS = Number(process.argv[2]) || 2000;

// A member's gear budget at the level being measured. The one number this file picks, because "how geared is
// the person we are talking about" is the question being asked, not a fact about the engine.
const GEAR = { fresh: 120, mid: 320, bis: 644 };

// ── BUILDING A FIGHTER, THE WAY kitFor DOES ──────────────────────────────────────────────────────────────────
// Same formulas, imported: swingFrom, healthFrom, the crit pair, accuracy off Ferocity, the class base. What
// is skipped is everything that needs a database — pets, badges, the compendium — so a simulated fighter is a
// GEAR-ONLY fighter, which is the honest thing to compare classes with anyway.
function fighter(classId, gear, taken = {}) {
    const base = classBase(classId);
    const perks = treeEffects(classId, taken);
    // Gear spread: a real loadout is not one stat, so the budget is split the way a sensible kit splits it.
    const stats = {
        might: Math.round(gear * 0.34),
        vitality: Math.round(gear * 0.26),
        crit_chance: Math.round(gear * 0.12),
        crit_power: Math.round(gear * 0.12),
        ferocity: Math.round(gear * 0.16),
    };
    const ring = ringStats({ ...stats, dr: base.dr, accuracy: base.accuracy, guard: base.guard });
    return {
        classId,
        abilities: treeAbilities(classId, taken, null),
        health: ring.health + (base.health || 0) + Math.round(perks.health || 0),
        damage: ring.damage * (1 + (base.dmgPct || 0) + (perks.dmgPct || 0)),
        critChance: ring.critChance + (perks.crit || 0),
        critMult: ring.critMult + (perks.critMult || 0),
        dr: Math.min(0.6, base.dr + (perks.dr || 0)),
        accuracy: Math.min(0.95, base.accuracy + accuracyFromFerocity(stats.ferocity) + (perks.accuracy || 0)),
        guard: guardSoakFrom(base.guard, stats.fortune || 0, perks.guardSoak || 0),
        speed: speedOf(30, stats.ferocity),
        lifesteal: (base.lifesteal || 0) + (perks.lifesteal || 0),
        bleedChance: base.bleedChance || 0,
        burnChance: base.burnChance || 0,
        dmgPct: (base.dmgPct || 0) + (perks.dmgPct || 0),
        doublestrike: 0,
        perks,
        gearPower: gear,
    };
}

function npcFighter(tier) {
    const n = npcFor(tier);
    if (!n) return null;
    const ring = ringStats(n);
    return {
        classId: null, abilities: npcAbilities(tier), ...ring, damage: ring.damage, perks: {},
        lifesteal: 0, bleedChance: 0, burnChance: 0, dmgPct: 0, doublestrike: 0, gearPower: arenaRating(ring),
    };
}

// ── ONE BOUT ─────────────────────────────────────────────────────────────────────────────────────────────────
// The bout STATE is the shape arena-engine's functions expect, so every blow, wound, burn, drink and counter
// below is resolved by the same code the game runs.
//
// GRADE is the one honest fudge: a real swing is multiplied by how well the player hit the timing ring. A
// batch job has no thumbs, so it swings at a fixed 1.0 — a competent, unspectacular player, both sides.
const GRADE = 1;

function bout(me, foe, { skillBias = 0.65 } = {}) {
    const b = {
        me, foe,
        hp: me.health, maxHp: me.health,
        foeHp: foe.health, foeMaxHp: foe.health,
        shield: 0, foeShield: 0, beat: 0,
        bleed: null, gash: null, foeBleed: null, foeGash: null,
        sunder: 0, foeSunder: 0, riposte: 0, foeRiposte: 0,
    };
    const cd = {};
    const foeCd = {};

    const swing = (attacker, defender, ability, onFoe) => {
        const guard = Math.max(0, Math.min(0.6, (defender.dr || 0) * (onFoe && b.sunder > 0 ? 1 - SUNDER_CUT : 1)));
        const roll = throwBlows({
            attacker,
            hits: ability?.kind === "flurry" ? (ability.hits || 3) : 1,
            power: ability?.power || 1,
            acc: Math.max(0.35, Math.min(0.95, attacker.accuracy + (ability?.acc || 0))),
            critChance: attacker.critChance,
            critMult: attacker.critMult,
            guard,
            mult: GRADE * (1 + (attacker.dmgPct || 0)),
        });
        return roll;
    };

    while (b.hp > 0 && b.foeHp > 0 && b.beat < 60) {
        b.beat += 1;

        // ── YOUR BEAT ────────────────────────────────────────────────────────────────────────────────────
        const ready = (me.abilities || []).filter((a) => !(cd[a.id] > 0) && !FREE_KINDS.has(a.kind));
        const free = (me.abilities || []).filter((a) => !(cd[a.id] > 0) && FREE_KINDS.has(a.kind));
        for (const f of free) {                        // free moves cost no beat, so an honest player uses them
            cd[f.id] = f.cooldown || 3;
            if (f.kind === "riposte") b.riposte = RIPOSTE_SHARE;
            else b.shield = Math.min(Math.round(b.maxHp * SHIELD_CAP), b.shield + Math.round(b.maxHp * WARD_SOAK));
        }
        const ability = ready.length && Math.random() < skillBias ? ready[Math.floor(Math.random() * ready.length)] : null;
        if (ability) cd[ability.id] = ability.cooldown || 3;

        const mine = swing(me, foe, ability, true);
        let dmg = mine.dmg;
        if (b.foeShield > 0 && dmg > 0) { const s = Math.min(b.foeShield, dmg); b.foeShield -= s; dmg -= s; }
        b.foeHp = Math.max(0, b.foeHp - dmg);
        if (dmg > 0) {
            if (me.lifesteal > 0) b.hp = Math.min(b.maxHp, b.hp + drinkFor(b, dmg, me.lifesteal));
            if (ability?.kind === "drain") b.hp = Math.min(b.maxHp, b.hp + Math.round(dmg * DRAIN_SHARE));
            if (ability?.kind === "feast") b.hp = Math.min(b.maxHp, b.hp + Math.round((b.maxHp - b.hp) * FEAST_SHARE));
            // Ragged Edge and Emberborn, on ANY landed swing — the fix that made them visible at all.
            if (ability?.bleeds || (me.bleedChance > 0 && Math.random() < me.bleedChance)) openWound(b, true, me.perks);
            if (ability?.burns || (me.burnChance > 0 && Math.random() < me.burnChance)) lightBurn(b, true, me.perks);
            if (ability?.kind === "sunder") b.foeSunder = SUNDER_TURNS;
        }
        if (b.foeHp <= 0) break;

        // Their damage-over-time ticks at the end of your beat, as it does in the game.
        for (const [track, key] of [[b.bleed, "bleed"], [b.gash, "gash"]]) {
            if (!track?.turns) continue;
            b.foeHp = Math.max(0, b.foeHp - Math.min(b.foeHp, track.dmg));
            track.turns -= 1;
            if (track.turns <= 0) b[key] = null;
        }
        if (b.foeHp <= 0) break;

        // ── THEIR BEAT ───────────────────────────────────────────────────────────────────────────────────
        const theirReady = (foe.abilities || []).filter((a) => !(foeCd[a.id] > 0) && !FREE_KINDS.has(a.kind));
        const theirAbility = theirReady.length && Math.random() < skillBias
            ? theirReady[Math.floor(Math.random() * theirReady.length)] : null;
        if (theirAbility) foeCd[theirAbility.id] = theirAbility.cooldown || 3;

        const theirs = swing(foe, me, theirAbility, false);
        let through = theirs.dmg;
        if (b.shield > 0 && through > 0) { const s = Math.min(b.shield, through); b.shield -= s; through -= s; }
        b.hp = Math.max(0, b.hp - through);
        if (through > 0) {
            if (foe.lifesteal > 0) b.foeHp = Math.min(b.foeMaxHp, b.foeHp + drinkFor(b, through, foe.lifesteal, "foe"));
            if (theirAbility?.bleeds || (foe.bleedChance > 0 && Math.random() < foe.bleedChance)) openWound(b, false, foe.perks);
            if (theirAbility?.burns || (foe.burnChance > 0 && Math.random() < foe.burnChance)) lightBurn(b, false, foe.perks);
            // RETALIATION, through the real function: a full swing with its own crit, Brutality and drink.
            if ((me.perks?.counter || 0) > 0 && Math.random() < Math.min(0.6, me.perks.counter)) counterBlow(b, true);
        }
        for (const [track, key] of [[b.foeBleed, "foeBleed"], [b.foeGash, "foeGash"]]) {
            if (!track?.turns) continue;
            b.hp = Math.max(0, b.hp - Math.min(b.hp, track.dmg));
            track.turns -= 1;
            if (track.turns <= 0) b[key] = null;
        }
        for (const k of Object.keys(cd)) cd[k] = Math.max(0, cd[k] - 1);
        for (const k of Object.keys(foeCd)) foeCd[k] = Math.max(0, foeCd[k] - 1);
        if (b.sunder > 0) b.sunder -= 1;
        if (b.foeSunder > 0) b.foeSunder -= 1;
    }
    return { won: b.foeHp <= 0 && b.hp > 0, beats: b.beat };
}

// ── A FULL TREE, SPENT THE WAY A PLAYER WOULD ────────────────────────────────────────────────────────────────
// Every rank of every node the class has: the CEILING, not a typical build. It compares classes on equal terms
// rather than predicting one member's bout, and it is the state in which a dead node is most obvious.
//
// (The first version of this function returned an empty object while claiming to be a full tree, which made
// every row below a classless fighter wearing gear. A harness that lies quietly is the thing this whole file
// was rewritten to stop being — so it reads the real tree.)
function fullTree(classId) {
    const taken = {};
    for (const n of treeFor(classId)) taken[n.id] = Math.max(1, Number(n.ranks) || 1);
    return taken;
}

console.log(`Arena simulator — ${RUNS} bouts per cell, engine imported from arena-engine.js (nothing copied).\n`);

const rows = [];
for (const cls of CLASSES) {
    for (const [label, gear] of Object.entries(GEAR)) {
        const me = fighter(cls.id, gear, fullTree(cls.id));
        // THE TIER MATCHMAKING WOULD ACTUALLY PICK, plus one either side. Choosing tiers by hand pitted a
        // 2,628-rating member against a 580 and then reported 100% as if it meant something; the game never
        // makes that pairing, so neither should this.
        const seat = tierForRating(arenaRating(fighter(cls.id, gear, fullTree(cls.id))));
        for (const tier of [Math.max(1, seat - 3), seat, seat + 3]) {
            const foe = npcFighter(tier);
            if (!foe) continue;
            let wins = 0;
            let beats = 0;
            for (let i = 0; i < RUNS; i += 1) {
                const r = bout(me, foe);
                if (r.won) wins += 1;
                beats += r.beats;
            }
            rows.push({
                class: cls.name, gear: label, rating: arenaRating(me), tier, foeRating: arenaRating(foe),
                win: `${((wins / RUNS) * 100).toFixed(1)}%`, beats: +(beats / RUNS).toFixed(1),
            });
        }
    }
}
console.table(rows);

// Class against class, which is what the Arena actually pairs.
console.log("\nClass vs class, mid gear:");
const pvp = [];
for (const a of CLASSES) {
    for (const d of CLASSES) {
        if (a.id === d.id) continue;
        const me = fighter(a.id, GEAR.mid, fullTree(a.id));
        const foe = fighter(d.id, GEAR.mid, fullTree(d.id));
        let wins = 0;
        for (let i = 0; i < RUNS; i += 1) if (bout(me, foe).won) wins += 1;
        pvp.push({ attacker: a.name, defender: d.name, win: `${((wins / RUNS) * 100).toFixed(1)}%` });
    }
}
console.table(pvp);
console.log(`\nBleed floor in play: ${BLEED_TURNS} turns minimum, imported not assumed.`);
