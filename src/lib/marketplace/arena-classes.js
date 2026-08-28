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
// ── WHERE THE CLIMB STOPS ────────────────────────────────────────────────────────────────────────────────────
// There was no ceiling — the loop ran to 200 — so a member's tree budget grew forever and the top of the
// ladder could never be caught. 24 is the level the furthest-along member had actually reached when this was
// set, so it takes nothing from anybody: it fixes the ceiling at the top of the game rather than below it.
export const ARENA_MAX_LEVEL = 24;

export function arenaLevelFor(xp = 0) {
    const x = Math.max(0, Number(xp) || 0);
    let level = 1;
    while (arenaXpForLevel(level + 1) <= x && level < ARENA_MAX_LEVEL) level += 1;
    const floor = arenaXpForLevel(level);
    const ceil = arenaXpForLevel(level + 1);
    // At the cap the bar reads full rather than empty, and `next` is null so nothing renders a target that can
    // never arrive. Everything that divides by span is already guarded by the Math.max below.
    if (level >= ARENA_MAX_LEVEL) return { level, xp: x, into: 1, span: 1, next: null, maxed: true };
    return { level, xp: x, into: x - floor, span: Math.max(1, ceil - floor), next: ceil };
}

/** What a bout is worth in arena XP. Harder opponents teach you more — the same idea as Victory Points. */
// Arena XP levels the class and feeds the skill tree. A loss used to pay 35% of a win, which made a member
// stuck at a wall able to keep levelling by feeding themselves to it — progress for failing. Nothing is paid
// for losing any more; see the note in arena-rewards.js.
// ── WHAT A FIGHT IS WORTH DEPENDS ON WHAT IT COST YOU ────────────────────────────────────────────────────────
// Every kind of bout paid the same, and they are not the same thing to obtain. A member-versus-member fight
// needs a real opponent and spends one of the ten you get in a day; a Gauntlet tier is always standing there
// and spends the same ten; a Road rung spends none of them at all.
//
// So the rate follows the scarcity. PvP is the premium — it is the one you cannot farm, the one that needs
// somebody else to be online, and the one the daily allowance was built to ration. Measured before this
// change, twenty points was 46,240 XP: 63 days of winning all ten fights a day, every day, against opponents
// your own size. The best player in the Den was on track for 72.
export const PVP_XP_MULT = 3;      // needs another member, and one of your ten
export const NPC_XP_MULT = 1;      // always available, still costs one of the ten
// ── THE ROAD PAYS BY HOW HIGH THE RUNG IS ────────────────────────────────────────────────────────────────────
// The Road is not a farm and never was: a rung can be beaten ONCE. So the thing that stopped it being the best
// rate is not a multiplier, it is that the whole ladder is a fixed pool — a hundred rewards, in order, and no
// way to take any of them twice.
//
// Which means the payout should follow the RUNG, not the power ratio. Walking in order, every rung sits a few
// percent above the last and a few percent above you, so the ratio never moves and the difficulty scaling it
// was supposed to express never expressed anything. Rung 40 should pay more than rung 10 because it IS rung 40.
//
// Compounding, so the climb is worth more the higher it goes — 30 at the first rung, 135 at the thirtieth,
// 420 at the fiftieth. Walking as far as anybody currently can (about rung 46) is worth roughly an eighth of
// a twenty-point journey, spread over forty-six one-time fights.
export const ROAD_XP_BASE = 30;
export const ROAD_XP_GROWTH = 1.055;
export const roadArenaXp = (rung) => Math.round(ROAD_XP_BASE * Math.pow(ROAD_XP_GROWTH, Math.max(1, Math.round(rung)) - 1));

//  is whatever boutKindOf() says: member, gauntlet, ladder or town. Named the same way there so the two
// cannot drift into disagreeing about what a fight was.
export const XP_MULT_BY_KIND = { member: PVP_XP_MULT, gauntlet: NPC_XP_MULT, town: NPC_XP_MULT };

// ── AND A LOSS PAYS, WHERE THE ATTEMPTS ARE RATIONED ─────────────────────────────────────────────────────────
// A loss used to pay 35% and it was taken away for a good reason: Sunflower Jinxx, walled on the Road, said
// "I am just taking loss after loss to try and get laurels for recipes" — the game was paying her to keep
// doing the thing that was making her want to stop. But that was the ROAD, where attempts are unlimited, and
// unlimited is what made it farmable.
//
// A member fight and a Gauntlet tier each spend one of the ten you get in a day. Ten is the ration, so paying
// for a loss there cannot become an income — it can only stop a bad evening being a wasted one. On the Road it
// still pays nothing, because nothing there stops you doing it a hundred times.
export const LOSS_SHARE = 0.35;
const LOSS_PAYS = new Set(["member", "gauntlet"]);

export function arenaXpFor({ won, myPower = 1, theirPower = 1, kind = "gauntlet", rung = 0 }) {
    // A rung is priced by its height, once, and a loss on the Road still pays nothing — see LOSS_PAYS.
    if (kind === "ladder") return won ? roadArenaXp(rung) : 0;
    const ratio = Math.max(0.3, Math.min(2.5, (Number(theirPower) || 1) / Math.max(1, Number(myPower) || 1)));
    const mult = XP_MULT_BY_KIND[kind] === undefined ? NPC_XP_MULT : XP_MULT_BY_KIND[kind];
    const win = Math.round((26 + 48 * ratio) * mult);
    if (won) return win;
    return LOSS_PAYS.has(kind) ? Math.round(win * LOSS_SHARE) : 0;
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
// Nobody dodges forever and nobody hits forever: a ceiling on each so investment cannot end the interaction.
export const DR_CAP = 0.60;
// 0.98 rather than 1.0, deliberately: a plain swing must ALWAYS be able to miss. At a cap of 1 a
// well-invested fighter reaches "never misses", and the moment that happens every skill's accuracy cost
// stops being a trade-off and becomes a rounding error — which is the whole mechanic gone.

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
        N({ id: "rv_quick", tier: 0, name: "Quickblade", ranks: 5, stat: "tempoBonus", per: 0.027,
            desc: "Your turn bar fills faster — a steady +2.7% a rank, every beat, no roll.",
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
            desc: "+2% chance a blow stops their turn bar dead for a second.",
            sprite: "/images/arena/node/rv_stun.webp" }),
        // Was doublestrikeBonus, the same value in the mechanic that replaced it. Anybody holding five ranks
        // here keeps exactly what they bought — see the note on `extra` in arena.js.
        N({ id: "rv_frenzy", tier: 2, name: "Frenzy", ranks: 5, stat: "tempoBonus", per: 0.009, needs: 7,
            desc: "Your turn bar fills faster — +0.9% a rank, on top of Quickblade.",
            sprite: "/images/arena/node/rv_flurry.webp" }),

        // TIER 4 — capstones.
        N({ id: "rv_scent", tier: 3, name: "Bloodscent", ranks: 5, stat: "hasteBonus", per: 0.02, needs: 12,
            desc: "+2% chance a swing sends your turn bar to DOUBLE speed for six seconds.",
            sprite: "/images/arena/node/rv_haste.webp" }),
        N({ id: "rv_exsang", tier: 3, name: "Exsanguinate", ranks: 5, stat: "bleedLeech", per: 0.03, needs: 12,
            desc: "+3% of all bleed damage healed back to you. Rend starts it, Deep Cuts deepens it, this drinks it.",
            sprite: "/images/arena/node/rv_leech.webp" }),
        N({ id: "rv_harvest", tier: 3, name: "Red Harvest", ranks: 5, stat: "wildProc", per: 0.01, needs: 12,
            desc: "+1% chance on any swing to fire one of counter or haste at random.",
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
            desc: "+2% chance a blow stops their turn bar dead for a second.",
            sprite: "/images/arena/node/wd_stun.webp" }),
        N({ id: "wd_thorns", tier: 3, name: "Thornmail", ranks: 5, stat: "thorns", per: 0.04, needs: 12,
            desc: "+4% of the damage your BLOCK turns aside is sent back down the blade.",
            sprite: "/images/arena/node/wd_thorns.webp" }),
        N({ id: "wd_unbreak", tier: 3, name: "Unbreakable", ranks: 5, stat: "guardSize", per: 0.20, needs: 12,
            desc: "+20% to the size of every guard you raise. Bastion decides how often; this decides how much.",
            sprite: "/images/arena/node/wd_aegis.webp" }),
    ],
    // ── RUNECALLER ── fire, frost, and a ward that is simply up. It wins the rounds after the one it is in.
    runecaller: [
        // TIER 1 — kindle.
        N({ id: "rc_kindle", tier: 0, name: "Kindle", ranks: 5, stat: "burnChance", per: 0.06,
            desc: "+6% chance a blow sets a burn. A burn ticks three times for a fifth of the blow and armour never sees it.",
            sprite: "/images/arena/node/rc_burn.webp" }),
        N({ id: "rc_ember", tier: 0, name: "Emberheart", ranks: 5, stat: "burnDamage", per: 0.04,
            desc: "+4% of the blow to every burn tick, on top of the base fifth.",
            sprite: "/images/arena/node/rc_ember.webp" }),
        N({ id: "rc_immolate", tier: 0, name: "Immolate", ranks: 5, stat: "burnLeech", per: 0.03,
            desc: "+3% of all burn damage healed back to you.", sprite: "/images/arena/node/rc_leech.webp" }),

        // TIER 2 — the cold.
        N({ id: "rc_frost", tier: 1, name: "Frostbite", ranks: 5, stat: "freeze", per: 0.02, needs: 3,
            desc: "+2% chance a blow FREEZES: their turn bar stops dead. Every rank also makes your freezes last longer — see the Runecaller's two seconds.",
            sprite: "/images/arena/node/rc_freeze.webp" }),
        N({ id: "rc_chill", tier: 1, name: "Chill", ranks: 5, stat: "chill", per: 0.02, needs: 3,
            desc: "Every blow you land slows their turn bar by another 2%, and the cold wears off over eight seconds. It stacks, and nothing caps it.",
            sprite: "/images/arena/node/rc_chill.webp" }),
        N({ id: "rc_rime", tier: 1, name: "Rimeguard", ranks: 5, stat: "iceThorns", per: 0.03, needs: 3,
            desc: "+3% of the damage done to you is sent back. Every blow, not only the ones you block.",
            sprite: "/images/arena/node/rc_thorns.webp" }),

        // TIER 3 — the ward.
        N({ id: "rc_ward", tier: 2, name: "Aether Ward", ranks: 5, stat: "ward", per: 0.02, needs: 7,
            desc: "+2% of your maximum health as a shield, standing from the opening bell. It eats damage before your health does.",
            sprite: "/images/arena/node/rc_ward.webp" }),
        N({ id: "rc_reservoir", tier: 2, name: "Runic Reservoir", ranks: 5, stat: "wardRefill", per: 0.002, needs: 7,
            desc: "Your ward refills 0.2% of your maximum health every time you swing.",
            sprite: "/images/arena/node/rc_reservoir.webp" }),
        N({ id: "rc_overflow", tier: 2, name: "Runic Overflow", ranks: 5, stat: "surge", per: 0.20, needs: 7,
            desc: "Every fifth swing of yours is a Surge, dealing +20% more. Counted, not rolled — you can see it coming.",
            sprite: "/images/arena/node/rc_surge.webp" }),

        // TIER 4 — capstones.
        N({ id: "rc_might", tier: 3, name: "Runic Might", ranks: 5, stat: "dmgPct", per: 0.03, needs: 12,
            desc: "+3% damage.", sprite: "/images/arena/node/rc_might.webp" }),
        N({ id: "rc_soulfire", tier: 3, name: "Soulfire", ranks: 5, stat: "soulfire", per: 0.02, needs: 12,
            desc: "+2% of every blow is dealt AGAIN as pure magic — past armour and past shields both.",
            sprite: "/images/arena/node/rc_soulfire.webp" }),
        N({ id: "rc_cata", tier: 3, name: "Cataclysm", ranks: 5, stat: "cataclysm", per: 0.01, needs: 12,
            desc: "+1% chance a swing burns AND freezes at once, both guaranteed.",
            sprite: "/images/arena/node/rc_cata.webp" }),
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
