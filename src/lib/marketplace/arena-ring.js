// ── THE INTERACTIVE RING ─────────────────────────────────────────────────────────────────────────────────────
// Pure. No DB, no server-only, same rule as arena-engine.js: if it touches the database, the session or the
// clock, it does not belong here.
//
// A bout that a member is PRESENT for. The auto-resolver in arena-engine.js runs a whole fight in one call and
// hands back a transcript; this runs the same fight one beat at a time and stops to ask. Both call the same
// three functions to resolve a swing, which is the entire point — the last time this repo had two things doing
// one job, five constants drifted and six mechanics quietly stopped existing.
//
// ── THE CLOCK IS GONE. YOU, THEM, YOU, THEM. ─────────────────────────────────────────────────────────────────
// This file argued the other way for its whole life: keep the clock, because strict alternation is what made
// the LAST turn-based engine's speed stat worthless (`08d68220`: "invisible under turn-based, where speed only
// broke the tie for who opened"). The argument was sound and it was answering the wrong question. A clock is
// not unfair — it is UNREADABLE, and the proof is that its own author reported it as a bug: the beats in a
// 1.06 v 1.31 fight are correct, and from the seat they read as the game skipping your turns.
//
// Turn order is now the shortest rule in the game: the other fighter, unless somebody earned another turn or
// lost one. Everything that made a fighter fast feeds `extra` instead — see EXTRA_TURN_MAX in arena-engine.js
// — so a stat that used to be dealt out silently is an event with a sentence attached.
//
// ── THE SHAPE OF A BEAT ──────────────────────────────────────────────────────────────────────────────────────
// The ring stops on exactly ONE question: what are you throwing. Everything else — the bleed ticks, the stun
// skips, the regen, and the whole of the opponent's turn — resolves on its own and arrives as transcript.
//
// It used to stop twice. The second stop was a timing window on their swing, and it is gone with the rest of
// the timing game (see the tombstone in arena-kit.js): a fight is a place to spend a decision, and there is no
// decision in bracing — you were going to tap it every time. Asking anyway turned every exchange into two
// interactions where one of them had nothing in it.
//
// Which halves the cost of a fight, and that was the other complaint: a bout was 42-60 taps because half of
// every exchange was a brace nobody was choosing.
import { openTurn, resolveSwing, sideOf } from "@/lib/marketplace/arena-engine.js";
import { BAR_REFUND, bars, chill, fillTo, foeExtra, foeTempo, FREEZE_MS_CAP, freezeMsFor, hold, haste, newTrack, nextUp, spend, STUN_HOLD_MS } from "@/lib/marketplace/arena-atb.js";
import { housePick } from "@/lib/marketplace/arena-skills.js";

// The backstop, not the balance — two fighters who genuinely cannot hurt each other. Deliberately far above
// any real fight: the auto-resolver's own telemetry has never recorded a bout past ~40 swings, and a member
// sitting in a ring is owed a fight that ends rather than one the cap decided.
export const RING_BEAT_CAP = 300;

// ── THE TIMER MODE READS THE SAME TRANSCRIPT EVERYBODY ELSE DOES ─────────────────────────────────────────────
// resolveSwing already flags `stunned`, `frozen` and `hasted` on the line it pushes, and it already says which
// side swung. So the bar effects are a TRANSLATION of the log rather than a second set of hooks inside the
// engine — arena-engine.js does not know this mode exists and does not need to.
//
// That is the whole reason this is safe to build owner-gated: there is no branch in the engine to keep in step,
// so classic bouts cannot drift. If a new effect is ever added it lands on the log line first, and the worst
// case here is that the bar ignores it — not that the two modes start resolving swings differently.
//
// AND THE OLD MECHANISM IS SWITCHED OFF, not left running alongside. `def.stunned` is a turn the defender must
// skip and `att.bonusTurns` is a turn the attacker is handed; under a timer those are the bar's job, and
// leaving them set would charge a stun twice — hold the bar AND eat the turn after it.
// ── AND THIS IS THE ONLY PLACE AN EFFECT REACHES A BAR ───────────────────────────────────────────────────────
// ⚠️ IT USED TO READ LOG LINES AND NOTHING ELSE, AND THAT COST EVERY SKILL IN THE GAME ITS EFFECT.
//
// The rolled procs write their flags onto the line resolveSwing pushes — `stunned`, `frozen`, `hasted`, `wild`
// — so reading lines caught all of those. A SKILL does not go through resolveSwing for its status effects:
// castSkill applies them directly, and it applied them to fields (`bonusTurns`, `stunned`, `skipChance`) that
// this function then zeroed. Audited one at a time against a live ring: Rimebind, Rimebind + Hold Fast,
// Rimebind + Killing Cold, Overflow + Bind, Onslaught + Second Wind, Rally + Roar and Bastion + Unbowed —
// every single one left the bar untouched. Seven skills and eleven branch nodes describing an effect that
// could not happen.
//
// So castSkill records its intent on `ring.castFx` and this drains it. One path in, one place that knows how
// an effect becomes a bar, and a skill and a proc that land the same way.
function barEffects(ring, from) {
    if (!ring.atb) return;
    for (let i = from; i < ring.log.length; i += 1) {
        const L = ring.log[i];
        if (!L || !L.who) continue;
        const attacker = L.who === "me" ? ring.atb.me : ring.atb.foe;
        const defender = L.who === "me" ? ring.atb.foe : ring.atb.me;
        const att = L.who === "me" ? ring.A : ring.B;
        const def = L.who === "me" ? ring.B : ring.A;
        // Freeze is checked first and wins: they are the same shape and it is the longer of the two, so a blow
        // that landed both should read as the bigger one. How LONG is the defender's problem but the
        // attacker's doing — see freezeMsFor.
        // ── EVERY CONTROL EFFECT ASKS, AND MAY BE TOLD NO ────────────────────────────────────────────
        // `hold` and `chill` own the answer now — see CC_IMMUNE_MS. They refuse a kind this bar is still
        // shaking off and report it, so the line only claims an effect that actually landed. That one rule
        // replaced the ad-hoc "a lock may not land on a locked bar" check AND the counting rules before it:
        // the beat you spend frozen plus six seconds after is the beat you cannot be frozen again.
        const resisted = [];
        if (L.frozen) {
            const ms = freezeMsFor(att);
            if (hold(defender, ring.now, "freeze", ms)) L.freezeMs = ms;
            else resisted.push("freeze");
        } else if (L.stunned) {
            if (!hold(defender, ring.now, "stun", STUN_HOLD_MS)) resisted.push("stun");
        }
        if (L.hasted || L.wild === "haste") haste(attacker, ring.now);
        // A blow can carry cold in its own right — the Chill stat off the tree. The magnitude is the stat.
        if (att.chill > 0 && def.hp > 0) {
            if (chill(defender, ring.now, att.chill)) L.chilled = att.chill;
            else resisted.push("chill");
        }
        // Named on the line, because a blow that lands no ice must not read as one that silently failed.
        if (resisted.length) L.resisted = resisted;
    }
    // ── WHAT THE CAST ASKED FOR ──────────────────────────────────────────────────────────────────────────
    const fx = ring.castFx;
    if (fx) {
        const attacker = fx.who === "me" ? ring.atb.me : ring.atb.foe;
        const defender = fx.who === "me" ? ring.atb.foe : ring.atb.me;
        if (fx.freezeMs > 0) hold(defender, ring.now, "freeze", fx.freezeMs);
        if (fx.chill > 0) chill(defender, ring.now, fx.chill);
        if (fx.haste) haste(attacker, ring.now);
        // Shrugging off the ice means the BAR starts moving again — the old `stunned` counter it used to
        // decrement has not existed since the timer became the only mode, so Clear Head and Unbowed were
        // clearing a number nobody read.
        if (fx.unfreeze) { attacker.holdUntil = 0; attacker.held = null; }
        ring.castFx = null;
    }
    // The old turn-based carriers are zeroed rather than read. A stun is a held bar and an extra turn is a
    // refunded one; leaving these set would charge a fighter twice for the same effect.
    ring.A.stunned = 0;
    ring.B.stunned = 0;
    ring.A.bonusTurns = 0;
    ring.B.bonusTurns = 0;
}

// Both bars, stamped onto every line the swing just produced, so the screen can draw the timer at the exact
// moment of each event instead of interpolating between them.
function stampBars(ring, from) {
    if (!ring.atb) return;
    const b = bars(ring.atb, ring.now);
    for (let i = from; i < ring.log.length; i += 1) if (ring.log[i]) ring.log[i].bars = b;
}

// ── AND WHERE THE BAR IS ONCE THE BEAT IS PAID FOR ───────────────────────────────────────────────────────────
// `bars` above is the ARRIVAL: the instant the bar filled, which is why the fighter is swinging at all. That
// is the frame the law at the top of arena-atb.js demands — you watched it approach. But it is not where the
// bar is when the beat is over, because closeTurn spends it, and until this existed that spend was in no
// transcript anywhere.
//
// Luke, at rung 100: "I attack, and it shows my bar as green and 2x but its not my turn?"
//
// Swept 120 rung-100 bouts against his real kit: EVERY frame in which his bar read full was a frame of his
// own swing, 1,000 of them green at 2x. The engine was right — it had spent the bar correctly every time —
// and the screen had no number to draw the spend with, so his bar went from full straight to two-thirds on
// the foe's next line. A bar that slides BACKWARDS from the top is the one thing an ATB bar must never do:
// full means it is yours, and his was full while the fight had moved on.
//
// Stamped on the LAST line of the beat only, because its one consumer is the NEXT line's starting point —
// the screen reads it as `from` and fills forward from empty. Put it on the whole beat and the swing itself
// would start from a spent bar, which throws away the arrival this is careful to keep.
function stampSpent(ring) {
    if (!ring.atb) return;
    const L = ring.log[ring.log.length - 1];
    if (!L) return;
    L.barsAfter = bars(ring.atb, ring.now);
    // A bar that comes back half full needs a name on it, or it is the clump this whole mode exists to
    // remove — see BAR_REFUND. Stamped on the same line the spend is, so the screen says it at the moment
    // the bar visibly fails to empty.
    if (ring.refunded) { L.refund = ring.refunded === "me" ? "you" : "them"; ring.refunded = null; }
}

/** Has somebody won, and write it onto the ring if so. */
function settle(ring) {
    if (ring.over) return true;
    if (ring.A.hp <= 0 || ring.B.hp <= 0) {
        ring.over = true;
        // ── BOTH DOWN: THE ONE WHO SWUNG TAKES IT ────────────────────────────────────────────────────────
        // SoullessShiitake: "occasionally we will both end up at 0 hp, but it still counts as a loss for me."
        // Correct — `B.hp <= 0 && A.hp > 0` hands every mutual knockout to the house, so landing the killing
        // blow and dying to the thorns that answered it was recorded as a defeat.
        // A real draw is a bigger question than a bug fix (what it pays, whether it spends a daily bout,
        // whether it counts on the Road) and that is Luke's to answer. This is the part that is simply
        // wrong either way: if you both go down, whoever DELIVERED the blow wins it, which is symmetric —
        // the same rule beats you when their swing is the one that empties both bars.
        ring.won = ring.B.hp <= 0 && (ring.A.hp > 0 || ring.acting === "me");
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
// ── AND THE PIT HAD TO CLOSE SOONER, BECAUSE THE MIRROR STOPPED ENDING ───────────────────────────────────────
// Measured the day after the combat rework shipped. Almost everything moved the right way: the Warden's 85%
// over the Reaver is gone, and ordinary bouts came down from the high twenties to 11-16 rounds, which is the
// target. One pairing went the other way, hard — warden against warden went from 35 rounds to SEVENTY-NINE.
//
// It is my own change that did it. Stuns stopped queueing (Math.min(1, ...) instead of +=) and a denied beat
// now buys a beat of immunity, which together mean two Wardens can no longer take turns away from each other
// at all. Both sides hold a guard they refresh every swing, neither can chain a denial to break the pattern,
// and the fight becomes two walls. That is exactly the loop this fever exists to end — it just started far
// too late to catch it: nothing at all happened until beat 45, and the grind from 45 to 80 is the number
// above.
//
// 28 and 1.8%. A bout that finishes in the low twenties — which is now nearly all of them — still never sees
// the pit at all, so nothing that is working gets touched. A thirty-round fight feels a nudge on its last
// beats. A mirror that would have run to eighty now ends in the forties.
//
// The old warning still stands and is the reason this is a nudge rather than a hammer: this mechanic was
// removed once for taking the fight off the player and punishing the Warden hardest, whose whole win
// condition is outlasting. It has to end a stall without deciding a fight.
//
// SMALL SAMPLE. Four warden mirrors in twenty hours, nineteen in forty-eight. Re-measure before trusting it.
export const FEVER_AT = 28;
export const FEVER_PER_BEAT = 0.018;

function fever(ring) {
    if (ring.beat < FEVER_AT) return;
    const share = FEVER_PER_BEAT * (ring.beat - FEVER_AT + 1);
    const bites = [];
    for (const f of [ring.A, ring.B]) {
        // Through the shield first — a shield you refresh every beat is precisely what the fever is here to
        // outlast, so letting it hide behind one would leave the stall exactly where it was.
        const bite = Math.max(1, Math.round(f.maxHp * share));
        const eaten = Math.min(f.shield, bite);
        f.shield -= eaten;
        f.hp -= bite - eaten;
        bites.push(bite);
    }
    // NO `dmg` ON THIS LINE, deliberately. The fight screen reconstructs both health bars by subtracting each
    // line's `dmg` from ONE side, and the pit bites both — a single number here would come off whichever bar
    // `who` named and be wrong twice. The two bites ride as their own fields so the sentence can name them.
    ring.log.push({ t: ring.t, who: "me", fever: true, share, meBite: bites[0], foeBite: bites[1],
        meHp: ring.A.hp, foeHp: ring.B.hp, meShield: ring.A.shield, foeShield: ring.B.shield, meStun: ring.A.stunned, foeStun: ring.B.stunned, meChill: ring.A.skipChance, foeChill: ring.B.skipChance });
}

/**
 * Hand the turn on — to the same fighter if they earned another, otherwise to the other one.
 *
 * This is the whole of turn order now. There is no clock to advance, no gap to measure and nothing to
 * decrement: the question "who is up" has exactly one answer that is not simply "the other one", and
 * `goesAgain` in arena-engine.js is where that answer lives so the auto-resolver cannot disagree with it.
 */
function closeTurn(ring, rng = Math.random) {
    const f = ring.acting === "me" ? ring.A : ring.B;
    // ── YOUR FIRST TURN IS SACRED ────────────────────────────────────────────────────────────────────
    // Whoever wins the flip at the bell gets ONE beat before the other fighter has been in the fight at
    // all. They do not get to chain that into two, three or six, which is what `goesAgain` was happily
    // handing out — a granted turn bypasses the one-per-exchange rule by design, and stacked on the
    // opening coin flip that design meant the fight could be decided before the member touched anything.
    //
    // Measured against the real rung-40 champion with four members' real kits: ValkyrieSylve lost 27.7%
    // of her fights before ever acting, Kaishiern 24.1%, GrayKitsune 15.8% — up to six foe beats in a row.
    // Kaishiern: "I start a fight on the Road and the enemy has already damaged me. In one case I was
    // defeated before I could click anything." Four people reported it as the Road being broken and all
    // four were describing this.
    //
    // This costs a foe its haste proc on the opening beat only, and nothing else anywhere: the moment you
    // have taken one turn the rule expires and extra turns work exactly as they always have. It is the
    // same principle openTurn already states for a lock that renews itself — you have to be IN the fight.
    // Difficulty is a foe you cannot beat. A foe you never got to play against is not difficulty.
    const beforeYourFirst = !ring.youActed && ring.acting === "foe";
    // ── THE SWING THAT DOES NOT EMPTY THE BAR ────────────────────────────────────────────────────────
    // `extra` is Quickblade and a weapon's Attack Speed above bare-handed. Under the old clock it was the
    // chance to take another turn on the spot; under the timer it read NOWHERE, so five tree ranks and a
    // stat on every weapon in the game did nothing at all. It is the refund now — the swing lands and the
    // bar keeps part of itself, so the next one comes round sooner. Same promise, in the bar's vocabulary.
    //
    // ONE IN A ROW, and `wasExtra` is the flag that was already keeping that rule for the old go-again: a
    // refunded swing cannot itself be refunded. Without it a lucky streak is an unanswerable combo, and
    // check:turn-order's "runs of three or more must be zero" starts failing on whoever invested in it.
    //
    // Not before your first turn either, for the same reason the opening flip cannot be chained.
    // ── NO "ONCE IN A ROW" GUARD. Luke: "remove any x in a row rules." ───────────────────────────────
    // This used to refuse a refund to anybody whose last swing was already refunded, and advance() used to
    // refuse anybody a third turn outright. Both are gone. If your bar fills first it is your turn, however
    // many times running that happens to be — which is what a turn timer MEANS, and the thing the old clock
    // could never show. The rules existed because a rung-60 foe's bar filled eighty times faster than a
    // member's; that was fixed at the source instead (see npcTempo), so the guards were treating a symptom
    // nobody has any more at the cost of capping what speed can buy.
    const track = ring.acting === "me" ? ring.atb.me : ring.atb.foe;
    const refunding = !ring.over && (f.extra || 0) > 0 && rng() < f.extra;
    spend(track, refunding ? BAR_REFUND : 0);
    ring.wasExtra = refunding;
    // The screen has to be able to SAY it — a bar that comes back half full with no explanation is the
    // clump this whole mode exists to remove.
    ring.refunded = refunding ? ring.acting : null;
    ring.lastActed = ring.acting;
    ring.wentAgain = null;
    ring.acting = null;
    ring.awaiting = null;
    ring.incoming = null;
    return;
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
        // The fever line is inside the narrated range, which it was not: `from` used to be captured after
        // this, so the pit closing arrived with no text and no beat and the fight screen printed it as "You
        // strike — 0". The one line in the transcript that explains why both bars are falling on their own
        // read as a swing that did nothing.
        const from = ring.log.length;
        fever(ring);
        // Including when the pit is what ends it — narrate before the return, or the last line of the fight
        // is the unnarrated one.
        if (settle(ring)) { narrate(ring, from, { name: ring.foeName }); return ring; }
        // ── WHOEVER'S BAR FILLS FIRST ────────────────────────────────────────────────────────────────────
        // The one line the timer mode replaces. Everything below this point — the blows, the crits, the
        // bleed, the armour — is the same code the classic ring runs, which is the entire reason this can
        // be gated to one person without the two drifting apart.
        // ── WHOEVER'S BAR FILLS FIRST. There is no other branch. ─────────────────────────────────────────
        const nx = nextUp(ring.atb, ring.now, ring.lastActed);
        // Neither bar will ever fill again — both fighters held or chilled longer than the fight can last.
        // Settled as an unresolved draw rather than looped on, the same way the beat cap resolves a stalemate.
        if (!nx) { ring.over = true; ring.won = false; ring.awaiting = null; ring.incoming = null; return ring; }
        // Whoever fills first, every time, with nothing on top. See the note in closeTurn.
        fillTo(ring.atb.me, ring.now, nx.at);
        fillTo(ring.atb.foe, ring.now, nx.at);
        ring.now = nx.at;
        ring.up = nx.side;
        const mine = ring.up === "me";
        ring.acting = ring.up;
        // A turn counter, not a clock — EXCEPT under the timer, where it is milliseconds and means what it
        // says. The fight screen has always paced playback off the gaps between `t` values, so handing it a
        // real elapsed time is the whole of the client-side pacing change.
        // Milliseconds, always — the fight screen paces playback off the gaps between these.
        ring.t = Math.round(ring.now);
        ring.beat += 1;
        const att = mine ? ring.A : ring.B;
        const def = mine ? ring.B : ring.A;
        // `from` is above the fever call on purpose, so this narration also covers the bleed and burn ticks
        // and the stun skip that openTurn pushes — those were the lines still coming out blank. A wound
        // eating a third of somebody's health between two swings is not a footnote; it is frequently the
        // reason the fight went the way it did.
        // ── IS THIS TURN AN EXTRA ONE ────────────────────────────────────────────────────────────────────
        // Set by closeTurn when the last turn ended, so it is already true by the time the fighter who
        // earned it steps up. This is the only reason a fight is ever anything other than you-them-you-them,
        // and every one of them gets a sentence — which is the entire point of replacing the clock.
        const isExtra = ring.wasExtra;
        // `lostLast` went with the lose-two-in-a-row rule it fed — see openTurn. What still protects an
        // opening beat is controlImmune, which is a per-effect rule rather than a counting one.
        const acts = openTurn({
            A: ring.A, B: ring.B, att, def, who: ring.acting, log: ring.log, t: ring.t, rng,
        });
        narrate(ring, from, { name: ring.foeName, by: ring.acting, again: isExtra });
        stampBars(ring, from);
        // Stunned, chilled, or dead on their own wound. The beat is still PAID — closeTurn spends the bar —
        // so it carries a spend for the next line to start from exactly like a swing does.
        if (!acts) { closeTurn(ring, rng); stampSpent(ring); continue; }

        // ── THEIR BEAT NEEDS NOBODY ──────────────────────────────────────────────────────────────────────
        // Resolved here and the loop carries on, so a member is only ever stopped for a decision that is
        // actually theirs. Their skill choice happens the same way it always did — housePick, off their own
        // build — it simply no longer waits for a tap that was never a choice.
        if (!mine) {
            const foeSkill = housePick(ring.foeSkills, ring.foeCd, {
                selfFrac: ring.B.hp / Math.max(1, ring.B.maxHp),
                foeFrac: ring.A.hp / Math.max(1, ring.A.maxHp),
                shield: ring.B.shield, banked: ring.B.banked, maxHp: ring.B.maxHp,
                bleeding: ring.B.bleedLeft > 0 || ring.B.burnLeft > 0,
            });
            const swungFrom = ring.log.length;
            const cast = foeSkill ? castSkill(ring, foeSkill, ring.B, ring.A) : null;
            if (!foeSkill || foeSkill.power > 0) {
                resolveSwing({
                    A: ring.A, B: ring.B, att: ring.B, def: ring.A, who: "foe",
                    log: ring.log, t: ring.t, rng,
                    mult: (foeSkill?.power ?? 1) * (cast?.mult || 1),
                    hitsOverride: foeSkill?.hits || 0,
                });
            } else ring.log.push({ t: ring.t, who: "foe", cast: true, meHp: ring.A.hp, foeHp: ring.B.hp, meShield: ring.A.shield, foeShield: ring.B.shield, meStun: ring.A.stunned, foeStun: ring.B.stunned, meChill: ring.A.skipChance, foeChill: ring.B.skipChance });   // see the same push in act()
            if (cast) uncast(foeSkill, ring.B, cast);
            narrate(ring, swungFrom, { name: ring.foeName, skill: foeSkill, by: "foe", again: isExtra });
            barEffects(ring, swungFrom);
            stampBars(ring, swungFrom);
            if (foeSkill?.id) ring.foeCd[foeSkill.id] = foeSkill.cooldown || 0;   // see the note in act()
            for (const k of Object.keys(ring.foeCd)) ring.foeCd[k] = Math.max(0, ring.foeCd[k] - 1);
            closeTurn(ring, rng);
            stampSpent(ring);
            continue;
        }

        ring.awaiting = "act";
        ring.turn = "you";
        // You are in the fight. Both halves of the guarantee above expire here, for the rest of the bout.
        ring.youActed = true;
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
export function openRing(me, foe, { rng = Math.random, foeSkills = {}, foeName = null } = {}) {
    const A = sideOf(me);
    const B = sideOf(foe);
    A.shield += Math.round(A.maxHp * A.ward);
    B.shield += Math.round(B.maxHp * B.ward);
    // `chill` used to be converted into a standing chance to lose a turn (`skipChance`) here, at the bell,
    // for the whole bout. There are no turns to lose any more and the stat means what it says: it is applied
    // to the BAR, per blow, in barEffects. Nothing is set at the bell.
    // ── WHO OPENS ────────────────────────────────────────────────────────────────────────────────────────────
    // A coin flip, and it matters MORE now than it did under the clock. Two equal clocks used to hand every
    // tie to A, which measured 65% to whoever happened to be the challenger; strict alternation is that same
    // problem in its purest form, because the opener swings first in every single exchange for the whole
    // bout. One flip at the bell is the whole of the answer, and it is asked exactly once.
    const flip = rng() < 0.5;
    const ring = {
        A, B,
        t: 0, beat: 0,
        up: flip ? "me" : "foe",      // whose turn it is; the only thing turn order consists of now
        wasExtra: false,              // was the turn about to be taken an extra one — see closeTurn
        youActed: false,              // has the member had a turn yet — see "your first turn is sacred"
        wentAgain: null,              // and how it was earned, for the screen: "granted" | "extra" | null
        cd: {},                       // skillId -> beats of YOURS before it comes back
        foeCd: {},                    // and theirs, kept apart so one deck cannot cool the other
        foeSkills,                    // the build the defence actually paid for — see housePick
        foeName: foeName || "Your opponent",   // so the transcript can say who did it
        log: [],
        acting: null,                 // whose turn is open, mid-beat
        awaiting: null,               // "act" when it is your beat, null when the fight is over
        turn: null, incoming: null,
        over: false, won: false, unresolved: false,
    };
    // ── AND THE TIMER, WHICH EVERY BOUT NOW HAS ──────────────────────────────────────────────────────────
    // The opening flip above still matters: two identical fighters have identical bars, so something has to
    // break the first tie, and `lastActed` seeds it from the same coin toss rather than inventing a rule.
    //
    // THE FOE'S RATE IS HELD RELATIVE TO YOURS, and this is the only place that happens — see foeTempo. Your
    // own tempo is whatever you built; theirs is kept within a factor of 1.9 of it so that back-to-back turns
    // remain impossible however far the ladder inflates above what a member can carry.
    ring.atb = {
        me: newTrack(A.tempo),
        foe: newTrack(foeTempo(A.tempo, B.tempo)),
    };
    // AND THEIR REFUND CHANCE THE SAME WAY, for exactly the same reason. `extra` comes out of extraTurnFrom,
    // which reads a ferocity budget that is on nobody's scale above about rung 50 — every Road foe past it
    // sits pinned at EXTRA_TURN_MAX, so half of all their swings came back with a bar already half full.
    // Measured at rung 60 before this: 2,384 of the NPC's 7,197 turns were back to back.
    B.extra = foeExtra(A.extra, B.extra);
    ring.now = 0;
    ring.lastActed = flip ? "foe" : "me";
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
    // ── EVERY TURN-ORDER EFFECT A SKILL HAS IS RECORDED, NOT APPLIED ──────────────────────────────────────────
    // These used to be written straight onto the fighter — `bonusTurns`, `stunned`, `skipChance` — which are
    // the three fields barEffects zeroes on its way past, so a cast's freeze, chill and haste all died between
    // being applied and the next line of the transcript. See the note on barEffects; this is the other half of
    // that fix. The bar is the only thing that holds a turn now, and only barEffects touches it.
    const side = att === ring.A ? "me" : "foe";
    const fx = { who: side, freezeMs: 0, chill: 0, haste: false, unfreeze: false };
    if (skill.unfreeze > 0) fx.unfreeze = true;
    if (skill.haste > 0) fx.haste = true;
    // ── A FREEZE CANNOT BE STACKED ON A FROZEN FIGHTER ───────────────────────────────────────────────────────
    // Rimebind mirrored won 100% of bouts for whoever opened: freeze them, they lose the beat, freeze them
    // again before they ever act. A lock that renews itself is not a control effect, it is the end of the
    // fight.
    //
    // The check is no longer HERE. `hold` refuses a kind the target is still shaking off and says so, which
    // covers this case and the five others it did not — a rolled proc, a second caster, a stun following a
    // freeze. One rule, at the point of application. See CC_IMMUNE_MS.
    // `skill.freeze` is a COUNT of beats in the old vocabulary — 1 from Rimebind, 2 with Hold Fast. It scales
    // the length the caster's class and tree have earned rather than setting it, so a Runecaller's second beat
    // of ice is worth more than a Reaver's, which is the whole point of freezeMsFor.
    // ⚠️ The cap is applied AFTER the multiply, not inside freezeMsFor. Hold Fast doubles the length, and a
    // full Frostbite Runecaller doubled comes to 5.6 seconds — nearly two of their opponent's swings, which is
    // the lockout the immunity rule exists to prevent. FREEZE_MS_CAP is the ceiling on what actually lands.
    if (skill.freeze > 0) {
        fx.freezeMs = Math.min(FREEZE_MS_CAP, freezeMsFor(A) * Math.max(1, Math.round(skill.freeze)));
    }
    // The magnitude IS the number on the card now. No 0.6 clamp: see CHILL_RATE_FLOOR for the only floor left.
    if (skill.chill > 0) fx.chill = skill.chill;
    ring.castFx = fx;
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
    // ── AND THE MIRROR OF IT, READING YOUR OWN WOUNDS ────────────────────────────────────────────────────────
    // Execute's third branch. The same curve pointed at the caster instead of the target, which makes it the
    // one term in the game that is worth MORE the worse the fight is going — the comeback button, and the only
    // thing a cornered fighter has that a comfortable one does not.
    //
    // It ADDS to the execute term rather than replacing it, so a build that took a node from both branches
    // gets both, and a fighter who is nearly dead swinging at somebody nearly dead gets the pair of them. That
    // is the intended ceiling: it costs six points across two branches and neither capstone.
    if (skill.desperateAt > 0 && A.maxHp > 0) {
        const frac = Math.max(0, A.hp) / A.maxHp;
        if (frac < skill.desperateAt) mult += skill.desperateMax * (1 - frac / skill.desperateAt);
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


// ── SAYING WHAT JUST HAPPENED ────────────────────────────────────────────────────────────────────────────────
// resolveSwing logs the ARITHMETIC — who, how much, did it crit — because that is all the auto-resolver ever
// needed. The fight screen narrates from `text`, `beat`, `damage` and `ability`, none of which it emits, so an
// interactive bout printed a blank line for every exchange.
//
// Which is most of what Luke was reporting from a Road rung: "he takes like eight attacks and doesn't go water
// splash or icicle blast or something." Half of that was the empty NPC deck (see npcSkills) and half was this
// — even once they had skills, nothing on screen said so. A move nobody can see the name of is a move that did
// not happen as far as the player is concerned.
//
// Decorates the lines resolveSwing just pushed rather than adding new ones, so the transcript stays one line
// per blow and the playback timing does not change.
//
// `by` is which side threw this beat, and it is the difference between naming a move and mislabelling one. A
// swing can push FOUR lines — the blow, a thorn, a counter, a wild extra — and two of them belong to the other
// fighter. Tagging the whole range with the caster's skill put their name on your reply: a counter of yours
// came back as "Rupture", and the on-field callout reads `ability`, so the screen announced their move over
// your answer to it.
function narrate(ring, from, { name, skill = null, by = "me", again = false }) {
    for (let i = from; i < ring.log.length; i += 1) {
        const l = ring.log[i];
        if (l.beat != null) continue;                 // already narrated (a thorn, a counter)
        l.beat = ring.beat;
        l.damage = l.dmg || 0;
        const answer = Boolean(l.thorns || l.counter);
        if (skill && l.who === by && !answer) l.ability = skill.name;
        // Only on the mover's own line — a thorn or a counter is YOUR reply, and it is not the thing the
        // clock handed them.
        //
        // ⚠️ AND ONLY ON A LINE SOMEBODY CHOSE. Luke: "why does bleeding say go again, and why is it twice?"
        // `again` marks the beat that was handed to you — under the timer, a refunded bar. narrate tags every
        // line in the beat's range with it, and openTurn pushes the wound and burn ticks into that same range,
        // so a bleed you were standing there taking came out as "BLEEDING · goes again" and did it once per
        // tick. A tick is not a turn: it happens TO you and nobody was handed anything.
        const passive = Boolean(l.bleedTick || l.burnTick || l.fever || l.stunnedSkip || l.chilledSkip);
        if (again && l.who === by && !answer && !passive) l.again = true;
        const mine = l.who === "me";
        const actor = mine ? "You" : name;
        const verb = mine ? "" : "s";
        // ── A BLOW THE GUARD ATE IS NOT A BLOW THAT MISSED ───────────────────────────────────────────────
        // `dmg` is what reached HEALTH — the shield is subtracted before it is logged — so a swing entirely
        // absorbed by a ward logs a truthful zero. Printed raw it reads as a broken fight: "Roan Vasquez
        // strikes — 0", eight lines running, while the fight is in fact going well for you. Naming the guard
        // says the same number and says who is winning the exchange.
        const took = l.damage > 0 ? `${l.damage}.` : "the guard holds.";
        if (l.fever) l.text = `The pit closes — ${l.meBite} off you, ${l.foeBite} off ${name}.`;
        else if (l.bleedTick) l.text = `${actor} bleed${mine ? "" : "s"} — ${l.damage}.`;
        else if (l.burnTick) l.text = `${actor} burn${mine ? "" : "s"} — ${l.damage}.`;
        else if (l.stunnedSkip) l.text = `${actor} cannot act.`;
        // Named, rather than folded in with the stun. They are the same outcome and completely different
        // information: one is a thing that was done to them this turn, the other is the cold they have been
        // under since somebody cast it.
        else if (l.chilledSkip) l.text = `${actor} ${mine ? "are" : "is"} too cold to move.`;
        else if (l.guard) l.text = `${actor} raise${verb} a guard.`;
        // The beat somebody spent on being harder to kill. It throws no blow, so resolveSwing never ran and
        // there was no line here at all — a member cast Bastion, the transcript said nothing, and the only
        // evidence the beat happened was a cooldown starting. See the push in act().
        else if (l.cast) l.text = `${actor} cast${verb} ${skill?.name || "a skill"}.`;
        else if (l.thorns) l.text = l.iceThorns ? `The ice bites back — ${took}` : `Thorns bite back — ${took}`;
        else if (l.counter) l.text = `${actor} answer${verb} — ${took}`;
        else if (l.ability) l.text = `${actor} cast${verb} ${l.ability} — ${took}`;
        else l.text = `${actor} strike${verb} — ${took}`;
        // Said in the sentence as well as on the field, because the log is a drawer and the drawer is shut.
        // Inserted before the dash rather than rebuilt, so it keeps whatever the line already said — the
        // skill's name included — and the CRIT insertion below still finds the first dash after it.
        // An extra turn is the ONLY reason a fight is ever not you-them-you-them, so it never happens
        // silently. A skip line has no dash to insert before, and does not need one — "cannot act" on a turn
        // they were handed is already the whole story.
        if (l.again) l.text = l.text.includes(" — ") ? l.text.replace(" — ", " again — ") : `${l.text} (again)`;
        if (l.crit && l.damage > 0) l.text = l.text.replace(" — ", " — CRIT ");
        // ── SAY WHAT LANDED, NOT WHAT WAS ROLLED ─────────────────────────────────────────────────────────
        // ⚠️ THIS READ `l.frozen`, WHICH IS THE PROC, NOT THE RESULT. `frozen` means the roll came up; whether
        // the freeze actually took is `hold()`'s answer, and hold REFUSES a bar still inside its six-second
        // immunity window (see CC_IMMUNE_MS). Refusals were already collected into l.resisted and then read by
        // nobody, so a freeze the rules had just declined still announced itself as "Frozen solid."
        //
        // Luke, playing it: "I also see a message saying he is frozen. I thought, weird, how did I freeze him
        // again." He had frozen the same opponent the beat before. The game told him he had done a thing the
        // game had just stopped him doing, which is worse than either outcome on its own.
        //
        // AND THESE ARE NO LONGER EXCLUSIVE. A blow that froze AND burned said only "Frozen solid", so the
        // burn stack ticking up had no sentence anywhere — "he was already at 3x stacks of burn, so I expected
        // to see that go up from 3, but it stayed at 3." Whether it stacked or not, the line has to say.
        if (l.frozen && Number(l.freezeMs) > 0) l.text += " Frozen solid.";
        else if ((l.resisted || []).includes("freeze")) l.text += " The cold does not take — he is still shaking off the last one.";
        if (l.burned) l.text += " It catches fire.";
        if (l.bled) l.text += " The wound opens.";
    }
}

/**
 * THE MEMBER'S BEAT — the only thing the ring ever stops to ask.
 *
 * One command, and the beat resolves: yours, then theirs, then back here. There is nothing else to send and
 * nothing else to grade — the tap that used to ride in beside the skill went with the timing game (see the
 * tombstone in arena-kit.js).
 *
 * `skill` is the resolved skill definition or null for a plain attack. Its power and its hit count ride in as
 * the same two parameters a crit or a surge uses, so a skill is a swing with different numbers rather than a
 * second code path that has to remember armour exists.
 */
export function act(ring, { skill = null, rng = Math.random } = {}) {
    if (ring.over || ring.awaiting !== "act") return ring;
    const from = ring.log.length;
    const cast = skill ? castSkill(ring, skill, ring.A, ring.B) : null;
    // A skill with power 0 throws NO BLOW — Bastion and Rally spend the beat on being harder to kill, which is
    // the Warden's whole identity. Skipping the swing entirely rather than swinging for nothing matters: a
    // zero-damage swing would still roll crit, still proc a counter, and still bank a grudge.
    if (!skill || skill.power > 0) {
        resolveSwing({
            A: ring.A, B: ring.B, att: ring.A, def: ring.B, who: "me",
            log: ring.log, t: ring.t, rng,
            mult: (skill?.power ?? 1) * (cast?.mult || 1),
            hitsOverride: skill?.hits || 0,
        });
    } else {
        // ── AND THE BEAT STILL HAPPENED ──────────────────────────────────────────────────────────────────
        // No swing means no line from resolveSwing, and narrate() only decorates lines that exist — so a
        // member who spent their beat on Bastion got a transcript that said nothing at all. The beat was
        // gone, the cooldown was running, and the only evidence either had happened was a greyed-out button.
        // A move you cannot see in the log is a move you cannot learn to use.
        ring.log.push({ t: ring.t, who: "me", cast: true, meHp: ring.A.hp, foeHp: ring.B.hp, meShield: ring.A.shield, foeShield: ring.B.shield, meStun: ring.A.stunned, foeStun: ring.B.stunned, meChill: ring.A.skipChance, foeChill: ring.B.skipChance });
    }
    if (cast) uncast(skill, ring.A, cast);
    narrate(ring, from, { name: ring.foeName, skill, by: "me" });
    barEffects(ring, from);
    stampBars(ring, from);
    // ── THE NUMBER ON THE CARD IS THE NUMBER OF TURNS ────────────────────────────────────────────────────
    // GrayKitsune: "Bastion - my cool down says 3, but in battle it's 4."
    //
    // Traced against the ring rather than reasoned about, because the arithmetic here is easy to talk
    // yourself into. Bastion, cooldown 3, cast on your turn #1:
    //
    //     turn #2  counter 3  locked      turn #4  counter 1  locked
    //     turn #3  counter 2  locked      turn #5  ---------  available
    //
    // Four of your turns between one cast and the next, on a card that says three. The `+ 1` that used to be
    // here was paying for the decrement at the bottom of this same function, which runs on the turn the skill
    // was cast on — so the skill was charged for the beat it was spent on AND for its whole cooldown. Set it
    // to the number the card promises and let that decrement be the first tick: the counter then reads 2 and
    // 1 on the two turns it is locked, and it is back on the third, which is what "cooldown 3" says.
    //
    // Both decks, in the same breath. The foe books its cooldowns the same way five lines into advance() and
    // leaving that alone would have handed the defence a free extra beat of every skill it owns.
    if (skill?.id) ring.cd[skill.id] = skill.cooldown || 0;
    // ── A FREE SKILL DOES NOT COST YOU THE BEAT ──────────────────────────────────────────────────────────────
    // Cast it and you are still up: same beat, same clock, and now pick what you actually swing.
    //
    // It returns BEFORE the cooldown tick, not after. Ticking here as well would have advanced every cooldown
    // in the deck twice on any beat a free skill was cast — the free skill paying for itself out of everything
    // else's rhythm, which is not free, it is a discount on the whole deck.
    // A free skill pays no beat, so there is no spend to stamp: the bar is exactly where stampBars left it
    // and it is still your turn — which is the one case where a full bar and a waiting fight agree.
    if (skill?.free) return ring;
    closeTurn(ring, rng);
    stampSpent(ring);
    for (const k of Object.keys(ring.cd)) ring.cd[k] = Math.max(0, ring.cd[k] - 1);
    return advance(ring, rng);
}

/** The bout fields the rest of the game already reads, rebuilt off a ring. */
// ── A FIGHT NOBODY IS WATCHING, RESOLVED BY THE RING ANYWAY ──────────────────────────────────────────────────
// Luke: "when do we use autoBout? Ideally, we don't use that at all."
//
// He is right, and the reason is not tidiness. autoBout is a SECOND resolver: it takes turns, it has its own
// copy of turn order, its own reading of chill, and no bar at all. Every balance projection in the repo —
// check:road, check:npc, check:sim, check:stat-value, check:passives, sim-pvp — was measured through it,
// which means every number those printed described a game nobody plays.
//
// This is the ring driven headlessly. Both sides choose with housePick, the same AI the defence has always
// used, so it is the real openRing / act / ringResult path with nobody's thumb on it. Returns autoBout's
// shape, `swings` and all, so a caller can be moved across a line at a time.
export function autoRing(me, foe, { rng = Math.random, mySkills = null, foeSkills = null, foeName = null } = {}) {
    let ring = openRing(me, foe, { rng, foeSkills: foeSkills || foe?.skills || {}, foeName });
    const deck = mySkills || me?.skills || {};
    // The ring resolves everything that needs no decision on its own, so this only ever runs on a beat that
    // is genuinely the player's. The guard is a runaway backstop; RING_BEAT_CAP is what actually ends a
    // stalemate, and settle() gets there first.
    for (let guard = 0; guard < 1000 && !ring.over && ring.awaiting === "act"; guard += 1) {
        const skill = housePick(deck, ring.cd, {
            selfFrac: ring.A.hp / Math.max(1, ring.A.maxHp),
            foeFrac: ring.B.hp / Math.max(1, ring.B.maxHp),
            shield: ring.A.shield, banked: ring.A.banked, maxHp: ring.A.maxHp,
            bleeding: ring.A.bleedLeft > 0 || ring.A.burnLeft > 0,
        });
        ring = act(ring, { skill, rng });
    }
    return { ...ringResult(ring), swings: ring.beat };
}

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
        // ── AND THE GUARDS ───────────────────────────────────────────────────────────────────────────────
        // Left out of here for the ring's whole life, so syncRing had nothing to copy and `bout.shield` sat
        // at the zero buildBout gave it. FighterBar draws the blue slab off that field, so NO shield has
        // ever been visible in an interactive bout: not Bastion, not Rally, not the ward every Warden opens
        // with. Luke, having cast one: "when I Rally I don't see any of my blue shielded health in my health
        // bar." It was not the skill — it was that this object stopped at health.
        shield: Math.max(0, ring.A.shield), foeShield: Math.max(0, ring.B.shield),
    };
}
