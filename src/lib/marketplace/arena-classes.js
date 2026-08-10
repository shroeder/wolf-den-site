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
export function arenaXpFor({ won, myPower = 1, theirPower = 1 }) {
    const ratio = Math.max(0.3, Math.min(2.5, (Number(theirPower) || 1) / Math.max(1, Number(myPower) || 1)));
    const win = Math.round(26 + 48 * ratio);
    return won ? win : Math.max(6, Math.round(win * 0.35));
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
    },
    {
        id: "warden",
        name: "Warden",
        tag: "Nothing gets through",
        blurb: "Wards, ripostes and sustain. A Warden wins by still being standing, and makes swinging at them a mistake.",
        color: "#6fd0ff",
        emblem: "/images/arena/class/warden.webp",
    },
    {
        id: "runecaller",
        name: "Runecaller",
        tag: "Burn it down",
        blurb: "Affinity, burns and broken guard. A Runecaller wins the rounds after the one they are in.",
        color: "#b061ff",
        emblem: "/images/arena/class/runecaller.webp",
    },
];

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
        N({ id: "rv_strike", tier: 0, kind: "active", ability: "strike", name: "Cleave", power: 2.3, cd: 3,
            desc: "A committed blow. One big hit.", sprite: "/images/arena/node/rv_strike.webp" }),

        N({ id: "rv_critdmg", tier: 1, name: "Overkill", ranks: 4, stat: "critMult", per: 0.12, needs: 3,
            desc: "Criticals hit +12% harder per rank.", sprite: "/images/arena/node/rv_critdmg.webp" }),
        N({ id: "rv_flurry", tier: 1, kind: "active", ability: "flurry", name: "Rampage", power: 0.95, hits: 3, cd: 3, needs: 3,
            desc: "Three blows, each rolling its own critical.", sprite: "/images/arena/node/rv_flurry.webp" }),
        N({ id: "rv_speed", tier: 1, name: "Bloodrush", ranks: 3, stat: "speed", per: 3, needs: 3,
            desc: "+3 Speed per rank — decides who opens.", sprite: "/images/arena/node/rv_speed.webp" }),

        N({ id: "rv_surge", tier: 2, kind: "active", ability: "surge", name: "Warcry", cd: 3, needs: 7,
            desc: "Sharpens your next three swings. Costs you the turn you spend on it.", sprite: "/images/arena/node/rv_surge.webp" }),
        N({ id: "rv_pierce", tier: 2, name: "Sunder Guard", ranks: 4, stat: "pierce", per: 0.06, needs: 7,
            desc: "Cut 6% more of their guard per rank.", sprite: "/images/arena/node/rv_pierce.webp" }),
        N({ id: "rv_execute", tier: 2, kind: "active", ability: "execute", name: "Finisher", power: 2.4, cd: 4, needs: 7,
            desc: "Ordinary — until they are hurt.", sprite: "/images/arena/node/rv_execute.webp" }),

        N({ id: "rv_gamble", tier: 3, kind: "active", ability: "gamble", name: "Last Coin", power: 3, cd: 5, needs: 12,
            desc: "Double, or nothing at all.", sprite: "/images/arena/node/rv_gamble.webp" }),
        N({ id: "rv_open", tier: 3, name: "First Blood", ranks: 3, stat: "openMult", per: 0.1, needs: 12,
            desc: "+10% damage on round one per rank.", sprite: "/images/arena/node/rv_open.webp" }),
        N({ id: "rv_cap", tier: 3, name: "Bloodlust", ranks: 1, stat: "lowHpDmg", per: 0.25, needs: 12,
            desc: "+25% damage while under a third of your health.", sprite: "/images/arena/node/rv_cap.webp" }),
    ],

    // ── WARDEN ── mitigation, counters, sustain.
    warden: [
        N({ id: "wd_vigour", tier: 0, name: "Conditioning", ranks: 5, stat: "health", per: 12,
            desc: "+12 max Health per rank.", sprite: "/images/arena/node/wd_vigour.webp" }),
        N({ id: "wd_block", tier: 0, name: "Footwork", ranks: 5, stat: "block", per: 0.02,
            desc: "Turn aside 2% more per rank.", sprite: "/images/arena/node/wd_block.webp" }),
        N({ id: "wd_ward", tier: 0, kind: "active", ability: "ward", name: "Bulwark", cd: 4,
            desc: "Brace against the next blow — on either beat, and it never costs you a swing.", sprite: "/images/arena/node/wd_ward.webp" }),

        N({ id: "wd_soak", tier: 1, name: "Deep Guard", ranks: 4, stat: "wardSoak", per: 0.02, needs: 3,
            desc: "Wards soak 2% more of your health per rank.", sprite: "/images/arena/node/wd_soak.webp" }),
        N({ id: "wd_riposte", tier: 1, kind: "active", ability: "riposte", name: "Answer", cd: 5, needs: 3,
            desc: "Their next blow comes back at them — and you still act.", sprite: "/images/arena/node/wd_riposte.webp" }),
        N({ id: "wd_thorns", tier: 1, name: "Iron Thorns", ranks: 3, stat: "thorns", per: 0.05, needs: 3,
            desc: "Return 5% of every blow you take, per rank.", sprite: "/images/arena/node/wd_thorns.webp" }),

        N({ id: "wd_drain", tier: 2, kind: "active", ability: "drain", name: "Tithe", power: 1.9, cd: 3, needs: 7,
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
        N({ id: "rc_power", tier: 0, name: "Attunement", ranks: 5, stat: "spellPower", per: 0.05,
            desc: "+5% spell damage per rank.", sprite: "/images/arena/node/rc_power.webp" }),
        N({ id: "rc_edge", tier: 0, name: "Wheelwise", ranks: 4, stat: "elementEdge", per: 0.03,
            desc: "Your affinity is worth 3% more per rank, either way.", sprite: "/images/arena/node/rc_edge.webp" }),
        N({ id: "rc_spell", tier: 0, kind: "active", ability: "spell", name: "Channel", power: 2.3, cd: 4,
            desc: "Its own element, and it cuts guard.", sprite: "/images/arena/node/rc_spell.webp" }),

        N({ id: "rc_rend", tier: 1, kind: "active", ability: "rend", name: "Emberbrand", power: 1.5, cd: 3, needs: 3,
            desc: "Keeps burning for three of their turns.", sprite: "/images/arena/node/rc_rend.webp" }),
        N({ id: "rc_burn", tier: 1, name: "Slow Burn", ranks: 4, stat: "rendTick", per: 0.008, needs: 3,
            desc: "Burns tick 0.8% harder per rank.", sprite: "/images/arena/node/rc_burn.webp" }),
        N({ id: "rc_stacks", tier: 1, name: "Kindling", ranks: 2, stat: "rendStacks", per: 1, needs: 3,
            desc: "+1 burn stack per rank.", sprite: "/images/arena/node/rc_stacks.webp" }),

        N({ id: "rc_sunder", tier: 2, kind: "active", ability: "sunder", name: "Shatter", power: 2.05, cd: 3, needs: 7,
            desc: "Strips their guard for what comes next.", sprite: "/images/arena/node/rc_sunder.webp" }),
        N({ id: "rc_cd", tier: 2, name: "Quickening", ranks: 3, stat: "cdCut", per: 1, needs: 7,
            desc: "Every third rank shaves a turn off one cooldown.", sprite: "/images/arena/node/rc_cd.webp" }),
        N({ id: "rc_pierce", tier: 2, name: "Runebreak", ranks: 4, stat: "pierce", per: 0.05, needs: 7,
            desc: "Cut 5% more of their guard per rank.", sprite: "/images/arena/node/rc_pierce.webp" }),

        N({ id: "rc_overcharge", tier: 3, kind: "active", ability: "spell", name: "Overcharge", power: 3.2, cd: 6, needs: 12,
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
