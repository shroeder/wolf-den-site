// ── CLASSES AND THE SKILL TREE ───────────────────────────────────────────────────────────────────────────────
// Pure. No DB, no server-only — the tree screen and the engine read the same catalog, so what a node promises
// is what the bout applies.
//
// WHY THIS REPLACES GEAR-DERIVED SKILLS. Arena abilities used to be read off the signatures on your equipped
// items, which made the arena a READOUT of the rest of the game rather than a thing you progress. Two people
// with the same gear had the same fight, forever, and the only way to change how you fight was to go and play
// something else. Arena XP, arena levels and a spent skill point are progression that belongs to the arena.
//
// THE SHAPE. Fight → arena XP → arena level → one skill point a level. Your first level asks you to pick one
// of three classes; after that, points go into that class's tree. Nodes are either PASSIVE (they tune the
// numbers a bout already uses) or ACTIVE (they grant one of the eleven ability kinds the engine already
// knows). Nothing here invents a new combat mechanic — it decides which of the existing ones you get, which
// is what makes a tree a build rather than a menu.
//
// Gear still decides your ELEMENT. Affinity is a Forge decision and should stay one; the wheel is the thing
// the two systems have in common.

// ── LEVELS ───────────────────────────────────────────────────────────────────────────────────────────────────
// Gentle at first so a new member gets three or four points quickly and the tree stops being an empty grid,
// then steepening so a level always means something. Deliberately NOT the Den's global XP curve: that one is
// tuned for a player who earns from every feature, and this one only earns from bouts.
export const ARENA_XP_BASE = 120;
export const ARENA_XP_GROWTH = 1.28;

export function arenaXpForLevel(level) {
    if (level <= 1) return 0;
    let total = 0;
    for (let n = 1; n < level; n += 1) total += Math.round(ARENA_XP_BASE * Math.pow(ARENA_XP_GROWTH, n - 1));
    return total;
}

/** Level, and how far into it you are — everything the badge and the bar need. */
export function arenaLevelFor(xp = 0) {
    const x = Math.max(0, Number(xp) || 0);
    let level = 1;
    while (arenaXpForLevel(level + 1) <= x && level < 200) level += 1;
    const floor = arenaXpForLevel(level);
    const ceil = arenaXpForLevel(level + 1);
    return { level, xp: x, into: x - floor, span: Math.max(1, ceil - floor), next: ceil };
}

/** What a bout is worth in arena XP. Harder opponents teach you more — the same idea as Victory Points. */
// Arena XP levels the class and feeds the skill tree. A loss used to pay 35% of a win, which made a member
// stuck at a wall able to keep levelling by feeding themselves to it — progress for failing. Nothing is paid
// for losing any more; see the note in arena-rewards.js.
export function arenaXpFor({ won, myPower = 1, theirPower = 1 }) {
    const ratio = Math.max(0.3, Math.min(2.5, (Number(theirPower) || 1) / Math.max(1, Number(myPower) || 1)));
    const win = Math.round(26 + 48 * ratio);
    return won ? win : 0;
}

// ── RESPEC ───────────────────────────────────────────────────────────────────────────────────────────────────
// Three prices, because they are three different decisions. Pulling one point back is a tweak; emptying the
// tree is a rebuild; changing class is starting again. Each scales with how invested you are.
//
// A TENTH OF WHAT THEY WERE (2026-08-10), plus three free point-refunds a day. The old numbers priced a
// mistake like a punishment: 150 + 60/point meant a level-20 build cost 1,350 gold to adjust by ONE point and
// 3,200 to empty. At that price you do not experiment with a tree, you go and look up somebody's build — which
// is the opposite of what a tree is for. Trying things out should be the cheap part; the cost is only here so
// that swapping your whole kit per opponent isn't free.
export const FREE_REFUNDS_PER_DAY = 3;
export const RESPEC_ONE = (spent = 0) => 15 + spent * 6;
export const RESPEC_TREE = (spent = 0) => 40 + spent * 14;
export const RESPEC_CLASS = (spent = 0) => 120 + spent * 22;

// ── THE THREE CLASSES ────────────────────────────────────────────────────────────────────────────────────────
// One per way of winning a bout, drawn from the eleven kinds the engine already has: hit harder, outlast, or
// grind them down. Every class can reach every archetype it needs to function — none of them is a trap.
// ── A CLASS IS ITS TREE, AND NOTHING ELSE ────────────────────────────────────────────────────────────────────
// Every class used to carry hidden combat stats before a point was spent: the Warden had 110 extra health,
// 0.40 damage reduction, a 50% block against everyone else's 35%, an escalating block chance and 15% inherent
// lifesteal; the Reaver had 12% bonus damage and a 45% chance to open a wound; the Runecaller had a 35% burn.
// None of it was on screen anywhere.
//
// Luke's call: all of it goes. Three fighters who have chosen three different classes and spent nothing are
// now mechanically IDENTICAL, and the class is purely which twelve perks you may reach. Anything a class does
// is a node you can point at, with a number you can read.
export const CLASSES = [
    {
        id: "reaver",
        name: "Reaver",
        tag: "Hit first, hit hardest",
        blurb: "Bleed, speed and criticals. A Reaver wants the bout over quickly and builds every point toward that.",
        color: "#ff6f7d",
        emblem: "/images/arena/class/reaver.webp",
    },
    {
        id: "warden",
        name: "Warden",
        tag: "Nothing gets through",
        blurb: "Blocks, counters and sustain. A Warden wins by still being standing, and makes swinging at them a mistake.",
        color: "#6fd0ff",
        emblem: "/images/arena/class/warden.webp",
    },
    {
        id: "runecaller",
        name: "Runecaller",
        tag: "Burn it down",
        blurb: "Affinity and burns. A Runecaller wins the rounds after the one they are in.",
        color: "#b061ff",
        emblem: "/images/arena/class/runecaller.webp",
    },
];

// ── WHAT A CLASS IS, BEFORE YOU SPEND A POINT ────────────────────────────────────────────────────────────────
// Three numbers every class now carries in its own right, because a class that is only a list of nodes is a
// menu rather than an identity: a fresh Warden and a fresh Reaver used to be mechanically IDENTICAL, and the
// only thing separating them was which grid their future points would land in.
//
//   health    flat bonus on top of what Ferocity buys — the tank is bigger before they spend anything
//   dr        damage reduction, the share of every incoming blow that never lands
//   accuracy  the base chance a swing connects, before a skill's own penalty
//   guard     the share of your health one Guard brackets, before Fortune multiplies it
//
// DR REPLACES "TURN ASIDE". Same mechanic, one name, and it is a class trait rather than a flat 34% everybody
// shared. Footwork's ranks carry straight over — the node's stat is `dr` now and adds to the class base, so a
// member who spent five points on it keeps exactly what they paid for.
//
// The spread is the identity. A Reaver is soft on purpose: 16% against a Warden's 34% is the difference
// between a fight you have to end quickly and one you can afford to lose rounds in.
//
// ── ACCURACY STARTS AT 75, NOT 95 ────────────────────────────────────────────────────────────────────────────
// At a 95% base every swing landed and the whole mechanic was decoration: a skill's accuracy cost came off a
// number so close to certain that paying it changed nothing, and Ferocity's contribution to it was capped at
// six points because there was nowhere left to go. Landing a blow was not a thing you could be good at.
//
// From 75 it is. A bare fighter misses one swing in four, Ferocity buys that back over a real investment (see
// accuracyFromFerocity), and a heavy skill's penalty is now felt because it is coming off a number that can
// actually reach down and hurt. The class spread stays exactly as wide as it was — 72 / 73 / 75 — because the
// identity was never in the size of the gap.
export const classBase = (id) => {
    const c = classById(id);
    return {
        health: c?.health || 0,
        dr: c?.dr ?? DEFAULT_DR,
        blockReduction: c?.blockReduction ?? null,
        blockStack: c?.blockStack ?? 0,
        blockStackMax: c?.blockStackMax ?? 0,
        accuracy: c?.accuracy ?? DEFAULT_ACCURACY,
        lifesteal: c?.lifesteal || 0,
        guard: c?.guard ?? DEFAULT_GUARD,
        bleedChance: c?.bleedChance || 0,
        dmgPct: c?.dmgPct || 0,
        burnChance: c?.burnChance || 0,
    };
};

// What someone with no class at all fights with — a member who has not picked yet, and the shape NPCs use.
export const DEFAULT_DR = 0.20;
// Half a Warden's, which is the rule for every class that is not one: bracing well is the Warden's job.
// NPCs use it too — they have no class and no Fortune, so a Gauntlet foe's guard is exactly this.
export const DEFAULT_GUARD = 0.12;
export const DEFAULT_ACCURACY = 0.75;
// Nobody dodges forever and nobody hits forever: a ceiling on each so investment cannot end the interaction.
export const DR_CAP = 0.60;
// 0.98 rather than 1.0, deliberately: a plain swing must ALWAYS be able to miss. At a cap of 1 a
// well-invested fighter reaches "never misses", and the moment that happens every skill's accuracy cost
// stops being a trade-off and becomes a rounding error — which is the whole mechanic gone.
export const ACCURACY_CAP = 0.98;
export const ACCURACY_FLOOR = 0.35;

// ── WHAT A CLASS GIVES YOU FOR FREE ──────────────────────────────────────────────────────────────────────────
// The inherent half of a class, in words, built from the SAME numbers the engine folds — never prose typed out
// beside them. Retune the Warden's lifesteal and this line follows; type "15%" here instead and the day it
// becomes 12% the screen starts lying, which is the copied-constant bug wearing a sentence.
//
// Only what differs from an unclassed fighter is listed. "Accuracy 75%" on a class that has exactly the
// default is not an identity, it is noise pretending to be one.
export function classPassives(id) {
    const b = classBase(id);
    const out = [];
    if (b.health) out.push({ label: "Vigour", value: `+${b.health} health` });
    if (b.dr !== DEFAULT_DR) out.push({ label: "Damage reduction", value: `${Math.round(b.dr * 100)}%` });
    if (b.guard !== DEFAULT_GUARD) out.push({ label: "Guard", value: `${Math.round(b.guard * 100)}% of health` });
    if (b.accuracy !== DEFAULT_ACCURACY) out.push({ label: "Accuracy", value: `${Math.round(b.accuracy * 100)}%` });
    if (b.lifesteal) out.push({ label: "Lifedrink", value: `${Math.round(b.lifesteal * 100)}% of all damage back` });
    if (b.dmgPct) out.push({ label: "Brutality", value: `+${Math.round(b.dmgPct * 100)}% damage on everything you throw` });
    if (b.bleedChance) out.push({ label: "Ragged Edge", value: `${Math.round(b.bleedChance * 100)}% chance any hit opens a wound` });
    if (b.burnChance) out.push({ label: "Emberborn", value: `${Math.round(b.burnChance * 100)}% chance any hit sets a burn` });
    return out;
}

export const classById = (id) => CLASSES.find((c) => c.id === id) || null;

// ── THE TREES ────────────────────────────────────────────────────────────────────────────────────────────────
// Four tiers of three. A tier opens once you have spent enough in the tree, so depth is earned and there is
// always a choice about breadth versus reach.
//
//   kind:    "passive" tunes a number the bout already uses; "active" grants an ability.
//   stat:    which number a passive moves (read by the engine, see arena.js).
//   per:     value added PER RANK.
//   ranks:   how many points it can take.
//   needs:   total points that must already be in this tree before the node opens.
export const TIER_GATE = [0, 3, 7, 12];

const N = (o) => ({ ranks: 1, kind: "passive", ...o });

export const TREES = {
    // ── REAVER ── damage, criticals, volume.
    // ── REAVER ── bleed, speed, criticals and procs. Everything good about melee and nothing that defends.
    // Twelve nodes, four tiers of three, five ranks each. One lever per node on purpose: a node that moves two
    // numbers is a node nobody can weigh against its neighbours.
    reaver: [
        // TIER 1 — open the artery.
        N({ id: "rv_rend", tier: 0, name: "Rend", ranks: 5, stat: "bleedChance", per: 0.06,
            desc: "+6% chance a blow opens a bleed. A wound ticks three times for a fifth of the blow and armour never sees it.",
            sprite: "/images/arena/node/rv_might.webp" }),
        N({ id: "rv_quick", tier: 0, name: "Quickblade", ranks: 5, stat: "speed", per: 0.06,
            desc: "+0.06 attacks per second. Speed is the clock — every swing you gain is another roll at everything else.",
            sprite: "/images/arena/node/rv_strike.webp" }),
        N({ id: "rv_edge", tier: 0, name: "Killing Edge", ranks: 5, stat: "crit", per: 0.03,
            desc: "+3% critical chance.", sprite: "/images/arena/node/rv_crit.webp" }),

        // TIER 2 — make it hurt.
        N({ id: "rv_deep", tier: 1, name: "Deep Cuts", ranks: 5, stat: "bleedDamage", per: 0.04, needs: 3,
            desc: "+4% of the blow to every bleed tick, on top of the base fifth.",
            sprite: "/images/arena/node/rv_rend.webp" }),
        N({ id: "rv_letting", tier: 1, name: "Bloodletting", ranks: 5, stat: "lifestealBonus", per: 0.05, needs: 3,
            desc: "+5% of what you land, healed back.", sprite: "/images/arena/node/rv_drain.webp" }),
        N({ id: "rv_savage", tier: 1, name: "Savagery", ranks: 5, stat: "critMult", per: 0.10, needs: 3,
            desc: "+10% critical damage.", sprite: "/images/arena/node/rv_critdmg.webp" }),

        // TIER 3 — the procs.
        N({ id: "rv_riposte", tier: 2, name: "Riposte", ranks: 5, stat: "counterBonus", per: 0.03, needs: 7,
            desc: "+3% chance to answer a blow with one of your own. A counter is a real swing and rolls its own crit.",
            sprite: "/images/arena/node/rv_counter.webp" }),
        N({ id: "rv_concuss", tier: 2, name: "Concussive", ranks: 5, stat: "stunBonus", per: 0.02, needs: 7,
            desc: "+2% chance a blow stuns — they lose the swing that was due.",
            sprite: "/images/arena/node/rv_stun.webp" }),
        N({ id: "rv_frenzy", tier: 2, name: "Frenzy", ranks: 5, stat: "doublestrikeBonus", per: 0.02, needs: 7,
            desc: "+2% chance the swing lands twice. Each blow rolls its own crit.",
            sprite: "/images/arena/node/rv_flurry.webp" }),

        // TIER 4 — capstones.
        N({ id: "rv_scent", tier: 3, name: "Bloodscent", ranks: 5, stat: "hasteBonus", per: 0.02, needs: 12,
            desc: "+2% chance a swing hastes you: five swings at double speed.",
            sprite: "/images/arena/node/rv_haste.webp" }),
        N({ id: "rv_exsang", tier: 3, name: "Exsanguinate", ranks: 5, stat: "bleedLeech", per: 0.03, needs: 12,
            desc: "+3% of all bleed damage healed back to you. Rend starts it, Deep Cuts deepens it, this drinks it.",
            sprite: "/images/arena/node/rv_leech.webp" }),
        N({ id: "rv_harvest", tier: 3, name: "Red Harvest", ranks: 5, stat: "wildProc", per: 0.01, needs: 12,
            desc: "+1% chance on any swing to fire one of doublestrike, counter or haste at random.",
            sprite: "/images/arena/node/rv_wild.webp" }),
    ],
    // ── WARDEN ── blocks, counters and sustain. It wins by still being standing, and by making the swing that
    // hit it the reason it wins. Twelve nodes, four tiers of three, five ranks each.
    warden: [
        // TIER 1 — stand there.
        N({ id: "wd_bulwark", tier: 0, name: "Bulwark", ranks: 5, stat: "blockChance", per: 0.03,
            desc: "+3% chance to block a blow. A block takes 35% off it before armour is even asked.",
            sprite: "/images/arena/node/wd_block.webp" }),
        N({ id: "wd_ironhide", tier: 0, name: "Ironhide", ranks: 5, stat: "armorPct", per: 0.06,
            desc: "+6% to your total armour. Armour comes off every blow, flat.",
            sprite: "/images/arena/node/wd_fort.webp" }),
        N({ id: "wd_const", tier: 0, name: "Constitution", ranks: 5, stat: "healthPct", per: 0.04,
            desc: "+4% maximum health.", sprite: "/images/arena/node/wd_health.webp" }),

        // TIER 2 — turn it back.
        N({ id: "wd_deflect", tier: 1, name: "Deflection", ranks: 5, stat: "blockReductionBonus", per: 0.03, needs: 3,
            desc: "+3% taken off a blocked blow, on top of the usual 35%.",
            sprite: "/images/arena/node/wd_deflect.webp" }),
        N({ id: "wd_retrib", tier: 1, name: "Retribution", ranks: 5, stat: "counterBonus", per: 0.04, needs: 3,
            desc: "+4% chance to answer a blow with one of your own. A counter is a real swing and rolls its own crit.",
            sprite: "/images/arena/node/wd_counter.webp" }),
        N({ id: "wd_mend", tier: 1, name: "Mending", ranks: 5, stat: "regen", per: 0.005, needs: 3,
            desc: "Heal 0.5% of your maximum health every time you swing.",
            sprite: "/images/arena/node/wd_regen.webp" }),

        // TIER 3 — the guard.
        N({ id: "wd_bastion", tier: 2, name: "Bastion", ranks: 5, stat: "guardChance", per: 0.04, needs: 7,
            desc: "+4% chance on your swing to raise a guard worth a tenth of your health. A guard eats damage before your health does.",
            sprite: "/images/arena/node/wd_guard.webp" }),
        N({ id: "wd_grudge", tier: 2, name: "Grudge", ranks: 5, stat: "grudge", per: 0.03, needs: 7,
            desc: "+3% of everything done to you since your last swing is added to your next one.",
            sprite: "/images/arena/node/wd_grudge.webp" }),
        N({ id: "wd_blood", tier: 2, name: "Bloodwarden", ranks: 5, stat: "lifestealBonus", per: 0.02, needs: 7,
            desc: "+2% of what you land, healed back.", sprite: "/images/arena/node/wd_drain.webp" }),

        // TIER 4 — capstones.
        N({ id: "wd_concuss", tier: 3, name: "Concussion", ranks: 5, stat: "stunBonus", per: 0.02, needs: 12,
            desc: "+2% chance a blow stuns — they lose the swing that was due.",
            sprite: "/images/arena/node/wd_stun.webp" }),
        N({ id: "wd_thorns", tier: 3, name: "Thornmail", ranks: 5, stat: "thorns", per: 0.04, needs: 12,
            desc: "+4% of the damage your BLOCK turns aside is sent back down the blade.",
            sprite: "/images/arena/node/wd_thorns.webp" }),
        N({ id: "wd_unbreak", tier: 3, name: "Unbreakable", ranks: 5, stat: "guardSize", per: 0.20, needs: 12,
            desc: "+20% to the size of every guard you raise. Bastion decides how often; this decides how much.",
            sprite: "/images/arena/node/wd_aegis.webp" }),
    ],
    runecaller: [
        N({ id: "rc_power", tier: 0, name: "Attunement", ranks: 5, stat: "spellPower", per: 0.05,
            desc: "+5% spell damage per rank.", sprite: "/images/arena/node/rc_power.webp" }),
        // Was "Wheelwise", +3% element edge a rank. The wheel is gone from the ring, so the node had nothing
        // left to modify — a passive that reads well and does nothing is the bug this file keeps being fixed
        // for. Same id and same rank count, so anyone who bought it keeps every point; only what it buys has
        // changed, to the other half of what a Runecaller is.
        N({ id: "rc_edge", tier: 0, name: "Runebrand", ranks: 4, stat: "rendTick", per: 0.30,
            desc: "Your burns tick 30% harder per rank.", sprite: "/images/arena/node/rc_edge.webp" }),
        // ── FIRE ── Channel used to be a third guard-cutter. It is the class's bread-and-butter BURN now, which
        // is what "Burn it down" on the class card has always promised. Still `spell` kind, so Attunement
        // (spell damage) applies to it — the thing no card previously told you.
        N({ id: "rc_spell", tier: 0, kind: "active", ability: "spell", element: "fire", burns: true, name: "Channel", power: 1.45, acc: -0.08, cd: 4,
            desc: "Fire. It sets them burning.", sprite: "/images/arena/node/rc_spell.webp" }),

        // A `rend` that BURNS. The damage-over-time is a property of the ABILITY, not of its kind — which is the
        // whole fix: "Ragged Cut" is a rend too, and a knife wound has no business setting anybody on fire.
        N({ id: "rc_rend", tier: 1, kind: "active", ability: "rend", burns: true, name: "Emberbrand", power: 1.35, cd: 3, needs: 3,
            desc: "Keeps burning for three of their turns.", sprite: "/images/arena/node/rc_rend.webp" }),
        N({ id: "rc_burn", tier: 1, name: "Slow Burn", ranks: 4, stat: "rendTurns", per: 0.5, needs: 3,
            desc: "Your burns last one turn longer every two ranks.", sprite: "/images/arena/node/rc_burn.webp" }),
        // WAS "+1 burn stack per rank". Stacks are uncapped now, so that would buy literally nothing — the
        // per-turn CEILING is the only limit left, and this is what lifts it.
        N({ id: "rc_stacks", tier: 1, name: "Kindling", ranks: 2, stat: "rendCap", per: 0.04, needs: 3,
            desc: "Your burn can tick 4% harder per rank.", sprite: "/images/arena/node/rc_stacks.webp" }),

        // The ONLY guard-facing move the class has left, and it is a different KIND of thing from a percentage:
        // for three of their beats they cannot raise a guard at all.
        N({ id: "rc_sunder", tier: 2, kind: "active", ability: "disarm", name: "Shatter", power: 1.50, acc: -0.07, cd: 3, needs: 7,
            desc: "They cannot guard at all for three turns.", sprite: "/images/arena/node/rc_sunder.webp" }),
        N({ id: "rc_cd", tier: 2, name: "Emberdrinker", ranks: 3, stat: "burnLeech", per: 0.10, needs: 7,
            desc: "You drink back 10% of your burn damage as health, per rank.", sprite: "/images/arena/node/rc_cd.webp" }),
        N({ id: "rc_pierce", tier: 2, name: "Runebreak", ranks: 4, stat: "pierce", per: 0.03, needs: 7,
            desc: "Bypass 3% more of their guard per rank.", sprite: "/images/arena/node/rc_pierce.webp" }),

        // ── ICE ── the capstone, and the only thing in the game that can take a turn off somebody.
        N({ id: "rc_overcharge", tier: 3, kind: "active", ability: "spell", element: "ice", freezes: true, name: "Rimeshatter", power: 2.05, acc: -0.16, cd: 6, needs: 12,
            desc: "Ice, hard enough that they may lose their next turn.", sprite: "/images/arena/node/rc_overcharge.webp" }),
        N({ id: "rc_spread", tier: 3, name: "Conflagration", ranks: 1, stat: "burnOnCrit", per: 1, needs: 12,
            desc: "Your criticals leave a burn behind.", sprite: "/images/arena/node/rc_spread.webp" }),
        // Was "+8 Fortune per rank — the arena's critical stat", which stopped being true the moment the ring
        // started reading the boss fight's crit model. Fortune is the raffle stat and nothing else; this node
        // now buys the stat whose name says what it does.
        N({ id: "rc_fortune", tier: 3, name: "Runes of Fortune", ranks: 3, stat: "accuracy", per: 0.03, needs: 12,
            desc: "+3% accuracy per rank.", sprite: "/images/arena/node/rc_fortune.webp" }),
    ],
};

export const treeFor = (classId) => TREES[classId] || [];
export const nodeById = (classId, nodeId) => treeFor(classId).find((n) => n.id === nodeId) || null;

import { effectOf } from "@/lib/marketplace/arena-kit.js";

/** Total points sunk into a tree. `taken` is { nodeId: ranks }. */
export const pointsSpent = (taken = {}) => Object.values(taken).reduce((n, v) => n + (Number(v) || 0), 0);

/**
 * The state of every node for a given allocation — what the screen renders and what the server validates
 * against. One function, so the two can never disagree about whether a node is takeable.
 */
export function treeState(classId, taken = {}, pointsAvailable = 0) {
    const spent = pointsSpent(taken);
    return treeFor(classId).map((n) => {
        const rank = Number(taken[n.id]) || 0;
        const gate = TIER_GATE[n.tier] ?? 0;
        const tierOpen = spent >= gate;
        const maxed = rank >= (n.ranks || 1);
        return {
            ...n,
            rank,
            maxed,
            tierOpen,
            gate,
            canTake: tierOpen && !maxed && pointsAvailable > 0,
            // What it is doing for you right now, and what one more point would do.
            valueNow: n.kind === "passive" ? Math.round((n.per || 0) * rank * 1000) / 1000 : null,
            valueNext: n.kind === "passive" ? Math.round((n.per || 0) * (rank + 1) * 1000) / 1000 : null,
            // ── AND WHAT AN ACTIVE ACTUALLY DOES ──────────────────────────────────────────────────────
            // A passive gets "now 3% → next 4.5%"; an active got only its flavour line, so Tithe read as
            // "You keep half of what it takes off them" — half of WHAT, at what cost, how often? The same
            // builder the gear ability cards use answers all of it, from the node's own numbers.
            effect: n.kind === "active" ? effectOf(n.ability, n.power || 1, n.element || null, n.hits || 1, { burns: n.burns, freezes: n.freezes }) : null,
        };
    });
}

/**
 * The combat effects of an allocation — one flat object the engine reads. Anything not taken is simply absent,
 * so a missing node can never read as a negative modifier.
 */
export function treeEffects(classId, taken = {}) {
    const out = {};
    for (const n of treeFor(classId)) {
        const rank = Number(taken[n.id]) || 0;
        if (!rank || n.kind !== "passive" || !n.stat) continue;
        out[n.stat] = (out[n.stat] || 0) + (n.per || 0) * rank;
    }
    return out;
}

/** The abilities an allocation grants, in the shape buildKit produces so the engine needs no special case. */
export function treeAbilities(classId, taken = {}, element = null) {
    const cls = classById(classId);
    const out = [];
    for (const n of treeFor(classId)) {
        if (n.kind !== "active" || !(Number(taken[n.id]) > 0)) continue;
        out.push({
            id: n.id,
            itemId: null,
            name: n.name,
            from: cls ? `${cls.name} tree` : "your training",
            kind: n.ability,
            cooldown: n.cd || 3,
            hits: n.hits || 1,
            power: n.power || 1,
            // ── WHAT THE MOVE LEAVES BEHIND ──────────────────────────────────────────────────────────
            // THIS OBJECT IS AN ALLOWLIST and anything not named here is dropped before the engine ever
            // sees it. `burns`, `bleeds` and `freezes` were not named, so every elemental identity shipped
            // today was silently thrown away at this line: Channel set nothing alight, Rimeshatter could
            // never freeze anybody, Rampage drew no blood, and Emberbrand — a rend that is supposed to
            // BURN — fell through to the default and bled instead.
            //
            // Same failure as the foe object further along, which is where The Long Road lost `ladder`,
            // `rung` and `reward` and paid nobody for a hundred fights. An allowlist is the right shape;
            // forgetting to widen it when the data grows is the trap that comes with it.
            burns: Boolean(n.burns),
            bleeds: Boolean(n.bleeds),
            freezes: Boolean(n.freezes),
            // The node's OWN element wins where it states one — a fire spell is fire whatever the caster's
            // gear is attuned to — and everything else still takes the kit's affinity.
            element: n.element || element,
            rarity: "epic",
            rank: 2,
            defensive: n.ability === "ward" || n.ability === "riposte",
            // Free on your own beat too — cast it, then still act. Kept as a literal rather than importing
            // arena-kit's FREE_KINDS because this module is pure on purpose; scripts/check-arena.mjs asserts
            // the two lists never drift apart.
            free: n.ability === "ward" || n.ability === "riposte",
            blurb: n.desc,
            sprite: n.sprite,
        });
    }
    return out;
}
