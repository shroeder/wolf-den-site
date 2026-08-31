import { swingFrom, healthFrom, critChanceFrom, critMultFrom, procFrom,
    COUNTER_PER_POINT, HASTE_PER_POINT, LIFESTEAL_PER_POINT, PIERCE_PER_POINT, STUN_PER_POINT } from "@/lib/marketplace/arena-kit.js";
import { ITEMS, sumItemStats, FORGE, forgeWeaponRate, forgeArmourRate } from "@/lib/marketplace/items.js";
import { ARENA_MAX_LEVEL, CLASSES, treeEffects, treeFor } from "@/lib/marketplace/arena-classes.js";
// npcClassForArchetype, so a rung's TREE and its DECK cannot name two different classes.
import { npcClassForArchetype } from "@/lib/marketplace/arena-skills.js";
// The other three stat sources a member has, and the reroll. See arena-npc-build.js.
import { npcExtras, npcReroll, rerollFrac, buildForTier } from "@/lib/marketplace/arena-npc-build.js";

// ── THE GAUNTLET: ENDLESS NPC CHALLENGERS ────────────────────────────────────────────────────────────────────
// Pure. No DB, no server-only — the ladder screen and the engine read the same catalog.
//
// WHY THIS EXISTS. The arena only had other members in it, which produces two dead ends. If nobody is above
// you there is nothing to fight (the state Luke hit at #1: "Nobody above you within reach. You are at the top
// of the Den."), and if you would simply rather not fight a person today there is nothing else to do. A store
// ladder is also small — eighty-four people, most of them not playing on any given evening.
//
// So there is a second ladder made of opponents who are always there and never run out.
//
// ENDLESS BY CONSTRUCTION. Tiers are a FORMULA, not a list. Tier 40 exists, and so does tier 400. What is
// finite is the ART: a BAND covers a stretch of tiers and shares one sprite, and inside a band the numbers
// escalate. Ten sprites therefore cover an unbounded ladder — the alternative is commissioning a new sprite
// every time somebody reaches the end, which is not a ladder anyone can maintain.
//
// The last band repeats forever with the numbers still climbing, which is the honest way to say "there is
// always something harder": no fake ceiling, no "coming soon", just a wall that keeps getting taller.

export const BANDS = [
    { key: "straw", name: "Straw Dummy", from: 1, color: "#c39b6a", blurb: "It does not fight back very hard." },
    { key: "scrapper", name: "Pit Scrapper", from: 4, color: "#9fb3c8", blurb: "All elbows and confidence." },
    { key: "regular", name: "Den Regular", from: 9, color: "#7ed57e", blurb: "Knows what they're doing." },
    { key: "veteran", name: "Veteran", from: 16, color: "#6fd0ff", blurb: "Has done this a lot longer than you." },
    { key: "champion", name: "Champion", from: 25, color: "#ffd75e", blurb: "Wears the laurel for a reason." },
    { key: "warlord", name: "Warlord", from: 36, color: "#ff9f1c", blurb: "Fights like the cage is a favour to you." },
    { key: "titan", name: "Titan", from: 50, color: "#b98cff", blurb: "You are hitting geology." },
    { key: "colossus", name: "Colossus", from: 66, color: "#ff6f7d", blurb: "Something built to end fights." },
    { key: "nightmare", name: "Nightmare", from: 85, color: "#b061ff", blurb: "It should not be in here with you." },
    // No `from` ceiling. Everything from here up is Ascendant, numbered, forever.
    { key: "ascendant", name: "Ascendant", from: 110, color: "#fff0a8", blurb: "The wall that keeps getting taller." },
];

export const bandForTier = (tier) => {
    let band = BANDS[0];
    for (const b of BANDS) if (tier >= b.from) band = b;
    return band;
};

// ── HOW HARD IS TIER N ───────────────────────────────────────────────────────────────────────────────────────
// Roughly geometric, so early tiers come quickly and the curve keeps its teeth forever without any single step
// being a wall. Tuned so a mid-level member with decent gear sits somewhere around tier 12-20 — enough of a
// ladder below them to feel earned, and a very long way still above.
// GROWTH was 1.085, and simulated it is a CLIFF rather than a curve: 96.8% at tier 8, 58.1% at 11, 10.3% at
// 14, 1.0% at 17. A player stalls dead around tier twelve and no amount of play moves them, because gear
// grows far slower than 8.5% a tier. 4.5% keeps every tier meaningfully harder than the last while leaving
// the ladder climbable as you gear up — and it is still unbounded, so "super super hard" still arrives, just
// somewhere you can actually reach.
// These ARE the stat budget now, not an abstract "power": npcPower(t) is how many points of Might, Crit
// Chance, Crit Power and Ferocity a tier gets to spend, in the same units a member's gear is measured in
// (best-in-slot across nine slots totals 644). Set by scripts/check-arena.mjs against four real loadouts.
// Lowered from 34 when rungs started arriving FORGED. Enhancing every piece and rerolling the affixes into a
// few big lines is worth about four and a half rungs on its own, so the stat budget gives that back — the
// difficulty is the same, it is just carried by gear somebody worked rather than by a bigger raw number.
// Calibrated so a member at roughly 40% gear and 30% tree walls at rung 40, which is Luke's own read of where
// he should be: scripts/check-road.mjs.
const BASE_POWER = 25;
const GROWTH = 1.07;

export function npcPower(tier) {
    return Math.round(BASE_POWER * Math.pow(GROWTH, Math.max(1, tier) - 1));
}

// The stat split mirrors what a member brings, so the same engine can fight either without special cases.
// ── A GAUNTLET FIGHTER IS A LOADOUT ──────────────────────────────────────────────────────────────────────────
// They used to carry bespoke `health`/`damage`/`armour` figures on a curve of their own, which meant the ring
// had two kinds of fighter in it and only one of them could be reasoned about from the stat screen. They carry
// THE SAME FOUR STATS A PLAYER'S GEAR CARRIES now — Might, Crit Chance, Crit Power, Ferocity — and the engine
// runs them through the identical ringStats() a member goes through. A Warlord is not a special case; it is a
// kit, and you can read it the way you read your own.
//
// ── AND THEY ARE NOT ALL THE SAME SHAPE ──────────────────────────────────────────────────────────────────────
// With the hidden mitigation roll gone, "harder" cannot mean "secretly luckier" any more, and it should not
// just mean "every number bigger" either — that is a wall you either out-gear or you do not, and no fight in
// the middle of it teaches you anything. So a tier spends its BUDGET differently depending on its archetype,
// and the archetypes cycle, so tier N and tier N+1 want different answers out of you:
//
//   BRUTE      pours it into Might. Races you. Kill it or be killed inside ten rounds.
//   WALL       pours it into Ferocity and sheer bulk. It takes a long time to put down.
//
// ── NO ARMOUR ON AN NPC ──────────────────────────────────────────────────────────────────────────────────────
// Archetypes used to carry a hidden damage-reduction percentage, and it was the single most confusing thing in
// a fight: your damage number said one thing, the bar moved by another, and nothing on screen accounted for
// the difference. Damage reduction is a CLASS idea now — something a member builds and can read off their own
// card — and an NPC's toughness is health, which is the one number a health bar already tells you the truth
// about. `tough` is the old armour expressed as the health multiplier that keeps each archetype exactly as
// hard to kill: a wall's 26% reduction is 1/(1-0.26) = 1.35x the health.
//   DUELIST    pours it into crit. Swingy — it can take a third of you in one beat or whiff for three.
//   BERSERKER  everything into offence, almost nothing into staying alive. A glass cannon: guard the opening
//              and it falls over, trade blindly and it wins.
//   BALANCED   no lever. Whoever built better wins, which is the honest baseline the others deviate from.
//
// The archetype is PRINTED ON THE CARD with its stats, because a shape you cannot see before you commit is
// just another hidden roll wearing a different hat.
//
// ── `bal` — ONE STATED POWER, ONE DIFFICULTY ─────────────────────────────────────────────────────────────
// The weights below decide what an archetype IS. They do not decide what it is WORTH, and for a long time the
// two were confused: a budget spent on health is not worth a budget spent on damage, so the same number
// produced wildly different fights. Measured across all three classes at best-in-slot
// (scripts/sim-archetype-cal.mjs, binary-searching the even fight):
//
//     Brute even at 1,126     Berserker 1,247     Balanced 1,339     Duelist 1,393     Wall 1,572
//
// A Wall therefore needed FORTY PERCENT more budget than a Brute to be the same fight, and the Road hands
// neighbouring rungs near-identical budgets — so walking it lurched. Measured with a real loadout, rung 82
// (Duelist) came in at 74% and rung 83 (Wall) at 98%, one step apart.
//
// `bal` is the correction: the reciprocal of what that archetype's power turned out to be worth. It changes
// how much budget the archetype is HANDED, never how it spends it — so a Wall is still a Wall, it is just
// finally the same difficulty as the Brute next to it. Luke: "we don't want it to spike ever... difficulty is
// more about their skills and strategy vs sheer power level."
//
// Re-derive with sim-archetype-cal.mjs after touching any weight, `tough`, `guard`, or the engine.
//
// Solved against a REAL loadout (sim-archetype-cal.mjs "The Wolf Den"), because the first attempt fitted to
// synthetic best-in-slot fighters did not hold — walked by an actual reaver the Road still swung from 24% on
// one rung to 93% on the next.
//
// ⚠️ THE DIRECTION IS even/mean, NOT mean/even. `even` is the budget an archetype needs to be a fair fight, so
// one that needs MORE than the mean is arriving too WEAK at any shared rung power and must be handed more.
// Getting that backwards does not soften the error, it doubles it: it took the spread from 26 points to 92 and
// turned a Wall into a 98% walkover. Measure, apply, then measure AGAIN — correcting the budget moves the
// fight the next reading is taken from.
// Re-derived 2026-08-19 against the NEW builder. The previous numbers were measured when an NPC went through
// ringStats — an invisible 100-base weapon — and they went stale the moment an NPC became a made-up player
// wearing real gear. Nobody touched a weight; the correction was simply describing different maths, and the
// ladder started lurching again: rung 41 was a 14% fight for the field and rung 42 a 49% one.
// Re-derive with scripts/sim-archetype-cal.mjs after touching any weight, `tough`, or the engine.
// ── RE-DERIVED 2026-08-20, AND THE WALL WAS INVERTED ─────────────────────────────────────────────────────────
// These normalise what an archetype’s point of power is WORTH, so one stated power means one difficulty.
// They were solved under the old damage ceiling and the old armour rule, and both have since moved — so the
// wall, which is the archetype armour helps most, was being handed 37% MORE budget when the calibrator now
// says it should get 32% LESS. That is the whole reason rungs 37 and 42 were unwinnable while 38 and 41 were
// free: the ladder was not lurching, the wall was being paid twice.
//
// Re-solved with scripts/sim-archetype-cal.mjs against a real loadout — binary-searching the budget that
// makes an even fight, per archetype, across all three classes. RE-RUN IT whenever DAMAGE_PER_MIGHT,
// HEALTH_PER_VITALITY, ARMOUR_TO_DOUBLE or STAT_EXPONENT moves; these numbers are downstream of all four.
//
// COMPOSE ITS ANSWER, DO NOT PASTE IT. statsForPower applies these multipliers before the probe fights, so
// the calibrator measures the world WITH them already in effect and its “suggested mult” is a CORRECTION to
// multiply through — new = old x suggested. Pasting the suggestions straight in inverts the ladder: it made
// the wall easy and turned the brute into the new wall, and the count of rungs that get easier as you climb
// went UP, from 15 to 20.
// ── ARCH_BAL IS GONE WITH THE BUDGET IT NORMALISED ───────────────────────────────────────────────────────────
// It was { balanced 0.969, brute 0.811, wall 0.932, duelist 1.184, berserker 0.907 } — a per-archetype
// multiplier on how much BUDGET a shape was handed, so that a rung's stated power meant one difficulty
// whichever shape it rotated onto. There is no budget to hand out any more: a rung's stats are the affixes on
// the gear it wears, and its archetype decides WHICH pieces rather than how much of a number it gets.
//
// What replaces it is measurement, not another constant. Walked with a real member over all 200 rungs: the
// old ladder broke monotonicity on 3 of its 9 transition rungs, the new one on 10 of 29 — the same rate, in a
// band that is simply wider now. If a shape drifts, the lever is its item preference in npcLoadout.

// Deterministic, so tier 40 is the same fighter every time the server starts and two members see one
// opponent. Declared up here because archetypeForTier draws a rung's shape from it.
const hash = (str) => { let h = 2166136261; for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

export const ARCHETYPES = [
    { key: "balanced", name: "Balanced", tell: "No weakness and no lever. Out-build it.",
      w: { might: 0.28, crit_chance: 0.16, crit_power: 0.16, ferocity: 0.40 }, tough: 1.11, guard: 0.22 },
    { key: "brute", name: "Brute", tell: "Hits like a falling wall. End it early.",
      w: { might: 0.44, crit_chance: 0.08, crit_power: 0.12, ferocity: 0.36 }, tough: 1.11, guard: 0.16 },
    { key: "wall", name: "Wall", tell: "Soaks everything. Strip its guard or you are here all day.",
      w: { might: 0.20, crit_chance: 0.10, crit_power: 0.10, ferocity: 0.60 }, tough: 1.35, guard: 0.30 },
    { key: "duelist", name: "Duelist", tell: "Fishing for criticals. It only needs to land one.",
      w: { might: 0.22, crit_chance: 0.24, crit_power: 0.24, ferocity: 0.30 }, tough: 1.14, guard: 0.20 },
    { key: "berserker", name: "Berserker", tell: "All edge, no armour. Survive the opening and it folds.",
      w: { might: 0.40, crit_chance: 0.18, crit_power: 0.20, ferocity: 0.22 }, tough: 1.06, guard: 0.12 },
];
// The first three tiers are always Balanced. A Straw Dummy that rolled Brute is a tutorial that hits back
// harder than the thing after it, and the archetype cycle should not apply before you have met the baseline
// it deviates from.
// ── NO CYCLE AND NO PATTERN. EVERY RUNG IS ITS OWN FIGHTER. ──────────────────────────────────────────────────
// This was `t % 5`, so the shapes marched round in lockstep and a member who learned the order knew what was
// coming forever. Holding a shape for three rungs was worse — the same fight three times.
//
// Luke: "I want the fights to differ each time. not stay the same, and i dont want a pattern during the climb
// either, every fight should attempt to be unique."
//
// Drawn from the rung's own hash instead. Deterministic, so a rung is the same character every time you meet
// it and can be planned against — but there is no order to learn, and two rungs a hundred apart are no more
// alike than two rungs next to each other.
//
// ⚠️ WHICH MAKES POWER THE BUILD'S PROBLEM, NOT THE SHAPE'S. When the shape rotated on a cycle a member's win
// rate swung with the shape rather than with the height. Uniqueness makes that worse, not better, so the
// difficulty of a rung can no longer be a by-product of what it happens to be — see NPC_TARGET in
// arena-npc-build.js, where the tier sets a power target and the chip spend trues each build up to it.
export const archetypeForTier = (t) => {
    const n = Math.max(1, Math.round(t));
    // The first three are always Balanced: a Straw Dummy that rolled Brute is a tutorial that hits back harder
    // than the thing after it, and the shapes should not deviate before you have met the baseline.
    if (n <= 3) return ARCHETYPES[0];
    // Otherwise the SHAPE IS THE BUILD'S. It was its own hash draw, which meant a rung could be a Wall wearing
    // a Berserker's plan — the shape named one thing on the card and the build did another.
    const b = buildForTier(n);
    return ARCHETYPES.find((a) => a.key === b.shape) || ARCHETYPES[0];
};

// ── AN NPC IS A CHARACTER, NOT A STAT BLOCK ──────────────────────────────────────────────────────────────────
// Luke's brief, and it is the same rule the gear rework followed: whatever a member is made of, an opponent is
// made of the same things. A rung is therefore a whole CHARACTER —
//
//   a CLASS, with the passives that class actually has
//   POINTS SPENT in that class's tree, more of them the further up you are
//   GEAR at a rarity band, with real affixes rolled onto it
//   PROCS — crit, riposte, double strike, stun, haste — which are gear affixes, so they are RARE low down and
//           common high up, exactly as a member's wardrobe fills out
//   and an IDENTITY: the fight says what it is carrying before you commit to it
//
// The last one is not decoration. A bout resolves in seconds, so the only place a member can make a decision is
// BEFORE it — and a foe whose shape you cannot see is a coin toss wearing a portrait.

// ── WHICH CLASS A RUNG FIGHTS AS — ONE ANSWER, NOT TWO ───────────────────────────────────────────────────────
// This cycled reaver/warden/runecaller off the TIER, while npcSkills picked the deck off the ARCHETYPE. The two
// disagreed on six of ten sampled rungs: rung 100 spent forty-one points on WARDEN passives and then brought a
// RUNECALLER deck. A member is one class — the tree they bought is the tree their skills come from — so the
// archetype decides, and the skills' own map is the one that answers.
// ── AND THE CLASS IS DRAWN, NOT DERIVED ──────────────────────────────────────────────────────────────────────
// It was npcClassForArchetype, which collapsed the ladder onto five characters: a Wall was always a Warden
// because the only Wall branch plan was a Warden's. There is a plan for all fifteen pairings now (NPC_BRANCH),
// so the class is its own draw off the rung's hash and a Reaver Wall is a fighter you can actually meet.
//
// Still one class per rung — the tree it buys and the deck it brings both read this.
// Its build's class, so the tree it buys, the deck it brings and the plan it follows are one character.
export const npcClassFor = (tier) => buildForTier(tier)?.cls || "reaver";

// ── HOW MANY TREE POINTS A RUNG HAS SPENT, AND IT MAY NOT EXCEED A MEMBER'S ──────────────────────────────────
// The ceiling was 60. A member's tree budget is their arena LEVEL, one point a level, and arena level stops
// dead at ARENA_MAX_LEVEL — 24 — for the exact reason written on that constant: "a member's tree budget grew
// forever and the top of the ladder could never be caught." So the ladder was handing its rungs two and a half
// times the hard player ceiling, which is the same class of fakeness as the stat budget. Rung 100 carried 41.
//
// Measured: the furthest-along member is level 24 and has spent 24. Nobody can ever have more.
//
// ⚠️ THIS FLATTENS THE TOP, and that is the honest consequence rather than an oversight. Every rung past about
// 60 now has the same tree as a maxed member, so the difficulty above it is carried by gear and the forge
// alone. The lever, if the top needs to climb again, is more gear — authored as real items.
const NPC_POINTS_PER_TIER = 0.42;
export const npcPointsFor = (tier) =>
    Math.max(0, Math.min(ARENA_MAX_LEVEL, Math.round(Math.max(0, tier - 3) * NPC_POINTS_PER_TIER)));

// Spend them the way a member must: one at a time, respecting each node's rank cap and its gate. Deterministic
// per (tier, class), so the same rung is the same build every time you meet it.
function npcTree(classId, points, tier) {
    const tree = treeFor(classId);
    if (!tree.length || points <= 0) return {};
    const taken = {};
    const total = () => Object.values(taken).reduce((a, n) => a + n, 0);
    // ── THE BUILD'S OWN NODES FIRST ──────────────────────────────────────────────────────────────────
    // Points used to go in flat tier order, which spread them evenly and made every Warden the same Warden.
    // A build names the passives it is ABOUT (see BUILDS in arena-npc-build.js) and those are bought first,
    // in the order written, before anything else. Gates and rank caps still apply exactly as takeNode applies
    // them — a preference cannot buy a tier-3 node at four points spent.
    const want = buildForTier(tier)?.tree || [];
    const rank = (n) => { const i = want.indexOf(n.id); return i < 0 ? want.length + n.tier : i; };
    const order = [...tree].sort((a, b) => (rank(a) - rank(b)) || (a.tier - b.tier) || (a.id < b.id ? -1 : 1));
    let guard = 0;
    while (total() < points && guard < 500) {
        guard += 1;
        let placed = false;
        for (let i = 0; i < order.length; i += 1) {
            // ⚠️ NO `+ tier` ROTATION ANY MORE. It used to offset the start of the sweep by the rung, which was
            // the only variety the tree had when every build shared one order — and it would now rotate the
            // build's own preference away, spending a Thornmail Warden's first points on whatever node the
            // rung number happened to land on.
            const n = order[i];
            if (total() >= points) break;
            if ((taken[n.id] || 0) >= n.ranks) continue;
            if (total() < (n.needs || 0)) continue;
            taken[n.id] = (taken[n.id] || 0) + 1;
            placed = true;
        }
        if (!placed) break;
    }
    return taken;
}

// ── HOW MUCH OF THEIR GEAR IS ENCHANTED ──────────────────────────────────────────────────────────────────────
// Procs are gear affixes, so their density is a statement about how good the wardrobe is: nothing at the bottom
// of the ladder, because a Straw Dummy has not rolled a Riposte, and everything by the top. Ramped rather than
// stepped so no single rung is where the game suddenly starts critting you.
const PROC_FULL_TIER = 60;
// ── THE PROC BUDGET WAS HERE ─────────────────────────────────────────────────────────────────────────────────
// procDensity, PROC_CEILING, PROC_LEAN, rerollFrac, npcAffixLines and npcProcs built a rung's pierce,
// lifedrink, riposte, stun and haste out of a budget with ceilings of its own. They are gear affixes for a
// member and they are gear affixes for a rung now — see npcStats. What survived is below, because it
// describes the WARDROBE rather than substituting for it.

// How far a rung has taken the forge. Nothing at the bottom — you do not forge a Straw Dummy's stick — and the
// peak by the time the ladder is well past anything a member is wearing.
const NPC_FORGE_PER_TIER = 0.32;
export const npcForgeLevel = (tier) => Math.max(0, Math.min(FORGE.MAX_LEVEL,
    Math.floor(Math.max(0, Math.round(tier) - 6) * NPC_FORGE_PER_TIER)));
// ── WHAT TO WARN THEM ABOUT ──────────────────────────────────────────────────────────────────────────────────
// Only the things that change how the fight GOES, in the member's own words, biggest first. A list of every
// stat would be a stat block again; this is the two or three facts you would want shouted across the sand
// before the bell.
const TELL_RULES = [
    // ⚠️ THROUGH chanceFrom, NOT A COPY OF THE RATE. These five carried the flat per-point numbers written out
    // by hand — 0.0025 and 0.005 — which was already a second copy of the engine's arithmetic and became a
    // WRONG one the moment those stats went onto a curve. This list only orders the tells, so the error would
    // never have thrown: it would just have promised "stuns" loudest on the foe least likely to.
    { key: "lifesteal", from: (s, p) => procFrom(s.lifesteal, LIFESTEAL_PER_POINT) + (p.lifestealBonus || 0), text: "drinks what it lands" },
    { key: "counter", from: (s, p) => procFrom(s.counter, COUNTER_PER_POINT) + (p.counterBonus || 0), text: "strikes back when you hit it" },
    { key: "stun", from: (s, p) => procFrom(s.stun, STUN_PER_POINT) + (p.stunBonus || 0), text: "stuns" },
    { key: "haste", from: (s, p) => procFrom(s.haste, HASTE_PER_POINT) + (p.hasteBonus || 0), text: "hastes itself" },
    { key: "pierce", from: (s) => procFrom(s.pierce, PIERCE_PER_POINT), text: "goes through armour" },
    { key: "bleed", from: (s, p) => p.bleedChance || 0, text: "makes you bleed" },
    { key: "burn", from: (s, p) => p.burnChance || 0, text: "sets you alight" },
    { key: "ward", from: (s, p) => p.ward || 0, text: "fights behind a shield" },
    { key: "guard", from: (s, p) => p.guardChance || 0, text: "raises a guard" },
    { key: "thorns", from: (s, p) => (p.thorns || 0) + (p.iceThorns || 0), text: "returns damage" },
    { key: "freeze", from: (s, p) => p.freeze || 0, text: "freezes" },
];
export function npcTells(stats = {}, perks = {}) {
    const hits = TELL_RULES
        .map((r) => ({ key: r.key, text: r.text, v: r.from(stats, perks) || 0 }))
        .filter((r) => r.v >= 0.03)
        .sort((a, b) => b.v - a.v)
        .slice(0, 3);
    const crit = (Number(stats.crit_chance) || 0) / 1000;
    if (crit >= 0.25 && hits.length < 3) hits.push({ key: "crit", text: "crits often", v: crit });
    return hits.map((h) => ({ key: h.key, text: h.text, pct: Math.round(Math.min(1, h.v) * 100) }));
}

/**
 * Everything a rung IS: class, tree, gear, affixes — and the plain-language tells that go on its card.
 * One place, so the fight, the card and any simulation are all looking at the same character.
 */
export function npcBuild(tier, seed = 0) {
    const t = Math.max(1, Math.round(tier));
    const arch = archetypeForTier(t);
    const classId = npcClassFor(t);
    const points = npcPointsFor(t);
    const taken = npcTree(classId, points, t);
    const stats = npcStats(npcPower(t), arch.key, seed, t);
    const perks = treeEffects(classId, taken);
    const cls = CLASSES.find((c) => c.id === classId) || {};
    return {
        classId, className: cls.name || classId, points, taken, stats, perks,
        archetype: arch.key, archetypeName: arch.name, tell: arch.tell,
        tells: npcTells(stats, perks),
    };
}

// The budget a tier gets to spend across the four stats. Kept as npcPower so the existing tier curve, the
// matchmaker and every saved `npc_best` still mean what they meant.
export function npcFor(tier) {
    const t = Math.max(1, Math.round(tier));
    const band = bandForTier(t);
    const power = npcPower(t);
    const arch = archetypeForTier(t);
    const budget = power;
    // Within a band, later tiers are the "II / III / IV" of it — a Veteran IV is plainly a harder Veteran.
    const idx = t - band.from + 1;
    const numeral = ["", " II", " III", " IV", " V", " VI", " VII", " VIII", " IX", " X"][Math.min(9, idx - 1)] || ` ${idx}`;
    return {
        id: `npc:${t}`,
        npc: true,
        // NO `tempo` HERE ANY MORE. It was handed in because an NPC's Ferocity was a budget on nobody's
        // scale; it comes off the wardrobe now, so a rung goes through tempoOf exactly as a member does.
        tier: t,
        band: band.key,
        name: `${band.name}${idx > 1 ? numeral : ""}`,
        blurb: band.blurb,
        color: band.color,
        sprite: `/images/arena/npc/${band.key}.webp`,
        archetype: arch.key,
        archetypeName: arch.name,
        tell: arch.tell,
        // ── THE STAT LINE ── the same four a player wears, so ringStats() needs no idea which it is holding.
        // ── VITALITY IS WHAT BUYS HEALTH NOW, AND NOTHING WAS BUYING IT ──────────────────────────────────
        // These weights spend the LARGEST share of the budget on `ferocity` (0.22 to 0.60) because that is
        // what health was made of when they were written — arena-kit still records the old formula, "health
        // = HEALTH_BASE + Ferocity x 2.5". The gear rework made VITALITY the health stat and ringStats reads
        // `vitality`; neither of the two places that build an NPC stat line ever started producing any.
        //
        // So every Gauntlet tier and every Road fighter in the game has been standing on the flat 200 base
        // with its whole health budget going nowhere: 212hp at rung 5 and 212hp at rung 45, while the same
        // budget pushed rung 45's damage to 1,324 and its crit multiplier to x62. Luke, the hour the Road
        // reopened: "the enemies at rung 30 are like super weak now, they went from 5k hp to 300 and die
        // including 1 shot."
        //
        // The ferocity weight IS the health weight — it was authored as one, and the archetype note above
        // depends on it ("an eight-to-one health gap, so a Berserker died in two rounds and a Wall took
        // twenty"). So it buys Vitality. `ferocity` stays for anything else that reads it.
        // ── DRESSED, NOT TABULATED ───────────────────────────────────────────────────────────────────────
        // Same builder the Road uses. A Gauntlet tier is a wardrobe now: a weapon with a base damage, six
        // pieces of armour, a shield with a block chance, and whatever affixes those items carry — scaled to
        // this tier's budget and biased by the archetype.
        ...npcStats(budget, arch.key, t, t),
        // Toughness is already folded into vitality by npcStats; kept on the line for the card only, and
        // nothing downstream may multiply by it a second time.
        tough: arch.tough || 1,
        // ── HOW HARD THEY BRACE ──────────────────────────────────────────────────────────────────────────
        // Guard stopped being one flat share for every fighter, so an NPC that inherited the member default
        // would brace for 12% — a board-wide difficulty cut nobody asked for, landing right after the Road
        // was tuned. These are set per archetype instead, averaging what they used to get, which keeps the
        // curve where it was and makes the Wall's tell ("strip its guard") literally true.
        guard: arch.guard ?? 0.20,
        // Damage reduction and accuracy are both retired — armour is the whole of mitigation and every swing
        // lands — so they are not emitted at all rather than emitted as zero and read by nothing.
        gearPower: power,
        // Element cycles so consecutive tiers are not all answerable with one affinity — the wheel stays a
        // reason to re-attune rather than something you solve once.
        element: ["fire", "water", "earth", "storm", "light", "shadow"][t % 6],
        // Speed comes off the weapon npcStats picked, in attacks per second, the same as a member's. It used
        // to be `10 + power * 0.09` — the OLD clock, on a scale where a member reads about 1.1, so a mid-tier
        // NPC arrived at 13 and swung a dozen times per member swing.
    };
}


// ── AN NPC IS A MADE-UP PLAYER ───────────────────────────────────────────────────────────────────────────────
// Luke's call, and it removes a whole class of bug rather than a single one: every fight in the game — the
// Gauntlet, the Road, a fishing encounter, a town raid — is a bout against a fighter built the way a member is
// built. Same stat vocabulary, same converter, same engine.
//
// WHAT IT REPLACES. NPCs carried might/crit/vitality and nothing else, and were converted by ringStats() while
// members went through fighterFrom(). The two had drifted: ringStats called swingFrom(might) with no weapon,
// so it fell back to WEAPON_BASE_REF (100) — an invisible weapon four times better than the best one anybody
// owns. On identical stat lines an NPC hit for 2000 and a member for 500. Nothing about that was visible from
// either side of the ring, and no amount of tuning the tier curve could have found it.
//
// HOW A BUDGET BECOMES A LOADOUT. Rather than invent a base_damage and an armour figure per tier — two more
// numbers on two more curves, drifting from the player field the moment either changes — the NPC is dressed
// out of the real catalogue. A tier picks a rarity band, one item per slot is chosen deterministically from
// it, and sumItemStats gives a stat block with a player's PROPORTIONS: a weapon's base damage, armour spread
// over six pieces, a shield's block chance, the affixes those items happen to carry. The block is then scaled
// to hit the tier's power budget exactly, so the curve stays smooth between rarity steps instead of stepping
// nine times and stopping.
//
// The archetype still decides SHAPE, applied as a bias on top: a Brute's loadout is the same loadout with its
// might multiplied up and its bulk down. What an archetype is has not changed; what it is made of has.
const NPC_RARITY_LADDER = ["common", "rare", "epic", "legendary", "mythic", "ascendant", "eternal", "celestial", "primordial"];
// Tier 1 opens in common and the ladder tops out around the Gauntlet's Ascendant band. Beyond that the gear
// stops climbing and only the scale below does, which is the honest version of "it keeps getting taller".
// ── THE BANDS SPAN THE WHOLE LADDER, NOT THE FIRST HALF OF IT ────────────────────────────────────────────────
// 13 put the top rarity on at rung 104, so all nine bands were spent inside the first half and rungs 104-200
// wore the same wardrobe. Worse, it made the climb violent where it should be gradual: a rung's gear DOUBLED
// between 60 and 80, which is most of why the reference member sat at 52% on rung 60 and 0% on rung 80.
//
// Nine bands over 198 rungs at 22 apiece — the ladder is LADDER_MAX 200, so the last band lands where the
// ladder ends and every rung between has somewhere to grow into.
const TIERS_PER_RARITY = 22;
const bandFor = (t) => Math.min(NPC_RARITY_LADDER.length - 1, Math.floor(Math.max(1, t) / TIERS_PER_RARITY));
const rarityForTier = (t) => NPC_RARITY_LADDER[bandFor(t)];

// ── A WARDROBE IS NOT ALL ONE RARITY ─────────────────────────────────────────────────────────────────────────
// Every slot took rarityForTier, so a rung wore ten pieces of exactly one rarity — rung 100 was celestial in
// all ten. Luke: "seems like a poor constraint to force them to wear a rarity across all pieces."
//
// It is also not what a member looks like. A real wardrobe is mostly at your band, with a couple of pieces you
// have not replaced yet and occasionally one lucky drop from above. So each slot rolls an offset, weighted to
// sit at the band: four at band, three below, one above. Deterministic off (tier, seed, slot) like everything
// else here, so a rung is still the same fighter every time you meet it.
//
// The band itself is untouched, so this shifts a rung's power by less than moving it a rung.
// ⚠️ THE OFFSET IS PER SLOT, NOT PER RUNG, AND THAT IS THE WHOLE TRICK.
// Rolled with the tier in the hash it wrecked monotonicity: rung N could roll a lucky helmet while N+1 rolled
// an unlucky one, so a rung got EASIER than the one below it. Measured — 33 such breaks against 10 before,
// which is the failure a member reads as the game being broken.
//
// Keyed on the slot alone, every rung wears the same SHAPE of wardrobe — the same slots run a band behind,
// the same one runs ahead — and the whole set climbs together. Which is also the truer picture: a real player
// lags on the same piece for ages and has one lucky drop they will not replace.
const RARITY_SPREAD = [0, 0, 0, 0, -1, -1, -2, 1];
const rarityForSlot = (tier, slot, i) => {
    const off = RARITY_SPREAD[hash(`${slot}:${i}:rarity`) % RARITY_SPREAD.length];
    const at = Math.max(0, Math.min(NPC_RARITY_LADDER.length - 1, bandFor(tier) + off));
    return NPC_RARITY_LADDER[at];
};

// Deterministic, so tier 40 is the same fighter every time the server starts and two members see one opponent.

const NPC_SLOTS = ["main_hand", "off_hand", "helmet", "chest", "belt", "boots", "back", "amulet", "ring", "ring"];
let _bySlot = null;
function slotPool(slot, rarity) {
    if (!_bySlot) {
        _bySlot = {};
        for (const it of ITEMS) {
            if (!it.slot || !it.stats) continue;
            (_bySlot[it.slot] ||= []).push(it);
        }
    }
    const all = _bySlot[slot] || [];
    const hit = all.filter((i) => i.rarity === rarity);
    // Not every slot exists at every rarity — fall back to the whole slot rather than sending a fighter out
    // with an empty hand, which would cost them their entire weapon rather than a tier of it.
    return hit.length ? hit : all;
}

// How far through its rarity band a tier sits, 0..1. A band is TIERS_PER_RARITY wide.
const bandProgress = (tier) => (Math.max(1, tier) % TIERS_PER_RARITY) / TIERS_PER_RARITY;

/**
 * The wardrobe a tier fights in. Deterministic per (tier, seed), one item per slot.
 *
 * RANKED, NOT ROLLED. Picking uniformly at random inside the band made the ladder non-monotonic: tier 5 rolled
 * an 8-base weapon where tier 3 had a 10-base one, so the fifth rung hit softer than the third. That is fine
 * for a member — gear is luck — and unacceptable for a difficulty curve, where the whole promise is that the
 * next one is harder. Each slot's pool is sorted by the intrinsic that slot contributes and indexed by how far
 * through the band the tier sits, so a wardrobe climbs steadily and steps up at every band boundary. The seed
 * still chooses BETWEEN equals, so two fighters of the same tier need not be in identical kit.
 */
// ── AND THE ARCHETYPE IS WHAT IT WEARS ───────────────────────────────────────────────────────────────────────
// It used to be a reweighting of a stat budget: a Wall was handed the same points as a Brute and spent more of
// them on toughness. Now that a rung's stats ARE its wardrobe (see npcStats), the archetype has to be
// expressed the way a member expresses one — by picking different pieces.
//
// TWO AXES, KEPT APART. The intrinsic ranking is the POWER axis and it is calibrated (bandProgress walks it as
// you climb within a rarity band, and check:road is anchored to it). Sorting the pool by archetype instead
// would have moved every rung's difficulty as a side effect of giving it a personality. So the archetype
// chooses from a WINDOW around the piece the power axis picked: same strength, different character.
const ARCH_WINDOW = 3;

export function npcLoadout(tier, seed = 0, archKey = null) {
    const p = bandProgress(tier);
    const arch = ARCHETYPES.find((a) => a.key === archKey) || null;
    const ids = [];
    NPC_SLOTS.forEach((slot, i) => {
        const pool = slotPool(slot, rarityForSlot(tier, slot, i));
        if (!pool.length) return;
        const key = (it) => (Number(it.stats?.base_damage) || 0) + (Number(it.stats?.armor) || 0)
            + (Number(it.stats?.block_chance) || 0) * 100;
        const ranked = [...pool].sort((a, b) => key(a) - key(b) || (a.id < b.id ? -1 : 1));
        const at = Math.min(ranked.length - 1, Math.floor(p * ranked.length));
        // The window is centred on the power axis's pick, so nothing in it is stronger or weaker by design.
        const lo = Math.max(0, at - Math.floor(ARCH_WINDOW / 2));
        const window = ranked.slice(lo, lo + ARCH_WINDOW);
        // `w.ferocity` was authored as the HEALTH weight (see the note in npcFor), so it prices vitality as
        // well as speed — the one place the old weights' history still shows through.
        const want = (it) => {
            if (!arch) return 0;
            const st = it.stats || {};
            return (Number(st.might) || 0) * arch.w.might
                + (Number(st.vitality) || 0) * arch.w.ferocity * (arch.tough || 1)
                + (Number(st.ferocity) || 0) * arch.w.ferocity
                + (Number(st.crit_chance) || 0) * arch.w.crit_chance
                + (Number(st.crit_power) || 0) * arch.w.crit_power;
        };
        const best = Math.max(...window.map(want));
        // Ties are broken by the seed, so two rungs of the same archetype are not the same fighter.
        const same = window.filter((x) => want(x) === best);
        ids.push(same[hash(`${tier}:${seed}:${slot}:${i}`) % same.length].id);
    });
    return ids;
}

/**
 * A full, gear-shaped stat line for an opponent: what a member would have if they were wearing this.
 * Everything the engine reads comes out of here in the same vocabulary a wardrobe uses.
 */
export function npcStats(power, archKey, seed = 0, tier = null) {
    const arch = ARCHETYPES.find((a) => a.key === archKey) || ARCHETYPES[0];
    const t = tier ?? tierForPower(power);

    // ── EVERY NUMBER HERE COMES OFF THE GEAR. THERE IS NO BUDGET ANY MORE. ───────────────────────────────
    // Luke: "there should be no fakeness to npc math, it should use the same constraints as players. each npc
    // under the hood should be using the same code pathways as the player just with a hand selected build and
    // gear set."
    //
    // The gear half was already real — npcLoadout picks catalogue items and sumItemStats sums them, so
    // base_damage, speed, armour and block chance have always been honest. The POINTS were not: might,
    // vitality, ferocity and both crit stats were `npcPower(tier) x archetype weight`, a number with no
    // wardrobe behind it. Those pieces were carrying affixes the whole time and this function threw them away.
    //
    // What that cost, measured before the change: the ladder asked for 78,453 points at rung 120 while the
    // best wardrobe that exists in the game carries 1,274. A 62x gap between what an opponent was made of and
    // what a member could ever be made of — and every formula written for members broke somewhere inside it.
    // Ferocity was the plainest case: 30,408 at rung 120 against a member's 20-140, which is why tempo had to
    // be handed in rather than derived (a tempo of 43, a swing every 156ms). Fix the points and npcTempo
    // deletes itself, which it has.
    //
    // ⚠️ THE LADDER NOW ENDS WHERE THE CATALOGUE DOES. Rungs past the top rarity band wear the same wardrobe
    // as the band below and only the forge and the tree keep climbing. That is the honest consequence of the
    // rule and it is left visible rather than papered over: the fix is more gear, authored as real items, not
    // a second number system.
    // The rung's own class, drawn from its hash — the same one npcBuild spends tree points in and the same
    // one its deck comes from. npcClassForArchetype is only a fallback for a caller with no rung.
    const classId = t ? npcClassFor(t) : npcClassForArchetype(arch.key);
    const build = buildForTier(t);

    // ── AND IT HAS BEEN TO THE BENCH ─────────────────────────────────────────────────────────────────────
    // A rung wore whatever its items shipped with, which is the one thing no member above the early rungs
    // does. Value MOVES onto what this build wants and nothing is created — the crafting rule — so how good
    // the set is stays set by the gear and rerolling only decides how few lines it sits on.
    const gear = npcReroll(sumItemStats(npcLoadout(t, seed, arch.key)), build.wants, rerollFrac(t));

    // ── AND THEY HAVE ENHANCED IT ────────────────────────────────────────────────────────────────────────
    // A rung high on the ladder should not be carrying an unforged weapon. Every piece is levelled at the
    // forge, which is exactly what a member at that height has done — the rates are the forge's own, so the
    // two cannot drift. This is why a rung climbs faster than the rarity bands alone would take it.
    const forge = npcForgeLevel(t);
    const forged = (v, rate) => Math.round((Number(v) || 0) * (1 + rate * forge));
    // The affixes lift too, because a member's forge raises their affix lines and not only the piece. Rate is
    // FORGE.NPC_LIFT — the Road's own model of what a forged set is worth, already used for exactly this
    // before the procs came off a budget. One model, not a second one invented here.
    const lift = 1 + FORGE.NPC_LIFT * Math.min(1, forge / FORGE.MAX_LEVEL);
    const aff = (k) => Math.round((Number(gear[k]) || 0) * lift);

    const out = {
        base_damage: forged(gear.base_damage, forgeWeaponRate) || undefined,
        speed: Number(gear.speed) || undefined,
        armor: forged(gear.armor, forgeArmourRate),
        forgeLevel: forge,
        block_chance: Number(gear.block_chance) || 0,
        // The four a member builds.
        might: aff("might"),
        vitality: aff("vitality"),
        ferocity: aff("ferocity"),
        tenacity: aff("tenacity"),
        // The crits.
        crit_chance: aff("crit_chance"),
        crit_power: aff("crit_power"),
        // And the procs, which were their own invented budget (npcProcs, PROC_CEILING) and are now simply
        // the affixes the wardrobe happens to carry — rare low down and common high up, because that is how
        // a real wardrobe fills out. Exactly what the comment above ARCHETYPES always claimed they were.
        pierce: aff("pierce"),
        lifesteal: aff("lifesteal"),
        counter: aff("counter"),
        stun: aff("stun"),
        haste: aff("haste"),
        fortune: aff("fortune"),
        // Kept as the tier's power for matchmaking and for every stored npc_best, which still mean what they
        // meant. It is no longer spent on anything.
        gearPower: Math.max(1, Math.round(power)),
    };

    // ── AND THE THREE SOURCES BESIDES GEAR ───────────────────────────────────────────────────────────────
    // combatStats merges FOUR for a member — gear, pets, badges and the casino Counter — and a rung had one.
    // Measured across the eight most active members, badges alone run 8% to 35% of what their gear carries
    // and pets another 12% to 34% on top, so the ladder was calibrated against a fiction in which the player
    // is only their wardrobe.
    //
    // Added AFTER the forge lift, deliberately: a pet is not a piece of gear and a member's forge does not
    // enhance their badges.
    // `out` is handed over so the chip spend can see what the gear already gave this build and buy the
    // difference — see casinoTrim. Without it a rung's difficulty is whatever shape it happened to draw.
    const extras = npcExtras(t, classId, arch.key, out);
    for (const [k, v] of Object.entries(extras.stats)) out[k] = (Number(out[k]) || 0) + v;
    return out;
}

// The inverse of npcPower, so a Road rung quoted only as a power still knows which wardrobe to wear.
export function tierForPower(power) {
    const p = Math.max(1, Number(power) || 1);
    return Math.max(1, Math.round(Math.log(p / BASE_POWER) / Math.log(GROWTH)) + 1);
}

/**
 * A stat line for an opponent that is NOT on the tier ladder — the long PvE road (arena-ladder.js).
 *
 * It spends a power budget through the same archetype weights npcFor uses, so a Wall on the road and a Wall in
 * the Gauntlet want the same answer out of you. Kept here rather than in arena-ladder.js so there is one place
 * that knows how a budget becomes four numbers.
 */
export function statsForPower(power, archKey, element = null, seed = 0) {
    const arch = ARCHETYPES.find((a) => a.key === archKey) || ARCHETYPES[0];
    // ONE BUILDER FOR EVERY OPPONENT IN THE GAME. The Road used to spend a budget across four stats here while
    // the Gauntlet did the same thing thirty lines up and a fishing monster did it a third way — three copies
    // of "how a budget becomes a fighter", which is three chances to forget the stat that was added last week.
    // npcStats dresses them all out of the real catalogue instead.
    return {
        ...npcStats(power, archKey, seed),
        // NO `tempo`. It was given rather than derived because this fighter's Ferocity was a gear budget in
        // the thousands and tempoOf answered 79 at rung 100. Ferocity is what the wardrobe carries now, so
        // the rate comes out of tempoOf like a member's.
        // `tough` and `guard` stay on the line for anything that reads them off the card. tough is no longer
        // multiplied into vitality — npcStats has no number to multiply — it now weights which pieces the
        // archetype reaches for in npcLoadout, so nothing may apply it a second time here either.
        tough: arch.tough || 1,
        guard: arch.guard ?? 0.20,
        element: element || ["fire", "water", "earth", "storm", "light", "shadow"][seed % 6],
    };
}

// ── WHAT AN NPC FIGHTS WITH ──────────────────────────────────────────────────────────────────────────────────
// Real named moves out of the same eleven kinds members use, not a bare swing. Two things matter here:
//
//   DETERMINISTIC BY TIER — a given tier always brings the same two moves, so losing to it teaches you
//   something and the rematch is a plan rather than another dice roll. This is the one advantage the Gauntlet
//   has over fighting a member, and throwing it away for variety would be a bad trade.
//
//   HARDER TIERS GET NASTIER KINDS — the early bands swing and bleed, the late ones drain and execute.
const NPC_KIT = [
    { kind: "strike", name: "Heavy Blow", sprite: "/images/arena/skill-firstHitMult.webp", power: 2.0, acc: -0.12, cd: 3 },
    { kind: "rend", name: "Ragged Cut", sprite: "/images/arena/skill-eruptChance.webp", power: 1.4, acc: -0.06, cd: 3 },
    { kind: "flurry", name: "Rain of Blows", sprite: "/images/arena/skill-onslaught.webp", power: 0.85, acc: -0.10, cd: 3, hits: 3 },
    { kind: "sunder", name: "Armour Break", sprite: "/images/arena/skill-giantSlayer.webp", power: 1.5, acc: -0.07, cd: 4 },
    { kind: "spell", name: "Elemental Lash", sprite: "/images/arena/skill-attuned.webp", power: 2.1, acc: -0.13, cd: 4 },
    { kind: "drain", name: "Life Tithe", sprite: "/images/arena/skill-bloodlust.webp", power: 1.8, acc: -0.10, cd: 3 },
    { kind: "execute", name: "Finisher", sprite: "/images/arena/skill-opportunist.webp", power: 2.3, acc: -0.15, cd: 4 },
];

// ── AND TEN THINGS NO MEMBER CAN LEARN ───────────────────────────────────────────────────────────────────────
// The kit above is drawn from the same eleven kinds the skill tree grants, which is why nothing on the road
// has ever surprised anybody: you know what Rend does because you can buy Rend. These are NPC-only, they are
// resolved in arena.js's defender branch, and no tree node grants any of them.
//
// Each one is a QUESTION rather than a bigger number, and each has an answer you can act on the beat you see
// the tell:
//
//   Shatterguard   eats your banked brace and throws it back    → don't sit on a shield against it
//   Dread Howl     your damage down 30% for three               → burst before it lands, or ride it out
//   Hobbling Chain your accuracy down 18 for three              → your big committed swings get worse; jab
//   Soulbrand      their next landed blow is a guaranteed crit  → brace THIS beat, not the next one
//   Bonefeast      heals them by a third of what they've LOST   → kill them from high, not from low
//   Second Wind    clears their burn and sunder, banks a shield → don't spend a rend right before it
//   Deathknell     a three-beat timer, then a 2.8x hit          → the clock is visible; be ready or be gone
//   Blood Frenzy   +45% their damage, HALF their guard          → the window: hit them while it's up
//   Willbreaker    everything you have cooling gains a turn     → holding a skill back has a cost now
//   Gravebind      your Guard banks half for two beats          → the anti-turtle, aimed straight at Wardens
//
// Deliberately NOT here: anything that skips your turn, anything undodgeable, anything that reads as the game
// taking the controls away. Losing to a move you could see and answer is a lesson; losing to one you couldn't
// is a bug report.
const NPC_ONLY = [
    { kind: "shatter", name: "Shatterguard", sprite: "/images/arena/skill-giantSlayer.webp", power: 1.2, acc: -0.20, cd: 4 },
    { kind: "howl", name: "Dread Howl", sprite: "/images/arena/skill-bloodlust.webp", power: 0.9, acc: -0.15, cd: 5 },
    { kind: "snare", name: "Hobbling Chain", sprite: "/images/arena/skill-onslaught.webp", power: 1.0, acc: -0.15, cd: 5 },
    { kind: "brand", name: "Soulbrand", sprite: "/images/arena/skill-firstHitCrit.webp", power: 0.8, acc: -0.18, cd: 5 },
    { kind: "feast", name: "Bonefeast", sprite: "/images/arena/skill-bloodlust.webp", power: 0, cd: 5 },
    { kind: "rally", name: "Second Wind", sprite: "/images/arena/skill-packTactics.webp", power: 0, cd: 6 },
    { kind: "doom", name: "Deathknell", sprite: "/images/arena/skill-overcharge.webp", power: 0, acc: -0.22, cd: 7 },
    { kind: "frenzy", name: "Blood Frenzy", sprite: "/images/arena/skill-vanguard.webp", power: 0, acc: -0.18, cd: 5 },
    { kind: "siphon", name: "Willbreaker", sprite: "/images/arena/skill-attuned.webp", power: 1.1, acc: -0.16, cd: 5 },
    { kind: "bind", name: "Gravebind", sprite: "/images/arena/skill-eruptChance.webp", power: 1.0, acc: -0.16, cd: 5 },
];

// Which NPC-only move an opponent brings, by archetype — the same rule as the normal kit, so the shape you can
// read on the card is still the shape that swings at you. Two each, picked off the rung so a given fighter
// always brings the same one and the rematch is a plan.
const ARCH_ONLY = {
    balanced: ["snare", "brand"],
    brute: ["shatter", "frenzy"],
    wall: ["rally", "feast"],
    duelist: ["siphon", "doom"],
    berserker: ["howl", "bind"],
};

/**
 * The NPC-only move for a fighter, or null if they are not hard enough to have earned one.
 *
 * `depth` is the gate and it is the whole difficulty dial for this feature: below it an opponent fights out of
 * the ordinary kit and the road stays a warm-up, above it every fighter brings one thing you cannot answer
 * with knowledge of your own tree.
 */
export function npcOnlyMove(tier, archKey, scale = 1) {
    const t = Math.max(1, Math.round(tier));
    if (t < NPC_ONLY_FROM) return null;
    const want = ARCH_ONLY[archKey] || ARCH_ONLY.balanced;
    // Which of the archetype's two, chosen off the tier so it is fixed per fighter rather than rolled.
    const pick = want[t % want.length];
    const move = NPC_ONLY.find((m) => m.kind === pick);
    if (!move) return null;
    return { ...move, power: Math.round((move.power || 0) * scale * 100) / 100 };
}

// From here on, every opponent carries one. Before it, none do — so the early road is still the place you
// learn the ordinary rules before it starts breaking them.
export const NPC_ONLY_FROM = 12;

/**
 * `archKey` overrides the archetype the moves are chosen for. The Long Road rotates its OWN archetypes
 * (arena-ladder.js) and prints the result on the card as a tell — without this the card promised a Wall and
 * the fighter swung a Berserker's kit, because the moves were being picked off archetypeForTier() instead.
 */
export function npcAbilities(tier, archKey = null) {
    const t = Math.max(1, Math.round(tier));
    const n = npcFor(t);
    // How deep into the kit this tier may reach. A Straw Dummy gets the first move; an Ascendant gets any.
    const depth = Math.min(NPC_KIT.length, 1 + Math.floor(t / 9));
    // THE MOVES MATCH THE BUILD. A wall that opened with Finisher was a mixed message; now the archetype you
    // can read on the card is the archetype that swings at you, so recognising one is worth something.
    const BY_ARCH = {
        balanced: ["strike", "spell"], brute: ["strike", "sunder"], wall: ["drain", "rend"],
        duelist: ["flurry", "spell"], berserker: ["flurry", "execute"],
    };
    const arch = archKey || archetypeForTier(t).key;
    const want = BY_ARCH[arch] || BY_ARCH.balanced;
    const allowed = NPC_KIT.slice(0, depth);
    const chosen = want.map((k) => allowed.find((x) => x.kind === k)).filter(Boolean);
    if (!chosen.length) chosen.push(NPC_KIT[0]);
    // Tier scales what the moves are worth, gently — the big lever is already their damage and health.
    const scale = 1 + Math.min(0.6, t * 0.006);
    // THE THIRD MOVE, and the one you cannot have. Appended rather than replacing, so a hard opponent still
    // fights out of its archetype and then does something you have no card for.
    const only = npcOnlyMove(t, arch, scale);
    if (only) chosen.push(only);
    return chosen.map((k, i) => ({
        id: `npc${t}:${k.kind}:${i}`,
        itemId: null,
        name: k.name,
        from: n.name,
        kind: k.kind,
        cooldown: k.cd,
        hits: k.hits || 1,
        // The accuracy each move costs to throw — read by resolveBeat as `ability.acc`. Without carrying it
        // here the penalties would sit in the catalog doing nothing, which is this codebase's favourite bug.
        acc: k.acc || 0,
        power: Math.round(k.power * scale * 100) / 100,
        element: n.element,
        rarity: "epic",
        rank: 2,
        defensive: false,
        blurb: k.name,
        sprite: k.sprite,
        effect: { head: `×${Math.round(k.power * scale * 100) / 100}`, sub: "damage", line: k.name, tags: [] },
    }));
}

/**
 * Which tiers a member may take on. You can always re-fight anything you have already beaten (so there is
 * never nothing to do), plus a REACH above your best — but the reach is generous rather than one-at-a-time,
 * because being told to grind tier 7 before you may look at tier 9 is the treadmill this is meant to replace.
 */
export const NPC_REACH = 5;

/**
 * The tier whose stat budget matches a given rating — i.e. where you ALREADY belong, before you have beaten
 * anything.
 *
 * THE REACH USED TO START AT ZERO. `npc_best` is 0 until you win a Gauntlet fight, so a member who arrived
 * fully geared could only ever be offered tiers 1-5 — every one of them a joke — and once the matchmaker
 * started RESERVING seats for the Gauntlet, that guaranteed a run of Straw Dummies to exactly the players
 * least interested in one. The ladder was gating on "what have you proven here" when it had a much better
 * answer available: what you are carrying.
 */
export function tierForRating(rating) {
    if (!(rating > 0)) return 1;
    // SEARCHED, NOT SOLVED WITH A MAGIC NUMBER. The first cut multiplied npcPower by a constant I guessed at
    // (4.2) and put a rating of 400 at tier 17 — wildly wrong, and wrong in the direction that would have
    // handed a beginner the Nightmare band. Rating is health x damage x crit and none of that
    // collapses to one coefficient, so this walks the ladder and takes the closest tier. It is thirty
    // comparisons of arithmetic, once per matchmake.
    let best = 1;
    let bestGap = Infinity;
    for (let t = 1; t <= 200; t += 1) {
        const n = npcFor(t);
        // Derived with the SHARED helpers, not a second copy of the formulas. A Gauntlet tier is a stat block
        // now — might / crit / ferocity, exactly like a member's gear — so its damage and health come from the
        // same three functions the fight uses. Restating them here is how the ladder and the engine end up
        // disagreeing about how strong tier 20 is.
        const damage = swingFrom(n.might);
        // An NPC has no armour, so its stat block's `ferocity` IS its toughness — same number, same rate
        // through healthFrom, so splitting Vitality out of gear left every Gauntlet tier exactly where it was.
        const hp = healthFrom(n.ferocity);
        const cc = critChanceFrom(n.crit_chance);
        const cm = critMultFrom(n.crit_power);
        const perSwing = damage * (1 + cc * (cm - 1));
        const r = Math.round((perSwing * hp) / 10);
        const gap = Math.abs(r - rating);
        if (gap < bestGap) { bestGap = gap; best = t; }
        if (r > rating * 1.5) break;   // past it — the curve only climbs
    }
    return best;
}
export function npcOffer(bestTier = 0, count = 6) {
    const top = Math.max(1, bestTier + NPC_REACH);
    const out = [];
    // Show the frontier first — the ones you have not beaten — then a couple you have, to warm up on.
    for (let t = top; t >= 1 && out.length < count; t -= 1) out.push(npcFor(t));
    return out;
}
