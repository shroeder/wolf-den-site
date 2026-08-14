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
export const CLASSES = [
    {
        id: "reaver",
        name: "Reaver",
        tag: "Hit first, hit hardest",
        blurb: "Damage and criticals. A Reaver wants the bout over in six rounds and builds every point toward that.",
        color: "#ff6f7d",
        emblem: "/images/arena/class/reaver.webp",
        health: 0,
        dr: 0.16,
        accuracy: 0.72,
        guard: 0.12,
    },
    {
        id: "warden",
        name: "Warden",
        tag: "Nothing gets through",
        blurb: "Wards, ripostes and sustain. A Warden wins by still being standing, and makes swinging at them a mistake.",
        color: "#6fd0ff",
        emblem: "/images/arena/class/warden.webp",
        health: 110,
        dr: 0.40,
        accuracy: 0.75,
        // ── THE BRACE IS THEIRS ──────────────────────────────────────────────────────────────────────────
        // Double everyone else's, inherent, before a point is spent — and then multiplied by Fortune like
        // anyone's (see guardSoakFrom in arena-kit.js). Guard used to be a flat share of health every class
        // got identically, which made the one command a shield build exists to press the one command a
        // shield build could not improve. Fortress still stacks flat on top of this.
        guard: 0.24,
        // ── THE WARDEN DRINKS ────────────────────────────────────────────────────────────────────────────
        // A share of everything they put on the other fighter comes back as health — INCLUDING thorns and
        // ripostes, which is where 84% of a Warden's damage actually comes from. So the class heals by being
        // hit and answering, which is the fantasy the rest of the tree already describes and nothing
        // delivered: the sheet had nine defensive passives, no damage passives, and one weak active.
        //
        // Inherent rather than a node, because it is what the class IS. You do not spend a point to be a
        // Warden.
        lifesteal: 0.15,
    },
    {
        id: "runecaller",
        name: "Runecaller",
        tag: "Burn it down",
        blurb: "Affinity, burns and broken guard. A Runecaller wins the rounds after the one they are in.",
        color: "#b061ff",
        emblem: "/images/arena/class/runecaller.webp",
        health: 30,
        dr: 0.24,
        accuracy: 0.73,
        guard: 0.12,
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
        accuracy: c?.accuracy ?? DEFAULT_ACCURACY,
        lifesteal: c?.lifesteal || 0,
        guard: c?.guard ?? DEFAULT_GUARD,
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
    reaver: [
        N({ id: "rv_might", tier: 0, name: "Brutality", ranks: 5, stat: "might", per: 2,
            desc: "+2 Might per rank.", sprite: "/images/arena/node/rv_might.webp" }),
        N({ id: "rv_crit", tier: 0, name: "Killer Instinct", ranks: 5, stat: "crit", per: 0.02,
            desc: "+2% critical chance per rank.", sprite: "/images/arena/node/rv_crit.webp" }),
        N({ id: "rv_strike", tier: 0, kind: "active", ability: "strike", name: "Cleave", power: 1.45, acc: -0.06, cd: 3,
            desc: "A committed blow. One big hit.", sprite: "/images/arena/node/rv_strike.webp" }),

        N({ id: "rv_critdmg", tier: 1, name: "Overkill", ranks: 4, stat: "critMult", per: 0.08, needs: 3,
            desc: "Criticals hit +12% harder per rank.", sprite: "/images/arena/node/rv_critdmg.webp" }),
        // ── RAMPAGE, RETUNED ────────────────────────────────────────────────────────────────────────────
        // 0.95 x 3 = 285% on a three-turn cooldown, against Cleave's 230% on the SAME cooldown — more damage,
        // and three separate crit rolls, from the same class. There was no reason to ever take Cleave.
        //
        // 0.50 x 3 = 150% and every blow can miss. That is the trade an all-out attack should be: more total
        // damage than a single committed swing only if it lands, and three chances for it not to.
        N({ id: "rv_flurry", tier: 1, kind: "active", ability: "flurry", name: "Rampage", power: 0.52, hits: 3, acc: -0.10, cd: 3, needs: 3,
            desc: "Three wild blows — each can miss, each can crit.", sprite: "/images/arena/node/rv_flurry.webp" }),
        N({ id: "rv_speed", tier: 1, name: "Bloodrush", ranks: 3, stat: "speed", per: 3, needs: 3,
            desc: "+3 Speed per rank — decides who opens.", sprite: "/images/arena/node/rv_speed.webp" }),
        // The answer to Rampage's penalty: a Reaver who wants the wild swing can pay for it to land.
        N({ id: "rv_aim", tier: 1, name: "Killer's Eye", ranks: 4, stat: "accuracy", per: 0.02, needs: 3,
            desc: "+2% accuracy per rank.", sprite: "/images/arena/node/rv_crit.webp" }),

        N({ id: "rv_surge", tier: 2, kind: "active", ability: "surge", name: "Warcry", cd: 3, needs: 7,
            desc: "Sharpens your next three swings. Costs you the turn you spend on it.", sprite: "/images/arena/node/rv_surge.webp" }),
        N({ id: "rv_pierce", tier: 2, name: "Sunder Guard", ranks: 4, stat: "pierce", per: 0.06, needs: 7,
            desc: "Cut 6% more of their guard per rank.", sprite: "/images/arena/node/rv_pierce.webp" }),
        N({ id: "rv_execute", tier: 2, kind: "active", ability: "execute", name: "Finisher", power: 1.75, acc: -0.10, cd: 4, needs: 7,
            desc: "Ordinary — until they are hurt.", sprite: "/images/arena/node/rv_execute.webp" }),

        N({ id: "rv_gamble", tier: 3, kind: "active", ability: "gamble", name: "Last Coin", power: 1.95, acc: -0.14, cd: 5, needs: 12,
            desc: "Double, or nothing at all.", sprite: "/images/arena/node/rv_gamble.webp" }),
        N({ id: "rv_open", tier: 3, name: "First Blood", ranks: 3, stat: "openMult", per: 0.06, needs: 12,
            desc: "+10% damage on round one per rank.", sprite: "/images/arena/node/rv_open.webp" }),
        N({ id: "rv_cap", tier: 3, name: "Bloodlust", ranks: 1, stat: "lowHpDmg", per: 0.18, needs: 12,
            desc: "+25% damage while under a third of your health.", sprite: "/images/arena/node/rv_cap.webp" }),
    ],

    // ── WARDEN ── mitigation, counters, sustain.
    warden: [
        N({ id: "wd_vigour", tier: 0, name: "Conditioning", ranks: 5, stat: "health", per: 12,
            desc: "+12 max Health per rank.", sprite: "/images/arena/node/wd_vigour.webp" }),
        // `stat` renamed block -> dr with the node id, rank count and value untouched, so five points spent
        // on Footwork are still five points of the same thing. Only the word changed.
        N({ id: "wd_block", tier: 0, name: "Footwork", ranks: 5, stat: "dr", per: 0.02,
            desc: "+2% damage reduction per rank.", sprite: "/images/arena/node/wd_block.webp" }),
        N({ id: "wd_ward", tier: 0, kind: "active", ability: "ward", name: "Bulwark", cd: 4,
            desc: "Brace against the next blow — on either beat, and it never costs you a swing.", sprite: "/images/arena/node/wd_ward.webp" }),

        N({ id: "wd_soak", tier: 1, name: "Deep Guard", ranks: 4, stat: "wardSoak", per: 0.02, needs: 3,
            desc: "Wards soak 2% more of your health per rank.", sprite: "/images/arena/node/wd_soak.webp" }),
        N({ id: "wd_riposte", tier: 1, kind: "active", ability: "riposte", name: "Answer", cd: 5, needs: 3,
            desc: "Their next blow comes back at them — and you still act.", sprite: "/images/arena/node/wd_riposte.webp" }),
        N({ id: "wd_thorns", tier: 1, name: "Iron Thorns", ranks: 3, stat: "thorns", per: 0.07, needs: 3,
            desc: "Return 7% of every blow you take, per rank.", sprite: "/images/arena/node/wd_thorns.webp" }),

        N({ id: "wd_drain", tier: 2, kind: "active", ability: "drain", name: "Tithe", power: 1.55, acc: -0.07, cd: 3, needs: 7,
            desc: "You keep half of what it takes off them.", sprite: "/images/arena/node/wd_drain.webp" }),
        N({ id: "wd_regen", tier: 2, name: "Second Wind", ranks: 4, stat: "regen", per: 0.015, needs: 7,
            desc: "Recover 1.5% of your health each round, per rank.", sprite: "/images/arena/node/wd_regen.webp" }),
        N({ id: "wd_shieldcap", tier: 2, name: "Unyielding", ranks: 3, stat: "shieldCap", per: 0.06, needs: 7,
            desc: "+6% to the ceiling on stacked wards, per rank.", sprite: "/images/arena/node/wd_shieldcap.webp" }),

        N({ id: "wd_reprisal", tier: 3, name: "Reprisal", ranks: 3, stat: "riposteShare", per: 0.08, needs: 12,
            desc: "Ripostes send back 8% more per rank.", sprite: "/images/arena/node/wd_reprisal.webp" }),
        N({ id: "wd_stand", tier: 3, name: "Last Stand", ranks: 1, stat: "lastStand", per: 1, needs: 12,
            desc: "Once a bout, survive a blow that would end you on 1 health.", sprite: "/images/arena/node/wd_stand.webp" }),
        N({ id: "wd_fort", tier: 3, name: "Fortress", ranks: 3, stat: "guardSoak", per: 0.05, needs: 12,
            desc: "Guard braces 5% more per rank.", sprite: "/images/arena/node/wd_fort.webp" }),
    ],

    // ── RUNECALLER ── affinity, burns, broken armour.
    runecaller: [
        N({ id: "rc_power", tier: 0, name: "Attunement", ranks: 5, stat: "spellPower", per: 0.035,
            desc: "+5% spell damage per rank.", sprite: "/images/arena/node/rc_power.webp" }),
        // Was "Wheelwise", +3% element edge a rank. The wheel is gone from the ring, so the node had nothing
        // left to modify — a passive that reads well and does nothing is the bug this file keeps being fixed
        // for. Same id and same rank count, so anyone who bought it keeps every point; only what it buys has
        // changed, to the other half of what a Runecaller is.
        N({ id: "rc_edge", tier: 0, name: "Runebrand", ranks: 4, stat: "rendTick", per: 0.006,
            desc: "Your burns tick 0.6% harder per rank.", sprite: "/images/arena/node/rc_edge.webp" }),
        N({ id: "rc_spell", tier: 0, kind: "active", ability: "spell", name: "Channel", power: 1.65, acc: -0.08, cd: 4,
            desc: "Its own element, and it cuts guard.", sprite: "/images/arena/node/rc_spell.webp" }),

        N({ id: "rc_rend", tier: 1, kind: "active", ability: "rend", name: "Emberbrand", power: 1.35, cd: 3, needs: 3,
            desc: "Keeps burning for three of their turns.", sprite: "/images/arena/node/rc_rend.webp" }),
        N({ id: "rc_burn", tier: 1, name: "Slow Burn", ranks: 4, stat: "rendTick", per: 0.008, needs: 3,
            desc: "Burns tick 0.8% harder per rank.", sprite: "/images/arena/node/rc_burn.webp" }),
        N({ id: "rc_stacks", tier: 1, name: "Kindling", ranks: 2, stat: "rendStacks", per: 1, needs: 3,
            desc: "+1 burn stack per rank.", sprite: "/images/arena/node/rc_stacks.webp" }),

        N({ id: "rc_sunder", tier: 2, kind: "active", ability: "sunder", name: "Shatter", power: 1.50, acc: -0.07, cd: 3, needs: 7,
            desc: "Strips their guard for what comes next.", sprite: "/images/arena/node/rc_sunder.webp" }),
        N({ id: "rc_cd", tier: 2, name: "Quickening", ranks: 3, stat: "cdCut", per: 1, needs: 7,
            desc: "Every third rank shaves a turn off one cooldown.", sprite: "/images/arena/node/rc_cd.webp" }),
        N({ id: "rc_pierce", tier: 2, name: "Runebreak", ranks: 4, stat: "pierce", per: 0.05, needs: 7,
            desc: "Cut 5% more of their guard per rank.", sprite: "/images/arena/node/rc_pierce.webp" }),

        N({ id: "rc_overcharge", tier: 3, kind: "active", ability: "spell", name: "Overcharge", power: 2.15, acc: -0.16, cd: 6, needs: 12,
            desc: "Everything at once.", sprite: "/images/arena/node/rc_overcharge.webp" }),
        N({ id: "rc_spread", tier: 3, name: "Conflagration", ranks: 1, stat: "burnOnCrit", per: 1, needs: 12,
            desc: "Your criticals leave a burn behind.", sprite: "/images/arena/node/rc_spread.webp" }),
        // Was "+8 Fortune per rank — the arena's critical stat", which stopped being true the moment the ring
        // started reading the boss fight's crit model. Fortune is the raffle stat and nothing else; this node
        // now buys the stat whose name says what it does.
        N({ id: "rc_fortune", tier: 3, name: "Runes of Fortune", ranks: 3, stat: "critStat", per: 5, needs: 12,
            desc: "+5% critical chance per rank.", sprite: "/images/arena/node/rc_fortune.webp" }),
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
            effect: n.kind === "active" ? effectOf(n.ability, n.power || 1, null, n.hits || 1) : null,
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
            element,
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
