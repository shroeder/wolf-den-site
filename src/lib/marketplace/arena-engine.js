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

// ── ONE CONVERTER, NOT TWO ───────────────────────────────────────────────────────────────────────────────────
// `ringStats` lived here and turned an NPC's stat line into a fighter, while members went through fighterFrom
// in arena.js. Two functions answering one question is two things to keep in step, and they had not been: this
// one called swingFrom(might) with no weapon, so it fell back to WEAPON_BASE_REF — an invisible 100-base
// weapon, four times better than the best one anybody owns. On identical stats an NPC hit for 2000 and a
// member for 500, and no amount of tuning the tier curve could have found it, because the difference was not
// in the curve.
//
// Every fighter in the game is built by fighterFrom now. An NPC is a made-up player: same vocabulary, same
// converter, same engine.

// ── THE PER-POINT RATES ──────────────────────────────────────────────────────────────────────────────────────
// What one point of each affix converts into, in one place, because the card, the sim and the engine all have
// to agree about it. DEFAULT_SPEED is the fallback clock for anything arriving without a weapon.
export const DEFAULT_SPEED = 10;
export const PIERCE_PER_POINT = 0.005;
export const COUNTER_PER_POINT = 0.0025;
export const DOUBLESTRIKE_PER_POINT = 0.005;
export const LIFESTEAL_PER_POINT = 0.0025;
export const STUN_PER_POINT = 0.005;
export const HASTE_PER_POINT = 0.005;
export const HASTE_ATTACKS = 5;      // how many of your own swings a haste lasts
export const HASTE_RATE = 2;         // and how much faster they come
// ── BLEED ────────────────────────────────────────────────────────────────────────────────────────────────────
// Three ticks at a fifth of the blow that opened it, and armour never sees a drop of it. It ticks on the
// BLEEDING fighter's own swings, which is what "three turns" means when there are no turns: three more times
// they step up to swing, they lose blood first.
export const BLEED_TICKS = 3;
export const BLEED_SHARE = 0.20;
// A burn is a bleed in a different colour: same three ticks, same fifth of the blow, same contempt for armour.
// Tracked separately so a fighter can be burning AND bleeding, and so the two read differently on screen.
export const BURN_TICKS = 3;
export const BURN_SHARE = 0.20;
// Runic Overflow: every Nth swing of your own is a Surge.
export const SURGE_EVERY = 5;

// ── PAST A HUNDRED PERCENT, A CRIT CRITS AGAIN ───────────────────────────────────────────────────────────────
// Crit chance has no ceiling any more, so the question is what the surplus BUYS. Luke's rule, and it is the
// same rule all the way up rather than a special case bolted on at 100:
//
//   below 100%   the ordinary roll — you crit that often, for your crit damage
//   exactly 100  you crit every time
//   150%         you crit every time, and half the time that crit lands DOUBLED
//   200%         you crit every time, doubled, always
//   250%         always doubled, and half the time trebled
//
// So: every whole 100% above the first is one more guaranteed multiple of your crit damage, and the remainder
// is the chance of one more on top. A 212% crit damage build at 150% chance hits for 212% every swing and 424%
// on half of them.
//
// Returns the number of MULTIPLES, so 0 means the blow did not crit at all and 2 means twice the crit damage.
export function critStacks(critChance = 0, rng = Math.random) {
    const cc = Number(critChance) || 0;
    if (cc <= 0) return 0;
    if (cc < 1) return rng() < cc ? 1 : 0;
    const excess = cc - 1;
    const guaranteed = Math.floor(excess);
    return 1 + guaranteed + (rng() < excess - guaranteed ? 1 : 0);
}

// What a swing is worth ON AVERAGE, which is what the rating and every "expected damage" readout wants.
// Below 100% it is the familiar `1 + chance x (mult - 1)`. At or above it the expected number of multiples is
// just the chance itself (150% averages 1.5 multiples), so it is `mult x chance`. The two agree exactly at
// 100%, so the curve has no step in it.
export function critAverage(critChance = 0, critMult = 2.5) {
    const cc = Math.max(0, Number(critChance) || 0);
    const cm = Number(critMult) || 1;
    return cc < 1 ? 1 + cc * (cm - 1) : cm * cc;
}

// A kit's RATING, used for matchmaking and for the ladder. Damage a round times how many rounds you last, which
// is the only honest one-number summary of a fight — and it is computable by the player from the two cards.
export function arenaRating({ damage = 0, critChance = 0, critMult = 2.5, health = 200 }) {
    // critAverage, not the old inline `1 + cc*(cm-1)` — that formula flattens out above 100% chance and would
    // have rated a 250%-crit build as though the surplus bought nothing.
    const perSwing = damage * critAverage(critChance, critMult);
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
        // One roll, but it can come back with more than one multiple of the crit damage — see critStacks.
        const stacks = critStacks(critChance);
        if (stacks > 0) crit = true;
        const raw = attacker.damage * power * mult * (stacks > 0 ? critMult * stacks : 1);
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

// ── AUTO-ATTACK COMBAT ───────────────────────────────────────────────────────────────────────────────────────
// No turns, no commands, no skills. Two fighters swing on their own clocks and the fight resolves itself.
//
// SPEED IS WHEN YOU ATTACK. A fighter's `speed` is their rate, so the interval between their swings is 1/speed
// and a fighter with twice the speed swings twice as often. Nothing else about speed matters — it is not a
// tiebreak for who opens any more, it is the whole schedule.
//
// The clock is arbitrary units. Only the RATIO between the two intervals decides anything, so whether speed 30
// means thirty swings a second or thirty a minute is a presentation question, not a mechanical one.
//
// Each swing is the ordinary one: accuracy, then crit through critStacks (so a fighter past 100% crit chance
// gets their multiples here too), then the defender's damage reduction. Skills, guards, items and abilities
// are deliberately not here.
export function autoBout(me, foe, { rng = Math.random, maxSwings = 10000 } = {}) {
    // Armour is the whole of mitigation now: a flat number subtracted from every blow. Damage reduction is
    // gone (it was a percentage doing the same job worse) and so is accuracy — every swing lands.
    const side = (f) => ({
        // dmgPct was on the kit, on the card, and read by NOTHING — Runic Might and every point spent in it
        // did precisely zero. Folded into the damage the engine actually swings with.
        damage: (Number(f.damage) || 0) * (1 + Math.max(0, Number(f.dmgPct) || 0)),
        critChance: Number(f.critChance) || 0,
        critMult: Number(f.critMult) || 1,
        armor: Math.max(0, Number(f.armor) || 0),
        // 1 point of pierce = 0.5% of your damage that armour never sees. Capped at all of it.
        pierce: Math.max(0, Math.min(1, (Number(f.pierce) || 0) * PIERCE_PER_POINT)),
        // 1 point = 0.25% chance to answer a blow with one of your own. Item-exclusive.
        // Points from gear, plus a straight share from the tree. Two sources, one number.
        counter: Math.max(0, Math.min(1, (Number(f.counter) || 0) * COUNTER_PER_POINT + (Number(f.counterBonus) || 0))),
        // 1 point = 0.5% chance the swing lands twice. Uncapped, like crit chance: past 100% it is simply
        // always two, and the surplus rolls for a third.
        doublestrike: Math.max(0, (Number(f.doublestrike) || 0) * DOUBLESTRIKE_PER_POINT + (Number(f.doublestrikeBonus) || 0)),
        // 1 point = 0.25% of whatever you actually inflict, healed back.
        lifesteal: Math.max(0, (Number(f.lifesteal) || 0) * LIFESTEAL_PER_POINT + (Number(f.lifestealBonus) || 0)),
        // A shield's block chance, and what a block is worth to THIS fighter — the Warden blocks harder.
        blockChance: Math.max(0, Math.min(1, Number(f.blockChance) || 0)),
        blockReduction: Number(f.blockReduction) > 0 ? Number(f.blockReduction) : 0.35,
        // The Warden's escalating guard: every blow that gets through adds `blockStack` to the chance, up to
        // `blockStackMax` times, and a successful block spends the lot. A fighter without it has 0 and 0.
        blockStack: Math.max(0, Number(f.blockStack) || 0),
        blockStackMax: Math.max(0, Number(f.blockStackMax) || 0),
        stacks: 0,
        // 1 point = 0.5% to stun on a landed blow, and 0.5% that a swing casts haste on yourself.
        stun: Math.max(0, Math.min(1, (Number(f.stun) || 0) * STUN_PER_POINT + (Number(f.stunBonus) || 0))),
        haste: Math.max(0, Math.min(1, (Number(f.haste) || 0) * HASTE_PER_POINT + (Number(f.hasteBonus) || 0))),
        // ── THE THREE TREE-ONLY EFFECTS ──────────────────────────────────────────────────────────────
        // bleedDamage deepens the wound, bleedLeech turns it into sustain, and wildProc is the one node
        // that does not know what it is going to do until it fires.
        bleedDamage: Math.max(0, Number(f.bleedDamage) || 0),
        bleedLeech: Math.max(0, Math.min(1, Number(f.bleedLeech) || 0)),
        wildProc: Math.max(0, Math.min(1, Number(f.wildProc) || 0)),
        // ── THE WARDEN'S FOUR ────────────────────────────────────────────────────────────────────────
        // guardChance raises a shield that eats damage before health does; regen heals a share of your own
        // maximum every time you swing; thorns sends part of what you BLOCK back down the blade; and grudge
        // banks what has been done to you since your last swing and puts a share of it into the next one.
        guardChance: Math.max(0, Math.min(1, Number(f.guardChance) || 0)),
        guardSize: Math.max(0, Number(f.guardSize) || 0),
        regen: Math.max(0, Number(f.regen) || 0),
        thorns: Math.max(0, Number(f.thorns) || 0),
        iceThorns: Math.max(0, Number(f.iceThorns) || 0),
        grudge: Math.max(0, Number(f.grudge) || 0),
        // ── THE RUNECALLER'S ───────────────────────────────────────────────────────────────────────────
        burnChance: Math.max(0, Math.min(1, Number(f.burnChance) || 0)),
        burnDamage: Math.max(0, Number(f.burnDamage) || 0),
        burnLeech: Math.max(0, Math.min(1, Number(f.burnLeech) || 0)),
        freeze: Math.max(0, Math.min(1, Number(f.freeze) || 0)),
        chill: Math.max(0, Math.min(0.9, Number(f.chill) || 0)),
        ward: Math.max(0, Number(f.ward) || 0),
        wardRefill: Math.max(0, Number(f.wardRefill) || 0),
        surge: Math.max(0, Number(f.surge) || 0),
        soulfire: Math.max(0, Number(f.soulfire) || 0),
        cataclysm: Math.max(0, Math.min(1, Number(f.cataclysm) || 0)),
        shield: 0,
        banked: 0,
        burnLeft: 0,
        burnPer: 0,
        swingsTaken: 0,
        // Chance a blow of theirs opens a bleed. A share, not points — it comes from the tree rather than
        // from an affix.
        bleedChance: Math.max(0, Math.min(1, Number(f.bleedChance) || 0)),
        stunned: 0,      // swings this fighter must skip
        hasteLeft: 0,    // swings left at double rate
        bleedLeft: 0,    // ticks of bleed still owed
        bleedPer: 0,     // and what each one costs them
        speed: Math.max(0.0001, Number(f.speed) || 1),
        hp: Number(f.health) || 0,
        maxHp: Number(f.health) || 0,
    });
    const A = side(me);
    const B = side(foe);
    // AETHER WARD stands from the opening bell rather than being rolled for — that is the whole difference
    // between it and the Warden's Bastion.
    A.shield += Math.round(A.maxHp * A.ward);
    B.shield += Math.round(B.maxHp * B.ward);
    // CHILL slows the OTHER fighter's clock. Applied once, to the speed the whole fight is paced off.
    if (A.chill > 0) B.speed = Math.max(0.0001, B.speed * (1 - A.chill));
    if (B.chill > 0) A.speed = Math.max(0.0001, A.speed * (1 - B.chill));
    const log = [];
    let t = 0;
    // A hasted fighter's swings come HASTE_RATE times as fast, for HASTE_ATTACKS of their own swings.
    const gap = (f) => (1 / f.speed) / (f.hasteLeft > 0 ? HASTE_RATE : 1);
    let nextA = gap(A);
    let nextB = gap(B);
    let swings = 0;

    // How many times this swing lands. Below 100% it is one blow with a chance of a second; above it, the
    // whole multiples are guaranteed and the remainder rolls — the same shape as crit stacks.
    const blows = (ds) => {
        if (ds <= 0) return 1;
        const guaranteed = 1 + Math.floor(ds);
        return guaranteed + (rng() < ds - Math.floor(ds) ? 1 : 0);
    };

    const swing = (att, def, who) => {
        // Each blow of a doublestrike rolls its own crit, so the stat is variance as well as volume.
        const hits = blows(att.doublestrike);
        let dealt = 0;
        let anyCrit = false;
        let blocked = 0;
        let thornsBack = 0;
        // The grudge is spent on THIS swing and the bank cleared, whether or not the blow lands well.
        const grudgeBonus = att.grudge > 0 ? att.banked * att.grudge : 0;
        att.banked = 0;
        // RUNIC OVERFLOW — every fifth swing of your own, counted rather than rolled, so it is a thing you
        // can see coming.
        att.swingsTaken += 1;
        const surging = att.surge > 0 && att.swingsTaken % SURGE_EVERY === 0;
        for (let i = 0; i < hits; i += 1) {
            const stacks = critStacks(att.critChance, rng);
            if (stacks > 0) anyCrit = true;
            const raw = (att.damage + grudgeBonus) * (stacks > 0 ? att.critMult * stacks : 1)
                * (surging ? 1 + att.surge : 1);
            // ── PIERCE THINS THE ARMOUR ──────────────────────────────────────────────────────────────
            // It used to route a share of the blow AROUND the armour and send the rest through it in full,
            // which is algebraically nothing: `raw*p + (raw - raw*p - armour)` collapses to `raw - armour`
            // for any blow whose un-pierced share still exceeds the armour, and that is nearly every blow.
            // Pierce did literally zero for the entire game and the audit is the only thing that saw it.
            //
            // It reduces the armour instead. 50% pierce means half their armour is not there.
            let blow = Math.max(1, Math.round(raw - def.armor * (1 - att.pierce)));
            // ── THE SHIELD ───────────────────────────────────────────────────────────────────────────
            // Rolled per blow, so a doublestrike gets two chances to be blocked rather than one verdict on
            // both. A block takes blockReduction off THIS blow and clears whatever the guard had banked.
            const chance = def.blockChance + def.blockStack * def.stacks;
            if (chance > 0 && rng() < chance) {
                const before = blow;
                blow = Math.max(1, Math.round(blow * (1 - def.blockReduction)));
                // THORNS ANSWER THE BLOCK, not the blow: what the shield turned aside is what comes back.
                if (def.thorns > 0) thornsBack += Math.round((before - blow) * def.thorns);
                def.stacks = 0;
                blocked += 1;
            } else if (def.blockStackMax > 0) {
                def.stacks = Math.min(def.blockStackMax, def.stacks + 1);
            }
            dealt += blow;
        }
        // A GUARD EATS IT FIRST. Whatever the shield can absorb never reaches health, and what is left of
        // the blow carries on through.
        if (def.shield > 0) {
            const eaten = Math.min(def.shield, dealt);
            def.shield -= eaten;
            dealt -= eaten;
        }
        def.hp -= dealt;
        // THE GRUDGE. What was done to them since their own last swing is banked, and a share of it rides on
        // that swing when it comes.
        if (def.grudge > 0) def.banked += dealt;
        // Lifedrink is off what you ACTUALLY inflict, not what you swung for — armour eats the healing too.
        if (att.lifesteal > 0) att.hp = Math.min(att.maxHp, att.hp + Math.round(dealt * att.lifesteal));
        // ── STUN AND HASTE ───────────────────────────────────────────────────────────────────────────
        // Stun is rolled on the blow and costs the defender their NEXT swing. Haste is rolled on your own
        // swing and speeds up your next few. Both are emitted on the log line so the fight screen can put
        // the callout and the effect on the right fighter at the right moment.
        let stunned = false;
        let hasted = false;
        let bled = false;
        let wild = null;
        if (att.stun > 0 && def.hp > 0 && rng() < att.stun) { def.stunned += 1; stunned = true; }
        if (att.haste > 0 && rng() < att.haste) { att.hasteLeft = HASTE_ATTACKS; hasted = true; }
        // ── THE WILD PROC ────────────────────────────────────────────────────────────────────────────
        // One roll, and only then does it decide which of the three it is. Rolled after the blow so the
        // extra swing it can grant lands on the NEXT one rather than compounding inside this one.
        if (att.wildProc > 0 && rng() < att.wildProc) {
            const pick = Math.floor(rng() * 3);
            if (pick === 0) wild = "doublestrike";
            else if (pick === 1) wild = "counter";
            else wild = "haste";
            if (wild === "haste") att.hasteLeft = HASTE_ATTACKS;
        }
        // A fresh wound REFRESHES rather than stacks — stacking is a Reaver tree node, not the base rule.
        // SOULFIRE — a share of what landed, dealt again as magic that armour and shields both ignore. It
        // goes straight to health, which is what makes it different from pierce.
        let soul = 0;
        if (att.soulfire > 0 && dealt > 0 && def.hp > 0) {
            soul = Math.max(1, Math.round(dealt * att.soulfire));
            def.hp -= soul;
        }
        // CATACLYSM lights and freezes at once, guaranteed, rather than rolling each.
        const cata = att.cataclysm > 0 && def.hp > 0 && rng() < att.cataclysm;
        let burned = false;
        let frozen = false;
        if (def.hp > 0 && (cata || (att.burnChance > 0 && rng() < att.burnChance))) {
            def.burnLeft = BURN_TICKS;
            def.burnPer = dealt * (BURN_SHARE + att.burnDamage);
            burned = true;
        }
        if (def.hp > 0 && (cata || (att.freeze > 0 && rng() < att.freeze))) { def.stunned += 1; frozen = true; }
        if (att.bleedChance > 0 && def.hp > 0 && rng() < att.bleedChance) {
            def.bleedLeft = BLEED_TICKS;
            def.bleedPer = dealt * (BLEED_SHARE + att.bleedDamage);
            bled = true;
        }
        log.push({ t, who, dmg: dealt + soul, crit: anyCrit, hits, blocked, stunned, hasted, bled, wild,
            burned, frozen, surge: surging, soul,
            meBleed: A.bleedLeft, foeBleed: B.bleedLeft, meBurn: A.burnLeft, foeBurn: B.burnLeft });
        // RIMEGUARD answers EVERY blow rather than only a blocked one — that is the difference between the
        // Runecaller's thorns and the Warden's.
        if (def.iceThorns > 0 && dealt > 0 && att.hp > 0) thornsBack += Math.round(dealt * def.iceThorns);
        // Thorns are logged AFTER the blow that set them off — they are the answer to it, and playing them
        // first put the reply on screen before the question.
        if (thornsBack > 0 && att.hp > 0) {
            att.hp -= thornsBack;
            log.push({ t, who: who === "me" ? "foe" : "me", dmg: thornsBack, thorns: true,
                meBleed: A.bleedLeft, foeBleed: B.bleedLeft });
        }
        // ── AND THE DEFENDER MAY ANSWER ──────────────────────────────────────────────────────────────
        // A counter is a real swing, not a subtraction: it rolls its own crit and meets the attacker's
        // armour like any other blow. It never counters a counter — that is a loop, not a mechanic.
        // A wild "doublestrike" is an extra blow right now; a wild "counter" makes the attacker swing again.
        if (wild === "doublestrike" || wild === "counter") {
            const cs = critStacks(att.critChance, rng);
            const craw = att.damage * (cs > 0 ? att.critMult * cs : 1);
            const extra = Math.max(1, Math.round(craw - def.armor * (1 - att.pierce)));
            def.hp -= extra;
            log.push({ t, who, dmg: extra, crit: cs > 0, wild, meBleed: A.bleedLeft, foeBleed: B.bleedLeft });
        }
        if (def.hp > 0 && def.counter > 0 && rng() < def.counter) {
            const cs = critStacks(def.critChance, rng);
            const craw = def.damage * (cs > 0 ? def.critMult * cs : 1);
            const cdealt = Math.max(1, Math.round(craw - att.armor * (1 - def.pierce)));
            att.hp -= cdealt;
            log.push({ t, who: who === "me" ? "foe" : "me", dmg: cdealt, crit: cs > 0, stacks: cs, counter: true });
        }
    };

    // A stunned fighter loses the swing that was due: the clock still turns, they just do not act.
    const take = (att, def, who) => {
        // BLOOD FIRST. The tick lands whether or not they are stunned — a stun stops you swinging, it does
        // not stop you bleeding — and it can kill, which is the whole point of a wound.
        if (att.bleedLeft > 0) {
            const tick = Math.max(1, Math.round(att.bleedPer));
            att.hp -= tick;
            att.bleedLeft -= 1;
            // Whoever OPENED the wound drinks from it. The bleeding fighter is the one paying, so the leech
            // belongs to the other side of the ring.
            const cutter = att === A ? B : A;
            if (cutter.bleedLeech > 0 && cutter.hp > 0) {
                cutter.hp = Math.min(cutter.maxHp, cutter.hp + Math.round(tick * cutter.bleedLeech));
            }
            log.push({ t, who, bleedTick: true, dmg: tick,
                meBleed: A.bleedLeft, foeBleed: B.bleedLeft });
            if (att.hp <= 0) return;
        }
        if (att.burnLeft > 0) {
            const tick = Math.max(1, Math.round(att.burnPer));
            att.hp -= tick;
            att.burnLeft -= 1;
            const lighter = att === A ? B : A;
            if (lighter.burnLeech > 0 && lighter.hp > 0) {
                lighter.hp = Math.min(lighter.maxHp, lighter.hp + Math.round(tick * lighter.burnLeech));
            }
            log.push({ t, who, burnTick: true, dmg: tick, meBleed: A.bleedLeft, foeBleed: B.bleedLeft });
            if (att.hp <= 0) return;
        }
        if (att.stunned > 0) {
            att.stunned -= 1;
            log.push({ t, who, stunnedSkip: true });
            return;
        }
        // MENDING and BASTION both happen on your own swing: you patch yourself up and may raise a shield.
        if (att.regen > 0 && att.hp > 0) att.hp = Math.min(att.maxHp, att.hp + Math.round(att.maxHp * att.regen));
        if (att.wardRefill > 0) {
            att.shield = Math.min(Math.round(att.maxHp * att.ward), att.shield + Math.round(att.maxHp * att.wardRefill));
        }
        if (att.guardChance > 0 && rng() < att.guardChance) {
            att.shield += Math.round(att.maxHp * att.guardSize);
            log.push({ t, who, guard: true, shield: att.shield, meBleed: A.bleedLeft, foeBleed: B.bleedLeft });
        }
        swing(att, def, who);
        if (att.hasteLeft > 0) att.hasteLeft -= 1;
    };

    while (A.hp > 0 && B.hp > 0 && swings < maxSwings) {
        if (nextA <= nextB) { t = nextA; take(A, B, "me"); nextA = t + gap(A); }
        else { t = nextB; take(B, A, "foe"); nextB = t + gap(B); }
        swings += 1;
    }
    return {
        won: B.hp <= 0 && A.hp > 0,
        unresolved: A.hp > 0 && B.hp > 0,
        time: t, swings, log,
        hp: Math.max(0, A.hp), foeHp: Math.max(0, B.hp),
        maxHp: A.maxHp, foeMaxHp: B.maxHp,
    };
}
