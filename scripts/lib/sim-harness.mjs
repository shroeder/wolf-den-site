// ── THE SIMULATOR'S HARNESS ──────────────────────────────────────────────────────────────────────────────────
// Lifted out of sim-arena.mjs UNCHANGED so more than one balance question can be asked with the same answer.
//
// The reason it is a shared module and not a copy is written at the top of sim-arena.mjs and is worth
// repeating: that file used to be a second implementation of the engine with the constants copied by hand,
// they drifted, and it spent months arguing about a game nobody was playing. A second sim that copied THIS
// would be the same mistake one level up. So: one fighter builder, one bout loop, one gear table.
//
// What is here is policy and scaffolding — who throws what, how a member's budget is split, the honest fixed
// timing grade. The FIGHT is not here: bout() drives openRing/act/ringResult, the same three calls the request
// handler makes. It used to run a hand-written loop instead, which is the very mistake the paragraph above
// describes, one level down and undetected because the pieces it called were genuinely imported.

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
// THE RING ITSELF, not pieces of it. See the note on bout() below.
import { act, openRing, ringResult } from "../../src/lib/marketplace/arena-ring.js";
// THE ACTUAL SKILLS. See the note on skillsFull() — the tree carries only passives now.
import { resolveSkill, skillsForClass } from "../../src/lib/marketplace/arena-skills.js";

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
        // NO `abilities` FIELD. It was treeAbilities(classId, taken, null), which has returned an empty list
        // ever since actives moved out of the class trees into arena-skills.js — a field that silently means
        // "none" is worse than no field, because everything reading it looked like it was working.
        // bout() builds the real deck with skillsFull().
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

// ── EVERY SKILL A CLASS HAS, FULLY NODED ─────────────────────────────────────────────────────────────────────
// The build a simulated fighter brings. Fully noded on purpose: the question this harness is asked is "is the
// class balanced when played properly", and a half-built deck answers a different one. `taken` is a map of
// skill id to the list of node ids chosen, which is the shape resolveSkill wants.
export function skillsFull(classId) {
    const out = {};
    for (const base of skillsForClass(classId)) {
        const taken = { [base.id]: (base.nodes || []).map((n) => n.id) };
        const r = resolveSkill(base.id, taken);
        if (r) out[base.id] = r;
    }
    return out;
}

// ── ONE BOUT, RUN BY THE ACTUAL RING ─────────────────────────────────────────────────────────────────────────
// This used to be a hand-written fight loop right here — its own swings, its own shields, its own bleed and
// cooldowns — while the header six inches above warned that exactly that had already happened once, drifted,
// and "spent months arguing about a game nobody was playing". The imported pieces (throwBlows, openWound,
// counterBlow) made it look like the engine. The LOOP is where the engine actually lives, and the loop was a
// copy.
//
// It cost something specific. Every rule added to the real ring since — pitFever closing the pit, the guard
// decaying each beat, a beat of immunity after a denied turn — existed only in the game, never in the
// simulator. So the simulator reported two-round fights while production ran twelve, and when the Warden
// mirror stalled at seventy-nine rounds this file could not have seen it: it was not running that engine.
//
// openRing/act/ringResult, the same three calls the request handler makes and the same three check-arena.mjs
// uses for its invariants. A second implementation is a second game.
export function bout(me, foe, { skillBias = 0.65, rng = Math.random } = {}) {
    // Both decks, off arena-skills.js rather than off the tree — see skillsFull(). The defence's build is
    // handed to the ring so housePick can play it, instead of the foe standing there swinging bare while the
    // challenger uses everything they own.
    const mySkills = skillsFull(me.classId);
    const myList = Object.values(mySkills);
    let ring = openRing(me, foe, { rng, foeSkills: skillsFull(foe.classId), foeName: "Sim" });

    // ── WHAT A SIMULATED PLAYER DOES WITH THEIR BEAT ─────────────────────────────────────────────────────
    // skillBias is the same policy this harness always modelled: an honest player reaches for a ready ability
    // most of the time and plain-swings the rest. Kept, because "how well is this played" is a question about
    // the person, not about the engine — but it now feeds the real act() instead of a private loop.
    for (let guard = 0; guard < 400 && !ring.over; guard += 1) {
        if (ring.awaiting !== "act") break;
        const ready = myList.filter((a) => !(ring.cd[a.id] > 0));
        const pick = ready.length && rng() < skillBias ? ready[Math.floor(rng() * ready.length)] : null;
        ring = act(ring, { skill: pick, rng });
    }

    const r = ringResult(ring);
    // `beats` is the ring's own beat counter, which is what the bout row on a member's card calls rounds — so
    // a number out of this simulator can now be compared against a number out of the database.
    return { won: Boolean(r.won), beats: ring.beat, unresolved: Boolean(r.unresolved) };
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
