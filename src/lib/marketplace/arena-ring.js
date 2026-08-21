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
import { gapOf, openTurn, resolveSwing, sideOf } from "@/lib/marketplace/arena-engine.js";
import { gradeTiming } from "@/lib/marketplace/arena-kit.js";

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
export function openRing(me, foe, { rng = Math.random } = {}) {
    const A = sideOf(me);
    const B = sideOf(foe);
    A.shield += Math.round(A.maxHp * A.ward);
    B.shield += Math.round(B.maxHp * B.ward);
    if (A.chill > 0) B.speed = Math.max(0.0001, B.speed * (1 - A.chill));
    if (B.chill > 0) A.speed = Math.max(0.0001, A.speed * (1 - B.chill));
    const ring = {
        A, B,
        t: 0, beat: 0,
        nextA: gapOf(A), nextB: gapOf(B),
        cd: {},                       // skillId -> beats of YOURS before it comes back
        log: [],
        acting: null,                 // whose turn is open, mid-beat
        awaiting: null,               // "act" | "brace" | null when the fight is over
        turn: null, incoming: null,
        over: false, won: false, unresolved: false,
    };
    return advance(ring, rng);
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
    const timing = gradeTiming(closeness);
    resolveSwing({
        A: ring.A, B: ring.B, att: ring.A, def: ring.B, who: "me",
        log: ring.log, t: ring.t, rng,
        mult: timing.strike * (skill?.power || 1),
        hitsOverride: skill?.hits || 0,
    });
    // The tap is logged on its own line rather than folded into the blow, because the screen has to be able to
    // say "Perfect" next to the swing it graded — a multiplier buried in a damage number teaches nobody
    // anything about when to tap.
    ring.log.push({ t: ring.t, who: "me", timing: timing.id, timingLabel: timing.label, skill: skill?.id || null });
    if (skill?.id) ring.cd[skill.id] = (skill.cooldown || 0) + 1;
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
    const timing = gradeTiming(closeness);
    resolveSwing({
        A: ring.A, B: ring.B, att: ring.B, def: ring.A, who: "foe",
        log: ring.log, t: ring.t, rng,
        brace: timing.brace,
    });
    ring.log.push({ t: ring.t, who: "me", brace: timing.id, timingLabel: timing.label });
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
