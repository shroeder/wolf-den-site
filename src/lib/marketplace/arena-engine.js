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
    BLEED_MAX_STACKS, BLEED_PER_TURN, BLEED_TICK_CAP, BLEED_TURNS, BLEED_TURNS_CAP,
    CONTROL_IMMUNE_TURNS, COUNTER_POWER, REND_PER_TURN, REND_TICK_CAP, REND_TURNS, REND_TURNS_CAP,
    SHIELD_DECAY,
} from "@/lib/marketplace/arena-kit.js";
// Accuracy and the damage-reduction ceiling are the CLASS file's — a fighter's floor and cap come from what
// they are, not from the kit they carry.
import { ACCURACY_CAP, ACCURACY_FLOOR, DEFAULT_ACCURACY, DEFAULT_GUARD, DR_CAP } from "@/lib/marketplace/arena-classes.js";
import { EXTRA_TURN_MAX, critChanceFrom, critMultFrom, drFrom, healthFrom, swingFrom } from "@/lib/marketplace/arena-kit.js";

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
// ── THERE IS NO CLOCK. THE TURNS ALTERNATE. ──────────────────────────────────────────────────────────────────
// Luke, 2026-08-21: "let's just remove the idea of speed from the arena, everyone gets a turn and then it's
// the other person's turn unless they get stunned or something."
//
// Speed had been the pacing of every fight since the auto-resolver: a fighter's beat came round every
// 1/speed, so a faster one simply got more of them. It reads fine in a transcript and it does not survive
// being PLAYED. One tap returns your swing plus every beat the clock owes them before your next, so a faster
// opponent's extra blow always lands in the last sentence before your turn comes back — which reads as the
// game taking turns away from you. It got reported as a bug twice in one day, and the second time it was not
// a bug at all: the beats were exactly the 1.06 v 1.31 speed gap, correctly applied, and unreadable.
//
// So: you, them, you, them. A turn is lost only to something with a NAME — a stun, a freeze, a chill — which
// is a sentence the screen can print instead of an arithmetic nobody can see.
//
// ── AND SPEED BECAME THE EXTRA TURN ──────────────────────────────────────────────────────────────────────────
// Ferocity, a weapon's attack speed, Quickblade and Haste all fed the clock, so removing it would have made
// four kinds of content worth nothing. They feed ONE number now — `extra`, the chance to immediately take
// another turn — which is the same arithmetic wearing a shape a player can see: a fighter who took p extra
// turns per turn under the clock takes p extra turns per turn now, and the screen says GOES AGAIN when it
// happens instead of quietly dealing them a beat.
//
// ONE PER EXCHANGE. An extra turn does not roll for another, or a lucky streak is an unanswerable combo.
// A queued haste is the exception and is deliberately a separate field: it is GRANTED, not rolled.
//
// EXTRA_TURN_MAX and extraTurnFrom live in arena-kit.js with the other balance constants.
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
// ── EVERY FIELD A SWING IS RESOLVED FROM, NAMED ONCE ─────────────────────────────────────────────────────────
// This exists because of a bug that had been live for as long as the current engine has: buildBout rebuilds
// both fighters as a hand-written ALLOWLIST before writing them to bout_json, and that allowlist named twenty
// of the thirty-five fields sideOf reads. The other twenty-seven — armour first among them — were computed by
// fighterFrom, printed on the fighter card, and then dropped on the floor on the way into the fight.
//
// What that meant in a real bout: armour did nothing. Pierce did nothing, because there was no armour to
// pierce. Every Warden node did nothing — block, thorns, guard, regen, ward. Every Runecaller node past the
// burn chance did nothing — freeze, chill, surge, soulfire, cataclysm. Stun, haste, counter, grudge, wildProc:
// nothing. Measured, the same two fighters won 100% with their kit and 85% with what production actually
// handed the engine.
//
// The allowlist itself was right — bout_json should not swallow whatever happens to be on a fighter object.
// What was wrong is that it was maintained BY HAND, in a different file from the function that decides what a
// swing needs. So the list lives here now, beside sideOf, and buildBout spreads `fighterFields()` instead of
// naming fields. A new mechanic added to sideOf without adding it here is caught by scripts/check-bout-fields,
// which reads what sideOf actually touches rather than trusting either list.
export const COMBAT_FIELDS = [
    // the four numbers a card shows
    "damage", "health", "critChance", "critMult", "dmgPct",
    // turn order: the chance to take another one, and the chance one of theirs never happens
    "extra", "skipChance",
    // and how fast this fighter's timer bar fills, for a bout opened in that mode — see arena-atb.js. It is
    // carried on every fighter rather than only on timer bouts, because a bout is stamped with its mode at
    // the bell and this has to already be in bout_json by then.
    "tempo",
    // mitigation and getting through it
    "armor", "pierce", "blockChance", "blockReduction", "blockStack", "blockStackMax",
    // the procs that come off affix points
    "counter", "doublestrike", "lifesteal", "stun", "haste",
    // over time, and what drinks from it
    "bleedChance", "bleedDamage", "bleedLeech", "burnChance", "burnDamage", "burnLeech",
    // the Warden's four, plus the ice that answers every blow
    "guardChance", "guardSize", "regen", "thorns", "iceThorns", "grudge",
    // the Runecaller's
    "freeze", "chill", "ward", "wardRefill", "surge", "soulfire", "cataclysm",
    // and the tree's flat shares, which add on top of the point-based versions above
    "counterBonus", "doublestrikeBonus", "lifestealBonus", "stunBonus", "hasteBonus", "wildProc",
];

/** A fighter reduced to exactly what the ring needs, for writing into bout_json. Spread this; never retype it. */
export function fighterFields(f = {}) {
    const out = {};
    for (const k of COMBAT_FIELDS) if (f[k] !== undefined && f[k] !== null) out[k] = f[k];
    return out;
}

// ── A FIGHTER, IN THE SHAPE THE RING USES ────────────────────────────────────────────────────────────────────
// Every affix, node and class trait converted to the units a swing is resolved in, once. This was `side`,
// declared inside autoBout — fine while a bout was one function call, wrong the moment a fight has to be put
// down between beats and picked back up. A turn-based ring saves this object to `bout_json` and resumes off
// it, so it has to be a value anybody can build rather than a closure only the auto-resolver could reach.
export const sideOf = (f) => ({
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
        // Did this fighter lose their last turn — see the note at the top of openTurn. Carried on the side
        // rather than on the ring so a raid, a fishing bout and an arena challenge all get the same rule.
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
        // Beats of immunity to losing a turn. Set when a beat is taken off you; see the denial roll.
        controlImmune: 0,
        banked: 0,
        burnLeft: 0,
        burnPer: 0,
        swingsTaken: 0,
        // Chance a blow of theirs opens a bleed. A share, not points — it comes from the tree rather than
        // from an affix.
        bleedChance: Math.max(0, Math.min(1, Number(f.bleedChance) || 0)),
        stunned: 0,      // turns this fighter must skip
        bonusTurns: 0,   // turns GRANTED (a haste proc), taken whether or not the roll comes up
        bleedLeft: 0,    // ticks of bleed still owed
        bleedPer: 0,     // and what each one costs them
        // The chance to take another turn straight away — see EXTRA_TURN_MAX. This is where a weapon's
        // attack speed, Ferocity and Quickblade all land now that nothing is paced off a clock.
        extra: Math.max(0, Math.min(EXTRA_TURN_MAX, Number(f.extra) || 0)),
        // And the chance one of THEIR turns simply does not happen — Chill, which used to slow their clock.
        skipChance: Math.max(0, Math.min(0.85, Number(f.skipChance) || 0)),
        // ── AND THE SAME TWO INPUTS AGAIN, UNCONVERTED ───────────────────────────────────────────────────
        // `extra` above is weapon speed and Ferocity folded into a go-again chance, which is lossy on
        // purpose. The timer needs the rate itself rather than the chance it was turned into, so it rides
        // along beside it. A fighter built without one falls back to bare-handed, same as the old clock did.
        tempo: Math.max(0.2, Number(f.tempo) || 1),
        hp: Number(f.health) || 0,
        maxHp: Number(f.health) || 0,
});

/**
 * Does this fighter go again?
 *
 * `wasExtra` is the one-per-exchange rule: the turn you were handed does not roll for another. A GRANTED turn
 * (Haste) is checked first and consumed, because it was promised rather than rolled — and it is allowed to
 * follow an extra turn, which is what makes proccing Haste on a lucky beat feel like the event it is.
 *
 * Both loops call this, which is the whole point of it living here: an auto-resolved bout and a played one
 * cannot disagree about how many turns somebody got.
 */
export function goesAgain(f, rng = Math.random, wasExtra = false) {
    if (f.bonusTurns > 0) { f.bonusTurns -= 1; return "granted"; }
    if (wasExtra || f.extra <= 0) return null;
    return rng() < f.extra ? "extra" : null;
}

// How many times this swing lands. Below 100% it is one blow with a chance of a second; above it, the whole
// multiples are guaranteed and the remainder rolls — the same shape as crit stacks.
export const blowCount = (ds, rng = Math.random) => {
    if (ds <= 0) return 1;
    const guaranteed = 1 + Math.floor(ds);
    return guaranteed + (rng() < ds - Math.floor(ds) ? 1 : 0);
};

// ── ONE SWING, WHOEVER THREW IT AND HOWEVER IT WAS CHOSEN ────────────────────────────────────────────────────
// Lifted whole out of autoBout. An auto-resolved bout and a turn you took by hand must be the same arithmetic
// or the game has two combat models, and the file's own opening comment is about what happened the last time
// this repo had two of something.
//
// The three parameters that did not exist before are the entire difference between a swing that happens TO you
// and one you chose:
//
//   mult          everything specific to what was thrown — a skill's power, and the timing grade on it
//   hitsOverride  a skill that strikes a fixed number of times, instead of rolling doublestrike for it
export function resolveSwing({ A, B, att, def, who, log, t, rng = Math.random, mult = 1, hitsOverride = 0 }) {
        // Each blow of a doublestrike rolls its own crit, so the stat is variance as well as volume.
        const hits = hitsOverride || blowCount(att.doublestrike, rng);
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
                * (surging ? 1 + att.surge : 1) * mult;
            // ── PIERCE THINS THE ARMOUR ──────────────────────────────────────────────────────────────
            // It used to route a share of the blow AROUND the armour and send the rest through it in full,
            // which is algebraically nothing: `raw*p + (raw - raw*p - armour)` collapses to `raw - armour`
            // for any blow whose un-pierced share still exceeds the armour, and that is nearly every blow.
            // Pierce did literally zero for the entire game and the audit is the only thing that saw it.
            //
            // It reduces the armour instead. 50% pierce means half their armour is not there.
            //
            // ── ARMOUR TURNS A SHARE ASIDE ───────────────────────────────────────────────────────────
            // A / (A + K), not subtraction — see drFrom in arena-kit.js for why, and for how K was picked.
            // The short version: armour is bigger than damage for every member in this game, so subtraction
            // pinned every blow to its cap and 550 armour played identically to 1800.
            //
            // ONE FUNCTION FOR ALL THREE DAMAGE PATHS, which is the other half of the fix. The counter and
            // the wild doublestrike below did their own uncapped `raw - armour`, so against anything with
            // armour above your damage they landed on the 1-damage floor every single time. Luke: "when I
            // counter attack why does it only do 1 damage." Because it was the one swing in the game that
            // never got the cap. There is no cap now and there is no second copy of the arithmetic either.
            let blow = Math.max(1, Math.round(raw * (1 - drFrom(def.armor, att.pierce))));
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
        // CAPPED AT ONE. This was `+= 1`, so two landed stuns queued two lost beats and a stun build could
        // bank them faster than they were spent — the lock the immunity rule below exists to end, arriving by
        // a second route. One pending beat, however many times you land it.
        if (att.stun > 0 && def.hp > 0 && rng() < att.stun) { def.stunned = Math.min(1, def.stunned + 1); stunned = true; }
        // HASTE IS ONE TURN, GRANTED. It used to be five swings at double rate, which needed a clock to be
        // five swings faster THAN. A turn you are handed on the spot is the same idea a player can watch.
        if (att.haste > 0 && rng() < att.haste) { att.bonusTurns += 1; hasted = true; }
        // ── THE WILD PROC ────────────────────────────────────────────────────────────────────────────
        // One roll, and only then does it decide which of the three it is. Rolled after the blow so the
        // extra swing it can grant lands on the NEXT one rather than compounding inside this one.
        if (att.wildProc > 0 && rng() < att.wildProc) {
            const pick = Math.floor(rng() * 3);
            if (pick === 0) wild = "doublestrike";
            else if (pick === 1) wild = "counter";
            else wild = "haste";
            if (wild === "haste") att.bonusTurns += 1;
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
        // ── A BLOW THE GUARD ATE STARTS NO FIRE ──────────────────────────────────────────────────────
        // `dealt` is what reached HEALTH, and a tick is a share of it — so a blow a shield absorbed
        // entirely lit a fire worth `0 * share`, which the max(1, ...) floor turned into three ticks of
        // ONE DAMAGE. Filmed on a real bout it is most of the transcript: "You burn — 1", over and over,
        // from blows that did nothing. A wound needs a wound.
        if (dealt > 0 && def.hp > 0 && (cata || (att.burnChance > 0 && rng() < att.burnChance))) {
            def.burnLeft = BURN_TICKS;
            def.burnPer = dealt * (BURN_SHARE + att.burnDamage);
            burned = true;
        }
        if (def.hp > 0 && (cata || (att.freeze > 0 && rng() < att.freeze))) { def.stunned += 1; frozen = true; }
        if (dealt > 0 && att.bleedChance > 0 && def.hp > 0 && rng() < att.bleedChance) {
            def.bleedLeft = BLEED_TICKS;
            def.bleedPer = dealt * (BLEED_SHARE + att.bleedDamage);
            bled = true;
        }
        log.push({ t, who, dmg: dealt + soul, crit: anyCrit, hits, blocked, stunned, hasted, bled, wild,
            burned, frozen, surge: surging, soul,
            meBleed: A.bleedLeft, foeBleed: B.bleedLeft, meHp: A.hp, foeHp: B.hp, meShield: A.shield, foeShield: B.shield, meStun: A.stunned, foeStun: B.stunned, meChill: A.skipChance, foeChill: B.skipChance, meBurn: A.burnLeft, foeBurn: B.burnLeft });
        // RIMEGUARD answers EVERY blow rather than only a blocked one — that is the difference between the
        // Runecaller's thorns and the Warden's.
        // ── AND IT SAYS WHICH KIND IT WAS ────────────────────────────────────────────────────────────────
        // Luke: "why do I have 2 thorns when he didn't hit me?" He has `thorns: 0` and always has — every one
        // of those lines is ICE thorns off Rimeguard, which is a different effect with a different trigger:
        // ordinary thorns take a share of what your BLOCK turned aside, ice takes a share of every blow that
        // lands. Both were writing the same sentence, so a Runecaller reading "Thorns bite back" was being
        // told about a mechanic they do not own, twice, for blows they could not see being blocked.
        let iced = false;
        if (def.iceThorns > 0 && dealt > 0 && att.hp > 0) { thornsBack += Math.round(dealt * def.iceThorns); iced = true; }
        // Thorns are logged AFTER the blow that set them off — they are the answer to it, and playing them
        // first put the reply on screen before the question.
        if (thornsBack > 0 && att.hp > 0) {
            att.hp -= thornsBack;
            log.push({ t, who: who === "me" ? "foe" : "me", dmg: thornsBack, thorns: true, iceThorns: iced,
                meBleed: A.bleedLeft, foeBleed: B.bleedLeft, meHp: A.hp, foeHp: B.hp, meShield: A.shield, foeShield: B.shield, meStun: A.stunned, foeStun: B.stunned, meChill: A.skipChance, foeChill: B.skipChance });
        }
        // ── AND THE DEFENDER MAY ANSWER ──────────────────────────────────────────────────────────────
        // A counter is a real swing, not a subtraction: it rolls its own crit and meets the attacker's
        // armour like any other blow. It never counters a counter — that is a loop, not a mechanic.
        // A wild "doublestrike" is an extra blow right now; a wild "counter" makes the attacker swing again.
        if (wild === "doublestrike" || wild === "counter") {
            const cs = critStacks(att.critChance, rng);
            const craw = att.damage * (cs > 0 ? att.critMult * cs : 1);
            const extra = Math.max(1, Math.round(craw * (1 - drFrom(def.armor, att.pierce))));
            def.hp -= extra;
            log.push({ t, who, dmg: extra, crit: cs > 0, wild, meBleed: A.bleedLeft, foeBleed: B.bleedLeft, meHp: A.hp, foeHp: B.hp, meShield: A.shield, foeShield: B.shield, meStun: A.stunned, foeStun: B.stunned, meChill: A.skipChance, foeChill: B.skipChance });
        }
        if (def.hp > 0 && def.counter > 0 && rng() < def.counter) {
            const cs = critStacks(def.critChance, rng);
            const craw = def.damage * (cs > 0 ? def.critMult * cs : 1);
            const cdealt = Math.max(1, Math.round(craw * (1 - drFrom(att.armor, def.pierce))));
            att.hp -= cdealt;
            log.push({ t, who: who === "me" ? "foe" : "me", dmg: cdealt, crit: cs > 0, stacks: cs, counter: true,
                meHp: A.hp, foeHp: B.hp, meShield: A.shield, foeShield: B.shield, meStun: A.stunned, foeStun: B.stunned, meChill: A.skipChance, foeChill: B.skipChance });
        }
}

// ── THE HALF OF A TURN THAT HAPPENS TO YOU ───────────────────────────────────────────────────────────────────
// Bleed, burn, the stun skip, regen, ward refill and the Bastion roll — everything a fighter's turn does BEFORE
// they choose anything. A stunned fighter loses the swing that was due: the clock still turns, they just do not
// act.
//
// Returns false if the fighter never got to act — stunned, or dead on their own bleed before they could swing.
// Both loops need that answer: the auto-resolver to skip the swing, and the interactive ring to know there is
// no incoming blow to ask anybody to brace against.
export function openTurn({ A, B, att, def, who, log, t, rng = Math.random }) {
        // ── YOU CANNOT LOSE TWO TURNS IN A ROW ───────────────────────────────────────────────────────
        // Reported by ValkyrieSylve, SoullessShiitake, Kaishiern and Sunflower Jinxx within a day of the
        // rework, all describing the same thing from different angles: "starting the fight with a third of
        // my health just gone", "I just got instantly KOd before the fight fully loaded in", "I was defeated
        // before I could click anything", "getting stunned and frozen to the point where i just insta die".
        //
        // They were not describing a loading bug. Nothing anywhere stopped a fighter losing turn after turn:
        // a stun decrements one per skipped turn, and chill is re-rolled independently EVERY turn at up to
        // 60% — so a run of four lost turns in a row is a routine 13%, and the fight can be over before the
        // member has pressed anything. Combined with the opening coin flip, half of those runs start before
        // their first turn, which is why it reads as damage that was there when the screen loaded.
        //
        // This file already had the right principle written down for freeze — "a lock that renews itself is
        // not a control effect, it is the end of the fight" — and it was never applied to lost turns in
        // general. Now it is: whoever lost the last turn takes this one. Chill and freeze still cost you
        // every other turn at worst, which is a real effect and not a death sentence.
        //
        // Only the TURN is guaranteed, never survival. Bleed and burn still tick and can still kill you
        // where you stand, because a wound is damage rather than a lost turn — and walking into rung 97 on
        // day one is still meant to remove you from the premises.
        // ── "YOU CANNOT LOSE TWO TURNS IN A ROW" IS GONE ────────────────────────────────────────────
        // Luke: "remove any x in a row rules." This banked a free pass whenever a stun or a chill took your
        // beat, so the next one could not be taken however cold you were. `controlImmune` already does the
        // job it was really there for — one beat off the board buys you the next one through — and it is a
        // rule about the EFFECT rather than a tally of how many turns you have lost lately.

        // ── NOBODY IS WORN DOWN BEFORE THEY HAVE ACTED ONCE ──────────────────────────────────────────
        // The other half of "your first turn is sacred", and GrayKitsune found the hole in it: "My first turn
        // is round 2 after burn already took half my health." He was right. The rule guaranteed the turn
        // WOULD happen; it said nothing about what could be done to him before it did — so a foe that won the
        // opening flip could hit him AND leave a burn, and the burn then ticked at the top of his first turn.
        // Two hits before he had taken one, which is the exact unfairness the rule exists to stop.
        //
        // Measured at rung 40 with real kits: the lighter builds were losing 25-32% of their health on
        // average before acting, and the burn tick is the part of that a member cannot answer, cannot see
        // coming and did not get a turn to respond to.
        //
        // Symmetric, because it is a fairness rule rather than a player perk — the foe is not worn down
        // before its first turn either. Only the FIRST turn: from the second onwards a wound burns exactly as
        // it always has, which is what makes rend and burn worth carrying.
        const firstTurn = att.swingsTaken === 0;

        // ── THE GUARD DROPS A LITTLE ─────────────────────────────────────────────────────────────────
        // Before anything else on your beat, and before the refill further down, so a fighter who tops it up
        // every swing settles below the cap instead of living at it. See SHIELD_DECAY.
        if (!firstTurn && att.shield > 0) {
            att.shield = Math.max(0, Math.round(att.shield * (1 - SHIELD_DECAY)));
        }

        // BLOOD FIRST. The tick lands whether or not they are stunned — a stun stops you swinging, it does
        // not stop you bleeding — and it can kill, which is the whole point of a wound.
        if (!firstTurn && att.bleedLeft > 0) {
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
                meBleed: A.bleedLeft, foeBleed: B.bleedLeft, meHp: A.hp, foeHp: B.hp, meShield: A.shield, foeShield: B.shield, meStun: A.stunned, foeStun: B.stunned, meChill: A.skipChance, foeChill: B.skipChance });
            if (att.hp <= 0) return false;
        }
        if (!firstTurn && att.burnLeft > 0) {
            const tick = Math.max(1, Math.round(att.burnPer));
            att.hp -= tick;
            att.burnLeft -= 1;
            const lighter = att === A ? B : A;
            if (lighter.burnLeech > 0 && lighter.hp > 0) {
                lighter.hp = Math.min(lighter.maxHp, lighter.hp + Math.round(tick * lighter.burnLeech));
            }
            log.push({ t, who, burnTick: true, dmg: tick, meBleed: A.bleedLeft, foeBleed: B.bleedLeft, meHp: A.hp, foeHp: B.hp, meShield: A.shield, foeShield: B.shield, meStun: A.stunned, foeStun: B.stunned, meChill: A.skipChance, foeChill: B.skipChance });
            if (att.hp <= 0) return false;
        }
        // ── ONE ROLL FOR LOSING A BEAT, AND NEVER TWICE RUNNING ──────────────────────────────────────
        // A queued freeze and the chill roll were two separate gates in a row. Either could take the beat, so
        // a fighter carrying both faced them one after the other, every beat, for twenty-five rounds. They
        // are one question now — "do I act?" — asked once, and answered no at most every other beat.
        //
        // The stun ALWAYS ticks down, immune or not, so a freeze still expires on the schedule it promised
        // rather than being banked while you shrug it off.
        const frozen = att.stunned > 0;
        if (frozen) att.stunned -= 1;
        if (att.controlImmune > 0) {
            // You were taken off the board last beat. Whatever is on you now, you get to swing through it.
            att.controlImmune -= 1;
        } else {
            const denied = frozen || (att.skipChance > 0 && rng() < att.skipChance);
            if (denied) {
                att.controlImmune = CONTROL_IMMUNE_TURNS;
                log.push({ t, who, stunnedSkip: frozen, chilledSkip: !frozen, meHp: A.hp, foeHp: B.hp, meShield: A.shield, foeShield: B.shield, meStun: A.stunned, foeStun: B.stunned, meChill: A.skipChance, foeChill: B.skipChance });
                return false;
            }
        }
        // MENDING and BASTION both happen on your own swing: you patch yourself up and may raise a shield.
        if (att.regen > 0 && att.hp > 0) att.hp = Math.min(att.maxHp, att.hp + Math.round(att.maxHp * att.regen));
        if (att.wardRefill > 0) {
            att.shield = Math.min(Math.round(att.maxHp * att.ward), att.shield + Math.round(att.maxHp * att.wardRefill));
        }
        if (att.guardChance > 0 && rng() < att.guardChance) {
            att.shield += Math.round(att.maxHp * att.guardSize);
            log.push({ t, who, guard: true, shield: att.shield, meBleed: A.bleedLeft, foeBleed: B.bleedLeft, meHp: A.hp, foeHp: B.hp, meShield: A.shield, foeShield: B.shield, meStun: A.stunned, foeStun: B.stunned, meChill: A.skipChance, foeChill: B.skipChance });
        }
    return true;
}

// ── THE WHOLE TURN, FOR ANYBODY NOT PRESENT TO PLAY IT ───────────────────────────────────────────────────────
// openTurn then the swing, which is what a turn IS. It exists as its own function because the interactive ring
// has to stop BETWEEN those two halves — the pre-swing decides whether there is even a blow to brace against,
// and asking a member to time a tap against a swing that a stun already cancelled is how a fight screen starts
// lying about what is happening.
export function takeTurn({ A, B, att, def, who, log, t, rng = Math.random, mult = 1, hitsOverride = 0 }) {
    if (!openTurn({ A, B, att, def, who, log, t, rng })) return false;
    resolveSwing({ A, B, att, def, who, log, t, rng, mult, hitsOverride });
    return true;
}

// ── AUTO-ATTACK COMBAT: THE TOMBSTONE ────────────────────────────────────────────────────────────────────────
// `autoBout` was here — a whole second resolver. Two fighters took strictly alternating turns, `goesAgain`
// decided who went twice, and there was no bar anywhere in it.
//
// Luke: "when do we use autoBout? Ideally, we don't use that at all."
//
// In production it was already never: `interactiveFor` was pinned true and all three buildBout callers passed
// it, so `resolveAuto` was dead code wearing a live-looking branch. What kept it dangerous was the ELEVEN
// balance scripts still measuring through it — check:road, check:npc, check:npcband, check:statvalue,
// check:arith, sim:pvp and friends — because a projection made in a resolver nobody plays is a number about a
// different game. Moving check-passives across flipped four nodes from idle to live and two the other way,
// and moving check:road across moved the wall from rung 49 to rung 62 for the same kit and the same gear.
//
// `autoRing` in arena-ring.js replaces it everywhere: openRing / act / ringResult driven headlessly with
// housePick choosing for both sides. One resolver. If a fight ever needs resolving with nobody watching
// again — an away defence, a projection, a simulator — that is the function, and it plays the real game.
