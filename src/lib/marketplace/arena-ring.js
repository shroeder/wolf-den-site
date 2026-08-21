// ── THE INTERACTIVE RING ─────────────────────────────────────────────────────────────────────────────────────
// Pure. No DB, no server-only, same rule as arena-engine.js: if it touches the database, the session or the
// clock, it does not belong here.
//
// A bout that a member is PRESENT for. The auto-resolver in arena-engine.js runs a whole fight in one call and
// hands back a transcript; this runs the same fight one beat at a time and stops to ask. Both call the same
// three functions to resolve a swing, which is the entire point — the last time this repo had two things doing
// one job, five constants drifted and six mechanics quietly stopped existing.
//
// ── WHY THE CLOCK SURVIVES INTO TURN-BASED ───────────────────────────────────────────────────────────────────
// The obvious build is strict alternation: you, them, you, them. It is also how the LAST turn-based engine
// made SPEED worthless — `08d68220` records it plainly, "invisible under turn-based, where speed only broke
// the tie for who opened". Quickblade, every speed affix and the speed on every weapon in the game would go
// back to buying nothing.
//
// So the clock stays exactly as it is. A fighter's beat comes round every 1/speed, whoever is due next acts,
// and a fast fighter simply gets more beats than a slow one — sometimes two in a row. Turn-based means you
// CHOOSE your action, not that the turns alternate.
//
// ── THE SHAPE OF A BEAT ──────────────────────────────────────────────────────────────────────────────────────
// A turn is two halves and the ring stops between them, because they ask the member two different questions:
//
//   openTurn   bleed, burn, the stun skip, regen, ward — everything that happens TO whoever is up. Nobody
//              chooses any of it, so the ring resolves it without asking.
//   the swing  yours (`awaiting: "act"` — pick a command, and time the tap) or theirs (`awaiting: "brace"` —
//              time the tap to take a share off it).
//
// Stopping between them is not tidiness. If a stun ate their turn there is no blow coming, and asking someone
// to time a brace against a swing that never happens is a fight screen telling a lie about its own state.
import { HASTE_ATTACKS, gapOf, openTurn, resolveSwing, sideOf } from "@/lib/marketplace/arena-engine.js";
import { HAND_FLOOR, betterHand, gradeTiming, houseHand } from "@/lib/marketplace/arena-kit.js";
import { housePick } from "@/lib/marketplace/arena-skills.js";

// The backstop, not the balance — two fighters who genuinely cannot hurt each other. Deliberately far above
// any real fight: the auto-resolver's own telemetry has never recorded a bout past ~40 swings, and a member
// sitting in a ring is owed a fight that ends rather than one the cap decided.
export const RING_BEAT_CAP = 300;

/** Has somebody won, and write it onto the ring if so. */
function settle(ring) {
    if (ring.over) return true;
    if (ring.A.hp <= 0 || ring.B.hp <= 0) {
        ring.over = true;
        ring.won = ring.B.hp <= 0 && ring.A.hp > 0;
        ring.awaiting = null;
        ring.incoming = null;
        return true;
    }
    if (ring.beat >= RING_BEAT_CAP) {
        ring.over = true;
        ring.won = false;
        ring.unresolved = true;
        ring.awaiting = null;
        ring.incoming = null;
        return true;
    }
    return false;
}

// ── PIT FEVER: A FIGHT HAS TO END ────────────────────────────────────────────────────────────────────────────
// Two Wardens both holding Bastion and Rally cannot kill each other. Measured: a mirror of either one runs to
// the 300-beat cap, every seed, and comes back `unresolved` — which is not a fight, it is a member sitting in
// a ring tapping for five minutes to be told nobody won.
//
// The old engine had a rule for this and the note in arena-kit.js says what it was: "a fight is decided by the
// fight. pitFever is what guarantees one ends." It came out with the turn loop. This is it, back.
//
// From FEVER_AT the pit turns against both of them equally, and it compounds, so no amount of healing or
// shielding outruns it for long. It is deliberately a share of MAXIMUM health rather than current: a fighter
// cannot duck it by being nearly dead, and it cannot stall out asymptotically the way a share of current
// health would.
export const FEVER_AT = 45;
export const FEVER_PER_BEAT = 0.012;

function fever(ring) {
    if (ring.beat < FEVER_AT) return;
    const share = FEVER_PER_BEAT * (ring.beat - FEVER_AT + 1);
    for (const f of [ring.A, ring.B]) {
        // Through the shield first — a shield you refresh every beat is precisely what the fever is here to
        // outlast, so letting it hide behind one would leave the stall exactly where it was.
        const bite = Math.max(1, Math.round(f.maxHp * share));
        const eaten = Math.min(f.shield, bite);
        f.shield -= eaten;
        f.hp -= bite - eaten;
    }
    ring.log.push({ t: ring.t, who: "me", fever: true, share });
}

// The clock only turns once the whole turn is DONE — after the swing, and after the haste decrement that the
// gap itself reads. Advancing it any earlier is how a hasted fighter would get their gap measured at the old
// rate, and it is exactly the ordering the auto-resolver uses (`take(...)` then `nextA = t + gap(A)`).
function closeTurn(ring) {
    const mine = ring.acting === "me";
    const f = mine ? ring.A : ring.B;
    if (f.hasteLeft > 0) f.hasteLeft -= 1;
    if (mine) ring.nextA = ring.t + gapOf(ring.A);
    else ring.nextB = ring.t + gapOf(ring.B);
    ring.acting = null;
    ring.awaiting = null;
    ring.incoming = null;
}

/**
 * Run the ring forward until somebody has a swing to take, or the fight is over.
 *
 * Turns that nobody chooses anything on — a stun, a fighter who bleeds out before they can lift the blade —
 * resolve here and the loop simply carries on, so the member is never asked to press a button on a beat that
 * had nothing in it for them.
 */
function advance(ring, rng) {
    while (!settle(ring)) {
        fever(ring);
        if (settle(ring)) return ring;
        const mine = ring.nextA <= ring.nextB;
        ring.acting = mine ? "me" : "foe";
        ring.t = mine ? ring.nextA : ring.nextB;
        ring.beat += 1;
        const att = mine ? ring.A : ring.B;
        const def = mine ? ring.B : ring.A;
        const acts = openTurn({
            A: ring.A, B: ring.B, att, def, who: ring.acting, log: ring.log, t: ring.t, rng,
        });
        if (!acts) { closeTurn(ring); continue; }   // stunned, or dead on their own wound
        ring.awaiting = mine ? "act" : "brace";
        ring.turn = mine ? "you" : "them";
        return ring;
    }
    return ring;
}

/**
 * Open a fight somebody is going to play.
 *
 * The setup is the auto-resolver's, line for line — the Aether Ward that stands from the opening bell, and the
 * chill that slows the other fighter's clock once, for the whole bout. Duplicated deliberately rather than
 * shared: it is six lines, and the alternative is a fourth function whose only job is to be called twice.
 */
export function openRing(me, foe, { rng = Math.random, foeSkills = {} } = {}) {
    const A = sideOf(me);
    const B = sideOf(foe);
    A.shield += Math.round(A.maxHp * A.ward);
    B.shield += Math.round(B.maxHp * B.ward);
    if (A.chill > 0) B.speed = Math.max(0.0001, B.speed * (1 - A.chill));
    if (B.chill > 0) A.speed = Math.max(0.0001, A.speed * (1 - B.chill));
    // ── WHO OPENS, WHEN NOTHING SEPARATES THEM ───────────────────────────────────────────────────────────────
    // `advance` gives a tie to A, and with two equal clocks that is not one tie, it is EVERY tie for the whole
    // bout — A opens, A swings first every exchange, and A lands the killing blow first. Measured in a true
    // mirror: 65% to whoever happened to be A. Fifteen points of win rate handed to whoever pressed Challenge,
    // in a ladder that is supposed to be sorting people by their loadout.
    //
    // One coin flip at the bell settles it, permanently — the two clocks can never meet again once they are
    // apart by an epsilon, so this is the only place the question is ever asked.
    const flip = rng() < 0.5 ? 1 : -1;
    const ring = {
        A, B,
        t: 0, beat: 0,
        nextA: gapOf(A) + flip * 1e-9, nextB: gapOf(B) - flip * 1e-9,
        cd: {},                       // skillId -> beats of YOURS before it comes back
        foeCd: {},                    // and theirs, kept apart so one deck cannot cool the other
        foeSkills,                    // the build the defence actually paid for — see housePick
        log: [],
        acting: null,                 // whose turn is open, mid-beat
        awaiting: null,               // "act" | "brace" | null when the fight is over
        turn: null, incoming: null,
        over: false, won: false, unresolved: false,
    };
    return advance(ring, rng);
}


// ── CASTING A SKILL ──────────────────────────────────────────────────────────────────────────────────────────
// Everything a skill does that is not "swing harder", in two halves either side of the blow.
//
// THE TRICK, AND IT IS THE WHOLE REASON THIS IS SHORT: a skill does not apply bleeds, burns, drains or pierce
// itself. It TEMPORARILY BECOMES a fighter who has those stats, throws one ordinary swing, and hands the
// fighter back. So a guaranteed wound is `bleedChance = 1` for exactly one blow, and it lands through the same
// code a Reaver's Rend node lands through — including the tick cap, the stacking rule and the leech.
//
// The alternative is a second implementation of every status effect, living in this file, drifting from the
// one in the engine. That is the bug this whole subsystem's comments are about.
function castSkill(ring, skill, att, def) {
    const A = att;
    const B = def;

    // ── BEFORE THE BLOW ── the things that do not care whether it lands.
    if (skill.shield > 0) A.shield += Math.round(A.maxHp * skill.shield);
    if (skill.heal > 0) A.hp = Math.min(A.maxHp, A.hp + Math.round(A.maxHp * skill.heal));
    if (skill.cleanse) { A.bleedLeft = 0; A.burnLeft = 0; }
    if (skill.unfreeze > 0) A.stunned = Math.max(0, A.stunned - skill.unfreeze);
    if (skill.haste > 0) A.hasteLeft = HASTE_ATTACKS;
    // ── A FREEZE CANNOT BE STACKED ON A FROZEN FIGHTER ───────────────────────────────────────────────────────
    // Rimebind mirrored won 100% of bouts for whoever opened: freeze them, they lose the beat, freeze them
    // again before they ever act. A lock that renews itself is not a control effect, it is the end of the
    // fight. So a freeze only lands on somebody who is currently able to act — the beat they spend frozen is
    // also the beat they are immune.
    if (skill.freeze > 0 && B.stunned <= 0) B.stunned += Math.round(skill.freeze);
    if (skill.chill > 0) B.speed = Math.max(0.0001, B.speed * (1 - skill.chill));
    // SET, never stacked. A skill you can cast eight times in a bout must not be able to multiply a permanent
    // stat eight times — that is a number growing without a ceiling, which is how a fight stops ending.
    if (skill.thorns > 0) A.thorns = Math.max(A.thorns, skill.thorns);

    // ── EXECUTE ── scales in linearly from executeAt down to nothing left. Written as its own term rather than
    // folded into `power` so the fight screen can say WHY the blow was that big.
    let mult = 1;
    if (skill.executeAt > 0 && B.maxHp > 0) {
        const frac = Math.max(0, B.hp) / B.maxHp;
        if (frac < skill.executeAt) mult += skill.executeMax * (1 - frac / skill.executeAt);
    }

    // ── AND FOR ONE BLOW, YOU ARE SOMEBODY ELSE ──────────────────────────────────────────────────────────────
    const was = {
        bleedChance: A.bleedChance, burnChance: A.burnChance, pierce: A.pierce, soulfire: A.soulfire,
        bleedDamage: A.bleedDamage, burnDamage: A.burnDamage, burnLeech: A.burnLeech,
        lifesteal: A.lifesteal, grudge: A.grudge, banked: A.banked,
    };
    if (skill.bleed > 0) A.bleedChance = 1;
    if (skill.burn > 0) A.burnChance = 1;
    if (skill.pierce > 0) A.pierce = Math.min(1, A.pierce + skill.pierce);
    if (skill.soulfire > 0) A.soulfire += skill.soulfire;
    if (skill.bleedDamage > 0) A.bleedDamage += skill.bleedDamage;
    if (skill.burnDamage > 0) A.burnDamage += skill.burnDamage;
    if (skill.burnLeech > 0) A.burnLeech += skill.burnLeech;
    if (skill.drain > 0) A.lifesteal += skill.drain;
    if (skill.grudge > 0) A.grudge = skill.grudge;
    return { mult, was };
}

// Hand the fighter back. `keepGrudge` is the one thing that survives: resolveSwing clears the ledger on every
// swing, so a node that keeps half of it has to put half of it back.
function uncast(skill, att, state) {
    const A = att;
    const kept = skill.keepGrudge > 0 ? Math.round((state.was.banked || 0) * skill.keepGrudge) : 0;
    Object.assign(A, state.was);
    A.banked = kept;
}

/**
 * THE MEMBER'S SWING.
 *
 * `closeness` is how near the centre of the window their tap landed, 0..1, straight off the client — and it is
 * graded HERE rather than trusted. A grade is worth up to 30% more damage, so a number that arrives in a POST
 * body is a number somebody can type; gradeTiming clamps before it grades, and this is the only door it comes
 * through.
 *
 * `skill` is the resolved skill definition or null for a plain attack. Its power and its hit count ride in as
 * the same two parameters a crit or a surge uses, so a skill is a swing with different numbers rather than a
 * second code path that has to remember armour exists.
 */
export function act(ring, { closeness = 0, skill = null, rng = Math.random } = {}) {
    if (ring.over || ring.awaiting !== "act") return ring;
    // Floored at the house hand — see betterHand. A member who never taps fights the same competent fight
    // their opponent's loadout is fighting, so the window is upside and only upside.
    const timing = betterHand(gradeTiming(closeness), gradeTiming(HAND_FLOOR.at));
    // THEY BRACE TOO. There is nobody on the other end of a defence, so the house plays their hand — see
    // houseHand. Without this the whole ladder is decided by who happened to press Challenge: the attacker
    // collects a bonus on every swing and the defender eats every one of them at full weight.
    const theirs = houseHand(rng);
    const cast = skill ? castSkill(ring, skill, ring.A, ring.B) : null;
    // A skill with power 0 throws NO BLOW — Bastion and Rally spend the beat on being harder to kill, which is
    // the Warden's whole identity. Skipping the swing entirely rather than swinging for nothing matters: a
    // zero-damage swing would still roll crit, still proc a counter, and still bank a grudge.
    if (!skill || skill.power > 0) {
        resolveSwing({
            A: ring.A, B: ring.B, att: ring.A, def: ring.B, who: "me",
            log: ring.log, t: ring.t, rng,
            mult: timing.strike * (skill?.power ?? 1) * (cast?.mult || 1),
            brace: theirs.brace,
            hitsOverride: skill?.hits || 0,
        });
    }
    if (cast) uncast(skill, ring.A, cast);
    // The tap is logged on its own line rather than folded into the blow, because the screen has to be able to
    // say "Perfect" next to the swing it graded — a multiplier buried in a damage number teaches nobody
    // anything about when to tap.
    ring.log.push({ t: ring.t, who: "me", timing: timing.id, timingLabel: timing.label,
        foeBrace: theirs.id, skill: skill?.id || null });
    if (skill?.id) ring.cd[skill.id] = (skill.cooldown || 0) + 1;
    // ── A FREE SKILL DOES NOT COST YOU THE BEAT ──────────────────────────────────────────────────────────────
    // Cast it and you are still up: same beat, same clock, and now pick what you actually swing.
    //
    // It returns BEFORE the cooldown tick, not after. Ticking here as well would have advanced every cooldown
    // in the deck twice on any beat a free skill was cast — the free skill paying for itself out of everything
    // else's rhythm, which is not free, it is a discount on the whole deck.
    if (skill?.free) return ring;
    closeTurn(ring);
    for (const k of Object.keys(ring.cd)) ring.cd[k] = Math.max(0, ring.cd[k] - 1);
    return advance(ring, rng);
}

/**
 * THEIR SWING, AND WHAT THE MEMBER'S TAP TOOK OFF IT.
 *
 * The mirror of act(): same clamp, same grading, and the same floor of nothing-taken-away. A member who does
 * not tap at all catches the blow at full weight — which is the fight the auto-resolver would have given them,
 * and is the reason a missed window is never a punishment.
 */
export function brace(ring, { closeness = 0, rng = Math.random } = {}) {
    if (ring.over || ring.awaiting !== "brace") return ring;
    const timing = betterHand(gradeTiming(closeness), gradeTiming(HAND_FLOOR.at));
    // And they time their own swing, for the same reason. A defence that always threw at bare power would be
    // a defence anybody could stand in front of.
    const theirs = houseHand(rng);
    // ── AND THEY REACH FOR SOMETHING ─────────────────────────────────────────────────────────────────────────
    // Their own build, chosen on their own read of the fight. A defence that taps well and then throws nothing
    // but plain attacks is the lopsidedness houseHand fixed, wearing a different hat: measured before this,
    // one point in any skill beat a skill-less mirror 88-100% of the time.
    const foeSkill = housePick(ring.foeSkills, ring.foeCd, {
        selfFrac: ring.B.hp / Math.max(1, ring.B.maxHp),
        foeFrac: ring.A.hp / Math.max(1, ring.A.maxHp),
        shield: ring.B.shield, banked: ring.B.banked, maxHp: ring.B.maxHp,
        bleeding: ring.B.bleedLeft > 0 || ring.B.burnLeft > 0,
    });
    const cast = foeSkill ? castSkill(ring, foeSkill, ring.B, ring.A) : null;
    if (!foeSkill || foeSkill.power > 0) {
        resolveSwing({
            A: ring.A, B: ring.B, att: ring.B, def: ring.A, who: "foe",
            log: ring.log, t: ring.t, rng,
            mult: theirs.strike * (foeSkill?.power ?? 1) * (cast?.mult || 1),
            brace: timing.brace,
            hitsOverride: foeSkill?.hits || 0,
        });
    }
    if (cast) uncast(foeSkill, ring.B, cast);
    if (foeSkill?.id) ring.foeCd[foeSkill.id] = (foeSkill.cooldown || 0) + 1;
    for (const k of Object.keys(ring.foeCd)) ring.foeCd[k] = Math.max(0, ring.foeCd[k] - 1);
    ring.log.push({ t: ring.t, who: "me", brace: timing.id, timingLabel: timing.label,
        foeTiming: theirs.id, foeSkill: foeSkill?.id || null });
    closeTurn(ring);
    return advance(ring, rng);
}

/** The bout fields the rest of the game already reads, rebuilt off a ring. */
export function ringResult(ring) {
    return {
        over: ring.over,
        won: ring.won,
        unresolved: Boolean(ring.unresolved),
        beat: ring.beat,
        time: ring.t,
        log: ring.log,
        hp: Math.max(0, ring.A.hp), foeHp: Math.max(0, ring.B.hp),
        maxHp: ring.A.maxHp, foeMaxHp: ring.B.maxHp,
    };
}
