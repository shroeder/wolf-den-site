// ── THE SIMULATOR'S HARNESS ──────────────────────────────────────────────────────────────────────────────────
// Lifted out of sim-arena.mjs UNCHANGED so more than one balance question can be asked with the same answer.
//
// The reason it is a shared module and not a copy is written at the top of sim-arena.mjs and is worth
// repeating: that file used to be a second implementation of the engine with the constants copied by hand,
// they drifted, and it spent months arguing about a game nobody was playing. A second sim that copied THIS
// would be the same mistake one level up. So: one fighter builder, one bout loop, one gear table.
//
// What is here is policy and scaffolding — who throws what, how a member's budget is split, the honest fixed
// timing grade. The arithmetic of a blow still comes from arena-engine.js, imported below.

import { classBase, treeAbilities, treeEffects, treeFor } from "../../src/lib/marketplace/arena-classes.js";
import {
    accuracyFromFerocity, DRAIN_SHARE, FEAST_SHARE, FREE_KINDS, guardSoakFrom,
    RIPOSTE_SHARE, SHIELD_CAP, speedOf, SUNDER_CUT, SUNDER_TURNS, WARD_SOAK,
} from "../../src/lib/marketplace/arena-kit.js";
import {
    arenaRating, counterBlow, drinkFor, lightBurn, openWound, throwBlows,
} from "../../src/lib/marketplace/arena-engine.js";
// ONE builder, the same one kitFor spreads — a harness with its own is a harness for a different game.
import { fighterFrom } from "../../src/lib/marketplace/arena.js";
import { npcAbilities, npcFor } from "../../src/lib/marketplace/arena-npc.js";

// A member's gear budget at the level being measured. The one number this file picks, because "how geared is
// the person we are talking about" is the question being asked, not a fact about the engine.
//
// ⚠️ `bis` WAS 644 AND THAT WAS NOT BEST-IN-SLOT. 644 is roughly what a well-geared player has TODAY. The
// game's actual ceiling is 1,802: there are four rarity tiers above anything currently worn — ascendant,
// eternal, celestial, primordial — and a full primordial set sums to 1,627 in base stats alone against the
// 251 the best-equipped member is wearing.
//
// That mistake was load-bearing. Reading 644 as the ceiling produced the conclusion that gear was 95% spent
// and could not matter, and very nearly a balance change to "fix" it. Walked properly, gear is worth SIXTY
// rungs (38 -> 98) against the skill tree's twenty-two. Luke, who knew: "we have a bunch of tiers of gear no
// one has yet."
//
// `top` is the real ceiling. Anything reasoning about the endgame must use it, not `bis`.
export const GEAR = { fresh: 120, mid: 320, geared: 644, top: 1802 };
// Kept so older call sites keep working, and named honestly for what it actually is.
GEAR.bis = GEAR.geared;

// ── BUILDING A FIGHTER, THE WAY kitFor DOES ──────────────────────────────────────────────────────────────────
// Same formulas, imported: swingFrom, healthFrom, the crit pair, accuracy off Ferocity, the class base. What
// is skipped is everything that needs a database — pets, badges, the compendium — so a simulated fighter is a
// GEAR-ONLY fighter, which is the honest thing to compare classes with anyway.
export function fighter(classId, gear, taken = {}) {
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
    const ring = fighterFrom({ ...stats }, perks, classId);
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

export function npcFighter(tier) {
    const n = npcFor(tier);
    if (!n) return null;
    const ring = fighterFrom(n, {}, null);
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
export const GRADE = 1;

export function bout(me, foe, { skillBias = 0.65 } = {}) {
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
export function fullTree(classId) {
    const taken = {};
    for (const n of treeFor(classId)) taken[n.id] = Math.max(1, Number(n.ranks) || 1);
    return taken;
}
