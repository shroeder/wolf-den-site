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
    CONTROL_IMMUNE_TURNS, COUNTER_POWER,
    SHIELD_DECAY,
} from "@/lib/marketplace/arena-kit.js";
// Accuracy and the damage-reduction ceiling are the CLASS file's — a fighter's floor and cap come from what
// they are, not from the kit they carry.
// DR_CAP was imported here too and never used — damage reduction was deleted in favour of armour being the
// whole of mitigation, and the ceiling for a system that no longer exists went with it.
import { DEFAULT_GUARD } from "@/lib/marketplace/arena-classes.js";
import { critChanceFrom, critMultFrom, drFrom, healthFrom, swingFrom } from "@/lib/marketplace/arena-kit.js";
// Pure, and shared with every drop roll in the Den — a fighter's luck and a chest's luck are the same curve.
import { luckyRoll } from "@/lib/marketplace/fortune.js";

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
// ── BLEED ────────────────────────────────────────────────────────────────────────────────────────────────────
// Three ticks at a fifth of the blow that opened it, and armour never sees a drop of it. It ticks on the
// BLEEDING fighter's own swings, which is what "three turns" means when there are no turns: three more times
// they step up to swing, they lose blood first.
export const BLEED_SHARE = 0.20;
// A burn is a bleed in a different colour: same three ticks, same fifth of the blow, same contempt for armour.
// Tracked separately so a fighter can be burning AND bleeding, and so the two read differently on screen.
// ── STACKING ─────────────────────────────────────────────────────────────────────────────────────────────────
// Luke, on how these are meant to work: "burn and bleed are supposed to stack and decay. both decay 1 per time
// they do damage, and they stack based on whatever proced them, it uses the highest damage, so stacking
// extends the damage and conditionally resets the damage per tick if the damage was higher." And on the rate:
// "each process adds 1 unless specified otherwise."
//
// ONE STACK PER PROC. A skill's `burn`/`bleed` is a COUNT and lays down that many — both halves of a field
// only half of which was read, because the ring took the guarantee from it and threw the number away. The
// per-tick figure only ever goes UP: a weaker follow-up extends the timer and cannot dilute it.
//
// Before this, both lines ASSIGNED. `burnLeft = 3` reset the timer whatever it was, and `burnPer` overwrote
// the damage even when the new blow was smaller. Filmed in a real bout: an Overflow crit of 1166 lit a burn
// worth ~466 a tick, then an Immolate for 728 REPLACED it with ~291 — the follow-up made the burn WEAKER, and
// the counter on screen never moved off 3.
//
// NO CEILING, and NO FIRST-TURN GRACE, both by decision. Stacking is the whole point of a damage-over-time
// build and a cap is what makes the tenth proc worth nothing; the `!firstTurn` guard meant a DoT landed on
// the opener cost them nothing at all. Neither can stall a bout — a DoT only ever shortens one, and it ticks
// at the START of the victim's turn, so it can kill before they swing.
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
// ── HOW HARD A BLOW LANDS IS A ROLL, NOT A CONSTANT ──────────────────────────────────────────────────────────
// Nothing in resolveSwing used to vary. `raw` is damage x crit x surge x mult, every term fixed, so a normal
// hit dealt EXACTLY the same number every time and a crit dealt exactly critMult times it. Two builds produced
// the same fight on every seed — the duel between JT and The Wolf Den traded byte-identical transcripts on
// different seeds, 1492 / 298 / CRIT 5013, twice running.
//
// SWING_SPREAD is the half-width of a uniform roll around the blow: 0.15 means every hit lands somewhere in
// 85%-115% of it, which is the ordinary band for the genre. It multiplies `raw`, so it scales with damage,
// crit and grudge alike instead of only mattering to small hits, and it leaves every stat's contribution to
// the AVERAGE untouched — a build worth 10% more damage is still worth exactly 10% more.
//
// ⚠️ IT IS TEXTURE, NOT BALANCE, and it was measured before being believed: at ±15% the top ten still had
// 60 of 90 pairings decided (>=97% or <=3%), exactly as at ±0, and JT vs The Wolf Den moved 37.0% -> 34.9%,
// which is noise. A symmetric roll cannot change who is favoured, a ±15% swing cannot bridge the 4.5x damage
// gap across that ladder, and a bout that ends in two beats gives variance nowhere to accumulate. Anyone
// reaching for this number to fix a matchup should raise the bout length or close the power spread instead.
//
// 0 restores the old deterministic behaviour exactly — the guard below means no rng() is drawn at all.
//
// ── AND FORTUNE DECIDES WHERE IN THE BAND YOU TEND TO LAND ───────────────────────────────────────────────────
// The one thing this stat does inside the ring, and it is deliberately not a damage bonus: luck pulls the
// BOTTOM of the band up toward the middle and never moves the top. Your best hit is the same as everybody
// else's; you just throw fewer of your worst. At the top of the real Fortune band that is worth about +2.5%
// on the average, which is texture of the same order as the spread itself. See fortune.js for the curve.
export const SWING_SPREAD = 0.15;
export const swingRoll = (rng = Math.random, fortune = 0) => luckyRoll(rng, SWING_SPREAD, fortune);

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
    // turn order: the chance one of their turns never happens (Chill). The go-again chance that used to sit
    // beside this is gone — see the tombstone in arena-kit.js.
    "skipChance",
    // and how fast this fighter's timer bar fills, for a bout opened in that mode — see arena-atb.js. It is
    // carried on every fighter rather than only on timer bouts, because a bout is stamped with its mode at
    // the bell and this has to already be in bout_json by then.
    "tempo",
    // mitigation and getting through it
    "armor", "pierce", "blockChance", "blockReduction",
    // the procs that come off affix points
    "counter", "lifesteal", "stun", "haste",
    // over time, and what drinks from it
    "bleedChance", "bleedDamage", "bleedLeech", "burnChance", "burnDamage", "burnLeech",
    // how many stacks one proc lays down — 1 unless a skill says more (Immolate's `burn`, Rend's `bleed`)
    "burnStacks", "bleedStacks",
    // the Warden's four, plus the ice that answers every blow
    "guardChance", "guardSize", "regen", "thorns", "iceThorns", "grudge",
    // the Runecaller's
    "freeze", "chill", "ward", "wardRefill", "surge", "soulfire", "cataclysm",
    // and the tree's flat shares, which add on top of the point-based versions above
    "counterBonus", "lifestealBonus", "stunBonus", "hasteBonus", "wildProc",
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
        // 1 point = 0.25% of whatever you actually inflict, healed back.
        lifesteal: Math.max(0, (Number(f.lifesteal) || 0) * LIFESTEAL_PER_POINT + (Number(f.lifestealBonus) || 0)),
        // A shield's block chance, and what a block is worth to THIS fighter — the Warden blocks harder.
        blockChance: Math.max(0, Math.min(1, Number(f.blockChance) || 0)),
        blockReduction: Number(f.blockReduction) > 0 ? Number(f.blockReduction) : 0.35,
        // blockStack / blockStackMax / stacks lived here: the Warden's escalating guard, where every blow
        // that got through raised the block chance. No class ever defined it, so all three were permanently
        // zero — see the note at the block roll.
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
        burnStacks: Math.max(1, Math.round(Number(f.burnStacks) || 1)),
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
        bleedStacks: Math.max(1, Math.round(Number(f.bleedStacks) || 1)),
        stunned: 0,      // turns this fighter must skip
        bonusTurns: 0,   // turns GRANTED (a haste proc), taken whether or not the roll comes up
        bleedLeft: 0,    // ticks of bleed still owed
        bleedPer: 0,     // and what each one costs them
        // The chance one of THEIR turns simply does not happen — Chill, which used to slow their clock.
        skipChance: Math.max(0, Math.min(0.85, Number(f.skipChance) || 0)),
        // ── HOW FAST THIS FIGHTER'S BAR FILLS ────────────────────────────────────────────────────────────
        // The one attack speed there is. Weapon speed and Ferocity, at ferocity / 100 — see tempoOf. A
        // fighter built without one falls back to bare-handed, same as the old clock did.
        tempo: Math.max(0.2, Number(f.tempo) || 1),
        hp: Number(f.health) || 0,
        maxHp: Number(f.health) || 0,
});

// How many times this swing lands. Below 100% it is one blow with a chance of a second; above it, the whole
// multiples are guaranteed and the remainder rolls — the same shape as crit stacks.
// ── ONE BLOW A SWING, UNLESS A SKILL SAYS OTHERWISE ──────────────────────────────────────────────────────────
// Double strike is gone. It was a second answer to "you swing more often" living alongside the bar refund —
// Quickblade and weapon Attack Speed were converted into `extra` when the timer landed, and this was left
// behind. Two mechanics, one promise, and only one of them visible on screen.
//
// The points are not lost: every source of them now feeds the refund at DOUBLESTRIKE_PER_POINT, which is the
// rate this function used. See the note on `extra` in arena.js.
//
// A skill that strikes a fixed number of times still does — Onslaught's `hits: 3` comes through hitsOverride,
// which never went through this roll.
//
// blowCount() lived here and was deleted with the last of it. It had been hollowed out to `() => 1` when
// double strike went, but resolveSwing went on calling it as `blowCount(att.doublestrike, rng)` — a name and
// an argument list that described a mechanic the body no longer had. Read from the call site it looks like a
// second blow is being rolled for; nothing of the sort happens, and `att.doublestrike` is not even set on a
// kit. One blow, unless a skill asks for more.

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
        const hits = hitsOverride || 1;
        let dealt = 0;
        let anyCrit = false;
        let blocked = 0;
        // ── AND WHAT THE GUARD ACTUALLY STOPPED ─────────────────────────────────────────────────
        // `blocked` is a COUNT of blows, and it was the only mitigation figure this swing recorded --
        // so every screen that wanted "damage turned aside" had nothing to read and reached for the
        // count instead. Luke, on a defeat card reading "Damage taken 2,130 / Turned aside 1":
        // "what is turned aside, dead code?" It was one blocked BLOW, printed through the thousands
        // formatter next to two damage totals, which makes it unreadable as anything but damage.
        //
        // Two numbers, because they are two different defences and a player can tell them apart: the
        // block is the shield arm, the soak is a ward spent absorbing a blow before it reached health.
        let turned = 0;
        let soaked = 0;
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
                * (surging ? 1 + att.surge : 1) * mult * swingRoll(rng, att.fortune);
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
            // ── THE BLOCK ────────────────────────────────────────────────────────────────────────────
            // This read `def.blockChance + def.blockStack * def.stacks`, an escalating chance that rose each
            // time a blow got through. No class has ever defined blockStack, so the added term was always
            // 0 x stacks, and `stacks` itself was clamped by `Math.min(def.blockStackMax, ...)` with a max of
            // 0 — a counter that counted to zero, feeding a multiplier that was zero. Three lines of state
            // that could not change an outcome.
            if (def.blockChance > 0 && rng() < def.blockChance) {
                const before = blow;
                blow = Math.max(1, Math.round(blow * (1 - def.blockReduction)));
                // THORNS ANSWER THE BLOCK, not the blow: what the shield turned aside is what comes back.
                if (def.thorns > 0) thornsBack += Math.round((before - blow) * def.thorns);
                turned += before - blow;
                blocked += 1;
            }
            dealt += blow;
        }
        // A GUARD EATS IT FIRST. Whatever the shield can absorb never reaches health, and what is left of
        // the blow carries on through.
        if (def.shield > 0) {
            const eaten = Math.min(def.shield, dealt);
            def.shield -= eaten;
            dealt -= eaten;
            soaked += eaten;
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
            // Extend, and keep the FIERCER fire — see the note on stacking above.
            def.burnLeft = (def.burnLeft || 0) + (att.burnStacks || 1);
            def.burnPer = Math.max(Number(def.burnPer) || 0, dealt * (BURN_SHARE + att.burnDamage));
            burned = true;
        }
        if (def.hp > 0 && (cata || (att.freeze > 0 && rng() < att.freeze))) { def.stunned += 1; frozen = true; }
        if (dealt > 0 && att.bleedChance > 0 && def.hp > 0 && rng() < att.bleedChance) {
            // Same rule as the burn above: a second wound deepens the first rather than replacing it.
            def.bleedLeft = (def.bleedLeft || 0) + (att.bleedStacks || 1);
            def.bleedPer = Math.max(Number(def.bleedPer) || 0, dealt * (BLEED_SHARE + att.bleedDamage));
            bled = true;
        }
        log.push({ t, who, dmg: dealt + soul, crit: anyCrit, hits, blocked, turned, soaked, stunned, hasted, bled, wild,
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
        if (att.bleedLeft > 0) {
            // ── A WOUND IS ALL AT ONCE, THEN LESS ────────────────────────────────────────────────────────
            // Luke: "lets have bleed decay by 1/2 of its stacks every time it ticks, and lets have bleed scale
            // its damage based on its stack count... you bleed 10 percent of damage dealt and it applies 3
            // stacks thats 30 percent of damage on first tick, then it decays rounded down, the next tick
            // would be 10 percent."
            //
            // So bleed and burn are deliberately DIFFERENT SHAPES now. Burn is long and level: one stack off
            // per tick, the same figure each time. Bleed is front-loaded: every stack bleeds at once and then
            // half of them close, so it hits hardest the moment it lands and fades fast. Stacking bleed buys
            // a spike; stacking burn buys time.
            //
            // `bleedPer` is the PER-STACK share, kept at the highest blow that ever opened the wound — so a
            // small follow-up adds a stack without diluting what the big one is worth.
            const tick = Math.max(1, Math.round(att.bleedPer * att.bleedLeft));
            att.hp -= tick;
            // Halved and rounded DOWN, so three stacks is two ticks (3 then 1) and one stack is its last.
            att.bleedLeft = Math.floor(att.bleedLeft / 2);
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
        if (att.burnLeft > 0) {
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
