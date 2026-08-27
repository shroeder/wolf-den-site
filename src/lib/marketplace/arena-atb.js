// ── THE TURN TIMER ───────────────────────────────────────────────────────────────────────────────────────────
// Pure. No DB, no server-only, no wall clock — same rule as arena-engine.js and arena-ring.js. The "time" in
// here is a number the ring carries and the screen plays back; nothing in this file asks what time it is.
//
// A bar per fighter that fills at their own rate. Whoever fills first swings, and their bar empties. That is
// the whole mechanic, and every other thing in this file is one of four ways to interfere with a bar.
//
// ── THIS EXISTED, AND IT WAS REMOVED, AND THAT IS THE MOST IMPORTANT THING TO KNOW ───────────────────────────
// Speed used to pace every fight: a beat came round every 1/speed. It was removed on 2026-08-21 (see the
// tombstone in arena-engine.js) because a bout is resolved ONE TAP AT A TIME on the server, and a tap returned
// your swing plus every beat the clock owed the other fighter before your next one. A faster opponent's extra
// blow therefore always arrived in a clump, in the last sentence before your turn came back, and it read as
// the game taking turns away from you.
//
// The arithmetic was never wrong. It was INVISIBLE. So the one rule this file exists to keep is:
//
//     NOTHING MAY HAPPEN THAT THE PLAYER DID NOT WATCH APPROACH.
//
// Which is why every event carries `at` — the millisecond it happens — and a snapshot of both bars. If a
// future change makes the server hand back events without a time on them, this is back to being the mechanic
// that got removed, and no amount of tuning the rates will fix it.
//
// ── THERE IS NO GATE HERE ANY MORE ───────────────────────────────────────────────────────────────────────────
// ATB_OPEN and atbOpenFor are gone, and so is the classic turn loop they chose between. Luke: "we don't want
// two versions of combat any more, we just want the owner version for everyone." Every bout is a timer bout.
// A predicate that always answers yes still reads like a gate to the next person, so it was deleted rather
// than pinned to true — the same call that was made for ARENA_UNLOCKED and jewelsEnabled.

// ── HOW LONG A BAR TAKES ─────────────────────────────────────────────────────────────────────────────────────
// At tempo 1.0, which is nobody: it is the reference the real numbers are measured against. Sized off the real
// ladder — a FIGHTER's ferocity comes through kitFor, which adds the tree and the upgrade tracks on top of
// gear, and across the 40 most active arena members the measured tempo spread is 1.20 / 1.34 / 2.15. 6700 puts
// the median member on a swing every five seconds.
//
// DELIBERATELY LONG. Luke: "ensuring that we do it in a way that is elongated to start." A bar that is too slow
// is a pacing complaint fixed by changing this one number; a bar that is too fast is the old unreadable clock
// again, and that does not get reported as "too fast", it gets reported as the fight being broken.
export const BASE_FILL_MS = 6700;

// ── WHAT MAKES A BAR FILL FASTER ─────────────────────────────────────────────────────────────────────────────
// The weapon sets it and Ferocity sharpens it — the same two inputs arena-kit.js's speedOf has always named.
// What changed is the divisor: speedOf uses ferocity/500, which was sized for a tie-break rather than for a bar
// somebody watches. At /500 the median member's entire Ferocity investment is worth thirty milliseconds across
// a five-second bar. A stat that visibly does nothing is worse than a stat that is absent, because the player
// spends real points finding out.
//
// speedOf is NOT reused here on purpose, and this is the one duplication in this file: it carries /500, and
// importing it to then divide the result differently would leave two divisors in play with only a comment
// explaining which is which. One function, one rate, named for the thing it paces.
export const FEROCITY_PER_TEMPO = 100;
export const BARE_TEMPO = 1;

// ── AND IT IS NOT CLAMPED ANY MORE ───────────────────────────────────────────────────────────────────────────
// Luke: "we dont need the clamp?"
//
// Half right, and the half that matters. The old ceiling existed to stop back-to-back turns, and it worked —
// but whether anybody can EVER swing twice in a row is decided by the RATIO of the two rates, not by either
// one of them. Both bars are filled to the moment the winner's completes, the winner is emptied and the loser
// keeps what it had, so the fast fighter goes again only when the slow one's rate is under half theirs. A
// fixed band was a cap on YOUR bar used to control a RELATIONSHIP, and it cost what you would expect:
// measured the day it was removed, 15 of the 40 most active members sat exactly on the floor, so every point
// of Ferocity and every faster weapon they owned bought them nothing at all.
//
// So a member's tempo is uncapped and always moves. The ratio is held instead, on the FOE — see foeTempo.
export const tempoOf = (weaponSpeed = BARE_TEMPO, ferocity = 0) =>
    Math.max(0.2, (Number(weaponSpeed) || BARE_TEMPO) + Math.max(0, Number(ferocity) || 0) / FEROCITY_PER_TEMPO);

// ── THE RATIO IS WHAT IS GUARDED, AND IT IS GUARDED ON THE OPPONENT ──────────────────────────────────────────
// Under 2.0 and back-to-back turns cannot happen at all, whatever anybody is wearing. 1.9 keeps a margin so
// floating point at the boundary cannot produce one.
//
// This is not a balance number, it is the same class of rule as the beat cap and pit fever: a guarantee that
// the fight stays a fight. NPC ferocity is a gear BUDGET that climbs with the rung and never stops — rung 40
// is 136 ferocity, rung 60 is 525, rung 100 is 7,858 and rung 120 is 30,408, which is a tempo of 305 against a
// member's 1.9. Simulated at rung 60 before the ratio was held: 52.8% of every turn was somebody going twice
// in a row, 330 of them runs of THREE OR MORE.
//
// Clamped RELATIVE to the fighter it is facing, so the foe is always somewhere between half again slower and
// half again faster than you, and your own investment decides which. A member who doubles their Ferocity
// really does swing twice as often as they used to — the Road keeps pace with them instead of leaving them
// behind at eighty to one.
export const TEMPO_RATIO = 1.9;

// ── AND THE CLAMP IS ONE-SIDED, BECAUSE A FLOOR PUNISHES THE INVESTMENT ──────────────────────────────────────
// The first version clamped the foe into [yours / 1.9 … yours x 1.9]. The ceiling is the guarantee and it
// stays. The FLOOR was a mistake and check:arith caught it in one line: ferocity +0 and ferocity +500 both
// came back "10.4 swings a bout", because dragging the foe up to yours/1.9 means every point of speed you buy
// makes your OPPONENT faster too. That is the same complaint the fixed band produced, wearing a new shape —
// and it is worse, because "my new weapon sped the enemy up" is not a trade-off anybody would accept.
//
// A foe slower than you simply stays slower. What stops that becoming a fighter who never acts is the
// three-in-a-row rule in advance(), which is a fairness guarantee rather than a rate.

// ── AND A ROAD FOE IS GIVEN A TEMPO RATHER THAN HAVING ONE DERIVED ───────────────────────────────────────────
// tempoOf reads Ferocity, which for a MEMBER is a stat measured at 20-140. An NPC's is a gear budget that
// climbs with the rung and never stops, so the same divisor answers 79 at rung 100 and 305 at rung 120. The
// ratio clamp below would then swallow every foe past about rung 50 onto the same bound — and a foe that is
// always exactly 1.9x your speed no matter what you are wearing is worse than the old fixed band, because now
// investing in speed changes nothing at all about the fight.
//
// So the ladder gets its own curve, on a member's scale, and it is the thing your own tempo is measured
// against. A rung-1 foe swings a little slower than bare-handed and the top of the Road reaches 2.4 — near the
// fastest kit anybody has actually built (2.15 measured) — which means a member who invests really does
// out-pace the Road, and one who does not really is out-paced.
export const NPC_TEMPO_MIN = 0.9;
export const NPC_TEMPO_MAX = 2.4;
export const npcTempo = (rung = 1, size = 120) => {
    const t = Math.max(0, Math.min(1, (Math.max(1, Number(rung) || 1) - 1) / Math.max(1, size - 1)));
    // Square-rooted so the early Road climbs quickly and the top flattens: the interesting part of the curve
    // is where members actually are, not the last twenty rungs nobody has reached.
    return Number((NPC_TEMPO_MIN + (NPC_TEMPO_MAX - NPC_TEMPO_MIN) * Math.sqrt(t)).toFixed(3));
};
export const foeTempo = (mine, theirs) => {
    const m = Math.max(0.2, Number(mine) || BARE_TEMPO);
    const t = Math.max(0.2, Number(theirs) || BARE_TEMPO);
    return Math.min(m * TEMPO_RATIO, t);
};

// ── THE FOUR WAYS TO INTERFERE WITH A BAR ────────────────────────────────────────────────────────────────────
// Two of them change the RATE and two of them HOLD it, and that difference is the entire reason a player can
// tell them apart at a glance. A frozen bar that merely ran slowly would be indistinguishable from a chilled
// one, and the two mean completely different things.
export const HASTE_BOOST = 1;       // green, +100% of your own rate: a hasted bar fills at double
export const HASTE_MS = 6000;       // about one of your own turns' worth
export const STUN_HOLD_MS = 1000;   // yellow, the bar stops dead where it is

// ── CHILL: THE PERCENT IT SAYS, FOR THE TIME IT SAYS, AND THEN IT WEARS OFF ──────────────────────────────────
// Luke: "we need to fix chill because it should never be capped, it should truly slow the bar by the percent
// that it says for the amount of time that it says. If it doesn't name an amount of time we need to invent
// one — a chill decay."
//
// It used to be a flat 0.55x for a flat 8 seconds no matter what applied it, which meant the Chill node's "+2%
// per rank" and Rimebind's 0.1 were both silently rounded to the same 45% slow. The stat had no relationship
// at all to the effect. Now the magnitude IS the stat: a 22% chill slows the bar 22%.
//
// STACKING IS ADDITIVE AND UNCAPPED. Two chills of 20% are a 40% slow and nothing trims them — that is the
// "never capped", and it is what makes a cold build worth committing to.
//
// ── THE ONE FLOOR, AND IT IS A STALL GUARANTEE RATHER THAN A CAP ─────────────────────────────────────────────
// A bar slowed 100% is a bar that never fills, and a fighter who can never swing is not a slowed fighter, it
// is a fight that does not end — which fillsAt resolves as an unwinnable draw after its horizon. So the RATE
// has a floor: however much cold is on you, your bar still crawls. Low enough to be a real punishment,
// deliberately not zero, and it hides nothing: the slow that was applied is the slow that is shown.
export const CHILL_RATE_FLOOR = 0.15;
export const CHILL_MS = 8000;
// The decay. A chill lands at full magnitude and comes off in equal steps across its life, so the last second
// of a cold build's work is a fraction of the first — it "wears off" instead of ending between two frames.
// Held as separate expiries rather than as a continuous curve on purpose: everything below solves the bar
// forward analytically between rate changes, and a rate that slides needs an integral where a staircase needs
// arithmetic. Four steps is enough that nobody reads it as a cliff.
export const CHILL_STEPS = 4;

// ── FREEZE: HOW LONG IS A QUESTION ABOUT WHO YOU ARE ─────────────────────────────────────────────────────────
// Luke: "freeze should halt them for X seconds where X is probably determined by your class and your skill
// selections."
//
// It was a flat 1,600ms for everybody, which made the Runecaller's signature mechanic worth exactly as much in
// a Reaver's hands. Now it is built: a base anybody who procs one gets, a bigger base for the class the
// mechanic belongs to, and real length bought in the tree.
//
// A committed Runecaller lands about three and a half seconds — roughly one whole swing of a typical opponent,
// which is the point of the effect — and a Reaver who procs one off a stat gets 1.2s, a real interruption and
// not a lockout. The immunity rule in castSkill stands on top of all of it: a freeze cannot land on somebody
// already held, so length never becomes a chain.
export const FREEZE_BASE_MS = 1200;
export const FREEZE_CLASS_MS = { runecaller: 2000 };
// What the tree adds. `freeze` is the Frostbite chance stat (5 ranks x 2% = 0.10 at full) and `freezeMs` is
// flat length a branch node hands over — Hold Fast and Absolute Zero are the ones that should make a freeze
// LAST rather than land more often.
export const FREEZE_MS_PER_CHANCE = 8000;   // a full Frostbite line (0.10) is worth +800ms
export const FREEZE_MS_CAP = 3600;
export function freezeMsFor(f = {}) {
    const base = FREEZE_CLASS_MS[String(f.classId || "").toLowerCase()] || FREEZE_BASE_MS;
    const fromTree = Math.max(0, Number(f.freeze) || 0) * FREEZE_MS_PER_CHANCE;
    const flat = Math.max(0, Number(f.freezeMs) || 0);
    return Math.round(Math.min(FREEZE_MS_CAP, base + fromTree + flat));
}

// ── AND A SWING THAT DOES NOT EMPTY THE BAR ──────────────────────────────────────────────────────────────────
// What Quickblade and a weapon's Attack Speed above bare-handed became. Both fed `extra` — the chance to take
// another turn immediately — which the timer read nowhere, so five tree ranks and a stat on every weapon in
// the game did precisely nothing.
//
// Luke picked the refund: the swing lands and the bar is only partly spent, so the next one comes round
// sooner. It is the same promise the node has always made, in the bar's vocabulary, and unlike folding it into
// tempo it stays a thing you SEE happen rather than a number that quietly ticks up.
//
// ONE IN A ROW — see closeTurn. A refunded swing cannot itself be refunded, which is the rule that was already
// kept for the old go-again, and without it check:turn-order's "runs of three or more must be zero" fails on
// whoever invested in it.
export const BAR_REFUND = 0.55;

// ── AND YOU SHAKE A CONTROL EFFECT OFF, PER KIND ─────────────────────────────────────────────────────────────
// Luke: "develop an immunity to the crowd control of that type after it wears off for like 6 seconds — so if
// you're frozen, once you come unfrozen you can't be frozen for 6 seconds, and the same for chill and stun."
//
// This is the rule that replaces every counting rule that came out. It is not "you may not lose two turns in a
// row" — nothing tallies turns — it is a property of the EFFECT: ice that has just been shrugged off does not
// take again immediately. Which means a fast fighter still swings as often as their bar allows, and a control
// build still lands its opener, but neither can hold somebody down indefinitely by repeating themselves.
//
// PER KIND, deliberately. A freeze does not make you immune to a stun, and neither stops a chill. Three
// separate windows, so a Runecaller's whole toolkit still works on one target — it simply cannot be the same
// tool over and over.
//
// The window runs from when the effect ENDS, not from when it lands, so "six seconds" is six seconds of being
// able to act. That also subsumes the older "a lock may not land on a locked bar" check, because while the
// effect is still running `now` is inside the window by construction.
export const CC_IMMUNE_MS = 6000;

// ── AND THE FOE'S CHANCE AT IT IS HELD TO YOURS ──────────────────────────────────────────────────────────────
// The same fix as foeTempo, for the same root cause. `extra` is built by extraTurnFrom out of weapon speed and
// ferocity, and NPC ferocity is a gear budget that is on nobody's scale — every Road foe past about rung 50
// sits pinned at EXTRA_TURN_MAX, which is a coin flip on every swing to come back with a bar already half
// full. Simulated at rung 60: 2,384 of the NPC's 7,197 turns were back to back off this alone.
//
// A floor of 5% rather than zero, so a foe facing a member with no Quickblade at all still has the move in its
// repertoire — rare and visible, which is what the refund is for. Above that it tracks what YOU brought.
export const FOE_EXTRA_FLOOR = 0.05;
export const foeExtra = (mine, theirs) =>
    Math.max(0, Math.min(Number(theirs) || 0, Math.max(FOE_EXTRA_FLOOR, (Number(mine) || 0) * TEMPO_RATIO)));

/** A fresh bar. `fill` is 0..1 of the way to a swing. */
export const newTrack = (tempo = BARE_TEMPO) => ({
    tempo: Math.max(0.2, Number(tempo) || BARE_TEMPO),
    fill: 0,
    holdUntil: 0,    // stun / freeze: the bar does not move at all until this
    held: null,      // "stun" | "freeze" — what the screen should say and colour it
    // Per-kind: the moment this bar can be given that effect again. See CC_IMMUNE_MS.
    immune: {},      // { freeze?: ms, stun?: ms, chill?: ms }
    // Every rate change currently on this bar, each with the moment it lapses. One list rather than a pair of
    // *Until marks, because both effects stack and a chill decays through several expiries.
    mods: [],        // { kind: "haste" | "chill", amount, until }
});

const live = (track, now) => (track.mods || []).filter((m) => m.until > now);

/** How fast this bar is filling AT a given moment, in fill-units per millisecond. Zero while held. */
export function rateAt(track, now) {
    if (!track) return 0;
    if (now < (track.holdUntil || 0)) return 0;
    let boost = 0;
    let slow = 0;
    for (const m of live(track, now)) {
        if (m.kind === "haste") boost += m.amount;
        else if (m.kind === "chill") slow += m.amount;
    }
    // Additive both ways, and the only trim anywhere is the stall floor. See CHILL_RATE_FLOOR.
    const mult = (1 + boost) * Math.max(CHILL_RATE_FLOOR, 1 - slow);
    return (track.tempo * mult) / BASE_FILL_MS;
}

// Every moment after `now` at which this bar's rate could change.
const edgesAfter = (track, now) => {
    const out = [];
    if ((track.holdUntil || 0) > now) out.push(track.holdUntil);
    for (const m of track.mods || []) if (m.until > now) out.push(m.until);
    return out.sort((a, z) => a - z);
};

// ── WHEN DOES THIS BAR NEXT FILL ─────────────────────────────────────────────────────────────────────────────
// Solved forward through the windows rather than by stepping a millisecond at a time: the rate is piecewise
// constant, and the only places it can change are the edges above. So walk them, and between any two the
// answer is arithmetic. This is the reason the chill decays in steps instead of sliding.
//
// A 60,000ms ceiling stops a pathological bar — a chilled fighter with a hold that outlives the fight — from
// spinning this loop forever. It returns Infinity instead, and the caller reads that as "this one is not going
// to swing", which settle() then resolves the same way it resolves any fight nobody can win.
const HORIZON_MS = 60000;
// Deep enough for a hold plus several stacked chills at CHILL_STEPS each. A runaway guard, not a limit on how
// much cold a build may carry.
const WALK_GUARD = 48;
export function fillsAt(track, now) {
    if (!track) return Infinity;
    let t = now;
    let fill = track.fill;
    for (let guard = 0; guard < WALK_GUARD; guard += 1) {
        const rate = rateAt(track, t);
        const edges = edgesAfter(track, t);
        const nextEdge = edges.length ? edges[0] : Infinity;
        if (rate > 0) {
            const need = (1 - fill) / rate;
            if (t + need <= nextEdge) return t + need;
            fill += rate * (nextEdge - t);
        }
        if (nextEdge === Infinity || nextEdge - now > HORIZON_MS) return Infinity;
        t = nextEdge;
    }
    return Infinity;
}

/** Move a bar forward to `now`, honouring every window it crosses on the way. */
export function fillTo(track, from, now) {
    if (!track || now <= from) return track;
    let t = from;
    for (let guard = 0; guard < WALK_GUARD && t < now; guard += 1) {
        const rate = rateAt(track, t);
        const edges = edgesAfter(track, t).filter((e) => e < now);
        const until = edges.length ? edges[0] : now;
        track.fill = Math.min(1, track.fill + rate * (until - t));
        t = until;
    }
    // The hold is over the moment the clock passes it, and the screen must stop saying FROZEN — this is the
    // only place `held` is cleared, so a bar that is moving can never still be labelled as stopped.
    if (t >= (track.holdUntil || 0)) track.held = null;
    // Lapsed windows are dropped here rather than left to accumulate: a long bout would otherwise walk a list
    // that only grows, and every entry is an edge the solver has to consider.
    track.mods = live(track, now);
    return track;
}

/**
 * Empty a bar, because its owner just swung.
 *
 * `refund` is what it keeps — normally nothing. See BAR_REFUND for the one thing that leaves anything behind.
 */
export const spend = (track, refund = 0) => {
    if (track) track.fill = Math.max(0, Math.min(1, Number(refund) || 0));
    return track;
};

// ── APPLYING THE FOUR ────────────────────────────────────────────────────────────────────────────────────────
// Each ADDS rather than replaces, so a second one landing on an already-affected fighter is worth something
// instead of restarting a shorter version — being hit twice must never be better for the victim than once.
/** Returns true if it landed, false if this bar is still shaking that kind off. See CC_IMMUNE_MS. */
export function hold(track, now, kind = "stun", ms = null) {
    if (!track) return false;
    if (now < ((track.immune || {})[kind] || 0)) return false;
    const dur = Math.max(1, Number(ms) || (kind === "freeze" ? FREEZE_BASE_MS : STUN_HOLD_MS));
    track.holdUntil = Math.max(track.holdUntil || 0, now) + dur;
    // A freeze showing over a stun is right: it is the longer and more serious of the two, and if both are
    // running the bar is stopped until the freeze ends anyway.
    track.held = track.held === "freeze" ? "freeze" : kind;
    // Measured from when it ENDS, so the window is six seconds of being able to act.
    track.immune = { ...(track.immune || {}), [kind]: track.holdUntil + CC_IMMUNE_MS };
    return true;
}

// Not crowd control — nothing resists being helped, so there is no immunity window here.
export function haste(track, now, ms = HASTE_MS, amount = HASTE_BOOST) {
    if (!track) return false;
    track.mods = [...live(track, now), { kind: "haste", amount, until: now + Math.max(1, ms) }];
    return true;
}

/**
 * Slow a bar by `amount` (0..1 — the share of its rate it loses) for `ms`, decaying to nothing across that
 * window. See the note on CHILL_STEPS for why it is stored as steps rather than as a curve.
 */
export function chill(track, now, amount = 0.2, ms = CHILL_MS) {
    if (!track) return false;
    if (now < ((track.immune || {}).chill || 0)) return false;
    const a = Math.max(0, Number(amount) || 0);
    if (a <= 0) return false;
    const dur = Math.max(1, Number(ms) || CHILL_MS);
    const next = live(track, now);
    for (let i = 1; i <= CHILL_STEPS; i += 1) {
        next.push({ kind: "chill", amount: a / CHILL_STEPS, until: now + (dur * i) / CHILL_STEPS });
    }
    track.mods = next;
    track.immune = { ...(track.immune || {}), chill: now + dur + CC_IMMUNE_MS };
    return true;
}

// ── WHAT THE SCREEN DRAWS ────────────────────────────────────────────────────────────────────────────────────
// Both bars at one instant, with the state each is in. Sent with every event rather than derived on the client:
// the client re-deriving it would be a second implementation of rateAt, and a bar that disagrees with the blow
// underneath it is exactly the class of bug this whole mode exists to remove.
export const snapshot = (track, now) => {
    if (!track) return null;
    const held = now < (track.holdUntil || 0);
    let boost = 0;
    let slow = 0;
    let hasteUntil = 0;
    let chillUntil = 0;
    for (const m of live(track, now)) {
        if (m.kind === "haste") { boost += m.amount; hasteUntil = Math.max(hasteUntil, m.until); }
        else if (m.kind === "chill") { slow += m.amount; chillUntil = Math.max(chillUntil, m.until); }
    }
    return {
        fill: Math.max(0, Math.min(1, track.fill)),
        // The rate this bar is ACTUALLY running at. A foe's card reads its own stat line, which is the raw
        // one — but a Road foe's is clamped relative to yours on the way into the ring (see foeTempo), so the
        // card could promise a speed the bar never runs at. This is the number the fight is using.
        tempo: track.tempo,
        // The rate as a MULTIPLE of this fighter's own baseline, so the screen can show "2x" or "0.6x" without
        // knowing what their tempo is. 0 means stopped.
        mult: track.tempo > 0 ? Number(((rateAt(track, now) * BASE_FILL_MS) / track.tempo).toFixed(2)) : 0,
        // How much cold is on the bar right now, so the screen can say "-40%" rather than only "SLOW". The
        // whole point of making the magnitude real is that it is now worth printing.
        slow: Number(Math.min(1 - CHILL_RATE_FLOOR, slow).toFixed(2)),
        state: held ? (track.held || "stun") : boost > 0 ? "haste" : slow > 0 ? "chill" : null,
        // What this bar is currently shrugging off, so a blow that lands no ice can say so rather than
        // looking like it silently failed. See CC_IMMUNE_MS.
        resists: Object.entries(track.immune || {}).filter(([, t]) => t > now).map(([k]) => k),
        // How much longer the current state runs, so a bar can show a countdown rather than ending without
        // warning. For a chill this is the LAST step's expiry — the moment the cold is fully gone.
        until: Math.max(0, held ? (track.holdUntil - now) : Math.max(hasteUntil, chillUntil) - now),
    };
};

/** Both bars, ready to hang on a log line. */
export const bars = (atb, now) => ({ me: snapshot(atb?.me, now), foe: snapshot(atb?.foe, now), at: now });

// ── WHO SWINGS NEXT ──────────────────────────────────────────────────────────────────────────────────────────
// The one decision this file exists to make, and the single line it replaces in arena-ring.js (ring.up = the
// other one). Returns the side and the moment, or null if neither bar will ever fill.
//
// A TIE GOES TO WHOEVER DID NOT JUST SWING. Two identical fighters have identical bars, so without this rule
// the same side wins every tie for the whole fight and the other one never acts — the fairest-looking possible
// inputs producing the least fair possible fight.
export function nextUp(atb, now, lastActed = null) {
    const mine = fillsAt(atb?.me, now);
    const theirs = fillsAt(atb?.foe, now);
    if (!Number.isFinite(mine) && !Number.isFinite(theirs)) return null;
    if (mine === theirs) {
        const side = lastActed === "me" ? "foe" : "me";
        return { side, at: mine };
    }
    return mine < theirs ? { side: "me", at: mine } : { side: "foe", at: theirs };
}
