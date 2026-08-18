// ── THE PARTS OF A BEAT THAT ARE JUST MATHS ──────────────────────────────────────────────────────────────────
// Pure. No DB, no server-only — which is the entire point of the file existing.
//
// arena.js cannot be imported by anything that is not a request handler: it opens with `import "server-only"`
// and reaches for the database on every path. So the balance simulator was written as a SECOND
// implementation with the constants copied across by hand, under a comment admitting the risk — "if they
// drift, this lies" — and they drifted: five wrong values and six mechanics that no longer exist, including
// a SURGE_MULT that was a buff in the simulator and a cut in the game.
//
// Everything here is the arithmetic a beat is made of, moved out whole rather than retyped, so the simulator
// and the engine cannot disagree about it. What stays in arena.js is the part that genuinely needs a request:
// loading a fighter, saving a bout, paying a reward.
//
// The rule for this file: if it touches the database, the session, or the clock, it does not belong here.
import {
    BLEED_MAX_STACKS, BLEED_PER_TURN, BLEED_TICK_CAP, BLEED_TURNS, BLEED_TURNS_CAP, COUNTER_POWER,
    REND_PER_TURN, REND_TICK_CAP, REND_TURNS, REND_TURNS_CAP,
} from "@/lib/marketplace/arena-kit.js";
// Accuracy and the damage-reduction ceiling are the CLASS file's — a fighter's floor and cap come from what
// they are, not from the kit they carry.
import { ACCURACY_CAP, ACCURACY_FLOOR, DEFAULT_ACCURACY, DEFAULT_GUARD, DR_CAP } from "@/lib/marketplace/arena-classes.js";
import { critChanceFrom, critMultFrom, healthFrom, swingFrom } from "@/lib/marketplace/arena-kit.js";

// ── WHAT A FIGHTER IS, IN RING TERMS ─────────────────────────────────────────────────────────────────────────
// Moved here with the rest of the maths: the simulator has to build a fighter the same way the engine does, or
// it is measuring a different creature. Pure — it reads a stat bag and returns numbers.
export function ringStats(stats = {}) {
    return {
        // `tough` is an NPC archetype's bulk — the old hidden armour percentage, expressed as health so the
        // bar tells the truth. A member has no tough and reads as 1.
        health: Math.round(healthFrom(Number(stats.vitality) || 0) * (Number(stats.tough) || 1)),
        damage: swingFrom(Number(stats.might) || 0),
        critChance: critChanceFrom(Number(stats.crit_chance) || 0),
        critMult: critMultFrom(Number(stats.crit_power) || 0),
        // Damage reduction is a class trait and NPCs have no class, so theirs is 0 and their toughness is in
        // the health above. See arena-npc.js.
        dr: Math.min(DR_CAP, Number(stats.dr) || 0),
        accuracy: Number(stats.accuracy) || DEFAULT_ACCURACY,
        // A Gauntlet foe has no class and no Fortune, so their brace is the flat non-Warden base unless the
        // archetype asked for more. Without this they would guard for `undefined` and bank nothing.
        guard: Number(stats.guard) || DEFAULT_GUARD,
        might: Number(stats.might) || 0,
        fortune: Number(stats.fortune) || 0,
    };
}

// A kit's RATING, used for matchmaking and for the ladder. Damage a round times how many rounds you last, which
// is the only honest one-number summary of a fight — and it is computable by the player from the two cards.
export function arenaRating({ damage = 0, critChance = 0, critMult = 2.5, health = 200 }) {
    const perSwing = damage * (1 + critChance * (critMult - 1));
    return Math.round((perSwing * health) / 10);
}


// ── LIFEDRINK PAYS IN WHOLE HP, SO SMALL RATES HAVE TO BANK ──────────────────────────────────────────────────
// Every payout site rounded its own product, and a small rate never survives that: 1% of a 25-damage blow is
// 0.25, `Math.round` makes it 0, and it makes it 0 on EVERY blow for the whole bout. A 2% ring therefore healed
// nothing at all — the affix was arithmetic that could never produce a number.
//
// The fraction is carried on the bout instead (which is saved between beats), so it pays 1 HP on the fourth
// blow rather than never. Same total, honestly paid, and no rate is too small to exist. Used by all three
// places lifesteal lands — your own swing, what thorns take, and what a riposte sends back — because a rule
// applied at two of three sites is the kind that gets found by whoever is missing the third.
// `side` because BOTH fighters drink. Their passive lifesteal was built onto their card (see buildBout) and
// read by nothing — only their drain ABILITY ever healed them — so the same wardrobe healed on your swings and
// not on theirs, and an identical loadout fought two different fights depending on which side of the ring it
// stood. Each side banks its own remainder.
export function drinkFor(b, amount, rate, side = "me") {
    if (!(rate > 0) || !(amount > 0)) return 0;
    const key = side === "foe" ? "foeDrinkBank" : "drinkBank";
    const owed = (Number(b[key]) || 0) + amount * rate;
    const whole = Math.floor(owed);
    b[key] = owed - whole;                            // the remainder rides to the next blow
    const room = side === "foe" ? (b.foeMaxHp || 0) - (b.foeHp || 0) : (b.maxHp || 0) - (b.hp || 0);
    return Math.min(Math.max(0, room), whole);
}

// ── ONE BURN AND ONE WOUND, WHOEVER LIGHTS THEM ──────────────────────────────────────────────────────────────
// These four lines existed twice, once per side, identical but for `b.foeMaxHp`/`P` against `b.maxHp`/`FP` —
// and the comment on the second copy is a promise that the two will always match ("the same kit has to burn
// identically in an opponent's hands"). A counter that procs is a THIRD and FOURTH place that must light the
// same fire, and four copies of a promise is how it gets broken. `onFoe` is who catches it.
//
// Naming, preserved from the engine and worth knowing: `b.bleed` is the BURN on them and `b.gash` is the
// wound; `b.foeBleed` and `b.foeGash` are the two on you.
export function lightBurn(b, onFoe, perks = {}) {
    const maxHp = onFoe ? b.foeMaxHp : b.maxHp;
    const track = onFoe ? b.bleed : b.foeBleed;
    const per = Math.max(1, Math.round(maxHp * REND_PER_TURN * (1 + (perks.rendTick || 0))));
    const stacks = (track?.stacks || 0) + 1;
    const next = {
        turns: Math.min(REND_TURNS_CAP, REND_TURNS + Math.round(perks.rendTurns || 0)),
        stacks,
        dmg: Math.min(per * stacks, Math.max(1, Math.round(maxHp * (REND_TICK_CAP + (perks.rendCap || 0))))),
    };
    if (onFoe) b.bleed = next; else b.foeBleed = next;
    return next;
}

export function openWound(b, onFoe, perks = {}) {
    const maxHp = onFoe ? b.foeMaxHp : b.maxHp;
    const track = onFoe ? b.gash : b.foeGash;
    const per = Math.max(1, Math.round(maxHp * BLEED_PER_TURN * (1 + (perks.bleedTick || 0))));
    const stacks = Math.min(BLEED_MAX_STACKS, (track?.stacks || 0) + 1);
    const next = {
        // ── THREE TURNS, FLOOR, NO MATTER WHAT ───────────────────────────────────────────────────────────
        // Luke: "any bleed you stack on someone should last for three turns no matter, like, at a minimum."
        // BLEED_TURNS is 3 today, so this changes nothing right now — it is here so that it cannot stop
        // being true by accident. A cap and a floor written at the same place is how a duration stays a
        // promise instead of a default somebody lowers later without noticing what it meant.
        //
        // Re-applying REFRESHES to the full duration rather than topping up, so a second wound on a bleeding
        // opponent always buys the whole three turns again.
        turns: Math.max(BLEED_TURNS, Math.min(BLEED_TURNS_CAP, BLEED_TURNS + Math.round(perks.bleedTurns || 0))),
        stacks,
        dmg: Math.min(per * stacks, Math.max(1, Math.round(maxHp * BLEED_TICK_CAP))),
    };
    if (onFoe) b.gash = next; else b.foeGash = next;
    return next;
}

// ── THE ATTACK ROLL, IN ONE PLACE ────────────────────────────────────────────────────────────────────────────
// Accuracy per blow, one doublestrike roll for the whole action, a crit roll per blow, and their guard taken
// off each one. Every term that is specific to WHAT was thrown — the timing grade, an ability's power, surge,
// the opener, the low-health bonus, Brutality — arrives as `mult`, so this function is the roll and nothing
// else.
//
// It exists because a counter has to BE an attack rather than resemble one. Luke: "I want you to fully
// reproduce the attack roll." A second implementation would have reproduced it on the day it was written and
// then quietly stopped: the first time doublestrike or accuracy changed, the counter would be running last
// month's rules and nothing would say so.
export function throwBlows({ attacker, hits = 1, power = 1, acc, critChance, critMult, guard, mult = 1 }) {
    const each = [];
    let dmg = 0;
    let turned = 0;
    let crit = false;
    let hitsLanded = 0;
    // Rolled ONCE per action rather than per hit, or a three-hit flurry would get three chances at it and the
    // stat would read completely differently depending on which move you threw.
    const doubled = (attacker.doublestrike || 0) > 0 && Math.random() < attacker.doublestrike;
    const total = hits + (doubled ? 1 : 0);
    for (let i = 0; i < total && power > 0; i += 1) {
        if (Math.random() >= acc) { each.push(0); continue; }
        hitsLanded += 1;
        const c = Math.random() < critChance;
        if (c) crit = true;
        const raw = attacker.damage * power * mult * (c ? critMult : 1);
        turned += Math.round(raw * guard);
        const landed = Math.max(1, Math.round(raw - raw * guard));
        each.push(landed);
        dmg += landed;
    }
    return { dmg, turned, crit, each, hitsLanded, doubled, hits: total };
}

// ── A COUNTER IS A SWING, NOT A SUBTRACTION ──────────────────────────────────────────────────────────────────
// It was `Math.round(damage * 0.5)` taken straight off a health bar: it could not crit, it drank nothing, it
// lit nothing, and the damage bonus that multiplies every other blow you throw did not touch it. A Reaver
// whose whole kit is bleeds got a counter that never bled. So it rolls everything a real blow rolls — crit,
// Brutality, Lifedrink, and the bleed and burn chances the class carries — on both sides of the ring.
//
// Not doublestrike: a free swing that can spawn a second free swing off a blow you did not throw is a
// different mechanic, and this one is already answering someone else's turn.
export function counterBlow(b, mine) {
    const attacker = mine ? b.me : b.foe;
    const defender = mine ? b.foe : b.me;
    const perks = (mine ? b.me?.perks : b.foe?.perks) || {};

    // THE SAME ROLL A PLAIN SWING MAKES, through the same function — accuracy (so it can miss), one
    // doublestrike roll, a crit roll per blow, Brutality, and the defender's damage reduction off each one.
    // What it does NOT carry are the terms that belong to a turn you spent: no timing grade, no ability
    // power, no surge, no opener, no low-health bonus. A counter is a plain attack thrown on somebody
    // else's beat.
    const roll = throwBlows({
        attacker,
        hits: 1,
        power: COUNTER_POWER,
        acc: Math.max(ACCURACY_FLOOR, Math.min(ACCURACY_CAP, Number(attacker.accuracy) || DEFAULT_ACCURACY)),
        critChance: attacker.critChance ?? 0.25,
        critMult: attacker.critMult ?? 2.5,
        guard: Math.max(0, Math.min(DR_CAP, Number(defender.dr) || 0)),
        mult: 1 + (attacker.dmgPct || 0),
    });
    const dmg = roll.dmg;
    const crit = roll.crit;

    // A counter that misses is a counter: it fired, it swung, and their guard was where it needed to be.
    if (dmg <= 0) return { dmg: 0, crit: false, drank: 0, burned: false, bled: false, doubled: roll.doubled, missed: true };

    if (mine) b.foeHp = Math.max(0, b.foeHp - dmg);
    else b.hp = Math.max(0, b.hp - dmg);

    let drank = 0;
    const steal = Number(attacker.lifesteal) || 0;
    if (steal > 0) {
        drank = drinkFor(b, dmg, steal, mine ? "me" : "foe");
        if (mine) b.hp += drank; else b.foeHp += drank;
    }

    let burned = false;
    if ((attacker.burnChance || 0) > 0 && Math.random() < attacker.burnChance) burned = true;
    // Conflagration reads the same on a counter as on a swing: a critical leaves a burn behind.
    if (crit && (perks.burnOnCrit || 0) > 0) burned = true;
    if (burned) lightBurn(b, mine, perks);

    let bled = false;
    if ((attacker.bleedChance || 0) > 0 && Math.random() < attacker.bleedChance) {
        openWound(b, mine, perks);
        bled = true;
    }

    return { dmg, crit, drank, burned, bled, doubled: roll.doubled, missed: false };
}

